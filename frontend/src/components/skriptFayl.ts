/**
 * Kompaniya sotuv skriptini fayldan matnga aylantirish — brauzerning o'zida.
 *
 * Serverga faqat toza matn boradi: fayl saqlanmaydi, server fayl formatlarini
 * bilishi shart emas. `.docx` — bu zip ichidagi `word/document.xml`; uni
 * loyihada allaqachon bor `fflate` (~8 KB, faqat kerak bo'lganda yuklanadi)
 * bilan ochib, paragraflar bo'yicha o'qiymiz.
 */

/** Server bilan bir xil chegaralar (backend/src/ai/prompts.ts: SKRIPT_MIN/MAX). */
export const SKRIPT_MIN = 50;
export const SKRIPT_MAX = 60_000;
export const SKRIPT_FAYL_MAX = 5 * 1024 * 1024;
export const SKRIPT_ACCEPT = '.docx,.txt,.md,text/plain,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Foydalanuvchiga ko'rsatiladigan xato — matn lug'at kaliti (t() bilan tarjima qilinadi). */
export class SkriptFaylXato extends Error {}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

export function skriptniTozala(matn: string): string {
  return matn
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t ]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** UTF-8 bo'lmasa (eski Windows'da saqlangan kirill matn) — windows-1251 deb o'qiymiz. */
function matnniDekodla(bayt: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bayt);
  } catch {
    return new TextDecoder('windows-1251').decode(bayt);
  }
}

async function docxMatni(bayt: ArrayBuffer): Promise<string> {
  const { unzipSync, strFromU8 } = await import('fflate');
  let xml: string;
  try {
    const fayllar = unzipSync(new Uint8Array(bayt), { filter: (f) => f.name === 'word/document.xml' });
    const doc = fayllar['word/document.xml'];
    if (!doc) throw new Error('document.xml yo\'q');
    xml = strFromU8(doc);
  } catch {
    throw new SkriptFaylXato("Word faylini o'qib bo'lmadi. Faylni .docx sifatida qayta saqlang yoki matnni nusxalab qo'ying.");
  }

  const hujjat = new DOMParser().parseFromString(xml, 'application/xml');
  const qatorlar: string[] = [];
  for (const p of Array.from(hujjat.getElementsByTagNameNS(W, 'p'))) {
    let qator = '';
    const yur = (el: Element) => {
      for (const bola of Array.from(el.children)) {
        if (bola.namespaceURI !== W) continue;
        if (bola.localName === 't') qator += bola.textContent ?? '';
        else if (bola.localName === 'tab') qator += '\t';
        else if (bola.localName === 'br' || bola.localName === 'cr') qator += '\n';
        else if (bola.localName !== 'pPr' && bola.localName !== 'rPr') yur(bola);
      }
    };
    yur(p);
    // Word ro'yxatlari raqamini matnda saqlamaydi — bosqichlar ketma-ketligi AI'ga ko'rinsin.
    const royxat = p.getElementsByTagNameNS(W, 'numPr').length > 0;
    qatorlar.push(royxat && qator.trim() ? `• ${qator}` : qator);
  }
  return qatorlar.join('\n');
}

export async function skriptFaylniOqi(fayl: File): Promise<string> {
  const nom = fayl.name.toLowerCase();
  if (fayl.size > SKRIPT_FAYL_MAX) {
    throw new SkriptFaylXato('Fayl juda katta — 5 MB gacha bo\'lishi kerak.');
  }
  if (nom.endsWith('.pdf') || nom.endsWith('.doc')) {
    throw new SkriptFaylXato(
      "PDF va eski .doc fayllar qo'llab-quvvatlanmaydi. Faylni .docx sifatida saqlang yoki matnini nusxalab qo'ying.",
    );
  }
  const bayt = await fayl.arrayBuffer();
  let matn: string;
  if (nom.endsWith('.docx')) matn = await docxMatni(bayt);
  else if (nom.endsWith('.txt') || nom.endsWith('.md') || fayl.type.startsWith('text/')) matn = matnniDekodla(bayt);
  else throw new SkriptFaylXato('Faqat .docx, .txt yoki .md fayl yuklash mumkin.');

  matn = skriptniTozala(matn);
  if (!matn) throw new SkriptFaylXato("Faylda matn topilmadi.");
  return matn;
}
