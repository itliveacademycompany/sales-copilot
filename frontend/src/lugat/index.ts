/// <reference types="vite/client" />

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TARJIMA LUG'ATLARI — bo'limlar bo'yicha
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kalit — o'zbekcha matnning o'zi (komponentdagi `t("…")` bilan aynan bir
 * xil), qiymati — inglizcha va ruscha tarjima.
 *
 * Har bo'lim o'z faylida: `umumiy.ts`, `kirish.ts`, keyin `bosh.ts`,
 * `qongiroqlar.ts`… Yangi fayl qo'shilsa, u shu yerda AVTOMATIK ulanadi
 * (Vite `import.meta.glob`) — markaziy ro'yxatni tahrirlash shart emas.
 * Shu sabab bir nechta bo'limni parallel tarjima qilish bir-biriga
 * xalaqit bermaydi (bitta faylda konflikt chiqmaydi).
 *
 * Qoidalar:
 *   - fayl `export default` bilan `Lugat` obyektini qaytaradi;
 *   - o'rniga qo'yiladigan qiymat — `{nom}` (masalan `t("{n} ta suhbat", { n })`);
 *   - bir xil kalit ikki faylda bo'lsa, alifbo bo'yicha keyingi fayl ustun.
 *     Umumiy so'zlarni (Saqlash, Yopish…) `umumiy.ts` da bir marta yozing;
 *   - bir xil o'zbekcha so'z turli joyda turli ma'noda bo'lsa — kontekst
 *     belgisi: `t("Ulangan##qo'ng'iroq")`. Ekranda faqat `##` gacha qism
 *     ko'rinadi, lug'atda esa alohida kalit.
 */

export type Lugat = Record<string, { en: string; ru: string }>;

const modullar = import.meta.glob<Lugat>(['./*.ts', '!./index.ts'], { eager: true, import: 'default' });

export const LUGAT: Lugat = Object.assign(
  {},
  ...Object.keys(modullar)
    .sort()
    .map((k) => modullar[k]),
);
