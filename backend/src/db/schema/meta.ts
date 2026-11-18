import { sql } from 'drizzle-orm';
import { customType, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { crmPipeline } from './crm.js';
import { crmInbox } from './crm2.js';
import { appUser, business } from './tenant.js';

/** Postgres `bytea` — shifrlangan tokenlar (AES-256-GCM, `crypto/secrets.ts`). */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META LEAD ADS — "Facebook orqali ulash" (OAuth)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Qo'lda ulashdan (`integration.kind = crm_facebook`, `crm/tarmoq.ts`) farqi:
 * Meta ilovasi platformada BITTA (env), mijoz kalit kiritmaydi — Meta oynasida
 * ruxsat beradi, sahifa va formalarni tanlaydi.
 *
 * Uchala jadval tenant'ga tegishli (RLS). Tenant kontekstisiz kiradigan joylar
 * (OAuth callback — `state` bo'yicha, webhook — `page_id` bo'yicha, worker)
 * `withoutTenantIsolation` orqali topadi, yozish esa `withTenant` ichida.
 */

/**
 * Kompaniyaning O'Z Meta ilovasi (SaaS: har tashkilot alohida). Rahbar
 * kartaning o'zida kiritadi — serverdagi env'ga tegilmaydi. Bo'lmasa
 * platforma ilovasi (env) ishlatiladi.
 *
 * Har kompaniyaga alohida webhook manzili (`/webhooks/crm/meta-app/:id`) va
 * verify token: imzo shu ilovaning App Secret'i bilan tekshiriladi va hodisa
 * faqat shu kompaniyaning sahifalariga tegishli bo'lishi mumkin.
 */
export const metaAppConfig = pgTable(
  'meta_app_config',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    appId: text('app_id'),
    appName: text('app_name'),
    /** App Secret — shifrlangan, hech qachon qaytmaydi (faqat niqob). */
    appSecretEncrypted: bytea('app_secret_encrypted'),
    secretHint: text('secret_hint'),
    /** Facebook Login for Business konfiguratsiyasi (ixtiyoriy). */
    loginConfigId: text('login_config_id'),
    /** Webhook "Verify token" — server yaratadi, rahbar Meta paneliga nusxalaydi. */
    verifyToken: text('verify_token').notNull(),
    updatedBy: uuid('updated_by').references(() => appUser.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('meta_app_config_business_uq').on(t.businessId)],
);

/**
 * Bitta "ulash" urinishi. `state` ochiq saqlanmaydi — faqat SHA-256 xeshi
 * (sessiya tokenlari kabi). Bir martalik: callback `used_at` ni atomik
 * belgilaydi, ikkinchi marta kelgan o'sha `state` rad etiladi.
 *
 * Callback'dan keyin foydalanuvchiga ruxsat berilgan sahifalar shu yerda
 * turadi: ro'yxat (`pages`, tokensiz) frontend uchun, tokenlar esa shifrlangan
 * (`pages_encrypted`). Ulash tugagach yoki muddati o'tgach tokenlar o'chiriladi.
 */
export const metaOauthSession = pgTable(
  'meta_oauth_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    stateHash: text('state_hash').notNull(),
    /** Callback'dan keyin qaytiladigan origin — start'da tekshirilgan (open redirect yo'q). */
    returnOrigin: text('return_origin').notNull(),
    /** "Qayta ulash" — qaysi ulanish uchun boshlangan (bo'lmasa yangi ulanish). */
    connectionId: uuid('connection_id'),
    /** pending → authorized → consumed | failed */
    status: text('status').notNull().default('pending'),
    /** `state` muddati (Meta oynasida o'tkaziladigan vaqt). */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    /** Ruxsatdan keyin sahifa/forma tanlash uchun berilgan vaqt. */
    selectionExpiresAt: timestamp('selection_expires_at', { withTimezone: true }),
    fbUserId: text('fb_user_id'),
    /** `[{ id, name, tasks }]` — tokensiz, frontend'ga beriladi. */
    pages: jsonb('pages').notNull().default(sql`'[]'::jsonb`),
    /** `[{ id, token }]` — shifrlangan JSON. */
    pagesEncrypted: bytea('pages_encrypted'),
    grantedScopes: jsonb('granted_scopes').notNull().default(sql`'[]'::jsonb`),
    userTokenExpiresAt: timestamp('user_token_expires_at', { withTimezone: true }),
    /** Xato kodi (foydalanuvchiga matn kod bo'yicha tuziladi). */
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_oauth_session_state_uq').on(t.stateHash),
    index('meta_oauth_session_business_idx').on(t.businessId, t.createdAt),
  ],
);

/**
 * Ulangan Facebook sahifasi. Bitta biznes bir nechta sahifa ulay oladi,
 * lekin bitta sahifa bir vaqtda faqat BITTA biznesga faol ulanadi
 * (`meta_page_connection_active_page_uq`) — aks holda lid qaysi tashkilotga
 * tushishi noaniq bo'lardi va bir tashkilot boshqasining ulanishini
 * indamay egallab olardi.
 */
export const metaPageConnection = pgTable(
  'meta_page_connection',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    pageId: text('page_id').notNull(),
    pageName: text('page_name'),
    /** active | error | disconnected */
    status: text('status').notNull().default('active'),
    /** Tanlangan Instant Form'lar: `[{ id, name }]`. Boshqa formadan kelgan lid kiritilmaydi. */
    forms: jsonb('forms').notNull().default(sql`'[]'::jsonb`),
    pipelineId: uuid('pipeline_id').references(() => crmPipeline.id, { onDelete: 'set null' }),
    /** Sahifa tokeni — shifrlangan. Hech qachon API javobida qaytmaydi. */
    pageTokenEncrypted: bytea('page_token_encrypted'),
    /** null — Meta muddat bermagan (bekor qilinishi mumkin, abadiy kafolat emas). */
    tokenExpiresAt: timestamp('token_expires_at', { withTimezone: true }),
    fbUserId: text('fb_user_id'),
    grantedScopes: jsonb('granted_scopes').notNull().default(sql`'[]'::jsonb`),
    /** subscribed | failed | unsubscribed | unknown */
    subscriptionStatus: text('subscription_status').notNull().default('unknown'),
    subscriptionCheckedAt: timestamp('subscription_checked_at', { withTimezone: true }),
    connectedBy: uuid('connected_by').references(() => appUser.id, { onDelete: 'set null' }),
    connectedAt: timestamp('connected_at', { withTimezone: true }).notNull().defaultNow(),
    /** Webhook oxirgi marta shu sahifa bo'yicha kelgan vaqt. */
    lastEventAt: timestamp('last_event_at', { withTimezone: true }),
    /** Birinchi va oxirgi muvaffaqiyatli CRM'ga tushgan lid ("Test lid qabul qilindi"). */
    firstLeadAt: timestamp('first_lead_at', { withTimezone: true }),
    lastLeadAt: timestamp('last_lead_at', { withTimezone: true }),
    /** Kod: token_revoked | permission | leads_access | page_not_found | subscription | rate_limit | network | unknown */
    lastErrorCode: text('last_error_code'),
    lastError: text('last_error'),
    lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
    lastCheckAt: timestamp('last_check_at', { withTimezone: true }),
    /** Oxirgi "Holatni tekshirish" qadamlari. */
    lastCheck: jsonb('last_check'),
    disconnectedAt: timestamp('disconnected_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('meta_page_connection_business_page_uq').on(t.businessId, t.pageId),
    uniqueIndex('meta_page_connection_active_page_uq')
      .on(t.pageId)
      .where(sql`${t.status} <> 'disconnected'`),
  ],
);

/**
 * Webhook'dan kelgan `leadgen` hodisasi — ishonchli saqlanadi, keyin worker
 * ishlaydi (navbat, `analysis_job` bilan bir xil naqsh: `FOR UPDATE SKIP
 * LOCKED`, eksponensial kutish, urinishlar tugasa `failed`).
 *
 * `(business_id, leadgen_id)` unikal — Meta bir hodisani qayta yoki parallel
 * yuborsa ham bitta qator, demak bitta lid. Shaxsiy ma'lumot (ism, telefon)
 * bu yerda SAQLANMAYDI — faqat identifikatorlar.
 *
 *   queued → processing → done | duplicate
 *                       ↘ queued (vaqtinchalik xato, kutish bilan)
 *                       ↘ auth_wait (token bekor/ruxsat yo'q — qayta ulashda navbatga qaytadi)
 *                       ↘ failed (urinishlar tugadi yoki doimiy xato — "Qayta ishlash" bilan qaytariladi)
 *   ignored — tanlanmagan forma (CRM'ga kiritilmaydi)
 */
export const metaLeadgenEvent = pgTable(
  'meta_leadgen_event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    connectionId: uuid('connection_id')
      .notNull()
      .references(() => metaPageConnection.id, { onDelete: 'cascade' }),
    pageId: text('page_id').notNull(),
    leadgenId: text('leadgen_id').notNull(),
    formId: text('form_id'),
    adId: text('ad_id'),
    adgroupId: text('adgroup_id'),
    metaCreatedAt: timestamp('meta_created_at', { withTimezone: true }),
    status: text('status').notNull().default('queued'),
    /** ignored/failed sababi (kod). */
    reason: text('reason'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(6),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lockedBy: text('locked_by'),
    lastError: text('last_error'),
    inboxId: uuid('inbox_id').references(() => crmInbox.id, { onDelete: 'set null' }),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('meta_leadgen_event_lead_uq').on(t.businessId, t.leadgenId),
    index('meta_leadgen_event_claim_idx').on(t.status, t.runAfter),
    index('meta_leadgen_event_connection_idx').on(t.connectionId, t.receivedAt),
  ],
);
