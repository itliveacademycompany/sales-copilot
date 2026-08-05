import 'dotenv/config';
import postgres from 'postgres';

/**
 * `DATABASE_URL` da ko'rsatilgan bazani yaratadi (agar hali yo'q bo'lsa).
 *
 * `CREATE DATABASE` tranzaksiya ichida ishlamaydi va mavjud bazaga ulanishni
 * talab qiladi, shuning uchun avval xizmat bazasi `postgres` ga ulanamiz.
 *
 * Ishga tushirish: npm run db:create
 */
async function main(): Promise<void> {
  // To'liq config yuklanmaydi: baza hali yaratilmagan, DATABASE_URL bo'sh.
  const adminUrl = process.env.DATABASE_URL_ADMIN;
  if (!adminUrl) {
    throw new Error('DATABASE_URL_ADMIN sozlanmagan (.env)');
  }
  const url = new URL(adminUrl);
  const target = decodeURIComponent(url.pathname.replace(/^\//, ''));

  if (!target) {
    throw new Error('DATABASE_URL_ADMIN da baza nomi ko\'rsatilmagan');
  }

  // `CREATE DATABASE` mavjud bazaga ulanishni talab qiladi — xizmat
  // bazasi `postgres` ga ulanamiz.
  const maintenanceUrl = new URL(url.toString());
  maintenanceUrl.pathname = '/postgres';

  const sql = postgres(maintenanceUrl.toString(), { max: 1 });

  try {
    const existing = await sql<{ datname: string }[]>`
      SELECT datname FROM pg_database WHERE datname = ${target}
    `;

    if (existing.length > 0) {
      console.log(`Baza "${target}" allaqachon mavjud.`);
      return;
    }

    // Identifikator parametr sifatida uzatilmaydi, shuning uchun qo'lda
    // tekshiramiz va qo'shtirnoq bilan o'raymiz.
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(target)) {
      throw new Error(`Baza nomi xavfsiz emas: ${target}`);
    }

    await sql.unsafe(`CREATE DATABASE "${target}" ENCODING 'UTF8'`);
    console.log(`Baza "${target}" yaratildi.`);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`\nXato: ${msg}\n`);
  if (msg.includes('password') || msg.includes('authentication')) {
    console.error(
      '.env dagi DATABASE_URL_ADMIN ichidagi parolni tekshiring:\n' +
        '  DATABASE_URL_ADMIN=postgresql://postgres:PAROL@localhost:5432/sotuv\n',
    );
  }
  process.exit(1);
});
