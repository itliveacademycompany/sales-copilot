import { createHash } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { decryptSecret, encryptSecret, maskSecret } from '../../crypto/secrets.js';
import { withoutTenantIsolation, withTenant } from '../../db/index.js';
import { contact, crmInbox, crmPipeline, crmStage, deal, metaCapiConfig, metaCapiEvent, metaCapiRule } from '../../db/schema/index.js';
import { CrmXatosi } from '../xato.js';
import { graf } from './graph.js';
import { kutishSoniya, type XatoTuri } from './sof.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META CONVERSIONS API — bitim natijasini Meta'ga qaytarish
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * amoCRM'da bu tashqi CAPI vidjeti: bosqichga kirganda Meta'ga hodisa
 * yuboradi. IT Live auditida 84 hodisadan 74 tasi "vidjet obunasi tugagan"
 * sababli yuborilmagan — natija signali Meta'ga bormay qolgan. Bu yerda:
 * platformaning o'zida, obunasiz, va har hodisaning holati jurnalda.
 *
 * Oqim (lid qabul qilishdan mustaqil):
 *   bitim bosqichga kiradi (deal_event: stage | created)
 *     → navbatga (qoida × hodisa — bir marta, unikal kalit)
 *     → worker: kontakt ma'lumoti SHA-256 xeshlanadi → POST /{dataset}/events
 *     → jurnal: sent | skipped (sabab) | failed (sabab), qayta urinish bilan
 *
 * Maxfiylik: telefon/email/ism Meta'ga faqat SHA-256 xeshi bilan ketadi
 * (Meta talabi); jurnalda qiymatlar emas, faqat qaysi kalitlar borligi saqlanadi.
 */

/** Meta standart hodisalari — UI ro'yxati; o'z nomi ham mumkin. */
export const STANDART_HODISALAR = ['Lead', 'Contact', 'Schedule', 'SubmitApplication', 'CompleteRegistration', 'InitiateCheckout', 'Purchase', 'Subscribe', 'StartTrial'] as const;

/** Meta 7 kundan eski server hodisasini qabul qilmaydi. */
const MAX_YOSH_MS = 7 * 24 * 3600 * 1000;
const MAX_URINISH = 6;

const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ─── Sof qism (testlanadi) ──────────────────────────────────────────────────

export interface CapiManba {
  eventName: string;
  eventId: string;
  eventTime: Date;
  contactId: string | null;
  phone: string | null;
  email: string | null;
  name: string | null;
  leadgenId: string | null;
  amount: number | null;
  sendValue: boolean;
  currency: string;
}

/**
 * Meta `events` tanasi. `lead_id` — 15–17 xonali butun son: JSON'ga raqam
 * sifatida qo'yiladi, lekin JS `number`i 2^53 dan katta sonni buzadi —
 * shuning uchun matn sifatida joylab, keyin qo'shtirnoqsiz almashtiriladi.
 */
export function capiTanasi(m: CapiManba, hozir = new Date()): { data: string; matchKeys: string[] } | { skip: 'no_contact' | 'too_old' } {
  if (hozir.getTime() - m.eventTime.getTime() > MAX_YOSH_MS) return { skip: 'too_old' };
  const user: Record<string, unknown> = {};
  const kalitlar: string[] = [];
  const raqam = (m.phone ?? '').replace(/\D/g, '');
  if (raqam.length >= 7) {
    user.ph = [sha(raqam)];
    kalitlar.push('ph');
  }
  const email = (m.email ?? '').trim().toLowerCase();
  if (email.includes('@')) {
    user.em = [sha(email)];
    kalitlar.push('em');
  }
  const leadId = m.leadgenId && /^\d{6,20}$/.test(m.leadgenId) ? m.leadgenId : null;
  if (leadId) {
    user.lead_id = '__LEAD_ID__';
    kalitlar.push('lead_id');
  }
  // Ism yolg'iz o'zi moslash uchun yetarli emas — faqat yordamchi
  if (kalitlar.length === 0) return { skip: 'no_contact' };
  const qismlar = (m.name ?? '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (qismlar[0]) user.fn = [sha(qismlar[0])];
  if (qismlar.length > 1) user.ln = [sha(qismlar[qismlar.length - 1]!)];
  if (m.contactId) user.external_id = [sha(m.contactId)];

  const custom: Record<string, unknown> = { event_source: 'crm', lead_event_source: 'Deal Mind' };
  if (m.sendValue && m.amount && m.amount > 0) {
    custom.value = m.amount;
    custom.currency = m.currency;
  }
  const hodisa = {
    event_name: m.eventName,
    event_time: Math.floor(m.eventTime.getTime() / 1000),
    event_id: m.eventId,
    action_source: 'system_generated',
    user_data: user,
    custom_data: custom,
  };
  let data = JSON.stringify([hodisa]);
  if (leadId) data = data.replace('"__LEAD_ID__"', leadId);
  return { data, matchKeys: kalitlar };
}

/** Meta xatosi — qayta urinishga arziydimi. */
function vaqtinchalik(tur: XatoTuri): boolean {
  return tur === 'transient' || tur === 'rate_limit';
}

// ─── Sozlash ────────────────────────────────────────────────────────────────

export const capiSozlamaSxemasi = z.object({
  datasetId: z.string().trim().regex(/^\d{5,25}$/, 'Dataset (Pixel) ID faqat raqamlardan iborat'),
  /** Yangi token; bo'sh — eskisi qoladi. */
  token: z.string().trim().min(20).max(1000).nullable().optional(),
  testEventCode: z.string().trim().max(40).nullable().optional(),
  enabled: z.boolean().default(true),
});

export const capiQoidaSxemasi = z.object({
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  eventName: z.string().trim().min(2).max(50).regex(/^[A-Za-z][A-Za-z0-9_]*$/, 'Hodisa nomi lotin harflari va raqamlardan'),
  sendValue: z.boolean().default(false),
  currency: z.string().trim().length(3).toUpperCase().default('UZS'),
});

/** Token va dataset'ni Meta'da tekshiradi (hech narsa yubormaydi). */
async function datasetniTekshir(datasetId: string, token: string): Promise<{ ok: true; nom: string | null } | { ok: false; xabar: string }> {
  const r = await graf<{ id?: string; name?: string }>({ yol: `/${datasetId}`, token, params: { fields: 'id,name' }, timeoutMs: 8000 });
  if (!r.ok) {
    const sabab =
      r.tur === 'token_revoked' || r.tur === 'permission'
        ? "Token yaroqsiz yoki bu dataset'ga ruxsati yo'q — Events Manager → Settings → Conversions API → Generate access token"
        : r.tur === 'not_found'
          ? 'Dataset (Pixel) topilmadi — ID ni Events Manager\'dan nusxalang'
          : "Meta'ga ulanib bo'lmadi — keyinroq qayta urinib ko'ring";
    return { ok: false, xabar: `${sabab} (Meta: ${r.xabar})` };
  }
  return { ok: true, nom: r.data.name ?? null };
}

export async function capiSozlamasiniSaqla(businessId: string, userId: string, k: z.infer<typeof capiSozlamaSxemasi>): Promise<void> {
  const [bor] = await withTenant(businessId, (tx) => tx.select().from(metaCapiConfig).limit(1));
  const token = k.token ?? (bor ? decryptSecret(Buffer.from(bor.tokenEncrypted)) : null);
  if (!token) throw new CrmXatosi('yaroqsiz', 'Conversions API tokenini kiriting');
  const t = await datasetniTekshir(k.datasetId, token);
  if (!t.ok) throw new CrmXatosi('yaroqsiz', t.xabar);
  const hozir = new Date();
  const qiymat = {
    datasetId: k.datasetId,
    datasetName: t.nom,
    tokenEncrypted: encryptSecret(token),
    tokenHint: maskSecret(token),
    testEventCode: k.testEventCode || null,
    enabled: k.enabled ? 1 : 0,
    lastCheckAt: hozir,
    lastCheckOk: 1,
    lastError: null,
    updatedBy: userId,
    updatedAt: hozir,
  };
  await withTenant(businessId, (tx) =>
    tx.insert(metaCapiConfig).values({ businessId, ...qiymat }).onConflictDoUpdate({ target: metaCapiConfig.businessId, set: qiymat }),
  );
}

export async function capiniOchir(businessId: string): Promise<void> {
  await withTenant(businessId, (tx) => tx.delete(metaCapiConfig));
}

export async function capiQoidaQosh(businessId: string, userId: string, k: z.infer<typeof capiQoidaSxemasi>): Promise<string> {
  return withTenant(businessId, async (tx) => {
    const [b] = await tx
      .select({ id: crmStage.id })
      .from(crmStage)
      .where(and(eq(crmStage.id, k.stageId), eq(crmStage.pipelineId, k.pipelineId)))
      .limit(1);
    if (!b) throw new CrmXatosi('yaroqsiz', 'Bosqich tanlangan voronkaga tegishli emas');
    const r = await tx
      .insert(metaCapiRule)
      .values({ businessId, pipelineId: k.pipelineId, stageId: k.stageId, eventName: k.eventName, sendValue: k.sendValue ? 1 : 0, currency: k.currency, createdBy: userId })
      .onConflictDoNothing()
      .returning({ id: metaCapiRule.id });
    if (!r.length) throw new CrmXatosi('ziddiyat', 'Bu bosqich uchun shu hodisa allaqachon bor');
    return r[0]!.id;
  });
}

export async function capiQoidaYangila(businessId: string, id: string, k: { active?: boolean; sendValue?: boolean }): Promise<void> {
  const r = await withTenant(businessId, (tx) =>
    tx
      .update(metaCapiRule)
      .set({
        ...(k.active !== undefined ? { active: k.active ? 1 : 0 } : {}),
        ...(k.sendValue !== undefined ? { sendValue: k.sendValue ? 1 : 0 } : {}),
        updatedAt: new Date(),
      })
      .where(eq(metaCapiRule.id, id))
      .returning({ id: metaCapiRule.id }),
  );
  if (!r.length) throw new CrmXatosi('topilmadi', 'Qoida topilmadi');
}

export async function capiQoidaOchir(businessId: string, id: string): Promise<void> {
  const r = await withTenant(businessId, (tx) => tx.delete(metaCapiRule).where(eq(metaCapiRule.id, id)).returning({ id: metaCapiRule.id }));
  if (!r.length) throw new CrmXatosi('topilmadi', 'Qoida topilmadi');
}

/** Karta: sozlama (tokensiz), qoidalar, 30 kunlik holatlar va oxirgi hodisalar. */
export async function capiKorinishi(businessId: string) {
  return withTenant(businessId, async (tx) => {
    const [c] = await tx.select().from(metaCapiConfig).limit(1);
    const qoidalar = await tx
      .select({
        id: metaCapiRule.id,
        pipelineId: metaCapiRule.pipelineId,
        pipelineName: crmPipeline.name,
        stageId: metaCapiRule.stageId,
        stageName: crmStage.name,
        eventName: metaCapiRule.eventName,
        sendValue: metaCapiRule.sendValue,
        currency: metaCapiRule.currency,
        active: metaCapiRule.active,
        createdAt: metaCapiRule.createdAt,
      })
      .from(metaCapiRule)
      .leftJoin(crmPipeline, eq(crmPipeline.id, metaCapiRule.pipelineId))
      .leftJoin(crmStage, eq(crmStage.id, metaCapiRule.stageId))
      .orderBy(metaCapiRule.createdAt);
    const holatlar = await tx
      .select({ status: metaCapiEvent.status, reason: metaCapiEvent.reason, n: sql<number>`count(*)::int` })
      .from(metaCapiEvent)
      .where(sql`${metaCapiEvent.createdAt} > now() - interval '30 days'`)
      .groupBy(metaCapiEvent.status, metaCapiEvent.reason);
    const oxirgi = await tx
      .select({
        id: metaCapiEvent.id,
        dealId: metaCapiEvent.dealId,
        dealName: deal.name,
        eventName: metaCapiEvent.eventName,
        status: metaCapiEvent.status,
        reason: metaCapiEvent.reason,
        attempts: metaCapiEvent.attempts,
        matchKeys: metaCapiEvent.matchKeys,
        testMode: metaCapiEvent.testMode,
        eventTime: metaCapiEvent.eventTime,
        sentAt: metaCapiEvent.sentAt,
      })
      .from(metaCapiEvent)
      .leftJoin(deal, eq(deal.id, metaCapiEvent.dealId))
      .orderBy(desc(metaCapiEvent.createdAt))
      .limit(50);
    return {
      sozlama: c
        ? {
            datasetId: c.datasetId,
            datasetName: c.datasetName,
            tokenHint: c.tokenHint,
            testEventCode: c.testEventCode,
            enabled: c.enabled === 1,
            lastCheckAt: c.lastCheckAt,
            lastCheckOk: c.lastCheckOk === null ? null : c.lastCheckOk === 1,
            lastError: c.lastError,
          }
        : null,
      qoidalar: qoidalar.map((q) => ({ ...q, sendValue: q.sendValue === 1, active: q.active === 1 })),
      holatlar,
      oxirgi: oxirgi.map((o) => ({ ...o, testMode: o.testMode === 1 })),
    };
  });
}

/** O'tkazilgan/yiqilganlarni qayta navbatga (masalan token tuzatilgach). 7 kundan eskisi Meta qabul qilmaydi. */
export async function capiQaytaYubor(businessId: string): Promise<number> {
  const r = await withTenant(businessId, (tx) =>
    tx
      .update(metaCapiEvent)
      .set({ status: 'queued', reason: null, attempts: 0, runAfter: new Date() })
      .where(sql`${metaCapiEvent.status} in ('skipped','failed') and ${metaCapiEvent.reason} <> 'no_contact' and ${metaCapiEvent.eventTime} > now() - interval '7 days'`)
      .returning({ id: metaCapiEvent.id }),
  );
  return r.length;
}

// ─── Navbat (worker) ────────────────────────────────────────────────────────

/**
 * Bosqichga kirishlarni navbatga qo'yadi. Qoidadan OLDINgi kirishlar
 * olinmaydi (tarixni ko'r-ko'rona qayta yubormaslik — amoCRM auditidagi
 * "barcha bitimlarga qo'llash" ehtiyotkorligi). Takror — unikal kalit to'xtatadi.
 */
export async function capiNavbatgaQoy(): Promise<number> {
  const r = await withoutTenantIsolation('Meta CAPI: bosqich hodisalarini navbatga qo\'yish — worker tenantlar ustidan ishlaydi', (tx) =>
    tx.execute(sql`
      insert into meta_capi_event (business_id, rule_id, deal_id, deal_event_id, event_name, event_id, event_time)
      select r.business_id, r.id, e.deal_id, e.id, r.event_name, 'dm.' || e.id || '.' || r.id, e.created_at
      from meta_capi_rule r
      join deal_event e
        on e.business_id = r.business_id
       and e.type in ('stage', 'created')
       and e.created_at >= greatest(r.created_at, now() - interval '7 days')
       and coalesce(e.data->>'toStageId', e.data->>'stageId') = r.stage_id::text
      where r.active = 1
      on conflict (rule_id, deal_event_id) do nothing
      returning id
    `),
  );
  return ((r as { rows?: unknown[] }).rows ?? (r as unknown[])).length;
}

interface Olingan {
  id: string;
  business_id: string;
  rule_id: string | null;
  deal_id: string;
  event_name: string;
  event_id: string;
  event_time: Date;
  attempts: number;
}

/** Navbatdagi hodisalarni Meta'ga yuboradi. */
export async function capiYubor(limit = 20): Promise<{ yuborildi: number; otkazildi: number; xato: number }> {
  const n = { yuborildi: 0, otkazildi: 0, xato: 0 };
  const olingan = await withoutTenantIsolation('Meta CAPI: navbatdan olish — worker tenantlar ustidan ishlaydi', async (tx) => {
    await tx.execute(sql`update meta_capi_event set status = 'queued', locked_at = null where status = 'sending' and locked_at < now() - interval '10 minutes'`);
    const r = await tx.execute(sql`
      update meta_capi_event set status = 'sending', attempts = attempts + 1, locked_at = now()
      where id in (
        select id from meta_capi_event where status = 'queued' and run_after <= now()
        order by created_at limit ${limit} for update skip locked
      )
      returning id, business_id, rule_id, deal_id, event_name, event_id, event_time, attempts
    `);
    return ((r as { rows?: Olingan[] }).rows ?? (r as unknown as Olingan[])) as Olingan[];
  });

  const yakun = (businessId: string, id: string, o: Partial<typeof metaCapiEvent.$inferInsert>) =>
    withTenant(businessId, (tx) => tx.update(metaCapiEvent).set({ lockedAt: null, ...o }).where(eq(metaCapiEvent.id, id)));

  for (const e of olingan) {
    try {
      const m = await withTenant(e.business_id, async (tx) => {
        const [c] = await tx.select().from(metaCapiConfig).limit(1);
        const [q] = e.rule_id ? await tx.select().from(metaCapiRule).where(eq(metaCapiRule.id, e.rule_id)).limit(1) : [];
        const [d] = await tx.select({ amount: deal.amount, contactId: deal.contactId }).from(deal).where(eq(deal.id, e.deal_id)).limit(1);
        const [k] = d?.contactId ? await tx.select({ phone: contact.phone, email: contact.email, name: contact.name }).from(contact).where(eq(contact.id, d.contactId)).limit(1) : [];
        // Meta lead ID — shu bitim qaysi Lead Ads murojaatidan yaratilgan bo'lsa
        const [lid] = await tx
          .select({ leadgenId: sql<string | null>`${crmInbox.payload}->>'leadgenId'` })
          .from(crmInbox)
          .where(and(eq(crmInbox.dealId, e.deal_id), eq(crmInbox.source, 'meta_lead_ads')))
          .limit(1);
        return { c, q, d, k, leadgenId: lid?.leadgenId ?? null };
      });
      if (!m.c) {
        await yakun(e.business_id, e.id, { status: 'skipped', reason: 'not_configured' });
        n.otkazildi++;
        continue;
      }
      if (m.c.enabled !== 1) {
        await yakun(e.business_id, e.id, { status: 'skipped', reason: 'disabled' });
        n.otkazildi++;
        continue;
      }
      const t = capiTanasi({
        eventName: e.event_name,
        eventId: e.event_id,
        eventTime: new Date(e.event_time),
        contactId: m.d?.contactId ?? null,
        phone: m.k?.phone ?? null,
        email: m.k?.email ?? null,
        name: m.k?.name ?? null,
        leadgenId: m.leadgenId,
        amount: m.d?.amount != null ? Number(m.d.amount) : null,
        sendValue: m.q?.sendValue === 1,
        currency: m.q?.currency ?? 'UZS',
      });
      if ('skip' in t) {
        await yakun(e.business_id, e.id, { status: 'skipped', reason: t.skip });
        n.otkazildi++;
        continue;
      }
      const token = decryptSecret(Buffer.from(m.c.tokenEncrypted));
      const r = await graf<{ events_received?: number; fbtrace_id?: string }>({
        yol: `/${m.c.datasetId}/events`,
        token,
        usul: 'POST',
        params: { data: t.data, ...(m.c.testEventCode ? { test_event_code: m.c.testEventCode } : {}) },
        timeoutMs: 15_000,
      });
      if (r.ok) {
        await yakun(e.business_id, e.id, {
          status: 'sent',
          reason: null,
          sentAt: new Date(),
          matchKeys: t.matchKeys,
          eventsReceived: r.data.events_received ?? null,
          fbtraceId: r.data.fbtrace_id ?? null,
          testMode: m.c.testEventCode ? 1 : 0,
        });
        n.yuborildi++;
        continue;
      }
      if (vaqtinchalik(r.tur) && e.attempts < MAX_URINISH) {
        await yakun(e.business_id, e.id, { status: 'queued', reason: r.xabar, matchKeys: t.matchKeys, runAfter: new Date(Date.now() + kutishSoniya(e.attempts, r.tur) * 1000) });
        continue;
      }
      await yakun(e.business_id, e.id, { status: 'failed', reason: r.xabar, matchKeys: t.matchKeys });
      // Token/ruxsat xatosi — kartada ko'rinsin
      if (!vaqtinchalik(r.tur)) {
        await withTenant(e.business_id, (tx) => tx.update(metaCapiConfig).set({ lastCheckAt: new Date(), lastCheckOk: 0, lastError: r.xabar }));
      }
      n.xato++;
    } catch (err) {
      await yakun(e.business_id, e.id, { status: e.attempts < MAX_URINISH ? 'queued' : 'failed', reason: err instanceof Error ? err.message.slice(0, 300) : 'ichki xato', runAfter: new Date(Date.now() + 60_000) }).catch(() => undefined);
      n.xato++;
    }
  }
  return n;
}
