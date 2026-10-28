import { and, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/index.js';
import { crmPipeline, crmStage, deal, dealEvent, seat } from '../db/schema/index.js';
import { CrmXatosi } from './xato.js';
import { teglarniTozala, type CrmDoira } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID XULOSALARI — yo'qotilgan lidlar va ularni qayta tiriltirish (Metasell)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Yo'qotilgan har bir lid uchun: nega yo'qotildi, qaysi bosqichda, qayta
 * yutish imkoniyati va qachon qayta bog'lanish kerak. Rahbar "imkoniyat
 * bo'yicha" saralab, eng umidlilarini tanlaydi va "CRMda yaratish" bilan
 * boshqa menejerga yangi lid qilib beradi — asl yo'qotilgan lid o'zgarmaydi.
 *
 * Imkoniyat bahosi tushuntirsa bo'ladigan qoidalardan (qora quti emas):
 *   • mijoz bilan oxirgi qo'ng'iroqdagi AI lid sifati: issiq +3, iliq +2, sovuq/yo'q +1;
 *   • rad sababi: aloqa/vaqt bilan bog'liq (hozir emas, ko'tarmadi, qayta
 *     aloqa yo'q) +1; qaytarib bo'lmaydigan (ehtiyoj yo'q, adashib tushdi,
 *     dublikat, spam) −1;
 *   • lid voronkaning ikkinchi yarmidan yo'qotilgan bo'lsa +1 (qiziqish bo'lgan).
 *   ≥4 — Yuqori, 3 — O'rtacha, ≤2 — Past.
 */

const ALOQA = /hozir|keyin|ko.?tarma|javob|aloqa|bog.?lan|vaqt|band|o.?ylab/i;
const QAYTMAS = /ehtiyoj|kerak emas|adashib|dublikat|spam|noto.?g.?ri|sotuv bo.?limi yo.?q|test/i;
const NARX = /narx|qimmat|byudjet|pul/i;

export type Imkoniyat = 'high' | 'medium' | 'low';

function baholash(p: { quality: string | null; reason: string | null; depth: number | null }): { imkoniyat: Imkoniyat; ball: number; oyna: string } {
  let ball = p.quality === 'hot' ? 3 : p.quality === 'warm' ? 2 : 1;
  const sabab = p.reason ?? '';
  if (ALOQA.test(sabab)) ball += 1;
  if (QAYTMAS.test(sabab)) ball -= 1;
  if ((p.depth ?? 0) >= 0.5) ball += 1;
  const imkoniyat: Imkoniyat = ball >= 4 ? 'high' : ball === 3 ? 'medium' : 'low';
  // Qayta bog'lanish oynasi: sabab turiga ko'ra
  const oyna = ALOQA.test(sabab) ? '15–30' : NARX.test(sabab) ? '30–60' : QAYTMAS.test(sabab) ? '90–180' : '30–60';
  return { imkoniyat, ball, oyna };
}

export const yoqotilganFiltr = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  seat: z.string().uuid().optional(),
  reason: z.string().uuid().optional(),
  chance: z.enum(['high', 'medium', 'low']).optional(),
  sort: z.enum(['date', 'chance']).default('date'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

interface Qator {
  id: string;
  name: string;
  closed_at: string | null;
  seat_id: string | null;
  seat_name: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  reason: string | null;
  reason_id: string | null;
  lost_stage: string | null;
  depth: number | null;
  quality: string | null;
  summary: string | null;
}

/**
 * Yo'qotilgan lidlar. Imkoniyat bazada emas, shu yerda hisoblanadi —
 * shuning uchun "imkoniyat bo'yicha" saralash/filtr oxirgi 2000 ta yo'qotilgan
 * lid ichida bajariladi (bu oynadan kattasi amalda ko'rib chiqilmaydi).
 */
export async function yoqotilganLidlar(tx: Tx, f: z.infer<typeof yoqotilganFiltr>, doira: CrmDoira) {
  // Ko'rish doirasi (korishSharti bilan bir xil qoida — bu yerda `d` alias bilan)
  const k = doira.korish === 'own' ? sql`d.responsible_seat_id = ${doira.seatId ?? '00000000-0000-0000-0000-000000000000'}` : null;
  const r = await tx.execute(sql`
    select d.id, d.name, d.closed_at, d.responsible_seat_id as seat_id, se.display_name as seat_name,
      c.name as contact_name, c.phone as contact_phone,
      coalesce(lr.name, d.lost_reason) as reason, d.lost_reason_id as reason_id,
      (select e.data->>'fromName' from deal_event e where e.deal_id = d.id and e.type = 'stage' order by e.created_at desc limit 1) as lost_stage,
      (select (s2.sort::float / nullif((select max(s3.sort) from crm_stage s3 where s3.pipeline_id = d.pipeline_id and s3.kind = 'open'), 0))
         from deal_event e join crm_stage s2 on s2.id::text = e.data->>'fromStageId'
         where e.deal_id = d.id and e.type = 'stage' order by e.created_at desc limit 1) as depth,
      (select a.lead_quality from conversation cv join analysis a on a.conversation_id = cv.id
         where d.contact_id is not null and cv.contact_id = d.contact_id order by cv.started_at desc limit 1) as quality,
      (select a.summary from conversation cv join analysis a on a.conversation_id = cv.id
         where d.contact_id is not null and cv.contact_id = d.contact_id and a.summary is not null order by cv.started_at desc limit 1) as summary
    from deal d
    join crm_stage s on s.id = d.stage_id and s.kind = 'lost'
    left join contact c on c.id = d.contact_id
    left join seat se on se.id = d.responsible_seat_id
    left join crm_loss_reason lr on lr.id = d.lost_reason_id
    where d.deleted_at is null
      ${k ? sql`and ${k}` : sql``}
      ${f.from ? sql`and d.closed_at >= ${f.from}` : sql``}
      ${f.to ? sql`and d.closed_at < ${f.to}` : sql``}
      ${f.seat ? sql`and d.responsible_seat_id = ${f.seat}` : sql``}
      ${f.reason ? sql`and d.lost_reason_id = ${f.reason}` : sql``}
    order by d.closed_at desc nulls last
    limit 2000
  `);
  const qatorlar = ((r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])) as Qator[];
  const tartib = { high: 0, medium: 1, low: 2 } as const;
  let items = qatorlar.map((q) => {
    const b = baholash({ quality: q.quality, reason: q.reason, depth: q.depth === null ? null : Number(q.depth) });
    return {
      id: q.id,
      name: q.name,
      closedAt: q.closed_at,
      seatId: q.seat_id,
      seatName: q.seat_name,
      contactName: q.contact_name,
      contactPhone: q.contact_phone,
      reason: q.reason,
      lostStage: q.lost_stage,
      quality: q.quality,
      summary: q.summary,
      chance: b.imkoniyat,
      score: b.ball,
      recontactDays: b.oyna,
    };
  });
  if (f.chance) items = items.filter((x) => x.chance === f.chance);
  if (f.sort === 'chance') items.sort((a, b) => tartib[a.chance] - tartib[b.chance] || b.score - a.score);
  const counts = { high: 0, medium: 0, low: 0 };
  for (const x of items) counts[x.chance]++;
  return { total: items.length, counts, items: items.slice(f.offset, f.offset + f.limit) };
}

/** Menejerlar: yutilgan va yo'qotilgan lidlari soni (oynada tanlash uchun). */
export async function menejerNatijalari(tx: Tx) {
  const r = await tx.execute(sql`
    select se.id, se.display_name as name,
      count(*) filter (where s.kind = 'won')::int as won,
      count(*) filter (where s.kind = 'lost')::int as lost
    from seat se
    left join deal d on d.responsible_seat_id = se.id and d.deleted_at is null
    left join crm_stage s on s.id = d.stage_id
    where se.is_active
    group by se.id, se.display_name
    order by count(*) filter (where s.kind = 'won') desc, se.display_name
  `);
  return ((r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])) as { id: string; name: string; won: number; lost: number }[];
}

export const qaytaYaratishKirish = z.object({
  dealIds: z.array(z.string().uuid()).min(1, 'Kamida bitta lidni tanlang').max(200),
  stageId: z.string().uuid(),
  /** Bo'sh — asl lidning mas'uli. */
  seatId: z.string().uuid().nullable().optional(),
});

/**
 * Tanlangan yo'qotilgan lidlardan yangi lid yaratish. Nusxa: nom, kontakt,
 * kompaniya, summa, maydonlar va teglar (+ "qayta-aloqa"); tarixda ikkala
 * lid bir-biriga bog'lanadi. Asl lid o'zgarmaydi.
 */
export async function qaytaYarat(
  tx: Tx,
  p: { businessId: string; userId: string; doira: CrmDoira; kirish: z.infer<typeof qaytaYaratishKirish> },
): Promise<{ created: number }> {
  if (p.doira.yozish !== 'all') throw new CrmXatosi('ruxsat', 'Bu amal faqat rahbarga ruxsat');
  const [b] = await tx
    .select({ id: crmStage.id, pipelineId: crmStage.pipelineId, name: crmStage.name, kind: crmStage.kind, pipelineName: crmPipeline.name })
    .from(crmStage)
    .innerJoin(crmPipeline, eq(crmPipeline.id, crmStage.pipelineId))
    .where(eq(crmStage.id, p.kirish.stageId))
    .limit(1);
  if (!b) throw new CrmXatosi('yaroqsiz', 'Bosqich topilmadi');
  if (p.kirish.seatId) {
    const [x] = await tx.select({ id: seat.id }).from(seat).where(eq(seat.id, p.kirish.seatId)).limit(1);
    if (!x) throw new CrmXatosi('yaroqsiz', 'Xodim topilmadi');
  }
  const asllar = await tx
    .select()
    .from(deal)
    .where(and(inArray(deal.id, p.kirish.dealIds), sql`${deal.deletedAt} is null`));
  let created = 0;
  for (const d of asllar) {
    const [n] = await tx
      .insert(deal)
      .values({
        businessId: p.businessId,
        pipelineId: b.pipelineId,
        stageId: b.id,
        name: d.name,
        amount: d.amount,
        responsibleSeatId: p.kirish.seatId ?? d.responsibleSeatId,
        contactId: d.contactId,
        companyId: d.companyId,
        tags: teglarniTozala([...(d.tags ?? []), 'qayta-aloqa']),
        fields: d.fields,
        source: d.source,
        closedAt: b.kind === 'open' ? null : new Date(),
        createdBy: p.userId,
      })
      .returning({ id: deal.id });
    await tx.insert(dealEvent).values([
      {
        businessId: p.businessId,
        dealId: n!.id,
        type: 'created',
        data: { stageId: b.id, stageName: b.name, copiedFrom: d.id, copiedFromName: d.name, reactivated: true },
        authorUserId: p.userId,
      },
      {
        businessId: p.businessId,
        dealId: n!.id,
        type: 'note',
        data: { text: `Yo'qotilgan liddan qayta aloqa uchun yaratildi. Yo'qotish sababi: ${d.lostReason ?? '—'}` },
        authorUserId: p.userId,
      },
      {
        businessId: p.businessId,
        dealId: d.id,
        type: 'note',
        data: { text: `Qayta aloqa uchun yangi lid yaratildi: «${b.pipelineName}» → «${b.name}»`, copiedTo: n!.id },
        authorUserId: p.userId,
      },
    ]);
    created++;
  }
  return { created };
}
