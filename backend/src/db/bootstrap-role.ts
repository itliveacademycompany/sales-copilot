import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ILOVA ROLINI YARATISH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run db:bootstrap
 *
 * NEGA BU KERAK
 *   PostgreSQL'da **superuser RLS ni har doim chetlab o'tadi** — hatto
 *   `FORCE ROW LEVEL SECURITY` bo'lsa ham. Jadval egasi ham FORCE'siz
 *   chetlab o'tadi.
 *
 *   Demak ilova `postgres` (superuser) ostida ulansa, barcha RLS siyosatlari
 *   o'rnatilgan bo'lsa ham **umuman ishlamaydi**. Bu jim ravishda sodir
 *   bo'ladi: hech qanday xato yo'q, tekshiruvlar "himoyalangan" deydi.
 *
 *   Shuning uchun ikkita ulanish bo'ladi:
 *     DATABASE_URL        → sotuv_app   (superuser EMAS, RLS unga qo'llanadi)
 *     DATABASE_URL_ADMIN  → postgres    (migratsiya, cron, super-admin)
 *
 * Skript idempotent: qayta ishga tushirilsa parolni yangilaydi.
 */

const APP_ROLE = 'sotuv_app';

async function main(): Promise<void> {
  // Bu skript to'liq config'ni yuklamaydi: u ishlaganda DATABASE_URL hali
  // bo'sh bo'ladi (aynan shu skript uni to'ldiradi).
  const adminUrl = process.env.DATABASE_URL_ADMIN;
  if (!adminUrl) {
    throw new Error('DATABASE_URL_ADMIN sozlanmagan (.env)');
  }

  const dbName = decodeURIComponent(new URL(adminUrl).pathname.replace(/^\//, ''));
  const password = randomBytes(24).toString('base64url');

  const sql = postgres(adminUrl, { max: 1 });

  try {
    // ── Rol ──
    const exists = await sql<{ rolname: string }[]>`
      SELECT rolname FROM pg_roles WHERE rolname = ${APP_ROLE}
    `;

    if (exists.length === 0) {
      await sql.unsafe(
        `CREATE ROLE "${APP_ROLE}" LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
      );
      console.log(`Rol "${APP_ROLE}" yaratildi.`);
    } else {
      await sql.unsafe(
        `ALTER ROLE "${APP_ROLE}" WITH LOGIN PASSWORD ${literal(password)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS`,
      );
      console.log(`Rol "${APP_ROLE}" mavjud edi — paroli yangilandi.`);
    }

    // ── Huquqlar ──
    // Ataylab faqat DML. DDL (CREATE/ALTER/DROP TABLE) ilovaga berilmaydi —
    // sxemani faqat migratsiya o'zgartiradi.
    await sql.unsafe(`GRANT CONNECT ON DATABASE "${dbName}" TO "${APP_ROLE}"`);
    await sql.unsafe(`GRANT USAGE ON SCHEMA public TO "${APP_ROLE}"`);
    await sql.unsafe(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO "${APP_ROLE}"`,
    );
    await sql.unsafe(
      `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO "${APP_ROLE}"`,
    );

    // Kelajakda migratsiya yaratadigan jadvallar ham avtomatik qamraladi.
    await sql.unsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO "${APP_ROLE}"`,
    );
    await sql.unsafe(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO "${APP_ROLE}"`,
    );
    console.log('Huquqlar berildi (faqat DML, DDL emas).');

    // ── Tekshiruv ──
    const [role] = await sql<{ rolsuper: boolean; rolbypassrls: boolean }[]>`
      SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname = ${APP_ROLE}
    `;
    if (role?.rolsuper || role?.rolbypassrls) {
      throw new Error(
        `"${APP_ROLE}" hali ham RLS ni chetlab o'tadi (super=${role.rolsuper}, bypass=${role.rolbypassrls})`,
      );
    }
    console.log('Tekshirildi: rol superuser emas va RLS ni chetlab o\'tmaydi.');

    // ── .env ni yangilash ──
    const url = new URL(adminUrl);
    url.username = APP_ROLE;
    url.password = password;

    const envPath = resolve(process.cwd(), '.env');
    let env = await readFile(envPath, 'utf8');
    env = env.replace(/^DATABASE_URL=.*$/m, `DATABASE_URL=${url.toString()}`);
    await writeFile(envPath, env);
    console.log('.env dagi DATABASE_URL ilova roliga o\'tkazildi.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

/** SQL satr literali — parol parametr sifatida uzatilmaydi (DDL cheklovi). */
function literal(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

main().catch((err: unknown) => {
  console.error(`\nXato: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
