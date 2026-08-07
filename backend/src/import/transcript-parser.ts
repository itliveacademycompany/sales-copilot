/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QO'LDA YUKLANGAN TRANSKRIPTNI SEGMENTLARGA BO'LISH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Maqsad: Telegram'ni kutmasdan haqiqiy suhbatni tizimga berib, baholash
 * to'g'ri ishlayotganini tekshirish.
 *
 * Kirish — odam qo'lda joylashtirgan matn. Ya'ni u toza emas: qatorlar
 * turlicha belgilanadi, vaqt belgilari bo'lishi yoki bo'lmasligi mumkin,
 * bitta gap ikki qatorga bo'linib ketadi. Parser shularning hammasiga
 * bardosh berishi kerak, chunki foydalanuvchini "to'g'ri formatda yozing"
 * deb qiynash — sinov vositasining ma'nosini yo'qotadi.
 *
 * Qo'llab-quvvatlanadigan shakllar:
 *
 *   Mijoz: Salom, narxi qancha?
 *   Menejer: Assalomu alaykum! Qaysi yo'nalish qiziqtiryapti?
 *   [10:05] Mijoz: Frontend
 *   14:32 Sotuvchi: Tushunarli
 *   - Client: how much does it cost?
 *   Клиент: сколько стоит?
 *
 * Prefiksi yo'q qator — oldingi xabarning davomi deb hisoblanadi.
 * Bu ataylab: uzun gap ko'chirilganda qatorlarga bo'linib ketadi va
 * har bo'lakni alohida xabar deb hisoblash suhbat dinamikasini
 * (javob tezligi, navbatlar soni) buzib yuborardi.
 */

export type ParsedSpeaker = 'manager' | 'client';

export interface ParsedSegment {
  speaker: ParsedSpeaker;
  text: string;
  /** Matnda vaqt belgisi bo'lsa — kundagi soniyalar. Bo'lmasa null. */
  clockSeconds: number | null;
}

export interface ParseResult {
  segments: ParsedSegment[];
  /** Foydalanuvchiga ko'rsatiladigan ogohlantirishlar — xato emas. */
  warnings: string[];
}

/**
 * Rol nomlari. Ro'yxat ataylab keng: mijoz o'z yozishmasini qanday
 * ko'chirgan bo'lsa, shunday tushunilsin.
 */
const MANAGER_LABELS = [
  'menejer',
  'manager',
  'sotuvchi',
  'operator',
  'admin',
  'менеджер',
  'продавец',
  'оператор',
  'me',
  'men',
];

const CLIENT_LABELS = [
  'mijoz',
  'client',
  'customer',
  'клиент',
  'покупатель',
  'lead',
  'xaridor',
];

/**
 * Qator boshidagi bezaklarni olib tashlaydi: `- `, `* `, `> `, `1. `.
 * Ko'chirishda ro'yxat belgilari tez-tez qo'shilib qoladi.
 */
function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*>•]|\d+[.)])\s+/, '');
}

/**
 * `[10:05]`, `10:05`, `(10:05:33)` shakllarini ajratadi.
 * @returns qolgan matn va soniyalar (topilmasa null)
 */
function extractClock(line: string): { rest: string; clockSeconds: number | null } {
  const m = /^\s*[[(]?(\d{1,2}):(\d{2})(?::(\d{2}))?[\])]?\s*[-–—]?\s*/.exec(line);
  if (!m) return { rest: line, clockSeconds: null };

  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] === undefined ? 0 : Number(m[3]);
  // 25:70 kabi qiymat vaqt emas — ehtimol boshqa raqam. Tegmaymiz.
  if (h > 23 || min > 59 || s > 59) return { rest: line, clockSeconds: null };

  return { rest: line.slice(m[0].length), clockSeconds: h * 3600 + min * 60 + s };
}

/** `Mijoz:` prefiksini aniqlaydi. */
function extractSpeaker(line: string): { rest: string; speaker: ParsedSpeaker } | null {
  const m = /^\s*([\p{L}\s.]{1,24}?)\s*[:：]\s*/u.exec(line);
  if (!m) return null;

  const label = m[1]!.trim().toLowerCase().replace(/\s+/g, ' ');
  const rest = line.slice(m[0].length);

  if (MANAGER_LABELS.includes(label)) return { rest, speaker: 'manager' };
  if (CLIENT_LABELS.includes(label)) return { rest, speaker: 'client' };

  // Ism bilan yozilgan bo'lishi mumkin ("Malika:"), lekin uni rolga
  // aylantira olmaymiz — noto'g'ri taxmin butun tahlilni teskari qiladi
  // (FR-84). Shuning uchun tanimagan yorliqni prefiks deb hisoblamaymiz.
  return null;
}

export function parseTranscript(raw: string): ParseResult {
  const warnings: string[] = [];
  const segments: ParsedSegment[] = [];

  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  let tanilmaganYorliq = 0;

  for (const original of lines) {
    const line = stripBullet(original);
    if (line.trim().length === 0) continue;

    /**
     * Vaqt belgisi yorliqdan oldin ham, keyin ham kelishi mumkin:
     *   [10:05] Mijoz: ...        Mijoz: 10:05 ...
     * Shuning uchun ikkala tomondan ham qidiriladi. Ilgari faqat
     * oldingisi tekshirilardi va "Mijoz: 14:32 Salom" da vaqt matn
     * ichida qolib ketardi.
     */
    const oldin = extractClock(line);
    const speakerHit = extractSpeaker(oldin.rest);

    if (speakerHit) {
      const keyin = extractClock(speakerHit.rest);
      const text = keyin.rest.trim();
      if (text.length === 0) continue; // "Mijoz:" bo'sh qator — tashlab ketamiz
      segments.push({
        speaker: speakerHit.speaker,
        text,
        clockSeconds: oldin.clockSeconds ?? keyin.clockSeconds,
      });
      continue;
    }

    // Prefiksi yo'q — oldingi xabarning davomi.
    const last = segments[segments.length - 1];
    if (last) {
      last.text = `${last.text} ${line.trim()}`.trim();
    } else if (line.includes(':')) {
      // Birinchi qator ham tanilmagan yorliq bilan boshlangan.
      tanilmaganYorliq++;
    }
  }

  if (tanilmaganYorliq > 0) {
    warnings.push(
      'Ba\'zi qatorlarda tanilmagan yorliq bor. Rollarni "Mijoz:" va "Menejer:" ' +
        'deb belgilang — aks holda kim gapirgani noto\'g\'ri aniqlanadi.',
    );
  }

  if (segments.length > 0 && !segments.some((s) => s.speaker === 'manager')) {
    warnings.push('Menejer xabari topilmadi — baholash uchun kamida bittasi kerak.');
  }
  if (segments.length > 0 && !segments.some((s) => s.speaker === 'client')) {
    warnings.push('Mijoz xabari topilmadi.');
  }

  return { segments, warnings };
}

/**
 * STT natijasini transkript MATNIGA aylantiradi.
 *
 * Nega matnga, to'g'ridan-to'g'ri segmentlarga emas: audio yo'li shu
 * bilan matn yo'lining ustiga tushadi va **bitta yo'l** qoladi —
 * o'sha parser, o'sha saqlash, o'sha testlar. Ikkita alohida yo'l
 * bo'lsa, biri tuzatilganda ikkinchisi eskirib qolardi.
 *
 * `managerTag` — odam tanlagan so'zlovchi. Uni bu yerda taxmin
 * qilmaymiz (FR-84): diarizatsiya "1 va 2" deb ajratadi, lekin
 * qaysi biri menejer ekanini bilmaydi va noto'g'ri taxmin butun
 * tahlilni teskari qiladi.
 */
export function utterancesToTranscript(
  utterances: { speakerTag: number; text: string; startSeconds: number }[],
  managerTag: number,
): string {
  return utterances
    .map((u) => {
      const rol = u.speakerTag === managerTag ? 'Menejer' : 'Mijoz';
      const jami = Math.max(0, Math.round(u.startSeconds));
      const mm = String(Math.floor(jami / 60)).padStart(2, '0');
      const ss = String(jami % 60).padStart(2, '0');
      // Vaqt belgisi yozuv boshidan hisoblanadi (00:00 dan), ya'ni
      // `assignOffsets` uni to'g'ri o'qiydi va javob tezligi haqiqiy
      // audio vaqtiga tayanadi.
      return `[${mm}:${ss}] ${rol}: ${u.text.trim()}`;
    })
    .filter((l) => !/^\[\d{2}:\d{2}\] (Menejer|Mijoz):\s*$/.test(l))
    .join('\n');
}

/**
 * Segmentlarga suhbat boshidan hisoblangan soniyalarni beradi.
 *
 * Vaqt belgilari bo'lsa — ulardan (yarim tundan o'tish holati hisobga
 * olinadi: 23:50 dan keyin 00:05 kelsa, bu keyingi kun). Bo'lmasa —
 * har xabarga shartli 30 soniya. Shartli qiymat kerak, chunki javob
 * tezligi metrikasi (FR-45) vaqtsiz hisoblanmaydi; lekin u haqiqiy
 * emasligi `speakerAttributionMethod` kabi alohida belgilanmaydi —
 * qo'lda yuklangan suhbatda bu baribir taxmin.
 */
export function assignOffsets(segments: ParsedSegment[]): number[] {
  const soatliBor = segments.some((s) => s.clockSeconds !== null);
  if (!soatliBor) return segments.map((_, i) => i * 30);

  const offsets: number[] = [];
  let birinchi: number | null = null;
  let oldingi = 0;
  let kunQoshimcha = 0;

  for (const [i, s] of segments.entries()) {
    if (s.clockSeconds === null) {
      // Vaqtsiz qator — oldingisiga 30 soniya qo'shamiz.
      offsets.push(i === 0 ? 0 : offsets[i - 1]! + 30);
      continue;
    }
    let abs = s.clockSeconds + kunQoshimcha;
    if (abs < oldingi) {
      // Vaqt orqaga ketdi — yarim tundan o'tgan deb hisoblaymiz.
      kunQoshimcha += 24 * 3600;
      abs = s.clockSeconds + kunQoshimcha;
    }
    oldingi = abs;
    birinchi ??= abs;
    offsets.push(abs - birinchi);
  }

  return offsets;
}
