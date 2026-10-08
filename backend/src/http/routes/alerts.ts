import { and, desc, eq, lt, ne, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import { alert, analysis, seat } from '../../db/schema/index.js';
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
  /**
   * `active` — oddiy enum QIYMATI EMAS, "resolved bo'lmagan hammasi"
   * degani (`new` + `seen`). Frontend'dagi "Faol" yorlig'i shu bilan
   * ishlaydi — aks holda ikkita alohida so'rov (`new` va `seen`) va
   * ularni birlashtirish kerak bo'lardi.
   */
  status: z.enum(['new', 'seen', 'resolved', 'active']).optional(),
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
  /** Kursor: shu vaqtdan eski ogohlantirishlar (createdAt bo'yicha). */
  before: z.coerce.date().optional(),
});

export function registerAlertRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/businesses/:businessId/alerts',
    { preHandler: [requireBusiness, requirePermission('alert:read')] },
    async (req) => {
      const q = listQuery.parse(req.query);
      const businessId = req.business!.businessId;

      /**
       * Sotuvchi nomi ogohlantirish bilan BIRGA qaytadi.
       *
       * Interfeys uni alohida so'rov bilan olsa, 50 ta ogohlantirish
       * uchun 50 ta qo'shimcha so'rov ketardi; sotuvchini oldindan
       * yuklab olish esa ro'yxatni interfeysda yig'ishni talab qilardi.
       * Bitta `join` ikkalasidan ham arzon.
       */
      const [rows, [counts], turlar] = await withTenant(businessId, (tx) =>
        Promise.all([
          tx
            .select({
              id: alert.id,
              kind: alert.kind,
              severity: alert.severity,
              status: alert.status,
              title: alert.title,
              body: alert.body,
              conversationId: alert.conversationId,
              seatId: alert.seatId,
              createdAt: alert.createdAt,
              resolvedAt: alert.resolvedAt,
              seatName: seat.displayName,
              conversationSummary: analysis.summary,
            })
            .from(alert)
            .leftJoin(seat, eq(seat.id, alert.seatId))
            .leftJoin(analysis, eq(analysis.conversationId, alert.conversationId))
            .where(
              and(
                q.status === 'active'
                  ? ne(alert.status, 'resolved')
                  : q.status
                    ? eq(alert.status, q.status)
                    : undefined,
                q.kind ? eq(alert.kind, q.kind) : undefined,
                q.before ? lt(alert.createdAt, q.before) : undefined,
              ),
            )
            .orderBy(desc(alert.createdAt))
            // `limit + 1`: agar aynan shu limit sonicha qator kelsa, buni
            // "keyingisi yo'q" dan ajratib bo'lmaydi — qo'shimcha 1 qator
            // orqali bilib olamiz, keyin uni javobdan kesib tashlaymiz.
            .limit(q.limit + 1),
          tx
            .select({
              newCount: sql<number>`count(*) filter (where ${alert.status} = 'new')::int`,
              critical: sql<number>`count(*) filter (
                where ${alert.status} != 'resolved' and ${alert.severity} = 'critical'
              )::int`,
            })
            .from(alert),
          /** Tur bo'yicha FAOL sanoq — filtr tugmalaridagi raqamlar. */
          tx
            .select({
              kind: alert.kind,
              count: sql<number>`count(*)::int`,
            })
            .from(alert)
            .where(sql`${alert.status} <> 'resolved'`)
            .groupBy(alert.kind),
        ]),
      );

      const hasMore = rows.length > q.limit;
      const page = hasMore ? rows.slice(0, q.limit) : rows;
      const last = page[page.length - 1];
      return {
        alerts: page,
        unseenCount: counts?.newCount ?? 0,
        criticalOpen: counts?.critical ?? 0,
        byKind: turlar,
        nextCursor: hasMore && last ? last.createdAt : null,
      };
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
