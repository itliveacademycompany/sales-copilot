/**
 * AI o'qiydigan matn maydonlari ichidagi avtomatik bloklar.
 *
 * Backend AI'ga faqat `stage2.businessContext`, `stage2.extractionHints` va
 * `stage3.scoringGuidance` ni yuboradi. Boshqa ko'rsatmalar (atamalar,
 * transkripsiya izohi, vazifa, coaching, qoida buzilishi, lid tahlili)
 * o'z maydonida saqlanadi VA shu maydonlar ichidagi alohida blokka ham
 * yoziladi — AI ularni haqiqatan o'qisin. Foydalanuvchi o'z matnini
 * tahrirlaganda blok ko'rinmaydi va buzilmaydi.
 */
export const AI_BOSH = "[AI KO'RSATMALARI — Sozlamalar → AI ko'rsatmalari bo'limida boshqariladi]";
export const AI_OXIR = "[/AI KO'RSATMALARI]";

/** [blokdan tashqari matn, blokning o'zi (yoki '')] */
export function blokniAjrat(matn: string, bosh = AI_BOSH, oxir = AI_OXIR): [string, string] {
  const a = matn.indexOf(bosh);
  const b = matn.indexOf(oxir);
  if (a === -1 || b === -1 || b < a) return [matn, ''];
  const blok = matn.slice(a, b + oxir.length);
  const tashqi = (matn.slice(0, a) + matn.slice(b + oxir.length)).replace(/\n{3,}/g, '\n\n').trim();
  return [tashqi, blok];
}

export const blokniYig = (tashqi: string, blok: string) => [tashqi.trim(), blok].filter(Boolean).join('\n\n');

/** Bo'sh bo'lmagan bandlardan blok yasaydi (hammasi bo'sh bo'lsa — ''). */
export function blokYasa(bandlar: [string, string][]): string {
  const b = bandlar.filter(([, v]) => v.trim()).map(([k, v]) => `${k}: ${v.trim()}`);
  return b.length ? [AI_BOSH, ...b, AI_OXIR].join('\n') : '';
}

/** Lid sifati bosqichlari bloki — baholash ko'rsatmasi ichida (LidSifatiBosqichlari.tsx). */
export const LID_BOSH = "[LID SIFATI BOSQICHLARI — Sozlamalar → Lid sifati bosqichlari bo'limida boshqariladi]";
export const LID_OXIR = '[/LID SIFATI BOSQICHLARI]';

/** Baholash ko'rsatmasi: [foydalanuvchi matni, AI ko'rsatmalari bloki, lid bloki]. */
export function bahoniAjrat(matn: string): [string, string, string] {
  const [qolgan, lid] = blokniAjrat(matn, LID_BOSH, LID_OXIR);
  const [oz, ai] = blokniAjrat(qolgan);
  return [oz, ai, lid];
}
export const bahoniYig = (oz: string, ai: string, lid: string) => [oz.trim(), ai, lid].filter(Boolean).join('\n\n');
