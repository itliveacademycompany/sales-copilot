import { and, asc, count, desc, eq, ilike, inArray, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/index.js';
import {
  analysis,
  appUser,
  business,
  company,
  contact,
  conversation,
  crmField,
  crmLossReason,
  crmPipeline,
  crmStage,
  deal,
  dealEvent,
  dealItem,
  seat,
  task,
} from '../db/schema/index.js';
import { telefonKaliti } from '../integrations/crm/adapter.js';
import { kontaktTelefoni } from '../integrations/crm/lidlar.js';
import { bosqichRangi, MAYDON_TURLARI, SHABLONLAR, variantlar, type BosqichTuri, type Shablon } from './shablon.js';
import { radSabablariniBoshla, sozlamaniBoshla, sozlamaniOl } from './sozlama.js';

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

export { CrmXatosi } from './xato.js';
import { CrmXatosi } from './xato.js';

/** Kim nimani ko'radi va o'zgartiradi. `own` — faqat mas'uli o'zi bo'lgan bitimlar. */
export interface CrmDoira {
  korish: 'all' | 'own';
  yozish: 'all' | 'own';
  seatId: string | null;
}

export function korishSharti(d: CrmDoira): SQL | undefined {
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
  await crmSozlamalariniBoshla(tx, businessId);
}

/** Sozlama qatori va standart rad sabablari — bir marta (idempotent). */
export async function crmSozlamalariniBoshla(tx: Tx, businessId: string): Promise<void> {
  await sozlamaniBoshla(tx, businessId);
  await radSabablariniBoshla(tx, businessId);
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

/** Telefon kaliti (oxirgi 9 raqam) asosiy yoki qo'shimcha raqamlardan biriga mos. */
export function telefonSharti(kalit: string): SQL {
  return sql`(right(regexp_replace(coalesce(${contact.phone}, ''), '\\D', '', 'g'), 9) = ${kalit}
    or exists (select 1 from unnest(${contact.phones}) as p(v) where right(regexp_replace(p.v, '\\D', '', 'g'), 9) = ${kalit}))`;
}

/** Teglar: bo'shliqlar olinadi, takrorlar va bo'shlari tashlanadi. */
export function teglarniTozala(teglar: string[] | undefined | null): string[] {
  const natija: string[] = [];
  for (const t of teglar ?? []) {
    const s = t.trim().replace(/\s+/g, ' ').slice(0, 50);
    if (s && !natija.some((x) => x.toLowerCase() === s.toLowerCase())) natija.push(s);
  }
  return natija.slice(0, 30);
}

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
      .where(telefonSharti(kalit))
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
  tags: z.array(z.string().max(60)).max(30).optional(),
  companyId: z.string().uuid().nullable().optional(),
});

export async function kompaniyaniTekshir(tx: Tx, id: string | null | undefined): Promise<void> {
  if (!id) return;
  const [c] = await tx.select({ id: company.id }).from(company).where(eq(company.id, id)).limit(1);
  if (!c) throw new CrmXatosi('yaroqsiz', 'Kompaniya topilmadi');
}

export async function bosqichniOl(tx: Tx, stageId: string) {
  const [b] = await tx
    .select({ id: crmStage.id, pipelineId: crmStage.pipelineId, kind: crmStage.kind, name: crmStage.name })
    .from(crmStage)
    .where(eq(crmStage.id, stageId))
    .limit(1);
  return b ?? null;
}

export async function seatniTekshir(tx: Tx, seatId: string | null | undefined): Promise<void> {
  if (!seatId) return;
  const [s] = await tx.select({ id: seat.id }).from(seat).where(eq(seat.id, seatId)).limit(1);
  if (!s) throw new CrmXatosi('yaroqsiz', "Mas'ul topilmadi");
}

export async function bitimYarat(
  tx: Tx,
  p: { businessId: string; userId: string | null; doira: CrmDoira; kirish: z.infer<typeof bitimKirish> },
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
  await kompaniyaniTekshir(tx, k.companyId);
  // Kompaniya ko'rsatilmasa — kontaktnikidan
  let companyId = k.companyId ?? null;
  if (!companyId && contactId) {
    const [c] = await tx.select({ companyId: contact.companyId }).from(contact).where(eq(contact.id, contactId)).limit(1);
    companyId = c?.companyId ?? null;
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
      companyId,
      tags: teglarniTozala(k.tags),
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
    data: { stageId: b.id, stageName: b.name, source: k.source ?? null },
    authorUserId: p.userId,
  });
  return d!.id;
}

/** Bitimni ko'rish doirasida topadi; yo'q yoki ruxsat yo'q — 404 (mavjudligi oshkor qilinmaydi). */
export async function bitimniOl(tx: Tx, id: string, doira: CrmDoira, savatdan = false) {
  const [d] = await tx
    .select()
    .from(deal)
    .where(and(eq(deal.id, id), savatdan ? sql`${deal.deletedAt} is not null` : isNull(deal.deletedAt), korishSharti(doira)))
    .limit(1);
  if (!d) throw new CrmXatosi('topilmadi', 'Bitim topilmadi');
  return d;
}

export function yozaOladimi(d: { responsibleSeatId: string | null }, doira: CrmDoira): void {
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
  companyId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
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
  if (k.companyId !== undefined && k.companyId !== d.companyId) {
    await kompaniyaniTekshir(tx, k.companyId);
    ozgarish.companyId = k.companyId;
    hodisalar.push({ type: 'company', data: { before: d.companyId, after: k.companyId } });
  }
  if (k.tags !== undefined) {
    const yangi = teglarniTozala(k.tags);
    if (JSON.stringify(yangi) !== JSON.stringify(d.tags ?? [])) {
      ozgarish.tags = yangi;
      hodisalar.push({ type: 'tags', data: { before: d.tags ?? [], after: yangi } });
    }
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
  lostReasonId: z.string().uuid().nullable().optional(),
});

/**
 * Bosqichga (boshqa voronkaga ham) ko'chirish — bitta tarix hodisasi.
 * Yo'qotilganda sabab: katalogdan (`lostReasonId`) va/yoki izoh;
 * sozlamada majburiy bo'lsa — biri bo'lishi shart (PIPE-03).
 */
export async function bitimniKochir(
  tx: Tx,
  p: { id: string; userId: string | null; doira: CrmDoira; kirish: z.infer<typeof bitimKochirish>; avtomatika?: string },
): Promise<void> {
  const d = await bitimniOl(tx, p.id, p.doira);
  yozaOladimi(d, p.doira);
  if (d.stageId === p.kirish.stageId) return;
  const [eski, yangi] = await Promise.all([bosqichniOl(tx, d.stageId), bosqichniOl(tx, p.kirish.stageId)]);
  if (!yangi) throw new CrmXatosi('yaroqsiz', 'Bosqich topilmadi');
  let sababNomi: string | null = null;
  if (yangi.kind === 'lost') {
    if (p.kirish.lostReasonId) {
      const [r] = await tx.select({ name: crmLossReason.name }).from(crmLossReason).where(eq(crmLossReason.id, p.kirish.lostReasonId)).limit(1);
      if (!r) throw new CrmXatosi('yaroqsiz', 'Rad sababi topilmadi');
      sababNomi = r.name;
    } else if (!p.avtomatika && !p.kirish.lostReason) {
      const s = await sozlamaniOl(tx);
      if (s.lossReasonRequired) throw new CrmXatosi('yaroqsiz', "Yo'qotish sababini tanlang");
    }
  }
  const izoh = p.kirish.lostReason ?? null;
  const hozir = new Date();
  await tx
    .update(deal)
    .set({
      stageId: yangi.id,
      pipelineId: yangi.pipelineId,
      stageEnteredAt: hozir,
      closedAt: yangi.kind === 'open' ? null : hozir,
      lostReason: yangi.kind === 'lost' ? (izoh ?? sababNomi) : null,
      lostReasonId: yangi.kind === 'lost' ? (p.kirish.lostReasonId ?? null) : null,
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
      lostReason: yangi.kind === 'lost' ? (izoh ?? sababNomi) : undefined,
      lostReasonId: yangi.kind === 'lost' ? (p.kirish.lostReasonId ?? undefined) : undefined,
      automation: p.avtomatika,
    },
    authorUserId: p.userId,
  });
}

/** Savatga (LEAD-10) — 30 kun ichida tiklanadi. */
export async function bitimniOchir(tx: Tx, p: { id: string; doira: CrmDoira; userId?: string | null }): Promise<void> {
  const d = await bitimniOl(tx, p.id, p.doira);
  yozaOladimi(d, p.doira);
  await tx.update(deal).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(deal.id, d.id));
  await tx.insert(dealEvent).values({ businessId: d.businessId, dealId: d.id, type: 'deleted', data: {}, authorUserId: p.userId ?? null });
}

export const SAVAT_KUNI = 30;

export async function bitimniTikla(tx: Tx, p: { id: string; doira: CrmDoira; userId: string }): Promise<void> {
  const d = await bitimniOl(tx, p.id, p.doira, true);
  yozaOladimi(d, p.doira);
  if (d.deletedAt && Date.now() - d.deletedAt.getTime() > SAVAT_KUNI * 86_400_000) {
    throw new CrmXatosi('ziddiyat', `Bitim ${SAVAT_KUNI} kundan oldin o'chirilgan — tiklab bo'lmaydi`);
  }
  await tx.update(deal).set({ deletedAt: null, updatedAt: new Date(), version: sql`${deal.version} + 1` }).where(eq(deal.id, d.id));
  await tx.insert(dealEvent).values({ businessId: d.businessId, dealId: d.id, type: 'restored', data: {}, authorUserId: p.userId });
}

/** Savatdan butunlay o'chirish — alohida amal, faqat rahbar (purge). */
export async function bitimniButunlayOchir(tx: Tx, p: { id: string; doira: CrmDoira }): Promise<void> {
  if (p.doira.yozish !== 'all') throw new CrmXatosi('ruxsat', "Butunlay o'chirish faqat rahbarga ruxsat");
  const d = await bitimniOl(tx, p.id, p.doira, true);
  await tx.update(task).set({ dealId: null }).where(eq(task.dealId, d.id));
  await tx.delete(deal).where(eq(deal.id, d.id));
}

export async function izohQosh(tx: Tx, p: { id: string; userId: string; doira: CrmDoira; matn: string }): Promise<void> {
  const d = await bitimniOl(tx, p.id, p.doira);
  await tx.insert(dealEvent).values({ businessId: d.businessId, dealId: d.id, type: 'note', data: { text: p.matn }, authorUserId: p.userId });
}

export async function bitimVazifasi(
  tx: Tx,
  p: {
    id: string;
    userId: string | null;
    doira: CrmDoira;
    title: string;
    dueAt: Date | null;
    description: string | null;
    taskType?: string | null;
    seatId?: string | null;
    avtomatika?: string;
  },
): Promise<string> {
  const d = await bitimniOl(tx, p.id, p.doira);
  yozaOladimi(d, p.doira);
  // Sotuvchi faqat o'ziga; rahbar boshqa xodimga ham qo'ya oladi
  const masul = p.doira.yozish === 'own' ? p.doira.seatId : (p.seatId ?? d.responsibleSeatId);
  await seatniTekshir(tx, masul);
  const [t] = await tx
    .insert(task)
    .values({
      businessId: d.businessId,
      dealId: d.id,
      contactId: d.contactId,
      seatId: masul,
      source: 'manual',
      taskType: p.taskType ?? 'call',
      title: p.title,
      description: p.description,
      dueAt: p.dueAt,
      createdBy: p.userId,
      // Ichki CRM vazifasi tashqi webhook eksportiga tushmaydi
      exportedAt: new Date(),
    })
    .returning({ id: task.id });
  await tx.insert(dealEvent).values({
    businessId: d.businessId,
    dealId: d.id,
    type: 'task',
    data: { taskId: t!.id, title: p.title, dueAt: p.dueAt?.toISOString() ?? null, automation: p.avtomatika },
    authorUserId: p.userId,
  });
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
    closedAt: deal.closedAt,
    deletedAt: deal.deletedAt,
    version: deal.version,
    tags: deal.tags,
    source: deal.source,
    companyId: deal.companyId,
    lostReason: deal.lostReason,
    /** Eng yaqin ochiq vazifa muddati — "vazifasiz bitim" belgisi uchun. */
    nextTaskAt: sql<Date | null>`(select min(t.due_at) from task t where t.deal_id = "deal"."id" and t.status in ('pending','in_progress','blocked'))`,
    openTasks: sql<number>`(select count(*)::int from task t where t.deal_id = "deal"."id" and t.status in ('pending','in_progress','blocked'))`,
  };
}

/**
 * Bitimlar filtri (LEAD-08). Shartlar o'zaro VA (AND); ro'yxat ichidagi
 * qiymatlar (bosqichlar, mas'ullar) — YOKI. Teglar: hammasi bo'lishi shart.
 */
export const bitimFiltrSxemasi = z.object({
  q: z.string().trim().max(100).optional(),
  seat: z.string().uuid().optional(),
  seats: z.array(z.string().uuid()).max(100).optional(),
  stages: z.array(z.string().uuid()).max(100).optional(),
  status: z.enum(['open', 'won', 'lost', 'closed']).optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  /** none — ochiq vazifasiz; overdue — muddati o'tgan; today — bugungi */
  task: z.enum(['none', 'overdue', 'today']).optional(),
  createdFrom: z.string().datetime({ offset: true }).optional(),
  createdTo: z.string().datetime({ offset: true }).optional(),
  closedFrom: z.string().datetime({ offset: true }).optional(),
  closedTo: z.string().datetime({ offset: true }).optional(),
  amountMin: z.coerce.number().optional(),
  amountMax: z.coerce.number().optional(),
  source: z.string().max(100).optional(),
  companyId: z.string().uuid().optional(),
  lostReasonId: z.string().uuid().optional(),
  /** Savat (o'chirilganlar) ko'rinishi. */
  trash: z.boolean().optional(),
});
export type BitimFiltr = z.infer<typeof bitimFiltrSxemasi>;

const OCHIQ_VAZIFA = sql`('pending','in_progress','blocked')`;

function filtrShartlari(f: BitimFiltr, doira: CrmDoira): SQL[] {
  const sh: SQL[] = [f.trash ? sql`${deal.deletedAt} is not null and ${deal.deletedAt} > now() - interval '30 days'` : isNull(deal.deletedAt)];
  const k = korishSharti(doira);
  if (k) sh.push(k);
  if (f.seat && doira.korish === 'all') sh.push(eq(deal.responsibleSeatId, f.seat));
  if (f.seats?.length && doira.korish === 'all') sh.push(inArray(deal.responsibleSeatId, f.seats));
  if (f.stages?.length) sh.push(inArray(deal.stageId, f.stages));
  if (f.status) {
    const turlar = f.status === 'closed' ? sql`('won','lost')` : f.status === 'open' ? sql`('open')` : f.status === 'won' ? sql`('won')` : sql`('lost')`;
    sh.push(sql`${deal.stageId} in (select s.id from crm_stage s where s.kind::text in ${turlar})`);
  }
  if (f.tags?.length) sh.push(sql`${deal.tags} @> ARRAY[${sql.join(f.tags.map((t) => sql`${t}`), sql`, `)}]::text[]`);
  if (f.task === 'none') sh.push(sql`not exists (select 1 from task t where t.deal_id = ${deal.id} and t.status in ${OCHIQ_VAZIFA})`);
  if (f.task === 'overdue') sh.push(sql`exists (select 1 from task t where t.deal_id = ${deal.id} and t.status in ${OCHIQ_VAZIFA} and t.due_at < now())`);
  if (f.task === 'today')
    sh.push(sql`exists (select 1 from task t where t.deal_id = ${deal.id} and t.status in ${OCHIQ_VAZIFA} and t.due_at >= date_trunc('day', now()) and t.due_at < date_trunc('day', now()) + interval '1 day')`);
  if (f.createdFrom) sh.push(sql`${deal.createdAt} >= ${f.createdFrom}`);
  if (f.createdTo) sh.push(sql`${deal.createdAt} < ${f.createdTo}`);
  if (f.closedFrom) sh.push(sql`${deal.closedAt} >= ${f.closedFrom}`);
  if (f.closedTo) sh.push(sql`${deal.closedAt} < ${f.closedTo}`);
  if (f.amountMin !== undefined && Number.isFinite(f.amountMin)) sh.push(sql`coalesce(${deal.amount}, 0) >= ${f.amountMin}`);
  if (f.amountMax !== undefined && Number.isFinite(f.amountMax)) sh.push(sql`coalesce(${deal.amount}, 0) <= ${f.amountMax}`);
  if (f.source) sh.push(eq(deal.source, f.source));
  if (f.companyId) sh.push(eq(deal.companyId, f.companyId));
  if (f.lostReasonId) sh.push(eq(deal.lostReasonId, f.lostReasonId));
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
  p: {
    pipelineId?: string;
    stageId?: string;
    doira: CrmDoira;
    filtr: BitimFiltr;
    limit: number;
    offset: number;
    sort?: 'updated' | 'created' | 'amount' | 'name' | 'stage';
    dir?: 'asc' | 'desc';
  },
) {
  const sh = filtrShartlari(p.filtr, p.doira);
  if (p.pipelineId) sh.push(eq(deal.pipelineId, p.pipelineId));
  if (p.stageId) sh.push(eq(deal.stageId, p.stageId));
  const yon = p.dir === 'asc' ? asc : desc;
  const ustun =
    p.sort === 'created'
      ? deal.createdAt
      : p.sort === 'amount'
        ? sql`coalesce(${deal.amount}, 0)`
        : p.sort === 'name'
          ? deal.name
          : p.sort === 'stage'
            ? deal.stageEnteredAt
            : deal.updatedAt;
  const [qatorlar, [jami]] = await Promise.all([
    tx
      .select(kartaUstunlari())
      .from(deal)
      .leftJoin(contact, eq(contact.id, deal.contactId))
      .leftJoin(seat, eq(seat.id, deal.responsibleSeatId))
      .where(and(...sh))
      .orderBy(yon(ustun), desc(deal.id))
      .limit(p.limit)
      .offset(p.offset),
    tx
      .select({ n: count(), sum: sql<string | null>`sum(${deal.amount})` })
      .from(deal)
      .leftJoin(contact, eq(contact.id, deal.contactId))
      .where(and(...sh)),
  ]);
  return {
    total: Number(jami?.n ?? 0),
    sum: jami?.sum ? Number(jami.sum) : 0,
    items: qatorlar.map((q) => ({ ...q, amount: q.amount === null ? null : Number(q.amount) })),
  };
}

/** Filtrga mos barcha bitim IDlari (ommaviy amal "hammasini tanlash" uchun, ko'pi bilan 5000). */
export async function filtrIdlari(tx: Tx, p: { pipelineId?: string; doira: CrmDoira; filtr: BitimFiltr }): Promise<string[]> {
  const sh = filtrShartlari(p.filtr, p.doira);
  if (p.pipelineId) sh.push(eq(deal.pipelineId, p.pipelineId));
  const r = await tx
    .select({ id: deal.id })
    .from(deal)
    .leftJoin(contact, eq(contact.id, deal.contactId))
    .where(and(...sh))
    .limit(5000);
  return r.map((x) => x.id);
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
  const [kompaniya, tovarlar, sabab] = await Promise.all([
    d.companyId
      ? tx
          .select({ id: company.id, name: company.name, phone: company.phone, website: company.website })
          .from(company)
          .where(eq(company.id, d.companyId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    tx
      .select({
        id: dealItem.id,
        productId: dealItem.productId,
        name: dealItem.name,
        price: dealItem.price,
        quantity: dealItem.quantity,
        discount: dealItem.discount,
      })
      .from(dealItem)
      .where(eq(dealItem.dealId, d.id))
      .orderBy(asc(dealItem.createdAt)),
    d.lostReasonId
      ? tx.select({ id: crmLossReason.id, name: crmLossReason.name }).from(crmLossReason).where(eq(crmLossReason.id, d.lostReasonId)).limit(1).then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  const [kontakt, tarix, vazifalar, qongiroqlar, masul] = await Promise.all([
    d.contactId
      ? tx
          .select({
            id: contact.id,
            name: contact.name,
            phone: contact.phone,
            phones: contact.phones,
            email: contact.email,
            emails: contact.emails,
            company: contact.company,
            role: contact.role,
          })
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
        taskType: task.taskType,
        result: task.result,
        conversationId: task.conversationId,
        seatId: task.seatId,
        seatName: seat.displayName,
        completedAt: task.completedAt,
        createdAt: task.createdAt,
      })
      .from(task)
      .leftJoin(conversation, eq(conversation.id, task.conversationId))
      .leftJoin(seat, eq(seat.id, task.seatId))
      .where(
        or(
          eq(task.dealId, d.id),
          // Shu mijozning bitimsiz vazifalari: SotuvAI tahlilidan yoki kontaktga qo'yilgan
          d.contactId
            ? and(isNull(task.dealId), or(eq(conversation.contactId, d.contactId), eq(task.contactId, d.contactId)))
            : sql`false`,
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
    company: kompaniya,
    lossReason: sabab,
    items: tovarlar.map((t) => ({ ...t, price: Number(t.price), quantity: Number(t.quantity), discount: Number(t.discount) })),
    contact: kontakt,
    responsible: masul,
    events: tarix,
    tasks: vazifalar,
    calls: qongiroqlar.map((c) => ({ ...c, score: c.score === null ? null : Number(c.score) })),
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

// ─── Ommaviy amallar (LEAD-09) ───────────────────────────────────────────────

export const ommaviySxema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(['stage', 'responsible', 'tag_add', 'tag_remove', 'task', 'delete', 'restore', 'purge']),
  stageId: z.string().uuid().optional(),
  lostReasonId: z.string().uuid().nullable().optional(),
  seatId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string().max(60)).max(20).optional(),
  task: z
    .object({
      title: z.string().trim().min(1).max(300),
      taskType: z.string().max(40).default('call'),
      dueAt: z.string().datetime({ offset: true }).nullable().optional(),
    })
    .optional(),
});

/**
 * Har bitim alohida tekshiriladi (ruxsat, holat). Natija — har ID uchun
 * ok/xato; bittasining xatosi boshqalarini to'xtatmaydi (partial failure).
 * Mantiqiy xatolar yozuvdan OLDIN aniqlanadi — tranzaksiya buzilmaydi.
 */
export async function ommaviyAmal(
  tx: Tx,
  p: { userId: string; doira: CrmDoira; kirish: z.infer<typeof ommaviySxema> },
): Promise<{ id: string; ok: boolean; xato?: string }[]> {
  const k = p.kirish;
  const natija: { id: string; ok: boolean; xato?: string }[] = [];
  if (k.action === 'stage' && !k.stageId) throw new CrmXatosi('yaroqsiz', 'Bosqichni tanlang');
  if (k.action === 'responsible' && p.doira.yozish === 'own') throw new CrmXatosi('ruxsat', "Mas'ulni faqat rahbar o'zgartira oladi");
  if ((k.action === 'tag_add' || k.action === 'tag_remove') && !k.tags?.length) throw new CrmXatosi('yaroqsiz', 'Tegni kiriting');
  if (k.action === 'task' && !k.task) throw new CrmXatosi('yaroqsiz', 'Vazifa matnini kiriting');
  if (k.action === 'responsible') await seatniTekshir(tx, k.seatId);
  const teglar = teglarniTozala(k.tags);

  for (const id of [...new Set(k.ids)]) {
    try {
      if (k.action === 'stage') {
        await bitimniKochir(tx, { id, userId: p.userId, doira: p.doira, kirish: { stageId: k.stageId!, lostReasonId: k.lostReasonId ?? null } });
      } else if (k.action === 'delete') {
        await bitimniOchir(tx, { id, doira: p.doira, userId: p.userId });
      } else if (k.action === 'restore') {
        await bitimniTikla(tx, { id, doira: p.doira, userId: p.userId });
      } else if (k.action === 'purge') {
        await bitimniButunlayOchir(tx, { id, doira: p.doira });
      } else if (k.action === 'task') {
        await bitimVazifasi(tx, {
          id,
          userId: p.userId,
          doira: p.doira,
          title: k.task!.title,
          taskType: k.task!.taskType,
          dueAt: k.task!.dueAt ? new Date(k.task!.dueAt) : null,
          description: null,
        });
      } else {
        const d = await bitimniOl(tx, id, p.doira);
        yozaOladimi(d, p.doira);
        const ozg: Partial<typeof deal.$inferInsert> = {};
        let hodisa: { type: string; data: Record<string, unknown> } | null = null;
        if (k.action === 'responsible') {
          if (d.responsibleSeatId !== (k.seatId ?? null)) {
            ozg.responsibleSeatId = k.seatId ?? null;
            hodisa = { type: 'responsible', data: { before: d.responsibleSeatId, after: k.seatId ?? null } };
          }
        } else {
          const eski = d.tags ?? [];
          const yangi =
            k.action === 'tag_add'
              ? teglarniTozala([...eski, ...teglar])
              : eski.filter((t) => !teglar.some((x) => x.toLowerCase() === t.toLowerCase()));
          if (JSON.stringify(yangi) !== JSON.stringify(eski)) {
            ozg.tags = yangi;
            hodisa = { type: 'tags', data: { before: eski, after: yangi } };
          }
        }
        if (hodisa) {
          await tx.update(deal).set({ ...ozg, version: sql`${deal.version} + 1`, updatedAt: new Date() }).where(eq(deal.id, d.id));
          await tx.insert(dealEvent).values({ businessId: d.businessId, dealId: d.id, type: hodisa.type, data: hodisa.data, authorUserId: p.userId });
        }
      }
      natija.push({ id, ok: true });
    } catch (e) {
      if (!(e instanceof CrmXatosi)) throw e;
      natija.push({ id, ok: false, xato: e.message });
    }
  }
  return natija;
}

// ─── Teglar kutubxonasi (LEAD-11) ────────────────────────────────────────────

export async function teglar(tx: Tx): Promise<{ tag: string; count: number }[]> {
  const r = await tx
    .select({ tag: sql<string>`t.v`, count: sql<number>`count(*)::int` })
    .from(sql`${deal}, unnest(${deal.tags}) as t(v)`)
    .where(isNull(deal.deletedAt))
    .groupBy(sql`t.v`)
    .orderBy(sql`count(*) desc`, sql`t.v`)
    .limit(500);
  return r;
}

/** Tegni hamma bitimlarda qayta nomlash yoki (yangi nom bo'sh bo'lsa) o'chirish. */
export async function tegniOzgartir(tx: Tx, p: { eski: string; yangi: string | null }): Promise<number> {
  const yangi = p.yangi ? teglarniTozala([p.yangi])[0] ?? null : null;
  const r = await tx
    .update(deal)
    .set({
      tags: yangi
        ? sql`(select coalesce(array_agg(distinct x), '{}') from unnest(array_replace(${deal.tags}, ${p.eski}, ${yangi})) as x)`
        : sql`array_remove(${deal.tags}, ${p.eski})`,
      updatedAt: new Date(),
    })
    .where(sql`${p.eski} = any(${deal.tags})`)
    .returning({ id: deal.id });
  return r.length;
}

/**
 * Tranzaksiya vaqt zonasini biznesnikiga o'rnatadi — "bugun", "ertaga",
 * kun bo'yicha trend biznes kalendari bo'yicha hisoblanadi (UTC emas).
 */
export async function vaqtZonasiniOrnat(tx: Tx, businessId: string): Promise<void> {
  const [b] = await tx.select({ tz: business.timezone }).from(business).where(eq(business.id, businessId)).limit(1);
  const tz = b?.tz && /^[A-Za-z_+\-/0-9]{1,64}$/.test(b.tz) ? b.tz : 'Asia/Tashkent';
  await tx.execute(sql`select set_config('TimeZone', ${tz}, true)`);
}
