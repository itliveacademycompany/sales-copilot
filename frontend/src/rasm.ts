/**
 * RASM TAYYORLASH — avatar va shunga o'xshash kichik rasmlar uchun.
 *
 * Foydalanuvchi telefonidan tanlagan rasm odatda 3-8 MB bo'ladi. Uni
 * o'sha holida yuborish ma'nosiz: avatar ekranda 56px ko'rinadi.
 * Shuning uchun brauzerda kvadratga qirqilib, kichraytirilib, WebP ga
 * siqiladi — natija odatda 10-20 KB.
 *
 * Server baribir o'z chegarasini tekshiradi (`media/image.ts`): bu yerdagi
 * kichraytirish qulaylik uchun, himoya emas. Frontendga ishonib
 * bo'lmaydi — u foydalanuvchi qo'lida.
 */

/** Avatar ekranda eng kattasi 56px; 192px Retina uchun ham yetadi. */
const OLCHAM = 192;

export interface RasmNatija {
  dataUri: string;
  /** Taxminiy bayt hajmi — foydalanuvchiga ko'rsatish uchun. */
  bayt: number;
}

export class RasmXato extends Error {}

/**
 * Faylni kvadrat `data:` URI ga aylantiradi.
 *
 * Qirqish MARKAZDAN: uzun rasmni cho'zib yubormaslik uchun. Cho'zilgan
 * yuz — avatar uchun eng ko'zga tashlanadigan xato.
 */
export async function rasmniTayyorla(fayl: File): Promise<RasmNatija> {
  if (!fayl.type.startsWith('image/')) {
    throw new RasmXato('Bu rasm fayli emas');
  }
  // Kichraytirishdan OLDIN ham chegara kerak: 100 MB li faylni dekodlash
  // brauzerni muzlatib qo'yishi mumkin.
  if (fayl.size > 20 * 1024 * 1024) {
    throw new RasmXato('Fayl juda katta (20 MB dan oshmasin)');
  }

  const url = URL.createObjectURL(fayl);
  try {
    const img = await yukla(url);
    const tomon = Math.min(img.naturalWidth, img.naturalHeight);
    if (tomon === 0) throw new RasmXato('Rasmni o\'qib bo\'lmadi');

    const kanvas = document.createElement('canvas');
    kanvas.width = OLCHAM;
    kanvas.height = OLCHAM;
    const ctx = kanvas.getContext('2d');
    if (!ctx) throw new RasmXato('Brauzer rasmni qayta ishlay olmadi');

    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(
      img,
      (img.naturalWidth - tomon) / 2,
      (img.naturalHeight - tomon) / 2,
      tomon,
      tomon,
      0,
      0,
      OLCHAM,
      OLCHAM,
    );

    // WebP qo'llab-quvvatlanmasa `toDataURL` jimgina PNG qaytaradi —
    // shuning uchun natija tekshiriladi, taxmin qilinmaydi.
    let dataUri = kanvas.toDataURL('image/webp', 0.85);
    if (!dataUri.startsWith('data:image/webp')) {
      dataUri = kanvas.toDataURL('image/jpeg', 0.85);
    }

    return { dataUri, bayt: Math.round((dataUri.length - dataUri.indexOf(',') - 1) * 0.75) };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function yukla(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new RasmXato('Rasm formati qo\'llab-quvvatlanmaydi'));
    img.src = url;
  });
}

/** "12 KB" — foydalanuvchiga ko'rsatish uchun. */
export function baytMatn(b: number): string {
  return b < 1024 ? `${b} B` : `${Math.round(b / 1024)} KB`;
}
