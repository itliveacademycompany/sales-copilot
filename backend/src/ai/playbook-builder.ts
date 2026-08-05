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
      stage2: { businessContext: profile.businessDescription, extractionHints: '', taskGuidance: '' },
      stage3: { scoringGuidance: '', coachingNotes: '', complianceNotes: '' },
    },
    leadQuality: {},
    changeNote: 'AI tomonidan generatsiya qilingan qoralama',
  };

  // Natija har doim to'g'ri bo'lishi KAFOLATLANADI (kodlar deterministik
  // tuzilgan, vaznlar normallashtirilgan) — bu faqat ishonch tekshiruvi.
  return playbookBodySchema.parse(body);
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
