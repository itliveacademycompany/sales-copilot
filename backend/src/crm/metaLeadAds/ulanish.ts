import { createHmac } from 'node:crypto';
import { and, count, desc, eq, gte, inArray, ne, sql } from 'drizzle-orm';
import { decryptSecret } from '../../crypto/secrets.js';
import { withoutTenantIsolation, withTenant } from '../../db/index.js';
import { auditLog, metaLeadgenEvent, metaPageConnection } from '../../db/schema/index.js';
import { CrmXatosi } from '../xato.js';
import { graf } from './graph.js';
import { formalarniTekshir, obunaQil, sahifaFormalari, voronkaniTekshir } from './oauth.js';
import { MAJBURIY_RUXSATLAR, metaSozlama, redirectUri, webhookManzili, yetishmaydi } from './sozlama.js';
import { formalar, XATO_MATNI, type XatoTuri } from './sof.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META LEAD ADS — ulanish holati, diagnostika, uzish
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Ulandi" (OAuth + obuna) va "Lid qabul qilindi" (`first_lead_at`) alohida
 * holatlar — OAuth muvaffaqiyati butun zanjir ishlayapti degani emas.
 */

const sozlamaShart = () => {
  const s = metaSozlama();
  if (!s) throw new CrmXatosi('ziddiyat', XATO_MATNI.config);
  return s;
};

const ulanishTopilmadi = new CrmXatosi('topilmadi', 'Ulanish topilmadi');

async function ulanishniOl(businessId: string, id: string) {
  const [c] = await withTenant(businessId, (tx) => tx.select().from(metaPageConnection).where(eq(metaPageConnection.id, id)).limit(1));
  if (!c) throw ulanishTopilmadi;
  return c;
}

function sahifaTokeni(b: Buffer | null): string | null {
  if (!b) return null;
  try {
    return decryptSecret(b);
  } catch {
    return null;
  }
}

// ─── Holat ───────────────────────────────────────────────────────────────────

export async function metaHolati(businessId: string, superAdmin: boolean) {
  const sozlangan = metaSozlama() !== null;
  const [ulanishlar, sonlar, xatolar] = await withTenant(businessId, (tx) =>
    Promise.all([
      tx.select().from(metaPageConnection).where(ne(metaPageConnection.status, 'disconnected')).orderBy(metaPageConnection.connectedAt),
      tx
        .select({ connectionId: metaLeadgenEvent.connectionId, status: metaLeadgenEvent.status, n: count() })
        .from(metaLeadgenEvent)
        .where(gte(metaLeadgenEvent.receivedAt, new Date(Date.now() - 30 * 86400_000)))
        .groupBy(metaLeadgenEvent.connectionId, metaLeadgenEvent.status),
      tx
        .select({
          id: metaLeadgenEvent.id,
          connectionId: metaLeadgenEvent.connectionId,
          status: metaLeadgenEvent.status,
          reason: metaLeadgenEvent.reason,
          formId: metaLeadgenEvent.formId,
          lastError: metaLeadgenEvent.lastError,
          attempts: metaLeadgenEvent.attempts,
          receivedAt: metaLeadgenEvent.receivedAt,
        })
        .from(metaLeadgenEvent)
        .where(inArray(metaLeadgenEvent.status, ['failed', 'auth_wait', 'queued']))
        .orderBy(desc(metaLeadgenEvent.receivedAt))
        .limit(30),
    ]),
  );
  return {
    configured: sozlangan,
    // Texnik tafsilotlar faqat platforma administratoriga
    ...(superAdmin ? { admin: { missingEnv: yetishmaydi(), redirectUri: redirectUri(), webhookUrl: webhookManzili() } } : {}),
    connections: ulanishlar.map((c) => {
      const son = (st: string) => Number(sonlar.find((x) => x.connectionId === c.id && x.status === st)?.n ?? 0);
      const berilgan = Array.isArray(c.grantedScopes) ? (c.grantedScopes as string[]) : [];
      return {
        id: c.id,
        pageId: c.pageId,
        pageName: c.pageName,
        status: c.status,
        forms: formalar(c.forms),
        pipelineId: c.pipelineId,
        subscription: { status: c.subscriptionStatus, checkedAt: c.subscriptionCheckedAt },
        connectedAt: c.connectedAt,
        tokenExpiresAt: c.tokenExpiresAt,
        lastEventAt: c.lastEventAt,
        firstLeadAt: c.firstLeadAt,
        lastLeadAt: c.lastLeadAt,
        lastError: c.lastError,
        lastErrorCode: c.lastErrorCode,
        lastErrorAt: c.lastErrorAt,
        lastCheckAt: c.lastCheckAt,
        lastCheck: c.lastCheck,
        missingPermissions: berilgan.length ? MAJBURIY_RUXSATLAR.filter((r) => !berilgan.includes(r)) : [],
        counts: { done: son('done'), duplicate: son('duplicate'), ignored: son('ignored'), queued: son('queued') + son('processing'), failed: son('failed'), authWait: son('auth_wait') },
        problems: xatolar
          .filter((x) => x.connectionId === c.id)
          .slice(0, 10)
          .map((x) => ({ id: x.id, status: x.status, reason: x.reason, formId: x.formId, error: x.lastError, attempts: x.attempts, receivedAt: x.receivedAt })),
      };
    }),
  };
}

// ─── Holatni tekshirish ──────────────────────────────────────────────────────

export interface TekshiruvQadami {
  /** token | muddat | ruxsat | obuna | forma | lidlar */
  kalit: string;
  ok: boolean;
  /** Muvaffaqiyatda — topilgan qiymat, xatoda — tushunarli sabab. */
  xabar: string | null;
  muhim: boolean;
}

const KOD: Record<XatoTuri, string> = {
  token_revoked: 'token_revoked',
  permission: 'permission',
  leads_access: 'leads_access',
  not_found: 'page_not_found',
  rate_limit: 'rate_limit',
  transient: 'network',
  unknown: 'unknown',
};

/**
 * Haqiqiy Meta API orqali tekshiradi: token, muddat va ruxsatlar (debug_token),
 * sahifa obunasi (yo'q bo'lsa — qayta obuna), tanlangan formalar va lidlarni
 * o'qish huquqi (Leads Access). Natija ulanishga yoziladi.
 */
export async function ulanishniTekshir(businessId: string, id: string): Promise<{ ok: boolean; qadamlar: TekshiruvQadami[] }> {
  const cfg = sozlamaShart();
  const c = await ulanishniOl(businessId, id);
  if (c.status === 'disconnected') throw new CrmXatosi('ziddiyat', 'Ulanish uzilgan — «Facebook orqali ulash» ni bosing');
  const token = sahifaTokeni(c.pageTokenEncrypted);
  const q: TekshiruvQadami[] = [];
  let birinchiXato: { kod: string; matn: string } | null = null;
  const xato = (t: XatoTuri) => {
    birinchiXato ??= { kod: KOD[t], matn: XATO_MATNI[t] };
    return XATO_MATNI[t];
  };
  let obunaHolati = c.subscriptionStatus;

  if (!token) {
    q.push({ kalit: 'token', ok: false, xabar: xato('token_revoked'), muhim: true });
  } else {
    const g = <T>(yol: string, params?: Record<string, string>, kontekst?: 'lid') => graf<T>({ yol, token, appSecret: cfg.appSecret, params, kontekst });
    const sahifa = await g<{ id: string; name?: string }>(`/${c.pageId}`, { fields: 'id,name' });
    q.push({ kalit: 'token', ok: sahifa.ok, xabar: sahifa.ok ? (sahifa.data.name ?? c.pageId) : xato(sahifa.tur), muhim: true });

    if (sahifa.ok) {
      const dbg = await graf<{ data?: { is_valid?: boolean; expires_at?: number; scopes?: string[] } }>({
        yol: '/debug_token',
        token: `${cfg.appId}|${cfg.appSecret}`,
        params: { input_token: token },
      });
      if (dbg.ok && dbg.data.data) {
        const d = dbg.data.data;
        const exp = typeof d.expires_at === 'number' && d.expires_at > 0 ? new Date(d.expires_at * 1000) : null;
        q.push({
          kalit: 'muddat',
          ok: d.is_valid !== false,
          xabar: d.is_valid === false ? xato('token_revoked') : exp ? exp.toISOString() : null,
          muhim: true,
        });
        if (Array.isArray(d.scopes)) {
          const yoq = MAJBURIY_RUXSATLAR.filter((r) => !d.scopes!.includes(r));
          q.push({ kalit: 'ruxsat', ok: yoq.length === 0, xabar: yoq.length ? `${xato('permission')} (${yoq.join(', ')})` : null, muhim: true });
        }
      }

      // Obuna: ilovamiz ro'yxatda va `leadgen` maydoniga obuna bo'lganmi
      const ilovalar = await g<{ data?: { id?: string; subscribed_fields?: string[] }[] }>(`/${c.pageId}/subscribed_apps`);
      const bizniki = ilovalar.ok ? ilovalar.data.data?.find((a) => a.id === cfg.appId) : undefined;
      let obunaOk = Boolean(bizniki?.subscribed_fields?.includes('leadgen'));
      let obunaXabar: string | null = null;
      if (!obunaOk) {
        const qayta = await obunaQil(c.pageId, token, cfg.appSecret);
        obunaOk = qayta.ok;
        obunaXabar = qayta.ok ? 'qayta_obuna' : qayta.xabar;
      }
      obunaHolati = obunaOk ? 'subscribed' : 'failed';
      if (!obunaOk) birinchiXato ??= { kod: 'subscription', matn: XATO_MATNI.subscription };
      q.push({ kalit: 'obuna', ok: obunaOk, xabar: obunaXabar, muhim: true });

      // Tanlangan formalar hali bormi va faolmi
      const tanlangan = formalar(c.forms);
      for (const f of tanlangan.slice(0, 20)) {
        const r = await g<{ id: string; name?: string; status?: string }>(`/${f.id}`, { fields: 'id,name,status' });
        const faol = r.ok && (r.data.status ?? 'ACTIVE') === 'ACTIVE';
        q.push({
          kalit: 'forma',
          ok: faol,
          xabar: r.ok ? `${r.data.name ?? f.name ?? f.id}${faol ? '' : ` — ${r.data.status}`}` : `${f.name ?? f.id} — ${XATO_MATNI[r.tur]}`,
          muhim: false,
        });
      }

      // Lidlarni o'qish huquqi (Leads Access Manager) — bitta lid so'rab ko'riladi
      const birinchi = tanlangan[0];
      if (birinchi) {
        const lid = await g<{ data?: unknown[] }>(`/${birinchi.id}/leads`, { limit: '1', fields: 'id' }, 'lid');
        q.push({ kalit: 'lidlar', ok: lid.ok, xabar: lid.ok ? null : xato(lid.tur), muhim: true });
      }
    }
  }

  const ok = q.every((x) => x.ok || !x.muhim);
  await withTenant(businessId, (tx) =>
    tx
      .update(metaPageConnection)
      .set({
        status: ok ? 'active' : 'error',
        lastCheckAt: new Date(),
        lastCheck: q,
        subscriptionStatus: obunaHolati,
        subscriptionCheckedAt: new Date(),
        ...(ok ? { lastErrorCode: null, lastError: null, lastErrorAt: null } : birinchiXato ? { lastErrorCode: birinchiXato.kod, lastError: birinchiXato.matn, lastErrorAt: new Date() } : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(metaPageConnection.id, id), ne(metaPageConnection.status, 'disconnected'))),
  );
  return { ok, qadamlar: q };
}

// ─── Formalarni o'zgartirish ─────────────────────────────────────────────────

export async function ulanishFormalari(businessId: string, id: string) {
  const cfg = sozlamaShart();
  const c = await ulanishniOl(businessId, id);
  const token = sahifaTokeni(c.pageTokenEncrypted);
  if (!token || c.status === 'disconnected') throw new CrmXatosi('ziddiyat', XATO_MATNI.token_revoked);
  return { forms: await sahifaFormalari(c.pageId, token, cfg.appSecret), selected: formalar(c.forms).map((f) => f.id) };
}

export async function ulanishniYangila(p: { businessId: string; id: string; formIds?: string[] | undefined; pipelineId?: string | null | undefined; userId: string }) {
  const cfg = sozlamaShart();
  const c = await ulanishniOl(p.businessId, p.id);
  if (c.status === 'disconnected') throw ulanishTopilmadi;
  const yangi: { forms?: unknown; pipelineId?: string | null; updatedAt: Date } = { updatedAt: new Date() };
  if (p.formIds) {
    const token = sahifaTokeni(c.pageTokenEncrypted);
    if (!token) throw new CrmXatosi('ziddiyat', XATO_MATNI.token_revoked);
    yangi.forms = formalarniTekshir(p.formIds, await sahifaFormalari(c.pageId, token, cfg.appSecret));
  }
  if (p.pipelineId !== undefined) yangi.pipelineId = await voronkaniTekshir(p.businessId, p.pipelineId);
  await withTenant(p.businessId, async (tx) => {
    await tx.update(metaPageConnection).set(yangi).where(eq(metaPageConnection.id, p.id));
    await tx.insert(auditLog).values({
      businessId: p.businessId,
      actorId: p.userId,
      action: 'meta_lead_ads.update',
      entity: 'meta_page_connection',
      entityId: p.id,
      before: { forms: formalar(c.forms).map((f) => f.id), pipelineId: c.pipelineId },
      after: { forms: yangi.forms ? formalar(yangi.forms).map((f) => f.id) : undefined, pipelineId: yangi.pipelineId },
    });
  });
}

// ─── Uzish ───────────────────────────────────────────────────────────────────

/**
 * Faqat shu tenant doirasida: token o'chiriladi, ulanish `disconnected`.
 * Sahifaning ilova obunasi faqat boshqa faol ulanish YO'Q bo'lsa olib
 * tashlanadi (bitta ilova — boshqa tashkilot uchun ham ishlashi mumkin).
 * Foydalanuvchining Facebook ruxsatlari global bekor QILINMAYDI.
 */
export async function ulanishniUz(p: { businessId: string; id: string; userId: string; ip?: string; userAgent?: string | null }): Promise<{ unsubscribed: boolean; warning: string | null }> {
  const c = await ulanishniOl(p.businessId, p.id);
  if (c.status === 'disconnected') return { unsubscribed: false, warning: null };
  const cfg = metaSozlama();
  const token = sahifaTokeni(c.pageTokenEncrypted);
  const [boshqa] = await withoutTenantIsolation('Meta: uzishdan oldin sahifaning boshqa faol ulanishi bormi', (tx) =>
    tx
      .select({ id: metaPageConnection.id })
      .from(metaPageConnection)
      .where(and(eq(metaPageConnection.pageId, c.pageId), ne(metaPageConnection.status, 'disconnected'), ne(metaPageConnection.id, c.id)))
      .limit(1),
  );
  let unsubscribed = false;
  let warning: string | null = null;
  if (!boshqa && token && cfg) {
    const r = await graf<{ success?: boolean | string }>({ yol: `/${c.pageId}/subscribed_apps`, token, appSecret: cfg.appSecret, usul: 'DELETE' });
    unsubscribed = r.ok && (r.data.success === true || r.data.success === 'true');
    if (!unsubscribed) warning = "Sahifaning webhook obunasini olib tashlab bo'lmadi — kelgan hodisalar e'tiborsiz qoldiriladi.";
  }
  await withTenant(p.businessId, async (tx) => {
    await tx
      .update(metaPageConnection)
      .set({
        status: 'disconnected',
        pageTokenEncrypted: null,
        subscriptionStatus: unsubscribed ? 'unsubscribed' : 'unknown',
        disconnectedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(metaPageConnection.id, c.id));
    // Navbatdagi hodisalar endi ishlanmaydi
    await tx
      .update(metaLeadgenEvent)
      .set({ status: 'ignored', reason: 'disconnected' })
      .where(and(eq(metaLeadgenEvent.connectionId, c.id), inArray(metaLeadgenEvent.status, ['queued', 'auth_wait', 'failed'])));
    await tx.insert(auditLog).values({
      businessId: p.businessId,
      actorId: p.userId,
      action: 'meta_lead_ads.disconnect',
      entity: 'meta_page_connection',
      entityId: c.id,
      before: { pageId: c.pageId, pageName: c.pageName },
      after: { unsubscribed },
      ip: p.ip ?? null,
      userAgent: p.userAgent ?? null,
    });
  });
  return { unsubscribed, warning };
}

// ─── Qayta ishlash ───────────────────────────────────────────────────────────

/** Xato bilan to'xtagan hodisani (yoki ulanishning barchasini) navbatga qaytaradi. */
export async function hodisalarniQaytar(businessId: string, connectionId: string, eventId?: string): Promise<number> {
  const c = await ulanishniOl(businessId, connectionId);
  if (c.status === 'disconnected') throw ulanishTopilmadi;
  const r = await withTenant(businessId, (tx) =>
    tx
      .update(metaLeadgenEvent)
      .set({ status: 'queued', attempts: 0, runAfter: new Date(), lastError: null, reason: null })
      .where(
        and(
          eq(metaLeadgenEvent.connectionId, connectionId),
          inArray(metaLeadgenEvent.status, ['failed', 'auth_wait']),
          ...(eventId ? [eq(metaLeadgenEvent.id, eventId)] : []),
        ),
      )
      .returning({ id: metaLeadgenEvent.id }),
  );
  if (eventId && !r.length) throw new CrmXatosi('topilmadi', 'Hodisa topilmadi yoki allaqachon ishlangan');
  return r.length;
}

// ─── Meta: ruxsat bekor qilinishi va ma'lumotni o'chirish so'rovi ────────────

/**
 * Deauthorize callback: foydalanuvchi ilovani Facebook sozlamalaridan olib
 * tashladi. Shu foydalanuvchi ulagan ulanishlar "xato" holatiga o'tadi —
 * rahbar «Qayta ulash» ni ko'radi. Lidlar (CRM yozuvlari) tegilmaydi.
 */
export async function ruxsatBekorQilindi(fbUserId: string): Promise<number> {
  const r = await withoutTenantIsolation('Meta deauthorize: FB foydalanuvchisi bo‘yicha ulanishlar (barcha tenantlar)', (tx) =>
    tx
      .update(metaPageConnection)
      .set({ status: 'error', lastErrorCode: 'token_revoked', lastError: XATO_MATNI.token_revoked, lastErrorAt: new Date(), updatedAt: new Date() })
      .where(and(eq(metaPageConnection.fbUserId, fbUserId), ne(metaPageConnection.status, 'disconnected')))
      .returning({ id: metaPageConnection.id }),
  );
  return r.length;
}

/**
 * Data deletion callback: ilova shu foydalanuvchidan olgan ma'lumot — sahifa
 * tokenlari va FB foydalanuvchi ID si — o'chiriladi, ulanishlar uziladi.
 * Lidlar reklama beruvchi (tashkilot) ma'lumoti — ular CRM'da qoladi
 * (docs/meta-lead-ads.md). Tasdiqlash kodi bazasiz tekshiriladi (HMAC).
 */
export async function malumotniOchir(fbUserId: string): Promise<{ confirmationCode: string }> {
  await withoutTenantIsolation('Meta data deletion: FB foydalanuvchisi tokenlarini o‘chirish (barcha tenantlar)', async (tx) => {
    await tx
      .update(metaPageConnection)
      .set({ status: 'disconnected', pageTokenEncrypted: null, fbUserId: null, disconnectedAt: new Date(), updatedAt: new Date() })
      .where(eq(metaPageConnection.fbUserId, fbUserId));
    await tx.execute(sql`update meta_oauth_session set pages_encrypted = null, fb_user_id = null where fb_user_id = ${fbUserId}`);
  });
  return { confirmationCode: tasdiqKodi(Date.now()) };
}

function tasdiqImzosi(ts: string): string {
  const s = metaSozlama();
  return createHmac('sha256', s?.appSecret ?? 'meta').update(`meta-deletion.${ts}`).digest('hex').slice(0, 16);
}

export function tasdiqKodi(ms: number): string {
  const ts = Math.floor(ms / 1000).toString(36);
  return `${ts}-${tasdiqImzosi(ts)}`;
}

export function tasdiqKodiTogrimi(kod: string): boolean {
  const [ts, imzo] = kod.split('-');
  return Boolean(ts && imzo && /^[0-9a-z]{1,12}$/.test(ts) && imzo === tasdiqImzosi(ts));
}
