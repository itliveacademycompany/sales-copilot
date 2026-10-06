/**
 * KO'RINISH — mavzu, aksent rangi va rang sxemalari.
 *
 * Yagona manba: ro'yxatlar ham, qo'llash mantiqi ham shu yerda. Ikki joyda
 * kerak — `main.tsx` (React ishga tushishidan oldin, chaqnashni oldini
 * olish uchun) va Sozlamalar sahifasi.
 *
 * Hammasi QURILMA sozlamasi: `localStorage` da saqlanadi, serverga
 * bormaydi va boshqa foydalanuvchiga ta'sir qilmaydi. Sabab — bir
 * biznesda ishlaydigan ikki odam bir xil mavzuni yoqtirishi shart emas.
 *
 * Ranglarning o'zi `styles.css` da: bu yerda faqat KALIT saqlanadi, CSS
 * `data-*` atributi orqali qiymatni topadi. Shu sababli yangi sxema
 * qo'shish = CSS ga bitta blok + shu ro'yxatga bitta qator.
 */

export type Mavzu = 'system' | 'light' | 'dark';
export type Aksent = 'navy' | 'kok' | 'yashil' | 'amber' | 'siyoh' | 'qizil';
export type YorugSxema = 'iliq' | 'slate' | 'neytral';
export type QorongiSxema = 'cinder' | 'mint' | 'navy' | 'mirage' | 'qora';

const KALIT = {
  mavzu: 'sotuvai-mavzu',
  aksent: 'sotuvai-aksent',
  yorug: 'sotuvai-yorug',
  qorongi: 'sotuvai-qorongi',
} as const;

/** Standart qiymatlar — CSS dagi fallback bilan bir xil bo'lishi shart. */
export const STANDART = {
  mavzu: 'system' as Mavzu,
  /** Stitch dizayni (2026-08) — issiq qizil butun sayt bo'yicha standart. */
  aksent: 'qizil' as Aksent,
  yorug: 'iliq' as YorugSxema,
  qorongi: 'cinder' as QorongiSxema,
};

export const MAVZULAR: { key: Mavzu; nom: string; izoh: string }[] = [
  { key: 'system', nom: 'Tizim bo\'yicha', izoh: 'Qurilma sozlamasiga ergashadi' },
  { key: 'light', nom: 'Yorug\'', izoh: 'Har doim yorug\' mavzu' },
  { key: 'dark', nom: 'Qorong\'i', izoh: 'Har doim qorong\'i mavzu' },
];

/**
 * Aksent — bosiladigan hamma narsaning rangi (tugma, faol menyu, fokus).
 * `namuna` faqat tanlov doirachasi uchun: haqiqiy qiymatlar CSS da va
 * mavzuga qarab boshqacha bo'ladi.
 */
export const AKSENTLAR: { key: Aksent; nom: string; namuna: string }[] = [
  { key: 'navy', nom: 'Navy', namuna: '#1e3a5c' },
  { key: 'kok', nom: 'Ko\'k', namuna: '#1d4ed8' },
  { key: 'yashil', nom: 'Yashil', namuna: '#15803d' },
  { key: 'amber', nom: 'Amber', namuna: '#a8560a' },
  { key: 'siyoh', nom: 'Siyoh', namuna: '#6d28d9' },
  { key: 'qizil', nom: 'Qizil', namuna: '#c1381f' },
];

export const YORUG_SXEMALAR: { key: YorugSxema; nom: string; fon: string; band: string }[] = [
  { key: 'iliq', nom: 'Iliq', fon: '#f5f1ee', band: '#d8d2cd' },
  { key: 'slate', nom: 'Slate', fon: '#f1f5f9', band: '#cbd5e1' },
  { key: 'neytral', nom: 'Neytral', fon: '#f5f5f5', band: '#d4d4d4' },
];

export const QORONGI_SXEMALAR: { key: QorongiSxema; nom: string; fon: string; band: string }[] = [
  { key: 'cinder', nom: 'Cinder', fon: '#14171c', band: '#363c46' },
  { key: 'mint', nom: 'Mint', fon: '#101c17', band: '#2c473b' },
  { key: 'navy', nom: 'Navy', fon: '#101827', band: '#2c3c58' },
  { key: 'mirage', nom: 'Mirage', fon: '#161d26', band: '#33404f' },
  { key: 'qora', nom: 'Qora', fon: '#0a0a0a', band: '#333333' },
];

export interface KorinishHolat {
  mavzu: Mavzu;
  aksent: Aksent;
  yorug: YorugSxema;
  qorongi: QorongiSxema;
}

/** Noma'lum qiymat kelsa standartga qaytadi — eski kalit qolib ketsa ham. */
function oqi<T extends string>(kalit: string, ruxsat: readonly T[], standart: T): T {
  const v = localStorage.getItem(kalit);
  return ruxsat.includes(v as T) ? (v as T) : standart;
}

export function korinishOqi(): KorinishHolat {
  return {
    mavzu: oqi(KALIT.mavzu, MAVZULAR.map((m) => m.key), STANDART.mavzu),
    aksent: oqi(KALIT.aksent, AKSENTLAR.map((a) => a.key), STANDART.aksent),
    yorug: oqi(KALIT.yorug, YORUG_SXEMALAR.map((s) => s.key), STANDART.yorug),
    qorongi: oqi(KALIT.qorongi, QORONGI_SXEMALAR.map((s) => s.key), STANDART.qorongi),
  };
}

/**
 * Atributni qo'yadi yoki standart bo'lsa OLIB TASHLAYDI.
 *
 * Standartda atribut qolmasligi muhim: CSS da standart qiymat `var(…, fallback)`
 * ichida yozilgan va alohida blok yo'q. Bo'sh atribut qolsa hech narsa
 * buzilmaydi, lekin DOM da nima yoqilganini o'qish chalkash bo'lardi.
 */
function atribut(nom: string, qiymat: string, standart: string): void {
  const root = document.documentElement;
  if (qiymat === standart) root.removeAttribute(nom);
  else root.setAttribute(nom, qiymat);
}

export function korinishQoll(h: KorinishHolat): void {
  atribut('data-theme', h.mavzu, 'system');
  atribut('data-accent', h.aksent, STANDART.aksent);
  atribut('data-light', h.yorug, STANDART.yorug);
  atribut('data-dark', h.qorongi, STANDART.qorongi);
}

/** Bitta maydonni o'zgartirib, saqlab, darhol qo'llaydi. */
export function korinishYoz<K extends keyof KorinishHolat>(
  maydon: K,
  qiymat: KorinishHolat[K],
): KorinishHolat {
  localStorage.setItem(KALIT[maydon], qiymat);
  const yangi = korinishOqi();
  korinishQoll(yangi);
  return yangi;
}
