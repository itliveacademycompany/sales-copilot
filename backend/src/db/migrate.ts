import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Migratsiya oqimi:
 *   1. Drizzle generatsiya qilgan SQL migratsiyalari (`drizzle/` papkasi)
 *   2. RLS siyosatlari (`rls.sql`) — idempotent, har safar qayta qo'llanadi
 *
 * 2-qadam alohida turadi, chunki drizzle-kit RLS siyosatlarini generatsiya
 * qilmaydi va biz ularni sxema o'zgarganda avtomatik yangilashimiz kerak.
 */
async function main(): Promise<void> {
  const client = postgres(config.DATABASE_URL_ADMIN, { max: 1 });

  try {
    console.log('→ Migratsiyalar qo\'llanmoqda...');
    await migrate(drizzle(client), {
      migrationsFolder: resolve(here, '../../drizzle'),
    });
    console.log('  migratsiyalar tayyor');

    console.log('→ RLS siyosatlari qo\'llanmoqda...');
    const rls = await readFile(resolve(here, 'rls.sql'), 'utf8');
    await client.unsafe(rls);
    console.log('  RLS tayyor');

    await verifyRls(client);
    console.log('\nTugadi.');
  } finally {
    await client.end({ timeout: 5 });
  }
}

/**
 * Ishonch uchun tekshiruv: RLS haqiqatan yoqilganmi va FORCE qilinganmi.
 *
 * Bu tekshiruv bejiz emas — `ENABLE ROW LEVEL SECURITY` ni yozib, `FORCE`
 * ni unutish juda oson va natijada himoya yoqilgandek ko'rinadi, lekin
 * jadval egasi (ya'ni bizning ilova) uchun umuman ishlamaydi.
 */
async function verifyRls(client: postgres.Sql): Promise<void> {
  const rows = await client<{ tablename: string; rls: boolean; forced: boolean }[]>`
    SELECT c.relname   AS tablename,
           c.relrowsecurity  AS rls,
           c.relforcerowsecurity AS forced
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      -- Ataylab RLS'siz jadvallar (izohi rls.sql oxirida):
      --   app_user, session          — foydalanuvchiga tegishli, biznesga emas
      --   playbook_template          — umumiy shablonlar kutubxonasi
      --   ai_provider, platform_setting — platforma darajasi, super-admin
      --   prompt_template            — platforma darajasidagi prompt versiyalari (FR-88)
      AND c.relname NOT IN (
        'app_user', 'session', 'playbook_template',
        'ai_provider', 'platform_setting', 'prompt_template',
        '__drizzle_migrations'
      )
    ORDER BY c.relname
  `;

  const bad = rows.filter((r) => !r.rls || !r.forced);
  if (bad.length > 0) {
    console.error('\n RLS TO\'LIQ EMAS:');
    for (const r of bad) {
      console.error(`   ${r.tablename}: enabled=${r.rls} forced=${r.forced}`);
    }
    process.exitCode = 1;
    return;
  }
  console.log(`  RLS tekshirildi: ${rows.length} jadval himoyalangan`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
