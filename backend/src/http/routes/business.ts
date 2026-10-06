import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { profileCompleteness, profileSchema } from '../../business/profile.js';
import { alertPrefsSchema, workHoursSchema } from '../../business/settings.js';
import { withTenant } from '../../db/index.js';
import { business } from '../../db/schema/index.js';
import { namunalarniYuklash } from '../../onboarding/samples.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/** FR-10/17: onboarding sehrgari qadamlari, tartib bilan. */
const ONBOARDING_STEPS = ['profile', 'playbook', 'channel', 'team', 'done'] as const;


/**
 * Vaqt zonasi haqiqiy IANA nomi ekanligini tekshiradi.
 *
 * Ilgari bu maydon oddiy matn edi. Noto'g'ri qiymat kiritilsa, uni
 * o'qiydigan har bir joy (`Intl.DateTimeFormat`) XATO TASHLARDI — ya'ni
 * bitta terish xatosi tahlil quvurini yiqitishi mumkin edi. Xatoni
 * kiritish paytida ushlash arzonroq.
 */
const zonaTogri = (z_: string): boolean => {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: z_ });
    return true;
  } catch {
    return false;
  }
};

const patchBusiness = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  logoUrl: z.string().url().max(500).nullable().optional(),
  timezone: z
    .string()
    .trim()
    .max(60)
    .refine(zonaTogri, { message: 'Noma\'lum vaqt zonasi' })
    .optional(),
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

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * ISH JADVALI — hisobotlar "ish vaqtida" degan savolga shundan javob beradi
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Bu shunchaki ma'lumot emas: "javobsiz qolgan suhbat ish vaqtida
   * bo'lganmi" degan ko'rsatkich aynan shu sozlamadan hisoblanadi.
   * Ilgari u kodda 9:00–18:00 deb qat'iy yozilgan edi — endi har biznes
   * o'z jadvalini qo'yadi va raqam haqiqatga mos bo'ladi.
   */
  app.get(
    '/api/v1/businesses/:businessId/work-hours',
    { preHandler: [requireBusiness, requirePermission('business:read')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select({ workHours: business.workHours, timezone: business.timezone })
          .from(business)
          .where(eq(business.id, businessId))
          .limit(1),
      );
      return {
        workHours: workHoursSchema.parse(row?.workHours ?? {}),
        timezone: row?.timezone ?? 'Asia/Tashkent',
      };
    },
  );

  app.put(
    '/api/v1/businesses/:businessId/work-hours',
    { preHandler: [requireBusiness, requirePermission('business:write')] },
    async (req) => {
      const workHours = workHoursSchema.parse(req.body);
      if (workHours.endHour <= workHours.startHour) {
        throw AppError.badRequest('Tugash soati boshlanishdan keyin bo\'lishi kerak');
      }
      if (workHours.days.length === 0) {
        throw AppError.badRequest('Kamida bitta ish kuni tanlang');
      }
      const businessId = req.business!.businessId;
      await withTenant(businessId, (tx) =>
        tx
          .update(business)
          .set({ workHours, updatedAt: new Date() })
          .where(eq(business.id, businessId)),
      );
      return { workHours };
    },
  );

  /** Ogohlantirish sozlamalari — qaysi hodisa ogohlantirish yaratsin. */
  app.get(
    '/api/v1/businesses/:businessId/alert-prefs',
    { preHandler: [requireBusiness, requirePermission('business:read')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select({ alertPrefs: business.alertPrefs })
          .from(business)
          .where(eq(business.id, businessId))
          .limit(1),
      );
      return { alertPrefs: alertPrefsSchema.parse(row?.alertPrefs ?? {}) };
    },
  );

  app.put(
    '/api/v1/businesses/:businessId/alert-prefs',
    { preHandler: [requireBusiness, requirePermission('business:write')] },
    async (req) => {
      const alertPrefs = alertPrefsSchema.parse(req.body);
      const businessId = req.business!.businessId;
      await withTenant(businessId, (tx) =>
        tx
          .update(business)
          .set({ alertPrefs, updatedAt: new Date() })
          .where(eq(business.id, businessId)),
      );
      return { alertPrefs };
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
