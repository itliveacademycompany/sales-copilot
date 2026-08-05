import { drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import postgres from 'postgres';
import { config, isProd } from '../config.js';
import * as schema from './schema/index.js';

/**
 * SQL loglari ataylab sukut bo'yicha o'chirilgan: ular test va skript
 * natijalarini ko'rinmas qilib yuboradi. Kerak bo'lganda: LOG_SQL=true
 */
const logSql = process.env.LOG_SQL === 'true';

/**
 * ILOVA ULANISHI — `sotuv_app` roli (superuser EMAS).
 * RLS shu ulanishga to'liq qo'llanadi.
 */
export const queryClient = postgres(config.DATABASE_URL, {
  max: isProd ? 20 : 5,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: undefined,
});

export const db = drizzle(queryClient, { schema, logger: logSql });

/**
 * EGALIK ULANISHI — RLS qo'llanmaydi.
 *
 * Ataylab kichik pool: bu ulanish faqat migratsiya, cron va super-admin
 * uchun. Agar bu yerda ko'p ulanish kerak bo'lsa — demak kod noto'g'ri
 * ulanishdan foydalanmoqda.
 */
const adminClient = postgres(config.DATABASE_URL_ADMIN, {
  max: 2,
  idle_timeout: 20,
  connect_timeout: 10,
  transform: undefined,
});

const adminDb = drizzle(adminClient, { schema, logger: logSql });

export type Db = typeof db;
/** Tranzaksiya ichidagi db — `withTenant` callback'iga shu tur keladi. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TENANT IZOLYATSIYASI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Har qanday biznes ma'lumotiga tegadigan so'rov SHU funksiya orqali o'tadi.
 *
 * Ichida nima bo'ladi:
 *   1. Tranzaksiya ochiladi
 *   2. `app.business_id` sozlamasi o'rnatiladi (faqat shu tranzaksiya uchun)
 *   3. PostgreSQL RLS siyosati har bir SELECT/INSERT/UPDATE/DELETE ni
 *      avtomatik `business_id = app.business_id` bilan cheklaydi
 *   4. Tranzaksiya tugaydi, sozlama yo'qoladi
 *
 * Nega bu kerak: ilova kodida `WHERE business_id = ?` yozishni unutish —
 * eng oson va eng qimmat xato. RLS bo'lsa, unutish xavfli emas: baza
 * baribir begona qatorni qaytarmaydi.
 *
 * `SET LOCAL` ishlatilgani muhim — u tranzaksiya oxirida avtomatik bekor
 * bo'ladi va ulanish pulga qaytganda keyingi so'rovga sizib o'tmaydi.
 */
export async function withTenant<T>(
  businessId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!UUID_RE.test(businessId)) {
    // SQL injection emas (parametr sifatida uzatiladi), lekin noto'g'ri
    // qiymat RLS ni jim ravishda "hech narsa ko'rinmaydi" holatiga
    // o'tkazadi — buni xato sifatida ko'rsatgan ma'qul.
    throw new Error(`withTenant: business_id UUID emas: ${businessId}`);
  }

  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.business_id', ${businessId}, true)`);
    return fn(tx);
  });
}

/**
 * RLS ni chetlab o'tadigan operatsiyalar: cron ishlari (tunda barcha
 * bizneslarga hisobot), super-admin paneli, ro'yxatdan o'tish
 * (biznes hali mavjud emas — kontekst ham yo'q).
 *
 * Bu funksiya **boshqa ulanishdan** foydalanadi (egalik roli). Ya'ni
 * chetlab o'tish sessiya o'zgaruvchisi bilan emas, kredensial darajasida
 * amalga oshadi — SQL injection orqali uni yoqib bo'lmaydi.
 *
 * Ataylab noqulay nomlangan va sabab talab qiladi — kod ko'rigida
 * ko'zga tashlanishi uchun. Har bir chaqiruvda nega kerakligi yozilsin.
 */
export async function withoutTenantIsolation<T>(
  reason: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  if (!reason || reason.length < 10) {
    throw new Error('withoutTenantIsolation: sabab yozilishi shart');
  }
  return adminDb.transaction(async (tx) => fn(tx));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function closeDb(): Promise<void> {
  await Promise.all([
    queryClient.end({ timeout: 5 }),
    adminClient.end({ timeout: 5 }),
  ]);
}

export { schema };
