/**
 * PostgreSQL xatolarini ishonchli aniqlash.
 *
 * Drizzle xatoni `DrizzleQueryError` ichiga o'raydi va tashqi `message`
 * faqat "Failed query: ..." bo'ladi — cheklov nomi u yerda yo'q. Shuning
 * uchun `String(err).includes('...')` ishlamaydi (bu xatoni test tutdi).
 *
 * To'g'ri yo'l: `cause` zanjiri bo'ylab yurib, postgres xato kodini topish.
 */

/** postgres.js xato obyekti (bizga kerakli qismi). */
interface PgError {
  code?: string;
  constraint_name?: string;
  detail?: string;
  table_name?: string;
}

function findPgError(err: unknown, depth = 0): PgError | null {
  if (depth > 5 || err === null || typeof err !== 'object') return null;

  const candidate = err as PgError & { cause?: unknown };
  if (typeof candidate.code === 'string' && /^\d{5}$/.test(candidate.code)) {
    return candidate;
  }
  return findPgError(candidate.cause, depth + 1);
}

/** 23505 — unique_violation. Cheklov nomi berilsa, aynan o'sha tekshiriladi. */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const pg = findPgError(err);
  if (pg?.code !== '23505') return false;
  return constraint ? pg.constraint_name === constraint : true;
}

/** 23503 — foreign_key_violation. Mavjud bo'lmagan bo'lim/foydalanuvchi ko'rsatilganda. */
export function isForeignKeyViolation(err: unknown, constraint?: string): boolean {
  const pg = findPgError(err);
  if (pg?.code !== '23503') return false;
  return constraint ? pg.constraint_name === constraint : true;
}

/** 23514 — check_violation. Masalan isbotsiz ball yozishga urinish. */
export function isCheckViolation(err: unknown, constraint?: string): boolean {
  const pg = findPgError(err);
  if (pg?.code !== '23514') return false;
  return constraint ? pg.constraint_name === constraint : true;
}

/** Nosozlikni tekshirishda foydali — qaysi cheklov buzilgani. */
export function violatedConstraint(err: unknown): string | null {
  return findPgError(err)?.constraint_name ?? null;
}
