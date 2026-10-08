import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { promisify } from 'node:util';
import { desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { applicableCriteria, computeScoringGate, persistAnalysisTx } from '../ai/analyze.js';
import { prefilterTelegramSession } from '../ai/prefilter.js';
import type { Stage2Result, Stage3Result } from '../ai/prompts.js';
import { getActiveStt, SttError, type SttClient, type SttResult } from '../ai/stt.js';
import type { SpeakerRole } from '../ai/transcript-refine.js';
import { withTenant, type Tx } from '../db/index.js';
import { business, conversation, playbook, transcriptSegment } from '../db/schema/index.js';
import { playbookBodySchema, type PlaybookBody } from '../playbook/schema.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUDIO → TRANSKRIPT → TAHLIL — umumiy qism
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bu kod ilgari faqat `http/routes/import.ts` ichida edi (qo'lda audio
 * yuklash). Moi Zvonki integratsiyasi ham xuddi shu oqimga muhtoj: audio
 * keladi, transkript qilinadi, baholanadi, saqlanadi. Nusxa ko'chirish
 * o'rniga bu yerga chiqarildi — aks holda ikki nusxadan biri yangilanib,
 * ikkinchisi ortda qolardi (masalan, isbot tekshiruvi faqat bittasida).
 *
 * `http/routes/*` ga bog'lanmaydi: uni fon ishchi (`jobs/*`) ham chaqiradi.
 */

const execFileAsync = promisify(execFile);

export const sttModelSchema = z.enum(['gigaam', 'kotib', 'qwen3-uzbek']).default('gigaam');
export type SttModel = z.infer<typeof sttModelSchema>;

function parseGigaamTranscript(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const match = line.match(/^\[(\d{2}):(\d{2})]\s*(.+)$/);
      const startSeconds = match ? Number(match[1]) * 60 + Number(match[2]) : index * 15;
      return {
        // GigaAM longform VAD qiladi, speaker diarization emas.
        // Navbatma-navbat tag beriladi; rolni keyingi LLM qadami aniqlaydi.
        speakerTag: (index % 2) + 1,
        text: match?.[3] ?? line,
        startSeconds,
        endSeconds: startSeconds,
        confidence: null,
      };
    });
}

/** Lokal STT (GigaAM va boshqalar) — bulutli STT sozlanmagan bo'lsa zaxira. */
export async function transcribeWithLocalStt(
  audio: Buffer,
  filename: string,
  model: SttModel,
): Promise<SttResult & { note: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'sotuv-gigaam-'));
  const input = join(dir, `audio${extname(filename) || '.mp3'}`);
  const output = join(dir, 'transcript.txt');
  await writeFile(input, audio);

  const python = process.env.GIGAAM_PYTHON || process.env.PYTHON || 'python';
  const script = join(process.cwd(), '..', 'tools', 'gigaam-local.py');

  try {
    await execFileAsync(python, [script, input, '--engine', model, '--out', output, '--latin'], {
      timeout: 10 * 60_000,
      maxBuffer: 5 * 1024 * 1024,
      env: process.env,
    });
    const transcript = await readFile(output, 'utf8');
    const utterances = parseGigaamTranscript(transcript);
    if (utterances.length === 0) throw new SttError('GigaAM transkript qaytarmadi');

    return {
      utterances,
      speakerCount: Math.min(2, utterances.length),
      language: 'uz',
      durationSeconds: utterances.at(-1)?.startSeconds ?? 0,
      costUsd: 0,
      model: `local-${model}`,
      note:
        'Lokal STT transkript. Speaker taglar vaqtinchalik taxminiy: rollarni yuklashdan oldin tekshiring.',
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SttError(`Lokal STT xatosi (${model}): ${message}`);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/**
 * Audioni matnga aylantiradi: avval faol bulutli STT, u sozlash xatosi
 * bersa va `HF_TOKEN` bor bo'lsa — lokal model.
 *
 * `SttError` dan boshqa xato (tarmoq uzilishi, kod xatosi) zaxiraga
 * o'tkazilmaydi: u jimgina boshqa model bilan "ishlab ketsa", haqiqiy
 * nosozlik yashirinib qolardi.
 */
export async function transkriptQil(
  audio: Buffer,
  opts: {
    mimeType: string;
    filename: string;
    languageCode?: string;
    speakerCount?: number;
    sttModel?: SttModel;
    /** Testda soxta mijoz; ishlab chiqarishda faol provayder. */
    stt?: SttClient;
  },
): Promise<SttResult & { note?: string }> {
  try {
    const stt = opts.stt ?? (await getActiveStt());
    return await stt.transcribe({
      audio,
      mimeType: opts.mimeType,
      languageCode: opts.languageCode,
      speakerCount: opts.speakerCount ?? 2,
    });
  } catch (err) {
    if (err instanceof SttError && !opts.stt && process.env.HF_TOKEN) {
      return transcribeWithLocalStt(audio, opts.filename, opts.sttModel ?? 'gigaam');
    }
    throw err;
  }
}

/** Faol playbook + biznes konteksti. Playbook yo'q bo'lsa `null`. */
export interface PlaybookKonteksti {
  body: PlaybookBody;
  playbookId: string;
  playbookVersion: number;
  businessContext: string;
}

export async function loadActivePlaybookAndBusiness(
  businessId: string,
): Promise<PlaybookKonteksti | null> {
  const found = await withTenant(businessId, async (tx) => {
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
    if (!pb) return null;

    const [biz] = await tx
      .select({ name: business.name, profile: business.profile })
      .from(business)
      .where(eq(business.id, businessId))
      .limit(1);

    return { pb, biz: biz ?? null };
  });
  if (!found) return null;

  const body = playbookBodySchema.parse({
    criteria: found.pb.criteria,
    questionnaire: found.pb.questionnaire,
    classificationPolicy: found.pb.classificationPolicy,
    promptNotes: found.pb.promptNotes,
    leadQuality: found.pb.leadQuality,
  });
  const businessContext = [
    found.biz?.name ? `Biznes: ${found.biz.name}` : '',
    found.biz?.profile ? JSON.stringify(found.biz.profile) : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { body, playbookId: found.pb.id, playbookVersion: found.pb.version, businessContext };
}

export interface SaqlashNatijasi {
  conversationId: string;
  status: 'filtered' | 'not_scored' | 'done';
  reason?: string;
  analysisId?: string;
  flagged?: boolean;
}

/**
 * Birlashtirilgan (transkript + baholash) natijani MAVJUD suhbatga yozadi.
 *
 * Tartib qo'lda yuklash bilan aynan bir xil: segmentlar → pre-filter →
 * baholash darvozasi → `persistAnalysisTx` (isbotni kodda tekshirish shu
 * ichida). Qaysi yo'ldan kelganidan qat'i nazar natija bir xil
 * qoidalardan o'tadi — bu funksiyaning butun ma'nosi.
 *
 * `speakerAttributionMethod` — rolni kim aniqlagan. Telefon yozuvida bu
 * LLM (`llm_inferred`); past ishonch bo'lsa `analyze.ts` o'zi "inson
 * ko'rigi kerak" ogohlantirishini yaratadi (FR-84: taxmin hech qachon
 * jim bo'lmasin).
 */
export async function tahlilniSaqla(
  tx: Tx,
  p: {
    businessId: string;
    conversationId: string;
    seatId: string | null;
    contactId: string | null;
    startedAt: Date;
    pb: PlaybookKonteksti;
    turns: { speaker: SpeakerRole; text: string; startSeconds: number }[];
    extracted: Stage2Result;
    stage3: Stage3Result;
    transcriptConfidence: number;
    costUsd: number;
    tokensIn: number;
    tokensOut: number;
    model: string;
    processingStartedAt: number;
    speakerAttributionMethod: 'channel' | 'phone' | 'telegram_id' | 'llm_inferred';
  },
): Promise<SaqlashNatijasi> {
  const insertedSegs = await tx
    .insert(transcriptSegment)
    .values(
      p.turns.map((t, i) => ({
        conversationId: p.conversationId,
        businessId: p.businessId,
        seq: i,
        speaker: t.speaker,
        text: t.text,
        startSeconds: String(t.startSeconds),
      })),
    )
    .returning({
      id: transcriptSegment.id,
      seq: transcriptSegment.seq,
      speaker: transcriptSegment.speaker,
      text: transcriptSegment.text,
      startSeconds: transcriptSegment.startSeconds,
    });

  const segs = insertedSegs.map((row) => ({
    id: row.id,
    seq: row.seq,
    speaker: row.speaker,
    text: row.text,
    startSeconds: Number(row.startSeconds),
  }));

  const pre = prefilterTelegramSession(segs);
  if (!pre.pass) {
    await tx
      .update(conversation)
      .set({ status: 'filtered', excludedReason: pre.reason, updatedAt: new Date() })
      .where(eq(conversation.id, p.conversationId));
    return { conversationId: p.conversationId, status: 'filtered', reason: pre.reason ?? '' };
  }

  const gate = computeScoringGate(p.pb.body, p.extracted);
  const applicable = gate.skipScoring
    ? []
    : applicableCriteria(p.pb.body, p.extracted.callFamily, p.extracted.serviceLine);

  const persisted = await persistAnalysisTx(tx, {
    businessId: p.businessId,
    conversationId: p.conversationId,
    conv: { seatId: p.seatId, contactId: p.contactId, startedAt: p.startedAt },
    playbookId: p.pb.playbookId,
    playbookVersion: p.pb.playbookVersion,
    body: p.pb.body,
    segs,
    extracted: p.extracted,
    stage3: p.stage3,
    gate,
    applicable,
    cost: {
      totalCost: p.costUsd,
      tokensIn: p.tokensIn,
      tokensOut: p.tokensOut,
      modelVersions: { merged: p.model },
    },
    processingMs: Date.now() - p.processingStartedAt,
    speakerAttributionMethod: p.speakerAttributionMethod,
    speakerAttributionConfidence: p.transcriptConfidence,
  });

  return {
    conversationId: p.conversationId,
    status: gate.skipScoring ? 'not_scored' : 'done',
    analysisId: persisted.analysisId,
    flagged: persisted.flagged,
  };
}
