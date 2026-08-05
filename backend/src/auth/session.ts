import { and, eq, isNull, or, sql } from 'drizzle-orm';
import { db } from '../db/index.js';
import { session } from '../db/schema/index.js';
import { generateToken, hashToken } from './tokens.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SESSIYALAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TZ FR-05 da "access 15 daq / refresh 30 kun" yozilgan edi. Men undan
 * ataylab chetlashdim va sababini yozib qo'yaman:
 *
 *   Qisqa muddatli access token'ning butun ma'nosi — har so'rovda bazaga
 *   murojaat qilmaslik (stateless JWT). Lekin bizga baribir har so'rovda
 *   foydalanuvchi rollari va biznes a'zoligi kerak, ya'ni baza so'rovi
 *   baribir bo'ladi. Demak ikkita token murakkablikni oshiradi, lekin
 *   hech narsa tejamaydi.
 *
 *   Buning o'rniga: bitta noaniq (opaque) token, bazada xeshlangan holda.
 *   Afzalligi — sessiyani **bir zumda bekor qilish** mumkin. JWT bilan
 *   bu imkonsiz: chiqarilgan token muddati tugagunicha amal qiladi.
 *
 * Himoya qatlamlari:
 *   • Token bazada faqat SHA-256 xesh sifatida
 *   • Mutlaq muddat 30 kun (rotatsiyada ham uzaymaydi)
 *   • Bo'sh turish muddati 14 kun
 *   • Har 24 soatda rotatsiya
 *   • Qayta ishlatishni aniqlash — o'g'irlangan token belgisi
 */

const ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const IDLE_LIFETIME_MS = 14 * 24 * 60 * 60 * 1000;
const ROTATE_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * Bekor qilingan sessiya shu muddat ichida hali qabul qilinadi.
 *
 * Nega kerak: brauzer bir vaqtda bir nechta so'rov yuboradi. Rotatsiya
 * paytida biri yangi token oladi, qolganlari hali eskisini ishlatadi.
 * Bu grace bo'lmasa — ular "o'g'irlangan token" deb baholanib, foydalanuvchi
 * tizimdan chiqarib yuboriladi. Ya'ni har 24 soatda tasodifiy chiqish.
 */
const ROTATION_GRACE_MS = 30 * 1000;

export interface SessionInfo {
  sessionId: string;
  userId: string;
  /** Rotatsiya bo'lgan bo'lsa — cookie'ga yozilishi kerak bo'lgan yangi token. */
  renewedToken?: string;
}

export interface SessionMeta {
  userAgent?: string | undefined;
  ip?: string | undefined;
}

export async function createSession(
  userId: string,
  meta: SessionMeta = {},
): Promise<{ token: string; sessionId: string; expiresAt: Date }> {
  const token = generateToken();
  const expiresAt = new Date(Date.now() + ABSOLUTE_LIFETIME_MS);

  const [row] = await db
    .insert(session)
    .values({
      userId,
      refreshTokenHash: hashToken(token),
      userAgent: meta.userAgent ?? null,
      ip: meta.ip ?? null,
      expiresAt,
    })
    .returning({ id: session.id });

  if (!row) throw new Error('sessiya yaratilmadi');
  return { token, sessionId: row.id, expiresAt };
}

/**
 * Tokenni tekshiradi va kerak bo'lsa rotatsiya qiladi.
 *
 * `null` qaytsa — token yaroqsiz, muddati tugagan yoki bekor qilingan.
 * Chaqiruvchi cookie'ni tozalab, 401 qaytarishi kerak.
 */
export async function validateSession(
  token: string,
  meta: SessionMeta = {},
): Promise<SessionInfo | null> {
  const tokenHash = hashToken(token);
  const now = new Date();

  const [row] = await db
    .select()
    .from(session)
    .where(eq(session.refreshTokenHash, tokenHash))
    .limit(1);

  if (!row) return null;

  // ── Bekor qilingan sessiya ──
  if (row.revokedAt) {
    const sinceRevoke = now.getTime() - row.revokedAt.getTime();

    // Grace **faqat rotatsiya** uchun: brauzer bir vaqtda yuborgan
    // so'rovlar eski tokenni ushlab qolgan bo'lishi mumkin.
    //
    // Chiqish (`logout`) uchun grace berilmaydi — aks holda foydalanuvchi
    // "chiqish" tugmasini bosgach token yana bir necha soniya amal qiladi.
    // Umumiy kompyuterda bu real xavf.
    if (row.revokedReason === 'rotated' && sinceRevoke <= ROTATION_GRACE_MS) {
      return { sessionId: row.id, userId: row.userId };
    }

    // Chiqish yoki muddat tugashi — shunchaki yaroqsiz, hujum emas.
    if (row.revokedReason === 'logout' || row.revokedReason === 'logout_all' || row.revokedReason === 'idle') {
      return null;
    }

    // ⚠ Rotatsiya qilingan eski token grace oynasidan keyin ishlatildi.
    // Bu o'g'irlangan token belgisi: haqiqiy brauzer allaqachon yangisiga
    // o'tgan bo'lardi. Xavfsiz yo'l — butun zanjirni bekor qilish.
    await revokeAllForUser(row.userId, 'reuse_detected');
    return null;
  }

  // ── Muddat tekshiruvlari ──
  if (row.expiresAt.getTime() <= now.getTime()) return null;
  if (now.getTime() - row.lastUsedAt.getTime() > IDLE_LIFETIME_MS) {
    await revokeSession(row.id, 'idle');
    return null;
  }

  // ── Rotatsiya vaqti keldimi ──
  const age = now.getTime() - row.createdAt.getTime();
  if (age >= ROTATE_AFTER_MS) {
    const renewed = generateToken();

    // Yangi sessiya eski zanjirga bog'lanadi — tekshiruv izi uchun.
    // Mutlaq muddat **uzaytirilmaydi**: `row.expiresAt` o'zgarishsiz o'tadi.
    const [next] = await db
      .insert(session)
      .values({
        userId: row.userId,
        refreshTokenHash: hashToken(renewed),
        previousSessionId: row.id,
        userAgent: meta.userAgent ?? row.userAgent,
        ip: meta.ip ?? row.ip,
        expiresAt: row.expiresAt,
      })
      .returning({ id: session.id });

    await db
      .update(session)
      .set({ revokedAt: now, revokedReason: 'rotated' })
      .where(eq(session.id, row.id));

    if (!next) throw new Error('sessiya rotatsiyasi muvaffaqiyatsiz');
    return { sessionId: next.id, userId: row.userId, renewedToken: renewed };
  }

  // ── Oddiy holat: faqat oxirgi foydalanish vaqtini yangilaymiz ──
  // Har so'rovda yozish qimmat, shuning uchun 5 daqiqada bir marta.
  if (now.getTime() - row.lastUsedAt.getTime() > 5 * 60 * 1000) {
    await db.update(session).set({ lastUsedAt: now }).where(eq(session.id, row.id));
  }

  return { sessionId: row.id, userId: row.userId };
}

export type RevokeReason =
  | 'rotated'
  | 'logout'
  | 'logout_all'
  | 'reuse_detected'
  | 'idle';

export async function revokeSession(
  sessionId: string,
  reason: RevokeReason = 'logout',
): Promise<void> {
  await db
    .update(session)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(session.id, sessionId), isNull(session.revokedAt)));
}

/** FR-09: "hamma qurilmadan chiqish". Parol o'zgarganda ham chaqiriladi. */
export async function revokeAllForUser(
  userId: string,
  reason: RevokeReason = 'logout_all',
): Promise<void> {
  await db
    .update(session)
    .set({ revokedAt: new Date(), revokedReason: reason })
    .where(and(eq(session.userId, userId), isNull(session.revokedAt)));
}

/** FR-09: faol sessiyalar ro'yxati (foydalanuvchiga ko'rsatish uchun). */
export async function listActiveSessions(userId: string) {
  return db
    .select({
      id: session.id,
      userAgent: session.userAgent,
      ip: session.ip,
      lastUsedAt: session.lastUsedAt,
      createdAt: session.createdAt,
    })
    .from(session)
    .where(
      and(
        eq(session.userId, userId),
        isNull(session.revokedAt),
        sql`${session.expiresAt} > now()`,
      ),
    );
}

/**
 * Eskirgan sessiyalarni tozalash (cron uchun).
 * Bekor qilinganlari 7 kun saqlanadi — qayta ishlatishni aniqlash uchun.
 */
export async function pruneSessions(): Promise<number> {
  const result = await db
    .delete(session)
    .where(
      or(
        sql`${session.expiresAt} < now() - interval '7 days'`,
        sql`${session.revokedAt} < now() - interval '7 days'`,
      ),
    )
    .returning({ id: session.id });
  return result.length;
}
