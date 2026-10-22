import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withoutTenantIsolation } from '../../db/index.js';
import { auditLog, business } from '../../db/schema/index.js';
import { CrmXato } from '../../integrations/crm/adapter.js';
import { hisobManzili, hisobniTekshir, manzilniAjrat, oauthAlmashtir } from '../../integrations/crm/amocrm.js';
import {
  amoOauthKorinish,
  amoOauthOchir,
  amoOauthSaqla,
  amoOauthSozlama,
  amoRedirectUri,
  holatniTekshir,
} from '../../integrations/crm/kontekst.js';
import { requireAuth } from '../auth-plugin.js';
import { AppError } from '../errors.js';
import { frontendUrl, rootUrl } from '../tenant.js';
import { requireSuperAdmin } from './admin.js';
import { ulanishniSaqla } from './crm-ulanish.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * amoCRM OAuth — "bir tugmada ulash"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   1. Super admin bir marta amoCRM integratsiyasi kalitlarini kiritadi
 *      (`/api/v1/admin/crm/amocrm-oauth`). Redirect manzili shu yerda
 *      ko'rsatiladi — uni amoCRM integratsiyasiga qo'yadi.
 *   2. Mijoz CRM sahifasida «amoCRM bilan ulash» → amoCRM ruxsat sahifasi
 *      (`POST /businesses/:id/crm/amocrm/oauth` manzil beradi).
 *   3. amoCRM shu callback ga `code`, `referer` (hisob), `state` bilan
 *      qaytaradi → kod tokenga almashtiriladi → hisob tekshiriladi →
 *      saqlanadi → foydalanuvchi o'z kabinetidagi CRM sahifasiga qaytadi.
 *
 * XAVFSIZLIK
 * ──────────
 * • `state` imzolangan (HMAC) va 15 daqiqa amal qiladi — kimdir o'z
 *   amoCRM ini begona biznesga "ulab qo'ya" olmaydi (CSRF).
 * • `referer` faqat amoCRM domeni bo'lsa qabul qilinadi (SSRF).
 * • Callback xatoni sahifaga KOD bilan qaytaradi, matn bilan emas — URL
 *   orqali ixtiyoriy matn ko'rsatib bo'lmasin.
 */

const callbackQuery = z.object({
  code: z.string().max(4000).optional(),
  referer: z.string().max(300).optional(),
  state: z.string().max(1000).optional(),
  error: z.string().max(200).optional(),
});

const sozlamaBody = z.object({
  clientId: z.string().trim().min(10).max(200),
  /** `null` — saqlangan secret qoladi. */
  clientSecret: z.string().trim().min(10).max(500).nullable().default(null),
});

async function audit(req: FastifyRequest, action: string, after: unknown): Promise<void> {
  await withoutTenantIsolation('audit: platforma darajasidagi amal', (tx) =>
    tx.insert(auditLog).values({
      businessId: null,
      actorId: req.auth!.user.id,
      action,
      entity: 'platform_setting',
      entityId: 'crm.amocrm.oauth',
      before: null,
      after: after as never,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    }),
  );
}

export function registerCrmOauthRoutes(app: FastifyInstance): void {
  // ─── Super admin: platformadagi amoCRM integratsiyasi ───────────────────────
  const adminGuard = { preHandler: [requireAuth, requireSuperAdmin] };
  const adminYol = '/api/v1/admin/crm/amocrm-oauth';

  app.get(adminYol, adminGuard, async () => amoOauthKorinish());

  app.put(adminYol, adminGuard, async (req) => {
    const body = sozlamaBody.parse(req.body);
    await amoOauthSaqla(body.clientId, body.clientSecret, req.auth!.user.id).catch((err: unknown) => {
      if (err instanceof CrmXato) throw AppError.badRequest(err.message);
      throw err;
    });
    await audit(req, 'crm_oauth.update', { clientId: body.clientId, secretChanged: body.clientSecret !== null });
    return amoOauthKorinish();
  });

  app.delete(adminYol, adminGuard, async (req) => {
    await amoOauthOchir();
    await audit(req, 'crm_oauth.delete', null);
    return { ok: true };
  });

  // ─── amoCRM qaytaradigan manzil (ommaviy) ──────────────────────────────────
  app.get(
    '/api/v1/crm/oauth/amocrm/callback',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const q = callbackQuery.parse(req.query);
      const h = q.state ? holatniTekshir(q.state) : null;
      if (!h) return reply.redirect(`${rootUrl()}/crm/integratsiya?crm_xato=holat`);

      const [biz] = await withoutTenantIsolation('CRM OAuth: qaytish manzili uchun biznes', (tx) =>
        tx.select({ slug: business.slug }).from(business).where(eq(business.id, h.businessId)).limit(1),
      );
      // Foydalanuvchi qayerdan boshlagan bo'lsa (imzolangan, start'da tekshirilgan) — o'sha yerga
      const qayt = (natija: string) => `${h.qaytish ?? frontendUrl(biz?.slug ?? null)}/crm/integratsiya?${natija}`;
      if (!biz) return reply.redirect(`${rootUrl()}/crm/integratsiya?crm_xato=holat`);
      if (q.error || !q.code) return reply.redirect(qayt('crm_xato=rad'));

      const manzil = manzilniAjrat(q.referer ?? '');
      if (!manzil) return reply.redirect(qayt('crm_xato=manzil'));
      const s = await amoOauthSozlama();
      if (!s) return reply.redirect(qayt('crm_xato=sozlanmagan'));

      try {
        const juft = await oauthAlmashtir(manzil, {
          tur: 'kod',
          kod: q.code,
          clientId: s.clientId,
          clientSecret: s.clientSecret,
          redirectUri: amoRedirectUri(),
        });
        const hisob = await hisobniTekshir(manzil, juft.access);
        await ulanishniSaqla(h.businessId, 'amocrm', {
          config: {
            subdomain: manzil.subdomain,
            baseDomain: manzil.baseDomain,
            address: `${manzil.subdomain}.${manzil.baseDomain}`,
            accountId: hisob.id,
            accountName: hisob.name,
            authType: 'oauth',
          },
          sir: JSON.stringify(juft),
          // OAuth tokeni o'zi yangilanadi — "muddat tugayapti" ogohlantirishi kerak emas
          tokenExpiresAt: null,
          hisob: { nom: hisob.name, url: hisobManzili(manzil) },
          sirKorinishi: 'OAuth',
        });
        req.log.info({ businessId: h.businessId, account: hisob.subdomain }, 'CRM: amoCRM OAuth bilan ulandi');
        return reply.redirect(qayt('ulandi=amocrm'));
      } catch (err) {
        req.log.warn({ err, businessId: h.businessId }, 'CRM: amoCRM OAuth ulanmadi');
        if (err instanceof AppError && err.status === 409) return reply.redirect(qayt('crm_xato=boshqa'));
        return reply.redirect(qayt('crm_xato=almashtirish'));
      }
    },
  );
}
