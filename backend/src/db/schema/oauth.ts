import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { appUser } from './tenant.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OAUTH 2.1 — Claude (MCP) ulanishi uchun
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rahbar platformani o'z Claude akkauntidan boshqaradi: Claude MCP mijozi
 * sifatida ro'yxatdan o'tadi (DCR, RFC 7591), foydalanuvchi saytda ruxsat
 * beradi va Claude shu foydalanuvchi NOMIDAN ishlaydi — uning huquqlaridan
 * ortiq hech narsa qila olmaydi.
 *
 * Platforma darajasidagi jadvallar (biznesga emas, foydalanuvchiga tegishli),
 * shuning uchun RLS yo'q — faqat `withoutTenantIsolation` orqali o'qiladi.
 *
 * Kod va tokenlar HECH QACHON ochiq saqlanmaydi — faqat SHA-256 xeshi
 * (sessiya tokenlari kabi): baza zaxirasi o'g'irlansa ham ular ishlamaydi.
 */

/** Ro'yxatdan o'tgan MCP mijozi (Claude, Claude Desktop, Claude Code …). */
export const oauthClient = pgTable('oauth_client', {
  id: uuid('id').primaryKey().defaultRandom(),
  /** Tashqariga beriladigan identifikator (`client_id`). */
  clientId: text('client_id').notNull().unique(),
  clientName: text('client_name').notNull(),
  /** Faqat shu manzillarga kod qaytariladi — ochiq yo'naltirishning oldini oladi. */
  redirectUris: jsonb('redirect_uris').$type<string[]>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Bir martalik avtorizatsiya kodi (PKCE bilan, 10 daqiqa). */
export const oauthCode = pgTable(
  'oauth_code',
  {
    codeHash: text('code_hash').primaryKey(),
    clientId: text('client_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    redirectUri: text('redirect_uri').notNull(),
    /** PKCE S256 — kodni ushlagan begona uni almashtira olmaydi. */
    codeChallenge: text('code_challenge').notNull(),
    scope: text('scope').notNull(),
    resource: text('resource'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('oauth_code_user_idx').on(t.userId)],
);

/**
 * Access (1 soat) va refresh (30 kun) tokenlari.
 *
 * `grantId` — bitta ruxsat (foydalanuvchi × mijoz) ostidagi barcha tokenlar.
 * Refresh har ishlatilganda almashtiriladi (rotation); ESKI refresh qayta
 * kelsa — o'g'irlangan deb hisoblanib, butun ruxsat bekor qilinadi.
 */
export const oauthToken = pgTable(
  'oauth_token',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tokenHash: text('token_hash').notNull().unique(),
    kind: text('kind').$type<'access' | 'refresh'>().notNull(),
    grantId: uuid('grant_id').notNull(),
    clientId: text('client_id').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => appUser.id, { onDelete: 'cascade' }),
    scope: text('scope').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    /** Refresh almashtirilganda belgilanadi — qayta ishlatilsa o'g'irlik belgisi. */
    usedAt: timestamp('used_at', { withTimezone: true }),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('oauth_token_user_idx').on(t.userId),
    index('oauth_token_grant_idx').on(t.grantId),
    index('oauth_token_active_idx').on(t.userId, t.clientId).where(sql`${t.revokedAt} is null`),
  ],
);
