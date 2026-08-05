/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 0-BOSQICH: PRE-FILTER — LLM'siz, deyarli bepul
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TZ 3.5: qo'ng'iroqlarda 50-55% shu yerda to'xtaydi. Telegram'da nisbat
 * boshqacha, lekin printsip bir xil: LLM'ga arzimaydigan sessiyani
 * yubormaslik — bu to'g'ridan-to'g'ri pul.
 *
 * Qoidalar ATAYLAB konservativ. Shubhali holat o'tkaziladi — noto'g'ri
 * chiqarib tashlangan muhim suhbat, noto'g'ri tahlil qilingan spamdan
 * qimmatroq xato. Xususan, mijoz yozib javob olmagan sessiya FILTRLANMAYDI:
 * "javobsiz lid" — rahbar ko'rishi kerak bo'lgan eng muhim signal.
 */

export interface PrefilterSegment {
  speaker: string;
  text: string;
}

export interface PrefilterResult {
  pass: boolean;
  reason?: string;
}

/** /start, /help kabi bot buyruqlari — suhbat emas. */
const COMMAND_RE = /^\/\w+(@\w+)?$/;

const MIN_MEANINGFUL_CHARS = 15;

export function prefilterTelegramSession(segments: PrefilterSegment[]): PrefilterResult {
  if (segments.length === 0) {
    return { pass: false, reason: 'bo\'sh sessiya' };
  }

  const meaningful = segments.filter((s) => !COMMAND_RE.test(s.text.trim()));
  if (meaningful.length === 0) {
    return { pass: false, reason: 'faqat bot buyruqlari' };
  }

  const totalChars = meaningful.reduce((sum, s) => sum + s.text.trim().length, 0);
  if (totalChars < MIN_MEANINGFUL_CHARS) {
    return { pass: false, reason: 'juda qisqa (salomlashishgacha yetmagan)' };
  }

  // Faqat menejer yozgan va mijoz umuman javob bermagan — baholaydigan
  // narsa yo'q (sovuq xabar). Aksincha holat (mijoz yozgan, menejer jim)
  // ATAYLAB o'tkaziladi: bu javobsiz lid, eng qimmat signal.
  const hasClient = meaningful.some((s) => s.speaker === 'client');
  if (!hasClient) {
    return { pass: false, reason: 'mijoz javob bermagan (faqat menejer xabarlari)' };
  }

  return { pass: true };
}
