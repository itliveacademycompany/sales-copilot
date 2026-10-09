/**
 * Bildirishnoma sozlamalari — server modeli (`business.alert_prefs`).
 *
 * Ikki o'lchov bor va ular ataylab ajratilgan:
 *   - `kinds`    — ogohlantirish UMUMAN yaratilsinmi. O'chirilsa, u ilovada ham,
 *                  Telegram'da ham bo'lmaydi (yaratilmagan narsani yuborib bo'lmaydi).
 *   - `channels` — yaratilgan ogohlantirish qaysi Telegram manziliga ham borsin.
 *                  Ilova ichidagi «Ogohlantirishlar» ro'yxati har doim to'ladi.
 *
 * Shu sababli jadvalda «Ilovada» ustuni = `kinds`, Telegram ustunlari = `channels`.
 * Batafsil: backend/src/business/channels.ts.
 */

export type AlertTuri = 'red_flag' | 'missed_lead' | 'broken_commitment' | 'low_confidence' | 'quality_drop';
export type MatritsaTuri = AlertTuri | 'daily_report';
export type TgKanal = 'dm' | 'group' | 'channel';

export interface AlertPrefs {
  kinds: Record<AlertTuri, boolean>;
  /** Eskirgan maydon — server uni o'qimaydi, lekin yo'qolmasligi uchun qaytariladi. */
  telegram: boolean;
  channels: Record<MatritsaTuri, Record<TgKanal, boolean>>;
  lowScore: { enabled: boolean; threshold: number; minTurns: number };
}

export interface TelegramManzil {
  chatId: string;
  title: string | null;
}

export interface TelegramTargets {
  dm: TelegramManzil | null;
  group: TelegramManzil | null;
  channel: TelegramManzil | null;
  /** Bot ko'rgan chatlar — serverning kuzatuvi, faqat o'qish uchun. */
  discovered: { chatId: string; type: 'private' | 'group' | 'supergroup' | 'channel'; title: string | null; seenAt: string }[];
}

export const TG_KANALLAR: { k: TgKanal; nom: string; qisqa: string }[] = [
  { k: 'dm', nom: 'Telegram bot', qisqa: 'Shaxsiy chat' },
  { k: 'group', nom: 'Telegram guruh', qisqa: 'Guruh' },
  { k: 'channel', nom: 'Telegram kanal', qisqa: 'Kanal' },
];

/** Bot ko'rgan chat turi qaysi manzilga mos keladi. */
export const MOS_TUR: Record<TgKanal, TelegramTargets['discovered'][number]['type'][]> = {
  dm: ['private'],
  group: ['group', 'supergroup'],
  channel: ['channel'],
};

export const KATEGORIYALAR: {
  nom: string;
  izoh: string;
  turlar: { k: MatritsaTuri; nom: string; izoh: string }[];
}[] = [
  {
    nom: 'Samaradorlik ogohlantirishlari',
    izoh: "Menejer intizomi: javobsiz mijoz va bajarilmagan va'da.",
    turlar: [
      { k: 'missed_lead', nom: 'Javobsiz qolgan mijoz', izoh: 'Mijoz xabari javobsiz qoldi va u javob kutayotgan edi.' },
      { k: 'broken_commitment', nom: "Muddati o'tgan va'da", izoh: "Menejer mijozga bergan va'dasini muddatida bajarmadi." },
    ],
  },
  {
    nom: "Qo'ng'iroq tahlili ogohlantirishlari",
    izoh: "Tahlil qilingan suhbatlardagi qoidabuzarlik va past sifat.",
    turlar: [
      { k: 'red_flag', nom: 'Qizil bayroq', izoh: "Playbook'dagi taqiqlangan holat suhbatda isbot bilan topildi." },
      { k: 'quality_drop', nom: 'Past baho', izoh: 'Suhbat bahosi quyidagi chegaradan past chiqdi.' },
      { k: 'low_confidence', nom: 'AI ishonchi past', izoh: "Natija inson ko'rigini talab qiladi — baho ishonchsiz." },
    ],
  },
  {
    nom: 'Kunlik hisobotlar',
    izoh: 'Rahbarlar uchun har kuni belgilangan soatda tayyorlanadi.',
    turlar: [{ k: 'daily_report', nom: 'Kunlik hisobot', izoh: "Yuborish vaqti va standart chat — «Kunlik hisobot» bo'limida." }],
  },
];
