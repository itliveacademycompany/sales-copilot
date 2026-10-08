/**
 * YON PANEL IKONKALARI
 *
 * Stitch dizayni (2026-08): sidebar bo'lim belgilari emoji edi (▦, 👤, 🗓…),
 * bu OS/font'ga qarab har xil ko'rinadi va `currentColor` orqali aktiv
 * holatga rangini o'zgartira olmaydi. Endi hammasi bitta uslubdagi
 * SVG chiziq-ikonka — faol/nofaol rangi CSS `color` dan keladi.
 */

import type { JSX } from 'react';

const baza = {
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export type IkonNomi =
  | 'dashboard'
  | 'shaxsiy'
  | 'analitika'
  | 'kalendar'
  | 'hujjat'
  | 'suhbat'
  | 'vazifa'
  | 'qongiroq'
  | 'yulduz'
  | 'karta'
  | 'sozlama'
  | 'ogohlantirish';

const YOLLAR: Record<IkonNomi, JSX.Element> = {
  dashboard: (
    <>
      <rect x="2.5" y="2.5" width="6" height="6" rx="1.3" />
      <rect x="11.5" y="2.5" width="6" height="6" rx="1.3" />
      <rect x="2.5" y="11.5" width="6" height="6" rx="1.3" />
      <rect x="11.5" y="11.5" width="6" height="6" rx="1.3" />
    </>
  ),
  shaxsiy: (
    <>
      <circle cx="10" cy="6.5" r="3.2" />
      <path d="M3.5 17c0-3.5 2.9-6 6.5-6s6.5 2.5 6.5 6" />
    </>
  ),
  analitika: <path d="M3 16.5V10M8 16.5V6M13 16.5V8.5M18 16.5V3" />,
  kalendar: (
    <>
      <rect x="2.5" y="4" width="15" height="13" rx="1.5" />
      <path d="M2.5 8h15M6.5 2.5v3M13.5 2.5v3" />
    </>
  ),
  hujjat: (
    <>
      <path d="M5 2.5h7l3.5 3.5V17a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1z" />
      <path d="M12 2.5V6h3.5" />
      <path d="M6.5 10.5h7M6.5 13.5h7M6.5 7.5h3" />
    </>
  ),
  suhbat: (
    <path d="M3 4.5A1.5 1.5 0 0 1 4.5 3h11A1.5 1.5 0 0 1 17 4.5v8a1.5 1.5 0 0 1-1.5 1.5H8l-4 3v-3H4.5A1.5 1.5 0 0 1 3 12.5v-8z" />
  ),
  vazifa: (
    <>
      <rect x="4" y="3.5" width="12" height="14" rx="1.5" />
      <path d="M7.5 3.5V2.7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v.8" />
      <path d="M7 10.3l2 2 4-4.3" />
    </>
  ),
  qongiroq: (
    <>
      <path d="M10 2.5c-2.2 0-4 1.8-4 4v3l-1.5 3h11L14 9.5v-3c0-2.2-1.8-4-4-4z" />
      <path d="M8.2 16.5a1.8 1.8 0 0 0 3.6 0" />
    </>
  ),
  yulduz: <path d="M10 2.5l2.2 4.6 5 .7-3.6 3.6.9 5-4.5-2.4-4.5 2.4.9-5-3.6-3.6 5-.7z" />,
  karta: (
    <>
      <rect x="2.5" y="4.5" width="15" height="11" rx="1.5" />
      <path d="M2.5 8h15" />
      <path d="M5.5 12h3" />
    </>
  ),
  sozlama: (
    <>
      <path d="M4 5h8M4 10h12M4 15h8" />
      <circle cx="14" cy="5" r="1.6" />
      <circle cx="7" cy="10" r="1.6" />
      <circle cx="13" cy="15" r="1.6" />
    </>
  ),
  ogohlantirish: (
    <>
      <path d="M10 2.5 18 16.5H2z" strokeLinejoin="round" />
      <path d="M10 8v3.5" />
      <circle cx="10" cy="14" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
};

export function Ikon({ nom }: { nom: IkonNomi }) {
  return (
    <svg {...baza} width="18" height="18" aria-hidden="true">
      {YOLLAR[nom]}
    </svg>
  );
}
