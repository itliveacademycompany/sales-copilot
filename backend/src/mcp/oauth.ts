import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { generateToken, hashToken } from '../auth/tokens.js';
import { config } from '../config.js';
import { withoutTenantIsolation } from '../db/index.js';
import { oauthClient, oauthCode, oauthToken } from '../db/schema/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OAUTH 2.1 AVTORIZATSIYA SERVERI — Claude (MCP) ulanishi uchun
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Oqim (MCP auth spec 2025-06-18, Claude custom connector):
 *   1. Claude `/.well-known/…` dan serverni topadi va `/oauth/register` da
 *      o'zini ro'yxatdan o'tkazadi (DCR).
 *   2. Foydalanuvchini `/oauth/authorize` ga yuboradi → saytdagi ruxsat
 *      sahifasi → foydalanuvchi kirgan holda «Ruxsat berish».
 *   3. Bir martalik kod Claude'ga qaytadi; Claude uni PKCE tasdiq bilan
 *      `/oauth/token` da access + refresh tokenga almashtiradi.
 *   4. `/mcp` ga `Authorization: Bearer <access>` bilan murojaat qiladi.
 *
 * Hammasi shu foydalanuvchi NOMIDAN: token uning huquqlarini meros oladi,
 * ortiq hech narsa bermaydi. `scope` faqat CHEKLAYDI (o'qish yoki boshqarish).
 */

export const SCOPES = ['read', 'write'] as const;
export type Scope = (typeof SCOPES)[number];

export const ACCESS_TTL_S = 60 * 60; // 1 soat
export const REFRESH_TTL_S = 30 * 24 * 60 * 60; // 30 kun
const CODE_TTL_MS = 10 * 60 * 1000;

/** Backend tashqi manzili — issuer va resurs identifikatori shundan. */
export function publicUrl(): string {
  return config.PUBLIC_URL ?? `http://localhost:${config.PORT}`;
}
export function mcpResource(): string {
  return `${publicUrl()}/mcp`;
}

/** `scope` matnini tozalaydi: noma'lumlar tashlanadi, `write` bo'lsa `read` ham. */
export function scopeTozala(scope: string | undefined | null): Scope[] {
  const s = new Set((scope ?? 'read').split(/\s+/).filter((x): x is Scope => (SCOPES as readonly string[]).includes(x)));
  if (s.has('write')) s.add('read');
  if (s.size === 0) s.add('read');
  return SCOPES.filter((x) => s.has(x));
}

/**
 * Qaytish manzili qoidasi: HTTPS — har qanday host (Claude, boshqa mijozlar);
 * HTTP — faqat shu kompyuter (Claude Code / Desktop lokal callback'i).
 * Fragment (`#`) taqiqlangan — RFC 6749 3.1.2.
 */
export function redirectUriTogri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.hash) return false;
    if (u.protocol === 'https:') return true;
    if (u.protocol === 'http:') return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
    return false;
  } catch {
    return false;
  }
}

const q = <T>(sabab: string, fn: Parameters<typeof withoutTenantIsolation<T>>[1]) => withoutTenantIsolation<T>(sabab, fn);

// ─── Mijozlar (DCR, RFC 7591) ─────────────────────────────────────────────

export async function mijozRoyxat(params: { clientName: string; redirectUris: string[] }) {
  const clientId = `sai_${randomBytes(16).toString('hex')}`;
  const [row] = await q('oauth: mijozni ro\'yxatdan o\'tkazish', (tx) =>
    tx
      .insert(oauthClient)
      .values({ clientId, clientName: params.clientName.slice(0, 120), redirectUris: params.redirectUris })
      .returning({ clientId: oauthClient.clientId, clientName: oauthClient.clientName, redirectUris: oauthClient.redirectUris, createdAt: oauthClient.createdAt }),
  );
  return row!;
}

export async function mijozniOl(clientId: string) {
  const [row] = await q('oauth: mijozni o\'qish', (tx) =>
    tx.select().from(oauthClient).where(eq(oauthClient.clientId, clientId)).limit(1),
  );
  return row ?? null;
}

// ─── PKCE ──────────────────────────────────────────────────────────────────

export function pkceTogri(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9\-._~]{43,128}$/.test(verifier)) return false;
  const hisob = createHash('sha256').update(verifier).digest('base64url');
  return hisob === challenge;
}

// ─── Kod ───────────────────────────────────────────────────────────────────

export async function kodBer(params: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: Scope[];
  resource: string | null;
}): Promise<string> {
  const kod = generateToken();
  await q('oauth: avtorizatsiya kodini yozish', (tx) =>
    tx.insert(oauthCode).values({
      codeHash: hashToken(kod),
      clientId: params.clientId,
      userId: params.userId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scope: params.scope.join(' '),
      resource: params.resource,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    }),
  );
  return kod;
}

export interface TokenJavob {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token: string;
  scope: string;
}

export type TokenXato = { error: 'invalid_grant' | 'invalid_client' | 'invalid_request'; error_description: string };

async function juftBer(tx: Parameters<Parameters<typeof withoutTenantIsolation>[1]>[0], p: { grantId: string; clientId: string; userId: string; scope: string }): Promise<TokenJavob> {
  const access = `sai_at_${generateToken()}`;
  const refresh = `sai_rt_${generateToken()}`;
  const hozir = Date.now();
  await tx.insert(oauthToken).values([
    { tokenHash: hashToken(access), kind: 'access', grantId: p.grantId, clientId: p.clientId, userId: p.userId, scope: p.scope, expiresAt: new Date(hozir + ACCESS_TTL_S * 1000) },
    { tokenHash: hashToken(refresh), kind: 'refresh', grantId: p.grantId, clientId: p.clientId, userId: p.userId, scope: p.scope, expiresAt: new Date(hozir + REFRESH_TTL_S * 1000) },
  ]);
  return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_S, refresh_token: refresh, scope: p.scope };
}

/** `authorization_code` grant. Kod BIR MARTALIK: shartli UPDATE bilan egallanadi. */
export async function koddanToken(params: { code: string; clientId: string; redirectUri: string; codeVerifier: string }): Promise<TokenJavob | TokenXato> {
  return q('oauth: kodni tokenga almashtirish', async (tx) => {
    const [kod] = await tx
      .update(oauthCode)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthCode.codeHash, hashToken(params.code)), isNull(oauthCode.usedAt)))
      .returning();
    if (!kod) return { error: 'invalid_grant', error_description: 'Kod noto\'g\'ri yoki allaqachon ishlatilgan' } as const;
    if (kod.expiresAt.getTime() < Date.now()) return { error: 'invalid_grant', error_description: 'Kod muddati o\'tgan' } as const;
    if (kod.clientId !== params.clientId) return { error: 'invalid_grant', error_description: 'Kod boshqa mijozga berilgan' } as const;
    if (kod.redirectUri !== params.redirectUri) return { error: 'invalid_grant', error_description: 'redirect_uri mos emas' } as const;
    if (!pkceTogri(params.codeVerifier, kod.codeChallenge)) return { error: 'invalid_grant', error_description: 'PKCE tekshiruvi o\'tmadi' } as const;
    return juftBer(tx, { grantId: randomUUID(), clientId: kod.clientId, userId: kod.userId, scope: kod.scope });
  });
}

/**
 * `refresh_token` grant — almashtirish (rotation).
 *
 * Ishlatilgan refresh qayta kelsa: kimdir uni nusxalagan — butun ruxsat
 * (grant) bekor qilinadi, haqiqiy mijoz ham qayta ulanishga majbur bo'ladi.
 * Bu OAuth 2.1 (4.3.1) tavsiyasi.
 */
export async function refreshdanToken(params: { refreshToken: string; clientId: string }): Promise<TokenJavob | TokenXato> {
  return q('oauth: refresh tokenni almashtirish', async (tx) => {
    const [t] = await tx
      .select()
      .from(oauthToken)
      .where(and(eq(oauthToken.tokenHash, hashToken(params.refreshToken)), eq(oauthToken.kind, 'refresh')))
      .limit(1);
    if (!t || t.revokedAt) return { error: 'invalid_grant', error_description: 'Refresh token yaroqsiz' } as const;
    if (t.clientId !== params.clientId) return { error: 'invalid_grant', error_description: 'Token boshqa mijozga tegishli' } as const;
    if (t.usedAt) {
      await tx.update(oauthToken).set({ revokedAt: new Date() }).where(and(eq(oauthToken.grantId, t.grantId), isNull(oauthToken.revokedAt)));
      return { error: 'invalid_grant', error_description: 'Refresh token qayta ishlatildi — ruxsat xavfsizlik uchun bekor qilindi' } as const;
    }
    if (t.expiresAt.getTime() < Date.now()) return { error: 'invalid_grant', error_description: 'Refresh token muddati o\'tgan' } as const;
    await tx.update(oauthToken).set({ usedAt: new Date() }).where(eq(oauthToken.id, t.id));
    return juftBer(tx, { grantId: t.grantId, clientId: t.clientId, userId: t.userId, scope: t.scope });
  });
}

export interface AccessInfo {
  userId: string;
  clientId: string;
  grantId: string;
  scope: Scope[];
}

/** Bearer access tokenni tekshiradi. `last_used_at` daqiqada bir marta yangilanadi. */
export async function accessTekshir(token: string): Promise<AccessInfo | null> {
  if (!token.startsWith('sai_at_')) return null;
  return q('oauth: access tokenni tekshirish', async (tx) => {
    const [t] = await tx
      .select()
      .from(oauthToken)
      .where(and(eq(oauthToken.tokenHash, hashToken(token)), eq(oauthToken.kind, 'access'), isNull(oauthToken.revokedAt), gt(oauthToken.expiresAt, new Date())))
      .limit(1);
    if (!t) return null;
    if (!t.lastUsedAt || Date.now() - t.lastUsedAt.getTime() > 60_000) {
      await tx.update(oauthToken).set({ lastUsedAt: new Date() }).where(eq(oauthToken.id, t.id));
    }
    return { userId: t.userId, clientId: t.clientId, grantId: t.grantId, scope: scopeTozala(t.scope) };
  });
}

/** RFC 7009 — tokenni bekor qilish (butun ruxsat bilan). Noma'lum token — jim muvaffaqiyat. */
export async function tokenniBekorQil(token: string): Promise<void> {
  await q('oauth: tokenni bekor qilish', async (tx) => {
    const [t] = await tx.select({ grantId: oauthToken.grantId }).from(oauthToken).where(eq(oauthToken.tokenHash, hashToken(token))).limit(1);
    if (t) await tx.update(oauthToken).set({ revokedAt: new Date() }).where(and(eq(oauthToken.grantId, t.grantId), isNull(oauthToken.revokedAt)));
  });
}

// ─── Foydalanuvchi uchun: ulangan ilovalar ────────────────────────────────

export interface UlanganIlova {
  grantId: string;
  clientName: string;
  scope: Scope[];
  ulangan: string;
  oxirgiFoydalanish: string | null;
}

export async function ulanganIlovalar(userId: string): Promise<UlanganIlova[]> {
  const rows = await q('oauth: foydalanuvchining ulangan ilovalari', (tx) =>
    tx
      .select({
        grantId: oauthToken.grantId,
        clientName: oauthClient.clientName,
        scope: sql<string>`max(${oauthToken.scope})`,
        ulangan: sql<Date>`min(${oauthToken.createdAt})`,
        oxirgi: sql<Date | null>`max(${oauthToken.lastUsedAt})`,
      })
      .from(oauthToken)
      .innerJoin(oauthClient, eq(oauthClient.clientId, oauthToken.clientId))
      .where(and(eq(oauthToken.userId, userId), isNull(oauthToken.revokedAt), gt(oauthToken.expiresAt, new Date())))
      .groupBy(oauthToken.grantId, oauthClient.clientName)
      .orderBy(desc(sql`max(${oauthToken.createdAt})`)),
  );
  return rows.map((r) => ({
    grantId: r.grantId,
    clientName: r.clientName,
    scope: scopeTozala(r.scope),
    ulangan: new Date(r.ulangan).toISOString(),
    oxirgiFoydalanish: r.oxirgi ? new Date(r.oxirgi).toISOString() : null,
  }));
}

export async function ruxsatniBekorQil(userId: string, grantId: string): Promise<boolean> {
  const rows = await q('oauth: foydalanuvchi ruxsatni bekor qildi', (tx) =>
    tx
      .update(oauthToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthToken.userId, userId), eq(oauthToken.grantId, grantId), isNull(oauthToken.revokedAt)))
      .returning({ id: oauthToken.id }),
  );
  return rows.length > 0;
}
