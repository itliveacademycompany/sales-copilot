import { strToU8, zipSync } from 'fflate';

/**
 * Jadvalni faylga eksport qilish — CSV va haqiqiy Excel (.xlsx).
 *
 * XLSX — bu bir nechta XML faylning ZIP arxivi (Office Open XML). Og'ir
 * kutubxona (SheetJS ~400 KB) o'rniga minimal yozuvchi + `fflate` (~8 KB)
 * ishlatiladi: bizga faqat yozish kerak, o'qish emas.
 */

export type Katak = string | number | null;

function yuklabOl(blob: Blob, nom: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ─── CSV ────────────────────────────────────────────────────────────────────

function csvKatak(v: Katak): string {
  if (v === null) return '';
  const s = String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvYukla(nom: string, sarlavha: string[], qatorlar: Katak[][]): void {
  const matn = [sarlavha, ...qatorlar].map((q) => q.map(csvKatak).join(',')).join('\r\n');
  // BOM — Excel CSV'ni UTF-8 deb taniydi (o'zbekcha ʻ belgilari buzilmaydi).
  yuklabOl(new Blob(['﻿' + matn], { type: 'text/csv;charset=utf-8' }), `${nom}.csv`);
}

// ─── XLSX ───────────────────────────────────────────────────────────────────

function xml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // XML 1.0 da ruxsat etilmagan boshqaruv belgilari
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
}

/** 0 → A, 25 → Z, 26 → AA */
function ustunHarf(i: number): string {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function xlsxKatak(v: Katak, ref: string, sarlavhami: boolean): string {
  const uslub = sarlavhami ? ' s="1"' : '';
  if (v === null || v === '') return `<c r="${ref}"${uslub}/>`;
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${uslub}><v>${v}</v></c>`;
  return `<c r="${ref}" t="inlineStr"${uslub}><is><t xml:space="preserve">${xml(String(v))}</t></is></c>`;
}

export function xlsxYukla(
  nom: string,
  sarlavha: string[],
  qatorlar: Katak[][],
  kengliklar: number[] = [],
): void {
  const barcha = [sarlavha, ...qatorlar];
  const sheetRows = barcha
    .map(
      (q, r) =>
        `<row r="${r + 1}">${q.map((v, c) => xlsxKatak(v, `${ustunHarf(c)}${r + 1}`, r === 0)).join('')}</row>`,
    )
    .join('');
  const cols = sarlavha
    .map((_, i) => `<col min="${i + 1}" max="${i + 1}" width="${kengliklar[i] ?? 18}" customWidth="1"/>`)
    .join('');
  const oxirgi = `${ustunHarf(sarlavha.length - 1)}${barcha.length}`;

  const fayllar: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '</Relationships>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets><sheet name="Qo\'ng\'iroqlar" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
        '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
        '<fill><patternFill patternType="solid"><fgColor rgb="FFE8ECF2"/></patternFill></fill></fills>' +
        '<borders count="1"><border/></borders>' +
        '<cellStyleXfs count="1"><xf/></cellStyleXfs>' +
        '<cellXfs count="2"><xf/><xf fontId="1" fillId="2" applyFont="1" applyFill="1"/></cellXfs>' +
        '</styleSheet>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
        `<cols>${cols}</cols>` +
        `<sheetData>${sheetRows}</sheetData>` +
        `<autoFilter ref="A1:${oxirgi}"/>` +
        '</worksheet>',
    ),
  };

  const zip = zipSync(fayllar, { level: 6 });
  yuklabOl(
    new Blob([zip], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${nom}.xlsx`,
  );
}
