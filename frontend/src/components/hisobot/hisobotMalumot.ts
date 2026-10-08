import type { PlaybookBody } from '../../api';

/**
 * Kunlik hisobot sozlamalari — `playbook.leadQuality.hisobot` (server).
 *
 * Backend hozir faqat chat ID va yuborish soatini qabul qiladi
 * (`reports/daily/settings`) va hisobotni qat'iy o'zbekcha shablonda
 * yaratadi. Til, tarkib va Telegram eslatmalari shu yerda saqlanadi —
 * server ularni qo'llab-quvvatlagach to'g'ridan-to'g'ri ishlatiladi.
 */

export type Qism =
  | 'crm'
  | 'vazifalar'
  | 'sifat'
  | 'menejerlar'
  | 'lidlar'
  | 'lidSifati'
  | 'xizmat'
  | 'anketa'
  | 'tavsiya'
  | 'xulosa';

export interface Otish {
  id: string;
  menejer: string; // seat id yoki '*'
  voronka: string;
  dan: string;
  ga: string;
}

export interface HisobotSozlama {
  til: 'uz' | 'en' | 'ru';
  vazifaEslatma: { yoqilgan: boolean; daqiqa: number };
  ertalabki: { yoqilgan: boolean };
  qismlar: Record<Qism, boolean>;
  /** null — hammasi (yangi qo'shilganlari ham avtomatik kiradi). */
  menejerlar: string[] | null;
  voronkalar: string[] | null;
  lidGuruhlar: string[] | null;
  savollar: string[] | null;
  otishlar: Otish[];
  /** Hisobot o'chirilganda oxirgi chat ID — qayta yoqilganda tiklanadi. */
  oxirgiChat?: string | null;
}

export const QISMLAR: { k: Qism; nom: string; izoh: string }[] = [
  { k: 'crm', nom: 'CRM faolligi', izoh: "Qo'ng'iroqlar soni, bog'langan qo'ng'iroqlar, bog'lanish darajasi, suhbat vaqti va oldingi ish kuni bilan taqqoslash." },
  { k: 'vazifalar', nom: 'Vazifalar rejasi', izoh: "Bugun bajarilishi kerak bo'lgan vazifalar, ulardan nechtasi bajarilgani, qolgan qismi va har bir menejer bo'yicha ixcham qator." },
  { k: 'sifat', nom: "Qo'ng'iroqlar sifati", izoh: "Tahlil qilingan qo'ng'iroqlar, savdo ssenariysi ulushi, chiqarilgan qo'ng'iroqlar, audio muammolari va o'rtacha ball." },
  { k: 'menejerlar', nom: 'Menejerlar faoliyati', izoh: "Menejerlar kesimidagi qo'ng'iroq ko'rsatkichlari, kuchli tomonlar va e'tibor kerak bo'lgan jihatlar." },
  { k: 'lidlar', nom: 'Lidlar harakati', izoh: "Yangi lidlar, yutilgan bitimlar, yo'qotilgan lidlar, yutilgan qiymat va tanlangan CRM voronkalari." },
  { k: 'lidSifati', nom: 'Lid sifati', izoh: "Jami yangi lidlar, ishlangan lidlar, sifatli, sifatsiz, bog'lana olinmagan lidlar va tanlangan lid sifati guruhlari bo'yicha kunlik xulosa." },
  { k: 'xizmat', nom: "Xizmat yo'nalishlari", izoh: "Tahlil qilingan suhbatlardan aniqlangan mahsulot yoki xizmat yo'nalishlari." },
  { k: 'anketa', nom: 'Anketa savollari', izoh: "Baholash mezonidagi tanlangan anketa savollari bo'yicha olingan javoblar." },
  { k: 'tavsiya', nom: 'Tavsiyalar', izoh: "Hisobot ma'lumotlari asosidagi ertangi kun uchun aniq harakatlar." },
  { k: 'xulosa', nom: 'Xulosa', izoh: 'Hisobot oxiridagi qisqa yakuniy xulosa.' },
];

export const BOSH: HisobotSozlama = {
  til: 'uz',
  vazifaEslatma: { yoqilgan: true, daqiqa: 5 },
  ertalabki: { yoqilgan: true },
  qismlar: Object.fromEntries(QISMLAR.map((q) => [q.k, true])) as Record<Qism, boolean>,
  menejerlar: null,
  voronkalar: null,
  lidGuruhlar: null,
  savollar: null,
  otishlar: [],
};

export function hisobotniOl(p: PlaybookBody): HisobotSozlama {
  const h = ((p.leadQuality ?? {}) as { hisobot?: Partial<HisobotSozlama> }).hisobot ?? {};
  return {
    ...BOSH,
    ...h,
    vazifaEslatma: { ...BOSH.vazifaEslatma, ...h.vazifaEslatma },
    ertalabki: { ...BOSH.ertalabki, ...h.ertalabki },
    qismlar: { ...BOSH.qismlar, ...h.qismlar },
    otishlar: Array.isArray(h.otishlar) ? h.otishlar : [],
  };
}

/** Tanlangan ro'yxat: null — hammasi; mavjud bo'lmaganlari tashlanadi. */
export const tanlanganlar = (tanlov: string[] | null, hammasi: string[]) => (tanlov === null ? hammasi : tanlov.filter((x) => hammasi.includes(x)));
