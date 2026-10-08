import Anthropic from '@anthropic-ai/sdk';
import { and, eq } from 'drizzle-orm';
import { decryptSecret } from '../crypto/secrets.js';
import { withoutTenantIsolation } from '../db/index.js';
import { aiProvider } from '../db/schema/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LLM KLIENTI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pipeline LLM'ni faqat shu interfeys orqali ko'radi. Sabab:
 *   1. Testlar haqiqiy API'siz ishlaydi (MockLlm) — tez, bepul, deterministik
 *   2. Provayderni almashtirish (yoki bosqichga alohida model) bitta joyda
 *   3. Xarajat hisobi (FR-89) markazlashgan
 */

export interface LlmJsonRequest {
  /** Qaysi bosqich — model tanlash va kuzatuv uchun. */
  stage: 'stage2' | 'stage3' | 'playbookBuilder';
  system: string;
  user: string;
  /** Javob majburan shu JSON sxemaga tushadi (structured outputs). */
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export interface LlmJsonResponse {
  json: unknown;
  model: string;
  tokensIn: number;
  tokensOut: number;
  costUsd: number;
}

export interface LlmClient {
  completeJson(req: LlmJsonRequest): Promise<LlmJsonResponse>;
}

/**
 * Narxlar $ / 1M token (2026-06 holati). Model ro'yxatda bo'lmasa eng
 * qimmat tarif olinadi — xarajatni kam ko'rsatishdan ko'ra oshirib
 * ko'rsatgan xavfsizroq.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  'claude-opus-5': { in: 5, out: 25 },
  'claude-opus-4-8': { in: 5, out: 25 },
  'claude-sonnet-5': { in: 3, out: 15 },
  'claude-haiku-4-5': { in: 1, out: 5 },
  'claude-fable-5': { in: 10, out: 50 },
  // Groq — bepul tarifda xarajat 0, lekin to'lovli tarifga o'tilganda
  // raqamlar shu yerda yangilanadi. Model ro'yxatda bo'lmasa FALLBACK olinadi.
  'llama-3.3-70b-versatile': { in: 0, out: 0 },
  'openai/gpt-oss-120b': { in: 0, out: 0 },
  'moonshotai/kimi-k2-instruct': { in: 0, out: 0 },
  // Taxminiy — Google narxini o'zgartirsa bu yerda yangilanadi. Fallback
  // ($10/$50) dan past qo'yilgani ma'qul: Gemini haqiqatda arzon, uni
  // FALLBACK bilan hisoblash xarajatni sun'iy oshirib ko'rsatardi.
  'gemini-2.5-flash': { in: 0.3, out: 2.5 },
  'gemini-2.5-pro': { in: 1.25, out: 10 },
};
const FALLBACK_PRICE = { in: 10, out: 50 };

export function computeCostUsd(model: string, tokensIn: number, tokensOut: number): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

const DEFAULT_MODEL = 'claude-opus-5';

export class AnthropicLlm implements LlmClient {
  private client: Anthropic;

  constructor(
    apiKey: string,
    private models: Partial<Record<LlmJsonRequest['stage'], string>> = {},
    baseUrl?: string,
  ) {
    this.client = new Anthropic({
      apiKey,
      ...(baseUrl ? { baseURL: baseUrl } : {}),
    });
  }

  async completeJson(req: LlmJsonRequest): Promise<LlmJsonResponse> {
    const model = this.models[req.stage] ?? DEFAULT_MODEL;

    const response = await this.client.messages.create({
      model,
      max_tokens: req.maxTokens ?? 8192,
      system: req.system,
      messages: [{ role: 'user', content: req.user }],
      output_config: {
        format: { type: 'json_schema', schema: req.schema },
      },
    });

    if (response.stop_reason === 'refusal') {
      throw new LlmRefusalError(model);
    }
    if (response.stop_reason === 'max_tokens') {
      throw new Error(`LLM javobi kesildi (max_tokens): ${model}`);
    }

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`LLM JSON qaytarmadi (${model}): ${text.slice(0, 200)}`);
    }

    const tokensIn = response.usage.input_tokens;
    const tokensOut = response.usage.output_tokens;
    return {
      json,
      model,
      tokensIn,
      tokensOut,
      costUsd: computeCostUsd(model, tokensIn, tokensOut),
    };
  }
}

/**
 * Reasoning modellar JSON'dan oldin o'z fikrlashini yozib yuborishi mumkin
 * ("We need to produce. Some…"), yoki javobni ```json bloki ichiga o'rashi.
 * Shuning uchun avval to'g'ridan-to'g'ri parse qilamiz, bo'lmasa matndan
 * eng tashqi JSON obyektini ajratib olamiz.
 *
 * Bu provayderni almashtirishni osonlashtiradi: har model o'zicha "toza"
 * javob berishiga tayanib bo'lmaydi.
 */
function parseJsonLoose(text: string, model: string): unknown {
  const t = text.trim();
  try {
    return JSON.parse(t);
  } catch {
    // davom etamiz
  }

  // ```json … ``` blokini olib tashlaymiz
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {
      // davom etamiz
    }
  }

  // Eng tashqi { … } ni qavslar balansi bo'yicha ajratamiz
  const bosh = t.indexOf('{');
  if (bosh >= 0) {
    let chuqurlik = 0;
    let qatorda = false;
    let qochirish = false;
    for (let i = bosh; i < t.length; i++) {
      const c = t[i]!;
      if (qochirish) { qochirish = false; continue; }
      if (c === '\\') { qochirish = true; continue; }
      if (c === '"') { qatorda = !qatorda; continue; }
      if (qatorda) continue;
      if (c === '{') chuqurlik++;
      else if (c === '}') {
        chuqurlik--;
        if (chuqurlik === 0) {
          try {
            return JSON.parse(t.slice(bosh, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new Error(`LLM JSON qaytarmadi (${model}): ${t.slice(0, 200)}`);
}

/**
 * OpenAI-uyg'un provayder (Groq, OpenAI, mahalliy server).
 *
 * Groq uchun `baseUrl` = https://api.groq.com/openai/v1 qo'yiladi —
 * shuning uchun alohida SDK ham, sxema migratsiyasi ham kerak emas.
 *
 * SDK o'rniga `fetch` ishlatilgan: bitta HTTP chaqiruv uchun yangi
 * bog'liqlik qo'shish oqlanmaydi.
 */
export class OpenAiCompatLlm implements LlmClient {
  constructor(
    private apiKey: string,
    private models: Partial<Record<LlmJsonRequest['stage'], string>> = {},
    private baseUrl = 'https://api.groq.com/openai/v1',
    private defaultModel = 'llama-3.3-70b-versatile',
  ) {}

  async completeJson(req: LlmJsonRequest): Promise<LlmJsonResponse> {
    const model = this.models[req.stage] ?? this.defaultModel;

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_completion_tokens: req.maxTokens ?? 8192,
        temperature: 0,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'natija', strict: true, schema: req.schema },
        },
      }),
    });

    if (!res.ok) {
      const matn = await res.text();
      // Xavfsizlik filtri rad etgan bo'lsa retry foydasiz — alohida xato.
      if (res.status === 400 && /content_filter|refus/i.test(matn)) {
        throw new LlmRefusalError(model);
      }
      throw new Error(`LLM so'rovi muvaffaqiyatsiz (${res.status}, ${model}): ${matn.slice(0, 300)}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };

    const choice = data.choices?.[0];
    if (choice?.finish_reason === 'length') {
      throw new Error(`LLM javobi kesildi (max_tokens): ${model}`);
    }
    const text = choice?.message?.content ?? '';

    const json = parseJsonLoose(text, model);

    const tokensIn = data.usage?.prompt_tokens ?? 0;
    const tokensOut = data.usage?.completion_tokens ?? 0;
    return { json, model, tokensIn, tokensOut, costUsd: computeCostUsd(model, tokensIn, tokensOut) };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SXEMANI BO'LIB SO'RASH — zaif modellarni ishlatish uchun
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Muammo: 2-bosqich bitta so'rovda 12 ta majburiy maydon va 6 ta ichma-ich
 * obyekt so'raydi. Kuchli model buni uddalaydi, arzon/bepul model esa
 * yoki maydonni tashlab ketadi, yoki fikrlashga token sarflab JSON
 * chiqarmaydi.
 *
 * Yechim: bitta katta so'rovni bir nechta kichik so'rovga bo'lamiz —
 * har birida bir necha maydon. Natijalar birlashtiriladi.
 *
 * Narx: system+user har bo'lak uchun takrorlanadi, ya'ni kirish tokeni
 * N marta ko'payadi. Bepul modelda bu muhim emas, pullik modelda esa
 * bo'lish shart emas — shuning uchun bu rejim IXTIYORIY (provayder
 * sozlamasidagi `splitFields` orqali yoqiladi).
 */
export class SplitJsonLlm implements LlmClient {
  constructor(
    private inner: LlmClient,
    /** Bitta so'rovda ko'pi bilan shuncha yuqori darajali maydon so'raladi. */
    private maxFields = 4,
  ) {}

  async completeJson(req: LlmJsonRequest): Promise<LlmJsonResponse> {
    const props = (req.schema as { properties?: Record<string, unknown> }).properties;
    const required = (req.schema as { required?: string[] }).required ?? [];
    if (!props) return this.inner.completeJson(req);

    const kalitlar = Object.keys(props);
    if (kalitlar.length <= this.maxFields) return this.inner.completeJson(req);

    // Maydonlarni bo'laklarga ajratamiz. Tartib saqlanadi: birinchi bo'lakda
    // odatda tasnif maydonlari bo'ladi va ular eng muhimi.
    const bolaklar: string[][] = [];
    for (let i = 0; i < kalitlar.length; i += this.maxFields) {
      bolaklar.push(kalitlar.slice(i, i + this.maxFields));
    }

    const natija: Record<string, unknown> = {};
    let model = '';
    let tokensIn = 0;
    let tokensOut = 0;
    let costUsd = 0;

    for (let i = 0; i < bolaklar.length; i++) {
      const bolak = bolaklar[i]!;
      const qismSchema = {
        type: 'object',
        properties: Object.fromEntries(bolak.map((k) => [k, props[k]])),
        required: bolak.filter((k) => required.includes(k)),
        additionalProperties: false,
      };

      const r = await this.inner.completeJson({
        ...req,
        // Modelga nima so'ralayotganini aniq aytamiz — bo'lak kontekstsiz
        // qolsa, u butun javobni qaytarishga urinadi.
        user:
          `${req.user}\n\n` +
          `[${i + 1}/${bolaklar.length}-qism] Faqat quyidagi maydonlarni qaytar: ` +
          `${bolak.join(', ')}. Boshqa maydon qo'shma.`,
        schema: qismSchema,
      });

      Object.assign(natija, r.json as Record<string, unknown>);
      model = r.model;
      tokensIn += r.tokensIn;
      tokensOut += r.tokensOut;
      costUsd += r.costUsd;
    }

    return { json: natija, model, tokensIn, tokensOut, costUsd };
  }
}

/** Xavfsizlik klassifikatori so'rovni rad etdi — retry foydasiz. */
export class LlmRefusalError extends Error {
  constructor(model: string) {
    super(`LLM so'rovni rad etdi (${model})`);
    this.name = 'LlmRefusalError';
  }
}

/**
 * Faol LLM provayderidan klient yasash.
 *
 * Kalit bazada shifrlangan (admin panel orqali kiritiladi), shu yerda
 * ochiladi. Provayder yo'q bo'lsa — aniq xato: pipeline jimgina
 * ishlamay qolishidan ko'ra ochiq nosozlik yaxshi.
 */
export async function getActiveLlm(): Promise<LlmClient> {
  const [provider] = await withoutTenantIsolation(
    'worker: faol LLM provayderini o\'qish (platforma darajasi)',
    (tx) =>
      tx
        .select({
          kind: aiProvider.kind,
          apiKeyEncrypted: aiProvider.apiKeyEncrypted,
          models: aiProvider.models,
          baseUrl: aiProvider.baseUrl,
        })
        .from(aiProvider)
        .where(and(eq(aiProvider.purpose, 'llm'), eq(aiProvider.isActive, true)))
        .limit(1),
  );

  if (!provider) {
    throw new Error(
      'Faol LLM provayderi yo\'q — admin paneldan provayder qo\'shib faollashtiring',
    );
  }
  if (!provider.apiKeyEncrypted) {
    throw new Error('Faol provayderda API kaliti yo\'q');
  }
  const apiKey = decryptSecret(Buffer.from(provider.apiKeyEncrypted));
  const models = (provider.models ?? {}) as Partial<
    Record<LlmJsonRequest['stage'], string>
  >;

  /**
   * `splitFields` — zaif modellar uchun: katta sxemani shuncha maydonlik
   * bo'laklarga bo'lib so'raydi. Sozlamada bo'lmasa, bo'lish yoqilmaydi.
   */
  const splitFields = Number((provider.models as Record<string, unknown> | null)?.splitFields);
  const orash = (klient: LlmClient): LlmClient =>
    Number.isFinite(splitFields) && splitFields > 0
      ? new SplitJsonLlm(klient, splitFields)
      : klient;

  switch (provider.kind) {
    case 'anthropic':
      return orash(new AnthropicLlm(apiKey, models, provider.baseUrl ?? undefined));
    // Groq OpenAI-uyg'un API beradi — `kind: 'openai'` + Groq `baseUrl`.
    // Shu sababli enum'ga yangi qiymat va migratsiya kerak emas.
    case 'openai':
    case 'custom':
      return orash(
        new OpenAiCompatLlm(
          apiKey,
          models,
          provider.baseUrl ?? 'https://api.groq.com/openai/v1',
        ),
      );
    default:
      throw new Error(`Provayder turi hali qo'llab-quvvatlanmaydi: ${provider.kind}`);
  }
}
