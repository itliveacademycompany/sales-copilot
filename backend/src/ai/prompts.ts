import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { BusinessProfile } from '../business/profile.js';
import { withoutTenantIsolation } from '../db/index.js';
import { promptTemplate } from '../db/schema/index.js';
import type { Criteria, Criterion, PlaybookBody } from '../playbook/schema.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROMPT SHABLONLARI VA LLM CHIQISH SXEMALARI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FR-88: shablonlar bazada versiyalanadi. Kodda har kalit uchun standart
 * bor — baza bo'sh bo'lsa ham pipeline ishlaydi. Bazadagi faol qator
 * standartni bekor qiladi (promptni deploy'siz sozlash uchun).
 *
 * Muhim: LLM chiqishi structured outputs bilan sxemaga MAJBURLANADI,
 * keyin zod bilan yana bir bor tekshiriladi. Ikkilangan nazorat emas —
 * structured outputs sonlarga min/max qo'ya olmaydi (0-3 oralig'i),
 * zod esa qo'yadi.
 */

// ─── Shablonlarni yuklash ────────────────────────────────────────────────────

const DEFAULT_TEMPLATES: Record<string, string> = {
  stage2_extract: `Sen sotuv suhbatlarini tahlil qiluvchi yordamchisan. Quyida biznes konteksti va Telegram yozishmasi berilgan. Vazifang — suhbatdan tuzilgan ma'lumot ajratish.

QOIDALAR:
- Faqat suhbatda AYTILGAN faktlarni yoz. Taxmin qilma.
- Suhbat qaysi tilda bo'lsa, matn maydonlarini o'sha tilda yoz.
- Ishonching past bo'lsa (suhbat qisqa, noaniq) — confidence ni past qo'y.
- callFamily ni faqat berilgan ro'yxatdan tanla; mos kelmasa null.

BIZNES KONTEKSTI:
{{businessContext}}

QO'NG'IROQ OILALARI (kalit — tavsif):
{{callFamilies}}

XIZMAT YO'NALISHLARI:
{{serviceLines}}

ANKETA SAVOLLARI (id — savol):
{{questionnaire}}

QOSHIMCHA KO'RSATMALAR:
{{extractionHints}}`,

  playbook_builder: `Sen sotuv bo'limlari uchun baholash metodologiyasi (playbook) tuzuvchi ekspertsan. Quyida biznes anketasi berilgan. Shu biznesga mos, aniq va kuzatiladigan baholash tizimini tuzib ber.

QOIDALAR:
- 5-7 ta kategoriya (masalan: ehtiyoj aniqlash, taqdimot, e'tiroz bilan ishlash, yakunlash). Vazn (weightPct) taxminiy nisbat — aniq 100% bo'lishi shart emas, kod uni normallashtiradi.
- Har kategoriyada 2-3 ta mezon (criterion).
- Har mezon uchun 0-3 ballik ANCHOR rubrika: har daraja KUZATILADIGAN xatti-harakat bo'lsin ("mijoz ismini so'radi" kabi aniq), umumiy baho emas ("yaxshi ishladi" kabi emas).
- callFamilies: bu biznesga kirib keladigan murojaat turlari (masalan: yangi lid, mavjud mijoz, shikoyat, spam). Har biriga scored: true/false — spam yoki ichki masalalar baholanmaydi.
- redFlags: sotuvchi hech qachon qilmasligi kerak bo'lgan narsalar (qo'pollik, yolg'on va'da va h.k.).
- vocabulary: shu sohaga xos 20-40 ta atama, mahsulot/xizmat nomi, brend so'zlari — nutqni matnga aylantirishda aniqlikni oshirish uchun.
- Hamma matn biznes qanday tilda yozgan bo'lsa o'sha tilda (odatda o'zbek).
- categoryIndex — kategoriyaning categories massividagi tartib raqami (0 dan boshlab), harf yoki kod EMAS.

BIZNES ANKETASI:
{{profile}}`,

  stage3_score: `Sen sotuv sifatini baholovchi ekspertsан. Quyida baholash mezonlari (playbook) va Telegram yozishmasi berilgan. Har mezonga 0-3 ball qo'y.

ENG MUHIM QOIDA — ISBOT:
- Ball qo'ysang, transkriptdan SO'ZMA-SO'Z iqtibos keltirishing SHART (evidenceQuote).
- Iqtibos [S12] kabi segment belgilaridan KEYIN kelgan matndan aynan nusxa bo'lsin — o'zgartirma, qisqartirsang ham so'zma-so'z bo'lsin.
- Iqtibos keltira olmasang — score ni null qo'y ("aniqlanmadi"). Bu xato emas, halollik.
- Iqtibos qaysi segmentdan bo'lsa, evidenceSegment ga o'sha [S..] raqamini yoz.

BAHOLASH:
- Har mezon uchun rubrikadagi 0/1/2/3 tavsiflaridan eng mosini tanla.
- Mezon bu suhbatga umuman taalluqli bo'lmasa — score null.
- redFlags faqat berilgan ro'yxatdagi kalitlardan; har biriga isbot iqtibosi shart.
- Kouching maslahatlarini menejerga qaratib, suhbat tilida yoz.

MEZONLAR:
{{criteria}}

QIZIL BAYROQLAR (kalit — tavsif):
{{redFlags}}

QOSHIMCHA KO'RSATMALAR:
{{scoringGuidance}}`,
};

interface LoadedTemplate {
  content: string;
  version: number;
  source: 'db' | 'default';
}

/** Bazadagi faol shablon yoki kod ichidagi standart. Qisqa kesh bilan. */
const templateCache = new Map<string, { value: LoadedTemplate; at: number }>();
const TEMPLATE_CACHE_MS = 60_000;

export async function loadTemplate(key: string): Promise<LoadedTemplate> {
  const cached = templateCache.get(key);
  if (cached && Date.now() - cached.at < TEMPLATE_CACHE_MS) return cached.value;

  const [row] = await withoutTenantIsolation(
    'prompt shablonini o\'qish (platforma darajasi, tenant emas)',
    (tx) =>
      tx
        .select({ content: promptTemplate.content, version: promptTemplate.version })
        .from(promptTemplate)
        .where(and(eq(promptTemplate.key, key), eq(promptTemplate.isActive, true)))
        .orderBy(desc(promptTemplate.version))
        .limit(1),
  );

  let value: LoadedTemplate;
  if (row) {
    value = { content: row.content, version: row.version, source: 'db' };
  } else {
    const fallback = DEFAULT_TEMPLATES[key];
    if (!fallback) throw new Error(`Noma'lum prompt kaliti: ${key}`);
    value = { content: fallback, version: 0, source: 'default' };
  }
  templateCache.set(key, { value, at: Date.now() });
  return value;
}

/** {{placeholder}} larni almashtirish. Topilmagan kalit bo'sh matn bo'ladi. */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => vars[name] ?? '');
}

// ─── Transkriptni promptga tayyorlash ────────────────────────────────────────

export interface PromptSegment {
  seq: number;
  speaker: string;
  text: string;
  startSeconds: number;
}

/**
 * Har qator [S<seq>] belgisi bilan boshlanadi — model iqtibos qaysi
 * segmentdan ekanini shu belgi orqali ko'rsatadi va biz uni audio/xabar
 * vaqtiga bog'laymiz (FR-80/81).
 */
export function formatTranscript(segments: PromptSegment[]): string {
  const label: Record<string, string> = {
    manager: 'MENEJER',
    client: 'MIJOZ',
    unknown: 'NOMA\'LUM',
    system: 'TIZIM',
  };
  return segments
    .map((s) => `[S${s.seq}] ${label[s.speaker] ?? s.speaker}: ${s.text}`)
    .join('\n');
}

// ─── 2-bosqich: ekstraksiya ──────────────────────────────────────────────────

export const stage2Result = z.object({
  businessRelevance: z.enum(['sales', 'support', 'internal', 'spam', 'other']),
  callFamily: z.string().nullable(),
  serviceLine: z.string().nullable(),
  language: z.enum(['uz', 'ru', 'mixed', 'other']),
  client: z.object({
    name: z.string().nullable(),
    company: z.string().nullable(),
    role: z.string().nullable(),
    isDecisionMaker: z.boolean().nullable(),
  }),
  deal: z.object({
    amount: z.number().nullable(),
    currency: z.string().nullable(),
    stage: z.string().nullable(),
  }),
  signals: z.object({
    urgency: z.enum(['low', 'medium', 'high']).nullable(),
    budgetReaction: z.string().nullable(),
    objections: z.array(z.string()),
  }),
  commitments: z.array(
    z.object({
      party: z.enum(['manager', 'client']),
      description: z.string(),
      dueHint: z.string().nullable(),
      /** Muddat ISO formatda, model hisoblab beradi ("ertaga" → sana). */
      dueIso: z
        .string()
        .nullable()
        .refine((v) => v === null || !Number.isNaN(Date.parse(v)), 'noto\'g\'ri sana'),
    }),
  ),
  /**
   * FR-28: playbook anketasidagi savollarga suhbatdan topilgan javoblar.
   * `questionId` playbook.questionnaire.questions dagi `id` bilan mos
   * kelishi kerak — mos kelmasa analyze.ts uni tashlab yuboradi (kod
   * qat'iy tekshiradi, modelga ishonilmaydi — bu loyihaning umumiy qoidasi).
   */
  questionnaireAnswers: z.array(
    z.object({
      questionId: z.string(),
      answer: z.string().nullable(),
    }),
  ),
  /**
   * Mijozning oxirgi xabari javob kutayaptimi?
   *
   * `unansweredTurns` deterministik hisoblanadi, lekin u "javobsiz lid" ni
   * anglatmaydi: "Mayli, kelaman" ham javobsiz qoladi va bu normal.
   * Farqni faqat ma'noni tushunish orqali qo'yish mumkin — shuning uchun
   * model hal qiladi. Model javob bermasa (null) — ogohlantiramiz:
   * ortiqcha ogohlantirish shovqin, o'tkazib yuborilgan lid esa pul.
   */
  lastClientMessageNeedsReply: z.boolean().nullable(),
  summary: z.string(),
  confidence: z.number().min(0).max(1),
});

export type Stage2Result = z.infer<typeof stage2Result>;

/** Structured outputs uchun JSON sxema (min/max siz — ular zod'da). */
export const stage2Schema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: [
    'businessRelevance', 'callFamily', 'serviceLine', 'language',
    'client', 'deal', 'signals', 'commitments', 'questionnaireAnswers',
    'lastClientMessageNeedsReply', 'summary', 'confidence',
  ],
  properties: {
    businessRelevance: { type: 'string', enum: ['sales', 'support', 'internal', 'spam', 'other'] },
    callFamily: { type: ['string', 'null'] },
    serviceLine: { type: ['string', 'null'] },
    language: { type: 'string', enum: ['uz', 'ru', 'mixed', 'other'] },
    client: {
      type: 'object',
      additionalProperties: false,
      required: ['name', 'company', 'role', 'isDecisionMaker'],
      properties: {
        name: { type: ['string', 'null'] },
        company: { type: ['string', 'null'] },
        role: { type: ['string', 'null'] },
        isDecisionMaker: { type: ['boolean', 'null'] },
      },
    },
    deal: {
      type: 'object',
      additionalProperties: false,
      required: ['amount', 'currency', 'stage'],
      properties: {
        amount: { type: ['number', 'null'] },
        currency: { type: ['string', 'null'] },
        stage: { type: ['string', 'null'] },
      },
    },
    signals: {
      type: 'object',
      additionalProperties: false,
      required: ['urgency', 'budgetReaction', 'objections'],
      properties: {
        urgency: { type: ['string', 'null'], enum: ['low', 'medium', 'high', null] },
        budgetReaction: { type: ['string', 'null'] },
        objections: { type: 'array', items: { type: 'string' } },
      },
    },
    commitments: {
      type: 'array',
      description:
        'Suhbatdagi va\'dalar: kim nimani qachon qilishga so\'z berdi. Faqat aniq aytilganlar.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['party', 'description', 'dueHint', 'dueIso'],
        properties: {
          party: { type: 'string', enum: ['manager', 'client'] },
          description: { type: 'string' },
          dueHint: {
            type: ['string', 'null'],
            description: 'Muddat suhbatda qanday aytilgan bo\'lsa ("ertaga", "juma kuni")',
          },
          dueIso: {
            type: ['string', 'null'],
            description:
              'Muddat ISO 8601 sana sifatida (suhbat sanasidan hisoblang). Aniq muddat aytilmagan bo\'lsa null.',
          },
        },
      },
    },
    lastClientMessageNeedsReply: {
      type: ['boolean', 'null'],
      description:
        'Suhbat mijozning xabari bilan tugagan bo\'lsa: u javob kutayaptimi? Savol, iltimos yoki hal qilinmagan e\'tiroz bo\'lsa true. "Rahmat", "mayli kelaman" kabi yakuniy tasdiq bo\'lsa false. Suhbat menejer xabari bilan tugagan bo\'lsa null.',
    },
    questionnaireAnswers: {
      type: 'array',
      description:
        'Pastda ANKETA SAVOLLARI ro\'yxati berilgan bo\'lsa, har biriga suhbatdan topilgan javobni yozing. Suhbatda javob YO\'Q bo\'lsa answer:null (o\'ylab topmang). Ro\'yxat bo\'sh bo\'lsa — bo\'sh massiv qaytaring.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['questionId', 'answer'],
        properties: {
          questionId: { type: 'string' },
          answer: { type: ['string', 'null'] },
        },
      },
    },
    summary: { type: 'string' },
    confidence: { type: 'number' },
  },
};

export async function buildStage2Prompt(
  playbook: PlaybookBody,
  businessContext: string,
  transcript: string,
  /** "ertaga" kabi muddatlarni dueIso ga aylantirish uchun tayanch sana. */
  startedAt?: Date,
): Promise<{ system: string; user: string; templateVersion: number }> {
  const tpl = await loadTemplate('stage2_extract');
  const policy = playbook.classificationPolicy;

  const system = renderTemplate(tpl.content, {
    businessContext:
      [businessContext, playbook.promptNotes.stage2.businessContext]
        .filter(Boolean)
        .join('\n') || '(berilmagan)',
    callFamilies:
      policy.callFamilies.map((f) => `${f.key} — ${f.name}: ${f.description}`).join('\n') ||
      '(berilmagan)',
    serviceLines: policy.serviceLines.join(', ') || '(berilmagan)',
    questionnaire:
      playbook.questionnaire.questions.map((q) => `${q.id} — ${q.question}`).join('\n') ||
      '(anketa savollari yo\'q)',
    extractionHints: playbook.promptNotes.stage2.extractionHints,
  });

  const dateLine = startedAt ? `SUHBAT SANASI: ${startedAt.toISOString()}\n` : '';
  return {
    system,
    user: `${dateLine}YOZISHMA:\n${transcript}`,
    templateVersion: tpl.version,
  };
}

// ─── 3-bosqich: isbotli baholash ─────────────────────────────────────────────

export const stage3Result = z.object({
  scores: z.array(
    z.object({
      code: z.string(),
      score: z.number().int().min(0).max(3).nullable(),
      evidenceQuote: z.string().nullable(),
      evidenceSegment: z.number().int().nullable(),
      reasoning: z.string(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  primaryGap: z.string().nullable(),
  coaching: z.object({
    strengths: z.array(z.string()),
    improvements: z.array(z.string()),
    betterPhrases: z.array(z.object({ context: z.string(), suggestion: z.string() })),
  }),
  redFlags: z.array(z.object({ key: z.string(), quote: z.string() })),
  leadQuality: z.string().nullable(),
  compliance: z.enum(['ok', 'warning', 'violation']).nullable(),
});

export type Stage3Result = z.infer<typeof stage3Result>;

export const stage3Schema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['scores', 'primaryGap', 'coaching', 'redFlags', 'leadQuality', 'compliance'],
  properties: {
    scores: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'score', 'evidenceQuote', 'evidenceSegment', 'reasoning', 'confidence'],
        properties: {
          code: { type: 'string' },
          score: { type: ['integer', 'null'], enum: [0, 1, 2, 3, null] },
          evidenceQuote: { type: ['string', 'null'] },
          evidenceSegment: { type: ['integer', 'null'] },
          reasoning: { type: 'string' },
          confidence: { type: 'number' },
        },
      },
    },
    primaryGap: { type: ['string', 'null'] },
    coaching: {
      type: 'object',
      additionalProperties: false,
      required: ['strengths', 'improvements', 'betterPhrases'],
      properties: {
        strengths: { type: 'array', items: { type: 'string' } },
        improvements: { type: 'array', items: { type: 'string' } },
        betterPhrases: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['context', 'suggestion'],
            properties: {
              context: { type: 'string' },
              suggestion: { type: 'string' },
            },
          },
        },
      },
    },
    redFlags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'quote'],
        properties: { key: { type: 'string' }, quote: { type: 'string' } },
      },
    },
    leadQuality: { type: ['string', 'null'] },
    compliance: { type: ['string', 'null'], enum: ['ok', 'warning', 'violation', null] },
  },
};

function formatCriterion(c: Criterion): string {
  return [
    `${c.code}. ${c.name} — ${c.description}`,
    `   0: ${c.rubric['0']}`,
    `   1: ${c.rubric['1']}`,
    `   2: ${c.rubric['2']}`,
    `   3: ${c.rubric['3']}`,
  ].join('\n');
}

export async function buildStage3Prompt(
  playbook: PlaybookBody,
  applicable: Criterion[],
  transcript: string,
): Promise<{ system: string; user: string; templateVersion: number }> {
  const tpl = await loadTemplate('stage3_score');
  const criteria: Criteria = playbook.criteria;

  const byCategory = criteria.categories
    .slice()
    .sort((a, b) => a.order - b.order)
    .map((cat) => {
      const crits = applicable.filter((c) => c.categoryCode === cat.code);
      if (crits.length === 0) return null;
      return `KATEGORIYA ${cat.code}: ${cat.name} (vazn ${cat.weightPct}%)\n${crits
        .map(formatCriterion)
        .join('\n')}`;
    })
    .filter(Boolean)
    .join('\n\n');

  const system = renderTemplate(tpl.content, {
    criteria: byCategory,
    redFlags:
      playbook.classificationPolicy.redFlags
        .map((f) => `${f.key} — ${f.description} (${f.severity})`)
        .join('\n') || '(yo\'q)',
    scoringGuidance: playbook.promptNotes.stage3.scoringGuidance,
  });

  return { system, user: `YOZISHMA:\n${transcript}`, templateVersion: tpl.version };
}

// ─── AI Playbook Builder (FR-12) ─────────────────────────────────────────────

/**
 * LLM'dan kodlarni (A, A1, B2...) SO'RAMAYMIZ — faqat mazmunni.
 *
 * Sabab bu loyihaning umumiy tamoyili bilan bir xil: modelga aniq
 * qoidali narsani ishonmaymiz. Kategoriya kodini, mezon kodini va
 * vaznlar yig'indisini (aynan 100%) kod deterministik tuzadi
 * (`draftToPlaybookBody`). Model faqat kategoriya TARTIBI (categoryIndex)
 * va matnni beradi — bu joyda xato qilish imkoni yo'q.
 */
export const playbookDraftResult = z.object({
  categories: z.array(
    z.object({
      name: z.string().min(2).max(80),
      weightPct: z.number().min(0),
    }),
  ),
  criteria: z.array(
    z.object({
      categoryIndex: z.number().int().min(0),
      name: z.string().min(3).max(120),
      description: z.string().min(10).max(600),
      rubric0: z.string().min(5),
      rubric1: z.string().min(5),
      rubric2: z.string().min(5),
      rubric3: z.string().min(5),
    }),
  ),
  callFamilies: z.array(
    z.object({
      key: z.string().min(1).max(60),
      name: z.string().min(2).max(120),
      description: z.string().max(500),
      scored: z.boolean(),
    }),
  ),
  redFlags: z.array(
    z.object({
      key: z.string().min(1).max(60),
      description: z.string().min(5).max(400),
      severity: z.enum(['warning', 'critical']),
    }),
  ),
  vocabulary: z.array(z.string().min(1).max(80)),
});

export type PlaybookDraftResult = z.infer<typeof playbookDraftResult>;

export const playbookDraftSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['categories', 'criteria', 'callFamilies', 'redFlags', 'vocabulary'],
  properties: {
    categories: {
      type: 'array',
      minItems: 5,
      maxItems: 7,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'weightPct'],
        properties: {
          name: { type: 'string' },
          weightPct: { type: 'number', description: 'Taxminiy nisbat, kod normallashtiradi' },
        },
      },
    },
    criteria: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['categoryIndex', 'name', 'description', 'rubric0', 'rubric1', 'rubric2', 'rubric3'],
        properties: {
          categoryIndex: { type: 'integer', description: 'categories massividagi 0-indeksli tartib' },
          name: { type: 'string' },
          description: { type: 'string' },
          rubric0: { type: 'string', description: '0 ball: umuman qilinmadi' },
          rubric1: { type: 'string', description: '1 ball: juda yuzaki' },
          rubric2: { type: 'string', description: '2 ball: yaxshi, lekin to\'liq emas' },
          rubric3: { type: 'string', description: '3 ball: to\'liq va sifatli' },
        },
      },
    },
    callFamilies: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'name', 'description', 'scored'],
        properties: {
          key: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          scored: { type: 'boolean' },
        },
      },
    },
    redFlags: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['key', 'description', 'severity'],
        properties: {
          key: { type: 'string' },
          description: { type: 'string' },
          severity: { type: 'string', enum: ['warning', 'critical'] },
        },
      },
    },
    vocabulary: { type: 'array', items: { type: 'string' } },
  },
};

function formatProfileForPrompt(profile: BusinessProfile): string {
  const lines: string[] = [];
  const add = (label: string, v: string | number | null | string[]) => {
    if (v === null || v === '' || (Array.isArray(v) && v.length === 0)) return;
    lines.push(`${label}: ${Array.isArray(v) ? v.join(', ') : v}`);
  };
  add('Biznes tavsifi', profile.businessDescription);
  add('Asosiy mahsulot/xizmatlar', profile.primaryOffers);
  add('Mijozlar', profile.typicalCustomers);
  add('Mijoz muammosi', profile.customerProblem);
  add('Mijoz turi', profile.customerType);
  add('Lid manbalari', profile.leadSources);
  add('Sotuv modeli', profile.salesModel);
  add('Qo\'ng\'iroq yo\'nalishi', profile.callDirection);
  add('Qaror qabul qilish muddati', profile.salesCycle);
  add('O\'rtacha bitim', profile.avgDealAmount === null ? null : `${profile.avgDealAmount} ${profile.avgDealCurrency}`);
  add('Qaror qabul qiluvchi', profile.decisionMakers);
  add('Albatta aniqlanishi kerak', profile.mustCaptureFields);
  add('Odatiy savollar', profile.commonCustomerQuestions);
  add('Odatiy e\'tirozlar', profile.commonObjections);
  add('Muvaffaqiyat belgilari', profile.successSignals);
  add('Yomon ketish belgilari', profile.failureSignals);
  add('Qizil chiziqlar', profile.redLines);
  add('Ehtiyotkor mavzular', profile.sensitiveTopics);
  add('Tahlildan chiqariladigan', profile.excludedRoutes);
  add('Soha atamalari', profile.vocabulary);
  add('Qo\'shimcha', profile.additionalNotes);
  return lines.join('\n');
}

export async function buildPlaybookDraftPrompt(
  profile: BusinessProfile,
): Promise<{ system: string; user: string; templateVersion: number }> {
  const tpl = await loadTemplate('playbook_builder');
  const system = renderTemplate(tpl.content, { profile: formatProfileForPrompt(profile) });
  return {
    system,
    user: 'Yuqoridagi anketaga mos playbook tuzing.',
    templateVersion: tpl.version,
  };
}
