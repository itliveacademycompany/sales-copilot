import { and, eq, inArray, sql } from 'drizzle-orm';
import type { LlmClient, LlmJsonRequest, LlmJsonResponse } from '../ai/llm.js';
import { analyzeConversation } from '../ai/analyze.js';
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
import { claimNextJob, completeJob, enqueueAnalysis } from '../jobs/queue.js';
import { ingestMessage } from '../telegram/ingest.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BIR OYLIK DEMO MA'LUMOT — analitikaning HAMMA bloki to'lishi uchun
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish:  npm run seed:month -- email@manzil
 *   ixtiyoriy:      npm run seed:month -- email@manzil --kunlar=30 --tozala
 *
 * ── Nega haqiqiy quvurdan o'tkaziladi ───────────────────────────────────────
 * Jadvallarga to'g'ridan-to'g'ri yozish oson bo'lardi, lekin natija
 * mahsulot ishlab chiqaradigan ma'lumotdan farq qilardi: isbot tekshiruvi,
 * baholash chegaralari, vazifa va ogohlantirish yaratish — bularning
 * hammasi `analyzeConversation` ichida. Shuning uchun bu skript faqat
 * XABARLARNI yozadi va LLM o'rniga mock qo'yadi; qolgan hamma narsa
 * haqiqiy kod bilan hosil bo'ladi.
 *
 * ── Nega tasodifiy emas, urug'li generator ──────────────────────────────────
 * `Math.random()` ishlatilsa, har ishga tushirishda boshqa raqam chiqib,
 * "kecha 62% edi, bugun 74%" degan tushunarsiz farq paydo bo'lardi.
 * Urug'li generator bir xil kirishda bir xil natija beradi.
 *
 * ── Xavfsizlik ──────────────────────────────────────────────────────────────
 * Barcha demo suhbatlar `DEMO_PREFIX` bilan boshlanadigan chat id oladi.
 * `--tozala` faqat shularni o'chiradi — haqiqiy yozishmalarga tegmaydi.
 */

const args = process.argv.slice(2);
const email = args.find((a) => !a.startsWith('--'));
const kunlar = Number(args.find((a) => a.startsWith('--kunlar='))?.split('=')[1] ?? 30);
const faqatTozala = args.includes('--tozala');

if (!email) {
  console.error(
    'Foydalanish: npm run seed:month -- email@manzil [--kunlar=30] [--tozala]\n' +
      '  --tozala  avvalgi demo suhbatlarni o\'chiradi (haqiqiy yozishmalarga tegmaydi)',
  );
  process.exit(1);
}

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** Demo suhbatlarni ajratib turadigan prefiks — tozalash shu bo'yicha. */
const DEMO_PREFIX = '77';

/** Urug'li generator (mulberry32) — takrorlanadigan "tasodif". */
function generator(urug: number) {
  let a = urug;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = generator(20260811);
const tanla = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)]!;
const oraliq = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));

// ─── Suhbat qoliplari ────────────────────────────────────────────────────────
// Har qolip: mavzu, xabarlar, natija sifati. Sifat "yaxshi/o'rta/yomon"
// bo'lishi analitikadagi taqsimotlarni real qiladi — hammasi 90% bo'lsa
// "zaif joy" bloklari bo'sh qolardi.

type Sifat = 'yaxshi' | 'orta' | 'yomon';

interface Qolip {
  mavzu: string;
  xizmat: string | null;
  sifat: Sifat;
  /** `support` — mavjud mijoz xizmat masalasi. */
  tur: 'sales' | 'support';
  xabarlar: { kim: 'client' | 'manager'; matn: string }[];
  xulosa: string;
  etirozlar: string[];
  byudjet: string | null;
  summa: number | null;
  /** Mijozning oxirgi xabari javob kutayaptimi. */
  javobKutadi: boolean | null;
  vada: string | null;
  qizilBayroq: string | null;
}

const QOLIPLAR: Qolip[] = [
  {
    mavzu: 'frontend',
    xizmat: 'Frontend kursi',
    sifat: 'yaxshi',
    tur: 'sales',
    xabarlar: [
      { kim: 'client', matn: 'Assalomu alaykum, frontend kursi haqida bilsam bo\'ladimi?' },
      { kim: 'manager', matn: 'Assalomu alaykum! Men IT Live Academy dan Malikaman. Avval bilsam — dasturlashda tajribangiz bormi va qaysi maqsadda o\'rganmoqchisiz?' },
      { kim: 'client', matn: 'Noldan boshlamoqchiman, ish topish uchun kerak' },
      { kim: 'manager', matn: 'Tushunarli. Noldan boshlovchilar uchun 6 oylik dastur bor: HTML/CSS dan React gacha, oxirida 3 ta portfolio loyiha. Narxi oyiga 1 200 000 so\'m' },
      { kim: 'client', matn: 'Yaxshi ekan, sinov darsiga kelsam bo\'ladimi?' },
      { kim: 'manager', matn: 'Albatta! Ertaga soat 18:00 ga yozib qo\'yaman, manzilni Telegram orqali yuboraman. Kelishdikmi?' },
      { kim: 'client', matn: 'Mayli, kelaman' },
    ],
    xulosa: 'Mijoz frontend kursiga qiziqdi, noldan boshlaydi. Sinov darsiga yozildi.',
    etirozlar: [],
    byudjet: null,
    summa: 1_200_000,
    javobKutadi: false,
    vada: 'Sinov darsiga yozib, manzilni yuborish',
    qizilBayroq: null,
  },
  {
    mavzu: 'narx-etiroz',
    xizmat: 'SMM kursi',
    sifat: 'yomon',
    tur: 'sales',
    xabarlar: [
      { kim: 'client', matn: 'Salom, SMM kursi narxi qancha?' },
      { kim: 'manager', matn: 'Salom. 900 ming so\'m oyiga' },
      { kim: 'client', matn: 'Qimmat ekan, boshqa joyda 600 mingga bor' },
      { kim: 'manager', matn: 'Hozir aksiya bor, hujjatlarni yuboraman' },
    ],
    xulosa: 'Mijoz SMM kursi narxini so\'radi, qimmat dedi. Menejer qiymatni ochib bermadi.',
    etirozlar: ['narxi qimmat', 'boshqa joyda arzonroq'],
    byudjet: 'Qimmat, boshqa joyda arzonroq',
    summa: 900_000,
    javobKutadi: null,
    vada: 'Aksiya hujjatlarini yuborish',
    qizilBayroq: null,
  },
  {
    mavzu: 'bola-kursi',
    xizmat: 'IT Kids',
    sifat: 'orta',
    tur: 'sales',
    xabarlar: [
      { kim: 'client', matn: 'Assalomu alaykum, bolam uchun kurs qidiryapman' },
      { kim: 'manager', matn: 'Assalomu alaykum! IT Kids yo\'nalishimiz bor. Farzandingiz necha yoshda?' },
      { kim: 'client', matn: '12 yoshda' },
      { kim: 'manager', matn: '12 yosh uchun Scratch va Python asoslari guruhi mos keladi. Haftada 3 kun, oyiga 800 000 so\'m' },
      { kim: 'client', matn: 'O\'ylab ko\'ramiz, uyda maslahatlashaman' },
    ],
    xulosa: 'Ota-ona 12 yoshli bola uchun IT Kids kursini so\'radi, o\'ylab ko\'raman dedi.',
    etirozlar: ['maslahatlashaman'],
    byudjet: null,
    summa: 800_000,
    javobKutadi: null,
    vada: null,
    qizilBayroq: null,
  },
  {
    mavzu: 'masofa',
    xizmat: 'Kompyuter savodxonligi',
    sifat: 'orta',
    tur: 'sales',
    xabarlar: [
      { kim: 'client', matn: 'Salom, kompyuter savodxonligi kursi bormi?' },
      { kim: 'manager', matn: 'Salom! Ha, bor. Qaysi hududdansiz, markazimizga kelish qulaymi?' },
      { kim: 'client', matn: 'Men Zomindanman, markazingiz uzoq ekan' },
      { kim: 'manager', matn: 'Tushundim. Onlayn format ham bor, darslar yozib beriladi. Sizga qulay bo\'ladimi?' },
      { kim: 'client', matn: 'Onlayn qiziq emas, o\'zim borib o\'rgansam yaxshi edi' },
    ],
    xulosa: 'Mijoz masofa tufayli ikkilandi, onlayn formatni rad etdi.',
    etirozlar: ['markazingiz uzoq ekan', 'onlayn qiziq emas'],
    byudjet: null,
    summa: null,
    javobKutadi: true,
    vada: null,
    qizilBayroq: null,
  },
  {
    mavzu: 'vaqt-yoq',
    xizmat: 'Sun\'iy intellekt',
    sifat: 'orta',
    tur: 'sales',
    xabarlar: [
      { kim: 'client', matn: 'Sun\'iy intellekt kursi haqida ma\'lumot bering' },
      { kim: 'manager', matn: 'Albatta! Kurs 4 oylik, amaliy loyihalar bilan. Hozir qaysi sohada ishlaysiz?' },
      { kim: 'client', matn: 'Buxgalterman. Lekin hozir vaqtim yo\'q, keyinroq' },
      { kim: 'manager', matn: 'Tushundim. Kechki guruh bor, 19:00 dan. Keyingi oy boshlanadi, sizni ro\'yxatga qo\'shib qo\'yaymi?' },
      { kim: 'client', matn: 'Hozircha yo\'q, o\'zim bog\'lanaman' },
    ],
    xulosa: 'Mijoz qiziqdi, lekin vaqt yo\'qligi sababli qarorni keyinga qoldirdi.',
    etirozlar: ['hozir vaqtim yo\'q'],
    byudjet: null,
    summa: null,
    javobKutadi: false,
    vada: null,
    qizilBayroq: null,
  },
  {
    mavzu: 'korporativ',
    xizmat: 'Web dasturlash',
    sifat: 'yaxshi',
    tur: 'sales',
    xabarlar: [
      { kim: 'client', matn: 'Kompaniyamiz uchun web dasturlash bo\'yicha korporativ kurs kerak' },
      { kim: 'manager', matn: 'Assalomu alaykum, men IT Live Academy dan Malikaman. Necha xodim va qanday darajadan boshlaymiz?' },
      { kim: 'client', matn: '14 kishi, ko\'pchiligi noldan' },
      { kim: 'manager', matn: '14 kishilik guruh uchun oyiga 9 000 000 so\'m — bir xodimga 640 ming. Individual kursda bu 1.2 mln bo\'lardi, ya\'ni korporativ format deyarli ikki barobar tejaydi' },
      { kim: 'client', matn: 'Byudjetimiz oyiga 7 mln atrofida edi' },
      { kim: 'manager', matn: 'Tushundim. Haftada 3 kun formatiga o\'tsak, 6 800 000 so\'m bo\'ladi va hamma xodim qatnashadi. Shu ma\'qulmi?' },
      { kim: 'client', matn: 'Ha, shu ma\'qul. Qachon boshlaymiz?' },
      { kim: 'manager', matn: 'Payshanba soat 09:00 da ofisingizda daraja testini o\'tkazamiz, bugun kechqurun shartnoma loyihasini yuboraman' },
    ],
    xulosa: 'Korporativ web dasturlash kursi: 14 xodim. Byudjet e\'tirozi format o\'zgartirish bilan hal qilindi.',
    etirozlar: ['byudjetimiz cheklangan'],
    byudjet: 'Byudjet 7 mln atrofida',
    summa: 6_800_000,
    javobKutadi: false,
    vada: 'Shartnoma loyihasini yuborish',
    qizilBayroq: null,
  },
  {
    mavzu: 'qopollik',
    xizmat: null,
    sifat: 'yomon',
    tur: 'sales',
    xabarlar: [
      { kim: 'client', matn: 'Kurs narxlaringiz juda oshib ketibdi, nega bunday?' },
      { kim: 'manager', matn: 'Narx shunday, yoqmasa boshqa joyga borishingiz mumkin' },
      { kim: 'client', matn: 'Shunday deysizmi? Yaxshi' },
    ],
    xulosa: 'Menejer narx e\'tiroziga qo\'pol javob berdi, mijoz suhbatni to\'xtatdi.',
    etirozlar: ['narxi qimmat'],
    byudjet: 'Narxlar oshib ketgan',
    summa: null,
    javobKutadi: null,
    vada: null,
    qizilBayroq: 'qopollik',
  },
  {
    mavzu: 'dars-sifati',
    xizmat: null,
    sifat: 'yaxshi',
    tur: 'support',
    xabarlar: [
      { kim: 'client', matn: 'Salom, o\'g\'lim darslarga bormay qo\'ydi, issiq juda' },
      { kim: 'manager', matn: 'Assalomu alaykum! Tushundim, issiqda qiyin. Qolib ketgan darslarni keyin qo\'shimcha kelib o\'rganib olsa bo\'ladi' },
      { kim: 'client', matn: 'Rahmat, unda sentyabrda davom etamiz' },
      { kim: 'manager', matn: 'Albatta. Sentyabr boshida o\'zim bog\'lanib, qulay vaqtni kelishamiz. Darslar sifatidan mamnunmisiz?' },
      { kim: 'client', matn: 'Ha, ustoz yaxshi tushuntiradi' },
    ],
    xulosa: 'Mavjud mijoz issiq tufayli darsga kelmadi, sentyabrga kelishildi.',
    etirozlar: ['juda issiq'],
    byudjet: null,
    summa: null,
    javobKutadi: false,
    vada: 'Sentyabr boshida bog\'lanib, qulay vaqtni kelishish',
    qizilBayroq: null,
  },
  {
    mavzu: 'tolov',
    xizmat: null,
    sifat: 'orta',
    tur: 'support',
    xabarlar: [
      { kim: 'client', matn: 'To\'lovni kechiktirsam bo\'ladimi?' },
      { kim: 'manager', matn: 'Salom! Ha, bo\'lakma-bo\'lak to\'lash imkoni bor. Qachonga qadar qulay bo\'ladi?' },
      { kim: 'client', matn: 'Oyning 20-siga' },
      { kim: 'manager', matn: 'Yaxshi, 20-sanaga belgilab qo\'yaman' },
    ],
    xulosa: 'Mavjud mijoz to\'lovni kechiktirishni so\'radi, 20-sanaga kelishildi.',
    etirozlar: [],
    byudjet: null,
    summa: null,
    javobKutadi: false,
    vada: 'To\'lov muddatini 20-sanaga o\'tkazish',
    qizilBayroq: null,
  },
  {
    mavzu: 'javobsiz',
    xizmat: 'Frontend kursi',
    sifat: 'yomon',
    tur: 'sales',
    xabarlar: [
      { kim: 'client', matn: 'Salom, kurs boshlanish sanasi aniq bo\'ldimi?' },
      { kim: 'manager', matn: 'Salom, aniqlab aytaman' },
      { kim: 'client', matn: 'Kutyapman, iltimos bugun ayting' },
    ],
    xulosa: 'Mijoz kurs sanasini so\'radi, menejer aniq javob bermadi va yozishma javobsiz qoldi.',
    etirozlar: [],
    byudjet: null,
    summa: null,
    javobKutadi: true,
    vada: 'Kurs boshlanish sanasini aniqlab, mijozga aytish',
    qizilBayroq: null,
  },
];

/** Sifatga qarab ball oralig'i (0..3). */
const BALL: Record<Sifat, [number, number]> = {
  yaxshi: [2, 3],
  orta: [1, 3],
  yomon: [0, 2],
};

const LID_SIFAT: Record<Sifat, string> = {
  yaxshi: 'hot',
  orta: 'warm',
  yomon: 'cold',
};

interface Suhbat {
  chatId: string;
  clientTgId: string;
  managerTgId: string;
  boshlanish: Date;
  qolip: Qolip;
}

/** Suhbat bo'yicha mock javob — birinchi xabar matni orqali topiladi. */
const suhbatlar: Suhbat[] = [];

class OyLlm implements LlmClient {
  constructor(
    private mezonlar: { code: string; categoryCode: string }[],
    private oilalar: string[],
    private savollar: { id: string; question: string }[],
  ) {}

  completeJson(req: LlmJsonRequest): Promise<LlmJsonResponse> {
    const s = suhbatlar.find((x) => req.user.includes(x.qolip.xabarlar[0]!.matn));
    if (!s) throw new Error('seed: suhbat topilmadi');
    const q = s.qolip;

    if (req.stage === 'stage2') {
      const oila =
        q.tur === 'support'
          ? (this.oilalar.find((o) => o.includes('mavjud')) ?? this.oilalar[0]!)
          : (this.oilalar.find((o) => o.includes('lid') || o.includes('yangi')) ??
            this.oilalar[0]!);
      return this.javob({
        businessRelevance: q.tur,
        callFamily: oila,
        serviceLine: q.xizmat,
        language: 'uz',
        client: {
          name: null,
          phone: null,
          company: null,
          role: null,
          isDecisionMaker: q.mavzu === 'korporativ' ? true : null,
        },
        deal: { amount: q.summa, currency: q.summa ? 'UZS' : null, stage: null },
        signals: {
          urgency: q.sifat === 'yaxshi' ? 'high' : q.sifat === 'orta' ? 'medium' : 'low',
          budgetReaction: q.byudjet,
          objections: q.etirozlar,
        },
        commitments: q.vada
          ? [
              {
                party: 'manager',
                description: q.vada,
                dueHint: 'yaqin kunlarda',
                dueIso: new Date(s.boshlanish.getTime() + 2 * DAY).toISOString(),
              },
            ]
          : [],
        // Anketa javoblari faqat mos qoliplarda — hamma suhbatda
        // bo'lsa, "javob berilmagan" holati umuman ko'rinmasdi.
        questionnaireAnswers: this.savollar.map((sv) => ({
          questionId: sv.id,
          answer:
            q.mavzu === 'bola-kursi' && /yosh/i.test(sv.question)
              ? '12 yoshda'
              : /qayerdan|manba/i.test(sv.question)
                ? tanla(['Instagram', 'Telegram kanal', 'Do\'stim aytdi', 'Facebook reklama'])
                : null,
        })),
        lastClientMessageNeedsReply: q.javobKutadi,
        summary: q.xulosa,
        confidence: q.sifat === 'yomon' ? 0.72 : 0.93,
      });
    }

    // ─── stage3: isbot HAR DOIM haqiqiy xabardan olinadi ───
    // `verifyEvidence` iqtibosni transkriptdan qidiradi; o'ylab topilgan
    // matn bo'lsa ball bekor qilinardi va demo bo'sh ko'rinardi.
    const [min, max] = BALL[q.sifat];
    const menejerXabarlar = q.xabarlar
      .map((m, i) => ({ ...m, i }))
      .filter((m) => m.kim === 'manager');

    const scores = this.mezonlar.map((m, idx) => {
      // Ba'zi mezonlar ataylab "aniqlanmadi" — bu haqiqiy hayotda ham
      // shunday va UI'dagi "unknown" hisoblagichlari shu bilan to'ladi.
      if (rnd() < 0.12) {
        return {
          code: m.code,
          score: null,
          evidenceQuote: null,
          evidenceSegment: null,
          reasoning: 'Suhbatda bu mezonga oid aniq dalil topilmadi.',
          confidence: 0.4,
        };
      }
      const manba = menejerXabarlar[idx % menejerXabarlar.length]!;
      return {
        code: m.code,
        score: oraliq(min, max),
        evidenceQuote: manba.matn,
        evidenceSegment: manba.i,
        reasoning: `Menejerning "${manba.matn.slice(0, 40)}…" javobiga qarab baholandi.`,
        confidence: 0.85,
      };
    });

    return this.javob({
      scores,
      primaryGap:
        q.sifat === 'yomon'
          ? 'Mijoz e\'tirozi qiymat orqali ochib berilmadi'
          : q.sifat === 'orta'
            ? 'Aniq keyingi qadam kelishilmadi'
            : null,
      coaching: {
        strengths:
          q.sifat === 'yaxshi'
            ? ['Ehtiyoj chuqur ochildi', 'Aniq keyingi qadam belgilandi', 'Iliq va professional ohang']
            : q.sifat === 'orta'
              ? ['Mijoz bilan muloyim muloqot qilindi']
              : [],
        improvements:
          q.sifat === 'yomon'
            ? ['Narxdan oldin ehtiyojni so\'rang', 'E\'tirozga qiymat bilan javob bering']
            : q.sifat === 'orta'
              ? ['Suhbat oxirida aniq sana va vaqt kelishing']
              : [],
        betterPhrases:
          q.sifat === 'yaxshi'
            ? []
            : [
                {
                  context: 'Mijoz e\'tiroz bildirganda',
                  suggestion:
                    'Tushunaman. Aynan qaysi jihati muhim — narxmi yoki natijami? Shunga qarab eng mos formatni taklif qilay.',
                },
              ],
      },
      redFlags: q.qizilBayroq
        ? [{ key: q.qizilBayroq, quote: menejerXabarlar[0]!.matn }]
        : [],
      leadQuality: LID_SIFAT[q.sifat],
      compliance: q.qizilBayroq ? 'violation' : 'ok',
    });
  }

  private javob(json: unknown): Promise<LlmJsonResponse> {
    return Promise.resolve({
      json,
      model: 'demo-oylik',
      tokensIn: 1400,
      tokensOut: 700,
      costUsd: 0.018,
    });
  }
}

async function main(): Promise<void> {
  const found = await withoutTenantIsolation('seed: biznesni topish', async (tx) => {
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
    console.error(`Topilmadi: ${email} uchun biznes yo'q.`);
    process.exit(1);
  }
  const businessId = found.businessId;
  console.log(`Biznes: ${found.name} (${businessId})`);

  // ─── Eski demo suhbatlarini tozalash ───
  const tozalandi = await withTenant(businessId, async (tx) => {
    const eski = await tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(sql`${conversation.externalThreadId} like ${`${DEMO_PREFIX}%`}`);
    if (eski.length === 0) return 0;
    const ids = eski.map((o) => o.id);
    // task.conversation_id `set null` — yetim vazifa qolmasligi uchun
    // avval o'zimiz olib tashlaymiz.
    await tx.delete(task).where(inArray(task.conversationId, ids));
    await tx.delete(conversation).where(inArray(conversation.id, ids));
    return ids.length;
  });
  if (tozalandi > 0) console.log(`Eski demo suhbatlari o'chirildi: ${tozalandi}`);
  if (faqatTozala) {
    console.log('Faqat tozalash so\'ralgan edi — tayyor.');
    return;
  }

  // ─── Faol playbookdan mezon, oila va savollarni olamiz ───
  const pb = await withTenant(businessId, async (tx) => {
    const [row] = await tx
      .select({
        criteria: playbook.criteria,
        classificationPolicy: playbook.classificationPolicy,
        questionnaire: playbook.questionnaire,
      })
      .from(playbook)
      .where(eq(playbook.isActive, true))
      .orderBy(sql`version desc`)
      .limit(1);
    return row ?? null;
  });
  if (!pb) {
    console.error('Faol playbook topilmadi. Avval playbook yarating.');
    process.exit(1);
  }
  const mezonlar = (
    (pb.criteria as { criteria?: { code: string; categoryCode: string; isActive?: boolean }[] })
      .criteria ?? []
  ).filter((c) => c.isActive !== false);
  const oilalar = (
    (pb.classificationPolicy as { callFamilies?: { key: string }[] }).callFamilies ?? []
  ).map((f) => f.key);
  const savollar = (
    (pb.questionnaire as { questions?: { id: string; question: string }[] }).questions ?? []
  );
  console.log(
    `Playbook: ${mezonlar.length} mezon, ${oilalar.length} oila, ${savollar.length} savol`,
  );

  // ─── Sotuvchilar ───
  const seatlar = await withTenant(businessId, (tx) =>
    tx
      .select({ id: seat.id, tg: seat.telegramId, nom: seat.displayName })
      .from(seat)
      .where(and(eq(seat.isActive, true), sql`${seat.telegramId} is not null`)),
  );
  if (seatlar.length === 0) {
    console.error('Telegram ga bog\'langan sotuvchi yo\'q. Avval sotuvchi qo\'shing.');
    process.exit(1);
  }
  console.log(`Sotuvchilar: ${seatlar.map((s) => s.nom).join(', ')}`);

  /**
   * ── Suhbatlarni tarqatish ───────────────────────────────────────────────
   * Kunlar teng emas: hafta oxiri kam, ish kunlari ko'p. Bu "faollik
   * tendensiyasi" grafigini haqiqiy ko'rsatadi — tekis chiziq esa
   * grafikni ma'nosiz qilardi.
   */
  const bugun = Date.now();
  let chatSanoq = 0;
  /**
   * ── Takroriy mijozlar ───────────────────────────────────────────────────
   * Kontakt CHAT ID bo'yicha aniqlanadi (`ingest.ts`), shuning uchun bir
   * mijozning bir necha suhbati bo'lishi uchun o'sha chat qayta
   * ishlatilishi kerak. Bu shunchaki "chiroyli" ma'lumot emas: lid
   * tafsiloti sahifasining butun ma'nosi — bitta mijozning BUTUN
   * tarixini ko'rsatish. Har chat bitta suhbatdan iborat bo'lsa,
   * xronologiya, follow-up ritmi va ball tendensiyasi bo'sh qolardi.
   *
   * Menejer chatga biriktirilib qoladi: real hayotda ham mijozni
   * odatda bitta odam olib boradi.
   */
  const chatlar: { chatId: string; clientTgId: string; managerTgId: string }[] = [];

  for (let kun = kunlar; kun >= 0; kun--) {
    const sana = new Date(bugun - kun * DAY);
    const haftaKuni = sana.getDay(); // 0 = yakshanba
    if (haftaKuni === 0) continue; // yakshanba dam
    const soni = haftaKuni === 6 ? oraliq(1, 2) : oraliq(2, 5);

    for (let i = 0; i < soni; i++) {
      const qolip = tanla(QOLIPLAR);
      const s = tanla(seatlar);
      const boshSoat = oraliq(9, 18);
      const boshlanish = new Date(sana);
      boshlanish.setHours(boshSoat, oraliq(0, 59), 0, 0);

      // Har uchinchi suhbat — QAYTGAN mijoz (pool to'lgandan keyin).
      const qaytgan = chatlar.length >= 8 && rnd() < 0.38;
      const chat = qaytgan
        ? chatlar[Math.floor(rnd() * chatlar.length)]!
        : (() => {
            const yangi = {
              chatId: `${DEMO_PREFIX}${String(chatSanoq).padStart(4, '0')}`,
              clientTgId: `9${String(100000 + chatSanoq)}`,
              managerTgId: s.tg!,
            };
            chatlar.push(yangi);
            chatSanoq++;
            return yangi;
          })();

      suhbatlar.push({
        chatId: chat.chatId,
        clientTgId: chat.clientTgId,
        managerTgId: chat.managerTgId,
        boshlanish,
        qolip,
      });
    }
  }
  console.log(`Rejalashtirildi: ${suhbatlar.length} suhbat, ${kunlar} kun`);

  // ─── Xabarlarni yozish ───
  let msgId = Math.floor(bugun / 1000) % 1_000_000;
  for (const s of suhbatlar) {
    let ofset = 0;
    for (const m of s.qolip.xabarlar) {
      // Javob kutish vaqti sifatga bog'liq: yomon suhbatlarda menejer
      // sekin javob beradi — "birinchi javob tezligi" bloki shundan.
      ofset += m.kim === 'manager' ? oraliq(60, s.qolip.sifat === 'yomon' ? 5400 : 900) : oraliq(30, 300);
      await ingestMessage({
        businessId,
        chatId: s.chatId,
        messageId: String(msgId++),
        senderId: m.kim === 'manager' ? s.managerTgId : s.clientTgId,
        senderIsBot: false,
        text: m.matn,
        sentAt: new Date(s.boshlanish.getTime() + ofset * 1000),
      });
    }
  }
  console.log('Xabarlar yozildi');

  /**
   * Kontaktlarning "birinchi ko'rinishi" ni orqaga suramiz.
   *
   * `ingestMessage` uni hozirgi vaqt bilan yozadi, natijada HAMMA mijoz
   * "yangi" bo'lib qolardi va lid voronkasida "sovib qolgan" bloklari
   * doim bo'sh chiqardi. Endi bir qismi ancha oldin ko'ringan bo'ladi.
   */
  await withTenant(businessId, (tx) =>
    tx.execute(sql`
      update contact ct
      set first_seen_at = eng.birinchi, last_seen_at = eng.oxirgi
      from (
        select c.contact_id, min(c.started_at) as birinchi, max(c.started_at) as oxirgi
        from conversation c
        where c.contact_id is not null
        group by c.contact_id
      ) eng
      where ct.id = eng.contact_id
    `),
  );

  // ─── Tahlil (mock LLM bilan, haqiqiy quvur) ───
  const bizniki = await withTenant(businessId, (tx) =>
    tx
      .select({ id: conversation.id })
      .from(conversation)
      .where(
        and(
          eq(conversation.status, 'received'),
          sql`${conversation.externalThreadId} like ${`${DEMO_PREFIX}%`}`,
        ),
      ),
  );
  for (const c of bizniki) await enqueueAnalysis(businessId, c.id);

  const llm = new OyLlm(mezonlar, oilalar, savollar);
  const bizIds = new Set(bizniki.map((c) => c.id));
  let tahlil = 0;
  let xato = 0;
  for (;;) {
    const job = await claimNextJob('seed-month');
    if (!job) break;
    if (!bizIds.has(job.conversationId)) {
      await completeJob(job.id);
      continue;
    }
    try {
      await analyzeConversation(llm, job.businessId, job.conversationId);
      await completeJob(job.id);
      tahlil++;
      if (tahlil % 20 === 0) console.log(`  ...${tahlil} ta tahlil qilindi`);
    } catch (err) {
      xato++;
      console.error(`  xato: ${err instanceof Error ? err.message : String(err)}`);
      await completeJob(job.id);
    }
  }
  console.log(`Tahlil qilindi: ${tahlil} suhbat${xato > 0 ? `, ${xato} xato` : ''}`);

  /**
   * ── Vazifalarni hayotiyroq qilish ───────────────────────────────────────
   * Quvur hamma vazifani `pending` qilib yaratadi. Haqiqiy jamoada bir
   * qismi bajarilgan, bir qismi kechikkan bo'ladi — "bajarilish foizi"
   * va "muddati o'tgan" bloklari shusiz doim 0% ko'rsatardi.
   */
  const yangilandi = await withTenant(businessId, async (tx) => {
    const bajarilgan = await tx.execute(sql`
      update task set status = 'done', completed_at = due_at + interval '3 hours'
      where source = 'playbook_analysis'
        and due_at < now() - interval '3 days'
        and status = 'pending'
        and (hashtext(id::text) % 10) between 0 and 5
      returning id
    `);
    const jarayonda = await tx.execute(sql`
      update task set status = 'in_progress'
      where status = 'pending' and (hashtext(id::text) % 10) = 9
      returning id
    `);
    return { bajarilgan: bajarilgan.length, jarayonda: jarayonda.length };
  });
  console.log(
    `Vazifalar: ${yangilandi.bajarilgan} ta bajarildi, ${yangilandi.jarayonda} ta jarayonda`,
  );

  // ─── Qo'lda qo'shilgan vazifalar (manba filtri bo'sh qolmasligi uchun) ───
  const qolda = [
    'Yangi guruh uchun jadval tayyorlash',
    'Instagram uchun 5 ta post rejasi',
    'Sinov darsiga kelganlarga eslatma yuborish',
    'O\'quv markazida ochiq eshiklar kunini rejalashtirish',
    'Kechikkan to\'lovlar bo\'yicha ro\'yxat tayyorlash',
  ];
  await withTenant(businessId, (tx) =>
    tx.insert(task).values(
      qolda.map((title, i) => ({
        businessId,
        seatId: seatlar[i % seatlar.length]!.id,
        source: 'manual' as const,
        title,
        status: (i % 3 === 0 ? 'done' : 'pending') as 'done' | 'pending',
        dueAt: new Date(bugun + (i - 2) * DAY),
        completedAt: i % 3 === 0 ? new Date(bugun - DAY) : null,
      })),
    ),
  );
  console.log(`Qo'lda vazifalar qo'shildi: ${qolda.length}`);

  const yakun = await withTenant(businessId, (tx) =>
    tx.execute(sql`
      select
        (select count(*) from conversation)::int                      as suhbatlar,
        (select count(*) from analysis)::int                          as tahlillar,
        (select count(*) from criterion_score)::int                   as ballar,
        (select count(*) from task)::int                              as vazifalar,
        (select count(*) from alert)::int                             as ogohlantirishlar,
        (select count(*) from contact)::int                           as kontaktlar
    `),
  );
  console.log('\nYakuniy holat:', JSON.stringify(yakun[0], null, 1));
  console.log('\nTayyor! Analitika sahifasini yangilang.');
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
