import { sql } from 'drizzle-orm';
import { config } from '../config.js';
import { withoutTenantIsolation } from '../db/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILLING DVIGATELI — TZ 3.10
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Holat mashinasi: trial → active → grace → degraded, yoki active → active
 * (muvaffaqiyatli oylik yechish). `cancelled` faqat qo'lda o'rnatiladi.
 *
 * ═══ FR-156: DEGRADED REJIM — bu loyihaning axloqiy qarori ═══
 * Ko'p tizimlarda obuna muzlaganda ma'lumot yig'ish ham to'xtaydi —
 * mijoz to'lasa ham o'sha kunlar butunlay yo'qoladi. Bizda faqat
 * yangi TAHLIL to'xtaydi (`enqueueAnalysis` va scheduler shu holatni
 * tekshiradi — `jobs/queue.ts`, `jobs/scheduler.ts`), Telegram xabarlarini
 * yig'ish esa hech qanday sharoitda to'xtamaydi (`telegram/ingest.ts` bu
 * modulga umuman bog'liq emas).
 *
 * Qaror qabul qilish logikasi (`decideBillingAction`) ataylab bazadan
 * ajratilgan — sof funksiya, DB'siz sinaladi. IO faqat `runBillingTick`da.
 */

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'grace' | 'degraded' | 'cancelled';

export interface SubscriptionSnapshot {
  status: SubscriptionStatus;
  balance: number;
  seatPrice: number;
  trialEndsAt: Date | null;
  currentPeriodEnd: Date | null;
  graceEndsAt: Date | null;
}

export type BillingAction =
  | { type: 'none' }
  | { type: 'charge'; amount: number; periodDays: number }
  | { type: 'enter_grace' }
  | { type: 'degrade' };

/**
 * Bitta obunaning keyingi holatini hisoblaydi. Vaqt va faol seat soni
 * tashqaridan beriladi — shu tufayli soat/kalendarga bog'lanmasdan
 * sinash mumkin.
 */
export function decideBillingAction(
  sub: SubscriptionSnapshot,
  activeSeats: number,
  now: Date,
  graceDays: number,
): BillingAction {
  const chargeAmount = activeSeats * sub.seatPrice;
  const canCover = activeSeats === 0 || sub.balance >= chargeAmount;

  switch (sub.status) {
    case 'trial':
      if (!sub.trialEndsAt || sub.trialEndsAt > now) return { type: 'none' };
      return canCover ? { type: 'charge', amount: chargeAmount, periodDays: 30 } : { type: 'enter_grace' };

    case 'active':
      if (!sub.currentPeriodEnd || sub.currentPeriodEnd > now) return { type: 'none' };
      return canCover ? { type: 'charge', amount: chargeAmount, periodDays: 30 } : { type: 'enter_grace' };

    case 'grace':
      // To'lov kelgan bo'lsa (balans to'ldirilgan) — darhol qayta faollashtiramiz,
      // grace muddati tugashini kutmasdan.
      if (canCover) return { type: 'charge', amount: chargeAmount, periodDays: 30 };
      if (sub.graceEndsAt && sub.graceEndsAt <= now) return { type: 'degrade' };
      return { type: 'none' };

    case 'degraded':
      // Degraded'dan chiqishning yagona yo'li — balansni to'ldirish.
      return canCover ? { type: 'charge', amount: chargeAmount, periodDays: 30 } : { type: 'none' };

    case 'past_due':
    case 'cancelled':
      return { type: 'none' };
  }
}

export interface BillingTickResult {
  charged: number;
  enteredGrace: number;
  degraded: number;
}

/**
 * Barcha bizneslar bo'yicha billing holatini yangilaydi. Idempotent va
 * chastotaga sezgir emas — worker'da bir necha soatda bir marta
 * chaqirilsa yetarli (kunlik tsikl uchun ortiqcha aniqlik shart emas).
 */
export async function runBillingTick(): Promise<BillingTickResult> {
  const subs = await withoutTenantIsolation(
    'billing: barcha obunalarni o\'qish — tsikl tenantlar ustidan ishlaydi',
    (tx) =>
      tx.execute(sql`
        select
          s.business_id, s.status, s.balance::float as balance,
          s.seat_price::float as seat_price, s.trial_ends_at, s.current_period_end,
          s.grace_ends_at,
          coalesce(seats.active_count, 0)::int as active_seats
        from subscription s
        left join (
          select business_id, count(*) as active_count
          from seat where is_active
          group by business_id
        ) seats on seats.business_id = s.business_id
        where s.status not in ('cancelled')
      `),
  );

  const now = new Date();
  const result: BillingTickResult = { charged: 0, enteredGrace: 0, degraded: 0 };

  for (const row of subs as unknown as {
    business_id: string;
    status: SubscriptionStatus;
    balance: number;
    seat_price: number;
    trial_ends_at: string | Date | null;
    current_period_end: string | Date | null;
    grace_ends_at: string | Date | null;
    active_seats: number;
  }[]) {
    // `tx.execute(sql\`...\`)` xom qatorlar qaytaradi — sana ustunlari
    // har doim ham Date obyekti sifatida kelmaydi (drayver/versiyaga
    // qarab satr bo'lishi mumkin). `Date > string` solishtiruvi jim
    // ravishda NaN'ga aylanib, "kelajakdagi sana" HAR DOIM yolg'on
    // chiqib qolardi — bu real xato edi, shu joyda tutildi va tuzatildi.
    const toDate = (v: string | Date | null): Date | null => (v === null ? null : new Date(v));

    const action = decideBillingAction(
      {
        status: row.status,
        balance: row.balance,
        seatPrice: row.seat_price,
        trialEndsAt: toDate(row.trial_ends_at),
        currentPeriodEnd: toDate(row.current_period_end),
        graceEndsAt: toDate(row.grace_ends_at),
      },
      row.active_seats,
      now,
      config.BILLING_GRACE_DAYS,
    );

    if (action.type === 'none') continue;

    await withoutTenantIsolation(`billing: ${row.business_id} holatini yangilash`, async (tx) => {
      if (action.type === 'charge') {
        if (action.amount > 0) {
          await tx.execute(sql`
            insert into billing_transaction
              (business_id, type, amount, balance_before, balance_after, currency, description, seats_count, seat_price, period_start, period_end)
            values (
              ${row.business_id}, 'charge', ${action.amount}, ${row.balance}, ${row.balance - action.amount},
              'UZS', ${`Oylik to'lov: ${row.active_seats} seat`}, ${row.active_seats}, ${row.seat_price},
              now(), now() + make_interval(days => ${action.periodDays})
            )
          `);
        }
        await tx.execute(sql`
          update subscription set
            status = 'active',
            balance = balance - ${action.amount},
            current_period_start = now(),
            current_period_end = now() + make_interval(days => ${action.periodDays}),
            grace_ends_at = null,
            updated_at = now()
          where business_id = ${row.business_id}
        `);
        result.charged++;
      } else if (action.type === 'enter_grace') {
        await tx.execute(sql`
          update subscription set
            status = 'grace',
            grace_ends_at = now() + make_interval(days => ${config.BILLING_GRACE_DAYS}),
            updated_at = now()
          where business_id = ${row.business_id}
        `);
        result.enteredGrace++;
      } else if (action.type === 'degrade') {
        await tx.execute(sql`
          update subscription set status = 'degraded', updated_at = now()
          where business_id = ${row.business_id}
        `);
        result.degraded++;
      }
    });
  }

  return result;
}

/** Tahlil navbatiga qo'yishdan oldingi tezkor tekshiruv (FR-156). */
export async function isAnalysisBlocked(businessId: string): Promise<boolean> {
  const rows = await withoutTenantIsolation(
    'billing: obuna holatini tekshirish — navbatga qo\'yishdan oldin',
    (tx) =>
      tx.execute(sql`select status from subscription where business_id = ${businessId}`),
  );
  const status = (rows[0] as { status: SubscriptionStatus } | undefined)?.status;
  return status === 'degraded' || status === 'cancelled';
}
