import { and, asc, count, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/index.js';
import { crmProduct, deal, dealEvent, dealItem } from '../db/schema/index.js';
import { CrmXatosi } from './xato.js';
import { bitimniOl, yozaOladimi, type CrmDoira } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — tovar/xizmat katalogi va bitimdagi tovarlar (CUST-02)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bitimga tovar qo'shilganda narx o'sha paytdagisi saqlanadi (snapshot) —
 * katalogda narx o'zgarsa, eski bitim summasi o'zgarmaydi. Bitimda tovar
 * bo'lsa, summasi qatorlar yig'indisidan hisoblanadi (aniq qoida).
 */

export const tovarKirish = z.object({
  name: z.string().trim().min(1, 'Tovar nomini kiriting').max(200),
  sku: z.string().trim().max(60).nullable().optional(),
  price: z.coerce.number().min(0, "Narx manfiy bo'lmasin").max(1e13, 'Narx juda katta'),
  description: z.string().trim().max(2000).nullable().optional(),
});

export async function tovarlar(tx: Tx, p: { q?: string; hammasi?: boolean; limit: number; offset: number }) {
  const where = and(
    p.hammasi ? undefined : isNull(crmProduct.archivedAt),
    p.q ? or(ilike(crmProduct.name, `%${p.q}%`), ilike(crmProduct.sku, `%${p.q}%`)) : undefined,
  );
  const [qatorlar, [jami]] = await Promise.all([
    tx
      .select({
        id: crmProduct.id,
        name: crmProduct.name,
        sku: crmProduct.sku,
        price: crmProduct.price,
        description: crmProduct.description,
        archived: sql<boolean>`${crmProduct.archivedAt} is not null`,
        sold: sql<number>`(select coalesce(sum(i.quantity), 0)::float from deal_item i where i.product_id = "crm_product"."id")`,
      })
      .from(crmProduct)
      .where(where)
      .orderBy(asc(crmProduct.name))
      .limit(p.limit)
      .offset(p.offset),
    tx.select({ n: count() }).from(crmProduct).where(where),
  ]);
  return { total: Number(jami?.n ?? 0), items: qatorlar.map((q) => ({ ...q, price: Number(q.price) })) };
}

export async function tovarYarat(tx: Tx, businessId: string, k: z.infer<typeof tovarKirish>): Promise<string> {
  const [r] = await tx
    .insert(crmProduct)
    .values({ businessId, name: k.name, sku: k.sku ?? null, price: String(k.price), description: k.description ?? null })
    .returning({ id: crmProduct.id });
  return r!.id;
}

export async function tovarniYangila(tx: Tx, id: string, k: Partial<z.infer<typeof tovarKirish>> & { archived?: boolean }): Promise<void> {
  const ozg: Partial<typeof crmProduct.$inferInsert> = {};
  if (k.name !== undefined) ozg.name = k.name;
  if (k.sku !== undefined) ozg.sku = k.sku;
  if (k.price !== undefined) ozg.price = String(k.price);
  if (k.description !== undefined) ozg.description = k.description;
  if (k.archived !== undefined) ozg.archivedAt = k.archived ? new Date() : null;
  const r = await tx.update(crmProduct).set(ozg).where(eq(crmProduct.id, id)).returning({ id: crmProduct.id });
  if (r.length === 0) throw new CrmXatosi('topilmadi', 'Tovar topilmadi');
}

export const qatorKirish = z.object({
  productId: z.string().uuid().nullable().optional(),
  name: z.string().trim().max(200).optional(),
  price: z.coerce.number().min(0).max(1e13).optional(),
  quantity: z.coerce.number().positive('Miqdor musbat bo‘lishi kerak').max(1e6).default(1),
  discount: z.coerce.number().min(0).max(100).default(0),
});

/** Qatorlar yig'indisi — bitim summasi (chegirma foizi bilan). */
async function summaniHisobla(tx: Tx, p: { dealId: string; businessId: string; userId: string }): Promise<void> {
  const [r] = await tx
    .select({
      n: count(),
      sum: sql<string | null>`round(sum(${dealItem.price} * ${dealItem.quantity} * (1 - ${dealItem.discount} / 100)), 2)`,
    })
    .from(dealItem)
    .where(eq(dealItem.dealId, p.dealId));
  const [d] = await tx.select({ amount: deal.amount }).from(deal).where(eq(deal.id, p.dealId)).limit(1);
  const yangi = Number(r?.n ?? 0) > 0 ? String(Number(r!.sum ?? 0).toFixed(2)) : null;
  const eski = d?.amount === null || d?.amount === undefined ? null : String(Number(d.amount).toFixed(2));
  // Qator qolmasa — summa qo'lda kiritilgandek qoladi
  if (yangi === null || yangi === eski) return;
  await tx.update(deal).set({ amount: yangi, version: sql`${deal.version} + 1`, updatedAt: new Date() }).where(eq(deal.id, p.dealId));
  await tx.insert(dealEvent).values({
    businessId: p.businessId,
    dealId: p.dealId,
    type: 'field',
    data: { field: 'amount', before: eski, after: yangi, auto: 'items' },
    authorUserId: p.userId,
  });
}

export async function qatorQosh(tx: Tx, p: { dealId: string; userId: string; doira: CrmDoira; kirish: z.infer<typeof qatorKirish> }): Promise<string> {
  const d = await bitimniOl(tx, p.dealId, p.doira);
  yozaOladimi(d, p.doira);
  const k = p.kirish;
  let name = k.name ?? '';
  let price = k.price;
  if (k.productId) {
    const [t] = await tx.select({ name: crmProduct.name, price: crmProduct.price }).from(crmProduct).where(eq(crmProduct.id, k.productId)).limit(1);
    if (!t) throw new CrmXatosi('yaroqsiz', 'Tovar topilmadi');
    name = name || t.name;
    price = price ?? Number(t.price);
  }
  if (!name) throw new CrmXatosi('yaroqsiz', 'Tovar nomini kiriting');
  const [r] = await tx
    .insert(dealItem)
    .values({
      businessId: d.businessId,
      dealId: d.id,
      productId: k.productId ?? null,
      name,
      price: String(price ?? 0),
      quantity: String(k.quantity),
      discount: String(k.discount),
    })
    .returning({ id: dealItem.id });
  await summaniHisobla(tx, { dealId: d.id, businessId: d.businessId, userId: p.userId });
  return r!.id;
}

export async function qatorniYangila(
  tx: Tx,
  p: { dealId: string; itemId: string; userId: string; doira: CrmDoira; kirish: Partial<z.infer<typeof qatorKirish>> },
): Promise<void> {
  const d = await bitimniOl(tx, p.dealId, p.doira);
  yozaOladimi(d, p.doira);
  const k = p.kirish;
  const ozg: Partial<typeof dealItem.$inferInsert> = {};
  if (k.name !== undefined) ozg.name = k.name;
  if (k.price !== undefined) ozg.price = String(k.price);
  if (k.quantity !== undefined) ozg.quantity = String(k.quantity);
  if (k.discount !== undefined) ozg.discount = String(k.discount);
  const r = await tx
    .update(dealItem)
    .set(ozg)
    .where(and(eq(dealItem.id, p.itemId), eq(dealItem.dealId, d.id)))
    .returning({ id: dealItem.id });
  if (r.length === 0) throw new CrmXatosi('topilmadi', 'Tovar qatori topilmadi');
  await summaniHisobla(tx, { dealId: d.id, businessId: d.businessId, userId: p.userId });
}

export async function qatorniOchir(tx: Tx, p: { dealId: string; itemId: string; userId: string; doira: CrmDoira }): Promise<void> {
  const d = await bitimniOl(tx, p.dealId, p.doira);
  yozaOladimi(d, p.doira);
  const r = await tx
    .delete(dealItem)
    .where(and(eq(dealItem.id, p.itemId), eq(dealItem.dealId, d.id)))
    .returning({ id: dealItem.id });
  if (r.length === 0) throw new CrmXatosi('topilmadi', 'Tovar qatori topilmadi');
  await summaniHisobla(tx, { dealId: d.id, businessId: d.businessId, userId: p.userId });
}
