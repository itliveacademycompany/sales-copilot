import type { ArchetypeInfo, ScenarioInfo, SellerProfile } from '../../../features/mashq';

/**
 * Simulyator ekranlari uchun umumiy yordamchilar: mashq kartasi modeli,
 * davomiylik, vaqt formati, sotuvchi profili va qo'ng'iroq matn jurnali.
 */

/** Bosh sahifadagi bitta karta — ssenariy yoki mijoz turi (arxetip). */
export interface MashqKarta {
  tur: 'ssenariy' | 'arxetip';
  /** Ssenariy id yoki arxetip kaliti. */
  id: string;
  sarlavha: string;
  tavsif: string;
  qiyinlik: number;
  yonalish: 'inbound' | 'outbound' | null;
  /** Qo'pol so'z bo'lishi mumkin — boshlashdan oldin tasdiq. */
  ogohlantirish: string | null;
  matnTavsiya: boolean;
}

export function ssenariyKarta(s: ScenarioInfo): MashqKarta {
  return {
    tur: 'ssenariy',
    id: s.id,
    sarlavha: s.title,
    tavsif: s.description,
    qiyinlik: s.difficulty,
    yonalish: s.callDirection,
    ogohlantirish: s.content.harsh ? (s.content.warning ?? "Mijoz qo'pol gapirishi mumkin.") : null,
    matnTavsiya: s.content.textModeRecommended === true,
  };
}

export function arxetipKarta(a: ArchetypeInfo): MashqKarta {
  return {
    tur: 'arxetip',
    id: a.key,
    sarlavha: a.title,
    tavsif: a.description,
    qiyinlik: a.difficulty,
    yonalish: null,
    ogohlantirish: null,
    matnTavsiya: false,
  };
}

/**
 * Qo'ng'iroq davomiyligi (soniya): yengil mashq — 3 daqiqa, qolgani — 5.
 * Oxirgi 30 soniyada "yakunlang" ogohlantirishi chiqadi.
 */
export function davomiylik(qiyinlik: number): number {
  return qiyinlik <= 1 ? 180 : 300;
}
export const YAKUNLASH_OLDIDAN = 30;

/** 75 → "1:15". */
export function mmss(soniya: number): string {
  const s = Math.max(0, Math.floor(soniya));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Qiyinlik → mijoz kayfiyati (kartada va oynada). */
export function kayfiyatNomi(qiyinlik: number): string {
  if (qiyinlik <= 1) return 'Yumshoq';
  if (qiyinlik === 2) return "O'rtacha";
  if (qiyinlik === 3) return 'Talabchan';
  return 'Qattiq';
}

/** Ssenariy uchun daraja (modul `level`) — kayfiyat tanlovidan. */
export type Daraja = 'easy' | 'medium' | 'hard';
export function boshlangichDaraja(qiyinlik: number): Daraja {
  if (qiyinlik <= 1) return 'easy';
  if (qiyinlik >= 4) return 'hard';
  return 'medium';
}

// ─── Sotuvchi profili (ssenariy mijozi sizga murojaat qilishi uchun) ──────────
const PROFIL_KALIT = 'mq-seller-profile'; // modulning eski sahifasi bilan bir xil

export function profilniOqi(): Partial<SellerProfile> {
  try {
    const raw = window.localStorage.getItem(PROFIL_KALIT);
    return raw ? (JSON.parse(raw) as Partial<SellerProfile>) : {};
  } catch {
    return {};
  }
}

export function profilniSaqla(p: SellerProfile): void {
  try {
    window.localStorage.setItem(PROFIL_KALIT, JSON.stringify(p));
  } catch {
    /* brauzer xotirasi yopiq — keyingi safar qayta so'raladi */
  }
}

export function profilTogri(p: Partial<SellerProfile>): p is SellerProfile {
  return (
    typeof p.name === 'string' &&
    p.name.trim().length >= 2 &&
    (p.gender === 'male' || p.gender === 'female') &&
    typeof p.age === 'number' &&
    p.age >= 16 &&
    p.age <= 80
  );
}

// ─── Qo'ng'iroq matn jurnali (natijada "0:28" vaqt belgisini ko'rsatish uchun) ──
export interface JurnalQator {
  kim: 'seller' | 'customer';
  matn: string;
  /** Qo'ng'iroq boshidan soniya. */
  t: number;
}

export interface QongiroqIzi {
  /** Qo'ng'iroq qancha davom etdi (soniya). */
  davom: number;
  /** Rejalashtirilgan davomiylik (soniya). */
  jami: number;
  /** Kim tugatdi: sotuvchi, vaqt tugadi yoki mijoz go'shakni qo'ydi. */
  tugatdi: 'siz' | 'vaqt' | 'mijoz';
  jurnal: JurnalQator[];
  /** Mashq kartasi — "Qayta urinish" shu bilan boshlaydi. */
  karta: MashqKarta;
  mijozIsmi: string;
}

const iz = (sessionId: string): string => `sm-qongiroq-${sessionId}`;

export function iziSaqla(sessionId: string, qiymat: QongiroqIzi): void {
  try {
    window.sessionStorage.setItem(iz(sessionId), JSON.stringify(qiymat));
  } catch {
    /* saqlanmasa natijada vaqt belgisi o'rniga navbat raqami chiqadi */
  }
}

export function iziniOqi(sessionId: string): QongiroqIzi | null {
  try {
    const raw = window.sessionStorage.getItem(iz(sessionId));
    return raw ? (JSON.parse(raw) as QongiroqIzi) : null;
  } catch {
    return null;
  }
}

const norm = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/**
 * Transkriptdagi navbat (`turnSeq`, 1 dan) → qo'ng'iroqdagi vaqt. Server
 * navbat vaqtini saqlamaydi, shuning uchun brauzer jurnalidan matn bo'yicha
 * topiladi; topilmasa `null` (UI navbat raqamini ko'rsatadi).
 */
export function navbatVaqti(
  transkript: ReadonlyArray<{ speaker: 'seller' | 'customer'; text: string }>,
  turnSeq: number | null,
  jurnal: readonly JurnalQator[] | undefined,
): number | null {
  if (turnSeq === null || !jurnal?.length) return null;
  const navbat = transkript[turnSeq - 1];
  if (!navbat) return null;
  const kerak = norm(navbat.text);
  const topildi = jurnal.find((q) => q.kim === navbat.speaker && norm(q.matn) === kerak);
  return topildi ? topildi.t : null;
}
