import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META LEAD ADS — sof funksiyalar (baza va tarmoqsiz)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Xavfsizlik qarorlari shu yerda jamlangan va `verify-meta-lead-ads.ts`
 * ularni bazasiz tekshiradi: imzo, `state`, sahifa ruxsati, forma filtri,
 * webhook tahlili, Graph xatosini turlash, qayta urinish kutishi.
 */

// ─── Webhook imzosi ──────────────────────────────────────────────────────────

/**
 * `X-Hub-Signature-256: sha256=<hex>` — HMAC-SHA256(App Secret, XOM tana).
 * Tana JSON'ga aylantirilib qayta yozilsa baytlar o'zgaradi va imzo mos
 * kelmaydi — shuning uchun faqat xom Buffer qabul qilinadi.
 */
export function imzoTogrimi(xom: Buffer, sarlavha: unknown, appSecret: string): boolean {
  if (typeof sarlavha !== 'string') return false;
  const kelgan = sarlavha.trim().toLowerCase();
  if (!/^sha256=[0-9a-f]{64}$/.test(kelgan)) return false;
  const kutilgan = `sha256=${createHmac('sha256', appSecret).update(xom).digest('hex')}`;
  return timingSafeEqual(Buffer.from(kutilgan), Buffer.from(kelgan));
}

/**
 * Meta `signed_request` (deauthorize va data deletion callback'lari):
 * `<base64url imzo>.<base64url JSON>`, imzo = HMAC-SHA256(App Secret, JSON qismi).
 */
export function signedRequestniOch(signed: unknown, appSecret: string): { userId: string; issuedAt: number | null } | null {
  if (typeof signed !== 'string' || signed.length > 4000) return null;
  const [imzo, tana] = signed.split('.');
  if (!imzo || !tana) return null;
  const kutilgan = createHmac('sha256', appSecret).update(tana).digest();
  let kelgan: Buffer;
  try {
    kelgan = Buffer.from(imzo, 'base64url');
  } catch {
    return null;
  }
  if (kelgan.length !== kutilgan.length || !timingSafeEqual(kelgan, kutilgan)) return null;
  try {
    const d = JSON.parse(Buffer.from(tana, 'base64url').toString('utf8')) as { algorithm?: unknown; user_id?: unknown; issued_at?: unknown };
    if (typeof d.algorithm !== 'string' || d.algorithm.toUpperCase() !== 'HMAC-SHA256') return null;
    const userId = typeof d.user_id === 'string' || typeof d.user_id === 'number' ? String(d.user_id) : null;
    if (!userId || !/^\d{1,30}$/.test(userId)) return null;
    return { userId, issuedAt: typeof d.issued_at === 'number' ? d.issued_at : null };
  } catch {
    return null;
  }
}

// ─── OAuth state ─────────────────────────────────────────────────────────────

/** State muddati — Meta oynasida ruxsat berish uchun yetarli, lekin uzoq emas. */
export const STATE_MUDDATI_MS = 15 * 60 * 1000;
/** Ruxsatdan keyin sahifa va formalarni tanlash uchun vaqt. */
export const TANLASH_MUDDATI_MS = 30 * 60 * 1000;

/** 32 bayt tasodifiy `state`; bazaga faqat xeshi yoziladi. */
export function yangiState(): { state: string; hash: string } {
  const state = randomBytes(32).toString('base64url');
  return { state, hash: stateXeshi(state) };
}

export function stateXeshi(state: string): string {
  return createHash('sha256').update(state).digest('hex');
}

/** Callback kelganda URL'dagi `state` shakli — boshqa narsa bazaga so'rov ham qilinmaydi. */
export const STATE_SHAKLI = /^[A-Za-z0-9_-]{43}$/;

export type StateNatija = 'ok' | 'topilmadi' | 'ishlatilgan' | 'eskirgan';

/**
 * Bazadan topilgan sessiya bo'yicha state'ni baholaydi. Atomik "bir martalik"
 * kafolat bazada (`UPDATE … WHERE used_at IS NULL`); bu funksiya qaysi xato
 * ekanini aniqlab, foydalanuvchiga tushunarli xabar berish uchun.
 */
export function stateniBahola(s: { usedAt: Date | null; expiresAt: Date; status: string } | null | undefined, hozir: Date): StateNatija {
  if (!s) return 'topilmadi';
  if (s.usedAt || s.status !== 'pending') return 'ishlatilgan';
  if (s.expiresAt.getTime() <= hozir.getTime()) return 'eskirgan';
  return 'ok';
}

// ─── Sahifa tanlash ruxsati ──────────────────────────────────────────────────

export interface SessiyaSahifasi {
  id: string;
  name: string | null;
  tasks: string[];
}

export type SahifaRuxsati =
  | { ok: true; sahifa: SessiyaSahifasi }
  | { ok: false; sabab: 'sessiya' | 'muddat' | 'sahifa' | 'vazifa' };

/**
 * Foydalanuvchi tanlagan sahifa AYNAN shu OAuth sessiyasida ruxsat berilgani,
 * sessiya shu biznes va shu foydalanuvchiniki ekani va muddati o'tmagani.
 * Begona biznesning sessiyasi "topilmadi" deb qaytadi (mavjudligi oshkor bo'lmasin).
 *
 * Vazifa: lidlarni o'qish uchun sahifada reklama (ADVERTISE) yoki to'liq
 * boshqaruv (MANAGE) huquqi kerak.
 */
export function sahifaRuxsati(
  s: { businessId: string; userId: string; status: string; selectionExpiresAt: Date | null; pages: unknown } | null | undefined,
  k: { businessId: string; userId: string; pageId: string; hozir: Date },
): SahifaRuxsati {
  if (!s || s.businessId !== k.businessId || s.userId !== k.userId) return { ok: false, sabab: 'sessiya' };
  if (s.status !== 'authorized') return { ok: false, sabab: 'sessiya' };
  if (!s.selectionExpiresAt || s.selectionExpiresAt.getTime() <= k.hozir.getTime()) return { ok: false, sabab: 'muddat' };
  const sahifa = sessiyaSahifalari(s.pages).find((p) => p.id === k.pageId);
  if (!sahifa) return { ok: false, sabab: 'sahifa' };
  if (!sahifa.tasks.some((t) => t === 'ADVERTISE' || t === 'MANAGE')) return { ok: false, sabab: 'vazifa' };
  return { ok: true, sahifa };
}

export function sessiyaSahifalari(v: unknown): SessiyaSahifasi[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => x as { id?: unknown; name?: unknown; tasks?: unknown })
    .filter((x) => typeof x.id === 'string' && ID.test(x.id))
    .map((x) => ({
      id: x.id as string,
      name: typeof x.name === 'string' ? x.name : null,
      tasks: Array.isArray(x.tasks) ? x.tasks.filter((t): t is string => typeof t === 'string') : [],
    }));
}

// ─── Formalar ────────────────────────────────────────────────────────────────

export interface TanlanganForma {
  id: string;
  name: string | null;
}

export function formalar(v: unknown): TanlanganForma[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => x as { id?: unknown; name?: unknown })
    .filter((x) => typeof x.id === 'string' && ID.test(x.id))
    .map((x) => ({ id: x.id as string, name: typeof x.name === 'string' ? x.name : null }));
}

/** Backend filtri: faqat tanlangan formadan kelgan lid CRM'ga kiradi. Forma noma'lum bo'lsa — kirmaydi. */
export function formaTanlanganmi(tanlangan: unknown, formId: string | null | undefined): boolean {
  if (!formId) return false;
  return formalar(tanlangan).some((f) => f.id === formId);
}

// ─── Webhook tanasi ──────────────────────────────────────────────────────────

/** Meta ID lari — raqamlar. Boshqa narsa bazaga ham, Graph so'roviga ham ketmaydi. */
export const ID = /^\d{1,30}$/;

export interface LeadgenHodisa {
  pageId: string;
  leadgenId: string;
  formId: string | null;
  adId: string | null;
  adgroupId: string | null;
  createdTime: Date | null;
}

const idOl = (v: unknown): string | null => {
  const s = typeof v === 'string' ? v : typeof v === 'number' && Number.isSafeInteger(v) ? String(v) : null;
  return s && ID.test(s) ? s : null;
};

/**
 * `{ object: 'page', entry: [{ id, changes: [{ field: 'leadgen', value }] }] }`.
 * Bitta so'rovda bir nechta entry va har birida bir nechta change bo'lishi
 * mumkin (Meta 1000 tagacha birlashtiradi) — hammasi qaytariladi. Tushunilmagan
 * qism tashlab ketiladi, butun to'plam rad etilmaydi.
 */
export function leadgenHodisalari(tana: unknown): LeadgenHodisa[] {
  const t = tana as { object?: unknown; entry?: unknown };
  if (!t || typeof t !== 'object' || t.object !== 'page' || !Array.isArray(t.entry)) return [];
  const natija: LeadgenHodisa[] = [];
  for (const e of t.entry.slice(0, 1000)) {
    const entry = e as { id?: unknown; changes?: unknown };
    if (!entry || !Array.isArray(entry.changes)) continue;
    for (const c of entry.changes) {
      const ch = c as { field?: unknown; value?: unknown };
      if (ch?.field !== 'leadgen' || !ch.value || typeof ch.value !== 'object') continue;
      const v = ch.value as Record<string, unknown>;
      const leadgenId = idOl(v.leadgen_id);
      const pageId = idOl(v.page_id) ?? idOl(entry.id);
      if (!leadgenId || !pageId) continue;
      const vaqt = typeof v.created_time === 'number' ? new Date(v.created_time * 1000) : null;
      natija.push({
        pageId,
        leadgenId,
        formId: idOl(v.form_id),
        adId: idOl(v.ad_id),
        adgroupId: idOl(v.adgroup_id),
        createdTime: vaqt && !Number.isNaN(vaqt.getTime()) ? vaqt : null,
      });
    }
  }
  return natija;
}

// ─── Graph xatolari ──────────────────────────────────────────────────────────

/**
 *  token_revoked — token bekor/muddati o'tgan (qayta ulash kerak);
 *  permission    — ruxsat yetishmaydi;
 *  leads_access  — lidni o'qishga huquq yo'q (Leads Access Manager);
 *  not_found     — obyekt yo'q (doimiy);
 *  rate_limit    — limit (vaqtinchalik);
 *  transient     — tarmoq / Meta 5xx (vaqtinchalik);
 *  unknown       — noma'lum (cheklangan qayta urinish).
 */
export type XatoTuri = 'token_revoked' | 'permission' | 'leads_access' | 'not_found' | 'rate_limit' | 'transient' | 'unknown';

const LIMIT_KODLARI = new Set([4, 17, 32, 341, 613]);

export function xatoniTurla(x: { httpStatus: number | null; code: number | null; subcode?: number | null; tarmoq?: boolean }, kontekst: 'lid' | 'boshqa' = 'boshqa'): XatoTuri {
  if (x.tarmoq) return 'transient';
  const kod = x.code ?? 0;
  if (kod === 190 || kod === 102 || kod === 463 || kod === 467) return 'token_revoked';
  if (LIMIT_KODLARI.has(kod) || (kod >= 80000 && kod <= 80099)) return 'rate_limit';
  if (kod === 10 || (kod >= 200 && kod <= 299)) return kontekst === 'lid' ? 'leads_access' : 'permission';
  if (kod === 100 && x.subcode === 33) return kontekst === 'lid' ? 'leads_access' : 'not_found';
  if (kod === 803) return 'not_found';
  if (kod === 1 || kod === 2) return 'transient';
  if (x.httpStatus !== null && x.httpStatus >= 500) return 'transient';
  if (x.httpStatus === 429) return 'rate_limit';
  return 'unknown';
}

/** Qayta urinishga arziydimi (navbatga qaytadi). */
export const vaqtinchalikmi = (t: XatoTuri) => t === 'transient' || t === 'rate_limit' || t === 'unknown';
/** Qayta ulash yoki ruxsat berilgach davom etadi. */
export const ruxsatKutadimi = (t: XatoTuri) => t === 'token_revoked' || t === 'permission' || t === 'leads_access';

/**
 * Kutish: 30s → 90s → 4.5daq → 13.5daq → 40daq (6 soatdan oshmaydi).
 * Limitda kamida 5 daqiqa — darhol qayta urinish limitni uzaytiradi.
 */
export function kutishSoniya(urinish: number, tur: XatoTuri): number {
  const asos = Math.min(30 * Math.pow(3, Math.max(0, urinish - 1)), 6 * 3600);
  return tur === 'rate_limit' ? Math.max(asos, 300) : asos;
}

/** Foydalanuvchiga ko'rsatiladigan tushunarli xabar (Meta matni emas — u texnik va inglizcha). */
export const XATO_MATNI: Record<XatoTuri | 'subscription' | 'config', string> = {
  token_revoked: "Facebook ruxsati bekor qilingan yoki muddati o'tgan — «Qayta ulash» ni bosing.",
  permission: "Ruxsat yetishmaydi — «Qayta ulash» da barcha so'ralgan ruxsatlarni bering.",
  leads_access:
    "Lidlarni o'qishga huquq yo'q. Meta Business Suite → Sozlamalar → Leads Access (Lidlarga kirish) bo'limida shu ilovaga va ulagan foydalanuvchiga ruxsat bering.",
  not_found: "Sahifa yoki forma topilmadi — o'chirilgan yoki ruxsat olib tashlangan bo'lishi mumkin.",
  rate_limit: "Meta so'rovlar limiti — lidlar birozdan keyin avtomatik olinadi.",
  transient: "Meta serveri vaqtincha javob bermadi — avtomatik qayta urinish rejalashtirildi.",
  unknown: "Meta noma'lum xato qaytardi — avtomatik qayta urinish rejalashtirildi.",
  subscription: "Sahifa webhook'ga obuna bo'lmadi — lidlar kelmaydi. «Holatni tekshirish» yoki «Qayta ulash» ni bosing.",
  config: 'Integratsiya hali sozlanmagan.',
};

// ─── Lid ma'lumoti → CRM maydonlari ──────────────────────────────────────────

export interface MetaLid {
  id: string;
  created_time?: string;
  field_data?: { name?: string; values?: unknown[] }[];
  form_id?: string;
  ad_id?: string;
  adset_id?: string;
  campaign_id?: string;
  platform?: string;
  is_organic?: boolean;
}

export interface CrmLidi {
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  /** Reklama joylashuvi — Meta aniq aytmasa `null` (taxmin qilinmaydi). */
  platform: 'facebook' | 'instagram' | null;
  javoblar: Record<string, string>;
}

const MAXSUS: Record<string, 'name' | 'first' | 'last' | 'phone' | 'email'> = {
  full_name: 'name',
  first_name: 'first',
  last_name: 'last',
  phone_number: 'phone',
  email: 'email',
};

/** `qaysi_kurs_sizni_qiziqtiradi?` → `Qaysi kurs sizni qiziqtiradi?` */
export function savolNomi(s: string): string {
  const t = s.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** `998901234567` → `+998901234567`; boshqa shakl — o'zicha (40 belgigacha). */
export function telefonniTozala(t: string | null | undefined): string | null {
  const s = (t ?? '').trim();
  if (!s) return null;
  const raqam = s.replace(/[\s()-]/g, '');
  if (/^\+?\d{7,15}$/.test(raqam)) return raqam.startsWith('+') ? raqam : `+${raqam}`;
  return s.slice(0, 40);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Meta `field_data` → CRM. Standart savollar (ism, telefon, email) maxsus
 * maydonlarga, qolgan (custom) savollar murojaat matniga "Savol: javob"
 * bo'lib tushadi. Ism yoki telefon bo'lmasa ham xato yo'q — null.
 */
export function lidniMoslash(lid: MetaLid, q: { formaNomi?: string | null; reklamaNomi?: string | null }): CrmLidi {
  const maxsus: Partial<Record<'name' | 'first' | 'last' | 'phone' | 'email', string>> = {};
  const javoblar: Record<string, string> = {};
  const qatorlar: string[] = [];
  for (const f of Array.isArray(lid.field_data) ? lid.field_data : []) {
    const nom = typeof f?.name === 'string' ? f.name.trim().slice(0, 200) : '';
    const v = (Array.isArray(f?.values) ? f.values : [])
      .map((x) => (typeof x === 'string' || typeof x === 'number' || typeof x === 'boolean' ? String(x).trim() : ''))
      .filter(Boolean)
      .join(', ')
      .slice(0, 1000);
    if (!nom || !v) continue;
    javoblar[nom] = v;
    const m = MAXSUS[nom.toLowerCase()];
    if (m && !maxsus[m]) maxsus[m] = v;
    else qatorlar.push(`${savolNomi(nom)}: ${v}`);
  }
  if (q.formaNomi) qatorlar.push(`Forma: ${q.formaNomi}`);
  if (q.reklamaNomi) qatorlar.push(`Reklama: ${q.reklamaNomi}`);
  if (lid.is_organic === true) qatorlar.push('Organik (reklamasiz)');
  const ism = maxsus.name ?? ([maxsus.first, maxsus.last].filter(Boolean).join(' ') || null);
  const email = maxsus.email && EMAIL.test(maxsus.email) ? maxsus.email.slice(0, 200) : null;
  return {
    name: ism ? ism.slice(0, 200) : null,
    phone: telefonniTozala(maxsus.phone),
    email,
    message: qatorlar.join('\n').slice(0, 5000) || null,
    platform: lid.platform === 'ig' ? 'instagram' : lid.platform === 'fb' ? 'facebook' : null,
    javoblar,
  };
}
