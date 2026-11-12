import { ZodError } from 'zod';
import { computeCostUsd, getSimulyatorLlm, type LlmJsonRequest } from '../ai/llm.js';
import { LlmCallError } from '../training/errors.js';
import type { TokenUsage, TrainerLlm, TrainerLlmRequest } from '../training/ports.js';
import { zodToJsonSchema } from './zod-json-schema.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI MIJOZ MODULI ↔ PLATFORMA LLM'I (moslashtirgich)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Modul `TrainerLlm` ni kutadi: zod `schema` (javobni tekshirish) va
 * `outputSchema` (provayderga JSON Schema). Platformaning `LlmClient` i esa
 * JSON Schema oladi va xom JSON qaytaradi — bu fayl ikkisini bog'laydi.
 *
 * Provayder: `getSimulyatorLlm()` — Admin'da Simulyator uchun alohida
 * belgilangan provayder (masalan Gemini), bo'lmasa faol provayder.
 *
 * Bosqich sozlamalari:
 *   - jonli navbat qisqa chegarali (u baza tranzaksiyasi ichida chaqiriladi:
 *     `idle_in_transaction` 60 s dan ancha past bo'lishi shart);
 *   - mijoz rolini o'ynashda `temperature` yuborilmaydi (provayder standarti) —
 *     0 da javoblar robotdek bir xil bo'lardi; baholashda esa 0;
 *   - fikrlash: navbatda past (tezlik), baholashda o'rta (sifat).
 *
 * Xatolar modulning `LlmCallError` toifalariga o'giriladi — modul faqat
 * `invalid_json`/`schema` ni "tuzatib qayta so'raydi", vaqt va HTTP
 * xatolarini esa foydalanuvchiga to'g'ri sabab bilan ko'rsatadi.
 */

interface BosqichSozlama {
  maxTokens: number;
  timeoutMs: number;
  temperature: number | null;
  reasoning: NonNullable<LlmJsonRequest['reasoningEffort']>;
}

const STANDART: BosqichSozlama = { maxTokens: 8192, timeoutMs: 60_000, temperature: 0, reasoning: 'low' };

const BOSQICH: Record<string, BosqichSozlama> = {
  // Jonli suhbat — tez va jonli
  // Jonli suhbat: fikrlash o'chiq — Gemini 2.5 Flash'da fikrlash bilan javob
  // 3.7-4.8 s edi. Mijoz gapi qisqa, chuqur mulohaza kerak emas.
  'training.turn': { maxTokens: 4096, timeoutMs: 25_000, temperature: null, reasoning: 'none' },
  'training.persona': { maxTokens: 8192, timeoutMs: 45_000, temperature: null, reasoning: 'low' },
  'training.scenario_draft': { maxTokens: 8192, timeoutMs: 60_000, temperature: null, reasoning: 'low' },
  // Baholash — barqaror va puxta (tranzaksiyadan tashqarida)
  // Baholash: "low" fikrlash — "medium" bilan 14 navbatli suhbat tahlili ~60 s edi.
  // Dalil iqtiboslari kod bilan tekshiriladi (yiqilsa bitta qayta so'rov), sifat himoyalangan.
  'training.scoring': { maxTokens: 16_384, timeoutMs: 120_000, temperature: 0, reasoning: 'low' },
  'training.scoring.language': { maxTokens: 8192, timeoutMs: 60_000, temperature: 0, reasoning: 'low' },
  'training.scenario_report': { maxTokens: 8192, timeoutMs: 90_000, temperature: 0, reasoning: 'low' },
};

/** Sxema yasab bo'lmasa — eng umumiy obyekt (javobni baribir zod tekshiradi). */
const UMUMIY_OBYEKT = { type: 'object', additionalProperties: true } as const;

function toifala(err: unknown): LlmCallError {
  if (err instanceof LlmCallError) return err;
  const xabar = err instanceof Error ? err.message : String(err);
  const nom = err instanceof Error ? err.name : '';
  if (nom === 'TimeoutError' || nom === 'AbortError' || /timed? ?out|aborted/i.test(xabar)) {
    return new LlmCallError('timeout', 'AI javobi kutilgan vaqtda kelmadi', { cause: err });
  }
  const http = /\((\d{3})\b/.exec(xabar);
  if (http) {
    return new LlmCallError('http', `AI provayderi xato qaytardi (${http[1]})`, {
      status: Number(http[1]),
      providerMessage: xabar.slice(0, 200),
      cause: err,
    });
  }
  if (/JSON/i.test(xabar)) return new LlmCallError('invalid_json', 'AI javobi JSON emas', { cause: err });
  return new LlmCallError('unknown', xabar.slice(0, 200), { cause: err });
}

export function createTrainerLlm(): TrainerLlm {
  async function chaqir<T>(req: TrainerLlmRequest<T>): Promise<{ value: T; usage: TokenUsage }> {
    const s = BOSQICH[req.stage] ?? STANDART;
    let javob;
    try {
      const llm = await getSimulyatorLlm();
      javob = await llm.completeJson({
        stage: 'simulyator',
        system: req.system,
        user: req.user,
        schema: zodToJsonSchema(req.outputSchema) ?? UMUMIY_OBYEKT,
        maxTokens: s.maxTokens,
        timeoutMs: s.timeoutMs,
        temperature: s.temperature,
        reasoningEffort: s.reasoning,
      });
    } catch (err) {
      throw toifala(err);
    }
    try {
      const value = req.schema.parse(javob.json);
      return { value, usage: { inputTokens: javob.tokensIn, outputTokens: javob.tokensOut, model: javob.model } };
    } catch (err) {
      if (err instanceof ZodError) {
        throw new LlmCallError('schema', 'AI javobi kutilgan shaklga mos kelmadi', { cause: err });
      }
      throw toifala(err);
    }
  }

  return {
    async completeJson<T>(req: TrainerLlmRequest<T>): Promise<T> {
      return (await chaqir(req)).value;
    },
    completeJsonWithUsage: chaqir,
  };
}

/** Narx — platformaning yagona tariflar jadvalidan (`ai/llm.ts`). */
export function trainerNarx(usage: TokenUsage): number {
  return computeCostUsd(usage.model ?? '', usage.inputTokens, usage.outputTokens);
}
