import type { PlaybookBody } from '../../api';

/**
 * CRM sozlamalari — `playbook.leadQuality` ichida (server, versiyalanadi).
 *
 * Backend'da CRM integratsiyasi hali yo'q: voronka va bosqichlar CRM'dan
 * kelmaydi, shuning uchun ular shu yerdagi katalogda qo'lda yuritiladi
 * (`crmVoronkalar`). CRM ulanganda katalog CRM'dan to'ldiriladi va natija
 * sozlamalari (`crmNatija`) hisobot/analitikaga qo'llanadi.
 */

export interface CrmVoronka {
  nom: string;
  bosqichlar: string[];
  faol?: boolean;
}
export interface NatijaBosqich {
  voronka: string;
  bosqich: string;
}
export interface CrmNatijaSozlama {
  won: { yoqilgan: boolean; bosqichlar: NatijaBosqich[] };
  lost: { yoqilgan: boolean; bosqichlar: NatijaBosqich[] };
}

type Lq = { crmVoronkalar?: CrmVoronka[]; crmNatija?: Partial<CrmNatijaSozlama>; crmFaqatTanlangan?: boolean };

export const BOSH_NATIJA: CrmNatijaSozlama = { won: { yoqilgan: false, bosqichlar: [] }, lost: { yoqilgan: false, bosqichlar: [] } };

export function voronkalarniOl(p: PlaybookBody): CrmVoronka[] {
  const v = ((p.leadQuality ?? {}) as Lq).crmVoronkalar;
  return Array.isArray(v) ? v.filter((x) => x && typeof x.nom === 'string').map((x) => ({ ...x, bosqichlar: Array.isArray(x.bosqichlar) ? x.bosqichlar : [] })) : [];
}

export function natijaniOl(p: PlaybookBody): CrmNatijaSozlama {
  const n = ((p.leadQuality ?? {}) as Lq).crmNatija ?? {};
  return {
    won: { yoqilgan: !!n.won?.yoqilgan, bosqichlar: n.won?.bosqichlar ?? [] },
    lost: { yoqilgan: !!n.lost?.yoqilgan, bosqichlar: n.lost?.bosqichlar ?? [] },
  };
}

export const leadQualityYoz = (p: PlaybookBody, o: Lq & Record<string, unknown>): PlaybookBody => ({ ...p, leadQuality: { ...(p.leadQuality ?? {}), ...o } });

export const tozaBody = (p: PlaybookBody): PlaybookBody => ({
  criteria: p.criteria,
  questionnaire: p.questionnaire,
  classificationPolicy: p.classificationPolicy,
  promptNotes: p.promptNotes,
  leadQuality: p.leadQuality ?? {},
});

export const sanaVaqt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const n = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}.${n(d.getMonth() + 1)}.${n(d.getDate())}, ${n(d.getHours())}:${n(d.getMinutes())}`;
};
