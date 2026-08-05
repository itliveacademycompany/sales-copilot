import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { conversation } from './conversation.js';
import { business } from './tenant.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TAHLIL NAVBATI — FR-90
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Navbat PostgreSQL'ning o'zida, Redis'siz. Sabab: yakka dasturchi uchun
 * har bir qo'shimcha infra qismi — o'rnatish, kuzatish, zaxira nusxa.
 * `FOR UPDATE SKIP LOCKED` bilan Postgres soniyasiga minglab ishni
 * bemalol ko'taradi; bizning hajm (kuniga bir necha ming tahlil) uchun
 * bu yetarlidan ortiq.
 *
 * Hayotiy sikl:
 *   queued → running → done
 *                    ↘ queued (retry, eksponensial kutish bilan)
 *                    ↘ dead   (urinishlar tugadi — DLQ)
 */
export const jobStatus = pgEnum('job_status', [
  'queued',
  'running',
  'done',
  'failed', // oxirgi urinish xato bilan tugadi, qayta rejalashtirilgan
  'dead', // urinishlar tugadi — inson aralashuvi kerak
]);

export const analysisJob = pgTable(
  'analysis_job',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversation.id, { onDelete: 'cascade' }),

    kind: text('kind').notNull().default('analyze'),
    status: jobStatus('status').notNull().default('queued'),

    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),

    /** Retry kutishi: bu vaqtdan oldin ish olinmaydi. */
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),

    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),

    lastError: text('last_error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    // Bitta suhbatga bir vaqtda faqat bitta faol ish.
    uniqueIndex('analysis_job_active_uq')
      .on(t.conversationId)
      .where(sql`${t.status} in ('queued', 'running')`),
    index('analysis_job_claim_idx').on(t.status, t.runAfter, t.createdAt),
    index('analysis_job_business_idx').on(t.businessId, t.createdAt),
  ],
);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PROMPT SHABLONLARI — FR-88
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Promptlar kod ichida emas, bazada versiyalanadi. Sabab: promptni
 * o'zgartirish deploy talab qilmasligi kerak, va har tahlil natijasi
 * qaysi prompt versiyasi bilan olinganini bilishimiz shart (aks holda
 * "nega bahо o'zgardi" degan savolga javob yo'q).
 *
 * Kodda har kalit uchun standart shablon bor — jadval bo'sh bo'lsa ham
 * pipeline ishlayveradi. Bazadagi faol qator standartni bekor qiladi.
 *
 * Platforma darajasida, tenant'ga tegishli EMAS.
 */
export const promptTemplate = pgTable(
  'prompt_template',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** stage2_extract | stage3_score | playbook_builder | daily_summary */
    key: text('key').notNull(),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    isActive: boolean('is_active').notNull().default(false),
    changeNote: text('change_note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('prompt_template_version_uq').on(t.key, t.version),
    // Har kalit uchun faqat bitta faol versiya.
    uniqueIndex('prompt_template_one_active_uq')
      .on(t.key)
      .where(sql`${t.isActive}`),
    index('prompt_template_key_idx').on(t.key),
  ],
);
