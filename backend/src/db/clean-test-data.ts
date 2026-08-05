/**
 * Test ma'lumotlarini tozalash.
 *
 * `verify:*` skriptlari haqiqiy ro'yxatdan o'tish oqimidan foydalanadi —
 * ya'ni har yurgizishda yangi foydalanuvchi va yangi biznes yaratiladi.
 * Bir nechta skript o'zidan keyin tozalamagani uchun dev bazasi
 * o'nlab "IT Live Academy" va "Pipeline Test" bizneslari bilan to'lib
 * ketgan edi va haqiqiy demo ma'lumotini topish qiyinlashgan.
 *
 * Ikkita ishlatish usuli bor:
 *
 *   1. Skript ichidan, `finally` blokida:
 *        await cleanupTestData(tag);
 *
 *   2. CLI orqali — qolib ketgan hamma narsani supurish:
 *        npm run db:clean-test
 *
 * `business_id` ga bog'langan barcha FK'lar `on delete cascade` bo'lgani
 * uchun biznesni o'chirish suhbat, tahlil, vazifa, ogohlantirish va
 * billing yozuvlarini ham olib ketadi — ularni alohida sanab o'tirish
 * shart emas (va sanab o'tirish yangi jadval qo'shilganda eskiradi).
 */
import { pathToFileURL } from 'node:url';
import { inArray, like, sql } from 'drizzle-orm';
import { appUser, business, businessMember } from './schema/index.js';
import { closeDb, withoutTenantIsolation } from './index.js';

/** Test hisoblari doim shu domendan foydalanadi. */
export const TEST_EMAIL_DOMAIN = '@test.local';

export type CleanupResult = {
  users: number;
  businesses: number;
};

/**
 * Berilgan email naqshiga mos test foydalanuvchilarini va ular a'zo
 * bo'lgan bizneslarni o'chiradi.
 *
 * @param emailLike SQL `like` naqshi, masalan `%ms8z8e5x@test.local`.
 *                  Naqsh `@test.local` bilan tugamasa — xato beriladi,
 *                  chunki bu haqiqiy mijoz ma'lumotini o'chirish xavfi.
 */
export async function cleanupTestData(emailLike: string): Promise<CleanupResult> {
  if (!emailLike.endsWith(TEST_EMAIL_DOMAIN)) {
    throw new Error(
      `cleanupTestData: naqsh "${TEST_EMAIL_DOMAIN}" bilan tugashi shart, berilgani: ${emailLike}`,
    );
  }

  return withoutTenantIsolation('test tozalash: sinov tenantlarini o\'chirish', async (tx) => {
    const users = await tx.select({ id: appUser.id }).from(appUser).where(like(appUser.email, emailLike));
    if (users.length === 0) return { users: 0, businesses: 0 };

    const userIds = users.map((u) => u.id);

    const memberships = await tx
      .select({ businessId: businessMember.businessId })
      .from(businessMember)
      .where(inArray(businessMember.userId, userIds));

    const businessIds = [...new Set(memberships.map((m) => m.businessId))];

    // Biznes avval o'chiriladi: uning ostidagi hamma narsa cascade bilan
    // ketadi. Foydalanuvchini avval o'chirsak, biznes egasiz qolardi.
    if (businessIds.length > 0) {
      await tx.delete(business).where(inArray(business.id, businessIds));
    }
    await tx.delete(appUser).where(inArray(appUser.id, userIds));

    return { users: userIds.length, businesses: businessIds.length };
  });
}

/**
 * Skript `finally` blokida chaqirish uchun — tozalash muvaffaqiyatsiz
 * bo'lsa ham testning o'z natijasini yashirmaydi.
 *
 * Sabab: tozalash test mantig'ining bir qismi emas. U yiqilib tushsa,
 * ekranda "N ta tekshiruv o'tdi" o'rniga tozalash xatosi turib qolardi
 * va nima bo'lganini tushunish qiyinlashardi.
 */
export async function cleanupTestDataQuietly(emailLike: string): Promise<void> {
  try {
    await cleanupTestData(emailLike);
  } catch (err) {
    console.warn(`\n[tozalash o'tmadi — baza shovqinli qolishi mumkin] ${String(err)}`);
  }
}

/**
 * A'zosi umuman qolmagan bizneslarni o'chiradi.
 *
 * Bunday qatorlar eski, nuqsonli tozalash mantig'idan qolgan: skript
 * foydalanuvchini o'chirardi, biznesni esa slug naqshi bo'yicha qidirardi
 * va topa olmasdi. A'zosi yo'q biznesga hech kim kira olmaydi — u
 * interfeys orqali ham, API orqali ham erishib bo'lmaydigan chiqindi.
 *
 * Ataylab CLI'ga cheklangan: testlar orasida ishlatilsa, boshqa parallel
 * skript hali a'zo qo'shishga ulgurmagan biznesni o'chirib yuborishi
 * mumkin edi.
 */
export async function cleanupOrphanBusinesses(): Promise<number> {
  return withoutTenantIsolation('test tozalash: a\'zosiz bizneslarni o\'chirish', async (tx) => {
    const deleted = await tx
      .delete(business)
      .where(
        sql`not exists (select 1 from business_member m where m.business_id = ${business.id})`,
      )
      .returning({ id: business.id });
    return deleted.length;
  });
}

/** CLI: qolib ketgan barcha test tenantlarini supuradi. */
async function main(): Promise<void> {
  const result = await cleanupTestData(`%${TEST_EMAIL_DOMAIN}`);
  const orphans = await cleanupOrphanBusinesses();
  console.log(
    `\nTozalandi: ${result.businesses} ta test biznesi, ${result.users} ta test foydalanuvchi, ` +
      `${orphans} ta a'zosiz biznes.\n`,
  );
  await closeDb();
}

// CLI rejimi faqat fayl to'g'ridan-to'g'ri ishga tushirilganda.
// Verify skriptlari uni import qilganda main() ishlamasligi kerak.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
