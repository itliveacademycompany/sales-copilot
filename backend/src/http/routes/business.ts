import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { profileCompleteness, profileSchema } from '../../business/profile.js';
import { withTenant } from '../../db/index.js';
import { business } from '../../db/schema/index.js';
import { namunalarniYuklash } from '../../onboarding/samples.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/** FR-10/17: onboarding sehrgari qadamlari, tartib bilan. */
const ONBOARDING_STEPS = ['profile', 'playbook', 'channel', 'team', 'done'] as const;

const patchBusiness = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  timezone: z.string().trim().max(60).optional(),
  currency: z.string().trim().max(10).optional(),
  locale: z.enum(['uz', 'uz-Cyrl', 'ru', 'en']).optional(),
  /** FR-17: onboarding'ni yarimdan davom ettirish uchun holat saqlanadi. */
  onboardingStep: z.enum(ONBOARDING_STEPS).optional(),
});

export function registerBusinessRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/businesses/:businessId',
    { preHandler: [requireBusiness, requirePermission('business:read')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx.select().from(business).where(eq(business.id, businessId)).limit(1),
      );
      if (!row) throw AppError.notFound();
      return row;
    },
  );

  app.patch(
    '/api/v1/businesses/:businessId',
    { preHandler: [requireBusiness, requirePermission('business:write')] },
    async (req) => {
      const patch = patchBusiness.parse(req.body);
      if (Object.keys(patch).length === 0) {
        throw AppError.badRequest('O\'zgartirish uchun maydon berilmagan');
      }

      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx
          .update(business)
          .set({
            ...patch,
            ...(patch.onboardingStep === 'done' ? { onboardingCompletedAt: new Date() } : {}),
            updatedAt: new Date(),
          })
          .where(eq(business.id, businessId))
          .returning(),
      );
      return row;
    },
  );

  app.get(
    '/api/v1/businesses/:businessId/profile',
    { preHandler: [requireBusiness, requirePermission('business:read')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select({ profile: business.profile })
          .from(business)
          .where(eq(business.id, businessId))
          .limit(1),
      );

      // Bo'sh yoki qisman to'ldirilgan profil ham sxema orqali o'tkaziladi,
      // shunda frontend har doim bir xil shaklni oladi.
      const profile = profileSchema.parse(row?.profile ?? {});
      return { profile, completeness: profileCompleteness(profile) };
    },
  );

  app.put(
    '/api/v1/businesses/:businessId/profile',
    { preHandler: [requireBusiness, requirePermission('business:write')] },
    async (req) => {
      const profile = profileSchema.parse(req.body);
      const businessId = req.business!.businessId;

      await withTenant(businessId, (tx) =>
        tx
          .update(business)
          .set({ profile, updatedAt: new Date() })
          .where(eq(business.id, businessId)),
      );

      return { profile, completeness: profileCompleteness(profile) };
    },
  );

  /**
   * FR-16 (P0) — namunaviy suhbatlarni yuklab, darhol natijani ko'rish.
   *
   * Namunalar mijozning O'Z playbook'i bo'yicha haqiqiy quvurdan o'tadi:
   * oldindan yozilgan soxta baho emas. Shuning uchun mijoz ko'rgan natija
   * uning sozlamalarini haqiqatan aks ettiradi.
   */
  app.post(
    '/api/v1/businesses/:businessId/onboarding/samples',
    { preHandler: [requireBusiness, requirePermission('business:write')] },
    async (req, reply) => {
      const businessId = req.business!.businessId;
      const natija = await namunalarniYuklash(businessId);
      reply.status(202);
      return natija;
    },
  );
}
