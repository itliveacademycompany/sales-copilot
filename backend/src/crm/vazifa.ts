import { and, count, desc, eq, inArray, isNotNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/index.js';
import { contact, crmStage, deal, dealEvent, seat, task } from '../db/schema/index.js';
import { sozlamaniOl } from './sozlama.js';
import { CrmXatosi } from './xato.js';
import { bitimniOl, seatniTekshir, yozaOladimi, type CrmDoira } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — vazifalar (TASK-01..05)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bitta `task` jadvali: SotuvAI tahlil vazifalari ham, CRM vazifalari ham.
 * CRM ko'rinishi — bitim yoki kontaktga bog'langanlar va mustaqil (CRM da
 * yaratilgan) vazifalar. Sotuvchi faqat o'ziga tegishlilarini ko'radi.
 */

const BOSH_UUID = '00000000-0000-0000-0000-000000000000';
const OCHIQ = ['pending', 'in_progress', 'blocked'] as const;

/** CRM vazifasi: bitim/kontaktga bog'langan yoki CRM da yaratilgan (task_type bor). */
const crmVazifasi = or(isNotNull(task.dealId), isNotNull(task.contactId), isNotNull(task.taskType))!;

function korishDoirasi(doira: CrmDoira): SQL | undefined {
  if (doira.korish === 'all') return undefined;
  const s = doira.seatId ?? BOSH_UUID;
  return or(eq(task.seatId, s), eq(deal.responsibleSeatId, s));
}

export const vazifaFiltrSxemasi = z.object({
  status: z.enum(['open', 'done']).default('open'),
  /** overdue | today | tomorrow | week | nodate */
  period: z.enum(['overdue', 'today', 'tomorrow', 'week', 'nodate']).optional(),
  seat: z.string().uuid().optional(),
  type: z.string().max(40).optional(),
  /** Kalendar: shu oraliqdagi muddatlilar (from <= due < to). */
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().max(100).optional(),
});

export async function crmVazifalari(
  tx: Tx,
  p: { doira: CrmDoira; filtr: z.infer<typeof vazifaFiltrSxemasi>; limit: number; offset: number },
) {
  const f = p.filtr;
  const sh: SQL[] = [crmVazifasi, sql`(${deal.id} is null or ${deal.deletedAt} is null)`];
  sh.push(f.status === 'open' ? inArray(task.status, [...OCHIQ]) : inArray(task.status, ['done', 'cancelled']));
  const d = korishDoirasi(p.doira);
  if (d) sh.push(d);
  if (f.seat && p.doira.korish === 'all') sh.push(eq(task.seatId, f.seat));
  if (f.type) sh.push(eq(task.taskType, f.type));
  if (f.q) sh.push(or(sql`${task.title} ilike ${`%${f.q}%`}`, sql`${deal.name} ilike ${`%${f.q}%`}`, sql`${contact.name} ilike ${`%${f.q}%`}`)!);
  const kun = sql`date_trunc('day', now())`;
  if (f.period === 'overdue') sh.push(sql`${task.dueAt} < now()`);
  if (f.period === 'today') sh.push(sql`${task.dueAt} >= ${kun} and ${task.dueAt} < ${kun} + interval '1 day'`);
  if (f.period === 'tomorrow') sh.push(sql`${task.dueAt} >= ${kun} + interval '1 day' and ${task.dueAt} < ${kun} + interval '2 days'`);
  if (f.period === 'week') sh.push(sql`${task.dueAt} >= ${kun} and ${task.dueAt} < ${kun} + interval '7 days'`);
  if (f.period === 'nodate') sh.push(sql`${task.dueAt} is null`);
  if (f.from) sh.push(sql`${task.dueAt} >= ${f.from}`);
  if (f.to) sh.push(sql`${task.dueAt} < ${f.to}`);

  const where = and(...sh);
  const [qatorlar, [jami], guruhlar] = await Promise.all([
    tx
      .select({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        taskType: task.taskType,
        result: task.result,
        dueAt: task.dueAt,
        completedAt: task.completedAt,
        source: task.source,
        seatId: task.seatId,
        seatName: seat.displayName,
        dealId: deal.id,
        dealName: deal.name,
        stageName: crmStage.name,
        stageColor: crmStage.color,
        contactId: sql<string | null>`coalesce(${task.contactId}, ${deal.contactId})`,
        contactName: contact.name,
        contactPhone: contact.phone,
      })
      .from(task)
      .leftJoin(deal, eq(deal.id, task.dealId))
      .leftJoin(crmStage, eq(crmStage.id, deal.stageId))
      .leftJoin(contact, sql`${contact.id} = coalesce(${task.contactId}, ${deal.contactId})`)
      .leftJoin(seat, eq(seat.id, task.seatId))
      .where(where)
      .orderBy(
        f.status === 'open' ? sql`${task.dueAt} asc nulls last` : sql`${task.completedAt} desc nulls last`,
        desc(task.createdAt),
      )
      .limit(p.limit)
      .offset(p.offset),
    tx
      .select({ n: count() })
      .from(task)
      .leftJoin(deal, eq(deal.id, task.dealId))
      .leftJoin(contact, sql`${contact.id} = coalesce(${task.contactId}, ${deal.contactId})`)
      .where(where),
    // Ochiq vazifalar soni: muddati o'tgan / bugun / ertaga / hafta — tablar uchun
    f.status === 'open'
      ? tx
          .select({
            overdue: sql<number>`count(*) filter (where ${task.dueAt} < now())::int`,
            today: sql<number>`count(*) filter (where ${task.dueAt} >= date_trunc('day', now()) and ${task.dueAt} < date_trunc('day', now()) + interval '1 day')::int`,
            tomorrow: sql<number>`count(*) filter (where ${task.dueAt} >= date_trunc('day', now()) + interval '1 day' and ${task.dueAt} < date_trunc('day', now()) + interval '2 days')::int`,
            all: sql<number>`count(*)::int`,
          })
          .from(task)
          .leftJoin(deal, eq(deal.id, task.dealId))
          .where(and(crmVazifasi, inArray(task.status, [...OCHIQ]), sql`(${deal.id} is null or ${deal.deletedAt} is null)`, korishDoirasi(p.doira)))
      : Promise.resolve([null]),
  ]);
  return { total: Number(jami?.n ?? 0), counts: guruhlar[0] ?? null, items: qatorlar };
}

export const vazifaKirish = z
  .object({
    title: z.string().trim().min(1, 'Vazifa matnini kiriting').max(300),
    description: z.string().trim().max(2000).nullable().optional(),
    taskType: z.string().max(40).default('call'),
    dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    dealId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    seatId: z.string().uuid().nullable().optional(),
  })
  .strict();

async function turniTekshir(tx: Tx, tur: string): Promise<void> {
  const s = await sozlamaniOl(tx);
  if (!s.taskTypes.some((t) => t.id === tur)) throw new CrmXatosi('yaroqsiz', "Vazifa turi noto'g'ri");
}

/** Vazifa yaratish: bitimga, kontaktga yoki mustaqil (TASK-01). */
export async function vazifaYarat(
  tx: Tx,
  p: { businessId: string; userId: string; doira: CrmDoira; kirish: z.infer<typeof vazifaKirish> },
): Promise<string> {
  const k = p.kirish;
  await turniTekshir(tx, k.taskType);
  let contactId = k.contactId ?? null;
  let dealId: string | null = null;
  let masulStandart = p.doira.seatId;
  if (k.dealId) {
    const d = await bitimniOl(tx, k.dealId, p.doira);
    yozaOladimi(d, p.doira);
    dealId = d.id;
    contactId = contactId ?? d.contactId;
    masulStandart = d.responsibleSeatId ?? masulStandart;
  }
  if (contactId) {
    const [c] = await tx.select({ id: contact.id }).from(contact).where(eq(contact.id, contactId)).limit(1);
    if (!c) throw new CrmXatosi('yaroqsiz', 'Kontakt topilmadi');
  }
  const masul = p.doira.yozish === 'own' ? p.doira.seatId : (k.seatId !== undefined ? k.seatId : masulStandart);
  if (p.doira.yozish === 'own' && !masul) throw new CrmXatosi('ruxsat', "Vazifa yaratish uchun menejer o'rningiz bo'lishi kerak");
  await seatniTekshir(tx, masul);
  const [t] = await tx
    .insert(task)
    .values({
      businessId: p.businessId,
      dealId,
      contactId,
      seatId: masul ?? null,
      source: 'manual',
      taskType: k.taskType,
      title: k.title,
      description: k.description ?? null,
      dueAt: k.dueAt ? new Date(k.dueAt) : null,
      createdBy: p.userId,
      exportedAt: new Date(),
    })
    .returning({ id: task.id });
  if (dealId) {
    await tx.insert(dealEvent).values({
      businessId: p.businessId,
      dealId,
      type: 'task',
      data: { taskId: t!.id, title: k.title, dueAt: k.dueAt ?? null },
      authorUserId: p.userId,
    });
  }
  return t!.id;
}

/** Vazifani o'qish + yozish ruxsatini tekshirish. */
async function vazifaniOl(tx: Tx, id: string, doira: CrmDoira) {
  const [t] = await tx
    .select({
      id: task.id,
      businessId: task.businessId,
      title: task.title,
      status: task.status,
      dueAt: task.dueAt,
      seatId: task.seatId,
      dealId: task.dealId,
      responsible: deal.responsibleSeatId,
    })
    .from(task)
    .leftJoin(deal, eq(deal.id, task.dealId))
    .where(eq(task.id, id))
    .limit(1);
  if (!t) throw new CrmXatosi('topilmadi', 'Vazifa topilmadi');
  // Seat'siz foydalanuvchi (auditor) uchun mas'ulsiz vazifa ham "o'ziniki" emas.
  if (doira.yozish === 'own' && (!doira.seatId || (t.seatId !== doira.seatId && t.responsible !== doira.seatId))) {
    throw new CrmXatosi('topilmadi', 'Vazifa topilmadi');
  }
  return t;
}

/** Bajarish — natija bilan, atomar; bitim tarixiga yoziladi (TASK-04). */
export async function vazifaniBajar(tx: Tx, p: { id: string; userId: string; doira: CrmDoira; result: string | null }): Promise<void> {
  const t = await vazifaniOl(tx, p.id, p.doira);
  if (t.status === 'done') throw new CrmXatosi('ziddiyat', 'Vazifa allaqachon bajarilgan');
  await tx
    .update(task)
    .set({ status: 'done', result: p.result, completedAt: new Date(), updatedAt: new Date() })
    .where(eq(task.id, t.id));
  if (t.dealId) {
    await tx.insert(dealEvent).values({
      businessId: t.businessId,
      dealId: t.dealId,
      type: 'task_done',
      data: { taskId: t.id, title: t.title, result: p.result },
      authorUserId: p.userId,
    });
  }
}

/** Qayta ochish — yangi audit hodisasi, eski bajarilish vaqti tarixda qoladi. */
export async function vazifaniQaytaOch(tx: Tx, p: { id: string; userId: string; doira: CrmDoira }): Promise<void> {
  const t = await vazifaniOl(tx, p.id, p.doira);
  await tx.update(task).set({ status: 'pending', completedAt: null, updatedAt: new Date() }).where(eq(task.id, t.id));
  if (t.dealId) {
    await tx.insert(dealEvent).values({
      businessId: t.businessId,
      dealId: t.dealId,
      type: 'task_reopen',
      data: { taskId: t.id, title: t.title },
      authorUserId: p.userId,
    });
  }
}

export const vazifaYangilash = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  taskType: z.string().max(40).optional(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  seatId: z.string().uuid().nullable().optional(),
});

/** Tahrirlash va muddatni ko'chirish (reschedule). */
export async function vazifaniYangila(
  tx: Tx,
  p: { id: string; userId: string; doira: CrmDoira; kirish: z.infer<typeof vazifaYangilash> },
): Promise<void> {
  const t = await vazifaniOl(tx, p.id, p.doira);
  const k = p.kirish;
  const ozg: Partial<typeof task.$inferInsert> = { updatedAt: new Date() };
  if (k.title !== undefined) ozg.title = k.title;
  if (k.description !== undefined) ozg.description = k.description;
  if (k.taskType !== undefined) {
    await turniTekshir(tx, k.taskType);
    ozg.taskType = k.taskType;
  }
  if (k.dueAt !== undefined) ozg.dueAt = k.dueAt ? new Date(k.dueAt) : null;
  if (k.seatId !== undefined) {
    if (p.doira.yozish === 'own') throw new CrmXatosi('ruxsat', "Vazifa mas'ulini faqat rahbar o'zgartira oladi");
    await seatniTekshir(tx, k.seatId);
    ozg.seatId = k.seatId;
  }
  await tx.update(task).set(ozg).where(eq(task.id, t.id));
  if (t.dealId && k.dueAt !== undefined && (t.dueAt?.toISOString() ?? null) !== (k.dueAt ? new Date(k.dueAt).toISOString() : null)) {
    await tx.insert(dealEvent).values({
      businessId: t.businessId,
      dealId: t.dealId,
      type: 'task_reschedule',
      data: { taskId: t.id, title: t.title, before: t.dueAt?.toISOString() ?? null, after: k.dueAt },
      authorUserId: p.userId,
    });
  }
}

/** Ommaviy: bajarish / ko'chirish / o'chirish (TASK-05). Har ID natijasi qaytadi. */
export async function vazifalarOmmaviy(
  tx: Tx,
  p: { ids: string[]; userId: string; doira: CrmDoira; amal: 'done' | 'cancel' | 'due'; dueAt?: string | null },
) {
  const natija: { id: string; ok: boolean; xato?: string }[] = [];
  for (const id of p.ids) {
    try {
      if (p.amal === 'done') await vazifaniBajar(tx, { id, userId: p.userId, doira: p.doira, result: null });
      else if (p.amal === 'due') await vazifaniYangila(tx, { id, userId: p.userId, doira: p.doira, kirish: { dueAt: p.dueAt ?? null } });
      else {
        const t = await vazifaniOl(tx, id, p.doira);
        await tx.update(task).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(task.id, t.id));
      }
      natija.push({ id, ok: true });
    } catch (e) {
      natija.push({ id, ok: false, xato: e instanceof CrmXatosi ? e.message : 'Xato' });
    }
  }
  return natija;
}

