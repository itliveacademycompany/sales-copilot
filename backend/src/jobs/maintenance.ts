import { sql } from 'drizzle-orm';
import { withoutTenantIsolation } from '../db/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAVRIY NAZORAT ISHLARI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Worker sikli ichida vaqti-vaqti bilan chaqiriladi. Har biri idempotent —
 * ikki marta ishga tushsa ham natija bir xil.
 */

/**
 * FR-133 / FR-129f: muddati o'tgan va'dalar.
 *
 * `pending` va'daning muddati o'tdi → holat `missed` + rahbarga
 * ogohlantirish. Vazifa emas, aynan va'da kuzatiladi: "ertaga hujjat
 * yuboraman" deb mijozga aytilgan gap bajarilmasa, bu ichki intizom
 * emas, mijoz oldidagi obro' masalasi.
 */
export async function markOverdueCommitments(): Promise<number> {
  const rows = await withoutTenantIsolation(
    'maintenance: muddati o\'tgan va\'dalarni belgilash — barcha tenantlar',
    (tx) =>
      tx.execute(sql`
        with missed as (
          update commitment
          set status = 'missed'
          where status = 'pending'
            and deadline is not null
            and deadline < now()
          returning id, business_id, conversation_id, seat_id, what
        )
        insert into alert (business_id, seat_id, conversation_id, kind, severity, title, body, dedupe_key)
        select
          business_id, seat_id, conversation_id,
          'broken_commitment', 'warning',
          'Va''da muddati o''tdi: ' || left(what, 120),
          jsonb_build_object('commitmentId', id),
          'commitment:' || id
        from missed
        on conflict do nothing
        returning id
      `),
  );
  return rows.length;
}
