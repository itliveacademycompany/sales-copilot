import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { withTenant } from '../../db/index.js';
import { billingTransaction, seat, subscription } from '../../db/schema/index.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILLING API — TZ 3.10
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ikkita darajaga bo'lingan:
 *   - `/billing/status` — hamma ko'radi (business:read): sinov qolgan kun,
 *     holat. Bank hisobi raqamlari yo'q, faqat banner uchun yetarli.
 *   - `/billing` va `/billing/topup` — faqat egasi (subscription:manage):
 *     balans, tranzaksiyalar, to'lov qo'shish.
 *
 * Haqiqiy Payme/Click integratsiyasi hali yo'q (merchant hisobi kerak).
 * Hozircha to'lovni qo'lda kiritish (bank o'tkazmasi tasdiqlangandan
 * keyin) — bu oraliq yechim, keyin webhook bilan almashtiriladi.
 */

const topupBody = z.object({
  amount: z.number().positive().max(1_000_000_000),
  description: z.string().trim().max(300).optional(),
});

export function registerBillingRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/businesses/:businessId/billing/status',
    { preHandler: [requireBusiness, requirePermission('business:read')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select({
            status: subscription.status,
            trialEndsAt: subscription.trialEndsAt,
            graceEndsAt: subscription.graceEndsAt,
            currentPeriodEnd: subscription.currentPeriodEnd,
          })
          .from(subscription)
          .where(eq(subscription.businessId, businessId))
          .limit(1),
      );
      if (!row) return { status: 'trial', daysLeft: null };

      const deadline = row.status === 'trial' ? row.trialEndsAt
        : row.status === 'grace' ? row.graceEndsAt
        : row.currentPeriodEnd;
      const daysLeft = deadline
        ? Math.max(0, Math.ceil((deadline.getTime() - Date.now()) / 86_400_000))
        : null;

      return { status: row.status, daysLeft };
    },
  );

  app.get(
    '/api/v1/businesses/:businessId/billing',
    { preHandler: [requireBusiness, requirePermission('subscription:manage')] },
    async (req) => {
      const businessId = req.business!.businessId;

      const [[sub], seatsRows, transactions] = await withTenant(businessId, (tx) =>
        Promise.all([
          tx.select().from(subscription).where(eq(subscription.businessId, businessId)).limit(1),
          tx.select({ id: seat.id }).from(seat).where(eq(seat.isActive, true)),
          tx
            .select()
            .from(billingTransaction)
            .orderBy(desc(billingTransaction.createdAt))
            .limit(50),
        ]),
      );

      // Haqiqiy yechish `subscription.seat_price` dan olinadi (ro'yxatdan
      // o'tgan paytda "qulflangan" narx — billing/engine.ts shu ustunni
      // ishlatadi). Platforma narxi (`config.SEAT_PRICE_UZS`) keyinroq
      // o'zgargan bo'lsa, eski obunalar UCHUN bahodan farq qilishi mumkin
      // — shuning uchun taxmin ham qulflangan narxdan hisoblanadi, aks
      // holda "oylik xarajat" haqiqiy yechiladigan summadan farq qilardi.
      const effectiveSeatPrice = sub ? Number(sub.seatPrice) : config.SEAT_PRICE_UZS;

      return {
        subscription: sub ?? null,
        monthlySeatPriceUzs: effectiveSeatPrice,
        activeSeats: seatsRows.length,
        estimatedMonthlyCostUzs: seatsRows.length * effectiveSeatPrice,
        transactions,
      };
    },
  );

  /**
   * Qo'lda to'lov kiritish (bank o'tkazmasi, naqd va h.k. tasdiqlangandan
   * keyin). Real to'lov tizimlari ulanguncha yagona yo'l. Har kiritish
   * audit uchun `performedBy` bilan yoziladi.
   */
  app.post(
    '/api/v1/businesses/:businessId/billing/topup',
    { preHandler: [requireBusiness, requirePermission('subscription:manage')] },
    async (req, reply) => {
      const body = topupBody.parse(req.body);
      const businessId = req.business!.businessId;
      const userId = req.auth!.user.id;

      const row = await withTenant(businessId, async (tx) => {
        const [sub] = await tx
          .select({ balance: subscription.balance })
          .from(subscription)
          .where(eq(subscription.businessId, businessId))
          .for('update');
        const before = Number(sub?.balance ?? 0);
        const after = before + body.amount;

        await tx
          .update(subscription)
          .set({ balance: after.toFixed(2), updatedAt: new Date() })
          .where(eq(subscription.businessId, businessId));

        const [tx1] = await tx
          .insert(billingTransaction)
          .values({
            businessId,
            type: 'topup',
            amount: body.amount.toFixed(2),
            balanceBefore: before.toFixed(2),
            balanceAfter: after.toFixed(2),
            description: body.description ?? 'Qo\'lda to\'ldirish',
            performedBy: userId,
          })
          .returning();

        return tx1;
      });

      reply.status(201);
      return row;
    },
  );
}
