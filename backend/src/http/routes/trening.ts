import { and, eq } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { getSimulyatorGeminiKaliti } from '../../ai/llm.js';
import { profileSchema, type BusinessProfile } from '../../business/profile.js';
import { gigaamJonliniIsit, gigaamJonliTayyormi } from '../../calls/gigaam-xizmat.js';
import { withTenant } from '../../db/index.js';
import { business, trainingSession } from '../../db/schema/index.js';
import { createTrainingEngine } from '../../training/engine.js';
import type { TrainingContext, TrainingTx, WithTenant } from '../../training/ports.js';
import {
  registerTrainingRoutes,
  TrainingForbiddenError,
  type TrainingPermission,
} from '../../training/routes.js';
import { createScoringService } from '../../training/scoring/scoring.js';
import { createVoiceService } from '../../training/voice/voice-turn.js';
import { createGeminiTts, DEFAULT_GEMINI_TTS_MODEL } from '../../trening/gemini-tts.js';
import { createTrainerLlm, trainerNarx } from '../../trening/llm-adapter.js';
import { tayyorSsenariylarniQosh } from '../../trening/ssenariylar.js';
import { createGigaamStt } from '../../trening/stt-gigaam.js';
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
 * prod'da ko'rsatilmaydi.
 *
 * OVOZ (push-to-talk): STT — serverdagi GigaAM (alohida jonli jarayon,
 * pulsiz, audio tashqariga chiqmaydi); TTS — Google Gemini (Admin → AI
 * provayderlar'dagi Gemini kaliti). Kalit bo'lmasa `ovoz-holati` "yo'q"
 * qaytaradi va UI ovoz panelini yoqmaydi — matnli mashq ishlayveradi.
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

  const voice = createVoiceService({
    engine,
    withTenant: tenant,
    stt: createGigaamStt(),
    tts: createGeminiTts({
      kalit: getSimulyatorGeminiKaliti,
      log: (line) => logger.warn(line),
      onSynth: (e) =>
        logger[e.ok ? 'info' : 'warn'](
          { tts: { ...e, costUsd: Number(e.costUsd.toFixed(6)) } },
          e.ok ? 'simulyator: TTS' : 'simulyator: TTS xatosi',
        ),
    }),
    models: { stt: 'gigaam', tts: DEFAULT_GEMINI_TTS_MODEL },
    getBusinessProfile: biznesProfili,
    // GigaAM serverda — pulsiz. Gemini TTS audio tokenlar bilan hisoblanadi
    // ($9/1M, 1 s ≈ 25 token); o'zbekcha nutqda ~15 belgi/s → ~$15 / 1M belgi (taxminiy).
    cost: { sttPerMinuteUsd: 0, ttsPerMillionCharsUsd: 15 },
    logger,
    streamTts: true,
  });

  /** Ovoz ishlaydimi: hozircha shart — Gemini kaliti bor (STT serverda doim bor). */
  async function ovozTayyormi(): Promise<boolean> {
    try {
      return (await getSimulyatorGeminiKaliti()) !== null;
    } catch (err) {
      logger.warn({ err }, "simulyator: Gemini kalitini o'qib bo'lmadi");
      return false;
    }
  }

  await app.register(async (scope) => {
    scope.addHook('preHandler', requireBusiness);

    // Sessiya ochilganda (yangi yoki mavjud) STT modeli oldindan yuklanadi —
    // birinchi gapda 15-30 s model yuklanishini kutmaslik uchun. Jarayon
    // allaqachon tirik bo'lsa hech narsa qilmaydi; 10 daqiqa ishlatilmasa o'zi to'xtaydi.
    scope.addHook('onResponse', async (req, reply) => {
      if (reply.statusCode >= 400) return;
      const url = req.routeOptions.url ?? '';
      const sessiya =
        (req.method === 'POST' && url === `${PREFIX}/sessions`) ||
        (req.method === 'GET' && url === `${PREFIX}/sessions/:id`);
      if (sessiya && (await ovozTayyormi())) gigaamJonliniIsit();
    });

    // "Boshlashdan oldin" oynasi ochilganda — nutqni tanish modeli oldindan yuklanadi.
    // Qo'ng'iroq ekrani gudok paytida shu yerga qayta-qayta murojaat qiladi va
    // `tayyor` bo'lguncha kutadi — birinchi gap model yuklanishini kutib qolmaydi.
    scope.post(`${PREFIX}/ovoz-isit`, async () => {
      if (!(await ovozTayyormi())) return { tayyor: false, ovoz: false };
      gigaamJonliniIsit();
      return { tayyor: gigaamJonliTayyormi(), ovoz: true };
    });

    // Mashqdan keyingi fikr: faqat o'z sessiyasiga (boshqasiga 404).
    const fikrBody = z.object({ realism: z.enum(['ha', 'qisman', 'yoq']) });
    scope.post(`${PREFIX}/sessions/:id/fikr`, async (req, reply) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
      const body = fikrBody.parse(req.body);
      const b = req.business!;
      const yangilandi = await withTenant(b.businessId, (tx) =>
        tx
          .update(trainingSession)
          .set({ sellerFeedback: { realism: body.realism, at: new Date().toISOString() } })
          .where(
            and(
              eq(trainingSession.id, id),
              eq(trainingSession.businessId, b.businessId),
              eq(trainingSession.userId, req.auth!.user.id),
            ),
          )
          .returning({ id: trainingSession.id }),
      );
      if (yangilandi.length === 0) return reply.code(404).send({ error: 'session_not_found' });
      return reply.code(204).send();
    });

    scope.get(`${PREFIX}/ovoz-holati`, async () => {
      const tayyor = await ovozTayyormi();
      return tayyor
        ? { enabled: true }
        : { enabled: false, sabab: "Ovozli mashq uchun Admin → AI provayderlar'da Google Gemini kaliti qo'shilmagan" };
    });

    await registerTrainingRoutes(scope, {
      engine,
      scoring,
      withTenant: tenant,
      logger,
      voice,
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
