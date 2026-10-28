import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { withoutTenantIsolation, withTenant, type Tx } from '../db/index.js';
import { crmAutomation, crmAutomationRun, crmField, crmPipeline, crmStage, deal, dealEvent, seat, task } from '../db/schema/index.js';
import { navbatdagiMasul, sozlamaniOl } from './sozlama.js';
import { CrmXatosi } from './xato.js';
import { bitimniKochir, bitimVazifasi, teglarniTozala, vaqtZonasiniOrnat, type CrmDoira } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — avtomatika (Digital Pipeline: AUTO-02/03, WF-01..07)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Qoida bosqichga bog'lanadi: bitim shu bosqichga KIRGANDAN `delayMinutes`
 * o'tgach (0 — darhol) va hali shu bosqichda bo'lsa — amallar bajariladi.
 * Masalan TZ WF-02: "QAYTA ALOQA ZARUR"da 24 soat → mas'ulga vazifa.
 *
 * Kafolatlar:
 *   • bitta bosqichga kirish uchun bir marta (`crm_automation_run` noyob
 *     kaliti: qoida + bitim + kirish vaqti) — qayta kirsa, yangi kalit;
 *   • bosqich o'zgarsa — taymer o'z-o'zidan bekor (bitim endi shu bosqichda emas);
 *   • qoida yaratilishidan OLDIN kirgan bitimlarga qo'llanmaydi (eski bitimlar
 *     ommaviy vazifa bilan to'lib ketmasin);
 *   • aylanish himoyasi: bitta bitimda 1 soatda 20 tadan ortiq ijro — to'xtaydi.
 */

const TIZIM: CrmDoira = { korish: 'all', yozish: 'all', seatId: null };

const vazifaAmali = z.object({
  type: z.literal('task'),
  title: z.string().trim().min(1, 'Vazifa matnini kiriting').max(300),
  taskType: z.string().max(40).default('call'),
  /** Muddat: ijro paytidan necha daqiqa keyin. */
  dueMinutes: z.number().int().min(0).max(60 * 24 * 90).default(60),
});
const masulAmali = z.object({
  type: z.literal('responsible'),
  /** roundrobin — ro'yxatdagilar (bo'sh bo'lsa umumiy taqsimot) orasida navbat bilan */
  mode: z.enum(['roundrobin', 'seat']),
  seatId: z.string().uuid().nullable().optional(),
  seatIds: z.array(z.string().uuid()).max(100).optional(),
});
const kochirishAmali = z.object({ type: z.literal('move'), stageId: z.string().uuid() });
const tegAmali = z.object({ type: z.literal('tag'), tag: z.string().trim().min(1).max(50) });
const izohAmali = z.object({ type: z.literal('note'), text: z.string().trim().min(1).max(2000) });
/**
 * Boshqa voronkada nusxa (Metasell: "100% to'landi" → Vnedreniye). Asl lid
 * joyida qoladi — sotuv statistikasi buzilmaydi; nusxa bir marta yaratiladi.
 */
const nusxaAmali = z.object({ type: z.literal('copy'), stageId: z.string().uuid() });

export const amalSxemasi = z.discriminatedUnion('type', [vazifaAmali, masulAmali, kochirishAmali, tegAmali, izohAmali, nusxaAmali]);
export type Amal = z.infer<typeof amalSxemasi>;

/**
 * Qoida qachon ishlaydi:
 *   • `stage` (standart) — lid bosqichga kirgandan `delayMinutes` o'tgach;
 *   • `date` — lid shu bosqichda turganda, sana maydonidagi kungacha
 *     `daysBefore` kun qolganda (0 — o'sha kuni yoki o'tib ketgan bo'lsa).
 *     Masalan, Qayta to'lov: obuna tugashiga 30 / 14 / 7 / 0 kun. Sana
 *     o'zgarsa (obuna uzaytirilsa) qoida yangi sana uchun yana ishlaydi.
 */
const shartlar = z.object({
  onlyIfNoOpenTasks: z.boolean().optional(),
  onlyIfNoResponsible: z.boolean().optional(),
  trigger: z.enum(['stage', 'date']).optional(),
  dateFieldId: z.string().uuid().optional(),
  daysBefore: z.number().int().min(0).max(365).optional(),
});
type Shartlar = z.infer<typeof shartlar>;

export const qoidaKirish = z.object({
  name: z.string().trim().min(1, 'Qoida nomini kiriting').max(120),
  stageId: z.string().uuid(),
  delayMinutes: z.number().int().min(0).max(60 * 24 * 90).default(0),
  conditions: shartlar.default({}),
  actions: z.array(amalSxemasi).min(1, 'Kamida bitta amal qo‘shing').max(10),
  active: z.boolean().default(true),
});

export async function qoidalar(tx: Tx) {
  const r = await tx
    .select({
      id: crmAutomation.id,
      name: crmAutomation.name,
      pipelineId: crmAutomation.pipelineId,
      stageId: crmAutomation.stageId,
      delayMinutes: crmAutomation.delayMinutes,
      conditions: crmAutomation.conditions,
      actions: crmAutomation.actions,
      active: crmAutomation.active,
      createdAt: crmAutomation.createdAt,
      runs: sql<number>`(select count(*)::int from crm_automation_run r where r.automation_id = "crm_automation"."id" and r.status = 'done')`,
      errors: sql<number>`(select count(*)::int from crm_automation_run r where r.automation_id = "crm_automation"."id" and r.status = 'error')`,
      lastRunAt: sql<string | null>`(select max(r.created_at) from crm_automation_run r where r.automation_id = "crm_automation"."id")`,
    })
    .from(crmAutomation)
    .orderBy(asc(crmAutomation.createdAt));
  return r;
}

async function qoidaniTekshir(tx: Tx, k: z.infer<typeof qoidaKirish>): Promise<string> {
  const [b] = await tx.select({ pipelineId: crmStage.pipelineId }).from(crmStage).where(eq(crmStage.id, k.stageId)).limit(1);
  if (!b) throw new CrmXatosi('yaroqsiz', 'Bosqich topilmadi');
  const s = await sozlamaniOl(tx);
  if (k.conditions.trigger === 'date') {
    if (!k.conditions.dateFieldId) throw new CrmXatosi('yaroqsiz', 'Sana maydonini tanlang');
    const [m] = await tx.select({ type: crmField.type }).from(crmField).where(eq(crmField.id, k.conditions.dateFieldId)).limit(1);
    if (!m || (m.type !== 'date' && m.type !== 'datetime')) throw new CrmXatosi('yaroqsiz', 'Sana turidagi maydonni tanlang');
  }
  for (const a of k.actions) {
    if (a.type === 'move') {
      if (a.stageId === k.stageId) throw new CrmXatosi('yaroqsiz', 'Bitimni o‘sha bosqichning o‘ziga ko‘chirib bo‘lmaydi');
      const [m] = await tx.select({ id: crmStage.id }).from(crmStage).where(eq(crmStage.id, a.stageId)).limit(1);
      if (!m) throw new CrmXatosi('yaroqsiz', 'Ko‘chiriladigan bosqich topilmadi');
    }
    if (a.type === 'copy') {
      const [m] = await tx.select({ pipelineId: crmStage.pipelineId }).from(crmStage).where(eq(crmStage.id, a.stageId)).limit(1);
      if (!m) throw new CrmXatosi('yaroqsiz', 'Nusxa bosqichi topilmadi');
      if (m.pipelineId === b.pipelineId) throw new CrmXatosi('yaroqsiz', 'Nusxa boshqa voronkada yaratiladi — shu voronka uchun «Ko‘chirish» amalini tanlang');
    }
    if (a.type === 'task' && !s.taskTypes.some((t) => t.id === a.taskType)) throw new CrmXatosi('yaroqsiz', "Vazifa turi noto'g'ri");
    if (a.type === 'responsible') {
      const idlar = a.mode === 'seat' ? (a.seatId ? [a.seatId] : []) : (a.seatIds ?? []);
      if (a.mode === 'seat' && !a.seatId) throw new CrmXatosi('yaroqsiz', 'Xodimni tanlang');
      for (const id of idlar) {
        const [x] = await tx.select({ id: seat.id }).from(seat).where(eq(seat.id, id)).limit(1);
        if (!x) throw new CrmXatosi('yaroqsiz', 'Xodim topilmadi');
      }
    }
  }
  return b.pipelineId;
}

export async function qoidaYarat(tx: Tx, businessId: string, k: z.infer<typeof qoidaKirish>): Promise<string> {
  const pipelineId = await qoidaniTekshir(tx, k);
  const [r] = await tx
    .insert(crmAutomation)
    .values({ businessId, pipelineId, ...k })
    .returning({ id: crmAutomation.id });
  return r!.id;
}

export async function qoidaniYangila(tx: Tx, id: string, k: z.infer<typeof qoidaKirish>): Promise<void> {
  const pipelineId = await qoidaniTekshir(tx, k);
  const r = await tx
    .update(crmAutomation)
    .set({ pipelineId, ...k, updatedAt: new Date() })
    .where(eq(crmAutomation.id, id))
    .returning({ id: crmAutomation.id });
  if (r.length === 0) throw new CrmXatosi('topilmadi', 'Qoida topilmadi');
}

export async function qoidaniOchir(tx: Tx, id: string): Promise<void> {
  const r = await tx.delete(crmAutomation).where(eq(crmAutomation.id, id)).returning({ id: crmAutomation.id });
  if (r.length === 0) throw new CrmXatosi('topilmadi', 'Qoida topilmadi');
}

/** Ijro jurnali — oxirgilari (AUTO-06). */
export async function ijroJurnali(tx: Tx, automationId?: string) {
  const r = await tx.execute(sql`
    select r.id, r.status, r.error, r.created_at, r.deal_id, d.name as deal_name, a.name as automation_name
    from crm_automation_run r
    join crm_automation a on a.id = r.automation_id
    left join deal d on d.id = r.deal_id
    ${automationId ? sql`where r.automation_id = ${automationId}` : sql``}
    order by r.created_at desc
    limit 100
  `);
  return ((r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])) as {
    id: string;
    status: string;
    error: string | null;
    created_at: string;
    deal_id: string;
    deal_name: string | null;
    automation_name: string;
  }[];
}

const KIRISH_KALITI = sql.raw(`to_char(d.stage_entered_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US')`);

/**
 * Bir biznes bo'yicha muddati yetgan qoidalarni bajaradi. `dealId` berilsa —
 * faqat shu bitim (bitim ko'chirilgandan keyin darhol javob uchun).
 */
export async function avtomatikaniIjroEt(tx: Tx, businessId: string, opts: { dealId?: string } = {}): Promise<number> {
  const qoidaRoyxati = await tx
    .select()
    .from(crmAutomation)
    .where(eq(crmAutomation.active, true));
  if (qoidaRoyxati.length === 0) return 0;
  // Sana qoidalari biznes vaqt zonasidagi "bugun" bilan solishtiriladi
  if (qoidaRoyxati.some((q) => (q.conditions as Shartlar | null)?.trigger === 'date')) await vaqtZonasiniOrnat(tx, businessId);
  let bajarildi = 0;
  for (const q of qoidaRoyxati) {
    const sh = (q.conditions ?? {}) as Shartlar;
    const sanaQoidasi = sh.trigger === 'date' && sh.dateFieldId;
    const r = sanaQoidasi
      ? await tx.execute(sql`
      select d.id, (d.fields->>${sh.dateFieldId}) as entry_key, d.responsible_seat_id,
        (select count(*)::int from task t where t.deal_id = d.id and t.status in ('pending','in_progress','blocked')) as open_tasks,
        (select count(*)::int from crm_automation_run x where x.deal_id = d.id and x.created_at > now() - interval '1 hour') as recent_runs
      from deal d
      where d.stage_id = ${q.stageId}
        and d.deleted_at is null
        and coalesce(d.fields->>${sh.dateFieldId}, '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
        and (left(d.fields->>${sh.dateFieldId}, 10))::date - ${sh.daysBefore ?? 0}::int <= current_date
        ${opts.dealId ? sql`and d.id = ${opts.dealId}` : sql``}
        and not exists (select 1 from crm_automation_run r
                        where r.automation_id = ${q.id} and r.deal_id = d.id and r.entry_key = (d.fields->>${sh.dateFieldId}))
      order by d.updated_at
      limit 100
    `)
      : await tx.execute(sql`
      select d.id, ${KIRISH_KALITI} as entry_key, d.responsible_seat_id,
        (select count(*)::int from task t where t.deal_id = d.id and t.status in ('pending','in_progress','blocked')) as open_tasks,
        (select count(*)::int from crm_automation_run x where x.deal_id = d.id and x.created_at > now() - interval '1 hour') as recent_runs
      from deal d
      where d.stage_id = ${q.stageId}
        and d.deleted_at is null
        and d.stage_entered_at >= ${q.createdAt.toISOString()}
        and d.stage_entered_at <= now() - (${q.delayMinutes} * interval '1 minute')
        ${opts.dealId ? sql`and d.id = ${opts.dealId}` : sql``}
        and not exists (select 1 from crm_automation_run r
                        where r.automation_id = ${q.id} and r.deal_id = d.id and r.entry_key = ${KIRISH_KALITI})
      order by d.stage_entered_at
      limit 100
    `);
    const nomzodlar = ((r as unknown as { rows?: unknown[] }).rows ?? (r as unknown as unknown[])) as {
      id: string;
      entry_key: string;
      responsible_seat_id: string | null;
      open_tasks: number;
      recent_runs: number;
    }[];
    for (const n of nomzodlar) {
      // Avval band qilamiz — parallel worker ikkinchi marta bajarmaydi
      const [band] = await tx
        .insert(crmAutomationRun)
        .values({ businessId, automationId: q.id, dealId: n.id, entryKey: n.entry_key, status: 'done' })
        .onConflictDoNothing()
        .returning({ id: crmAutomationRun.id });
      if (!band) continue;
      const shart = (q.conditions ?? {}) as { onlyIfNoOpenTasks?: boolean; onlyIfNoResponsible?: boolean };
      let holat: 'done' | 'skipped' | 'error' = 'done';
      let xato: string | null = null;
      if (Number(n.recent_runs) >= 20) {
        holat = 'error';
        xato = 'Aylanish himoyasi: 1 soatda 20 tadan ortiq ijro';
      } else if ((shart.onlyIfNoOpenTasks && Number(n.open_tasks) > 0) || (shart.onlyIfNoResponsible && n.responsible_seat_id)) {
        holat = 'skipped';
      } else {
        try {
          await tx.transaction(async (ichki) => {
            for (const a of q.actions as Amal[]) await amalniBajar(ichki, businessId, n.id, a, q.name);
          });
          bajarildi++;
        } catch (e) {
          holat = 'error';
          xato = e instanceof CrmXatosi ? e.message : (e as Error).message.slice(0, 300);
        }
      }
      if (holat !== 'done') {
        await tx.update(crmAutomationRun).set({ status: holat, error: xato }).where(eq(crmAutomationRun.id, band.id));
      }
    }
  }
  return bajarildi;
}

async function amalniBajar(tx: Tx, businessId: string, dealId: string, a: Amal, qoidaNomi: string): Promise<void> {
  switch (a.type) {
    case 'task':
      await bitimVazifasi(tx, {
        id: dealId,
        userId: null,
        doira: TIZIM,
        title: a.title,
        taskType: a.taskType,
        dueAt: new Date(Date.now() + a.dueMinutes * 60_000),
        description: null,
        avtomatika: qoidaNomi,
      });
      return;
    case 'move':
      await bitimniKochir(tx, { id: dealId, userId: null, doira: TIZIM, kirish: { stageId: a.stageId }, avtomatika: qoidaNomi });
      return;
    case 'responsible': {
      const [d] = await tx.select({ responsibleSeatId: deal.responsibleSeatId }).from(deal).where(eq(deal.id, dealId)).limit(1);
      const yangi = a.mode === 'seat' ? (a.seatId ?? null) : await navbatdagiMasul(tx, businessId, a.seatIds?.length ? a.seatIds : undefined);
      if (!yangi || yangi === d?.responsibleSeatId) return;
      await tx.update(deal).set({ responsibleSeatId: yangi, version: sql`${deal.version} + 1`, updatedAt: new Date() }).where(eq(deal.id, dealId));
      // Bitimning ochiq vazifalari ham yangi mas'ulga o'tadi
      await tx
        .update(task)
        .set({ seatId: yangi })
        .where(and(eq(task.dealId, dealId), sql`${task.status} in ('pending','in_progress','blocked')`));
      await tx.insert(dealEvent).values({
        businessId,
        dealId,
        type: 'responsible',
        data: { before: d?.responsibleSeatId ?? null, after: yangi, automation: qoidaNomi },
        authorUserId: null,
      });
      return;
    }
    case 'tag': {
      const [d] = await tx.select({ tags: deal.tags }).from(deal).where(eq(deal.id, dealId)).limit(1);
      const eski = d?.tags ?? [];
      const yangi = teglarniTozala([...eski, a.tag]);
      if (yangi.length === eski.length) return;
      await tx.update(deal).set({ tags: yangi, updatedAt: new Date() }).where(eq(deal.id, dealId));
      await tx.insert(dealEvent).values({ businessId, dealId, type: 'tags', data: { before: eski, after: yangi, automation: qoidaNomi }, authorUserId: null });
      return;
    }
    case 'note':
      await tx.insert(dealEvent).values({ businessId, dealId, type: 'note', data: { text: a.text, automation: qoidaNomi }, authorUserId: null });
      return;
    case 'copy': {
      const [[d], [b]] = await Promise.all([
        tx.select().from(deal).where(eq(deal.id, dealId)).limit(1),
        tx
          .select({ id: crmStage.id, pipelineId: crmStage.pipelineId, name: crmStage.name, kind: crmStage.kind, pipelineName: crmPipeline.name })
          .from(crmStage)
          .innerJoin(crmPipeline, eq(crmPipeline.id, crmStage.pipelineId))
          .where(eq(crmStage.id, a.stageId))
          .limit(1),
      ]);
      if (!d || d.deletedAt) return;
      if (!b) throw new CrmXatosi('yaroqsiz', 'Nusxa bosqichi topilmadi');
      // Takror yo'q: shu lidning shu voronkada tirik nusxasi bo'lsa — qaytadan yaratilmaydi
      const bor = await tx.execute(sql`
        select 1 from deal_event e join deal x on x.id = e.deal_id
        where e.type = 'created' and e.data->>'copiedFrom' = ${dealId}
          and x.pipeline_id = ${b.pipelineId} and x.deleted_at is null
        limit 1
      `);
      if ((((bor as unknown as { rows?: unknown[] }).rows ?? (bor as unknown as unknown[])) as unknown[]).length > 0) return;
      const [n] = await tx
        .insert(deal)
        .values({
          businessId,
          pipelineId: b.pipelineId,
          stageId: b.id,
          name: d.name,
          amount: d.amount,
          responsibleSeatId: d.responsibleSeatId,
          contactId: d.contactId,
          companyId: d.companyId,
          tags: d.tags,
          fields: d.fields,
          source: d.source,
          closedAt: b.kind === 'open' ? null : new Date(),
          createdBy: null,
        })
        .returning({ id: deal.id });
      await tx.insert(dealEvent).values([
        {
          businessId,
          dealId: n!.id,
          type: 'created',
          data: { stageId: b.id, stageName: b.name, copiedFrom: dealId, copiedFromName: d.name, automation: qoidaNomi },
          authorUserId: null,
        },
        {
          businessId,
          dealId,
          type: 'note',
          data: { text: `«${b.pipelineName}» voronkasida nusxa yaratildi («${b.name}»)`, copiedTo: n!.id, automation: qoidaNomi },
          authorUserId: null,
        },
      ]);
      return;
    }
  }
}

/** Worker: faol qoidasi bor barcha bizneslar. */
export async function avtomatikaTiki(): Promise<{ businessId: string; bajarildi: number; xato?: string }[]> {
  const bizneslar = await withoutTenantIsolation('CRM avtomatika: faol qoidali bizneslar', (tx) =>
    tx.selectDistinct({ businessId: crmAutomation.businessId }).from(crmAutomation).where(eq(crmAutomation.active, true)),
  );
  const natija: { businessId: string; bajarildi: number; xato?: string }[] = [];
  for (const b of bizneslar) {
    try {
      const n = await withTenant(b.businessId, (tx) => avtomatikaniIjroEt(tx, b.businessId));
      natija.push({ businessId: b.businessId, bajarildi: n });
    } catch (e) {
      natija.push({ businessId: b.businessId, bajarildi: 0, xato: (e as Error).message });
    }
  }
  return natija;
}

/** Bitim o'zgargandan keyin darhol (javobni kutmasdan) — "0 daqiqa" qoidalari uchun. */
export function avtomatikaniUygot(businessId: string, dealId: string): void {
  void withTenant(businessId, (tx) => avtomatikaniIjroEt(tx, businessId, { dealId })).catch(() => undefined);
}
