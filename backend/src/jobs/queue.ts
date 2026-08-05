import { sql } from 'drizzle-orm';
import { isAnalysisBlocked } from '../billing/engine.js';
import { withoutTenantIsolation } from '../db/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NAVBAT AMALLARI — FR-90 (retry + DLQ)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Barcha amallar egalik ulanishida (worker cron kabi tenantlar ustidan
 * ishlaydi), lekin ishning O'ZI bajarilganda tahlil withTenant ichida
 * o'tadi — izolyatsiya buzilmaydi.
 *
 * `FOR UPDATE SKIP LOCKED` — bir nechta worker bitta ishni olmasligi
 * uchun. Hozircha worker bitta, lekin bu naqsh keyin gorizontal
 * kengaytirishda o'zgarmaydi.
 */

export interface ClaimedJob {
  id: string;
  businessId: string;
  conversationId: string;
  kind: string;
  attempts: number;
  maxAttempts: number;
}

export interface EnqueueResult {
  queued: boolean;
  reason?: 'already_queued' | 'billing_blocked';
}

/**
 * Suhbatni tahlil navbatiga qo'yish. Faol ish bo'lsa jim o'tadi.
 *
 * FR-156: obuna `degraded`/`cancelled` bo'lsa — navbatga qo'yilmaydi.
 * Bu tekshiruv shu yerda, kirish nuqtasida: scheduler ham, qo'lda
 * "qayta tahlil" tugmasi ham shu funksiya orqali o'tadi, demak ikkalasi
 * ham avtomatik himoyalangan.
 */
export async function enqueueAnalysis(
  businessId: string,
  conversationId: string,
): Promise<EnqueueResult> {
  if (await isAnalysisBlocked(businessId)) {
    return { queued: false, reason: 'billing_blocked' };
  }

  const rows = await withoutTenantIsolation(
    'queue: ish qo\'shish — scheduler tenantlar ustidan ishlaydi',
    (tx) =>
      tx.execute(sql`
        insert into analysis_job (business_id, conversation_id)
        values (${businessId}, ${conversationId})
        on conflict (conversation_id) where status in ('queued', 'running')
        do nothing
        returning id
      `),
  );
  return rows.length > 0 ? { queued: true } : { queued: false, reason: 'already_queued' };
}

/** Navbatdan bitta ishni olish (atomik). Bo'sh bo'lsa null. */
export async function claimNextJob(workerId: string): Promise<ClaimedJob | null> {
  const rows = await withoutTenantIsolation(
    'queue: ishni olish — worker tenantlar ustidan ishlaydi',
    (tx) =>
      tx.execute(sql`
        update analysis_job set
          status = 'running',
          attempts = attempts + 1,
          locked_at = now(),
          locked_by = ${workerId}
        where id = (
          select id from analysis_job
          where status = 'queued' and run_after <= now()
          order by created_at
          limit 1
          for update skip locked
        )
        returning id, business_id, conversation_id, kind, attempts, max_attempts
      `),
  );

  const row = rows[0] as
    | {
        id: string;
        business_id: string;
        conversation_id: string;
        kind: string;
        attempts: number;
        max_attempts: number;
      }
    | undefined;
  if (!row) return null;
  return {
    id: row.id,
    businessId: row.business_id,
    conversationId: row.conversation_id,
    kind: row.kind,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
  };
}

export async function completeJob(jobId: string): Promise<void> {
  await withoutTenantIsolation('queue: ishni yakunlash', (tx) =>
    tx.execute(sql`
      update analysis_job
      set status = 'done', finished_at = now(), locked_at = null, locked_by = null
      where id = ${jobId}
    `),
  );
}

/**
 * Xato: urinishlar qolgan bo'lsa eksponensial kutish bilan qayta
 * navbatga; tugagan bo'lsa — DLQ ('dead') va suhbat 'failed'.
 *
 * Kutish: 30s → 90s → 270s. LLM 429/529 xatolari odatda daqiqada o'tadi.
 */
export async function failJob(job: ClaimedJob, error: string): Promise<'retry' | 'dead'> {
  const isDead = job.attempts >= job.maxAttempts;
  const delaySeconds = 30 * Math.pow(3, job.attempts - 1);

  await withoutTenantIsolation('queue: xatoni qayd etish', async (tx) => {
    if (isDead) {
      await tx.execute(sql`
        update analysis_job
        set status = 'dead', last_error = ${error.slice(0, 2000)},
            finished_at = now(), locked_at = null, locked_by = null
        where id = ${job.id}
      `);
      await tx.execute(sql`
        update conversation set status = 'failed', updated_at = now()
        where id = ${job.conversationId} and status in ('queued', 'analyzing')
      `);
    } else {
      await tx.execute(sql`
        update analysis_job
        set status = 'queued', last_error = ${error.slice(0, 2000)},
            run_after = now() + make_interval(secs => ${delaySeconds}),
            locked_at = null, locked_by = null
        where id = ${job.id}
      `);
    }
  });

  return isDead ? 'dead' : 'retry';
}

/**
 * Osilib qolgan ishlarni qaytarish: worker o'lib qolsa, 'running' holat
 * abadiy qoladi. 10 daqiqadan oshgan qulf — o'lik worker belgisi.
 */
export async function reclaimStuckJobs(): Promise<number> {
  const rows = await withoutTenantIsolation('queue: osilgan ishlarni qaytarish', (tx) =>
    tx.execute(sql`
      update analysis_job
      set status = 'queued', locked_at = null, locked_by = null
      where status = 'running' and locked_at < now() - interval '10 minutes'
      returning id
    `),
  );
  return rows.length;
}
