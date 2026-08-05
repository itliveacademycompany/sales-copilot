import 'dotenv/config';
import { eq } from 'drizzle-orm';
import { closeDb, withoutTenantIsolation } from './index.js';
import { appUser } from './schema/index.js';

/**
 * Foydalanuvchiga super-admin huquqini berish.
 *
 *   npm run admin:grant -- abdulla@example.com
 *   npm run admin:grant -- abdulla@example.com --revoke
 *
 * Birinchi super-admin faqat shu skript orqali yaratiladi — API orqali
 * emas. Sabab: super-admin berish endpointi bo'lsa, u eng qimmatli
 * hujum nishoniga aylanadi. Terminaldan (ya'ni serverga kirish huquqi
 * bilan) qilinadigan amal ancha xavfsiz.
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'))?.trim().toLowerCase();
  const revoke = args.includes('--revoke');

  if (!email) {
    console.error('\nFoydalanish: npm run admin:grant -- email@example.com [--revoke]\n');
    process.exit(1);
  }

  const [user] = await withoutTenantIsolation(
    'super-admin huquqini berish: app_user tenant jadvali emas',
    (tx) =>
      tx
        .update(appUser)
        .set({ systemRole: revoke ? 'business_owner' : 'super_admin', updatedAt: new Date() })
        .where(eq(appUser.email, email))
        .returning({
          id: appUser.id,
          email: appUser.email,
          displayName: appUser.displayName,
          systemRole: appUser.systemRole,
        }),
  );

  if (!user) {
    console.error(`\nBunday email topilmadi: ${email}`);
    console.error('Avval ro\'yxatdan o\'ting, keyin bu buyruqni ishlating.\n');
    process.exitCode = 1;
    return;
  }

  console.log(
    `\n${user.displayName} <${user.email}> → ${user.systemRole}\n` +
      (revoke ? 'Super-admin huquqi olib tashlandi.\n' : 'Super-admin huquqi berildi.\n'),
  );
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
