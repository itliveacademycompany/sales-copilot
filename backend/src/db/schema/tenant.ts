import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { activationStatus, memberRole, systemRole } from './enums.js';

/**
 * Ijarachi (tenant). Butun tizimdagi deyarli har bir jadval shunga bog'lanadi
 * va RLS siyosati shu ustun bo'yicha ishlaydi.
 */
export const business = pgTable(
  'business',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    logoUrl: text('logo_url'),

    timezone: text('timezone').notNull().default('Asia/Tashkent'),
    currency: text('currency').notNull().default('UZS'),
    locale: text('locale').notNull().default('uz'),

    /** TZ FR-11: biznes anketasi. AI Playbook Builder shundan oziqlanadi. */
    profile: jsonb('profile').notNull().default(sql`'{}'::jsonb`),

    /**
     * Ish jadvali — `{ startHour, endHour, days: [1..7] }` (ISO: 1 = dushanba).
     *
     * `profile` ichiga qo'yilmadi: u AI promptlariga to'liq uzatiladi va
     * ish soatlari u yerda faqat shovqin bo'lardi. Bu esa hisobot
     * mantiqiga tegishli sozlama — "javobsiz qo'ng'iroq ish vaqtida
     * bo'lganmi" degan savol aynan shundan hisoblanadi.
     */
    workHours: jsonb('work_hours')
      .notNull()
      .default(sql`'{"startHour":9,"endHour":18,"days":[1,2,3,4,5,6]}'::jsonb`),

    /**
     * Qaysi ogohlantirishlar yaratilsin — `{ kinds: {...}, telegram, lowScore }`.
     *
     * Bu sozlama HAQIQATAN ishlaydi: `analyze.ts` ogohlantirish
     * yaratishdan oldin shu yerga qaraydi. Faqat interfeysda turgan,
     * lekin hech narsani o'zgartirmaydigan tugma — yolg'on sozlama.
     */
    alertPrefs: jsonb('alert_prefs').notNull().default(sql`'{}'::jsonb`),

    /** Onboarding sehrgari qaysi qadamda to'xtagani (FR-17). */
    onboardingStep: text('onboarding_step').notNull().default('profile'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    /** Yumshoq o'chirish — FR-159: obuna tugagach ham 90 kun eksport huquqi. */
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('business_slug_uq').on(t.slug)],
);

/**
 * Platforma foydalanuvchisi. Bitta odam bir nechta biznesda bo'lishi mumkin
 * (FR-08), shuning uchun rol bu yerda emas, `business_member` / `seat` da.
 */
export const appUser = pgTable(
  'app_user',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    /** Har doim kichik harfda saqlanadi (ilova darajasida normalizatsiya). */
    email: text('email'),
    /** Sotuvchilar uchun rahbar bergan login (FR-04). */
    login: text('login'),
    passwordHash: text('password_hash'),

    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    locale: text('locale').notNull().default('uz'),

    systemRole: systemRole('system_role').notNull().default('user'),

    telegramId: text('telegram_id'),
    telegramUsername: text('telegram_username'),

    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('app_user_email_uq').on(t.email),
    uniqueIndex('app_user_login_uq').on(t.login),
    uniqueIndex('app_user_telegram_uq').on(t.telegramId),
  ],
);

/** Bo'lim — `head` roli shu doirada ishlaydi. */
export const department = pgTable(
  'department',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /**
     * Bo'lim boshlig'i. `business_member` ga havola, lekin aylanma bog'lanishni
     * oldini olish uchun FK sifatida e'lon qilinmagan — migratsiyada qo'shiladi.
     */
    headMemberId: uuid('head_member_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('department_business_idx').on(t.businessId)],
);

/**
 * Rahbarlar (Ega / Rahbar / Bo'lim boshlig'i / Auditor).
 * Sotuvchi bu jadvalda emas — u `seat` orqali keladi.
 */
export const businessMember = pgTable(
  'business_member',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),

    role: memberRole('role').notNull(),
    departmentId: uuid('department_id').references(() => department.id, {
      onDelete: 'set null',
    }),

    invitedVia: text('invited_via'), // email | telegram | login
    invitedLogin: text('invited_login'),
    activation: activationStatus('activation').notNull().default('pending'),

    isActive: boolean('is_active').notNull().default(true),
    addedAt: timestamp('added_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('business_member_uq').on(t.businessId, t.userId),
    index('business_member_business_idx').on(t.businessId),
  ],
);

/**
 * Sotuvchi o'rni — **litsenziya birligi**. Billing shu jadvalning
 * `is_active` qatorlari soniga qarab hisoblanadi (FR-150).
 *
 * Muhim: seat foydalanuvchisiz ham mavjud bo'la oladi (`userId` null).
 * Bu CRM dan kelgan, lekin hali platformaga taklif qilinmagan sotuvchi.
 */
export const seat = pgTable(
  'seat',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessId: uuid('business_id')
      .notNull()
      .references(() => business.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').references(() => appUser.id, { onDelete: 'set null' }),
    departmentId: uuid('department_id').references(() => department.id, {
      onDelete: 'set null',
    }),

    displayName: text('display_name').notNull(),
    login: text('login'),

    /**
     * FR-84 uchun hal qiluvchi: sotuvchining telefon raqamlari.
     * Speaker rolini deterministik aniqlash shu ro'yxatga tayanadi.
     */
    phoneNumbers: jsonb('phone_numbers').notNull().default(sql`'[]'::jsonb`),
    telegramId: text('telegram_id'),

    /** CRM/telefoniyadagi identifikatorlar: { amocrm: "123", moizvonki: "45" } */
    externalIds: jsonb('external_ids').notNull().default(sql`'{}'::jsonb`),

    /**
     * Shu o'rin uchun ALOHIDA ish jadvali — null bo'lsa biznesnikidan
     * foydalanadi.
     *
     * Nullable ataylab: "jadval yo'q" va "jadval bor, lekin biznesnikiga
     * teng" — bir xil narsa emas. Birinchisida biznes jadvalini
     * o'zgartirsa bu o'rin ham ergashadi, ikkinchisida ergashmaydi.
     * Standart qiymat qo'ysak, bu farqni yo'qotardik.
     */
    workHours: jsonb('work_hours'),

    /**
     * FR-04: aktivatsiya tokenining SHA-256 xeshi — ochiq token hech qachon
     * saqlanmaydi (sessiya va parol tiklash tokenlari kabi). Token faqat
     * rahbarga bir marta ko'rsatiladi va menejer uni `/aktivatsiya/:token`
     * sahifasida ishlatadi.
     */
    activationToken: text('activation_token'),
    /** Token muddati — eski havola cheksiz ochiq eshik bo'lib qolmasin. */
    activationExpiresAt: timestamp('activation_expires_at', { withTimezone: true }),
    activation: activationStatus('activation').notNull().default('pending'),
    telegramLinked: boolean('telegram_linked').notNull().default(false),

    isActive: boolean('is_active').notNull().default(true),
    /** Foydalanuvchi biriktirilganmi (litsenziya sarflanmoqdami). */
    isOccupied: boolean('is_occupied').notNull().default(false),

    /** Denormalizatsiya — ro'yxat ekranini tez ochish uchun, nightly yangilanadi. */
    totalConversations: integer('total_conversations').notNull().default(0),
    avgScore: numeric('avg_score', { precision: 5, scale: 2 }),
    lastConversationAt: timestamp('last_conversation_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('seat_login_uq').on(t.businessId, t.login),
    index('seat_business_idx').on(t.businessId),
    index('seat_user_idx').on(t.userId),
  ],
);

/**
 * Sessiyalar. FR-05: refresh token rotatsiyasi, FR-09: "hamma qurilmadan chiqish".
 * Token o'zi saqlanmaydi — faqat SHA-256 xesh.
 */
export const session = pgTable(
  'session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),

    refreshTokenHash: text('refresh_token_hash').notNull(),
    /** Rotatsiya zanjiri — o'g'irlangan token qayta ishlatilsa aniqlanadi. */
    previousSessionId: uuid('previous_session_id'),

    userAgent: text('user_agent'),
    ip: text('ip'),

    /** Bo'sh turish muddatini hisoblash uchun. */
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }).notNull().defaultNow(),
    /** Mutlaq muddat — rotatsiyada ham uzaytirilmaydi. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /**
     * Nega bekor qilingan: rotated | logout | logout_all | reuse_detected | idle.
     * Bu shunchaki tarix emas — `rotated` uchun qisqa grace oynasi qo'llanadi
     * (bir vaqtdagi so'rovlar poygasi uchun), qolganlari uchun ESA YO'Q.
     * Aks holda "chiqish" tugmasi bir necha soniya ishlamay turadi.
     */
    revokedReason: text('revoked_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('session_refresh_uq').on(t.refreshTokenHash),
    index('session_user_idx').on(t.userId),
  ],
);

/**
 * FR-06: parolni tiklash tokeni.
 *
 * Alohida jadval, `app_user` ustuni emas — chunki muddat va "ishlatilgan"
 * belgisi kerak, hamda bir vaqtda bir nechta so'rov bo'lishi mumkin
 * (foydalanuvchi "yubor" tugmasini ikki marta bosdi).
 *
 * Token bazada **xesh holida** turadi, xuddi sessiya tokeni kabi: baza
 * zaxirasi o'g'irlansa ham u bilan parol tiklab bo'lmaydi.
 *
 * 6 xonali kod EMAS, uzun token ishlatiladi. Kod qulayroq ko'rinadi,
 * lekin 10^6 variantni sinab ko'rish arzon — u holda urinishlar
 * hisoblagichi va qulflash kerak bo'lardi. 32 baytlik token bu
 * muammoni butunlay yo'q qiladi.
 *
 * RLS qo'llanmaydi: `app_user` kabi bu ham tenantdan tashqari
 * (foydalanuvchi bir nechta biznesda bo'lishi mumkin, FR-08).
 */
export const passwordReset = pgTable(
  'password_reset',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),

    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),

    /** `self` — foydalanuvchi so'radi, `admin` — rahbar yaratdi. */
    requestedVia: text('requested_via').notNull().default('self'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('password_reset_token_uq').on(t.tokenHash),
    index('password_reset_user_idx').on(t.userId, t.createdAt),
  ],
);

/** FR-163: ish jadvali — ish vaqtidan tashqari qo'ng'iroqlar alohida belgilanadi. */
export const workSchedule = pgTable('work_schedule', {
  businessId: uuid('business_id')
    .primaryKey()
    .references(() => business.id, { onDelete: 'cascade' }),
  timezone: text('timezone').notNull().default('Asia/Tashkent'),
  /** { mon: [["09:00","18:00"]], tue: [...], ... } */
  days: jsonb('days').notNull().default(sql`'{}'::jsonb`),
  holidays: jsonb('holidays').notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
