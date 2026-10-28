import { and, asc, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/index.js';
import { crmField, crmLossReason, crmSavedFilter, crmSetting, crmStage, deal, seat } from '../db/schema/index.js';
import { CrmXatosi } from './xato.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — biznes sozlamalari
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bitta `crm_setting` qatori (jsonb). Shakli shu yerdagi zod sxemasi bilan
 * belgilanadi — bazadagi eski yoki noto'liq qiymat standartlar bilan to'ldiriladi.
 */

export const VAZIFA_TURI_STANDART = [
  { id: 'call', name: "Bog'lanish", color: '#2f6fed' },
  { id: 'meeting', name: 'Uchrashuv', color: '#1f9d55' },
];

const vazifaTuri = z.object({
  id: z.string().min(1).max(40),
  name: z.string().trim().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#5b6575'),
});

export const sozlamaSxemasi = z.object({
  /** Vazifa turlari (TASK-01): standart ikkitasi + maxsuslari. */
  taskTypes: z.array(vazifaTuri).max(30).default(VAZIFA_TURI_STANDART),
  /** Yo'qotilganda sabab tanlash majburiymi (PIPE-03). */
  lossReasonRequired: z.boolean().default(false),
  /** Lid taqsimoti (AUTO-03): yangi murojaatlar navbat bilan shu xodimlarga. */
  roundRobin: z
    .object({
      enabled: z.boolean().default(false),
      seatIds: z.array(z.string().uuid()).max(100).default([]),
      /** Oxirgi tayinlangan xodim indeksi — server boshqaradi. */
      cursor: z.number().int().min(-1).default(-1),
    })
    .default({ enabled: false, seatIds: [], cursor: -1 }),
  /** SotuvAI qo'ng'iroqlaridan avtomatik "Saralanmagan"ga qabul (LEAD-04). */
  callIntake: z
    .object({
      enabled: z.boolean().default(true),
      /** Qaysi voronkaga — bo'sh bo'lsa asosiy. */
      pipelineId: z.string().uuid().nullable().default(null),
      /** Shu vaqtdan keyingi qo'ng'iroqlar ko'riladi (yoqilgan payt). */
      since: z.string().nullable().default(null),
      /** Darhol bitim yaratish ("Saralanmagan"ni chetlab). */
      autoAccept: z.boolean().default(false),
    })
    .default({ enabled: true, pipelineId: null, since: null, autoAccept: false }),
  /**
   * Bosqich bo'yicha majburiy maydonlar (Metasell: "majburiy polyalar
   * avtomatizatsiyada"): `{ [stageId]: fieldId[] }` — bu maydonlar
   * to'ldirilmaguncha lid o'sha bosqichga o'tmaydi.
   */
  stageRequired: z.record(z.string().uuid(), z.array(z.string().uuid()).max(50)).default({}),
});

export type CrmSozlama = z.infer<typeof sozlamaSxemasi>;

export async function sozlamaniOl(tx: Tx): Promise<CrmSozlama> {
  const [r] = await tx.select({ data: crmSetting.data }).from(crmSetting).limit(1);
  const p = sozlamaSxemasi.safeParse(r?.data ?? {});
  return p.success ? p.data : sozlamaSxemasi.parse({});
}

/** Qisman yangilash — `cursor` va `since` mijozdan kelmaydi (server boshqaradi). */
export const sozlamaYangilash = z.object({
  taskTypes: z.array(vazifaTuri).min(1).max(30).optional(),
  lossReasonRequired: z.boolean().optional(),
  roundRobin: z.object({ enabled: z.boolean(), seatIds: z.array(z.string().uuid()).max(100) }).optional(),
  callIntake: z
    .object({ enabled: z.boolean(), pipelineId: z.string().uuid().nullable(), autoAccept: z.boolean() })
    .optional(),
  /** Bitta bosqichning majburiy maydonlari (butun xarita emas — boshqa bosqichlar o'zgarmaydi). */
  stageRequired: z.object({ stageId: z.string().uuid(), fieldIds: z.array(z.string().uuid()).max(50) }).optional(),
});

export async function sozlamaniSaqla(
  tx: Tx,
  businessId: string,
  k: z.infer<typeof sozlamaYangilash>,
): Promise<CrmSozlama> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`crm-sozlama:${businessId}`}))`);
  const eski = await sozlamaniOl(tx);
  const yangi: CrmSozlama = { ...eski };
  if (k.taskTypes) {
    // Standart turlar o'chirilmaydi — avtomatika va eski vazifalar ularga tayanadi
    const idlar = new Set(k.taskTypes.map((t) => t.id));
    yangi.taskTypes = [...VAZIFA_TURI_STANDART.filter((s) => !idlar.has(s.id)), ...k.taskTypes];
  }
  if (k.lossReasonRequired !== undefined) yangi.lossReasonRequired = k.lossReasonRequired;
  if (k.roundRobin) {
    if (k.roundRobin.seatIds.length > 0) {
      const bor = await tx.select({ id: seat.id }).from(seat).where(inArray(seat.id, k.roundRobin.seatIds));
      if (bor.length !== new Set(k.roundRobin.seatIds).size) throw new CrmXatosi("yaroqsiz", "Xodim topilmadi");
    }
    yangi.roundRobin = { enabled: k.roundRobin.enabled, seatIds: [...new Set(k.roundRobin.seatIds)], cursor: -1 };
  }
  if (k.stageRequired) {
    const { stageId, fieldIds } = k.stageRequired;
    const [b] = await tx.select({ id: crmStage.id }).from(crmStage).where(eq(crmStage.id, stageId)).limit(1);
    if (!b) throw new CrmXatosi('yaroqsiz', 'Bosqich topilmadi');
    const bor = fieldIds.length ? await tx.select({ id: crmField.id }).from(crmField).where(inArray(crmField.id, fieldIds)) : [];
    const xarita = { ...eski.stageRequired };
    if (bor.length) xarita[stageId] = bor.map((f) => f.id);
    else delete xarita[stageId];
    yangi.stageRequired = xarita;
  }
  if (k.callIntake) {
    const yoqildi = k.callIntake.enabled && !eski.callIntake.enabled;
    yangi.callIntake = {
      ...k.callIntake,
      since: yoqildi || !eski.callIntake.since ? new Date().toISOString() : eski.callIntake.since,
    };
  }
  await tx
    .insert(crmSetting)
    .values({ businessId, data: yangi, updatedAt: new Date() })
    .onConflictDoUpdate({ target: crmSetting.businessId, set: { data: yangi, updatedAt: new Date() } });
  return yangi;
}

/** CRM yoqilganda: qo'ng'iroq qabulining boshlanish vaqti yoziladi. */
export async function sozlamaniBoshla(tx: Tx, businessId: string): Promise<void> {
  const data = sozlamaSxemasi.parse({});
  data.callIntake.since = new Date().toISOString();
  await tx.insert(crmSetting).values({ businessId, data }).onConflictDoNothing();
}

/**
 * Navbatdagi mas'ul (round-robin). Sozlama qatori qulflanadi — parallel
 * murojaatlar bitta xodimga ikki marta tushmaydi, ikki xodim orasidagi farq
 * ko'pi bilan 1 (AUTO-03). Faol bo'lmagan xodim o'tkazib yuboriladi.
 */
export async function navbatdagiMasul(tx: Tx, businessId: string, royxat?: string[]): Promise<string | null> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`crm-sozlama:${businessId}`}))`);
  const s = await sozlamaniOl(tx);
  const idlar = royxat ?? (s.roundRobin.enabled ? s.roundRobin.seatIds : []);
  if (idlar.length === 0) return null;
  const faollar = await tx.select({ id: seat.id }).from(seat).where(and(inArray(seat.id, idlar), eq(seat.isActive, true)));
  const faol = new Set(faollar.map((f) => f.id));
  const tartib = idlar.filter((i) => faol.has(i));
  if (tartib.length === 0) return null;
  // Umumiy navbat faqat sozlamadagi ro'yxat uchun saqlanadi
  if (royxat) return tartib[Math.floor(Math.random() * tartib.length)]!;
  const oldingi = s.roundRobin.cursor;
  let i = (oldingi + 1) % idlar.length;
  for (let n = 0; n < idlar.length && !faol.has(idlar[i]!); n++) i = (i + 1) % idlar.length;
  const tanlangan = idlar[i]!;
  const yangi = { ...s, roundRobin: { ...s.roundRobin, cursor: i } };
  await tx
    .insert(crmSetting)
    .values({ businessId, data: yangi, updatedAt: new Date() })
    .onConflictDoUpdate({ target: crmSetting.businessId, set: { data: yangi, updatedAt: new Date() } });
  return tanlangan;
}

// ─── Rad sabablari ───────────────────────────────────────────────────────────

export const RAD_SABABLARI_STANDART = ['Qimmat', 'Boshqa joyni tanladi', "Javob bermadi", "Noto'g'ri raqam", 'Keyinroq', 'Boshqa'];

export async function radSabablari(tx: Tx, hammasi = false) {
  const r = await tx
    .select({
      id: crmLossReason.id,
      name: crmLossReason.name,
      sort: crmLossReason.sort,
      archived: sql<boolean>`${crmLossReason.archivedAt} is not null`,
      used: sql<number>`(select count(*)::int from deal d where d.lost_reason_id = "crm_loss_reason"."id")`,
    })
    .from(crmLossReason)
    .where(hammasi ? undefined : isNull(crmLossReason.archivedAt))
    .orderBy(asc(crmLossReason.sort), asc(crmLossReason.createdAt));
  return r;
}

export async function radSabablariniBoshla(tx: Tx, businessId: string): Promise<void> {
  const [bor] = await tx.select({ n: count() }).from(crmLossReason);
  if (Number(bor?.n ?? 0) > 0) return;
  await tx.insert(crmLossReason).values(RAD_SABABLARI_STANDART.map((name, i) => ({ businessId, name, sort: i })));
}

export async function radSababiniSaqla(
  tx: Tx,
  businessId: string,
  k: { id?: string; name?: string; archived?: boolean; sort?: number },
): Promise<string> {
  if (!k.id) {
    if (!k.name?.trim()) throw new CrmXatosi('yaroqsiz', 'Sabab nomini kiriting');
    const [m] = await tx.select({ n: sql<number>`coalesce(max(${crmLossReason.sort}), -1)::int` }).from(crmLossReason);
    const [r] = await tx
      .insert(crmLossReason)
      .values({ businessId, name: k.name.trim(), sort: Number(m?.n ?? -1) + 1 })
      .returning({ id: crmLossReason.id });
    return r!.id;
  }
  const ozg: Partial<typeof crmLossReason.$inferInsert> = {};
  if (k.name !== undefined) ozg.name = k.name.trim();
  if (k.sort !== undefined) ozg.sort = k.sort;
  if (k.archived !== undefined) ozg.archivedAt = k.archived ? new Date() : null;
  await tx.update(crmLossReason).set(ozg).where(eq(crmLossReason.id, k.id));
  return k.id;
}

/** Mavjud bitimlar uchun — `deal` ishlatilganini tekshirish (import tsiklidan qochish uchun shu yerda). */
export async function sababIshlatilganmi(tx: Tx, id: string): Promise<boolean> {
  const [r] = await tx.select({ n: count() }).from(deal).where(eq(deal.lostReasonId, id));
  return Number(r?.n ?? 0) > 0;
}

// ─── Saqlangan filtrlar (LEAD-08) ────────────────────────────────────────────

export async function saqlanganFiltrlar(tx: Tx, userId: string) {
  return tx
    .select({ id: crmSavedFilter.id, name: crmSavedFilter.name, filter: crmSavedFilter.filter })
    .from(crmSavedFilter)
    .where(eq(crmSavedFilter.userId, userId))
    .orderBy(asc(crmSavedFilter.createdAt));
}

export async function filtrniSaqla(tx: Tx, p: { businessId: string; userId: string; name: string; filter: Record<string, unknown> }): Promise<string> {
  const [n] = await tx.select({ n: count() }).from(crmSavedFilter).where(eq(crmSavedFilter.userId, p.userId));
  if (Number(n?.n ?? 0) >= 30) throw new CrmXatosi('yaroqsiz', "Ko'pi bilan 30 ta filtr saqlanadi");
  const [r] = await tx
    .insert(crmSavedFilter)
    .values({ businessId: p.businessId, userId: p.userId, name: p.name, filter: p.filter })
    .returning({ id: crmSavedFilter.id });
  return r!.id;
}

export async function filtrniOchir(tx: Tx, p: { id: string; userId: string }): Promise<void> {
  await tx.delete(crmSavedFilter).where(and(eq(crmSavedFilter.id, p.id), eq(crmSavedFilter.userId, p.userId)));
}
