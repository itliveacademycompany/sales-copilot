import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { decryptSecret, encryptSecret, maskSecret } from '../../crypto/secrets.js';
import { withTenant } from '../../db/index.js';
import { integration } from '../../db/schema/index.js';
import {
  amocrmConfigSchema,
  AmoXato,
  hisobManzili,
  hisobniTekshir,
  manzilniAjrat,
  tokenMuddati,
  tuzilishniOl,
  type AmoManzil,
} from '../../integrations/amocrm.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * amoCRM — CRM bo'limi: ulash, tekshirish, tuzilish, uzish
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mantiq `integrations/amocrm.ts` da; bu yerda faqat HTTP qatlami.
 * Token HECH QACHON qaytarilmaydi — faqat niqob. Uni ko'rish emas, faqat
 * almashtirish mumkin. Hamma marshrut `integration:manage` (ega, rahbar).
 */

const ulashBody = z.object({
  /** `kompaniya`, `kompaniya.amocrm.ru` yoki brauzerdan nusxalangan to'liq manzil. */
  address: z.string().trim().min(1).max(300),
  /** `null` — saqlangan token qoladi (faqat manzil o'zgarmagan bo'lsa). */
  token: z.string().trim().min(20).max(4000).nullable().default(null),
});

async function qatorniOl(businessId: string) {
  const [row] = await withTenant(businessId, (tx) =>
    tx
      .select({
        id: integration.id,
        status: integration.status,
        config: integration.config,
        creds: integration.credentialsEncrypted,
        tokenExpiresAt: integration.tokenExpiresAt,
        lastSyncAt: integration.lastSyncAt,
        lastError: integration.lastError,
      })
      .from(integration)
      .where(eq(integration.kind, 'amocrm'))
      .limit(1),
  );
  if (!row) return null;
  const cfg = amocrmConfigSchema.parse((row.config as Record<string, unknown>)?.amocrm ?? {});
  let token: string | null = null;
  try {
    token = row.creds ? decryptSecret(row.creds) : null;
  } catch {
    token = null;
  }
  const manzil: AmoManzil | null =
    cfg.subdomain && cfg.baseDomain ? { subdomain: cfg.subdomain, baseDomain: cfg.baseDomain } : null;
  return { ...row, cfg, token, manzil };
}

/** amoCRM xatosini foydalanuvchiga tushunarli 400 ga aylantiradi. */
function amoXatosi(err: unknown): never {
  if (err instanceof AmoXato) throw AppError.badRequest(err.message);
  throw err;
}

export function registerAmocrmRoutes(app: FastifyInstance): void {
  const base = '/api/v1/businesses/:businessId/integrations/amocrm';
  const guard = { preHandler: [requireBusiness, requirePermission('integration:manage')] };

  /** Holat — tarmoqqa chiqmaydi, bazadan o'qiydi. */
  app.get(base, guard, async (req) => {
    const q = await qatorniOl(req.business!.businessId);
    const ulangan = q?.status === 'connected' || q?.status === 'error';
    return {
      connected: Boolean(q && ulangan && q.token),
      status: q?.status ?? 'disconnected',
      account:
        q && q.manzil && ulangan
          ? {
              id: q.cfg.accountId ?? null,
              name: q.cfg.accountName ?? q.manzil.subdomain,
              subdomain: q.manzil.subdomain,
              baseDomain: q.manzil.baseDomain,
              url: hisobManzili(q.manzil),
              country: q.cfg.country ?? null,
              currency: q.cfg.currency ?? null,
              connectedAt: q.cfg.connectedAt ?? null,
            }
          : null,
      /** Uzilgandan keyin ham manzil formada qoladi — qayta ulash oson bo'lsin. */
      lastAddress: q?.manzil ? `${q.manzil.subdomain}.${q.manzil.baseDomain}` : null,
      tokenHint: q?.token && ulangan ? maskSecret(q.token) : null,
      tokenExpiresAt: ulangan ? (q?.tokenExpiresAt ?? null) : null,
      lastCheckAt: q?.lastSyncAt ?? null,
      lastError: q?.lastError ?? null,
    };
  });

  /**
   * Ulash / tokenni almashtirish. Saqlashdan OLDIN token amoCRM da
   * haqiqatan tekshiriladi va aynan shu manzildagi hisobga tegishli
   * ekani solishtiriladi.
   */
  app.put(base, { ...guard, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const body = ulashBody.parse(req.body);
    const businessId = req.business!.businessId;

    const manzil = manzilniAjrat(body.address);
    if (!manzil) {
      throw AppError.badRequest("Manzil noto'g'ri. Masalan: kompaniya.amocrm.ru");
    }

    const mavjud = await qatorniOl(businessId);
    const ozgarmagan =
      mavjud?.manzil?.subdomain === manzil.subdomain && mavjud.manzil.baseDomain === manzil.baseDomain;
    // Manzil o'zgarsa eski token yaramaydi — u boshqa hisobniki
    const token = body.token ?? (ozgarmagan ? mavjud?.token : null) ?? null;
    if (!token) throw AppError.badRequest('Uzoq muddatli tokenni kiriting');

    const hisob = await hisobniTekshir(manzil, token).catch(amoXatosi);
    const muddat = tokenMuddati(token);
    if (muddat && muddat.getTime() <= Date.now()) {
      throw AppError.badRequest("Token muddati tugagan — amoCRM da yangisini yarating");
    }

    const cfg = amocrmConfigSchema.parse({
      subdomain: manzil.subdomain,
      baseDomain: manzil.baseDomain,
      accountId: hisob.id,
      accountName: hisob.name,
      country: hisob.country,
      currency: hisob.currency,
      connectedAt: ozgarmagan && mavjud?.cfg.connectedAt ? mavjud.cfg.connectedAt : new Date().toISOString(),
    });
    const hozir = new Date();

    await withTenant(businessId, async (tx) => {
      const qiymat = {
        status: 'connected' as const,
        credentialsEncrypted: encryptSecret(token),
        tokenExpiresAt: muddat,
        syncEnabled: true,
        lastSyncAt: hozir,
        lastSyncStatus: 'ok',
        lastError: null,
        updatedAt: hozir,
      };
      if (mavjud) {
        const config = (mavjud.config ?? {}) as Record<string, unknown>;
        await tx.update(integration).set({ ...qiymat, config: { ...config, amocrm: cfg } }).where(eq(integration.id, mavjud.id));
      } else {
        await tx.insert(integration).values({ businessId, kind: 'amocrm', config: { amocrm: cfg }, ...qiymat });
      }
    });

    return { ok: true, account: { name: hisob.name, url: hisobManzili(manzil) }, tokenHint: maskSecret(token) };
  });

  /**
   * Ulanishni qayta tekshirish. Natija bazaga yoziladi: token bekor
   * qilingan bo'lsa holat `error` bo'ladi va sahifada qizil ko'rinadi.
   */
  app.post(`${base}/check`, { ...guard, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const businessId = req.business!.businessId;
    const q = await qatorniOl(businessId);
    if (!q?.manzil || !q.token || q.status === 'disconnected') throw AppError.badRequest('amoCRM ulanmagan');

    const hozir = new Date();
    try {
      const hisob = await hisobniTekshir(q.manzil, q.token);
      const config = (q.config ?? {}) as Record<string, unknown>;
      await withTenant(businessId, (tx) =>
        tx
          .update(integration)
          .set({
            status: 'connected',
            config: { ...config, amocrm: { ...q.cfg, accountName: hisob.name, country: hisob.country, currency: hisob.currency } },
            lastSyncAt: hozir,
            lastSyncStatus: 'ok',
            lastError: null,
            updatedAt: hozir,
          })
          .where(eq(integration.id, q.id)),
      );
      return { ok: true, checkedAt: hozir.toISOString() };
    } catch (err) {
      if (!(err instanceof AmoXato)) throw err;
      // Vaqtinchalik xato (tarmoq, limit) ulanishni "buzilgan" qilmaydi
      const doimiy = err.tur === 'token' || err.tur === 'tolov' || err.tur === 'topilmadi' || err.tur === 'hisob';
      await withTenant(businessId, (tx) =>
        tx
          .update(integration)
          .set({
            ...(doimiy ? { status: 'error' as const } : {}),
            lastSyncAt: hozir,
            lastSyncStatus: 'error',
            lastError: err.message,
            updatedAt: hozir,
          })
          .where(eq(integration.id, q.id)),
      );
      return { ok: false, checkedAt: hozir.toISOString(), error: err.message };
    }
  });

  /** Hisob tuzilishi (voronkalar, foydalanuvchilar) — amoCRM dan jonli. */
  app.get(`${base}/structure`, { ...guard, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const q = await qatorniOl(req.business!.businessId);
    if (!q?.manzil || !q.token || q.status === 'disconnected') throw AppError.badRequest('amoCRM ulanmagan');
    return tuzilishniOl(q.manzil, q.token).catch(amoXatosi);
  });

  /** Uzish — token o'chiriladi. amoCRM dagi hech narsaga tegilmaydi. */
  app.delete(base, guard, async (req) => {
    await withTenant(req.business!.businessId, (tx) =>
      tx
        .update(integration)
        .set({
          status: 'disconnected',
          credentialsEncrypted: null,
          tokenExpiresAt: null,
          syncEnabled: false,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(integration.kind, 'amocrm')),
    );
    return { ok: true };
  });
}
