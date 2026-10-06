import { createHmac } from 'node:crypto';
import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { decryptSecret } from '../crypto/secrets.js';
import { withoutTenantIsolation } from '../db/index.js';
import { business, conversation, contact, integration, seat, task } from '../db/schema/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VAZIFALARNI CRM GA YUBORISH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NEGA WEBHOOK, amoCRM/Bitrix24 ga TO'G'RIDAN-TO'G'RI ULANISH EMAS
 * ─────────────────────────────────────────────────────────────────────
 * Har CRM uchun alohida OAuth oqimi, token yangilash, voronka/maydon
 * xaritalash va o'z API cheklovlari kerak — bu har biri uchun alohida,
 * uzoq muddatli ish. Undan ham muhimi: mijozlarning CRM sozlamalari
 * bir-biriga o'xshamaydi (qaysi voronka, qaysi maydon, kim mas'ul), ya'ni
 * "ulab qo'ydik" degan tugma baribir qo'lda sozlashni talab qilardi.
 *
 * Imzolangan webhook esa bugun ishlaydi va uchala yo'lni ochadi:
 *   • amoCRM / Bitrix24 — ularning kiruvchi webhook manzili;
 *   • n8n / Make — o'rtada turib istalgan CRM ga moslaydi;
 *   • mijozning o'z backendi.
 *
 * XAVFSIZLIK
 * ──────────
 * Har so'rov HMAC-SHA256 bilan imzolanadi (`X-Sotuv-Signature`). Qabul
 * qiluvchi imzoni tekshirmasa, uning manzilini bilgan har kim soxta
 * vazifa yuborishi mumkin — shuning uchun sir MAJBURIY va u
 * `credentials_encrypted` da shifrlangan holda yotadi.
 *
 * Imzo `timestamp.body` ustidan hisoblanadi: faqat tana ustidan
 * hisoblansa, eski so'rovni ushlab olib qayta yuborish (replay) mumkin
 * bo'lardi.
 */

/** Bir tikda ko'pi bilan shuncha vazifa yuboriladi. */
const TIK_LIMITI = 20;

/** Sekin qabul qiluvchi butun tikni ushlab turmasin. */
const TIMEOUT_MS = 10_000;

export const crmExportConfigSchema = z
  .object({
    /** Yoqilmagan bo'lsa dispetcher bu biznesga umuman tegmaydi. */
    exportTasks: z.boolean().default(false),
    url: z.string().url().max(500).nullable().default(null),
    /** Sir o'rnatilganmi — qiymatning o'zi hech qachon qaytarilmaydi. */
    hasSecret: z.boolean().default(false),
  })
  .default({});

export type CrmExportConfig = z.infer<typeof crmExportConfigSchema>;

export interface ExportResult {
  sent: number;
  failed: number;
  skipped: number;
}

/** Qabul qiluvchi ko'radigan tana. */
export interface TaskPayload {
  event: 'task.created';
  task: {
    id: string;
    title: string;
    description: string | null;
    action: string | null;
    source: string;
    status: string;
    dueAt: string | null;
    createdAt: string;
  };
  seat: { id: string; name: string } | null;
  contact: { id: string; name: string | null; phone: string | null } | null;
  conversationId: string | null;
  business: { id: string; name: string };
}

/**
 * Imzo sarlavhalari.
 *
 * Eksport qilingan: qabul qiluvchi tomonni yozayotgan odam (yoki bizning
 * hujjatimiz) xuddi shu funksiyani ishlatib tekshira olishi kerak. Imzo
 * mantiqi ikki joyda takrorlansa, biri o'zgarganda ikkinchisi jim
 * ravishda mos kelmay qolardi.
 */
export function imzoSarlavhalari(
  sir: string,
  tana: string,
  vaqt = Date.now(),
): Record<string, string> {
  const ts = String(Math.floor(vaqt / 1000));
  const imzo = createHmac('sha256', sir).update(`${ts}.${tana}`).digest('hex');
  return {
    'content-type': 'application/json',
    'x-sotuv-timestamp': ts,
    'x-sotuv-signature': `v1=${imzo}`,
  };
}

/**
 * Yuborilmagan vazifalarni tarqatadi.
 *
 * ATAYLAB otilmaydi — bitta biznesning ishlamayotgan manzili qolgan
 * bizneslarning eksportini to'xtatmasligi kerak.
 */
export async function dispatchTaskExports(): Promise<ExportResult> {
  const natija: ExportResult = { sent: 0, failed: 0, skipped: 0 };

  const kutayotganlar = await withoutTenantIsolation(
    'CRM eksporti: barcha bizneslar bo\'ylab yuborilmagan vazifalar',
    (tx) =>
      tx
        .select({
          id: task.id,
          businessId: task.businessId,
          title: task.title,
          description: task.description,
          action: task.action,
          source: task.source,
          status: task.status,
          dueAt: task.dueAt,
          createdAt: task.createdAt,
          conversationId: task.conversationId,
          seatId: task.seatId,
          seatName: seat.displayName,
          contactId: conversation.contactId,
          businessName: business.name,
        })
        .from(task)
        .innerJoin(business, eq(business.id, task.businessId))
        .leftJoin(seat, eq(seat.id, task.seatId))
        .leftJoin(conversation, eq(conversation.id, task.conversationId))
        .where(and(isNull(task.exportedAt), isNull(business.deletedAt)))
        .orderBy(asc(task.createdAt))
        .limit(TIK_LIMITI),
  );

  if (kutayotganlar.length === 0) return natija;

  /**
   * Integratsiyalarni BITTA so'rovda olamiz.
   *
   * Ilgari sikl ichida biznes boshiga bitta so'rov bor edi (N+1):
   * 20 ta vazifa 20 xil biznesdan kelsa — 20 ta alohida tranzaksiya.
   * `inArray` bilan bu bitta so'rov va biznes soni ta'sir qilmaydi.
   */
  const biznesIdlar = [...new Set(kutayotganlar.map((t) => t.businessId))];
  const manzillar = new Map<string, { url: string; secret: string }>();

  const integratsiyalar = await withoutTenantIsolation(
    'CRM eksporti: bizneslarning webhook integratsiyalari',
    (tx) =>
      tx
        .select({
          businessId: integration.businessId,
          config: integration.config,
          credentials: integration.credentialsEncrypted,
          status: integration.status,
          syncEnabled: integration.syncEnabled,
        })
        .from(integration)
        .where(
          and(
            inArray(integration.businessId, biznesIdlar),
            eq(integration.kind, 'generic_webhook'),
          ),
        ),
  );

  for (const row of integratsiyalar) {
    if (row.status !== 'connected' || !row.syncEnabled || !row.credentials) continue;

    const cfg = crmExportConfigSchema.parse(
      (row.config as Record<string, unknown>)?.crmExport ?? {},
    );
    if (!cfg.exportTasks || !cfg.url) continue;

    try {
      manzillar.set(row.businessId, {
        url: cfg.url,
        secret: decryptSecret(row.credentials),
      });
    } catch {
      // Kalit almashgan yoki yozuv buzilgan — bu biznes uchun eksport
      // yo'q, lekin qolganlari ishlashda davom etadi.
      continue;
    }
  }
  // Kontakt ma'lumoti faqat kerak bo'lganda o'qiladi.
  const kontaktIdlar = [
    ...new Set(kutayotganlar.map((t) => t.contactId).filter((v): v is string => Boolean(v))),
  ];
  const kontaktlar = new Map<string, { name: string | null; phone: string | null }>();
  if (kontaktIdlar.length > 0) {
    const rows = await withoutTenantIsolation('CRM eksporti: kontaktlar', (tx) =>
      tx
        .select({ id: contact.id, name: contact.name, phone: contact.phone })
        .from(contact)
        .where(inArray(contact.id, kontaktIdlar)),
    );
    for (const r of rows) kontaktlar.set(r.id, { name: r.name, phone: r.phone });
  }

  for (const t of kutayotganlar) {
    const manzil = manzillar.get(t.businessId);

    if (!manzil) {
      // Eksport yoqilmagan — bu XATO EMAS. Belgilab qo'yamiz, aks holda
      // har tikda qayta ko'rib chiqilardi va navbat tiqilib qolardi.
      natija.skipped++;
      await belgila(t.id, null);
      continue;
    }

    const k = t.contactId ? kontaktlar.get(t.contactId) : undefined;
    const payload: TaskPayload = {
      event: 'task.created',
      task: {
        id: t.id,
        title: t.title,
        description: t.description,
        action: t.action,
        source: t.source,
        status: t.status,
        dueAt: t.dueAt ? t.dueAt.toISOString() : null,
        createdAt: t.createdAt.toISOString(),
      },
      seat: t.seatId ? { id: t.seatId, name: t.seatName ?? '' } : null,
      contact: t.contactId
        ? { id: t.contactId, name: k?.name ?? null, phone: k?.phone ?? null }
        : null,
      conversationId: t.conversationId,
      business: { id: t.businessId, name: t.businessName },
    };

    const tana = JSON.stringify(payload);
    const xato = await yubor(manzil.url, manzil.secret, tana);
    if (xato === null) natija.sent++;
    else natija.failed++;
    await belgila(t.id, xato);
  }

  return natija;
}

/** Xato bo'lsa uning matnini, aks holda `null` qaytaradi. */
async function yubor(url: string, sir: string, tana: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: imzoSarlavhalari(sir, tana),
      body: tana,
      signal: controller.signal,
    });
    if (!res.ok) {
      const matn = (await res.text()).slice(0, 200);
      return `HTTP ${res.status}: ${matn}`;
    }
    return null;
  } catch (err) {
    const m = err instanceof Error ? err.message : String(err);
    return m === 'The operation was aborted.' ? 'vaqt tugadi' : m;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Yuborilgan deb belgilaydi.
 *
 * Muvaffaqiyatsiz bo'lsa ham belgilanadi va xato saqlanadi: qayta
 * urinish eng ko'p uchraydigan sabablarni (noto'g'ri manzil, o'chirilgan
 * webhook) hal qilmaydi, faqat navbatni tiqib qo'yardi. Xato interfeysda
 * ko'rinadi va odam uni tuzatgach qayta yuborishi mumkin.
 */
async function belgila(taskId: string, xato: string | null): Promise<void> {
  await withoutTenantIsolation('CRM eksporti: yuborilgan deb belgilash', (tx) =>
    tx
      .update(task)
      .set({ exportedAt: new Date(), exportError: xato })
      .where(eq(task.id, taskId)),
  );
}
