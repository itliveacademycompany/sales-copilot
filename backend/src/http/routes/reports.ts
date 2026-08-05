import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import { dailySummary, integration } from '../../db/schema/index.js';
import { sendDailyReportNow } from '../../reports/daily.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * KUNLIK HISOBOT — TZ 3.8, FR-134.
 *
 * Sozlamalar (qabul qiluvchi chat va soat) `integration.config` ichida
 * saqlanadi: hisobot Telegram botiga bog'liq va usiz ma'nosi yo'q,
 * shuning uchun alohida jadval ham, migratsiya ham kerak emas.
 */

const settingsBody = z.object({
  /** Guruh yoki shaxsiy chat id. Guruhlarda manfiy bo'ladi. */
  reportChatId: z
    .string()
    .trim()
    .regex(/^-?\d{3,}$/, 'Chat ID faqat raqamlardan iborat bo\'lishi kerak')
    .nullable(),
  reportHour: z.number().int().min(0).max(23).optional(),
});

export function registerReportRoutes(app: FastifyInstance): void {
  /** Oxirgi hisobotlar — interfeysda ko'rish uchun. */
  app.get(
    '/api/v1/businesses/:businessId/reports/daily',
    { preHandler: [requireBusiness, requirePermission('analytics:read:all')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const rows = await withTenant(businessId, (tx) =>
        tx
          .select({
            id: dailySummary.id,
            summaryDate: dailySummary.summaryDate,
            content: dailySummary.content,
            stats: dailySummary.stats,
            triggeredBy: dailySummary.triggeredBy,
            createdAt: dailySummary.createdAt,
          })
          .from(dailySummary)
          .orderBy(desc(dailySummary.createdAt))
          .limit(14),
      );
      return { reports: rows };
    },
  );

  /** Hisobot sozlamalari. */
  app.put(
    '/api/v1/businesses/:businessId/reports/daily/settings',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async (req) => {
      const body = settingsBody.parse(req.body);
      const businessId = req.business!.businessId;

      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select({ id: integration.id, config: integration.config })
          .from(integration)
          .where(eq(integration.kind, 'telegram_bot'))
          .limit(1),
      );
      if (!row) throw AppError.badRequest('Avval Telegram botni ulang');

      const config = {
        ...(row.config as Record<string, unknown>),
        reportChatId: body.reportChatId,
        ...(body.reportHour !== undefined ? { reportHour: body.reportHour } : {}),
      };

      await withTenant(businessId, (tx) =>
        tx
          .update(integration)
          .set({ config, updatedAt: new Date() })
          .where(and(eq(integration.id, row.id), eq(integration.kind, 'telegram_bot'))),
      );

      return { reportChatId: config.reportChatId, reportHour: config.reportHour ?? 9 };
    },
  );

  /**
   * "Hozir yuborish" — sozlashni tekshirish uchun.
   *
   * Soat va takrorlanish tekshiruvlarini chetlab o'tadi, chunki
   * foydalanuvchi aynan natijani DARHOL ko'rmoqchi. Yuborilmasa,
   * sabab matn bilan qaytadi — "hech narsa bo'lmadi" holati yo'q.
   */
  app.post(
    '/api/v1/businesses/:businessId/reports/daily/send',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async (req) => {
      const result = await sendDailyReportNow(req.business!.businessId);
      return result;
    },
  );
}
