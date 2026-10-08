/**
 * Analitika bo'limlari — YAGONA manba.
 *
 * Ro'yxat ikki joyda kerak: yon panel (havolalar) va sahifaning o'zi
 * (qaysi blokni chizish). Uni ikki marta yozsak, biri o'zgarganda
 * ikkinchisi ortda qolardi — yon panelda bor bo'lim sahifada
 * ochilmasligi mumkin edi.
 *
 * `slug` URL'ga tushadi va o'zgarmas: havola ulashilganda yoki brauzer
 * orqaga qaytganda bo'lim saqlanib qolishi kerak.
 */
export type BolimSlug =
  | 'umumiy'
  | 'sifat'
  | 'jamoa'
  | 'vazifalar'
  | 'mijozlar'
  | 'faoliyat'
  | 'lidlar';

export interface AnalitikaBolim {
  slug: BolimSlug;
  nom: string;
}

export const ANALITIKA_BOLIMLAR: AnalitikaBolim[] = [
  { slug: 'umumiy', nom: 'Umumiy ko\'rinish' },
  { slug: 'sifat', nom: 'Sifat nazorati' },
  { slug: 'jamoa', nom: 'Jamoa malakasi' },
  { slug: 'vazifalar', nom: 'Vazifalar tahlili' },
  { slug: 'mijozlar', nom: 'Mijoz tahlili' },
  { slug: 'faoliyat', nom: 'Faoliyat tahlili' },
  { slug: 'lidlar', nom: 'Lid analitikasi' },
];

export const ANALITIKA_BOSH: BolimSlug = 'umumiy';

/** Noma'lum slug kelsa birinchi bo'limga qaytadi — 404 ko'rsatmaymiz. */
export function bolimTopildi(slug: string | undefined): BolimSlug {
  return ANALITIKA_BOLIMLAR.some((b) => b.slug === slug)
    ? (slug as BolimSlug)
    : ANALITIKA_BOSH;
}
