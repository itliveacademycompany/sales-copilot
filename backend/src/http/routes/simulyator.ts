import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { LlmSozlanmaganError } from '../../ai/llm.js';
import { withTenant } from '../../db/index.js';
import {
  aiHolati,
  baholash,
  boshlashKirish,
  fikrKirish,
  fikrniSaqla,
  javobBer,
  javobKirish,
  mashq,
  mashqniBoshla,
  mashqniTugat,
  qaytaBaholashga,
  ssenariyKirish,
  ssenariylar,
  ssenariyniOchir,
  ssenariyniYangila,
  ssenariyYarat,
  statistika,
} from '../../simulyator/xizmat.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { bajar, BASE, idParam } from '../crm-yordam.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMULYATOR — HTTP marshrutlari (`/simulyator`)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mashq qilish — biznesning har bir a'zosi. Ssenariy yaratish/tahrirlash —
 * `business:write` (rahbar). Mashqlar faqat egasiga ko'rinadi.
 */

export function registerSimulyatorRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireBusiness] };
  const sozlama = { preHandler: [requireBusiness, requirePermission('business:write')] };

  app.get(`${BASE}/simulyator`, guard, async (req) => {
    const { haftaDan } = z
      .object({ haftaDan: z.coerce.date().optional() })
      .parse(req.query);
    const dan = haftaDan ?? new Date(Date.now() - 7 * 86_400_000);
    const sozlaydi = req.business!.permissions.includes('business:write');
    const userId = req.auth!.user.id;
    const [malumot, ai] = await Promise.all([
      withTenant(req.business!.businessId, async (tx) => ({
        ssenariylar: await ssenariylar(tx, sozlaydi),
        ...(await statistika(tx, userId, dan)),
      })),
      aiHolati(),
    ]);
    return { ...malumot, ai, yarataOladi: sozlaydi };
  });

  // ─── Ssenariylar ───────────────────────────────────────────────────────────

  app.post(`${BASE}/simulyator/ssenariylar`, sozlama, async (req) => {
    const kirish = ssenariyKirish.parse(req.body);
    const businessId = req.business!.businessId;
    return withTenant(businessId, (tx) => ssenariyYarat(tx, { businessId, userId: req.auth!.user.id, kirish }));
  });

  app.patch(`${BASE}/simulyator/ssenariylar/:id`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    const kirish = ssenariyKirish.parse(req.body);
    return bajar(() => withTenant(req.business!.businessId, (tx) => ssenariyniYangila(tx, id, kirish)));
  });

  app.delete(`${BASE}/simulyator/ssenariylar/:id`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    return bajar(() => withTenant(req.business!.businessId, (tx) => ssenariyniOchir(tx, id)));
  });

  // ─── Mashqlar ──────────────────────────────────────────────────────────────

  app.post(`${BASE}/simulyator/mashqlar`, guard, async (req) => {
    const { ssenariy } = boshlashKirish.parse(req.body);
    const businessId = req.business!.businessId;
    const ai = await aiHolati();
    if (!ai.matn) {
      throw new AppError(503, 'ai-unavailable', 'AI provayder ulanmagan — administrator ulagach mashq qilish mumkin');
    }
    return bajar(() =>
      withTenant(businessId, (tx) => mashqniBoshla(tx, { businessId, userId: req.auth!.user.id, kalit: ssenariy })),
    );
  });

  app.get(`${BASE}/simulyator/mashqlar/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    return bajar(() => withTenant(req.business!.businessId, (tx) => mashq(tx, req.auth!.user.id, id)));
  });

  app.post(`${BASE}/simulyator/mashqlar/:id/javob`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const { matn } = javobKirish.parse(req.body);
    try {
      return await bajar(() => javobBer(req.business!.businessId, req.auth!.user.id, id, matn));
    } catch (e) {
      if (e instanceof LlmSozlanmaganError) {
        throw new AppError(503, 'ai-unavailable', 'AI provayder ulanmagan — administrator ulagach mashq qilish mumkin');
      }
      if (e instanceof AppError) throw e;
      req.log.warn({ err: e instanceof Error ? e.message : String(e) }, 'simulyator: mijoz javobi olinmadi');
      throw new AppError(502, 'ai-failed', 'Mijoz javob bera olmadi — gapingizni qayta yuboring');
    }
  });

  app.post(`${BASE}/simulyator/mashqlar/:id/tugat`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const { bekor } = z.object({ bekor: z.boolean().default(false) }).parse(req.body ?? {});
    const businessId = req.business!.businessId;
    const userId = req.auth!.user.id;
    const natija = await bajar(() => withTenant(businessId, (tx) => mashqniTugat(tx, { userId, id, bekor })));
    // Baholash fonda — natija ekrani holatni so'rab turadi (natijaHolat: kutilmoqda → tayyor)
    if (natija.baholash) {
      void baholash(businessId, userId, id).catch((err: unknown) =>
        req.log.error({ err: err instanceof Error ? err.message : String(err) }, 'simulyator: baholash yiqildi'),
      );
    }
    return natija.mashq;
  });

  app.post(`${BASE}/simulyator/mashqlar/:id/baholash`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const businessId = req.business!.businessId;
    const userId = req.auth!.user.id;
    const boshlandi = await bajar(() => withTenant(businessId, (tx) => qaytaBaholashga(tx, userId, id)));
    if (boshlandi) {
      void baholash(businessId, userId, id).catch((err: unknown) =>
        req.log.error({ err: err instanceof Error ? err.message : String(err) }, 'simulyator: qayta baholash yiqildi'),
      );
    }
    return bajar(() => withTenant(businessId, (tx) => mashq(tx, userId, id)));
  });

  app.post(`${BASE}/simulyator/mashqlar/:id/fikr`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const { fikr } = fikrKirish.parse(req.body);
    return bajar(() => withTenant(req.business!.businessId, (tx) => fikrniSaqla(tx, req.auth!.user.id, id, fikr)));
  });
}
