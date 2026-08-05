import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

// Sxema o'zgarishlari faqat egalik ulanishi orqali bajariladi.
const url = process.env.DATABASE_URL_ADMIN;

if (!url) {
  throw new Error(
    'DATABASE_URL_ADMIN topilmadi. .env.example dan .env yarating va ulanish satrini kiriting.',
  );
}

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
  verbose: true,
  strict: true,
});
