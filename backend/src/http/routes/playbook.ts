import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { generatePlaybookDraft } from '../../ai/playbook-builder.js';
import { getActiveLlm } from '../../ai/llm.js';
import { profileSchema } from '../../business/profile.js';
import { withTenant } from '../../db/index.js';
import { business, playbook } from '../../db/schema/index.js';
import {
  classificationPolicySchema,
  playbookBodySchema,
  promptNotesSchema,
  questionnaireSchema,
} from '../../playbook/schema.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

const versionParam = z.object({
  businessId: z.string().uuid(),
  version: z.coerce.number().int().positive(),
});

/** Ro'yxat uchun engil ko'rinish — og'ir jsonb maydonlarsiz. */
const summaryColumns = {
  id: playbook.id,
  version: playbook.version,
  isActive: playbook.isActive,
  origin: playbook.origin,
  changeNote: playbook.changeNote,
  createdBy: playbook.createdBy,
  createdAt: playbook.createdAt,
  activatedAt: playbook.activatedAt,
};

/**
 * Bazadagi qatorni API kontraktiga moslab to'ldiradi.
 *
 * `questionnaire`/`classificationPolicy`/`promptNotes` ichki maydonlari
 * ixtiyoriy (zod `.default()`) — ammo bu faqat SAQLASHDA (`POST /playbook`)
 * ta'minlanadi. Eski yozuvlar (masalan qo'lda/skript orqali kiritilgan,
 * to'liqsiz obyekt bilan) ushbu himoyasiz to'g'ridan-to'g'ri qaytarilsa,
 * frontend `promptNotes.stage1.vocabulary` kabi ichki maydonga murojaat
 * qilganda "undefined ustidan o'qish" bilan yiqiladi. Shu funksiya har
 * GET javobini qayta zod orqali o'tkazib, doim to'liq shaklni kafolatlaydi
 * — xuddi `business.ts` dagi profil bilan bir xil naqsh.
 */
function normalizePlaybookRow<T extends Record<string, unknown>>(row: T): T {
  return {
    ...row,
    questionnaire: questionnaireSchema.parse(row.questionnaire ?? {}),
    classificationPolicy: classificationPolicySchema.parse(row.classificationPolicy ?? {}),
    promptNotes: promptNotesSchema.parse(row.promptNotes ?? {}),
  };
}

export function registerPlaybookRoutes(app: FastifyInstance): void {
  /** Faol versiya. Hali yaratilmagan bo'lsa 404 — onboarding shuni tekshiradi. */
  app.get(
    '/api/v1/businesses/:businessId/playbook',
    { preHandler: [requireBusiness, requirePermission('playbook:read')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx.select().from(playbook).where(eq(playbook.isActive, true)).limit(1),
      );
      if (!row) throw AppError.notFound('Faol baholash mezoni topilmadi');
      return normalizePlaybookRow(row);
    },
  );

  /** Versiyalar tarixi (FR-23). */
  app.get(
    '/api/v1/businesses/:businessId/playbook/versions',
    { preHandler: [requireBusiness, requirePermission('playbook:read')] },
    async (req) => {
      const businessId = req.business!.businessId;
      return withTenant(businessId, (tx) =>
        tx.select(summaryColumns).from(playbook).orderBy(desc(playbook.version)),
      );
    },
  );

  app.get(
    '/api/v1/businesses/:businessId/playbook/versions/:version',
    { preHandler: [requireBusiness, requirePermission('playbook:read')] },
    async (req) => {
      const { version } = versionParam.parse(req.params);
      const businessId = req.business!.businessId;

      const [row] = await withTenant(businessId, (tx) =>
        tx.select().from(playbook).where(eq(playbook.version, version)).limit(1),
      );
      if (!row) throw AppError.notFound('Bunday versiya yo\'q');
      return normalizePlaybookRow(row);
    },
  );

  /**
   * Yangi versiya yaratish.
   *
   * Mavjud versiya **hech qachon o'zgartirilmaydi** (FR-22). Sabab:
   * `analysis` yozuvlari o'zi baholangan versiyaga bog'lanadi. Agar
   * versiyani joyida tahrirlasak, o'tgan oyning ballari bugungi mezon
   * bo'yicha izohlanadi — bu tarixni buzadi.
   */
  app.post(
    '/api/v1/businesses/:businessId/playbook',
    { preHandler: [requireBusiness, requirePermission('playbook:write')] },
    async (req, reply) => {
      const body = playbookBodySchema.parse(req.body);
      const businessId = req.business!.businessId;
      const userId = req.auth!.user.id;
      const activate = (req.query as { activate?: string }).activate !== 'false';

      const created = await withTenant(businessId, async (tx) => {
        // Biznes qatorini bloklaymiz — bir vaqtda ikkita saqlash bo'lsa,
        // ikkalasi ham bir xil versiya raqamini olishi mumkin edi.
        await tx
          .select({ id: business.id })
          .from(business)
          .where(eq(business.id, businessId))
          .for('update');

        const [last] = await tx
          .select({ max: sql<number | null>`max(${playbook.version})` })
          .from(playbook);

        const nextVersion = (last?.max ?? 0) + 1;

        if (activate) {
          await tx
            .update(playbook)
            .set({ isActive: false })
            .where(eq(playbook.isActive, true));
        }

        const [row] = await tx
          .insert(playbook)
          .values({
            businessId,
            version: nextVersion,
            isActive: activate,
            criteria: body.criteria,
            questionnaire: body.questionnaire,
            classificationPolicy: body.classificationPolicy,
            promptNotes: body.promptNotes,
            leadQuality: body.leadQuality,
            origin: 'manual',
            changeNote: body.changeNote ?? null,
            createdBy: userId,
            activatedAt: activate ? new Date() : null,
          })
          .returning(summaryColumns);

        return row;
      });

      reply.status(201);
      return created;
    },
  );

  /**
   * FR-12: AI Playbook Builder.
   *
   * Biznes anketasiga (yoki so'rov tanasida berilgan qoralama anketaga)
   * qarab to'liq playbook QORALAMASINI generatsiya qiladi va qaytaradi —
   * SAQLAMAYDI. Foydalanuvchi natijani ko'rib, tahrirlab, keyin oddiy
   * `POST /playbook` orqali saqlaydi. Shu tufayli generatsiya va saqlash
   * bir-biridan mustaqil: LLM xato natija bersa ham hech narsa buzilmaydi.
   */
  app.post(
    '/api/v1/businesses/:businessId/playbook/generate',
    { preHandler: [requireBusiness, requirePermission('playbook:write')] },
    async (req) => {
      const businessId = req.business!.businessId;

      // So'rovda anketa berilgan bo'lsa o'shani ishlatamiz (onboarding
      // paytida foydalanuvchi hali profilni saqlamagan bo'lishi mumkin);
      // aks holda bazadagi saqlangan profil olinadi.
      const bodyProfile = profileSchema.safeParse(req.body);
      const profile = bodyProfile.success
        ? bodyProfile.data
        : await withTenant(businessId, async (tx) => {
            const [row] = await tx
              .select({ profile: business.profile })
              .from(business)
              .where(eq(business.id, businessId))
              .limit(1);
            return profileSchema.parse(row?.profile ?? {});
          });

      if (!profile.businessDescription.trim() || profile.primaryOffers.length === 0) {
        throw AppError.badRequest(
          'Playbook generatsiya qilish uchun avval biznes tavsifi va mahsulotlar to\'ldirilishi kerak',
        );
      }

      const llm = await getActiveLlm();
      const draft = await generatePlaybookDraft(llm, profile);
      return { draft };
    },
  );

  /** Eski versiyaga qaytish (FR-23). */
  app.post(
    '/api/v1/businesses/:businessId/playbook/versions/:version/activate',
    { preHandler: [requireBusiness, requirePermission('playbook:write')] },
    async (req) => {
      const { version } = versionParam.parse(req.params);
      const businessId = req.business!.businessId;

      return withTenant(businessId, async (tx) => {
        const [target] = await tx
          .select({ id: playbook.id })
          .from(playbook)
          .where(eq(playbook.version, version))
          .limit(1);

        if (!target) throw AppError.notFound('Bunday versiya yo\'q');

        await tx
          .update(playbook)
          .set({ isActive: false })
          .where(eq(playbook.isActive, true));

        const [row] = await tx
          .update(playbook)
          .set({ isActive: true, activatedAt: new Date() })
          .where(eq(playbook.id, target.id))
          .returning(summaryColumns);

        return row;
      });
    },
  );

  /**
   * Validatsiya — saqlamasdan tekshirish.
   *
   * Muharrir har o'zgarishda shu endpointni chaqiradi va foydalanuvchi
   * "vaznlar yig'indisi 97%" kabi xatoni **saqlashdan oldin** ko'radi.
   */
  app.post(
    '/api/v1/businesses/:businessId/playbook/validate',
    { preHandler: [requireBusiness, requirePermission('playbook:read')] },
    async (req) => {
      const result = playbookBodySchema.safeParse(req.body);
      if (result.success) {
        const { categories, criteria } = result.data.criteria;
        return {
          valid: true,
          summary: {
            categories: categories.length,
            criteria: criteria.length,
            activeCriteria: criteria.filter((c) => c.isActive).length,
            totalWeight: categories.reduce((s, c) => s + c.weightPct, 0),
          },
        };
      }

      const errors: Record<string, string[]> = {};
      for (const issue of result.error.issues) {
        const key = issue.path.join('.') || '_';
        (errors[key] ??= []).push(issue.message);
      }
      return { valid: false, errors };
    },
  );
}
