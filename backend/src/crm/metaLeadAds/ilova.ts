import { randomBytes } from 'node:crypto';
import { and, eq, ne, sql } from 'drizzle-orm';
import { decryptSecret, encryptSecret, maskSecret } from '../../crypto/secrets.js';
import { withTenant } from '../../db/index.js';
import { auditLog, metaAppConfig, metaPageConnection } from '../../db/schema/index.js';
import { CrmXatosi } from '../xato.js';
import { graf } from './graph.js';
import { kompaniyaManzillari, redirectUri } from './sozlama.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META LEAD ADS — kompaniyaning O'Z Meta ilovasi (SaaS)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rahbar kartada App ID, App Secret va (ixtiyoriy) Login for Business
 * Configuration ID ni kiritadi. Server:
 *   • verify token'ni o'zi yaratadi (rahbar Meta paneliga nusxalaydi);
 *   • saqlashdan OLDIN kalitlarni Meta'da tekshiradi (app token bilan);
 *   • App Secret'ni shifrlaydi va hech qachon qaytarmaydi (faqat niqob).
 */

export const APP_ID = /^\d{5,25}$/;
const APP_SECRET = /^[A-Za-z0-9]{16,128}$/;

const yangiVerifyToken = () => randomBytes(24).toString('base64url');

/** Qator bo'lmasa — verify token bilan yaratiladi (webhook manzili kalitlardan OLDIN kerak). */
async function qatorniTayyorla(businessId: string) {
  return withTenant(businessId, async (tx) => {
    await tx.insert(metaAppConfig).values({ businessId, verifyToken: yangiVerifyToken() }).onConflictDoNothing();
    const [q] = await tx.select().from(metaAppConfig).limit(1);
    return q!;
  });
}

/** Kartadagi "Meta ilovasi" bo'limi uchun — App Secret yo'q, faqat niqob. */
export async function ilovaKorinishi(businessId: string) {
  const q = await qatorniTayyorla(businessId);
  return {
    configured: Boolean(q.appId && q.appSecretEncrypted),
    appId: q.appId,
    appName: q.appName,
    secretHint: q.secretHint,
    loginConfigId: q.loginConfigId,
    verifyToken: q.verifyToken,
    redirectUri: redirectUri(),
    ...kompaniyaManzillari(q.id),
    updatedAt: q.updatedAt,
  };
}

export async function ilovaniSaqla(p: {
  businessId: string;
  userId: string;
  appId: string;
  /** Bo'sh — saqlangani qoladi. */
  appSecret?: string | undefined;
  loginConfigId?: string | null | undefined;
  ip?: string;
}): Promise<void> {
  const appId = p.appId.trim();
  if (!APP_ID.test(appId)) throw new CrmXatosi('yaroqsiz', "App ID faqat raqamlardan iborat — Meta ilovasi → App settings → Basic");
  const loginConfigId = p.loginConfigId?.trim() || null;
  if (loginConfigId && !APP_ID.test(loginConfigId)) throw new CrmXatosi('yaroqsiz', "Configuration ID faqat raqamlardan iborat");
  const q = await qatorniTayyorla(p.businessId);

  let secret = p.appSecret?.trim() || null;
  if (secret && !APP_SECRET.test(secret)) throw new CrmXatosi('yaroqsiz', "App Secret noto'g'ri — Meta ilovasi → App settings → Basic → App secret ni to'liq nusxalang");
  if (!secret) {
    if (!q.appSecretEncrypted || q.appId !== appId) throw new CrmXatosi('yaroqsiz', 'App Secret ni kiriting');
    secret = decryptSecret(q.appSecretEncrypted);
  }

  // Saqlashdan oldin Meta'da tekshiriladi: noto'g'ri kalit bilan "sozlangan" holat bo'lmasin
  const r = await graf<{ id?: string; name?: string }>({ yol: `/${appId}`, token: `${appId}|${secret}`, params: { fields: 'id,name' } });
  if (!r.ok || r.data.id !== appId) {
    throw new CrmXatosi(
      'yaroqsiz',
      r.ok || r.tur === 'token_revoked' || r.tur === 'not_found' || r.tur === 'unknown'
        ? "Meta App ID yoki App Secret ni tasdiqlamadi — ikkalasini Meta ilovasi → App settings → Basic dan qayta nusxalang"
        : `Meta bilan tekshirib bo'lmadi: ${r.xabar}`,
    );
  }

  await withTenant(p.businessId, async (tx) => {
    // Boshqa ilovaga o'tildi (platforma ilovasidan o'z ilovasiga ham) — eski tokenlar boshqa ilovaniki
    const almashdi = q.appId !== appId;
    await tx
      .update(metaAppConfig)
      .set({
        appId,
        appName: r.data.name?.slice(0, 200) ?? null,
        appSecretEncrypted: encryptSecret(secret),
        secretHint: maskSecret(secret),
        loginConfigId,
        updatedBy: p.userId,
        updatedAt: new Date(),
      })
      .where(eq(metaAppConfig.id, q.id));
    if (almashdi) {
      // Boshqa ilova — eski ilova orqali olingan sahifa tokenlari endi ishlamaydi
      await tx
        .update(metaPageConnection)
        .set({ status: 'error', lastErrorCode: 'token_revoked', lastError: "Meta ilovasi almashtirildi — «Qayta ulash» ni bosing.", lastErrorAt: new Date(), updatedAt: new Date() })
        .where(ne(metaPageConnection.status, 'disconnected'));
    }
    await tx.insert(auditLog).values({
      businessId: p.businessId,
      actorId: p.userId,
      action: 'meta_lead_ads.app_update',
      entity: 'meta_app_config',
      entityId: q.id,
      before: { appId: q.appId, loginConfigId: q.loginConfigId },
      after: { appId, loginConfigId, secretChanged: Boolean(p.appSecret) },
      ip: p.ip ?? null,
    });
  });
}

/** Ilova sozlamasini o'chirish — faqat faol ulangan sahifa yo'q bo'lsa. */
export async function ilovaniOchir(businessId: string, userId: string): Promise<void> {
  await withTenant(businessId, async (tx) => {
    const [faol] = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(metaPageConnection)
      .where(and(ne(metaPageConnection.status, 'disconnected')));
    if ((faol?.n ?? 0) > 0) throw new CrmXatosi('ziddiyat', 'Avval ulangan sahifalarni uzing — ular shu ilova orqali ishlaydi');
    const r = await tx.delete(metaAppConfig).returning({ id: metaAppConfig.id });
    if (r.length) {
      await tx.insert(auditLog).values({ businessId, actorId: userId, action: 'meta_lead_ads.app_delete', entity: 'meta_app_config', entityId: r[0]!.id });
    }
  });
}
