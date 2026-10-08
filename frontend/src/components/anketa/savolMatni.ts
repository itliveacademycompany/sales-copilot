/**
 * Anketa savoli matnidan xizmat belgilarini olib tashlaydi — faqat
 * ko'rsatish uchun. Belgilar (`[Yo'nalish: …]`, `[Variantlar: …]`,
 * `[Mijoz savollari ro'yxati]`) AI uchun savol matnida saqlanadi
 * (qarang: AnketaSavollari.tsx). Moslashtirish asl matn bo'yicha qoladi.
 */
export const savolMatni = (q: string) =>
  q
    .replace(/\s*\[(Yo'nalish|Variantlar):[^\]]*\]/g, '')
    .replace(/\s*\[Mijoz savollari ro'yxati\]/g, '')
    .trim();
