import { sql } from 'drizzle-orm';
import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { appUser } from './tenant.js';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * AI provayder turi.
 *
 * `llm` — matn tahlili (ekstraksiya, baholash, kouching)
 * `stt` — ovozdan matnga (audio kelganda kerak bo'ladi)
 */
export const providerPurpose = pgEnum('provider_purpose', ['llm', 'stt']);

export const providerKind = pgEnum('provider_kind', [
  'anthropic',
  'openai',
  'google',
  'deepgram',
  'custom',
]);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI PROVAYDERLARI — platforma darajasida
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bu jadval TENANT'ga tegishli EMAS va RLS qo'llanmaydi.
 *
 * Sabab: biznes modeli bo'yicha LLM xarajatini biz to'laymiz (640k so'm/seat
 * narxiga kiritilgan), demak kalit ham bizniki — bitta, butun platforma uchun.
 * Mijoz o'z kalitini keltirmaydi.
 *
 * Kalit **shifrlangan holda** saqlanadi (AES-256-GCM), shifr kaliti esa
 * env o'zgaruvchisida. Interfeysda faqat niqoblangan ko'rinishi ko'rsatiladi
 * va to'liq qiymat hech qanday endpoint orqali qaytarilmaydi.
 *
 * Faqat `system_role = 'super_admin'` kira oladi.
 */
export const aiProvider = pgTable(
  'ai_provider',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    purpose: providerPurpose('purpose').notNull(),
    kind: providerKind('kind').notNull(),
    label: text('label').notNull(),

    /** AES-256-GCM bilan shifrlangan API kaliti. Hech qachon ochiq qaytarilmaydi. */
    apiKeyEncrypted: bytea('api_key_encrypted'),
    /** Interfeysda ko'rsatish uchun: `sk-ant-…4f2a`. Kalitning o'zi emas. */
    apiKeyHint: text('api_key_hint'),
    /** Kalit oxirgi marta qachon o'zgartirilgani — rotatsiyani kuzatish uchun. */
    apiKeyRotatedAt: timestamp('api_key_rotated_at', { withTimezone: true }),

    /**
     * Bosqichlar bo'yicha model tanlovi:
     * { stage2: "claude-opus-5", stage3: "claude-opus-5", playbookBuilder: "claude-opus-5" }
     *
     * Turli bosqichga turli model qo'yish mumkin — masalan arzon modelni
     * ekstraksiyaga, kuchliroq modelni baholashga.
     */
    models: jsonb('models').notNull().default(sql`'{}'::jsonb`),

    /** Bazaviy URL (self-hosted yoki proxy uchun). Bo'sh bo'lsa standart. */
    baseUrl: text('base_url'),

    /** Faqat bittasi har `purpose` uchun faol bo'la oladi. */
    isActive: boolean('is_active').notNull().default(false),

    /**
     * Zaxira navbati (1, 2, …). Faol provayder limitga (429/kvota) yoki
     * vaqtinchalik nosozlikka urilsa, so'rov shu tartibda keyingisiga o'tadi.
     * `null` — zaxirada emas. Bepul kvotalarni qo'shib, bitta kalit tugashi
     * butun baholashni to'xtatib qo'ymasligi uchun.
     */
    fallbackOrder: integer('fallback_order'),

    /** Oxirgi ulanish tekshiruvi natijasi. */
    lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
    lastCheckOk: boolean('last_check_ok'),
    lastCheckError: text('last_check_error'),

    /** Xarajat nazorati: oylik chegara (USD). 0 = cheksiz. */
    monthlyBudgetUsd: integer('monthly_budget_usd').notNull().default(0),

    createdBy: uuid('created_by').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Har maqsad uchun faqat bitta faol provayder.
    uniqueIndex('ai_provider_one_active_uq')
      .on(t.purpose)
      .where(sql`${t.isActive}`),
    index('ai_provider_purpose_idx').on(t.purpose),
  ],
);

/**
 * Umumiy platforma sozlamalari (kalit-qiymat).
 * Masalan: `support.contacts`, `signup.enabled`, `trial.days`.
 */
export const platformSetting = pgTable('platform_setting', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull().default(sql`'{}'::jsonb`),
  description: text('description'),
  updatedBy: uuid('updated_by').references(() => appUser.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
