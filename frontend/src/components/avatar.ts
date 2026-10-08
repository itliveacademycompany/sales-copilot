import { useEffect, useState } from 'react';

/**
 * Profil rasmi (fayldan).
 *
 * Backend faqat rasm HAVOLASINI saqlaydi (≤500 belgi) — fayl yuklash yo'q.
 * Shuning uchun tanlangan fayl brauzerda kvadrat qilib kesiladi, 256 px ga
 * kichraytiriladi va shu brauzerda saqlanadi. Boshqa qurilmalarda ko'rinishi
 * uchun havola orqali qo'yish kerak (Profil'da shunday deb yozilgan).
 */

const KALIT = (userId: string) => `sotuvai-avatar-${userId}`;
const HODISA = 'sotuvai-avatar';
export const MAX_HAJM = 2 * 1024 * 1024;
const OLCHAM = 256;

export function lokalAvatar(userId: string | undefined): string | null {
  if (!userId) return null;
  try {
    return localStorage.getItem(KALIT(userId));
  } catch {
    return null;
  }
}

export function lokalAvatarSaqla(userId: string, dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(KALIT(userId), dataUrl);
    else localStorage.removeItem(KALIT(userId));
  } catch {
    /* xotira to'la yoki yopiq — rasm faqat shu sahifada qoladi */
  }
  window.dispatchEvent(new CustomEvent(HODISA));
}

/** Avatar o'zgarganda (Profil'da saqlanganda) qayta chiziladi. */
export function useLokalAvatar(userId: string | undefined) {
  const [rasm, setRasm] = useState(() => lokalAvatar(userId));
  useEffect(() => {
    setRasm(lokalAvatar(userId));
    const yangila = () => setRasm(lokalAvatar(userId));
    window.addEventListener(HODISA, yangila);
    return () => window.removeEventListener(HODISA, yangila);
  }, [userId]);
  return rasm;
}

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
