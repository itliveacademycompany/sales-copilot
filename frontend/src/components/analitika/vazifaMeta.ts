/**
 * Vazifaning backendda maydoni yo'q qo'shimcha ma'lumotlari: muhimlik, izoh
 * va keyin o'zgartirilgan harakat turi (server `action`ni faqat yaratishda
 * qabul qiladi).
 *
 * Faqat SHU BRAUZERDA saqlanadi — boshqa qurilma yoki xodim ko'rmaydi.
 * Interfeysda shunday deb yoziladi. Server maydonlari qo'shilganda bu modul
 * olib tashlanadi.
 */

export type Muhimlik = 'oddiy' | 'muhim' | 'shoshilinch';
export interface VazifaMeta {
  muhimlik?: Muhimlik;
  izoh?: string;
  harakat?: string;
}

const KALIT = 'sotuvai-vazifa-meta';

function hammasi(): Record<string, VazifaMeta> {
  try {
    return JSON.parse(localStorage.getItem(KALIT) ?? '{}') as Record<string, VazifaMeta>;
  } catch {
    return {};
  }
}

export function metaOl(biz: string, id: string): VazifaMeta {
  return hammasi()[`${biz}:${id}`] ?? {};
}

export function metaSaqla(biz: string, id: string, meta: VazifaMeta) {
  try {
    const h = hammasi();
    const toza: VazifaMeta = {};
    if (meta.muhimlik && meta.muhimlik !== 'oddiy') toza.muhimlik = meta.muhimlik;
    if (meta.izoh?.trim()) toza.izoh = meta.izoh.trim();
    if (meta.harakat) toza.harakat = meta.harakat;
    if (Object.keys(toza).length) h[`${biz}:${id}`] = toza;
    else delete h[`${biz}:${id}`];
    localStorage.setItem(KALIT, JSON.stringify(h));
  } catch {
    /* brauzer xotirasi yopiq — ma'lumot faqat shu sessiyada yo'qoladi */
  }
}

export const HARAKATLAR: { qiymat: string; nom: string }[] = [
  { qiymat: 'call_back', nom: "Qo'ng'iroq orqali qayta bog'lanish" },
  { qiymat: 'message', nom: 'Xabar' },
  { qiymat: 'send_material', nom: 'Material yuborish' },
  { qiymat: 'meeting', nom: 'Uchrashuv belgilash' },
  { qiymat: 'crm_update', nom: 'CRM yangilash' },
  { qiymat: 'follow_up', nom: 'Follow-up' },
  { qiymat: 'reminder', nom: 'Eslatma' },
  { qiymat: 'other', nom: 'Boshqa' },
];
/** Avvalgi nomlar (oldin saqlangan vazifalar uchun). */
const ESKI: Record<string, string> = { send_info: 'Material yuborish' };
export const harakatNomi = (k: string | null | undefined) => (k ? HARAKATLAR.find((h) => h.qiymat === k)?.nom ?? ESKI[k] ?? k : null);

export const MUHIMLIK: { qiymat: Muhimlik; nom: string }[] = [
  { qiymat: 'oddiy', nom: 'Oddiy' },
  { qiymat: 'muhim', nom: 'Muhim' },
  { qiymat: 'shoshilinch', nom: 'Shoshilinch' },
];
