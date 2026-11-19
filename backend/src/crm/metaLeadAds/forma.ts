import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withTenant, type Tx } from '../../db/index.js';
import { crmField, crmPipeline, crmStage, metaFormSetting, seat } from '../../db/schema/index.js';
import { CrmXatosi } from '../xato.js';
import { telefonniTozala } from './sof.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORMA SOZLAMASI — amoCRM'dagi Facebook forma oynasi bilan teng
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * amoCRM'da har ulangan forma uchun: savol → kontakt/bitim maydoni, boshlang'ich
 * voronka, teg; keyin "Taqsimot" Salesbot'i mas'ulni tayinlaydi. Bu yerda xuddi
 * shu — bitta joyda, ikkala yo'l (bevosita Meta va Make) uchun.
 *
 * Kalit — Meta `form_id`. Nom bo'yicha emas: amoCRM auditida bir xil nomli
 * forma ikki xil manba yozuviga ega bo'lgani kuzatilgan — nom ishonchsiz kalit.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type XaritaManzili = 'contact:name' | 'contact:phone' | 'contact:email' | 'note' | `field:${string}`;

export interface XaritaNatijasi {
  name: string | null;
  phone: string | null;
  email: string | null;
  /** crm_field id → qiymat (bitim yaratilganda turi bo'yicha tekshiriladi). */
  fields: Record<string, string>;
  /** Qaysi savol nimaga tushdi — kartada ko'rsatish uchun (qiymatlarsiz). */
  qollandi: Record<string, string>;
}

/**
 * Standart Meta kalitlari (`full_name`, `phone_number`, `email`) `lidniMoslash`da
 * allaqachon ajratilgan. O'zbekcha maxsus savollar ("Ismingiz?", "Telefon
 * raqamingiz?") esa standart emas — xarita bo'lmasa ham ism/telefon bo'sh
 * qolmasligi uchun ehtiyotkor taxmin: kalit nomi VA qiymat shakli mos kelsagina.
 */
const TELEFON_KALIT = /(telefon|raqam|phone|nomer|номер|телефон|\btel\b)/i;
const ISM_KALIT = /(^|[^a-zа-я])(ism|name|имя|fio|ф\.?и\.?о)/i;

function telefonmi(v: string): string | null {
  const t = telefonniTozala(v);
  return t && /^\+\d{7,15}$/.test(t) ? t : null;
}

export function xaritaniQolla(
  boshlangich: { name: string | null; phone: string | null; email: string | null },
  javoblar: Record<string, string>,
  mapping: Record<string, string>,
): XaritaNatijasi {
  const r: XaritaNatijasi = { ...boshlangich, fields: {}, qollandi: {} };
  // 1) Aniq xarita — foydalanuvchi tanlovi taxmindan ustun
  for (const [kalit, qiymat] of Object.entries(javoblar)) {
    const m = mapping[kalit];
    if (!m || m === 'note') continue;
    if (m === 'contact:name') {
      r.name = qiymat.slice(0, 200);
      r.qollandi[kalit] = m;
    } else if (m === 'contact:phone') {
      const t = telefonniTozala(qiymat);
      if (t) {
        r.phone = t;
        r.qollandi[kalit] = m;
      }
    } else if (m === 'contact:email') {
      if (EMAIL.test(qiymat)) {
        r.email = qiymat.slice(0, 200);
        r.qollandi[kalit] = m;
      }
    } else if (m.startsWith('field:')) {
      r.fields[m.slice(6)] = qiymat.slice(0, 1000);
      r.qollandi[kalit] = m;
    }
  }
  // 2) Taxmin — faqat bo'sh qolgan kontakt maydonlari uchun va xaritasiz savollardan
  for (const [kalit, qiymat] of Object.entries(javoblar)) {
    if (mapping[kalit]) continue;
    if (!r.phone && TELEFON_KALIT.test(kalit)) {
      const t = telefonmi(qiymat);
      if (t) {
        r.phone = t;
        r.qollandi[kalit] = 'contact:phone';
        continue;
      }
    }
    if (!r.email && EMAIL.test(qiymat.trim())) {
      r.email = qiymat.trim().slice(0, 200);
      r.qollandi[kalit] = 'contact:email';
      continue;
    }
    if (!r.name && ISM_KALIT.test(kalit) && !telefonmi(qiymat) && qiymat.length <= 120) {
      r.name = qiymat.slice(0, 200);
      r.qollandi[kalit] = 'contact:name';
    }
  }
  return r;
}

// ─── Lid kelganda ──────────────────────────────────────────────────────────

export interface FormaQollanishi {
  pipelineId: string | null;
  stageId: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  fields: Record<string, string>;
  tags: string[];
  formName: string | null;
  autoAccept: boolean;
  seatIds: string[];
  qollandi: Record<string, string>;
}

/**
 * Forma sozlamasini o'qiydi (yo'q bo'lsa — yaratadi: forma ro'yxatda paydo
 * bo'ladi, savol kalitlari yig'iladi) va lidga qo'llaydi. Chaqiruvchining
 * tranzaksiyasi va advisory qulfi ichida ishlaydi.
 */
export async function formaniQolla(
  tx: Tx,
  k: {
    businessId: string;
    formId: string | null;
    formName: string | null;
    pageName: string | null;
    name: string | null;
    phone: string | null;
    email: string | null;
    pipelineId: string | null;
    javoblar: Record<string, string>;
  },
): Promise<FormaQollanishi> {
  const standart: FormaQollanishi = {
    pipelineId: k.pipelineId,
    stageId: null,
    ...xaritaniQolla({ name: k.name, phone: k.phone, email: k.email }, k.javoblar, {}),
    tags: [],
    formName: k.formName,
    autoAccept: false,
    seatIds: [],
  };
  if (!k.formId) return standart;

  const savollar = Object.keys(k.javoblar).slice(0, 60);
  const [s] = await tx
    .insert(metaFormSetting)
    .values({ businessId: k.businessId, formId: k.formId, formName: k.formName, pageName: k.pageName, questions: savollar })
    .onConflictDoUpdate({
      target: [metaFormSetting.businessId, metaFormSetting.formId],
      set: {
        // Nom Meta'da o'zgarishi mumkin — oxirgisi ko'rsatiladi; savollar yig'iladi
        formName: sql`coalesce(${k.formName}, ${metaFormSetting.formName})`,
        pageName: sql`coalesce(${k.pageName}, ${metaFormSetting.pageName})`,
        questions: sql`(select coalesce(jsonb_agg(distinct q), '[]'::jsonb) from jsonb_array_elements_text(${metaFormSetting.questions} || ${JSON.stringify(savollar)}::jsonb) q)`,
      },
    })
    .returning();
  if (!s) return standart;

  const x = xaritaniQolla({ name: k.name, phone: k.phone, email: k.email }, k.javoblar, s.mapping ?? {});
  return {
    pipelineId: s.pipelineId ?? k.pipelineId,
    stageId: s.pipelineId ? s.stageId : null,
    ...x,
    tags: s.tags ?? [],
    formName: s.sourceName?.trim() || s.formName || k.formName,
    autoAccept: s.autoAccept === 1,
    seatIds: Array.isArray(s.seatIds) ? s.seatIds : [],
  };
}

/** Lid yozilgach: hisoblagich. */
export async function formaLidiniSana(tx: Tx, businessId: string, formId: string | null): Promise<void> {
  if (!formId) return;
  await tx
    .update(metaFormSetting)
    .set({ leadCount: sql`${metaFormSetting.leadCount} + 1`, lastLeadAt: new Date() })
    .where(and(eq(metaFormSetting.businessId, businessId), eq(metaFormSetting.formId, formId)));
}

/**
 * Forma navbati — haqiqiy round-robin (CRM'ning umumiy `navbatdagiMasul`i maxsus
 * ro'yxat uchun tasodifiy tanlaydi). Faol bo'lmagan o'rinlar o'tkazib yuboriladi.
 */
export async function formaNavbatdagiMasul(tx: Tx, businessId: string, formId: string): Promise<string | null> {
  const [s] = await tx
    .select({ seatIds: metaFormSetting.seatIds, cursor: metaFormSetting.rrCursor })
    .from(metaFormSetting)
    .where(and(eq(metaFormSetting.businessId, businessId), eq(metaFormSetting.formId, formId)))
    .for('update')
    .limit(1);
  const idlar = Array.isArray(s?.seatIds) ? s!.seatIds : [];
  if (idlar.length === 0) return null;
  const faollar = await tx.select({ id: seat.id }).from(seat).where(eq(seat.isActive, true));
  const faol = new Set(faollar.map((f) => f.id));
  let i = (s!.cursor + 1) % idlar.length;
  for (let n = 0; n < idlar.length && !faol.has(idlar[i]!); n++) i = (i + 1) % idlar.length;
  if (!faol.has(idlar[i]!)) return null;
  await tx
    .update(metaFormSetting)
    .set({ rrCursor: i })
    .where(and(eq(metaFormSetting.businessId, businessId), eq(metaFormSetting.formId, formId)));
  return idlar[i]!;
}

// ─── Sozlash (UI) ──────────────────────────────────────────────────────────

export const formaSozlamaSxemasi = z.object({
  pipelineId: z.string().uuid().nullable(),
  stageId: z.string().uuid().nullable(),
  mapping: z.record(z.string().max(300), z.string().regex(/^(contact:(name|phone|email)|note|field:[0-9a-f-]{36})$/)),
  tags: z.array(z.string().trim().min(1).max(60)).max(20),
  sourceName: z.string().trim().max(120).nullable(),
  autoAccept: z.boolean(),
  seatIds: z.array(z.string().uuid()).max(50),
});

export async function formaSozlamalari(businessId: string) {
  return withTenant(businessId, async (tx) => {
    const formalar = await tx.select().from(metaFormSetting).orderBy(sql`${metaFormSetting.lastLeadAt} desc nulls last`, metaFormSetting.createdAt);
    const maydonlar = await tx
      .select({ id: crmField.id, label: crmField.label, type: crmField.type })
      .from(crmField)
      .where(sql`${crmField.archivedAt} is null`)
      .orderBy(crmField.sort);
    return {
      formalar: formalar.map((f) => ({
        id: f.id,
        formId: f.formId,
        formName: f.formName,
        pageName: f.pageName,
        questions: f.questions,
        pipelineId: f.pipelineId,
        stageId: f.stageId,
        mapping: f.mapping,
        tags: f.tags,
        sourceName: f.sourceName,
        autoAccept: f.autoAccept === 1,
        seatIds: f.seatIds,
        leadCount: f.leadCount,
        lastLeadAt: f.lastLeadAt,
      })),
      maydonlar,
    };
  });
}

export async function formaSozlamasiniSaqla(businessId: string, id: string, userId: string, k: z.infer<typeof formaSozlamaSxemasi>): Promise<void> {
  await withTenant(businessId, async (tx) => {
    if (k.pipelineId) {
      const [v] = await tx.select({ id: crmPipeline.id }).from(crmPipeline).where(eq(crmPipeline.id, k.pipelineId)).limit(1);
      if (!v) throw new CrmXatosi('topilmadi', 'Voronka topilmadi');
    }
    if (k.stageId) {
      if (!k.pipelineId) throw new CrmXatosi('yaroqsiz', 'Bosqich uchun voronka tanlang');
      const [b] = await tx
        .select({ id: crmStage.id })
        .from(crmStage)
        .where(and(eq(crmStage.id, k.stageId), eq(crmStage.pipelineId, k.pipelineId)))
        .limit(1);
      if (!b) throw new CrmXatosi('yaroqsiz', 'Bosqich tanlangan voronkaga tegishli emas');
    }
    const fieldIdlar = Object.values(k.mapping).filter((m) => m.startsWith('field:')).map((m) => m.slice(6));
    if (fieldIdlar.length) {
      const bor = await tx.select({ id: crmField.id }).from(crmField).where(inArray(crmField.id, [...new Set(fieldIdlar)]));
      if (bor.length !== new Set(fieldIdlar).size) throw new CrmXatosi('yaroqsiz', 'Xaritadagi maydon topilmadi');
    }
    if (k.seatIds.length) {
      const bor = await tx.select({ id: seat.id }).from(seat).where(inArray(seat.id, [...new Set(k.seatIds)]));
      if (bor.length !== new Set(k.seatIds).size) throw new CrmXatosi('yaroqsiz', 'Mas\'ul topilmadi');
    }
    const r = await tx
      .update(metaFormSetting)
      .set({
        pipelineId: k.pipelineId,
        stageId: k.stageId,
        mapping: Object.fromEntries(Object.entries(k.mapping).filter(([, v]) => v !== 'note')),
        tags: [...new Set(k.tags)],
        sourceName: k.sourceName || null,
        autoAccept: k.autoAccept ? 1 : 0,
        seatIds: [...new Set(k.seatIds)],
        rrCursor: -1,
        updatedBy: userId,
        updatedAt: new Date(),
      })
      .where(eq(metaFormSetting.id, id))
      .returning({ id: metaFormSetting.id });
    if (!r.length) throw new CrmXatosi('topilmadi', 'Forma topilmadi');
  });
}
