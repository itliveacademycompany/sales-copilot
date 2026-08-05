import { hash, verify } from '@node-rs/argon2';

/**
 * Parol xeshlash — argon2id.
 *
 * Nega bcrypt emas: bcrypt paroldan 72 baytdan keyingisini jim ravishda
 * tashlab yuboradi va GPU hujumlariga argon2 dan zaifroq. Argon2id 2015 yilgi
 * Password Hashing Competition g'olibi va hozirgi tavsiya etilgan standart.
 *
 * Parametrlar OWASP tavsiyasi bo'yicha (2024): 19 MiB xotira, 2 iteratsiya.
 * Xotira sig'imi hal qiluvchi omil — u hujumchining GPU'da parallel
 * hisoblash imkonini cheklaydi.
 */
// `algorithm` ko'rsatilmagan — @node-rs/argon2 da sukut bo'yicha Argon2id,
// ya'ni bizga kerakli variant. (Const enum'ni import qilish
// `verbatimModuleSyntax` bilan mumkin emas.)
const OPTIONS = {
  memoryCost: 19_456, // KiB = 19 MiB
  timeCost: 2,
  parallelism: 1,
} as const;

/** Parolning eng qisqa uzunligi. Uzunlik murakkablikdan muhimroq. */
export const MIN_PASSWORD_LENGTH = 10;

export async function hashPassword(plain: string): Promise<string> {
  if (plain.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Parol kamida ${MIN_PASSWORD_LENGTH} belgidan iborat bo'lishi kerak`);
  }
  return hash(plain, OPTIONS);
}

/**
 * Parolni tekshiradi.
 *
 * `storedHash` null bo'lsa ham **baribir xeshlash bajariladi**. Sabab:
 * aks holda javob vaqti "bunday foydalanuvchi bor/yo'q" ma'lumotini
 * oshkor qiladi (timing attack orqali email ro'yxatini yig'ish mumkin).
 */
export async function verifyPassword(
  storedHash: string | null,
  plain: string,
): Promise<boolean> {
  if (storedHash === null) {
    await hash(plain, OPTIONS); // vaqtni tenglashtirish uchun
    return false;
  }
  try {
    return await verify(storedHash, plain, OPTIONS);
  } catch {
    // Buzilgan yoki notanish formatdagi xesh
    return false;
  }
}
