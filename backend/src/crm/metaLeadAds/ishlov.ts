import { randomBytes } from 'node:crypto';
import { and, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { decryptSecret, safeCompare } from '../../crypto/secrets.js';
import { withoutTenantIsolation, withTenant } from '../../db/index.js';
import { crmInbox, crmPipeline, metaLeadgenEvent, metaPageConnection } from '../../db/schema/index.js';
import { kontaktniTopYokiYarat } from '../xizmat.js';
import { graf, type GraphJavob } from './graph.js';
import { metaSozlama } from './sozlama.js';
import {
  formalar,
  formaTanlanganmi,
  imzoTogrimi,
  kutishSoniya,
  leadgenHodisalari,
  lidniMoslash,
  ruxsatKutadimi,
  vaqtinchalikmi,
  XATO_MATNI,
  type LeadgenHodisa,
  type MetaLid,
  type TanlanganForma,
  type XatoTuri,
} from './sof.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META LEAD ADS — webhook qabul qilish va lidni CRM'ga yozish
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   webhook (POST) → imzo (App Secret, xom tana) → har entry/change →
 *   page_id bo'yicha FAOL ulanish → hodisa bazaga (unikal leadgen_id) →
 *   200. Lid ma'lumoti webhook javobini KUTDIRMAYDI.
 *
 *   worker → navbatdan hodisa (SKIP LOCKED) → forma filtri → Graph'dan to'liq
 *   lid → "Saralanmagan"ga (crm_inbox, manba `meta_lead_ads`) → natija.
 *   Vaqtinchalik xato — kutish bilan qayta; token/ruxsat — `auth_wait`
 *   (qayta ulashda davom etadi); qolgani — `failed` ("Qayta ishlash").
 */

export const MANBA = 'meta_lead_ads';
/** Bitta lid qo'lda ulash orqali ham kelishi mumkin (`crm/tarmoq.ts`) — dubl tekshiruvi uchalasida. */
const LID_MANBALARI = ['facebook', 'instagram', MANBA];

// ─── Webhook ─────────────────────────────────────────────────────────────────

export function webhookTasdiq(q: { mode?: string; token?: string; challenge?: string }): string | null {
  const s = metaSozlama();
  if (!s || q.mode !== 'subscribe' || !q.token || !q.challenge || q.challenge.length > 200) return null;
  return safeCompare(s.verifyToken, q.token) ? q.challenge : null;
}

export interface WebhookNatija {
  kod: 200 | 401 | 503;
  saqlandi: number;
  etiborsiz: number;
  takror: number;
  begona: number;
}

/**
 * POST. Hodisa bazaga yozilmasa xato OTILADI (marshrut 500 qaytaradi, Meta
 * 36 soat davomida qayta yuboradi; unikal kalit tufayli dubl bo'lmaydi).
 */
export async function webhookQabul(xom: Buffer, imzo: unknown): Promise<WebhookNatija> {
  const bosh: WebhookNatija = { kod: 200, saqlandi: 0, etiborsiz: 0, takror: 0, begona: 0 };
  const s = metaSozlama();
  if (!s) return { ...bosh, kod: 503 };
  if (!imzoTogrimi(xom, imzo, s.appSecret)) return { ...bosh, kod: 401 };
  let tana: unknown;
  try {
    tana = JSON.parse(xom.toString('utf8'));
  } catch {
    return bosh;
  }
  const hodisalar = leadgenHodisalari(tana);
  if (!hodisalar.length) return bosh;

  const sahifalar = [...new Set(hodisalar.map((h) => h.pageId))];
  const ulanishlar = await withoutTenantIsolation('Meta webhook: page_id bo‘yicha faol ulanish — tenant konteksti yo‘q', (tx) =>
    tx
      .select({ id: metaPageConnection.id, businessId: metaPageConnection.businessId, pageId: metaPageConnection.pageId, forms: metaPageConnection.forms })
      .from(metaPageConnection)
      .where(and(inArray(metaPageConnection.pageId, sahifalar), ne(metaPageConnection.status, 'disconnected'))),
  );

  const natija = { ...bosh };
  for (const c of ulanishlar) {
    const ular = hodisalar.filter((h) => h.pageId === c.pageId);
    await withTenant(c.businessId, async (tx) => {
      for (const h of ular) {
        const tanlangan = formaTanlanganmi(c.forms, h.formId);
        const r = await tx
          .insert(metaLeadgenEvent)
          .values({
            businessId: c.businessId,
            connectionId: c.id,
            pageId: h.pageId,
            leadgenId: h.leadgenId,
            formId: h.formId,
            adId: h.adId,
            adgroupId: h.adgroupId,
            metaCreatedAt: h.createdTime,
            // Tanlanmagan forma — CRM'ga kiritilmaydi, faqat diagnostika uchun qayd
            status: tanlangan ? 'queued' : 'ignored',
            reason: tanlangan ? null : 'form_not_selected',
            processedAt: tanlangan ? null : new Date(),
          })
          .onConflictDoNothing()
          .returning({ id: metaLeadgenEvent.id });
        if (!r.length) natija.takror++;
        else if (tanlangan) natija.saqlandi++;
        else natija.etiborsiz++;
      }
      await tx.update(metaPageConnection).set({ lastEventAt: new Date() }).where(eq(metaPageConnection.id, c.id));
    });
  }
  natija.begona = hodisalar.filter((h) => !ulanishlar.some((c) => c.pageId === h.pageId)).length;
  return natija;
}

// ─── Bitta hodisani ishlash (portlar orqali — testda bazasiz) ────────────────

export interface UlanishMalumoti {
  status: string;
  pageId: string;
  pageName: string | null;
  forms: TanlanganForma[];
  pipelineId: string | null;
  token: string | null;
}

export interface MurojaatKirish {
  businessId: string;
  leadgenId: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  pipelineId: string | null;
  payload: Record<string, unknown>;
}

export interface IshlovPortlari {
  ulanish(businessId: string, connectionId: string): Promise<UlanishMalumoti | null>;
  lidniOl(token: string, leadgenId: string): Promise<GraphJavob<MetaLid>>;
  /** Reklama/kampaniya nomlari — ixtiyoriy (ruxsat bo'lmasa null). */
  reklamaNomlari(token: string, leadgenId: string): Promise<{ adName?: string; adsetName?: string; campaignName?: string } | null>;
  /** Idempotent: shu leadgen uchun murojaat bo'lsa — yangisi yaratilmaydi. */
  murojaatYoz(k: MurojaatKirish): Promise<{ inboxId: string | null; takror: boolean }>;
}

export type IshlovNatija =
  | { holat: 'done'; inboxId: string }
  | { holat: 'duplicate'; inboxId: string | null }
  | { holat: 'ignored'; sabab: 'form_not_selected' | 'disconnected' }
  | { holat: 'retry' | 'auth_wait' | 'failed'; tur: XatoTuri; xabar: string };

export interface IshlovHodisasi extends Pick<LeadgenHodisa, 'leadgenId' | 'formId' | 'adId' | 'adgroupId'> {
  businessId: string;
  connectionId: string;
}

export async function hodisaniIshla(h: IshlovHodisasi, p: IshlovPortlari): Promise<IshlovNatija> {
  const c = await p.ulanish(h.businessId, h.connectionId);
  if (!c || c.status === 'disconnected') return { holat: 'ignored', sabab: 'disconnected' };
  // Backend filtri (ingest'da ham bor — sozlama keyin o'zgargan bo'lishi mumkin)
  if (!formaTanlanganmi(c.forms, h.formId)) return { holat: 'ignored', sabab: 'form_not_selected' };
  if (!c.token) return { holat: 'auth_wait', tur: 'token_revoked', xabar: XATO_MATNI.token_revoked };

  const r = await p.lidniOl(c.token, h.leadgenId);
  if (!r.ok) {
    const holat = vaqtinchalikmi(r.tur) ? 'retry' : ruxsatKutadimi(r.tur) ? 'auth_wait' : 'failed';
    return { holat, tur: r.tur, xabar: `${XATO_MATNI[r.tur]} (Meta: ${r.xabar})` };
  }
  const lid = r.data;
  // Webhook'dagi forma bilan Graph'dagisi farq qilsa — Graph'niki haqiqiy
  if (lid.form_id && lid.form_id !== h.formId && !formaTanlanganmi(c.forms, lid.form_id)) return { holat: 'ignored', sabab: 'form_not_selected' };

  const formId = lid.form_id ?? h.formId;
  const forma = c.forms.find((f) => f.id === formId) ?? null;
  const nomlar = await p.reklamaNomlari(c.token, h.leadgenId).catch(() => null);
  const reklamaNomi = [nomlar?.campaignName, nomlar?.adsetName, nomlar?.adName].filter(Boolean).join(' / ') || null;
  const m = lidniMoslash(lid, { formaNomi: forma?.name ?? null, reklamaNomi });

  const yozildi = await p.murojaatYoz({
    businessId: h.businessId,
    leadgenId: h.leadgenId,
    name: m.name,
    phone: m.phone,
    email: m.email,
    message: m.message,
    pipelineId: c.pipelineId,
    payload: {
      // `channel` — joylashuv ma'lum bo'lsagina; aks holda taxmin qilinmaydi
      channel: m.platform,
      type: 'lead_ad',
      provider: MANBA,
      leadgenId: h.leadgenId,
      pageId: c.pageId,
      pageName: c.pageName,
      formId,
      leadForm: forma?.name ?? null,
      adId: lid.ad_id ?? h.adId ?? null,
      adgroupId: h.adgroupId ?? null,
      adsetId: lid.adset_id ?? null,
      campaignId: lid.campaign_id ?? null,
      adName: nomlar?.adName ?? null,
      adsetName: nomlar?.adsetName ?? null,
      campaignName: nomlar?.campaignName ?? null,
      platform: m.platform,
      organic: typeof lid.is_organic === 'boolean' ? lid.is_organic : null,
      createdTime: lid.created_time ?? null,
      values: m.javoblar,
    },
  });
  if (yozildi.takror || !yozildi.inboxId) return { holat: 'duplicate', inboxId: yozildi.inboxId };
  return { holat: 'done', inboxId: yozildi.inboxId };
}

// ─── Bazadagi portlar ────────────────────────────────────────────────────────

const LID_MAYDONLARI = 'id,created_time,field_data,form_id,ad_id,adset_id,campaign_id,platform,is_organic';

export function bazaPortlari(): IshlovPortlari {
  const appSecret = () => metaSozlama()?.appSecret ?? null;
  return {
    async ulanish(businessId, connectionId) {
      const [c] = await withTenant(businessId, (tx) => tx.select().from(metaPageConnection).where(eq(metaPageConnection.id, connectionId)).limit(1));
      if (!c) return null;
      let token: string | null = null;
      try {
        token = c.pageTokenEncrypted ? decryptSecret(c.pageTokenEncrypted) : null;
      } catch {
        token = null;
      }
      return { status: c.status, pageId: c.pageId, pageName: c.pageName, forms: formalar(c.forms), pipelineId: c.pipelineId, token };
    },
    lidniOl: (token, leadgenId) => graf<MetaLid>({ yol: `/${leadgenId}`, token, appSecret: appSecret(), params: { fields: LID_MAYDONLARI }, kontekst: 'lid' }),
    async reklamaNomlari(token, leadgenId) {
      const r = await graf<{ ad_name?: string; adset_name?: string; campaign_name?: string }>({
        yol: `/${leadgenId}`,
        token,
        appSecret: appSecret(),
        params: { fields: 'ad_name,adset_name,campaign_name' },
        timeoutMs: 5000,
      });
      return r.ok ? { adName: r.data.ad_name, adsetName: r.data.adset_name, campaignName: r.data.campaign_name } : null;
    },
    murojaatYoz: (k) =>
      withTenant(k.businessId, async (tx) => {
        const externalId = `lead:${k.leadgenId}`;
        // Qo'lda ulash yo'li bilan BIR XIL qulf kaliti — ikki yo'l bir vaqtda kelsa ham bitta murojaat
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`tarmoq:${k.businessId}:${externalId}`}, 0))`);
        const [bor] = await tx
          .select({ id: crmInbox.id })
          .from(crmInbox)
          .where(and(inArray(crmInbox.source, LID_MANBALARI), eq(crmInbox.externalId, externalId)))
          .limit(1);
        if (bor) return { inboxId: bor.id, takror: true };
        let pipelineId: string | null = null;
        if (k.pipelineId) {
          const [v] = await tx.select({ id: crmPipeline.id }).from(crmPipeline).where(eq(crmPipeline.id, k.pipelineId)).limit(1);
          pipelineId = v?.id ?? null;
        }
        // Telefonsiz kontakt yaratilmaydi (qo'lda ulash bilan bir xil qoida) — qabul qilinganda ism bilan yaratiladi
        const contactId = k.phone ? await kontaktniTopYokiYarat(tx, k.businessId, { name: k.name, phone: k.phone, email: k.email }) : null;
        const r = await tx
          .insert(crmInbox)
          .values({
            businessId: k.businessId,
            source: MANBA,
            externalId,
            name: k.name,
            phone: k.phone,
            email: k.email,
            message: k.message,
            contactId,
            pipelineId,
            payload: k.payload,
          })
          .onConflictDoNothing()
          .returning({ id: crmInbox.id });
        return r.length ? { inboxId: r[0]!.id, takror: false } : { inboxId: null, takror: true };
      }),
  };
}

// ─── Navbat (worker) ─────────────────────────────────────────────────────────

const workerId = `meta-${randomBytes(4).toString('hex')}`;

interface OlinganHodisa {
  id: string;
  business_id: string;
  connection_id: string;
  leadgen_id: string;
  form_id: string | null;
  ad_id: string | null;
  adgroup_id: string | null;
  attempts: number;
  max_attempts: number;
}

const qatorlar = <T>(r: unknown): T[] => ((r as { rows?: T[] }).rows ?? (r as T[])) as T[];

async function hodisalarniOl(limit: number): Promise<OlinganHodisa[]> {
  return withoutTenantIsolation('Meta navbat: hodisalarni olish — worker tenantlar ustidan ishlaydi', async (tx) => {
    // 10 daqiqa "processing"da qolgan — o'lik worker belgisi
    await tx
      .update(metaLeadgenEvent)
      .set({ status: 'queued', lockedAt: null, lockedBy: null })
      .where(and(eq(metaLeadgenEvent.status, 'processing'), lt(metaLeadgenEvent.lockedAt, new Date(Date.now() - 10 * 60_000))));
    const r = await tx.execute(sql`
      update meta_leadgen_event set status = 'processing', attempts = attempts + 1, locked_at = now(), locked_by = ${workerId}
      where id in (
        select id from meta_leadgen_event
        where status = 'queued' and run_after <= now()
        order by received_at
        limit ${limit}
        for update skip locked
      )
      returning id, business_id, connection_id, leadgen_id, form_id, ad_id, adgroup_id, attempts, max_attempts
    `);
    return qatorlar<OlinganHodisa>(r);
  });
}

const XATO_KODI: Record<XatoTuri, string> = {
  token_revoked: 'token_revoked',
  permission: 'permission',
  leads_access: 'leads_access',
  not_found: 'page_not_found',
  rate_limit: 'rate_limit',
  transient: 'network',
  unknown: 'unknown',
};

async function natijaniYoz(h: OlinganHodisa, n: IshlovNatija): Promise<void> {
  await withTenant(h.business_id, async (tx) => {
    const hozir = new Date();
    if (n.holat === 'done' || n.holat === 'duplicate') {
      await tx
        .update(metaLeadgenEvent)
        .set({ status: n.holat, inboxId: n.inboxId, processedAt: hozir, lockedAt: null, lockedBy: null, lastError: null })
        .where(eq(metaLeadgenEvent.id, h.id));
      if (n.holat === 'done') {
        // Lid o'qildi — token ishlayapti: oldingi token/ruxsat xatosi endi haqiqiy emas
        await tx
          .update(metaPageConnection)
          .set({
            lastLeadAt: hozir,
            firstLeadAt: sql`coalesce(${metaPageConnection.firstLeadAt}, ${hozir})`,
            status: sql`case when ${metaPageConnection.status} = 'error' then 'active' else ${metaPageConnection.status} end`,
            lastErrorCode: null,
            lastError: null,
            lastErrorAt: null,
            updatedAt: hozir,
          })
          .where(and(eq(metaPageConnection.id, h.connection_id), ne(metaPageConnection.status, 'disconnected')));
      }
      return;
    }
    if (n.holat === 'ignored') {
      await tx
        .update(metaLeadgenEvent)
        .set({ status: 'ignored', reason: n.sabab, processedAt: hozir, lockedAt: null, lockedBy: null })
        .where(eq(metaLeadgenEvent.id, h.id));
      return;
    }
    const tugadi = n.holat === 'retry' && h.attempts >= h.max_attempts;
    const holat = tugadi ? 'failed' : n.holat === 'retry' ? 'queued' : n.holat;
    await tx
      .update(metaLeadgenEvent)
      .set({
        status: holat,
        reason: holat === 'queued' ? null : XATO_KODI[n.tur],
        lastError: n.xabar.slice(0, 500),
        runAfter: new Date(hozir.getTime() + kutishSoniya(h.attempts, n.tur) * 1000),
        processedAt: holat === 'queued' ? null : hozir,
        lockedAt: null,
        lockedBy: null,
      })
      .where(eq(metaLeadgenEvent.id, h.id));
    await tx
      .update(metaPageConnection)
      .set({
        // Token/ruxsat muammosi — ulanish xato holatida ("Qayta ulash"); vaqtinchalik xato holatni o'zgartirmaydi
        ...(n.holat === 'auth_wait' ? { status: 'error' } : {}),
        lastErrorCode: XATO_KODI[n.tur],
        lastError: XATO_MATNI[n.tur],
        lastErrorAt: hozir,
        updatedAt: hozir,
      })
      .where(and(eq(metaPageConnection.id, h.connection_id), ne(metaPageConnection.status, 'disconnected')));
  });
}

let band = false;

/**
 * Navbatdagi hodisalarni ishlaydi. Bir jarayonda bir vaqtda bitta sikl;
 * ko'p nusxada ham `SKIP LOCKED` bitta hodisani ikki marta bermaydi.
 */
export async function metaLidlariniIshla(portlar: IshlovPortlari = bazaPortlari(), limit = 20) {
  const son = { done: 0, duplicate: 0, ignored: 0, retry: 0, authWait: 0, failed: 0 };
  if (band || !metaSozlama()) return son;
  band = true;
  try {
    const hodisalar = await hodisalarniOl(limit);
    for (const h of hodisalar) {
      let n: IshlovNatija;
      try {
        n = await hodisaniIshla(
          { businessId: h.business_id, connectionId: h.connection_id, leadgenId: h.leadgen_id, formId: h.form_id, adId: h.ad_id, adgroupId: h.adgroup_id },
          portlar,
        );
      } catch (err) {
        // Baza yoki kutilmagan xato — hodisa yo'qolmaydi, kutish bilan qayta
        n = { holat: 'retry', tur: 'unknown', xabar: `Ichki xato: ${(err as Error).message}`.slice(0, 300) };
      }
      await natijaniYoz(h, n);
      if (n.holat === 'done') son.done++;
      else if (n.holat === 'duplicate') son.duplicate++;
      else if (n.holat === 'ignored') son.ignored++;
      else if (n.holat === 'retry') son.retry++;
      else if (n.holat === 'auth_wait') son.authWait++;
      else son.failed++;
    }
    return son;
  } finally {
    band = false;
  }
}

/** Webhook'dan keyin kutmasdan ishlashni boshlash (worker siklini kutmay). */
export function tezIshla(log: (obj: unknown, msg: string) => void): void {
  void metaLidlariniIshla()
    .then((r) => {
      if (r.done || r.failed || r.authWait) log(r, 'meta lead ads: hodisalar ishlandi');
    })
    .catch((err: unknown) => log({ err }, 'meta lead ads: ishlashda xato'));
}
