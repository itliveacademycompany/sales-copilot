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

  // ─── AI tahlil quvuri ───

  /** Ichki worker'ni server bilan birga ishga tushirish. */
  WORKER_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v !== 'false'),

  /** Worker navbatni qancha oraliqda tekshiradi (ms). */
  WORKER_POLL_MS: z.coerce.number().int().min(200).default(5000),

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
