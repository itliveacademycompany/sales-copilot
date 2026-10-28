import { createContext, useContext } from 'react';
import { useT } from '../i18n';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — umumiy tiplar, kontekst va maydon kiritish
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Backend: `backend/src/crm/xizmat.ts`, marshrutlar `http/routes/crm-app.ts`.
 */

export type BosqichTuri = 'open' | 'won' | 'lost';

export interface Bosqich {
  id: string;
  pipelineId: string;
  name: string;
  color: string;
  kind: BosqichTuri;
  sort: number;
}

export interface Voronka {
  id: string;
  name: string;
  sort: number;
  isMain: boolean;
  /** amoCRM dan sinxronlanadi — tuzilmasi u yerda boshqariladi. */
  external?: boolean;
  stages: Bosqich[];
}

export interface Variant {
  id: string;
  label: string;
}

export type MaydonTuri =
  | 'text'
  | 'textarea'
  | 'number'
  | 'money'
  | 'select'
  | 'multiselect'
  | 'date'
  | 'datetime'
  | 'checkbox'
  | 'phone'
  | 'url';

export interface Maydon {
  id: string;
  code: string;
  label: string;
  type: MaydonTuri;
  options: Variant[];
  groupName: string | null;
  sort: number;
  required: boolean;
  /** amoCRM maydoni — qiymati u yerda o'zgartiriladi. */
  external?: boolean;
}

export interface VazifaTuri {
  id: string;
  name: string;
  color: string;
}

export interface RadSababi {
  id: string;
  name: string;
  sort: number;
  archived: boolean;
  used: number;
}

export interface CrmHolat {
  enabled: boolean;
  canConfigure: boolean;
  canIntegrate: boolean;
  taskTypes: VazifaTuri[];
  lossReasons: RadSababi[];
  lossReasonRequired: boolean;
  /** Bosqich bo'yicha majburiy maydonlar: `{ stageId: fieldId[] }`. */
  stageRequired?: Record<string, string[]>;
  inboxPending: number;
  scope: 'all' | 'own';
  canManageAll: boolean;
  seatId: string | null;
  templates: { kod: 'bosh' | 'talim'; nom: string; tavsif: string; pipelines: number; fields: number }[];
  pipelines: Voronka[];
  fields: Maydon[];
  /** Ichki CRM ga sinxronlanayotgan tashqi CRM nomi ("amoCRM") yoki null. */
  externalSync?: string | null;
}

export interface BitimKartasi {
  id: string;
  name: string;
  amount: number | null;
  pipelineId: string;
  stageId: string;
  responsibleSeatId: string | null;
  responsibleName: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
  stageEnteredAt: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  nextTaskAt: string | null;
  openTasks: number;
  closedAt: string | null;
  deletedAt: string | null;
  tags: string[];
  source: string | null;
  companyId: string | null;
  lostReason: string | null;
  /** Tashqi CRM dagi ID (sinxronlangan bitim). */
  externalId?: string | null;
}

export interface KanbanUstun {
  id: string;
  name: string;
  color: string;
  kind: BosqichTuri;
  sort: number;
  count: number;
  sum: number;
  deals: BitimKartasi[];
}

export interface Seat {
  id: string;
  displayName: string;
  isActive: boolean;
}

export interface CrmKontekstQiymat {
  holat: CrmHolat;
  /** `/api/v1/businesses/:id` */
  base: string;
  seatlar: Seat[];
  yangila: () => Promise<void>;
  /** Tashqi CRM (amoCRM/Bitrix24) ulash sahifasi ko'rinadimi. */
  integratsiya: boolean;
}

export const CrmKontekst = createContext<CrmKontekstQiymat | null>(null);

export function useCrm(): CrmKontekstQiymat {
  const k = useContext(CrmKontekst);
  if (!k) throw new Error('useCrm CrmIlova ichida ishlatiladi');
  return k;
}

/** Bosqichni ID bo'yicha topish (hamma voronkalardan). */
export function bosqichTop(holat: CrmHolat, id: string): (Bosqich & { voronka: string }) | null {
  for (const v of holat.pipelines) {
    const b = v.stages.find((s) => s.id === id);
    if (b) return { ...b, voronka: v.name };
  }
  return null;
}

export const MAYDON_TURI_NOMI: Record<MaydonTuri, string> = {
  text: 'Matn',
  textarea: 'Uzun matn',
  number: 'Raqam',
  money: 'Pul',
  select: "Ro'yxat (bitta)",
  multiselect: "Ro'yxat (bir nechta)",
  date: 'Sana',
  datetime: 'Sana va vaqt',
  checkbox: 'Belgi (ha/yo‘q)',
  phone: 'Telefon',
  url: 'Havola',
};

/** Maydon qiymatini matn ko'rinishida (jadval va tarix uchun). */
export function qiymatMatni(m: Maydon | undefined, v: unknown, t: (s: string) => string): string {
  if (v === null || v === undefined || v === '') return '—';
  if (!m) return String(v);
  switch (m.type) {
    case 'select':
      return m.options.find((o) => o.id === v)?.label ?? '—';
    case 'multiselect':
      return Array.isArray(v) ? v.map((x) => m.options.find((o) => o.id === x)?.label ?? '').filter(Boolean).join(', ') : '—';
    case 'checkbox':
      return v ? t('Ha') : t("Yo'q");
    case 'datetime': {
      const d = new Date(String(v));
      return Number.isNaN(d.getTime()) ? String(v) : d.toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
    }
    case 'date': {
      const [y, mo, k] = String(v).split('-');
      return y && mo && k ? `${k}.${mo}.${y}` : String(v);
    }
    case 'money':
      return pul(Number(v));
    default:
      return String(v);
  }
}

/** "1 500 000" — minglik ajratgich bilan, valyutasiz. */
export function pul(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** ISO → `datetime-local` qiymati (mahalliy vaqtda). */
export function mahalliyVaqt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Muddat holati: o'tgan / bugun / keyin. */
export function muddatHolati(iso: string | null): 'otgan' | 'bugun' | 'keyin' | null {
  if (!iso) return null;
  const d = new Date(iso);
  const hozir = new Date();
  if (d.getTime() < hozir.getTime()) return 'otgan';
  if (d.toDateString() === hozir.toDateString()) return 'bugun';
  return 'keyin';
}

/** Maydon turiga mos kiritish elementi. Qiymat — backend saqlaydigan shaklda. */
export function MaydonKiritish({
  m,
  qiymat,
  onChange,
  id,
  ixcham = false,
}: {
  m: Maydon;
  qiymat: unknown;
  onChange: (v: unknown) => void;
  id: string;
  /** Lid kartasidagi Metasell ko'rinishi: bo'sh qiymat "···", matn bir qatorli. */
  ixcham?: boolean;
}) {
  const t = useT();
  const bosh = ixcham ? '···' : undefined;
  switch (m.type) {
    case 'textarea':
      return (
        <textarea
          id={id}
          rows={ixcham ? 1 : 3}
          placeholder={bosh}
          value={(qiymat as string) ?? ''}
          maxLength={5000}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
    case 'money':
      return (
        <input
          id={id}
          className="input"
          inputMode="decimal"
          placeholder={bosh}
          value={qiymat === null || qiymat === undefined ? '' : String(qiymat)}
          onChange={(e) => {
            const s = e.target.value.replace(/[^\d.,\s-]/g, '');
            onChange(s === '' ? null : s);
          }}
        />
      );
    case 'select':
      return (
        <select id={id} className="input" value={(qiymat as string) ?? ''} onChange={(e) => onChange(e.target.value || null)}>
          <option value="">{ixcham ? '···' : t('— tanlanmagan —')}</option>
          {m.options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'multiselect': {
      const tanlangan = Array.isArray(qiymat) ? (qiymat as string[]) : [];
      return (
        <div className="ci-kopli" id={id} role="group">
          {m.options.map((o) => {
            const bor = tanlangan.includes(o.id);
            return (
              <button
                type="button"
                key={o.id}
                className={`ci-chip${bor ? ' faol' : ''}`}
                aria-pressed={bor}
                onClick={() => onChange(bor ? tanlangan.filter((x) => x !== o.id) : [...tanlangan, o.id])}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      );
    }
    case 'date':
      return <input id={id} className="input" type="date" value={(qiymat as string) ?? ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'datetime':
      return (
        <input
          id={id}
          className="input"
          type="datetime-local"
          value={mahalliyVaqt(qiymat as string)}
          onChange={(e) => onChange(e.target.value ? new Date(e.target.value).toISOString() : null)}
        />
      );
    case 'checkbox':
      return (
        <label className="ci-belgi">
          <input id={id} type="checkbox" checked={qiymat === true} onChange={(e) => onChange(e.target.checked)} />
          <span>{qiymat === true ? t('Ha') : t("Yo'q")}</span>
        </label>
      );
    case 'phone':
      return <input id={id} className="input" type="tel" placeholder={bosh} value={(qiymat as string) ?? ''} maxLength={40} onChange={(e) => onChange(e.target.value)} />;
    case 'url':
      return <input id={id} className="input" type="url" placeholder={bosh ?? 'https://'} value={(qiymat as string) ?? ''} maxLength={500} onChange={(e) => onChange(e.target.value)} />;
    default:
      return <input id={id} className="input" placeholder={bosh} value={(qiymat as string) ?? ''} maxLength={500} onChange={(e) => onChange(e.target.value)} />;
  }
}

/** Kiritilgan qiymatni yuborishdan oldin tozalash (raqamlar — son). */
export function qiymatniTayyorla(m: Maydon, v: unknown): unknown {
  if (v === '' || v === undefined) return null;
  if ((m.type === 'number' || m.type === 'money') && typeof v === 'string') {
    const n = Number(v.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : v;
  }
  return v;
}

/** Maydonlarni guruhlarga ajratish (guruhsizlari "Umumiy"). */
export function guruhla(maydonlar: Maydon[]): { nom: string; maydonlar: Maydon[] }[] {
  const g = new Map<string, Maydon[]>();
  for (const m of maydonlar) {
    const k = m.groupName || 'Umumiy';
    g.set(k, [...(g.get(k) ?? []), m]);
  }
  return [...g.entries()].map(([nom, maydonlar]) => ({ nom, maydonlar }));
}

/** Vazifa turi nomi va rangi (o'chirilgan tur — "Vazifa"). */
export function vazifaTuri(holat: CrmHolat, id: string | null | undefined): VazifaTuri {
  return holat.taskTypes.find((t) => t.id === id) ?? { id: id ?? 'call', name: id ? 'Vazifa' : "Bog'lanish", color: '#5b6575' };
}

/** Davr: bugun / kecha / hafta / oy — mahalliy vaqtda [from, to). */
export type DavrTuri = 'bugun' | 'kecha' | 'hafta' | 'oy' | 'otgan-oy' | 'maxsus';

export function davrHisobla(tur: DavrTuri, maxsus?: { from: string; to: string }): { from: string; to: string } {
  const bosh = new Date();
  bosh.setHours(0, 0, 0, 0);
  const kun = 86400000;
  if (tur === 'maxsus' && maxsus) {
    const f = new Date(maxsus.from + 'T00:00:00');
    const t = new Date(maxsus.to + 'T00:00:00');
    return { from: f.toISOString(), to: new Date(t.getTime() + kun).toISOString() };
  }
  if (tur === 'kecha') return { from: new Date(bosh.getTime() - kun).toISOString(), to: bosh.toISOString() };
  if (tur === 'hafta') return { from: new Date(bosh.getTime() - 6 * kun).toISOString(), to: new Date(bosh.getTime() + kun).toISOString() };
  if (tur === 'oy') {
    const o = new Date(bosh.getFullYear(), bosh.getMonth(), 1);
    return { from: o.toISOString(), to: new Date(bosh.getTime() + kun).toISOString() };
  }
  if (tur === 'otgan-oy') {
    const o = new Date(bosh.getFullYear(), bosh.getMonth() - 1, 1);
    const k = new Date(bosh.getFullYear(), bosh.getMonth(), 1);
    return { from: o.toISOString(), to: k.toISOString() };
  }
  return { from: bosh.toISOString(), to: new Date(bosh.getTime() + kun).toISOString() };
}

/** Foiz: 0.4235 → "42%"; yo'q — "—". */
export function foiz(v: number | null | undefined): string {
  return v === null || v === undefined || !Number.isFinite(v) ? '—' : `${Math.round(v * 100)}%`;
}

/** Fayl yuklab olish (CSV va h.k.) — sessiya cookie bilan. */
export async function yuklabOl(url: string, nom: string): Promise<void> {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(r.statusText);
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
