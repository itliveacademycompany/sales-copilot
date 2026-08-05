import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { integration } from '../db/schema/index.js';
import {
  buildDailyStats,
  formatDailyReport,
  localDate,
  localHour,
  runDailyReportTick,
  type DailyStats,
} from '../reports/daily.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KUNLIK HISOBOT TESTI — FR-134
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:reports
 *
 * Eng xavfli qism — jadval mantig'i: hisobot biznesning O'Z vaqt zonasida
 * belgilangan soatda ketishi va kuniga FAQAT BIR MARTA yuborilishi kerak.
 * Worker soatiga bir marta uriladi, ya'ni "ikki marta yubormaslik"
 * kafolati kod ichida bo'lishi shart.
 *
 * Haqiqiy Telegram chaqirilmaydi: chat id sozlanmagan holatda funksiya
 * yozuvni saqlab, yuborishdan oldin to'xtaydi.
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

async function main(): Promise<void> {
  const app: FastifyInstance = await buildApp();
  console.log('\nKunlik hisobot (FR-134)\n');

  try {
    // ═══ SOF FUNKSIYALAR ═══
    console.log('— vaqt zonasi —');
    const lahza = new Date('2026-08-03T20:30:00Z'); // Toshkentda 01:30 (4-avgust)
    check(
      'Toshkent soati UTC dan farq qiladi',
      localHour('Asia/Tashkent', lahza) === 1,
      `olindi: ${localHour('Asia/Tashkent', lahza)}`,
    );
    check(
      'Toshkent sanasi keyingi kunga o\'tdi',
      localDate('Asia/Tashkent', lahza) === '2026-08-04',
      localDate('Asia/Tashkent', lahza),
    );
    check('UTC sanasi hali oldingi kun', localDate('UTC', lahza) === '2026-08-03');
    check(
      'noto\'g\'ri zona nomi yiqilmaydi',
      typeof localHour('Yo\'q/Zona', lahza) === 'number',
    );

    console.log('\n— matn —');
    const stats: DailyStats = {
      conversations: 12,
      analyzed: 10,
      filtered: 2,
      avgScore: 64.5,
      flagged: 1,
      unanswered: 3,
      medianFirstResponseSeconds: 240,
      newAlerts: 2,
      overdueTasks: 4,
      bestSeat: { name: 'Malika', score: 88 },
      worstSeat: { name: 'Sardor', score: 41 },
      weakestCriterion: { code: 'C1', name: 'Keyingi qadam', avgScore: 1.4 },
    };
    const matn = formatDailyReport('IT Live Academy', '2026-08-03', stats);
    check('sarlavhada biznes nomi va sana', matn.includes('IT Live Academy') && matn.includes('2026-08-03'));
    check('suhbat soni bor', matn.includes('12 ta'));
    check('javob kutayotganlar ko\'rsatilgan', matn.includes('3 ta mijoz javob kutmoqda'));
    check('kechikkan vazifalar ko\'rsatilgan', matn.includes('4 ta vazifa'));
    check('eng yaxshi va eng zaif sotuvchi bor', matn.includes('Malika') && matn.includes('Sardor'));
    check('zaif mezon bor', matn.includes('Keyingi qadam') && matn.includes('C1'));
    check('Markdown belgilaridan xoli', !matn.includes('**') && !matn.includes('__'));

    const bosh = formatDailyReport('X', '2026-08-03', {
      ...stats,
      conversations: 0,
      analyzed: 0,
      unanswered: 0,
      overdueTasks: 0,
      flagged: 0,
      newAlerts: 0,
      bestSeat: null,
      worstSeat: null,
      weakestCriterion: null,
    });
    check('suhbatsiz kun uchun aniq matn', bosh.includes('yangi suhbat bo\'lmadi'));

    const bitta = formatDailyReport('X', '2026-08-03', {
      ...stats,
      bestSeat: { name: 'Yagona', score: 70 },
      worstSeat: { name: 'Yagona', score: 70 },
    });
    check(
      'bitta sotuvchi ham eng yaxshi, ham eng yomon deb ko\'rsatilmaydi',
      (bitta.match(/Yagona/g) ?? []).length === 1,
    );

    // ═══ JADVAL MANTIG'I ═══
    console.log('\n— jadval —');
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `rep-${tag}@test.local`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Owner',
        businessName: 'Hisobot Testi',
      },
    });
    const businessId = (reg.json() as { businesses: { businessId: string }[] }).businesses[0]!
      .businessId;

    const now = new Date();
    const joriySoat = localHour('Asia/Tashkent', now);
    const boshqaSoat = (joriySoat + 5) % 24;

    // Telegram integratsiyasi — hisobot faqat ulangan biznesga ketadi.
    await withoutTenantIsolation('test: hisobot uchun integratsiya', (tx) =>
      tx.insert(integration).values({
        businessId,
        kind: 'telegram_bot',
        status: 'connected',
        config: { reportHour: boshqaSoat, reportChatId: null },
        syncEnabled: true,
      }),
    );

    const qatorlar = async (): Promise<number> => {
      const r = await withoutTenantIsolation('test: hisobot qatorlarini sanash', (tx) =>
        tx.execute(sql`select count(*)::int as n from daily_summary where business_id = ${businessId}`),
      );
      return Number((r as Record<string, unknown>[])[0]?.n ?? 0);
    };

    const t1 = await runDailyReportTick(now);
    const meniki1 = t1.find((r) => r.businessId === businessId);
    check(
      'soati kelmagan biznes o\'tkazib yuboriladi',
      meniki1?.skipped === 'soati emas',
      JSON.stringify(meniki1),
    );
    check('hech qanday hisobot yozilmadi', (await qatorlar()) === 0);

    // Soatni joriy soatga o'tkazamiz — endi yuborilishi kerak.
    await withoutTenantIsolation('test: hisobot soatini o\'zgartirish', (tx) =>
      tx
        .update(integration)
        .set({ config: { reportHour: joriySoat, reportChatId: null } })
        .where(eq(integration.businessId, businessId)),
    );

    const t2 = await runDailyReportTick(now);
    const meniki2 = t2.find((r) => r.businessId === businessId);
    check(
      'soati kelganda hisobot tayyorlanadi',
      meniki2?.skipped === 'chat id sozlanmagan',
      JSON.stringify(meniki2),
    );
    check('hisobot bazaga yozildi', (await qatorlar()) === 1);

    // Eng muhimi: ikkinchi urinish TAKROR yubormaydi.
    const t3 = await runDailyReportTick(now);
    const meniki3 = t3.find((r) => r.businessId === businessId);
    check(
      'ikkinchi urinish takrorlamaydi (idempotent)',
      meniki3?.skipped === 'allaqachon yuborilgan',
      JSON.stringify(meniki3),
    );
    check('baza hali ham bitta qator', (await qatorlar()) === 1);

    // ═══ STATISTIKA ═══
    console.log('\n— statistika —');
    const s = await buildDailyStats(businessId, now);
    check('yangi biznesda suhbat yo\'q', s.conversations === 0 && s.analyzed === 0);
    check('bo\'sh davrda o\'rtacha ball null', s.avgScore === null);

    // ═══ API ═══
    console.log('\n— API —');
    const cookie = reg.cookies.find((c) => c.name === 'sid')?.value ?? '';
    const auth = { sid: cookie };
    const base = `/api/v1/businesses/${businessId}`;

    const ruxsatsiz = await app.inject({ method: 'GET', url: `${base}/reports/daily` });
    check('autentifikatsiyasiz 401', ruxsatsiz.statusCode === 401);

    const royxat = await app.inject({
      method: 'GET',
      url: `${base}/reports/daily`,
      cookies: auth,
    });
    check('hisobotlar ro\'yxati ochiladi', royxat.statusCode === 200);
    check(
      'ro\'yxatda bitta hisobot bor',
      (royxat.json() as { reports: unknown[] }).reports.length === 1,
    );

    const yomonChat = await app.inject({
      method: 'PUT',
      url: `${base}/reports/daily/settings`,
      cookies: auth,
      payload: { reportChatId: 'guruh-nomi' },
    });
    // 422 — loyihaning validatsiya xatosi kodi (RFC 7807, errors.ts).
    check('raqamsiz chat id rad etiladi', yomonChat.statusCode === 422, `kod: ${yomonChat.statusCode}`);

    const sozlash = await app.inject({
      method: 'PUT',
      url: `${base}/reports/daily/settings`,
      cookies: auth,
      payload: { reportChatId: '-1001234567890', reportHour: 8 },
    });
    check('sozlama saqlandi', sozlash.statusCode === 200, `kod: ${sozlash.statusCode}`);
    check(
      'javobda saqlangan qiymatlar',
      (sozlash.json() as { reportChatId: string; reportHour: number }).reportHour === 8,
    );

    const yomonSoat = await app.inject({
      method: 'PUT',
      url: `${base}/reports/daily/settings`,
      cookies: auth,
      payload: { reportChatId: '-100123', reportHour: 25 },
    });
    check('24 dan katta soat rad etiladi', yomonSoat.statusCode === 422, `kod: ${yomonSoat.statusCode}`);
  } finally {
    await app.close();
    await cleanupTestDataQuietly(`%${tag}@test.local`);
    await closeDb();
  }

  console.log(
    `\n${fail === 0 ? 'Kunlik hisobot butun.' : 'XATOLAR BOR.'} ${pass}/${pass + fail} tekshiruv o'tdi.`,
  );
  if (fail > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
