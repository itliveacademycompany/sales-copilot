import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Sessiya tokenlari.
 *
 * Token **hech qachon ochiq holda saqlanmaydi** — bazada faqat SHA-256
 * xeshi turadi. Ya'ni baza zaxira nusxasi o'g'irlansa ham, undagi
 * qiymatlar bilan tizimga kirib bo'lmaydi.
 *
 * Nega argon2 emas, SHA-256: token 32 bayt tasodifiy ma'lumot (256 bit
 * entropiya). Uni lug'at bo'yicha topib bo'lmaydi, shuning uchun sekin
 * xeshlash kerak emas. Parol bilan farqi shunda.
 */

const TOKEN_BYTES = 32;

export function generateToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Doimiy vaqtli taqqoslash.
 *
 * Oddiy `===` birinchi farqda to'xtaydi va shu orqali tokenni bayt-bayt
 * topish mumkin. Bu yerda amalda bazadan xesh bo'yicha qidiramiz, lekin
 * qo'shimcha taqqoslash kerak bo'lgan joylar uchun turadi.
 */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** Bir martalik aktivatsiya/tiklash kodlari uchun (FR-04, FR-06). */
export function generateShortCode(): string {
  // 6 xonali raqam — SMS/Telegram orqali yuborish uchun qulay.
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
}
