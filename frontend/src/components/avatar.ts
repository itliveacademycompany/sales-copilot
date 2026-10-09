/**
 * Profil rasmi (fayldan).
 *
 * Tanlangan fayl brauzerda kvadrat qilib kesiladi va 256 px JPEG ga
 * kichraytiriladi (odatda 15–40 KB), so'ng data-URL sifatida profilga
 * (`PATCH /auth/me` → `avatarUrl`) yoziladi. Server data-URL'ni 180 KB
 * gacha qabul qiladi va formatini tekshiradi (`media/image.ts`).
 */

export const MAX_HAJM = 2 * 1024 * 1024;
const OLCHAM = 256;

/** Faylni o'qib, markazdan kvadrat kesadi va JPEG data-URL qaytaradi. */
export function rasmniTayyorla(fayl: File): Promise<string> {
  return new Promise((ok, xato) => {
    if (!/^image\/(png|jpe?g|webp)$/.test(fayl.type)) return xato(new Error('Faqat JPG, PNG yoki WEBP rasm'));
    if (fayl.size > MAX_HAJM) return xato(new Error('Rasm 2 MB dan katta'));
    const url = URL.createObjectURL(fayl);
    const img = new Image();
    img.onload = () => {
      const tomon = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = OLCHAM;
      canvas.height = OLCHAM;
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (img.width - tomon) / 2, (img.height - tomon) / 2, tomon, tomon, 0, 0, OLCHAM, OLCHAM);
      URL.revokeObjectURL(url);
      ok(canvas.toDataURL('image/jpeg', 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      xato(new Error("Rasmni o'qib bo'lmadi"));
    };
    img.src = url;
  });
}
