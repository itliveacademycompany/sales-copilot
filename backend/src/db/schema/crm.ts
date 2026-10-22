import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, numeric, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { contact } from './conversation.js';
import { appUser, business, seat } from './tenant.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — SotuvAI ichidagi o'z CRM (amoCRM o'rnini bosadi)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tashqi CRM ga ega bo'lmagan bizneslar uchun. SotuvAI bilan bog'lanish
 * AVTOMATIK — chunki bir xil bazada:
 *   • mijoz = mavjud `contact` (qo'ng'iroq ham, bitim ham shunga bog'lanadi);
 *   • vazifa = mavjud `task` (`deal_id` bilan) — tahlil yaratgan vazifa
 *     ham bitim kartochkasida ko'rinadi;
 *   • qo'ng'iroq va tahlil — kontakt orqali, alohida sinxronlashsiz.
 *
 * Bitim bosqichining TURI (`open` / `won` / `lost`) uning NOMIDAN alohida:
 * TZ 2.2 — "UCHRASHUVGA KELGANLAR" texnik jihatdan won, lekin tushum emas.
 * Tushum keyingi bosqichda to'lov jurnalidan hisoblanadi, bosqichdan emas.
 */

export const crmStageKind = pgEnum('crm_stage_kind', ['open', 'won', 'lost']);

/** Voronka. Arxivlangani ro'yxatda ko'rinmaydi, lekin bitimlari saqlanadi. */
export const crmPipeline = pgTable(
  'crm_pipeline',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sort: integer('sort').notNull().default(0),
    isMain: boolean('is_main').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('crm_pipeline_business_idx').on(t.businessId, t.sort)],
);

/** Bosqich. `sort` — Kanban ustuni tartibi. */
export const crmStage = pgTable(
  'crm_stage',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => crmPipeline.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color').notNull().default('#8ab4f8'),
    sort: integer('sort').notNull().default(0),
    kind: crmStageKind('kind').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('crm_stage_pipeline_idx').on(t.pipelineId, t.sort)],
);

/**
 * Bitimning qo'shimcha maydoni. Qiymat `deal.fields[field.id]` da.
 * Label hech qachon kalit emas (TZ 7.1) — kalit `id`, dasturiy nom `code`.
 * `options` — `[{ id, label }]`: label o'zgarsa ham tarixdagi `id` o'zgarmaydi.
 */
export const crmField = pgTable(
  'crm_field',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    label: text('label').notNull(),
    /** text | textarea | number | money | select | multiselect | date | datetime | checkbox | phone | url */
    type: text('type').notNull(),
    options: jsonb('options').notNull().default(sql`'[]'::jsonb`),
    groupName: text('group_name'),
    sort: integer('sort').notNull().default(0),
    required: boolean('required').notNull().default(false),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('crm_field_code_uq').on(t.businessId, t.code)],
);

/** Bitim (sdelka). */
export const deal = pgTable(
  'deal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    pipelineId: uuid('pipeline_id')
      .notNull()
      .references(() => crmPipeline.id, { onDelete: 'restrict' }),
    stageId: uuid('stage_id')
      .notNull()
      .references(() => crmStage.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }),
    responsibleSeatId: uuid('responsible_seat_id').references(() => seat.id, { onDelete: 'set null' }),
    contactId: uuid('contact_id').references(() => contact.id, { onDelete: 'set null' }),
    /** Qo'shimcha maydonlar: `{ [fieldId]: qiymat }`. */
    fields: jsonb('fields').notNull().default(sql`'{}'::jsonb`),
    source: text('source'),
    lostReason: text('lost_reason'),
    stageEnteredAt: timestamp('stage_entered_at', { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    /** Optimistik qulf: bir vaqtda ikki kishi tahrirlasa — 409, "oxirgi yutadi" emas. */
    version: integer('version').notNull().default(1),
    createdBy: uuid('created_by').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    index('deal_board_idx').on(t.businessId, t.pipelineId, t.stageId, t.stageEnteredAt),
    index('deal_contact_idx').on(t.businessId, t.contactId),
    index('deal_responsible_idx').on(t.businessId, t.responsibleSeatId),
    index('deal_updated_idx').on(t.businessId, t.updatedAt),
  ],
);

/**
 * Bitim tarixi (timeline): yaratildi, bosqich, maydon o'zgarishi, izoh.
 * Faqat qo'shiladi — eski hodisa jimgina tahrirlanmaydi (TZ LEAD-07).
 * Qo'ng'iroq va vazifalar bu yerga NUSXALANMAYDI: kartochka ularni o'z
 * jadvalidan oladi (bitta haqiqat manbai).
 */
export const dealEvent = pgTable(
  'deal_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    dealId: uuid('deal_id')
      .notNull()
      .references(() => deal.id, { onDelete: 'cascade' }),
    /** created | stage | field | note | responsible | contact */
    type: text('type').notNull(),
    data: jsonb('data').notNull().default(sql`'{}'::jsonb`),
    authorUserId: uuid('author_user_id').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('deal_event_deal_idx').on(t.dealId, t.createdAt)],
);
