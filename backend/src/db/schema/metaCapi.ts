import { sql } from 'drizzle-orm';
import { customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { crmPipeline } from './crm.js';
import { appUser, business } from './tenant.js';

/** Postgres `bytea` — shifrlangan tokenlar (AES-256-GCM, `crypto/secrets.ts`). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORMA SOZLAMASI — amoCRM'dagi "forma → voronka, maydonlar, teg" xaritasi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Har Meta Instant Form (`form_id`) uchun: qaysi voronkaga tushadi, savollar
 * qaysi CRM maydoniga yoziladi, qanday teg va manba nomi qo'yiladi, kelganda
 * darhol bitim yaratilib mas'ul navbat bilan tayinlanadimi (amoCRM'dagi
 * "Taqsimot" Salesbot'i). Bevosita Meta ulanishi ham, Make ham shu jadvaldan
 * foydalanadi — kalit forma NOMI emas, Meta `form_id` (nomlar takrorlanadi).
 *
 * Forma birinchi lid kelganda o'zi qo'shiladi (`questions` — ko'rilgan savol
 * kalitlari), shuning uchun sozlash uchun lidni oldindan bilish shart emas.
 */
export const metaFormSetting = pgTable(
  'meta_form_setting',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    formId: text('form_id').notNull(),
    formName: text('form_name'),
    pageName: text('page_name'),
    /** Ko'rilgan savol kalitlari (`field_data[].name`) — xaritalash UI uchun. */
    questions: jsonb('questions').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Boshlang'ich voronka; null — ulanish/Make sozlamasidagi voronka. */
    pipelineId: uuid('pipeline_id').references(() => crmPipeline.id, { onDelete: 'set null' }),
    /** Avto-qabulda bitim qo'yiladigan bosqich; null — voronkaning birinchi bosqichi. */
    stageId: uuid('stage_id'),
    /** Savol kaliti → `contact:name|phone|email`, `field:<crm_field id>`, `note`, `skip`. */
    mapping: jsonb('mapping').$type<Record<string, string>>().notNull().default(sql`'{}'::jsonb`),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    /** Bitim manbasi; null — forma nomi. */
    sourceName: text('source_name'),
    /** 1 — kelishi bilan bitim yaratish (Saralanmagan'da kutmasdan). */
    autoAccept: integer('auto_accept').notNull().default(0),
    /** Avto-qabulda mas'ullar navbati; bo'sh — CRM'ning umumiy navbati. */
    seatIds: jsonb('seat_ids').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Shu forma navbatining kursori (oxirgi tayinlangan mas'ulning indeksi). */
    rrCursor: integer('rr_cursor').notNull().default(-1),
    leadCount: integer('lead_count').notNull().default(0),
    lastLeadAt: timestamp('last_lead_at', { withTimezone: true }),
    updatedBy: uuid('updated_by').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('meta_form_setting_form_uq').on(t.businessId, t.formId)],
);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META CONVERSIONS API — CRM natijasini Meta'ga qaytarish
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * amoCRM'da bu tashqi CAPI vidjeti orqali: bitim bosqichga kirganda Meta'ga hodisa
 * (Lead, Purchase …) yuboriladi va reklama shu natija bo'yicha optimizatsiya
 * qilinadi. Bu yerda — tashqi vidjet va obunasiz, platformaning o'zida.
 *
 * Lid olish (Lead Ads) va natija yuborish (CAPI) — mustaqil oqimlar: biri
 * ishlamasa, ikkinchisiga ta'sir qilmaydi. Token — Events Manager'dagi
 * dataset (pixel) tokeni, Lead Ads sahifa tokeni emas.
 */
export const metaCapiConfig = pgTable(
  'meta_capi_config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    datasetId: text('dataset_id').notNull(),
    datasetName: text('dataset_name'),
    tokenEncrypted: bytea('token_encrypted').notNull(),
    tokenHint: text('token_hint').notNull(),
    /** Events Manager → Test events kodi; bo'lsa hodisalar faqat sinov oynasiga tushadi. */
    testEventCode: text('test_event_code'),
    enabled: integer('enabled').notNull().default(1),
    lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
    lastCheckOk: integer('last_check_ok'),
    lastError: text('last_error'),
    updatedBy: uuid('updated_by').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('meta_capi_config_business_uq').on(t.businessId)],
);

/** Qoida: bitim shu bosqichga kirganda (yoki shu bosqichda yaratilganda) — shu hodisa. */
export const metaCapiRule = pgTable(
  'meta_capi_rule',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => crmPipeline.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id').notNull(),
    /** Meta standart hodisasi (Lead, Purchase, …) yoki o'z nomi. */
    eventName: text('event_name').notNull(),
    /** 1 — bitim summasini `value` sifatida yuborish (Purchase uchun). */
    sendValue: integer('send_value').notNull().default(0),
    currency: text('currency').notNull().default('UZS'),
    active: integer('active').notNull().default(1),
    createdBy: uuid('created_by').references(() => appUser.id, { onDelete: 'set null' }),
    /** Qoidadan OLDIN bosqichga kirgan bitimlar yuborilmaydi (tarixni ko'r-ko'rona replay qilmaslik). */
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_capi_rule_stage_event_uq').on(t.businessId, t.stageId, t.eventName),
    index('meta_capi_rule_active_idx').on(t.businessId, t.active),
  ],
);

/**
 * Yuborish navbati va jurnali (outbox). Bitta bosqichga kirish — bitta qator
 * (`rule_id + deal_event_id` unikal): worker qayta ishga tushsa ham hodisa
 * ikki marta yuborilmaydi; `event_id` barqaror — Meta ham takrorni tashlaydi.
 */
export const metaCapiEvent = pgTable(
  'meta_capi_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    ruleId: uuid('rule_id').references(() => metaCapiRule.id, { onDelete: 'set null' }),
    dealId: uuid('deal_id').notNull(),
    dealEventId: uuid('deal_event_id').notNull(),
    eventName: text('event_name').notNull(),
    eventId: text('event_id').notNull(),
    eventTime: timestamp('event_time', { withTimezone: true }).notNull(),
    /** queued | sent | skipped | failed */
    status: text('status').notNull().default('queued'),
    /** Nega o'tkazilgan/yiqilgan: `not_configured`, `disabled`, `no_contact`, `too_old` yoki Meta xabari. */
    reason: text('reason'),
    attempts: integer('attempts').notNull().default(0),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    /** Qaysi moslash ma'lumotlari bor edi (qiymatlarsiz): ["ph","em","lead_id"]. */
    matchKeys: jsonb('match_keys').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    eventsReceived: integer('events_received'),
    fbtraceId: text('fbtrace_id'),
    testMode: integer('test_mode').notNull().default(0),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_capi_event_rule_deal_event_uq').on(t.ruleId, t.dealEventId),
    index('meta_capi_event_claim_idx').on(t.status, t.runAfter),
    index('meta_capi_event_business_idx').on(t.businessId, t.createdAt),
  ],
);
