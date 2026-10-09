import { and, asc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { LlmClient } from '../ai/llm.js';
import { refineAndAnalyzeTranscript } from '../ai/refine-and-analyze.js';
import type { SttClient } from '../ai/stt.js';
import { isAnalysisBlocked } from '../billing/engine.js';
import { loadActivePlaybookAndBusiness, tahlilniSaqla, transkriptQil } from '../calls/pipeline.js';
import { decryptSecret } from '../crypto/secrets.js';
import { withoutTenantIsolation, withTenant, type Tx } from '../db/index.js';
import { business, contact, conversation, integration, seat, syncLog } from '../db/schema/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOI ZVONKI — telefon qo'ng'iroqlari yozuvini olish va baholash
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Moi Zvonki — menejer telefonidagi qo'ng'iroqlarni yozib, bulutga
 * yuklaydigan xizmat. Bizga undan uch narsa kerak: kim qo'ng'iroq qildi
 * (xodim), kim bilan (mijoz raqami) va yozuvning o'zi (audio).
 *
 * OQIM — ikki mustaqil bosqich
 * ────────────────────────────
 *   1. SINXRONLASH (`sinxronla`) — `calls.list` dan yangi qo'ng'iroqlar
 *      olinadi va har biri `received` holatidagi suhbat bo'lib bazaga
 *      yoziladi. Tez va arzon: faqat metama'lumot, audio yuklanmaydi.
 *   2. QAYTA ISHLASH (`qongiroqlarniQaytaIshla`) — `received` suhbatning
 *      yozuvi yuklab olinadi → transkript → baholash → saqlash.
 *      Sekin va pullik (STT + LLM).
 *
 * Nega ajratilgan: sinxronlash tarmoq bo'lmasa ham, STT ishlamasa ham
 * qo'ng'iroqlarni YO'QOTMASLIGI kerak. Bitta bosqichda bo'lsa, STT xatosi
 * qo'ng'iroqni butunlay tushirib qoldirardi. Endi u bazada turadi va keyingi
 * urinishda qayta ishlanadi.
 *
 * XODIM → MENEJER
 * ───────────────
 * Moi Zvonki xodimi (`user_id`) bizdagi menejer o'rniga
 * `seat.externalIds.moizvonki` orqali bog'lanadi. Bog'lanmagan xodimning
 * qo'ng'iroqlari ham saqlanadi (`seatId = null`), lekin baholanmaydi —
 * kimni baholayotganimizni bilmasak, ball noto'g'ri odamga tushardi.
 * Rahbar bog'lagach, kutib turganlar o'sha menejerga o'tadi
 * (`xodimniBogla`).
 *
 * XAVFSIZLIK
 * ──────────
 * • API kalit `credentials_encrypted` da shifrlangan, hech qachon
 *   qaytarilmaydi va jurnalga yozilmaydi.
 * • Manzil foydalanuvchidan faqat SUBDOMEN sifatida olinadi va
 *   `https://{sub}.moizvonki.ru` ga qotiriladi. To'liq URL qabul qilsak,
 *   server ixtiyoriy ichki manzilga so'rov yuboradigan bo'lardi (SSRF).
 */

// ─── Sozlama ─────────────────────────────────────────────────────────────────

/** Subdomen: `kompaniya` (`kompaniya.moizvonki.ru` dan). */
const SUBDOMEN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * Foydalanuvchi kiritgan manzildan subdomenni ajratadi.
 *
 * Moi Zvonki kabinetida manzil `kompaniya.moizvonki.ru` ko'rinishida turadi,
 * odamlar esa uni `https://` bilan yoki oxirida `/` bilan ham nusxalaydi.
 * Hammasini qabul qilamiz, lekin natija har doim faqat subdomen.
 * Boshqa domen kelsa — `null` (rad etiladi).
 */
export function subdomenniAjrat(kirish: string): string | null {
  let s = kirish.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (s.endsWith('.moizvonki.ru')) s = s.slice(0, -'.moizvonki.ru'.length);
  if (s.includes('.')) return null;
  return SUBDOMEN.test(s) ? s : null;
}

export const moizvonkiConfigSchema = z
  .object({
    /** Faqat subdomen — `subdomenniAjrat` dan o'tgan. */
    domain: z.string().regex(SUBDOMEN).nullable().default(null),
    /** Moi Zvonki'dagi foydalanuvchi emaili (API kalit egasi). */
    userName: z.string().email().nullable().default(null),
    /**
     * Qo'ng'iroqlar avtomatik baholansinmi.
     *
     * O'chiq bo'lsa ham sinxronlash ishlaydi — qo'ng'iroqlar ro'yxatda
     * ko'rinadi, faqat STT/LLM pul sarflamaydi.
     */
    autoAnalyze: z.boolean().default(true),
    /**
     * Shundan qisqa qo'ng'iroqlar olinmaydi.
     *
     * "Allo, keyinroq qo'ng'iroq qiling" — 8 soniya. Uni transkript qilib
     * baholash pul sarflaydi va hech narsa demaydi.
     */
    minDurationSeconds: z.number().int().min(0).max(600).default(20),
    /** Birinchi ulanishda necha kun orqaga qarab olinsin. */
    backfillDays: z.number().int().min(0).max(30).default(1),
    /** Oxirgi olingan qo'ng'iroq ID si — keyingi sinxronlash shundan boshlanadi. */
    lastCallId: z.number().int().nullable().default(null),
    lastStats: z
      .object({
        olindi: z.number(),
        saqlandi: z.number(),
        javobsiz: z.number(),
        qisqa: z.number(),
        yozuvsiz: z.number(),
        boglanmagan: z.number(),
      })
      .nullable()
      .default(null),
  })
  .default({});

export type MoizvonkiConfig = z.infer<typeof moizvonkiConfigSchema>;

// ─── API mijozi ──────────────────────────────────────────────────────────────

export class MoizvonkiXato extends Error {
  constructor(
    message: string,
    /** Provayder HTTP kodi; tarmoq xatosida 0. */
    public status = 0,
  ) {
    super(message);
  }
}

/**
 * API manzili.
 *
 * `MOIZVONKI_API_BASE` FAQAT test uchun — soxta serverga yo'naltirish.
 * Har chaqiruvda o'qiladi (modul yuklanganda emas): test uni importlardan
 * keyin o'rnatadi.
 */
function apiManzil(domain: string): string {
  return process.env.MOIZVONKI_API_BASE ?? `https://${domain}.moizvonki.ru/api/v1`;
}

const TIMEOUT_MS = 20_000;

/**
 * Bitta API chaqiruvi.
 *
 * Xato matnidan API kalit ehtiyotkorlik uchun olib tashlanadi: ba'zi
 * provayderlar xato javobida so'rovni qaytaradi, u esa jurnalga va
 * interfeysga tushadi.
 */
export async function chaqir<T>(
  cfg: { domain: string; userName: string },
  apiKey: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const tozala = (m: string) => m.split(apiKey).join('***').slice(0, 300);
  try {
    const res = await fetch(apiManzil(cfg.domain), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ user_name: cfg.userName, api_key: apiKey, action, ...params }),
      signal: controller.signal,
    });
    const matn = await res.text();
    if (!res.ok) {
      throw new MoizvonkiXato(`Moi Zvonki ${res.status}: ${tozala(matn) || res.statusText}`, res.status);
    }
    try {
      return JSON.parse(matn) as T;
    } catch {
      throw new MoizvonkiXato(`Moi Zvonki JSON emas javob qaytardi: ${tozala(matn)}`, res.status);
    }
  } catch (err) {
    if (err instanceof MoizvonkiXato) throw err;
    const m = err instanceof Error ? err.message : String(err);
    throw new MoizvonkiXato(m === 'The operation was aborted.' ? 'Moi Zvonki javob bermadi (vaqt tugadi)' : tozala(m));
  } finally {
    clearTimeout(timer);
  }
}

/** `calls.list` javobidagi bitta qo'ng'iroq — faqat bizga keraklilari. */
export const mzQongiroq = z
  .object({
    db_call_id: z.coerce.number().int(),
    direction: z.coerce.number().int(),
    client_number: z.string().nullable().optional(),
    client_name: z.string().nullable().optional(),
    start_time: z.coerce.number(),
    end_time: z.coerce.number().nullable().optional(),
    duration: z.coerce.number().nullable().optional(),
    answered: z.coerce.number().int(),
    recording: z.string().nullable().optional(),
    src_number: z.string().nullable().optional(),
    user_id: z.coerce.string().nullable().optional(),
    user_account: z.string().nullable().optional(),
  })
  .passthrough();

export type MzQongiroq = z.infer<typeof mzQongiroq>;

const mzRoyxat = z.object({
  results_count: z.coerce.number().optional(),
  results_remains: z.coerce.number().optional(),
  results_next_offset: z.coerce.number().optional(),
  results: z.array(z.unknown()).default([]),
});

export const mzXodim = z
  .object({
    id: z.coerce.string(),
    email: z.string().nullable().optional(),
    display_name: z.string().nullable().optional(),
    role: z.coerce.number().nullable().optional(),
  })
  .passthrough();

export type MzXodim = z.infer<typeof mzXodim>;

/**
 * Ulanishni tekshiradi — kalit, email va supervisor huquqi.
 *
 * `supervised: 1` ataylab: aks holda faqat API kalit EGASINING o'z
 * qo'ng'iroqlari keladi va boshqa menejerlar jimgina tushib qolardi.
 * Huquq yetmasa, buni ulash paytida aytish kerak — bir haftadan keyin
 * "nega faqat bitta menejer bor" deb emas.
 */
export async function ulanishniTekshir(
  cfg: { domain: string; userName: string },
  apiKey: string,
): Promise<void> {
  await chaqir(cfg, apiKey, 'calls.list', {
    from_date: Math.floor(Date.now() / 1000) - 86400,
    max_results: 1,
    supervised: 1,
  });
}

/** Barcha xodimlar (`company.list_employee`, faqat admin huquqi bilan). */
export async function xodimlarniOl(
  cfg: { domain: string; userName: string },
  apiKey: string,
): Promise<MzXodim[]> {
  const natija: MzXodim[] = [];
  let offset = 0;
  // 100 tadan sahifalab; cheklov — cheksiz sikldan himoya.
  for (let i = 0; i < 20; i++) {
    const j = await chaqir<unknown>(cfg, apiKey, 'company.list_employee', {
      from_offset: offset,
      max_results: 100,
    });
    const r = mzRoyxat.parse(j);
    for (const x of r.results) {
      const p = mzXodim.safeParse(x);
      if (p.success) natija.push(p.data);
    }
    if (!r.results_remains || r.results.length === 0) break;
    offset = r.results_next_offset ?? offset + r.results.length;
  }
  return natija;
}

// ─── Sinxronlash ─────────────────────────────────────────────────────────────

export interface SinxronNatija {
  businessId: string;
  olindi: number;
  saqlandi: number;
  javobsiz: number;
  qisqa: number;
  yozuvsiz: number;
  boglanmagan: number;
  xato?: string;
}

/** Telefon raqamini solishtirish uchun: faqat raqamlar. */
export function raqamniTozala(r: string | null | undefined): string | null {
  const d = (r ?? '').replace(/\D/g, '');
  return d.length >= 7 ? d : null;
}

/**
 * Mijozni telefon raqami bo'yicha topadi yoki yaratadi.
 *
 * Bir mijoz qayta qo'ng'iroq qilsa, u YANGI kontakt bo'lib qolmasligi
 * kerak — aks holda "lid tarixi" har qo'ng'iroqda noldan boshlanardi va
 * qaytgan mijozlar tahlili ishlamasdi.
 */
async function kontaktniTop(
  tx: Tx,
  businessId: string,
  raqam: string | null,
  ism: string | null,
  vaqt: Date,
): Promise<string | null> {
  if (!raqam) return null;
  const [bor] = await tx
    .select({ id: contact.id })
    .from(contact)
    .where(and(eq(contact.businessId, businessId), eq(contact.phone, raqam)))
    .limit(1);
  if (bor) {
    await tx
      .update(contact)
      .set({ lastSeenAt: sql`greatest(${contact.lastSeenAt}, ${vaqt.toISOString()}::timestamptz)` })
      .where(eq(contact.id, bor.id));
    return bor.id;
  }
  const [yangi] = await tx
    .insert(contact)
    .values({ businessId, phone: raqam, name: ism, firstSeenAt: vaqt, lastSeenAt: vaqt })
    .returning({ id: contact.id });
  return yangi?.id ?? null;
}

/** Bir tikda ko'pi bilan shuncha sahifa (×100 qo'ng'iroq). */
const MAX_SAHIFA = 5;

interface UlanganIntegratsiya {
  id: string;
  businessId: string;
  cfg: MoizvonkiConfig & { domain: string; userName: string };
  apiKey: string;
}

/** Ulangan Moi Zvonki integratsiyalari (bitta yoki hammasi). */
async function ulanganlar(businessId?: string): Promise<UlanganIntegratsiya[]> {
  const rows = await withoutTenantIsolation(
    'moizvonki: ulangan integratsiyalar barcha bizneslar bo\'ylab',
    (tx) =>
      tx
        .select({
          id: integration.id,
          businessId: integration.businessId,
          config: integration.config,
          creds: integration.credentialsEncrypted,
        })
        .from(integration)
        .innerJoin(business, eq(business.id, integration.businessId))
        .where(
          and(
            eq(integration.kind, 'moizvonki'),
            eq(integration.status, 'connected'),
            eq(integration.syncEnabled, true),
            isNull(business.deletedAt),
            businessId ? eq(integration.businessId, businessId) : undefined,
          ),
        ),
  );

  const natija: UlanganIntegratsiya[] = [];
  for (const r of rows) {
    const cfg = moizvonkiConfigSchema.parse(
      (r.config as Record<string, unknown>)?.moizvonki ?? {},
    );
    if (!cfg.domain || !cfg.userName || !r.creds) continue;
    try {
      natija.push({
        id: r.id,
        businessId: r.businessId,
        cfg: { ...cfg, domain: cfg.domain, userName: cfg.userName },
        apiKey: decryptSecret(r.creds),
      });
    } catch {
      // Shifr kaliti almashgan — bu biznes o'tkazib yuboriladi, qolganlari ishlaydi.
    }
  }
  return natija;
}

/**
 * Yangi qo'ng'iroqlarni olib, suhbat sifatida saqlaydi.
 *
 * Takrorlanmaydi: `(business_id, channel, external_id)` unikal indeksi bor
 * va `onConflictDoNothing` — bir qo'ng'iroq ikki marta kelsa ham bitta
 * suhbat bo'ladi. Shu tufayli sinxronlash ixtiyoriy marta qayta
 * ishga tushirilishi xavfsiz.
 *
 * ATAYLAB otilmaydi: bitta biznesning noto'g'ri kaliti qolganlarini
 * to'xtatmasin. Xato `integration.last_error` ga yoziladi va interfeysda
 * ko'rinadi.
 */
export async function sinxronla(businessId?: string): Promise<SinxronNatija[]> {
  const natijalar: SinxronNatija[] = [];
  for (const ig of await ulanganlar(businessId)) {
    natijalar.push(await bittaBiznesniSinxronla(ig));
  }
  return natijalar;
}

async function bittaBiznesniSinxronla(ig: UlanganIntegratsiya): Promise<SinxronNatija> {
  const boshlandi = Date.now();
  const n: SinxronNatija = {
    businessId: ig.businessId,
    olindi: 0,
    saqlandi: 0,
    javobsiz: 0,
    qisqa: 0,
    yozuvsiz: 0,
    boglanmagan: 0,
  };

  try {
    // Xodim → o'rin xaritasi bir marta o'qiladi.
    const orinlar = await withTenant(ig.businessId, (tx) =>
      tx
        .select({ id: seat.id, ext: seat.externalIds })
        .from(seat)
        .where(eq(seat.isActive, true)),
    );
    const xarita = new Map<string, string>();
    for (const o of orinlar) {
      for (const mz of mzIdlar(o.ext)) xarita.set(mz, o.id);
    }

    let oxirgiId = ig.cfg.lastCallId;
    let offset = 0;
    const birinchiMarta = oxirgiId === null;
    const boshSana = Math.floor(Date.now() / 1000) - ig.cfg.backfillDays * 86400;

    for (let sahifa = 0; sahifa < MAX_SAHIFA; sahifa++) {
      /**
       * Sahifalash: birinchi ulanishda sana bo'yicha (`from_date` +
       * `from_offset`), keyin esa oxirgi ID dan (`from_id`). ID bo'yicha
       * davom etish ishonchliroq — sana bo'yicha bo'lsa, server
       * soatining farqi qo'ng'iroqni tushirib qoldirishi yoki ikki marta
       * olishi mumkin edi.
       */
      const params: Record<string, unknown> = { max_results: 100, supervised: 1 };
      if (birinchiMarta) {
        params.from_date = boshSana;
        params.from_offset = offset;
      } else {
        params.from_id = oxirgiId;
      }

      const r = mzRoyxat.parse(await chaqir<unknown>(ig.cfg, ig.apiKey, 'calls.list', params));
      const qongiroqlar = r.results
        .map((x) => mzQongiroq.safeParse(x))
        .filter((p): p is { success: true; data: MzQongiroq } => p.success)
        .map((p) => p.data);

      if (qongiroqlar.length === 0) break;
      n.olindi += qongiroqlar.length;

      await withTenant(ig.businessId, async (tx) => {
        for (const q of qongiroqlar) {
          oxirgiId = Math.max(oxirgiId ?? 0, q.db_call_id);

          if (q.answered !== 1) {
            n.javobsiz++;
            continue;
          }
          if (!q.recording) {
            n.yozuvsiz++;
            continue;
          }
          const davom = q.duration ?? 0;
          if (davom < ig.cfg.minDurationSeconds) {
            n.qisqa++;
            continue;
          }

          const xodim = q.user_id ? String(q.user_id) : null;
          const seatId = xodim ? (xarita.get(xodim) ?? null) : null;
          if (!seatId) n.boglanmagan++;

          const boshi = new Date(q.start_time * 1000);
          const oxiri = q.end_time ? new Date(q.end_time * 1000) : null;
          const mijozRaqam = raqamniTozala(q.client_number);
          const kirish = q.direction === 0;
          const contactId = await kontaktniTop(
            tx,
            ig.businessId,
            mijozRaqam,
            q.client_name ?? null,
            boshi,
          );

          const yozildi = await tx
            .insert(conversation)
            .values({
              businessId: ig.businessId,
              seatId,
              contactId,
              channel: 'phone',
              direction: kirish ? 'inbound' : 'outbound',
              externalSource: 'moizvonki',
              externalId: `mz:${q.db_call_id}`,
              externalUserId: xodim,
              // Oqim — mijoz raqami: bir mijoz bilan barcha qo'ng'iroqlar
              // bitta zanjirda ko'rinadi.
              externalThreadId: mijozRaqam,
              startedAt: boshi,
              endedAt: oxiri,
              durationSeconds: Math.round(davom),
              mediaUrl: q.recording,
              phoneFrom: kirish ? mijozRaqam : raqamniTozala(q.src_number),
              phoneTo: kirish ? raqamniTozala(q.src_number) : mijozRaqam,
              status: 'received',
            })
            .onConflictDoNothing()
            .returning({ id: conversation.id });
          if (yozildi.length > 0) n.saqlandi++;
        }
      });

      if (!r.results_remains) break;
      if (birinchiMarta) offset = r.results_next_offset ?? offset + qongiroqlar.length;
    }

    await sinxronHolatiniYoz(ig, n, oxirgiId, null, Date.now() - boshlandi);
  } catch (err) {
    n.xato = err instanceof Error ? err.message : String(err);
    await sinxronHolatiniYoz(ig, n, ig.cfg.lastCallId, n.xato, Date.now() - boshlandi);
  }
  return n;
}

async function sinxronHolatiniYoz(
  ig: UlanganIntegratsiya,
  n: SinxronNatija,
  oxirgiId: number | null,
  xato: string | null,
  davomMs: number,
): Promise<void> {
  await withoutTenantIsolation('moizvonki: sinxronlash holatini yozish', async (tx) => {
    const [row] = await tx
      .select({ config: integration.config })
      .from(integration)
      .where(eq(integration.id, ig.id))
      .limit(1);
    const config = (row?.config ?? {}) as Record<string, unknown>;
    const eski = moizvonkiConfigSchema.parse(config.moizvonki ?? {});
    await tx
      .update(integration)
      .set({
        config: {
          ...config,
          moizvonki: {
            ...eski,
            lastCallId: oxirgiId,
            lastStats: {
              olindi: n.olindi,
              saqlandi: n.saqlandi,
              javobsiz: n.javobsiz,
              qisqa: n.qisqa,
              yozuvsiz: n.yozuvsiz,
              boglanmagan: n.boglanmagan,
            },
          },
        },
        lastSyncAt: new Date(),
        lastSyncStatus: xato ? 'error' : 'ok',
        lastError: xato,
        updatedAt: new Date(),
      })
      .where(eq(integration.id, ig.id));
    await tx.insert(syncLog).values({
      integrationId: ig.id,
      businessId: ig.businessId,
      direction: 'in',
      entity: 'call',
      status: xato ? 'error' : 'ok',
      itemCount: n.saqlandi,
      error: xato,
      durationMs: davomMs,
    });
  });
}

// ─── Qayta ishlash: yozuv → transkript → baho ────────────────────────────────

/**
 * Yozuv hajmi chegarasi.
 *
 * Google STT inline audioni ~10 MB gacha qabul qiladi; undan kattasini
 * yuklab olib, keyin rad etilishi — bekor tarmoq va vaqt.
 */
const MAX_YOZUV_BAYT = 10 * 1024 * 1024;

export interface QaytaIshlashNatija {
  qayta: number;
  baholandi: number;
  xato: number;
}

/**
 * Yozuvni yuklab oladi.
 *
 * Faqat `https` — yozuv manzili tashqi provayder javobidan keladi va
 * shifrlanmagan kanalda mijoz suhbati ochiq uzatilmasligi kerak.
 * Test rejimida (`MOIZVONKI_API_BASE`) lokal `http` ruxsat etiladi.
 */
async function yozuvniYukla(url: string): Promise<{ audio: Buffer; mime: string }> {
  const testRejimi = Boolean(process.env.MOIZVONKI_API_BASE);
  if (!/^https:\/\//i.test(url) && !(testRejimi && /^http:\/\//i.test(url))) {
    throw new Error('Yozuv manzili https emas — xavfsizlik uchun yuklanmadi');
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`Yozuv yuklanmadi: HTTP ${res.status}`);
    const uzunlik = Number(res.headers.get('content-length') ?? 0);
    if (uzunlik > MAX_YOZUV_BAYT) throw new Error('Yozuv 10 MB dan katta');
    const audio = Buffer.from(await res.arrayBuffer());
    if (audio.length === 0) throw new Error('Yozuv bo\'sh');
    if (audio.length > MAX_YOZUV_BAYT) throw new Error('Yozuv 10 MB dan katta');
    const mime = (res.headers.get('content-type') ?? 'audio/mpeg').split(';')[0]!.trim();
    return { audio, mime: mime.startsWith('audio/') ? mime : 'audio/mpeg' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Kutayotgan qo'ng'iroqlarni baholaydi.
 *
 * Bir tikda oz (standart 2): har biri STT + LLM — o'nlab soniya. Ko'p
 * olsak, ishchi sikl uzoq band bo'lib, boshqa ishlar (Telegram tahlili,
 * bildirishnomalar) kechikardi.
 *
 * Egallash ATOMIK: `status = received` → `transcribing` faqat bitta
 * jarayonda muvaffaqiyatli bo'ladi. Ikki server ishlasa ham bitta
 * qo'ng'iroq ikki marta baholanmaydi (ya'ni ikki marta pul sarflanmaydi).
 */
export async function qongiroqlarniQaytaIshla(
  opts: { limit?: number; stt?: SttClient; llm?: LlmClient; businessId?: string } = {},
): Promise<QaytaIshlashNatija> {
  const n: QaytaIshlashNatija = { qayta: 0, baholandi: 0, xato: 0 };

  const avtomatik = (await ulanganlar(opts.businessId)).filter((i) => i.cfg.autoAnalyze);
  if (avtomatik.length === 0) return n;

  // Obunasi to'xtagan biznes — yangi tahlil yo'q (FR-156), qo'ng'iroqlar kutib turadi.
  const ruxsat: string[] = [];
  for (const i of avtomatik) {
    if (!(await isAnalysisBlocked(i.businessId))) ruxsat.push(i.businessId);
  }
  if (ruxsat.length === 0) return n;

  const nomzodlar = await withoutTenantIsolation(
    'moizvonki: baholanishi kutilayotgan qo\'ng\'iroqlar',
    (tx) =>
      tx
        .select({
          id: conversation.id,
          businessId: conversation.businessId,
          seatId: conversation.seatId,
          contactId: conversation.contactId,
          startedAt: conversation.startedAt,
          mediaUrl: conversation.mediaUrl,
          externalId: conversation.externalId,
        })
        .from(conversation)
        .where(
          and(
            eq(conversation.externalSource, 'moizvonki'),
            eq(conversation.status, 'received'),
            isNotNull(conversation.seatId),
            isNotNull(conversation.mediaUrl),
            inArray(conversation.businessId, ruxsat),
          ),
        )
        .orderBy(asc(conversation.startedAt))
        .limit(opts.limit ?? 2),
  );

  // Playbook biznes boshiga bir marta.
  const pbKesh = new Map<string, Awaited<ReturnType<typeof loadActivePlaybookAndBusiness>>>();

  for (const c of nomzodlar) {
    if (!pbKesh.has(c.businessId)) {
      pbKesh.set(c.businessId, await loadActivePlaybookAndBusiness(c.businessId));
    }
    const pb = pbKesh.get(c.businessId);
    // Playbook yo'q — baholab bo'lmaydi. Qo'ng'iroq `received` da qoladi
    // va playbook yaratilgach o'zi baholanadi; hozir pul sarflamaymiz.
    if (!pb) continue;

    const egallandi = await withoutTenantIsolation('moizvonki: qo\'ng\'iroqni egallash', (tx) =>
      tx
        .update(conversation)
        .set({ status: 'transcribing', updatedAt: new Date() })
        .where(and(eq(conversation.id, c.id), eq(conversation.status, 'received')))
        .returning({ id: conversation.id }),
    );
    if (egallandi.length === 0) continue;
    n.qayta++;

    const boshlandi = Date.now();
    try {
      const { audio, mime } = await yozuvniYukla(c.mediaUrl!);
      const stt = await transkriptQil(audio, {
        mimeType: mime,
        filename: `${c.externalId ?? c.id}.mp3`,
        speakerCount: 2,
        stt: opts.stt,
      });
      if (stt.utterances.length === 0) throw new Error('Yozuvda nutq topilmadi');

      const merged = await refineAndAnalyzeTranscript(
        stt.utterances.map((u, seq) => ({
          seq,
          text: u.text,
          startSeconds: u.startSeconds,
          endSeconds: u.endSeconds,
        })),
        pb.body,
        pb.businessContext,
        c.startedAt,
        opts.llm,
      );

      await withTenant(c.businessId, async (tx) => {
        // `persistAnalysisTx` faqat `analyzing` holatidagi suhbatni yakunlaydi.
        await tx
          .update(conversation)
          .set({
            status: 'analyzing',
            language: stt.language,
            mediaBytes: audio.length,
            mediaKind: mime,
            updatedAt: new Date(),
          })
          .where(eq(conversation.id, c.id));

        await tahlilniSaqla(tx, {
          businessId: c.businessId,
          conversationId: c.id,
          seatId: c.seatId,
          contactId: c.contactId,
          startedAt: c.startedAt,
          pb,
          turns: merged.turns.map((t) => ({
            speaker: t.speaker,
            text: t.text,
            startSeconds: t.startSeconds,
          })),
          extracted: merged.extracted,
          stage3: merged.stage3,
          transcriptConfidence: merged.transcriptConfidence,
          costUsd: stt.costUsd + merged.costUsd,
          tokensIn: merged.tokensIn,
          tokensOut: merged.tokensOut,
          model: merged.model,
          processingStartedAt: boshlandi,
          speakerAttributionMethod: 'llm_inferred',
        });
      });
      n.baholandi++;
    } catch (err) {
      n.xato++;
      const m = err instanceof Error ? err.message : String(err);
      await withoutTenantIsolation('moizvonki: qo\'ng\'iroq xatosini yozish', (tx) =>
        tx
          .update(conversation)
          .set({ status: 'failed', excludedReason: m.slice(0, 300), updatedAt: new Date() })
          .where(eq(conversation.id, c.id)),
      );
    }
  }
  return n;
}

// ─── Xodimni menejerga bog'lash ──────────────────────────────────────────────

/**
 * O'ringa bog'langan Moi Zvonki xodimlari.
 *
 * `seat.externalIds.moizvonki` — vergul bilan ajratilgan ro'yxat (`"2,4"`):
 * bitta menejer bir nechta Moi Zvonki hisobidan qo'ng'iroq qilishi mumkin
 * (masalan ikki liniya). Eski bitta-ID'li qiymat (`"2"`) ham shu shaklga mos.
 */
export function mzIdlar(ext: unknown): string[] {
  const v = (ext as Record<string, unknown> | null)?.moizvonki;
  if (v === undefined || v === null || v === '') return [];
  return String(v).split(',').map((x) => x.trim()).filter(Boolean);
}

/**
 * Moi Zvonki xodimini menejer o'rniga bog'laydi (yoki `seatId = null`
 * bilan uzadi).
 *
 * Bir xodim faqat BITTA o'ringa bog'lanadi: avvalgi bog'lanish olib
 * tashlanadi. Aks holda bir qo'ng'iroq qaysi menejerga tegishli ekani
 * noaniq bo'lardi. Teskarisi esa mumkin: bitta o'ringa bir nechta xodim
 * (`mzIdlar`) — o'rinning boshqa xodimlari bu amaldan ta'sirlanmaydi.
 *
 * Bog'langach, shu xodimning hali baholanmagan, menejersiz
 * qo'ng'iroqlari o'sha menejerga o'tkaziladi — ular navbatdagi tikda
 * baholanadi.
 */
export async function xodimniBogla(
  businessId: string,
  xodimId: string,
  seatId: string | null,
): Promise<{ otkazildi: number }> {
  return withTenant(businessId, async (tx) => {
    const yoz = (id: string, ext: unknown, idlar: string[]) => {
      const yangi = { ...((ext as Record<string, string> | null) ?? {}) };
      if (idlar.length) yangi.moizvonki = idlar.join(',');
      else delete yangi.moizvonki;
      return tx.update(seat).set({ externalIds: yangi, updatedAt: new Date() }).where(eq(seat.id, id));
    };

    // Xodim avval qaysi o'rinda bo'lsa — o'sha ro'yxatdan chiqariladi.
    const hammasi = await tx.select({ id: seat.id, ext: seat.externalIds }).from(seat);
    for (const o of hammasi) {
      const idlar = mzIdlar(o.ext);
      if (idlar.includes(xodimId) && o.id !== seatId) await yoz(o.id, o.ext, idlar.filter((x) => x !== xodimId));
    }

    if (!seatId) return { otkazildi: 0 };

    const s = hammasi.find((o) => o.id === seatId);
    if (!s) throw new Error('Bunday menejer topilmadi');
    const idlar = mzIdlar(s.ext);
    if (!idlar.includes(xodimId)) await yoz(s.id, s.ext, [...idlar, xodimId]);

    const otdi = await tx
      .update(conversation)
      .set({ seatId, updatedAt: new Date() })
      .where(
        and(
          eq(conversation.externalSource, 'moizvonki'),
          eq(conversation.externalUserId, xodimId),
          isNull(conversation.seatId),
        ),
      )
      .returning({ id: conversation.id });
    return { otkazildi: otdi.length };
  });
}
