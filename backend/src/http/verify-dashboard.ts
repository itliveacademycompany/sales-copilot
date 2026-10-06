import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { LlmClient, LlmJsonRequest, LlmJsonResponse } from '../ai/llm.js';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { alert, commitment, integration, task } from '../db/schema/index.js';
import { markOverdueCommitments } from '../jobs/maintenance.js';
import { claimNextJob, completeJob } from '../jobs/queue.js';
import { sweepIdleSessions } from '../jobs/scheduler.js';
import { runWorkerTick } from '../jobs/worker.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DASHBOARD + VAZIFALAR + OGOHLANTIRISHLAR TESTI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:dashboard
 *
 * 3 ta suhbat (2 sotuvchi, har xil ball va sana) mock LLM bilan tahlil
 * qilinadi, keyin agregatlar tekshiriladi: KPI, reyting, mezonlar,
 * trend, vazifalar oqimi, ogohlantirishlar.
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

class MockLlm implements LlmClient {
  handler: (req: LlmJsonRequest) => unknown = () => {
    throw new Error('mock: javob belgilanmagan');
  };
  completeJson(req: LlmJsonRequest): Promise<LlmJsonResponse> {
    return Promise.resolve({
      json: this.handler(req),
      model: 'mock-model-1',
      tokensIn: 1000,
      tokensOut: 500,
      costUsd: 0.02,
    });
  }
}

interface ScoreSpec {
  code: string;
  score: number | null;
  quote: string | null;
  seg: number | null;
}

function stage2(commitments: unknown[] = [], lastClientMessageNeedsReply: boolean | null = true) {
  return {
    lastClientMessageNeedsReply,
    businessRelevance: 'sales',
    callFamily: 'sales_lead',
    serviceLine: null,
    language: 'uz',
    client: { name: null, company: null, role: null, isDecisionMaker: null },
    deal: { amount: null, currency: null, stage: null },
    signals: { urgency: null, budgetReaction: null, objections: [] },
    commitments,
    questionnaireAnswers: [],
    summary: 'Test xulosa',
    confidence: 0.9,
  };
}

function stage3(scores: ScoreSpec[]) {
  return {
    scores: scores.map((s) => ({
      code: s.code,
      score: s.score,
      evidenceQuote: s.quote,
      evidenceSegment: s.seg,
      reasoning: 'test',
      confidence: 0.9,
    })),
    primaryGap: null,
    coaching: { strengths: [], improvements: [], betterPhrases: [] },
    redFlags: [],
    leadQuality: null,
    compliance: 'ok',
  };
}

const tag = Date.now().toString(36);

function update(opts: { messageId: number; chatId: number; fromId: number; text: string; date: number }) {
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
  console.log('\nDashboard, vazifalar va ogohlantirishlar\n');

  const nowSec = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  try {
    // ═══ TAYYORGARLIK ═══
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `dash-${tag}@test.local`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Owner',
        businessName: 'Dashboard Test',
      },
    });
    const regBody = reg.json() as { businesses: { businessId: string }[] };
    const cookie = reg.cookies.find((c) => c.name === 'sid')?.value ?? '';
    const businessId = regBody.businesses[0]!.businessId;
    const auth = { sid: cookie };
    const base = `/api/v1/businesses/${businessId}`;

    const rubric = (s: string) => ({
      '0': `${s}: umuman qilinmadi`,
      '1': `${s}: juda yuzaki qilindi`,
      '2': `${s}: qisman yaxshi qilindi`,
      '3': `${s}: to'liq va sifatli qilindi`,
    });
    await app.inject({
      method: 'POST',
      url: `${base}/playbook`,
      cookies: auth,
      payload: {
        criteria: {
          categories: [
            { code: 'A', name: 'Ehtiyoj', weightPct: 60, order: 0 },
            { code: 'B', name: 'Yakunlash', weightPct: 40, order: 1 },
          ],
          criteria: [
            { code: 'A1', categoryCode: 'A', name: 'Narx taqdimoti', description: 'Narx qiymat bilan taqdim etiladi', rubric: rubric('Narx') },
            { code: 'A2', categoryCode: 'A', name: 'Ehtiyoj savollari', description: 'Ehtiyoj ochuvchi savollar beriladi', rubric: rubric('Savollar') },
            { code: 'B1', categoryCode: 'B', name: 'Keyingi qadam', description: 'Aniq keyingi qadam belgilanadi', rubric: rubric('Qadam') },
          ],
        },
        classificationPolicy: {
          callFamilies: [
            { key: 'sales_lead', name: 'Sotuv lidi', description: 'Yangi mijoz', scored: true },
          ],
          redFlags: [],
          serviceLines: [],
        },
      },
    });

    const connect = await app.inject({
      method: 'POST',
      url: `${base}/integrations/telegram`,
      cookies: auth,
      payload: { botToken: `${'1'.repeat(9)}:${'A'.repeat(35)}` },
    });
    const integrationId = (connect.json() as { integration: { id: string } }).integration.id;
    const [integRow] = await withoutTenantIsolation('test: webhook sirini o\'qish', (tx) =>
      tx.select({ secret: integration.webhookSecret }).from(integration).where(eq(integration.id, integrationId)),
    );
    const webhookUrl = `/api/v1/webhooks/telegram/${integrationId}`;
    const secretHeader = { 'x-telegram-bot-api-secret-token': integRow!.secret! };

    const mkSeat = async (name: string, tgId: string): Promise<string> => {
      const res = await app.inject({
        method: 'POST',
        url: `${base}/seats`,
        cookies: auth,
        payload: { displayName: name },
      });
      const id = (res.json() as { id: string }).id;
      await app.inject({
        method: 'PATCH',
        url: `${base}/seats/${id}/telegram`,
        cookies: auth,
        payload: { telegramId: tgId },
      });
      return id;
    };
    const malika = await mkSeat('Malika', '777');
    const sardor = await mkSeat('Sardor', '888');

    const send = (messageId: number, chatId: number, fromId: number, text: string, date: number) =>
      app.inject({
        method: 'POST',
        url: webhookUrl,
        headers: secretHeader,
        payload: update({ messageId, chatId, fromId, text, date }),
      });

    // Oldingi to'plamlardan qolgan navbatni bo'shatish.
    await sweepIdleSessions(0);
    for (;;) {
      const stale = await claimNextJob('drain');
      if (!stale) break;
      await completeJob(stale.id);
    }

    const mock = new MockLlm();

    // ═══ SUHBAT 1: Malika, 2 kun oldin, kuchli (100) + muddati o'tgan va'da ═══
    const T1 = nowSec - 2 * DAY;
    await send(1, 100, 999, 'Assalomu alaykum, ingliz tili kursi narxi qancha turadi?', T1);
    await send(2, 100, 777, 'Kurs oyiga bir million so\'m, unga mentor va materiallar kiradi', T1 + 300);
    await send(3, 100, 999, 'Yaxshi ekan, qachondan boshlasam bo\'ladi?', T1 + 600);
    await send(4, 100, 777, 'Ertaga soat o\'nda sinov darsiga yozib qo\'yaman, manzilni yuboraman', T1 + 900);
    await sweepIdleSessions(0);
    mock.handler = (req) =>
      req.stage === 'stage2'
        ? stage2([
            {
              party: 'manager',
              description: 'Sinov darsiga yozish va manzil yuborish',
              dueHint: 'ertaga',
              // Muddat allaqachon o'tgan — overdue oqimini tekshirish uchun.
              dueIso: new Date(Date.now() - 3600 * 1000).toISOString(),
            },
          ])
        : stage3([
            { code: 'A1', score: 3, quote: 'Kurs oyiga bir million so\'m, unga mentor va materiallar kiradi', seg: 1 },
            { code: 'A2', score: null, quote: null, seg: null },
            { code: 'B1', score: 3, quote: 'Ertaga soat o\'nda sinov darsiga yozib qo\'yaman', seg: 3 },
          ]);
    const t1 = await runWorkerTick(mock);
    check('suhbat 1 tahlil qilindi (100 ball)', t1.outcome === 'done', JSON.stringify(t1));
    const conv1 = t1.conversationId!;

    // ═══ SUHBAT 2: Sardor, 1 kun oldin, kuchsiz (20) + javobsiz mijoz ═══
    const T2 = nowSec - 1 * DAY;
    await send(10, 200, 555, 'Salom, IELTS tayyorlov guruhingiz bormi?', T2);
    await send(11, 200, 888, 'Bor, narxi bir yarim million so\'m bo\'ladi', T2 + 600);
    await send(12, 200, 555, 'Jadval qanday, qachon boshlanadi guruh?', T2 + 900);
    await sweepIdleSessions(0);
    mock.handler = (req) =>
      req.stage === 'stage2'
        ? stage2()
        : stage3([
            { code: 'A1', score: 1, quote: 'Bor, narxi bir yarim million so\'m bo\'ladi', seg: 1 },
            { code: 'A2', score: null, quote: null, seg: null },
            { code: 'B1', score: 0, quote: 'Bor, narxi bir yarim million so\'m bo\'ladi', seg: 1 },
          ]);
    const t2 = await runWorkerTick(mock);
    check('suhbat 2 tahlil qilindi (20 ball)', t2.outcome === 'done', JSON.stringify(t2));
    const conv2 = t2.conversationId!;

    // ═══ SUHBAT 3: Malika, 2 soat oldin, o'rtacha (66.7) ═══
    const T3 = nowSec - 2 * 3600;
    await send(20, 300, 444, 'Bolam uchun matematika kursi qidiryapman, narxlari qanaqa?', T3);
    await send(21, 300, 777, 'Matematika kursi sakkiz yuz ming so\'m, keling bir sinov darsida ko\'ring', T3 + 900);
    await sweepIdleSessions(0);
    mock.handler = (req) =>
      req.stage === 'stage2'
        ? stage2()
        : stage3([
            { code: 'A1', score: 2, quote: 'Matematika kursi sakkiz yuz ming so\'m', seg: 1 },
            { code: 'A2', score: null, quote: null, seg: null },
            { code: 'B1', score: 2, quote: 'keling bir sinov darsida ko\'ring', seg: 1 },
          ]);
    const t3 = await runWorkerTick(mock);
    check('suhbat 3 tahlil qilindi (66.7 ball)', t3.outcome === 'done', JSON.stringify(t3));

    // ═══ VAZIFALAR (FR-127/128/129) ═══
    console.log('\n— Vazifalar —');

    const autoTasks = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(task).where(eq(task.conversationId, conv1)),
    );
    check('AI va\'dadan vazifa yaratdi (FR-127)', autoTasks.length === 1, `soni: ${autoTasks.length}`);
    check(
      'vazifa sotuvchiga va va\'daga bog\'landi',
      autoTasks[0]?.seatId === malika && autoTasks[0]?.commitmentId !== null,
    );
    check('vazifa muddati o\'rnatildi (dueIso)', autoTasks[0]?.dueAt !== null);
    check('manba playbook_analysis (FR-129c)', autoTasks[0]?.source === 'playbook_analysis');

    const taskList = await app.inject({ method: 'GET', url: `${base}/tasks`, cookies: auth });
    const taskListBody = taskList.json() as { tasks: { id: string; isOverdue: boolean; source: string }[] };
    check('vazifalar ro\'yxati qaytdi', taskList.statusCode === 200 && taskListBody.tasks.length === 1);
    check('kechikkan belgisi hisoblandi (FR-129)', taskListBody.tasks[0]?.isOverdue === true);

    const overdueList = await app.inject({
      method: 'GET',
      url: `${base}/tasks?view=overdue`,
      cookies: auth,
    });
    check(
      'overdue ko\'rinishi ishlaydi',
      (overdueList.json() as { tasks: unknown[] }).tasks.length === 1,
    );

    const manualTask = await app.inject({
      method: 'POST',
      url: `${base}/tasks`,
      cookies: auth,
      payload: {
        title: 'Sardor bilan skript ustida ishlash',
        seatId: sardor,
        dueAt: new Date(Date.now() + DAY * 1000).toISOString(),
      },
    });
    const manualTaskId = (manualTask.json() as { id: string }).id;
    check('qo\'lda vazifa yaratildi', manualTask.statusCode === 201);

    const patched = await app.inject({
      method: 'PATCH',
      url: `${base}/tasks/${manualTaskId}`,
      cookies: auth,
      payload: { status: 'done' },
    });
    const patchedBody = patched.json() as { status: string; completedAt: string | null };
    check('vazifa bajarildi, completedAt yozildi', patchedBody.status === 'done' && !!patchedBody.completedAt);

    const taskAnalytics = await app.inject({
      method: 'GET',
      url: `${base}/tasks/analytics`,
      cookies: auth,
    });
    const ta = taskAnalytics.json() as {
      total: number;
      done: number;
      overdue: number;
      fromAi: number;
      completionRatePct: number | null;
    };
    check(
      'vazifa analitikasi to\'g\'ri (FR-129d)',
      ta.total === 2 && ta.done === 1 && ta.overdue === 1 && ta.fromAi === 1 && ta.completionRatePct === 50,
      JSON.stringify(ta),
    );

    // ═══ OGOHLANTIRISHLAR (FR-132/133/137) ═══
    console.log('\n— Ogohlantirishlar —');

    const [missedLead] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(alert).where(eq(alert.dedupeKey, `noreply:${conv2}`)),
    );
    check('javobsiz mijoz ogohlantirishi (FR-132)', missedLead?.kind === 'missed_lead');

    const overdueMarked = await markOverdueCommitments();
    check('muddati o\'tgan va\'da belgilandi (FR-133)', overdueMarked >= 1, `soni: ${overdueMarked}`);
    const [missedCommit] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(commitment).where(eq(commitment.conversationId, conv1)),
    );
    check('va\'da holati missed', missedCommit?.status === 'missed');
    const again = await markOverdueCommitments();
    check('takroriy ishga tushirish hech narsa qilmaydi', again === 0, `soni: ${again}`);

    const alertList = await app.inject({ method: 'GET', url: `${base}/alerts`, cookies: auth });
    const alertBody = alertList.json() as {
      alerts: { id: string; kind: string }[];
      unseenCount: number;
    };
    check(
      'ogohlantirishlar ro\'yxati (missed_lead + broken_commitment)',
      alertList.statusCode === 200 && alertBody.alerts.length === 2,
      `soni: ${alertBody.alerts.length}`,
    );
    check('unseenCount to\'g\'ri', alertBody.unseenCount === 2, `qiymat: ${alertBody.unseenCount}`);

    const kindFilter = await app.inject({
      method: 'GET',
      url: `${base}/alerts?kind=missed_lead`,
      cookies: auth,
    });
    check(
      'tur bo\'yicha filtr ishlaydi',
      (kindFilter.json() as { alerts: unknown[] }).alerts.length === 1,
    );

    // status=active — "resolved bo'lmagan hammasi" (new + seen birlashtirilgan).
    const activeFilter = await app.inject({
      method: 'GET',
      url: `${base}/alerts?status=active`,
      cookies: auth,
    });
    check(
      'status=active ikkala faol ogohlantirishni qaytaradi',
      (activeFilter.json() as { alerts: unknown[] }).alerts.length === 2,
      JSON.stringify(activeFilter.json()),
    );

    // Sahifalash (ikkalasi ham hali faol ekan): limit=1 + cursor bilan
    // ikkinchi sahifadan qolganini olish, keyin nextCursor tugashi kerak.
    const page1 = await app.inject({
      method: 'GET',
      url: `${base}/alerts?status=active&limit=1`,
      cookies: auth,
    });
    const page1Body = page1.json() as { alerts: { id: string }[]; nextCursor: string | null };
    check(
      'birinchi sahifa 1 ta va nextCursor bor',
      page1Body.alerts.length === 1 && page1Body.nextCursor !== null,
    );
    const page2 = await app.inject({
      method: 'GET',
      url: `${base}/alerts?status=active&limit=1&before=${encodeURIComponent(page1Body.nextCursor!)}`,
      cookies: auth,
    });
    const page2Body = page2.json() as { alerts: { id: string }[]; nextCursor: string | null };
    check(
      'ikkinchi sahifa qolgan (boshqa) ogohlantirishni beradi, nextCursor tugaydi',
      page2Body.alerts.length === 1 &&
        page2Body.alerts[0]?.id !== page1Body.alerts[0]?.id &&
        page2Body.nextCursor === null,
      JSON.stringify(page2Body),
    );

    const oneAlertId = (alertBody.alerts[0] as { id: string }).id;
    await app.inject({
      method: 'PATCH',
      url: `${base}/alerts/${oneAlertId}`,
      cookies: auth,
      payload: { status: 'resolved' },
    });
    const afterResolve = await app.inject({
      method: 'GET',
      url: `${base}/alerts?status=active`,
      cookies: auth,
    });
    check(
      'hal qilingandan keyin status=active uni chiqarib tashlaydi',
      (afterResolve.json() as { alerts: unknown[] }).alerts.length === 1,
    );
    const resolvedFilter = await app.inject({
      method: 'GET',
      url: `${base}/alerts?status=resolved`,
      cookies: auth,
    });
    check(
      'status=resolved faqat hal qilinganlarni qaytaradi',
      (resolvedFilter.json() as { alerts: { id: string }[] }).alerts.length === 1 &&
        (resolvedFilter.json() as { alerts: { id: string }[] }).alerts[0]?.id === oneAlertId,
    );

    const alertId = alertBody.alerts[0]!.id;
    const seen = await app.inject({
      method: 'PATCH',
      url: `${base}/alerts/${alertId}`,
      cookies: auth,
      payload: { status: 'seen' },
    });
    check('ko\'rildi holati (FR-137)', (seen.json() as { status: string }).status === 'seen');
    const resolved = await app.inject({
      method: 'PATCH',
      url: `${base}/alerts/${alertId}`,
      cookies: auth,
      payload: { status: 'resolved' },
    });
    const resolvedBody = resolved.json() as { status: string; resolvedAt: string | null; resolvedBy: string | null };
    check(
      'hal qilindi: vaqt va kim yozildi',
      resolvedBody.status === 'resolved' && !!resolvedBody.resolvedAt && !!resolvedBody.resolvedBy,
    );

    // ═══ DASHBOARD (FR-101..105, 109) ═══
    console.log('\n— Dashboard —');

    const kpi = await app.inject({
      method: 'GET',
      url: `${base}/dashboard/kpi`,
      cookies: auth,
    });
    const kpiBody = kpi.json() as {
      current: {
        conversations: number;
        analyzed: number;
        avgScore: number;
        medianFirstResponseSeconds: number;
        unansweredSessions: number;
        aiCostUsd: number;
      };
      previous: { conversations: number };
    };
    check('KPI: 3 suhbat, 3 tahlil (FR-102)', kpiBody.current.conversations === 3 && kpiBody.current.analyzed === 3, JSON.stringify(kpiBody.current));
    check(
      'KPI: o\'rtacha ball 62.2',
      Math.abs(kpiBody.current.avgScore - 62.2) < 0.15,
      `qiymat: ${kpiBody.current.avgScore}`,
    );
    check(
      'KPI: median javob tezligi 600s (FR-109)',
      kpiBody.current.medianFirstResponseSeconds === 600,
      `qiymat: ${kpiBody.current.medianFirstResponseSeconds}`,
    );
    check('KPI: 1 javobsiz sessiya (FR-110)', kpiBody.current.unansweredSessions === 1);
    check('KPI: AI xarajati yig\'ildi', kpiBody.current.aiCostUsd > 0);
    check('KPI: oldingi davr taqqoslash uchun keladi (FR-101)', kpiBody.previous.conversations === 0);

    const lb = await app.inject({
      method: 'GET',
      url: `${base}/dashboard/leaderboard`,
      cookies: auth,
    });
    const lbBody = lb.json() as {
      leaderboard: { seatId: string; displayName: string; conversations: number; avgScore: number | null }[];
    };
    check('reyting: 2 sotuvchi (FR-103)', lbBody.leaderboard.length === 2, `soni: ${lbBody.leaderboard.length}`);
    check(
      'reyting tartibi: Malika birinchi (83.4 vs 20)',
      lbBody.leaderboard[0]?.seatId === malika && lbBody.leaderboard[1]?.seatId === sardor,
      JSON.stringify(lbBody.leaderboard.map((r) => [r.displayName, r.avgScore])),
    );
    check(
      'reyting balllari to\'g\'ri',
      Math.abs((lbBody.leaderboard[0]?.avgScore ?? 0) - 83.35) < 0.1 && lbBody.leaderboard[1]?.avgScore === 20,
    );

    const crit = await app.inject({
      method: 'GET',
      url: `${base}/dashboard/criteria`,
      cookies: auth,
    });
    const critBody = crit.json() as {
      criteria: { code: string; avgScore: number | null; unknownCount: number; scored: number }[];
      weakest: { code: string } | null;
    };
    const b1 = critBody.criteria.find((c) => c.code === 'B1');
    const a2crit = critBody.criteria.find((c) => c.code === 'A2');
    check(
      'mezon tahlili: B1 eng zaif (1.67) (FR-104)',
      critBody.weakest?.code === 'B1' && Math.abs((b1?.avgScore ?? 0) - 1.67) < 0.01,
      JSON.stringify(critBody.weakest),
    );
    check(
      '"aniqlanmadi" alohida sanaladi, ballga aralashmaydi',
      a2crit?.unknownCount === 3 && a2crit.avgScore === null && a2crit.scored === 0,
    );

    const trend = await app.inject({
      method: 'GET',
      url: `${base}/dashboard/trend`,
      cookies: auth,
    });
    const trendBody = trend.json() as { points: { conversations: number }[] };
    const totalInTrend = trendBody.points.reduce((s, p) => s + p.conversations, 0);
    check(
      'trend: kunlik bo\'laklar, jami 3 suhbat (FR-105)',
      trendBody.points.length >= 2 && totalInTrend === 3,
      `bo'laklar: ${trendBody.points.length}, jami: ${totalInTrend}`,
    );

    const seatDash = await app.inject({
      method: 'GET',
      url: `${base}/dashboard/seats/${malika}`,
      cookies: auth,
    });
    const seatBody = seatDash.json() as {
      current: { conversations: number; avgScore: number };
      weakestCriterion: { code: string } | null;
    };
    check(
      'sotuvchi kabineti asosi: 2 suhbat, zaif mezon bor (FR-112)',
      seatBody.current.conversations === 2 && seatBody.weakestCriterion !== null,
      JSON.stringify(seatBody),
    );

    const noAuth = await app.inject({ method: 'GET', url: `${base}/dashboard/kpi` });
    check('autentifikatsiyasiz 401', noAuth.statusCode === 401, `kod: ${noAuth.statusCode}`);
  } finally {
    await app.close();
    await cleanupTestDataQuietly(`%${tag}@test.local`);
    await closeDb();
  }

  console.log(`\n${fail === 0 ? 'Dashboard butun.' : 'XATOLAR BOR.'} ${pass}/${pass + fail} tekshiruv o'tdi.`);
  if (fail > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
