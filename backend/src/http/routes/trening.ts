import { eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { profileSchema, type BusinessProfile } from '../../business/profile.js';
import { withTenant } from '../../db/index.js';
import { business } from '../../db/schema/index.js';
import { createTrainingEngine } from '../../training/engine.js';
import type { TrainingContext, TrainingTx, WithTenant } from '../../training/ports.js';
import {
  registerTrainingRoutes,
  TrainingForbiddenError,
  type TrainingPermission,
} from '../../training/routes.js';
import { createScoringService } from '../../training/scoring/scoring.js';
import { createTrainerLlm, trainerNarx } from '../../trening/llm-adapter.js';
import { tayyorSsenariylarniQosh } from '../../trening/ssenariylar.js';
import { requireBusiness } from '../auth-plugin.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM → SIMULYATOR: AI MIJOZ TRENAJYORI (Mijoz-AI moduli)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Modul (`src/training/`) tashqi dunyoni faqat "chok"lar orqali ko'radi —
 * bu fayl ularni platformaga ulaydi:
 *   1. Kontekst — `requireBusiness` aniqlagan biznes, foydalanuvchi, o'rin;
 *   2. LLM — `trening/llm-adapter.ts` (Simulyator uchun alohida provayder);
 *   3. withTenant — platformaniki (RLS), o'zgarishsiz;
 *   4. Biznes profili — `business.profile` (onboardingda to'ldiriladi).
 *
 * Manzil: `/api/v1/businesses/:businessId/trening/*` — boshqa API'lar kabi
 * biznes yo'lda, boshqa tenant ma'lumoti hech qachon ko'rinmaydi (RLS +
 * modulning o'zi boshqa sessiyaga 404 beradi).
 *
 * Ruxsatlar (modul nomi → platforma ruxsati):
 *   - training:use              — CRM'dan foydalana oladigan har kim
 *                                 (rahbar yoki o'rni bor sotuvchi);
 *   - training:view:all         — analytics:read:all (rahbar);
 *   - training:scenario:manage  — business:write (ssenariy yaratish/tahrirlash).
 *
 * `allowDebug` O'CHIQ: holat sonlari va "blocker"lar mashqning javoblari —
 * prod'da ko'rsatilmaydi. Ovoz (STT/TTS) keyingi bosqichda ulanadi.
 */

const PREFIX = '/api/v1/businesses/:businessId/trening';

/** getContext → authorize: modul `authorize` ga faqat kontekst beradi, ruxsatlar shu yerda saqlanadi. */
const ruxsatlar = new WeakMap<TrainingContext, readonly string[]>();

function ruxsatBormi(granted: readonly string[], kerak: TrainingPermission, seatId: string | null): boolean {
  switch (kerak) {
    case 'training:use':
      return granted.includes('analytics:read:all') || granted.includes('task:read:all') || seatId !== null;
    case 'training:view:all':
      return granted.includes('analytics:read:all');
    case 'training:scenario:manage':
      return granted.includes('business:write');
  }
}

async function biznesProfili(businessId: string): Promise<BusinessProfile | null> {
  const [row] = await withTenant(businessId, (tx) =>
    tx.select({ profile: business.profile }).from(business).where(eq(business.id, businessId)).limit(1),
  );
  if (!row?.profile) return null;
  const p = profileSchema.safeParse(row.profile);
  if (!p.success) return null;
  // Bizning sxema bo'sh maydonlarni standart qiymat bilan to'ldiradi; modul esa
  // kamida tavsif va bitta xizmatni kutadi — bo'sh profilda AI mijoz nima
  // haqida gaplashishini bilmaydi. `null` → modul aniq "profile_missing" (409) beradi.
  if (!p.data.businessDescription.trim() || p.data.primaryOffers.length === 0) return null;
  return p.data;
}

export async function registerTreningRoutes(app: FastifyInstance): Promise<void> {
  // Platformaning withTenant tx turi modulning eng umumiy PgTransaction'iga to'g'ridan-to'g'ri mos emas
  // (INTEGRATION.md 4-bo'lim) — modul tx'dan faqat Drizzle query-builder'ini ishlatadi.
  const tenant = withTenant as unknown as WithTenant<TrainingTx>;
  const llm = createTrainerLlm();
  const logger = app.log;

  const engine = createTrainingEngine({
    withTenant: tenant,
    getBusinessProfile: biznesProfili,
    llm,
    priceCall: trainerNarx,
    logger,
  });
  const scoring = createScoringService({
    withTenant: tenant,
    llm,
    getBusinessProfile: biznesProfili,
    // Kompaniya playbook'i (vaznlar foizda, mezonlar qo'ng'iroq turlariga
    // bog'langan) modul shakliga hali o'girilmagan — standart trening
    // rubrikasi ishlatiladi (null).
    getPlaybook: async () => null,
    language: 'uz',
    priceCall: trainerNarx,
    logger,
  });

  await app.register(async (scope) => {
    scope.addHook('preHandler', requireBusiness);
    await registerTrainingRoutes(scope, {
      engine,
      scoring,
      withTenant: tenant,
      logger,
      getContext: async (req: FastifyRequest): Promise<TrainingContext> => {
        const b = req.business!;
        const ctx: TrainingContext = { businessId: b.businessId, userId: req.auth!.user.id, seatId: b.seatId };
        ruxsatlar.set(ctx, b.permissions);
        // Tayyor ssenariylar biznesga birinchi kirishda bir marta qo'shiladi
        await tayyorSsenariylarniQosh(b.businessId);
        return ctx;
      },
      authorize: (ctx, kerak) => {
        if (!ruxsatBormi(ruxsatlar.get(ctx) ?? [], kerak, ctx.seatId)) {
          throw new TrainingForbiddenError(kerak);
        }
      },
      config: {
        prefix: PREFIX,
        autoScoreOnEnd: true,
        allowDebug: false,
        // Platformaning umumiy limiti (300/daq) ham bor; bu — mashq uchun alohida.
        rateLimitPerMinute: 60,
      },
    });
  });
}
