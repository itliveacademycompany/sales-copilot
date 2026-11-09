/** Simulyator — API turlari va kichik yordamchilar (sahifa, qo'ng'iroq va natija ekranlari uchun umumiy). */

export type Kayfiyat = 'yumshoq' | 'ortacha' | 'qattiq';
export type Jins = 'ayol' | 'erkak';

export interface Ssenariy {
  id: string;
  tayyor: boolean;
  muallif: string | null;
  nom: string;
  vaziyat: string;
  maqsad: string;
  mijozIsmi: string;
  mijozJinsi: Jins;
  /** Faqat sozlay oladiganlarga keladi. */
  mijozHaqida?: string;
  etirozlar: string[];
  kayfiyat: Kayfiyat;
  davomiylikDaq: number;
}

export interface SonggiMashq {
  id: string;
  nom: string;
  boshlangan: string;
  davomiylikSek: number;
  natijaHolat: NatijaHolat;
  maqsadgaErishildi: boolean | null;
}

export interface SimulyatorHolat {
  ssenariylar: Ssenariy[];
  hafta: { soni: number; sek: number };
  songgi: SonggiMashq[];
  ai: { matn: boolean; ovoz: boolean };
  yarataOladi: boolean;
}

export interface MatnQator {
  kim: 'menejer' | 'mijoz';
  matn: string;
  sek: number;
}

export type NatijaHolat = 'kutilmoqda' | 'tayyor' | 'qisqa' | 'ai_yoq' | 'xato';

export interface MashqNatija {
  maqsadgaErishildi: boolean;
  boshXulosa: string;
  izoh: string;
  keyingiSafar: { maslahat: string; sek: number | null };
  namunaGap: string;
  umumiyBall: number;
  baholar: { nom: string; ball: number; izoh: string }[];
}

export interface Mashq {
  id: string;
  ssenariyKalit: string;
  ssenariy: Pick<Ssenariy, 'nom' | 'vaziyat' | 'maqsad' | 'mijozIsmi' | 'mijozJinsi' | 'kayfiyat' | 'davomiylikDaq'>;
  holat: 'jarayonda' | 'tugadi' | 'bekor';
  rejim: 'matn' | 'ovoz';
  boshlangan: string;
  tugagan: string | null;
  davomiylikSek: number;
  matn: MatnQator[];
  natijaHolat: NatijaHolat;
  natija: MashqNatija | null;
  fikr: 'ha' | 'qisman' | 'yoq' | null;
}

/** "Juda qisqa" chegarasi — backend bilan bir xil (QISQA_SEK). */
export const QISQA_SEK = 30;
/** Oxirgi shuncha soniyada mijoz suhbatni yakunlay boshlaydi. */
export const YAKUN_SEK = 30;

export const KAYFIYAT_NOMI: Record<Kayfiyat, string> = {
  yumshoq: 'Yumshoq',
  ortacha: "O'rtacha",
  qattiq: 'Qattiq',
};

/** 99 → "1:39" */
export function mmss(sek: number): string {
  const s = Math.max(0, Math.round(sek));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Joriy haftaning dushanbasi, 00:00 (mahalliy vaqt). */
export function haftaBoshi(bugun = new Date()): Date {
  const d = new Date(bugun);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

const HAFTA_KUNLARI = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];

/** "Bugun" / "Kecha" / hafta kuni / "12.10" — tarjima kaliti qaytadi (t() bilan o'giriladi). */
export function kunNomi(iso: string, bugun = new Date()): string {
  const d = new Date(iso);
  const kun = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const farq = Math.round((kun(bugun) - kun(d)) / 86_400_000);
  if (farq === 0) return 'Bugun';
  if (farq === 1) return 'Kecha';
  if (farq > 1 && farq < 7) return HAFTA_KUNLARI[d.getDay()]!;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function boshHarf(ism: string): string {
  return ism.trim().charAt(0).toUpperCase() || '?';
}
