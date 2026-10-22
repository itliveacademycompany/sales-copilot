import { and, asc, eq, gte, inArray, isNull, or, sql } from 'drizzle-orm';
import { withoutTenantIsolation, withTenant, type Tx } from '../../db/index.js';
import {
  analysis,
  business,
  contact,
  conversation,
  crmSyncItem,
  integration,
  seat,
  task,
} from '../../db/schema/index.js';
import { frontendUrl } from '../../http/tenant.js';
import { CrmXato, type CrmKontekst, type CrmYozuv } from './adapter.js';
import { ADAPTERLAR, CRM_TURLARI, sozlamaniOl } from './index.js';
import { kontekstQur } from './kontekst.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM GA YOZISH — tahlildan keyin izoh va vazifa (worker tiki)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * OQIM (har ulangan CRM uchun, har 20 soniyada)
 * ─────────────────────────────────────────────
 *   1. Tahlil qilingan, hali CRM ga yozilmagan qo'ng'iroqlar olinadi.
 *   2. Mijoz telefoni bo'yicha CRM dan ochiq sdelka (bo'lmasa kontakt)
 *      topiladi va unga izoh yoziladi: baho, xulosa, kamchilik, keyingi
 *      qadam va SotuvAI dagi havola.
 *   3. Shu qo'ng'iroqdan chiqqan SotuvAI vazifalari CRM da vazifa bo'lib
 *      yaratiladi — mas'ul sdelkaning mas'uli.
 *
 * KAFOLATLAR
 * ──────────
 * • Har yozuv `crm_sync_item` da qayd etiladi (unikal kalit) — bitta
 *   qo'ng'iroqqa ikki izoh tushmaydi, hatto worker ikki nusxada ishlasa ham.
 * • Tashqi HTTP tranzaksiyadan TASHQARIDA: CRM sekin javob bersa baza
 *   qulflanmaydi.
 * • Vaqtinchalik xato (tarmoq, limit) — keyinroq qayta uriniladi (5 marta,
 *   oraliq oshib boradi). Doimiy xato (token bekor qilingan) — ulanish
 *   `error` holatiga o'tadi va CRM sahifasida qizil ko'rinadi; to'xtatiladi.
 * • Faqat ulangandan KEYIN tahlil qilingan qo'ng'iroqlar (`boshlanish`).
 */

/** Bir tikda bitta ulanish uchun ko'pi bilan shuncha qo'ng'iroq / vazifa. */
const TIK_LIMITI = 10;
const MAKS_URINISH = 5;

export interface YozishNatija {
  yozildi: number;
  otkazildi: number;
  xato: number;
}

// ─── Izoh matni ──────────────────────────────────────────────────────────────

type Til = 'uz' | 'ru' | 'en';

const SOZ: Record<Til, Record<string, string>> = {
  uz: {
    sarlavha: "SotuvAI · qo'ng'iroq tahlili",
    menejer: 'Menejer',
    baho: 'Baho',
    xulosa: 'Xulosa',
    kamchilik: 'Asosiy kamchilik',
    keyingi: 'Keyingi qadam',
    batafsil: 'Batafsil',
    baholanmadi: 'baholanmadi',
  },
  ru: {
    sarlavha: 'SotuvAI · анализ звонка',
    menejer: 'Менеджер',
    baho: 'Оценка',
    xulosa: 'Итог',
    kamchilik: 'Главная ошибка',
    keyingi: 'Следующий шаг',
    batafsil: 'Подробнее',
    baholanmadi: 'не оценивался',
  },
  en: {
    sarlavha: 'SotuvAI · call analysis',
    menejer: 'Manager',
    baho: 'Score',
    xulosa: 'Summary',
    kamchilik: 'Main gap',
    keyingi: 'Next step',
    batafsil: 'Details',
    baholanmadi: 'not scored',
  },
};

export interface IzohMalumot {
  til: string;
  timezone: string;
  boshlandi: Date;
  davomiylikSoniya: number | null;
  menejer: string | null;
  baho: number | null;
  xulosa: string | null;
  kamchilik: string | null;
  keyingi: string[];
  havola: string;
}

function davomiylik(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.round(s % 60)).padStart(2, '0')}`;
}

/** CRM ga yoziladigan izoh — oddiy matn (amoCRM va Bitrix24 ikkalasi ham ko'rsatadi). */
export function izohMatni(d: IzohMalumot): string {
  const til: Til = d.til === 'ru' || d.til === 'en' ? d.til : 'uz';
  const w = SOZ[til];
  let sana: string;
  try {
    sana = new Intl.DateTimeFormat('ru-RU', {
      timeZone: d.timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(d.boshlandi);
  } catch {
    sana = d.boshlandi.toISOString().slice(0, 16).replace('T', ' ');
  }

  const qatorlar = [
    w.sarlavha!,
    [sana, d.davomiylikSoniya ? davomiylik(d.davomiylikSoniya) : null, d.menejer ? `${w.menejer}: ${d.menejer}` : null]
      .filter(Boolean)
      .join(' · '),
    '',
    `${w.baho}: ${d.baho === null ? w.baholanmadi : `${Math.round(d.baho)}/100`}`,
  ];
  if (d.xulosa) qatorlar.push(`${w.xulosa}: ${d.xulosa.trim()}`);
  if (d.kamchilik) qatorlar.push(`${w.kamchilik}: ${d.kamchilik.trim()}`);
  if (d.keyingi.length > 0) qatorlar.push(`${w.keyingi}: ${d.keyingi.map((k) => k.trim()).join('; ')}`);
  qatorlar.push('', `${w.batafsil}: ${d.havola}`);
  return qatorlar.join('\n').slice(0, 4000);
}

// ─── Yordamchilar ────────────────────────────────────────────────────────────

/** Qayta urinish oralig'i: 1-xatodan keyin 2 daq, keyin 8, 18, 32… */
function qaytaUrinishShart() {
  return or(
    isNull(crmSyncItem.id),
    and(
      eq(crmSyncItem.status, 'error'),
      sql`${crmSyncItem.attempts} < ${MAKS_URINISH}`,
      sql`${crmSyncItem.updatedAt} < now() - (${crmSyncItem.attempts} * ${crmSyncItem.attempts} * interval '2 minutes')`,
    ),
  );
}

export interface Qayd {
  businessId: string;
  integrationId: string;
  kind: 'amocrm' | 'bitrix24';
  entity: 'conversation' | 'task';
  localId: string;
  status: 'ok' | 'skipped' | 'error';
  yozuv?: CrmYozuv | null;
  recordId?: string | null;
  error?: string | null;
}

/** Qaydni yozadi (bor bo'lsa yangilaydi). Alohida — testda haqiqiy SQL sinaladi. */
export function qaydSorovi(tx: Tx, q: Qayd) {
  const qiymat = {
    status: q.status,
    crmEntity: q.yozuv?.tur ?? null,
    crmEntityId: q.yozuv?.id ?? null,
    crmEntityName: q.yozuv?.nom ?? null,
    crmUrl: q.yozuv?.url ?? null,
    crmResponsibleId: q.yozuv?.masulId ?? null,
    crmRecordId: q.recordId ?? null,
    error: q.error ? q.error.slice(0, 500) : null,
    updatedAt: new Date(),
  };
  return tx
    .insert(crmSyncItem)
    .values({
      businessId: q.businessId,
      integrationId: q.integrationId,
      kind: q.kind,
      entity: q.entity,
      localId: q.localId,
      attempts: q.status === 'error' ? 1 : 0,
      ...qiymat,
    })
    .onConflictDoUpdate({
      target: [crmSyncItem.integrationId, crmSyncItem.entity, crmSyncItem.localId],
      set: {
        ...qiymat,
        attempts: q.status === 'error' ? sql`${crmSyncItem.attempts} + 1` : crmSyncItem.attempts,
      },
    });
}

async function qaydEt(q: Qayd): Promise<void> {
  await withTenant(q.businessId, (tx) => qaydSorovi(tx, q));
}

/** Doimiy xato — ulanishni `error` ga o'tkazadi (CRM sahifasida qizil). */
async function ulanishniBuz(businessId: string, integrationId: string, xabar: string): Promise<void> {
  await withTenant(businessId, (tx) =>
    tx
      .update(integration)
      .set({
        status: 'error',
        lastError: xabar,
        lastSyncStatus: 'error',
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(integration.id, integrationId)),
  );
}

function xatoMatni(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ─── Asosiy tik ──────────────────────────────────────────────────────────────

export async function dispatchCrmWriteback(): Promise<YozishNatija> {
  const natija: YozishNatija = { yozildi: 0, otkazildi: 0, xato: 0 };

  const ulanishlar = await withoutTenantIsolation('CRM yozish: ulangan CRM lar', (tx) =>
    tx
      .select({
        id: integration.id,
        businessId: integration.businessId,
        kind: integration.kind,
        config: integration.config,
        creds: integration.credentialsEncrypted,
        slug: business.slug,
        locale: business.locale,
        timezone: business.timezone,
      })
      .from(integration)
      .innerJoin(business, eq(business.id, integration.businessId))
      .where(
        and(
          inArray(integration.kind, CRM_TURLARI),
          eq(integration.status, 'connected'),
          eq(integration.syncEnabled, true),
          isNull(business.deletedAt),
          isNull(business.suspendedAt),
        ),
      ),
  );

  for (const u of ulanishlar) {
    const kind = u.kind as 'amocrm' | 'bitrix24';
    const adapter = ADAPTERLAR[kind];
    const sozlama = sozlamaniOl(u.config);
    if (!adapter || !u.creds || (!sozlama.izoh && !sozlama.vazifa)) continue;

    const ctx = kontekstQur({ id: u.id, businessId: u.businessId, config: u.config, creds: u.creds });
    if (!ctx) continue;
    const boshlanish = sozlama.boshlanish ? new Date(sozlama.boshlanish) : new Date(0);
    const asosiy = { businessId: u.businessId, integrationId: u.id, kind };

    try {
      await qongiroqlarniYoz(u, adapter, ctx, sozlama.izoh, boshlanish, asosiy, natija);
      if (sozlama.vazifa) await vazifalarniYoz(adapter, ctx, boshlanish, asosiy, natija);
    } catch (err) {
      // Doimiy xato (token bekor qilingan va h.k.) — shu ulanish to'xtatiladi
      if (err instanceof CrmXato && err.doimiy) {
        await ulanishniBuz(u.businessId, u.id, err.message);
        natija.xato++;
        continue;
      }
      throw err;
    }
  }
  return natija;
}

/** CRM ga yozilishi kerak bo'lgan tahlil qilingan qo'ng'iroqlar (yoki qayta urinish vaqti kelganlari). */
export function suhbatlarSorovi(tx: Tx, integrationId: string, boshlanish: Date) {
  return tx
    .select({
      id: conversation.id,
      startedAt: conversation.startedAt,
      durationSeconds: conversation.durationSeconds,
      telefon: contact.phone,
      menejer: seat.displayName,
      baho: analysis.overallScore,
      xulosa: analysis.summary,
      kamchilik: analysis.primaryGap,
    })
    .from(analysis)
    .innerJoin(conversation, eq(conversation.id, analysis.conversationId))
    .leftJoin(contact, eq(contact.id, conversation.contactId))
    .leftJoin(seat, eq(seat.id, conversation.seatId))
    .leftJoin(
      crmSyncItem,
      and(
        eq(crmSyncItem.integrationId, integrationId),
        eq(crmSyncItem.entity, 'conversation'),
        eq(crmSyncItem.localId, conversation.id),
      ),
    )
    .where(and(gte(analysis.analyzedAt, boshlanish), qaytaUrinishShart()))
    .orderBy(asc(analysis.analyzedAt))
    .limit(TIK_LIMITI);
}

/** CRM da hali yaratilmagan SotuvAI vazifalari — qo'ng'iroqi CRM yozuviga bog'langanlari. */
export function vazifalarSorovi(tx: Tx, integrationId: string, boshlanish: Date) {
  // Qo'ng'iroq qaydi (sdelka) — vazifaning CRM dagi joyi
  const suhbatQaydi = sql`(
    select row_to_json(s) from (
      select crm_entity, crm_entity_id, crm_entity_name, crm_url, crm_responsible_id
      from crm_sync_item s
      where s.integration_id = ${integrationId}
        and s.entity = 'conversation'
        and s.local_id = ${task.conversationId}
        and s.status = 'ok'
        and s.crm_entity_id is not null
    ) s
  )`;

  return tx
    .select({
      id: task.id,
      title: task.title,
      description: task.description,
      dueAt: task.dueAt,
      joy: suhbatQaydi.mapWith((v: unknown) => v as Record<string, string | null> | null),
    })
    .from(task)
    .leftJoin(
      crmSyncItem,
      and(
        eq(crmSyncItem.integrationId, integrationId),
        eq(crmSyncItem.entity, 'task'),
        eq(crmSyncItem.localId, task.id),
      ),
    )
    .where(
      and(
        gte(task.createdAt, boshlanish),
        eq(task.status, 'pending'),
        isNull(task.crmTaskId),
        sql`${suhbatQaydi} is not null`,
        qaytaUrinishShart(),
      ),
    )
    .orderBy(asc(task.createdAt))
    .limit(TIK_LIMITI);
}

async function qongiroqlarniYoz(
  u: {
    businessId: string;
    id: string;
    slug: string;
    locale: string;
    timezone: string;
  },
  adapter: (typeof ADAPTERLAR)[keyof typeof ADAPTERLAR],
  ctx: CrmKontekst,
  izohYoz: boolean,
  boshlanish: Date,
  asosiy: Pick<Qayd, 'businessId' | 'integrationId' | 'kind'>,
  natija: YozishNatija,
): Promise<void> {
  const qatorlar = await withTenant(u.businessId, (tx) => suhbatlarSorovi(tx, asosiy.integrationId, boshlanish));

  for (const q of qatorlar) {
    if (!q.telefon) {
      await qaydEt({
        ...asosiy,
        entity: 'conversation',
        localId: q.id,
        status: 'skipped',
        error: "Mijoz telefoni yo'q",
      });
      natija.otkazildi++;
      continue;
    }
    try {
      const yozuv = await adapter.topish(ctx, q.telefon);
      if (!yozuv) {
        await qaydEt({
          ...asosiy,
          entity: 'conversation',
          localId: q.id,
          status: 'skipped',
          error: 'CRM da bu raqamli kontakt topilmadi',
        });
        natija.otkazildi++;
        continue;
      }

      let recordId: string | null = null;
      if (izohYoz) {
        const vazifalar = await withTenant(u.businessId, (tx) =>
          tx
            .select({ title: task.title })
            .from(task)
            .where(and(eq(task.conversationId, q.id), eq(task.status, 'pending')))
            .orderBy(asc(task.dueAt))
            .limit(3),
        );
        recordId = await adapter.izoh(
          ctx,
          yozuv,
          izohMatni({
            til: u.locale,
            timezone: u.timezone,
            boshlandi: q.startedAt,
            davomiylikSoniya: q.durationSeconds,
            menejer: q.menejer,
            baho: q.baho === null ? null : Number(q.baho),
            xulosa: q.xulosa,
            kamchilik: q.kamchilik,
            keyingi: vazifalar.map((v) => v.title),
            havola: `${frontendUrl(u.slug)}/suhbatlar/${q.id}`,
          }),
        );
      }
      await qaydEt({
        ...asosiy,
        entity: 'conversation',
        localId: q.id,
        status: 'ok',
        yozuv,
        recordId,
      });
      natija.yozildi++;
    } catch (err) {
      if (err instanceof CrmXato && err.doimiy) throw err;
      await qaydEt({
        ...asosiy,
        entity: 'conversation',
        localId: q.id,
        status: 'error',
        error: xatoMatni(err),
      });
      natija.xato++;
    }
  }
}

async function vazifalarniYoz(
  adapter: (typeof ADAPTERLAR)[keyof typeof ADAPTERLAR],
  ctx: CrmKontekst,
  boshlanish: Date,
  asosiy: Pick<Qayd, 'businessId' | 'integrationId' | 'kind'>,
  natija: YozishNatija,
): Promise<void> {
  const qatorlar = await withTenant(asosiy.businessId, (tx) => vazifalarSorovi(tx, asosiy.integrationId, boshlanish));

  for (const v of qatorlar) {
    const j = v.joy;
    if (!j?.crm_entity_id) continue;
    const yozuv: CrmYozuv = {
      tur: j.crm_entity === 'contact' ? 'contact' : 'deal',
      id: j.crm_entity_id,
      nom: j.crm_entity_name ?? null,
      url: j.crm_url ?? '',
      masulId: j.crm_responsible_id ?? null,
    };
    const hozir = Date.now();
    // Muddati o'tib ketgan yoki yo'q bo'lsa — ertaga shu payt
    const muddat = v.dueAt && v.dueAt.getTime() > hozir + 15 * 60_000 ? v.dueAt : new Date(hozir + 86_400_000);
    try {
      const id = await adapter.vazifa(ctx, yozuv, {
        sarlavha: `SotuvAI: ${v.title}`,
        matn: v.description ?? '',
        muddat,
      });
      await withTenant(asosiy.businessId, (tx) =>
        tx
          .update(task)
          .set({ crmTaskId: id ?? 'yaratildi', updatedAt: new Date() })
          .where(eq(task.id, v.id)),
      );
      await qaydEt({
        ...asosiy,
        entity: 'task',
        localId: v.id,
        status: 'ok',
        yozuv,
        recordId: id,
      });
      natija.yozildi++;
    } catch (err) {
      if (err instanceof CrmXato && err.doimiy) throw err;
      await qaydEt({
        ...asosiy,
        entity: 'task',
        localId: v.id,
        status: 'error',
        yozuv,
        error: xatoMatni(err),
      });
      natija.xato++;
    }
  }
}
