import { createHash, randomBytes } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { eq, like, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { appUser, oauthClient } from '../db/schema/index.js';
import { mcpResource } from '../mcp/oauth.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MCP + OAUTH TESTI — Claude ulanishining to'liq oqimi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:mcp
 *
 * Mijoz — rasmiy MCP SDK (Claude ishlatadigan kutubxona), haqiqiy HTTP orqali.
 * Tekshiriladi: kashfiyot, DCR, PKCE, bir martalik kod, scope cheklovi,
 * sotuvchi ruxsat bera olmasligi, hisob amallari tokenga yopiqligi,
 * refresh almashtirish va o'g'irlik aniqlanishi, bekor qilish.
 */

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = ''): void {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const tag = Date.now().toString(36);
const PAROL = 'juda-maxfiy-parol-123';
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';

function pkce() {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
}

async function main(): Promise<void> {
  const app: FastifyInstance = await buildApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as { port: number }).port;
  const base = `http://127.0.0.1:${port}`;
  console.log('\nMCP + OAuth (Claude ulanishi)\n');

  const ownerEmail = `mcp-owner-${tag}@test.local`;
  try {
    const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email: ownerEmail, password: PAROL, displayName: 'Rahbar', businessName: `MCP ${tag}` } });
    const sid = { sid: reg.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    const businessId = (reg.json() as { businesses: { businessId: string }[] }).businesses[0]!.businessId;
    await withoutTenantIsolation('test: onboarding yakuni', (tx) => tx.execute(sql`update business set onboarding_step = 'done' where id = ${businessId}`));

    // ═══ A: KASHFIYOT ═══
    console.log('— A: kashfiyot —');
    const prm = (await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource' })).json() as { resource: string; authorization_servers: string[] };
    check('protected-resource metadata', prm.resource === mcpResource() && prm.authorization_servers.length === 1);
    const asm = (await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' })).json() as Record<string, unknown>;
    check('authorization-server metadata (DCR, PKCE S256)', !!asm.registration_endpoint && (asm.code_challenge_methods_supported as string[]).includes('S256'));
    const anon = await app.inject({ method: 'POST', url: '/mcp', payload: {} });
    check('tokensiz /mcp — 401 + WWW-Authenticate', anon.statusCode === 401 && String(anon.headers['www-authenticate']).includes('resource_metadata'));

    // ═══ B: DCR ═══
    console.log('\n— B: ro\'yxatdan o\'tish —');
    const dcr = await app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: `Claude ${tag}`, redirect_uris: [CALLBACK] } });
    const clientId = (dcr.json() as { client_id: string }).client_id;
    check('DCR — mijoz yaratildi', dcr.statusCode === 201 && clientId.startsWith('sai_'));
    const yomonDcr = await app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: `Yomon ${tag}`, redirect_uris: ['http://evil.example/cb'] } });
    check('http (localhost emas) qaytish manzili rad etiladi', yomonDcr.statusCode === 400);

    // ═══ C: AVTORIZATSIYA ═══
    console.log('\n— C: avtorizatsiya —');
    const params = (p: { challenge: string }, scope = 'read write') => ({
      response_type: 'code',
      client_id: clientId,
      redirect_uri: CALLBACK,
      code_challenge: p.challenge,
      code_challenge_method: 'S256',
      state: 'holat-123',
      scope,
      resource: mcpResource(),
    });
    const p1 = pkce();
    const auth = await app.inject({ method: 'GET', url: `/oauth/authorize?${new URLSearchParams(params(p1))}` });
    check('authorize → saytdagi ruxsat sahifasiga', auth.statusCode === 302 && String(auth.headers.location).includes('/mcp/ruxsat?'));
    const begonaRedirect = await app.inject({ method: 'GET', url: `/oauth/authorize?${new URLSearchParams({ ...params(p1), redirect_uri: 'https://evil.example/cb' })}` });
    check('begona redirect_uri — yo\'naltirmaydi (400)', begonaRedirect.statusCode === 400);
    const pkcesiz = await app.inject({ method: 'GET', url: `/oauth/authorize?${new URLSearchParams({ ...params(p1), code_challenge_method: 'plain' })}` });
    check('PKCE S256 siz — error bilan qaytadi', pkcesiz.statusCode === 302 && String(pkcesiz.headers.location).includes('error=invalid_request'));

    const info = (await app.inject({ method: 'POST', url: '/api/v1/oauth/authorize/info', cookies: sid, payload: params(p1) })).json() as { ruxsatBeraOladi: boolean; claudeRasmiy: boolean; clientName: string };
    check('ruxsat sahifasi: rahbar, Claude rasmiy manzili', info.ruxsatBeraOladi && info.claudeRasmiy && info.clientName === `Claude ${tag}`);

    const qaror = async (p: { challenge: string }, scope: 'read' | 'write', cookies = sid) =>
      app.inject({ method: 'POST', url: '/api/v1/oauth/authorize/decide', cookies, payload: { params: params(p), approve: true, scope } });
    const d1 = (await qaror(p1, 'read')).json() as { redirect: string };
    const kod1 = new URL(d1.redirect).searchParams.get('code')!;
    check('ruxsat → kod va state qaytdi', !!kod1 && new URL(d1.redirect).searchParams.get('state') === 'holat-123');

    const token = (b: Record<string, string>) => app.inject({ method: 'POST', url: '/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(b).toString() });
    const notogriPkce = await token({ grant_type: 'authorization_code', code: kod1, redirect_uri: CALLBACK, client_id: clientId, code_verifier: pkce().verifier });
    check('noto\'g\'ri PKCE — invalid_grant', notogriPkce.statusCode === 400 && (notogriPkce.json() as { error: string }).error === 'invalid_grant');
    const qaytaKod = await token({ grant_type: 'authorization_code', code: kod1, redirect_uri: CALLBACK, client_id: clientId, code_verifier: p1.verifier });
    check('kod bir martalik (yiqilgan urinishdan keyin ham)', qaytaKod.statusCode === 400);

    const p2 = pkce();
    const kod2 = new URL(((await qaror(p2, 'read')).json() as { redirect: string }).redirect).searchParams.get('code')!;
    const t2 = await token({ grant_type: 'authorization_code', code: kod2, redirect_uri: CALLBACK, client_id: clientId, code_verifier: p2.verifier });
    const oqishTok = t2.json() as { access_token: string; refresh_token: string; scope: string; expires_in: number };
    check('to\'g\'ri PKCE — access + refresh, scope=read', t2.statusCode === 200 && oqishTok.access_token.startsWith('sai_at_') && oqishTok.scope === 'read' && oqishTok.expires_in === 3600, t2.body.slice(0, 200));
    const nomalum = await token({ grant_type: 'refresh_token', refresh_token: oqishTok.refresh_token, client_id: 'sai_yoq' });
    check('noma\'lum mijoz — 401 invalid_client', nomalum.statusCode === 401 && (nomalum.json() as { error: string }).error === 'invalid_client');

    // ═══ D: MCP — faqat o'qish ═══
    console.log('\n— D: MCP (faqat o\'qish) —');
    const ulan = async (access: string) => {
      const c = new Client({ name: 'verify', version: '1.0.0' });
      await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${access}` } } }));
      return c;
    };
    const c1 = await ulan(oqishTok.access_token);
    const vositalar = (await c1.listTools()).tools.map((t) => t.name);
    check('o\'qish vositalari bor', ['list_businesses', 'get_team_overview', 'get_conversation', 'list_alerts', 'get_analytics'].every((v) => vositalar.includes(v)), vositalar.join(','));
    check('«read» ruxsatida yozish vositalari YO\'Q', !vositalar.includes('create_task') && !vositalar.includes('update_alert'));
    const lb = (await c1.callTool({ name: 'list_businesses', arguments: {} })) as { content: { text: string }[] };
    check('list_businesses — o\'z biznesi', lb.content[0]!.text.includes(`MCP ${tag}`));
    const ov = (await c1.callTool({ name: 'get_team_overview', arguments: { days: 7 } })) as { isError?: boolean; content: { text: string }[] };
    check('get_team_overview — REST orqali ishladi', !ov.isError && ov.content[0]!.text.includes('kpi'), ov.content[0]?.text.slice(0, 200));
    const yomonId = (await c1.callTool({ name: 'get_conversation', arguments: { conversation_id: '00000000-0000-0000-0000-000000000000' } })) as { isError?: boolean; content: { text: string }[] };
    check('yo\'q suhbat — tushunarli xato (stack trace emas)', yomonId.isError === true && yomonId.content[0]!.text.startsWith('Topilmadi'));
    const prompts = (await c1.listPrompts()).prompts.map((p) => p.name);
    check('tayyor so\'rovlar: weekly_review, coach_manager', prompts.includes('weekly_review') && prompts.includes('coach_manager'));
    await c1.close();

    const yozuvRest = await app.inject({ method: 'POST', url: `/api/v1/businesses/${businessId}/tasks`, headers: { authorization: `Bearer ${oqishTok.access_token}` }, payload: { title: 'Sinov vazifa' } });
    check('«read» token bilan REST yozuv — 403', yozuvRest.statusCode === 403);
    const hisobAmal = await app.inject({ method: 'POST', url: '/api/v1/auth/change-password', headers: { authorization: `Bearer ${oqishTok.access_token}` }, payload: { currentPassword: 'x', newPassword: 'yyyyyyyyyyyy' } });
    check('hisob amali (parol) token bilan yopiq — 403', hisobAmal.statusCode === 403);
    const ctx = await app.inject({ method: 'GET', url: '/api/v1/auth/context', headers: { authorization: `Bearer ${oqishTok.access_token}` } });
    check('token bilan auth/context o\'qiladi', ctx.statusCode === 200);

    // ═══ E: MCP — boshqarish ═══
    console.log('\n— E: MCP (boshqarish) —');
    const p3 = pkce();
    const kod3 = new URL(((await qaror(p3, 'write')).json() as { redirect: string }).redirect).searchParams.get('code')!;
    const yozTok = (await token({ grant_type: 'authorization_code', code: kod3, redirect_uri: CALLBACK, client_id: clientId, code_verifier: p3.verifier })).json() as { access_token: string; refresh_token: string; scope: string };
    check('«write» ruxsati — scope="read write"', yozTok.scope === 'read write');
    const c2 = await ulan(yozTok.access_token);
    check('«write» da create_task bor', (await c2.listTools()).tools.some((t) => t.name === 'create_task'));
    const vz = (await c2.callTool({ name: 'create_task', arguments: { title: `Claude vazifasi ${tag}` } })) as { isError?: boolean; content: { text: string }[] };
    check('create_task — vazifa yaratildi', !vz.isError && vz.content[0]!.text.includes(`Claude vazifasi ${tag}`), vz.content[0]?.text.slice(0, 200));
    await c2.close();

    // ═══ F: SOTUVCHI ═══
    console.log('\n— F: sotuvchi —');
    const login = `mcpsot-${tag}`;
    const seat = (await app.inject({ method: 'POST', url: `/api/v1/businesses/${businessId}/seats`, cookies: sid, payload: { displayName: 'Sotuvchi', login } })).json() as { id: string };
    const akt = (await app.inject({ method: 'POST', url: `/api/v1/businesses/${businessId}/seats/${seat.id}/activation-link`, cookies: sid })).json() as { activationToken: string };
    const sotKir = await app.inject({ method: 'POST', url: '/api/v1/auth/activate', payload: { token: akt.activationToken, password: PAROL } });
    const sotSid = { sid: sotKir.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    const sotInfo = (await app.inject({ method: 'POST', url: '/api/v1/oauth/authorize/info', cookies: sotSid, payload: params(pkce()) })).json() as { ruxsatBeraOladi: boolean };
    check('sotuvchiga ruxsat sahifasi «bera olmaysiz» deydi', sotInfo.ruxsatBeraOladi === false);
    const sotQaror = await qaror(pkce(), 'read', sotSid);
    check('sotuvchi ruxsat bera olmaydi — 403', sotQaror.statusCode === 403);

    // ═══ G: REFRESH VA BEKOR QILISH ═══
    console.log('\n— G: refresh va bekor qilish —');
    const r1 = await token({ grant_type: 'refresh_token', refresh_token: yozTok.refresh_token, client_id: clientId });
    const yangi = r1.json() as { access_token: string; refresh_token: string };
    check('refresh — yangi juftlik', r1.statusCode === 200 && yangi.refresh_token !== yozTok.refresh_token);
    const mcpOk = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${yangi.access_token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, payload: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
    check('yangi access ishlaydi', mcpOk.statusCode === 200);
    const ogri = await token({ grant_type: 'refresh_token', refresh_token: yozTok.refresh_token, client_id: clientId });
    check('eski refresh qayta keldi — rad etildi', ogri.statusCode === 400);
    const keyin = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${yangi.access_token}`, 'content-type': 'application/json' }, payload: {} });
    check('o\'g\'rilik — butun ruxsat bekor (yangi access ham 401)', keyin.statusCode === 401);

    const mi = (await app.inject({ method: 'GET', url: '/api/v1/mcp/info', cookies: sid })).json() as { mcpUrl: string; ilovalar: { grantId: string; scope: string[] }[] };
    check('mcp/info — manzil va ulangan ilova (read)', mi.mcpUrl === mcpResource() && mi.ilovalar.length === 1 && mi.ilovalar[0]!.scope.join(' ') === 'read', JSON.stringify(mi.ilovalar));
    const bekor = await app.inject({ method: 'DELETE', url: `/api/v1/mcp/grants/${mi.ilovalar[0]!.grantId}`, cookies: sid });
    const bekordan = await app.inject({ method: 'POST', url: '/mcp', headers: { authorization: `Bearer ${oqishTok.access_token}`, 'content-type': 'application/json' }, payload: {} });
    check('saytdan bekor qilindi — token 401', bekor.statusCode === 200 && bekordan.statusCode === 401);
  } finally {
    await app.close();
    await withoutTenantIsolation('test tozalash: MCP mijozlari va sotuvchi', async (tx) => {
      await tx.delete(oauthClient).where(like(oauthClient.clientName, `% ${tag}`));
      await tx.delete(appUser).where(eq(appUser.login, `mcpsot-${tag}`));
    });
    await cleanupTestDataQuietly(ownerEmail);
    await closeDb();
  }

  console.log(`\n${pass} o'tdi, ${fail} yiqildi`);
  if (fail > 0) process.exit(1);
  console.log('MCP butun.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
