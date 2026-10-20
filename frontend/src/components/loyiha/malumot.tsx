import {
  Bell,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ClipboardCheck,
  Database,
  FileText,
  GitBranch,
  KeyRound,
  LayoutGrid,
  Lightbulb,
  ListChecks,
  MessagesSquare,
  Phone,
  PhoneCall,
  ScanSearch,
  Send,
  Server,
  Settings,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { BolimKalit } from './tarjima';

/**
 * "Loyiha haqida" sahifasining tuzilmasi — ikonlar, manzillar, ruxsatlar.
 *
 * Matnlar bu yerda emas, `tarjima.ts` da (uch tilda). Ro'yxatlar tartibi
 * u yerdagi ro'yxatlar bilan bir xil: i-element ↔ i-matn.
 */

// ─── Jarayon ──────────────────────────────────────────────────────────────────

/** Har qadam sozlanadigan joy. `undefined` — qadam avtomatik. */
export const QADAM_MANZILLARI: (string | undefined)[] = [
  '/sozlamalar?b=integratsiya',
  '/sozlamalar?b=stt',
  '/sozlamalar?b=mezonlar',
  undefined,
  '/sozlamalar?b=kunlik',
];

// ─── Platforma bo'limlari ─────────────────────────────────────────────────────

export interface Bolim {
  kalit: BolimKalit;
  manzil: string;
  ikon: ReactNode;
  /** Kimga ko'rinadi: hammaga, faqat rahbarga yoki ogohlantirish huquqi borga. */
  kimga: 'hamma' | 'rahbar' | 'ogoh';
}

export const BOLIMLAR: Bolim[] = [
  { kalit: 'bosh', manzil: '/', ikon: <LayoutGrid />, kimga: 'hamma' },
  { kalit: 'qongiroqlar', manzil: '/qongiroqlar', ikon: <Phone />, kimga: 'hamma' },
  { kalit: 'aiChat', manzil: '/ai-chat', ikon: <MessagesSquare />, kimga: 'hamma' },
  { kalit: 'analitika', manzil: '/analitika', ikon: <ChartNoAxesColumnIncreasing />, kimga: 'rahbar' },
  { kalit: 'kunlik', manzil: '/kunlik-hisobot', ikon: <CalendarDays />, kimga: 'rahbar' },
  { kalit: 'lidlar', manzil: '/lidlar', ikon: <FileText />, kimga: 'hamma' },
  { kalit: 'ogoh', manzil: '/ogohlantirishlar', ikon: <Bell />, kimga: 'ogoh' },
  { kalit: 'sozlamalar', manzil: '/sozlamalar', ikon: <Settings />, kimga: 'hamma' },
];

// ─── Ishni boshlash ───────────────────────────────────────────────────────────

export interface BoshlashQadam {
  ikon: ReactNode;
  manzil: string;
  ixtiyoriy?: boolean;
}

export const BOSHLASH: Record<'rahbar' | 'sotuvchi', BoshlashQadam[]> = {
  rahbar: [
    { ikon: <Send />, manzil: '/sozlamalar?b=integratsiya' },
    { ikon: <PhoneCall />, manzil: '/sozlamalar?b=moizvonki', ixtiyoriy: true },
    { ikon: <UsersRound />, manzil: '/sozlamalar?b=sotuvchilar' },
    { ikon: <ListChecks />, manzil: '/sozlamalar?b=mezonlar' },
    { ikon: <ChartNoAxesColumnIncreasing />, manzil: '/analitika' },
  ],
  sotuvchi: [
    { ikon: <LayoutGrid />, manzil: '/' },
    { ikon: <ScanSearch />, manzil: '/qongiroqlar' },
    { ikon: <ShieldCheck />, manzil: '/qongiroqlar' },
    { ikon: <ClipboardCheck />, manzil: '/vazifalar' },
    { ikon: <MessagesSquare />, manzil: '/ai-chat' },
  ],
};

// ─── Tuzilish ─────────────────────────────────────────────────────────────────

/** Ma'lumot oqimi yuqoridan pastga: manbadan interfeysgacha. */
export const QATLAM_IKONLARI: ReactNode[] = [<Send />, <Server />, <Sparkles />, <Database />, <LayoutGrid />];

/** Birinchi tamoyil ostida bazadagi cheklovning o'zi ko'rsatiladi — tarjima qilinmaydi. */
export const TAMOYILLAR: { ikon: ReactNode; kod?: string }[] = [
  { ikon: <ShieldCheck />, kod: 'CHECK (score IS NULL OR evidence_quote IS NOT NULL)' },
  { ikon: <Database /> },
  { ikon: <GitBranch /> },
  { ikon: <KeyRound /> },
  { ikon: <Lightbulb /> },
];

/** Rollar tartibi: Ega, Rahbar, Bo'lim boshlig'i, Auditor, Menejer. */
export const ROL_RAHBARMI: boolean[] = [true, true, true, true, false];
