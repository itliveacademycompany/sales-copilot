import { and, eq, isNull, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/index.js';
import { crmGoal, seat } from '../db/schema/index.js';
import { CrmXatosi } from './xato.js';
import { tuzilma, type CrmDoira } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — Ish stoli va analitika (DASH-01/02, RPT-01..06)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ta'riflar (TZ 12-bo'lim):
 *   • Ochiq bitim — o'chirilmagan, bosqich turi `open`; bir bitim bir marta.
 *   • Vazifasiz bitim — ochiq bitim va ochiq vazifasi yo'q.
 *   • Won ratio — won / (won + lost), shu davrda yopilganlar; ochiqlar maxrajga kirmaydi.
 *   • Bosqich konversiyasi — davrda yaratilgan bitimlar (kogorta) ichidan shu
 *     bosqichga hech bo'lmasa bir marta yetganlar ulushi (tarix hodisalaridan).
 *   • Maqsad — fakt / reja; reja 0 yoki yo'q bo'lsa foiz emas, "belgilanmagan".
 */

const BOSH_UUID = '00000000-0000-0000-0000-000000000000';

export const davrSxemasi = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  pipelineId: z.string().uuid().optional(),
  seat: z.string().uuid().optional(),
});
export type Davr = z.infer<typeof davrSxemasi>;

function qatorlar<T>(r: unknown): T[] {
  return ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[];
}

/** Ko'rish doirasi + tanlangan xodim + voronka — `d` (deal) aliasi uchun SQL. */
function bitimSharti(doira: CrmDoira, d: Davr): SQL {
  const qism: SQL[] = [sql`d.deleted_at is null`];
  if (doira.korish === 'own') qism.push(sql`d.responsible_seat_id = ${doira.seatId ?? BOSH_UUID}`);
  else if (d.seat) qism.push(sql`d.responsible_seat_id = ${d.seat}`);
  if (d.pipelineId) qism.push(sql`d.pipeline_id = ${d.pipelineId}`);
  return sql.join(qism, sql` and `);
}

function vazifaSharti(doira: CrmDoira, d: Davr): SQL {
  const qism: SQL[] = [sql`(t.deal_id is not null or t.contact_id is not null or t.task_type is not null)`];
  if (doira.korish === 'own') qism.push(sql`t.seat_id = ${doira.seatId ?? BOSH_UUID}`);
  else if (d.seat) qism.push(sql`t.seat_id = ${d.seat}`);
  return sql.join(qism, sql` and `);
}

/** Ish stoli: KPI raqamlar + bosqichlar + manbalar + xodimlar + trend + maqsad. */
export async function ishStoli(tx: Tx, p: { doira: CrmDoira; davr: Davr }) {
  const { doira, davr } = p;
  const b = bitimSharti(doira, davr);
  const v = vazifaSharti(doira, davr);
  const from = davr.from;
  const to = davr.to;

  const [kpi] = qatorlar<Record<string, string | number | null>>(
    await tx.execute(sql`
      select
        count(*) filter (where d.created_at >= ${from} and d.created_at < ${to})::int as new_count,
        coalesce(sum(d.amount) filter (where d.created_at >= ${from} and d.created_at < ${to}), 0) as new_sum,
        count(*) filter (where s.kind = 'won' and d.closed_at >= ${from} and d.closed_at < ${to})::int as won_count,
        coalesce(sum(d.amount) filter (where s.kind = 'won' and d.closed_at >= ${from} and d.closed_at < ${to}), 0) as won_sum,
        count(*) filter (where s.kind = 'lost' and d.closed_at >= ${from} and d.closed_at < ${to})::int as lost_count,
        count(*) filter (where s.kind = 'open')::int as open_count,
        coalesce(sum(d.amount) filter (where s.kind = 'open'), 0) as open_sum,
        count(*) filter (where s.kind = 'open' and not exists (
          select 1 from task t where t.deal_id = d.id and t.status in ('pending','in_progress','blocked')))::int as no_task
      from deal d join crm_stage s on s.id = d.stage_id
      where ${b}
    `),
  );
  const [vaz] = qatorlar<Record<string, number>>(
    await tx.execute(sql`
      select
        count(*) filter (where t.status in ('pending','in_progress','blocked') and t.due_at < now())::int as overdue,
        count(*) filter (where t.status in ('pending','in_progress','blocked') and t.due_at >= date_trunc('day', now())
                         and t.due_at < date_trunc('day', now()) + interval '1 day')::int as today,
        count(*) filter (where t.status = 'done' and t.completed_at >= ${from} and t.completed_at < ${to})::int as done
      from task t left join deal d on d.id = t.deal_id
      where ${v} and (d.id is null or d.deleted_at is null)
    `),
  );
  const [inbox] = qatorlar<{ n: number }>(await tx.execute(sql`select count(*)::int as n from crm_inbox where status = 'pending'`));

  // Bosqichlar (tanlangan yoki asosiy voronka) — hozirgi holat
  const t = await tuzilma(tx);
  const voronka = t.pipelines.find((x) => x.id === davr.pipelineId) ?? t.pipelines.find((x) => x.isMain) ?? t.pipelines[0];
  const bosqichlar = voronka
    ? qatorlar<{ stage_id: string; n: number; sum: string | null }>(
        await tx.execute(sql`
          select d.stage_id, count(*)::int as n, sum(d.amount) as sum
          from deal d where ${bitimSharti(doira, { ...davr, pipelineId: voronka.id })}
          group by d.stage_id
        `),
      )
    : [];

  const manbalar = qatorlar<{ source: string | null; n: number; won: number; won_sum: string | null }>(
    await tx.execute(sql`
      select coalesce(d.source, '') as source, count(*)::int as n,
        count(*) filter (where s.kind = 'won')::int as won,
        sum(d.amount) filter (where s.kind = 'won') as won_sum
      from deal d join crm_stage s on s.id = d.stage_id
      where ${b} and d.created_at >= ${from} and d.created_at < ${to}
      group by 1 order by 2 desc limit 20
    `),
  );

  const sabablar = qatorlar<{ id: string | null; name: string; n: number; sum: string | null }>(
    await tx.execute(sql`
      select r.id, coalesce(r.name, nullif(d.lost_reason, ''), 'Sababsiz') as name, count(*)::int as n, sum(d.amount) as sum
      from deal d join crm_stage s on s.id = d.stage_id left join crm_loss_reason r on r.id = d.lost_reason_id
      where ${b} and s.kind = 'lost' and d.closed_at >= ${from} and d.closed_at < ${to}
      group by 1, 2 order by 3 desc limit 20
    `),
  );

  const trend = qatorlar<{ kun: string; yangi: number; won: number; won_sum: string | null }>(
    await tx.execute(sql`
      with kunlar as (
        select generate_series(date_trunc('day', ${from}::timestamptz), ${to}::timestamptz - interval '1 second', interval '1 day') as kun
      )
      select to_char(k.kun, 'YYYY-MM-DD') as kun,
        (select count(*)::int from deal d where ${b} and d.created_at >= k.kun and d.created_at < k.kun + interval '1 day') as yangi,
        (select count(*)::int from deal d join crm_stage s on s.id = d.stage_id
           where ${b} and s.kind = 'won' and d.closed_at >= k.kun and d.closed_at < k.kun + interval '1 day') as won,
        (select sum(d.amount) from deal d join crm_stage s on s.id = d.stage_id
           where ${b} and s.kind = 'won' and d.closed_at >= k.kun and d.closed_at < k.kun + interval '1 day') as won_sum
      from kunlar k order by k.kun
      limit 400
    `),
  );

  const xodimlar = await xodimlarHisoboti(tx, p);

  const won = Number(kpi?.won_count ?? 0);
  const lost = Number(kpi?.lost_count ?? 0);
  return {
    kpi: {
      newCount: Number(kpi?.new_count ?? 0),
      newSum: Number(kpi?.new_sum ?? 0),
      wonCount: won,
      wonSum: Number(kpi?.won_sum ?? 0),
      lostCount: lost,
      openCount: Number(kpi?.open_count ?? 0),
      openSum: Number(kpi?.open_sum ?? 0),
      noTask: Number(kpi?.no_task ?? 0),
      winRate: won + lost > 0 ? won / (won + lost) : null,
      overdueTasks: Number(vaz?.overdue ?? 0),
      todayTasks: Number(vaz?.today ?? 0),
      doneTasks: Number(vaz?.done ?? 0),
      inboxPending: Number(inbox?.n ?? 0),
    },
    pipeline: voronka
      ? {
          id: voronka.id,
          name: voronka.name,
          stages: voronka.stages.map((s) => {
            const x = bosqichlar.find((q) => q.stage_id === s.id);
            return { id: s.id, name: s.name, color: s.color, kind: s.kind, count: Number(x?.n ?? 0), sum: Number(x?.sum ?? 0) };
          }),
        }
      : null,
    sources: manbalar.map((m) => ({ source: m.source || null, count: m.n, won: m.won, wonSum: Number(m.won_sum ?? 0) })),
    lossReasons: sabablar.map((s) => ({ id: s.id, name: s.name, count: s.n, sum: Number(s.sum ?? 0) })),
    trend: trend.map((x) => ({ day: x.kun, created: x.yangi, won: x.won, wonSum: Number(x.won_sum ?? 0) })),
    managers: xodimlar,
    goals: await maqsadFakti(tx, { doira, davr }),
  };
}

/** Xodimlar hisoboti (RPT-03): joriy mas'ul bo'yicha. */
export async function xodimlarHisoboti(tx: Tx, p: { doira: CrmDoira; davr: Davr }) {
  const { doira, davr } = p;
  const from = davr.from;
  const to = davr.to;
  const r = qatorlar<Record<string, string | number | null>>(
    await tx.execute(sql`
      select se.id, se.display_name as name,
        (select count(*)::int from deal d where d.responsible_seat_id = se.id and d.deleted_at is null
           ${davr.pipelineId ? sql`and d.pipeline_id = ${davr.pipelineId}` : sql``}
           and d.created_at >= ${from} and d.created_at < ${to}) as new_count,
        (select count(*)::int from deal d join crm_stage s on s.id = d.stage_id where d.responsible_seat_id = se.id and d.deleted_at is null
           ${davr.pipelineId ? sql`and d.pipeline_id = ${davr.pipelineId}` : sql``}
           and s.kind = 'won' and d.closed_at >= ${from} and d.closed_at < ${to}) as won_count,
        (select coalesce(sum(d.amount), 0) from deal d join crm_stage s on s.id = d.stage_id where d.responsible_seat_id = se.id and d.deleted_at is null
           ${davr.pipelineId ? sql`and d.pipeline_id = ${davr.pipelineId}` : sql``}
           and s.kind = 'won' and d.closed_at >= ${from} and d.closed_at < ${to}) as won_sum,
        (select count(*)::int from deal d join crm_stage s on s.id = d.stage_id where d.responsible_seat_id = se.id and d.deleted_at is null
           ${davr.pipelineId ? sql`and d.pipeline_id = ${davr.pipelineId}` : sql``}
           and s.kind = 'lost' and d.closed_at >= ${from} and d.closed_at < ${to}) as lost_count,
        (select count(*)::int from deal d join crm_stage s on s.id = d.stage_id where d.responsible_seat_id = se.id and d.deleted_at is null
           ${davr.pipelineId ? sql`and d.pipeline_id = ${davr.pipelineId}` : sql``}
           and s.kind = 'open') as open_count,
        (select count(*)::int from task t where t.seat_id = se.id and t.status in ('pending','in_progress','blocked') and t.due_at < now()
           and (t.deal_id is not null or t.contact_id is not null or t.task_type is not null)) as overdue,
        (select count(*)::int from task t where t.seat_id = se.id and t.status = 'done' and t.completed_at >= ${from} and t.completed_at < ${to}
           and (t.deal_id is not null or t.contact_id is not null or t.task_type is not null)) as tasks_done,
        (select count(*)::int from deal_event e join deal d on d.id = e.deal_id where d.responsible_seat_id = se.id and e.type = 'note'
           and e.created_at >= ${from} and e.created_at < ${to}) as notes,
        (select count(*)::int from conversation c where c.seat_id = se.id and c.started_at >= ${from} and c.started_at < ${to}) as calls
      from seat se
      where se.is_active = true
        ${doira.korish === 'own' ? sql`and se.id = ${doira.seatId ?? BOSH_UUID}` : davr.seat ? sql`and se.id = ${davr.seat}` : sql``}
      order by won_sum desc, new_count desc, se.display_name
    `),
  );
  return r.map((x) => {
    const won = Number(x.won_count ?? 0);
    const lost = Number(x.lost_count ?? 0);
    return {
      seatId: String(x.id),
      name: String(x.name),
      newCount: Number(x.new_count ?? 0),
      wonCount: won,
      wonSum: Number(x.won_sum ?? 0),
      lostCount: lost,
      openCount: Number(x.open_count ?? 0),
      overdue: Number(x.overdue ?? 0),
      tasksDone: Number(x.tasks_done ?? 0),
      notes: Number(x.notes ?? 0),
      calls: Number(x.calls ?? 0),
      winRate: won + lost > 0 ? won / (won + lost) : null,
    };
  });
}

/**
 * Savdo voronkasi (RPT-01): davrda yaratilgan bitimlar kogortasi — har
 * bosqichga yetganlar soni (tarix hodisalaridan) va hozirgi holat.
 */
export async function voronkaHisoboti(tx: Tx, p: { doira: CrmDoira; davr: Davr }) {
  const t = await tuzilma(tx);
  const voronka = t.pipelines.find((x) => x.id === p.davr.pipelineId) ?? t.pipelines.find((x) => x.isMain) ?? t.pipelines[0];
  if (!voronka) throw new CrmXatosi('ziddiyat', 'CRM yoqilmagan');
  const davr = { ...p.davr, pipelineId: voronka.id };
  const b = bitimSharti(p.doira, davr);
  const r = qatorlar<{ stage_id: string; reached: number; now: number; now_sum: string | null }>(
    await tx.execute(sql`
      with kogorta as (
        select d.id, d.stage_id, d.amount from deal d
        where ${b} and d.created_at >= ${davr.from} and d.created_at < ${davr.to}
      ),
      yetgan as (
        select distinct k.id, coalesce(e.data->>'toStageId', e.data->>'stageId') as stage_id
        from kogorta k join deal_event e on e.deal_id = k.id and e.type in ('created', 'stage')
        union
        select k.id, k.stage_id::text from kogorta k
      )
      select s.id as stage_id,
        (select count(distinct y.id)::int from yetgan y where y.stage_id = s.id::text) as reached,
        (select count(*)::int from kogorta k where k.stage_id = s.id) as now,
        (select sum(k.amount) from kogorta k where k.stage_id = s.id) as now_sum
      from crm_stage s where s.pipeline_id = ${voronka.id}
    `),
  );
  const [jami] = qatorlar<{ n: number; sum: string | null }>(
    await tx.execute(sql`select count(*)::int as n, sum(d.amount) as sum from deal d where ${b} and d.created_at >= ${davr.from} and d.created_at < ${davr.to}`),
  );
  const kogorta = Number(jami?.n ?? 0);
  return {
    pipeline: { id: voronka.id, name: voronka.name },
    cohort: kogorta,
    cohortSum: Number(jami?.sum ?? 0),
    stages: voronka.stages.map((s) => {
      const x = r.find((q) => q.stage_id === s.id);
      const reached = Number(x?.reached ?? 0);
      return {
        id: s.id,
        name: s.name,
        color: s.color,
        kind: s.kind,
        reached,
        conversion: kogorta > 0 ? reached / kogorta : null,
        now: Number(x?.now ?? 0),
        nowSum: Number(x?.now_sum ?? 0),
      };
    }),
  };
}

export const jurnalSxemasi = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  type: z.string().max(30).optional(),
  author: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
});

/** Hodisalar jurnali (RPT-06) — barcha bitimlardagi o'zgarishlar. */
export async function hodisalarJurnali(tx: Tx, p: { doira: CrmDoira; f: z.infer<typeof jurnalSxemasi> }) {
  const qism: SQL[] = [sql`d.deleted_at is null`];
  if (p.doira.korish === 'own') qism.push(sql`d.responsible_seat_id = ${p.doira.seatId ?? BOSH_UUID}`);
  if (p.f.from) qism.push(sql`e.created_at >= ${p.f.from}`);
  if (p.f.to) qism.push(sql`e.created_at < ${p.f.to}`);
  if (p.f.type) qism.push(sql`e.type = ${p.f.type}`);
  if (p.f.author) qism.push(sql`e.author_user_id = ${p.f.author}`);
  const sh = sql.join(qism, sql` and `);
  const r = qatorlar<Record<string, unknown>>(
    await tx.execute(sql`
      select e.id, e.type, e.data, e.created_at, e.deal_id, d.name as deal_name, u.display_name as author_name
      from deal_event e join deal d on d.id = e.deal_id left join app_user u on u.id = e.author_user_id
      where ${sh}
      order by e.created_at desc
      limit ${p.f.limit} offset ${p.f.offset}
    `),
  );
  const [jami] = qatorlar<{ n: number }>(
    await tx.execute(sql`select count(*)::int as n from deal_event e join deal d on d.id = e.deal_id where ${sh}`),
  );
  return {
    total: Number(jami?.n ?? 0),
    items: r.map((x) => ({
      id: x.id as string,
      type: x.type as string,
      data: x.data as Record<string, unknown>,
      createdAt: x.created_at as string,
      dealId: x.deal_id as string,
      dealName: x.deal_name as string,
      authorName: (x.author_name as string | null) ?? null,
    })),
  };
}

// ─── Maqsadlar (RPT-05) ──────────────────────────────────────────────────────

export const maqsadKirish = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  seatId: z.string().uuid().nullable(),
  amount: z.coerce.number().min(0).max(1e13).nullable(),
  count: z.coerce.number().int().min(0).max(1e6).nullable(),
});

export async function maqsadniSaqla(tx: Tx, businessId: string, k: z.infer<typeof maqsadKirish>): Promise<void> {
  const oy = `${k.month}-01`;
  if (k.seatId) {
    const [s] = await tx.select({ id: seat.id }).from(seat).where(eq(seat.id, k.seatId)).limit(1);
    if (!s) throw new CrmXatosi('yaroqsiz', 'Xodim topilmadi');
  }
  const shart = and(eq(crmGoal.month, oy), k.seatId ? eq(crmGoal.seatId, k.seatId) : isNull(crmGoal.seatId));
  if (k.amount === null && k.count === null) {
    await tx.delete(crmGoal).where(shart);
    return;
  }
  const [bor] = await tx.select({ id: crmGoal.id }).from(crmGoal).where(shart).limit(1);
  const qiymat = { amount: k.amount === null ? null : String(k.amount), count: k.count };
  if (bor) await tx.update(crmGoal).set(qiymat).where(eq(crmGoal.id, bor.id));
  else await tx.insert(crmGoal).values({ businessId, seatId: k.seatId, month: oy, ...qiymat });
}

/** Reja/fakt: davr boshlangan oy bo'yicha; xodimlar va jamoa (RPT-05). */
export async function maqsadFakti(tx: Tx, p: { doira: CrmDoira; davr: Davr }) {
  const oy = p.davr.from.slice(0, 7);
  const rejalar = await tx
    .select({ seatId: crmGoal.seatId, amount: crmGoal.amount, count: crmGoal.count })
    .from(crmGoal)
    .where(eq(crmGoal.month, `${oy}-01`));
  const fakt = qatorlar<{ seat_id: string | null; n: number; sum: string | null }>(
    await tx.execute(sql`
      select d.responsible_seat_id as seat_id, count(*)::int as n, sum(d.amount) as sum
      from deal d join crm_stage s on s.id = d.stage_id
      where d.deleted_at is null and s.kind = 'won'
        and d.closed_at >= date_trunc('month', ${`${oy}-01`}::date) and d.closed_at < date_trunc('month', ${`${oy}-01`}::date) + interval '1 month'
      group by 1
    `),
  );
  const seatlar = await tx.select({ id: seat.id, name: seat.displayName }).from(seat).where(eq(seat.isActive, true));
  const jamoaFakt = { count: fakt.reduce((a, f) => a + f.n, 0), sum: fakt.reduce((a, f) => a + Number(f.sum ?? 0), 0) };
  const qator = (seatId: string | null, name: string, f: { count: number; sum: number }) => {
    const r = rejalar.find((x) => (x.seatId ?? null) === seatId);
    const planSum = r?.amount === null || r?.amount === undefined ? null : Number(r.amount);
    const planCount = r?.count ?? null;
    return {
      seatId,
      name,
      planSum,
      planCount,
      factSum: f.sum,
      factCount: f.count,
      sumPct: planSum ? f.sum / planSum : null,
      countPct: planCount ? f.count / planCount : null,
    };
  };
  const xodimlar = seatlar
    .filter((s) => p.doira.korish === 'all' || s.id === p.doira.seatId)
    .map((s) => {
      const f = fakt.find((x) => x.seat_id === s.id);
      return qator(s.id, s.name, { count: f?.n ?? 0, sum: Number(f?.sum ?? 0) });
    });
  return {
    month: oy,
    team: p.doira.korish === 'all' ? qator(null, 'Jamoa', jamoaFakt) : null,
    seats: xodimlar,
  };
}
