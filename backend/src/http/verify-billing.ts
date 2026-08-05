import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { isAnalysisBlocked, runBillingTick } from '../billing/engine.js';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { conversation, integration, seat, subscription } from '../db/schema/index.js';
import { enqueueAnalysis } from '../jobs/queue.js';
import { sweepIdleSessions } from '../jobs/scheduler.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILLING INTEGRATSIYA TESTI — haqiqiy baza bilan
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:billing
 *
 * Sof qaror mantiqi `verify-engine.ts`da alohida sinaladi. Bu yerda:
 * to'liq tsikl (trial → active → grace → degraded → tiklanish), FR-156
 * (degraded'da tahlil to'xtaydi, lekin yig'ish davom etadi), va API
 * ruxsatlari (status hammaga, to'liq — faqat egaga).
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

/**
 * Testda subscription holatini to'g'ridan-to'g'ri o'rnatish uchun —
 * `withoutTenantIsolation` egalik ulanishidan foydalanadi (RLS'ni
 * chetlab o'tadi), chunki bu yerda tenant konteksti (`withTenant`)
 * o'rniga vaqtni "orqaga surish" kerak.
 */
async function setSubscription(
  businessId: string,
  patch: Partial<typeof subscription.$inferInsert>,
): Promise<void> {
  await withoutTenantIsolation('test: subscription holatini qo\'lda o\'rnatish', (tx) =>
    tx.update(subscription).set(patch).where(eq(subscription.businessId, businessId)),
  );
}

async function main(): Promise<void> {
  const app: FastifyInstance = await buildApp();
  console.log('\nBilling integratsiyasi\n');

  try {
    // ═══ TAYYORGARLIK: biznes + sotuvchi ═══
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `bill-${tag}@test.local`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Owner',
        businessName: 'Billing Test',
      },
    });
    const regBody = reg.json() as { businesses: { businessId: string }[] };
    const cookie = reg.cookies.find((c) => c.name === 'sid')?.value ?? '';
    const businessId = regBody.businesses[0]!.businessId;
    const auth = { sid: cookie };
    const base = `/api/v1/businesses/${businessId}`;

    check(
      'ro\'yxatdan o\'tishda 14 kunlik sinov yaratildi (FR-157)',
      (
        await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
          tx.select().from(subscription).where(eq(subscription.businessId, businessId)),
        )
      )[0]?.status === 'trial',
    );

    const seatRes = await app.inject({
      method: 'POST',
      url: `${base}/seats`,
      cookies: auth,
      payload: { displayName: 'Sotuvchi' },
    });
    check('sotuvchi qo\'shildi', seatRes.statusCode === 201);

    // ═══ A: SINOV → BALANS YETARLI → FAOLLASHTIRISH ═══
    console.log('\n— A: sinov tugashi, muvaffaqiyatli yechish —');

    await setSubscription(businessId, {
      trialEndsAt: new Date(Date.now() - 1000),
      balance: '5000000.00',
    });
    const tickA = await runBillingTick();
    check('tsikl 1 ta yechish qildi', tickA.charged >= 1, JSON.stringify(tickA));

    const [subA] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(subscription).where(eq(subscription.businessId, businessId)),
    );
    check('holat active bo\'ldi', subA?.status === 'active', subA?.status);
    check(
      'balansdan seat narxi yechildi',
      Number(subA?.balance) === 5_000_000 - 640_000,
      `qoldiq: ${subA?.balance}`,
    );
    check('davr belgilandi', subA?.currentPeriodStart !== null && subA?.currentPeriodEnd !== null);

    // ═══ B: DAVR TUGADI, BALANS YETARSIZ → GRACE ═══
    console.log('\n— B: davr tugashi, balans yetarsiz → grace —');

    await setSubscription(businessId, {
      status: 'active',
      currentPeriodEnd: new Date(Date.now() - 1000),
      balance: '1000.00',
    });
    const tickB = await runBillingTick();
    check('tsikl grace holatiga o\'tkazdi', tickB.enteredGrace >= 1, JSON.stringify(tickB));
    const [subB] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(subscription).where(eq(subscription.businessId, businessId)),
    );
    check('holat grace', subB?.status === 'grace');
    check('grace muddati o\'rnatildi', subB?.graceEndsAt !== null);

    // Grace davomida hali tahlil ishlaydi (faqat degraded to'xtatadi).
    check(
      'grace holatida navbatga qo\'yish TAQIQLANMAYDI',
      !(await isAnalysisBlocked(businessId)),
    );

    // ═══ C: GRACE TUGADI → DEGRADED ═══
    console.log('\n— C: grace muddati tugashi → degraded —');

    await setSubscription(businessId, { graceEndsAt: new Date(Date.now() - 1000) });
    const tickC = await runBillingTick();
    check('tsikl degraded qildi', tickC.degraded >= 1, JSON.stringify(tickC));
    const [subC] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(subscription).where(eq(subscription.businessId, businessId)),
    );
    check('holat degraded', subC?.status === 'degraded');

    // ═══ D: DEGRADED'DA TAHLIL TO'XTAYDI, LEKIN YIG'ISH DAVOM ETADI (FR-156) ═══
    console.log('\n— D: degraded rejim — yig\'ish davom etadi, tahlil to\'xtaydi —');

    check('degraded holatida navbatga qo\'yish bloklanadi', await isAnalysisBlocked(businessId));

    // enqueueAnalysis o'zi ham xuddi shu tekshiruvdan o'tishini —
    // haqiqiy suhbat kerak bo'lmaydigan darajada — tasdiqlaymiz: bloklangan
    // holatda funksiya bazaga umuman yozmasdan erta qaytishi kerak,
    // shuning uchun mavjud bo'lmagan conversationId bilan ham xato
    // bermasligi (FK buzilishi bo'lmasligi) kerak.
    const enqDegraded = await enqueueAnalysis(businessId, '00000000-0000-0000-0000-000000000000');
    check(
      'enqueueAnalysis bloklangan holatda bazaga yozmasdan erta qaytadi',
      !enqDegraded.queued && enqDegraded.reason === 'billing_blocked',
    );

    // Telegram integratsiyasi ulab, xabar yuborib ko'ramiz — yig'ish
    // ishlashi kerak, subscription holatidan qat'i nazar.
    const connect = await app.inject({
      method: 'POST',
      url: `${base}/integrations/telegram`,
      cookies: auth,
      payload: { botToken: `${'1'.repeat(9)}:${'A'.repeat(35)}` },
    });
    const integrationId = (connect.json() as { integration: { id: string } }).integration.id;
    const [integRow] = await withoutTenantIsolation('test: webhook sirini o\'qish', (tx) =>
      tx.select({ secret: integration.webhookSecret }).from(integration).where(eq(integration.id, integrationId)),
    );
    const webhookRes = await app.inject({
      method: 'POST',
      url: `/api/v1/webhooks/telegram/${integrationId}`,
      headers: { 'x-telegram-bot-api-secret-token': integRow!.secret! },
      payload: {
        update_id: 1,
        message: {
          message_id: 1,
          from: { id: 999, is_bot: false, first_name: 'Test' },
          chat: { id: 5000, type: 'private' as const },
          date: Math.floor(Date.now() / 1000),
          text: 'Degraded holatda ham bu xabar saqlanishi kerak',
        },
      },
    });
    check(
      'degraded holatida ham Telegram xabari SAQLANDI (FR-156)',
      webhookRes.statusCode === 200 && (webhookRes.json() as { status: string }).status === 'stored',
      JSON.stringify(webhookRes.json()),
    );

    // Scheduler ham degraded biznesni o'tkazib yuborishi kerak.
    await withoutTenantIsolation('test: xabarni darhol jim qilish', (tx) =>
      tx.execute(
        sql`update conversation set ended_at = now() - interval '1 hour' where business_id = ${businessId} and status = 'received'`,
      ),
    );
    const sweptDuringDegraded = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(conversation).where(eq(conversation.businessId, businessId)),
    );
    const before = sweptDuringDegraded.filter((c) => c.status === 'queued').length;
    await sweepIdleSessions(0);
    const after = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(conversation).where(eq(conversation.businessId, businessId)),
    );
    const afterQueued = after.filter((c) => c.status === 'queued').length;
    check(
      'scheduler degraded biznesni navbatga qo\'ymaydi',
      afterQueued === before,
      `oldin: ${before}, keyin: ${afterQueued}`,
    );

    // ═══ E: TO'LOV KELDI → QAYTA FAOLLASHTIRISH ═══
    console.log('\n— E: to\'lov qo\'shilgach avtomatik tiklanish —');

    const topup = await app.inject({
      method: 'POST',
      url: `${base}/billing/topup`,
      cookies: auth,
      payload: { amount: 3_000_000, description: 'Bank o\'tkazmasi #123' },
    });
    check('topup 201 qaytardi', topup.statusCode === 201, `kod: ${topup.statusCode}`);
    const topupBody = topup.json() as { balanceAfter: string; type: string };
    check('tranzaksiya to\'g\'ri yozildi', topupBody.type === 'topup' && Number(topupBody.balanceAfter) >= 3_000_000);

    const tickE = await runBillingTick();
    check('tsikl balansni ko\'rib qayta faollashtirdi', tickE.charged >= 1, JSON.stringify(tickE));
    const [subE] = await withoutTenantIsolation('test: natijani tekshirish', (tx) =>
      tx.select().from(subscription).where(eq(subscription.businessId, businessId)),
    );
    check('holat yana active', subE?.status === 'active');

    check('tiklangandan keyin navbatga qo\'yish yana ishlaydi', !(await isAnalysisBlocked(businessId)));

    // ═══ F: API RUXSATLARI ═══
    console.log('\n— F: billing API ruxsatlari —');

    const status = await app.inject({ method: 'GET', url: `${base}/billing/status`, cookies: auth });
    check('billing/status ochiq (business:read)', status.statusCode === 200);
    check(
      'status javobida moliyaviy tafsilot yo\'q',
      !('balance' in (status.json() as object)) && !('transactions' in (status.json() as object)),
    );

    const full = await app.inject({ method: 'GET', url: `${base}/billing`, cookies: auth });
    check('to\'liq billing (egasi) ko\'rinadi', full.statusCode === 200);
    const fullBody = full.json() as { transactions: unknown[]; monthlySeatPriceUzs: number };
    check('tranzaksiyalar tarixi qaytdi', fullBody.transactions.length >= 3);
    check('seat narxi config dan keldi', fullBody.monthlySeatPriceUzs === 640_000);

    // Sotuvchi (manager) rolida billing ko'rinmasligini tekshiramiz.
    const seatUserReg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `bill2-${tag}@test.local`,
        password: 'juda-maxfiy-parol-456',
        displayName: 'Manager',
        businessName: 'Boshqa biznes',
      },
    });
    const managerCookie = seatUserReg.cookies.find((c) => c.name === 'sid')?.value ?? '';
    const forbiddenFull = await app.inject({
      method: 'GET',
      url: `${base}/billing`,
      cookies: { sid: managerCookie },
    });
    check(
      'begona foydalanuvchi to\'liq billing\'ni ko\'ra olmaydi',
      forbiddenFull.statusCode === 404,
      `kod: ${forbiddenFull.statusCode}`,
    );

    const noAuth = await app.inject({ method: 'GET', url: `${base}/billing/status` });
    check('autentifikatsiyasiz 401', noAuth.statusCode === 401);
  } finally {
    await app.close();
    // bill- va bill2- ikkalasi ham shu tag bilan tugaydi.
    await cleanupTestDataQuietly(`%${tag}@test.local`);
    await closeDb();
  }

  console.log(`\n${fail === 0 ? 'Billing butun.' : 'XATOLAR BOR.'} ${pass}/${pass + fail} tekshiruv o'tdi.`);
  if (fail > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
