import type { BusinessProfile } from '../business/profile.js';
import { playbookBodySchema, type PlaybookBody } from '../playbook/schema.js';
import { buildPlaybookDraftPrompt, playbookDraftResult, playbookDraftSchema } from './prompts.js';
import type { LlmClient } from './llm.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI PLAYBOOK BUILDER — FR-12, bizning eng kuchli farqimiz
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Odatda bunday tizimlarda playbook'ni support jamoasi qo'lda tuzadi
 * (bu esa mijozni kutishga majbur qiladi). Bizda foydalanuvchi
 * anketani to'ldiradi → LLM to'liq qoralama tuzadi → foydalanuvchi tahrirlab
 * saqlaydi. 10 daqiqa vs 2 hafta yozishma.
 *
 * KOD/VAZN INTEGRITETI: LLM'dan hech qachon aniq kod (A1, B2) yoki aniq 100%
 * yig'indi so'ralmaydi — bu ish deterministik ravishda shu yerda bajariladi.
 * Model faqat tartib (categoryIndex) va mazmun beradi. Shu tufayli natija
 * playbookBodySchema orqali HECH QACHON "kod mos kelmadi" bilan yiqilmaydi.
 */

/** Vaznlarni aynan 100.00% ga normallashtiradi, yaxlitlash qoldig'ini eng katta kategoriyaga qo'shadi. */
function normalizeWeights(raw: number[]): number[] {
  const total = raw.reduce((s, w) => s + Math.max(0, w), 0);
  if (total <= 0) {
    // Model foydasiz vazn qaytarsa — teng taqsimlaymiz.
    const equal = Math.floor((100 / raw.length) * 100) / 100;
    const out = raw.map(() => equal);
    out[out.length - 1] = Math.round((100 - equal * (raw.length - 1)) * 100) / 100;
    return out;
  }
  const scaled = raw.map((w) => Math.round(((Math.max(0, w) / total) * 100) * 100) / 100);
  const diff = Math.round((100 - scaled.reduce((s, w) => s + w, 0)) * 100) / 100;
  const maxIdx = scaled.reduce((best, w, i) => (w > scaled[best]! ? i : best), 0);
  scaled[maxIdx] = Math.round((scaled[maxIdx]! + diff) * 100) / 100;
  return scaled;
}

export function draftToPlaybookBody(
  draft: import('./prompts.js').PlaybookDraftResult,
  profile: BusinessProfile,
): PlaybookBody {
  const categoryCount = Math.min(draft.categories.length, 26);
  const codes = Array.from({ length: categoryCount }, (_, i) => String.fromCharCode(65 + i));
  const weights = normalizeWeights(draft.categories.slice(0, categoryCount).map((c) => c.weightPct));

  const categories = draft.categories.slice(0, categoryCount).map((c, i) => ({
    code: codes[i]!,
    name: c.name,
    weightPct: weights[i]!,
    order: i,
  }));

  // Kategoriya ichidagi tartib raqami — mezon kodi shundan tuziladi (A1, A2...).
  const perCategoryCounter = new Map<number, number>();
  const criteria = draft.criteria
    .filter((c) => c.categoryIndex < categoryCount)
    .map((c, globalIdx) => {
      const n = (perCategoryCounter.get(c.categoryIndex) ?? 0) + 1;
      perCategoryCounter.set(c.categoryIndex, n);
      return {
        code: `${codes[c.categoryIndex]}${n}`,
        categoryCode: codes[c.categoryIndex]!,
        name: c.name,
        description: c.description,
        rubric: { '0': c.rubric0, '1': c.rubric1, '2': c.rubric2, '3': c.rubric3 },
        appliesTo: { callFamilies: [], serviceLines: [], directions: [] },
        isActive: true,
        order: globalIdx,
      };
    });

  // Har kategoriyada kamida bitta mezon bo'lishi kerak (playbookBodySchema
  // shuni talab qiladi) — model biror kategoriyani unutgan bo'lsa, umumiy
  // bitta mezon qo'shamiz, aks holda saqlash butunlay yiqiladi.
  for (let i = 0; i < categoryCount; i++) {
    if (!perCategoryCounter.has(i)) {
      criteria.push({
        code: `${codes[i]}1`,
        categoryCode: codes[i]!,
        name: 'Umumiy sifat',
        description: `${categories[i]!.name} bo'yicha umumiy sifat`,
        rubric: {
          '0': 'Umuman e\'tiborga olinmadi',
          '1': 'Juda yuzaki qilindi',
          '2': 'Yaxshi qilindi, lekin to\'liq emas',
          '3': 'To\'liq va sifatli qilindi',
        },
        appliesTo: { callFamilies: [], serviceLines: [], directions: [] },
        isActive: true,
        order: criteria.length,
      });
    }
  }

  const vocabulary = [...new Set([...draft.vocabulary, ...profile.vocabulary])].slice(0, 200);

  const questions = profile.mustCaptureFields.map((f, i) => ({
    id: `q${i + 1}`,
    question: f,
    answerType: 'text' as const,
    required: false,
  }));

  const body: PlaybookBody = {
    criteria: { categories, criteria },
    questionnaire: { title: 'Anketa', questions },
    classificationPolicy: {
      callFamilies: draft.callFamilies,
      redFlags: draft.redFlags,
      serviceLines: profile.primaryOffers,
    },
    promptNotes: {
      stage1: { vocabulary, contextHint: '' },
      stage2: {
        // Soha tavsif oldiga qo'yiladi: model uchun eng qisqa va eng
        // aniqlovchi ma'lumot shu — "ta'lim markazi" degan bir so'z
        // uzun tavsifdan ko'ra kontekstni tezroq o'rnatadi.
        businessContext: [profile.industry, profile.businessDescription]
          .filter((s) => s.trim().length > 0)
          .join('. '),
        extractionHints: '',
        taskGuidance: '',
      },
      stage3: { scoringGuidance: '', coachingNotes: '', complianceNotes: '' },
    },
    leadQuality: {},
    changeNote: 'AI tomonidan generatsiya qilingan qoralama',
  };

  // Natija har doim to'g'ri bo'lishi KAFOLATLANADI (kodlar deterministik
  // tuzilgan, vaznlar normallashtirilgan) — bu faqat ishonch tekshiruvi.
  return playbookBodySchema.parse(body);
}

/** Ro'yxatdan qisqa sanoq: "A, B va C" — matn chegarasidan oshmasin. */
function sanoq(items: string[], max: number, chegara: number): string {
  const tanlangan = items.map((s) => s.trim()).filter(Boolean).slice(0, max);
  if (tanlangan.length === 0) return '';
  const matn = tanlangan.length === 1 ? tanlangan[0]! : `${tanlangan.slice(0, -1).join(', ')} va ${tanlangan[tanlangan.length - 1]}`;
  return matn.length > chegara ? `${matn.slice(0, chegara - 1)}…` : matn;
}

/**
 * STANDART SHABLON — AI ishlamaganda (provayder sozlanmagan yoki javob
 * bermadi) onboarding to'xtab qolmasin.
 *
 * Universal sotuv bosqichlari, lekin biznes profiliga moslangan: mahsulotlar,
 * eng ko'p uchraydigan e'tirozlar va albatta aniqlanadigan ma'lumotlar
 * mezon tavsiflariga qo'yiladi. AI qoralamasi bilan BIR XIL yo'ldan
 * (`draftToPlaybookBody`) o'tadi — kodlar, vaznlar va sxema kafolatlangan.
 * Foydalanuvchi uni tahrirlaydi; AI ulangach Sozlamalarda qayta yaratadi.
 */
export function standartQoralama(profile: BusinessProfile): PlaybookBody {
  const mahsulot = sanoq(profile.primaryOffers, 3, 160) || 'taklif';
  const etirozlar = sanoq(profile.commonObjections, 3, 260);
  const malumotlar = sanoq(profile.mustCaptureFields, 5, 260);

  const draft: import('./prompts.js').PlaybookDraftResult = {
    categories: [
      { name: 'Aloqa o\'rnatish', weightPct: 15 },
      { name: 'Ehtiyojni aniqlash', weightPct: 30 },
      { name: 'Taqdimot va qiymat', weightPct: 25 },
      { name: 'E\'tirozlar bilan ishlash', weightPct: 15 },
      { name: 'Yakunlash va keyingi qadam', weightPct: 15 },
    ],
    criteria: [
      {
        categoryIndex: 0,
        name: 'Salomlashish va tanishtirish',
        description: 'Sotuvchi xushmuomala salomlashdi, o\'zini va kompaniyani tanishtirdi, mijozga murojaat qildi.',
        rubric0: 'Salomlashmadi yoki o\'zini tanishtirmadi',
        rubric1: 'Salomlashdi, lekin quruq va rasmiyatchilik bilan',
        rubric2: 'Xushmuomala salomlashdi va o\'zini tanishtirdi',
        rubric3: 'Iliq salomlashdi, tanishtirdi va mijoz bilan darhol aloqa o\'rnatdi',
      },
      {
        categoryIndex: 1,
        name: 'Ochuvchi savollar',
        description: 'Mijozning maqsadi, vaziyati va nima uchun murojaat qilgani ochiq savollar bilan aniqlandi.',
        rubric0: 'Savol berilmadi — darhol narx yoki taklif aytildi',
        rubric1: 'Bitta-ikkita yopiq savol berildi',
        rubric2: 'Ochiq savollar berildi, lekin ehtiyoj to\'liq ochilmadi',
        rubric3: 'Ochiq savollar bilan maqsad, vaziyat va sabab to\'liq aniqlandi',
      },
      {
        categoryIndex: 1,
        name: 'Muhim ma\'lumotlarni aniqlash',
        description: malumotlar
          ? `Suhbatda albatta aniqlanishi kerak bo'lgan ma'lumotlar so'raldi: ${malumotlar}.`
          : 'Qaror uchun zarur ma\'lumotlar (byudjet, muddat, qaror qiluvchi) aniqlandi.',
        rubric0: 'Kerakli ma\'lumotlarning birortasi ham so\'ralmadi',
        rubric1: 'Ma\'lumotlarning ozgina qismi so\'raldi',
        rubric2: 'Ko\'p qismi aniqlandi, ba\'zilari qolib ketdi',
        rubric3: 'Barcha kerakli ma\'lumotlar aniq va to\'liq olindi',
      },
      {
        categoryIndex: 2,
        name: 'Ehtiyojga bog\'langan taqdimot',
        description: `${mahsulot} mijozning aytgan ehtiyojiga bog'lab taqdim etildi — umumiy ro'yxat emas, aynan unga foydasi tushuntirildi.`,
        rubric0: 'Taqdimot qilinmadi yoki faqat narx aytildi',
        rubric1: 'Umumiy, hammaga bir xil taqdimot qilindi',
        rubric2: 'Taqdimot ehtiyojga qisman bog\'landi',
        rubric3: 'Taqdimot mijoz ehtiyojiga aniq bog\'landi va foydasi ko\'rsatildi',
      },
      {
        categoryIndex: 2,
        name: 'Qiymat va dalillar',
        description: 'Narxdan oldin qiymat ko\'rsatildi: natijalar, misollar, kafolat yoki farqli jihatlar aytildi.',
        rubric0: 'Qiymat umuman ko\'rsatilmadi',
        rubric1: 'Qiymat yuzaki, dalilsiz aytildi',
        rubric2: 'Qiymat ko\'rsatildi, lekin dalillar kam',
        rubric3: 'Qiymat aniq dalillar va misollar bilan ishonarli ko\'rsatildi',
      },
      {
        categoryIndex: 3,
        name: 'E\'tirozga javob',
        description: etirozlar
          ? `E'tiroz tinglanib, qadrlanib, qiymat orqali javob berildi. Ko'p uchraydiganlari: ${etirozlar}.`
          : 'E\'tiroz tinglanib, qadrlanib, qiymat orqali javob berildi — bahslashilmadi.',
        rubric0: 'E\'tiroz e\'tiborsiz qoldirildi yoki mijoz bilan bahslashildi',
        rubric1: 'Javob berildi, lekin ishonarsiz yoki shablon',
        rubric2: 'E\'tirozga mos javob berildi, lekin to\'liq yopilmadi',
        rubric3: 'E\'tiroz aniqlashtirildi va ishonarli javob bilan yopildi',
      },
      {
        categoryIndex: 4,
        name: 'Aniq keyingi qadam',
        description: 'Suhbat aniq, sanali keyingi qadam bilan yakunlandi: uchrashuv, to\'lov, sinov dars yoki qayta qo\'ng\'iroq vaqti.',
        rubric0: 'Keyingi qadam taklif qilinmadi',
        rubric1: '"O\'ylab ko\'ring" kabi noaniq yakun',
        rubric2: 'Keyingi qadam taklif qilindi, lekin vaqti aniq emas',
        rubric3: 'Aniq sana va vaqt bilan keyingi qadamga kelishildi',
      },
    ],
    callFamilies: [
      { key: 'yangi_lid', name: 'Yangi lid', description: 'Birinchi marta murojaat qilgan potensial mijoz', scored: true },
      { key: 'mavjud_mijoz', name: 'Mavjud mijoz', description: 'Xizmatdan foydalanayotgan mijozning savoli yoki muammosi', scored: false },
    ],
    redFlags: [
      { key: 'qopollik', description: 'Sotuvchi mijozga qo\'pol yoki mensimay muomala qildi', severity: 'critical' },
      { key: 'yolgon_vada', description: 'Sotuvchi mavjud bo\'lmagan shart, chegirma yoki natija va\'da qildi', severity: 'critical' },
      { key: 'javobsiz_qoldirish', description: 'Mijozning savoli javobsiz qoldirildi yoki suhbat keskin to\'xtatildi', severity: 'warning' },
    ],
    vocabulary: profile.primaryOffers.map((s) => s.trim()).filter((s) => s.length > 0 && s.length <= 80),
  };

  return { ...draftToPlaybookBody(draft, profile), changeNote: 'Standart shablon asosida tuzilgan qoralama' };
}

export async function generatePlaybookDraft(
  llm: LlmClient,
  profile: BusinessProfile,
): Promise<PlaybookBody> {
  const prompt = await buildPlaybookDraftPrompt(profile);
  const res = await llm.completeJson({
    stage: 'playbookBuilder',
    system: prompt.system,
    user: prompt.user,
    schema: playbookDraftSchema,
    maxTokens: 8192,
  });
  const draft = playbookDraftResult.parse(res.json);
  return draftToPlaybookBody(draft, profile);
}
