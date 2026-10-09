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
          m.business_id, m.seat_id, m.conversation_id,
          'broken_commitment', 'warning',
          'Va''da muddati o''tdi: ' || left(m.what, 120),
          jsonb_build_object('commitmentId', m.id),
          'commitment:' || m.id
        from missed m
        join business b on b.id = m.business_id
        -- Sozlamalar → Bildirishnomalar: tur o'chirilgan bo'lsa va'da baribir
        -- 'missed' bo'ladi (hisobot uchun), faqat ogohlantirish yaratilmaydi.
        -- Kalit yo'q bo'lsa — standart qiymat (yoqilgan), sxemadagidek.
        where coalesce((b.alert_prefs -> 'kinds' ->> 'broken_commitment')::boolean, true)
        on conflict do nothing
        returning id
      `),
  );
  return rows.length;
}
