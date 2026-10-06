import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { commitmentParty, commitmentStatus, taskSource, taskStatus } from './enums.js';
import { conversation } from './conversation.js';
import { appUser, business, seat } from './tenant.js';

/**
 * Va'da — suhbatda kim nima qilishga so'z berdi.
 * "Ertaga qayta qo'ng'iroq qilaman" degan gap shu yerga tushadi va
 * muddati o'tsa ogohlantirish beriladi (FR-133).
 */
export const commitment = pgTable(
  'commitment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),
    seatId: uuid('seat_id').references(() => seat.id, { onDelete: 'set null' }),

    byParty: commitmentParty('by_party').notNull(),
    what: text('what').notNull(),
    deadline: timestamp('deadline', { withTimezone: true }),
    status: commitmentStatus('status').notNull().default('pending'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [
    index('commitment_deadline_idx').on(t.businessId, t.status, t.deadline),
    index('commitment_seat_idx').on(t.businessId, t.seatId),
  ],
);

/**
 * Vazifa. TZ 3.7A.
 *
 * Tahlilning o'zi qiymat bermaydi — **harakat** beradi. Suhbatdan tug'ilgan
 * "qayta qo'ng'iroq qil" vazifasi bajarilmasa, tizim hisobot generatoriga
 * aylanadi. Shuning uchun vazifalar moduli P0.
 */
export const task = pgTable(
  'task',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    seatId: uuid('seat_id').references(() => seat.id, { onDelete: 'set null' }),

    conversationId: uuid('conversation_id').references(() => conversation.id, {
      onDelete: 'set null',
    }),
    commitmentId: uuid('commitment_id').references(() => commitment.id, {
      onDelete: 'set null',
    }),

    source: taskSource('source').notNull().default('manual'),
    /** callback | send_offer | schedule_visit | send_location | ... */
    action: text('action'),

    title: text('title').notNull(),
    description: text('description'),

    status: taskStatus('status').notNull().default('pending'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),

    // CRM voronka bosqichiga bog'lanish (FR-129a/b)
    crmStageId: text('crm_stage_id'),
    crmStageName: text('crm_stage_name'),
    crmTaskId: text('crm_task_id'),

    /**
     * CRM ga YUBORILGAN vaqt (outbox).
     *
     * `null` — hali yuborilmagan. Ogohlantirish dispetcheri bilan bir xil
     * naqsh: tashqi HTTP chaqiruvi tahlil tranzaksiyasidan tashqarida
     * bo'lishi shart, aks holda CRM sekin javob bersa butun quvur
     * qulflanardi.
     */
    exportedAt: timestamp('exported_at', { withTimezone: true }),
    /** Oxirgi yuborishdagi xato — interfeysda ko'rsatish uchun. */
    exportError: text('export_error'),

    createdBy: uuid('created_by').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('task_seat_due_idx').on(t.businessId, t.seatId, t.status, t.dueAt),
    index('task_business_status_idx').on(t.businessId, t.status),
    index('task_conversation_idx').on(t.conversationId),
    /** Eksport dispetcheri faqat yuborilmaganlarni oladi. */
    index('task_export_idx').on(t.exportedAt, t.createdAt),
  ],
);
