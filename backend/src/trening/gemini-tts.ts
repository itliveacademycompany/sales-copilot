import { LlmCallError } from '../training/errors.js';
import type { TtsPort, TtsRequest, TtsResult, TtsSpeaker, TtsStream } from '../training/voice/ports.js';
import { wavHeader } from '../training/voice/wav.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMULYATOR TTS — Google Gemini (Mijoz-AI harness adapteridan ko'chirilgan)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Interactions API: `POST {base}/interactions`, `stream: true`.
 *  - matn `input[0].content[0].text` da — so'zma-so'z o'qiladi;
 *  - uslub (persona, ohang) `speech_metadata.style` da — o'qilmaydi, yo'nalish;
 *  - ovoz `generation_config.speech_config: [{ voice }]`;
 *  - oqim: SSE `step.delta` (audio, base64 PCM 24 kHz mono 16-bit).
 *
 * Brauzerga WAV oqimi beriladi: avval sarlavha (uzunligi noma'lum), keyin PCM
 * bo'laklari — `<audio>` birinchi bo'lak kelishi bilan ijroni boshlaydi.
 *
 * Harness'dan farqi: kalit fayldan emas, Admin → AI provayderlar'dagi Gemini
 * kalitidan (har chaqiruvda `kalit()` — keshlangan); ovoz profillari kodda;
 * zaxira TTS yo'q. Kalit faqat header'da — log/xato matniga tushmaydi.
 */

export const DEFAULT_GEMINI_TTS_MODEL = 'gemini-3.8-flash-tts';
const SAMPLE_RATE = 24_000;
const TIMEOUT_MS = 60_000;
const RETRY = { maxAttempts: 3, baseDelayMs: 1_000, maxWaitMs: 8_000 } as const;

/** Narx (Gemini TTS sahifasi): matn kirishi $0.5/1M token, audio $9/1M token, 1 s ≈ 25 token. */
const NARX = { textInputPerM: 0.5, audioOutputPerM: 9.0, audioTokensPerSecond: 25 } as const;

// ---------------------------------------------------------------------------
// Ovoz profillari (harness/tts-voices.json)
// ---------------------------------------------------------------------------
const PROFILE_KEYS = [
  'male_child', 'female_child', 'male_teen', 'female_teen', 'male_young', 'male_adult',
  'male_elder', 'female_young', 'female_adult', 'female_elder', 'default',
] as const;
type ProfileKey = (typeof PROFILE_KEYS)[number];

const READING_RULE =
  'Read the text EXACTLY as written, word for word, in natural colloquial Uzbek (Latin script). ' +
  'Do not translate, add, skip, repeat or change any word. Uzbek pronunciation, no foreign accent.';

const PROFILES: Record<ProfileKey, { voice: string; style: string }> = {
  male_child: {
    voice: 'en-us-commercial-9',
    style: 'A {age}-year-old Uzbek boy ({role}). Childlike, higher and lighter voice, simple words, a little shy. Speaking manner: {speakingStyle}.',
  },
  female_child: {
    voice: 'en-us-training-11',
    style: 'A {age}-year-old Uzbek girl ({role}). Childlike, high and light voice, simple words. Speaking manner: {speakingStyle}.',
  },
  male_teen: {
    voice: 'en-us-commercial-9',
    style: 'A {age}-year-old Uzbek teenage boy ({role}). Youthful, slightly unsure, casual. Speaking manner: {speakingStyle}.',
  },
  female_teen: {
    voice: 'en-us-training-11',
    style: 'A {age}-year-old Uzbek teenage girl ({role}). Youthful, quick, casual. Speaking manner: {speakingStyle}.',
  },
  male_young: {
    voice: 'en-us-cruz',
    style: 'A {age}-year-old young Uzbek man ({role}). Lively, informal, a bit quick. Speaking manner: {speakingStyle}.',
  },
  male_adult: {
    voice: 'en-us-cruz',
    style: 'A {age}-year-old Uzbek man, a father ({role}). Practical and calm, careful with money. Speaking manner: {speakingStyle}.',
  },
  male_elder: {
    voice: 'en-us-storyteller-12',
    style: 'A {age}-year-old elderly Uzbek man ({role}). Slow, deliberate, slightly hoarse older voice, respectful but skeptical. Speaking manner: {speakingStyle}.',
  },
  female_young: {
    voice: 'en-us-fola',
    style: 'A {age}-year-old young Uzbek woman ({role}). Friendly, a little quick. Speaking manner: {speakingStyle}.',
  },
  female_adult: {
    voice: 'en-us-fola',
    style: 'A {age}-year-old Uzbek woman, a mother ({role}). Soft but cautious, thinks about family budget. Speaking manner: {speakingStyle}.',
  },
  female_elder: {
    voice: 'en-us-advisor-1',
    style: 'A {age}-year-old elderly Uzbek grandmother ({role}). Slow, soft, slightly shaky older voice, pauses, asks again. Speaking manner: {speakingStyle}.',
  },
  default: {
    voice: 'en-us-cruz',
    style: 'An Uzbek customer on a phone call ({role}). Natural colloquial speech. Speaking manner: {speakingStyle}.',
  },
};

/** Persona jinsini aytmagan bo'lsa — rol matnidan (ota/ona ...) taxmin. */
const MALE_HINT = /(?<![\p{L}'])(ota|otasi|aka|akasi|erkak|bobo|отец|папа|муж|father|man|dad)(?![\p{L}'])/iu;
const FEMALE_HINT = /(?<![\p{L}'])(ona|onasi|opa|opasi|ayol|xotin|kelin|momo|buvi|мать|мама|жена|mother|woman|mom)(?![\p{L}'])/iu;

function genderOf(speaker: TtsSpeaker | undefined): 'male' | 'female' | null {
  if (speaker?.gender) return speaker.gender;
  const role = speaker?.role ?? '';
  const female = FEMALE_HINT.test(role);
  const male = MALE_HINT.test(role);
  if (female && !male) return 'female';
  if (male && !female) return 'male';
  return null;
}

function isProfileKey(v: unknown): v is ProfileKey {
  return typeof v === 'string' && (PROFILE_KEYS as readonly string[]).includes(v);
}

/** Ssenariy aniq bergan profil, aks holda jins + yosh: <13 child, <18 teen, <30 young, 55+ elder. */
export function pickProfile(speaker: TtsSpeaker | undefined): ProfileKey {
  if (speaker?.profile && speaker.profile !== 'auto' && isProfileKey(speaker.profile)) return speaker.profile;
  const gender = genderOf(speaker);
  if (!gender) return 'default';
  const age = speaker?.age;
  const band =
    age === undefined ? 'adult' : age < 13 ? 'child' : age < 18 ? 'teen' : age < 30 ? 'young' : age >= 55 ? 'elder' : 'adult';
  return `${gender}_${band}` as ProfileKey;
}

function buildStyle(key: ProfileKey, req: TtsRequest): string {
  const sp = req.speaker;
  const fill = (template: string): string =>
    template
      .replace(/\{age\}/g, sp?.age !== undefined ? String(sp.age) : 'adult')
      .replace(/\{role\}/g, sp?.role?.trim() || 'customer')
      .replace(/\{speakingStyle\}/g, sp?.speakingStyle?.trim() || 'natural, conversational');
  const parts = [fill(PROFILES[key].style)];
  if (sp?.baseStyle?.trim()) parts.push(sp.baseStyle.trim());
  if (req.instructions) parts.push(`Current mood for this line: ${req.instructions}`);
  parts.push(READING_RULE);
  return parts.join(' ');
}

// ---------------------------------------------------------------------------
// HTTP va qayta urinish
// ---------------------------------------------------------------------------
class GeminiHttpError extends LlmCallError {
  readonly retryAfterMs?: number;
  readonly dailyQuota: boolean;
  constructor(status: number, short: string, retryAfterMs: number | undefined, dailyQuota: boolean) {
    super('http', `HTTP ${status}: ${short}`, { status, providerMessage: short });
    if (retryAfterMs !== undefined) this.retryAfterMs = retryAfterMs;
    this.dailyQuota = dailyQuota;
  }
}

function redact(text: string, apiKey: string): string {
  const out = apiKey ? text.split(apiKey).join('***') : text;
  return out.replace(/(AIza[0-9A-Za-z_-]{20,}|AQ\.[A-Za-z0-9_.-]{20,})/g, '***');
}

/** "retry in 1m2.5s" / RetryInfo `retryDelay: "12s"` -> ms. */
function parseRetryDelayMs(text: string): number | undefined {
  const m = /retry in (?:(\d+)h)?\s*(?:(\d+)m)?\s*([\d.]+)s/i.exec(text);
  if (m) return Math.round((Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3])) * 1000);
  const d = /"retryDelay"\s*:\s*"([\d.]+)s"/.exec(text);
  return d ? Math.round(Number(d[1]) * 1000) : undefined;
}

/** 429/5xx, timeout, tarmoq — qayta urinishga arziydi; 400/401/403/404 — sozlama xatosi. */
function isTransient(err: unknown): boolean {
  if (!(err instanceof LlmCallError)) return false;
  if (err.kind === 'timeout' || err.kind === 'unknown') return true;
  return err.kind === 'http' && [429, 500, 502, 503, 504].includes(err.status ?? 0);
}

async function withRetry<T>(fn: () => Promise<T>, log?: (line: string) => void): Promise<{ value: T; attempts: number }> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return { value: await fn(), attempts: attempt };
    } catch (err) {
      if (attempt >= RETRY.maxAttempts || !isTransient(err)) throw err;
      let waitMs = Math.min(RETRY.baseDelayMs * 2 ** (attempt - 1), RETRY.maxWaitMs);
      if (err instanceof GeminiHttpError && err.status === 429) {
        if (err.dailyQuota) throw err;
        if (err.retryAfterMs !== undefined) {
          if (err.retryAfterMs > RETRY.maxWaitMs) throw err;
          waitMs = err.retryAfterMs + 250;
        }
      }
      log?.(`[tts] gemini: ${(err as LlmCallError).status ?? (err as LlmCallError).kind} — ${waitMs} ms dan keyin qayta (${attempt + 1}/${RETRY.maxAttempts})`);
      await new Promise<void>((r) => setTimeout(r, waitMs));
    }
  }
}

interface StreamUsage {
  total_input_tokens?: number;
  total_output_tokens?: number;
  output_tokens_by_modality?: Array<{ modality: string; tokens: number }>;
}

export interface GeminiTtsKalit {
  apiKey: string;
  baseUrl: string;
  ttsModel: string | null;
}

export interface GeminiTtsHodisa {
  model: string;
  voice: string;
  profile: string;
  chars: number;
  firstChunkMs: number | null;
  totalMs: number;
  audioSec: number;
  costUsd: number;
  attempts: number;
  ok: boolean;
  error?: string;
}

export interface GeminiTtsOptions {
  /** Har sintezda chaqiriladi (keshlangan). `null` — Gemini kaliti sozlanmagan. */
  kalit: () => Promise<GeminiTtsKalit | null>;
  log?: (line: string) => void;
  onSynth?: (event: GeminiTtsHodisa) => void;
}

export function createGeminiTts(options: GeminiTtsOptions): TtsPort & { synthesizeStream(req: TtsRequest): TtsStream } {
  const { log, onSynth } = options;

  async function* stream(
    req: TtsRequest,
    opts: { header: 'stream' | 'none'; meta?: { sampleRate: number } },
  ): AsyncGenerator<Uint8Array> {
    const k = await options.kalit();
    if (!k) {
      throw new LlmCallError('http', "Ovoz uchun Google Gemini kaliti sozlanmagan (Admin → AI provayderlar)", { status: 401 });
    }
    const { apiKey } = k;
    const model = k.ttsModel ?? DEFAULT_GEMINI_TTS_MODEL;
    const url = `${k.baseUrl.replace(/\/$/, '')}/interactions`;
    const key = pickProfile(req.speaker);
    const voice = PROFILES[key].voice;
    const body = {
      model,
      input: [
        {
          type: 'user_input',
          content: [{ type: 'text', text: req.text, annotations: [{ type: 'speech_metadata', style: buildStyle(key, req) }] }],
        },
      ],
      response_format: { type: 'audio' },
      generation_config: { speech_config: [{ voice }] },
      stream: true,
      store: false,
    };

    const t0 = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let firstChunkMs: number | null = null;
    let usage: StreamUsage | null = null;
    let sampleRate = SAMPLE_RATE;
    let pcmBytes = 0;
    let attempts = 1;
    let carry: Buffer | null = null;
    let streamError: string | null = null;

    const report = (ok: boolean, error?: string): void => {
      const audioSec = pcmBytes / (sampleRate * 2);
      const inputTokens = usage?.total_input_tokens ?? 0;
      const audioTokens =
        usage?.output_tokens_by_modality?.find((m) => m.modality.toLowerCase() === 'audio')?.tokens ??
        usage?.total_output_tokens ??
        Math.round(audioSec * NARX.audioTokensPerSecond);
      const costUsd = (inputTokens * NARX.textInputPerM + audioTokens * NARX.audioOutputPerM) / 1_000_000;
      onSynth?.({
        model, voice, profile: key, chars: req.text.length, firstChunkMs, totalMs: Date.now() - t0,
        audioSec, costUsd, attempts, ok, ...(error ? { error } : {}),
      });
    };

    async function open(): Promise<Response> {
      let res: Response;
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream', 'x-goog-api-key': apiKey },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
      } catch (err) {
        if (controller.signal.aborted) throw new LlmCallError('timeout', `TTS: ${TIMEOUT_MS} ms ichida javob kelmadi`, { cause: err });
        const cause = err instanceof Error && err.cause instanceof Error ? ` (${err.cause.message})` : '';
        throw new LlmCallError('unknown', redact(`TTS tarmoq xatosi: ${err instanceof Error ? err.message : String(err)}${cause}`, apiKey));
      }
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let message = text;
        try {
          const parsed = JSON.parse(text) as { error?: { message?: string } };
          if (parsed.error?.message) message = parsed.error.message;
        } catch {
          // JSON emas
        }
        const short = redact(message, apiKey).replace(/\s+/g, ' ').trim().slice(0, 240);
        throw new GeminiHttpError(res.status, `TTS: ${short}`, parseRetryDelayMs(text), res.status === 429 && /per day|daily|PerDay|RPD/i.test(text));
      }
      if (!res.body) throw new LlmCallError('unknown', "TTS: server bo'sh javob qaytardi");
      return res;
    }

    try {
      const opened = await withRetry(open, log);
      attempts = opened.attempts;
      const res = opened.value;

      const decoder = new TextDecoder();
      let buffer = '';
      const pending: Buffer[] = [];
      const handle = (event: Record<string, unknown>): void => {
        const type = event.event_type;
        if (type === 'step.delta') {
          const delta = event.delta as { type?: string; data?: string; sample_rate?: number } | undefined;
          if (delta?.type === 'audio' && delta.data) {
            if (delta.sample_rate) {
              sampleRate = delta.sample_rate;
              if (opts.meta) opts.meta.sampleRate = sampleRate;
            }
            let chunk = Buffer.from(delta.data, 'base64');
            if (carry) {
              chunk = Buffer.concat([carry, chunk]);
              carry = null;
            }
            // 16-bit namunalar juft baytda — toq qoldiq keyingi bo'lakka.
            if (chunk.length % 2 === 1) {
              carry = chunk.subarray(chunk.length - 1);
              chunk = chunk.subarray(0, chunk.length - 1);
            }
            if (chunk.length > 0) pending.push(chunk);
          }
          const meta = event.metadata as { total_usage?: StreamUsage } | undefined;
          if (meta?.total_usage) usage = meta.total_usage;
        } else if (type === 'step.stop' || type === 'interaction.status_update') {
          if (event.usage) usage = event.usage as StreamUsage;
        } else if (type === 'interaction.completed') {
          const it = event.interaction as { usage?: StreamUsage } | undefined;
          if (it?.usage) usage = it.usage;
        } else if (type === 'error') {
          const e = event.error as { code?: string; message?: string } | undefined;
          streamError = `${e?.code ?? 'error'}: ${e?.message ?? ''}`;
        }
      };
      const flush = (block: string): void => {
        const data = block
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trimStart())
          .join('\n');
        if (!data || data === '[DONE]') return;
        try {
          handle(JSON.parse(data) as Record<string, unknown>);
        } catch {
          // to'liq bo'lmagan blok — o'tkaziladi
        }
      };
      const header = (): Buffer => wavHeader(0x7fffffff - 36, { sampleRate, channels: 1, bitsPerSample: 16 });

      try {
        for await (const part of res.body as unknown as AsyncIterable<Uint8Array>) {
          buffer += decoder.decode(part, { stream: true }).replace(/\r\n/g, '\n');
          let at: number;
          while ((at = buffer.indexOf('\n\n')) >= 0) {
            flush(buffer.slice(0, at));
            buffer = buffer.slice(at + 2);
          }
          while (pending.length > 0) {
            const chunk = pending.shift() as Buffer;
            if (firstChunkMs === null) {
              firstChunkMs = Date.now() - t0;
              // Uzunlik noma'lum: maksimal qiymat — brauzer oqim tugaguncha ijro qiladi.
              if (opts.header === 'stream') yield header();
            }
            pcmBytes += chunk.length;
            yield chunk;
          }
        }
      } catch (err) {
        if (controller.signal.aborted) throw new LlmCallError('timeout', `TTS oqimi ${TIMEOUT_MS} ms da tugamadi`);
        throw new LlmCallError('unknown', redact(`TTS oqimi uzildi: ${err instanceof Error ? err.message : String(err)}`, apiKey));
      }
      if (buffer.trim()) flush(buffer);
      for (const chunk of pending.splice(0)) {
        if (firstChunkMs === null) {
          firstChunkMs = Date.now() - t0;
          if (opts.header === 'stream') yield header();
        }
        pcmBytes += chunk.length;
        yield chunk;
      }
      if (streamError) throw new LlmCallError('unknown', redact(`TTS oqimida xato: ${streamError}`, apiKey));
      if (pcmBytes === 0) throw new LlmCallError('unknown', "TTS: audio kelmadi (oqimda audio bo'lagi yo'q)");
      report(true);
    } catch (err) {
      report(false, err instanceof Error ? err.message : String(err));
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    async synthesize(req: TtsRequest): Promise<TtsResult> {
      const t0 = Date.now();
      const parts: Buffer[] = [];
      let firstByteMs: number | undefined;
      const meta = { sampleRate: SAMPLE_RATE };
      // Sarlavhasiz PCM yig'iladi, oxirida aniq uzunlik bilan WAV yasaladi.
      for await (const chunk of stream(req, { header: 'none', meta })) {
        if (firstByteMs === undefined) firstByteMs = Date.now() - t0;
        parts.push(Buffer.from(chunk));
      }
      const pcm = Buffer.concat(parts);
      return {
        audio: Buffer.concat([wavHeader(pcm.length, { sampleRate: meta.sampleRate, channels: 1, bitsPerSample: 16 }), pcm]),
        mime: 'audio/wav',
        latencyMs: Date.now() - t0,
        ...(firstByteMs !== undefined ? { firstByteMs } : {}),
      };
    },
    synthesizeStream(req: TtsRequest): TtsStream {
      return { mime: 'audio/wav', chunks: stream(req, { header: 'stream' }) };
    },
  };
}
