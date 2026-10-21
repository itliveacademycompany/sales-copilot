import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * amoCRM — ulanish mantiqi: manzil xavfsizligi, token, hisob, tuzilish
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Haqiqiy amoCRM o'rniga LOKAL soxta server. Haqiqiy token bilan sinash
 * testni begona hisobga va tarmoqqa bog'lab qo'yardi. Baza kerak emas.
 *
 * Soxta server faqat GET qabul qiladi: boshqa usul kelsa — test yiqiladi
 * (ulanish bosqichida amoCRM ga hech narsa yozilmasligi kafolati).
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

/** Soxta JWT: faqat `exp` muhim (imzo tekshirilmaydi). */
function jwt(expSoniya: number): string {
  const b = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b({ alg: 'RS256', typ: 'JWT' })}.${b({ exp: expSoniya, account_id: 1 })}.imzo-imzo-imzo`;
}

const YAXSHI = jwt(Math.floor(Date.now() / 1000) + 365 * 86400);
const BEGONA = jwt(Math.floor(Date.now() / 1000) + 365 * 86400) + 'x';
let limitUrinish = 0;
let yozishUrinishi = 0;

function soxtaAmo(): Server {
  return createServer((req, res) => {
    if (req.method !== 'GET') {
      yozishUrinishi++;
      res.writeHead(405).end();
      return;
    }
    const auth = req.headers.authorization ?? '';
    const url = req.url ?? '';
    const json = (code: number, body?: unknown) => {
      res.writeHead(code, { 'content-type': 'application/hal+json' });
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    if (url.startsWith('/api/v4/account') && auth === 'Bearer limit') {
      limitUrinish++;
      if (limitUrinish === 1) return json(429, { title: 'Too Many Requests' });
      return json(200, { id: 7, name: 'Limit hisob', subdomain: 'kompaniya', country: 'UZ', currency: 'UZS' });
    }
    if (auth === `Bearer ${BEGONA}` && url.startsWith('/api/v4/account')) {
      return json(200, { id: 9, name: 'Begona', subdomain: 'boshqa', country: 'UZ', currency: 'UZS' });
    }
    if (auth !== `Bearer ${YAXSHI}`) return json(401, { title: 'Unauthorized' });

    if (url.startsWith('/api/v4/account')) {
      return json(200, { id: 32826222, name: 'IT Live academy', subdomain: 'kompaniya', country: 'UZ', currency: 'UZS' });
    }
    if (url.startsWith('/api/v4/leads/pipelines')) {
      return json(200, {
        _embedded: {
          pipelines: [
            { id: 2, name: 'Arxiv', sort: 3, is_main: false, is_archive: true, _embedded: { statuses: [] } },
            {
              id: 1,
              name: 'Call-Center',
              sort: 1,
              is_main: true,
              is_archive: false,
              _embedded: {
                statuses: [
                  { id: 143, name: 'Закрыто и не реализовано', sort: 10000 },
                  { id: 11, name: 'YANGI MUROJAT', sort: 10 },
                  { id: 142, name: 'Успешно реализовано', sort: 9000 },
                  { id: 12, name: "MA'LUMOT BERILDI", sort: 20 },
                ],
              },
            },
          ],
        },
      });
    }
    if (url.startsWith('/api/v4/users')) {
      return json(200, {
        _embedded: {
          users: [
            { id: 1, name: 'Rahbar', rights: { is_admin: true, is_active: true } },
            { id: 2, name: 'Operator', rights: { is_admin: false, is_active: true } },
            { id: 3, name: 'Ketgan', rights: { is_admin: false, is_active: false } },
          ],
        },
      });
    }
    if (url.startsWith('/api/v4/leads/custom_fields')) return res.writeHead(204).end();
    return json(404, { title: 'Not found' });
  });
}

async function main(): Promise<void> {
  const server = soxtaAmo();
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  process.env.AMOCRM_API_BASE = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const { AmoXato, hisobManzili, hisobniTekshir, manzilniAjrat, tokenMuddati, tuzilishniOl } = await import('./amocrm.js');

  console.log('\nA. Manzil — faqat amoCRM domenlari (SSRF himoyasi)');
  const m = (s: string) => JSON.stringify(manzilniAjrat(s));
  check('subdomenning o\'zi → amocrm.ru', m('Kompaniya') === '{"subdomain":"kompaniya","baseDomain":"amocrm.ru"}');
  check('to\'liq manzil + yo\'l', m('https://kompaniya.amocrm.ru/leads/pipeline/1/?x=1') === '{"subdomain":"kompaniya","baseDomain":"amocrm.ru"}');
  check('amocrm.com', m('acme.amocrm.com') === '{"subdomain":"acme","baseDomain":"amocrm.com"}');
  check('kommo.com', m('acme.kommo.com/') === '{"subdomain":"acme","baseDomain":"kommo.com"}');
  check('begona domen rad', manzilniAjrat('kompaniya.evil.com') === null);
  check('amocrm.ru.evil.com rad', manzilniAjrat('a.amocrm.ru.evil.com') === null);
  check('ichma-ich subdomen rad', manzilniAjrat('a.b.amocrm.ru') === null);
  check('ichki IP rad', manzilniAjrat('http://169.254.169.254/') === null);
  check('localhost → faqat localhost.amocrm.ru (ichki xostga emas)', m('localhost:3000') === '{"subdomain":"localhost","baseDomain":"amocrm.ru"}');
  check('IP + port rad', manzilniAjrat('127.0.0.1:3000') === null);
  check("bo'sh rad", manzilniAjrat('   ') === null);
  check('hisob havolasi', hisobManzili({ subdomain: 'acme', baseDomain: 'kommo.com' }) === 'https://acme.kommo.com');

  console.log('\nB. Token muddati (JWT exp)');
  const exp = Math.floor(Date.now() / 1000) + 1000;
  check('exp o\'qiladi', tokenMuddati(jwt(exp))?.getTime() === exp * 1000);
  check('JWT emas → null', tokenMuddati('oddiy-kalit') === null);
  check('buzuq payload → null', tokenMuddati('a.%%%.c') === null);

  console.log('\nC. Hisobni tekshirish');
  const manzil = { subdomain: 'kompaniya', baseDomain: 'amocrm.ru' as const };
  const h = await hisobniTekshir(manzil, YAXSHI);
  check('to\'g\'ri token → hisob', h.id === 32826222 && h.name === 'IT Live academy' && h.currency === 'UZS');

  const xatoTuri = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      return 'xato yo\'q';
    } catch (e) {
      return e instanceof AmoXato ? e.tur : 'boshqa xato';
    }
  };
  check('noto\'g\'ri token → token xatosi', (await xatoTuri(() => hisobniTekshir(manzil, 'yomon-token-1234567890'))) === 'token');
  check('boshqa hisob tokeni → rad', (await xatoTuri(() => hisobniTekshir(manzil, BEGONA))) === 'hisob');
  const limitNatija = await hisobniTekshir(manzil, 'limit').then((x) => x.name).catch(() => 'yiqildi');
  check('429 → bir marta qayta urinadi', limitNatija === 'Limit hisob' && limitUrinish === 2);

  // Yopiq port — tarmoq xatosi aniq turda
  const eski = process.env.AMOCRM_API_BASE;
  process.env.AMOCRM_API_BASE = 'http://127.0.0.1:1';
  check('ulanib bo\'lmasa → tarmoq xatosi', (await xatoTuri(() => hisobniTekshir(manzil, YAXSHI))) === 'tarmoq');
  process.env.AMOCRM_API_BASE = eski;

  console.log('\nD. Tuzilish: voronkalar va foydalanuvchilar');
  const t = await tuzilishniOl(manzil, YAXSHI);
  check('arxiv voronka yashirildi', t.pipelines.length === 1 && t.pipelines[0]!.name === 'Call-Center');
  check('asosiy voronka belgilandi', t.pipelines[0]!.isMain);
  check(
    'bosqichlar tartibda',
    t.pipelines[0]!.statuses.map((s) => s.id).join(',') === '11,12,142,143',
    t.pipelines[0]!.statuses.map((s) => s.id).join(','),
  );
  check(
    'tizim bosqichlari turi',
    t.pipelines[0]!.statuses.find((s) => s.id === 142)?.tur === 'muvaffaqiyat' &&
      t.pipelines[0]!.statuses.find((s) => s.id === 143)?.tur === 'yopilgan',
  );
  check('foydalanuvchilar', t.users.length === 3 && t.users.filter((u) => u.isAdmin).length === 1);
  check('nofaol foydalanuvchi belgilandi', t.users.find((u) => u.id === 3)?.isActive === false);
  check('204 (maydon yo\'q) → 0', t.leadFieldCount === 0);

  console.log("\nE. amoCRM ga hech narsa yozilmadi");
  check('faqat GET so\'rovlar', yozishUrinishi === 0);

  server.close();
  console.log(`\namoCRM: ${otdi} ta o'tdi, ${yiqildi} ta yiqildi.`);
  if (yiqildi > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
