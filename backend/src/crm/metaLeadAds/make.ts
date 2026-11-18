import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withoutTenantIsolation, withTenant } from '../../db/index.js';
import { auditLog, makeLeadIntake } from '../../db/schema/index.js';
import { CrmXatosi } from '../xato.js';
import { metaLidiniYoz, type MurojaatKirish } from './ishlov.js';
import { voronkaniTekshir } from './oauth.js';
import { savolNomi, telefonniTozala } from './sof.js';
import { tashqiManzil } from './sozlama.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FACEBOOK LEAD ADS — MAKE ORQALI (asosiy usul)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   Meta Instant Form → Make (Facebook Lead Ads: New Lead) → HTTP "Make a request"
 *     → POST /api/v1/webhooks/crm/make/:id/leads   (X-API-Key)
 *     → «Saralanmagan» (manba «Meta Lead Ads», yetkazib beruvchi «Make»)
 *
 * Facebook'ga kirish, sahifa/forma tanlash va Meta ruxsatlari — Make tomonida.
 * DealMind Meta App ID/Secret/token so'ramaydi va Meta'ga so'rov yubormaydi.
 *
 * Bu endpoint Meta webhook'i EMAS: hub.challenge, Verify token va
 * X-Hub-Signature-256 yo'q — autentifikatsiya faqat tenant'ning API kaliti.
 */

export const MAKE_YOLI = '/api/v1/webhooks/crm/make';
export const MAKE_SARLAVHA = 'x-api-key';

// ─── API kaliti ──────────────────────────────────────────────────────────────

/** `dm_mk_` + 32 bayt (base64url, 43 belgi). Prefiks — kalit qayerdan ekanini tanish uchun. */
export const KALIT_SHAKLI = /^dm_mk_[A-Za-z0-9_-]{43}$/;

export function yangiKalit(): { kalit: string; xesh: string; niqob: string } {
  const kalit = `dm_mk_${randomBytes(32).toString('base64url')}`;
  return { kalit, xesh: kalitXeshi(kalit), niqob: `${kalit.slice(0, 10)}…${kalit.slice(-4)}` };
}

export function kalitXeshi(kalit: string): string {
  return createHash('sha256').update(kalit).digest('hex');
}

/** Doimiy vaqtli taqqoslash; shakli noto'g'ri kalit xeshlanmaydi ham. */
export function kalitMosmi(saqlanganXesh: string, kelgan: unknown): boolean {
  if (typeof kelgan !== 'string' || !KALIT_SHAKLI.test(kelgan.trim())) return false;
  const a = Buffer.from(kalitXeshi(kelgan.trim()), 'hex');
  const b = Buffer.from(saqlanganXesh, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

// ─── Payload kontrakti ───────────────────────────────────────────────────────

/** Make bo'sh maydonni `""` yoki `null` qilib yuboradi — ikkalasi ham "yo'q". */
const boshEmas = (v: unknown) => (v === '' || v === null ? undefined : typeof v === 'string' && v.trim() === '' ? undefined : v);

/**
 * Meta identifikatori — har doim STRING sifatida saqlanadi. Raqam kelsa faqat
 * xavfsiz butun son bo'lsa qabul qilinadi: Meta ID lari 2^53 dan katta bo'lishi
 * mumkin va JSON raqami ularni jimgina buzadi.
 */
const metaId = z.preprocess(
  boshEmas,
  z.union([
    z.string().trim().regex(/^[A-Za-z0-9_.:-]{1,64}$/, "ID faqat harf, raqam va _ . : - belgilaridan, 64 belgigacha"),
    z
      .number()
      .refine((n) => Number.isSafeInteger(n) && n >= 0, "Katta raqamli ID aniqligini yo'qotadi — Make'da ID ni matn (text) sifatida yuboring")
      .transform((n) => String(n)),
  ]),
);

const matn = (max: number) => z.preprocess(boshEmas, z.string().trim().max(max, `${max} belgidan oshmasin`).optional());
const ixtiyoriyId = metaId.optional();

const qiymat = z.union([z.string().max(2000), z.number(), z.boolean()]);
/** `custom_fields`: obyekt (`{ "savol": "javob" }`) yoki Meta `field_data` shakli (`[{ name, values }]`). */
const customFields = z.preprocess(
  boshEmas,
  z
    .union([
      z.record(z.string().max(200), z.union([qiymat, z.array(qiymat).max(50), z.null()])),
      z
        .array(
          z.object({
            name: z.string().trim().min(1).max(200),
            values: z.array(qiymat).max(50).optional(),
            value: z.union([qiymat, z.null()]).optional(),
          }),
        )
        .max(100),
    ])
    .optional(),
);

const vaqt = z.preprocess(boshEmas, z.union([z.string().max(64), z.number()]).optional());

export const makePayloadSxemasi = z.object({
  external_lead_id: metaId,
  full_name: matn(200),
  phone_number: matn(60),
  email: matn(200),
  page_id: ixtiyoriyId,
  page_name: matn(300),
  form_id: ixtiyoriyId,
  form_name: matn(300),
  ad_id: ixtiyoriyId,
  ad_name: matn(300),
  adset_id: ixtiyoriyId,
  adset_name: matn(300),
  campaign_id: ixtiyoriyId,
  campaign_name: matn(300),
  /** Ixtiyoriy: `fb` | `ig` | `facebook` | `instagram`. Kelmasa — noma'lum (taxmin qilinmaydi). */
  platform: matn(30),
  is_organic: z.preprocess(boshEmas, z.boolean().optional()),
  created_time: vaqt,
  custom_fields: customFields,
  /** `true` — ulanishni tekshirish: CRM'ga lid yozilmaydi, faqat "Test request qabul qilindi". */
  test: z.preprocess(boshEmas, z.boolean().optional()),
});

export type MakePayload = z.infer<typeof makePayloadSxemasi>;

/** Maydon nomlari bilan xatolar — QIYMATLAR qaytarilmaydi (shaxsiy ma'lumot loglarga/javobga tushmasin). */
export function payloadniTekshir(tana: unknown): { ok: true; p: MakePayload } | { ok: false; xatolar: { field: string; message: string }[] } {
  if (!tana || typeof tana !== 'object' || Array.isArray(tana)) return { ok: false, xatolar: [{ field: '(body)', message: 'JSON obyekt kutilgan' }] };
  const r = makePayloadSxemasi.safeParse(tana);
  if (r.success) return { ok: true, p: r.data };
  return {
    ok: false,
    xatolar: r.error.issues.slice(0, 20).map((i) => ({
      field: i.path.join('.') || '(body)',
      message: i.path[0] === 'external_lead_id' && i.code === 'invalid_union' ? 'external_lead_id majburiy (Meta lead ID, matn)' : i.message,
    })),
  };
}

function platformaniAniqla(v: string | undefined): 'facebook' | 'instagram' | null {
  const s = (v ?? '').toLowerCase();
  if (s === 'ig' || s === 'instagram') return 'instagram';
  if (s === 'fb' || s === 'facebook') return 'facebook';
  return null;
}

function vaqtniOl(v: string | number | undefined): string | null {
  if (v === undefined) return null;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const qiymatMatni = (v: unknown) => (Array.isArray(v) ? v.map((x) => String(x)).join(', ') : v === null || v === undefined ? '' : String(v)).trim().slice(0, 2000);

/** Make payload → umumiy lid yaratish servisi kirishi. Sof funksiya (testda bazasiz). */
export function makeLidi(businessId: string, p: MakePayload, pipelineId: string | null): MurojaatKirish {
  const javoblar: Record<string, string> = {};
  const cf = p.custom_fields;
  if (Array.isArray(cf)) {
    for (const f of cf) {
      const v = qiymatMatni(f.values ?? f.value);
      if (v) javoblar[f.name] = v;
    }
  } else if (cf) {
    for (const [k, v] of Object.entries(cf)) {
      const s = qiymatMatni(v);
      if (k.trim() && s) javoblar[k.trim()] = s;
    }
  }
  const qatorlar = Object.entries(javoblar).map(([k, v]) => `${savolNomi(k)}: ${v}`);
  if (p.form_name) qatorlar.push(`Forma: ${p.form_name}`);
  const reklama = [p.campaign_name, p.adset_name, p.ad_name].filter(Boolean).join(' / ');
  if (reklama) qatorlar.push(`Reklama: ${reklama}`);
  if (p.is_organic === true) qatorlar.push('Organik (reklamasiz)');
  const platforma = platformaniAniqla(p.platform);
  const email = p.email && EMAIL.test(p.email) ? p.email : null;

  return {
    businessId,
    leadgenId: p.external_lead_id,
    name: p.full_name ?? null,
    // Normallashtirilgan telefon CRM'ga, asl qiymat payload'da saqlanadi
    phone: telefonniTozala(p.phone_number),
    email,
    message: qatorlar.join('\n').slice(0, 5000) || null,
    pipelineId,
    payload: {
      // Joylashuv kelmasa — null (Instagram deb taxmin qilinmaydi)
      channel: platforma,
      type: 'lead_ad',
      provider: 'make',
      leadgenId: p.external_lead_id,
      pageId: p.page_id ?? null,
      pageName: p.page_name ?? null,
      formId: p.form_id ?? null,
      leadForm: p.form_name ?? null,
      adId: p.ad_id ?? null,
      adName: p.ad_name ?? null,
      adsetId: p.adset_id ?? null,
      adsetName: p.adset_name ?? null,
      campaignId: p.campaign_id ?? null,
      campaignName: p.campaign_name ?? null,
      platform: platforma,
      organic: p.is_organic ?? null,
      createdTime: vaqtniOl(p.created_time),
      phoneRaw: p.phone_number ?? null,
      ...(p.email && !email ? { emailRaw: p.email } : {}),
      values: javoblar,
    },
  };
}

// ─── Qabul qilish ────────────────────────────────────────────────────────────

export type QabulNatija =
  | { kod: 201; javob: { status: 'created'; lead_id: string } }
  | { kod: 200; javob: { status: 'duplicate'; lead_id: string | null } | { status: 'test_ok' } }
  | { kod: 401; javob: { error: 'unauthorized'; message: string } }
  | { kod: 422; javob: { error: 'invalid_payload'; details: { field: string; message: string }[] } };

const RUXSATSIZ: QabulNatija = { kod: 401, javob: { error: 'unauthorized', message: 'X-API-Key yaroqsiz yoki integratsiya o‘chirilgan' } };

export interface IntakeQatori {
  id: string;
  businessId: string;
  keyHash: string;
  pipelineId: string | null;
}

async function integratsiyaniTop(id: string): Promise<IntakeQatori | null> {
  const [r] = await withoutTenantIsolation('Make qabul: integratsiya id bo‘yicha — tenant konteksti kalit tekshirilgach aniqlanadi', (tx) =>
    tx
      .select({ id: makeLeadIntake.id, businessId: makeLeadIntake.businessId, keyHash: makeLeadIntake.keyHash, pipelineId: makeLeadIntake.pipelineId })
      .from(makeLeadIntake)
      .where(eq(makeLeadIntake.id, id))
      .limit(1),
  );
  return r ?? null;
}

/** Diagnostika — maxfiy ma'lumotsiz. Asosiy natijaga xalaqit bermaydi. */
async function qayd(businessId: string, id: string, o: Partial<{ test: boolean; lid: 'created' | 'duplicate'; xato: string | null }>): Promise<void> {
  const hozir = new Date();
  await withTenant(businessId, (tx) =>
    tx
      .update(makeLeadIntake)
      .set({
        lastRequestAt: hozir,
        ...(o.test ? { lastTestAt: hozir } : {}),
        ...(o.lid === 'created'
          ? { lastLeadAt: hozir, firstLeadAt: sql`coalesce(${makeLeadIntake.firstLeadAt}, ${hozir})`, leadCount: sql`${makeLeadIntake.leadCount} + 1` }
          : {}),
        ...(o.lid === 'duplicate' ? { duplicateCount: sql`${makeLeadIntake.duplicateCount} + 1` } : {}),
        ...(o.xato !== undefined ? { lastError: o.xato?.slice(0, 500) ?? null, lastErrorAt: o.xato ? hozir : makeLeadIntake.lastErrorAt } : {}),
        updatedAt: hozir,
      })
      .where(eq(makeLeadIntake.id, id)),
  ).catch(() => undefined);
}

/**
 * Bitta so'rov. Lid bazaga yozilib (tranzaksiya yakunlangach) javob qaytadi —
 * "qabul qilindi" deyilgan lid yo'qolmaydi. Baza xatosi — otiladi (500, Make
 * qayta urinadi; idempotentlik tufayli dubl bo'lmaydi).
 */
/** Baza bilan ishlovchi qismlar — testda xotiradagi soxta ombor bilan almashtiriladi. */
export interface QabulPortlari {
  top(id: string): Promise<IntakeQatori | null>;
  yoz(k: MurojaatKirish): Promise<{ inboxId: string | null; takror: boolean }>;
  qayd(businessId: string, id: string, o: Partial<{ test: boolean; lid: 'created' | 'duplicate'; xato: string | null }>): Promise<void>;
}

const BAZA: QabulPortlari = { top: integratsiyaniTop, yoz: metaLidiniYoz, qayd };

export async function makeQabul(id: string, kalit: unknown, tana: unknown, port: QabulPortlari = BAZA): Promise<QabulNatija> {
  const { top, yoz } = port;
  const qayd = port.qayd;
  // Shakli noto'g'ri kalit — bazaga so'rov ham yo'q
  if (typeof kalit !== 'string' || !KALIT_SHAKLI.test(kalit.trim())) return RUXSATSIZ;
  const r = await top(id);
  if (!r) return RUXSATSIZ;
  if (!kalitMosmi(r.keyHash, kalit)) {
    await qayd(r.businessId, r.id, { xato: "Noto'g'ri API kalit bilan so'rov keldi (401) — Make'dagi keychain'ni yangi kalit bilan yangilang" });
    return RUXSATSIZ;
  }
  const t = payloadniTekshir(tana);
  if (!t.ok) {
    await qayd(r.businessId, r.id, { xato: `Noto'g'ri payload (422): ${t.xatolar.map((x) => `${x.field} — ${x.message}`).join('; ')}` });
    return { kod: 422, javob: { error: 'invalid_payload', details: t.xatolar } };
  }
  if (t.p.test) {
    await qayd(r.businessId, r.id, { test: true, xato: null });
    return { kod: 200, javob: { status: 'test_ok' } };
  }
  const yozildi = await yoz(makeLidi(r.businessId, t.p, r.pipelineId));
  await qayd(r.businessId, r.id, { lid: yozildi.takror ? 'duplicate' : 'created', xato: null });
  if (yozildi.takror || !yozildi.inboxId) return { kod: 200, javob: { status: 'duplicate', lead_id: yozildi.inboxId } };
  return { kod: 201, javob: { status: 'created', lead_id: yozildi.inboxId } };
}

// ─── Boshqaruv (CRM administratori) ──────────────────────────────────────────

export function qabulManzili(id: string): string {
  return `${tashqiManzil()}${MAKE_YOLI}/${id}/leads`;
}

export async function makeHolati(businessId: string) {
  const [r] = await withTenant(businessId, (tx) => tx.select().from(makeLeadIntake).limit(1));
  if (!r) return { exists: false as const };
  return {
    exists: true as const,
    url: qabulManzili(r.id),
    header: 'X-API-Key',
    keyHint: r.keyHint,
    pipelineId: r.pipelineId,
    createdAt: r.createdAt,
    keyRotatedAt: r.keyRotatedAt,
    lastRequestAt: r.lastRequestAt,
    lastTestAt: r.lastTestAt,
    firstLeadAt: r.firstLeadAt,
    lastLeadAt: r.lastLeadAt,
    leadCount: r.leadCount,
    duplicateCount: r.duplicateCount,
    lastError: r.lastError,
    lastErrorAt: r.lastErrorAt,
  };
}

/** URL va kalit yaratiladi. Kalit faqat shu javobda bir marta qaytadi. */
export async function makeYarat(businessId: string, userId: string, ip?: string): Promise<{ key: string }> {
  const k = yangiKalit();
  await withTenant(businessId, async (tx) => {
    const [bor] = await tx.select({ id: makeLeadIntake.id }).from(makeLeadIntake).limit(1);
    if (bor) throw new CrmXatosi('ziddiyat', 'Qabul qilish URL’i allaqachon yaratilgan — kerak bo‘lsa kalitni almashtiring');
    const [r] = await tx.insert(makeLeadIntake).values({ businessId, keyHash: k.xesh, keyHint: k.niqob, createdBy: userId }).returning({ id: makeLeadIntake.id });
    await tx.insert(auditLog).values({ businessId, actorId: userId, action: 'make_leads.create', entity: 'make_lead_intake', entityId: r!.id, ip: ip ?? null });
  });
  return { key: k.kalit };
}

/** Yangi kalit — eskisi DARHOL ishlamay qoladi. */
export async function kalitniAlmashtir(businessId: string, userId: string, ip?: string): Promise<{ key: string }> {
  const k = yangiKalit();
  await withTenant(businessId, async (tx) => {
    const r = await tx
      .update(makeLeadIntake)
      .set({ keyHash: k.xesh, keyHint: k.niqob, keyRotatedAt: new Date(), lastError: null, lastErrorAt: null, updatedAt: new Date() })
      .returning({ id: makeLeadIntake.id });
    if (!r.length) throw new CrmXatosi('topilmadi', 'Make integratsiyasi topilmadi');
    await tx.insert(auditLog).values({ businessId, actorId: userId, action: 'make_leads.rotate_key', entity: 'make_lead_intake', entityId: r[0]!.id, ip: ip ?? null });
  });
  return { key: k.kalit };
}

export async function makeniSozla(businessId: string, pipelineId: string | null): Promise<void> {
  const v = await voronkaniTekshir(businessId, pipelineId);
  const r = await withTenant(businessId, (tx) => tx.update(makeLeadIntake).set({ pipelineId: v, updatedAt: new Date() }).returning({ id: makeLeadIntake.id }));
  if (!r.length) throw new CrmXatosi('topilmadi', 'Make integratsiyasi topilmadi');
}

/** O'chirish — URL va kalit ishlamay qoladi; kelgan lidlar CRM'da qoladi. */
export async function makeniOchir(businessId: string, userId: string, ip?: string): Promise<void> {
  await withTenant(businessId, async (tx) => {
    const r = await tx.delete(makeLeadIntake).returning({ id: makeLeadIntake.id });
    if (r.length) await tx.insert(auditLog).values({ businessId, actorId: userId, action: 'make_leads.delete', entity: 'make_lead_intake', entityId: r[0]!.id, ip: ip ?? null });
  });
}
