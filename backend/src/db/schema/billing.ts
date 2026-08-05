import {
  bigserial,
  boolean,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { subscriptionStatus, transactionType } from './enums.js';
import { conversation } from './conversation.js';
import { appUser, business } from './tenant.js';

/**
 * Obuna. Seat asosida narxlanadi (FR-150).
 *
 * ═══ FR-156: DEGRADED REJIM ═══
 * Odatiy yondashuvda obuna muzlaganda **ma'lumot yig'ish ham to'xtaydi**.
 * Ya'ni mijoz to'lovni bir hafta kechiktirsa, o'sha haftaning suhbatlari
 * butunlay yo'qoladi va ularni qaytarib bo'lmaydi. Mijozni to'lov
 * kechikkani uchun ma'lumotidan mahrum qilish — uni qaytib kelmaydigan
 * qilib yo'qotish.
 *
 * Bizda `degraded` holatida: yangi TAHLIL to'xtaydi, lekin YIG'ISH davom
 * etadi va eski ma'lumot ko'rinadi. To'lov kelganda hammasi qayta ishlanadi.
 */
export const subscription = pgTable('subscription', {
  businessId: uuid('business_id')
    .primaryKey()
    .references(() => business.id, { onDelete: 'cascade' }),

  status: subscriptionStatus('status').notNull().default('trial'),
  plan: text('plan').notNull().default('business'),

  seatPrice: numeric('seat_price', { precision: 14, scale: 2 }).notNull().default('0'),
  currency: text('currency').notNull().default('UZS'),
  balance: numeric('balance', { precision: 14, scale: 2 }).notNull().default('0'),

  currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
  currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
  billingDay: integer('billing_day').notNull().default(1),

  trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
  graceEndsAt: timestamp('grace_ends_at', { withTimezone: true }),
  /** FR-159: obuna tugagach ham eksport huquqi shu sanagacha. */
  dataRetentionUntil: timestamp('data_retention_until', { withTimezone: true }),

  /** FR-153: avtomatik yechish (rozilik bilan). */
  autoCharge: boolean('auto_charge').notNull().default(false),
  savedCardToken: text('saved_card_token'),
  paymentProvider: text('payment_provider'), // payme | click | uzum

  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const billingTransaction = pgTable(
  'billing_transaction',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),

    type: transactionType('type').notNull(),
    amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
    balanceBefore: numeric('balance_before', { precision: 14, scale: 2 }).notNull(),
    balanceAfter: numeric('balance_after', { precision: 14, scale: 2 }).notNull(),
    currency: text('currency').notNull().default('UZS'),

    description: text('description'),
    seatsCount: integer('seats_count'),
    seatPrice: numeric('seat_price', { precision: 14, scale: 2 }),
    periodStart: timestamp('period_start', { withTimezone: true }),
    periodEnd: timestamp('period_end', { withTimezone: true }),

    partnerCommission: numeric('partner_commission', { precision: 14, scale: 2 }),
    paymentProvider: text('payment_provider'),
    paymentId: text('payment_id'),

    performedBy: uuid('performed_by').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('billing_transaction_business_idx').on(t.businessId, t.createdAt)],
);

/**
 * FR-89: har bir tahlilning aniq tannarxi.
 *
 * Buni P0 qilganimning sababi: 100 seat = oyiga ~$1000 LLM xarajati.
 * Qaysi mijoz foydali, qaysisi zararli ekanini **birinchi kundan** bilish kerak.
 */
export const usageRecord = pgTable(
  'usage_record',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    conversationId: uuid('conversation_id').references(() => conversation.id, {
      onDelete: 'set null',
    }),

    stage: text('stage').notNull(), // stt | stage2 | stage3 | coaching_agg | playbook_gen
    provider: text('provider'),
    model: text('model'),

    sttSeconds: numeric('stt_seconds', { precision: 10, scale: 2 }),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('usage_record_business_idx').on(t.businessId, t.createdAt)],
);
