import { z } from 'zod';
import type { Tx } from '../db/index.js';
import { seat } from '../db/schema/index.js';
import { CrmXatosi } from './xato.js';
import { bitimYarat, maydonlarniTekshir, tuzilma, type CrmDoira, type MaydonTavsifi } from './xizmat.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — CSV import va eksport (LEAD-11)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Import: brauzer faylni o'qiydi va ustunlarni maqsadga moslaydi (preview +
 * mapping), server har qatorni alohida tekshiradi va yaratadi — bitta xato
 * qator butun importni to'xtatmaydi; natija qatorma-qator qaytadi.
 * Kontakt telefon bo'yicha qayta ishlatiladi (dubl yaratilmaydi).
 */

export const importSxemasi = z.object({
  pipelineId: z.string().uuid(),
  rows: z.array(z.record(z.string().max(60), z.string().max(5000))).min(1).max(2000),
});

const BOSH = (s: string | undefined) => (s ?? '').trim();

/** Maydon qiymatini matndan turiga moslash (select — label bo'yicha). */
function qiymatniMosla(m: MaydonTavsifi, s: string): unknown {
  if (!s) return null;
  switch (m.type) {
    case 'number':
    case 'money':
      return Number(s.replace(/\s/g, '').replace(',', '.'));
    case 'checkbox':
      return /^(1|ha|yes|true|да|x|\+)$/i.test(s);
    case 'select':
      return m.options.find((o) => o.label.toLowerCase() === s.toLowerCase())?.id ?? s;
    case 'multiselect':
      return s
        .split(/[;,]/)
        .map((x) => x.trim())
        .filter(Boolean)
        .map((x) => m.options.find((o) => o.label.toLowerCase() === x.toLowerCase())?.id ?? x);
    case 'date': {
      const r = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
      return r ? `${r[3]}-${r[2]!.padStart(2, '0')}-${r[1]!.padStart(2, '0')}` : s;
    }
    case 'datetime': {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? s : d.toISOString();
    }
    default:
      return s;
  }
}

export async function bitimlarniImportla(
  tx: Tx,
  p: { businessId: string; userId: string; doira: CrmDoira; kirish: z.infer<typeof importSxemasi> },
): Promise<{ row: number; ok: boolean; dealId?: string; xato?: string }[]> {
  const t = await tuzilma(tx);
  const voronka = t.pipelines.find((v) => v.id === p.kirish.pipelineId);
  if (!voronka) throw new CrmXatosi('yaroqsiz', 'Voronka topilmadi');
  const birinchi = voronka.stages.find((s) => s.kind === 'open') ?? voronka.stages[0]!;
  const seatlar = await tx.select({ id: seat.id, name: seat.displayName }).from(seat);
  const natija: { row: number; ok: boolean; dealId?: string; xato?: string }[] = [];

  for (const [i, r] of p.kirish.rows.entries()) {
    try {
      const bosqichNomi = BOSH(r.stage).toLowerCase();
      const bosqich = bosqichNomi ? voronka.stages.find((s) => s.name.toLowerCase() === bosqichNomi) : birinchi;
      if (!bosqich) throw new CrmXatosi('yaroqsiz', `Bosqich topilmadi: ${r.stage}`);
      const masulNomi = BOSH(r.responsible).toLowerCase();
      const masul = masulNomi ? seatlar.find((s) => s.name.toLowerCase() === masulNomi) : null;
      if (masulNomi && !masul) throw new CrmXatosi('yaroqsiz', `Mas'ul topilmadi: ${r.responsible}`);
      const fields: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(r)) {
        if (!k.startsWith('field:') || !BOSH(v)) continue;
        const m = t.fields.find((f) => f.id === k.slice(6));
        if (m) fields[m.id] = qiymatniMosla(m, BOSH(v));
      }
      maydonlarniTekshir(fields, t.fields);
      const summa = BOSH(r.amount) ? Number(BOSH(r.amount).replace(/\s/g, '').replace(',', '.')) : null;
      if (summa !== null && !Number.isFinite(summa)) throw new CrmXatosi('yaroqsiz', `Summa noto'g'ri: ${r.amount}`);
      const nom = BOSH(r.name) || BOSH(r.contactName) || BOSH(r.phone);
      if (!nom) throw new CrmXatosi('yaroqsiz', 'Bitim nomi, ism yoki telefon kerak');
      // Har qator alohida savepoint — xato qator boshqalarini buzmaydi
      const dealId = await tx.transaction((ichki) =>
        bitimYarat(ichki, {
          businessId: p.businessId,
          userId: p.userId,
          doira: p.doira,
          kirish: {
            name: nom.slice(0, 250),
            pipelineId: voronka.id,
            stageId: bosqich.id,
            amount: summa,
            responsibleSeatId: masul?.id ?? null,
            contact: BOSH(r.contactName) || BOSH(r.phone) || BOSH(r.email) ? { name: BOSH(r.contactName) || null, phone: BOSH(r.phone) || null, email: BOSH(r.email) || null } : undefined,
            fields,
            source: BOSH(r.source) || 'Import',
            tags: BOSH(r.tags) ? BOSH(r.tags).split(/[;,]/) : undefined,
          },
        }),
      );
      natija.push({ row: i + 1, ok: true, dealId });
    } catch (e) {
      natija.push({ row: i + 1, ok: false, xato: e instanceof CrmXatosi ? e.message : 'Saqlab bo‘lmadi' });
    }
  }
  return natija;
}

/** CSV katak: formula injection'dan himoya (=, +, -, @ bilan boshlansa — apostrof). */
export function csvKatak(v: unknown): string {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvYasa(sarlavha: string[], qatorlar: unknown[][]): string {
  // BOM — Excel kirill/o'zbek harflarini to'g'ri ochadi
  return '﻿' + [sarlavha, ...qatorlar].map((q) => q.map(csvKatak).join(',')).join('\r\n');
}
