import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RASM MAYDONLARI — avatar va logotip
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ikki xil qiymat qabul qilinadi:
 *
 *   1. Tashqi havola  — `https://…` (500 belgigacha).
 *   2. Yuklangan fayl — `data:image/…;base64,…` URI.
 *
 * Nega fayl tizimi emas: loyihada doimiy fayl ombori yo'q (audio ham
 * vaqtinchalik papkaga tushib o'chiriladi). Disk ishlatsak — yetim
 * fayllar, zaxira nusxasi va ko'p instansiyali deploy muammosi paydo
 * bo'lardi. Rasm ustun ichida yotsa, u qator bilan birga ko'chadi va
 * qator o'chganda o'zi yo'qoladi.
 *
 * Buning evazi — hajm. Shuning uchun brauzer rasmni yuborishdan OLDIN
 * 192px ga kichraytiradi va bu yerda qat'iy chegara turadi: kichraytirish
 * frontendda bo'lgani uchun, unga ishonib bo'lmaydi — chegara serverda.
 */

/** ~180 KB base64 ≈ 135 KB rasm. 192px WebP odatda 10-20 KB. */
const MAX_DATA_URI = 180_000;

const RUXSAT_TUR = ['image/png', 'image/jpeg', 'image/webp'] as const;

/**
 * `data:` URI ni tekshiradi.
 *
 * `image/svg+xml` ATAYLAB ro'yxatda yo'q: SVG ichida skript bo'lishi
 * mumkin va u `<img>` orqali ko'rsatilganda zararsiz bo'lsa-da, boshqa
 * kontekstda (yangi oynada ochilsa) bajarilishi mumkin. Rasterli
 * formatlar bunday xavf tug'dirmaydi.
 */
export function dataUriTogri(v: string): boolean {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
  if (!m) return false;
  if (!RUXSAT_TUR.includes(m[1] as (typeof RUXSAT_TUR)[number])) return false;
  // Base64 uzunligi 4 ga karrali bo'lishi shart — buzuq qiymat brauzerda
  // jim ravishda bo'sh rasm bo'lib qolardi.
  return m[2]!.length % 4 === 0;
}

/**
 * Rasm maydoni sxemasi: tashqi havola YOKI yuklangan fayl.
 *
 * Ikkalasi bitta ustunda saqlanadi — `<img src>` ikkalasini ham bir xil
 * qabul qiladi, ya'ni interfeys tomonida hech qanday shart kerak emas.
 */
export const rasmMaydon = z
  .string()
  .trim()
  .max(MAX_DATA_URI, `Rasm juda katta (${Math.round(MAX_DATA_URI / 1024)} KB dan oshmasin)`)
  .refine(
    (v) => (v.startsWith('data:') ? dataUriTogri(v) : /^https?:\/\/\S+$/.test(v) && v.length <= 500),
    {
      message:
        'Rasm https havola yoki yuklangan PNG/JPEG/WebP fayl bo\'lishi kerak',
    },
  );
