import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { eq } from 'drizzle-orm';
import { cleanupTestData, TEST_EMAIL_DOMAIN } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { businessMember } from '../db/schema/index.js';
import { buildApp } from '../http/app.js';
import { keshHolati, keshniTozala } from './context-cache.js';
import { loadAuthContext } from './context.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTH KESHI — tez, LEKIN xavfsizmi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kesh tezlik uchun qo'shildi, lekin u eskirgan HUQUQNI ushlab qolsa —
 * xavfsizlik nuqsoni. Shuning uchun tezlikdan ko'ra ko'proq bekor
 * qilishni tekshiramiz:
 *
 *   • rol o'zgarganda eski huquq QOLMAYDIMI;
 *   • a'zolik o'chirilganda kirish YOPILADIMI;
 *   • webhook kabi tez-tez keladigan so'rov keshni behuda tozalamaydimi.
 */

const tag = `kesh${Date.now().toString(36).slice(-6)}`;

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

async function main(): Promise<void> {
  console.log('\nAuth konteksti keshi\n');
  const app = await buildApp();

  try {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `${tag}${TEST_EMAIL_DOMAIN}`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Ega',
        businessName: 'Kesh Test',
      },
    });
    const regBody = reg.json() as {
      user: { id: string };
      businesses: { businessId: string }[];
    };
    const userId = regBody.user.id;
    const businessId = regBody.businesses[0]!.businessId;
    const auth = { sid: reg.cookies.find((c) => c.name === 'sid')?.value ?? '' };

    // ═══ A: KESH ISHLAYAPTIMI ═══
    console.log('— A: tezlik —');

    keshniTozala();
    const t0 = performance.now();
    await loadAuthContext(userId);
    const sovuq = performance.now() - t0;

    const t1 = performance.now();
    await loadAuthContext(userId);
    const issiq = performance.now() - t1;

    check(
      'ikkinchi chaqiruv sezilarli tez',
      issiq < sovuq / 2,
      `sovuq ${sovuq.toFixed(2)}ms, issiq ${issiq.toFixed(2)}ms`,
    );
    check('kesh to\'ldi', keshHolati().hajm > 0);

    // ═══ B: ROL O'ZGARSA — ESKI HUQUQ QOLMAYDI ═══
    console.log('\n— B: bekor qilish —');

    // Ikkinchi odam: auditor (analitika o'qiy oladi, jamoa boshqara olmaydi).
    const ikkinchi = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `${tag}b${TEST_EMAIL_DOMAIN}`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Ikkinchi',
        businessName: 'Kesh Test B',
      },
    });
    const ikkinchiId = (ikkinchi.json() as { user: { id: string } }).user.id;

    const qoshish = await app.inject({
      method: 'POST',
      url: `/api/v1/businesses/${businessId}/members/invite`,
      cookies: auth,
      payload: { email: `${tag}b${TEST_EMAIL_DOMAIN}`, displayName: 'Ikkinchi', role: 'supervisor' },
    });
    check('a\'zo qo\'shildi', qoshish.statusCode < 400, `status ${qoshish.statusCode}`);

    // Keshni to'ldiramiz.
    const oldin = await loadAuthContext(ikkinchiId);
    const oldinRol = oldin?.businesses.find((b) => b.businessId === businessId)?.role;
    check('yangi a\'zo supervisor', oldinRol === 'supervisor', String(oldinRol));

    // Endi rolni to'g'ridan-to'g'ri bazada o'zgartiramiz — ya'ni kesh
    // BEKOR QILINMAGAN holat. Bu TTL ning ishlashini emas, hookning
    // ishlashini tekshirish uchun: hook HTTP so'rovga bog'langan.
    await withoutTenantIsolation('test: rolni bazada o\'zgartirish', (tx) =>
      tx
        .update(businessMember)
        .set({ role: 'auditor' })
        .where(eq(businessMember.userId, ikkinchiId)),
    );

    const keshdan = await loadAuthContext(ikkinchiId);
    check(
      'kesh eski rolni ushlab turadi (kutilgan holat)',
      keshdan?.businesses.find((b) => b.businessId === businessId)?.role === 'supervisor',
    );

    // HTTP orqali o'zgartirish — hook keshni tozalashi kerak.
    await app.inject({
      method: 'PATCH',
      url: `/api/v1/businesses/${businessId}`,
      cookies: auth,
      payload: { name: 'Kesh Test 2' },
    });
    check('o\'zgartirishdan keyin kesh bo\'sh', keshHolati().hajm === 0, `hajm ${keshHolati().hajm}`);

    const keyin = await loadAuthContext(ikkinchiId);
    check(
      'yangi rol ko\'rinadi',
      keyin?.businesses.find((b) => b.businessId === businessId)?.role === 'auditor',
      String(keyin?.businesses.find((b) => b.businessId === businessId)?.role),
    );

    // ═══ C: HAQIQIY OQIM — a'zolikni o'chirish ═══
    console.log('\n— C: a\'zolikni o\'chirish —');

    const azolar = await app.inject({
      method: 'GET',
      url: `/api/v1/businesses/${businessId}/members`,
      cookies: auth,
    });
    const azo = (azolar.json() as { id: string; userId: string }[]).find(
      (m) => m.userId === ikkinchiId,
    );

    await loadAuthContext(ikkinchiId); // keshni to'ldiramiz
    const ochir = await app.inject({
      method: 'DELETE',
      url: `/api/v1/businesses/${businessId}/members/${azo!.id}`,
      cookies: auth,
    });
    check('a\'zolik o\'chirildi', ochir.statusCode < 400, `status ${ochir.statusCode}`);

    const oxirgi = await loadAuthContext(ikkinchiId);
    const hali = oxirgi?.businesses.some((b) => b.businessId === businessId) ?? false;
    check('o\'chirilgan a\'zo endi kira olmaydi', !hali);

    // ═══ D: WEBHOOK KESHNI TOZALAMAYDI ═══
    console.log('\n— D: webhook keshni tozalamaydi —');

    await loadAuthContext(userId);
    const hajmOldin = keshHolati().hajm;
    await app.inject({
      method: 'POST',
      url: '/api/v1/webhooks/telegram/00000000-0000-0000-0000-000000000000',
      payload: { update_id: 1 },
    });
    check(
      'webhook so\'rovi keshga tegmaydi',
      keshHolati().hajm === hajmOldin && hajmOldin > 0,
      `oldin ${hajmOldin}, keyin ${keshHolati().hajm}`,
    );

    // ═══ E: O'QISH SO'ROVI KESHNI TOZALAMAYDI ═══
    await loadAuthContext(userId);
    const hajmOldin2 = keshHolati().hajm;
    await app.inject({
      method: 'GET',
      url: `/api/v1/businesses/${businessId}/members`,
      cookies: auth,
    });
    check(
      'GET so\'rovi keshga tegmaydi',
      keshHolati().hajm === hajmOldin2 && hajmOldin2 > 0,
      `oldin ${hajmOldin2}, keyin ${keshHolati().hajm}`,
    );

    assert.ok(true);
  } finally {
    await app.close();
    await cleanupTestData(tag + TEST_EMAIL_DOMAIN);
    await cleanupTestData(tag + 'b' + TEST_EMAIL_DOMAIN);
    await closeDb();
  }

  console.log(
    yiqildi === 0
      ? `\nAuth keshi butun. ${otdi}/${otdi} tekshiruv o'tdi.`
      : `\n${yiqildi} ta tekshiruv yiqildi (${otdi} o'tdi).`,
  );
  process.exit(yiqildi > 0 ? 1 : 0);
}

void main();
