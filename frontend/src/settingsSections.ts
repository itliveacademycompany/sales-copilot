/**
 * Sozlamalar bo'limlari — YAGONA manba.
 *
 * Ro'yxat ikki joyda kerak: yon menyu va sahifaning o'zi. Uni ikki marta
 * yozsak, biri o'zgarganda ikkinchisi ortda qolardi.
 *
 * `huquq` — bo'limni ko'rish uchun kerakli ruxsat. Server baribir o'zi
 * tekshiradi; bu faqat foydasiz havolani yashiradi.
 */
export type SozlamaSlug =
  | 'profil'
  | 'korinish'
  | 'biznes'
  | 'bizneslar'
  | 'rahbarlar'
  | 'menejerlar'
  | 'ish-jadvali'
  | 'integratsiya'
  | 'bildirishnoma'
  | 'mezonlar'
  | 'obuna';

export interface SozlamaBolim {
  slug: SozlamaSlug;
  nom: string;
  guruh: 'Umumiy' | 'AI va integratsiya';
  huquq?: string;
  /** Boshqa sahifaga olib boradigan bo'lim (o'zida kontent yo'q). */
  havola?: string;
}

export const SOZLAMA_BOLIMLAR: SozlamaBolim[] = [
  { slug: 'profil', nom: 'Profil', guruh: 'Umumiy' },
  { slug: 'korinish', nom: "Ko'rinish", guruh: 'Umumiy' },
  { slug: 'biznes', nom: 'Biznes', guruh: 'Umumiy', huquq: 'business:read' },
  { slug: 'bizneslar', nom: 'Bizneslar', guruh: 'Umumiy' },
  { slug: 'rahbarlar', nom: 'Rahbarlar', guruh: 'Umumiy', huquq: 'member:manage' },
  { slug: 'menejerlar', nom: 'Menejerlar', guruh: 'Umumiy', huquq: 'seat:manage:all' },
  { slug: 'ish-jadvali', nom: 'Ish jadvali', guruh: 'Umumiy', huquq: 'business:read' },
  { slug: 'obuna', nom: 'Obuna', guruh: 'Umumiy', huquq: 'subscription:manage', havola: '/billing' },

  {
    slug: 'integratsiya',
    nom: 'Integratsiyalar',
    guruh: 'AI va integratsiya',
    huquq: 'business:read',
  },
  {
    slug: 'bildirishnoma',
    nom: 'Bildirishnomalar',
    guruh: 'AI va integratsiya',
    huquq: 'business:read',
  },
  {
    slug: 'mezonlar',
    nom: 'Baholash mezonlari',
    guruh: 'AI va integratsiya',
    huquq: 'playbook:read',
    havola: '/playbook',
  },
];

export const SOZLAMA_BOSH: SozlamaSlug = 'profil';

export function sozlamaTopildi(slug: string | undefined): SozlamaSlug {
  return SOZLAMA_BOLIMLAR.some((b) => b.slug === slug)
    ? (slug as SozlamaSlug)
    : SOZLAMA_BOSH;
}

/**
 * Foydalanuvchi ko'ra oladigan bo'limlar.
 *
 * `seat:manage:all` yoki bo'lim darajasidagi huquq — ikkalasi ham
 * menejerlar bo'limini ochadi, shuning uchun alohida tekshiriladi.
 */
export function korinadiganBolimlar(huquqlar: string[]): SozlamaBolim[] {
  return SOZLAMA_BOLIMLAR.filter((b) => {
    if (!b.huquq) return true;
    if (b.slug === 'menejerlar') {
      return huquqlar.includes('seat:manage:all') || huquqlar.includes('seat:manage:department');
    }
    return huquqlar.includes(b.huquq);
  });
}
