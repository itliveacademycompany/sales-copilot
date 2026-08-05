import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { integrationKind, integrationStatus, syncDirection } from './enums.js';
import { business } from './tenant.js';

/** Postgres `bytea` — shifrlangan kalitlar uchun. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * Tashqi tizim ulanishi.
 *
 * Ikkita qoida:
 *  - **Webhook asosiy, polling faqat zaxira** (FR-72/73). CRM ga har
 *    daqiqada so'rov yuborish ishlaydi, lekin bu keraksiz yuk va kechikish —
 *    o'zgarish bo'lganda tashqi tizim o'zi xabar bersin.
 *  - **Integratsiya sahifasi oddiy tilda, 3 qadam.** "DLQ", "tombstone",
 *    "backfill" kabi muhandis atamalari sozlash ekranida turmaydi:
 *    uni sozlaydigan odam dasturchi emas.
 */
export const integration = pgTable(
  'integration',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    kind: integrationKind('kind').notNull(),
    status: integrationStatus('status').notNull().default('disconnected'),

    /** Ommaviy sozlamalar — sirlar bu yerda EMAS. */
    config: jsonb('config').notNull().default(sql`'{}'::jsonb`),

    /**
     * OAuth tokenlari va API kalitlari — AES-256-GCM bilan shifrlangan.
     * Kalit `CREDENTIALS_KEY` env dan keladi va DB da hech qachon saqlanmaydi.
     * Shuning uchun DB zaxira nusxasi o'g'irlansa ham kalitlar ochilmaydi.
     */
    credentialsEncrypted: bytea('credentials_encrypted'),
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),

    /** Kiruvchi webhook imzosini tekshirish uchun. */
    webhookSecret: text('webhook_secret'),

    syncEnabled: boolean('sync_enabled').notNull().default(true),
    /** Faqat webhook ishlamasa ishlatiladigan zaxira interval. */
    pollIntervalMinutes: integer('poll_interval_minutes').notNull().default(15),

    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastSyncStatus: text('last_sync_status'),
    lastError: text('last_error'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('integration_business_kind_uq').on(t.businessId, t.kind),
    index('integration_business_idx').on(t.businessId),
  ],
);

/** Sinxronizatsiya jurnali — FR-76. Nosozlikni topish uchun. */
export const syncLog = pgTable(
  'sync_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    integrationId: uuid('integration_id')
      .notNull()
      .references(() => integration.id, { onDelete: 'cascade' }),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    direction: syncDirection('direction').notNull(),
    entity: text('entity').notNull(), // call | lead | contact | manager
    status: text('status').notNull(), // ok | error | skipped
    itemCount: integer('item_count'),
    payloadHash: text('payload_hash'),
    error: text('error'),
    durationMs: integer('duration_ms'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sync_log_integration_idx').on(t.integrationId, t.createdAt)],
);
