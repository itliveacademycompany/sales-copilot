import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createSession } from '../auth/session.js';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import {
  analysis,
  appUser,
  conversation,
  criterionScore,
  seat,
  transcriptSegment,
} from '../db/schema/index.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KOUCHING: E'TIROZ (FR-124) va RAHBAR IZOHI (FR-123)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:coaching
 *
 * Markaziy da'vo: **isbot talabi ballga tegishli, uni kim qo'ygani
 * ahamiyatsiz.** Rahbar e'tirozni qabul qilib ball ko'targanda ham
 * iqtibos transkriptda tekshiriladi — xuddi AI kabi. Aks holda
 * "AI ga ishonmaymiz, odamga ishonamiz" degan teshik ochilardi va
 * FR-80 kafolati faqat modelga qarshi ishlagan bo'lardi.
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

/** Transkriptdagi haqiqiy gap — isbot testlari shunga tayanadi. */
const HAQIQIY_GAP = 'Narxi oyiga bir million ikki yuz ming so\'m, ichida portfolio loyihalar bor';

async function main(): Promise<void> {
  const app: FastifyInstance = await buildApp();
  console.log('\nKouching: e\'tiroz va rahbar izohi\n');

  try {
    // ═══ TAYYORGARLIK ═══
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `coach-${tag}@test.local`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Rahbar',
        businessName: 'Kouching Testi',
      },
    });
    const businessId = (reg.json() as { businesses: { businessId: string }[] }).businesses[0]!
      .businessId;
    const auth = { sid: reg.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    const base = `/api/v1/businesses/${businessId}`;

    // Sotuvchi + uning suhbati + ikkita ball (biri ballanmagan, isbotsiz).
    const fixture = await withoutTenantIsolation('test: kouching fixture', async (tx) => {
      const [u] = await tx
        .insert(appUser)
        .values({ email: `seller-${tag}@test.local`, displayName: 'Sotuvchi', systemRole: 'user' })
        .returning({ id: appUser.id });
      const [s] = await tx
        .insert(seat)
        .values({
          businessId,
          userId: u!.id,
          displayName: 'Sotuvchi',
          isOccupied: true,
          activation: 'active',
        })
        .returning({ id: seat.id });
      const [other] = await tx
        .insert(seat)
        .values({ businessId, displayName: 'Begona' })
        .returning({ id: seat.id });

      const [conv] = await tx
        .insert(conversation)
        .values({
          businessId,
          seatId: s!.id,
          channel: 'telegram',
          direction: 'inbound',
          externalThreadId: `coach-${tag}`,
          startedAt: new Date(),
          status: 'done',
        })
        .returning({ id: conversation.id });

      await tx.insert(transcriptSegment).values([
        {
          businessId,
          conversationId: conv!.id,
          seq: 0,
          speaker: 'client',
          text: 'Kurs narxi qancha?',
          startSeconds: '0',
        },
        {
          businessId,
          conversationId: conv!.id,
          seq: 1,
          speaker: 'manager',
          text: HAQIQIY_GAP,
          startSeconds: '30',
        },
      ]);

      const [an] = await tx
        .insert(analysis)
        .values({
          businessId,
          conversationId: conv!.id,
          overallScore: '50.0',
          scoringMode: 'scored',
        })
        .returning({ id: analysis.id });

      // B1 — ballanmagan (isbot yo'q). Aynan shu holat qiziq:
      // rahbar ball qo'ymoqchi bo'lsa, iqtibos keltirishi SHART.
      const [isbotsiz] = await tx
        .insert(criterionScore)
        .values({
          analysisId: an!.id,
          conversationId: conv!.id,
          businessId,
          seatId: s!.id,
          criterionCode: 'B1',
          criterionName: 'Narx taqdimoti',
          rubricSnapshot: {},
          score: null,
          maxScore: 3,
          evidenceQuote: null,
        })
        .returning({ id: criterionScore.id });

      // A1 — isboti bor, ball past.
      const [isbotli] = await tx
        .insert(criterionScore)
        .values({
          analysisId: an!.id,
          conversationId: conv!.id,
          businessId,
          seatId: s!.id,
          criterionCode: 'A1',
          criterionName: 'Ochuvchi savollar',
          rubricSnapshot: {},
          score: 1,
          maxScore: 3,
          evidenceQuote: HAQIQIY_GAP,
        })
        .returning({ id: criterionScore.id });

      // Begona sotuvchining bali — ko'lam testi uchun.
      const [begonaBall] = await tx
        .insert(criterionScore)
        .values({
          analysisId: an!.id,
          conversationId: conv!.id,
          businessId,
          seatId: other!.id,
          criterionCode: 'C1',
          criterionName: 'Keyingi qadam',
          rubricSnapshot: {},
          score: 2,
          maxScore: 3,
          evidenceQuote: HAQIQIY_GAP,
        })
        .returning({ id: criterionScore.id });

      return {
        userId: u!.id,
        seatId: s!.id,
        convId: conv!.id,
        isbotsizId: isbotsiz!.id,
        isbotliId: isbotli!.id,
        begonaBallId: begonaBall!.id,
      };
    });

    const sellerSession = await createSession(fixture.userId);
    const sellerAuth = { sid: sellerSession.token };

    // ═══ E'TIROZ YARATISH ═══
    console.log('— e\'tiroz yaratish —');

    const qisqa = await app.inject({
      method: 'POST',
      url: `${base}/appeals?scoreId=${fixture.isbotsizId}`,
      cookies: sellerAuth,
      payload: { reason: 'yo\'q' },
    });
    check('juda qisqa sabab rad etiladi', qisqa.statusCode === 422, `kod: ${qisqa.statusCode}`);

    const begona = await app.inject({
      method: 'POST',
      url: `${base}/appeals?scoreId=${fixture.begonaBallId}`,
      cookies: sellerAuth,
      payload: { reason: 'Bu mening bahom emas, lekin urinib ko\'raman' },
    });
    check(
      'begona sotuvchining bahosiga e\'tiroz bildirib bo\'lmaydi (404)',
      begona.statusCode === 404,
      `kod: ${begona.statusCode}`,
    );

    const yaratildi = await app.inject({
      method: 'POST',
      url: `${base}/appeals?scoreId=${fixture.isbotsizId}`,
      cookies: sellerAuth,
      payload: { reason: 'Men narxni aytdim, AI buni eshitmagan shekilli' },
    });
    check('sotuvchi o\'z bahosiga e\'tiroz bildiradi', yaratildi.statusCode === 201, `kod: ${yaratildi.statusCode}`);
    const appealId = (yaratildi.json() as { id: string }).id;

    const takror = await app.inject({
      method: 'POST',
      url: `${base}/appeals?scoreId=${fixture.isbotsizId}`,
      cookies: sellerAuth,
      payload: { reason: 'Yana bir marta yozib ko\'raman, javob yo\'q' },
    });
    check(
      'bir bahoga ikkinchi ochiq e\'tiroz bo\'lmaydi (409)',
      takror.statusCode === 409,
      `kod: ${takror.statusCode}`,
    );

    const ogoh = await app.inject({ method: 'GET', url: `${base}/alerts`, cookies: auth });
    const ogohBody = ogoh.json() as { alerts: { kind: string }[] };
    check(
      'rahbarga ogohlantirish yaratildi',
      ogohBody.alerts.some((a) => a.kind === 'score_appeal'),
    );

    // ═══ ISBOT KAFOLATI — TESTNING YURAGI ═══
    console.log('\n— isbot kafolati (inson uchun ham) —');

    const isbotsizQabul = await app.inject({
      method: 'PATCH',
      url: `${base}/appeals/${appealId}`,
      cookies: auth,
      payload: { status: 'accepted', newScore: 3 },
    });
    check(
      'ISBOTSIZ mezonga ball qo\'yib bo\'lmaydi — iqtibos talab qilinadi',
      isbotsizQabul.statusCode === 400,
      `kod: ${isbotsizQabul.statusCode}`,
    );

    const soxtaIqtibos = await app.inject({
      method: 'PATCH',
      url: `${base}/appeals/${appealId}`,
      cookies: auth,
      payload: {
        status: 'accepted',
        newScore: 3,
        evidenceQuote: 'Men bu gapni umuman aytmaganman va transkriptda yo\'q',
      },
    });
    check(
      'RAHBAR o\'ylab topgan iqtibos ham rad etiladi',
      soxtaIqtibos.statusCode === 400,
      `kod: ${soxtaIqtibos.statusCode}`,
    );

    const ortiqBall = await app.inject({
      method: 'PATCH',
      url: `${base}/appeals/${appealId}`,
      cookies: auth,
      payload: { status: 'accepted', newScore: 9, evidenceQuote: HAQIQIY_GAP },
    });
    check(
      'maxScore dan katta ball rad etiladi',
      ortiqBall.statusCode === 400,
      `kod: ${ortiqBall.statusCode}`,
    );

    const togri = await app.inject({
      method: 'PATCH',
      url: `${base}/appeals/${appealId}`,
      cookies: auth,
      payload: {
        status: 'accepted',
        newScore: 3,
        evidenceQuote: HAQIQIY_GAP,
        resolutionNote: 'Haqiqatan aytilgan, AI o\'tkazib yuborgan',
      },
    });
    check('haqiqiy iqtibos bilan qabul qilinadi', togri.statusCode === 200, `kod: ${togri.statusCode}`);

    const [yangilangan] = await withoutTenantIsolation('test: ballni tekshirish', (tx) =>
      tx
        .select({ score: criterionScore.score, quote: criterionScore.evidenceQuote })
        .from(criterionScore)
        .where(eq(criterionScore.id, fixture.isbotsizId)),
    );
    check('ball yangilandi', yangilangan?.score === 3, `ball: ${yangilangan?.score}`);
    check('isbot ham yozildi', yangilangan?.quote === HAQIQIY_GAP);

    const qayta = await app.inject({
      method: 'PATCH',
      url: `${base}/appeals/${appealId}`,
      cookies: auth,
      payload: { status: 'rejected', resolutionNote: 'Ikkinchi marta' },
    });
    check('hal qilingan e\'tiroz qayta hal qilinmaydi (409)', qayta.statusCode === 409);

    // ═══ RAD ETISH ═══
    console.log('\n— rad etish —');
    const ikkinchi = await app.inject({
      method: 'POST',
      url: `${base}/appeals?scoreId=${fixture.isbotliId}`,
      cookies: sellerAuth,
      payload: { reason: 'Bu savolni men berganman deb o\'ylayman' },
    });
    const ikkinchiId = (ikkinchi.json() as { id: string }).id;

    const sababsizRad = await app.inject({
      method: 'PATCH',
      url: `${base}/appeals/${ikkinchiId}`,
      cookies: auth,
      payload: { status: 'rejected' },
    });
    check(
      'sababsiz rad etib bo\'lmaydi',
      sababsizRad.statusCode === 422,
      `kod: ${sababsizRad.statusCode}`,
    );

    const rad = await app.inject({
      method: 'PATCH',
      url: `${base}/appeals/${ikkinchiId}`,
      cookies: auth,
      payload: { status: 'rejected', resolutionNote: 'Yozishmada bunday savol yo\'q' },
    });
    check('sabab bilan rad etiladi', rad.statusCode === 200, `kod: ${rad.statusCode}`);

    const [tegilmagan] = await withoutTenantIsolation('test: rad etilgan ball', (tx) =>
      tx
        .select({ score: criterionScore.score })
        .from(criterionScore)
        .where(eq(criterionScore.id, fixture.isbotliId)),
    );
    check('rad etilganda ball o\'zgarmaydi', tegilmagan?.score === 1);

    // ═══ RUXSATLAR ═══
    console.log('\n— ruxsatlar —');
    const sotuvchiRoyxat = await app.inject({
      method: 'GET',
      url: `${base}/appeals`,
      cookies: sellerAuth,
    });
    check(
      'sotuvchi e\'tirozlar ro\'yxatini ko\'rmaydi (403)',
      sotuvchiRoyxat.statusCode === 403,
      `kod: ${sotuvchiRoyxat.statusCode}`,
    );

    const rahbarRoyxat = await app.inject({ method: 'GET', url: `${base}/appeals`, cookies: auth });
    const royxat = rahbarRoyxat.json() as { appeals: { raisedByName: string | null }[] };
    check('rahbar ro\'yxatni ko\'radi', rahbarRoyxat.statusCode === 200);
    check('ro\'yxatda ikkita e\'tiroz', royxat.appeals.length === 2, `${royxat.appeals.length}`);
    check('muallif ismi ko\'rsatilgan', royxat.appeals[0]?.raisedByName === 'Sotuvchi');

    const kalibratsiya = await app.inject({
      method: 'GET',
      url: `${base}/appeals/analytics`,
      cookies: auth,
    });
    const kal = kalibratsiya.json() as { criteria: { code: string; accepted: number }[] };
    check('kalibratsiya statistikasi ishlaydi', kalibratsiya.statusCode === 200);
    check(
      'qabul qilingan e\'tiroz mezon bo\'yicha sanaladi',
      kal.criteria.find((c) => c.code === 'B1')?.accepted === 1,
      JSON.stringify(kal.criteria),
    );

    // ═══ RAHBAR IZOHI (FR-123) ═══
    console.log('\n— rahbar izohi —');
    const sotuvchiIzoh = await app.inject({
      method: 'POST',
      url: `${base}/conversations/${fixture.convId}/comments`,
      cookies: sellerAuth,
      payload: { body: 'Men ham izoh yozmoqchiman' },
    });
    check(
      'sotuvchi izoh yoza olmaydi (403)',
      sotuvchiIzoh.statusCode === 403,
      `kod: ${sotuvchiIzoh.statusCode}`,
    );

    const bosh = await app.inject({
      method: 'POST',
      url: `${base}/conversations/${fixture.convId}/comments`,
      cookies: auth,
      payload: { body: 'a' },
    });
    check('bo\'sh izoh rad etiladi', bosh.statusCode === 422);

    const izoh = await app.inject({
      method: 'POST',
      url: `${base}/conversations/${fixture.convId}/comments`,
      cookies: auth,
      payload: {
        body: 'Narxni aytishdan oldin ehtiyojni so\'rasang, e\'tiroz kamayadi.',
        criterionCode: 'B1',
      },
    });
    check('rahbar izoh qoldiradi', izoh.statusCode === 201, `kod: ${izoh.statusCode}`);
    const izohId = (izoh.json() as { id: string }).id;

    const detal = await app.inject({
      method: 'GET',
      url: `${base}/conversations/${fixture.convId}`,
      cookies: sellerAuth,
    });
    const detalBody = detal.json() as {
      comments: { id: string; authorName: string | null; criterionCode: string | null; seenAt: string | null }[];
      appeals: { status: string; originalScore: number | null; newScore: number | null }[];
      scores: { id: string }[];
    };
    check('sotuvchi izohni suhbat detalida ko\'radi', detalBody.comments.length === 1);
    check('izoh muallifi ko\'rsatilgan', detalBody.comments[0]?.authorName === 'Rahbar');
    check('izoh mezonga bog\'langan', detalBody.comments[0]?.criterionCode === 'B1');
    check('hali o\'qilmagan', detalBody.comments[0]?.seenAt === null);
    check('detalda e\'tirozlar ham keladi', detalBody.appeals.length === 2);
    // Ball o'zgarishi ko'rinmasa, sotuvchi e'tiroz natijasini bilmaydi.
    const qabulQilingan = detalBody.appeals.find((a) => a.status === 'accepted');
    check(
      'qabul qilingan e\'tirozda ball o\'zgarishi ko\'rinadi',
      qabulQilingan?.originalScore === null && qabulQilingan?.newScore === 3,
      JSON.stringify(qabulQilingan),
    );
    check('ball qatorlari id bilan keladi (e\'tiroz uchun)', typeof detalBody.scores[0]?.id === 'string');

    const korildi = await app.inject({
      method: 'PATCH',
      url: `${base}/comments/${izohId}/seen`,
      cookies: sellerAuth,
    });
    check('sotuvchi izohni o\'qilgan deb belgilaydi', korildi.statusCode === 200);
    check(
      'seenAt yozildi',
      (korildi.json() as { seenAt: string | null }).seenAt !== null,
    );
  } finally {
    await app.close();
    await cleanupTestDataQuietly(`%${tag}@test.local`);
    await closeDb();
  }

  console.log(
    `\n${fail === 0 ? 'Kouching butun.' : 'XATOLAR BOR.'} ${pass}/${pass + fail} tekshiruv o'tdi.`,
  );
  if (fail > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
