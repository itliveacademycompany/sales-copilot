/**
 * Bildirishnoma sozlamalari — kategoriya × kanal.
 *
 * Serverda bunday sozlama hali yo'q, shuning uchun tanlov shu brauzerda,
 * biznes bo'yicha saqlanadi. «Veb» ustuni haqiqatan ishlaydi: o'chirilgan
 * kategoriya Ogohlantirishlar sahifasida ko'rsatilmaydi (server ularni
 * baribir yaratadi — hech narsa yo'qolmaydi, faqat yashiriladi).
 */

export type Kategoriya = 'samaradorlik' | 'texnik' | 'kunlik' | 'qongiroq';
export type Kanal = 'veb' | 'bot' | 'guruh' | 'kanal';

export const KATEGORIYALAR: { k: Kategoriya; nom: string; izoh: string; turlar: string[] }[] = [
  {
    k: 'samaradorlik',
    nom: 'Samaradorlik ogohlantirishlari',
    izoh: 'Menejer faolsizligi va past samaradorligi.',
    turlar: ['quality_drop', 'missed_lead', 'broken_commitment'],
  },
  { k: 'texnik', nom: 'Texnik ogohlantirishlar', izoh: 'Audio va Telegram ulanish muammolari.', turlar: ['sync_error'] },
  { k: 'kunlik', nom: 'Kunlik hisobotlar', izoh: 'Rahbarlar uchun reja asosida yaratiladigan biznes hisobotlari.', turlar: [] },
  {
    k: 'qongiroq',
    nom: "Qo'ng'iroq tahlili ogohlantirishlari",
    izoh: "Tahlil qilingan qo'ng'iroqlardagi past sifat va qoidabuzarliklar.",
    turlar: ['red_flag', 'low_confidence', 'score_appeal'],
  },
];

export interface BildirishnomaSozlama {
  kanallar: Record<Exclude<Kategoriya, 'kunlik'>, Record<Kanal, boolean>>;
  pastSifat: { yoqilgan: boolean; chegara: number; minDaqiqa: number };
}

const yoqiq = (): Record<Kanal, boolean> => ({ veb: true, bot: true, guruh: false, kanal: false });

export const STANDART_SOZLAMA: BildirishnomaSozlama = {
  kanallar: { samaradorlik: yoqiq(), texnik: yoqiq(), qongiroq: yoqiq() },
  pastSifat: { yoqilgan: false, chegara: 30, minDaqiqa: 5 },
};

const kalit = (businessId: string) => `sotuvai-bildirishnoma:${businessId}`;

export function sozlamaOl(businessId: string): BildirishnomaSozlama {
  try {
    const v = JSON.parse(localStorage.getItem(kalit(businessId)) ?? 'null') as Partial<BildirishnomaSozlama> | null;
    if (!v) return STANDART_SOZLAMA;
    return {
      kanallar: {
        samaradorlik: { ...yoqiq(), ...v.kanallar?.samaradorlik },
        texnik: { ...yoqiq(), ...v.kanallar?.texnik },
        qongiroq: { ...yoqiq(), ...v.kanallar?.qongiroq },
      },
      pastSifat: { ...STANDART_SOZLAMA.pastSifat, ...v.pastSifat },
    };
  } catch {
    return STANDART_SOZLAMA;
  }
}

export function sozlamaSaqla(businessId: string, s: BildirishnomaSozlama): boolean {
  try {
    localStorage.setItem(kalit(businessId), JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

/** Ogohlantirish turi vebda ko'rsatiladimi. Noma'lum tur doim ko'rinadi. */
export function vebdaKorinadimi(kind: string, s: BildirishnomaSozlama): boolean {
  const kat = KATEGORIYALAR.find((k) => k.turlar.includes(kind));
  if (!kat || kat.k === 'kunlik') return true;
  return s.kanallar[kat.k].veb;
}

/** Bog'langan Telegram manzili turi (guruh/kanal) va nomi — server faqat chat ID saqlaydi. */
export interface ManzilMeta {
  tur: 'guruh' | 'kanal';
  nom: string;
}
const manzilKalit = (businessId: string) => `sotuvai-tg-manzil:${businessId}`;

export function manzilMetaOl(businessId: string, chatId: string): ManzilMeta | null {
  try {
    const v = JSON.parse(localStorage.getItem(manzilKalit(businessId)) ?? '{}') as Record<string, ManzilMeta>;
    return v[chatId] ?? null;
  } catch {
    return null;
  }
}

export function manzilMetaSaqla(businessId: string, chatId: string, meta: ManzilMeta) {
  try {
    const v = JSON.parse(localStorage.getItem(manzilKalit(businessId)) ?? '{}') as Record<string, ManzilMeta>;
    v[chatId] = meta;
    localStorage.setItem(manzilKalit(businessId), JSON.stringify(v));
  } catch {
    /* xotira yopiq — tur «guruh» deb ko'rsatiladi */
  }
}
