import { config } from '../config.js';

/**
 * STT jarayonini PAST protsessor ustuvorligida ishga tushirish uchun buyruq.
 *
 * GigaAM (torch, CPU) barcha yadrolarni egallaydi va Postgres hamda API bilan
 * bitta serverda turadi. Teng ustuvorlikda transkripsiya paytida bazaga
 * so'rovlar sekinlashib, ulanish puli to'lib qolardi va sayt butunlay
 * "yuklanmoqda"da osilardi. `nice` bilan STT faqat bo'sh protsessorni oladi.
 *
 * `nice` buyruqni o'z o'rniga `exec` qiladi — PID python'niki bo'lib qoladi,
 * shuning uchun `kill()` va `exit` hodisalari avvalgidek ishlaydi. torch
 * oqimlari (va python ichidan chaqirilgan ffmpeg) ustuvorlikni meros oladi.
 * Faqat Linux'da (server); Windows/macOS ishlab chiqishda buyruq o'zgarmaydi.
 */
export function pastUstuvorlikda(buyruq: string, argumentlar: string[]): [string, string[]] {
  if (process.platform !== 'linux' || config.STT_NICE <= 0) return [buyruq, argumentlar];
  return ['nice', ['-n', String(config.STT_NICE), buyruq, ...argumentlar]];
}
