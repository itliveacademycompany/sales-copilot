import { createServer, type Server } from 'node:http';
import { eq } from 'drizzle-orm';
import { channelMatrixSchema, manzillarniTop, telegramTargetsSchema } from '../business/channels.js';
import { alertPrefsSchema } from '../business/settings.js';
import { encryptSecret } from '../crypto/secrets.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { alert, business, integration } from '../db/schema/index.js';
import { cleanupTestData, TEST_EMAIL_DOMAIN } from '../db/clean-test-data.js';
import { buildApp } from '../http/app.js';
import { dispatchAlertNotifications } from './notify.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILDIRISHNOMA KANALLARI — matritsa HAQIQATAN ishlaydimi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Eng muhim savol: matritsadagi kalit xatti-harakatni O'ZGARTIRADIMI.
 * Shuning uchun bir xil ogohlantirish ikki marta yaratiladi — farq faqat
 * sozlamada. Agar birinchisida xabar ketib, ikkinchisida ketmasa, uni
 * to'sgan narsa aynan sozlama.
 *
 * Telegram o'rniga LOKAL soxta server: haqiqiy Telegram'ga bog'lanish
 * testni tarmoqqa bog'lab qo'yardi va CI da beqaror bo'lardi.
 */

const tag = `notify${Date.now().toString(36).slice(-6)}`;

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

/** Qabul qilingan xabarlar — test shu ro'yxatga qaraydi. */
const kelgan: { chatId: string; text: string }[] = [];

function soxtaTelegram(): Promise<{ server: Server; port: number }> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      let tana = '';
      req.on('data', (c) => (tana += c));
      req.on('end', () => {
        try {
          const j = JSON.parse(tana) as { chat_id: string; text: string };
          kelgan.push({ chatId: String(j.chat_id), text: j.text });
        } catch {
          /* format muhim emas — faqat chaqirilgani muhim */
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      resolve({ server, port });
    });
  });
}

async function main(): Promise<void> {
  console.log('\nBildirishnoma kanallari (soxta Telegram)\n');

  const { server, port } = await soxtaTelegram();
  // `send.ts` API manzilini o'zgaruvchidan oladi — testda lokalga yo'naltiramiz.
  process.env.TELEGRAM_API_BASE = `http://127.0.0.1:${port}`;

  const app = await buildApp();

  try {
    // ═══ TAYYORGARLIK ═══
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `${tag}${TEST_EMAIL_DOMAIN}`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Owner',
        businessName: 'Notify Test',
      },
    });
    const businessId = (reg.json() as { businesses: { businessId: string }[] })
      .businesses[0]!.businessId;
    const cookie = reg.cookies.find((c) => c.name === 'sid')?.value ?? '';
    const auth = { sid: cookie };
    const base = `/api/v1/businesses/${businessId}`;

    // Telegram botni "ulangan" holatga keltiramiz (haqiqiy token kerak emas —
    // so'rov lokal soxta serverga ketadi).
    await withoutTenantIsolation('test: telegram integratsiyasini tayyorlash', (tx) =>
      tx.insert(integration).values({
        businessId,
        kind: 'telegram_bot',
        status: 'connected',
        credentialsEncrypted: encryptSecret('123456:SOXTA-TOKEN'),
        config: {
          telegramTargets: {
            group: { chatId: '-100999', title: 'Jamoa guruhi' },
            channel: { chatId: '-100777', title: 'E\'lonlar kanali' },
            dm: null,
            discovered: [],
          },
        },
      }),
    );

    // ═══ A: MATRITSA MANTIQI ═══
    console.log('— A: manzil tanlash —');

    const targets = telegramTargetsSchema.parse({
      group: { chatId: '-100999', title: 'G' },
      channel: { chatId: '-100777', title: 'K' },
    });

    check(
      'hech qaysi kanal tanlanmagan — manzil yo\'q',
      manzillarniTop(channelMatrixSchema.parse({}), targets, 'red_flag').length === 0,
    );

    const faqatGuruh = channelMatrixSchema.parse({ red_flag: { group: true } });
    check(
      'faqat guruh tanlangan — bitta manzil',
      JSON.stringify(manzillarniTop(faqatGuruh, targets, 'red_flag')) === '["-100999"]',
    );

    const ikkalasi = channelMatrixSchema.parse({ red_flag: { group: true, channel: true } });
    check(
      'guruh + kanal — ikkita manzil',
      manzillarniTop(ikkalasi, targets, 'red_flag').length === 2,
    );

    check(
      'tanlangan kanalning manzili yo\'q — o\'tkazib yuboriladi',
      manzillarniTop(
        channelMatrixSchema.parse({ red_flag: { dm: true } }),
        targets,
        'red_flag',
      ).length === 0,
    );

    const birXil = telegramTargetsSchema.parse({
      group: { chatId: '-100999', title: 'G' },
      channel: { chatId: '-100999', title: 'shu ham' },
    });
    check(
      'bir chat ikki rolda — xabar IKKI MARTA ketmaydi',
      manzillarniTop(ikkalasi, birXil, 'red_flag').length === 1,
    );

    // ═══ B: HAQIQIY YUBORISH ═══
    console.log('\n— B: dispetcher —');

    /** Ogohlantirish yaratadi va dispetcherni yurgizadi. */
    async function sinovOgohlantirish(nom: string): Promise<void> {
      await withoutTenantIsolation('test: ogohlantirish yaratish', (tx) =>
        tx.insert(alert).values({
          businessId,
          kind: 'red_flag',
          severity: 'critical',
          title: nom,
          dedupeKey: `test:${nom}`,
        }),
      );
      await dispatchAlertNotifications();
    }

    // B1: kanal tanlanmagan → xabar KETMAYDI.
    kelgan.length = 0;
    await sinovOgohlantirish('kanalsiz');
    check('kanal tanlanmagan — Telegram xabari YO\'Q', kelgan.length === 0, `kelgan: ${kelgan.length}`);

    const b1 = await withoutTenantIsolation('test: notified_at tekshirish', (tx) =>
      tx.select({ notifiedAt: alert.notifiedAt }).from(alert).where(eq(alert.title, 'kanalsiz')),
    );
    check(
      'yuborilmasa ham belgilanadi — qayta ko\'rilmasin',
      b1[0]?.notifiedAt !== null,
    );

    // B2: guruh yoqiladi → xabar KETADI.
    const yoq = await app.inject({
      method: 'PUT',
      url: `${base}/alert-prefs`,
      cookies: auth,
      payload: alertPrefsSchema.parse({ channels: { red_flag: { group: true } } }),
    });
    check('matritsa saqlandi', yoq.statusCode === 200, `status ${yoq.statusCode}`);

    kelgan.length = 0;
    await sinovOgohlantirish('guruhga');
    check(
      'guruh yoqilgan — Telegram xabari KETDI',
      kelgan.length === 1 && kelgan[0]!.chatId === '-100999',
      JSON.stringify(kelgan),
    );
    check(
      'xabarda ogohlantirish sarlavhasi bor',
      (kelgan[0]?.text ?? '').includes('guruhga'),
    );

    // B3: turning O'ZI o'chirilgan → ogohlantirish umuman yaratilmaydi
    //     (buni `verify-pipeline` tekshiradi), lekin kanal o'chsa —
    //     ogohlantirish bor, xabar yo'q. Ikkalasi boshqa-boshqa.
    await app.inject({
      method: 'PUT',
      url: `${base}/alert-prefs`,
      cookies: auth,
      payload: alertPrefsSchema.parse({ channels: { red_flag: { group: false } } }),
    });
    kelgan.length = 0;
    await sinovOgohlantirish('yana-kanalsiz');
    check('kanal o\'chirildi — xabar yana YO\'Q', kelgan.length === 0, `kelgan: ${kelgan.length}`);

    const b3 = await withoutTenantIsolation('test: ogohlantirish bazada bormi', (tx) =>
      tx.select({ id: alert.id }).from(alert).where(eq(alert.title, 'yana-kanalsiz')),
    );
    check('lekin ogohlantirishning O\'ZI bazada bor', b3.length === 1);

    // B4: o'chirilgan biznesga yuborilmaydi.
    await withoutTenantIsolation('test: biznesni yumshoq o\'chirish', (tx) =>
      tx.update(business).set({ deletedAt: new Date() }).where(eq(business.id, businessId)),
    );
    await withoutTenantIsolation('test: ogohlantirish yaratish', (tx) =>
      tx.insert(alert).values({
        businessId,
        kind: 'red_flag',
        severity: 'critical',
        title: 'ochirilgan-biznes',
        dedupeKey: 'test:ochirilgan',
      }),
    );
    kelgan.length = 0;
    await dispatchAlertNotifications();
    /**
     * Global hisoblagichga QARAMAYMIZ: bazada boshqa test
     * to'plamlaridan qolgan ogohlantirishlar bo'lishi mumkin va ular
     * ham shu tikda ko'riladi. Savol aniq: SHU yozuvga tegildimi.
     */
    const b4 = await withoutTenantIsolation('test: ochirilgan biznes yozuvi', (tx) =>
      tx
        .select({ notifiedAt: alert.notifiedAt })
        .from(alert)
        .where(eq(alert.title, 'ochirilgan-biznes')),
    );
    check(
      'ochirilgan biznes — dispetcher tegmaydi',
      kelgan.length === 0 && b4[0]?.notifiedAt === null,
      JSON.stringify(b4),
    );
  } finally {
    await app.close();
    server.close();
    await cleanupTestData(tag + TEST_EMAIL_DOMAIN);
    await closeDb();
  }

  console.log(
    yiqildi === 0
      ? `\nBildirishnoma kanallari butun. ${otdi}/${otdi} tekshiruv o'tdi.`
      : `\n${yiqildi} ta tekshiruv yiqildi (${otdi} o'tdi).`,
  );
  process.exit(yiqildi > 0 ? 1 : 0);
}

void main();
