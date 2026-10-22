import { and, asc, count, desc, eq, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/index.js';
import {
  analysis,
  appUser,
  contact,
  conversation,
  crmField,
  crmPipeline,
  crmStage,
  deal,
  dealEvent,
  seat,
  task,
} from '../db/schema/index.js';
import { telefonKaliti } from '../integrations/crm/adapter.js';
import { kontaktTelefoni } from '../integrations/crm/lidlar.js';
import { bosqichRangi, MAYDON_TURLARI, SHABLONLAR, variantlar, type BosqichTuri, type Shablon } from './shablon.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — biznes mantig'i (HTTP qatlamidan mustaqil, `tx` bilan)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Har funksiya `withTenant` tranzaksiyasi ichida chaqiriladi — RLS biznes
 * chegarasini bazada ta'minlaydi. Ko'rish doirasi (hammasi / faqat o'zim)
 * shu yerda qo'llanadi: menejer boshqaning bitimini ID bilan ham ocha
 * olmaydi (404 — mavjudligi ham oshkor qilinmaydi).
 */

export class CrmXatosi extends Error {
  constructor(
    public readonly kod: 'topilmadi' | 'ziddiyat' | 'yaroqsiz' | 'ruxsat',
    message: string,
  ) {
    super(message);
    this.name = 'CrmXatosi';
  }
}

/** Kim nimani ko'radi va o'zgartiradi. `own` — faqat mas'uli o'zi bo'lgan bitimlar. */
export interface CrmDoira {
  korish: 'all' | 'own';
  yozish: 'all' | 'own';
  seatId: string | null;
}

function korishSharti(d: CrmDoira): SQL | undefined {
  return d.korish === 'own' ? eq(deal.responsibleSeatId, d.seatId ?? '00000000-0000-0000-0000-000000000000') : undefined;
}

// ─── Yoqish (shablon) ────────────────────────────────────────────────────────

export async function crmYoqilganmi(tx: Tx): Promise<boolean> {
  const [r] = await tx.select({ n: count() }).from(crmPipeline);
  return Number(r?.n ?? 0) > 0;
}

/** Shablondan voronka, bosqich va maydonlarni yaratadi. Allaqachon yoqilgan bo'lsa — ziddiyat. */
export async function crmniYoq(tx: Tx, businessId: string, kod: Shablon['kod']): Promise<void> {
  // Ikki marta bosilsa ham shablon bir marta yaratilsin
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`crm-yoqish:${businessId}`}))`);
  if (await crmYoqilganmi(tx)) throw new CrmXatosi('ziddiyat', 'CRM allaqachon yoqilgan');
  const sh = SHABLONLAR[kod];
  for (const [i, v] of sh.voronkalar.entries()) {
    const [p] = await tx
      .insert(crmPipeline)
      .values({ businessId, name: v.name, sort: i, isMain: Boolean(v.isMain) })
      .returning({ id: crmPipeline.id });
    await tx.insert(crmStage).values(
      v.stages.map((s, j) => ({
        businessId,
        pipelineId: p!.id,
        name: s.name,
        kind: s.kind ?? 'open',
        color: s.color ?? bosqichRangi(s.kind ?? 'open', j),
        sort: j,
      })),
    );
  }
  if (sh.maydonlar.length > 0) {
    await tx.insert(crmField).values(
      sh.maydonlar.map((m, i) => ({
        businessId,
        code: m.code,
        label: m.label,
        type: m.type,
        groupName: m.group,
        options: variantlar(m.options),
        required: Boolean(m.required),
        sort: i,
      })),
    );
  }
}

// ─── Tuzilma (voronkalar, bosqichlar, maydonlar) ─────────────────────────────

export type MaydonVarianti = { id: string; label: string };

export interface MaydonTavsifi {
  id: string;
  code: string;
  label: string;
  type: string;
  options: MaydonVarianti[];
  groupName: string | null;
  sort: number;
  required: boolean;
}

export async function tuzilma(tx: Tx) {
  const [voronkalar, bosqichlar, maydonlar] = await Promise.all([
    tx
      .select({ id: crmPipeline.id, name: crmPipeline.name, sort: crmPipeline.sort, isMain: crmPipeline.isMain })
      .from(crmPipeline)
      .where(isNull(crmPipeline.archivedAt))
      .orderBy(asc(crmPipeline.sort), asc(crmPipeline.createdAt)),
    tx
      .select({ id: crmStage.id, pipelineId: crmStage.pipelineId, name: crmStage.name, color: crmStage.color, kind: crmStage.kind, sort: crmStage.sort })
      .from(crmStage)
      .orderBy(asc(crmStage.sort)),
    tx
      .select({
        id: crmField.id,
        code: crmField.code,
        label: crmField.label,
        type: crmField.type,
        options: crmField.options,
        groupName: crmField.groupName,
        sort: crmField.sort,
        required: crmField.required,
      })
      .from(crmField)
      .where(isNull(crmField.archivedAt))
      .orderBy(asc(crmField.sort)),
  ]);
  return {
    pipelines: voronkalar.map((v) => ({ ...v, stages: bosqichlar.filter((b) => b.pipelineId === v.id) })),
    fields: maydonlar.map((m) => ({ ...m, options: (m.options as MaydonVarianti[]) ?? [] })) as MaydonTavsifi[],
  };
}

// ─── Maydon qiymatlarini tekshirish ──────────────────────────────────────────

const SANA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Kelgan `{ fieldId: qiymat }` ni maydon turiga qarab tekshiradi va
 * tozalaydi. Noma'lum maydon — rad (begona kalit bazaga tushmasin).
 * `null` / bo'sh — qiymatni o'chirish.
 */
export function maydonlarniTekshir(
  kirish: Record<string, unknown>,
  maydonlar: MaydonTavsifi[],
): Record<string, unknown> {
  const natija: Record<string, unknown> = {};
  for (const [id, xom] of Object.entries(kirish)) {
    const m = maydonlar.find((x) => x.id === id);
    if (!m) throw new CrmXatosi('yaroqsiz', `Noma'lum maydon: ${id}`);
    if (xom === null || xom === undefined || xom === '' || (Array.isArray(xom) && xom.length === 0)) {
      natija[id] = null;
      continue;
    }
    const xato = () => new CrmXatosi('yaroqsiz', `«${m.label}» maydoni qiymati noto'g'ri`);
    switch (m.type) {
      case 'text':
      case 'phone':
      case 'url':
        if (typeof xom !== 'string' || xom.length > 500) throw xato();
        if (m.type === 'url' && !/^https?:\/\//i.test(xom.trim())) throw xato();
        natija[id] = xom.trim();
        break;
      case 'textarea':
        if (typeof xom !== 'string' || xom.length > 5000) throw xato();
        natija[id] = xom;
        break;
      case 'number':
      case 'money': {
        const n = typeof xom === 'number' ? xom : Number(String(xom).replace(/\s/g, ''));
        if (!Number.isFinite(n) || Math.abs(n) > 1e13) throw xato();
        natija[id] = n;
        break;
      }
      case 'select':
        if (typeof xom !== 'string' || !m.options.some((o) => o.id === xom)) throw xato();
        natija[id] = xom;
        break;
      case 'multiselect':
        if (!Array.isArray(xom) || !xom.every((v) => typeof v === 'string' && m.options.some((o) => o.id === v))) throw xato();
        natija[id] = [...new Set(xom as string[])];
        break;
      case 'date':
        if (typeof xom !== 'string' || !SANA.test(xom)) throw xato();
        natija[id] = xom;
        break;
      case 'datetime':
        if (typeof xom !== 'string' || Number.isNaN(Date.parse(xom))) throw xato();
        natija[id] = new Date(xom).toISOString();
        break;
      case 'checkbox':
        if (typeof xom !== 'boolean') throw xato();
        natija[id] = xom;
        break;
      default:
        throw xato();
    }
  }
  return natija;
}

// ─── Kontakt ─────────────────────────────────────────────────────────────────

/**
 * Telefon bo'yicha mavjud kontakt (oxirgi 9 raqam) yoki yangisi. SotuvAI
 * qo'ng'iroqlari ham shu kontaktga bog'langan — bitim kartochkasida ular
 * avtomatik ko'rinadi.
 */
export async function kontaktniTopYokiYarat(
  tx: Tx,
  businessId: string,
  k: { name?: string | null; phone?: string | null; email?: string | null },
): Promise<string | null> {
  const kalit = telefonKaliti(k.phone ?? null);
  if (kalit) {
    const [bor] = await tx
      .select({ id: contact.id, name: contact.name })
      .from(contact)
      .where(sql`right(regexp_replace(${contact.phone}, '\\D', '', 'g'), 9) = ${kalit}`)
      .limit(1);
    if (bor) {
      if (!bor.name && k.name) await tx.update(contact).set({ name: k.name }).where(eq(contact.id, bor.id));
      return bor.id;
    }
  }
  if (!k.name && !kalit) return null;
  const [yangi] = await tx
    .insert(contact)
    .values({ businessId, name: k.name ?? null, phone: k.phone ? kontaktTelefoni(k.phone) : null, email: k.email ?? null })
    .returning({ id: contact.id });
  return yangi!.id;
}

// ─── Bitimlar ────────────────────────────────────────────────────────────────

export const bitimKirish = z.object({
  name: z.string().trim().min(1, 'Bitim nomini kiriting').max(250),
  pipelineId: z.string().uuid(),
  stageId: z.string().uuid(),
  amount: z.coerce.number({ message: "Summa raqam bo'lishi kerak" }).min(0, "Summa manfiy bo'lmasin").max(1e13, 'Summa juda katta').nullable().optional(),
  responsibleSeatId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  contact: z
    .object({
      name: z.string().trim().max(200).nullable().optional(),
      phone: z.string().trim().max(40).nullable().optional(),
      email: z.string().trim().email().max(200).nullable().optional().or(z.literal('')),
    })
    .optional(),
  fields: z.record(z.string(), z.unknown()).default({}),
  source: z.string().trim().max(100).nullable().optional(),
});

async function bosqichniOl(tx: Tx, stageId: string) {
  const [b] = await tx
    .select({ id: crmStage.id, pipelineId: crmStage.pipelineId, kind: crmStage.kind, name: crmStage.name })
    .from(crmStage)
    .where(eq(crmStage.id, stageId))
    .limit(1);
  return b ?? null;
}

async function seatniTekshir(tx: Tx, seatId: string | null | undefined): Promise<void> {
  if (!seatId) return;
  const [s] = await tx.select({ id: seat.id }).from(seat).where(eq(seat.id, seatId)).limit(1);
  if (!s) throw new CrmXatosi('yaroqsiz', "Mas'ul topilmadi");
}

export async function bitimYarat(
  tx: Tx,
  p: { businessId: string; userId: string; doira: CrmDoira; kirish: z.infer<typeof bitimKirish> },
): Promise<string> {
  const k = p.kirish;
  const b = await bosqichniOl(tx, k.stageId);
  if (!b || b.pipelineId !== k.pipelineId) throw new CrmXatosi('yaroqsiz', 'Bosqich shu voronkaga tegishli emas');

  // Menejer faqat o'ziga yarata oladi
  const masul = p.doira.yozish === 'own' ? p.doira.seatId : (k.responsibleSeatId ?? p.doira.seatId);
  if (p.doira.yozish === 'own' && !masul) throw new CrmXatosi('ruxsat', "Bitim yaratish uchun menejer o'rningiz bo'lishi kerak");
  await seatniTekshir(tx, masul);

  const { fields: maydonlar } = await tuzilma(tx);
  const fields = maydonlarniTekshir(k.fields, maydonlar);
  for (const m of maydonlar) {
    if (m.required && (fields[m.id] === undefined || fields[m.id] === null)) {
      throw new CrmXatosi('yaroqsiz', `«${m.label}» maydoni majburiy`);
    }
  }

  let contactId = k.contactId ?? null;
  if (contactId) {
    const [c] = await tx.select({ id: contact.id }).from(contact).where(eq(contact.id, contactId)).limit(1);
    if (!c) throw new CrmXatosi('yaroqsiz', 'Kontakt topilmadi');
  } else if (k.contact) {
    contactId = await kontaktniTopYokiYarat(tx, p.businessId, { ...k.contact, email: k.contact.email || null });
  }

  const yopiq = b.kind !== 'open';
  const [d] = await tx
    .insert(deal)
    .values({
      businessId: p.businessId,
      pipelineId: k.pipelineId,
      stageId: k.stageId,
      name: k.name,
      amount: k.amount === null || k.amount === undefined ? null : String(k.amount),
      responsibleSeatId: masul ?? null,
      contactId,
      fields: Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null)),
      source: k.source ?? null,
      closedAt: yopiq ? new Date() : null,
      createdBy: p.userId,
    })
    .returning({ id: deal.id });
  await tx.insert(dealEvent).values({
    businessId: p.businessId,
    dealId: d!.id,
    type: 'created',
    data: { stageId: b.id, stageName: b.name },
    authorUserId: p.userId,
  });
  return d!.id;
}

/** Bitimni ko'rish doirasida topadi; yo'q yoki ruxsat yo'q — 404 (mavjudligi oshkor qilinmaydi). */
async function bitimniOl(tx: Tx, id: string, doira: CrmDoira) {
  const [d] = await tx
    .select()
    .from(deal)
    .where(and(eq(deal.id, id), isNull(deal.deletedAt), korishSharti(doira)))
    .limit(1);
  if (!d) throw new CrmXatosi('topilmadi', 'Bitim topilmadi');
  return d;
}

function yozaOladimi(d: { responsibleSeatId: string | null }, doira: CrmDoira): void {
  if (doira.yozish === 'own' && d.responsibleSeatId !== doira.seatId) {
    throw new CrmXatosi('ruxsat', "Bu bitimni o'zgartirishga ruxsatingiz yo'q");
  }
}

export const bitimYangilash = z.object({
  version: z.number().int().positive(),
  name: z.string().trim().min(1).max(250).optional(),
  amount: z.coerce.number({ message: "Summa raqam bo'lishi kerak" }).min(0, "Summa manfiy bo'lmasin").max(1e13, 'Summa juda katta').nullable().optional(),
  responsibleSeatId: z.string().uuid().nullable().optional(),
  contactId: z.string().uuid().nullable().optional(),
  fields: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Optimistik qulf: `version` mos kelmasa — ziddiyat (boshqa kishi o'zgartirgan).
 * Har o'zgargan maydon tarixga `before → after` bo'lib yoziladi.
 */
export async function bitimniYangila(
  tx: Tx,
  p: { id: string; userId: string; doira: CrmDoira; kirish: z.infer<typeof bitimYangilash> },
): Promise<number> {
  const d = await bitimniOl(tx, p.id, p.doira);
  yozaOladimi(d, p.doira);
  const k = p.kirish;
  if (d.version !== k.version) {
    throw new CrmXatosi('ziddiyat', "Bitimni boshqa foydalanuvchi o'zgartirdi — sahifani yangilab, qayta urinib ko'ring");
  }

  const ozgarish: Partial<typeof deal.$inferInsert> = {};
  const hodisalar: { type: string; data: Record<string, unknown> }[] = [];
  if (k.name !== undefined && k.name !== d.name) {
    ozgarish.name = k.name;
    hodisalar.push({ type: 'field', data: { field: 'name', before: d.name, after: k.name } });
  }
  if (k.amount !== undefined) {
    const yangi = k.amount === null ? null : String(Number(k.amount).toFixed(2));
    const eski = d.amount === null ? null : String(Number(d.amount).toFixed(2));
    if (yangi !== eski) {
      ozgarish.amount = yangi;
      hodisalar.push({ type: 'field', data: { field: 'amount', before: eski, after: yangi } });
    }
  }
  if (k.responsibleSeatId !== undefined && k.responsibleSeatId !== d.responsibleSeatId) {
    if (p.doira.yozish === 'own') throw new CrmXatosi('ruxsat', "Mas'ulni faqat rahbar o'zgartira oladi");
    await seatniTekshir(tx, k.responsibleSeatId);
    ozgarish.responsibleSeatId = k.responsibleSeatId;
    hodisalar.push({ type: 'responsible', data: { before: d.responsibleSeatId, after: k.responsibleSeatId } });
  }
  if (k.contactId !== undefined && k.contactId !== d.contactId) {
    if (k.contactId) {
      const [c] = await tx.select({ id: contact.id }).from(contact).where(eq(contact.id, k.contactId)).limit(1);
      if (!c) throw new CrmXatosi('yaroqsiz', 'Kontakt topilmadi');
    }
    ozgarish.contactId = k.contactId;
    hodisalar.push({ type: 'contact', data: { before: d.contactId, after: k.contactId } });
  }
  if (k.fields) {
    const { fields: maydonlar } = await tuzilma(tx);
    const tozalangan = maydonlarniTekshir(k.fields, maydonlar);
    const eski = (d.fields ?? {}) as Record<string, unknown>;
    const yangi = { ...eski };
    for (const [id, v] of Object.entries(tozalangan)) {
      const oldin = eski[id] ?? null;
      if (JSON.stringify(oldin) === JSON.stringify(v)) continue;
      if (v === null) delete yangi[id];
      else yangi[id] = v;
      hodisalar.push({ type: 'field', data: { fieldId: id, before: oldin, after: v } });
    }
    for (const m of maydonlar) {
      if (m.required && (yangi[m.id] === undefined || yangi[m.id] === null)) {
        throw new CrmXatosi('yaroqsiz', `«${m.label}» maydoni majburiy`);
      }
    }
    if (hodisalar.some((h) => h.data.fieldId)) ozgarish.fields = yangi;
  }

  if (hodisalar.length === 0) return d.version;
  const [r] = await tx
    .update(deal)
    .set({ ...ozgarish, version: sql`${deal.version} + 1`, updatedAt: new Date() })
    .where(and(eq(deal.id, d.id), eq(deal.version, k.version)))
    .returning({ version: deal.version });
  if (!r) throw new CrmXatosi('ziddiyat', "Bitimni boshqa foydalanuvchi o'zgartirdi — sahifani yangilab, qayta urinib ko'ring");
  await tx.insert(dealEvent).values(hodisalar.map((h) => ({ businessId: d.businessId, dealId: d.id, type: h.type, data: h.data, authorUserId: p.userId })));
  return r.version;
}

export const bitimKochirish = z.object({
  stageId: z.string().uuid(),
  lostReason: z.string().trim().max(500).nullable().optional(),
});

/** Bosqichga (boshqa voronkaga ham) ko'chirish — bitta tarix hodisasi. */
export async function bitimniKochir(
  tx: Tx,
  p: { id: string; userId: string; doira: CrmDoira; kirish: z.infer<typeof bitimKochirish> },
): Promise<void> {
  const d = await bitimniOl(tx, p.id, p.doira);
  yozaOladimi(d, p.doira);
  if (d.stageId === p.kirish.stageId) return;
  const [eski, yangi] = await Promise.all([bosqichniOl(tx, d.stageId), bosqichniOl(tx, p.kirish.stageId)]);
  if (!yangi) throw new CrmXatosi('yaroqsiz', 'Bosqich topilmadi');
  const hozir = new Date();
  await tx
    .update(deal)
    .set({
      stageId: yangi.id,
      pipelineId: yangi.pipelineId,
      stageEnteredAt: hozir,
      closedAt: yangi.kind === 'open' ? null : hozir,
      lostReason: yangi.kind === 'lost' ? (p.kirish.lostReason ?? null) : null,
      version: sql`${deal.version} + 1`,
      updatedAt: hozir,
    })
    .where(eq(deal.id, d.id));
  await tx.insert(dealEvent).values({
    businessId: d.businessId,
    dealId: d.id,
    type: 'stage',
    data: {
      fromStageId: eski?.id ?? null,
      fromName: eski?.name ?? null,
      toStageId: yangi.id,
      toName: yangi.name,
      pipelineChanged: eski?.pipelineId !== yangi.pipelineId,
      lostReason: yangi.kind === 'lost' ? (p.kirish.lostReason ?? null) : undefined,
    },
    authorUserId: p.userId,
  });
}

export async function bitimniOchir(tx: Tx, p: { id: string; doira: CrmDoira }): Promise<void> {
  const d = await bitimniOl(tx, p.id, p.doira);
  yozaOladimi(d, p.doira);
  await tx.update(deal).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(deal.id, d.id));
}

export async function izohQosh(tx: Tx, p: { id: string; userId: string; doira: CrmDoira; matn: string }): Promise<void> {
  const d = await bitimniOl(tx, p.id, p.doira);
  await tx.insert(dealEvent).values({ businessId: d.businessId, dealId: d.id, type: 'note', data: { text: p.matn }, authorUserId: p.userId });
}

export async function bitimVazifasi(
  tx: Tx,
  p: { id: string; userId: string; doira: CrmDoira; title: string; dueAt: Date | null; description: string | null },
): Promise<string> {
  const d = await bitimniOl(tx, p.id, p.doira);
  yozaOladimi(d, p.doira);
  const [t] = await tx
    .insert(task)
    .values({
      businessId: d.businessId,
      dealId: d.id,
      seatId: d.responsibleSeatId,
      source: 'manual',
      title: p.title,
      description: p.description,
      dueAt: p.dueAt,
      createdBy: p.userId,
    })
    .returning({ id: task.id });
  return t!.id;
}

// ─── Kanban va ro'yxat ───────────────────────────────────────────────────────

/** Bitim kartasi (Kanban / jadval qatori). */
function kartaUstunlari() {
  return {
    id: deal.id,
    name: deal.name,
    amount: deal.amount,
    pipelineId: deal.pipelineId,
    stageId: deal.stageId,
    responsibleSeatId: deal.responsibleSeatId,
    responsibleName: seat.displayName,
    contactId: deal.contactId,
    contactName: contact.name,
    contactPhone: contact.phone,
    stageEnteredAt: deal.stageEnteredAt,
    createdAt: deal.createdAt,
    updatedAt: deal.updatedAt,
    version: deal.version,
    /** Eng yaqin ochiq vazifa muddati — "vazifasiz bitim" belgisi uchun. */
    nextTaskAt: sql<Date | null>`(select min(t.due_at) from task t where t.deal_id = "deal"."id" and t.status in ('pending','in_progress','blocked'))`,
    openTasks: sql<number>`(select count(*)::int from task t where t.deal_id = "deal"."id" and t.status in ('pending','in_progress','blocked'))`,
  };
}

export interface BitimFiltr {
  q?: string;
  seat?: string;
}

function filtrShartlari(f: BitimFiltr, doira: CrmDoira): SQL[] {
  const sh: SQL[] = [isNull(deal.deletedAt)];
  const k = korishSharti(doira);
  if (k) sh.push(k);
  if (f.seat && doira.korish === 'all') sh.push(eq(deal.responsibleSeatId, f.seat));
  if (f.q) {
    const raqam = f.q.replace(/\D/g, '');
    const s = or(
      ilike(deal.name, `%${f.q}%`),
      ilike(contact.name, `%${f.q}%`),
      ...(raqam.length >= 4 ? [sql`regexp_replace(coalesce(${contact.phone}, ''), '\\D', '', 'g') like ${`%${raqam}%`}`] : []),
    );
    if (s) sh.push(s);
  }
  return sh;
}

/** Kanban: har bosqich uchun soni, summasi va birinchi `limit` ta bitim. */
export async function kanban(tx: Tx, p: { pipelineId: string; doira: CrmDoira; filtr: BitimFiltr; limit?: number }) {
  const limit = p.limit ?? 50;
  const sh = [...filtrShartlari(p.filtr, p.doira), eq(deal.pipelineId, p.pipelineId)];
  // Har bosqichdan eng yangi `limit` tasi — oyna funksiyasi bilan, bazada kesiladi
  const tartib = tx
    .select({
      id: deal.id,
      rn: sql<number>`row_number() over (partition by ${deal.stageId} order by ${deal.stageEnteredAt} desc, ${deal.id})`.as('rn'),
    })
    .from(deal)
    .leftJoin(contact, eq(contact.id, deal.contactId))
    .where(and(...sh))
    .as('tartib');
  const [jamlar, qatorlar] = await Promise.all([
    tx
      .select({ stageId: deal.stageId, n: count(), sum: sql<string | null>`sum(${deal.amount})` })
      .from(deal)
      .leftJoin(contact, eq(contact.id, deal.contactId))
      .where(and(...sh))
      .groupBy(deal.stageId),
    tx
      .select({ ...kartaUstunlari(), rn: tartib.rn })
      .from(deal)
      .innerJoin(tartib, eq(tartib.id, deal.id))
      .leftJoin(contact, eq(contact.id, deal.contactId))
      .leftJoin(seat, eq(seat.id, deal.responsibleSeatId))
      .where(lte(tartib.rn, limit)),
  ]);
  const bosqichlar = await tx
    .select({ id: crmStage.id, name: crmStage.name, color: crmStage.color, kind: crmStage.kind, sort: crmStage.sort })
    .from(crmStage)
    .where(eq(crmStage.pipelineId, p.pipelineId))
    .orderBy(asc(crmStage.sort));
  return bosqichlar.map((b) => {
    const j = jamlar.find((x) => x.stageId === b.id);
    return {
      ...b,
      count: Number(j?.n ?? 0),
      sum: j?.sum ? Number(j.sum) : 0,
      deals: qatorlar
        .filter((q) => q.stageId === b.id)
        .sort((a, c) => Number(a.rn) - Number(c.rn))
        .map(({ rn: _rn, ...q }) => ({ ...q, amount: q.amount === null ? null : Number(q.amount) })),
    };
  });
}

/** Jadval ko'rinishi — sahifalab. */
export async function bitimlarRoyxati(
  tx: Tx,
  p: { pipelineId?: string; stageId?: string; doira: CrmDoira; filtr: BitimFiltr; limit: number; offset: number },
) {
  const sh = filtrShartlari(p.filtr, p.doira);
  if (p.pipelineId) sh.push(eq(deal.pipelineId, p.pipelineId));
  if (p.stageId) sh.push(eq(deal.stageId, p.stageId));
  const [qatorlar, [jami]] = await Promise.all([
    tx
      .select(kartaUstunlari())
      .from(deal)
      .leftJoin(contact, eq(contact.id, deal.contactId))
      .leftJoin(seat, eq(seat.id, deal.responsibleSeatId))
      .where(and(...sh))
      .orderBy(desc(deal.updatedAt), desc(deal.id))
      .limit(p.limit)
      .offset(p.offset),
    tx.select({ n: count() }).from(deal).leftJoin(contact, eq(contact.id, deal.contactId)).where(and(...sh)),
  ]);
  return { total: Number(jami?.n ?? 0), items: qatorlar.map((q) => ({ ...q, amount: q.amount === null ? null : Number(q.amount) })) };
}

// ─── Bitim kartochkasi ───────────────────────────────────────────────────────

/**
 * Kartochka: bitim + kontakt + tarix + vazifalar + SotuvAI qo'ng'iroqlari.
 * Qo'ng'iroq va tahlil kontakt orqali — sinxronlashsiz, avtomatik.
 * Vazifalar: bitimga biriktirilgani VA shu mijoz qo'ng'iroqlaridan tahlil
 * yaratganlari (SotuvAI vazifalari ham shu yerda ko'rinadi).
 */
export async function bitimKartochkasi(tx: Tx, p: { id: string; doira: CrmDoira }) {
  const d = await bitimniOl(tx, p.id, p.doira);
  const [kontakt, tarix, vazifalar, qongiroqlar, masul] = await Promise.all([
    d.contactId
      ? tx
          .select({ id: contact.id, name: contact.name, phone: contact.phone, email: contact.email, company: contact.company })
          .from(contact)
          .where(eq(contact.id, d.contactId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    tx
      .select({
        id: dealEvent.id,
        type: dealEvent.type,
        data: dealEvent.data,
        authorUserId: dealEvent.authorUserId,
        authorName: appUser.displayName,
        createdAt: dealEvent.createdAt,
      })
      .from(dealEvent)
      .leftJoin(appUser, eq(appUser.id, dealEvent.authorUserId))
      .where(eq(dealEvent.dealId, d.id))
      .orderBy(desc(dealEvent.createdAt))
      .limit(200),
    tx
      .select({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        dueAt: task.dueAt,
        source: task.source,
        conversationId: task.conversationId,
        seatId: task.seatId,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
      })
      .from(task)
      .leftJoin(conversation, eq(conversation.id, task.conversationId))
      .where(
        or(
          eq(task.dealId, d.id),
          d.contactId ? and(isNull(task.dealId), eq(conversation.contactId, d.contactId)) : sql`false`,
        ),
      )
      .orderBy(asc(task.status), asc(task.dueAt))
      .limit(100),
    d.contactId
      ? tx
          .select({
            id: conversation.id,
            channel: conversation.channel,
            direction: conversation.direction,
            startedAt: conversation.startedAt,
            durationSeconds: conversation.durationSeconds,
            status: conversation.status,
            score: analysis.overallScore,
            summary: analysis.summary,
            leadQuality: analysis.leadQuality,
            seatName: seat.displayName,
          })
          .from(conversation)
          .leftJoin(analysis, eq(analysis.conversationId, conversation.id))
          .leftJoin(seat, eq(seat.id, conversation.seatId))
          .where(eq(conversation.contactId, d.contactId))
          .orderBy(desc(conversation.startedAt))
          .limit(50)
      : Promise.resolve([]),
    d.responsibleSeatId
      ? tx.select({ id: seat.id, name: seat.displayName }).from(seat).where(eq(seat.id, d.responsibleSeatId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  return {
    deal: { ...d, amount: d.amount === null ? null : Number(d.amount) },
    contact: kontakt,
    responsible: masul,
    events: tarix,
    tasks: vazifalar,
    calls: qongiroqlar.map((c) => ({ ...c, score: c.score === null ? null : Number(c.score) })),
  };
}

// ─── Kontaktlar ──────────────────────────────────────────────────────────────

export async function kontaktlarRoyxati(tx: Tx, p: { q?: string; limit: number; offset: number; doira: CrmDoira }) {
  const sh: SQL[] = [];
  if (p.q) {
    const raqam = p.q.replace(/\D/g, '');
    const s = or(
      ilike(contact.name, `%${p.q}%`),
      ilike(contact.company, `%${p.q}%`),
      ...(raqam.length >= 4 ? [sql`regexp_replace(coalesce(${contact.phone}, ''), '\\D', '', 'g') like ${`%${raqam}%`}`] : []),
    );
    if (s) sh.push(s);
  }
  // Menejer — faqat o'z bitimlari yoki o'z qo'ng'iroqlari bor kontaktlar
  if (p.doira.korish === 'own') {
    const s = p.doira.seatId ?? '00000000-0000-0000-0000-000000000000';
    sh.push(
      sql`(exists (select 1 from ${deal} where ${deal.contactId} = ${contact.id} and ${deal.responsibleSeatId} = ${s} and ${deal.deletedAt} is null)
        or exists (select 1 from ${conversation} where ${conversation.contactId} = ${contact.id} and ${conversation.seatId} = ${s}))`,
    );
  }
  const where = sh.length ? and(...sh) : undefined;
  const [qatorlar, [jami]] = await Promise.all([
    tx
      .select({
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
        lastSeenAt: contact.lastSeenAt,
        // Bitta jadvalli select'da Drizzle ustunni jadval nomisiz yozadi — shuning uchun aniq nomlar
        deals: sql<number>`(select count(*)::int from deal d where d.contact_id = "contact"."id" and d.deleted_at is null)`,
        calls: sql<number>`(select count(*)::int from conversation cv where cv.contact_id = "contact"."id")`,
      })
      .from(contact)
      .where(where)
      .orderBy(desc(contact.lastSeenAt), desc(contact.id))
      .limit(p.limit)
      .offset(p.offset),
    tx.select({ n: count() }).from(contact).where(where),
  ]);
  return { total: Number(jami?.n ?? 0), items: qatorlar };
}

export const kontaktKirish = z.object({
  name: z.string().trim().min(1, 'Ismni kiriting').max(200),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email("Email noto'g'ri").max(200).nullable().optional().or(z.literal('')),
  company: z.string().trim().max(200).nullable().optional(),
});

export async function kontaktYarat(tx: Tx, businessId: string, k: z.infer<typeof kontaktKirish>): Promise<string> {
  const kalit = telefonKaliti(k.phone ?? null);
  if (kalit) {
    const [bor] = await tx
      .select({ id: contact.id })
      .from(contact)
      .where(sql`right(regexp_replace(${contact.phone}, '\\D', '', 'g'), 9) = ${kalit}`)
      .limit(1);
    if (bor) throw new CrmXatosi('ziddiyat', 'Bu raqamli kontakt allaqachon bor');
  }
  const [c] = await tx
    .insert(contact)
    .values({
      businessId,
      name: k.name,
      phone: k.phone ? kontaktTelefoni(k.phone) : null,
      email: k.email || null,
      company: k.company ?? null,
    })
    .returning({ id: contact.id });
  return c!.id;
}

export async function kontaktniYangila(tx: Tx, id: string, k: Partial<z.infer<typeof kontaktKirish>>): Promise<void> {
  const ozg: Partial<typeof contact.$inferInsert> = {};
  if (k.name !== undefined) ozg.name = k.name;
  if (k.phone !== undefined) ozg.phone = k.phone ? kontaktTelefoni(k.phone) : null;
  if (k.email !== undefined) ozg.email = k.email || null;
  if (k.company !== undefined) ozg.company = k.company ?? null;
  const r = await tx.update(contact).set(ozg).where(eq(contact.id, id)).returning({ id: contact.id });
  if (r.length === 0) throw new CrmXatosi('topilmadi', 'Kontakt topilmadi');
}

export async function kontaktKartochkasi(tx: Tx, p: { id: string; doira: CrmDoira }) {
  const [c] = await tx
    .select({ id: contact.id, name: contact.name, phone: contact.phone, email: contact.email, company: contact.company, firstSeenAt: contact.firstSeenAt, lastSeenAt: contact.lastSeenAt })
    .from(contact)
    .where(eq(contact.id, p.id))
    .limit(1);
  if (!c) throw new CrmXatosi('topilmadi', 'Kontakt topilmadi');
  const sh = [eq(deal.contactId, c.id), isNull(deal.deletedAt)];
  const k = korishSharti(p.doira);
  if (k) sh.push(k);
  const [bitimlar, qongiroqlar] = await Promise.all([
    tx
      .select({ id: deal.id, name: deal.name, amount: deal.amount, stageName: crmStage.name, stageKind: crmStage.kind, stageColor: crmStage.color, pipelineName: crmPipeline.name, updatedAt: deal.updatedAt })
      .from(deal)
      .innerJoin(crmStage, eq(crmStage.id, deal.stageId))
      .innerJoin(crmPipeline, eq(crmPipeline.id, deal.pipelineId))
      .where(and(...sh))
      .orderBy(desc(deal.updatedAt)),
    tx
      .select({
        id: conversation.id,
        channel: conversation.channel,
        startedAt: conversation.startedAt,
        durationSeconds: conversation.durationSeconds,
        score: analysis.overallScore,
        summary: analysis.summary,
        seatName: seat.displayName,
      })
      .from(conversation)
      .leftJoin(analysis, eq(analysis.conversationId, conversation.id))
      .leftJoin(seat, eq(seat.id, conversation.seatId))
      .where(
        and(
          eq(conversation.contactId, c.id),
          p.doira.korish === 'own' ? eq(conversation.seatId, p.doira.seatId ?? '00000000-0000-0000-0000-000000000000') : undefined,
        ),
      )
      .orderBy(desc(conversation.startedAt))
      .limit(50),
  ]);
  if (p.doira.korish === 'own' && bitimlar.length === 0 && qongiroqlar.length === 0) {
    throw new CrmXatosi('topilmadi', 'Kontakt topilmadi');
  }
  return {
    contact: c,
    deals: bitimlar.map((b) => ({ ...b, amount: b.amount === null ? null : Number(b.amount) })),
    calls: qongiroqlar.map((q) => ({ ...q, score: q.score === null ? null : Number(q.score) })),
  };
}

// ─── Sozlamalar: voronka, bosqich, maydon ────────────────────────────────────

export async function voronkaYarat(tx: Tx, businessId: string, name: string): Promise<string> {
  const [m] = await tx.select({ n: sql<number>`coalesce(max(${crmPipeline.sort}), -1)::int` }).from(crmPipeline);
  const [p] = await tx.insert(crmPipeline).values({ businessId, name, sort: Number(m?.n ?? -1) + 1 }).returning({ id: crmPipeline.id });
  const standart: { name: string; kind: BosqichTuri }[] = [
    { name: 'Yangi', kind: 'open' },
    { name: 'Jarayonda', kind: 'open' },
    { name: 'Muvaffaqiyatli', kind: 'won' },
    { name: "Yo'qotildi", kind: 'lost' },
  ];
  await tx.insert(crmStage).values(standart.map((s, i) => ({ businessId, pipelineId: p!.id, name: s.name, kind: s.kind, color: bosqichRangi(s.kind, i), sort: i })));
  return p!.id;
}

export async function voronkaniYangila(tx: Tx, id: string, k: { name?: string; archived?: boolean }): Promise<void> {
  const ozg: Partial<typeof crmPipeline.$inferInsert> = { updatedAt: new Date() };
  if (k.name !== undefined) ozg.name = k.name;
  if (k.archived !== undefined) {
    if (k.archived) {
      const [faol] = await tx.select({ n: count() }).from(crmPipeline).where(isNull(crmPipeline.archivedAt));
      if (Number(faol?.n ?? 0) <= 1) throw new CrmXatosi('ziddiyat', "Oxirgi voronkani arxivlab bo'lmaydi");
    }
    ozg.archivedAt = k.archived ? new Date() : null;
  }
  const r = await tx.update(crmPipeline).set(ozg).where(eq(crmPipeline.id, id)).returning({ id: crmPipeline.id });
  if (r.length === 0) throw new CrmXatosi('topilmadi', 'Voronka topilmadi');
}

export const bosqichlarKirish = z
  .array(
    z.object({
      id: z.string().uuid().optional(),
      name: z.string().trim().min(1, 'Bosqich nomini kiriting').max(100),
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      kind: z.enum(['open', 'won', 'lost']),
    }),
  )
  .min(2)
  .max(40);

/**
 * Voronka bosqichlarini to'liq ro'yxat bilan almashtiradi (tartib — massiv
 * tartibi). Olib tashlangan bosqichda bitim bo'lsa — rad: bitimlar "yetim"
 * qolmasin (TZ PIPE-01). Kamida bitta ochiq, bitta yutuq va bitta yo'qotish.
 */
export async function bosqichlarniSaqla(tx: Tx, p: { businessId: string; pipelineId: string; bosqichlar: z.infer<typeof bosqichlarKirish> }): Promise<void> {
  const b = p.bosqichlar;
  if (!b.some((x) => x.kind === 'open') || !b.some((x) => x.kind === 'won') || !b.some((x) => x.kind === 'lost')) {
    throw new CrmXatosi('yaroqsiz', "Voronkada kamida bitta ochiq, bitta muvaffaqiyatli va bitta yo'qotilgan bosqich bo'lishi kerak");
  }
  const mavjud = await tx.select({ id: crmStage.id }).from(crmStage).where(eq(crmStage.pipelineId, p.pipelineId));
  if (mavjud.length === 0) {
    const [v] = await tx.select({ id: crmPipeline.id }).from(crmPipeline).where(eq(crmPipeline.id, p.pipelineId)).limit(1);
    if (!v) throw new CrmXatosi('topilmadi', 'Voronka topilmadi');
  }
  const qoladi = new Set(b.map((x) => x.id).filter(Boolean) as string[]);
  for (const id of qoladi) {
    if (!mavjud.some((m) => m.id === id)) throw new CrmXatosi('yaroqsiz', 'Bosqich shu voronkaga tegishli emas');
  }
  const ochiriladi = mavjud.filter((m) => !qoladi.has(m.id)).map((m) => m.id);
  if (ochiriladi.length > 0) {
    const [band] = await tx
      .select({ n: count() })
      .from(deal)
      .where(and(inArray(deal.stageId, ochiriladi), isNull(deal.deletedAt)));
    if (Number(band?.n ?? 0) > 0) {
      throw new CrmXatosi('ziddiyat', "O'chirilayotgan bosqichda bitimlar bor — avval ularni boshqa bosqichga o'tkazing");
    }
  }
  let birinchi: string | null = null;
  for (const [i, x] of b.entries()) {
    const color = x.color ?? bosqichRangi(x.kind, i);
    if (x.id) {
      await tx.update(crmStage).set({ name: x.name, kind: x.kind, color, sort: i, updatedAt: new Date() }).where(eq(crmStage.id, x.id));
      birinchi ??= x.id;
    } else {
      const [s] = await tx
        .insert(crmStage)
        .values({ businessId: p.businessId, pipelineId: p.pipelineId, name: x.name, kind: x.kind, color, sort: i })
        .returning({ id: crmStage.id });
      birinchi ??= s!.id;
    }
  }
  if (ochiriladi.length > 0) {
    // Savatdagi (o'chirilgan) bitimlar bosqich o'chishiga to'sqinlik qilmasin
    await tx.update(deal).set({ stageId: birinchi! }).where(and(inArray(deal.stageId, ochiriladi), sql`${deal.deletedAt} is not null`));
    await tx.delete(crmStage).where(inArray(crmStage.id, ochiriladi));
  }
}

export const maydonKirish = z.object({
  label: z.string().trim().min(1, 'Maydon nomini kiriting').max(100),
  type: z.enum(MAYDON_TURLARI as [string, ...string[]]),
  groupName: z.string().trim().max(60).nullable().optional(),
  required: z.boolean().optional(),
  /** select/multiselect: mavjud variantlar `{id,label}`, yangilari faqat `{label}`. */
  options: z.array(z.object({ id: z.string().max(40).optional(), label: z.string().trim().min(1).max(100) })).max(200).optional(),
});

function kodYasa(label: string): string {
  const s = label
    .toLowerCase()
    .replace(/[ʻʼ'`’‘]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return s || 'maydon';
}

export async function maydonYarat(tx: Tx, businessId: string, k: z.infer<typeof maydonKirish>): Promise<string> {
  const asos = kodYasa(k.label);
  const bor = await tx.select({ code: crmField.code }).from(crmField).where(ilike(crmField.code, `${asos}%`));
  let code = asos;
  for (let i = 2; bor.some((b) => b.code === code); i++) code = `${asos}_${i}`;
  const [m] = await tx.select({ n: sql<number>`coalesce(max(${crmField.sort}), -1)::int` }).from(crmField);
  const [f] = await tx
    .insert(crmField)
    .values({
      businessId,
      code,
      label: k.label,
      type: k.type,
      groupName: k.groupName ?? null,
      required: Boolean(k.required),
      options: variantlar((k.options ?? []).map((o) => o.label)),
      sort: Number(m?.n ?? -1) + 1,
    })
    .returning({ id: crmField.id });
  return f!.id;
}

/**
 * Maydonni tahrirlash. Turi o'zgarmaydi (eski qiymatlar buzilmasin).
 * Variant label'i o'zgarsa `id` saqlanadi — tarixdagi tanlov o'zgarmaydi.
 */
export async function maydonniYangila(tx: Tx, id: string, k: Partial<z.infer<typeof maydonKirish>> & { archived?: boolean }): Promise<void> {
  const [f] = await tx.select({ id: crmField.id, options: crmField.options }).from(crmField).where(eq(crmField.id, id)).limit(1);
  if (!f) throw new CrmXatosi('topilmadi', 'Maydon topilmadi');
  const ozg: Partial<typeof crmField.$inferInsert> = { updatedAt: new Date() };
  if (k.label !== undefined) ozg.label = k.label;
  if (k.groupName !== undefined) ozg.groupName = k.groupName;
  if (k.required !== undefined) ozg.required = k.required;
  if (k.archived !== undefined) ozg.archivedAt = k.archived ? new Date() : null;
  if (k.options !== undefined) {
    const eski = (f.options as MaydonVarianti[]) ?? [];
    ozg.options = k.options.map((o) => (o.id && eski.some((e) => e.id === o.id) ? { id: o.id, label: o.label } : variantlar([o.label])[0]!));
  }
  await tx.update(crmField).set(ozg).where(eq(crmField.id, id));
}

// ─── CRM vazifalari ──────────────────────────────────────────────────────────

/**
 * Bitimlarga biriktirilgan vazifalar (CRM → Vazifalar). Holatni o'zgartirish
 * mavjud `/tasks/:id` orqali — bitta vazifa jadvali, ikki ko'rinish.
 */
export async function crmVazifalari(
  tx: Tx,
  p: { doira: CrmDoira; holat: 'open' | 'done'; limit: number; offset: number },
) {
  const ochiq = ['pending', 'in_progress', 'blocked'] as const;
  const sh: SQL[] = [isNull(deal.deletedAt)];
  sh.push(p.holat === 'open' ? inArray(task.status, [...ochiq]) : inArray(task.status, ['done', 'cancelled']));
  if (p.doira.korish === 'own') {
    const s = p.doira.seatId ?? '00000000-0000-0000-0000-000000000000';
    sh.push(or(eq(task.seatId, s), eq(deal.responsibleSeatId, s))!);
  }
  const [qatorlar, [jami]] = await Promise.all([
    tx
      .select({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        dueAt: task.dueAt,
        completedAt: task.completedAt,
        seatId: task.seatId,
        seatName: seat.displayName,
        dealId: deal.id,
        dealName: deal.name,
        stageName: crmStage.name,
        stageColor: crmStage.color,
      })
      .from(task)
      .innerJoin(deal, eq(deal.id, task.dealId))
      .innerJoin(crmStage, eq(crmStage.id, deal.stageId))
      .leftJoin(seat, eq(seat.id, task.seatId))
      .where(and(...sh))
      .orderBy(
        p.holat === 'open' ? sql`${task.dueAt} asc nulls last` : sql`${task.completedAt} desc nulls last`,
        desc(task.createdAt),
      )
      .limit(p.limit)
      .offset(p.offset),
    tx
      .select({ n: count() })
      .from(task)
      .innerJoin(deal, eq(deal.id, task.dealId))
      .where(and(...sh)),
  ]);
  return { total: Number(jami?.n ?? 0), items: qatorlar };
}
