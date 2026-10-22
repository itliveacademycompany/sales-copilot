import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/index.js';
import {
  analysis,
  company,
  contact,
  conversation,
  crmInbox,
  crmLead,
  crmPipeline,
  crmStage,
  deal,
  dealEvent,
  seat,
  task,
} from '../db/schema/index.js';
import { telefonKaliti } from '../integrations/crm/adapter.js';
import { kontaktTelefoni } from '../integrations/crm/lidlar.js';
import { CrmXatosi } from './xato.js';
import { korishSharti, telefonSharti, type CrmDoira } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — kontaktlar, kompaniyalar, dublikatlar (CONT-01..04, LEAD-12)
 * ═══════════════════════════════════════════════════════════════════════════
 */

const BOSH_UUID = '00000000-0000-0000-0000-000000000000';

/** Raqam bo'yicha qidiruv: asosiy va qo'shimcha telefonlarda. */
function raqamQidiruvi(raqam: string): SQL {
  return sql`(regexp_replace(coalesce(${contact.phone}, ''), '\\D', '', 'g') like ${`%${raqam}%`}
    or exists (select 1 from unnest(${contact.phones}) as p(v) where regexp_replace(p.v, '\\D', '', 'g') like ${`%${raqam}%`}))`;
}

/** Menejer — faqat o'z bitimlari yoki o'z qo'ng'iroqlari bor kontaktlar. */
function kontaktDoirasi(doira: CrmDoira): SQL | undefined {
  if (doira.korish !== 'own') return undefined;
  const s = doira.seatId ?? BOSH_UUID;
  return sql`(exists (select 1 from ${deal} where ${deal.contactId} = ${contact.id} and ${deal.responsibleSeatId} = ${s} and ${deal.deletedAt} is null)
    or exists (select 1 from ${conversation} where ${conversation.contactId} = ${contact.id} and ${conversation.seatId} = ${s})
    or exists (select 1 from ${task} where ${task.contactId} = ${contact.id} and ${task.seatId} = ${s}))`;
}

// ─── Kontaktlar ──────────────────────────────────────────────────────────────

export async function kontaktlarRoyxati(
  tx: Tx,
  p: { q?: string; companyId?: string; limit: number; offset: number; doira: CrmDoira },
) {
  const sh: SQL[] = [];
  if (p.q) {
    const raqam = p.q.replace(/\D/g, '');
    const s = or(
      ilike(contact.name, `%${p.q}%`),
      ilike(contact.company, `%${p.q}%`),
      ilike(contact.email, `%${p.q}%`),
      ...(raqam.length >= 4 ? [raqamQidiruvi(raqam)] : []),
    );
    if (s) sh.push(s);
  }
  if (p.companyId) sh.push(eq(contact.companyId, p.companyId));
  const d = kontaktDoirasi(p.doira);
  if (d) sh.push(d);
  const where = sh.length ? and(...sh) : undefined;
  const [qatorlar, [jami]] = await Promise.all([
    tx
      .select({
        id: contact.id,
        name: contact.name,
        phone: contact.phone,
        phones: contact.phones,
        email: contact.email,
        company: contact.company,
        companyId: contact.companyId,
        companyName: company.name,
        role: contact.role,
        lastSeenAt: contact.lastSeenAt,
        // Bir nechta jadvalli select — ichki so'rovda aniq nomlar
        deals: sql<number>`(select count(*)::int from deal d where d.contact_id = "contact"."id" and d.deleted_at is null)`,
        calls: sql<number>`(select count(*)::int from conversation cv where cv.contact_id = "contact"."id")`,
      })
      .from(contact)
      .leftJoin(company, eq(company.id, contact.companyId))
      .where(where)
      .orderBy(desc(contact.lastSeenAt), desc(contact.id))
      .limit(p.limit)
      .offset(p.offset),
    tx.select({ n: count() }).from(contact).where(where),
  ]);
  return { total: Number(jami?.n ?? 0), items: qatorlar };
}

const telefonlar = z.array(z.string().trim().max(40)).max(10);
const emaillar = z.array(z.string().trim().email("Email noto'g'ri").max(200)).max(10);

export const kontaktKirish = z.object({
  name: z.string().trim().min(1, 'Ismni kiriting').max(200),
  phone: z.string().trim().max(40).nullable().optional(),
  phones: telefonlar.optional(),
  email: z.string().trim().email("Email noto'g'ri").max(200).nullable().optional().or(z.literal('')),
  emails: emaillar.optional(),
  company: z.string().trim().max(200).nullable().optional(),
  companyId: z.string().uuid().nullable().optional(),
  role: z.string().trim().max(120).nullable().optional(),
});

/** Telefonlar: normallashtiriladi, takror va asosiy raqam bilan bir xillari olib tashlanadi. */
function qoshimchaTelefonlar(asosiy: string | null, royxat: string[] | undefined): string[] {
  const asosiyKalit = telefonKaliti(asosiy);
  const natija: string[] = [];
  const kalitlar = new Set<string>(asosiyKalit ? [asosiyKalit] : []);
  for (const t of royxat ?? []) {
    const k = telefonKaliti(t);
    if (!k || kalitlar.has(k)) continue;
    kalitlar.add(k);
    natija.push(kontaktTelefoni(t) ?? t);
  }
  return natija;
}

async function telefonBandmi(tx: Tx, raqamlar: (string | null | undefined)[], tashqari?: string): Promise<boolean> {
  for (const r of raqamlar) {
    const k = telefonKaliti(r ?? null);
    if (!k) continue;
    const [bor] = await tx
      .select({ id: contact.id })
      .from(contact)
      .where(and(telefonSharti(k), tashqari ? sql`${contact.id} <> ${tashqari}` : undefined))
      .limit(1);
    if (bor) return true;
  }
  return false;
}

async function kompaniyaBormi(tx: Tx, id: string | null | undefined): Promise<void> {
  if (!id) return;
  const [c] = await tx.select({ id: company.id }).from(company).where(eq(company.id, id)).limit(1);
  if (!c) throw new CrmXatosi('yaroqsiz', 'Kompaniya topilmadi');
}

export async function kontaktYarat(tx: Tx, businessId: string, k: z.infer<typeof kontaktKirish>): Promise<string> {
  const asosiy = k.phone ? kontaktTelefoni(k.phone) : null;
  const qoshimcha = qoshimchaTelefonlar(asosiy, k.phones);
  if (await telefonBandmi(tx, [asosiy, ...qoshimcha])) throw new CrmXatosi('ziddiyat', 'Bu raqamli kontakt allaqachon bor');
  await kompaniyaBormi(tx, k.companyId);
  const [c] = await tx
    .insert(contact)
    .values({
      businessId,
      name: k.name,
      phone: asosiy,
      phones: qoshimcha,
      email: k.email || null,
      emails: (k.emails ?? []).filter((e) => e && e !== k.email),
      company: k.company ?? null,
      companyId: k.companyId ?? null,
      role: k.role ?? null,
    })
    .returning({ id: contact.id });
  return c!.id;
}

export async function kontaktniYangila(tx: Tx, id: string, k: Partial<z.infer<typeof kontaktKirish>>): Promise<void> {
  const [eski] = await tx.select({ phone: contact.phone }).from(contact).where(eq(contact.id, id)).limit(1);
  if (!eski) throw new CrmXatosi('topilmadi', 'Kontakt topilmadi');
  const ozg: Partial<typeof contact.$inferInsert> = {};
  if (k.name !== undefined) ozg.name = k.name;
  if (k.phone !== undefined) ozg.phone = k.phone ? kontaktTelefoni(k.phone) : null;
  if (k.phones !== undefined) ozg.phones = qoshimchaTelefonlar(ozg.phone !== undefined ? ozg.phone : eski.phone, k.phones);
  const yangiRaqamlar = [...(ozg.phone !== undefined ? [ozg.phone] : []), ...(ozg.phones ?? [])];
  if (yangiRaqamlar.length && (await telefonBandmi(tx, yangiRaqamlar, id))) {
    throw new CrmXatosi('ziddiyat', 'Bu raqam boshqa kontaktda bor — dublikatlarni birlashtiring');
  }
  if (k.email !== undefined) ozg.email = k.email || null;
  if (k.emails !== undefined) ozg.emails = k.emails.filter(Boolean);
  if (k.company !== undefined) ozg.company = k.company ?? null;
  if (k.companyId !== undefined) {
    await kompaniyaBormi(tx, k.companyId);
    ozg.companyId = k.companyId;
  }
  if (k.role !== undefined) ozg.role = k.role ?? null;
  await tx.update(contact).set(ozg).where(eq(contact.id, id));
}

export async function kontaktKartochkasi(tx: Tx, p: { id: string; doira: CrmDoira }) {
  const [c] = await tx
    .select({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      phones: contact.phones,
      email: contact.email,
      emails: contact.emails,
      company: contact.company,
      companyId: contact.companyId,
      companyName: company.name,
      role: contact.role,
      firstSeenAt: contact.firstSeenAt,
      lastSeenAt: contact.lastSeenAt,
    })
    .from(contact)
    .leftJoin(company, eq(company.id, contact.companyId))
    .where(eq(contact.id, p.id))
    .limit(1);
  if (!c) throw new CrmXatosi('topilmadi', 'Kontakt topilmadi');
  const sh = [eq(deal.contactId, c.id), isNull(deal.deletedAt)];
  const k = korishSharti(p.doira);
  if (k) sh.push(k);
  const ownSeat = p.doira.seatId ?? BOSH_UUID;
  const [bitimlar, qongiroqlar, vazifalar] = await Promise.all([
    tx
      .select({
        id: deal.id,
        name: deal.name,
        amount: deal.amount,
        stageName: crmStage.name,
        stageKind: crmStage.kind,
        stageColor: crmStage.color,
        pipelineName: crmPipeline.name,
        updatedAt: deal.updatedAt,
      })
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
      .where(and(eq(conversation.contactId, c.id), p.doira.korish === 'own' ? eq(conversation.seatId, ownSeat) : undefined))
      .orderBy(desc(conversation.startedAt))
      .limit(50),
    tx
      .select({
        id: task.id,
        title: task.title,
        status: task.status,
        dueAt: task.dueAt,
        taskType: task.taskType,
        dealId: task.dealId,
        seatName: seat.displayName,
      })
      .from(task)
      .leftJoin(seat, eq(seat.id, task.seatId))
      .where(
        and(
          eq(task.contactId, c.id),
          inArray(task.status, ['pending', 'in_progress', 'blocked']),
          p.doira.korish === 'own' ? eq(task.seatId, ownSeat) : undefined,
        ),
      )
      .orderBy(asc(task.dueAt))
      .limit(50),
  ]);
  if (p.doira.korish === 'own' && bitimlar.length === 0 && qongiroqlar.length === 0 && vazifalar.length === 0) {
    throw new CrmXatosi('topilmadi', 'Kontakt topilmadi');
  }
  return {
    contact: c,
    deals: bitimlar.map((b) => ({ ...b, amount: b.amount === null ? null : Number(b.amount) })),
    calls: qongiroqlar.map((q) => ({ ...q, score: q.score === null ? null : Number(q.score) })),
    tasks: vazifalar,
  };
}

// ─── Kompaniyalar ────────────────────────────────────────────────────────────

export const kompaniyaKirish = z.object({
  name: z.string().trim().min(1, 'Kompaniya nomini kiriting').max(200),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email("Email noto'g'ri").max(200).nullable().optional().or(z.literal('')),
  website: z.string().trim().max(300).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  note: z.string().trim().max(5000).nullable().optional(),
});

export async function kompaniyalar(tx: Tx, p: { q?: string; limit: number; offset: number }) {
  const where = p.q ? or(ilike(company.name, `%${p.q}%`), ilike(company.phone, `%${p.q}%`), ilike(company.website, `%${p.q}%`)) : undefined;
  const [qatorlar, [jami]] = await Promise.all([
    tx
      .select({
        id: company.id,
        name: company.name,
        phone: company.phone,
        email: company.email,
        website: company.website,
        address: company.address,
        updatedAt: company.updatedAt,
        contacts: sql<number>`(select count(*)::int from contact c where c.company_id = "company"."id")`,
        deals: sql<number>`(select count(*)::int from deal d where d.company_id = "company"."id" and d.deleted_at is null)`,
      })
      .from(company)
      .where(where)
      .orderBy(asc(company.name))
      .limit(p.limit)
      .offset(p.offset),
    tx.select({ n: count() }).from(company).where(where),
  ]);
  return { total: Number(jami?.n ?? 0), items: qatorlar };
}

export async function kompaniyaYarat(tx: Tx, businessId: string, k: z.infer<typeof kompaniyaKirish>): Promise<string> {
  const [bor] = await tx.select({ id: company.id }).from(company).where(sql`lower(${company.name}) = lower(${k.name})`).limit(1);
  if (bor) throw new CrmXatosi('ziddiyat', 'Bu nomli kompaniya allaqachon bor');
  const [c] = await tx
    .insert(company)
    .values({ businessId, ...k, email: k.email || null })
    .returning({ id: company.id });
  return c!.id;
}

export async function kompaniyaniYangila(tx: Tx, id: string, k: Partial<z.infer<typeof kompaniyaKirish>>): Promise<void> {
  const r = await tx
    .update(company)
    .set({ ...k, ...(k.email !== undefined ? { email: k.email || null } : {}), updatedAt: new Date() })
    .where(eq(company.id, id))
    .returning({ id: company.id });
  if (r.length === 0) throw new CrmXatosi('topilmadi', 'Kompaniya topilmadi');
}

export async function kompaniyaniOchir(tx: Tx, id: string): Promise<void> {
  // Kontakt va bitimlar saqlanadi — faqat bog'lanish uziladi (FK set null)
  const r = await tx.delete(company).where(eq(company.id, id)).returning({ id: company.id });
  if (r.length === 0) throw new CrmXatosi('topilmadi', 'Kompaniya topilmadi');
}

export async function kompaniyaKartochkasi(tx: Tx, p: { id: string; doira: CrmDoira }) {
  const [c] = await tx.select().from(company).where(eq(company.id, p.id)).limit(1);
  if (!c) throw new CrmXatosi('topilmadi', 'Kompaniya topilmadi');
  const sh = [eq(deal.companyId, c.id), isNull(deal.deletedAt)];
  const k = korishSharti(p.doira);
  if (k) sh.push(k);
  const [kontaktlar, bitimlar] = await Promise.all([
    tx
      .select({ id: contact.id, name: contact.name, phone: contact.phone, email: contact.email, role: contact.role })
      .from(contact)
      .where(eq(contact.companyId, c.id))
      .orderBy(asc(contact.name))
      .limit(200),
    tx
      .select({
        id: deal.id,
        name: deal.name,
        amount: deal.amount,
        stageName: crmStage.name,
        stageKind: crmStage.kind,
        stageColor: crmStage.color,
        pipelineName: crmPipeline.name,
        updatedAt: deal.updatedAt,
      })
      .from(deal)
      .innerJoin(crmStage, eq(crmStage.id, deal.stageId))
      .innerJoin(crmPipeline, eq(crmPipeline.id, deal.pipelineId))
      .where(and(...sh))
      .orderBy(desc(deal.updatedAt))
      .limit(200),
  ]);
  return {
    company: c,
    contacts: kontaktlar,
    deals: bitimlar.map((b) => ({ ...b, amount: b.amount === null ? null : Number(b.amount) })),
  };
}

// ─── Dublikatlar (LEAD-12) ───────────────────────────────────────────────────

/**
 * Dublikat nomzodlari: bir xil telefon kaliti (oxirgi 9 raqam) yoki bir xil
 * email. Har guruh — bir xil kalitli kontaktlar ro'yxati.
 */
export async function dublikatlar(tx: Tx) {
  const r = await tx.execute(sql`
    with kalitlar as (
      select c.id, right(regexp_replace(c.phone, '\\D', '', 'g'), 9) as k from contact c where c.phone is not null
      union
      select c.id, right(regexp_replace(p.v, '\\D', '', 'g'), 9) from contact c, unnest(c.phones) as p(v)
      union
      select c.id, 'email:' || lower(c.email) from contact c where c.email is not null and c.email <> ''
    ),
    guruh as (
      select k, array_agg(distinct id) as idlar from kalitlar where length(k) >= 9 or k like 'email:%' group by k having count(distinct id) > 1
    )
    select k, idlar from guruh limit 100
  `);
  const qatorlar = (r as unknown as { rows?: { k: string; idlar: string[] }[] }).rows ?? (r as unknown as { k: string; idlar: string[] }[]);
  const barchaId = [...new Set(qatorlar.flatMap((q) => q.idlar))];
  if (barchaId.length === 0) return [];
  const kontaktlar = await tx
    .select({
      id: contact.id,
      name: contact.name,
      phone: contact.phone,
      email: contact.email,
      firstSeenAt: contact.firstSeenAt,
      deals: sql<number>`(select count(*)::int from deal d where d.contact_id = "contact"."id" and d.deleted_at is null)`,
      calls: sql<number>`(select count(*)::int from conversation cv where cv.contact_id = "contact"."id")`,
    })
    .from(contact)
    .where(inArray(contact.id, barchaId));
  const xarita = new Map(kontaktlar.map((k) => [k.id, k]));
  // Bir xil to'plamlar (telefon ham, email ham mos) bir marta
  const korilgan = new Set<string>();
  const natija: { key: string; contacts: (typeof kontaktlar)[number][] }[] = [];
  for (const q of qatorlar) {
    const tartib = [...q.idlar].sort().join(',');
    if (korilgan.has(tartib)) continue;
    korilgan.add(tartib);
    natija.push({
      key: q.k.startsWith('email:') ? q.k.slice(6) : `…${q.k}`,
      contacts: q.idlar.map((i) => xarita.get(i)!).filter(Boolean).sort((a, b) => +new Date(a.firstSeenAt) - +new Date(b.firstSeenAt)),
    });
  }
  return natija;
}

/**
 * Birlashtirish: ikkinchi darajali kontaktlarning bitim, qo'ng'iroq,
 * vazifa va murojaatlari asosiyga o'tadi, telefon/emaillari asosiyga
 * qo'shiladi, keyin ular o'chiriladi. Asosiy kontakt bitimlariga tarix
 * hodisasi yoziladi.
 */
export async function kontaktlarniBirlashtir(
  tx: Tx,
  p: { businessId: string; asosiyId: string; boshqalar: string[]; userId: string },
): Promise<void> {
  const boshqalar = p.boshqalar.filter((x) => x !== p.asosiyId);
  if (boshqalar.length === 0) throw new CrmXatosi('yaroqsiz', 'Birlashtirish uchun kamida ikki kontakt kerak');
  const hammasi = await tx
    .select({ id: contact.id, name: contact.name, phone: contact.phone, phones: contact.phones, email: contact.email, emails: contact.emails, companyId: contact.companyId })
    .from(contact)
    .where(inArray(contact.id, [p.asosiyId, ...boshqalar]));
  const asosiy = hammasi.find((h) => h.id === p.asosiyId);
  if (!asosiy || hammasi.length !== boshqalar.length + 1) throw new CrmXatosi('topilmadi', 'Kontakt topilmadi');

  const ikkinchi = hammasi.filter((h) => h.id !== p.asosiyId);
  const telefonlar = qoshimchaTelefonlar(asosiy.phone, [
    ...asosiy.phones,
    ...ikkinchi.flatMap((h) => [h.phone, ...h.phones].filter((x): x is string => Boolean(x))),
  ]);
  const emaillar = [...new Set([...asosiy.emails, ...ikkinchi.flatMap((h) => [h.email, ...h.emails])].filter((e): e is string => Boolean(e) && e !== asosiy.email))];
  await tx
    .update(contact)
    .set({
      phones: telefonlar,
      emails: emaillar,
      name: asosiy.name ?? ikkinchi.find((h) => h.name)?.name ?? null,
      email: asosiy.email ?? ikkinchi.find((h) => h.email)?.email ?? null,
      companyId: asosiy.companyId ?? ikkinchi.find((h) => h.companyId)?.companyId ?? null,
    })
    .where(eq(contact.id, p.asosiyId));

  await tx.update(deal).set({ contactId: p.asosiyId }).where(inArray(deal.contactId, boshqalar));
  await tx.update(conversation).set({ contactId: p.asosiyId }).where(inArray(conversation.contactId, boshqalar));
  await tx.update(task).set({ contactId: p.asosiyId }).where(inArray(task.contactId, boshqalar));
  await tx.update(crmInbox).set({ contactId: p.asosiyId }).where(inArray(crmInbox.contactId, boshqalar));
  await tx.update(crmLead).set({ contactId: p.asosiyId }).where(inArray(crmLead.contactId, boshqalar));

  const bitimlar = await tx.select({ id: deal.id }).from(deal).where(eq(deal.contactId, p.asosiyId));
  if (bitimlar.length > 0) {
    await tx.insert(dealEvent).values(
      bitimlar.map((b) => ({
        businessId: p.businessId,
        dealId: b.id,
        type: 'merge',
        data: { into: p.asosiyId, merged: ikkinchi.map((h) => ({ id: h.id, name: h.name, phone: h.phone })) },
        authorUserId: p.userId,
      })),
    );
  }
  await tx.delete(contact).where(inArray(contact.id, boshqalar));
}
