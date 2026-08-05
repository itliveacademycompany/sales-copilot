import { sql } from 'drizzle-orm';
import { config } from '../config.js';
import { withoutTenantIsolation } from '../db/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SESSIYA YAKUNLAGICHI — "qachon tahlil qilamiz?" savoliga javob
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Qo'ng'iroqda tahlil trigger tabiiy: qo'ng'iroq tugadi. Telegram'da
 * sessiya "tugamaydi" — shunchaki jim bo'lib qoladi. Qoida:
 *
 *   oxirgi xabardan ANALYZE_AFTER_IDLE_MINUTES o'tdi → navbatga.
 *
 * Nega 24 soatlik sessiya chegarasini kutmaymiz: TZ 9.3 birinchi
 * natijagacha < 30 daqiqa deydi. Sessiya davom etsa (yangi xabar kelsa),
 * ingest holatni 'received' ga qaytaradi va suhbat KEYINROQ TO'LIQ holda
 * qayta tahlil qilinadi — natija hech qachon "yarim" qolib ketmaydi.
 */
export async function sweepIdleSessions(idleMs?: number): Promise<number> {
  const idle = idleMs ?? config.ANALYZE_AFTER_IDLE_MINUTES * 60_000;

  // Bitta so'rovda: mos suhbatlarni topib, navbatga qo'shamiz va
  // holatini 'queued' qilamiz. Faol ish bo'lsa (partial unique index)
  // suhbat o'tkazib yuboriladi — keyingi sweep'da yana urinadi.
  const rows = await withoutTenantIsolation(
    'scheduler: jim sessiyalarni navbatga qo\'yish — barcha tenantlar ustidan',
    (tx) =>
      tx.execute(sql`
        with candidates as (
          -- FR-156: degraded/cancelled bizneslar navbatga tushmaydi —
          -- yig'ish (webhook) davom etadi, faqat yangi tahlil to'xtaydi.
          -- Obunasi bo'lmagan (subscription qatori yo'q) biznes ham
          -- bloklanadi — bu holat sodir bo'lmasligi kerak, lekin sodir
          -- bo'lsa "yopiq" xavfsizroq.
          select c.id, c.business_id from conversation c
          join subscription s on s.business_id = c.business_id
          where c.channel = 'telegram'
            and c.status = 'received'
            and c.ended_at is not null
            and c.ended_at <= now() - make_interval(secs => ${idle / 1000})
            and s.status not in ('degraded', 'cancelled')
          order by c.ended_at
          limit 200
        ),
        inserted as (
          insert into analysis_job (business_id, conversation_id)
          select business_id, id from candidates
          on conflict (conversation_id) where status in ('queued', 'running')
          do nothing
          returning conversation_id
        )
        update conversation c
        set status = 'queued', updated_at = now()
        from inserted i
        where c.id = i.conversation_id
        returning c.id
      `),
  );

  return rows.length;
}
