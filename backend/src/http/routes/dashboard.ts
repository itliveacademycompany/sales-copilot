import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, type Tx } from '../../db/index.js';
import { seat } from '../../db/schema/index.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { analyticsScope, seatFilter } from '../scope.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DASHBOARD API — TZ 3.6 (P0 qismi)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hisob-kitob har so'rovda SQL'da (materiallashgan jadvalsiz). MVP hajmida
 * (~ming suhbat/oy) bu millisekundlar; sekinlashsa avval indeks, keyin
 * kunlik agregat jadvali qo'shiladi — API o'zgarmaydi.
 *
 * Javob tezligi metrikalari analysis.dynamics jsonb'dan olinadi
 * (`replyMetrics` — analyze.ts yozadi). FR-109.
 *
 * Eslatma: raw SQL parametrlariga sana ISO satr sifatida uzatiladi —
 * postgres.js drayveri Date obyektini raw so'rovda qabul qilmaydi.
 */

const periodQuery = z.object({
  /** Standart: oxirgi 7 kun. */
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function period(q: { from?: Date; to?: Date }): { from: Date; to: Date } {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  return { from, to };
}

/** jsonb ichidan birinchi javob soniyasi. */
const firstResponseExpr = sql`(a.dynamics #>> '{replyMetrics,firstResponseSeconds}')::numeric`;

async function kpiFor(
  tx: Tx,
  from: Date,
  to: Date,
  seatFilter?: string,
): Promise<Record<string, unknown>> {
  const seatCond = seatFilter ? sql` and c.seat_id = ${seatFilter}` : sql``;
  const rows = await tx.execute(sql`
    select
      count(*)::int                                                   as conversations,
      count(a.id)::int                                                as analyzed,
      count(*) filter (where c.status = 'filtered')::int              as filtered,
      round(avg(a.overall_score), 1)::float                           as avg_score,
      count(*) filter (where a.is_flagged)::int                       as flagged,
      percentile_cont(0.5) within group (order by ${firstResponseExpr})::float
                                                                      as median_first_response_seconds,
      -- Ogohlantirish bilan bir xil shart (analyze.ts): navbat javobsiz
      -- qolgan VA model uni javob kutayotgan deb bilgan.
      count(*) filter (
        where (a.dynamics #>> '{replyMetrics,unansweredTurns}')::int > 0
          and coalesce(a.dynamics #>> '{needsReply}', 'true') <> 'false'
      )::int                                                          as unanswered_sessions,
      round(sum(a.cost_usd), 4)::float                                as ai_cost_usd
    from conversation c
    left join analysis a on a.conversation_id = c.id
    where c.started_at >= ${from.toISOString()}::timestamptz
      and c.started_at < ${to.toISOString()}::timestamptz${seatCond}
  `);
  const r = rows[0] as Record<string, unknown>;
  return {
    conversations: r.conversations,
    analyzed: r.analyzed,
    filtered: r.filtered,
    avgScore: r.avg_score,
    flagged: r.flagged,
    medianFirstResponseSeconds: r.median_first_response_seconds,
    unansweredSessions: r.unanswered_sessions,
    aiCostUsd: r.ai_cost_usd,
  };
}

export function registerDashboardRoutes(app: FastifyInstance): void {
  /** FR-101/102/109: KPI kartalari. */
  app.get(
    '/api/v1/businesses/:businessId/dashboard/kpi',
    { preHandler: [requireBusiness, requirePermission('analytics:read:all')] },
    async (req) => {
      const { from, to } = period(periodQuery.parse(req.query));
      const businessId = req.business!.businessId;

      // O'sish ko'rsatkichi uchun oldingi teng davr ham hisoblanadi.
      const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

      const [current, previous] = await withTenant(businessId, (tx) =>
        Promise.all([kpiFor(tx, from, to), kpiFor(tx, prevFrom, from)]),
      );

      return { period: { from, to }, current, previous };
    },
  );

  /** FR-103: sotuvchilar reytingi. */
  app.get(
    '/api/v1/businesses/:businessId/dashboard/leaderboard',
    { preHandler: [requireBusiness, requirePermission('analytics:read:all')] },
    async (req) => {
      const { from, to } = period(periodQuery.parse(req.query));
      const businessId = req.business!.businessId;

      const rows = await withTenant(businessId, (tx) =>
        tx.execute(sql`
          select
            s.id                                              as seat_id,
            s.display_name                                    as display_name,
            count(c.id)::int                                  as conversations,
            count(a.id)::int                                  as analyzed,
            round(avg(a.overall_score), 1)::float             as avg_score,
            round(max(a.overall_score), 1)::float             as best_score,
            count(*) filter (where a.is_flagged)::int         as flagged,
            percentile_cont(0.5) within group (order by ${firstResponseExpr})::float
                                                              as median_first_response_seconds
          from seat s
          left join conversation c
            on c.seat_id = s.id
            and c.started_at >= ${from.toISOString()}::timestamptz
            and c.started_at < ${to.toISOString()}::timestamptz
          left join analysis a on a.conversation_id = c.id
          where s.is_active
          group by s.id, s.display_name
          order by avg_score desc nulls last, conversations desc
        `),
      );

      return {
        period: { from, to },
        leaderboard: (rows as unknown as Record<string, unknown>[]).map((r) => ({
          seatId: r.seat_id,
          displayName: r.display_name,
          conversations: r.conversations,
          analyzed: r.analyzed,
          avgScore: r.avg_score,
          bestScore: r.best_score,
          flagged: r.flagged,
          medianFirstResponseSeconds: r.median_first_response_seconds,
        })),
      };
    },
  );

  /**
   * FR-104: mezonlar bo'yicha jamoa tahlili — "hamma qaysi bosqichda
   * yiqiladi". Eng past o'rtacha ball = eng zaif joy. `unknownCount`
   * alohida ko'rsatiladi: "aniqlanmadi" past ball emas.
   */
  app.get(
    '/api/v1/businesses/:businessId/dashboard/criteria',
    { preHandler: [requireBusiness, requirePermission('analytics:read:all')] },
    async (req) => {
      const { from, to } = period(periodQuery.parse(req.query));
      const businessId = req.business!.businessId;

      const rows = await withTenant(businessId, (tx) =>
        tx.execute(sql`
          select
            criterion_code,
            min(criterion_name)                                as criterion_name,
            min(category_code)                                 as category_code,
            count(*)::int                                      as evaluated,
            count(score)::int                                  as scored,
            count(*) filter (where score is null)::int         as unknown_count,
            round(avg(score), 2)::float                        as avg_score,
            round(avg(score) / 3 * 100, 1)::float              as avg_pct,
            count(*) filter (where score <= 1)::int            as weak_count
          from criterion_score
          where created_at >= ${from.toISOString()}::timestamptz
            and created_at < ${to.toISOString()}::timestamptz
          group by criterion_code
          order by avg_score asc nulls last
        `),
      );

      const criteria = (rows as unknown as Record<string, unknown>[]).map((r) => ({
        code: r.criterion_code,
        name: r.criterion_name,
        categoryCode: r.category_code,
        evaluated: r.evaluated,
        scored: r.scored,
        unknownCount: r.unknown_count,
        avgScore: r.avg_score,
        avgPct: r.avg_pct,
        weakCount: r.weak_count,
      }));

      // Eng zaif mezon — kamida 3 ta baholangan bo'lsin, aks holda shovqin.
      const weakest = criteria.find((c) => (c.scored as number) >= 3) ?? null;

      return { period: { from, to }, criteria, weakest };
    },
  );

  /** FR-105: kunlik trend. */
  app.get(
    '/api/v1/businesses/:businessId/dashboard/trend',
    { preHandler: [requireBusiness, requirePermission('analytics:read:all')] },
    async (req) => {
      const q = periodQuery
        .extend({ granularity: z.enum(['day', 'week']).default('day') })
        .parse(req.query);
      const { from, to } = period(q);
      const businessId = req.business!.businessId;

      const bucket = q.granularity === 'week' ? sql`'week'` : sql`'day'`;
      const rows = await withTenant(businessId, (tx) =>
        tx.execute(sql`
          select
            date_trunc(${bucket}, c.started_at)               as bucket,
            count(*)::int                                     as conversations,
            round(avg(a.overall_score), 1)::float             as avg_score,
            count(*) filter (where a.is_flagged)::int         as flagged
          from conversation c
          left join analysis a on a.conversation_id = c.id
          where c.started_at >= ${from.toISOString()}::timestamptz
            and c.started_at < ${to.toISOString()}::timestamptz
          group by bucket
          order by bucket
        `),
      );

      return {
        period: { from, to },
        granularity: q.granularity,
        points: (rows as unknown as Record<string, unknown>[]).map((r) => ({
          bucket: r.bucket,
          conversations: r.conversations,
          avgScore: r.avg_score,
          flagged: r.flagged,
        })),
      };
    },
  );

  /**
   * FR-112 uchun asos: bitta sotuvchining davri — KPI, oldingi davr
   * bilan taqqoslash va uning ENG ZAIF bitta mezoni. Sotuvchi ekrani
   * "sizning 1 ta zaif joyingiz" ni shu yerdan oladi.
   */
  app.get(
    '/api/v1/businesses/:businessId/dashboard/seats/:seatId',
    // FR-112: sotuvchining O'Z kabineti. Rahbar istalgan sotuvchini,
    // sotuvchi faqat o'zini ko'radi — begonasi 404.
    { preHandler: [requireBusiness] },
    async (req) => {
      const { seatId } = z
        .object({ businessId: z.string().uuid(), seatId: z.string().uuid() })
        .parse(req.params);
      seatFilter(analyticsScope(req), seatId);
      const { from, to } = period(periodQuery.parse(req.query));
      const businessId = req.business!.businessId;
      const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

      const [current, previous, weakRows, criteriaRows, seatRow] = await withTenant(
        businessId,
        (tx) =>
          Promise.all([
            kpiFor(tx, from, to, seatId),
            kpiFor(tx, prevFrom, from, seatId),
            tx.execute(sql`
            select
              criterion_code,
              min(criterion_name)                   as criterion_name,
              count(score)::int                     as scored,
              round(avg(score), 2)::float           as avg_score
            from criterion_score
            where seat_id = ${seatId}
              and created_at >= ${from.toISOString()}::timestamptz
              and created_at < ${to.toISOString()}::timestamptz
              and score is not null
            group by criterion_code
            having count(score) >= 2
            order by avg(score) asc
            limit 1
          `),
            /**
             * Mezon bo'yicha "men va jamoa" solishtiruvi.
             *
             * Faqat o'z ballini ko'rsatish sotuvchiga kam narsa aytadi:
             * 2.1 ball yaxshimi yoki yomonmi — jamoa 2.8 da turganini
             * bilmasa, javob yo'q. Shu sababli har mezonda ikkala qiymat
             * ham bitta so'rovda hisoblanadi.
             */
            tx.execute(sql`
            select
              criterion_code,
              min(criterion_name)                                                as criterion_name,
              min(category_code)                                                 as category_code,
              count(score) filter (where seat_id = ${seatId})::int               as my_scored,
              count(*)     filter (where seat_id = ${seatId}
                                     and score is null)::int                     as my_unknown,
              round(avg(score) filter (where seat_id = ${seatId}), 2)::float     as my_avg,
              round(avg(score) filter (where seat_id <> ${seatId}), 2)::float    as team_avg,
              max(max_score)::int                                                as max_score
            from criterion_score
            where created_at >= ${from.toISOString()}::timestamptz
              and created_at < ${to.toISOString()}::timestamptz
            group by criterion_code
            having count(score) filter (where seat_id = ${seatId}) > 0
                or count(*) filter (where seat_id = ${seatId}) > 0
            order by min(category_code), criterion_code
          `),
            tx.select({ displayName: seat.displayName }).from(seat).where(eq(seat.id, seatId)).limit(1),
          ]),
      );

      const weak = weakRows[0] as Record<string, unknown> | undefined;
      return {
        period: { from, to },
        seat: { id: seatId, displayName: seatRow[0]?.displayName ?? null },
        current,
        previous,
        weakestCriterion: weak
          ? {
              code: weak.criterion_code,
              name: weak.criterion_name,
              scored: weak.scored,
              avgScore: weak.avg_score,
            }
          : null,
        criteria: (criteriaRows as Record<string, unknown>[]).map((r) => ({
          code: r.criterion_code,
          name: r.criterion_name,
          categoryCode: r.category_code,
          myScored: r.my_scored,
          myUnknown: r.my_unknown,
          myAvg: r.my_avg,
          teamAvg: r.team_avg,
          maxScore: r.max_score,
        })),
      };
    },
  );
}
