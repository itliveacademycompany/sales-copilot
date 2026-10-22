import { sql } from 'drizzle-orm';
import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { contact } from './conversation.js';
import { crmPipeline, crmStage, deal } from './crm.js';
import { appUser, business, seat } from './tenant.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — 2-bosqich: amoCRM imkoniyatlari
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kompaniya, rad sabablari, sozlamalar, saqlangan filtr, saralanmagan
 * murojaatlar, veb-forma, avtomatika, maqsad, tovarlar.
 */

/** Kompaniya (CONT-01/04). Kontakt kompaniyasiz ham yashaydi. */
export const company = pgTable(
  'company',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    phone: text('phone'),
    email: text('email'),
    website: text('website'),
    address: text('address'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('company_business_name_idx').on(t.businessId, t.name)],
);

/** Rad (yo'qotish) sabablari katalogi (PIPE-03). */
export const crmLossReason = pgTable(
  'crm_loss_reason',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sort: integer('sort').notNull().default(0),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('crm_loss_reason_business_idx').on(t.businessId, t.sort)],
);

/**
 * Biznes darajasidagi CRM sozlamalari (bitta qator): vazifa turlari,
 * lid taqsimoti (round-robin) navbati, qo'ng'iroqlardan avto-qabul va h.k.
 */
export const crmSetting = pgTable('crm_setting', {
  businessId: uuid('business_id')
    .primaryKey()
    .references(() => business.id, { onDelete: 'cascade' }),
  data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Saqlangan filtr (LEAD-08) — har foydalanuvchiniki alohida. */
export const crmSavedFilter = pgTable(
  'crm_saved_filter',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    filter: jsonb('filter').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('crm_saved_filter_user_idx').on(t.businessId, t.userId)],
);

/** Veb-forma (FORM-01..06) — ochiq manzil `/f/:slug`, yuborilganlar "Saralanmagan"ga tushadi. */
export const crmForm = pgTable(
  'crm_form',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    /** Global noyob — ochiq manzil shu bilan topiladi. */
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    /** `[{ key, label, type, required, target }]` — target: name|phone|email|company|message|field:<id> */
    fields: jsonb('fields').notNull().default(sql`'[]'::jsonb`),
    pipelineId: uuid('pipeline_id').references(() => crmPipeline.id, { onDelete: 'set null' }),
    source: text('source'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    thankYou: text('thank_you'),
    /** true — murojaat "Saralanmagan"ni chetlab darhol bitim bo'ladi. */
    autoAccept: boolean('auto_accept').notNull().default(false),
    active: boolean('active').notNull().default(true),
    submissions: integer('submissions').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('crm_form_slug_uq').on(t.slug)],
);

/**
 * Saralanmagan murojaat (LEAD-04): qo'ng'iroq, forma yoki qo'lda kiritilgan,
 * hali bitimga aylanmagan. Qabul — bitim yaratadi yoki mavjudiga bog'laydi;
 * rad — yopadi. Manba + tashqi ID takrorlanmaydi.
 */
export const crmInbox = pgTable(
  'crm_inbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    /** call | form | manual */
    source: text('source').notNull(),
    externalId: text('external_id'),
    /** pending | accepted | rejected */
    status: text('status').notNull().default('pending'),
    name: text('name'),
    phone: text('phone'),
    email: text('email'),
    message: text('message'),
    payload: jsonb('payload').notNull().default(sql`'{}'::jsonb`),
    contactId: uuid('contact_id').references(() => contact.id, { onDelete: 'set null' }),
    formId: uuid('form_id').references(() => crmForm.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id'),
    pipelineId: uuid('pipeline_id').references(() => crmPipeline.id, { onDelete: 'set null' }),
    dealId: uuid('deal_id').references(() => deal.id, { onDelete: 'set null' }),
    decidedBy: uuid('decided_by').references(() => appUser.id, { onDelete: 'set null' }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('crm_inbox_status_idx').on(t.businessId, t.status, t.createdAt),
    uniqueIndex('crm_inbox_external_uq').on(t.businessId, t.source, t.externalId),
  ],
);

/**
 * Avtomatika qoidasi (AUTO-02/03, WF-01..07): bosqichga kirganda yoki
 * bosqichda N daqiqa turib qolganda — vazifa, mas'ul (navbat bilan),
 * boshqa bosqichga o'tkazish, teg.
 */
export const crmAutomation = pgTable(
  'crm_automation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => crmPipeline.id, { onDelete: 'cascade' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => crmStage.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** Bosqichga kirgandan keyin necha daqiqada (0 — darhol). */
    delayMinutes: integer('delay_minutes').notNull().default(0),
    /** `{ onlyIfNoOpenTasks?: boolean }` */
    conditions: jsonb('conditions').notNull().default(sql`'{}'::jsonb`),
    /** `[{ type: 'task'|'responsible'|'move'|'tag', ... }]` */
    actions: jsonb('actions').notNull().default(sql`'[]'::jsonb`),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('crm_automation_stage_idx').on(t.businessId, t.stageId)],
);

/** Qoida bir bosqichga kirish uchun bir marta ishlaydi (idempotentlik). */
export const crmAutomationRun = pgTable(
  'crm_automation_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    automationId: uuid('automation_id')
      .notNull()
      .references(() => crmAutomation.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deal.id, { onDelete: 'cascade' }),
    /** Bosqichga kirish vaqti (ISO) — qaytib kirsa yangi kalit. */
    entryKey: text('entry_key').notNull(),
    /** done | skipped | error */
    status: text('status').notNull(),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('crm_automation_run_uq').on(t.automationId, t.dealId, t.entryKey)],
);

/** Oylik reja (RPT-05): xodim yoki butun jamoa (`seat_id` bo'sh) uchun. */
export const crmGoal = pgTable(
  'crm_goal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    seatId: uuid('seat_id').references(() => seat.id, { onDelete: 'cascade' }),
    month: date('month').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }),
    count: integer('count'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('crm_goal_uq').on(t.businessId, t.seatId, t.month)],
);

/** Tovar / xizmat katalogi (CUST-02). */
export const crmProduct = pgTable(
  'crm_product',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sku: text('sku'),
    price: numeric('price', { precision: 14, scale: 2 }).notNull().default('0'),
    description: text('description'),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('crm_product_business_idx').on(t.businessId, t.name)],
);

/** Bitimdagi tovar qatori — narx yozilgan paytdagisi saqlanadi (snapshot). */
export const dealItem = pgTable(
  'deal_item',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deal.id, { onDelete: 'cascade' }),
    productId: uuid('product_id').references(() => crmProduct.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    price: numeric('price', { precision: 14, scale: 2 }).notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3 }).notNull().default('1'),
    /** Chegirma foizi (0–100). */
    discount: numeric('discount', { precision: 5, scale: 2 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('deal_item_deal_idx').on(t.dealId)],
);
