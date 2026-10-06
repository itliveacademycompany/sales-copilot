import { createHmac } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { eq } from 'drizzle-orm';
import { cleanupTestData, TEST_EMAIL_DOMAIN } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { task } from '../db/schema/index.js';
import { buildApp } from '../http/app.js';
import { dispatchTaskExports, imzoSarlavhalari } from './crm-export.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM EKSPORTI — «Vazifalarni CRM'ga yuborish» HAQIQATAN ishlaydimi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eng muhim uch savol:
 *   1. Kalit o'chiq bo'lsa hech narsa yuborilmaydimi.
 *   2. Yoqilganda vazifa yetib boradimi va IMZO to'g'rimi.
 *   3. Qabul qiluvchi xato qaytarsa, yozuv navbatni tiqib qo'ymaydimi.
 *
 * Qabul qiluvchi — lokal soxta server. Haqiqiy CRM ga bog'lanish testni
 * tarmoqqa va begona hisobga bog'lab qo'yardi.
 */

const tag = `crm${Date.now().toString(36).slice(-6)}`;

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

interface Kelgan {
  tana: string;
  imzo: string | undefined;
  ts: string | undefined;
}
const kelgan: Kelgan[] = [];
/** Keyingi javob kodi — xato yo'lini sinash uchun. */
let javobKodi = 200;

function soxtaCrm(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let tana = '';
      req.on('data', (c) => (tana += c));
      req.on('end', () => {
        kelgan.push({
          tana,
          imzo: req.headers['x-sotuv-signature'] as string | undefined,
          ts: req.headers['x-sotuv-timestamp'] as string | undefined,
        });
        res.writeHead(javobKodi, { 'content-type': 'text/plain' });
        res.end(javobKodi === 200 ? 'ok' : 'xato');
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, port: (server.address() as { port: number }).port });
    });
  });
}

async function main(): Promise<void> {
  console.log('\nCRM eksporti (soxta qabul qiluvchi)\n');

  const { server, port } = await soxtaCrm();
  const url = `http://127.0.0.1:${port}/hook`;
  const SIR = 'juda-uzun-imzo-siri-2026';

  const app = await buildApp();

  try {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `${tag}${TEST_EMAIL_DOMAIN}`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Owner',
        businessName: 'CRM Test',
      },
    });
    const businessId = (reg.json() as { businesses: { businessId: string }[] })
      .businesses[0]!.businessId;
    const auth = { sid: reg.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    const base = `/api/v1/businesses/${businessId}`;

    /** Vazifa yaratadi va dispetcherni yurgizadi. */
    async function vazifa(nom: string): Promise<void> {
      await withoutTenantIsolation('test: vazifa yaratish', (tx) =>
        tx.insert(task).values({ businessId, title: nom, source: 'manual' }),
      );
      await dispatchTaskExports();
    }

    // ═══ A: SOZLASH DARVOZALARI ═══
    console.log('— A: sozlash —');

    const sirsiz = await app.inject({
      method: 'PUT',
      url: `${base}/integrations/crm`,
      cookies: auth,
      payload: { exportTasks: true, url, secret: null },
    });
    check(
      'imzo sirisiz yoqib bo\'lmaydi',
      sirsiz.statusCode === 400,
      `status ${sirsiz.statusCode}`,
    );

    const manzilsiz = await app.inject({
      method: 'PUT',
      url: `${base}/integrations/crm`,
      cookies: auth,
      payload: { exportTasks: true, url: null, secret: SIR },
    });
    check(
      'manzilsiz yoqib bo\'lmaydi',
      manzilsiz.statusCode === 400,
      `status ${manzilsiz.statusCode}`,
    );

    // ═══ B: O'CHIQ HOLAT ═══
    console.log('\n— B: eksport o\'chiq —');

    const ochiq = await app.inject({
      method: 'PUT',
      url: `${base}/integrations/crm`,
      cookies: auth,
      payload: { exportTasks: false, url, secret: SIR },
    });
    check('o\'chiq holatda saqlanadi', ochiq.statusCode === 200);

    kelgan.length = 0;
    await vazifa('ochiq-holat');
    check('eksport o\'chiq — so\'rov YUBORILMAYDI', kelgan.length === 0, `kelgan: ${kelgan.length}`);

    // ═══ C: YOQILGAN HOLAT ═══
    console.log('\n— C: eksport yoqilgan —');

    const yoq = await app.inject({
      method: 'PUT',
      url: `${base}/integrations/crm`,
      cookies: auth,
      payload: { exportTasks: true, url, secret: null },
    });
    check('yoqildi (eski sir saqlanib qoladi)', yoq.statusCode === 200, `status ${yoq.statusCode}`);

    kelgan.length = 0;
    javobKodi = 200;
    await vazifa('yuborilsin');
    check('vazifa YUBORILDI', kelgan.length === 1, `kelgan: ${kelgan.length}`);

    const k = kelgan[0];
    let tanaOk = false;
    try {
      const j = JSON.parse(k?.tana ?? '{}') as { event: string; task: { title: string } };
      tanaOk = j.event === 'task.created' && j.task.title === 'yuborilsin';
    } catch {
      tanaOk = false;
    }
    check('tana to\'g\'ri shaklda', tanaOk, (k?.tana ?? '').slice(0, 120));

    // Imzoni QABUL QILUVCHI kabi qayta hisoblaymiz.
    const kutilgan = `v1=${createHmac('sha256', SIR)
      .update(`${k?.ts}.${k?.tana}`)
      .digest('hex')}`;
    check('HMAC imzo to\'g\'ri', k?.imzo === kutilgan, `${k?.imzo} != ${kutilgan}`);

    check(
      'noto\'g\'ri sir bilan imzo MOS KELMAYDI',
      k?.imzo !==
        `v1=${createHmac('sha256', 'boshqa-sir').update(`${k?.ts}.${k?.tana}`).digest('hex')}`,
    );

    check(
      'yordamchi funksiya bir xil imzo beradi',
      imzoSarlavhalari(SIR, k?.tana ?? '', Number(k?.ts) * 1000)['x-sotuv-signature'] === kutilgan,
    );

    const c1 = await withoutTenantIsolation('test: eksport belgisi', (tx) =>
      tx
        .select({ exportedAt: task.exportedAt, exportError: task.exportError })
        .from(task)
        .where(eq(task.title, 'yuborilsin')),
    );
    check(
      'muvaffaqiyatli yuborish xatosiz belgilanadi',
      c1[0]?.exportedAt !== null && c1[0]?.exportError === null,
      JSON.stringify(c1),
    );

    // ═══ D: XATO YO'LI ═══
    console.log('\n— D: qabul qiluvchi xato qaytarsa —');

    kelgan.length = 0;
    javobKodi = 500;
    await vazifa('xatoli');
    check('urinish bo\'ldi', kelgan.length === 1);

    const d1 = await withoutTenantIsolation('test: xato yozuvi', (tx) =>
      tx
        .select({ exportedAt: task.exportedAt, exportError: task.exportError })
        .from(task)
        .where(eq(task.title, 'xatoli')),
    );
    check(
      'xato saqlanadi va navbat tiqilmaydi',
      d1[0]?.exportedAt !== null && (d1[0]?.exportError ?? '').includes('500'),
      JSON.stringify(d1),
    );

    kelgan.length = 0;
    await dispatchTaskExports();
    check('xatoli yozuv QAYTA urinilmaydi', kelgan.length === 0, `kelgan: ${kelgan.length}`);

    // ═══ E: QAYTA NAVBATGA QO'YISH ═══
    console.log('\n— E: qayta yuborish —');

    javobKodi = 200;
    const retry = await app.inject({
      method: 'POST',
      url: `${base}/integrations/crm/retry`,
      cookies: auth,
    });
    check(
      'xatolilar qayta navbatga qo\'yildi',
      retry.statusCode === 200 && (retry.json() as { requeued: number }).requeued === 1,
      retry.body,
    );

    kelgan.length = 0;
    await dispatchTaskExports();
    check('qayta yuborishda YETIB BORDI', kelgan.length === 1, `kelgan: ${kelgan.length}`);

    // ═══ F: SIR OSHKOR QILINMAYDI ═══
    console.log('\n— F: sir maxfiyligi —');

    const holat = await app.inject({
      method: 'GET',
      url: `${base}/integrations/crm`,
      cookies: auth,
    });
    const tana = holat.body;
    check('javobda sirning O\'ZI yo\'q', !tana.includes(SIR), tana.slice(0, 160));
    check(
      'faqat niqob qaytadi',
      (holat.json() as { config: { hasSecret: boolean } }).config.hasSecret === true,
    );
  } finally {
    await app.close();
    server.close();
    await cleanupTestData(tag + TEST_EMAIL_DOMAIN);
    await closeDb();
  }

  console.log(
    yiqildi === 0
      ? `\nCRM eksporti butun. ${otdi}/${otdi} tekshiruv o'tdi.`
      : `\n${yiqildi} ta tekshiruv yiqildi (${otdi} o'tdi).`,
  );
  process.exit(yiqildi > 0 ? 1 : 0);
}

void main();
