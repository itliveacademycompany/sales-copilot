import { and, eq, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { decryptSecret, encryptSecret } from '../../crypto/secrets.js';
import { withoutTenantIsolation, withTenant } from '../../db/index.js';
import { isUniqueViolation } from '../../db/errors.js';
import { auditLog, crmPipeline, metaLeadgenEvent, metaOauthSession, metaPageConnection } from '../../db/schema/index.js';
import { frontendUrl, hostDanSlug, rootHostmi, rootUrl } from '../../http/tenant.js';
import { CrmXatosi } from '../xato.js';
import { graf, hammasiniOl } from './graph.js';
import { dialogManzili, kompaniyaSozlamasi, MAJBURIY_RUXSATLAR, type MetaSozlama } from './sozlama.js';
import {
  ID,
  sahifaRuxsati,
  sessiyaSahifalari,
  STATE_MUDDATI_MS,
  STATE_SHAKLI,
  stateniBahola,
  stateXeshi,
  TANLASH_MUDDATI_MS,
  XATO_MATNI,
  yangiState,
  type SessiyaSahifasi,
  type TanlanganForma,
} from './sof.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META LEAD ADS — OAuth (Facebook Login for Business) va sahifa ulash
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   start    → server tasodifiy state yaratadi, xeshini foydalanuvchi+biznes+
 *              qaytish manziliga bog'lab saqlaydi → Meta oynasi manzili
 *   callback → state (xesh) bo'yicha sessiya topiladi va ATOMIK "ishlatildi"
 *              qilinadi; tenant faqat sessiyadan olinadi (query'dan EMAS);
 *              code → token almashinuvi serverda; sahifalar va ularning
 *              tokenlari shifrlab saqlanadi; foydalanuvchi faqat sessiya ID si
 *              bilan o'z kabinetiga qaytadi
 *   tanlash  → sahifa shu sessiyada ruxsat berilganmi, sessiya shu odam va shu
 *              biznesnikimi — serverda tekshiriladi; formalar Meta'dan olinadi
 *   ulash    → sahifa ilova webhook'iga obuna qilinadi (javob tekshiriladi),
 *              ulanish saqlanadi, sessiyadagi tokenlar o'chiriladi
 */

/** Tashkilotning amaldagi Meta ilovasi (o'zi kiritgan yoki platformaniki); yo'q bo'lsa — xato. */
export const sozlamaShart = async (businessId: string): Promise<MetaSozlama> => {
  const s = await kompaniyaSozlamasi(businessId);
  if (!s) throw new CrmXatosi('ziddiyat', XATO_MATNI.config);
  return s;
};

// ─── Start ───────────────────────────────────────────────────────────────────

/** Qaytish manzili — faqat shu biznesning o'z manzili (asosiy sayt yoki o'z subdomeni). */
export function qaytishOrigini(qaytish: string | undefined, slug: string | null): string {
  try {
    const u = qaytish ? new URL(qaytish) : null;
    if (u && (u.protocol === 'http:' || u.protocol === 'https:') && (rootHostmi(u.host) || (slug !== null && hostDanSlug(u.host) === slug))) {
      return u.origin;
    }
  } catch {
    // noto'g'ri URL — standart manzil
  }
  return frontendUrl(slug);
}

export async function oauthBoshla(p: {
  businessId: string;
  userId: string;
  slug: string | null;
  qaytish?: string | undefined;
  connectionId?: string | undefined;
  /** Oldin rad etilgan ruxsatlarni qayta so'rash ("Qayta ulash"). */
  qaytaSora?: boolean | undefined;
}): Promise<{ url: string }> {
  const s = await sozlamaShart(p.businessId);
  const { state, hash } = yangiState();
  const origin = qaytishOrigini(p.qaytish, p.slug);
  await withTenant(p.businessId, async (tx) => {
    if (p.connectionId) {
      const [c] = await tx.select({ id: metaPageConnection.id }).from(metaPageConnection).where(eq(metaPageConnection.id, p.connectionId)).limit(1);
      if (!c) throw new CrmXatosi('topilmadi', 'Ulanish topilmadi');
    }
    // Shu biznesning eski, tugallanmagan urinishlari — tokenlari bilan birga
    await tx
      .delete(metaOauthSession)
      .where(or(lt(metaOauthSession.createdAt, new Date(Date.now() - 24 * 3600_000)), and(eq(metaOauthSession.userId, p.userId), ne(metaOauthSession.status, 'authorized'))));
    await tx.insert(metaOauthSession).values({
      businessId: p.businessId,
      userId: p.userId,
      stateHash: hash,
      returnOrigin: origin,
      connectionId: p.connectionId ?? null,
      expiresAt: new Date(Date.now() + STATE_MUDDATI_MS),
    });
  });
  return { url: dialogManzili(s, state, Boolean(p.connectionId || p.qaytaSora)) };
}

// ─── Callback ────────────────────────────────────────────────────────────────

/** Xato kodlari — frontend matnni kod bo'yicha tuzadi (URL orqali ixtiyoriy matn ko'rsatib bo'lmasin). */
export type CallbackXato = 'holat' | 'eskirgan' | 'ishlatilgan' | 'rad' | 'sozlanmagan' | 'almashtirish' | 'sahifa_yoq' | 'ruxsat';

const INTEGRATSIYA_YOLI = '/crm/integratsiya';

function manzil(origin: string, p: Record<string, string>): string {
  return `${origin}${INTEGRATSIYA_YOLI}?${new URLSearchParams(p).toString()}`;
}

interface MetaSahifa {
  id: string;
  name?: string;
  tasks?: string[];
  access_token?: string;
}

/**
 * Meta qaytaradigan manzil. Har doim REDIRECT qaytaradi (xato ham kod bilan).
 * Log uchun `log` — faqat kod va ID lar, token/code hech qachon.
 */
export async function oauthCallback(
  q: { state?: string; code?: string; error?: string; error_reason?: string },
  log: (obj: Record<string, unknown>, msg: string) => void,
): Promise<string> {
  const ildiz = rootUrl();
  if (!q.state || !STATE_SHAKLI.test(q.state)) return manzil(ildiz, { meta_xato: 'holat' });
  const hash = stateXeshi(q.state);

  // Atomik bir martalik: ikkinchi so'rov (yoki parallel) `used_at` ni bo'sh topmaydi
  const natija = await withoutTenantIsolation('Meta OAuth callback: state xeshi bo‘yicha sessiya — tenant konteksti hali yo‘q', async (tx) => {
    const [s] = await tx
      .select({
        id: metaOauthSession.id,
        businessId: metaOauthSession.businessId,
        returnOrigin: metaOauthSession.returnOrigin,
        usedAt: metaOauthSession.usedAt,
        expiresAt: metaOauthSession.expiresAt,
        status: metaOauthSession.status,
      })
      .from(metaOauthSession)
      .where(eq(metaOauthSession.stateHash, hash))
      .limit(1);
    const baho = stateniBahola(s, new Date());
    if (baho !== 'ok' || !s) return { baho, s: s ?? null };
    const olindi = await tx
      .update(metaOauthSession)
      .set({ usedAt: new Date() })
      .where(and(eq(metaOauthSession.id, s.id), isNull(metaOauthSession.usedAt), eq(metaOauthSession.status, 'pending'), sql`${metaOauthSession.expiresAt} > now()`))
      .returning({ id: metaOauthSession.id });
    return { baho: olindi.length ? ('ok' as const) : ('ishlatilgan' as const), s };
  });

  if (natija.baho === 'topilmadi' || !natija.s) return manzil(ildiz, { meta_xato: 'holat' });
  const { s } = natija;
  if (natija.baho !== 'ok') {
    log({ sessionId: s.id, baho: natija.baho }, 'meta oauth: state rad etildi');
    return manzil(s.returnOrigin, { meta_xato: natija.baho });
  }

  const yakunla = async (xato: CallbackXato) => {
    await withTenant(s.businessId, (tx) =>
      tx.update(metaOauthSession).set({ status: 'failed', error: xato, pagesEncrypted: null }).where(eq(metaOauthSession.id, s.id)),
    );
    return manzil(s.returnOrigin, { meta_xato: xato });
  };

  if (q.error || !q.code) {
    log({ sessionId: s.id, reason: (q.error_reason ?? q.error ?? 'no_code').slice(0, 40) }, 'meta oauth: foydalanuvchi rad etdi yoki kod yo‘q');
    return yakunla('rad');
  }
  // Shu tashkilotning ilovasi — start'dagi bilan bir xil (redirect_uri va client_id mos bo'lishi shart)
  const cfg = await kompaniyaSozlamasi(s.businessId);
  if (!cfg) return yakunla('sozlanmagan');

  // code → qisqa muddatli user token (server tomonda, App Secret bilan)
  const qisqa = await graf<{ access_token?: string; expires_in?: number }>({
    yol: '/oauth/access_token',
    params: { client_id: cfg.appId, client_secret: cfg.appSecret, redirect_uri: cfg.redirectUri, code: q.code },
  });
  if (!qisqa.ok || !qisqa.data.access_token) {
    log({ sessionId: s.id, code: qisqa.ok ? null : qisqa.code, tur: qisqa.ok ? 'token_yoq' : qisqa.tur }, 'meta oauth: code almashtirilmadi');
    return yakunla('almashtirish');
  }
  // Uzoq muddatli user token (~60 kun) — undan olingan sahifa tokenlari odatda muddatsiz
  const uzoq = await graf<{ access_token?: string; expires_in?: number }>({
    yol: '/oauth/access_token',
    params: { grant_type: 'fb_exchange_token', client_id: cfg.appId, client_secret: cfg.appSecret, fb_exchange_token: qisqa.data.access_token },
  });
  const userToken = uzoq.ok && uzoq.data.access_token ? uzoq.data.access_token : qisqa.data.access_token;
  const muddat = uzoq.ok && uzoq.data.expires_in ? new Date(Date.now() + uzoq.data.expires_in * 1000) : null;
  const g = <T>(yol: string, params?: Record<string, string>) => graf<T>({ yol, token: userToken, appSecret: cfg.appSecret, params });

  const [men, ruxsatlar] = await Promise.all([
    g<{ id?: string }>('/me', { fields: 'id' }),
    g<{ data?: { permission?: string; status?: string }[] }>('/me/permissions'),
  ]);
  const berilgan = ruxsatlar.ok ? (ruxsatlar.data.data ?? []).filter((x) => x.status === 'granted' && x.permission).map((x) => x.permission!) : [];
  const sahifalar = await hammasiniOl<MetaSahifa>({
    yol: '/me/accounts',
    token: userToken,
    appSecret: cfg.appSecret,
    params: { fields: 'id,name,tasks,access_token', limit: '100' },
    maxSahifa: 10,
  });
  if (!sahifalar.ok) {
    log({ sessionId: s.id, code: sahifalar.code, tur: sahifalar.tur }, 'meta oauth: sahifalar olinmadi');
    return yakunla(sahifalar.tur === 'permission' ? 'ruxsat' : 'almashtirish');
  }
  const yaroqli = sahifalar.data.filter((x) => typeof x.id === 'string' && ID.test(x.id) && typeof x.access_token === 'string' && x.access_token);
  if (!yaroqli.length) return yakunla(ruxsatlar.ok && !berilgan.includes('pages_show_list') ? 'ruxsat' : 'sahifa_yoq');

  const ochiq: SessiyaSahifasi[] = yaroqli.map((x) => ({ id: x.id, name: x.name?.slice(0, 200) ?? null, tasks: Array.isArray(x.tasks) ? x.tasks : [] }));
  const shifr = encryptSecret(JSON.stringify(yaroqli.map((x) => ({ id: x.id, token: x.access_token }))));
  await withTenant(s.businessId, (tx) =>
    tx
      .update(metaOauthSession)
      .set({
        status: 'authorized',
        fbUserId: men.ok && men.data.id && ID.test(men.data.id) ? men.data.id : null,
        pages: ochiq,
        pagesEncrypted: shifr,
        grantedScopes: berilgan,
        userTokenExpiresAt: muddat,
        selectionExpiresAt: new Date(Date.now() + TANLASH_MUDDATI_MS),
      })
      .where(eq(metaOauthSession.id, s.id)),
  );
  log({ sessionId: s.id, businessId: s.businessId, pages: ochiq.length }, 'meta oauth: ruxsat olindi');
  return manzil(s.returnOrigin, { meta_sessiya: s.id });
}

// ─── Sessiya (tanlash) ───────────────────────────────────────────────────────

interface SessiyaQatori {
  id: string;
  businessId: string;
  userId: string;
  status: string;
  selectionExpiresAt: Date | null;
  pages: unknown;
  pagesEncrypted: Buffer | null;
  grantedScopes: unknown;
  connectionId: string | null;
  fbUserId: string | null;
}

async function sessiyaniOl(businessId: string, sessionId: string): Promise<SessiyaQatori | null> {
  const [s] = await withTenant(businessId, (tx) =>
    tx
      .select({
        id: metaOauthSession.id,
        businessId: metaOauthSession.businessId,
        userId: metaOauthSession.userId,
        status: metaOauthSession.status,
        selectionExpiresAt: metaOauthSession.selectionExpiresAt,
        pages: metaOauthSession.pages,
        pagesEncrypted: metaOauthSession.pagesEncrypted,
        grantedScopes: metaOauthSession.grantedScopes,
        connectionId: metaOauthSession.connectionId,
        fbUserId: metaOauthSession.fbUserId,
      })
      .from(metaOauthSession)
      .where(eq(metaOauthSession.id, sessionId))
      .limit(1),
  );
  return s ?? null;
}

const RUXSAT_XATOSI: Record<'sessiya' | 'muddat' | 'sahifa' | 'vazifa', CrmXatosi> = {
  sessiya: new CrmXatosi('topilmadi', 'Ulash sessiyasi topilmadi — «Facebook orqali ulash» ni qaytadan bosing'),
  muddat: new CrmXatosi('ziddiyat', "Tanlash vaqti tugadi — «Facebook orqali ulash» ni qaytadan bosing"),
  sahifa: new CrmXatosi('topilmadi', 'Bu sahifaga ushbu ulanishda ruxsat berilmagan'),
  vazifa: new CrmXatosi('ruxsat', "Bu sahifada reklama (Advertise) huquqingiz yo'q — lidlarni o'qib bo'lmaydi"),
};

/** Sessiya shu biznes VA shu foydalanuvchiniki, sahifa shu sessiyada berilgan — aks holda xato. */
async function tanlashRuxsati(businessId: string, userId: string, sessionId: string, pageId: string) {
  const s = await sessiyaniOl(businessId, sessionId);
  const r = sahifaRuxsati(s, { businessId, userId, pageId, hozir: new Date() });
  if (!r.ok) throw RUXSAT_XATOSI[r.sabab];
  const tokenlar = s!.pagesEncrypted ? (JSON.parse(decryptSecret(s!.pagesEncrypted)) as { id: string; token: string }[]) : [];
  const token = tokenlar.find((x) => x.id === pageId)?.token;
  if (!token) throw RUXSAT_XATOSI.muddat;
  return { s: s!, sahifa: r.sahifa, token };
}

/** Frontend uchun: sahifalar ro'yxati — tokensiz. */
export async function sessiyaKorinishi(businessId: string, userId: string, sessionId: string) {
  const s = await sessiyaniOl(businessId, sessionId);
  if (!s || s.userId !== userId || s.status !== 'authorized') throw RUXSAT_XATOSI.sessiya;
  if (!s.selectionExpiresAt || s.selectionExpiresAt.getTime() <= Date.now()) throw RUXSAT_XATOSI.muddat;
  const sahifalar = sessiyaSahifalari(s.pages);
  // Boshqa tashkilotga ulangan sahifalar — faqat "band" belgisi (qaysi tashkilot ekani aytilmaydi)
  const band = sahifalar.length
    ? await withoutTenantIsolation('Meta: tanlanayotgan sahifa boshqa tashkilotga ulanganmi (faqat ha/yo‘q)', (tx) =>
        tx
          .select({ pageId: metaPageConnection.pageId, businessId: metaPageConnection.businessId })
          .from(metaPageConnection)
          .where(and(inArray(metaPageConnection.pageId, sahifalar.map((p) => p.id)), ne(metaPageConnection.status, 'disconnected'))),
      )
    : [];
  const berilgan = Array.isArray(s.grantedScopes) ? (s.grantedScopes as string[]) : [];
  return {
    id: s.id,
    connectionId: s.connectionId,
    expiresAt: s.selectionExpiresAt.toISOString(),
    missingPermissions: berilgan.length ? MAJBURIY_RUXSATLAR.filter((r) => !berilgan.includes(r)) : [],
    pages: sahifalar.map((p) => {
      const b = band.find((x) => x.pageId === p.id);
      return {
        id: p.id,
        name: p.name,
        canAdvertise: p.tasks.includes('ADVERTISE') || p.tasks.includes('MANAGE'),
        connected: b ? (b.businessId === businessId ? 'shu' : 'boshqa') : null,
      };
    }),
  };
}

interface MetaForma {
  id: string;
  name?: string;
  status?: string;
  locale?: string;
  created_time?: string;
}

export interface FormaKorinishi {
  id: string;
  name: string | null;
  status: string | null;
  createdAt: string | null;
}

/** Sahifaning Instant Form'lari (sahifalab, hammasi). Faol formalar birinchi. */
export async function sahifaFormalari(pageId: string, token: string, appSecret: string): Promise<FormaKorinishi[]> {
  const r = await hammasiniOl<MetaForma>({
    yol: `/${pageId}/leadgen_forms`,
    token,
    appSecret,
    params: { fields: 'id,name,status,locale,created_time', limit: '100' },
    maxSahifa: 20,
  });
  if (!r.ok) throw new CrmXatosi('ziddiyat', `${XATO_MATNI[r.tur]} (Meta: ${r.xabar})`);
  return r.data
    .filter((f) => typeof f.id === 'string' && ID.test(f.id))
    .map((f) => ({ id: f.id, name: f.name?.slice(0, 300) ?? null, status: f.status ?? null, createdAt: f.created_time ?? null }))
    .sort((a, b) => Number(b.status === 'ACTIVE') - Number(a.status === 'ACTIVE') || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

export async function sessiyaFormalari(businessId: string, userId: string, sessionId: string, pageId: string) {
  const cfg = await sozlamaShart(businessId);
  const { token } = await tanlashRuxsati(businessId, userId, sessionId, pageId);
  return { forms: await sahifaFormalari(pageId, token, cfg.appSecret) };
}

// ─── Ulash ───────────────────────────────────────────────────────────────────

/** Sahifani ilovaning `leadgen` webhook'iga obuna qiladi; muvaffaqiyat Meta javobidan tekshiriladi. */
export async function obunaQil(pageId: string, token: string, appSecret: string): Promise<{ ok: true } | { ok: false; xabar: string }> {
  const r = await graf<{ success?: boolean | string }>({ yol: `/${pageId}/subscribed_apps`, token, appSecret, usul: 'POST', params: { subscribed_fields: 'leadgen' } });
  if (r.ok && (r.data.success === true || r.data.success === 'true')) return { ok: true };
  return { ok: false, xabar: r.ok ? "Meta obunani tasdiqlamadi" : `${XATO_MATNI[r.tur]} (Meta: ${r.xabar})` };
}

/** Tanlangan forma ID lari sahifaning haqiqiy formalariga qarshi tekshiriladi. */
export function formalarniTekshir(tanlangan: string[], mavjud: FormaKorinishi[]): TanlanganForma[] {
  const ids = [...new Set(tanlangan)];
  if (!ids.length) throw new CrmXatosi('yaroqsiz', 'Kamida bitta formani tanlang');
  const natija: TanlanganForma[] = [];
  for (const id of ids) {
    const f = mavjud.find((x) => x.id === id);
    if (!f) throw new CrmXatosi('yaroqsiz', 'Tanlangan forma bu sahifada topilmadi');
    natija.push({ id: f.id, name: f.name });
  }
  return natija;
}

export async function voronkaniTekshir(businessId: string, pipelineId: string | null | undefined): Promise<string | null> {
  if (!pipelineId) return null;
  const [v] = await withTenant(businessId, (tx) => tx.select({ id: crmPipeline.id }).from(crmPipeline).where(eq(crmPipeline.id, pipelineId)).limit(1));
  if (!v) throw new CrmXatosi('topilmadi', 'Voronka topilmadi');
  return v.id;
}

const BOSHQA_TASHKILOT = new CrmXatosi(
  'ziddiyat',
  "Bu sahifa platformadagi boshqa tashkilotga ulangan. U yerdagi ulanish uzilmaguncha bu yerga ulab bo'lmaydi — sahifa administratori bilan bog'laning.",
);

export async function sahifaniUla(p: {
  businessId: string;
  userId: string;
  sessionId: string;
  pageId: string;
  formIds: string[];
  pipelineId?: string | null | undefined;
  ip?: string;
  userAgent?: string | null;
}): Promise<{ connectionId: string }> {
  const cfg = await sozlamaShart(p.businessId);
  const { s, sahifa, token } = await tanlashRuxsati(p.businessId, p.userId, p.sessionId, p.pageId);
  const forms = formalarniTekshir(p.formIds, await sahifaFormalari(p.pageId, token, cfg.appSecret));
  const pipelineId = await voronkaniTekshir(p.businessId, p.pipelineId);

  // Boshqa tashkilotga faol ulanganmi — obuna qilishdan OLDIN (indamay egallab olinmasin)
  const [band] = await withoutTenantIsolation('Meta: sahifa boshqa tashkilotga faol ulanganmi', (tx) =>
    tx
      .select({ businessId: metaPageConnection.businessId })
      .from(metaPageConnection)
      .where(and(eq(metaPageConnection.pageId, p.pageId), ne(metaPageConnection.status, 'disconnected'), ne(metaPageConnection.businessId, p.businessId)))
      .limit(1),
  );
  if (band) throw BOSHQA_TASHKILOT;

  const obuna = await obunaQil(p.pageId, token, cfg.appSecret);
  if (!obuna.ok) throw new CrmXatosi('ziddiyat', obuna.xabar);

  // Sahifa tokeni muddati — debug_token'dan (0 — Meta muddat bermagan; abadiy kafolat emas)
  const dbg = await graf<{ data?: { expires_at?: number; is_valid?: boolean } }>({
    yol: '/debug_token',
    token: `${cfg.appId}|${cfg.appSecret}`,
    params: { input_token: token },
  });
  const exp = dbg.ok ? dbg.data.data?.expires_at : undefined;
  const tokenExpiresAt = typeof exp === 'number' && exp > 0 ? new Date(exp * 1000) : null;

  const qiymat = {
    pageName: sahifa.name,
    status: 'active',
    forms,
    pipelineId,
    pageTokenEncrypted: encryptSecret(token),
    tokenExpiresAt,
    fbUserId: s.fbUserId,
    grantedScopes: Array.isArray(s.grantedScopes) ? s.grantedScopes : [],
    subscriptionStatus: 'subscribed',
    subscriptionCheckedAt: new Date(),
    connectedBy: p.userId,
    connectedAt: new Date(),
    lastErrorCode: null,
    lastError: null,
    lastErrorAt: null,
    disconnectedAt: null,
    updatedAt: new Date(),
  };
  try {
    const connectionId = await withTenant(p.businessId, async (tx) => {
      const [bor] = await tx.select({ id: metaPageConnection.id }).from(metaPageConnection).where(eq(metaPageConnection.pageId, p.pageId)).for('update').limit(1);
      let id: string;
      if (bor) {
        await tx.update(metaPageConnection).set(qiymat).where(eq(metaPageConnection.id, bor.id));
        id = bor.id;
        // Qayta ulash: ruxsat kutayotgan hodisalar navbatga qaytadi
        await tx
          .update(metaLeadgenEvent)
          .set({ status: 'queued', runAfter: new Date(), attempts: 0, lastError: null })
          .where(and(eq(metaLeadgenEvent.connectionId, id), eq(metaLeadgenEvent.status, 'auth_wait')));
      } else {
        const [r] = await tx
          .insert(metaPageConnection)
          .values({ businessId: p.businessId, pageId: p.pageId, ...qiymat })
          .returning({ id: metaPageConnection.id });
        id = r!.id;
      }
      // Sessiya tugadi — undagi barcha sahifa tokenlari o'chiriladi
      await tx.update(metaOauthSession).set({ status: 'consumed', pagesEncrypted: null }).where(eq(metaOauthSession.id, s.id));
      await tx.insert(auditLog).values({
        businessId: p.businessId,
        actorId: p.userId,
        action: 'meta_lead_ads.connect',
        entity: 'meta_page_connection',
        entityId: id,
        after: { pageId: p.pageId, pageName: sahifa.name, forms: forms.map((f) => f.id), pipelineId },
        ip: p.ip ?? null,
        userAgent: p.userAgent ?? null,
      });
      return id;
    });
    return { connectionId };
  } catch (err) {
    // Poyga: shu orada boshqa tashkilot ulab ulgurdi. Obunani BEKOR QILMAYMIZ —
    // u o'sha tashkilotning ulanishi uchun ham kerak (bitta ilova).
    if (isUniqueViolation(err, 'meta_page_connection_active_page_uq')) throw BOSHQA_TASHKILOT;
    throw err;
  }
}

/** Fon tozalash: muddati o'tgan sessiyalardagi tokenlar va 1 kundan eski sessiyalar. */
export async function eskiSessiyalarniTozala(): Promise<number> {
  return withoutTenantIsolation('Meta: muddati o‘tgan OAuth sessiyalarini tozalash (barcha tenantlar)', async (tx) => {
    await tx
      .update(metaOauthSession)
      .set({ pagesEncrypted: null })
      .where(and(sql`${metaOauthSession.pagesEncrypted} is not null`, or(lt(metaOauthSession.selectionExpiresAt, new Date()), ne(metaOauthSession.status, 'authorized'))));
    const r = await tx.delete(metaOauthSession).where(lt(metaOauthSession.createdAt, new Date(Date.now() - 24 * 3600_000))).returning({ id: metaOauthSession.id });
    return r.length;
  });
}
