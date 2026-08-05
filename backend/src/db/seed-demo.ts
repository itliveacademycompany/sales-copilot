import { and, eq, inArray } from 'drizzle-orm';
import type { LlmClient, LlmJsonRequest, LlmJsonResponse } from '../ai/llm.js';
import { closeDb, withTenant, withoutTenantIsolation } from '../db/index.js';
import {
  appUser,
  business,
  businessMember,
  conversation,
  playbook,
  seat,
  task,
} from '../db/schema/index.js';
import { analyzeConversation } from '../ai/analyze.js';
import { claimNextJob, completeJob, enqueueAnalysis } from '../jobs/queue.js';
import { ingestMessage } from '../telegram/ingest.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DEMO MA'LUMOT — mavjud biznesga namunaviy suhbatlar yuklaydi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run seed:demo -- email@manzil
 *
 * Interfeysni ko'rish uchun: playbook, 2 sotuvchi, 5 suhbat (yaxshi/yomon/
 * o'rtacha/filtrlangan), va'dalar, ogohlantirishlar. LLM chaqirilmaydi —
 * baholar oldindan yozilgan mock'dan keladi, lekin isbot tekshiruvi
 * jumladan barcha haqiqiy quvur kodi ishlaydi.
 */

const email = process.argv[2];
if (!email) {
  console.error('Foydalanish: npm run seed:demo -- email@manzil');
  process.exit(1);
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;

interface Msg {
  from: 'client' | 'manager';
  text: string;
  offsetSec: number;
}

interface ConvSpec {
  chatId: string;
  clientTgId: string;
  managerTgId: string;
  startAt: Date;
  messages: Msg[];
  /** stage2 uchun */
  summary: string;
  confidence: number;
  /** Mijozning oxirgi xabari javob kutayaptimi (FR-132 shovqin filtri). */
  needsReply: boolean | null;
  commitments: { description: string; dueHint: string; dueIso: string }[];
  /** stage3 uchun: kod → [ball, isbot xabar indeksi] (null = aniqlanmadi) */
  scores: Record<string, [number, number] | null>;
  /** FR-28: playbook.questionnaire savollariga suhbatdan topilgan javoblar. */
  questionnaireAnswers?: { questionId: string; answer: string }[];
}

const now = Date.now();

const SPECS: ConvSpec[] = [
  {
    chatId: '9001',
    clientTgId: '500001',
    managerTgId: '1001',
    startAt: new Date(now - 3 * DAY),
    messages: [
      { from: 'client', text: 'Assalomu alaykum, frontend kursi haqida ma\'lumot olsam bo\'ladimi?', offsetSec: 0 },
      { from: 'manager', text: 'Assalomu alaykum! Albatta. Avval bilsam — dasturlashda tajribangiz bormi, qaysi maqsadda o\'rganmoqchisiz?', offsetSec: 180 },
      { from: 'client', text: 'Yo\'q, noldan boshlamoqchiman. Ish topish uchun kerak', offsetSec: 420 },
      { from: 'manager', text: 'Tushunarli. Noldan boshlovchilar uchun 6 oylik dastur bor: HTML/CSS dan React gacha, oxirida 3 ta portfolio loyiha va ishga joylashish bo\'yicha yordam. Narxi oyiga 1.2 mln so\'m', offsetSec: 600 },
      { from: 'client', text: 'Yaxshi ekan. O\'ylab ko\'raman', offsetSec: 900 },
      { from: 'manager', text: 'Albatta! Ertaga sizni bepul sinov darsiga yozib qo\'yay — ko\'rib keyin qaror qilasiz. Soat 18:00 qulaymi?', offsetSec: 1080 },
      { from: 'client', text: 'Mayli, kelaman', offsetSec: 1500 },
    ],
    summary: 'Mijoz frontend kursiga qiziqdi, noldan boshlaydi. Sinov darsiga yozildi.',
    confidence: 0.92,
    // "Mayli, kelaman" — yakuniy tasdiq, javob kutmaydi.
    needsReply: false,
    commitments: [
      {
        description: 'Mijozni bepul sinov darsiga yozish va eslatma yuborish',
        dueHint: 'ertaga 18:00',
        dueIso: new Date(now + DAY).toISOString(),
      },
    ],
    scores: {
      A1: [3, 1],
      A2: [3, 3],
      B1: [3, 3],
      B2: null,
      C1: [3, 5],
    },
  },
  {
    chatId: '9002',
    clientTgId: '500002',
    managerTgId: '1002',
    startAt: new Date(now - 2 * DAY),
    messages: [
      { from: 'client', text: 'Salom, SMM kursi narxi qancha?', offsetSec: 0 },
      { from: 'manager', text: 'Salom. 900 ming so\'m oyiga', offsetSec: 2700 },
      { from: 'client', text: 'Qimmat ekan, boshqa joylarda arzonroq', offsetSec: 3000 },
      { from: 'manager', text: 'Hozir aksiya bor, hujjatlarni bugun yuboraman sizga', offsetSec: 3300 },
    ],
    summary: 'Mijoz SMM kursi narxini so\'radi, qimmat dedi. Menejer qiymatni ochib bermadi.',
    confidence: 0.88,
    needsReply: null,
    commitments: [
      {
        description: 'Aksiya hujjatlarini mijozga yuborish',
        dueHint: 'bugun',
        dueIso: new Date(now - DAY - 2 * HOUR).toISOString(),
      },
    ],
    scores: {
      A1: null,
      A2: null,
      B1: [1, 1],
      B2: [0, 3],
      C1: [1, 3],
    },
  },
  {
    chatId: '9003',
    clientTgId: '500003',
    managerTgId: '1001',
    startAt: new Date(now - 1 * DAY),
    messages: [
      { from: 'client', text: 'Assalomu alaykum, bolam 12 yoshda, robototexnika to\'garagingiz bormi?', offsetSec: 0 },
      { from: 'manager', text: 'Assalomu alaykum! Bor, 10-14 yoshlilar guruhi seshanba va payshanba kunlari. Birinchi dars bepul', offsetSec: 480 },
      { from: 'client', text: 'Narxi qancha va qanday yozilsak bo\'ladi?', offsetSec: 720 },
    ],
    summary: 'Ota-ona robototexnika to\'garagi bilan qiziqdi. Oxirgi savoli javobsiz qoldi!',
    confidence: 0.85,
    // Narx va yozilish savoli — haqiqiy javobsiz lid.
    needsReply: true,
    commitments: [],
    scores: {
      A1: [2, 1],
      A2: null,
      B1: [2, 1],
      B2: null,
      C1: [0, 1],
    },
    questionnaireAnswers: [{ questionId: 'q_age', answer: '12 yosh' }],
  },
  {
    chatId: '9004',
    clientTgId: '500004',
    managerTgId: '1002',
    startAt: new Date(now - 5 * HOUR),
    messages: [
      { from: 'client', text: 'Salom, IELTS kursiga yozilmoqchiman, band 7 kerak', offsetSec: 0 },
      { from: 'manager', text: 'Salom! Ajoyib maqsad. Hozirgi darajangizni bilasizmi, mock test topshirganmisiz?', offsetSec: 240 },
      { from: 'client', text: 'O\'tgan oy 5.5 chiqdi', offsetSec: 480 },
      { from: 'manager', text: '5.5 dan 7 gacha odatda 4-5 oy kerak. Intensiv guruhimiz haftada 5 kun, narxi 1.5 mln oyiga. Shanba kuni darajani aniqlash testiga keling — bepul, keyin aniq reja tuzamiz', offsetSec: 720 },
      { from: 'client', text: 'Bo\'ldi, shanba kelaman', offsetSec: 960 },
    ],
    summary: 'IELTS 7 maqsadli mijoz. Diagnostika testiga yozildi.',
    confidence: 0.9,
    // "Bo'ldi, shanba kelaman" — yakuniy tasdiq.
    needsReply: false,
    commitments: [],
    scores: {
      A1: [3, 1],
      A2: [2, 3],
      B1: [2, 3],
      B2: [2, 3],
      C1: [2, 3],
    },
  },
  {
    /**
     * UZUN SUHBAT — ataylab 16 xabar.
     *
     * Frontend transkriptni 12 xabardan keyin kesadi
     * (`ConversationDetail.tsx` → `visibleSegments`). Qolgan namunalarda
     * eng uzuni 10 ta bo'lgani uchun "isbot yashiringan qismda" yo'li
     * umuman sinalmagan edi: isbotga bosilganda avval transkript
     * ochilishi, keyin o'sha xabarga sakrashi kerak.
     *
     * Shu sababli B1 va C1 isbotlari ataylab 12-indeksdan keyinda
     * (13 va 15) turibdi.
     */
    chatId: '9006',
    clientTgId: '500006',
    managerTgId: '1001',
    startAt: new Date(now - 8 * HOUR),
    messages: [
      { from: 'client', text: 'Assalomu alaykum. Kompaniyamiz xodimlari uchun korporativ ingliz tili kursi kerak edi', offsetSec: 0 },
      { from: 'manager', text: 'Assalomu alaykum! Albatta yordam beramiz. Avval aniqlab olay — nechta xodim va qaysi darajada?', offsetSec: 300 },
      { from: 'client', text: '14 kishi. Ko\'pchiligi boshlang\'ich, 3-4 tasi o\'rtacha darajada', offsetSec: 600 },
      { from: 'manager', text: 'Tushunarli. Xodimlar ingliz tilini qaysi ish vazifasida ishlatishadi — yozishmadami, uchrashuvdami, hujjat bilan ishlashdami?', offsetSec: 840 },
      { from: 'client', text: 'Asosan chet ellik yetkazib beruvchilar bilan yozishma va oyiga bir-ikki marta video uchrashuv', offsetSec: 1200 },
      { from: 'manager', text: 'Demak so\'zlashuv va biznes yozishma ustuvor. Unda grammatikaga emas, aynan shu ikkisiga urg\'u beramiz', offsetSec: 1440 },
      { from: 'client', text: 'Ha, aynan. Faqat darslar ish vaqtidan ajratmasa bo\'lardi', offsetSec: 1800 },
      { from: 'manager', text: 'Albatta, korporativ guruhlar odatda ertalab 08:00 da yoki ish kuni oxirida bo\'ladi. Sizga qaysi biri qulay?', offsetSec: 2100 },
      { from: 'client', text: 'Ertalab yaxshi bo\'lardi. Narxi qanday hisoblanadi?', offsetSec: 2400 },
      { from: 'manager', text: '14 kishilik guruh uchun oyiga 9 mln so\'m — bir xodimga 640 ming. Individual kursda bu 1.2 mln bo\'lardi, ya\'ni korporativ format deyarli ikki barobar tejaydi', offsetSec: 2700 },
      { from: 'client', text: 'Byudjetimiz oyiga 7 mln atrofida edi', offsetSec: 3000 },
      { from: 'manager', text: 'Tushundim. Ikkita yo\'l bor: guruhni 10 kishiga qisqartirib eng zarur xodimlardan boshlash, yoki haftada 3 kun formatiga o\'tish — ikkalasi ham 7 mln ichiga sig\'adi. Qaysi biri sizga foydaliroq?', offsetSec: 3300 },
      { from: 'client', text: 'Haftada 3 kun ma\'qulroq, hamma qatnashgani yaxshi', offsetSec: 3720 },
      { from: 'manager', text: 'Ajoyib tanlov. Demak 14 kishi, haftada 3 kun, ertalab 08:00, oyiga 6.8 mln so\'m. Darajani aniqlash uchun bepul test o\'tkazamiz va guruhni ikkiga bo\'lamiz', offsetSec: 3960 },
      { from: 'client', text: 'Test qachon bo\'ladi?', offsetSec: 4200 },
      { from: 'manager', text: 'Payshanba kuni soat 09:00 da o\'z ofisingizda o\'tkazsak bo\'ladi. Bugun kechqurun shartnoma loyihasini yuboraman, ertagacha ko\'rib chiqasiz', offsetSec: 4500 },
    ],
    summary: 'Korporativ ingliz tili kursi: 14 xodim, ertalabki format. Byudjet e\'tirozi format o\'zgartirish bilan hal qilindi, payshanbaga daraja testi kelishildi.',
    confidence: 0.94,
    // Oxirgi xabar menejerniki — mijoz javob kutmayapti.
    needsReply: false,
    commitments: [
      {
        description: 'Shartnoma loyihasini mijozga yuborish',
        dueHint: 'bugun kechqurun',
        dueIso: new Date(now + 6 * HOUR).toISOString(),
      },
      {
        description: 'Ofisda darajani aniqlash testini o\'tkazish',
        dueHint: 'payshanba 09:00',
        dueIso: new Date(now + 3 * DAY).toISOString(),
      },
    ],
    scores: {
      A1: [3, 3],
      A2: [3, 5],
      B1: [3, 13], // kesilgan qismda
      B2: [3, 11],
      C1: [3, 15], // kesilgan qismda, oxirgi xabar
    },
  },
];

/** Har suhbat birinchi xabari orqali aniqlanadi — mock shu bilan javob tanlaydi. */
class SeedLlm implements LlmClient {
  completeJson(req: LlmJsonRequest): Promise<LlmJsonResponse> {
    const spec = SPECS.find((s) => req.user.includes(s.messages[0]!.text));
    if (!spec) throw new Error('seed: suhbat topilmadi');

    const json =
      req.stage === 'stage2'
        ? {
            businessRelevance: 'sales',
            callFamily: 'yangi_lid',
            serviceLine: null,
            language: 'uz',
            client: { name: null, company: null, role: null, isDecisionMaker: null },
            deal: { amount: null, currency: 'UZS', stage: 'qiziqish' },
            signals: { urgency: 'medium', budgetReaction: null, objections: [] },
            commitments: spec.commitments.map((c) => ({ party: 'manager', ...c })),
            questionnaireAnswers: spec.questionnaireAnswers ?? [],
            lastClientMessageNeedsReply: spec.needsReply,
            summary: spec.summary,
            confidence: spec.confidence,
          }
        : {
            scores: Object.entries(spec.scores).map(([code, v]) => ({
              code,
              score: v === null ? null : v[0],
              evidenceQuote: v === null ? null : spec.messages[v[1]]!.text,
              evidenceSegment: v === null ? null : v[1],
              reasoning: 'demo',
              confidence: 0.9,
            })),
            primaryGap:
              spec.chatId === '9002'
                ? 'Narx qiymatsiz aytildi, ehtiyoj umuman so\'ralmadi'
                : spec.chatId === '9003'
                  ? 'Mijozning oxirgi savoli javobsiz qoldi'
                  : null,
            coaching: {
              strengths:
                spec.chatId === '9001'
                  ? ['Ehtiyoj chuqur ochildi', 'Aniq keyingi qadam belgilandi']
                  : spec.chatId === '9006'
                    ? [
                        'Byudjet e\'tirozi chegirma bilan emas, format o\'zgartirish bilan hal qilindi',
                        'Narx bir xodimga hisoblab, individual kurs bilan solishtirib berildi',
                      ]
                    : [],
              improvements:
                spec.chatId === '9002'
                  ? ['Narxdan oldin ehtiyojni so\'rang', 'Narxni qiymat bilan birga ayting']
                  : [],
              betterPhrases:
                spec.chatId === '9002'
                  ? [
                      {
                        context: 'Mijoz narx so\'raganda',
                        suggestion: 'Qaysi maqsadda o\'rganmoqchisiz? Shunga qarab eng mos dasturni taklif qilay',
                      },
                    ]
                  : [],
            },
            redFlags: [],
            leadQuality:
              spec.chatId === '9001' || spec.chatId === '9004' || spec.chatId === '9006'
                ? 'issiq'
                : 'iliq',
            compliance: 'ok',
          };

    return Promise.resolve({ json, model: 'demo-seed', tokensIn: 1200, tokensOut: 600, costUsd: 0.021 });
  }
}

async function main(): Promise<void> {
  // Biznesni email orqali topamiz.
  const found = await withoutTenantIsolation('seed: biznesni email orqali topish', async (tx) => {
    const [u] = await tx.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, email!));
    if (!u) return null;
    const [m] = await tx
      .select({ businessId: businessMember.businessId, name: business.name })
      .from(businessMember)
      .innerJoin(business, eq(business.id, businessMember.businessId))
      .where(eq(businessMember.userId, u.id));
    return m ?? null;
  });
  if (!found) {
    console.error(`Topilmadi: ${email} uchun biznes yo'q. Avval interfeys orqali ro'yxatdan o'ting.`);
    process.exit(1);
  }
  const businessId = found.businessId;
  console.log(`Biznes: ${found.name} (${businessId})`);

  // ─── Playbook (yo'q bo'lsa) ───
  const rubric = (s: string) => ({
    '0': `${s} umuman qilinmadi yoki mutlaqo noto'g'ri`,
    '1': `${s} juda yuzaki, shablon tarzda qilindi`,
    '2': `${s} yaxshi qilindi, lekin chuqurlik yetishmadi`,
    '3': `${s} to'liq, tabiiy va mijozga moslashtirilgan holda qilindi`,
  });
  await withTenant(businessId, async (tx) => {
    const [existing] = await tx
      .select({ id: playbook.id, questions: playbook.questionnaire })
      .from(playbook)
      .where(eq(playbook.isActive, true))
      .limit(1);
    const hasQuestionnaire =
      Array.isArray((existing?.questions as { questions?: unknown[] } | undefined)?.questions) &&
      ((existing?.questions as { questions: unknown[] }).questions.length > 0);
    if (existing && hasQuestionnaire) {
      console.log('Playbook allaqachon bor — o\'tkazib yuborildi');
      return;
    }
    if (existing) {
      // Demo skripti — ishlab chiqarish qoidasi (versiya o'zgarmasligi)
      // shu yerga tegishli emas, faqat sinov ma'lumotini yangilaymiz.
      await tx
        .update(playbook)
        .set({
          questionnaire: {
            title: 'Anketa',
            questions: [
              { id: 'q_age', question: 'O\'quvchining yoshi nechada?', answerType: 'text', required: false },
              { id: 'q_budget', question: 'Mijoz oylik byudjetini aytdimi?', answerType: 'text', required: false },
            ],
          },
        })
        .where(eq(playbook.id, existing.id));
      console.log('Mavjud playbook savolnomasi yangilandi');
      return;
    }
    await tx.insert(playbook).values({
      businessId,
      version: 1,
      isActive: true,
      origin: 'manual',
      activatedAt: new Date(),
      criteria: {
        categories: [
          { code: 'A', name: 'Ehtiyoj aniqlash', weightPct: 40, order: 0 },
          { code: 'B', name: 'Taqdimot va qiymat', weightPct: 35, order: 1 },
          { code: 'C', name: 'Yakunlash', weightPct: 25, order: 2 },
        ],
        criteria: [
          { code: 'A1', categoryCode: 'A', name: 'Ochuvchi savollar', description: 'Mijoz maqsadi va vaziyatini ochuvchi savollar berildi', rubric: rubric('Ochuvchi savollar berish'), appliesTo: { callFamilies: [], serviceLines: [], directions: [] }, isActive: true, order: 0 },
          { code: 'A2', categoryCode: 'A', name: 'Faol tinglash', description: 'Mijoz javobiga tayanib suhbat qurildi', rubric: rubric('Faol tinglash'), appliesTo: { callFamilies: [], serviceLines: [], directions: [] }, isActive: true, order: 1 },
          { code: 'B1', categoryCode: 'B', name: 'Yechim taqdimoti', description: 'Taklif mijoz ehtiyojiga bog\'lab taqdim etildi', rubric: rubric('Yechim taqdimoti'), appliesTo: { callFamilies: [], serviceLines: [], directions: [] }, isActive: true, order: 0 },
          { code: 'B2', categoryCode: 'B', name: 'E\'tiroz bilan ishlash', description: 'Narx/vaqt e\'tirozlari qadrlanib, qiymat orqali javob berildi', rubric: rubric('E\'tiroz bilan ishlash'), appliesTo: { callFamilies: [], serviceLines: [], directions: [] }, isActive: true, order: 1 },
          { code: 'C1', categoryCode: 'C', name: 'Keyingi qadam', description: 'Suhbat aniq, sanali keyingi qadam bilan yakunlandi', rubric: rubric('Keyingi qadamga kelishish'), appliesTo: { callFamilies: [], serviceLines: [], directions: [] }, isActive: true, order: 0 },
        ],
      },
      classificationPolicy: {
        callFamilies: [
          { key: 'yangi_lid', name: 'Yangi lid', description: 'Birinchi marta murojaat qilgan mijoz', scored: true },
          { key: 'mavjud_mijoz', name: 'Mavjud mijoz', description: 'O\'qiyotgan talaba xizmat masalasi', scored: false },
        ],
        redFlags: [
          { key: 'qopollik', description: 'Menejer mijozga qo\'pol yoki mensimay muomala qildi', severity: 'critical' },
          { key: 'yolgon', description: 'Menejer mavjud bo\'lmagan shart yoki chegirma va\'da qildi', severity: 'critical' },
        ],
        serviceLines: [],
      },
      questionnaire: {
        title: 'Anketa',
        questions: [
          { id: 'q_age', question: 'O\'quvchining yoshi nechada?', answerType: 'text', required: false },
          { id: 'q_budget', question: 'Mijoz oylik byudjetini aytdimi?', answerType: 'text', required: false },
        ],
      },
      promptNotes: {
        stage1: { vocabulary: [], contextHint: '' },
        stage2: { businessContext: '', extractionHints: '', taskGuidance: '' },
        stage3: { scoringGuidance: '', coachingNotes: '', complianceNotes: '' },
      },
      leadQuality: {},
    });
    console.log('Playbook yaratildi (3 kategoriya, 5 mezon)');
  });

  // ─── Sotuvchilar ───
  const mkSeat = async (name: string, tgId: string): Promise<void> => {
    await withTenant(businessId, async (tx) => {
      const [existing] = await tx
        .select({ id: seat.id })
        .from(seat)
        .where(eq(seat.telegramId, tgId));
      if (existing) return;
      await tx.insert(seat).values({
        businessId,
        displayName: name,
        telegramId: tgId,
        telegramLinked: true,
        isActive: true,
      });
    });
  };
  await mkSeat('Malika Karimova', '1001');
  await mkSeat('Sardor Aliyev', '1002');
  console.log('Sotuvchilar: Malika (tg 1001), Sardor (tg 1002)');

  /**
   * Eski demo suhbatlarini tozalash — skript qayta ishga tushirilsa
   * ma'lumot ikkilanmasin. Faqat demo chat id lari o'chiriladi
   * (9001-9005), haqiqiy yozishmalarga tegilmaydi.
   */
  const demoChatIds = [...SPECS.map((s) => s.chatId), '9005'];
  const removed = await withTenant(businessId, async (tx) => {
    const old = await tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(inArray(conversation.externalThreadId, demoChatIds));
    if (old.length === 0) return 0;
    const ids = old.map((o) => o.id);
    // task.conversation_id `set null` bilan o'chadi — vazifalar yetim
    // qolmasligi uchun avval o'zimiz olib tashlaymiz.
    await tx.delete(task).where(inArray(task.conversationId, ids));
    await tx.delete(conversation).where(inArray(conversation.id, ids));
    return ids.length;
  });
  if (removed > 0) console.log(`Eski demo suhbatlari tozalandi: ${removed}`);

  // ─── Xabarlar ───
  let msgId = Math.floor(now / 1000) % 1_000_000;
  for (const spec of SPECS) {
    for (const m of spec.messages) {
      await ingestMessage({
        businessId,
        chatId: spec.chatId,
        messageId: String(msgId++),
        senderId: m.from === 'manager' ? spec.managerTgId : spec.clientTgId,
        senderIsBot: false,
        text: m.text,
        sentAt: new Date(spec.startAt.getTime() + m.offsetSec * 1000),
      });
    }
  }
  // Filtrlangan namuna: faqat /start
  await ingestMessage({
    businessId,
    chatId: '9005',
    messageId: String(msgId++),
    senderId: '500005',
    senderIsBot: false,
    text: '/start',
    sentAt: new Date(now - 6 * HOUR),
  });
  console.log(`Xabarlar yozildi (${SPECS.length + 1} suhbat)`);

  // ─── Tahlil: faqat shu biznes suhbatlari, mock LLM bilan ───
  const ours = await withTenant(businessId, (tx) =>
    tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(and(eq(conversation.channel, 'telegram'), eq(conversation.status, 'received'))),
  );
  for (const c of ours) await enqueueAnalysis(businessId, c.id);

  const llm = new SeedLlm();
  const ourIds = new Set(ours.map((c) => c.id));
  let analyzed = 0;
  for (;;) {
    const job = await claimNextJob('seed');
    if (!job) break;
    if (!ourIds.has(job.conversationId)) {
      // Begona (eski test) ishlar — tegmaymiz, shunchaki yopamiz.
      await completeJob(job.id);
      continue;
    }
    try {
      const result = await analyzeConversation(llm, job.businessId, job.conversationId);
      await completeJob(job.id);
      analyzed++;
      console.log(`  ${job.conversationId.slice(0, 8)}… → ${result.status}`);
    } catch (err) {
      console.error(`  xato: ${err instanceof Error ? err.message : String(err)}`);
      await completeJob(job.id);
    }
  }
  console.log(`Tahlil qilindi: ${analyzed} suhbat`);
  console.log('\nDemo tayyor! Interfeysni yangilang.');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
