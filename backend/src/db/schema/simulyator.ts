import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { appUser, business } from './tenant.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMULYATOR — menejer AI "mijoz" bilan mashq qo'ng'irog'i qiladi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tayyor ssenariylar kodda (`simulyator/tayyor.ts`) — har biznesga nusxa
 * ko'paytirilmaydi. Bu jadvalda faqat biznesning o'zi yaratganlari.
 * Mashqlar tarixi har foydalanuvchiniki alohida: uni faqat o'zi ko'radi.
 */

export const simulyatorSsenariy = pgTable(
  'simulyator_ssenariy',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    createdBy: uuid('created_by').references(() => appUser.id, { onDelete: 'set null' }),
    /** Kartadagi sarlavha — menejer erishishi kerak bo'lgan natija ("Gaplashishga rozilik oling"). */
    nom: text('nom').notNull(),
    /** Kartadagi qisqa vaziyat ("Kamola ikki kun oldin ariza qoldirgan va hozir ishda band."). */
    vaziyat: text('vaziyat').notNull(),
    /** Qo'ng'iroq maqsadi — natija ekranida "erishildi/yo'q" shunga qarab baholanadi. */
    maqsad: text('maqsad').notNull(),
    mijozIsmi: text('mijoz_ismi').notNull(),
    /** 'ayol' | 'erkak' — ovozli rejimda ovoz tanlash uchun. */
    mijozJinsi: text('mijoz_jinsi').notNull().default('ayol'),
    /** AI'ga yashirin ko'rsatma: mijoz kim, nimani xohlaydi, nimaga ko'nadi. */
    mijozHaqida: text('mijoz_haqida').notNull().default(''),
    etirozlar: jsonb('etirozlar').notNull().default(sql`'[]'::jsonb`),
    /** 'yumshoq' | 'ortacha' | 'qattiq' */
    kayfiyat: text('kayfiyat').notNull().default('ortacha'),
    davomiylikDaq: integer('davomiylik_daq').notNull().default(5),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('simulyator_ssenariy_business_idx').on(t.businessId, t.createdAt)],
);

export const simulyatorMashq = pgTable(
  'simulyator_mashq',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    /** Tayyor ssenariy kaliti ("tayyor:rozilik") yoki biznes ssenariysi id'si. */
    ssenariyKalit: text('ssenariy_kalit').notNull(),
    /** Mashq paytidagi ssenariy nusxasi — ssenariy keyin o'zgarsa/o'chsa ham tarix buzilmaydi. */
    ssenariy: jsonb('ssenariy').notNull(),
    /** 'jarayonda' | 'tugadi' | 'bekor' */
    holat: text('holat').notNull().default('jarayonda'),
    /** 'matn' | 'ovoz' */
    rejim: text('rejim').notNull().default('matn'),
    boshlangan: timestamp('boshlangan', { withTimezone: true }).notNull().defaultNow(),
    tugagan: timestamp('tugagan', { withTimezone: true }),
    davomiylikSek: integer('davomiylik_sek').notNull().default(0),
    /** [{ kim: 'menejer' | 'mijoz', matn, sek }] */
    matn: jsonb('matn').notNull().default(sql`'[]'::jsonb`),
    /** 'kutilmoqda' | 'tayyor' | 'qisqa' | 'ai_yoq' | 'xato' */
    natijaHolat: text('natija_holat').notNull().default('kutilmoqda'),
    natija: jsonb('natija'),
    /** "Mijoz haqiqiy odamdek tuyuldimi?" — 'ha' | 'qisman' | 'yoq' */
    fikr: text('fikr'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('simulyator_mashq_user_idx').on(t.businessId, t.userId, t.boshlangan)],
);
