import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META LEAD ADS — tekshiruv (soxta Meta server, BAZASIZ)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bu MOCK test: Meta javoblari soxta HTTP serverdan keladi, CRM yozuvi xotirada.
 * Haqiqiy Meta ilovasi, sahifa va Lead Ads Testing Tool bilan end-to-end sinov
 * EMAS — u docs/meta-lead-ads.md dagi tartib bo'yicha alohida bajariladi.
 *
 * Bazaga bog'liq kafolatlar (state'ni atomik bir martalik qilish, unikal
 * indekslar) SQL darajasida — ular bu yerda emas, migratsiya va kodda.
 * Bu yerda tekshiriladi: imzo, state baholash, tenantlar orasidagi sahifa
 * ruxsati, qaytish manzili, webhook tahlili, forma filtri, takroriy va
 * parallel hodisa, token bekor qilinishi, vaqtinchalik xato, xato matnida
 * token sizmasligi, sahifalash.
 */

const APP_SECRET = 'testsecret0123456789abcdef';
process.env.META_APP_ID = '1234567890';
process.env.META_APP_SECRET = APP_SECRET;
process.env.META_WEBHOOK_VERIFY_TOKEN = 'verify-token-0123456789';
delete process.env.META_LOGIN_CONFIG_ID;

let otdi = 0;
let yiqildi = 0;
function check(nom: string, ok: boolean, izoh = ''): void {
  if (ok) {
    otdi++;
    console.log(`  PASS  ${nom}`);
  } else {
    yiqildi++;
    console.error(`  FAIL  ${nom}${izoh ? ' — ' + izoh : ''}`);
  }
}

// ─── Soxta Meta Graph API ────────────────────────────────────────────────────

const TOKEN_OK = 'EAAGpagetokenOK1234567890';
const TOKEN_BEKOR = 'EAAGpagetokenREVOKED12345';
const so_rovlar: { yol: string; params: URLSearchParams }[] = [];

/** leadgen_id → javob. */
const LIDLAR: Record<string, { code: number; body: unknown }> = {
  '111': {
    code: 200,
    body: {
      id: '111',
      created_time: '2026-11-18T10:00:00+0000',
      form_id: '900',
      ad_id: '700',
      adset_id: '701',
      campaign_id: '702',
      platform: 'ig',
      is_organic: false,
      field_data: [
        { name: 'full_name', values: ['Aziza Karimova'] },
        { name: 'phone_number', values: ['998901234567'] },
        { name: 'email', values: ['aziza@example.com'] },
        { name: 'qaysi_kurs_sizni_qiziqtiradi?', values: ['Frontend'] },
      ],
    },
  },
  '112': { code: 200, body: { id: '112', form_id: '900', field_data: [{ name: 'qaysi_filial', values: ['Chilonzor'] }] } },
  '113': { code: 200, body: { id: '113', form_id: '999', field_data: [{ name: 'full_name', values: ['Begona forma'] }] } },
  '120': { code: 500, body: { error: { message: 'An unknown error occurred', code: 1 } } },
  '121': { code: 400, body: { error: { message: 'User request limit reached', code: 17 } } },
  '122': { code: 400, body: { error: { message: `Error validating access token ${TOKEN_OK} has been invalidated`, code: 190 } } },
  '123': { code: 400, body: { error: { message: 'Leads retrieval requires leads access', code: 200 } } },
};

function soxtaMeta(): Server {
  return createServer((req, res) => {
    const u = new URL(req.url ?? '/', 'http://x');
    const yol = u.pathname.replace(/^\/v\d+\.\d+/, '');
    so_rovlar.push({ yol, params: u.searchParams });
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const token = u.searchParams.get('access_token');
    if (token === TOKEN_BEKOR) return json(400, { error: { message: 'Session has expired', code: 190, error_subcode: 463 } });
    // Sahifalash: 3 sahifa, kursor bilan
    if (yol === '/555/leadgen_forms') {
      const after = u.searchParams.get('after');
      if (!after) return json(200, { data: [{ id: '900', name: 'Forma A', status: 'ACTIVE' }], paging: { cursors: { after: 'c1' }, next: 'https://graph.facebook.com/next1' } });
      if (after === 'c1') return json(200, { data: [{ id: '901', name: 'Forma B', status: 'ARCHIVED' }], paging: { cursors: { after: 'c2' }, next: 'https://graph.facebook.com/next2' } });
      return json(200, { data: [{ id: '902', name: 'Forma C', status: 'ACTIVE' }], paging: { cursors: { after: 'c3' } } });
    }
    const m = /^\/(\d+)$/.exec(yol);
    if (m) {
      const fields = u.searchParams.get('fields') ?? '';
      if (fields.includes('ad_name')) return json(200, { ad_name: 'Reklama 1', adset_name: "To'plam", campaign_name: 'Kuzgi qabul' });
      const l = LIDLAR[m[1]!];
      if (l) return json(l.code, l.body);
    }
    return json(404, { error: { message: 'Unknown path', code: 803 } });
  });
}

async function main(): Promise<void> {
  const server = soxtaMeta();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.META_GRAPH_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  // config env'ni import paytida o'qiydi — shuning uchun dinamik import
  const sof = await import('./sof.js');
  const { graf, hammasiniOl } = await import('./graph.js');
  const { dialogManzili, metaSozlama, sozlamaniYig, kompaniyaManzillari } = await import('./sozlama.js');
  const { encryptSecret, decryptSecret } = await import('../../crypto/secrets.js');
  const { qaytishOrigini } = await import('./oauth.js');
  const { hodisaniIshla } = await import('./ishlov.js');
  const { frontendUrl } = await import('../../http/tenant.js');

  console.log('\nA. Webhook imzosi (X-Hub-Signature-256, xom tana)');
  const tana = Buffer.from(JSON.stringify({ object: 'page', entry: [] }));
  const imzo = `sha256=${createHmac('sha256', APP_SECRET).update(tana).digest('hex')}`;
  check("to'g'ri imzo → qabul", sof.imzoTogrimi(tana, imzo, APP_SECRET));
  check('katta harfli hex ham → qabul', sof.imzoTogrimi(tana, imzo.toUpperCase().replace('SHA256=', 'sha256='), APP_SECRET));
  check('boshqa App Secret → rad', !sof.imzoTogrimi(tana, imzo, 'boshqasecret0123456789'));
  check("tana o'zgartirilgan (bitta bayt) → rad", !sof.imzoTogrimi(Buffer.from(tana.toString().replace('[]', '[ ]')), imzo, APP_SECRET));
  check("sarlavha yo'q → rad", !sof.imzoTogrimi(tana, undefined, APP_SECRET));
  check("noto'g'ri shakl (sha1=) → rad", !sof.imzoTogrimi(tana, imzo.replace('sha256', 'sha1'), APP_SECRET));
  check('JSON qayta yozilgan (bo‘shliqlar) → rad', !sof.imzoTogrimi(Buffer.from(JSON.stringify({ object: 'page', entry: [] }, null, 1)), imzo, APP_SECRET));

  console.log('\nB. signed_request (deauthorize / data deletion)');
  const sr = (payload: object, secret = APP_SECRET) => {
    const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
    return `${createHmac('sha256', secret).update(p).digest('base64url')}.${p}`;
  };
  check("to'g'ri → user_id", sof.signedRequestniOch(sr({ algorithm: 'HMAC-SHA256', user_id: '42', issued_at: 1 }), APP_SECRET)?.userId === '42');
  check('begona secret → null', sof.signedRequestniOch(sr({ algorithm: 'HMAC-SHA256', user_id: '42' }, 'x'.repeat(20)), APP_SECRET) === null);
  check("algoritm boshqa → null", sof.signedRequestniOch(sr({ algorithm: 'none', user_id: '42' }), APP_SECRET) === null);
  check('buzilgan satr → null', sof.signedRequestniOch('abc', APP_SECRET) === null);

  console.log('\nC. OAuth state: yaroqsiz, eskirgan, takrorlangan');
  const st = sof.yangiState();
  check('state 43 belgi (32 bayt), shaklga mos', sof.STATE_SHAKLI.test(st.state));
  check('bazaga faqat xesh — state ochiq saqlanmaydi', st.hash !== st.state && st.hash === sof.stateXeshi(st.state) && st.hash.length === 64);
  check('ikki state hech qachon bir xil emas', sof.yangiState().state !== st.state);
  const hozir = new Date();
  const kelajak = new Date(hozir.getTime() + 60_000);
  check('topilmagan (yaroqsiz) state → topilmadi', sof.stateniBahola(null, hozir) === 'topilmadi');
  check("shakli noto'g'ri state bazaga ham bormaydi", !sof.STATE_SHAKLI.test('abc') && !sof.STATE_SHAKLI.test(`${st.state}'--`));
  check('eskirgan → eskirgan', sof.stateniBahola({ usedAt: null, expiresAt: new Date(hozir.getTime() - 1), status: 'pending' }, hozir) === 'eskirgan');
  check('ishlatilgan (used_at) → ishlatilgan', sof.stateniBahola({ usedAt: hozir, expiresAt: kelajak, status: 'pending' }, hozir) === 'ishlatilgan');
  check("holat 'authorized' (qayta kelgan callback) → ishlatilgan", sof.stateniBahola({ usedAt: null, expiresAt: kelajak, status: 'authorized' }, hozir) === 'ishlatilgan');
  check('yangi → ok', sof.stateniBahola({ usedAt: null, expiresAt: kelajak, status: 'pending' }, hozir) === 'ok');

  console.log('\nD. Tenantlar orasidagi ruxsatsiz sahifa tanlash');
  const B1 = '11111111-1111-4111-8111-111111111111';
  const B2 = '22222222-2222-4222-8222-222222222222';
  const U1 = '33333333-3333-4333-8333-333333333333';
  const U2 = '44444444-4444-4444-8444-444444444444';
  const sessiya = {
    businessId: B1,
    userId: U1,
    status: 'authorized',
    selectionExpiresAt: kelajak,
    pages: [
      { id: '555', name: 'ITlive', tasks: ['ADVERTISE', 'ANALYZE'] },
      { id: '556', name: 'Faqat moderator', tasks: ['MODERATE'] },
    ],
  };
  const k = (o: Partial<{ businessId: string; userId: string; pageId: string }>) => ({ businessId: B1, userId: U1, pageId: '555', hozir, ...o });
  const sabab = (r: ReturnType<typeof sof.sahifaRuxsati>) => (r.ok ? 'ok' : r.sabab);
  check("o'z sessiyasi, ruxsat berilgan sahifa → ok", sabab(sof.sahifaRuxsati(sessiya, k({}))) === 'ok');
  check('boshqa biznes shu sessiya ID si bilan → rad (sessiya)', sabab(sof.sahifaRuxsati(sessiya, k({ businessId: B2 }))) === 'sessiya');
  check('shu biznesdagi boshqa foydalanuvchi → rad (sessiya)', sabab(sof.sahifaRuxsati(sessiya, k({ userId: U2 }))) === 'sessiya');
  check('sessiyada berilmagan sahifa ID si → rad (sahifa)', sabab(sof.sahifaRuxsati(sessiya, k({ pageId: '777' }))) === 'sahifa');
  check("sahifada reklama huquqi yo'q → rad (vazifa)", sabab(sof.sahifaRuxsati(sessiya, k({ pageId: '556' }))) === 'vazifa');
  check('tanlash muddati o‘tgan → rad (muddat)', sabab(sof.sahifaRuxsati({ ...sessiya, selectionExpiresAt: new Date(hozir.getTime() - 1) }, k({}))) === 'muddat');
  check("ishlatib bo'lingan (consumed) sessiya → rad", sabab(sof.sahifaRuxsati({ ...sessiya, status: 'consumed' }, k({}))) === 'sessiya');
  check('sessiya yo‘q → rad', sabab(sof.sahifaRuxsati(null, k({}))) === 'sessiya');

  console.log('\nE. Qaytish manzili (open redirect yo‘q)');
  const standart = frontendUrl('acme');
  check('begona domen → o‘z kabinet manzili', qaytishOrigini('https://evil.example.com/x', 'acme') === standart);
  check('javascript: → o‘z kabinet manzili', qaytishOrigini('javascript:alert(1)', 'acme') === standart);
  check('boshqa tenant subdomeni → o‘z kabinet manzili', qaytishOrigini(frontendUrl('beta'), 'acme') === standart);
  check('o‘z subdomeni → qabul (faqat origin)', qaytishOrigini(`${frontendUrl('acme')}/crm?x=1`, 'acme') === standart);

  console.log('\nF. Webhook tanasi: batch, entry/change');
  const hod = sof.leadgenHodisalari({
    object: 'page',
    entry: [
      { id: '555', time: 1, changes: [
        { field: 'leadgen', value: { leadgen_id: '111', page_id: '555', form_id: '900', ad_id: '700', adgroup_id: '701', created_time: 1763460000 } },
        { field: 'feed', value: { item: 'post' } },
        { field: 'leadgen', value: { leadgen_id: 112, page_id: 555, form_id: '900' } },
      ] },
      { id: '556', time: 1, changes: [
        { field: 'leadgen', value: { leadgen_id: '113', form_id: '999' } },
        { field: 'leadgen', value: { leadgen_id: "1;drop", page_id: '556' } },
      ] },
    ],
  });
  check('2 entry × bir nechta change → 3 ta leadgen', hod.length === 3, String(hod.length));
  check("raqam ko'rinishidagi ID ham qabul (112)", hod.some((h) => h.leadgenId === '112' && h.pageId === '555'));
  check("page_id bo'lmasa entry.id olinadi", hod.find((h) => h.leadgenId === '113')?.pageId === '556');
  check("yaroqsiz ID tashlab ketiladi", !hod.some((h) => h.leadgenId.includes(';')));
  check('created_time → Date', hod[0]?.createdTime?.getTime() === 1763460000 * 1000);
  check("object 'page' emas → bo'sh", sof.leadgenHodisalari({ object: 'instagram', entry: [{ changes: [{ field: 'leadgen', value: { leadgen_id: '1', page_id: '2' } }] }] }).length === 0);
  check("buzilgan tana → bo'sh, xato yo'q", sof.leadgenHodisalari('salom').length === 0 && sof.leadgenHodisalari(null).length === 0);

  console.log('\nG. Forma filtri');
  const tanlangan = [{ id: '900', name: 'Forma A' }];
  check('tanlangan forma → kiradi', sof.formaTanlanganmi(tanlangan, '900'));
  check('tanlanmagan forma → kirmaydi', !sof.formaTanlanganmi(tanlangan, '999'));
  check("forma noma'lum → kirmaydi", !sof.formaTanlanganmi(tanlangan, null));
  check("buzilgan sozlama → kirmaydi", !sof.formaTanlanganmi('900', '900'));

  console.log('\nH. Graph xatolarini turlash va qayta urinish');
  check('190 → token_revoked', sof.xatoniTurla({ httpStatus: 400, code: 190 }) === 'token_revoked');
  check('17 → rate_limit', sof.xatoniTurla({ httpStatus: 400, code: 17 }) === 'rate_limit');
  check('80004 (biznes limiti) → rate_limit', sof.xatoniTurla({ httpStatus: 400, code: 80004 }) === 'rate_limit');
  check('200 lid o‘qishda → leads_access', sof.xatoniTurla({ httpStatus: 400, code: 200 }, 'lid') === 'leads_access');
  check('10 boshqa joyda → permission', sof.xatoniTurla({ httpStatus: 400, code: 10 }) === 'permission');
  check('100/33 sahifada → not_found', sof.xatoniTurla({ httpStatus: 400, code: 100, subcode: 33 }) === 'not_found');
  check('HTTP 503 → transient', sof.xatoniTurla({ httpStatus: 503, code: null }) === 'transient');
  check('tarmoq xatosi → transient', sof.xatoniTurla({ httpStatus: null, code: null, tarmoq: true }) === 'transient');
  check('kutish o‘sib boradi: 30 → 90 → 270', sof.kutishSoniya(1, 'transient') === 30 && sof.kutishSoniya(2, 'transient') === 90 && sof.kutishSoniya(3, 'transient') === 270);
  check('kutish 6 soatdan oshmaydi', sof.kutishSoniya(20, 'transient') === 6 * 3600);
  check('limitda kamida 5 daqiqa', sof.kutishSoniya(1, 'rate_limit') === 300);

  console.log('\nI. Lid maydonlari → CRM');
  const m1 = sof.lidniMoslash(LIDLAR['111']!.body as never, { formaNomi: 'Forma A', reklamaNomi: null });
  check('full_name → ism', m1.name === 'Aziza Karimova');
  check('phone_number → +998…', m1.phone === '+998901234567');
  check('email → email', m1.email === 'aziza@example.com');
  check('custom savol → matnga "Savol: javob"', m1.message?.includes('Qaysi kurs sizni qiziqtiradi?: Frontend') === true);
  check("platform 'ig' → instagram", m1.platform === 'instagram');
  const m2 = sof.lidniMoslash(LIDLAR['112']!.body as never, {});
  check("ism va telefon yo'q → null, xato yo'q", m2.name === null && m2.phone === null && m2.message === 'Qaysi filial: Chilonzor');
  check("joylashuv noma'lum → null (Instagram deb taxmin qilinmaydi)", m2.platform === null);
  check("noto'g'ri email → null", sof.lidniMoslash({ id: '1', field_data: [{ name: 'email', values: ['yomon'] }] }, {}).email === null);
  check('first_name + last_name → ism', sof.lidniMoslash({ id: '1', field_data: [{ name: 'first_name', values: ['Ali'] }, { name: 'last_name', values: ['Vali'] }] }, {}).name === 'Ali Vali');

  console.log('\nJ. Meta ruxsat oynasi manzili');
  const cfg = metaSozlama()!;
  check('sozlama env dan o‘qildi', cfg !== null && cfg.appId === '1234567890');
  const d1 = new URL(dialogManzili(cfg, st.state, false));
  check('config_id yo‘q → scope (Instagram/Messenger ruxsatlarisiz)', d1.searchParams.get('scope')?.includes('leads_retrieval') === true && !/instagram|messaging/.test(d1.searchParams.get('scope') ?? ''));
  check('business_management standart so‘ralmaydi', !(d1.searchParams.get('scope') ?? '').includes('business_management'));
  check('state va redirect_uri bor, secret yo‘q', d1.searchParams.get('state') === st.state && Boolean(d1.searchParams.get('redirect_uri')) && !d1.toString().includes(APP_SECRET));
  const d2 = new URL(dialogManzili({ ...cfg, configId: '987654321' }, st.state, true));
  check('config_id bor → scope yuborilmaydi; qayta ulashda auth_type=rerequest', d2.searchParams.get('config_id') === '987654321' && !d2.searchParams.has('scope') && d2.searchParams.get('auth_type') === 'rerequest');

  console.log('\nJ2. SaaS: kompaniyaning o\'z Meta ilovasi');
  const platforma = metaSozlama();
  const KQ = { id: '66666666-6666-4666-8666-666666666666', appId: '5550001112', appSecretEncrypted: encryptSecret('kompaniyasecret0123456789'), loginConfigId: '777000111', verifyToken: 'kompaniya-verify-token-123' };
  const k1 = sozlamaniYig(KQ, decryptSecret, platforma);
  check("to'liq kompaniya ilovasi → platformadan ustun", k1?.manba === 'kompaniya' && k1.appId === '5550001112' && k1.appSecret === 'kompaniyasecret0123456789');
  check('kompaniya ilovasining verify token va Login config ishlatiladi', k1?.verifyToken === 'kompaniya-verify-token-123' && k1?.configId === '777000111' && k1?.ilovaId === KQ.id);
  check("App Secret kiritilmagan (faqat verify token) → platforma ilovasi", sozlamaniYig({ ...KQ, appSecretEncrypted: null }, decryptSecret, platforma)?.manba === 'platforma');
  check("hech biri yo'q → null (\"Integratsiya hali sozlanmagan\")", sozlamaniYig({ ...KQ, appId: null }, decryptSecret, null) === null);
  check('buzilgan shifr → null (begona kalit bilan ishlamaydi)', sozlamaniYig({ ...KQ, appSecretEncrypted: Buffer.from('buzuq-buzuq-buzuq-buzuq-buzuq-buzuq') }, decryptSecret, platforma) === null);
  const km = kompaniyaManzillari(KQ.id);
  check('har kompaniyaga alohida webhook manzili', km.webhookUrl.endsWith('/api/v1/webhooks/crm/meta-app/' + KQ.id) && km.deauthorizeUrl.endsWith('/deauthorize') && km.dataDeletionUrl.endsWith('/data-deletion'));
  const d3 = new URL(dialogManzili(k1!, st.state, false));
  check('Meta oynasi kompaniya App ID va config_id bilan', d3.searchParams.get('client_id') === '5550001112' && d3.searchParams.get('config_id') === '777000111');

  console.log('\nK. Graph klienti: sahifalash, appsecret_proof, token sizmasligi');
  const formlar = await hammasiniOl<{ id: string }>({ yol: '/555/leadgen_forms', token: TOKEN_OK, appSecret: APP_SECRET, params: { fields: 'id,name' } });
  check('3 sahifa kursor bilan → 3 forma', formlar.ok && formlar.data.map((f) => f.id).join() === '900,901,902');
  const oxirgi = so_rovlar.filter((s) => s.yol === '/555/leadgen_forms').at(-1)!;
  check('appsecret_proof = HMAC(App Secret, token)', oxirgi.params.get('appsecret_proof') === createHmac('sha256', APP_SECRET).update(TOKEN_OK).digest('hex'));
  const x = await graf({ yol: '/122', token: TOKEN_OK, appSecret: APP_SECRET, kontekst: 'lid' });
  check('xato matnida token yo‘q', !x.ok && !x.xabar.includes(TOKEN_OK) && x.tur === 'token_revoked');

  console.log('\nL. Lidni ishlash: takroriy, parallel, tanlanmagan forma, token, vaqtinchalik xato');
  const CONN = '55555555-5555-4555-8555-555555555555';
  const inbox = new Map<string, { id: string; payload: Record<string, unknown>; name: string | null; phone: string | null }>();
  let lidSorovlari = 0;
  let ulanish = { status: 'active', pageId: '555', pageName: 'ITlive', forms: tanlangan, pipelineId: null as string | null, token: TOKEN_OK as string | null, appSecret: APP_SECRET as string | null };
  const portlar = {
    ulanish: async () => ulanish,
    lidniOl: async (token: string, appSecret: string, leadgenId: string) => {
      lidSorovlari++;
      return graf<never>({ yol: `/${leadgenId}`, token, appSecret, params: { fields: 'id,field_data,form_id' }, kontekst: 'lid' });
    },
    reklamaNomlari: async (token: string, appSecret: string, leadgenId: string) => {
      const r = await graf<{ ad_name?: string; adset_name?: string; campaign_name?: string }>({ yol: `/${leadgenId}`, token, appSecret, params: { fields: 'ad_name,adset_name,campaign_name' } });
      return r.ok ? { adName: r.data.ad_name, adsetName: r.data.adset_name, campaignName: r.data.campaign_name } : null;
    },
    // Bazadagi `crm_inbox_external_uq` + advisory qulf o'rnini bosadi: tekshirish va yozish bitta sinxron qadamda
    murojaatYoz: async (kk: { businessId: string; leadgenId: string; name: string | null; phone: string | null; payload: Record<string, unknown> }) => {
      await new Promise((r) => setTimeout(r, 5));
      const kalit = `${kk.businessId}:lead:${kk.leadgenId}`;
      const bor = inbox.get(kalit);
      if (bor) return { inboxId: bor.id, takror: true };
      const id = `inbox-${inbox.size + 1}`;
      inbox.set(kalit, { id, payload: kk.payload, name: kk.name, phone: kk.phone });
      return { inboxId: id, takror: false };
    },
  };
  const h = (leadgenId: string, formId: string | null = '900') => ({ businessId: B1, connectionId: CONN, leadgenId, formId, adId: '700', adgroupId: '701' });

  const n1 = await hodisaniIshla(h('111'), portlar);
  const yozuv = inbox.get(`${B1}:lead:111`);
  check('yangi lid → done, "Saralanmagan"ga yozildi', n1.holat === 'done' && Boolean(yozuv));
  check('manba Meta Lead Ads, Page/form/lead/ad/campaign ID saqlandi', yozuv?.payload.provider === 'meta_lead_ads' && yozuv?.payload.pageId === '555' && yozuv?.payload.formId === '900' && yozuv?.payload.leadgenId === '111' && yozuv?.payload.adId === '700' && yozuv?.payload.campaignId === '702');
  check('forma va reklama nomi qo‘shildi', yozuv?.payload.leadForm === 'Forma A' && yozuv?.payload.campaignName === 'Kuzgi qabul');
  check('platform ig → channel instagram', yozuv?.payload.channel === 'instagram');

  const n2 = await hodisaniIshla(h('111'), portlar);
  check('takroriy hodisa → duplicate, yangi yozuv yo‘q', n2.holat === 'duplicate' && inbox.size === 1);

  const parallel = await Promise.all(Array.from({ length: 6 }, () => hodisaniIshla(h('112'), portlar)));
  check('parallel 6 ta bir xil hodisa → 1 ta done, 5 ta duplicate', parallel.filter((x) => x.holat === 'done').length === 1 && parallel.filter((x) => x.holat === 'duplicate').length === 5);
  check('parallel → bitta murojaat', [...inbox.keys()].filter((kk) => kk.endsWith(':lead:112')).length === 1);
  check("ism/telefon yo'q lid ham yozildi (handler yiqilmadi)", inbox.get(`${B1}:lead:112`)?.name === null);
  check("joylashuv noma'lum → channel null", inbox.get(`${B1}:lead:112`)?.payload.channel === null);

  lidSorovlari = 0;
  const n3 = await hodisaniIshla(h('113', '999'), portlar);
  check("tanlanmagan forma → ignored, Graph'ga so'rov ham ketmadi", n3.holat === 'ignored' && lidSorovlari === 0 && !inbox.has(`${B1}:lead:113`));
  const n3b = await hodisaniIshla(h('113', '900'), portlar);
  check("webhook'da tanlangan, Graph'da boshqa forma → ignored", n3b.holat === 'ignored' && !inbox.has(`${B1}:lead:113`));

  const n4 = await hodisaniIshla(h('120'), portlar);
  check('Meta 500 → retry (vaqtinchalik)', n4.holat === 'retry');
  const n5 = await hodisaniIshla(h('121'), portlar);
  check('limit (17) → retry', n5.holat === 'retry' && 'tur' in n5 && n5.tur === 'rate_limit');
  const n6 = await hodisaniIshla(h('122'), portlar);
  check('token bekor (190) → auth_wait, xabarda token yo‘q', n6.holat === 'auth_wait' && 'xabar' in n6 && !n6.xabar.includes(TOKEN_OK));
  const n7 = await hodisaniIshla(h('123'), portlar);
  check('Leads Access yo‘q (200) → auth_wait leads_access', n7.holat === 'auth_wait' && 'tur' in n7 && n7.tur === 'leads_access');

  ulanish = { ...ulanish, token: TOKEN_BEKOR };
  const n8 = await hodisaniIshla(h('111'), portlar);
  check('sahifa tokeni bekor qilingan → auth_wait', n8.holat === 'auth_wait');
  ulanish = { ...ulanish, token: null };
  check("token o'chirilgan → auth_wait", (await hodisaniIshla(h('111'), portlar)).holat === 'auth_wait');
  ulanish = { ...ulanish, token: TOKEN_OK, appSecret: null };
  check("tashkilot ilovasi o'chirilgan (App Secret yo'q) → auth_wait", (await hodisaniIshla(h('111'), portlar)).holat === 'auth_wait');
  ulanish = { ...ulanish, appSecret: APP_SECRET, status: 'disconnected' };
  check('uzilgan ulanish → ignored', (await hodisaniIshla(h('111'), portlar)).holat === 'ignored');

  // Tarmoq umuman yo'q
  ulanish = { ...ulanish, status: 'active' };
  server.close();
  await new Promise((r) => setTimeout(r, 50));
  const n9 = await hodisaniIshla(h('114'), portlar);
  check('Meta serveri ishlamayapti → retry, xato otilmadi', n9.holat === 'retry');

  console.log(`\nMeta Lead Ads (mock, bazasiz): ${otdi} ta o'tdi, ${yiqildi} ta yiqildi.`);
  process.exit(yiqildi > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
