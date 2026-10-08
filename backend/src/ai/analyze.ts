import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import { withTenant, type Tx } from '../db/index.js';
import {
  alert,
  analysis,
  business,
  commitment,
  contact,
  conversation,
  criterionScore,
  playbook,
  seat,
  task,
  transcriptSegment,
} from '../db/schema/index.js';
import { playbookBodySchema, type Criterion, type PlaybookBody } from '../playbook/schema.js';
import { computeReplyMetrics } from '../telegram/ingest.js';
import {
  alertPrefsSchema,
  amaldagiJadval,
  seatWorkHoursSchema,
  suhbatIshVaqtidami,
  workHoursSchema,
} from '../business/settings.js';
import type { LlmClient } from './llm.js';
import { prefilterTelegramSession } from './prefilter.js';
import {
  buildStage2Prompt,
  buildStage3Prompt,
  formatTranscript,
  stage2Result,
  stage2Schema,
  stage3Result,
  stage3Schema,
  type PromptSegment,
  type Stage2Result,
  type Stage3Result,
} from './prompts.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TAHLIL ORKESTRI — TZ 3.5 dagi quvurning yuragi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * pre-filter → 2-bosqich (ekstraksiya) → ishonch darvozasi (FR-83)
 *            → 3-bosqich (isbotli baholash) → yozish
 *
 * ENG MUHIM QISM — isbotni TEKSHIRISH (FR-80/82): model keltirgan iqtibos
 * transkriptda haqiqatan bor-yo'qligi dasturiy tekshiriladi. Topilmasa
 * ball bekor qilinadi (null) va tahlil bayroqlanadi. LLM'ga "iqtibos
 * keltir" deb aytishning o'zi kifoya emas — u chiroyli iqtibosni
 * O'YLAB TOPA oladi. Ishonch prompt darajasida emas, kod darajasida.
 */

/** FR-83: ishonch shundan past bo'lsa baholashga o'tilmaydi. */
const CONFIDENCE_GATE = 0.4;

export interface AnalyzeOutcome {
  status: 'done' | 'filtered' | 'not_scored';
  analysisId?: string;
  reason?: string;
  flagged?: boolean;
}

/** Iqtibosni solishtirish uchun normalizatsiya: bo'shliqlar + registr. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

export interface EvidenceCheck {
  found: boolean;
  segmentId: bigint | null;
  startSeconds: string | null;
}

/**
 * Iqtibos transkriptda bormi? Avval model ko'rsatgan segmentda, keyin
 * hammasida, oxiri butun matn birlashmasida (iqtibos ikki xabar
 * chegarasidan o'tgan bo'lishi mumkin) qidiriladi.
 *
 * **Eksport qilingan**, chunki e'tirozni hal qilishda rahbar qo'lda
 * qo'ygan ball ham xuddi shu tekshiruvdan o'tadi (FR-124). Isbot talabi
 * modelga emas, BALLGA tegishli — uni kim qo'ygani ahamiyatsiz. Aks holda
 * "AI ga ishonmaymiz, odamga ishonamiz" degan teshik paydo bo'lardi.
 */
export function verifyEvidence(
  quote: string,
  hintSeq: number | null,
  segments: (PromptSegment & { id: bigint })[],
): EvidenceCheck {
  const nq = normalize(quote);
  if (nq.length === 0) return { found: false, segmentId: null, startSeconds: null };

  const inSegment = (s: PromptSegment & { id: bigint }): boolean =>
    normalize(s.text).includes(nq);

  const hinted = hintSeq === null ? undefined : segments.find((s) => s.seq === hintSeq);
  const match = (hinted && inSegment(hinted) ? hinted : undefined) ?? segments.find(inSegment);
  if (match) {
    return {
      found: true,
      segmentId: match.id,
      startSeconds: match.startSeconds.toFixed(2),
    };
  }

  // Xabarlararo iqtibos: butun matnda bor, lekin bitta segmentga sig'magan.
  const joined = normalize(segments.map((s) => s.text).join(' '));
  if (joined.includes(nq)) {
    return { found: true, segmentId: null, startSeconds: null };
  }

  return { found: false, segmentId: null, startSeconds: null };
}

/** Mezonning shu suhbatga taalluqliligi (appliesTo filtri). */
export function applicableCriteria(
  body: PlaybookBody,
  callFamily: string | null,
  serviceLine: string | null,
): Criterion[] {
  return body.criteria.criteria.filter((c) => {
    if (!c.isActive) return false;
    const a = c.appliesTo;
    if (a.callFamilies.length > 0 && (!callFamily || !a.callFamilies.includes(callFamily))) {
      return false;
    }
    if (a.serviceLines.length > 0 && (!serviceLine || !a.serviceLines.includes(serviceLine))) {
      return false;
    }
    // directions filtri Telegram'da ishlamaydi (direction = 'na')
    return true;
  });
}

/**
 * Vaznli umumiy foiz. Baholanmagan kategoriya (barcha mezonlari null)
 * hisobdan CHIQARILADI va vaznlar qolganlariga qayta taqsimlanadi —
 * aks holda "aniqlanmadi" jim ravishda 0 ball sifatida jazolaydi.
 */
export function computeOverallScore(
  body: PlaybookBody,
  scores: Map<string, number | null>,
): { overall: number | null; scoredCategories: number; totalCategories: number } {
  const cats = body.criteria.categories;
  let weightedSum = 0;
  let weightUsed = 0;
  let scoredCats = 0;

  for (const cat of cats) {
    const critScores: number[] = [];
    for (const c of body.criteria.criteria) {
      if (c.categoryCode !== cat.code) continue;
      const s = scores.get(c.code);
      if (s !== null && s !== undefined) critScores.push(s / 3);
    }
    if (critScores.length === 0) continue;
    scoredCats++;
    weightUsed += cat.weightPct;
    weightedSum += (critScores.reduce((a, b) => a + b, 0) / critScores.length) * cat.weightPct;
  }

  return {
    overall: weightUsed > 0 ? Math.round((weightedSum / weightUsed) * 1000) / 10 : null,
    scoredCategories: scoredCats,
    totalCategories: cats.length,
  };
}

export interface ScoringGate {
  skipScoring: boolean;
  scoringMode: 'scored' | 'skipped_low_confidence' | 'not_scored';
  family: PlaybookBody['classificationPolicy']['callFamilies'][number] | undefined;
}

/**
 * Baholash kerakmi — ekstraksiya natijasidan (stage2 yoki unga teng
 * birlashtirilgan chaqiruv) hisoblanadi, LLM haqiqatan baholaganidan
 * QAT'IY NAZAR. Shu bilan ballash bosqichi qanday olinganidan
 * (alohida stage3 chaqiruvimi, birlashtirilgan bitta so'rovmi) mustaqil
 * ravishda bir xil xavfsizlik darvozasi ishlaydi.
 */
export function computeScoringGate(body: PlaybookBody, extracted: Stage2Result): ScoringGate {
  const family = body.classificationPolicy.callFamilies.find((f) => f.key === extracted.callFamily);
  const lowConfidence = extracted.confidence < CONFIDENCE_GATE;
  const notBusiness = ['spam', 'internal', 'other'].includes(extracted.businessRelevance);
  const familyNotScored = family ? !family.scored : false;
  const skipScoring = lowConfidence || notBusiness || familyNotScored;
  const scoringMode = skipScoring
    ? lowConfidence
      ? 'skipped_low_confidence'
      : 'not_scored'
    : 'scored';
  return { skipScoring, scoringMode, family };
}

async function setStatus(
  tx: Tx,
  conversationId: string,
  status: 'filtered' | 'analyzing' | 'done' | 'failed',
  excludedReason?: string,
): Promise<void> {
  await tx
    .update(conversation)
    .set({
      status,
      ...(excludedReason !== undefined ? { excludedReason } : {}),
      updatedAt: new Date(),
    })
    .where(eq(conversation.id, conversationId));
}

export async function analyzeConversation(
  llm: LlmClient,
  businessId: string,
  conversationId: string,
): Promise<AnalyzeOutcome> {
  const startedProcessing = Date.now();

  // ─── Ma'lumot yig'ish ───
  const ctx = await withTenant(businessId, async (tx) => {
    const [conv] = await tx
      .select({
        id: conversation.id,
        seatId: conversation.seatId,
        contactId: conversation.contactId,
        startedAt: conversation.startedAt,
        channel: conversation.channel,
      })
      .from(conversation)
      .where(eq(conversation.id, conversationId))
      .limit(1);
    if (!conv) return null;

    await setStatus(tx, conversationId, 'analyzing');

    const segments = await tx
      .select({
        id: transcriptSegment.id,
        seq: transcriptSegment.seq,
        speaker: transcriptSegment.speaker,
        text: transcriptSegment.text,
        startSeconds: transcriptSegment.startSeconds,
      })
      .from(transcriptSegment)
      .where(eq(transcriptSegment.conversationId, conversationId))
      .orderBy(asc(transcriptSegment.seq));

    const [pb] = await tx
      .select({
        id: playbook.id,
        version: playbook.version,
        criteria: playbook.criteria,
        questionnaire: playbook.questionnaire,
        classificationPolicy: playbook.classificationPolicy,
        promptNotes: playbook.promptNotes,
        leadQuality: playbook.leadQuality,
      })
      .from(playbook)
      .where(eq(playbook.isActive, true))
      .orderBy(desc(playbook.version))
      .limit(1);

    const [biz] = await tx
      .select({ name: business.name, profile: business.profile })
      .from(business)
      .where(eq(business.id, businessId))
      .limit(1);

    return { conv, segments, pb: pb ?? null, biz: biz ?? null };
  });

  if (!ctx) throw new Error(`Suhbat topilmadi: ${conversationId}`);

  const segs = ctx.segments.map((s) => ({
    id: s.id,
    seq: s.seq,
    speaker: s.speaker,
    text: s.text,
    startSeconds: Number(s.startSeconds),
  }));

  // ─── 0-bosqich: pre-filter ───
  const pre = prefilterTelegramSession(segs);
  if (!pre.pass) {
    await withTenant(businessId, (tx) =>
      setStatus(tx, conversationId, 'filtered', pre.reason),
    );
    return { status: 'filtered', reason: pre.reason ?? '' };
  }

  if (!ctx.pb) {
    // Playbook'siz baholab bo'lmaydi — bu xato, retry foydasiz emas:
    // foydalanuvchi playbook yaratgach qayta tahlil qilinadi.
    await withTenant(businessId, (tx) =>
      setStatus(tx, conversationId, 'failed', 'faol playbook yo\'q'),
    );
    return { status: 'not_scored', reason: 'faol playbook yo\'q' };
  }

  const body = playbookBodySchema.parse({
    criteria: ctx.pb.criteria,
    questionnaire: ctx.pb.questionnaire,
    classificationPolicy: ctx.pb.classificationPolicy,
    promptNotes: ctx.pb.promptNotes,
    leadQuality: ctx.pb.leadQuality,
  });

  const transcript = formatTranscript(segs);
  const businessContext = [
    ctx.biz?.name ? `Biznes: ${ctx.biz.name}` : '',
    ctx.biz?.profile ? JSON.stringify(ctx.biz.profile) : '',
  ]
    .filter(Boolean)
    .join('\n');

  // ─── 2-bosqich: ekstraksiya ───
  const p2 = await buildStage2Prompt(body, businessContext, transcript, ctx.conv.startedAt);
  const r2 = await llm.completeJson({
    stage: 'stage2',
    system: p2.system,
    user: p2.user,
    schema: stage2Schema,
  });
  const stage2Json = r2.json as Record<string, unknown>;
  const signals = stage2Json.signals as Record<string, unknown> | undefined;
  if (signals && typeof signals.urgency === 'object' && signals.urgency !== null) {
    const urgency = signals.urgency as Record<string, unknown>;
    const value = urgency.level ?? urgency.value ?? urgency.urgency;
    signals.urgency = typeof value === 'string' ? value : null;
  }
  const extracted = stage2Result.parse(stage2Json);

  /**
   * FR-28: savolnoma javoblari. Modelga ID mosligini ISHONMAYMIZ — faqat
   * playbook'da haqiqatan mavjud savollarni qoldiramiz (model yo'q
   * savolga javob "o'ylab topgan" yoki eski ID ishlatgan bo'lishi mumkin).
   * Savol matni SHU PAYTDAGI holatida saqlanadi (rubricSnapshot bilan bir
   * xil naqsh) — keyin anketa o'zgarsa ham, o'tgan javob o'z ma'nosini
   * yo'qotmaydi.
   */
  const questionById = new Map(body.questionnaire.questions.map((q) => [q.id, q.question]));
  const questionnaireAnswers = extracted.questionnaireAnswers
    .filter((a) => questionById.has(a.questionId) && a.answer !== null)
    .map((a) => ({ question: questionById.get(a.questionId)!, answer: a.answer }));

  let totalCost = r2.costUsd;
  let tokensIn = r2.tokensIn;
  let tokensOut = r2.tokensOut;
  const modelVersions: Record<string, unknown> = {
    stage2: r2.model,
    stage2Prompt: p2.templateVersion,
  };

  // ─── Baholash kerakmi? ───
  const gate = computeScoringGate(body, extracted);

  // ─── 3-bosqich: isbotli baholash ───
  let stage3: Stage3Result | null = null;
  let applicable: Criterion[] = [];

  if (!gate.skipScoring) {
    applicable = applicableCriteria(body, extracted.callFamily, extracted.serviceLine);
    if (applicable.length > 0) {
      const p3 = await buildStage3Prompt(body, applicable, transcript);
      const r3 = await llm.completeJson({
        stage: 'stage3',
        system: p3.system,
        user: p3.user,
        schema: stage3Schema,
        maxTokens: 12000,
      });
      stage3 = stage3Result.parse(r3.json);
      totalCost += r3.costUsd;
      tokensIn += r3.tokensIn;
      tokensOut += r3.tokensOut;
      modelVersions.stage3 = r3.model;
      modelVersions.stage3Prompt = p3.templateVersion;
    }
  }

  const { analysisId, flagged, flaggedReason } = await withTenant(businessId, (tx) =>
    persistAnalysisTx(tx, {
      businessId,
      conversationId,
      conv: {
        seatId: ctx.conv.seatId,
        contactId: ctx.conv.contactId,
        startedAt: ctx.conv.startedAt,
      },
      playbookId: ctx.pb!.id,
      playbookVersion: ctx.pb!.version,
      body,
      segs,
      extracted,
      stage3,
      gate,
      applicable,
      cost: { totalCost, tokensIn, tokensOut, modelVersions },
      processingMs: Date.now() - startedProcessing,
      speakerAttributionMethod: 'telegram_id',
      speakerAttributionConfidence: 1,
    }),
  );

  return {
    status: gate.skipScoring ? 'not_scored' : 'done',
    analysisId,
    flagged,
    ...(flaggedReason ? { reason: flaggedReason } : {}),
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ISBOTNI TEKSHIRISH + BAZAGA YOZISH — qayta ishlatiladigan yakuniy bosqich
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `analyzeConversation` (Telegram/matn importi, async navbat orqali) va
 * audio yuklashning birlashtirilgan (transkript+baholash bitta so'rovda)
 * oqimi — ikkalasi ham AYNAN shu funksiyadan o'tadi. Farqi faqat
 * ekstraksiya+baholash natijasi QANDAY olib kelinganida (ikki alohida LLM
 * chaqiruvimi, bitta birlashtirilgan chaqiruvmi) — isbot tekshiruvi,
 * xavfsizlik darvozasi (`gate`) va yozish mantig'i bir xil qoladi.
 *
 * `tx` chaqiruvchidan keladi (o'z tranzaksiyasini ochmaydi) — shu orqali
 * audio oqimi suhbat+segment yaratish bilan BIR tranzaksiyada ishlashi
 * mumkin.
 */
export async function persistAnalysisTx(
  tx: Tx,
  params: {
    businessId: string;
    conversationId: string;
    conv: { seatId: string | null; contactId: string | null; startedAt: Date };
    playbookId: string;
    playbookVersion: number;
    body: PlaybookBody;
    segs: (PromptSegment & { id: bigint })[];
    extracted: Stage2Result;
    stage3: Stage3Result | null;
    gate: ScoringGate;
    applicable: Criterion[];
    cost: {
      totalCost: number;
      tokensIn: number;
      tokensOut: number;
      modelVersions: Record<string, unknown>;
    };
    processingMs: number;
    speakerAttributionMethod: 'channel' | 'phone' | 'telegram_id' | 'llm_inferred';
    /** 0..1 — bazada 3 xonali son sifatida saqlanadi. */
    speakerAttributionConfidence: number;
  },
): Promise<{ analysisId: string; flagged: boolean; flaggedReason: string | null }> {
  const { businessId, conversationId, conv, body, segs, extracted } = params;

  /**
   * Ogohlantirish sozlamalari (`Sozlamalar → Bildirishnomalar`).
   *
   * Shu yerda o'qiladi, chaqiruvchidan uzatilmaydi: `persistAnalysisTx`
   * ikkita joydan chaqiriladi (oddiy quvur va birlashtirilgan audio
   * oqimi), va sozlamani ikkalasiga ham qo'lda uzatish — birini
   * unutish demakdir.
   */
  const [bizRow] = await tx
    .select({
      alertPrefs: business.alertPrefs,
      workHours: business.workHours,
      timezone: business.timezone,
    })
    .from(business)
    .where(eq(business.id, businessId))
    .limit(1);
  const bazaPrefs = alertPrefsSchema.parse(bizRow?.alertPrefs ?? {});
  const biznesJadval = workHoursSchema.parse(bizRow?.workHours ?? {});

  /**
   * Menejerning ALOHIDA jadvali bo'lsa — o'shanikidan foydalanamiz.
   *
   * Kechki smenada ishlaydigan menejer uchun biznesning 9-18 jadvali
   * noto'g'ri: uning butun ish kuni "ish vaqtidan tashqari" bo'lib,
   * hech qanday ogohlantirish yaratilmasdi. `amaldagiJadval` bosh
   * kalitni ham tekshiradi.
   */
  const [orinRow] = params.conv.seatId
    ? await tx
        .select({ workHours: seat.workHours })
        .from(seat)
        .where(eq(seat.id, params.conv.seatId))
        .limit(1)
    : [];
  const jadval = amaldagiJadval(
    biznesJadval,
    seatWorkHoursSchema.parse(orinRow?.workHours ?? null) ?? undefined,
  );

  /**
   * Ish vaqtidan tashqari ogohlantirishlarni o'chirish.
   *
   * `prefs.kinds` ni butunlay o'chirib qo'yamiz, alohida `if` qo'shmaymiz:
   * shunda uchala yaratish nuqtasi allaqachon mavjud darvozadan o'tadi va
   * kelajakda to'rtinchi tur qo'shilsa uni ham avtomatik qamrab oladi.
   * Alohida shart qo'ysak — yangi turni gate'ga ulashni unutish oson.
   */
  const ishVaqtida = jadval.alertsOnlyWorkHours
    ? suhbatIshVaqtidami(params.conv.startedAt, jadval, bizRow?.timezone ?? 'Asia/Tashkent')
    : true;
  const prefs = ishVaqtida
    ? bazaPrefs
    : {
        ...bazaPrefs,
        kinds: Object.fromEntries(
          Object.keys(bazaPrefs.kinds).map((k) => [k, false]),
        ) as typeof bazaPrefs.kinds,
      };

  // Gate — natija QANDAY olib kelinganidan qat'i nazar, xavfsizlik
  // darvozasi shu yerda YANA bir bor qo'llaniladi (himoya ikki qavatli:
  // chaqiruvchi ham, bu funksiya ham tekshiradi).
  const stage3 = params.gate.skipScoring ? null : params.stage3;
  const applicable = params.gate.skipScoring ? [] : params.applicable;
  const scoringMode = params.gate.scoringMode;
  const lowConfidence = scoringMode === 'skipped_low_confidence';

  const questionById = new Map(body.questionnaire.questions.map((q) => [q.id, q.question]));
  const questionnaireAnswers = extracted.questionnaireAnswers
    .filter((a) => questionById.has(a.questionId) && a.answer !== null)
    .map((a) => ({ question: questionById.get(a.questionId)!, answer: a.answer }));

  // ─── Isbotni tekshirish va ballarni tayyorlash (FR-80/82) ───
  const finalScores = new Map<string, number | null>();
  const scoreRows: {
    criterion: Criterion;
    score: number | null;
    evidenceQuote: string | null;
    evidence: EvidenceCheck;
    confidence: number;
  }[] = [];
  let evidenceFailures = 0;

  if (stage3) {
    const returned = new Map(stage3.scores.map((s) => [s.code, s]));
    for (const criterion of applicable) {
      const s = returned.get(criterion.code);
      if (!s || s.score === null) {
        finalScores.set(criterion.code, null);
        scoreRows.push({
          criterion,
          score: null,
          evidenceQuote: null,
          evidence: { found: false, segmentId: null, startSeconds: null },
          confidence: s?.confidence ?? 0,
        });
        continue;
      }

      const evidence = s.evidenceQuote
        ? verifyEvidence(s.evidenceQuote, s.evidenceSegment, segs)
        : { found: false, segmentId: null, startSeconds: null };

      if (!evidence.found) {
        // Model iqtibosni o'ylab topgan yoki keltirmagan — ball bekor.
        // Bu mahsulotning asosiy va'dasi: isbotsiz ball YO'Q.
        evidenceFailures++;
        finalScores.set(criterion.code, null);
        scoreRows.push({
          criterion,
          score: null,
          evidenceQuote: null,
          evidence,
          confidence: s.confidence,
        });
        continue;
      }

      finalScores.set(criterion.code, s.score);
      scoreRows.push({
        criterion,
        score: s.score,
        evidenceQuote: s.evidenceQuote,
        evidence,
        confidence: s.confidence,
      });
    }

    // Model ro'yxatda bo'lmagan kod qaytargan bo'lsa — e'tiborsiz
    // (applicable dan tashqaridagi kodlar yozilmaydi).
  }

  const { overall, scoredCategories, totalCategories } = stage3
    ? computeOverallScore(body, finalScores)
    : { overall: null, scoredCategories: 0, totalCategories: 0 };

  // Qizil bayroqlar ham isbot talab qiladi.
  const validRedFlags = (stage3?.redFlags ?? []).filter((f) => {
    const known = body.classificationPolicy.redFlags.some((r) => r.key === f.key);
    return known && verifyEvidence(f.quote, null, segs).found;
  });

  const replyMetrics = computeReplyMetrics(
    segs.map((s) => ({
      speaker: s.speaker,
      at: new Date(conv.startedAt.getTime() + s.startSeconds * 1000),
    })),
  );

  const flagged = lowConfidence || evidenceFailures > 0;
  const flaggedReason = lowConfidence
    ? `ishonch past (${extracted.confidence.toFixed(2)})`
    : evidenceFailures > 0
      ? `${evidenceFailures} ta ball isbotsiz qaytarildi va bekor qilindi`
      : null;

  // Qayta tahlil: eski natija o'chiriladi (criterion_score kaskad bilan).
  await tx.delete(analysis).where(eq(analysis.conversationId, conversationId));

  const [row] = await tx
    .insert(analysis)
    .values({
      conversationId,
      businessId,
      seatId: conv.seatId,
      playbookId: params.playbookId,
      playbookVersion: params.playbookVersion,
      modelVersions: params.cost.modelVersions,
      speakerAttributionMethod: params.speakerAttributionMethod,
      speakerAttributionConfidence: params.speakerAttributionConfidence.toFixed(3),
      businessRelevance: extracted.businessRelevance,
      callFamily: extracted.callFamily,
      serviceLine: extracted.serviceLine,
      classificationConfidence: extracted.confidence.toFixed(3),
      scoringMode,
      overallScore: overall === null ? null : overall.toFixed(2),
      leadQuality: stage3?.leadQuality ?? null,
      scoredCategories,
      totalCategories,
      primaryGap: stage3?.primaryGap ?? null,
      compliance: stage3?.compliance ?? null,
      clientExtracted: extracted.client,
      deal: extracted.deal,
      signals: extracted.signals,
      questionnaireAnswers: questionnaireAnswers.length > 0 ? questionnaireAnswers : null,
      // `needsReply` shu yerda saqlanadi, chunki dashboard "javob
      // kutmoqda" KPI si ogohlantirish bilan bir xil mantiqda
      // hisoblanishi kerak — aks holda raqam va ogohlantirishlar soni
      // bir-biriga mos kelmaydi.
      dynamics: { replyMetrics, needsReply: extracted.lastClientMessageNeedsReply },
      summary: extracted.summary,
      managerNote: stage3?.coaching ?? null,
      costUsd: params.cost.totalCost.toFixed(6),
      tokensIn: params.cost.tokensIn,
      tokensOut: params.cost.tokensOut,
      processingMs: params.processingMs,
      isFlagged: flagged,
      flaggedReason,
      analyzedAt: new Date(),
    })
    .returning({ id: analysis.id });

  if (!row) throw new Error('analysis yozilmadi');

  /**
   * Kontaktni suhbatdan topilgan ma'lumot bilan boyitamiz — lekin
   * FAQAT bo'sh maydonlarni. Sotuvchi CRM'da qo'lda to'g'rilagan
   * ismni keyingi tahlil "noaniq" deb qayta yozib yubormasligi kerak.
   */
  const c = extracted.client;
  if (conv.contactId && (c.name || c.company || c.role || c.isDecisionMaker !== null)) {
    await tx
      .update(contact)
      .set({
        name: sql`coalesce(${contact.name}, ${c.name})`,
        company: sql`coalesce(${contact.company}, ${c.company})`,
        role: sql`coalesce(${contact.role}, ${c.role})`,
        isDecisionMaker: sql`coalesce(${contact.isDecisionMaker}, ${c.isDecisionMaker})`,
        lastSeenAt: new Date(),
      })
      .where(eq(contact.id, conv.contactId));
  }

  if (scoreRows.length > 0) {
    const catByCode = new Map(body.criteria.categories.map((c) => [c.code, c]));
    await tx.insert(criterionScore).values(
      scoreRows.map((s) => ({
        analysisId: row.id,
        conversationId,
        businessId,
        seatId: conv.seatId,
        criterionCode: s.criterion.code,
        criterionName: s.criterion.name,
        categoryCode: s.criterion.categoryCode,
        categoryWeightPct: catByCode.get(s.criterion.categoryCode)?.weightPct.toFixed(2) ?? null,
        rubricSnapshot: s.criterion.rubric,
        score: s.score,
        maxScore: 3,
        evidenceQuote: s.evidenceQuote,
        evidenceStartSeconds: s.evidence.startSeconds,
        evidenceSegmentId: s.evidence.segmentId,
        confidence: s.confidence.toFixed(3),
      })),
    );
  }

  // Va'dalar va vazifalar (FR-127): tahlildan avtomatik harakat.
  // Qayta tahlilda takrorlanmasin: bajarilmagan avtomatik yozuvlar
  // o'chirilib qaytadan yoziladi; bajarilganlari (done) tegilmaydi —
  // sotuvchining mehnati yo'qolmasligi kerak.
  await tx
    .delete(task)
    .where(
      and(
        eq(task.conversationId, conversationId),
        eq(task.source, 'playbook_analysis'),
        inArray(task.status, ['pending', 'in_progress']),
      ),
    );
  await tx
    .delete(commitment)
    .where(
      and(eq(commitment.conversationId, conversationId), inArray(commitment.status, ['pending'])),
    );

  if (extracted.commitments.length > 0) {
    const insertedCommitments = await tx
      .insert(commitment)
      .values(
        extracted.commitments.map((c) => ({
          businessId,
          conversationId,
          seatId: conv.seatId,
          byParty: c.party,
          what: c.dueHint ? `${c.description} (muddat: ${c.dueHint})` : c.description,
          deadline: c.dueIso ? new Date(c.dueIso) : null,
        })),
      )
      .returning({ id: commitment.id });

    // Faqat MENEJER va'dalari vazifaga aylanadi — mijozning "o'ylab
    // ko'raman" degani sotuvchiga vazifa emas, signal (FR-127).
    const managerTasks = extracted.commitments
      .map((c, i) => ({ c, commitmentId: insertedCommitments[i]?.id ?? null }))
      .filter(({ c }) => c.party === 'manager');

    if (managerTasks.length > 0) {
      await tx.insert(task).values(
        managerTasks.map(({ c, commitmentId }) => ({
          businessId,
          seatId: conv.seatId,
          conversationId,
          commitmentId,
          source: 'playbook_analysis' as const,
          title: c.description,
          description: c.dueHint ? `Suhbatda aytilgan muddat: ${c.dueHint}` : null,
          dueAt: c.dueIso ? new Date(c.dueIso) : null,
        })),
      );
    }
  }

  /**
   * Javobsiz lid (FR-132).
   *
   * Ikki shart: navbat deterministik ravishda javobsiz qolgan VA model
   * uni javob kutayotgan deb bilgan. Ikkinchi shart shovqinni kesadi —
   * mijozning "rahmat, kelaman" degani javobsiz qolsa, bu o'tkazib
   * yuborilgan lid emas. Model aniq `false` demasa ogohlantiramiz.
   */
  if (
    prefs.kinds.missed_lead &&
    replyMetrics.unansweredTurns > 0 &&
    extracted.lastClientMessageNeedsReply !== false
  ) {
    const dedupeKey = `noreply:${conversationId}`;
    const [existing] = await tx
      .select({ id: alert.id })
      .from(alert)
      .where(eq(alert.dedupeKey, dedupeKey))
      .limit(1);
    if (!existing) {
      await tx.insert(alert).values({
        businessId,
        seatId: conv.seatId,
        conversationId,
        kind: 'missed_lead',
        severity: 'warning',
        title: 'Mijoz xabariga javob berilmagan',
        body: { unansweredTurns: replyMetrics.unansweredTurns },
        dedupeKey,
      });
    }
  }

  // Qizil bayroq ogohlantirishlari (FR-131) — dedupe kaliti bilan.
  for (const flag of prefs.kinds.red_flag ? validRedFlags : []) {
    const def = body.classificationPolicy.redFlags.find((r) => r.key === flag.key)!;
    const dedupeKey = `redflag:${conversationId}:${flag.key}`;
    const [existing] = await tx
      .select({ id: alert.id })
      .from(alert)
      .where(eq(alert.dedupeKey, dedupeKey))
      .limit(1);
    if (existing) continue;
    await tx.insert(alert).values({
      businessId,
      seatId: conv.seatId,
      conversationId,
      kind: 'red_flag',
      severity: def.severity,
      title: def.description,
      body: { quote: flag.quote, key: flag.key },
      dedupeKey,
    });
  }

  if (flagged && prefs.kinds.low_confidence) {
    const dedupeKey = `lowconf:${conversationId}`;
    const [existing] = await tx
      .select({ id: alert.id })
      .from(alert)
      .where(eq(alert.dedupeKey, dedupeKey))
      .limit(1);
    if (!existing) {
      await tx.insert(alert).values({
        businessId,
        seatId: conv.seatId,
        conversationId,
        kind: 'low_confidence',
        severity: 'info',
        title: 'AI natijasi inson ko\'rigini talab qiladi',
        body: { reason: flaggedReason },
        dedupeKey,
      });
    }
  }

  // Faqat hali 'analyzing' bo'lsa 'done' — tahlil davomida yangi xabar
  // kelib holatni 'received' ga qaytargan bo'lsa, uni yutib yubormaymiz.
  await tx
    .update(conversation)
    .set({
      status: 'done',
      language: extracted.language,
      excludedReason: null,
      updatedAt: new Date(),
    })
    .where(and(eq(conversation.id, conversationId), eq(conversation.status, 'analyzing')));

  return { analysisId: row.id, flagged, flaggedReason };
}
