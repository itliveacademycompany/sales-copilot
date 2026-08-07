import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { conversation, seat, transcriptSegment } from '../db/schema/index.js';
import { assignOffsets, parseTranscript } from '../import/transcript-parser.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QO'LDA YUKLASH TESTI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:import
 *
 * Parser odam qo'lda joylashtirgan matn bilan ishlaydi — ya'ni kirish
 * har doim chalkash bo'ladi. Shuning uchun testlar "toza matn ishlaydimi"
 * emas, "IFLOS matn bilan nima bo'ladi" degan savolga javob beradi.
 *
 * Eng xavfli holat — **rollarning almashib ketishi** (FR-84): menejer
 * `client` deb belgilansa, kouching mutlaqo teskari xulosa chiqaradi va
 * buni hech kim sezmaydi.
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
  console.log('\nQo\'lda suhbat yuklash\n');

  try {
    // ═══ PARSER ═══
    console.log('— parser —');

    const oddiy = parseTranscript(
      ['Mijoz: Salom, narxi qancha?', 'Menejer: Assalomu alaykum! Qaysi yo\'nalish?'].join('\n'),
    );
    check('oddiy shakl', oddiy.segments.length === 2);
    check('rollar to\'g\'ri', oddiy.segments[0]?.speaker === 'client' && oddiy.segments[1]?.speaker === 'manager');
    check('yorliq matnga tushmaydi', oddiy.segments[0]?.text === 'Salom, narxi qancha?');

    const rus = parseTranscript('Клиент: сколько стоит?\nМенеджер: 900 тысяч');
    check('ruscha yorliqlar', rus.segments.length === 2 && rus.segments[0]?.speaker === 'client');

    const ingliz = parseTranscript('- Client: how much?\n- Manager: 900k');
    check('inglizcha + ro\'yxat belgisi', ingliz.segments.length === 2);

    const vaqtli = parseTranscript('[10:05] Mijoz: Salom\n[10:07] Menejer: Assalomu alaykum');
    check('vaqt belgisi ajratiladi', vaqtli.segments[0]?.clockSeconds === 10 * 3600 + 5 * 60);
    check('vaqt matnga tushmaydi', vaqtli.segments[0]?.text === 'Salom');

    const vaqtKeyin = parseTranscript('Mijoz: 14:32 Salom');
    check(
      'speaker\'dan keyingi vaqt ham ajratiladi',
      vaqtKeyin.segments[0]?.clockSeconds === 14 * 3600 + 32 * 60 &&
        vaqtKeyin.segments[0]?.text === 'Salom',
    );

    // Uzun gap ikki qatorga bo'linib ketgan.
    const davomi = parseTranscript(
      ['Menejer: Kurs 6 oylik,', 'ichida 3 ta loyiha bor', 'Mijoz: Yaxshi'].join('\n'),
    );
    check(
      'prefiksiz qator oldingisiga qo\'shiladi',
      davomi.segments.length === 2 &&
        davomi.segments[0]?.text === 'Kurs 6 oylik, ichida 3 ta loyiha bor',
      JSON.stringify(davomi.segments),
    );

    // Ism bilan yozilgan yorliq — taxmin qilmaymiz.
    const ism = parseTranscript('Malika: Salom\nMijoz: Salom');
    check(
      'tanimagan yorliq rolga aylantirilmaydi',
      ism.segments.length === 1 && ism.segments[0]?.speaker === 'client',
      JSON.stringify(ism.segments),
    );
    check('bu haqda ogohlantirish beriladi', ism.warnings.length > 0);

    const faqatMijoz = parseTranscript('Mijoz: Salom\nMijoz: Javob bering');
    check(
      'menejer yo\'qligi haqida ogohlantiriladi',
      faqatMijoz.warnings.some((w) => w.includes('Menejer')),
    );

    check('bo\'sh matn — segment yo\'q', parseTranscript('   \n  \n').segments.length === 0);
    check(
      'bo\'sh yorliq tashlab ketiladi',
      parseTranscript('Mijoz:\nMenejer: Salom').segments.length === 1,
    );

    // 25:70 — vaqt emas.
    const soxtaVaqt = parseTranscript('Mijoz: 99:99 bu vaqt emas');
    check(
      'noto\'g\'ri vaqt qiymati vaqt deb olinmaydi',
      soxtaVaqt.segments[0]?.clockSeconds === null &&
        soxtaVaqt.segments[0]?.text.startsWith('99:99'),
    );

    // ═══ VAQT HISOBI ═══
    console.log('\n— vaqt hisobi —');
    const vaqtsiz = parseTranscript('Mijoz: a\nMenejer: b\nMijoz: c');
    check(
      'vaqtsiz suhbatda shartli 30 soniya',
      JSON.stringify(assignOffsets(vaqtsiz.segments)) === JSON.stringify([0, 30, 60]),
    );

    const oynali = parseTranscript('[10:00] Mijoz: a\n[10:05] Menejer: b');
    check(
      'vaqtli suhbatda haqiqiy farq',
      JSON.stringify(assignOffsets(oynali.segments)) === JSON.stringify([0, 300]),
    );

    const yarimTun = parseTranscript('[23:58] Mijoz: a\n[00:03] Menejer: b');
    check(
      'yarim tundan o\'tish to\'g\'ri hisoblanadi',
      JSON.stringify(assignOffsets(yarimTun.segments)) === JSON.stringify([0, 300]),
      JSON.stringify(assignOffsets(yarimTun.segments)),
    );

    // ═══ API ═══
    console.log('\n— API —');
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `import-${tag}@test.local`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Egasi',
        businessName: 'Import Testi',
      },
    });
    const businessId = (reg.json() as { businesses: { businessId: string }[] }).businesses[0]!
      .businessId;
    const auth = { sid: reg.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    const base = `/api/v1/businesses/${businessId}`;

    const [s] = await withoutTenantIsolation('test: sotuvchi yaratish', (tx) =>
      tx.insert(seat).values({ businessId, displayName: 'Sinov sotuvchi' }).returning({ id: seat.id }),
    );
    const seatId = s!.id;

    const MATN = [
      '[09:00] Mijoz: Assalomu alaykum, frontend kursi haqida bilsam',
      '[09:02] Menejer: Assalomu alaykum! Avval bilsam — tajribangiz bormi?',
      '[09:05] Mijoz: Yo\'q, noldan boshlamoqchiman',
      '[09:07] Menejer: Unda 6 oylik dastur mos keladi, narxi oyiga 1.2 mln so\'m',
      '[09:12] Mijoz: O\'ylab ko\'raman',
      '[09:14] Menejer: Albatta! Ertaga bepul sinov darsiga yozib qo\'yaymi?',
    ].join('\n');

    const ruxsatsiz = await app.inject({
      method: 'POST',
      url: `${base}/conversations/import`,
      payload: { seatId, text: MATN },
    });
    check('autentifikatsiyasiz 401', ruxsatsiz.statusCode === 401);

    const qisqa = await app.inject({
      method: 'POST',
      url: `${base}/conversations/import`,
      cookies: auth,
      payload: { seatId, text: 'juda qisqa' },
    });
    check('juda qisqa matn rad etiladi', qisqa.statusCode === 422, `kod: ${qisqa.statusCode}`);

    const tanimagan = await app.inject({
      method: 'POST',
      url: `${base}/conversations/import`,
      cookies: auth,
      payload: { seatId, text: 'Bu shunchaki matn, hech qanday yorliqsiz va uzun yozilgan gap.' },
    });
    check(
      'yorliqsiz matn aniq xato beradi',
      tanimagan.statusCode === 400,
      `kod: ${tanimagan.statusCode}`,
    );

    const korish = await app.inject({
      method: 'POST',
      url: `${base}/conversations/import`,
      cookies: auth,
      payload: { seatId, text: MATN, dryRun: true },
    });
    const korishBody = korish.json() as {
      dryRun: boolean;
      segments: { speaker: string; text: string }[];
    };
    check('dryRun natija qaytaradi', korish.statusCode === 200 && korishBody.dryRun);
    check('dryRun 6 ta segment ko\'rsatadi', korishBody.segments.length === 6);
    check(
      'dryRun rollarni ko\'rsatadi',
      korishBody.segments[0]?.speaker === 'client' && korishBody.segments[1]?.speaker === 'manager',
    );

    const oldingiSoni = await withoutTenantIsolation('test: dryRun saqlamaganini tekshirish', (tx) =>
      tx.select({ id: conversation.id }).from(conversation).where(eq(conversation.businessId, businessId)),
    );
    check('dryRun HECH NARSA saqlamaydi', oldingiSoni.length === 0, `${oldingiSoni.length} ta`);

    const yuklandi = await app.inject({
      method: 'POST',
      url: `${base}/conversations/import`,
      cookies: auth,
      payload: { seatId, text: MATN },
    });
    check('suhbat yuklandi', yuklandi.statusCode === 201, `kod: ${yuklandi.statusCode}`);
    const yuklanganBody = yuklandi.json() as {
      conversationId: string;
      segmentCount: number;
      queued: boolean;
    };
    check('6 ta segment saqlandi', yuklanganBody.segmentCount === 6);
    check('navbatga qo\'yildi', yuklanganBody.queued);

    const saqlangan = await withoutTenantIsolation('test: segmentlarni tekshirish', (tx) =>
      tx
        .select({
          seq: transcriptSegment.seq,
          speaker: transcriptSegment.speaker,
          startSeconds: transcriptSegment.startSeconds,
        })
        .from(transcriptSegment)
        .where(eq(transcriptSegment.conversationId, yuklanganBody.conversationId))
        .orderBy(transcriptSegment.seq),
    );
    check('bazada 6 ta segment', saqlangan.length === 6);
    check(
      'birinchi segment 0 soniyada',
      Number(saqlangan[0]?.startSeconds) === 0,
      String(saqlangan[0]?.startSeconds),
    );
    check(
      'oxirgi segment 14 daqiqada (09:00 → 09:14)',
      Number(saqlangan[5]?.startSeconds) === 840,
      String(saqlangan[5]?.startSeconds),
    );
    check(
      'rollar navbatma-navbat',
      saqlangan.map((x) => x.speaker).join(',') === 'client,manager,client,manager,client,manager',
      saqlangan.map((x) => x.speaker).join(','),
    );

    const [conv] = await withoutTenantIsolation('test: suhbat manbasini tekshirish', (tx) =>
      tx
        .select({ source: conversation.externalSource, status: conversation.status, seatId: conversation.seatId })
        .from(conversation)
        .where(eq(conversation.id, yuklanganBody.conversationId)),
    );
    check('manba "manual" deb belgilangan', conv?.source === 'manual', String(conv?.source));
    check('sotuvchiga bog\'landi', conv?.seatId === seatId);

    const yoqSeat = await app.inject({
      method: 'POST',
      url: `${base}/conversations/import`,
      cookies: auth,
      payload: { seatId: '00000000-0000-0000-0000-000000000000', text: MATN },
    });
    check('mavjud bo\'lmagan sotuvchi rad etiladi', yoqSeat.statusCode === 400);
  } finally {
    await app.close();
    await cleanupTestDataQuietly(`%${tag}@test.local`);
    await closeDb();
  }

  console.log(
    `\n${fail === 0 ? 'Qo\'lda yuklash butun.' : 'XATOLAR BOR.'} ${pass}/${pass + fail} tekshiruv o'tdi.`,
  );
  if (fail > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
