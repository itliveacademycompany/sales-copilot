import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import { alert } from '../../db/schema/index.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OGOHLANTIRISHLAR API — TZ 3.8 (FR-137)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ogohlantirishlar tizim tomonidan yaratiladi (qizil bayroq, javobsiz
 * lid, buzilgan va'da, past ishonch). Bu API — ko'rish va holat
 * boshqarish: yangi → ko'rildi → hal qilindi.
 */

const listQuery = z.object({
  status: z.enum(['new', 'seen', 'resolved']).optional(),
  kind: z
    .enum([
      'red_flag',
      'quality_drop',
      'missed_lead',
      'broken_commitment',
      'sync_error',
      'low_confidence',
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export function registerAlertRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/businesses/:businessId/alerts',
    { preHandler: [requireBusiness, requirePermission('alert:read')] },
    async (req) => {
      const q = listQuery.parse(req.query);
      const businessId = req.business!.businessId;

      const [rows, [counts]] = await withTenant(businessId, (tx) =>
        Promise.all([
          tx
            .select()
            .from(alert)
            .where(
              and(
                q.status ? eq(alert.status, q.status) : undefined,
                q.kind ? eq(alert.kind, q.kind) : undefined,
              ),
            )
            .orderBy(desc(alert.createdAt))
            .limit(q.limit),
          tx
            .select({
              newCount: sql<number>`count(*) filter (where ${alert.status} = 'new')::int`,
              critical: sql<number>`count(*) filter (
                where ${alert.status} != 'resolved' and ${alert.severity} = 'critical'
              )::int`,
            })
            .from(alert),
        ]),
      );

      return { alerts: rows, unseenCount: counts?.newCount ?? 0, criticalOpen: counts?.critical ?? 0 };
    },
  );

  app.patch(
    '/api/v1/businesses/:businessId/alerts/:alertId',
    { preHandler: [requireBusiness, requirePermission('alert:resolve')] },
    async (req) => {
      const { alertId } = z
        .object({ businessId: z.string().uuid(), alertId: z.string().uuid() })
        .parse(req.params);
      const { status } = z.object({ status: z.enum(['seen', 'resolved']) }).parse(req.body);
      const businessId = req.business!.businessId;

      const [row] = await withTenant(businessId, (tx) =>
        tx
          .update(alert)
          .set(
            status === 'resolved'
              ? { status, resolvedAt: new Date(), resolvedBy: req.auth!.user.id }
              : { status },
          )
          .where(eq(alert.id, alertId))
          .returning(),
      );
      if (!row) throw AppError.notFound();
      return row;
    },
  );
}
