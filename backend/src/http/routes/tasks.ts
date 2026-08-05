import { and, asc, eq, gte, isNotNull, lt, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import { task } from '../../db/schema/index.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { assertSeatAllowed, seatFilter, taskScope } from '../scope.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VAZIFALAR API — TZ 3.7A
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Vazifalarning ko'pi AI tomonidan yaratiladi (analyze.ts, FR-127) —
 * bu API ularni ko'rish, bajarish va qo'lda qo'shish uchun.
 *
 * "Kechikkan" (overdue) alohida holat EMAS — `dueAt < now()` va
 * bajarilmagan bo'lish hisobidan chiqadi. Alohida holat qilib saqlansa,
 * uni yangilab turadigan cron kerak bo'lardi va u har doim ozgina
 * eskirgan bo'lardi.
 */

const listQuery = z.object({
  status: z.enum(['pending', 'in_progress', 'done', 'cancelled', 'blocked']).optional(),
  seatId: z.string().uuid().optional(),
  /** today — bugun muddati kelganlar; overdue — kechikkanlar. */
  view: z.enum(['today', 'overdue']).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const createBody = z.object({
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(2000).nullable().optional(),
  seatId: z.string().uuid().nullable().optional(),
  conversationId: z.string().uuid().nullable().optional(),
  dueAt: z.coerce.date().nullable().optional(),
  action: z.string().trim().max(60).nullable().optional(),
});

const patchBody = z
  .object({
    status: z.enum(['pending', 'in_progress', 'done', 'cancelled', 'blocked']).optional(),
    title: z.string().trim().min(3).max(300).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    seatId: z.string().uuid().nullable().optional(),
    dueAt: z.coerce.date().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Kamida bitta maydon kerak');

/** Bajarilmagan holatlar — "ochiq" vazifa ta'rifi bitta joyda tursin. */
const OPEN_STATUSES = ['pending', 'in_progress', 'blocked'] as const;

export function registerTaskRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/businesses/:businessId/tasks',
    // Sotuvchi ham kiradi — lekin faqat o'z vazifalarini ko'radi (FR-129e).
    { preHandler: [requireBusiness] },
    async (req) => {
      const q = listQuery.parse(req.query);
      const businessId = req.business!.businessId;
      const onlySeat = seatFilter(taskScope(req), q.seatId);
      const now = new Date();
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 3600 * 1000);

      const rows = await withTenant(businessId, (tx) =>
        tx
          .select()
          .from(task)
          .where(
            and(
              q.status ? eq(task.status, q.status) : undefined,
              onlySeat ? eq(task.seatId, onlySeat) : undefined,
              q.view === 'today'
                ? and(
                    gte(task.dueAt, dayStart),
                    lt(task.dueAt, dayEnd),
                    sql`${task.status} in ('pending', 'in_progress', 'blocked')`,
                  )
                : undefined,
              q.view === 'overdue'
                ? and(
                    isNotNull(task.dueAt),
                    lt(task.dueAt, now),
                    sql`${task.status} in ('pending', 'in_progress', 'blocked')`,
                  )
                : undefined,
            ),
          )
          // Muddatlilar oldin (eng yaqini birinchi), muddatsizlar keyin.
          .orderBy(sql`${task.dueAt} asc nulls last`, asc(task.createdAt))
          .limit(q.limit),
      );

      return {
        tasks: rows.map((t) => ({
          ...t,
          isOverdue:
            t.dueAt !== null &&
            t.dueAt < now &&
            (OPEN_STATUSES as readonly string[]).includes(t.status),
        })),
      };
    },
  );

  app.post(
    '/api/v1/businesses/:businessId/tasks',
    { preHandler: [requireBusiness, requirePermission('task:manage:all')] },
    async (req, reply) => {
      const body = createBody.parse(req.body);
      const businessId = req.business!.businessId;

      const [row] = await withTenant(businessId, (tx) =>
        tx
          .insert(task)
          .values({
            businessId,
            title: body.title,
            description: body.description ?? null,
            seatId: body.seatId ?? null,
            conversationId: body.conversationId ?? null,
            dueAt: body.dueAt ?? null,
            action: body.action ?? null,
            source: 'manual',
            createdBy: req.auth!.user.id,
          })
          .returning(),
      );

      reply.status(201);
      return row;
    },
  );

  app.patch(
    '/api/v1/businesses/:businessId/tasks/:taskId',
    { preHandler: [requireBusiness] },
    async (req) => {
      const { taskId } = z
        .object({ businessId: z.string().uuid(), taskId: z.string().uuid() })
        .parse(req.params);
      const body = patchBody.parse(req.body);
      const businessId = req.business!.businessId;

      /**
       * Ikki xil huquq:
       *   `task:manage:all`  — rahbar, hamma maydonni o'zgartiradi
       *   `task:update:own`  — sotuvchi, faqat O'Z vazifasining HOLATINI
       *
       * Sotuvchiga muddat yoki mas'ulni o'zgartirishga ruxsat berilmaydi —
       * aks holda u kechikkan vazifani oldinga surib, kuzatuvni ma'nosiz
       * qilib qo'yardi.
       */
      const perms = req.business!.permissions;
      const boshqaraOladi = perms.includes('task:manage:all');
      if (!boshqaraOladi) {
        if (!perms.includes('task:update:own')) throw AppError.notFound();
        const faqatHolat =
          body.status !== undefined &&
          body.title === undefined &&
          body.description === undefined &&
          body.seatId === undefined &&
          body.dueAt === undefined;
        if (!faqatHolat) throw AppError.forbidden();

        const [mavjud] = await withTenant(businessId, (tx) =>
          tx.select({ seatId: task.seatId }).from(task).where(eq(task.id, taskId)).limit(1),
        );
        if (!mavjud) throw AppError.notFound();
        assertSeatAllowed(taskScope(req), mavjud.seatId);
      }

      const [row] = await withTenant(businessId, (tx) =>
        tx
          .update(task)
          .set({
            ...(body.status !== undefined
              ? {
                  status: body.status,
                  // FR-129d uchun: bajarish vaqti shu belgidan hisoblanadi.
                  completedAt: body.status === 'done' ? new Date() : null,
                }
              : {}),
            ...(body.title !== undefined ? { title: body.title } : {}),
            ...(body.description !== undefined ? { description: body.description } : {}),
            ...(body.seatId !== undefined ? { seatId: body.seatId } : {}),
            ...(body.dueAt !== undefined ? { dueAt: body.dueAt } : {}),
            updatedAt: new Date(),
          })
          .where(eq(task.id, taskId))
          .returning(),
      );
      if (!row) throw AppError.notFound();
      return row;
    },
  );

  /** FR-129d: bajarilish analitikasi. */
  app.get(
    '/api/v1/businesses/:businessId/tasks/analytics',
    { preHandler: [requireBusiness, requirePermission('task:read:all')] },
    async (req) => {
      const businessId = req.business!.businessId;

      const [stats] = await withTenant(businessId, (tx) =>
        tx
          .select({
            total: sql<number>`count(*)::int`,
            done: sql<number>`count(*) filter (where ${task.status} = 'done')::int`,
            pending: sql<number>`count(*) filter (where ${task.status} = 'pending')::int`,
            inProgress: sql<number>`count(*) filter (where ${task.status} = 'in_progress')::int`,
            cancelled: sql<number>`count(*) filter (where ${task.status} = 'cancelled')::int`,
            blocked: sql<number>`count(*) filter (where ${task.status} = 'blocked')::int`,
            overdue: sql<number>`count(*) filter (
              where ${task.dueAt} is not null and ${task.dueAt} < now()
                and ${task.status} in ('pending', 'in_progress', 'blocked')
            )::int`,
            fromAi: sql<number>`count(*) filter (where ${task.source} = 'playbook_analysis')::int`,
            avgCompletionHours: sql<number | null>`round(
              avg(extract(epoch from (${task.completedAt} - ${task.createdAt})) / 3600.0)
                filter (where ${task.completedAt} is not null)
            , 1)::float`,
          })
          .from(task),
      );

      const s = stats!;
      const closed = s.done + s.cancelled;
      return {
        ...s,
        completionRatePct:
          s.total === 0 ? null : Math.round((s.done / Math.max(1, s.total - s.cancelled)) * 1000) / 10,
        openCount: s.total - closed,
      };
    },
  );
}
