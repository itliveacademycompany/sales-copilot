import { createHmac, randomBytes } from 'node:crypto';
import { and, count, desc, eq, inArray, max, sql } from 'drizzle-orm';
import { z } from 'zod';
import { config } from '../config.js';
import { decryptSecret, encryptSecret, maskSecret, safeCompare } from '../crypto/secrets.js';
import { withoutTenantIsolation, withTenant, type Tx } from '../db/index.js';
import { crmInbox, crmPipeline, integration } from '../db/schema/index.js';
import { rootUrl } from '../http/tenant.js';
import { CrmXatosi } from './xato.js';
import { kontaktniTopYokiYarat } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — ijtimoiy tarmoqlardan lidlar (Facebook, Instagram, Telegram)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Har kanal — `integration` jadvalida alohida qator (`crm_facebook`,
 * `crm_instagram`, `crm_telegram`). Kalitlar AES-256-GCM bilan shifrlanadi
 * (`credentialsEncrypted`) va javobda HECH QACHON ochiq qaytmaydi — faqat niqob.
 *
 * Lid manbalari:
 *   • Lead Ads (Facebook/Instagram target reklama formasi) — Meta webhook
 *     faqat `leadgen_id` yuboradi; ism, telefon va javoblar Graph API'dan olinadi;
 *   • Messenger va Instagram Direct xabarlari;
 *   • Telegram bot xabarlari (kompaniya boti — Dill Mind bildirishnoma botidan alohida).
 *
 * Hammasi "Saralanmagan"ga (`crm_inbox`) manba belgisi bilan tushadi.
 *
 * Idempotentlik:
 *   • Lead Ads — tashqi ID `lead:<leadgen_id>` (Facebook va Instagram bo'yicha
 *     birga tekshiriladi), shuning uchun Meta qayta yuborsa ham dubl bo'lmaydi;
 *   • xabarlar — bir yozuvchidan bitta kutilayotgan murojaat: keyingi xabarlar
 *     unga qo'shiladi, xabar ID lari eslab qolinadi (qayta yuborilsa o'tkaziladi).
 *
 * Kalit kiritilmaguncha kanal "ulanmagan": webhook kelsa ham jimgina o'tkazib
 * yuboriladi va xato bermaydi.
 */

export const KANALLAR = ['facebook', 'instagram', 'telegram'] as const;
export type Kanal = (typeof KANALLAR)[number];
type Tur = 'crm_facebook' | 'crm_instagram' | 'crm_telegram';

const TUR: Record<Kanal, Tur> = { facebook: 'crm_facebook', instagram: 'crm_instagram', telegram: 'crm_telegram' };
const TURLAR: Tur[] = Object.values(TUR);
const META_TURLAR: Tur[] = ['crm_facebook', 'crm_instagram'];
const META_MANBALAR: Kanal[] = ['facebook', 'instagram'];
const kanalTuri = (t: string): Kanal => KANALLAR.find((k) => TUR[k] === t) ?? 'facebook';

/** Bitim manbasi va interfeysdagi nom. */
export const TARMOQ_NOMI: Record<Kanal, string> = { facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram' };

/** Telegram botining standart javoblari — sozlamada o'zgartiriladi, bo'sh qoldirilsa yuborilmaydi. */
export const STANDART_SALOM =
  "Assalomu alaykum! Savolingizni yozing — menejerimiz tez orada javob beradi. Telefon raqamingizni yuborsangiz, o'zimiz qo'ng'iroq qilamiz.";
export const STANDART_RAHMAT = "Rahmat! Tez orada siz bilan bog'lanamiz.";
const TELEFON_TUGMASI = '📱 Telefon raqamni yuborish';

/** Murojaat matnining eng katta uzunligi (xabarlar qo'shilib borganda — oxirgisi qoladi). */
const MATN_CHEGARASI = 5000;

// ─── Sozlama (ommaviy) va sirlar ─────────────────────────────────────────────

/** `integration.config.tarmoq` — sirlar bu yerda EMAS. Buzilgan qiymat jimgina standartga qaytadi. */
const tarmoqConfig = z.object({
  /** Murojaat qaysi voronkaning "Saralanmagan"iga tushadi (null — asosiy voronka). */
  pipelineId: z.string().uuid().nullable().default(null).catch(null),
  /** Facebook sahifa ID si (Lead Ads va Messenger). */
  pageId: z.string().nullable().default(null).catch(null),
  /** Instagram professional hisob ID si (Direct xabarlari). */
  igAccountId: z.string().nullable().default(null).catch(null),
  /** Sinovda aniqlangan nom: sahifa nomi, @instagram yoki @bot. */
  accountName: z.string().nullable().default(null).catch(null),
  /** Telegram: /start ga javob (null — standart, '' — yuborilmaydi). */
  greeting: z.string().nullable().default(null).catch(null),
  /** Telegram: telefon yuborilganda javob. */
  thanks: z.string().nullable().default(null).catch(null),
  /** Kiritilgan kalitlarning niqobi: `EAAGm0P…x9Zk`. */
  hints: z.record(z.string(), z.string()).default({}).catch({}),
  connectedAt: z.string().nullable().default(null).catch(null),
  lastTestAt: z.string().nullable().default(null).catch(null),
  /** Oxirgi sinovdagi muhim bo'lmagan muammolar (masalan, sahifaga obuna bo'lmadi). */
  warnings: z.array(z.string()).default([]).catch([]),
});
type TarmoqConfig = z.infer<typeof tarmoqConfig>;

function configniOl(c: unknown): TarmoqConfig {
  return tarmoqConfig.parse(((c ?? {}) as Record<string, unknown>).tarmoq ?? {});
}

function configniYoz(eski: unknown, t: TarmoqConfig): Record<string, unknown> {
  return { ...((eski ?? {}) as Record<string, unknown>), tarmoq: t };
}

/** Shifrlangan JSON: Meta — `appSecret` + `accessToken`, Telegram — `botToken`. */
interface Sirlar {
  appSecret?: string;
  accessToken?: string;
  botToken?: string;
}

function sirlarniOch(b: Buffer | null | undefined): Sirlar {
  if (!b) return {};
  try {
    const v = JSON.parse(decryptSecret(b)) as unknown;
    return v && typeof v === 'object' ? (v as Sirlar) : {};
  } catch {
    return {};
  }
}

/** Webhook siri / Meta verify token — Telegram `secret_token` talabiga ham mos (A-Z, a-z, 0-9, _ -). */
const yangiSir = () => randomBytes(24).toString('base64url');

function tashqiManzil(): string {
  return (config.PUBLIC_URL ?? rootUrl()).replace(/\/+$/, '');
}

export function webhookManzili(kanal: Kanal, integrationId: string): string {
  return `${tashqiManzil()}/api/v1/webhooks/crm/${kanal === 'telegram' ? 'telegram' : 'meta'}/${integrationId}`;
}

// ─── Holat ───────────────────────────────────────────────────────────────────

/**
 * Uchala kanal holati. Sirlar hech qachon qaytmaydi; webhook manzili,
 * verify token va sozlamalar faqat integratsiyani boshqaruvchiga (rahbarga).
 */
export async function tarmoqlarHolati(tx: Tx, boshqaruvchi: boolean) {
  const [qatorlar, sonlar] = await Promise.all([
    tx
      .select({
        id: integration.id,
        kind: integration.kind,
        status: integration.status,
        config: integration.config,
        creds: integration.credentialsEncrypted,
        webhookSecret: integration.webhookSecret,
        lastSyncAt: integration.lastSyncAt,
        lastError: integration.lastError,
      })
      .from(integration)
      .where(inArray(integration.kind, TURLAR)),
    tx
      .select({ source: crmInbox.source, n: count(), oxirgi: max(crmInbox.createdAt) })
      .from(crmInbox)
      .where(inArray(crmInbox.source, [...KANALLAR]))
      .groupBy(crmInbox.source),
  ]);
  return KANALLAR.map((kanal) => {
    const q = qatorlar.find((r) => r.kind === TUR[kanal]);
    const c = configniOl(q?.config);
    const s = sonlar.find((x) => x.source === kanal);
    const sozlangan = Boolean(q?.creds);
    return {
      kanal,
      /** Kalitlar bor va oxirgi sinov muvaffaqiyatli. */
      connected: sozlangan && q?.status === 'connected',
      configured: sozlangan,
      status: sozlangan ? q!.status : ('disconnected' as const),
      account: sozlangan ? c.accountName : null,
      leads: Number(s?.n ?? 0),
      lastLeadAt: s?.oxirgi ?? null,
      lastEventAt: q?.lastSyncAt ?? null,
      ...(boshqaruvchi
        ? {
            settings: {
              pipelineId: c.pipelineId,
              pageId: c.pageId,
              igAccountId: c.igAccountId,
              greeting: c.greeting ?? STANDART_SALOM,
              thanks: c.thanks ?? STANDART_RAHMAT,
            },
            hints: sozlangan ? c.hints : {},
            webhookUrl: q ? webhookManzili(kanal, q.id) : null,
            verifyToken: kanal !== 'telegram' ? (q?.webhookSecret ?? null) : null,
            lastError: sozlangan ? (q?.lastError ?? null) : null,
            lastTestAt: sozlangan ? c.lastTestAt : null,
            warnings: sozlangan ? c.warnings : [],
          }
        : {}),
    };
  });
}

/**
 * Kanal qatorini tayyorlaydi (kalitsiz): webhook manzili va verify token
 * kalitlar kiritilishidan OLDIN kerak — Meta ilovasida webhook sozlanayotganda
 * Meta manzilni darhol tekshiradi. Qayta chaqirilsa hech narsa o'zgarmaydi.
 */
export async function tarmoqniTayyorla(tx: Tx, businessId: string, kanal: Kanal): Promise<void> {
  await tx
    .insert(integration)
    .values({ businessId, kind: TUR[kanal], status: 'disconnected', syncEnabled: false, webhookSecret: yangiSir(), config: {} })
    .onConflictDoUpdate({
      target: [integration.businessId, integration.kind],
      set: { webhookSecret: sql`coalesce(${integration.webhookSecret}, ${yangiSir()})` },
    });
}

// ─── Saqlash ─────────────────────────────────────────────────────────────────

const idMaydoni = z.union([z.string().trim().regex(/^\d{5,30}$/, "ID faqat raqamlardan iborat bo'ladi"), z.literal('')]);

/** Bo'sh kalit maydoni — "eskisini qoldirish" (qayta kiritmasdan boshqa sozlamani o'zgartirish mumkin). */
export const tarmoqSaqlashSxemasi = z.object({
  appSecret: z.string().trim().max(256).optional(),
  accessToken: z.string().trim().max(4096).optional(),
  botToken: z.string().trim().max(256).optional(),
  pageId: idMaydoni.nullable().optional(),
  igAccountId: idMaydoni.nullable().optional(),
  pipelineId: z.string().uuid().nullable().optional(),
  greeting: z.string().trim().max(1000).nullable().optional(),
  thanks: z.string().trim().max(500).nullable().optional(),
});

const APP_SECRET = /^[A-Za-z0-9]{16,128}$/;
const ACCESS_TOKEN = /^[A-Za-z0-9_\-.|%]{20,4096}$/;
const BOT_TOKEN = /^\d{6,}:[A-Za-z0-9_-]{30,}$/;

export async function tarmoqniSaqla(tx: Tx, businessId: string, kanal: Kanal, k: z.infer<typeof tarmoqSaqlashSxemasi>): Promise<void> {
  const [q] = await tx
    .select({ id: integration.id, config: integration.config, creds: integration.credentialsEncrypted, webhookSecret: integration.webhookSecret })
    .from(integration)
    .where(eq(integration.kind, TUR[kanal]))
    .for('update')
    .limit(1);
  const eski = sirlarniOch(q?.creds);
  const yangi: Sirlar = { ...eski };

  if (kanal === 'telegram') {
    if (k.botToken) {
      if (!BOT_TOKEN.test(k.botToken)) throw new CrmXatosi('yaroqsiz', "Bot token formati noto'g'ri");
      await sotuvaiBotiEmasmi(tx, k.botToken);
      yangi.botToken = k.botToken;
    }
    if (!yangi.botToken) throw new CrmXatosi('yaroqsiz', 'Bot tokenini kiriting');
  } else {
    if (k.appSecret) {
      if (!APP_SECRET.test(k.appSecret)) throw new CrmXatosi('yaroqsiz', "App Secret noto'g'ri — Meta ilovasi sozlamalaridan nusxalang");
      yangi.appSecret = k.appSecret;
    }
    if (k.accessToken) {
      if (!ACCESS_TOKEN.test(k.accessToken)) throw new CrmXatosi('yaroqsiz', "Access token noto'g'ri — bo'sh joysiz to'liq nusxalang");
      yangi.accessToken = k.accessToken;
    }
    if (!yangi.appSecret) throw new CrmXatosi('yaroqsiz', 'App Secret ni kiriting');
    if (!yangi.accessToken) throw new CrmXatosi('yaroqsiz', 'Access token ni kiriting');
  }

  const c = configniOl(q?.config);
  const t: TarmoqConfig = { ...c };
  if (k.pageId !== undefined) t.pageId = k.pageId || null;
  if (k.igAccountId !== undefined) t.igAccountId = k.igAccountId || null;
  if (kanal === 'facebook' && !t.pageId) throw new CrmXatosi('yaroqsiz', 'Facebook sahifa ID sini kiriting');
  if (k.pipelineId !== undefined) {
    if (k.pipelineId) {
      const [v] = await tx.select({ id: crmPipeline.id }).from(crmPipeline).where(eq(crmPipeline.id, k.pipelineId)).limit(1);
      if (!v) throw new CrmXatosi('topilmadi', 'Voronka topilmadi');
    }
    t.pipelineId = k.pipelineId;
  }
  if (k.greeting !== undefined) t.greeting = k.greeting ?? '';
  if (k.thanks !== undefined) t.thanks = k.thanks ?? '';

  // Kalit almashtirildi — eski hisob nomi va ogohlantirishlar endi haqiqiy emas
  if (yangi.accessToken !== eski.accessToken || yangi.botToken !== eski.botToken) {
    t.accountName = null;
    t.warnings = [];
  }
  t.hints = Object.fromEntries(
    (Object.entries(yangi) as [keyof Sirlar, string | undefined][]).filter(([, v]) => Boolean(v)).map(([nom, v]) => [nom, maskSecret(v!)]),
  );
  t.connectedAt = t.connectedAt ?? new Date().toISOString();

  const shifr = encryptSecret(JSON.stringify(yangi));
  if (q) {
    await tx
      .update(integration)
      .set({ config: configniYoz(q.config, t), credentialsEncrypted: shifr, webhookSecret: q.webhookSecret ?? yangiSir(), updatedAt: new Date() })
      .where(eq(integration.id, q.id));
  } else {
    await tx.insert(integration).values({
      businessId,
      kind: TUR[kanal],
      status: 'disconnected',
      syncEnabled: false,
      config: configniYoz({}, t),
      credentialsEncrypted: shifr,
      webhookSecret: yangiSir(),
    });
  }
}

/**
 * Dill Mind bildirishnoma botini (Sozlamalar → Telegram) shu yerga ulab bo'lmaydi:
 * Telegram'da bitta botning bitta webhook manzili bor — ulansa, bildirishnomalar
 * va suhbat tahlili to'xtab qolardi. Bot ID si (token boshidagi raqam) solishtiriladi.
 */
async function sotuvaiBotiEmasmi(tx: Tx, token: string): Promise<void> {
  const [b] = await tx
    .select({ creds: integration.credentialsEncrypted })
    .from(integration)
    .where(and(eq(integration.kind, 'telegram_bot'), eq(integration.status, 'connected')))
    .limit(1);
  if (!b?.creds) return;
  let boshqa: string;
  try {
    boshqa = decryptSecret(b.creds);
  } catch {
    return;
  }
  if (boshqa.split(':')[0] === token.split(':')[0]) {
    throw new CrmXatosi('ziddiyat', "Bu bot Dill Mind bildirishnomalari uchun ulangan. Mijozlar uchun @BotFather'da alohida bot yarating.");
  }
}

// ─── Uzish ───────────────────────────────────────────────────────────────────

/**
 * Kalitlar o'chiriladi (qayta tiklab bo'lmaydi), sozlamalar (sahifa ID,
 * voronka, javob matnlari) va verify token qoladi — qayta ulash oson bo'lsin.
 * Telegram'da webhook ham o'chiriladi (tarmoq xatosi uzishga xalaqit bermaydi).
 */
export async function tarmoqniUz(businessId: string, kanal: Kanal): Promise<void> {
  const [q] = await withTenant(businessId, (tx) =>
    tx.select({ creds: integration.credentialsEncrypted }).from(integration).where(eq(integration.kind, TUR[kanal])).limit(1),
  );
  const s = sirlarniOch(q?.creds);
  if (kanal === 'telegram' && s.botToken) await tg(s.botToken, 'deleteWebhook', { drop_pending_updates: false });
  await withTenant(businessId, async (tx) => {
    const [r] = await tx.select({ id: integration.id, config: integration.config }).from(integration).where(eq(integration.kind, TUR[kanal])).for('update').limit(1);
    if (!r) return;
    const c = configniOl(r.config);
    await tx
      .update(integration)
      .set({
        status: 'disconnected',
        syncEnabled: false,
        credentialsEncrypted: null,
        lastError: null,
        config: configniYoz(r.config, { ...c, hints: {}, accountName: null, warnings: [], connectedAt: null, lastTestAt: null }),
        updatedAt: new Date(),
      })
      .where(eq(integration.id, r.id));
  });
}

// ─── Meta Graph API ──────────────────────────────────────────────────────────

type GraphNatija<T> = { ok: true; data: T } | { ok: false; xato: string; kod: number | null };

/** Faqat TEST uchun soxta serverga yo'naltirish; ishlab chiqarishda qo'yilmaydi. */
function graphBase(host: 'facebook' | 'instagram'): string {
  return process.env.META_GRAPH_BASE || `https://graph.${host}.com`;
}

/** Instagram Login tokeni (`IGAA…`) — graph.instagram.com; qolganlari — graph.facebook.com. */
const igHost = (token: string): 'facebook' | 'instagram' => (token.startsWith('IG') ? 'instagram' : 'facebook');

function graphXatosi(e: { message?: string; code?: number } | undefined): string {
  const m = (e?.message ?? '').slice(0, 220);
  const kod = e?.code ?? 0;
  if (kod === 190) return `Access token yaroqsiz yoki muddati o'tgan (${m})`;
  if (kod === 10 || (kod >= 200 && kod < 300)) return `Tokenda ruxsat yetarli emas (${m})`;
  if (kod === 100) return `ID yoki ruxsat noto'g'ri (${m})`;
  if ([4, 17, 32, 613].includes(kod)) return "Meta so'rovlar limiti — birozdan keyin qayta urinib ko'ring";
  return m || "Meta noma'lum xato qaytardi";
}

async function graph<T>(p: {
  yol: string;
  token: string;
  appSecret?: string | undefined;
  host?: 'facebook' | 'instagram';
  usul?: 'GET' | 'POST';
  params?: Record<string, string>;
  timeoutMs?: number;
}): Promise<GraphNatija<T>> {
  const host = p.host ?? 'facebook';
  const params = new URLSearchParams(p.params ?? {});
  params.set('access_token', p.token);
  // "Require App Secret" yoqilgan ilovalar uchun majburiy, qolganlarida — qo'shimcha himoya
  if (host === 'facebook' && p.appSecret) params.set('appsecret_proof', createHmac('sha256', p.appSecret).update(p.token).digest('hex'));
  const url = `${graphBase(host)}/${config.META_GRAPH_VERSION}${p.yol}`;
  const ctrl = new AbortController();
  const taymer = setTimeout(() => ctrl.abort(), p.timeoutMs ?? 8000);
  try {
    const res =
      p.usul === 'POST'
        ? await fetch(url, { method: 'POST', body: params, signal: ctrl.signal })
        : await fetch(`${url}?${params.toString()}`, { signal: ctrl.signal });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number } } & T;
    if (!res.ok || json.error) return { ok: false, xato: graphXatosi(json.error), kod: json.error?.code ?? res.status };
    return { ok: true, data: json };
  } catch {
    return { ok: false, xato: "Meta serveriga ulanib bo'lmadi", kod: null };
  } finally {
    clearTimeout(taymer);
  }
}

// ─── Telegram Bot API ────────────────────────────────────────────────────────

type TgNatija<T> = { ok: true; result: T } | { ok: false; xato: string };

/** `TELEGRAM_API_BASE` — faqat test uchun (mavjud `telegram/send.ts` bilan bir xil). */
async function tg<T = unknown>(token: string, usul: string, body?: Record<string, unknown>, timeoutMs = 8000): Promise<TgNatija<T>> {
  const ctrl = new AbortController();
  const taymer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'}/bot${token}/${usul}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {}),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; description?: string; error_code?: number };
    if (!json.ok) {
      if (json.error_code === 401 || json.error_code === 404) return { ok: false, xato: "Bot token noto'g'ri yoki bekor qilingan" };
      return { ok: false, xato: (json.description ?? `Telegram xatosi (${res.status})`).slice(0, 220) };
    }
    return { ok: true, result: json.result as T };
  } catch {
    return { ok: false, xato: "Telegram serveriga ulanib bo'lmadi" };
  } finally {
    clearTimeout(taymer);
  }
}

// ─── Sinash ──────────────────────────────────────────────────────────────────

export interface SinovQadami {
  /** token | sahifa | hisob | obuna | webhook | lidlar */
  kalit: string;
  ok: boolean;
  /** Muvaffaqiyatda — topilgan nom, xatoda — sabab. */
  xabar: string | null;
  /** true — kanal ishlashi uchun shart; false — ogohlantirish. */
  muhim: boolean;
}

/**
 * Kalitlarni haqiqiy API orqali tekshiradi va kanal holatini yangilaydi.
 * Tarmoq so'rovlari tranzaksiyadan TASHQARIDA — sekin javob bazani band qilmasin.
 */
export async function tarmoqniSina(businessId: string, kanal: Kanal): Promise<{ ok: boolean; qadamlar: SinovQadami[] }> {
  const [q] = await withTenant(businessId, (tx) =>
    tx
      .select({ id: integration.id, config: integration.config, creds: integration.credentialsEncrypted, webhookSecret: integration.webhookSecret })
      .from(integration)
      .where(eq(integration.kind, TUR[kanal]))
      .limit(1),
  );
  const s = sirlarniOch(q?.creds);
  if (!q || (kanal === 'telegram' ? !s.botToken : !s.accessToken || !s.appSecret)) throw new CrmXatosi('yaroqsiz', 'Avval kalitlarni kiriting');
  const c = configniOl(q.config);
  const qadamlar: SinovQadami[] = [];
  const yangilash: Partial<TarmoqConfig> = {};

  if (kanal === 'telegram') {
    const men = await tg<{ username?: string; first_name?: string }>(s.botToken!, 'getMe');
    qadamlar.push({ kalit: 'token', ok: men.ok, xabar: men.ok ? `@${men.result.username ?? men.result.first_name ?? 'bot'}` : men.xato, muhim: true });
    if (men.ok) {
      yangilash.accountName = men.result.username ? `@${men.result.username}` : (men.result.first_name ?? null);
      const url = webhookManzili('telegram', q.id);
      if (!url.startsWith('https://')) {
        qadamlar.push({ kalit: 'webhook', ok: false, xabar: "Sayt manzili HTTPS emas — Telegram webhook o'rnatilmadi", muhim: true });
      } else {
        const w = await tg(s.botToken!, 'setWebhook', { url, secret_token: q.webhookSecret, allowed_updates: ['message'], drop_pending_updates: false });
        qadamlar.push({ kalit: 'webhook', ok: w.ok, xabar: w.ok ? null : w.xato, muhim: true });
        if (w.ok) {
          const info = await tg<{ last_error_message?: string; last_error_date?: number }>(s.botToken!, 'getWebhookInfo');
          const yaqin = info.ok && info.result.last_error_date && Date.now() / 1000 - info.result.last_error_date < 3600;
          if (info.ok && yaqin && info.result.last_error_message) {
            qadamlar.push({ kalit: 'holat', ok: false, xabar: `Telegram oxirgi xato: ${info.result.last_error_message.slice(0, 200)}`, muhim: false });
          }
        }
      }
    }
  } else {
    const token = s.accessToken!;
    const host = kanal === 'instagram' ? igHost(token) : 'facebook';
    const g = <T>(yol: string, params?: Record<string, string>, usul?: 'GET' | 'POST') =>
      graph<T>({ yol, token, appSecret: s.appSecret, host, params, usul });

    const men = await g<{ id: string; name?: string; username?: string; user_id?: string }>('/me', { fields: host === 'instagram' ? 'user_id,username' : 'id,name' });
    qadamlar.push({ kalit: 'token', ok: men.ok, xabar: men.ok ? (men.data.username ? `@${men.data.username}` : (men.data.name ?? men.data.id)) : men.xato, muhim: true });

    if (men.ok && kanal === 'facebook' && c.pageId) {
      const sahifa = await g<{ id: string; name?: string }>(`/${c.pageId}`, { fields: 'id,name' });
      qadamlar.push({ kalit: 'sahifa', ok: sahifa.ok, xabar: sahifa.ok ? (sahifa.data.name ?? sahifa.data.id) : sahifa.xato, muhim: true });
      if (sahifa.ok) yangilash.accountName = sahifa.data.name ?? null;
      const obuna = await g<{ success?: boolean }>(`/${c.pageId}/subscribed_apps`, { subscribed_fields: 'leadgen,messages,message_echoes' }, 'POST');
      qadamlar.push({ kalit: 'obuna', ok: obuna.ok, xabar: obuna.ok ? null : `${obuna.xato}. Sahifa tokeni (Page Access Token) kerak`, muhim: false });
    }

    if (men.ok && kanal === 'instagram') {
      if (host === 'instagram') {
        // Instagram Login: token hisobning o'ziniki
        yangilash.accountName = men.data.username ? `@${men.data.username}` : null;
        if (!c.igAccountId && men.data.user_id) yangilash.igAccountId = String(men.data.user_id);
        const obuna = await g<{ success?: boolean }>('/me/subscribed_apps', { subscribed_fields: 'messages' }, 'POST');
        qadamlar.push({ kalit: 'obuna', ok: obuna.ok, xabar: obuna.ok ? null : obuna.xato, muhim: false });
      } else {
        // Facebook Login: Instagram hisobi sahifaga bog'langan
        let hisob: { id: string; username?: string } | null = null;
        let xato: string | null = null;
        if (c.igAccountId) {
          const r = await g<{ id: string; username?: string }>(`/${c.igAccountId}`, { fields: 'id,username' });
          if (r.ok) hisob = r.data;
          else xato = r.xato;
        } else if (c.pageId) {
          const r = await g<{ instagram_business_account?: { id: string; username?: string } }>(`/${c.pageId}`, { fields: 'instagram_business_account{id,username}' });
          if (r.ok && r.data.instagram_business_account) hisob = r.data.instagram_business_account;
          else xato = r.ok ? "Bu sahifaga Instagram professional hisobi bog'lanmagan" : r.xato;
        } else {
          xato = 'Instagram hisob ID yoki Facebook sahifa ID sini kiriting';
        }
        qadamlar.push({ kalit: 'hisob', ok: Boolean(hisob), xabar: hisob ? `@${hisob.username ?? hisob.id}` : xato, muhim: true });
        if (hisob) {
          yangilash.accountName = hisob.username ? `@${hisob.username}` : null;
          if (!c.igAccountId) yangilash.igAccountId = hisob.id;
        }
        if (c.pageId) {
          const obuna = await g<{ success?: boolean }>(`/${c.pageId}/subscribed_apps`, { subscribed_fields: 'leadgen' }, 'POST');
          qadamlar.push({ kalit: 'obuna', ok: obuna.ok, xabar: obuna.ok ? null : `${obuna.xato}. Sahifa tokeni (Page Access Token) kerak`, muhim: false });
        }
      }
    }

    // Token ishlasa — avval ma'lumoti olinmay qolgan Lead Ads lidlarini to'ldirish
    if (men.ok) {
      const n = await olinmaganLidlarniTold(businessId, s);
      if (n > 0) qadamlar.push({ kalit: 'lidlar', ok: true, xabar: String(n), muhim: false });
    }
  }

  const muhimXato = qadamlar.find((x) => x.muhim && !x.ok);
  const ogohlar = qadamlar.filter((x) => !x.muhim && !x.ok).map((x) => x.xabar ?? '').filter(Boolean);
  await withTenant(businessId, async (tx) => {
    const [r] = await tx.select({ config: integration.config, creds: integration.credentialsEncrypted }).from(integration).where(eq(integration.id, q.id)).for('update').limit(1);
    if (!r?.creds) return; // sinov paytida uzildi
    const joriy = configniOl(r.config);
    await tx
      .update(integration)
      .set({
        status: muhimXato ? 'error' : 'connected',
        syncEnabled: !muhimXato,
        lastError: muhimXato?.xabar ?? null,
        config: configniYoz(r.config, { ...joriy, ...yangilash, warnings: ogohlar, lastTestAt: new Date().toISOString() }),
        updatedAt: new Date(),
      })
      .where(eq(integration.id, q.id));
  });
  return { ok: qadamlar.every((x) => x.ok), qadamlar };
}

// ─── Murojaat yozish (umumiy) ────────────────────────────────────────────────

/** Bir xil kalit bo'yicha parallel so'rovlar navbatga turadi (tranzaksiya oxirigacha). */
async function qulf(tx: Tx, kalit: string): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${kalit}, 0))`);
}

/** Voronka o'chirilgan bo'lsa — asosiy voronkaga (null). */
async function voronka(tx: Tx, id: string | null): Promise<string | null> {
  if (!id) return null;
  const [v] = await tx.select({ id: crmPipeline.id }).from(crmPipeline).where(eq(crmPipeline.id, id)).limit(1);
  return v?.id ?? null;
}

function matnQosh(eski: string | null, yangi: string): string {
  const m = eski ? `${eski}\n${yangi}` : yangi;
  return m.length > MATN_CHEGARASI ? `…${m.slice(m.length - MATN_CHEGARASI + 1)}` : m;
}

/** `998901234567` → `+998901234567` (Telegram ba'zan `+` siz yuboradi). */
function telefon(t: string | null | undefined): string | null {
  const s = (t ?? '').trim();
  if (!s) return null;
  return /^\d{7,15}$/.test(s) ? `+${s}` : s.slice(0, 40);
}

async function kontaktId(tx: Tx, businessId: string, p: { ism: string | null; phone: string | null; email: string | null }): Promise<string | null> {
  // Telefonsiz kontakt yaratilmaydi — aks holda har yangi yozuvchidan ismdosh dubl paydo bo'lardi;
  // qabul qilinganda kontakt murojaatdagi ism bilan yaratiladi.
  return p.phone ? kontaktniTopYokiYarat(tx, businessId, { name: p.ism, phone: p.phone, email: p.email }) : null;
}

interface XabarKirish {
  source: Kanal;
  /** Yozuvchi: Messenger PSID, Instagram IGSID yoki Telegram chat ID. */
  senderId: string;
  /** Xabar ID si — qayta yuborilganini aniqlash uchun. */
  mid: string;
  text: string | null;
  phone?: string | null;
  username?: string | null;
  pipelineId: string | null;
  qoshimcha?: Record<string, unknown>;
}

type XabarNatijasi = 'yangi' | 'qoshildi' | 'takror';

/**
 * Murojaat chatidagi bitta xabar (`payload.chat`): kirgan — mijozdan, chiqqan —
 * bot javobi, sahifadan yozilgan (Meta echo) yoki CRM'dan yuborilgan.
 */
export interface ChatXabari {
  id: string;
  dir: 'in' | 'out';
  text: string;
  at: string;
  /** Chiqqan xabarni kim yozgan: menejer ismi, "Bot"; null — sahifaning o'zidan. */
  by?: string | null;
}

const CHAT_CHEGARASI = 200;

/**
 * Murojaat chati. Bu imkoniyatdan oldin kelgan murojaatlarda xabarlar faqat
 * bitta matn bo'lib saqlangan — ular bitta kirgan xabar sifatida ko'rinadi.
 */
export function murojaatChati(payload: unknown, message: string | null, createdAt: Date | string): ChatXabari[] {
  const chat = ((payload ?? {}) as Record<string, unknown>).chat;
  if (Array.isArray(chat)) return chat as ChatXabari[];
  return message ? [{ id: 'eski', dir: 'in', text: message, at: new Date(createdAt).toISOString() }] : [];
}

/** Yangi xabar qo'shilgan chat; shu ID li xabar allaqachon bo'lsa — null. */
function chatgaQosh(chat: ChatXabari[], x: ChatXabari): ChatXabari[] | null {
  if (chat.some((c) => c.id === x.id)) return null;
  return [...chat, x].slice(-CHAT_CHEGARASI);
}

type ChatQatori = { id: string; message: string | null; payload: unknown; createdAt: Date };

async function chatniYoz(tx: Tx, m: ChatQatori, x: ChatXabari): Promise<void> {
  const pl = (m.payload ?? {}) as Record<string, unknown>;
  const chat = chatgaQosh(murojaatChati(pl, m.message, m.createdAt), x);
  if (chat) await tx.update(crmInbox).set({ payload: { ...pl, chat } }).where(eq(crmInbox.id, m.id));
}

/**
 * Chiqqan xabar (bot javobi yoki sahifadan yozilgan) — shu yozuvchining
 * kutilayotgan murojaatiga. Murojaat bo'lmasa hech narsa yozilmaydi.
 */
async function chiqishniYoz(businessId: string, source: Kanal, senderId: string, x: ChatXabari): Promise<void> {
  await withTenant(businessId, async (tx) => {
    await qulf(tx, `tarmoq:${businessId}:${source}:${senderId}`);
    const [m] = await tx
      .select({ id: crmInbox.id, message: crmInbox.message, payload: crmInbox.payload, createdAt: crmInbox.createdAt })
      .from(crmInbox)
      .where(and(eq(crmInbox.source, source), eq(crmInbox.status, 'pending'), sql`${crmInbox.payload}->>'senderId' = ${senderId}`))
      .orderBy(desc(crmInbox.createdAt))
      .limit(1)
      .for('update');
    if (m) await chatniYoz(tx, m, x);
  });
}

/**
 * Bir yozuvchidan bitta kutilayotgan murojaat: birinchi xabar — yangi murojaat,
 * keyingilari unga qo'shiladi (amoCRM "Неразобранное" kabi). Murojaat qabul
 * yoki rad qilingandan keyin yozsa — yangi murojaat.
 */
async function xabarniYoz(businessId: string, k: XabarKirish, profil?: () => Promise<{ ism: string | null; username?: string | null } | null>): Promise<XabarNatijasi> {
  const shart = and(eq(crmInbox.source, k.source), eq(crmInbox.status, 'pending'), sql`${crmInbox.payload}->>'senderId' = ${k.senderId}`);
  const [bor] = await withTenant(businessId, (tx) => tx.select({ id: crmInbox.id }).from(crmInbox).where(shart).limit(1));
  // Ism faqat yangi murojaat uchun so'raladi — tarmoq so'rovi tranzaksiyadan tashqarida
  const p = !bor && profil ? await profil().catch(() => null) : null;
  const kirish: ChatXabari | null =
    k.text || k.phone ? { id: k.mid, dir: 'in', text: k.text ?? `📱 ${k.phone}`, at: new Date().toISOString() } : null;

  return withTenant(businessId, async (tx) => {
    await qulf(tx, `tarmoq:${businessId}:${k.source}:${k.senderId}`);
    const [m] = await tx
      .select({
        id: crmInbox.id,
        message: crmInbox.message,
        payload: crmInbox.payload,
        phone: crmInbox.phone,
        name: crmInbox.name,
        contactId: crmInbox.contactId,
        createdAt: crmInbox.createdAt,
      })
      .from(crmInbox)
      .where(shart)
      .orderBy(desc(crmInbox.createdAt))
      .limit(1)
      .for('update');
    if (m) {
      const pl = (m.payload ?? {}) as Record<string, unknown>;
      const mids = Array.isArray(pl.mids) ? (pl.mids as string[]) : [];
      if (mids.includes(k.mid)) return 'takror';
      const yangiTel = !m.phone && k.phone ? k.phone : null;
      // Eski (chatsiz) murojaatda avvalgi matn birinchi xabar bo'lib qoladi
      const chat = kirish ? chatgaQosh(murojaatChati(pl, m.message, m.createdAt), kirish) : null;
      await tx
        .update(crmInbox)
        .set({
          message: k.text ? matnQosh(m.message, k.text) : m.message,
          ...(yangiTel ? { phone: yangiTel, contactId: m.contactId ?? (await kontaktId(tx, businessId, { ism: m.name, phone: yangiTel, email: null })) } : {}),
          payload: {
            ...pl,
            ...k.qoshimcha,
            ...(chat ? { chat } : {}),
            mids: [...mids, k.mid].slice(-30),
            messageCount: (typeof pl.messageCount === 'number' ? pl.messageCount : 1) + 1,
            lastMessageAt: new Date().toISOString(),
          },
        })
        .where(eq(crmInbox.id, m.id));
      return 'qoshildi';
    }
    const ism = p?.ism?.trim() || null;
    const r = await tx
      .insert(crmInbox)
      .values({
        businessId,
        source: k.source,
        externalId: `msg:${k.mid}`.slice(0, 300),
        name: ism,
        phone: k.phone ?? null,
        message: k.text ? k.text.slice(0, MATN_CHEGARASI) : null,
        contactId: await kontaktId(tx, businessId, { ism, phone: k.phone ?? null, email: null }),
        pipelineId: await voronka(tx, k.pipelineId),
        payload: {
          ...k.qoshimcha,
          channel: k.source,
          type: 'message',
          senderId: k.senderId,
          username: k.username ?? p?.username ?? null,
          chat: kirish ? [kirish] : [],
          mids: [k.mid],
          messageCount: 1,
          lastMessageAt: new Date().toISOString(),
        },
      })
      .onConflictDoNothing()
      .returning({ id: crmInbox.id });
    return r.length ? 'yangi' : 'takror';
  });
}

/** Webhook kelganini qayd etadi — sozlama oynasida "oxirgi hodisa" va xato ko'rinadi. */
async function hodisaniQayd(businessId: string, integrationId: string, xato: string | null): Promise<void> {
  await withTenant(businessId, (tx) =>
    tx
      .update(integration)
      .set({ lastSyncAt: new Date(), lastSyncStatus: xato ? 'error' : 'ok', ...(xato ? { lastError: xato.slice(0, 500) } : {}) })
      .where(eq(integration.id, integrationId)),
  ).catch(() => undefined);
}

interface TopilganIntegratsiya {
  id: string;
  businessId: string;
  kind: string;
  status: string;
  config: unknown;
  creds: Buffer | null;
  webhookSecret: string | null;
}

async function integratsiyaniTop(id: string, turlar: Tur[]): Promise<TopilganIntegratsiya | null> {
  const [r] = await withoutTenantIsolation("webhook: ijtimoiy tarmoq integratsiyasini id bo'yicha topish, tenant konteksti yo'q", (tx) =>
    tx
      .select({
        id: integration.id,
        businessId: integration.businessId,
        kind: integration.kind,
        status: integration.status,
        config: integration.config,
        creds: integration.credentialsEncrypted,
        webhookSecret: integration.webhookSecret,
      })
      .from(integration)
      .where(and(eq(integration.id, id), inArray(integration.kind, turlar)))
      .limit(1),
  );
  return r ?? null;
}

const idSatr = (v: unknown): string | null => (typeof v === 'string' && v ? v : typeof v === 'number' ? String(v) : null);

// ─── Meta: Lead Ads ──────────────────────────────────────────────────────────

interface LidMalumoti {
  source: Kanal;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  payload: Record<string, unknown>;
}

const MAXSUS_MAYDON: Record<string, 'name' | 'first' | 'last' | 'phone' | 'email'> = {
  full_name: 'name',
  name: 'name',
  first_name: 'first',
  last_name: 'last',
  phone_number: 'phone',
  phone: 'phone',
  email: 'email',
};

/** `qaysi_kurs_sizni_qiziqtiradi?` → `Qaysi kurs sizni qiziqtiradi?` */
const savolNomi = (s: string) => {
  const t = s.replace(/_/g, ' ').trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/**
 * Lid ma'lumoti Graph API'dan. Forma nomi va reklama (kampaniya) nomlari —
 * qo'shimcha, olinmasa ham lid yaratiladi (ular `ads_read` ruxsatini talab qiladi).
 */
async function lidniOl(s: Sirlar, leadgenId: string): Promise<{ ok: true; lid: LidMalumoti } | { ok: false; xato: string }> {
  const g = <T>(yol: string, fields: string) => graph<T>({ yol, token: s.accessToken!, appSecret: s.appSecret, params: { fields } });
  const asos = await g<{
    id: string;
    created_time?: string;
    field_data?: { name?: string; values?: unknown[] }[];
    form_id?: string;
    ad_id?: string;
    platform?: string;
    is_organic?: boolean;
  }>(`/${leadgenId}`, 'id,created_time,field_data,form_id,ad_id,platform,is_organic');
  if (!asos.ok) return { ok: false, xato: asos.xato };
  const d = asos.data;
  const [forma, reklama] = await Promise.all([
    d.form_id ? g<{ name?: string }>(`/${d.form_id}`, 'name') : Promise.resolve(null),
    g<{ ad_name?: string; adset_name?: string; campaign_name?: string }>(`/${leadgenId}`, 'ad_name,adset_name,campaign_name'),
  ]);
  const formaNomi = forma?.ok ? (forma.data.name ?? null) : null;
  const rek = reklama.ok ? reklama.data : {};

  const q: { name?: string; first?: string; last?: string; phone?: string; email?: string } = {};
  const javoblar: [string, string][] = [];
  const values: Record<string, string> = {};
  for (const f of d.field_data ?? []) {
    const nom = (f.name ?? '').trim();
    const v = (f.values ?? []).map((x) => String(x ?? '').trim()).filter(Boolean).join(', ').slice(0, 1000);
    if (!nom || !v) continue;
    values[nom] = v;
    const maxsus = MAXSUS_MAYDON[nom.toLowerCase()];
    if (maxsus && !q[maxsus]) q[maxsus] = v;
    else javoblar.push([savolNomi(nom), v]);
  }
  const ism = q.name ?? ([q.first, q.last].filter(Boolean).join(' ') || null);
  const qatorlar = javoblar.map(([k, v]) => `${k}: ${v}`);
  if (formaNomi) qatorlar.push(`Forma: ${formaNomi}`);
  const rekNomi = [rek.campaign_name, rek.adset_name, rek.ad_name].filter(Boolean).join(' / ');
  if (rekNomi) qatorlar.push(`Reklama: ${rekNomi}`);
  if (d.is_organic) qatorlar.push('Organik (reklamasiz)');
  const source: Kanal = d.platform === 'ig' ? 'instagram' : 'facebook';
  return {
    ok: true,
    lid: {
      source,
      name: ism?.slice(0, 200) ?? null,
      phone: telefon(q.phone),
      email: q.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(q.email) ? q.email.slice(0, 200) : null,
      message: qatorlar.join('\n').slice(0, MATN_CHEGARASI) || null,
      payload: {
        channel: source,
        type: 'lead_ad',
        leadgenId,
        formId: d.form_id ?? null,
        leadForm: formaNomi,
        adId: d.ad_id ?? null,
        adName: rek.ad_name ?? null,
        adsetName: rek.adset_name ?? null,
        campaignName: rek.campaign_name ?? null,
        platform: d.platform ?? null,
        organic: d.is_organic ?? null,
        createdTime: d.created_time ?? null,
        values,
      },
    },
  };
}

/**
 * Lead Ads hodisasi. Graph API javob bermasa ham lid YO'QOLMAYDI: qisqa yozuv
 * yaratiladi (`fetchFailed`), "Sinash" bosilganda to'liq ma'lumot qayta olinadi.
 */
async function leadgenniQabul(r: TopilganIntegratsiya, s: Sirlar, v: Record<string, unknown>): Promise<'yangi' | 'takror' | 'xato'> {
  const leadgenId = idSatr(v.leadgen_id);
  if (!leadgenId) return 'takror';
  const externalId = `lead:${leadgenId}`;
  const sharti = and(inArray(crmInbox.source, META_MANBALAR), eq(crmInbox.externalId, externalId));
  const [bor] = await withTenant(r.businessId, (tx) => tx.select({ id: crmInbox.id }).from(crmInbox).where(sharti).limit(1));
  if (bor) return 'takror';

  const olindi = await lidniOl(s, leadgenId);
  const c = configniOl(r.config);
  const lid: LidMalumoti = olindi.ok
    ? olindi.lid
    : {
        source: kanalTuri(r.kind),
        name: null,
        phone: null,
        email: null,
        message: `Lid ma'lumotini olib bo'lmadi: ${olindi.xato}`,
        payload: { channel: kanalTuri(r.kind), type: 'lead_ad', leadgenId, formId: idSatr(v.form_id), adId: idSatr(v.ad_id), fetchFailed: true, fetchError: olindi.xato },
      };
  lid.payload.pageId = idSatr(v.page_id);

  const yaratildi = await withTenant(r.businessId, async (tx) => {
    await qulf(tx, `tarmoq:${r.businessId}:${externalId}`);
    const [yana] = await tx.select({ id: crmInbox.id }).from(crmInbox).where(sharti).limit(1);
    if (yana) return false;
    const q = await tx
      .insert(crmInbox)
      .values({
        businessId: r.businessId,
        source: lid.source,
        externalId,
        name: lid.name,
        phone: lid.phone,
        email: lid.email,
        message: lid.message,
        contactId: await kontaktId(tx, r.businessId, { ism: lid.name, phone: lid.phone, email: lid.email }),
        pipelineId: await voronka(tx, c.pipelineId),
        payload: lid.payload,
      })
      .onConflictDoNothing()
      .returning({ id: crmInbox.id });
    return q.length > 0;
  });
  if (!olindi.ok) return 'xato';
  return yaratildi ? 'yangi' : 'takror';
}

/** Ma'lumoti olinmay qolgan kutilayotgan Lead Ads lidlarini to'ldiradi (bir martada 20 tagacha). */
async function olinmaganLidlarniTold(businessId: string, s: Sirlar): Promise<number> {
  const qatorlar = await withTenant(businessId, (tx) =>
    tx
      .select({ id: crmInbox.id, payload: crmInbox.payload })
      .from(crmInbox)
      .where(and(inArray(crmInbox.source, META_MANBALAR), eq(crmInbox.status, 'pending'), sql`${crmInbox.payload}->>'fetchFailed' = 'true'`))
      .limit(20),
  );
  let n = 0;
  for (const q of qatorlar) {
    const pl = (q.payload ?? {}) as Record<string, unknown>;
    const leadgenId = idSatr(pl.leadgenId);
    if (!leadgenId) continue;
    const olindi = await lidniOl(s, leadgenId);
    if (!olindi.ok) continue;
    const lid = olindi.lid;
    await withTenant(businessId, async (tx) =>
      tx
        .update(crmInbox)
        .set({
          source: lid.source,
          name: lid.name,
          phone: lid.phone,
          email: lid.email,
          message: lid.message,
          contactId: await kontaktId(tx, businessId, { ism: lid.name, phone: lid.phone, email: lid.email }),
          payload: { ...lid.payload, pageId: pl.pageId ?? null },
        })
        .where(and(eq(crmInbox.id, q.id), eq(crmInbox.status, 'pending'))),
    );
    n++;
  }
  return n;
}

// ─── Meta: webhook ───────────────────────────────────────────────────────────

/** Meta webhookni tasdiqlash (GET): `hub.verify_token` mos bo'lsa — `hub.challenge` qaytariladi. */
export async function metaTasdiq(id: string, q: { mode?: string; token?: string; challenge?: string }): Promise<string | null> {
  if (q.mode !== 'subscribe' || !q.token || !q.challenge || q.challenge.length > 200) return null;
  const r = await integratsiyaniTop(id, META_TURLAR);
  if (!r?.webhookSecret || !safeCompare(r.webhookSecret, q.token)) return null;
  return q.challenge;
}

const metaTanasi = z.object({
  object: z.string(),
  entry: z
    .array(
      z
        .object({
          id: z.union([z.string(), z.number()]).optional(),
          changes: z.array(z.object({ field: z.string(), value: z.record(z.unknown()).optional() }).passthrough()).optional(),
          messaging: z.array(z.record(z.unknown())).optional(),
        })
        .passthrough(),
    )
    .max(1000)
    .default([]),
});

type MetaXabar = {
  sender?: { id?: unknown };
  recipient?: { id?: unknown };
  message?: { mid?: string; text?: string; is_echo?: boolean; is_deleted?: boolean; attachments?: { type?: string }[] };
  postback?: { mid?: string; title?: string };
};

const ILOVA_NOMI: Record<string, string> = { image: '[Rasm]', video: '[Video]', audio: '[Ovozli xabar]', file: '[Fayl]', story_mention: '[Storisda belgiladi]', share: '[Ulashildi]' };

/** Messenger yoki Instagram Direct xabari. */
async function metaXabari(r: TopilganIntegratsiya, s: Sirlar, obyekt: string, entryId: string | null, ev: MetaXabar): Promise<XabarNatijasi | null> {
  const senderId = idSatr(ev.sender?.id);
  const mid = ev.message?.mid ?? ev.postback?.mid;
  if (!senderId || !mid || ev.message?.is_deleted) return null;
  const ilova = ev.message?.attachments?.map((a) => ILOVA_NOMI[a.type ?? ''] ?? '[Ilova]').join(' ');
  const text = (ev.message?.text ?? ev.postback?.title ?? ilova ?? '').trim() || null;
  const source: Kanal = obyekt === 'instagram' ? 'instagram' : 'facebook';
  // Sahifa/hisobning o'zi yozgani (echo): murojaat emas, lekin chatda ko'rinadi —
  // boshqa servis (masalan, chat-bot) yoki Instagram ilovasidan yozilgan javoblar.
  // CRM'dan yuborilgani ham shu yerga qaytadi — xabar ID si bo'yicha dubl bo'lmaydi.
  if (ev.message?.is_echo || senderId === entryId) {
    const mijoz = idSatr(ev.recipient?.id);
    if (mijoz && text) await chiqishniYoz(r.businessId, source, mijoz, { id: mid, dir: 'out', text, at: new Date().toISOString(), by: null });
    return null;
  }
  const c = configniOl(r.config);
  const token = s.accessToken!;
  const host = source === 'instagram' ? igHost(token) : 'facebook';
  return xabarniYoz(
    r.businessId,
    { source, senderId, mid, text, pipelineId: c.pipelineId },
    async () => {
      const p = await graph<{ name?: string; username?: string }>({
        yol: `/${senderId}`,
        token,
        appSecret: s.appSecret,
        host,
        params: { fields: source === 'instagram' ? 'name,username' : 'name' },
        timeoutMs: 4000,
      });
      return p.ok ? { ism: p.data.name ?? (p.data.username ? `@${p.data.username}` : null), username: p.data.username ?? null } : null;
    },
  );
}

/**
 * Meta webhook (POST). `X-Hub-Signature-256` = HMAC-SHA256(App Secret, xom tana) —
 * shuning uchun tana JSON'ga aylantirilmasdan oldingi baytlari kerak.
 * Graph API xatosi lidni to'xtatmaydi (qisqa yozuv, keyin to'ldiriladi) — 200.
 * Lidni bazaga yozib bo'lmasa — xato otiladi (500), Meta qayta yuboradi.
 */
export async function metaHodisa(id: string, xom: Buffer, imzo: string | undefined): Promise<{ kod: 200 | 401; natija: Record<string, unknown> }> {
  const r = await integratsiyaniTop(id, META_TURLAR);
  if (!r) return { kod: 401, natija: { ok: false } };
  const s = sirlarniOch(r.creds);
  // Kalitsiz (hali ulanmagan yoki uzilgan) — imzoni tekshirib bo'lmaydi, hech narsa yozilmaydi
  if (!s.appSecret || !s.accessToken) return { kod: 200, natija: { ok: true, skipped: 'ulanmagan' } };
  const kutilgan = `sha256=${createHmac('sha256', s.appSecret).update(xom).digest('hex')}`;
  if (typeof imzo !== 'string' || !safeCompare(kutilgan, imzo.trim().toLowerCase())) return { kod: 401, natija: { ok: false } };

  let tana: z.infer<typeof metaTanasi>;
  try {
    const p = metaTanasi.safeParse(JSON.parse(xom.toString('utf8')));
    if (!p.success) return { kod: 200, natija: { ok: true, skipped: 'format tushunilmadi' } };
    tana = p.data;
  } catch {
    return { kod: 200, natija: { ok: true, skipped: 'JSON emas' } };
  }

  const son = { yangi: 0, qoshildi: 0, takror: 0, xato: 0 };
  /**
   * Yozib bo'lmagan hodisa (masalan, baza vaqtincha ishlamadi) — qolganlari
   * baribir ishlanadi, oxirida xato OTILADI: marshrut 500 qaytaradi va Meta
   * butun to'plamni qayta yuboradi. Idempotentlik tufayli yozilganlari dubl bo'lmaydi.
   */
  let yozilmadi: Error | null = null;
  for (const e of tana.entry) {
    const entryId = idSatr(e.id);
    for (const ch of e.changes ?? []) {
      if (ch.field !== 'leadgen' || !ch.value) continue;
      try {
        son[await leadgenniQabul(r, s, ch.value)]++;
      } catch (err) {
        yozilmadi = err as Error;
      }
    }
    for (const ev of e.messaging ?? []) {
      try {
        const n = await metaXabari(r, s, tana.object, entryId, ev as MetaXabar);
        if (n) son[n]++;
      } catch (err) {
        yozilmadi = err as Error;
      }
    }
  }
  if (yozilmadi) {
    await hodisaniQayd(r.businessId, r.id, `Lidni saqlab bo'lmadi: ${yozilmadi.message}`);
    throw yozilmadi;
  }
  // Graph API javob bermagan lidlar qisqa yozuv bilan saqlangan — sababi sozlama oynasida
  await hodisaniQayd(r.businessId, r.id, son.xato ? "Lid ma'lumotini olib bo'lmadi — «Sinash» tugmasini bosing" : null);
  return { kod: 200, natija: { ok: true, ...son } };
}

// ─── Telegram: webhook ───────────────────────────────────────────────────────

const tgYangilanish = z
  .object({
    update_id: z.number(),
    message: z
      .object({
        message_id: z.number(),
        chat: z.object({ id: z.number(), type: z.string() }).passthrough(),
        from: z
          .object({
            id: z.number(),
            is_bot: z.boolean().optional(),
            first_name: z.string().optional(),
            last_name: z.string().optional(),
            username: z.string().optional(),
            language_code: z.string().optional(),
          })
          .passthrough()
          .optional(),
        text: z.string().optional(),
        caption: z.string().optional(),
        contact: z.object({ phone_number: z.string(), user_id: z.number().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const TG_ILOVA: [string, string][] = [
  ['photo', '[Rasm]'],
  ['video', '[Video]'],
  ['video_note', '[Video xabar]'],
  ['voice', '[Ovozli xabar]'],
  ['audio', '[Audio]'],
  ['document', '[Fayl]'],
  ['sticker', '[Stiker]'],
  ['location', '[Joylashuv]'],
];

/**
 * Telegram webhook. Sir — `X-Telegram-Bot-Api-Secret-Token` sarlavhasida
 * (ulashda `setWebhook` bilan beriladi). Faqat shaxsiy chatlar — guruhlar
 * mijoz murojaati emas. /start — salom va "telefon yuborish" tugmasi;
 * telefon yuborilsa — murojaatga yoziladi.
 */
export async function telegramHodisa(id: string, sir: unknown, body: unknown): Promise<{ kod: 200 | 401; natija: Record<string, unknown> }> {
  const r = await integratsiyaniTop(id, ['crm_telegram']);
  if (!r?.webhookSecret || typeof sir !== 'string' || !safeCompare(r.webhookSecret, sir)) return { kod: 401, natija: { ok: false } };
  const s = sirlarniOch(r.creds);
  if (!s.botToken) return { kod: 200, natija: { ok: true, skipped: 'ulanmagan' } };

  const p = tgYangilanish.safeParse(body);
  const msg = p.success ? p.data.message : undefined;
  if (!msg || msg.chat.type !== 'private' || msg.from?.is_bot) return { kod: 200, natija: { ok: true, skipped: 'murojaat emas' } };

  const c = configniOl(r.config);
  const matn = (msg.text ?? msg.caption ?? '').trim();
  const start = /^\/start(\s|$)/.test(matn);
  const startBelgi = start ? matn.slice(6).trim().slice(0, 64) || null : null;
  const ozTelefoni = msg.contact && (!msg.contact.user_id || msg.contact.user_id === msg.from?.id) ? telefon(msg.contact.phone_number) : null;
  const ilova = TG_ILOVA.find(([k]) => k in msg)?.[1] ?? null;
  const text = start ? (startBelgi ? `Havola belgisi: ${startBelgi}` : null) : ozTelefoni ? null : matn || ilova;
  const ism = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ').trim() || null;

  let natija: XabarNatijasi;
  try {
    natija = await xabarniYoz(
      r.businessId,
      {
        source: 'telegram',
        senderId: String(msg.chat.id),
        mid: `${msg.chat.id}:${msg.message_id}`,
        text,
        phone: ozTelefoni,
        username: msg.from?.username ? `@${msg.from.username}` : null,
        pipelineId: c.pipelineId,
        qoshimcha: { ...(startBelgi ? { startParam: startBelgi } : {}), ...(msg.from?.language_code ? { language: msg.from.language_code } : {}) },
      },
      async () => ({ ism, username: msg.from?.username ? `@${msg.from.username}` : null }),
    );
  } catch (err) {
    // Saqlanmadi — Telegram qayta yuborsin (xabar ID si bo'yicha dubl bo'lmaydi)
    await hodisaniQayd(r.businessId, r.id, `Xabarni saqlab bo'lmadi: ${(err as Error).message}`);
    throw err;
  }

  // Javob — faqat birinchi marta (Telegram qayta yuborsa, mijozga ikki marta yozilmasin)
  if (natija !== 'takror') {
    const salom = c.greeting ?? STANDART_SALOM;
    const rahmat = c.thanks ?? STANDART_RAHMAT;
    const salomMi = Boolean(start && salom);
    const javob = salomMi ? salom : ozTelefoni && rahmat ? rahmat : null;
    if (javob) {
      const y = await tg<{ message_id: number }>(s.botToken, 'sendMessage', {
        chat_id: msg.chat.id,
        text: javob,
        reply_markup: salomMi
          ? { keyboard: [[{ text: TELEFON_TUGMASI, request_contact: true }]], resize_keyboard: true, one_time_keyboard: true }
          : { remove_keyboard: true },
      });
      // Bot javobi ham murojaat chatida ko'rinsin
      if (y.ok) {
        await chiqishniYoz(r.businessId, 'telegram', String(msg.chat.id), {
          id: `out:${y.result.message_id}`,
          dir: 'out',
          text: javob,
          at: new Date().toISOString(),
          by: 'Bot',
        }).catch(() => undefined);
      }
    }
  }
  await hodisaniQayd(r.businessId, r.id, null);
  return { kod: 200, natija: { ok: true, natija } };
}

// ─── Murojaat kartasi: hisob nomi va yozuvchining profil rasmi ──────────────

/**
 * Har kanalning ulangan hisob nomi (sahifa nomi, @instagram, @bot) — kartada
 * "dan:" yonida ko'rinadi. Nom ulanish sinovida aniqlanadi.
 */
export async function hisobNomlari(tx: Tx): Promise<Partial<Record<Kanal, string>>> {
  const qatorlar = await tx.select({ kind: integration.kind, config: integration.config }).from(integration).where(inArray(integration.kind, TURLAR));
  const natija: Partial<Record<Kanal, string>> = {};
  for (const q of qatorlar) {
    const nom = configniOl(q.config).accountName;
    if (nom) natija[kanalTuri(q.kind)] = nom;
  }
  return natija;
}

type Rasm = { turi: string; data: Buffer };

const RASM_CHEGARASI = 1024 * 1024;
const RASM_KESH_HAJMI = 500;
const RASM_BOR_MUDDATI = 6 * 60 * 60 * 1000;
const RASM_YOQ_MUDDATI = 60 * 60 * 1000;
/**
 * Kesh: kanban har ochilganda Telegram/Meta'ga qayta so'rov ketmasin.
 * Rasm yo'qligi ham eslab qolinadi (qisqaroq muddatga).
 */
const rasmKeshi = new Map<string, { rasm: Rasm | null; muddat: number }>();

/** Meta profil rasmlari faqat shu CDN lardan keladi — boshqa manzilga so'rov yuborilmaydi. */
const META_RASM_HOSTI = /(^|\.)(fbcdn\.net|fbsbx\.com|cdninstagram\.com|facebook\.com|instagram\.com)$/;

/** Faqat haqiqiy rasm baytlari qaytariladi (sarlavhaga ishonilmaydi). */
function rasmTuri(b: Buffer): string | null {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length > 8 && b.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length > 6 && b.toString('latin1', 0, 4) === 'GIF8') return 'image/gif';
  return null;
}

async function rasmniYukla(url: string): Promise<Rasm | null> {
  const ctrl = new AbortController();
  const taymer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok || Number(res.headers.get('content-length') ?? 0) > RASM_CHEGARASI) return null;
    const data = Buffer.from(await res.arrayBuffer());
    const turi = data.length <= RASM_CHEGARASI ? rasmTuri(data) : null;
    return turi ? { turi, data } : null;
  } catch {
    return null;
  } finally {
    clearTimeout(taymer);
  }
}

/** Telegram: foydalanuvchi rasmini maxfiy qilgan bo'lsa ro'yxat bo'sh keladi. */
async function telegramRasmi(s: Sirlar, senderId: string): Promise<Rasm | null> {
  if (!s.botToken || !/^\d+$/.test(senderId)) return null;
  const r = await tg<{ photos?: { file_id: string; width: number }[][] }>(s.botToken, 'getUserProfilePhotos', { user_id: Number(senderId), limit: 1 }, 5000);
  const olchamlar = r.ok ? (r.result.photos?.[0] ?? []) : [];
  if (!olchamlar.length) return null;
  // Kartada 42px — eng kichik (odatda 160px) o'lcham yetarli
  const tanlov = [...olchamlar].sort((a, b) => a.width - b.width).find((p) => p.width >= 120) ?? olchamlar[olchamlar.length - 1]!;
  const f = await tg<{ file_path?: string }>(s.botToken, 'getFile', { file_id: tanlov.file_id }, 5000);
  if (!f.ok || !f.result.file_path) return null;
  return rasmniYukla(`${process.env.TELEGRAM_API_BASE || 'https://api.telegram.org'}/file/bot${s.botToken}/${f.result.file_path}`);
}

/** Messenger (PSID) va Instagram (IGSID) — `profile_pic` vaqtinchalik CDN havolasi. */
async function metaRasmi(s: Sirlar, source: 'facebook' | 'instagram', senderId: string): Promise<Rasm | null> {
  if (!s.accessToken || !/^\d+$/.test(senderId)) return null;
  const host = source === 'instagram' ? igHost(s.accessToken) : 'facebook';
  const p = await graph<{ profile_pic?: string }>({ yol: `/${senderId}`, token: s.accessToken, appSecret: s.appSecret, host, params: { fields: 'profile_pic' }, timeoutMs: 5000 });
  if (!p.ok || !p.data.profile_pic) return null;
  let manzil: URL;
  try {
    manzil = new URL(p.data.profile_pic);
  } catch {
    return null;
  }
  if (manzil.protocol !== 'https:' || !META_RASM_HOSTI.test(manzil.hostname)) return null;
  return rasmniYukla(manzil.toString());
}

/**
 * Murojaat yozuvchisining profil rasmi. Kalitlar serverda qoladi (Telegram fayl
 * havolasida bot token bor), Meta havolalari esa eskiradi — shuning uchun
 * brauzer rasmni shu yerdan oladi. Rasm yo'q bo'lsa null (kartada bosh harflar).
 */
export async function murojaatRasmi(businessId: string, inboxId: string): Promise<Rasm | null> {
  const kalit = `${businessId}:${inboxId}`;
  const bor = rasmKeshi.get(kalit);
  if (bor && bor.muddat > Date.now()) return bor.rasm;

  const [m] = await withTenant(businessId, (tx) =>
    tx.select({ source: crmInbox.source, payload: crmInbox.payload }).from(crmInbox).where(eq(crmInbox.id, inboxId)).limit(1),
  );
  if (!m) return null;
  const source = KANALLAR.find((k) => k === m.source);
  const senderId = idSatr(((m.payload ?? {}) as Record<string, unknown>).senderId);
  let rasm: Rasm | null = null;
  if (source && senderId) {
    const [r] = await withTenant(businessId, (tx) =>
      tx.select({ creds: integration.credentialsEncrypted }).from(integration).where(eq(integration.kind, TUR[source])).limit(1),
    );
    const s = sirlarniOch(r?.creds);
    rasm = await (source === 'telegram' ? telegramRasmi(s, senderId) : metaRasmi(s, source, senderId)).catch(() => null);
  }
  if (rasmKeshi.size >= RASM_KESH_HAJMI) {
    const eng = rasmKeshi.keys().next().value;
    if (eng !== undefined) rasmKeshi.delete(eng);
  }
  rasmKeshi.set(kalit, { rasm, muddat: Date.now() + (rasm ? RASM_BOR_MUDDATI : RASM_YOQ_MUDDATI) });
  return rasm;
}

// ─── Murojaatga CRM'dan javob ────────────────────────────────────────────────

/** Bir xabar uzunligi: Telegram 4096, Messenger 2000, Instagram 1000 belgigacha. */
const JAVOB_CHEGARASI: Record<Kanal, number> = { telegram: 4000, facebook: 2000, instagram: 1000 };
/** Meta: mijoz oxirgi marta yozganidan 24 soat o'tgach oddiy javob yuborib bo'lmaydi. */
const META_OYNASI_MS = 24 * 60 * 60 * 1000;
const OYNA_YOPIQ = "Mijoz oxirgi marta 24 soatdan oldin yozgan — Meta qoidasiga ko'ra mijoz qayta yozmaguncha javob yuborib bo'lmaydi.";

/** Murojaat oynasida yozish maydoni: faqat tarmoq xabarlarida va (Meta'da) 24 soat ichida. */
export function javobImkoni(source: string, payload: unknown, chat: ChatXabari[]): { canReply: boolean; replyNote: string | null } {
  const kanal = KANALLAR.find((k) => k === source);
  const pl = (payload ?? {}) as Record<string, unknown>;
  if (!kanal || pl.type !== 'message' || !idSatr(pl.senderId)) return { canReply: false, replyNote: null };
  if (kanal !== 'telegram') {
    const oxirgi = typeof pl.lastMessageAt === 'string' ? pl.lastMessageAt : [...chat].reverse().find((c) => c.dir === 'in')?.at;
    const vaqt = oxirgi ? Date.parse(oxirgi) : NaN;
    if (Number.isFinite(vaqt) && Date.now() - vaqt > META_OYNASI_MS) return { canReply: false, replyNote: OYNA_YOPIQ };
  }
  return { canReply: true, replyNote: null };
}

/**
 * Menejer CRM'dan yozgan javob — mijozga o'sha tarmoqda yuboriladi va
 * murojaat chatiga qo'shiladi. Yuborilmasa (bloklagan, 24 soat o'tgan,
 * kalit eskirgan) — sababi bilan xato.
 */
export async function murojaatgaJavob(businessId: string, inboxId: string, matn: string, muallif: string): Promise<ChatXabari> {
  const text = matn.trim();
  if (!text) throw new CrmXatosi('yaroqsiz', 'Xabar matnini kiriting');
  const [m] = await withTenant(businessId, (tx) =>
    tx
      .select({ id: crmInbox.id, source: crmInbox.source, message: crmInbox.message, payload: crmInbox.payload, createdAt: crmInbox.createdAt })
      .from(crmInbox)
      .where(eq(crmInbox.id, inboxId))
      .limit(1),
  );
  if (!m) throw new CrmXatosi('topilmadi', 'Murojaat topilmadi');
  const imkon = javobImkoni(m.source, m.payload, murojaatChati(m.payload, m.message, m.createdAt));
  if (!imkon.canReply) throw new CrmXatosi('ziddiyat', imkon.replyNote ?? "Bu murojaatga javob yozib bo'lmaydi");
  const kanal = m.source as Kanal;
  const senderId = idSatr(((m.payload ?? {}) as Record<string, unknown>).senderId)!;
  if (text.length > JAVOB_CHEGARASI[kanal]) throw new CrmXatosi('yaroqsiz', `Xabar juda uzun — ${JAVOB_CHEGARASI[kanal]} belgidan oshmasin`);

  const [r] = await withTenant(businessId, (tx) =>
    tx.select({ creds: integration.credentialsEncrypted }).from(integration).where(eq(integration.kind, TUR[kanal])).limit(1),
  );
  const s = sirlarniOch(r?.creds);
  let id: string;
  if (kanal === 'telegram') {
    if (!s.botToken) throw new CrmXatosi('ziddiyat', 'Telegram ulanmagan');
    const y = await tg<{ message_id: number }>(s.botToken, 'sendMessage', { chat_id: senderId, text });
    if (!y.ok) throw new CrmXatosi('ziddiyat', /blocked|deactivated|chat not found/i.test(y.xato) ? 'Mijoz botni bloklagan — xabar yetkazilmadi' : `Telegram: ${y.xato}`);
    id = `out:${y.result.message_id}`;
  } else {
    if (!s.accessToken) throw new CrmXatosi('ziddiyat', `${TARMOQ_NOMI[kanal]} ulanmagan`);
    const y = await graph<{ message_id?: string }>({
      yol: '/me/messages',
      token: s.accessToken,
      appSecret: s.appSecret,
      host: kanal === 'instagram' ? igHost(s.accessToken) : 'facebook',
      usul: 'POST',
      params: { recipient: JSON.stringify({ id: senderId }), messaging_type: 'RESPONSE', message: JSON.stringify({ text }) },
    });
    if (!y.ok) throw new CrmXatosi('ziddiyat', /allowed window/i.test(y.xato) ? OYNA_YOPIQ : `${TARMOQ_NOMI[kanal]}: ${y.xato}`);
    id = y.data.message_id ?? `out:${randomBytes(6).toString('hex')}`;
  }

  const x: ChatXabari = { id, dir: 'out', text, at: new Date().toISOString(), by: muallif };
  // Meta echo ba'zan javobdan oldin keladi — u holda yozuv bor, faqat muallif ismi qo'shiladi
  await withTenant(businessId, async (tx) => {
    const [q] = await tx
      .select({ id: crmInbox.id, message: crmInbox.message, payload: crmInbox.payload, createdAt: crmInbox.createdAt })
      .from(crmInbox)
      .where(eq(crmInbox.id, inboxId))
      .limit(1)
      .for('update');
    if (!q) return;
    const pl = (q.payload ?? {}) as Record<string, unknown>;
    const chat = murojaatChati(pl, q.message, q.createdAt);
    const bor = chat.findIndex((c) => c.id === x.id);
    if (bor >= 0) {
      chat[bor] = { ...chat[bor]!, by: muallif };
      await tx.update(crmInbox).set({ payload: { ...pl, chat } }).where(eq(crmInbox.id, q.id));
    } else {
      await chatniYoz(tx, q, x);
    }
  });
  return x;
}
