/**
 * «Biznes konteksti» (`promptNotes.stage2.businessContext`) ichidagi
 * xizmat yo'nalishlari bloki — Xizmat yo'nalishlari bo'limi boshqaradi.
 * AI ko'rsatmalari bo'limi faqat blokdan tashqaridagi matnni tahrirlaydi.
 */
export const BLOK_BOSH = "[XIZMAT YO'NALISHLARI — Sozlamalar → Xizmat yo'nalishlari bo'limida boshqariladi]";
export const BLOK_OXIR = "[/XIZMAT YO'NALISHLARI]";

/** [blokdan tashqari matn, blokning o'zi (yoki '')] */
export function kontekstniAjrat(matn: string): [string, string] {
  const a = matn.indexOf(BLOK_BOSH);
  const b = matn.indexOf(BLOK_OXIR);
  if (a === -1 || b === -1 || b < a) return [matn, ''];
  const blok = matn.slice(a, b + BLOK_OXIR.length);
  const tashqi = (matn.slice(0, a) + matn.slice(b + BLOK_OXIR.length)).replace(/\n{3,}/g, '\n\n').trim();
  return [tashqi, blok];
}

export const kontekstniYig = (tashqi: string, blok: string) => [tashqi.trim(), blok].filter(Boolean).join('\n\n');
