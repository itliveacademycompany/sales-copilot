import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import {
  ACCESS_TTL_S,
  accessTekshir,
  kodBer,
  koddanToken,
  mcpResource,
  mijozniOl,
  mijozRoyxat,
  publicUrl,
  redirectUriTogri,
  refreshdanToken,
  ruxsatniBekorQil,
  SCOPES,
  scopeTozala,
  tokenniBekorQil,
  ulanganIlovalar,
} from '../../mcp/oauth.js';
import { requireAuth } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OAUTH 2.1 + MCP KASHFIYOT MARSHRUTLARI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ochiq (Claude serveridan keladi): `/.well-known/*`, `/oauth/register`,
 * `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`.
 * Sessiya bilan (saytdagi foydalanuvchi): `/api/v1/oauth/*`, `/api/v1/mcp/*`.
 *
 * OAuth xatolari RFC 6749 shaklida (`{ error, error_description }`) — bizning
 * RFC 7807 formatimizda emas: Claude va boshqa mijozlar aynan shuni kutadi.
 */

/** Rahbarlik huquqi — kompaniya egasi, rahbar yoki platforma admini. */
function rahbarmi(auth: NonNullable<import('fastify').FastifyRequest['auth']>): boolean {
  return auth.user.systemRole === 'super_admin' || auth.businesses.some((b) => b.permissions.includes('analytics:read:all'));
}

const authorizeQuery = z.object({
  response_type: z.string(),
  client_id: z.string().min(1).max(200),
  redirect_uri: z.string().min(1).max(2000),
  code_challenge: z.string().min(43).max(128).optional(),
  code_challenge_method: z.string().optional(),
  state: z.string().max(2000).optional(),
  scope: z.string().max(200).optional(),
  resource: z.string().max(500).optional(),
});
type AuthorizeQuery = z.infer<typeof authorizeQuery>;

/**
 * So'rovni tekshiradi. Mijoz yoki qaytish manzili noto'g'ri bo'lsa — XATOni
 * shu yerda ko'rsatamiz, hech qayerga yo'naltirmaymiz (ochiq yo'naltirishga
 * yo'l qo'ymaslik uchun, RFC 6749 4.1.2.1).
 */
async function authorizeTekshir(raw: unknown): Promise<
  | { ok: true; q: AuthorizeQuery; client: NonNullable<Awaited<ReturnType<typeof mijozniOl>>> }
  | { ok: false; redirect: false; xabar: string }
  | { ok: false; redirect: true; uri: string; xato: string; tavsif: string; state?: string }
> {
  const p = authorizeQuery.safeParse(raw);
  if (!p.success) return { ok: false, redirect: false, xabar: 'So\'rov parametrlari noto\'g\'ri' };
  const q = p.data;
  const client = await mijozniOl(q.client_id);
  if (!client) return { ok: false, redirect: false, xabar: 'Noma\'lum mijoz (client_id). Claude\'da ulanishni qaytadan qo\'shing.' };
  if (!client.redirectUris.includes(q.redirect_uri)) return { ok: false, redirect: false, xabar: 'Qaytish manzili (redirect_uri) bu mijozga tegishli emas' };
  const xato = (xato: string, tavsif: string) => ({ ok: false as const, redirect: true as const, uri: q.redirect_uri, xato, tavsif, state: q.state });
  if (q.response_type !== 'code') return xato('unsupported_response_type', 'Faqat response_type=code');
  if (!q.code_challenge || q.code_challenge_method !== 'S256') return xato('invalid_request', 'PKCE (S256) majburiy');
  if (q.resource && !q.resource.startsWith(publicUrl())) return xato('invalid_target', 'Resurs bu serverga tegishli emas');
  return { ok: true, q, client };
}

function xatoBilanQayt(reply: FastifyReply, uri: string, error: string, tavsif: string, state?: string) {
  const u = new URL(uri);
  u.searchParams.set('error', error);
  u.searchParams.set('error_description', tavsif);
  if (state) u.searchParams.set('state', state);
  return reply.redirect(u.toString());
}

export function registerOauthRoutes(app: FastifyInstance): void {
  /**
   * `application/x-www-form-urlencoded` — RFC 6749 bo'yicha token endpointi
   * aynan shu formatda keladi. Qo'shimcha paket o'rniga 3 qator.
   */
  if (!app.hasContentTypeParser('application/x-www-form-urlencoded')) {
    app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (_req, body, done) => {
      done(null, Object.fromEntries(new URLSearchParams(body as string)));
    });
  }

  // ─── Kashfiyot (RFC 9728, RFC 8414) ─────────────────────────────────────

  const resursMeta = () => ({
    resource: mcpResource(),
    authorization_servers: [publicUrl()],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ['header'],
    resource_name: 'Sotuv Intellekti',
  });
  app.get('/.well-known/oauth-protected-resource', async () => resursMeta());
  app.get('/.well-known/oauth-protected-resource/mcp', async () => resursMeta());

  const serverMeta = () => ({
    issuer: publicUrl(),
    authorization_endpoint: `${publicUrl()}/oauth/authorize`,
    token_endpoint: `${publicUrl()}/oauth/token`,
    registration_endpoint: `${publicUrl()}/oauth/register`,
    revocation_endpoint: `${publicUrl()}/oauth/revoke`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: [...SCOPES],
  });
  app.get('/.well-known/oauth-authorization-server', async () => serverMeta());
  app.get('/.well-known/oauth-authorization-server/mcp', async () => serverMeta());

  // ─── DCR (RFC 7591) ─────────────────────────────────────────────────────

  app.post('/oauth/register', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = z
      .object({
        client_name: z.string().trim().min(1).max(120).default('MCP mijozi'),
        redirect_uris: z.array(z.string().max(2000)).min(1).max(10),
        token_endpoint_auth_method: z.string().optional(),
      })
      .safeParse(req.body ?? {});
    if (!body.success) {
      reply.status(400);
      return { error: 'invalid_client_metadata', error_description: 'redirect_uris majburiy' };
    }
    const yomon = body.data.redirect_uris.find((u) => !redirectUriTogri(u));
    if (yomon) {
      reply.status(400);
      return { error: 'invalid_redirect_uri', error_description: `Ruxsat etilmagan manzil: ${yomon} (faqat https yoki localhost)` };
    }
    const c = await mijozRoyxat({ clientName: body.data.client_name, redirectUris: body.data.redirect_uris });
    reply.status(201);
    return {
      client_id: c.clientId,
      client_name: c.clientName,
      redirect_uris: c.redirectUris,
      client_id_issued_at: Math.floor(c.createdAt.getTime() / 1000),
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    };
  });

  // ─── Avtorizatsiya → saytdagi ruxsat sahifasi ──────────────────────────

  app.get('/oauth/authorize', async (req, reply) => {
    const t = await authorizeTekshir(req.query);
    if (!t.ok && !t.redirect) {
      reply.status(400).type('text/html; charset=utf-8');
      return `<!doctype html><meta charset="utf-8"><title>Ulanish xatosi</title><body style="font-family:system-ui;padding:40px;max-width:560px;margin:auto"><h2>Ulanib bo'lmadi</h2><p>${t.xabar.replace(/[<>&]/g, '')}</p></body>`;
    }
    if (!t.ok && t.redirect) return xatoBilanQayt(reply, t.uri, t.xato, t.tavsif, t.state);
    // Ruxsat sahifasi frontendda — u kirishni ham, tanlovni ham ko'rsatadi.
    const u = new URL('/mcp/ruxsat', config.WEB_ORIGIN);
    for (const [k, v] of Object.entries(req.query as Record<string, string>)) u.searchParams.set(k, String(v));
    return reply.redirect(u.toString());
  });

  /** Ruxsat sahifasi uchun: kim so'rayapti, nima so'rayapti, foydalanuvchi bera oladimi. */
  app.post('/api/v1/oauth/authorize/info', { preHandler: requireAuth }, async (req) => {
    const t = await authorizeTekshir(req.body);
    if (!t.ok) throw AppError.badRequest(t.redirect ? t.tavsif : t.xabar);
    const host = new URL(t.q.redirect_uri).host;
    return {
      clientName: t.client.clientName,
      redirectHost: host,
      /** Claude'ning rasmiy qaytish manzili — interfeys «tasdiqlangan» belgisini ko'rsatadi. */
      claudeRasmiy: host === 'claude.ai' || host === 'claude.com',
      scope: scopeTozala(t.q.scope),
      ruxsatBeraOladi: rahbarmi(req.auth!),
      foydalanuvchi: { displayName: req.auth!.user.displayName, email: req.auth!.user.email },
      bizneslar: req.auth!.businesses.map((b) => ({ name: b.name, role: b.role })),
    };
  });

  /** Foydalanuvchi qarori → Claude'ga qaytish manzili (kod yoki rad etish). */
  app.post('/api/v1/oauth/authorize/decide', { preHandler: requireAuth }, async (req) => {
    const body = z.object({ params: z.record(z.string()), approve: z.boolean(), scope: z.enum(['read', 'write']).default('read') }).parse(req.body);
    const t = await authorizeTekshir(body.params);
    if (!t.ok) throw AppError.badRequest(t.redirect ? t.tavsif : t.xabar);

    const qaytish = new URL(t.q.redirect_uri);
    if (t.q.state) qaytish.searchParams.set('state', t.q.state);
    if (!body.approve) {
      qaytish.searchParams.set('error', 'access_denied');
      qaytish.searchParams.set('error_description', 'Foydalanuvchi ruxsat bermadi');
      return { redirect: qaytish.toString() };
    }
    if (!rahbarmi(req.auth!)) throw AppError.forbidden('Claude ulanishi faqat kompaniya egasi va rahbarlar uchun');

    // So'ralgandan ortiq ruxsat berilmaydi: Claude «read» so'rasa — «write» bo'lmaydi.
    const soralgan = scopeTozala(t.q.scope ?? 'read write');
    const scope = scopeTozala(body.scope === 'write' && soralgan.includes('write') ? 'read write' : 'read');
    const kod = await kodBer({
      clientId: t.q.client_id,
      userId: req.auth!.user.id,
      redirectUri: t.q.redirect_uri,
      codeChallenge: t.q.code_challenge!,
      scope,
      resource: t.q.resource ?? null,
    });
    qaytish.searchParams.set('code', kod);
    return { redirect: qaytish.toString() };
  });

  // ─── Token ──────────────────────────────────────────────────────────────

  app.post('/oauth/token', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    reply.header('Cache-Control', 'no-store');
    const b = (req.body ?? {}) as Record<string, string | undefined>;
    const yomon = (kod: number, error: string, error_description: string) => {
      reply.status(kod);
      return { error, error_description };
    };
    if (!b.client_id) return yomon(401, 'invalid_client', 'client_id majburiy');
    const client = await mijozniOl(b.client_id);
    // RFC 6749: noma'lum mijoz — 401 invalid_client; Claude buni ko'rib qayta ro'yxatdan o'tadi.
    if (!client) return yomon(401, 'invalid_client', 'Mijoz topilmadi — qayta ro\'yxatdan o\'ting');

    let natija;
    if (b.grant_type === 'authorization_code') {
      if (!b.code || !b.redirect_uri || !b.code_verifier) return yomon(400, 'invalid_request', 'code, redirect_uri va code_verifier majburiy');
      natija = await koddanToken({ code: b.code, clientId: client.clientId, redirectUri: b.redirect_uri, codeVerifier: b.code_verifier });
    } else if (b.grant_type === 'refresh_token') {
      if (!b.refresh_token) return yomon(400, 'invalid_request', 'refresh_token majburiy');
      natija = await refreshdanToken({ refreshToken: b.refresh_token, clientId: client.clientId });
    } else {
      return yomon(400, 'unsupported_grant_type', 'Faqat authorization_code va refresh_token');
    }
    if ('error' in natija) return yomon(400, natija.error, natija.error_description);
    return natija;
  });

  app.post('/oauth/revoke', async (req, reply) => {
    const b = (req.body ?? {}) as Record<string, string | undefined>;
    if (b.token) await tokenniBekorQil(b.token);
    reply.status(200);
    return {};
  });

  // ─── Sayt: Claude ulanishi bo'limi ─────────────────────────────────────

  app.get('/api/v1/mcp/info', { preHandler: requireAuth }, async (req) => ({
    mcpUrl: mcpResource(),
    ommaviy: publicUrl().startsWith('https://'),
    ruxsatBeraOladi: rahbarmi(req.auth!),
    accessTtlSoniya: ACCESS_TTL_S,
    ilovalar: await ulanganIlovalar(req.auth!.user.id),
  }));

  app.delete('/api/v1/mcp/grants/:grantId', { preHandler: requireAuth }, async (req) => {
    const { grantId } = z.object({ grantId: z.string().uuid() }).parse(req.params);
    if (!(await ruxsatniBekorQil(req.auth!.user.id, grantId))) throw AppError.notFound();
    return { ok: true };
  });
}

/** `/mcp` uchun Bearer tekshiruvi — `auth-plugin` ham shundan foydalanadi. */
export { accessTekshir };
