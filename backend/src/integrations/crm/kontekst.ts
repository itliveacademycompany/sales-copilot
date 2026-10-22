import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { config } from '../../config.js';
import { decryptSecret, encryptSecret, maskSecret } from '../../crypto/secrets.js';
import { withoutTenantIsolation, withTenant } from '../../db/index.js';
import { integration, platformSetting } from '../../db/schema/index.js';
import { rootUrl } from '../../http/tenant.js';
import { CrmXato, type CrmKontekst } from './adapter.js';
import { AMO_DOMENLAR, oauthAlmashtir, oauthSirmi, type AmoManzil } from './amocrm.js';
import { crmConfigniOl } from './index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM KONTEKSTI va amoCRM OAuth ("bir tugmada ulash")
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * OAUTH NIMA BERADI
 * ─────────────────
 * Mijoz amoCRM da integratsiya yaratib, token nusxalamaydi: «amoCRM bilan
 * ulash» → amoCRM o'zi hisob tanlatadi va ruxsat so'raydi → SotuvAI
 * tokenlarni oladi. Buning uchun platformada BITTA amoCRM integratsiyasi
 * (client_id + secret) kerak — uni super admin bir marta kiritadi.
 *
 * TOKEN YANGILASH — NEGA QULF BILAN
 * ─────────────────────────────────
 * access token ~1 kun yashaydi, refresh token esa BIR MARTALIK: ishlatilgach
 * eskisi yaroqsiz. Worker va API bir vaqtda yangilasa, ikkinchisi eski
 * refresh bilan rad etiladi va ulanish buziladi. Shuning uchun yangilash
 * `SELECT … FOR UPDATE` ichida: navbatdagi jarayon qulfdan keyin bazadagi
 * YANGI tokenni ko'radi va qayta yangilamaydi.
 */

// ─── Platforma sozlamasi (super admin) ───────────────────────────────────────

const KALIT = 'crm.amocrm.oauth';

export interface AmoOauthSozlama {
  clientId: string;
  clientSecret: string;
}

export async function amoOauthSozlama(): Promise<AmoOauthSozlama | null> {
  const [r] = await withoutTenantIsolation('CRM: amoCRM OAuth platforma sozlamasi', (tx) =>
    tx.select({ value: platformSetting.value }).from(platformSetting).where(eq(platformSetting.key, KALIT)).limit(1),
  );
  const v = (r?.value ?? {}) as { clientId?: unknown; secret?: unknown };
  if (typeof v.clientId !== 'string' || typeof v.secret !== 'string' || !v.clientId || !v.secret) return null;
  try {
    return { clientId: v.clientId, clientSecret: decryptSecret(Buffer.from(v.secret, 'base64')) };
  } catch {
    return null;
  }
}

/** Super admin uchun ko'rinish — secret niqoblangan. */
export async function amoOauthKorinish() {
  const s = await amoOauthSozlama();
  return {
    configured: Boolean(s),
    clientId: s?.clientId ?? null,
    secretHint: s ? maskSecret(s.clientSecret) : null,
    redirectUri: amoRedirectUri(),
  };
}

export async function amoOauthSaqla(clientId: string, clientSecret: string | null, userId: string): Promise<void> {
  const eski = await amoOauthSozlama();
  const secret = clientSecret ?? eski?.clientSecret;
  if (!secret) throw new CrmXato('kirish', 'Secret key ni kiriting');
  const value = { clientId, secret: encryptSecret(secret).toString('base64') };
  await withoutTenantIsolation('admin: amoCRM OAuth sozlamasini saqlash', (tx) =>
    tx
      .insert(platformSetting)
      .values({ key: KALIT, value, description: 'amoCRM bir tugmada ulash (OAuth) — integratsiya kalitlari', updatedBy: userId })
      .onConflictDoUpdate({ target: platformSetting.key, set: { value, updatedBy: userId, updatedAt: new Date() } }),
  );
}

export async function amoOauthOchir(): Promise<void> {
  await withoutTenantIsolation('admin: amoCRM OAuth sozlamasini o\'chirish', (tx) =>
    tx.delete(platformSetting).where(eq(platformSetting.key, KALIT)),
  );
}

/**
 * amoCRM integratsiyasidagi «Ссылка для перенаправления» — aynan shu bo'lishi
 * shart (kod almashtirishda solishtiriladi). `PUBLIC_URL` (ommaviy HTTPS
 * manzil) bo'lsa — u, aks holda asosiy sayt.
 */
export function amoRedirectUri(): string {
  return `${(config.PUBLIC_URL ?? rootUrl()).replace(/\/+$/, '')}/api/v1/crm/oauth/amocrm/callback`;
}

// ─── state — imzolangan, 15 daqiqa ───────────────────────────────────────────

interface Holat {
  /** biznes */
  b: string;
  /** foydalanuvchi */
  u: string;
  /** tugash (unix soniya) */
  e: number;
  /** tasodifiy — bir xil holat ikki marta chiqmasin */
  n: string;
  /** qaytish manzili (origin) — foydalanuvchi qayerdan boshlagan bo'lsa */
  q?: string;
}

function imzo(qism: string): string {
  return createHmac('sha256', config.COOKIE_SECRET).update(`crm-oauth.${qism}`).digest('base64url');
}

export function holatYarat(businessId: string, userId: string, qaytish?: string): string {
  const h: Holat = { b: businessId, u: userId, e: Math.floor(Date.now() / 1000) + 15 * 60, n: randomBytes(8).toString('hex') };
  if (qaytish) h.q = qaytish;
  const qism = Buffer.from(JSON.stringify(h)).toString('base64url');
  return `${qism}.${imzo(qism)}`;
}

/** Imzo va muddat to'g'ri bo'lsa — holat, aks holda `null` (CSRF / soxta so'rov). */
export function holatniTekshir(state: string): { businessId: string; userId: string; qaytish: string | null } | null {
  const [qism, im] = state.split('.');
  if (!qism || !im) return null;
  const kutilgan = Buffer.from(imzo(qism));
  const kelgan = Buffer.from(im);
  if (kutilgan.length !== kelgan.length || !timingSafeEqual(kutilgan, kelgan)) return null;
  try {
    const h = JSON.parse(Buffer.from(qism, 'base64url').toString('utf8')) as Holat;
    if (typeof h.b !== 'string' || typeof h.u !== 'string' || typeof h.e !== 'number') return null;
    if (h.e < Math.floor(Date.now() / 1000)) return null;
    return { businessId: h.b, userId: h.u, qaytish: typeof h.q === 'string' ? h.q : null };
  } catch {
    return null;
  }
}

// ─── Kontekst (adapter uchun) ────────────────────────────────────────────────

function amoManzil(cfg: Record<string, unknown>): AmoManzil {
  const sub = typeof cfg.subdomain === 'string' ? cfg.subdomain : '';
  const dom = AMO_DOMENLAR.find((d) => d === cfg.baseDomain) ?? 'amocrm.ru';
  return { subdomain: sub, baseDomain: dom };
}

/** access token shuncha soniya qolganda oldindan yangilanadi. */
const ZAXIRA_SONIYA = 5 * 60;

/**
 * Qulf ostida yangilash. Navbatdagi jarayon qulfdan keyin bazadagi tokenni
 * qayta o'qiydi — boshqasi allaqachon yangilagan bo'lsa, o'shani oladi.
 */
async function qulfBilanYangila(businessId: string, integrationId: string): Promise<string> {
  return withTenant(businessId, async (tx) => {
    const [r] = await tx
      .select({ creds: integration.credentialsEncrypted, config: integration.config })
      .from(integration)
      .where(eq(integration.id, integrationId))
      .for('update');
    if (!r?.creds) throw new CrmXato('token', 'amoCRM ulanmagan — qayta ulang');
    const joriy = oauthSirmi(decryptSecret(r.creds));
    if (!joriy) throw new CrmXato('token', 'amoCRM ulanmagan — qayta ulang');
    if (joriy.exp - Math.floor(Date.now() / 1000) > ZAXIRA_SONIYA) return joriy.access;

    const s = await amoOauthSozlama();
    if (!s) throw new CrmXato('token', 'Platformada amoCRM integratsiyasi sozlanmagan — administratorga murojaat qiling');
    const yangi = await oauthAlmashtir(amoManzil(crmConfigniOl(r.config)), {
      tur: 'yangilash',
      refresh: joriy.refresh,
      clientId: s.clientId,
      clientSecret: s.clientSecret,
      redirectUri: amoRedirectUri(),
    });
    await tx
      .update(integration)
      .set({ credentialsEncrypted: encryptSecret(JSON.stringify(yangi)), updatedAt: new Date() })
      .where(eq(integration.id, integrationId));
    return yangi.access;
  });
}

/**
 * Integratsiya qatoridan adapter konteksti. OAuth bo'lsa — `token()` har
 * chaqiruvdan oldin amal qiluvchi access token qaytaradi.
 */
export function kontekstQur(row: {
  id: string;
  businessId: string;
  config: unknown;
  creds: Buffer | null;
}): CrmKontekst | null {
  if (!row.creds) return null;
  let sir: string;
  try {
    sir = decryptSecret(row.creds);
  } catch {
    return null;
  }
  const k: CrmKontekst = { config: crmConfigniOl(row.config), sir };
  let oauth = oauthSirmi(sir);
  if (oauth) {
    k.token = async () => {
      if (oauth && oauth.exp - Math.floor(Date.now() / 1000) > ZAXIRA_SONIYA) return oauth.access;
      const access = await qulfBilanYangila(row.businessId, row.id);
      oauth = { ...(oauth as NonNullable<typeof oauth>), access, exp: Math.floor(Date.now() / 1000) + 3600 };
      return access;
    };
  }
  return k;
}
