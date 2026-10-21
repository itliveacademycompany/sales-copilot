import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM ADAPTERLARI — amoCRM va Bitrix24 (soxta serverlar, bazasiz)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Har adapter bir xil shartnoma bo'yicha sinaladi: ulash (tekshiruv bilan),
 * xavfsizlik (faqat CRM domenlari), telefon bo'yicha ochiq sdelkani topish,
 * izoh va vazifa yozish. Haqiqiy CRM ga so'rov ketmaydi.
 *
 * Yozuvchi (`yozish.ts`) dagi izoh matni ham shu yerda tekshiriladi.
 */

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

async function tana(req: IncomingMessage): Promise<unknown> {
  let s = '';
  for await (const b of req) s += b;
  return s ? JSON.parse(s) : null;
}

function jwt(expSoniya: number): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'RS256', typ: 'JWT' })}.${b({ exp: expSoniya })}.imzo-imzo-imzo`;
}
const YAXSHI = jwt(Math.floor(Date.now() / 1000) + 365 * 86400);
const BEGONA = YAXSHI + 'x';

// ─── Soxta amoCRM ────────────────────────────────────────────────────────────

const amoYozuvlar: { yol: string; tana: unknown }[] = [];
let amoLimit = 0;

function soxtaAmo(): Server {
  return createServer(async (req, res) => {
    const url = req.url ?? '';
    const auth = req.headers.authorization ?? '';
    const json = (code: number, body?: unknown) => {
      res.writeHead(code, { 'content-type': 'application/hal+json' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (auth === 'Bearer limit') {
      amoLimit++;
      if (amoLimit === 1) return json(429, {});
      return json(200, { id: 7, name: 'Limit', subdomain: 'kompaniya' });
    }
    if (auth === `Bearer ${BEGONA}`) return json(200, { id: 9, name: 'Begona', subdomain: 'boshqa' });
    if (auth !== `Bearer ${YAXSHI}`) return json(401, {});

    if (req.method === 'POST') {
      const t = await tana(req);
      amoYozuvlar.push({ yol: url, tana: t });
      if (url === '/api/v4/leads/501/notes') return json(200, { _embedded: { notes: [{ id: 9001 }] } });
      if (url === '/api/v4/contacts/301/notes') return json(200, { _embedded: { notes: [{ id: 9002 }] } });
      if (url === '/api/v4/tasks') return json(200, { _embedded: { tasks: [{ id: 7001 }] } });
      return json(400, {});
    }
    if (url.startsWith('/api/v4/account')) {
      return json(200, { id: 32826222, name: 'IT Live academy', subdomain: 'kompaniya', country: 'UZ', currency: 'UZS' });
    }
    if (url.startsWith('/api/v4/leads/pipelines')) {
      return json(200, {
        _embedded: {
          pipelines: [
            { id: 2, name: 'Arxiv', sort: 2, is_archive: true },
            {
              id: 1,
              name: 'Call-Center',
              sort: 1,
              is_main: true,
              _embedded: {
                statuses: [
                  { id: 143, name: 'Yopildi', sort: 10000 },
                  { id: 11, name: 'YANGI', sort: 10 },
                  { id: 142, name: 'Sotildi', sort: 9000 },
                ],
              },
            },
          ],
        },
      });
    }
    if (url.startsWith('/api/v4/users')) {
      return json(200, {
        _embedded: { users: [{ id: 1, name: 'Rahbar', rights: { is_admin: true } }, { id: 2, name: 'Ketgan', rights: { is_active: false } }] },
      });
    }
    if (url.startsWith('/api/v4/leads/custom_fields')) return res.writeHead(204).end();
    if (url.startsWith('/api/v4/contacts?query=901234567')) {
      return json(200, {
        _embedded: {
          contacts: [
            // query mos keldi, lekin telefon boshqa — o'tkazib yuborilishi kerak
            { id: 300, name: 'Begona', custom_fields_values: [{ field_code: 'PHONE', values: [{ value: '+998 99 901 23 45' }] }], _embedded: { leads: [{ id: 999 }] } },
            {
              id: 301,
              name: 'Aziza',
              responsible_user_id: 5,
              custom_fields_values: [{ field_code: 'PHONE', values: [{ value: '+998 (90) 123-45-67' }] }],
              _embedded: { leads: [{ id: 500 }, { id: 501 }, { id: 502 }] },
            },
          ],
        },
      });
    }
    if (url.startsWith('/api/v4/contacts?query=977777777')) {
      return json(200, {
        _embedded: {
          contacts: [
            { id: 301, name: 'Aziza', responsible_user_id: 5, custom_fields_values: [{ field_code: 'PHONE', values: [{ value: '977777777' }] }], _embedded: { leads: [{ id: 500 }] } },
          ],
        },
      });
    }
    if (url.startsWith('/api/v4/contacts?query=')) return res.writeHead(204).end();
    if (url.startsWith('/api/v4/leads?')) {
      return json(200, {
        _embedded: {
          leads: [
            { id: 500, name: 'Eski yopilgan', status_id: 143, responsible_user_id: 5, updated_at: 300 },
            { id: 501, name: 'Frontend kursi', status_id: 11, responsible_user_id: 6, updated_at: 200 },
            { id: 502, name: 'Oldingi ochiq', status_id: 11, responsible_user_id: 7, updated_at: 100 },
          ].filter((l) => url.includes(`filter[id][]=${l.id}`)),
        },
      });
    }
    return json(404, {});
  });
}

// ─── Soxta Bitrix24 ──────────────────────────────────────────────────────────

const bxYozuvlar: { usul: string; tana: unknown }[] = [];
const BX_KOD = 'abc123def456';

function soxtaBitrix(): Server {
  return createServer(async (req, res) => {
    const url = req.url ?? '';
    const json = (code: number, body: unknown) => {
      res.writeHead(code, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const m = /^\/rest\/(\d+)\/([a-z0-9]+)\/([a-z.]+)\.json$/i.exec(url);
    if (!m) return json(404, { error: 'NOT_FOUND' });
    if (m[2] !== BX_KOD) return json(401, { error: 'INVALID_CREDENTIALS', error_description: 'Invalid request credentials' });
    const usul = m[3]!;
    const t = (await tana(req)) as Record<string, unknown> | null;
    const r = (result: unknown) => json(200, { result });

    if (usul === 'scope') return r(m[1] === '2' ? ['user'] : ['crm', 'user']);
    if (usul === 'profile') return r({ ID: '1', NAME: 'Bek', LAST_NAME: 'Admin', ADMIN: true });
    if (usul === 'crm.category.list') return r({ categories: [{ id: 0, name: 'Umumiy', isDefault: 'Y' }, { id: 4, name: 'Kurslar', isDefault: 'N' }] });
    if (usul === 'crm.status.list') {
      const e = (t?.filter as Record<string, string>)?.ENTITY_ID;
      return r(
        e === 'DEAL_STAGE'
          ? [{ STATUS_ID: 'NEW', NAME: 'Yangi', SORT: 10, SEMANTICS: null }, { STATUS_ID: 'WON', NAME: 'Sotildi', SORT: 60, SEMANTICS: 'S' }, { STATUS_ID: 'LOSE', NAME: 'Yutqazildi', SORT: 70, SEMANTICS: 'F' }]
          : [{ STATUS_ID: 'C4:NEW', NAME: 'Ariza', SORT: 10, SEMANTICS: null }],
      );
    }
    if (usul === 'user.get') return r([{ ID: '1', NAME: 'Bek', LAST_NAME: 'Admin', ACTIVE: true }, { ID: '3', NAME: 'Old', ACTIVE: false }]);
    if (usul === 'crm.deal.userfield.list') return r([{ ID: '1' }, { ID: '2' }]);
    if (usul === 'crm.duplicate.findbycomm') {
      const v = (t?.values as string[]) ?? [];
      if (v.includes('+998901234567')) return r({ CONTACT: [77] });
      if (v.includes('+998977777777')) return r({ CONTACT: [78] });
      return r([]);
    }
    if (usul === 'crm.deal.list') {
      const ids = ((t?.filter as Record<string, unknown>)?.['@CONTACT_ID'] as number[]) ?? [];
      return r(ids.includes(77) ? [{ ID: '1201', TITLE: 'Backend kursi', ASSIGNED_BY_ID: '9' }] : []);
    }
    if (usul === 'crm.contact.get') return r({ ID: '78', NAME: 'Jasur', LAST_NAME: 'T', ASSIGNED_BY_ID: '4' });
    if (usul === 'crm.timeline.comment.add') {
      bxYozuvlar.push({ usul, tana: t });
      return r(555);
    }
    if (usul === 'crm.activity.todo.add') {
      bxYozuvlar.push({ usul, tana: t });
      return r({ id: 777 });
    }
    return json(400, { error: 'ERROR_METHOD_NOT_FOUND' });
  });
}

async function eshit(s: Server): Promise<string> {
  await new Promise<void>((r) => s.listen(0, '127.0.0.1', r));
  return `http://127.0.0.1:${(s.address() as AddressInfo).port}`;
}

async function xatoTuri(fn: () => Promise<unknown>): Promise<string> {
  const { CrmXato } = await import('./adapter.js');
  try {
    await fn();
    return "xato yo'q";
  } catch (e) {
    return e instanceof CrmXato ? e.tur : `boshqa: ${String(e)}`;
  }
}

async function main(): Promise<void> {
  const amo = soxtaAmo();
  const bx = soxtaBitrix();
  process.env.AMOCRM_API_BASE = await eshit(amo);
  process.env.BITRIX24_API_BASE = await eshit(bx);

  const { telefonKaliti } = await import('./adapter.js');
  const { manzilniAjrat, tokenMuddati, amocrmAdapter } = await import('./amocrm.js');
  const { webhookniAjrat, bitrix24Adapter } = await import('./bitrix24.js');
  const { ADAPTERLAR, CRM_TURLARI, crmConfigniOl, sozlamaniOl } = await import('./index.js');
  const { izohMatni } = await import('./yozish.js');

  console.log("\nA. Ro'yxat va umumiy yordamchilar");
  check('ikkala CRM ro\'yxatda', CRM_TURLARI.join(',') === 'amocrm,bitrix24');
  check('har adapterda forma maydoni bor', CRM_TURLARI.every((k) => ADAPTERLAR[k].maydonlar.length > 0 && ADAPTERLAR[k].qollanma.length > 0));
  check('har adapterda sir maydoni bor', CRM_TURLARI.every((k) => ADAPTERLAR[k].maydonlar.some((m) => m.tur === 'sir')));
  check('telefon kaliti — oxirgi 9 raqam', telefonKaliti('+998 (90) 123-45-67') === '901234567' && telefonKaliti('8 90 123 45 67') === '901234567');
  check('qisqa raqam — null', telefonKaliti('1234') === null);
  check('sozlama standart: izoh va vazifa yoqiq', JSON.stringify(sozlamaniOl({})) === '{"izoh":true,"vazifa":true,"boshlanish":null}');
  check('eski amoCRM sozlamasi o\'qiladi', crmConfigniOl({ amocrm: { subdomain: 'acme', baseDomain: 'kommo.com' } }).address === 'acme.kommo.com');

  console.log('\nB. amoCRM — manzil xavfsizligi va token');
  const m = (s: string) => JSON.stringify(manzilniAjrat(s));
  check('subdomen → amocrm.ru', m('Kompaniya') === '{"subdomain":"kompaniya","baseDomain":"amocrm.ru"}');
  check('to\'liq manzil + yo\'l', m('https://kompaniya.amocrm.ru/leads/pipeline/1/') === '{"subdomain":"kompaniya","baseDomain":"amocrm.ru"}');
  check('kommo.com', m('acme.kommo.com') === '{"subdomain":"acme","baseDomain":"kommo.com"}');
  check('begona domen rad', manzilniAjrat('kompaniya.evil.com') === null && manzilniAjrat('a.amocrm.ru.evil.com') === null);
  check('IP va ichma-ich rad', manzilniAjrat('127.0.0.1:3000') === null && manzilniAjrat('a.b.amocrm.ru') === null);
  check('email kabi kirish rad', manzilniAjrat('demo@sotuvai.local') === null);
  check('JWT exp o\'qiladi', tokenMuddati(jwt(1000))?.getTime() === 1_000_000 && tokenMuddati('oddiy') === null);

  console.log('\nC. amoCRM — ulash');
  const n = await amocrmAdapter.ulash({ address: 'kompaniya.amocrm.ru', token: YAXSHI }, null);
  check('to\'g\'ri token → ulandi', n.hisob.nom === 'IT Live academy' && n.config.accountId === 32826222 && n.sir === YAXSHI);
  check('sir niqoblangan', !n.sirKorinishi.includes(YAXSHI.slice(10, 30)));
  check('token muddati saqlanadi', n.tokenExpiresAt !== null);
  check("noto'g'ri token → token xatosi", (await xatoTuri(() => amocrmAdapter.ulash({ address: 'kompaniya', token: 'yomon-token-123456789' }, null))) === 'token');
  check('boshqa hisob tokeni → rad', (await xatoTuri(() => amocrmAdapter.ulash({ address: 'kompaniya', token: BEGONA }, null))) === 'hisob');
  check("noto'g'ri manzil → kirish xatosi", (await xatoTuri(() => amocrmAdapter.ulash({ address: 'demo@sotuvai.local', token: YAXSHI }, null))) === 'kirish');
  check(
    "bo'sh token + o'sha manzil → eski token",
    (await amocrmAdapter.ulash({ address: 'kompaniya', token: '' }, { config: n.config, sir: YAXSHI })).sir === YAXSHI,
  );
  check(
    "bo'sh token + boshqa manzil → rad",
    (await xatoTuri(() => amocrmAdapter.ulash({ address: 'boshqa', token: '' }, { config: n.config, sir: YAXSHI }))) === 'kirish',
  );
  const limitCtx = { config: n.config, sir: 'limit' };
  check('429 → bir marta qayta urinadi', (await amocrmAdapter.tekshir(limitCtx)).nom === 'Limit' && amoLimit === 2);

  console.log('\nD. amoCRM — tuzilish, sdelka, yozish');
  const ctx = { config: n.config, sir: YAXSHI };
  const t = await amocrmAdapter.tuzilish(ctx);
  check('arxiv yashirildi, bosqichlar tartibda', t.pipelines.length === 1 && t.pipelines[0]!.statuses.map((s) => s.id).join(',') === '11,142,143');
  check('tizim bosqichlari turi', t.pipelines[0]!.statuses[1]!.tur === 'muvaffaqiyat' && t.pipelines[0]!.statuses[2]!.tur === 'yopilgan');
  check('foydalanuvchilar', t.users.length === 2 && t.users[1]!.isActive === false);

  const y = await amocrmAdapter.topish(ctx, '+998901234567');
  check('telefon → eng so\'nggi OCHIQ sdelka', y?.tur === 'deal' && y.id === '501' && y.masulId === '6', JSON.stringify(y));
  check('begona kontakt (telefon mos emas) o\'tkazildi', !JSON.stringify(y).includes('999'));
  check('sdelka havolasi', y?.url.endsWith('/leads/detail/501') === true);
  const yk = await amocrmAdapter.topish(ctx, '977777777');
  check('ochiq sdelka yo\'q → kontakt', yk?.tur === 'contact' && yk.id === '301' && yk.masulId === '5');
  check('topilmadi → null', (await amocrmAdapter.topish(ctx, '+998935555555')) === null);

  check('izoh → sdelkaga', (await amocrmAdapter.izoh(ctx, y!, 'Salom')) === '9001');
  const iz = amoYozuvlar.find((w) => w.yol === '/api/v4/leads/501/notes')?.tana as { note_type: string; params: { text: string } }[];
  check('izoh turi common, matn o\'zgarmagan', iz?.[0]?.note_type === 'common' && iz[0].params.text === 'Salom');
  check('izoh → kontaktga', (await amocrmAdapter.izoh(ctx, yk!, 'K')) === '9002');
  const muddat = new Date('2027-01-02T10:00:00Z');
  check('vazifa yaratildi', (await amocrmAdapter.vazifa(ctx, y!, { sarlavha: 'SotuvAI: qayta qo\'ng\'iroq', matn: 'narx', muddat })) === '7001');
  const vz = amoYozuvlar.find((w) => w.yol === '/api/v4/tasks')?.tana as Record<string, unknown>[];
  check(
    'vazifa: sdelkaga, mas\'ulga, muddat bilan',
    vz?.[0]?.entity_id === 501 && vz[0].entity_type === 'leads' && vz[0].responsible_user_id === 6 && vz[0].complete_till === muddat.getTime() / 1000,
    JSON.stringify(vz?.[0]),
  );

  console.log('\nE. Bitrix24 — webhook xavfsizligi');
  check('to\'g\'ri webhook', JSON.stringify(webhookniAjrat(`https://acme.bitrix24.ru/rest/1/${BX_KOD}/`)) === `{"portal":"acme.bitrix24.ru","userId":"1","kod":"${BX_KOD}"}`);
  check('usul bilan nusxalangan', webhookniAjrat(`https://acme.bitrix24.kz/rest/12/${BX_KOD}/profile.json`)?.userId === '12');
  check('http rad', webhookniAjrat(`http://acme.bitrix24.ru/rest/1/${BX_KOD}/`) === null);
  check('begona domen rad', webhookniAjrat(`https://acme.bitrix24.ru.evil.com/rest/1/${BX_KOD}/`) === null && webhookniAjrat(`https://evil.com/rest/1/${BX_KOD}/`) === null);
  check('port / login bilan rad', webhookniAjrat(`https://acme.bitrix24.ru:8443/rest/1/${BX_KOD}/`) === null && webhookniAjrat(`https://u:p@acme.bitrix24.ru/rest/1/${BX_KOD}/`) === null);
  check("yo'l noto'g'ri → rad", webhookniAjrat('https://acme.bitrix24.ru/crm/deal/') === null);

  console.log('\nF. Bitrix24 — ulash, tuzilish, sdelka, yozish');
  const bn = await bitrix24Adapter.ulash({ webhook: `https://acme.bitrix24.ru/rest/1/${BX_KOD}/` }, null);
  check('ulandi', bn.hisob.nom === 'acme.bitrix24.ru' && bn.config.webhookUser === 'Bek Admin');
  check('kod niqoblangan', !bn.sirKorinishi.includes(BX_KOD));
  check("noto'g'ri kod → token xatosi", (await xatoTuri(() => bitrix24Adapter.ulash({ webhook: 'https://acme.bitrix24.ru/rest/1/notogrikod1/' }, null))) === 'token');
  check('CRM ruxsati yo\'q → ruxsat xatosi', (await xatoTuri(() => bitrix24Adapter.ulash({ webhook: `https://acme.bitrix24.ru/rest/2/${BX_KOD}/` }, null))) === 'ruxsat');
  check("bo'sh → eski webhook", (await bitrix24Adapter.ulash({ webhook: '' }, { config: bn.config, sir: bn.sir })).sir === bn.sir);

  const bctx = { config: bn.config, sir: bn.sir };
  const bt = await bitrix24Adapter.tuzilish(bctx);
  check('yo\'nalishlar → voronkalar', bt.pipelines.length === 2 && bt.pipelines[0]!.isMain && bt.pipelines[1]!.statuses[0]!.id === 'C4:NEW');
  check('semantika: S/F', bt.pipelines[0]!.statuses[1]!.tur === 'muvaffaqiyat' && bt.pipelines[0]!.statuses[2]!.tur === 'yopilgan');
  check('foydalanuvchilar va maydonlar', bt.users.length === 2 && bt.users[1]!.isActive === false && bt.leadFieldCount === 2);

  const by = await bitrix24Adapter.topish(bctx, '90 123 45 67');
  check('telefon → ochiq sdelka', by?.tur === 'deal' && by.id === '1201' && by.masulId === '9' && by.url.endsWith('/crm/deal/details/1201/'));
  const byk = await bitrix24Adapter.topish(bctx, '+998977777777');
  check('sdelka yo\'q → kontakt', byk?.tur === 'contact' && byk.id === '78' && byk.nom === 'Jasur T');
  check('topilmadi → null', (await bitrix24Adapter.topish(bctx, '+998935555555')) === null);

  check('izoh → xronologiya', (await bitrix24Adapter.izoh(bctx, by!, 'Salom')) === '555');
  const bi = bxYozuvlar.find((w) => w.usul === 'crm.timeline.comment.add')?.tana as { fields: Record<string, unknown> };
  check('izoh sdelkaga', bi?.fields.ENTITY_TYPE === 'deal' && bi.fields.ENTITY_ID === 1201 && bi.fields.COMMENT === 'Salom');
  check('vazifa → ish', (await bitrix24Adapter.vazifa(bctx, by!, { sarlavha: 'SotuvAI: X', matn: 'Y', muddat })) === '777');
  const bv = bxYozuvlar.find((w) => w.usul === 'crm.activity.todo.add')?.tana as Record<string, unknown>;
  check('ish: sdelka, mas\'ul, muddat', bv?.ownerTypeId === 2 && bv.ownerId === 1201 && bv.responsibleId === 9 && bv.deadline === muddat.toISOString());

  console.log('\nG. Izoh matni');
  const matn = izohMatni({
    til: 'uz',
    timezone: 'Asia/Tashkent',
    boshlandi: new Date('2026-10-21T09:05:00Z'),
    davomiylikSoniya: 192,
    menejer: 'Maktuba',
    baho: 72.4,
    xulosa: 'Mijoz narxni so‘radi',
    kamchilik: 'Ehtiyoj aniqlanmadi',
    keyingi: ['Ertaga qayta qo‘ng‘iroq'],
    havola: 'https://acme.sotuv.uz/suhbatlar/abc',
  });
  check('sarlavha, sana (Toshkent vaqti), davomiylik', matn.startsWith("SotuvAI · qo'ng'iroq tahlili\n21.10.2026, 14:05 · 3:12 · Menejer: Maktuba"), matn.split('\n')[1]);
  check('baho yaxlitlangan', matn.includes('Baho: 72/100'));
  check('xulosa, kamchilik, keyingi qadam, havola', ['Xulosa: Mijoz', 'Asosiy kamchilik: Ehtiyoj', 'Keyingi qadam: Ertaga', 'Batafsil: https://acme.sotuv.uz/suhbatlar/abc'].every((s) => matn.includes(s)));
  const ru = izohMatni({ til: 'ru', timezone: 'Asia/Tashkent', boshlandi: new Date(), davomiylikSoniya: null, menejer: null, baho: null, xulosa: null, kamchilik: null, keyingi: [], havola: 'x' });
  check('rus tilida, baholanmagan', ru.includes('анализ звонка') && ru.includes('Оценка: не оценивался') && !ru.includes('Итог'));

  amo.close();
  bx.close();
  console.log(`\nCRM: ${otdi} ta o'tdi, ${yiqildi} ta yiqildi.`);
  process.exit(yiqildi > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
