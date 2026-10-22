import { randomBytes } from 'node:crypto';
import { and, asc, count, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withoutTenantIsolation, withTenant, type Tx } from '../db/index.js';
import { contact, crmForm, crmInbox, crmPipeline, deal, dealEvent } from '../db/schema/index.js';
import { navbatdagiMasul, sozlamaniOl, sozlamaniSaqla } from './sozlama.js';
import { CrmXatosi } from './xato.js';
import { bitimniOl, bitimYarat, kontaktniTopYokiYarat, maydonlarniTekshir, tuzilma, yozaOladimi, type CrmDoira } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — "Saralanmagan" murojaatlar va veb-formalar (LEAD-04, FORM-*)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Murojaat manbalari:
 *   • SotuvAI qo'ng'irog'i — ochiq bitimi yo'q mijoz qo'ng'iroq qilsa,
 *     worker uni avtomatik shu yerga qo'yadi (sinxronlashsiz integratsiya);
 *   • veb-forma — ochiq sahifa `/f/:slug` yoki saytga embed;
 *   • qo'lda kiritilgan.
 * Qabul — bitim yaratadi (mas'ul navbat bilan) yoki mavjud bitimga bog'laydi.
 */

const TIZIM: CrmDoira = { korish: 'all', yozish: 'all', seatId: null };

export async function murojaatlar(tx: Tx, p: { status: 'pending' | 'accepted' | 'rejected'; limit: number; offset: number }) {
  const where = eq(crmInbox.status, p.status);
  const [qatorlar, [jami], sonlar] = await Promise.all([
    tx
      .select({
        id: crmInbox.id,
        source: crmInbox.source,
        status: crmInbox.status,
        name: crmInbox.name,
        phone: crmInbox.phone,
        email: crmInbox.email,
        message: crmInbox.message,
        payload: crmInbox.payload,
        contactId: crmInbox.contactId,
        contactName: contact.name,
        formId: crmInbox.formId,
        formName: crmForm.name,
        conversationId: crmInbox.conversationId,
        dealId: crmInbox.dealId,
        dealName: deal.name,
        decidedAt: crmInbox.decidedAt,
        createdAt: crmInbox.createdAt,
        // Shu kontaktning boshqa ochiq bitimlari — "bog'lash" taklifi uchun
        openDeals: sql<number>`(select count(*)::int from deal d join crm_stage s on s.id = d.stage_id
          where d.contact_id = ${crmInbox.contactId} and d.deleted_at is null and s.kind = 'open')`,
      })
      .from(crmInbox)
      .leftJoin(contact, eq(contact.id, crmInbox.contactId))
      .leftJoin(crmForm, eq(crmForm.id, crmInbox.formId))
      .leftJoin(deal, eq(deal.id, crmInbox.dealId))
      .where(where)
      .orderBy(p.status === 'pending' ? desc(crmInbox.createdAt) : desc(crmInbox.decidedAt))
      .limit(p.limit)
      .offset(p.offset),
    tx.select({ n: count() }).from(crmInbox).where(where),
    tx.select({ status: crmInbox.status, n: count() }).from(crmInbox).groupBy(crmInbox.status),
  ]);
  return {
    total: Number(jami?.n ?? 0),
    counts: Object.fromEntries(sonlar.map((s) => [s.status, Number(s.n)])) as Record<string, number>,
    items: qatorlar,
  };
}

export async function kutayotganlarSoni(tx: Tx): Promise<number> {
  const [r] = await tx.select({ n: count() }).from(crmInbox).where(eq(crmInbox.status, 'pending'));
  return Number(r?.n ?? 0);
}

/** Voronkaning birinchi ochiq bosqichi; voronka berilmasa — asosiysi. */
async function kirishBosqichi(tx: Tx, pipelineId: string | null | undefined): Promise<{ pipelineId: string; stageId: string }> {
  const t = await tuzilma(tx);
  const v = t.pipelines.find((x) => x.id === pipelineId) ?? t.pipelines.find((x) => x.isMain) ?? t.pipelines[0];
  if (!v) throw new CrmXatosi('ziddiyat', 'CRM yoqilmagan');
  const b = v.stages.find((s) => s.kind === 'open') ?? v.stages[0];
  if (!b) throw new CrmXatosi('ziddiyat', 'Voronkada bosqich yo‘q');
  return { pipelineId: v.id, stageId: b.id };
}

const MANBA_NOMI: Record<string, string> = { call: "Qo'ng'iroq", form: 'Veb-forma', manual: "Qo'lda" };

export const qabulSxemasi = z.object({
  /** Mavjud bitimga bog'lash (yangi bitim yaratilmaydi). */
  dealId: z.string().uuid().nullable().optional(),
  pipelineId: z.string().uuid().nullable().optional(),
  stageId: z.string().uuid().nullable().optional(),
  seatId: z.string().uuid().nullable().optional(),
  name: z.string().trim().max(250).optional(),
});

/**
 * Qabul. Murojaat qulflanadi — ikki kishi bir vaqtda bossa ham bitta bitim
 * yaratiladi; qabul qilingani qayta qabul qilinmaydi (LEAD-04).
 */
export async function murojaatniQabul(
  tx: Tx,
  p: { id: string; businessId: string; userId: string | null; doira: CrmDoira; kirish: z.infer<typeof qabulSxemasi> },
): Promise<{ dealId: string }> {
  const [m] = await tx.select().from(crmInbox).where(eq(crmInbox.id, p.id)).for('update').limit(1);
  if (!m) throw new CrmXatosi('topilmadi', 'Murojaat topilmadi');
  if (m.status !== 'pending') throw new CrmXatosi('ziddiyat', 'Murojaat allaqachon ko‘rib chiqilgan');
  const k = p.kirish;

  let dealId: string;
  if (k.dealId) {
    const d = await bitimniOl(tx, k.dealId, p.doira);
    yozaOladimi(d, p.doira);
    dealId = d.id;
    await tx.insert(dealEvent).values({
      businessId: p.businessId,
      dealId,
      type: 'inbox',
      data: { inboxId: m.id, source: m.source, name: m.name, phone: m.phone, message: m.message },
      authorUserId: p.userId,
    });
  } else {
    const kirish = k.stageId && k.pipelineId ? { pipelineId: k.pipelineId, stageId: k.stageId } : await kirishBosqichi(tx, k.pipelineId ?? m.pipelineId);
    // Mas'ul: sotuvchi — o'zi; rahbar tanlagan; aks holda navbat bilan (round-robin)
    let masul: string | null = null;
    if (p.doira.yozish === 'own') masul = p.doira.seatId;
    else if (k.seatId !== undefined && k.seatId !== null) masul = k.seatId;
    else masul = await navbatdagiMasul(tx, p.businessId);

    const payload = (m.payload ?? {}) as { fields?: Record<string, unknown>; tags?: string[]; formName?: string };
    let fields: Record<string, unknown> = {};
    if (payload.fields) {
      // Forma maydonlari — yaroqsizi jimgina tashlanadi (murojaat yo'qolmasin)
      const { fields: maydonlar } = await tuzilma(tx);
      for (const [fid, v] of Object.entries(payload.fields)) {
        try {
          Object.assign(fields, maydonlarniTekshir({ [fid]: v }, maydonlar));
        } catch {
          /* o'tkazib yuboriladi */
        }
      }
      fields = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== null));
    }
    const nom = k.name || m.name || m.phone || 'Yangi murojaat';
    dealId = await bitimYarat(tx, {
      businessId: p.businessId,
      userId: p.userId,
      doira: { korish: 'all', yozish: 'all', seatId: masul },
      kirish: {
        name: nom,
        pipelineId: kirish.pipelineId,
        stageId: kirish.stageId,
        responsibleSeatId: masul,
        contactId: m.contactId,
        contact: m.contactId ? undefined : { name: m.name, phone: m.phone, email: m.email || null },
        fields,
        source: payload.formName ?? MANBA_NOMI[m.source] ?? m.source,
        tags: payload.tags,
      },
    });
    if (m.message) {
      await tx.insert(dealEvent).values({ businessId: p.businessId, dealId, type: 'note', data: { text: m.message, inboxId: m.id }, authorUserId: null });
    }
  }
  const [d] = await tx.select({ contactId: deal.contactId }).from(deal).where(eq(deal.id, dealId)).limit(1);
  await tx
    .update(crmInbox)
    .set({ status: 'accepted', dealId, contactId: m.contactId ?? d?.contactId ?? null, decidedBy: p.userId, decidedAt: new Date() })
    .where(eq(crmInbox.id, m.id));
  return { dealId };
}

export async function murojaatniRad(tx: Tx, p: { id: string; userId: string }): Promise<void> {
  const [m] = await tx.select({ status: crmInbox.status }).from(crmInbox).where(eq(crmInbox.id, p.id)).for('update').limit(1);
  if (!m) throw new CrmXatosi('topilmadi', 'Murojaat topilmadi');
  if (m.status !== 'pending') throw new CrmXatosi('ziddiyat', 'Murojaat allaqachon ko‘rib chiqilgan');
  await tx.update(crmInbox).set({ status: 'rejected', decidedBy: p.userId, decidedAt: new Date() }).where(eq(crmInbox.id, p.id));
}

export const qoldaSxemasi = z.object({
  name: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  email: z.string().trim().email("Email noto'g'ri").max(200).nullable().optional().or(z.literal('')),
  message: z.string().trim().max(5000).nullable().optional(),
});

export async function murojaatQosh(tx: Tx, businessId: string, k: z.infer<typeof qoldaSxemasi>): Promise<string> {
  if (!k.name && !k.phone && !k.email) throw new CrmXatosi('yaroqsiz', 'Ism yoki telefonni kiriting');
  const contactId = k.phone || k.name ? await kontaktniTopYokiYarat(tx, businessId, { name: k.name, phone: k.phone, email: k.email || null }) : null;
  const [r] = await tx
    .insert(crmInbox)
    .values({ businessId, source: 'manual', name: k.name ?? null, phone: k.phone ?? null, email: k.email || null, message: k.message ?? null, contactId })
    .returning({ id: crmInbox.id });
  return r!.id;
}

// ─── SotuvAI qo'ng'iroqlaridan avtomatik qabul ───────────────────────────────

/**
 * Bir biznes uchun: sozlamada belgilangan vaqtdan keyingi qo'ng'iroqlar
 * ichidan — ochiq bitimi ham, kutayotgan murojaati ham yo'q mijozlarni
 * "Saralanmagan"ga qo'yadi. Har mijozdan bitta (eng oxirgi qo'ng'iroq).
 * Takror ishga tushsa ham dubl bo'lmaydi: manba + qo'ng'iroq ID noyob.
 */
export async function qongiroqlarniQabulQil(tx: Tx, businessId: string): Promise<number> {
  const s = await sozlamaniOl(tx);
  if (!s.callIntake.enabled) return 0;
  if (!s.callIntake.since) {
    // Birinchi marta: eski qo'ng'iroqlar bilan "Saralanmagan" to'lib ketmasin
    await sozlamaniSaqla(tx, businessId, { callIntake: { enabled: true, pipelineId: s.callIntake.pipelineId, autoAccept: s.callIntake.autoAccept } });
    return 0;
  }
  const r = await tx.execute(sql`
    select distinct on (cv.contact_id)
      cv.id, cv.contact_id, cv.direction, cv.duration_seconds, cv.started_at,
      c.name, c.phone, a.overall_score, a.summary, se.display_name as seat_name
    from conversation cv
    join contact c on c.id = cv.contact_id
    left join analysis a on a.conversation_id = cv.id
    left join seat se on se.id = cv.seat_id
    where cv.started_at >= ${s.callIntake.since}
      and not exists (select 1 from deal d join crm_stage st on st.id = d.stage_id
                      where d.contact_id = cv.contact_id and d.deleted_at is null and st.kind = 'open')
      and not exists (select 1 from crm_inbox i where i.contact_id = cv.contact_id and i.status = 'pending')
      and not exists (select 1 from crm_inbox i where i.source = 'call' and i.external_id = cv.id::text)
    order by cv.contact_id, cv.started_at desc
    limit 50
  `);
  const qatorlar = ((r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])) as {
    id: string;
    contact_id: string;
    direction: string;
    duration_seconds: number | null;
    started_at: string;
    name: string | null;
    phone: string | null;
    overall_score: string | null;
    summary: string | null;
    seat_name: string | null;
  }[];
  let n = 0;
  for (const q of qatorlar) {
    const [m] = await tx
      .insert(crmInbox)
      .values({
        businessId,
        source: 'call',
        externalId: q.id,
        name: q.name,
        phone: q.phone,
        contactId: q.contact_id,
        conversationId: q.id,
        pipelineId: s.callIntake.pipelineId,
        message: q.summary,
        payload: {
          direction: q.direction,
          durationSeconds: q.duration_seconds,
          startedAt: q.started_at,
          score: q.overall_score === null ? null : Number(q.overall_score),
          seatName: q.seat_name,
        },
      })
      .onConflictDoNothing()
      .returning({ id: crmInbox.id });
    if (!m) continue;
    n++;
    if (s.callIntake.autoAccept) {
      await murojaatniQabul(tx, { id: m.id, businessId, userId: null, doira: TIZIM, kirish: {} });
    }
  }
  return n;
}

/** Worker: CRM yoqilgan barcha bizneslar bo'yicha. */
export async function qongiroqlardanQabul(): Promise<{ businessId: string; qoshildi: number; xato?: string }[]> {
  const bizneslar = await withoutTenantIsolation('CRM: qo‘ng‘iroqlardan saralanmaganga qabul', (tx) =>
    tx.selectDistinct({ businessId: crmPipeline.businessId }).from(crmPipeline),
  );
  const natija: { businessId: string; qoshildi: number; xato?: string }[] = [];
  for (const b of bizneslar) {
    try {
      const n = await withTenant(b.businessId, (tx) => qongiroqlarniQabulQil(tx, b.businessId));
      natija.push({ businessId: b.businessId, qoshildi: n });
    } catch (e) {
      natija.push({ businessId: b.businessId, qoshildi: 0, xato: (e as Error).message });
    }
  }
  return natija;
}

// ─── Veb-formalar ────────────────────────────────────────────────────────────

const formaMaydoni = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().trim().min(1).max(120),
  type: z.enum(['text', 'phone', 'email', 'textarea', 'select', 'number', 'date', 'checkbox']),
  required: z.boolean().default(false),
  /** name | phone | email | company | message | field:<uuid> | none */
  target: z.string().regex(/^(name|phone|email|company|message|none|field:[0-9a-f-]{36})$/),
  options: z.array(z.string().trim().min(1).max(100)).max(50).optional(),
  placeholder: z.string().max(120).optional(),
});

export const formaKirish = z.object({
  name: z.string().trim().min(1, 'Forma nomini kiriting').max(100),
  title: z.string().trim().min(1, 'Sarlavhani kiriting').max(200),
  description: z.string().trim().max(1000).nullable().optional(),
  fields: z.array(formaMaydoni).min(1, 'Kamida bitta maydon qo‘shing').max(30),
  pipelineId: z.string().uuid().nullable().optional(),
  source: z.string().trim().max(100).nullable().optional(),
  tags: z.array(z.string().max(60)).max(10).optional(),
  thankYou: z.string().trim().max(500).nullable().optional(),
  autoAccept: z.boolean().optional(),
  active: z.boolean().optional(),
});

function formaniTekshir(k: Partial<z.infer<typeof formaKirish>>): void {
  if (!k.fields) return;
  const kalitlar = new Set<string>();
  for (const f of k.fields) {
    if (kalitlar.has(f.key)) throw new CrmXatosi('yaroqsiz', 'Maydon kalitlari takrorlanmasin');
    kalitlar.add(f.key);
    if (f.type === 'select' && !f.options?.length) throw new CrmXatosi('yaroqsiz', `«${f.label}» uchun variantlar kiriting`);
  }
  if (!k.fields.some((f) => f.target === 'phone' || f.target === 'email' || f.target === 'name')) {
    throw new CrmXatosi('yaroqsiz', 'Formada ism, telefon yoki email maydoni bo‘lishi kerak');
  }
}

export async function formalar(tx: Tx) {
  return tx
    .select({
      id: crmForm.id,
      slug: crmForm.slug,
      name: crmForm.name,
      title: crmForm.title,
      description: crmForm.description,
      fields: crmForm.fields,
      pipelineId: crmForm.pipelineId,
      source: crmForm.source,
      tags: crmForm.tags,
      thankYou: crmForm.thankYou,
      autoAccept: crmForm.autoAccept,
      active: crmForm.active,
      submissions: crmForm.submissions,
      createdAt: crmForm.createdAt,
    })
    .from(crmForm)
    .orderBy(asc(crmForm.createdAt));
}

export async function formaYarat(tx: Tx, businessId: string, k: z.infer<typeof formaKirish>): Promise<{ id: string; slug: string }> {
  formaniTekshir(k);
  const slug = randomBytes(6).toString('base64url').toLowerCase().replace(/[^a-z0-9]/g, 'x');
  const [r] = await tx
    .insert(crmForm)
    .values({
      businessId,
      slug,
      name: k.name,
      title: k.title,
      description: k.description ?? null,
      fields: k.fields,
      pipelineId: k.pipelineId ?? null,
      source: k.source ?? null,
      tags: k.tags ?? [],
      thankYou: k.thankYou ?? null,
      autoAccept: k.autoAccept ?? false,
      active: k.active ?? true,
    })
    .returning({ id: crmForm.id, slug: crmForm.slug });
  return r!;
}

export async function formaniYangila(tx: Tx, id: string, k: Partial<z.infer<typeof formaKirish>>): Promise<void> {
  formaniTekshir(k);
  const r = await tx
    .update(crmForm)
    .set({ ...k, updatedAt: new Date() })
    .where(eq(crmForm.id, id))
    .returning({ id: crmForm.id });
  if (r.length === 0) throw new CrmXatosi('topilmadi', 'Forma topilmadi');
}

export async function formaniOchir(tx: Tx, id: string): Promise<void> {
  const r = await tx.delete(crmForm).where(eq(crmForm.id, id)).returning({ id: crmForm.id });
  if (r.length === 0) throw new CrmXatosi('topilmadi', 'Forma topilmadi');
}

type FormaMaydoni = z.infer<typeof formaMaydoni>;

/** Ochiq forma tavsifi — maqsad (target) va ichki sozlamalar oshkor qilinmaydi. */
export async function ochiqForma(slug: string) {
  const [f] = await withoutTenantIsolation('CRM: ochiq veb-forma (slug bo‘yicha)', (tx) =>
    tx
      .select({ title: crmForm.title, description: crmForm.description, fields: crmForm.fields, active: crmForm.active, thankYou: crmForm.thankYou })
      .from(crmForm)
      .where(eq(crmForm.slug, slug))
      .limit(1),
  );
  if (!f || !f.active) return null;
  return {
    title: f.title,
    description: f.description,
    thankYou: f.thankYou,
    fields: (f.fields as FormaMaydoni[]).map(({ key, label, type, required, options, placeholder }) => ({ key, label, type, required, options, placeholder })),
  };
}

export const yuborishSxemasi = z.object({
  values: z.record(z.string().max(40), z.union([z.string().max(5000), z.boolean(), z.number()])),
  /** Mijoz tomonidagi bir martalik kalit — qayta yuborilsa dubl bo'lmaydi. */
  submissionId: z.string().uuid(),
  /** Bot tuzog'i — odam bu maydonni ko'rmaydi. */
  website: z.string().max(200).optional(),
  page: z.string().max(500).optional(),
});

/**
 * Forma yuborish: server maydonlarni o'zi xaritalaydi (FORM-04), majburiy
 * maydonlarni tekshiradi, idempotent (FORM-06). Bot tuzog'i to'lsa —
 * jimgina "muvaffaqiyat" (bot qayta urinmasin), lekin hech narsa yozilmaydi.
 */
export async function formaniYubor(slug: string, k: z.infer<typeof yuborishSxemasi>): Promise<{ thankYou: string | null }> {
  const [f] = await withoutTenantIsolation('CRM: veb-forma yuborish (slug bo‘yicha)', (tx) =>
    tx.select({ id: crmForm.id, businessId: crmForm.businessId, active: crmForm.active }).from(crmForm).where(eq(crmForm.slug, slug)).limit(1),
  );
  if (!f || !f.active) throw new CrmXatosi('topilmadi', 'Forma topilmadi');
  if (k.website) return { thankYou: null };

  return withTenant(f.businessId, async (tx) => {
    const [forma] = await tx.select().from(crmForm).where(eq(crmForm.id, f.id)).limit(1);
    const maydonlar = forma!.fields as FormaMaydoni[];
    const qiymat: Record<string, string> = {};
    for (const m of maydonlar) {
      const v = k.values[m.key];
      const s = v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? 'ha' : '') : String(v).trim();
      if (m.required && !s) throw new CrmXatosi('yaroqsiz', `«${m.label}» maydonini to‘ldiring`);
      if (s && m.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) throw new CrmXatosi('yaroqsiz', `«${m.label}» noto‘g‘ri`);
      if (s && m.type === 'phone' && s.replace(/\D/g, '').length < 9) throw new CrmXatosi('yaroqsiz', `«${m.label}» noto‘g‘ri`);
      if (s && m.type === 'select' && !m.options?.includes(s)) throw new CrmXatosi('yaroqsiz', `«${m.label}» noto‘g‘ri`);
      qiymat[m.key] = s.slice(0, 5000);
    }
    const ol = (t: string) => maydonlar.filter((m) => m.target === t).map((m) => qiymat[m.key]).find(Boolean) ?? null;
    const name = ol('name');
    const phone = ol('phone');
    const email = ol('email');
    const kompaniya = ol('company');
    const xabarlar = maydonlar
      .filter((m) => m.target === 'message' || m.target === 'none' || m.target === 'company')
      .filter((m) => qiymat[m.key])
      .map((m) => `${m.label}: ${qiymat[m.key]}`);
    const fields: Record<string, unknown> = {};
    for (const m of maydonlar) if (m.target.startsWith('field:') && qiymat[m.key]) fields[m.target.slice(6)] = qiymat[m.key];

    const contactId = name || phone ? await kontaktniTopYokiYarat(tx, f.businessId, { name, phone, email }) : null;
    if (contactId && kompaniya) {
      await tx.update(contact).set({ company: sql`coalesce(${contact.company}, ${kompaniya})` }).where(eq(contact.id, contactId));
    }
    const [m] = await tx
      .insert(crmInbox)
      .values({
        businessId: f.businessId,
        source: 'form',
        externalId: k.submissionId,
        name,
        phone,
        email,
        message: xabarlar.join('\n') || null,
        contactId,
        formId: forma!.id,
        pipelineId: forma!.pipelineId,
        payload: { fields, tags: forma!.tags, formName: forma!.source || forma!.name, page: k.page ?? null, values: qiymat },
      })
      .onConflictDoNothing()
      .returning({ id: crmInbox.id });
    if (m) {
      await tx.update(crmForm).set({ submissions: sql`${crmForm.submissions} + 1` }).where(eq(crmForm.id, forma!.id));
      if (forma!.autoAccept) await murojaatniQabul(tx, { id: m.id, businessId: f.businessId, userId: null, doira: TIZIM, kirish: {} });
    }
    return { thankYou: forma!.thankYou };
  });
}

