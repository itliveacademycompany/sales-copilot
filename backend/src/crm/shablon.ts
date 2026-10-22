import { randomUUID } from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM SHABLONLARI — "CRM ni yoqish" da tanlanadi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * TZ 3.3: yangi tenant bo'sh konfiguratsiya yoki "Ta'lim markazi / IT Live
 * namunasi" bilan ochiladi. Shablonda HAQIQIY shaxs ismi, eski ID, parol
 * yoki mijoz ma'lumoti yo'q — faqat tuzilma.
 *
 * Bosqich turi (`won`) tushum degani emas (TZ 2.2): "UCHRASHUVGA KELGANLAR"
 * tashrif bosqichi, pul emas.
 */

export type BosqichTuri = 'open' | 'won' | 'lost';
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

export const MAYDON_TURLARI: MaydonTuri[] = [
  'text',
  'textarea',
  'number',
  'money',
  'select',
  'multiselect',
  'date',
  'datetime',
  'checkbox',
  'phone',
  'url',
];

export interface ShablonVoronka {
  name: string;
  isMain?: boolean;
  stages: { name: string; kind?: BosqichTuri; color?: string }[];
}

export interface ShablonMaydon {
  code: string;
  label: string;
  type: MaydonTuri;
  group: string;
  options?: string[];
  required?: boolean;
}

export interface Shablon {
  kod: 'bosh' | 'talim';
  nom: string;
  tavsif: string;
  voronkalar: ShablonVoronka[];
  maydonlar: ShablonMaydon[];
}

/** Ochiq bosqichlar uchun ketma-ket ranglar; yutuq — yashil, yo'qotish — qizil. */
const RANGLAR = ['#8ab4f8', '#a1c4fd', '#c2e9fb', '#ffd6a5', '#fdffb6', '#caffbf', '#9bf6ff', '#bdb2ff', '#ffc6ff'];
export const YUTUQ_RANGI = '#b7e4c7';
export const YOQOTISH_RANGI = '#ffadad';

export function bosqichRangi(kind: BosqichTuri, i: number): string {
  if (kind === 'won') return YUTUQ_RANGI;
  if (kind === 'lost') return YOQOTISH_RANGI;
  return RANGLAR[i % RANGLAR.length]!;
}

const BOSH: Shablon = {
  kod: 'bosh',
  nom: "Bo'sh",
  tavsif: 'Bitta «Sotuv» voronkasi — keyin o‘zingiz moslaysiz',
  voronkalar: [
    {
      name: 'Sotuv',
      isMain: true,
      stages: [
        { name: 'Yangi murojaat' },
        { name: "Aloqa o'rnatildi" },
        { name: 'Uchrashuv belgilandi' },
        { name: 'Taklif yuborildi' },
        { name: 'Muvaffaqiyatli', kind: 'won' },
        { name: "Yo'qotildi", kind: 'lost' },
      ],
    },
  ],
  maydonlar: [
    { code: 'source', label: 'Manba', type: 'select', group: 'Umumiy', options: ['Telegram', 'Instagram', 'Facebook', 'Tavsiya', "Qo'ng'iroq", 'Boshqa'] },
    { code: 'comment', label: 'Izoh', type: 'textarea', group: 'Umumiy' },
  ],
};

const TALIM: Shablon = {
  kod: 'talim',
  nom: "Ta'lim markazi",
  tavsif: 'IT Live namunasi: 5 voronka, filial, kurs, uchrashuv va ota-ona maydonlari',
  voronkalar: [
    {
      name: 'Call-Center',
      isMain: true,
      stages: [
        { name: 'YANGI MUROJAT' },
        { name: 'QAYTA ALOQA ZARUR' },
        { name: "MA'LUMOT BERILDI" },
        { name: 'UCHRASHUV BELGILANDI' },
        { name: 'KEYINROQ KELADI' },
        { name: 'KELMADI' },
        { name: 'UCHRASHUVGA KELGANLAR', kind: 'won' },
        { name: 'YOPILDI', kind: 'lost' },
      ],
    },
    {
      name: "Sotuv bo'limi",
      stages: [
        { name: 'TASHRIF BUYURUVCHILAR' },
        { name: 'TASHRIF BUYURGANLAR' },
        { name: 'DEMO / KELDI' },
        { name: 'I-DARS' },
        { name: 'II-DARS' },
        { name: "100% TO'LOV QILGANLAR", kind: 'won' },
        { name: 'YOPILDI', kind: 'lost' },
      ],
    },
    {
      name: "Sun'iy intellekt",
      stages: [
        { name: 'YANGI MUROJAT' },
        { name: 'QAYTA ALOQA ZARUR' },
        { name: "MA'LUMOT BERILDI" },
        { name: 'UCHRASHUVGA KELMADI' },
        { name: 'UCHRASHUV BELGILANDI' },
        { name: 'UCHRASHUVGA KELDI' },
        { name: '1-DARSGA KELDI' },
        { name: "QISMAN TO'LOV" },
        { name: "100% TO'LOV", kind: 'won' },
        { name: 'YOPILDI', kind: 'lost' },
      ],
    },
    {
      name: 'Ijtimoiy tarmoq',
      stages: [{ name: 'DIRECT' }, { name: 'KOMMENT' }, { name: 'MUVAFFAQIYATLI', kind: 'won' }, { name: 'YOPILDI', kind: 'lost' }],
    },
    {
      name: 'Baza',
      stages: [{ name: 'QAROR QABUL QILMOQDA' }, { name: 'BAZA', kind: 'won' }, { name: 'YOPILDI', kind: 'lost' }],
    },
  ],
  maydonlar: [
    { code: 'branch', label: 'Filial', type: 'select', group: 'Umumiy', options: ['Filial 1', 'Filial 2', 'Filial 3'] },
    {
      code: 'course',
      label: 'Kurs',
      type: 'select',
      group: 'Umumiy',
      options: [
        'Foundation',
        'Kompyuter savodxonligi',
        'Frontend',
        'Backend',
        "Sun'iy intellekt",
        'Kiberxavfsizlik',
        "Data science va Sun'iy intellekt",
        'Grafik dizayn',
        'IT va Robototexnika',
      ],
    },
    { code: 'acquisition_source', label: 'Mijoz qayerdan keldi?', type: 'select', group: 'Call-Center', options: ['Target', 'Telegram forma', 'Instagram forma'] },
    { code: 'appointment_at', label: 'Uchrashuv vaqti', type: 'datetime', group: 'Call-Center' },
    { code: 'gender', label: 'Jinsi', type: 'select', group: 'Call-Center', options: ['Erkak', 'Ayol'] },
    { code: 'student_age', label: "O'quvchi yoshi", type: 'number', group: 'Call-Center' },
    {
      code: 'district',
      label: 'Yashash hududi',
      type: 'select',
      group: 'Call-Center',
      options: ['Guliston shahri', 'Yangiyer shahri', 'Shirin shahri', 'Guliston tumani', 'Boyovut tumani', 'Sardoba tumani', 'Mirzaobod tumani', 'Sayxunobod tumani', 'Oqoltin tumani', 'Xovos tumani', 'Sirdaryo tumani'],
    },
    { code: 'address_text', label: 'Yashash manzili', type: 'text', group: 'Call-Center' },
    {
      code: 'objection_reason',
      label: "E'tiroz sababi",
      type: 'select',
      group: 'Call-Center',
      options: ['Boshqa viloyatdan', 'Online kurs kerak', "Boshqa o'quv markazda o'qiyapti", "Boshqa kurs deb o'yladi", 'Qimmat', "Noto'g'ri raqam", "Ko'tarmadi", 'Boshqa'],
    },
    { code: 'student_full_name', label: "O'quvchining F.I.SH", type: 'text', group: 'Administratsiya' },
    { code: 'school_or_workplace', label: "O'qish joyi", type: 'text', group: 'Administratsiya' },
    {
      code: 'attribution_source',
      label: 'Manba',
      type: 'select',
      group: 'Administratsiya',
      options: ['Call-Center', 'Banner', 'Tavsiya (referral)', 'Ijtimoiy tarmoq', "Eski o'quvchi", 'Flayer', 'Target', 'Telegram forma', 'Instagram forma'],
    },
    { code: 'preferred_session', label: 'Mijozga qaysi vaqt qulay?', type: 'select', group: 'Administratsiya', options: ['Ertalab', 'Tushdan keyin'] },
    { code: 'visited_on', label: 'Tashrif buyurgan sana', type: 'date', group: 'Administratsiya' },
    { code: 'payment_method', label: "To'lov turi", type: 'select', group: 'Administratsiya', options: ['Naqd', 'Karta'] },
    { code: 'father_name', label: 'Otasining ismi', type: 'text', group: 'Administratsiya' },
    { code: 'father_phone', label: 'Otasining raqami', type: 'phone', group: 'Administratsiya' },
    { code: 'mother_name', label: 'Onasining ismi', type: 'text', group: 'Administratsiya' },
    { code: 'mother_phone', label: 'Onasining raqami', type: 'phone', group: 'Administratsiya' },
    {
      code: 'no_show_reason',
      label: 'Kelmaslik sababi',
      type: 'select',
      group: 'Administratsiya',
      options: ['Qimmat', "Boshqa o'quv markaziga o'tdi", "Darslar qiziqarli o'tilmagan", "Bizda o'qiyapti", 'Keyinroq keladi'],
    },
    { code: 'return_on', label: 'Keyinroq keladi (sana)', type: 'date', group: 'Administratsiya' },
  ],
};

export const SHABLONLAR: Record<Shablon['kod'], Shablon> = { bosh: BOSH, talim: TALIM };

/** Variant ro'yxati → `[{ id, label }]` (id barqaror, label tahrirlanadi). */
export function variantlar(nomlar: string[] | undefined): { id: string; label: string }[] {
  return (nomlar ?? []).map((label) => ({ id: randomUUID().slice(0, 8), label }));
}
