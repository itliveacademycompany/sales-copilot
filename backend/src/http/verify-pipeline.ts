import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { LlmClient, LlmJsonRequest, LlmJsonResponse } from '../ai/llm.js';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import {
  alert,
  analysis,
  analysisJob,
  commitment,
  conversation,
  criterionScore,
  integration,
} from '../db/schema/index.js';
import { claimNextJob, completeJob, enqueueAnalysis } from '../jobs/queue.js';
import { sweepIdleSessions } from '../jobs/scheduler.js';
import { runWorkerTick } from '../jobs/worker.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI TAHLIL QUVURI TESTI — mock LLM bilan, haqiqiy API'siz
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:pipeline
 *
 * Tekshiradi: navbat (retry/DLQ), pre-filter, isbotni tekshirish (asosiy
 * va'da!), ishonch darvozasi, vaznli hisob, qayta tahlil, API.
 */

let pass = 0;
let fail = 0;

function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

/** Skriptlanadigan mock LLM: har bosqich uchun javob funksiyasi. */
class MockLlm implements LlmClient {
  calls: LlmJsonRequest[] = [];
  handler: (req: LlmJsonRequest) => unknown = () => {
    throw new Error('mock: javob belgilanmagan');
  };

  completeJson(req: LlmJsonRequest): Promise<LlmJsonResponse> {
    this.calls.push(req);
    const json = this.handler(req);
    return Promise.resolve({
      json,
      model: 'mock-model-1',
      tokensIn: 1000,
      tokensOut: 500,
      costUsd: 0.0175,
    });
  }
}

const stage2Ok = (over: Record<string, unknown> = {}) => ({
  businessRelevance: 'sales',
  callFamily: 'sales_lead',
  serviceLine: null,
  language: 'uz',
  client: { name: 'Aziz', company: null, role: null, isDecisionMaker: null },
  deal: { amount: 1200000, currency: 'UZS', stage: 'interested' },
  signals: { urgency: 'medium', budgetReaction: 'qimmat dedi', objections: ['narx'] },
  commitments: [
    {
      party: 'manager',
      description: 'Chegirma variantini yuborish',
      dueHint: 'bugun',
      dueIso: new Date(Date.now() + 6 * 3600 * 1000).toISOString(),
    },
  ],
  questionnaireAnswers: [],
  lastClientMessageNeedsReply: true,
  summary: 'Mijoz kurs narxi bilan qiziqdi, narxga e\'tiroz bildirdi.',
  confidence: 0.9,
  ...over,
});

const tag = Date.now().toString(36);

/** Telegram webhook update yordamchisi. */
function update(opts: {
  messageId: number;
  chatId: number;
  fromId: number;
  text: string;
  date: number;
}) {
  return {
    update_id: opts.messageId,
    message: {
      message_id: opts.messageId,
      from: { id: opts.fromId, is_bot: false, first_name: 'Test' },
      chat: { id: opts.chatId, type: 'private' as const },
      date: opts.date,
      text: opts.text,
    },
  };
}

async function main(): Promise<void> {
  const app: FastifyInstance = await buildApp();
  console.log('\nAI tahlil quvuri (mock LLM)\n');

  const now = Math.floor(Date.now() / 1000);
  const T0 = now - 3 * 3600; // 3 soat oldin — jimlik oynasi o'tgan

  try {
    // ═══ TAYYORGARLIK ═══
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `pipe-${tag}@test.local`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Owner',
        businessName: 'Pipeline Test',
      },
    });
    const regBody = reg.json() as { businesses: { businessId: string }[] };
    const cookie = reg.cookies.find((c) => c.name === 'sid')?.value ?? '';
    const businessId = regBody.businesses[0]!.businessId;
    const auth = { sid: cookie };
    const base = `/api/v1/businesses/${businessId}`;

    // Playbook: A (60%) — ehtiyoj aniqlash, B (40%) — yakunlash.
    const rubric = (s: string) => ({
      '0': `${s}: umuman qilinmadi`,
      '1': `${s}: juda yuzaki qilindi`,
      '2': `${s}: qisman yaxshi qilindi`,
      '3': `${s}: to'liq va sifatli qilindi`,
    });
    const pb = await app.inject({
      method: 'POST',
      url: `${base}/playbook`,
      cookies: auth,
      payload: {
        criteria: {
          categories: [
            { code: 'A', name: 'Ehtiyoj aniqlash', weightPct: 60, order: 0 },
            { code: 'B', name: 'Yakunlash', weightPct: 40, order: 1 },
          ],
          criteria: [
            {
              code: 'A1',
              categoryCode: 'A',
              name: 'Narx taqdimoti',
              description: 'Narxni qiymat bilan birga taqdim etish',
              rubric: rubric('Narx taqdimoti'),
            },
            {
              code: 'A2',
              categoryCode: 'A',
              name: 'Ehtiyoj savollari',
              description: 'Mijoz ehtiyojini ochuvchi savollar berildi',
              rubric: rubric('Ehtiyoj savollari'),
            },
            {
              code: 'B1',
              categoryCode: 'B',
              name: 'Keyingi qadam',
              description: 'Suhbat aniq keyingi qadam bilan yakunlandi',
              rubric: rubric('Keyingi qadam'),
            },
          ],
        },
        classificationPolicy: {
          callFamilies: [
            {
              key: 'sales_lead',
              name: 'Sotuv lidi',
              description: 'Xizmatga qiziqqan yangi mijoz',
              scored: true,
            },
            { key: 'spam', name: 'Spam', description: 'Reklama', scored: false },
          ],
          redFlags: [
            {
              key: 'rude',
              description: 'Menejer mijozga qo\'pol muomala qildi',
              severity: 'critical',
            },
          ],
          serviceLines: [],
        },
        questionnaire: {
          title: 'Anketa',
          questions: [
            { id: 'q_age', question: 'O\'quvchining yoshi nechada?', answerType: 'text', required: false },
          ],
        },
      },
    });
    check('playbook yaratildi va faollashtirildi', pb.statusCode === 201, `kod: ${pb.statusCode}`);

    // Telegram ulash + webhook siri.
    const connect = await app.inject({
      method: 'POST',
      url: `${base}/integrations/telegram`,
      cookies: auth,
      payload: { botToken: `${'1'.repeat(9)}:${'A'.repeat(35)}` },
    });
    const integrationId = (connect.json() as { integration: { id: string } }).integration.id;
    const [integRow] = await withoutTenantIsolation('test: webhook sirini o\'qish', (tx) =>
      tx
        .select({ secret: integration.webhookSecret })
        .from(integration)
        .where(eq(integration.id, integrationId)),
    );
    const webhookUrl = `/api/v1/webhooks/telegram/${integrationId}`;
    const secretHeader = { 'x-telegram-bot-api-secret-token': integRow!.secret! };

    // Sotuvchi + Telegram id biriktirish.
    const seatRes = await app.inject({
      method: 'POST',
      url: `${base}/seats`,
      cookies: auth,
      payload: { displayName: 'Menejer Malika' },
    });
    const seatId = (seatRes.json() as { id: string }).id;
    await app.inject({
      method: 'PATCH',
      url: `${base}/seats/${seatId}/telegram`,
      cookies: auth,
      payload: { telegramId: '777' },
    });

    const send = (messageId: number, chatId: number, fromId: number, text: string, date: number) =>
      app.inject({
        method: 'POST',
        url: webhookUrl,
        headers: secretHeader,
        payload: update({ messageId, chatId, fromId, text, date }),
      });

    // Oldingi test to'plamlari qoldirgan 'received' suhbatlar navbatga
    // tushib, bu testning ishlarini siljitib yuboradi. Avval navbatni
    // to'liq bo'shatamiz — test faqat o'z ma'lumotlari bilan ishlaydi.
    await sweepIdleSessions(0);
    for (;;) {
      const stale = await claimNextJob('drain');
      if (!stale) break;
      await completeJob(stale.id);
    }

    // ═══ A: TO'LIQ MUVAFFAQIYATLI TAHLIL ═══
    console.log('\n— A: to\'liq tahlil (isbot bilan) —');

    await send(1, 100, 999, 'Assalomu alaykum, kurslaringiz narxi qancha?', T0);
    await send(2, 100, 777, 'Assalomu alaykum! Frontend kursi oyiga 1.2 mln so\'m, unga mentor va portfolio kiradi', T0 + 300);
    await send(3, 100, 999, 'Qimmat ekan, chegirma bormi?', T0 + 600);
    await send(4, 100, 777, 'Bugun chegirma variantini hisoblab yuboraman, ertaga darsga taklif qilaman', T0 + 900);

    const swept = await sweepIdleSessions(0);
    check('scheduler jim sessiyani navbatga qo\'ydi', swept >= 1, `soni: ${swept}`);

    const mock = new MockLlm();
    mock.handler = (req) => {
      if (req.stage === 'stage2')
        return stage2Ok({
          // Haqiqiy savol (q_age) va playbook'da YO'Q soxta savol (bogus)
          // — kod faqat haqiqiysini saqlab, soxtasini tashlab yuborishi kerak.
          questionnaireAnswers: [
            { questionId: 'q_age', answer: '10 yosh' },
            { questionId: 'bogus_id', answer: 'bu saqlanmasligi kerak' },
          ],
        });
      return {
        scores: [
          {
            code: 'A1',
            score: 3,
            evidenceQuote: 'Frontend kursi oyiga 1.2 mln so\'m, unga mentor va portfolio kiradi',
            evidenceSegment: 1,
            reasoning: 'Narx qiymat bilan birga aytildi',
            confidence: 0.95,
          },
          {
            code: 'A2',
            score: null,
            evidenceQuote: null,
            evidenceSegment: null,
            reasoning: 'Ehtiyoj savollari kuzatilmadi',
            confidence: 0.8,
          },
          {
            code: 'B1',
            score: 2,
            evidenceQuote: 'ertaga darsga taklif qilaman',
            evidenceSegment: 3,
            reasoning: 'Keyingi qadam bor, lekin aniq vaqt kelishilmadi',
            confidence: 0.85,
          },
        ],
        primaryGap: 'Ehtiyoj savollari berilmadi',
        coaching: {
          strengths: ['Narx qiymat bilan taqdim etildi'],
          improvements: ['Avval ehtiyojni aniqlang'],
          betterPhrases: [
            { context: 'Narx so\'ralganda', suggestion: 'Qaysi yo\'nalish qiziqtiradi?' },
          ],
        },
        redFlags: [],
        leadQuality: 'warm',
        compliance: 'ok',
      };
    };

    const tickA = await runWorkerTick(mock);
    check('worker ishni oldi va bajardi', tickA.processed && tickA.outcome === 'done', JSON.stringify(tickA));
    check('LLM 2 marta chaqirildi (stage2 + stage3)', mock.calls.length === 2, `soni: ${mock.calls.length}`);
    check(
      'stage3 promptida [S..] belgili transkript bor',
      mock.calls[1]?.user.includes('[S1] MENEJER:') === true,
    );

    const convA = tickA.conversationId!;
    const [convARow] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(conversation).where(eq(conversation.id, convA)),
    );
    check('suhbat holati done', convARow?.status === 'done', convARow?.status);
    check('til aniqlandi (uz)', convARow?.language === 'uz');

    const [aRow] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(analysis).where(eq(analysis.conversationId, convA)),
    );
    check('analysis yozildi', !!aRow);
    // A: A1=3/3 → 1.0 (A2 null hisobga kirmaydi); B: 2/3. Umumiy:
    // (1.0*60 + 0.6667*40) / 100 = 86.7%
    check(
      'vaznli umumiy ball to\'g\'ri (86.7)',
      Math.abs(Number(aRow?.overallScore) - 86.7) < 0.05,
      `qiymat: ${aRow?.overallScore}`,
    );
    check('speaker usuli telegram_id (FR-84)', aRow?.speakerAttributionMethod === 'telegram_id');
    check('model versiyasi yozildi (FR-87)', (aRow?.modelVersions as { stage2?: string })?.stage2 === 'mock-model-1');
    check('xarajat yozildi (FR-89)', Number(aRow?.costUsd) > 0 && (aRow?.tokensIn ?? 0) > 0);
    check('sotuvchiga biriktirildi', aRow?.seatId === seatId);
    check('bayroq YO\'Q (hammasi isbotli)', aRow?.isFlagged === false);

    const metrics = (aRow?.dynamics as { replyMetrics?: { firstResponseSeconds: number; customerTurns: number } })
      ?.replyMetrics;
    check('javob tezligi: birinchi javob 300s (FR-45)', metrics?.firstResponseSeconds === 300, JSON.stringify(metrics));
    check('mijoz navbatlari 2 ta', metrics?.customerTurns === 2);

    const scoresA = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(criterionScore).where(eq(criterionScore.conversationId, convA)),
    );
    check('3 ta mezon bahosi yozildi', scoresA.length === 3, `soni: ${scoresA.length}`);
    const a1 = scoresA.find((s) => s.criterionCode === 'A1');
    check('A1=3 va isbot iqtibosi bor (FR-80)', a1?.score === 3 && !!a1.evidenceQuote);
    check('A1 isboti segmentga bog\'landi (FR-81)', a1?.evidenceSegmentId !== null);
    check(
      'A1 isbot vaqti to\'g\'ri (300s)',
      Math.abs(Number(a1?.evidenceStartSeconds) - 300) < 1,
      `qiymat: ${a1?.evidenceStartSeconds}`,
    );
    const a2 = scoresA.find((s) => s.criterionCode === 'A2');
    check('A2 "aniqlanmadi" (null) — jazosiz', a2?.score === null && a2.evidenceQuote === null);

    const commits = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(commitment).where(eq(commitment.conversationId, convA)),
    );
    check('va\'da yozildi (FR-127)', commits.length === 1 && commits[0]!.byParty === 'manager');

    const qa = aRow?.questionnaireAnswers as { question: string; answer: string | null }[] | null;
    check(
      'savolnoma javobi saqlandi, soxta ID tashlab yuborildi (FR-28)',
      Array.isArray(qa) &&
        qa.length === 1 &&
        qa[0]?.question === 'O\'quvchining yoshi nechada?' &&
        qa[0]?.answer === '10 yosh',
      JSON.stringify(qa),
    );

    // ═══ B: YOLG'ON ISBOT — BALL BEKOR ═══
    console.log('\n— B: o\'ylab topilgan iqtibos rad etiladi —');

    await send(10, 200, 999, 'Salom, IELTS kursi haqida ma\'lumot bering', T0);
    await send(11, 200, 777, 'IELTS kursi 8 hafta davom etadi, haftasiga 3 dars', T0 + 200);
    await sweepIdleSessions(0);

    mock.handler = (req) => {
      if (req.stage === 'stage2') return stage2Ok();
      return {
        scores: [
          {
            code: 'A1',
            score: 3,
            // Bu matn suhbatda YO'Q — model "gallyutsinatsiya" qildi.
            evidenceQuote: 'Kursimiz narxi juda hamyonbop va sifatli',
            evidenceSegment: 1,
            reasoning: 'to\'qima',
            confidence: 0.9,
          },
          {
            code: 'A2',
            score: 2,
            evidenceQuote: 'IELTS kursi 8 hafta davom etadi',
            evidenceSegment: 1,
            reasoning: 'haqiqiy',
            confidence: 0.9,
          },
          {
            code: 'B1',
            score: null,
            evidenceQuote: null,
            evidenceSegment: null,
            reasoning: 'yo\'q',
            confidence: 0.5,
          },
        ],
        primaryGap: null,
        coaching: { strengths: [], improvements: [], betterPhrases: [] },
        redFlags: [],
        leadQuality: null,
        compliance: 'ok',
      };
    };

    const tickB = await runWorkerTick(mock);
    const convB = tickB.conversationId!;
    const scoresB = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(criterionScore).where(eq(criterionScore.conversationId, convB)),
    );
    const b_a1 = scoresB.find((s) => s.criterionCode === 'A1');
    const b_a2 = scoresB.find((s) => s.criterionCode === 'A2');
    check('yolg\'on isbotli ball BEKOR qilindi (FR-82)', b_a1?.score === null && b_a1?.evidenceQuote === null);
    check('haqiqiy isbotli ball qoldi', b_a2?.score === 2);
    const [bAnalysis] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(analysis).where(eq(analysis.conversationId, convB)),
    );
    check('tahlil bayroqlandi (inson ko\'rigi)', bAnalysis?.isFlagged === true, bAnalysis?.flaggedReason ?? '');
    const [lowConfAlert] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx
        .select()
        .from(alert)
        .where(eq(alert.dedupeKey, `lowconf:${convB}`)),
    );
    check('low_confidence ogohlantirishi yaratildi (FR-83)', lowConfAlert?.kind === 'low_confidence');

    // ═══ C: PRE-FILTER — LLM'GA YETMAYDI ═══
    console.log('\n— C: pre-filter (LLM xarajatisiz) —');

    await send(20, 300, 999, '/start', T0);
    await sweepIdleSessions(0);
    const callsBefore = mock.calls.length;
    const tickC = await runWorkerTick(mock);
    check('pre-filter sessiyani chiqarib tashladi', tickC.outcome === 'filtered', tickC.outcome);
    check('LLM umuman chaqirilmadi', mock.calls.length === callsBefore, `farq: ${mock.calls.length - callsBefore}`);
    const [convCRow] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(conversation).where(eq(conversation.id, tickC.conversationId!)),
    );
    check('holat filtered + sabab yozildi', convCRow?.status === 'filtered' && !!convCRow.excludedReason);

    // ═══ D: RETRY VA DLQ ═══
    console.log('\n— D: retry + o\'lik xatlar (FR-90) —');

    await send(30, 400, 999, 'Kechirasiz, dastur haqida savol bersam maylimi?', T0);
    await send(31, 400, 777, 'Albatta, marhamat, savolingizni kutaman', T0 + 100);
    await sweepIdleSessions(0);

    const failing = new MockLlm();
    failing.handler = () => {
      throw new Error('LLM vaqtincha ishlamayapti (529)');
    };

    const d1 = await runWorkerTick(failing);
    check('1-urinish: retry', d1.outcome === 'retry', d1.outcome);

    // Kutish vaqtini testda kutmaymiz — run_after ni orqaga suramiz.
    const rewind = () =>
      withoutTenantIsolation('test: retry kutishini o\'tkazib yuborish', (tx) =>
        tx.execute(sql`update analysis_job set run_after = now() where status = 'queued'`),
      );
    await rewind();
    const d2 = await runWorkerTick(failing);
    check('2-urinish: retry', d2.outcome === 'retry', d2.outcome);
    await rewind();
    const d3 = await runWorkerTick(failing);
    check('3-urinish: DLQ (dead)', d3.outcome === 'dead', d3.outcome);

    const [deadJob] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(analysisJob).where(eq(analysisJob.conversationId, d3.conversationId!)),
    );
    check('ish dead holatda, xato saqlandi', deadJob?.status === 'dead' && !!deadJob.lastError);
    const [convDRow] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(conversation).where(eq(conversation.id, d3.conversationId!)),
    );
    check('suhbat failed holatda', convDRow?.status === 'failed', convDRow?.status);

    // ═══ E: ISHONCH DARVOZASI (FR-83) ═══
    console.log('\n— E: past ishonch — baholash o\'tkazib yuboriladi —');

    await send(40, 500, 999, 'hm', T0);
    await send(41, 500, 777, 'Assalomu alaykum! Sizga qanday yordam bera olaman?', T0 + 60);
    await sweepIdleSessions(0);

    mock.handler = (req) => {
      if (req.stage === 'stage2') return stage2Ok({ confidence: 0.2, callFamily: null });
      throw new Error('stage3 chaqirilmasligi kerak edi!');
    };
    const tickE = await runWorkerTick(mock);
    check('natija not_scored', tickE.outcome === 'not_scored', tickE.outcome);
    const [eAnalysis] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(analysis).where(eq(analysis.conversationId, tickE.conversationId!)),
    );
    check(
      'scoringMode skipped_low_confidence, ball yo\'q',
      eAnalysis?.scoringMode === 'skipped_low_confidence' && eAnalysis.overallScore === null,
    );
    check('past ishonch bayroqlandi', eAnalysis?.isFlagged === true);

    // ═══ F: QAYTA TAHLIL + QIZIL BAYROQ ═══
    console.log('\n— F: yangi xabar → qayta tahlil, qizil bayroq —');

    // A suhbatiga yangi xabar (24 soat ichida — o'sha sessiya).
    await send(5, 100, 999, 'Bilmadim, boshqa markazlar arzonroq deyishyapti', T0 + 7200);
    const [convAAfterMsg] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(conversation).where(eq(conversation.id, convA)),
    );
    check('yangi xabar holatni received ga qaytardi', convAAfterMsg?.status === 'received', convAAfterMsg?.status);

    const dup1 = await enqueueAnalysis(businessId, convA);
    const dup2 = await enqueueAnalysis(businessId, convA);
    check('takroriy navbatga qo\'yish bloklandi', dup1.queued && !dup2.queued);

    mock.handler = (req) => {
      if (req.stage === 'stage2') return stage2Ok({ summary: 'YANGILANGAN xulosa' });
      return {
        scores: [
          {
            code: 'A1',
            score: 1,
            evidenceQuote: 'chegirma variantini hisoblab yuboraman',
            evidenceSegment: 3,
            reasoning: 'qayta baho',
            confidence: 0.9,
          },
          { code: 'A2', score: null, evidenceQuote: null, evidenceSegment: null, reasoning: '-', confidence: 0.5 },
          { code: 'B1', score: null, evidenceQuote: null, evidenceSegment: null, reasoning: '-', confidence: 0.5 },
        ],
        primaryGap: 'Narx e\'tirozi qayta ishlanmadi',
        coaching: { strengths: [], improvements: ['E\'tirozni qadrlang'], betterPhrases: [] },
        redFlags: [
          // Haqiqiy iqtibos — mijozning so'nggi xabaridan.
          { key: 'rude', quote: 'boshqa markazlar arzonroq deyishyapti' },
          // Ro'yxatda yo'q kalit — e'tiborsiz qolishi kerak.
          { key: 'invented_flag', quote: 'chegirma variantini hisoblab yuboraman' },
        ],
        leadQuality: 'cooling',
        compliance: 'warning',
      };
    };
    const tickF = await runWorkerTick(mock);
    check('qayta tahlil bajarildi', tickF.outcome === 'done' && tickF.conversationId === convA, JSON.stringify(tickF));

    const analysesA = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(analysis).where(eq(analysis.conversationId, convA)),
    );
    check('analysis bitta (eskisi almashtirildi)', analysesA.length === 1);
    check('yangi xulosa yozildi', analysesA[0]?.summary === 'YANGILANGAN xulosa');

    const redFlagAlerts = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(alert).where(eq(alert.dedupeKey, `redflag:${convA}:rude`)),
    );
    check('qizil bayroq ogohlantirishi yaratildi (FR-131)', redFlagAlerts.length === 1);
    const inventedAlerts = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(alert).where(eq(alert.dedupeKey, `redflag:${convA}:invented_flag`)),
    );
    check('ro\'yxatda yo\'q bayroq e\'tiborsiz qoldi', inventedAlerts.length === 0);

    // ═══ G: JAVOBSIZ LID — SHOVQIN VA HAQIQIY SIGNAL ═══
    console.log('\n— G: javobsiz lid ogohlantirishi (FR-132) —');

    // G1: mijoz yakuniy tasdiq yozgan — ogohlantirish BO'LMASLIGI kerak.
    await send(50, 600, 999, 'Kursga yozilmoqchiman, qanday hujjat kerak?', T0);
    await send(51, 600, 777, 'Passport nusxasi yetarli, ertaga kutamiz', T0 + 120);
    await send(52, 600, 999, 'Rahmat, ertaga boraman', T0 + 200);
    await sweepIdleSessions(0);
    mock.handler = (req) =>
      req.stage === 'stage2'
        ? stage2Ok({ lastClientMessageNeedsReply: false, commitments: [] })
        : {
            scores: [
              { code: 'A1', score: 2, evidenceQuote: 'Passport nusxasi yetarli, ertaga kutamiz', evidenceSegment: 1, reasoning: '-', confidence: 0.9 },
              { code: 'A2', score: null, evidenceQuote: null, evidenceSegment: null, reasoning: '-', confidence: 0.5 },
              { code: 'B1', score: null, evidenceQuote: null, evidenceSegment: null, reasoning: '-', confidence: 0.5 },
            ],
            primaryGap: null,
            coaching: { strengths: [], improvements: [], betterPhrases: [] },
            redFlags: [],
            leadQuality: null,
            compliance: 'ok',
          };
    const tickG1 = await runWorkerTick(mock);
    const g1Alerts = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(alert).where(eq(alert.dedupeKey, `noreply:${tickG1.conversationId!}`)),
    );
    check('yakuniy tasdiq ("rahmat") ogohlantirish BERMAYDI', g1Alerts.length === 0);

    // G2: mijoz savol bergan — ogohlantirish BO'LISHI kerak.
    await send(60, 700, 999, 'Salom, dizayn kursi bormi?', T0);
    await send(61, 700, 777, 'Ha, bor. UX/UI yo\'nalishi', T0 + 120);
    await send(62, 700, 999, 'Narxi qancha va qachon boshlanadi?', T0 + 200);
    await sweepIdleSessions(0);
    mock.handler = (req) =>
      req.stage === 'stage2'
        ? stage2Ok({ lastClientMessageNeedsReply: true, commitments: [] })
        : {
            scores: [
              { code: 'A1', score: 1, evidenceQuote: 'Ha, bor. UX/UI yo\'nalishi', evidenceSegment: 1, reasoning: '-', confidence: 0.9 },
              { code: 'A2', score: null, evidenceQuote: null, evidenceSegment: null, reasoning: '-', confidence: 0.5 },
              { code: 'B1', score: null, evidenceQuote: null, evidenceSegment: null, reasoning: '-', confidence: 0.5 },
            ],
            primaryGap: null,
            coaching: { strengths: [], improvements: [], betterPhrases: [] },
            redFlags: [],
            leadQuality: null,
            compliance: 'ok',
          };
    const tickG2 = await runWorkerTick(mock);
    const g2Alerts = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(alert).where(eq(alert.dedupeKey, `noreply:${tickG2.conversationId!}`)),
    );
    check('javobsiz savol ogohlantirish BERADI', g2Alerts.length === 1 && g2Alerts[0]!.kind === 'missed_lead');

    /*
     * G3: «Ogohlantirishlar faqat ish vaqtida» sozlamasi.
     *
     * G2 bilan AYNAN bir xil holat takrorlanadi — farq faqat sozlamada.
     * Shu sababli natijadagi farqni boshqa hech narsa tushuntira olmaydi:
     * agar ogohlantirish yaratilmasa, uni to'sgan narsa aynan sozlama.
     *
     * Jadval T0 tushmaydigan hafta kuniga qo'yiladi — soat bilan
     * o'ynashdan ko'ra ishonchli, chunki test qaysi soatda ishga
     * tushishidan qat'i nazar ishlaydi.
     */
    const t0Kun = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Tashkent',
      weekday: 'short',
    }).format(new Date(T0 * 1000));
    const KUNLAR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const boshqaKun = ((KUNLAR.indexOf(t0Kun) + 1) % 7) + 1; // ISO 1..7

    const jadvalJavob = await app.inject({
      method: 'PUT',
      url: `${base}/work-hours`,
      cookies: auth,
      payload: { startHour: 0, endHour: 24, days: [boshqaKun], alertsOnlyWorkHours: true },
    });
    check('ish jadvali saqlandi', jadvalJavob.statusCode === 200);

    await send(70, 701, 998, 'Salom, marketing kursi bormi?', T0);
    await send(71, 701, 777, 'Ha, bor', T0 + 120);
    await send(72, 701, 998, 'Narxi qancha?', T0 + 200);
    await sweepIdleSessions(0);
    const tickG3 = await runWorkerTick(mock);
    const g3Alerts = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(alert).where(eq(alert.dedupeKey, `noreply:${tickG3.conversationId!}`)),
    );
    check(
      'ish vaqtidan tashqari — ogohlantirish YARATILMAYDI',
      g3Alerts.length === 0,
      `topildi: ${g3Alerts.length}`,
    );

    // Sozlamani qaytaramiz — keyingi tekshiruvlarga ta'sir qilmasin.
    await app.inject({
      method: 'PUT',
      url: `${base}/work-hours`,
      cookies: auth,
      payload: { startHour: 0, endHour: 24, days: [1, 2, 3, 4, 5, 6, 7], alertsOnlyWorkHours: false },
    });

    // ═══ H: API ═══
    console.log('\n— H: suhbatlar API —');

    const list = await app.inject({ method: 'GET', url: `${base}/conversations`, cookies: auth });
    const listBody = list.json() as { conversations: { id: string; overallScore: string | null }[] };
    check('ro\'yxat qaytdi', list.statusCode === 200 && listBody.conversations.length >= 7, `soni: ${listBody.conversations.length}`);
    const listA = listBody.conversations.find((c) => c.id === convA);
    check('ro\'yxatda umumiy ball ko\'rinadi', listA?.overallScore !== null && listA !== undefined);

    // Sahifalash: limit'dan ko'p suhbat bor (>=7), shuning uchun kichik
    // limit bilan so'ralsa nextCursor bo'lishi va u orqali qolganini
    // olib bo'lishi kerak — hech biri takrorlanmasdan, hech biri tushib
    // qolmasdan.
    const smallPage = await app.inject({
      method: 'GET',
      url: `${base}/conversations?limit=3`,
      cookies: auth,
    });
    const smallPageBody = smallPage.json() as {
      conversations: { id: string }[];
      nextCursor: string | null;
    };
    check(
      'kichik limit bilan aynan 3 ta va nextCursor bor',
      smallPageBody.conversations.length === 3 && smallPageBody.nextCursor !== null,
      JSON.stringify(smallPageBody.nextCursor),
    );
    const secondPage = await app.inject({
      method: 'GET',
      url: `${base}/conversations?limit=3&before=${encodeURIComponent(smallPageBody.nextCursor!)}`,
      cookies: auth,
    });
    const secondPageBody = secondPage.json() as { conversations: { id: string }[] };
    const firstIds = new Set(smallPageBody.conversations.map((c) => c.id));
    check(
      'ikkinchi sahifa birinchisi bilan TAKRORLANMAYDI',
      secondPageBody.conversations.length > 0 &&
        secondPageBody.conversations.every((c) => !firstIds.has(c.id)),
      JSON.stringify(secondPageBody.conversations.map((c) => c.id)),
    );

    // Sotuvchi filtri: faqat Malikaga (seatId) biriktirilgan suhbatlar.
    const bySeat = await app.inject({
      method: 'GET',
      url: `${base}/conversations?seatId=${seatId}`,
      cookies: auth,
    });
    const bySeatBody = bySeat.json() as { conversations: { id: string; seatId: string | null }[] };
    check(
      'seatId filtri faqat shu sotuvchining suhbatlarini qaytaradi',
      bySeatBody.conversations.length > 0 &&
        bySeatBody.conversations.every((c) => c.seatId === seatId),
      JSON.stringify(bySeatBody.conversations.map((c) => c.seatId)),
    );

    const detail = await app.inject({
      method: 'GET',
      url: `${base}/conversations/${convA}`,
      cookies: auth,
    });
    const detailBody = detail.json() as {
      segments: unknown[];
      scores: { criterionCode: string; evidenceQuote: string | null; evidenceSegmentId: string | null }[];
      analysis: { summary: string; questionnaireAnswers: { question: string; answer: string | null }[] | null };
      commitments: { byParty: string; what: string; status: string }[];
      contact: { id: string } | null;
      previousConversations: unknown[];
      categoryNames: Record<string, string>;
    };
    check('detal: transkript + tahlil + ballar', detail.statusCode === 200 && detailBody.segments.length === 5 && detailBody.scores.length === 3);
    const detailA1 = detailBody.scores.find((s) => s.criterionCode === 'A1');
    check('detalda isbot segmentga ishora qiladi', !!detailA1?.evidenceQuote && detailA1.evidenceSegmentId !== null);

    check(
      'kontakt Telegram chat orqali avtomatik bog\'landi',
      detailBody.contact !== null,
      JSON.stringify(detailBody.contact),
    );
    check(
      'kategoriya nomlari playbook versiyasidan olindi',
      detailBody.categoryNames.A === 'Ehtiyoj aniqlash' && detailBody.categoryNames.B === 'Yakunlash',
      JSON.stringify(detailBody.categoryNames),
    );
    // Eslatma: savolnoma javobini bu yerda emas, "A" bo'limida tekshirdik —
    // pastda convA yana bir bor QAYTA tahlil qilinadi (boshqa mock javobi
    // bilan), shuning uchun bu yergacha eski javob allaqachon almashtirilgan
    // bo'lardi — bu kutilgan xatti-harakat, xato emas.
    check(
      'kelishuv (commitment) detail javobida ko\'rinadi',
      detailBody.commitments.length === 1 && detailBody.commitments[0]?.byParty === 'manager',
      JSON.stringify(detailBody.commitments),
    );

    const reanalyze = await app.inject({
      method: 'POST',
      url: `${base}/conversations/${convA}/analyze`,
      cookies: auth,
    });
    check('qayta tahlil endpointi 202', reanalyze.statusCode === 202, `kod: ${reanalyze.statusCode}`);
    // Ishni darhol bajarib qo'yamiz — aks holda navbatda qolib, keyingi
    // bo'limdagi runWorkerTick chaqiruvini "o'g'irlab" ketadi (global FIFO).
    await runWorkerTick(mock);

    // ═══ I: bitta mijoz, ikkita sessiya — "oldingi suhbatlar" tarixi ═══
    console.log('\n— I: bitta kontakt, ikkita sessiya (FR-112 konteksti) —');

    const T_I1 = T0 - 2 * 24 * 3600; // ~2 kun oldin — birinchi, ancha eski sessiya
    await send(70, 800, 999, 'Salom, dizayn kursi bormi?', T_I1);
    await send(71, 800, 777, 'Ha, UX/UI yo\'nalishi bor', T_I1 + 100);
    await sweepIdleSessions(0);
    mock.handler = (req) =>
      req.stage === 'stage2' ? stage2Ok({ questionnaireAnswers: [] }) : { scores: [], primaryGap: null, coaching: { strengths: [], improvements: [], betterPhrases: [] }, redFlags: [], leadQuality: null, compliance: 'ok' };
    const tickI1 = await runWorkerTick(mock);
    const convI1 = tickI1.conversationId!;

    // 24 soatdan ko'p vaqt o'tgach xuddi shu chatId'dan yangi xabar —
    // yangi SESSIYA (conversation), lekin bir xil KONTAKT (chatId bir xil).
    await send(72, 800, 999, 'Narxi qancha?', T0);
    await send(73, 800, 777, 'Bir million so\'m', T0 + 100);
    await sweepIdleSessions(0);
    const tickI2 = await runWorkerTick(mock);
    const convI2 = tickI2.conversationId!;
    check('ikkinchi xabar YANGI suhbat yaratdi (24s dan o\'tgan)', convI2 !== convI1, `${convI1} vs ${convI2}`);

    const contactCount = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.execute(sql`select count(distinct id) as n from contact where business_id = ${businessId} and telegram_id = '800'`),
    );
    check(
      'ikkala sessiya BIR XIL kontaktga bog\'landi (dublikat yo\'q)',
      Number((contactCount[0] as { n: string }).n) === 1,
      JSON.stringify(contactCount[0]),
    );

    const detailI2 = await app.inject({
      method: 'GET',
      url: `${base}/conversations/${convI2}`,
      cookies: auth,
    });
    const detailI2Body = detailI2.json() as {
      previousConversations: { id: string }[];
    };
    check(
      'ikkinchi sessiya detalida BIRINCHISI "oldingi suhbat" sifatida ko\'rinadi',
      detailI2Body.previousConversations.length === 1 && detailI2Body.previousConversations[0]?.id === convI1,
      JSON.stringify(detailI2Body.previousConversations),
    );

    const noAuth = await app.inject({ method: 'GET', url: `${base}/conversations` });
    check('autentifikatsiyasiz 401', noAuth.statusCode === 401, `kod: ${noAuth.statusCode}`);

    // Begona biznes id — 404 (403 emas).
    const foreign = await app.inject({
      method: 'GET',
      url: '/api/v1/businesses/00000000-0000-0000-0000-000000000000/conversations',
      cookies: auth,
    });
    check('begona biznes 404', foreign.statusCode === 404, `kod: ${foreign.statusCode}`);
  } finally {
    await app.close();
    await cleanupTestDataQuietly(`%${tag}@test.local`);
    await closeDb();
  }

  console.log(`\n${fail === 0 ? 'AI quvuri butun.' : 'XATOLAR BOR.'} ${pass}/${pass + fail} tekshiruv o'tdi.`);
  if (fail > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
