import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { analyzeConversation } from '../ai/analyze.js';
import { getActiveLlm, LlmRefusalError, type LlmClient } from '../ai/llm.js';
import { runBillingTick } from '../billing/engine.js';
import { dispatchTaskExports } from '../integrations/crm-export.js';
import { qongiroqlarniQaytaIshla, sinxronla } from '../integrations/moizvonki.js';
import { runDailyReportTick } from '../reports/daily.js';
import { markOverdueCommitments } from './maintenance.js';
import { dispatchAlertNotifications } from './notify.js';
import { claimNextJob, completeJob, failJob, reclaimStuckJobs } from './queue.js';
import { sweepIdleSessions } from './scheduler.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORKER — navbatni bajaruvchi sikl
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Alohida jarayon EMAS, server ichida ishlaydi. Yakka dasturchi uchun
 * "bitta jarayon = bitta deploy" — worker'ni alohida boshqarish,
 * kuzatish va qayta ishga tushirish yuki yo'q. Yuk oshsa, xuddi shu kod
 * WORKER_ENABLED=false server + alohida worker jarayoni bo'lib ajraladi.
 */

const workerId = `worker-${randomBytes(4).toString('hex')}`;

export interface TickResult {
  processed: boolean;
  jobId?: string;
  conversationId?: string;
  outcome?: string;
  error?: string;
}

/**
 * Bitta ishni olib bajarish. Testlar shu funksiyani mock LLM bilan
 * to'g'ridan-to'g'ri chaqiradi — sikl va taymerlarsiz.
 */
export async function runWorkerTick(llm?: LlmClient): Promise<TickResult> {
  const job = await claimNextJob(workerId);
  if (!job) return { processed: false };

  try {
    const client = llm ?? (await getActiveLlm());
    const result = await analyzeConversation(client, job.businessId, job.conversationId);
    await completeJob(job.id);
    return {
      processed: true,
      jobId: job.id,
      conversationId: job.conversationId,
      outcome: result.status,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Rad etilgan so'rovni qayta urinish foydasiz — darhol DLQ.
    if (err instanceof LlmRefusalError) {
      job.attempts = job.maxAttempts;
    }
    const fate = await failJob(job, message);
    return {
      processed: true,
      jobId: job.id,
      conversationId: job.conversationId,
      outcome: fate,
      error: message,
    };
  }
}

let stopRequested = false;
let loopPromise: Promise<void> | null = null;

/**
 * Moi Zvonki ishlari — siklni KUTDIRMASDAN, fonda.
 *
 * Bitta qo'ng'iroqni baholash (yozuvni yuklash + STT + LLM) o'nlab
 * soniya oladi. Sikl uni `await` qilsa, shu vaqt ichida Telegram tahlili
 * ham, bildirishnomalar ham to'xtab turardi. Shuning uchun ish fonda
 * boshlanadi, bayroq esa oldingisi tugamaguncha yangisini boshlatmaydi —
 * bir vaqtda ikki nusxa ishlab, bir qo'ng'iroqni ikki marta olmasin.
 */
let mzSinxronBand = false;
let mzQaytaIshlashBand = false;

/** Server bilan birga ishga tushadigan doimiy sikl. */
export function startWorkerLoop(log: {
  info: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
}): void {
  stopRequested = false;

  loopPromise = (async () => {
    let lastSweep = 0;
    let lastNotify = 0;
    let lastMzSync = 0;
    let lastMzProcess = 0;
    let lastReclaim = 0;
    let lastBilling = 0;
    let lastReport = 0;

    while (!stopRequested) {
      try {
        const now = Date.now();

        // Jim sessiyalarni navbatga qo'yish — har 30 soniyada.
        if (now - lastSweep > 30_000) {
          lastSweep = now;
          const queued = await sweepIdleSessions();
          if (queued > 0) log.info({ queued }, 'scheduler: sessiyalar navbatga qo\'yildi');
        }

        /**
         * Ogohlantirish bildirishnomalari — har 20 soniyada.
         *
         * Tahlildan tez-tez: qizil bayroq haqida rahbar 5 daqiqadan
         * keyin emas, darhol bilishi kerak. Ish yo'q bo'lsa so'rov
         * arzon — indeks bo'yicha bo'sh natija.
         */
        if (now - lastNotify > 20_000) {
          lastNotify = now;
          const n = await dispatchAlertNotifications();
          if (n.sent > 0 || n.failed > 0) {
            log.info(n, 'bildirishnoma: ogohlantirishlar tarqatildi');
          }

          /**
           * Vazifalarni CRM ga yuborish — xuddi shu ritmda.
           *
           * Ogohlantirish bilan bir tikda: ikkalasi ham tashqi HTTP va
           * ikkalasi ham "yangi yozuv bormi" degan arzon so'rov bilan
           * boshlanadi. Alohida taymer qo'shish faqat kod murakkabligini
           * oshirardi.
           */
          const e = await dispatchTaskExports();
          if (e.sent > 0 || e.failed > 0) {
            log.info(e, 'CRM: vazifalar yuborildi');
          }
        }

        /**
         * Moi Zvonki: yangi qo'ng'iroqlarni olish — har 2 daqiqada,
         * kutayotganlarni baholash — har 15 soniyada (bir tikda 2 tadan).
         * Ikkalasi ham fonda — sabab yuqoridagi bayroqlar izohida.
         */
        if (now - lastMzSync > 120_000 && !mzSinxronBand) {
          lastMzSync = now;
          mzSinxronBand = true;
          void sinxronla()
            .then((r) => {
              const saqlandi = r.reduce((n, x) => n + x.saqlandi, 0);
              if (saqlandi > 0) log.info({ saqlandi }, 'moizvonki: yangi qo\'ng\'iroqlar olindi');
              for (const x of r) {
                if (x.xato) log.error({ businessId: x.businessId, xato: x.xato }, 'moizvonki: sinxronlash xatosi');
              }
            })
            .catch((err: unknown) => log.error({ err }, 'moizvonki: sinxronlash yiqildi'))
            .finally(() => {
              mzSinxronBand = false;
            });
        }
        if (now - lastMzProcess > 15_000 && !mzQaytaIshlashBand) {
          lastMzProcess = now;
          mzQaytaIshlashBand = true;
          void qongiroqlarniQaytaIshla()
            .then((r) => {
              if (r.qayta > 0) log.info(r, 'moizvonki: qo\'ng\'iroqlar baholandi');
              if (r.pauza > 0) log.error(r, 'moizvonki: AI limiti — baholash 15 daqiqaga to\'xtatildi, qo\'ng\'iroqlar navbatda');
            })
            .catch((err: unknown) => log.error({ err }, 'moizvonki: baholash yiqildi'))
            .finally(() => {
              mzQaytaIshlashBand = false;
            });
        }

        // Osilgan ishlar + muddati o'tgan va'dalar — har 5 daqiqada.
        if (now - lastReclaim > 300_000) {
          lastReclaim = now;
          const reclaimed = await reclaimStuckJobs();
          if (reclaimed > 0) log.info({ reclaimed }, 'queue: osilgan ishlar qaytarildi');
          const missed = await markOverdueCommitments();
          if (missed > 0) log.info({ missed }, 'maintenance: muddati o\'tgan va\'dalar belgilandi');
        }

        // Billing tsikli (TZ 3.10) — har soatda. Idempotent, chastota
        // aniqligi shart emas: sinov/davr chegarasi soatlab emas,
        // kunlab o'lchanadi.
        if (now - lastBilling > 3_600_000) {
          lastBilling = now;
          const billing = await runBillingTick();
          if (billing.charged || billing.enteredGrace || billing.degraded) {
            log.info(billing, 'billing: tsikl yakunlandi');
          }
        }

        /**
         * FR-134: kunlik hisobot — har soatda tekshiriladi.
         *
         * Har soat chaqirilishining sababi: hisobot vaqti biznesning O'Z
         * vaqt zonasida sozlanadi, ya'ni "soat 9" har biznes uchun boshqa
         * UTC lahzasi. Funksiya o'zi soatni va takrorlanishni tekshiradi,
         * shuning uchun tez-tez chaqirish xavfsiz.
         */
        if (now - lastReport > 3_600_000) {
          lastReport = now;
          const reports = await runDailyReportTick();
          const sent = reports.filter((r) => r.sent).length;
          if (sent > 0) log.info({ sent }, 'hisobot: kunlik hisobot yuborildi');
          for (const r of reports) {
            if (!r.sent && r.skipped && !['soati emas', 'allaqachon yuborilgan'].includes(r.skipped)) {
              log.error({ businessId: r.businessId, sabab: r.skipped }, 'hisobot: yuborilmadi');
            }
          }
        }

        const tick = await runWorkerTick();
        if (tick.processed) {
          if (tick.error) {
            log.error(
              { jobId: tick.jobId, conversationId: tick.conversationId, err: tick.error, fate: tick.outcome },
              'worker: tahlil xatosi',
            );
          } else {
            log.info(
              { jobId: tick.jobId, conversationId: tick.conversationId, outcome: tick.outcome },
              'worker: tahlil yakunlandi',
            );
          }
          // Navbatda ish bor ekan — kutmasdan davom etamiz.
          continue;
        }
      } catch (err) {
        // Sikl hech qachon o'lmasligi kerak — xato loglanadi, davom etiladi.
        log.error({ err }, 'worker: sikl xatosi');
      }

      await sleep(config.WORKER_POLL_MS);
    }
  })();
}

export async function stopWorkerLoop(): Promise<void> {
  stopRequested = true;
  await loopPromise;
  loopPromise = null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
