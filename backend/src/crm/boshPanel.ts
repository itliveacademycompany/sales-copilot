import { and, eq, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import type { Tx } from '../db/index.js';
import { crmDashboard } from '../db/schema/index.js';
import { maqsadFakti, type Davr } from './hisobot.js';
import type { CrmDoira } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM BOSH SAHIFASI — amoCRM "Рабочий стол" namunasida
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Vidjetlar ikki xil:
 *   • STANDART — ma'nosi qat'iy (muddati o'tgan vazifalar, manbalar,
 *     menejerlar, prognoz, qo'ng'iroqlar, xabarlar va h.k.). Hammasi bitta
 *     so'rovda (`boshPanel`) hisoblanadi.
 *   • MAXSUS "Bitimlar" — foydalanuvchi o'zi filtr beradi (voronka, bosqich,
 *     manba, teg, sana) va guruhlashni tanlaydi (`bitimVidjetlari`).
 *
 * Ta'riflar (vidjet ostidagi "+N" — tanlangan davr uchun):
 *   • Muddati o'tgan vazifalar — hozir ochiq va muddati o'tgan; +N — davr
 *     ichida muddati o'tganlari.
 *   • Bajarish kerak — ochiq, muddati hali kelmagan (yoki muddatsiz);
 *     +N — davrda yaratilganlari.
 *   • Vazifasiz bitimlar — ochiq bitim, ochiq vazifasi yo'q; +N — shundaylar
 *     ichidan davrda yaratilganlari.
 *   • Menejerlar bo'yicha — hozir ochiq bitimlar; +N — sof o'zgarish
 *     (davrda yaratilgan − davrda yopilgan).
 *   • Muvaffaqiyatli bitimlar — hozir "won" bosqichdagilar; +N — davrda yutilgan.
 *   • Savdo prognozi — har ochiq bitimning kutilgan yopilish sanasi: yaratilgan
 *     sana + shu voronkada yutilgan bitimlarning o'rtacha (mediana) sikli.
 *   • Javob vaqti — mijoz yozgan xabar(lar)dan keyin menejerning birinchi
 *     javobigacha; soat — mijoz xabari kelgan soat (biznes vaqt zonasida).
 *
 * Har bo'lim alohida savepoint ichida: bitta so'rov xato bersa ham qolgan
 * vidjetlar chiqadi (o'sha vidjet `null` bo'ladi).
 */

const BOSH_UUID = '00000000-0000-0000-0000-000000000000';
const OCHIQ = sql`('pending','in_progress','blocked')`;
const CHAT_KANALLAR = sql`('telegram','whatsapp','instagram')`;

function qatorlar<T>(r: unknown): T[] {
  return ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[];
}

const ro = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

// ─── Vidjetlar ro'yxati (sozlama) ───────────────────────────────────────────

export const STANDART_VIDJETLAR = [
  'overdue_tasks',
  'done_tasks',
  'todo_tasks',
  'no_task_deals',
  'deal_sources',
  'deals_by_manager',
  'goals',
  'system_usage',
  'recent_files',
  'sales_forecast',
  'incoming_calls',
  'outgoing_calls',
  'notes',
  'won_deals',
  'outgoing_messages',
  'processed_chats',
  'incoming_messages',
  'response_time',
] as const;

const sana = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const bitimFiltriSxemasi = z
  .object({
    pipelineIds: z.array(z.string().uuid()).max(30).default([]),
    stageIds: z.array(z.string().uuid()).max(200).default([]),
    seatIds: z.array(z.string().uuid()).max(200).default([]),
    sources: z.array(z.string().max(200)).max(50).default([]),
    tags: z.array(z.string().trim().min(1).max(100)).max(50).default([]),
    status: z.enum(['all', 'open', 'won', 'lost']).default('all'),
    /** Qaysi sana bo'yicha: yaratilgan yoki yopilgan. */
    dateField: z.enum(['created', 'closed']).default('created'),
    /** all — sanasiz; period — bosh sahifa davri; range — qat'iy oraliq. */
    dateMode: z.enum(['all', 'period', 'range']).default('all'),
    from: sana.optional(),
    to: sana.optional(),
    group: z.enum(['stage', 'manager', 'source', 'none']).default('stage'),
  })
  .refine((f) => f.dateMode !== 'range' || (f.from && f.to && f.from <= f.to), {
    message: "Sana oralig'i noto'g'ri",
    path: ['from'],
  });
export type BitimFiltri = z.infer<typeof bitimFiltriSxemasi>;

const vidjetSxemasi = z
  .object({
    id: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
    type: z.enum([...STANDART_VIDJETLAR, 'deals']),
    title: z.string().trim().max(120).optional(),
    filter: bitimFiltriSxemasi.optional(),
  })
  .refine((v) => v.type !== 'deals' || (v.filter && v.title), { message: "Bitim vidjetiga nom va filtr kerak" });

export const panelKirish = z
  .object({ widgets: z.array(vidjetSxemasi).max(60) })
  .refine((p) => new Set(p.widgets.map((w) => w.id)).size === p.widgets.length, { message: 'Vidjet ID lari takrorlanmasin' });

/** Foydalanuvchi vidjetlari; hali saqlanmagan bo'lsa `null` (frontend standart tartibni oladi). */
export async function panelniOl(tx: Tx, userId: string) {
  const [r] = await tx.select({ widgets: crmDashboard.widgets }).from(crmDashboard).where(eq(crmDashboard.userId, userId)).limit(1);
  if (!r) return { widgets: null };
  // Eski/buzilgan yozuv sahifani yiqitmasin — faqat yaroqli vidjetlar qaytadi
  const toza = z.array(z.unknown()).safeParse(r.widgets);
  const widgets = (toza.success ? toza.data : [])
    .map((w) => vidjetSxemasi.safeParse(w))
    .filter((x) => x.success)
    .map((x) => x.data);
  return { widgets };
}

export async function panelniSaqla(tx: Tx, p: { businessId: string; userId: string; widgets: z.infer<typeof panelKirish>['widgets'] }) {
  await tx
    .insert(crmDashboard)
    .values({ businessId: p.businessId, userId: p.userId, widgets: p.widgets, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: [crmDashboard.businessId, crmDashboard.userId],
      set: { widgets: p.widgets, updatedAt: new Date() },
    });
}

/** Standart tartibga qaytarish — yozuv o'chiriladi. */
export async function panelniTikla(tx: Tx, userId: string) {
  await tx.delete(crmDashboard).where(and(eq(crmDashboard.userId, userId)));
}

// ─── Tizimdan foydalanish ───────────────────────────────────────────────────

/**
 * Faollik belgisi (brauzer har daqiqada yuboradi). Bir daqiqaga bir marta
 * hisoblanadi: ikki tab ochiq bo'lsa ham vaqt ikki baravar oshmaydi.
 * Kun — biznes vaqt zonasida (`vaqtZonasiniOrnat` oldin chaqiriladi).
 */
export async function faollikBelgisi(tx: Tx, p: { businessId: string; userId: string }): Promise<void> {
  await tx.execute(sql`
    insert into crm_activity (business_id, user_id, day, minutes, first_at, last_at)
    values (${p.businessId}, ${p.userId}, current_date, 1, now(), now())
    on conflict (business_id, user_id, day) do update set
      minutes = least(1440, crm_activity.minutes + (case when crm_activity.last_at <= now() - interval '50 seconds' then 1 else 0 end)),
      last_at = case when crm_activity.last_at <= now() - interval '50 seconds' then now() else crm_activity.last_at end
  `);
}

// ─── Doira shartlari ────────────────────────────────────────────────────────

function joriySeat(doira: CrmDoira, davr: Davr): string | null {
  if (doira.korish === 'own') return doira.seatId ?? BOSH_UUID;
  return davr.seat ?? null;
}

/** `d` (deal) aliasi uchun. */
function bitimSh(doira: CrmDoira, davr: Davr): SQL {
  const s = joriySeat(doira, davr);
  return s ? sql`d.deleted_at is null and d.responsible_seat_id = ${s}` : sql`d.deleted_at is null`;
}

/** `t` (task) aliasi uchun — faqat CRM vazifalari (bitim/kontakt/tur bilan). */
function vazifaSh(doira: CrmDoira, davr: Davr): SQL {
  const s = joriySeat(doira, davr);
  const asos = sql`(t.deal_id is not null or t.contact_id is not null or t.task_type is not null)`;
  return s ? sql`${asos} and t.seat_id = ${s}` : asos;
}

/** `c` (conversation) aliasi uchun. */
function suhbatSh(doira: CrmDoira, davr: Davr): SQL {
  const s = joriySeat(doira, davr);
  return s ? sql`c.seat_id = ${s}` : sql`true`;
}

const royxat = (q: string[]) => sql.join(q.map((x) => sql`${x}`), sql`, `);

// ─── Standart vidjetlar ─────────────────────────────────────────────────────

export async function boshPanel(tx: Tx, p: { doira: CrmDoira; davr: Davr; userId: string }) {
  const { doira, davr } = p;
  const from = davr.from;
  const to = davr.to;
  const b = bitimSh(doira, davr);
  const v = vazifaSh(doira, davr);
  const c = suhbatSh(doira, davr);
  const seatId = joriySeat(doira, davr);

  const xavfsiz = async <T>(ish: (t: Tx) => Promise<T>): Promise<T | null> => {
    try {
      return await tx.transaction(async (t) => ish(t as unknown as Tx));
    } catch {
      return null;
    }
  };

  // 1) Vazifalar
  const vazifalar = await xavfsiz(async (t) => {
    const [r] = qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        select
          count(*) filter (where t.status in ${OCHIQ} and t.due_at < now())::int as overdue,
          count(*) filter (where t.status in ${OCHIQ} and t.due_at < now() and t.due_at >= ${from})::int as overdue_new,
          count(*) filter (where t.status = 'done' and t.completed_at >= ${from} and t.completed_at < ${to})::int as done,
          count(*) filter (where t.status in ${OCHIQ} and (t.due_at is null or t.due_at >= now()))::int as todo,
          count(*) filter (where t.status in ${OCHIQ} and t.created_at >= ${from} and t.created_at < ${to})::int as todo_new
        from task t left join deal d on d.id = t.deal_id
        where ${v} and (d.id is null or d.deleted_at is null)
      `),
    );
    return {
      overdue: ro(r?.overdue),
      overdueNew: ro(r?.overdue_new),
      done: ro(r?.done),
      todo: ro(r?.todo),
      todoNew: ro(r?.todo_new),
    };
  });

  // 2) Bitimlar: vazifasiz, muvaffaqiyatli, ochiq
  const bitimlar = await xavfsiz(async (t) => {
    const [r] = qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        select
          count(*) filter (where s.kind = 'open' and not vt.bor)::int as no_task,
          coalesce(sum(d.amount) filter (where s.kind = 'open' and not vt.bor), 0) as no_task_sum,
          count(*) filter (where s.kind = 'open' and not vt.bor and d.created_at >= ${from} and d.created_at < ${to})::int as no_task_new,
          count(*) filter (where s.kind = 'open')::int as open_n,
          coalesce(sum(d.amount) filter (where s.kind = 'open'), 0) as open_sum,
          (count(*) filter (where d.created_at >= ${from} and d.created_at < ${to})
            - count(*) filter (where s.kind <> 'open' and d.closed_at >= ${from} and d.closed_at < ${to}))::int as open_delta,
          count(*) filter (where s.kind = 'won')::int as won_n,
          coalesce(sum(d.amount) filter (where s.kind = 'won'), 0) as won_sum,
          count(*) filter (where s.kind = 'won' and d.closed_at >= ${from} and d.closed_at < ${to})::int as won_new,
          coalesce(sum(d.amount) filter (where s.kind = 'won' and d.closed_at >= ${from} and d.closed_at < ${to}), 0) as won_new_sum
        from deal d
        join crm_stage s on s.id = d.stage_id
        left join lateral (
          select exists (select 1 from task t where t.deal_id = d.id and t.status in ${OCHIQ}) as bor
        ) vt on true
        where ${b}
      `),
    );
    return {
      noTask: ro(r?.no_task),
      noTaskSum: ro(r?.no_task_sum),
      noTaskNew: ro(r?.no_task_new),
      open: ro(r?.open_n),
      openSum: ro(r?.open_sum),
      openDelta: ro(r?.open_delta),
      won: ro(r?.won_n),
      wonSum: ro(r?.won_sum),
      wonNew: ro(r?.won_new),
      wonNewSum: ro(r?.won_new_sum),
    };
  });

  // 3) Menejerlar bo'yicha ochiq bitimlar
  const menejerlar = await xavfsiz(async (t) =>
    qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        select d.responsible_seat_id as seat_id, se.display_name as name,
          count(*) filter (where s.kind = 'open')::int as n,
          coalesce(sum(d.amount) filter (where s.kind = 'open'), 0) as sum,
          (count(*) filter (where d.created_at >= ${from} and d.created_at < ${to})
            - count(*) filter (where s.kind <> 'open' and d.closed_at >= ${from} and d.closed_at < ${to}))::int as delta
        from deal d
        join crm_stage s on s.id = d.stage_id
        left join seat se on se.id = d.responsible_seat_id
        where ${b}
        group by 1, 2
        having count(*) filter (where s.kind = 'open') > 0
          or count(*) filter (where d.created_at >= ${from} and d.created_at < ${to}) > 0
        order by 3 desc, 5 desc
        limit 50
      `),
    ).map((x) => ({
      seatId: (x.seat_id as string | null) ?? null,
      name: (x.name as string | null) ?? null,
      count: ro(x.n),
      sum: ro(x.sum),
      delta: ro(x.delta),
    })),
  );

  // 4) Bitim manbalari (davrda yaratilganlar)
  const manbalar = await xavfsiz(async (t) =>
    qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        select coalesce(nullif(trim(d.source), ''), '') as source, count(*)::int as n, coalesce(sum(d.amount), 0) as sum
        from deal d
        where ${b} and d.created_at >= ${from} and d.created_at < ${to}
        group by 1 order by 2 desc limit 12
      `),
    ).map((x) => ({ source: (x.source as string) || null, count: ro(x.n), sum: ro(x.sum) })),
  );

  // 5) Maqsad (davr boshlangan oy)
  const maqsad = await xavfsiz(async (t) => {
    const m = await maqsadFakti(t, { doira, davr });
    const qator = seatId ? (m.seats.find((s) => s.seatId === seatId) ?? null) : m.team;
    return { month: m.month, row: qator };
  });

  // 6) Tizimdan foydalanish
  const faollik = await xavfsiz(async (t) => {
    const kim =
      doira.korish === 'own'
        ? sql`and m.user_id = ${p.userId}`
        : davr.seat
          ? sql`and m.user_id = (select se.user_id from seat se where se.id = ${davr.seat})`
          : sql``;
    return qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        select u.id, u.display_name as name,
          coalesce(sum(a.minutes) filter (where a.day >= (${from}::timestamptz)::date and a.day < (${to}::timestamptz)::date), 0)::int as minutes,
          max(a.last_at) as last_at
        from business_member m
        join app_user u on u.id = m.user_id
        left join crm_activity a on a.user_id = m.user_id and a.business_id = m.business_id
        where m.is_active = true ${kim}
        group by u.id, u.display_name
        order by 3 desc, 4 desc nulls last
        limit 30
      `),
    ).map((x) => ({
      userId: x.id as string,
      name: (x.name as string | null) ?? '',
      minutes: ro(x.minutes),
      lastAt: x.last_at ? new Date(x.last_at as string).toISOString() : null,
    }));
  });

  // 7) So'nggi fayllar — qo'ng'iroq yozuvlari va yuklangan audio
  const fayllar = await xavfsiz(async (t) =>
    qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        select c.id, c.media_filename, c.media_kind, c.media_bytes, c.started_at, c.channel, c.direction,
          ct.name as contact, ct.phone, se.display_name as seat
        from conversation c
        left join contact ct on ct.id = c.contact_id
        left join seat se on se.id = c.seat_id
        where c.media_url is not null and ${c}
        order by c.started_at desc
        limit 6
      `),
    ).map((x) => ({
      conversationId: x.id as string,
      fileName: (x.media_filename as string | null) ?? null,
      kind: (x.media_kind as string | null) ?? null,
      bytes: x.media_bytes === null || x.media_bytes === undefined ? null : ro(x.media_bytes),
      at: new Date(x.started_at as string).toISOString(),
      channel: x.channel as string,
      direction: x.direction as string,
      contact: (x.contact as string | null) ?? (x.phone as string | null) ?? null,
      seat: (x.seat as string | null) ?? null,
    })),
  );

  // 8) Savdo prognozi
  const prognoz = await xavfsiz(async (t) => {
    const [r] = qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        with sikl as (
          select d.pipeline_id,
            percentile_cont(0.5) within group (order by extract(epoch from (d.closed_at - d.created_at)) / 86400.0) as kun
          from deal d join crm_stage s on s.id = d.stage_id
          where d.deleted_at is null and s.kind = 'won' and d.closed_at is not null
            and d.closed_at > now() - interval '180 days' and d.closed_at >= d.created_at
          group by d.pipeline_id
        ),
        umumiy as (
          select percentile_cont(0.5) within group (order by extract(epoch from (d.closed_at - d.created_at)) / 86400.0) as kun
          from deal d join crm_stage s on s.id = d.stage_id
          where d.deleted_at is null and s.kind = 'won' and d.closed_at is not null
            and d.closed_at > now() - interval '180 days' and d.closed_at >= d.created_at
        ),
        ochiq as (
          select d.amount,
            greatest(coalesce(sk.kun, (select kun from umumiy), 14) - extract(epoch from (now() - d.created_at)) / 86400.0, 0) as qolgan
          from deal d
          join crm_stage s on s.id = d.stage_id
          left join sikl sk on sk.pipeline_id = d.pipeline_id
          where ${b} and s.kind = 'open'
        )
        select
          count(*)::int as n0, coalesce(sum(amount), 0) as s0,
          count(*) filter (where qolgan <= 5)::int as n5, coalesce(sum(amount) filter (where qolgan <= 5), 0) as s5,
          count(*) filter (where qolgan > 5 and qolgan <= 10)::int as n10, coalesce(sum(amount) filter (where qolgan > 5 and qolgan <= 10), 0) as s10,
          count(*) filter (where qolgan > 10 and qolgan <= 15)::int as n15, coalesce(sum(amount) filter (where qolgan > 10 and qolgan <= 15), 0) as s15,
          (select kun from umumiy) as sikl
        from ochiq
      `),
    );
    return {
      cycleDays: r?.sikl === null || r?.sikl === undefined ? null : Math.round(ro(r.sikl)),
      points: [
        { days: 0, count: ro(r?.n0), sum: ro(r?.s0) },
        { days: 5, count: ro(r?.n5), sum: ro(r?.s5) },
        { days: 10, count: ro(r?.n10), sum: ro(r?.s10) },
        { days: 15, count: ro(r?.n15), sum: ro(r?.s15) },
      ],
    };
  });

  // 9) Qo'ng'iroqlar va izohlar
  const qongiroq = await xavfsiz(async (t) => {
    const [r] = qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        select
          count(*) filter (where c.direction = 'inbound')::int as inbound,
          count(*) filter (where c.direction = 'outbound')::int as outbound
        from conversation c
        where c.channel = 'phone' and c.started_at >= ${from} and c.started_at < ${to} and ${c}
      `),
    );
    return { inbound: ro(r?.inbound), outbound: ro(r?.outbound) };
  });

  const izohlar = await xavfsiz(async (t) => {
    const [r] = qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        select count(*)::int as n
        from deal_event e join deal d on d.id = e.deal_id
        where ${b} and e.type = 'note' and e.created_at >= ${from} and e.created_at < ${to}
      `),
    );
    return ro(r?.n);
  });

  // 10) Yozishmalar (Telegram, WhatsApp, Instagram) — xabar vaqti = sessiya boshi + siljish
  const xabarCte = sql`
    with seg as (
      select c.id as conv, c.channel, c.seat_id, s.seq, s.speaker,
        c.started_at + (s.start_seconds * interval '1 second') as at
      from transcript_segment s
      join conversation c on c.id = s.conversation_id
      where c.channel in ${CHAT_KANALLAR}
        and c.started_at < ${to} and c.started_at >= ${from}::timestamptz - interval '30 days'
        and ${c}
    )
  `;

  const xabarlar = await xavfsiz(async (t) => {
    const menejer = qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        ${xabarCte}
        select seg.seat_id, se.display_name as name, count(*)::int as msgs, count(distinct seg.conv)::int as chats
        from seg left join seat se on se.id = seg.seat_id
        where seg.speaker = 'manager' and seg.at >= ${from} and seg.at < ${to}
        group by 1, 2 order by 3 desc limit 30
      `),
    );
    const kanal = qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        ${xabarCte}
        select seg.channel, count(*)::int as n
        from seg
        where seg.speaker = 'client' and seg.at >= ${from} and seg.at < ${to}
        group by 1
      `),
    );
    return {
      bySeat: menejer.map((x) => ({
        seatId: (x.seat_id as string | null) ?? null,
        name: (x.name as string | null) ?? null,
        messages: ro(x.msgs),
        chats: ro(x.chats),
      })),
      incoming: kanal.map((x) => ({ channel: x.channel as string, count: ro(x.n) })),
    };
  });

  const javobVaqti = await xavfsiz(async (t) => {
    const r = qatorlar<Record<string, unknown>>(
      await t.execute(sql`
        ${xabarCte},
        tartib as (
          select seg.*, lag(seg.speaker) over (partition by seg.conv order by seg.seq) as oldingi
          from seg
        ),
        boshlar as (
          select * from tartib
          where speaker = 'client' and (oldingi is null or oldingi <> 'client')
            and at >= ${from} and at < ${to}
        )
        select extract(hour from bo.at)::int as soat,
          avg(extract(epoch from (j.at - bo.at)))::float8 as soniya,
          count(*)::int as n
        from boshlar bo
        join lateral (
          select min(x.at) as at from seg x
          where x.conv = bo.conv and x.seq > bo.seq and x.speaker = 'manager'
        ) j on j.at is not null
        group by 1 order by 1
      `),
    );
    const soatlar = Array.from({ length: 24 }, (_, h) => {
      const x = r.find((q) => ro(q.soat) === h);
      return { hour: h, minutes: x ? Math.round((ro(x.soniya) / 60) * 10) / 10 : null, count: x ? ro(x.n) : 0 };
    });
    const jami = soatlar.reduce((s, h) => s + h.count, 0);
    const ortacha = jami ? soatlar.reduce((s, h) => s + (h.minutes ?? 0) * h.count, 0) / jami : null;
    return { hours: soatlar, avgMinutes: ortacha === null ? null : Math.round(ortacha * 10) / 10, replies: jami };
  });

  return {
    tasks: vazifalar,
    deals: bitimlar,
    managers: menejerlar,
    sources: manbalar,
    goal: maqsad,
    usage: faollik,
    files: fayllar,
    forecast: prognoz,
    calls: qongiroq,
    notes: izohlar,
    messages: xabarlar,
    responseTime: javobVaqti,
  };
}

// ─── Maxsus "Bitimlar" vidjetlari ───────────────────────────────────────────

export const bitimVidjetKirish = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  seat: z.string().uuid().optional(),
  widgets: z
    .array(z.object({ id: z.string().min(1).max(40), filter: bitimFiltriSxemasi }))
    .max(40),
});

export async function bitimVidjetlari(tx: Tx, p: { doira: CrmDoira; kirish: z.infer<typeof bitimVidjetKirish> }) {
  const { doira, kirish } = p;
  const davr: Davr = { from: kirish.from, to: kirish.to, seat: kirish.seat };
  const natija: Record<string, unknown> = {};

  for (const w of kirish.widgets) {
    const f = w.filter;
    const sanaUst = f.dateField === 'closed' ? sql`d.closed_at` : sql`d.created_at`;
    const qism: SQL[] = [bitimSh(doira, davr)];
    if (f.pipelineIds.length) qism.push(sql`d.pipeline_id in (${royxat(f.pipelineIds)})`);
    if (f.stageIds.length) qism.push(sql`d.stage_id in (${royxat(f.stageIds)})`);
    if (f.seatIds.length) qism.push(sql`d.responsible_seat_id in (${royxat(f.seatIds)})`);
    if (f.sources.length) qism.push(sql`coalesce(nullif(trim(d.source), ''), '') in (${royxat(f.sources)})`);
    if (f.tags.length) qism.push(sql`d.tags && array[${royxat(f.tags)}]::text[]`);
    if (f.status !== 'all') qism.push(sql`s.kind = ${f.status}`);
    if (f.dateMode === 'period') qism.push(sql`${sanaUst} >= ${davr.from} and ${sanaUst} < ${davr.to}`);
    if (f.dateMode === 'range' && f.from && f.to) {
      qism.push(sql`${sanaUst} >= (${f.from}::date)::timestamptz and ${sanaUst} < ((${f.to}::date) + 1)::timestamptz`);
    }
    const shart = sql.join(qism, sql` and `);
    const davrda = sql`${sanaUst} >= ${davr.from} and ${sanaUst} < ${davr.to}`;

    const guruh =
      f.group === 'stage'
        ? { k: sql`s.id::text`, nom: sql`p.name`, nom2: sql`s.name`, rang: sql`s.color` }
        : f.group === 'manager'
          ? { k: sql`coalesce(d.responsible_seat_id::text, '')`, nom: sql`se.display_name`, nom2: sql`null::text`, rang: sql`null::text` }
          : f.group === 'source'
            ? { k: sql`coalesce(nullif(trim(d.source), ''), '')`, nom: sql`coalesce(nullif(trim(d.source), ''), '')`, nom2: sql`null::text`, rang: sql`null::text` }
            : { k: sql`'*'`, nom: sql`null::text`, nom2: sql`null::text`, rang: sql`null::text` };

    try {
      const r = await tx.transaction(async (t) =>
        qatorlar<Record<string, unknown>>(
          await t.execute(sql`
            select ${guruh.k} as k, ${guruh.nom} as nom, ${guruh.nom2} as nom2, ${guruh.rang} as rang,
              count(*)::int as n,
              coalesce(sum(d.amount), 0) as sum,
              count(*) filter (where ${davrda})::int as delta,
              (sum(count(*)) over ())::int as jami_n,
              sum(coalesce(sum(d.amount), 0)) over () as jami_sum,
              (sum(count(*) filter (where ${davrda})) over ())::int as jami_delta
            from deal d
            join crm_stage s on s.id = d.stage_id
            join crm_pipeline p on p.id = d.pipeline_id
            left join seat se on se.id = d.responsible_seat_id
            where ${shart}
            group by 1, 2, 3, 4
            order by 5 desc
            limit 50
          `),
        ),
      );
      natija[w.id] = {
        count: ro(r[0]?.jami_n),
        sum: ro(r[0]?.jami_sum),
        delta: f.dateMode === 'period' ? null : ro(r[0]?.jami_delta),
        groups:
          f.group === 'none'
            ? []
            : r.map((x) => ({
                key: x.k as string,
                name: (x.nom as string | null) ?? null,
                name2: (x.nom2 as string | null) ?? null,
                color: (x.rang as string | null) ?? null,
                count: ro(x.n),
                sum: ro(x.sum),
                delta: f.dateMode === 'period' ? null : ro(x.delta),
              })),
      };
    } catch {
      natija[w.id] = null;
    }
  }
  return { results: natija };
}
