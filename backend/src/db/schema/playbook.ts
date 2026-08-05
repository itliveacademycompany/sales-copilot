import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { appUser, business } from './tenant.js';

/**
 * Baholash metodologiyasi — mahsulotning yuragi.
 *
 * **Versiyalanadi** (FR-22): har saqlash yangi qator yaratadi, eski versiya
 * o'zgarmaydi. Sabab: `analysis` yozuvlari o'zi baholangan versiyaga
 * bog'lanadi, shuning uchun mezon keyin o'zgarsa ham eski baho ma'nosini
 * yo'qotmaydi.
 *
 * Bitta biznesda faqat bitta `isActive = true` versiya bo'ladi — buni
 * qisman unikal indeks kafolatlaydi.
 */
export const playbook = pgTable(
  'playbook',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    version: integer('version').notNull(),
    isActive: boolean('is_active').notNull().default(false),

    /**
     * Kategoriyalar va mezonlar.
     * {
     *   categories: [{ code, name, weightPct, order }],
     *   criteria: [{
     *     code: "A1", categoryCode: "A", name, description,
     *     rubric: { "0": "...", "1": "...", "2": "...", "3": "..." },
     *     appliesTo: { callFamilies: [], serviceLines: [], directions: [] },
     *     isActive: true
     *   }]
     * }
     * Vaznlar yig'indisi 100% bo'lishi ilova darajasida tekshiriladi (FR-20).
     */
    criteria: jsonb('criteria').notNull().default(sql`'{}'::jsonb`),

    /** FR-28: suhbatdan yig'iladigan tuzilgan ma'lumot savollari. */
    questionnaire: jsonb('questionnaire').notNull().default(sql`'{}'::jsonb`),

    /**
     * FR-25/30: qo'ng'iroq oilalari, har biriga baholash siyosati,
     * qizil bayroqlar va few-shot misollar.
     */
    classificationPolicy: jsonb('classification_policy').notNull().default(sql`'{}'::jsonb`),

    /**
     * AI quvurining har bosqichi uchun ko'rsatmalar (TZ 3.5).
     * { stage1: { vocabulary, contextHint },
     *   stage2: { businessContext, extractionHints, taskGuidance, serviceLines },
     *   stage3: { scoringGuidance, coachingNotes, complianceNotes, leadQuality } }
     */
    promptNotes: jsonb('prompt_notes').notNull().default(sql`'{}'::jsonb`),

    /** FR-29: lid sifati bosqichlari. */
    leadQuality: jsonb('lead_quality').notNull().default(sql`'{}'::jsonb`),

    /**
     * Yaratilgan paytdagi biznes anketasining nusxasi.
     * Keyin anketa o'zgarsa, bu versiya nima asosida tuzilganini bilamiz.
     */
    businessProfileSnapshot: jsonb('business_profile_snapshot')
      .notNull()
      .default(sql`'{}'::jsonb`),

    /** 'ai_generated' | 'manual' | 'template' — FR-12 kuzatuvi uchun. */
    origin: text('origin').notNull().default('manual'),
    changeNote: text('change_note'),

    createdBy: uuid('created_by').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    activatedAt: timestamp('activated_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('playbook_version_uq').on(t.businessId, t.version),
    // Bitta biznesda faqat bitta faol versiya.
    uniqueIndex('playbook_one_active_uq')
      .on(t.businessId)
      .where(sql`${t.isActive}`),
    index('playbook_business_idx').on(t.businessId),
  ],
);

/**
 * FR-32: soha bo'yicha tayyor shablonlar (o'quv markazi, klinika, avtosalon...).
 * Bu jadval tenant'ga tegishli emas — platforma darajasida umumiy.
 */
export const playbookTemplate = pgTable(
  'playbook_template',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    industry: text('industry').notNull(),
    name: text('name').notNull(),
    description: text('description'),
    locale: text('locale').notNull().default('uz'),
    content: jsonb('content').notNull(),
    isPublic: boolean('is_public').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('playbook_template_industry_idx').on(t.industry)],
);

/**
 * FR-31: playbook simulyatori natijalari.
 * O'zgartirishni saqlashdan oldin N ta eski suhbatga sinab ko'riladi —
 * "mezonni o'zgartirsam natija qanday o'zgaradi" degan savolga javob.
 * Usiz foydalanuvchi o'zgartirishdan qo'rqadi va playbook muzlab qoladi.
 */
export const playbookSimulation = pgTable(
  'playbook_simulation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    /** Sinalayotgan qoralama (hali saqlanmagan playbook). */
    draftCriteria: jsonb('draft_criteria').notNull(),
    /** Solishtirish uchun asos versiya. */
    basePlaybookId: uuid('base_playbook_id').references(() => playbook.id, {
      onDelete: 'set null',
    }),

    sampleSize: integer('sample_size').notNull(),
    status: text('status').notNull().default('queued'), // queued|running|done|failed

    /**
     * { before: { avgScore, byCriterion: {...} },
     *   after:  { avgScore, byCriterion: {...} },
     *   deltas: [...], perConversation: [...] }
     */
    result: jsonb('result'),
    costUsd: jsonb('cost_usd'),
    error: text('error'),

    createdBy: uuid('created_by').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [index('playbook_simulation_business_idx').on(t.businessId, t.createdAt)],
);
