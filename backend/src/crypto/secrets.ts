import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIRLARNI SHIFRLASH — AES-256-GCM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bazada saqlanadigan har qanday sir shu yerdan o'tadi: LLM API kalitlari,
 * CRM OAuth tokenlari, telefoniya parollari, Telegram sessiyalari.
 *
 * NEGA SHIFRLASH KERAK
 *   Kalit `CREDENTIALS_KEY` env o'zgaruvchisida turadi va bazada
 *   HECH QACHON saqlanmaydi. Demak baza zaxira nusxasi o'g'irlansa
 *   (eng keng tarqalgan sizib chiqish yo'li), undagi sirlar ochilmaydi —
 *   hujumchiga alohida serverga kirish ham kerak bo'ladi.
 *
 * NEGA GCM (CBC emas)
 *   GCM autentifikatsiyalangan shifrlash: matn o'zgartirilsa, ochishda
 *   xato beradi. CBC bunday himoyani bermaydi — hujumchi shifrlangan
 *   matnni jimgina o'zgartira oladi.
 *
 * FORMAT
 *   [ 1 bayt versiya ][ 12 bayt IV ][ 16 bayt auth tag ][ shifrlangan matn ]
 *
 *   Versiya bayti kalitni almashtirish (rotation) uchun: kelajakda v2
 *   qo'shsak, eski yozuvlarni ham o'qiy olamiz.
 */

const VERSION = 1;
const IV_LENGTH = 12; // GCM uchun tavsiya etilgan uzunlik
const TAG_LENGTH = 16;

function key(): Buffer {
  // config allaqachon 32 bayt ekanini tekshirgan.
  return Buffer.from(config.CREDENTIALS_KEY, 'base64');
}

export function encryptSecret(plain: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);

  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([Buffer.from([VERSION]), iv, tag, encrypted]);
}

export function decryptSecret(payload: Buffer): string {
  if (payload.length < 1 + IV_LENGTH + TAG_LENGTH) {
    throw new Error('Shifrlangan ma\'lumot buzilgan: juda qisqa');
  }

  const version = payload[0];
  if (version !== VERSION) {
    throw new Error(`Noma'lum shifrlash versiyasi: ${version}`);
  }

  const iv = payload.subarray(1, 1 + IV_LENGTH);
  const tag = payload.subarray(1 + IV_LENGTH, 1 + IV_LENGTH + TAG_LENGTH);
  const encrypted = payload.subarray(1 + IV_LENGTH + TAG_LENGTH);

  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);

  // Matn yoki tag o'zgartirilgan bo'lsa, `final()` xato beradi.
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * Sirni interfeysda ko'rsatish uchun niqob: `sk-ant-…4f2a`.
 *
 * To'liq kalitni HECH QACHON qaytarmaymiz — hatto egaga ham. Bir marta
 * kiritilgandan keyin uni faqat almashtirish mumkin, ko'rish emas.
 * Bu tasodifiy ekran ko'rsatish (screen sharing) paytida sizib chiqishning
 * oldini oladi.
 */
export function maskSecret(plain: string): string {
  if (plain.length <= 12) return '••••••••';
  return `${plain.slice(0, 7)}…${plain.slice(-4)}`;
}

/** Webhook imzolarini tekshirish uchun — doimiy vaqtli taqqoslash. */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
