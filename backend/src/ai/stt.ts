import { createSign } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { decryptSecret } from '../crypto/secrets.js';
import { withoutTenantIsolation } from '../db/index.js';
import { aiProvider } from '../db/schema/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NUTQNI MATNGA AYLANTIRISH (STT) — FAZA 2
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Interfeys ataylab `LlmClient` bilan bir xil naqshda: provayderdan
 * mustaqil, kalit bazadan shifrlangan holda o'qiladi, xarajat qaytariladi.
 * Provayder almashtirilganda ustki kod o'zgarmaydi.
 *
 * ── FR-84 va diarizatsiya: eng muhim qaror ──
 *
 * Google diarizatsiyasi "kim gapirdi" degan savolga `speakerTag: 1|2`
 * deb javob beradi — LEKIN qaysi biri menejer ekanini bilmaydi. Uni
 * taxmin qilish (masalan "birinchi gapirgan — mijoz") aynan TZ dagi
 * FR-84 muammosini keltirib chiqaradi: rol almashsa, kouching mutlaqo
 * teskari xulosa chiqaradi va buni hech kim sezmaydi.
 *
 * Shuning uchun bu modul rollarni O'ZI BELGILAMAYDI. U `speakerTag`
 * larni qaytaradi, rolni esa **odam** tanlaydi (matn importidagi
 * `dryRun` qadami bilan bir xil mantiq).
 *
 * ── Nega Google ──
 * O'zbek tilini qo'llab-quvvatlaydi (`uz-UZ`). TZ da bu №1 risk deb
 * belgilangan — sifat oldindan ma'lum emas, shuning uchun natija
 * ishonch darajasi bilan birga saqlanadi va foydalanuvchi transkriptni
 * ko'rib chiqa oladi.
 */

export interface SttWord {
  text: string;
  startSeconds: number;
  endSeconds: number;
  /** Google diarizatsiyasi bergan so'zlovchi belgisi (1, 2, ...). */
  speakerTag: number;
}

export interface SttUtterance {
  speakerTag: number;
  text: string;
  startSeconds: number;
  endSeconds: number;
  confidence: number | null;
}

export interface SttResult {
  utterances: SttUtterance[];
  /** Aniqlangan yoki so'ralgan til. */
  language: string;
  durationSeconds: number;
  model: string;
  costUsd: number;
  /** Nechta turli so'zlovchi topildi. */
  speakerCount: number;
}

export interface SttRequest {
  audio: Buffer;
  /** MIME turi — kodlashni aniqlash uchun. */
  mimeType: string;
  languageCode?: string;
  /** Kutilayotgan so'zlovchilar soni — diarizatsiya aniqligini oshiradi. */
  speakerCount?: number;
}

export interface SttClient {
  transcribe(req: SttRequest): Promise<SttResult>;
}

/** Provayder javobi kutilganidan boshqacha bo'lsa. */
export class SttError extends Error {}

/**
 * Google STT narxi — daqiqasiga, dollarda.
 *
 * Standart tarif ~$0.024/daqiqa (v1 standard model). Aniq raqam
 * mintaqa, model va shartnomaga qarab farq qiladi, shuning uchun u
 * provayder sozlamasidan (`models.costPerMinuteUsd`) o'zgartiriladi.
 *
 * **Birinchi 60 daqiqa bepul hisobga OLINMAYDI.** Bepul limitga
 * tayanib xarajatni kam ko'rsatish — mijozga noto'g'ri tannarx
 * ko'rsatish demak (FR-89 xarajat kuzatuvining ma'nosi shunda).
 */
const DEFAULT_PER_MINUTE_USD = 0.024;

/**
 * MIME → Google `encoding`.
 *
 * `ENCODING_UNSPECIFIED` qaytarilganda Google fayl sarlavhasidan o'zi
 * aniqlaydi — bu WAV va FLAC uchun ishonchli ishlaydi. Telegram ovozli
 * xabarlari OGG_OPUS bo'ladi, MP3 esa alohida ko'rsatilishi kerak.
 */
function googleEncoding(mimeType: string): { encoding?: string; sampleRateHertz?: number } {
  const m = mimeType.toLowerCase();
  if (m.includes('ogg') || m.includes('opus')) return { encoding: 'OGG_OPUS', sampleRateHertz: 48000 };
  if (m.includes('mpeg') || m.includes('mp3')) return { encoding: 'MP3' };
  if (m.includes('flac')) return { encoding: 'FLAC' };
  if (m.includes('wav') || m.includes('x-wav')) return {}; // sarlavhadan aniqlanadi
  if (m.includes('webm')) return { encoding: 'WEBM_OPUS', sampleRateHertz: 48000 };
  if (m.includes('m4a') || m.includes('mp4') || m.includes('aac')) {
    // Google M4A/AAC ni qo'llab-quvvatlamaydi — aniq xato yaxshiroq.
    throw new SttError(
      'M4A/AAC formatini Google qo\'llab-quvvatlamaydi. MP3, WAV, OGG yoki FLAC ga o\'giring.',
    );
  }
  return {};
}

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

/**
 * Service account JSON dan OAuth2 access token oladi.
 *
 * Google Cloud Speech-to-Text uchun bu ishonchli yo'l. API kaliti ham
 * ba'zi sozlamalarda ishlaydi, lekin u loyihada yoqilgan bo'lishi
 * kerak — shuning uchun ikkala usul ham qo'llab-quvvatlanadi
 * (`resolveAuth` ga qarang).
 */
async function serviceAccountToken(sa: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const tokenUri = sa.token_uri ?? 'https://oauth2.googleapis.com/token';

  const b64 = (o: unknown): string =>
    Buffer.from(JSON.stringify(o)).toString('base64url');

  const header = b64({ alg: 'RS256', typ: 'JWT' });
  const claims = b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: tokenUri,
    exp: now + 3600,
    iat: now,
  });

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  // JSON ichidagi `\n` haqiqiy qator uzilishiga aylantiriladi — aks holda
  // kalit yaroqsiz bo'ladi va xato tushunarsiz bo'lib chiqadi.
  const key = sa.private_key.replace(/\\n/g, '\n');
  const signature = signer.sign(key, 'base64url');

  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${header}.${claims}.${signature}`,
    }),
  });

  if (!res.ok) {
    throw new SttError(`Google OAuth xatosi ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new SttError('Google OAuth token qaytarmadi');
  return json.access_token;
}

type GoogleAuth =
  | { kind: 'bearer'; token: string }
  | { kind: 'apiKey'; key: string };

/**
 * Kredensial JSON bo'lsa — service account, aks holda API kaliti.
 *
 * Foydalanuvchi qaysi birini olgan bo'lsa, o'shani kiritadi va ishlaydi.
 * "Noto'g'ri formatdagi kalit" degan xato bilan qaytarish — sozlashning
 * eng ko'p vaqt oladigan qismi bo'lardi.
 */
async function resolveAuth(credential: string): Promise<GoogleAuth> {
  const trimmed = credential.trim();
  if (!trimmed.startsWith('{')) return { kind: 'apiKey', key: trimmed };

  let sa: ServiceAccount;
  try {
    sa = JSON.parse(trimmed) as ServiceAccount;
  } catch {
    throw new SttError('Service account JSON o\'qib bo\'lmadi');
  }
  if (!sa.client_email || !sa.private_key) {
    throw new SttError('Service account JSON da client_email yoki private_key yo\'q');
  }
  return { kind: 'bearer', token: await serviceAccountToken(sa) };
}

interface GoogleWord {
  word?: string;
  startTime?: string;
  endTime?: string;
  speakerTag?: number;
}

interface GoogleAlternative {
  transcript?: string;
  confidence?: number;
  words?: GoogleWord[];
}

interface GoogleResult {
  alternatives?: GoogleAlternative[];
  languageCode?: string;
}

/** `"12.500s"` → 12.5 */
function parseDuration(v: string | undefined): number {
  if (!v) return 0;
  return Number.parseFloat(v.replace(/s$/, '')) || 0;
}

/**
 * Google so'zlarni `speakerTag` bilan qaytaradi, gaplarga bo'lmaydi.
 * Ketma-ket bir xil belgili so'zlarni bitta gapga yig'amiz.
 *
 * **Eksport qilingan** — javobni qayta ishlash mantig'i haqiqiy API'siz
 * ham sinaladigan sof funksiya bo'lishi kerak.
 */
export function wordsToUtterances(words: SttWord[]): SttUtterance[] {
  const out: SttUtterance[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last && last.speakerTag === w.speakerTag) {
      last.text = `${last.text} ${w.text}`;
      last.endSeconds = w.endSeconds;
      continue;
    }
    out.push({
      speakerTag: w.speakerTag,
      text: w.text,
      startSeconds: w.startSeconds,
      endSeconds: w.endSeconds,
      confidence: null,
    });
  }
  return out;
}

/**
 * Google javobidan so'zlarni ajratadi.
 *
 * Diarizatsiya yoqilganda Google so'zlarni **oxirgi** `result` ichida
 * to'liq qaytaradi (oldingilari qisman). Shuning uchun eng ko'p so'zi
 * bor natija olinadi — aks holda transkript qirqilib qoladi.
 */
export function extractWords(results: GoogleResult[]): SttWord[] {
  let best: GoogleWord[] = [];
  for (const r of results) {
    const w = r.alternatives?.[0]?.words ?? [];
    if (w.length > best.length) best = w;
  }
  return best
    .filter((w) => (w.word ?? '').length > 0)
    .map((w) => ({
      text: w.word!,
      startSeconds: parseDuration(w.startTime),
      endSeconds: parseDuration(w.endTime),
      // Belgisiz so'z bo'lsa — birinchi so'zlovchiga beramiz.
      speakerTag: w.speakerTag ?? 1,
    }));
}

export class GoogleStt implements SttClient {
  /**
   * `model` standarti ataylab `default`, `latest_long` emas.
   * `latest_long` aniqroq, lekin u hamma tilda mavjud emas va
   * qo'llab-quvvatlanmagan tilda Google xato qaytaradi. `default`
   * esa qo'llab-quvvatlanadigan har bir tilda ishlaydi — birinchi
   * sozlash urinishi xatosiz o'tishi muhimroq.
   */
  constructor(
    private readonly credential: string,
    private readonly model = 'default',
    private readonly perMinuteUsd = DEFAULT_PER_MINUTE_USD,
  ) {}

  async transcribe(req: SttRequest): Promise<SttResult> {
    const auth = await resolveAuth(this.credential);
    const enc = googleEncoding(req.mimeType);
    const speakerCount = req.speakerCount ?? 2;

    const body = {
      config: {
        ...enc,
        languageCode: req.languageCode ?? 'uz-UZ',
        enableAutomaticPunctuation: true,
        enableWordTimeOffsets: true,
        model: this.model,
        diarizationConfig: {
          enableSpeakerDiarization: true,
          minSpeakerCount: speakerCount,
          maxSpeakerCount: speakerCount,
        },
      },
      audio: { content: req.audio.toString('base64') },
    };

    const base = 'https://speech.googleapis.com/v1p1beta1/speech:longrunningrecognize';
    const url = auth.kind === 'apiKey' ? `${base}?key=${encodeURIComponent(auth.key)}` : base;
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (auth.kind === 'bearer') headers.authorization = `Bearer ${auth.token}`;

    const start = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!start.ok) {
      throw new SttError(
        `Google STT xatosi ${start.status}: ${(await start.text()).slice(0, 300)}`,
      );
    }
    const started = (await start.json()) as { name?: string };
    if (!started.name) throw new SttError('Google operatsiya nomini qaytarmadi');

    const done = await this.pollOperation(started.name, auth);
    const words = extractWords(done.results ?? []);
    if (words.length === 0) {
      throw new SttError(
        'Audiodan nutq aniqlanmadi. Fayl bo\'sh, juda shovqinli yoki til noto\'g\'ri tanlangan bo\'lishi mumkin.',
      );
    }

    const utterances = wordsToUtterances(words);
    const durationSeconds = words[words.length - 1]!.endSeconds;

    return {
      utterances,
      language: done.results?.[0]?.languageCode ?? req.languageCode ?? 'uz-UZ',
      durationSeconds,
      model: this.model,
      // Google daqiqa bo'yicha, yuqoriga yaxlitlab hisoblaydi.
      costUsd: Math.ceil(durationSeconds / 60) * this.perMinuteUsd,
      speakerCount: new Set(utterances.map((u) => u.speakerTag)).size,
    };
  }

  /**
   * Uzoq operatsiyani kutish.
   *
   * Google qancha kutishni oldindan aytmaydi. Amaliy qoida: audio
   * uzunligining ~0.3 qismi. Chegara ataylab keng (10 daqiqa), lekin
   * cheksiz emas — osilgan operatsiya worker'ni bloklab qo'ymasin.
   */
  private async pollOperation(
    name: string,
    auth: GoogleAuth,
  ): Promise<{ results?: GoogleResult[] }> {
    const base = `https://speech.googleapis.com/v1/operations/${encodeURIComponent(name)}`;
    const url = auth.kind === 'apiKey' ? `${base}?key=${encodeURIComponent(auth.key)}` : base;
    const headers: Record<string, string> = {};
    if (auth.kind === 'bearer') headers.authorization = `Bearer ${auth.token}`;

    const deadline = Date.now() + 10 * 60_000;
    let kutish = 2000;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, kutish));
      kutish = Math.min(kutish * 1.5, 15_000);

      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new SttError(
          `Google operatsiya holati xatosi ${res.status}: ${(await res.text()).slice(0, 200)}`,
        );
      }
      const op = (await res.json()) as {
        done?: boolean;
        error?: { message?: string };
        response?: { results?: GoogleResult[] };
      };
      if (op.error) throw new SttError(`Google STT: ${op.error.message ?? 'noma\'lum xato'}`);
      if (op.done) return op.response ?? {};
    }

    throw new SttError('Google STT javob bermadi (10 daqiqa) — faylni qisqartirib ko\'ring');
  }
}

/**
 * Faol STT provayderi. `getActiveLlm` bilan bir xil naqsh.
 */
export async function getActiveStt(): Promise<SttClient> {
  const [provider] = await withoutTenantIsolation(
    'STT: faol provayderni o\'qish (platforma darajasi)',
    (tx) =>
      tx
        .select({
          kind: aiProvider.kind,
          apiKeyEncrypted: aiProvider.apiKeyEncrypted,
          models: aiProvider.models,
        })
        .from(aiProvider)
        .where(and(eq(aiProvider.purpose, 'stt'), eq(aiProvider.isActive, true)))
        .limit(1),
  );

  if (!provider) {
    throw new SttError(
      'Bulutli STT provayderi sozlanmagan. Ikki yo\'l bor: ' +
        '(1) lokal Whisper — kalitsiz va kartasiz, `npm run stt:local -- fayl.mp3` ' +
        'natijasini "Matn" bo\'limiga joylashtiring; ' +
        '(2) Google kalitini qo\'shing — `npm run provider:stt`.',
    );
  }
  if (!provider.apiKeyEncrypted) throw new SttError('Faol STT provayderida kalit yo\'q');

  const credential = decryptSecret(Buffer.from(provider.apiKeyEncrypted));
  const models = (provider.models ?? {}) as Record<string, string>;

  switch (provider.kind) {
    case 'google': {
      const narx = Number(models.costPerMinuteUsd);
      return new GoogleStt(
        credential,
        models.stt ?? 'default',
        Number.isFinite(narx) && narx > 0 ? narx : undefined,
      );
    }
    default:
      throw new SttError(
        `STT uchun "${provider.kind}" provayderi hali qo'llab-quvvatlanmaydi (hozircha faqat google)`,
      );
  }
}
