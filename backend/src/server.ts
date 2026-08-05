import { config } from './config.js';
import { closeDb } from './db/index.js';
import { buildApp } from './http/app.js';
import { startWorkerLoop, stopWorkerLoop } from './jobs/worker.js';

const app = await buildApp();

/**
 * Toza to'xtash: yangi so'rovlarni qabul qilishni to'xtatib, ishlayotgan
 * so'rovlarni tugatib, keyin ulanishlarni yopamiz.
 *
 * Busiz deploy paytida ishlayotgan so'rovlar uziladi — foydalanuvchi
 * uchun bu tasodifiy 502 xatolari bo'lib ko'rinadi.
 */
let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info({ signal }, 'to\'xtatilmoqda');

  const force = setTimeout(() => {
    app.log.error('toza to\'xtash 10s ichida tugamadi, majburiy chiqish');
    process.exit(1);
  }, 10_000);
  force.unref();

  try {
    await stopWorkerLoop();
    await app.close();
    await closeDb();
    app.log.info('to\'xtatildi');
    process.exit(0);
  } catch (err) {
    app.log.error({ err }, 'to\'xtatishda xato');
    process.exit(1);
  }
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void shutdown(signal));
}

process.on('unhandledRejection', (reason) => {
  app.log.fatal({ reason }, 'ushlanmagan promise rad etilishi');
  void shutdown('unhandledRejection');
});

try {
  await app.listen({ port: config.PORT, host: '0.0.0.0' });
} catch (err) {
  app.log.fatal({ err }, 'server ishga tushmadi');
  process.exit(1);
}

// AI tahlil worker'i — server bilan bitta jarayonda (izoh: jobs/worker.ts).
if (config.WORKER_ENABLED) {
  startWorkerLoop(app.log);
  app.log.info('AI tahlil worker\'i ishga tushdi');
}
