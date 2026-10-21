import 'dotenv/config';
import { z } from 'zod';

/**
 * Env validatsiyasi. Server noto'g'ri sozlama bilan ishga tushmasligi kerak —
 * ishlab chiqarishda yarim sozlangan holat eng yomon holat.
 */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  /**
   * Ilova ulanishi. **Superuser bo'lmagan rol** bo'lishi shart —
   * aks holda PostgreSQL RLS ni butunlay chetlab o'tadi.
   */
  DATABASE_URL: z.string().url('DATABASE_URL to\'g\'ri postgres URL bo\'lishi kerak'),

  /**
   * Egalik ulanishi: migratsiya, rol yaratish, cron va super-admin.
   * Oddiy so'rovlar HECH QACHON bu ulanishdan foydalanmaydi.
   */
  DATABASE_URL_ADMIN: z.string().url('DATABASE_URL_ADMIN to\'g\'ri postgres URL bo\'lishi kerak'),

  COOKIE_SECRET: z
    .string()
    .min(32, 'COOKIE_SECRET kamida 32 belgi bo\'lishi kerak'),

  CREDENTIALS_KEY: z
    .string()
    .refine(
      (v) => {
        if (!v) return false;
        try {
          return Buffer.from(v, 'base64').length === 32;
        } catch {
          return false;
        }
      },
      'CREDENTIALS_KEY base64 formatida aynan 32 bayt bo\'lishi kerak (AES-256)',
    ),

  WEB_ORIGIN: z.string().url().default('http://localhost:5173'),

  /**
   * Backend'ning TASHQI manzili — OAuth issuer va MCP manzili shundan
   * quriladi (`${PUBLIC_URL}/mcp`). claude.ai ulanishi uchun ommaviy HTTPS
   * bo'lishi shart; lokal sinovda (Claude Code/Desktop) standart yetadi.
   * Oxiridagi `/` olib tashlanadi.
   */
  PUBLIC_URL: z
    .string()
    .url()
    .optional()
    .transform((v) => v?.replace(/\/+$/, '')),

  // ─── AI tahlil quvuri ───

  /** Ichki worker'ni server bilan birga ishga tushirish. */
  WORKER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),

  /** Worker navbatni qancha oraliqda tekshiradi (ms). */
  WORKER_POLL_MS: z.coerce.number().int().min(200).default(5000),

  /**
   * Tahlil navbatini bir vaqtda nechta yo'l (lane) bajaradi. Fikrlovchi
   * modellar (GLM) bitta qo'ng'iroqqa 3+ daqiqa oladi — bitta yo'lda soatiga
   * ~17 ta. `FOR UPDATE SKIP LOCKED` tufayli yo'llar bir ishni olmaydi.
   * Provayder bir vaqtdagi so'rovlarni cheklasa (429) — kamaytiring.
   */
  WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),

  /**
   * Bir vaqtda nechta lokal STT (GigaAM) jarayoni ishlasin. Har biri GPU'siz
   * bir necha GB RAM va barcha yadrolarni oladi: 16 GB li kompyuterda 1,
   * 48 GB / 12 yadroli serverda 2 xavfsiz. Ko'paytirsangiz, `.env` da
   * `OMP_NUM_THREADS` ni (yadrolar soni / STT_CONCURRENCY) qilib qo'ying —
   * aks holda jarayonlar bir-birining yadrosini talashadi.
   */
  STT_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),

  /**
   * Moi Zvonki qo'ng'iroqlari bir vaqtda nechtadan baholanadi. Sekin qism —
   * LLM (GLM bitta qo'ng'iroqqa ~8 daqiqa), STT esa `STT_CONCURRENCY` bilan
   * alohida cheklangan. Serverda (2026-10-21) 2 ta bilan soatiga ~3-4 ta
   * chiqdi va protsessor 99% bo'sh turdi. Provayder 429 bersa, qo'ng'iroqlar
   * yo'qolmaydi: navbatga qaytadi va baholash 15 daqiqaga to'xtaydi.
   */
  MOIZVONKI_PARALLEL: z.coerce.number().int().min(1).max(16).default(2),

  /**
   * Telegram sessiyasi qancha "jim" turgandan keyin tahlilga yuboriladi
   * (daqiqa). Juda qisqa — yarim suhbat baholanadi; juda uzun — mijoz
   * natijani kech ko'radi. TZ 9.3: birinchi natijagacha < 30 daqiqa.
   */
  ANALYZE_AFTER_IDLE_MINUTES: z.coerce.number().min(0).default(20),

  // ─── Billing (TZ 3.10) ───

  /**
   * Bitta seat narxi/oy, so'mda. TZ 5.3 dagi taxminiy tannarx (~640k)
   * asosida — LLM xarajati shu narxga kiritilgan deb hisoblanadi.
   * Haqiqiy narx keyin admin panelidan sozlanadigan bo'ladi; hozircha
   * yagona sozlama shu yerda.
   */
  SEAT_PRICE_UZS: z.coerce.number().int().nonnegative().default(640_000),

  /** FR-155: to'lov kechiksa ham ishlaydigan davr (kun). */
  BILLING_GRACE_DAYS: z.coerce.number().int().min(1).max(30).default(10),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  • ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`\nSozlama xatosi (.env):\n${issues}\n`);
  process.exit(1);
}

export const config = parsed.data;
export const isProd = config.NODE_ENV === 'production';
