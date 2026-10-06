import { sql } from 'drizzle-orm';
import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { alertKind, alertSeverity, alertStatus } from './enums.js';
import { conversation } from './conversation.js';
import { appUser, business, seat } from './tenant.js';

/** Ogohlantirishlar — TZ 3.8. */
export const alert = pgTable(
  'alert',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    seatId: uuid('seat_id').references(() => seat.id, { onDelete: 'set null' }),
    conversationId: uuid('conversation_id').references(() => conversation.id, {
      onDelete: 'cascade',
    }),

    kind: alertKind('kind').notNull(),
    severity: alertSeverity('severity').notNull().default('warning'),
    status: alertStatus('status').notNull().default('new'),

    title: text('title').notNull(),
    body: jsonb('body').notNull().default(sql`'{}'::jsonb`),

    /** Bir xil ogohlantirish takrorlanmasligi uchun. */
    dedupeKey: text('dedupe_key'),

    /**
     * Bildirishnoma YUBORILGAN vaqt (outbox naqshi).
     *
     * `null` — hali yuborilmagan. Yuborish tahlil tranzaksiyasi ichida
     * QILINMAYDI: tashqi HTTP chaqiruvi tranzaksiyani ushlab turardi va
     * Telegram sekin javob bersa butun tahlil qulflanardi. Buning
     * o'rniga ogohlantirish avval bazaga tushadi, keyin alohida
     * dispetcher uni yuboradi — server o'rtada yiqilsa ham xabar
     * yo'qolmaydi.
     */
    notifiedAt: timestamp('notified_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => appUser.id, { onDelete: 'set null' }),
  },
  (t) => [
    index('alert_business_status_idx').on(t.businessId, t.status, t.createdAt),
    index('alert_dedupe_idx').on(t.businessId, t.dedupeKey),
    /** Dispetcher faqat yuborilmaganlarni oladi. */
    index('alert_notify_idx').on(t.notifiedAt, t.createdAt),
  ],
);

/** FR-100: moslashtiriladigan bosh sahifa (har foydalanuvchi uchun alohida). */
export const dashboardLayout = pgTable(
  'dashboard_layout',
  {
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),

    sections: jsonb('sections').notNull().default(sql`'{}'::jsonb`),
    order: jsonb('order').notNull().default(sql`'[]'::jsonb`),
    revision: integer('revision').notNull().default(1),

    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.businessId, t.userId] })],
);

/**
 * Audit jurnali — NFR-25.
 *
 * Bu yerga **admin impersonation ham majburiy yoziladi**. Qo'llab-quvvatlash
 * uchun mijoz hisobiga kirish funksiyasi kerak, lekin u mijoz ko'radigan iz
 * qoldirmasa — bu ishonch masalasi.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    businessId: uuid('business_id').references(() => business.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => appUser.id, { onDelete: 'set null' }),
    /** Impersonation paytida haqiqiy admin. */
    impersonatorId: uuid('impersonator_id').references(() => appUser.id, {
      onDelete: 'set null',
    }),

    action: text('action').notNull(), // playbook.activate | seat.delete | data.export
    entity: text('entity'),
    entityId: text('entity_id'),

    before: jsonb('before'),
    after: jsonb('after'),

    ip: text('ip'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_business_idx').on(t.businessId, t.createdAt),
    index('audit_log_actor_idx').on(t.actorId, t.createdAt),
  ],
);

/**
 * Kunlik hisobot — AI yozgan matn + statistika.
 * `seatId` NULL bo'lsa — butun biznes uchun umumiy hisobot.
 */
export const dailySummary = pgTable(
  'daily_summary',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    seatId: uuid('seat_id').references(() => seat.id, { onDelete: 'cascade' }),

    summaryDate: text('summary_date').notNull(), // YYYY-MM-DD (biznes vaqt zonasida)
    content: text('content'),
    highlights: jsonb('highlights').notNull().default(sql`'[]'::jsonb`),
    stats: jsonb('stats').notNull().default(sql`'{}'::jsonb`),

    triggeredBy: text('triggered_by'), // cron | manual
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('daily_summary_business_date_idx').on(t.businessId, t.summaryDate),
  ],
);
