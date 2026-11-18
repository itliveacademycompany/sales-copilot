import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { kalitniAlmashtir, MAKE_SARLAVHA, MAKE_YOLI, makeHolati, makeniOchir, makeniSozla, makeQabul, makeYarat } from '../../crm/metaLeadAds/make.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { bajar, BASE } from '../crm-yordam.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FACEBOOK LEAD ADS — MAKE ORQALI (HTTP qatlami)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   GET    /businesses/:id/make-leads              holat (kalitsiz, faqat niqob)
 *   POST   /businesses/:id/make-leads              URL + API kaliti yaratish (kalit BIR MARTA qaytadi)
 *   POST   /businesses/:id/make-leads/rotate-key   kalitni almashtirish (eskisi darhol bekor)
 *   PATCH  /businesses/:id/make-leads              voronka
 *   DELETE /businesses/:id/make-leads              o'chirish (URL va kalit ishlamay qoladi)
 *
 *   POST   /api/v1/webhooks/crm/make/:id/leads     Make → DealMind (X-API-Key)
 *
 * Boshqaruv — faqat `integration:manage` (ega va rahbar).
 */

const MAKS_TANA = 64 * 1024;

export function registerMakeLeadsRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireBusiness, requirePermission('integration:manage')] };
  const sekin = { ...guard, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };
  const yol = `${BASE}/make-leads`;

  app.get(yol, guard, async (req) => makeHolati(req.business!.businessId));

  app.post(yol, sekin, async (req, reply) => {
    const r = await bajar(() => makeYarat(req.business!.businessId, req.auth!.user.id, req.ip));
    req.log.info({ businessId: req.business!.businessId }, 'make leads: qabul qilish URL’i yaratildi');
    // Kalit faqat shu javobda — keshlanmasin
    reply.header('cache-control', 'no-store');
    return { ...(await makeHolati(req.business!.businessId)), key: r.key };
  });

  app.post(`${yol}/rotate-key`, sekin, async (req, reply) => {
    const r = await bajar(() => kalitniAlmashtir(req.business!.businessId, req.auth!.user.id, req.ip));
    req.log.info({ businessId: req.business!.businessId }, 'make leads: API kaliti almashtirildi');
    reply.header('cache-control', 'no-store');
    return { ...(await makeHolati(req.business!.businessId)), key: r.key };
  });

  app.patch(yol, sekin, async (req) => {
    const { pipelineId } = z.object({ pipelineId: z.string().uuid().nullable() }).parse(req.body ?? {});
    await bajar(() => makeniSozla(req.business!.businessId, pipelineId));
    return makeHolati(req.business!.businessId);
  });

  app.delete(yol, guard, async (req) => {
    await makeniOchir(req.business!.businessId, req.auth!.user.id, req.ip);
    req.log.info({ businessId: req.business!.businessId }, 'make leads: integratsiya o‘chirildi');
    return { ok: true };
  });

  /**
   * Make → DealMind. Sessiyasiz; tenant — URL'dagi integratsiya + X-API-Key.
   * JSON'dan boshqa tur — 415, 64 KB dan katta — 413, buzilgan JSON — 400
   * (Fastify). Limit integratsiya bo'yicha: Make so'rovlari umumiy IP lardan
   * keladi, IP bo'yicha limit boshqa tashkilotlarni ham to'sib qo'yardi.
   */
  app.post(
    `${MAKE_YOLI}/:id/leads`,
    {
      bodyLimit: MAKS_TANA,
      config: {
        rateLimit: {
          max: 600,
          timeWindow: '1 minute',
          keyGenerator: (req) => `make:${(req.params as { id?: string }).id ?? req.ip}`,
        },
      },
    },
    async (req, reply) => {
      // Fastify text/plain'ni ham qabul qiladi — kontrakt faqat JSON
      if (!String(req.headers['content-type'] ?? '').toLowerCase().startsWith('application/json')) {
        return reply.status(415).send({ error: 'unsupported_media_type', message: 'Content-Type: application/json bo‘lishi kerak' });
      }
      const p = z.object({ id: z.string().uuid() }).safeParse(req.params);
      if (!p.success) return reply.status(401).send({ error: 'unauthorized', message: 'X-API-Key yaroqsiz yoki integratsiya o‘chirilgan' });
      try {
        const r = await makeQabul(p.data.id, req.headers[MAKE_SARLAVHA], req.body);
        if (r.kod === 401) req.log.warn({ intakeId: p.data.id }, 'make leads: ruxsatsiz so‘rov');
        else if (r.kod === 422) req.log.info({ intakeId: p.data.id, fields: r.javob.details.map((d) => d.field) }, 'make leads: noto‘g‘ri payload');
        else req.log.info({ intakeId: p.data.id, status: r.javob.status }, 'make leads: qabul qilindi');
        return reply.status(r.kod).send(r.javob);
      } catch (err) {
        // Lid saqlanmadi — 500: Make qayta urinsa, idempotentlik tufayli dubl bo'lmaydi
        req.log.error({ intakeId: p.data.id, err: (err as Error).message }, 'make leads: saqlashda xato');
        return reply.status(500).send({ error: 'server_error', message: "Lidni saqlab bo'lmadi — qayta urinib ko'ring" });
      }
    },
  );
}
