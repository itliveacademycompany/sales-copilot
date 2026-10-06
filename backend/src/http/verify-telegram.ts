import { eq, inArray, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { keshniTozala } from '../auth/context-cache.js';
import { decryptSecret, encryptSecret, maskSecret } from '../crypto/secrets.js';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import {
  aiProvider,
  appUser,
  business,
  conversation,
  integration,
  transcriptSegment,
} from '../db/schema/index.js';
import { computeReplyMetrics } from '../telegram/ingest.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TELEGRAM + ADMIN PANEL + SHIFRLASH TESTI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:telegram
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
const PASSWORD = 'juda-maxfiy-parol-123';
const HOUR = 3600;

/** Telegram webhook update qurish uchun yordamchi. */
function update(opts: {
  messageId: number;
  chatId: number;
  fromId: number;
  isBot?: boolean;
  text: string;
  /** Unix soniyalarda. */
  date: number;
}) {
  return {
    update_id: opts.messageId,
    message: {
      message_id: opts.messageId,
      from: { id: opts.fromId, is_bot: opts.isBot ?? false, first_name: 'Test' },
      chat: { id: opts.chatId, type: 'private' as const },
      date: opts.date,
      text: opts.text,
    },
  };
}

async function main(): Promise<void> {
  const app: FastifyInstance = await buildApp();
  console.log('\nShifrlash, admin panel va Telegram\n');

  const email = `tg-${tag}@test.local`;
  const now = Math.floor(Date.now() / 1000);

  /**
   * Test o'z provayderini faollashtiradi, faollashtirish esa qolganlarini
   * o'chiradi (bir maqsadga bitta faol provayder). Test provayderi keyin
   * o'chirilgani uchun dev muhitida umuman faol provayder qolmasdi va
   * `npm run verify` dan keyin tahlil jimgina ishlamay qo'yardi.
   * Shu sababli oldingi faol provayderlar eslab qolinadi va tiklanadi.
   */
  const previouslyActive = await withoutTenantIsolation(
    'test: oldindan faol provayderlarni eslab qolish',
    (tx) => tx.select({ id: aiProvider.id }).from(aiProvider).where(eq(aiProvider.isActive, true)),
  );

  try {
    // ═══ SHIFRLASH ═══
    const secretValue = 'sk-ant-api03-EXAMPLE-KEY-abcdefghijklmnop-4f2a';
    const blob = encryptSecret(secretValue);
    check('shifrlangan qiymat ochiladi', decryptSecret(blob) === secretValue);
    check('shifrlangan blob ochiq matnni saqlamaydi', !blob.toString('utf8').includes('sk-ant'));

    let tampered = false;
    try {
      const bad = Buffer.from(blob);
      bad[bad.length - 1] = (bad[bad.length - 1]! + 1) % 256;
      decryptSecret(bad);
    } catch {
      tampered = true;
    }
    check('o\'zgartirilgan blob RAD ETILDI (GCM auth)', tampered);
    check(
      'niqob kalitni oshkor qilmaydi',
      maskSecret(secretValue).startsWith('sk-ant-') &&
        !maskSecret(secretValue).includes('EXAMPLE'),
    );

    // ═══ RO'YXATDAN O'TISH ═══
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: PASSWORD, displayName: 'Admin', businessName: 'TG Test' },
    });
    const regBody = reg.json() as {
      user: { id: string };
      businesses: { businessId: string }[];
    };
    const cookie = reg.cookies.find((c) => c.name === 'sid')?.value ?? '';
    const businessId = regBody.businesses[0]!.businessId;
    const auth = { sid: cookie };
    const base = `/api/v1/businesses/${businessId}`;

    // ═══ ADMIN PANEL: ruxsat ═══
    const notAdmin = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/providers',
      cookies: auth,
    });
    check(
      'oddiy foydalanuvchi admin panelini ko\'rmaydi (404)',
      notAdmin.statusCode === 404,
      `kod: ${notAdmin.statusCode}`,
    );

    await withoutTenantIsolation('test: super-admin huquqini berish', (tx) =>
      tx.update(appUser).set({ systemRole: 'super_admin' }).where(eq(appUser.email, email)),
    );

    /**
     * Auth keshini tozalaymiz.
     *
     * Yozuv HTTP orqali emas, TO'G'RIDAN-TO'G'RI bazaga qilindi —
     * demak `auth-plugin` dagi bekor qilish hooki ishga tushmaydi.
     *
     * Ishlab chiqarishda ham ayni shunday: `admin:grant` skripti
     * ALOHIDA jarayonda ishlaydi va ishlab turgan server o'zgarishni
     * TTL (30 s) o'tgach ko'radi. Skript buni operatorga aytadi.
     */
    keshniTozala();

    const asAdmin = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/providers',
      cookies: auth,
    });
    check('super-admin panelga kiradi', asAdmin.statusCode === 200);

    // ═══ ADMIN PANEL: AI provayder ═══
    const created = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/providers',
      cookies: auth,
      payload: {
        purpose: 'llm',
        kind: 'anthropic',
        label: 'Asosiy Claude kaliti',
        apiKey: secretValue,
        models: { stage2: 'claude-opus-5', stage3: 'claude-opus-5' },
      },
    });
    check('provayder yaratildi', created.statusCode === 201);

    const provider = created.json() as Record<string, unknown>;
    const providerId = provider.id as string;
    check('javobda shifrlangan kalit YO\'Q', !('apiKeyEncrypted' in provider));
    check('javobda ochiq kalit YO\'Q', !JSON.stringify(provider).includes('EXAMPLE'));
    check('niqob qaytarildi', typeof provider.apiKeyHint === 'string');

    const stored = await withoutTenantIsolation('test: bazadagi kalitni tekshirish', (tx) =>
      tx
        .select({ enc: aiProvider.apiKeyEncrypted })
        .from(aiProvider)
        .where(eq(aiProvider.id, providerId)),
    );
    check(
      'bazada kalit shifrlangan holda',
      !!stored[0]?.enc && !stored[0].enc.toString('utf8').includes('EXAMPLE'),
    );
    check(
      'bazadagi kalit to\'g\'ri ochiladi',
      decryptSecret(stored[0]!.enc!) === secretValue,
    );

    const activated = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/providers/${providerId}/activate`,
      cookies: auth,
    });
    check('provayder faollashtirildi', (activated.json() as { isActive: boolean }).isActive);

    const noKey = await app.inject({
      method: 'POST',
      url: '/api/v1/admin/providers',
      cookies: auth,
      payload: { purpose: 'stt', kind: 'deepgram', label: 'Kalitsiz' },
    });
    const noKeyId = (noKey.json() as { id: string }).id;
    const activateNoKey = await app.inject({
      method: 'POST',
      url: `/api/v1/admin/providers/${noKeyId}/activate`,
      cookies: auth,
    });
    check(
      'kalitsiz provayderni faollashtirib bo\'lmaydi',
      activateNoKey.statusCode === 400,
      `kod: ${activateNoKey.statusCode}`,
    );

    // ═══ TELEGRAM: ulash ═══
    const connect = await app.inject({
      method: 'POST',
      url: `${base}/integrations/telegram`,
      cookies: auth,
      payload: { botToken: '123456789:AAFakeTokenForTestingOnly_abcdefghijk', botUsername: 'test_bot' },
    });
    check('Telegram boti ulandi', connect.statusCode === 201);
    const connectBody = connect.json() as { integration: { id: string }; webhookUrl: string };
    const integrationId = connectBody.integration.id;
    check('webhook manzili berildi', connectBody.webhookUrl.includes(integrationId));

    const status = await app.inject({
      method: 'GET',
      url: `${base}/integrations/telegram`,
      cookies: auth,
    });
    const statusBody = status.json() as { connected: boolean; integration: Record<string, unknown> };
    check('holat "ulangan"', statusBody.connected === true);
    check(
      'holatda bot tokeni YO\'Q',
      !JSON.stringify(statusBody).includes('AAFakeToken'),
    );

    const [secretRow] = await withoutTenantIsolation('test: webhook sirini olish', (tx) =>
      tx
        .select({ secret: integration.webhookSecret })
        .from(integration)
        .where(eq(integration.id, integrationId)),
    );
    const webhookSecret = secretRow!.secret!;
    const hook = `/api/v1/webhooks/telegram/${integrationId}`;

    // ═══ WEBHOOK: xavfsizlik ═══
    const noSecret = await app.inject({ method: 'POST', url: hook, payload: update({ messageId: 1, chatId: 100, fromId: 500, text: 'salom', date: now }) });
    check('sirsiz webhook 401', noSecret.statusCode === 401);

    const wrongSecret = await app.inject({
      method: 'POST',
      url: hook,
      headers: { 'x-telegram-bot-api-secret-token': 'notogri-sir' },
      payload: update({ messageId: 1, chatId: 100, fromId: 500, text: 'salom', date: now }),
    });
    check('noto\'g\'ri sir bilan 401', wrongSecret.statusCode === 401);

    const H = { 'x-telegram-bot-api-secret-token': webhookSecret };

    // ═══ WEBHOOK: sessiyaga bo'lish ═══
    const m1 = await app.inject({
      method: 'POST',
      url: hook,
      headers: H,
      payload: update({ messageId: 101, chatId: 777, fromId: 500, text: 'Assalomu alaykum, narxi qancha?', date: now }),
    });
    const r1 = m1.json() as { status: string; conversationId: string; newSession: boolean };
    check('birinchi xabar saqlandi', r1.status === 'stored');
    check('yangi sessiya ochildi', r1.newSession === true);

    const m2 = await app.inject({
      method: 'POST',
      url: hook,
      headers: H,
      payload: update({ messageId: 102, chatId: 777, fromId: 500, text: 'Javob bering iltimos', date: now + HOUR }),
    });
    const r2 = m2.json() as { conversationId: string; newSession: boolean };
    check('1 soatdan keyingi xabar SHU sessiyaga tushdi', r2.conversationId === r1.conversationId);
    check('yangi sessiya ochilmadi', r2.newSession === false);

    const m3 = await app.inject({
      method: 'POST',
      url: hook,
      headers: H,
      payload: update({ messageId: 103, chatId: 777, fromId: 500, text: 'Yana yozdim', date: now + 25 * HOUR }),
    });
    const r3 = m3.json() as { conversationId: string; newSession: boolean };
    check('25 soatdan keyin YANGI sessiya ochildi', r3.newSession === true);
    check('yangi sessiya id boshqa', r3.conversationId !== r1.conversationId);

    // ═══ WEBHOOK: idempotentlik ═══
    const dup = await app.inject({
      method: 'POST',
      url: hook,
      headers: H,
      payload: update({ messageId: 101, chatId: 777, fromId: 500, text: 'Assalomu alaykum, narxi qancha?', date: now }),
    });
    check(
      'takroriy xabar dedupe qilindi',
      (dup.json() as { status: string }).status === 'duplicate',
    );

    // ═══ WEBHOOK: bot xabari ═══
    const botMsg = await app.inject({
      method: 'POST',
      url: hook,
      headers: H,
      payload: update({ messageId: 104, chatId: 777, fromId: 900, isBot: true, text: 'avtomatik javob', date: now }),
    });
    check(
      'bot xabari e\'tiborsiz qoldirildi',
      (botMsg.json() as { status: string }).status === 'ignored',
    );

    // ═══ SPEAKER: deterministik aniqlash ═══
    const seatRes = await app.inject({
      method: 'POST',
      url: `${base}/seats`,
      cookies: auth,
      payload: { displayName: 'Sotuvchi Muxlisa' },
    });
    const seatId = (seatRes.json() as { id: string }).id;

    const link = await app.inject({
      method: 'PATCH',
      url: `${base}/seats/${seatId}/telegram`,
      cookies: auth,
      payload: { telegramId: '600' },
    });
    check('sotuvchiga Telegram id biriktirildi', link.statusCode === 200);

    await app.inject({
      method: 'POST',
      url: hook,
      headers: H,
      payload: update({ messageId: 201, chatId: 888, fromId: 500, text: 'Salom, narx?', date: now }),
    });
    await app.inject({
      method: 'POST',
      url: hook,
      headers: H,
      payload: update({ messageId: 202, chatId: 888, fromId: 600, text: 'Assalomu alaykum! 500 ming so\'m', date: now + 120 }),
    });

    const rows = await withoutTenantIsolation('test: speaker rollarini tekshirish', (tx) =>
      tx
        .select({
          speaker: transcriptSegment.speaker,
          senderId: transcriptSegment.externalSenderId,
          seq: transcriptSegment.seq,
        })
        .from(transcriptSegment)
        .innerJoin(conversation, eq(conversation.id, transcriptSegment.conversationId))
        .where(eq(conversation.externalThreadId, '888'))
        .orderBy(transcriptSegment.seq),
    );
    check(
      'notanish yuboruvchi → mijoz',
      rows[0]?.speaker === 'client' && rows[0]?.senderId === '500',
      JSON.stringify(rows[0]),
    );
    check(
      'seat ga bog\'langan yuboruvchi → menejer',
      rows[1]?.speaker === 'manager' && rows[1]?.senderId === '600',
      JSON.stringify(rows[1]),
    );

    const [convRow] = await withoutTenantIsolation('test: suhbat seat ga bog\'landimi', (tx) =>
      tx
        .select({ seatId: conversation.seatId })
        .from(conversation)
        .where(eq(conversation.externalThreadId, '888'))
        .limit(1),
    );
    check('suhbat sotuvchiga biriktirildi', convRow?.seatId === seatId);

    // ═══ JAVOB TEZLIGI (sof funksiya) ═══
    const t0 = new Date('2026-07-29T10:00:00Z');
    const at = (min: number) => new Date(t0.getTime() + min * 60_000);

    const metrics = computeReplyMetrics([
      { speaker: 'client', at: at(0) },
      { speaker: 'client', at: at(1) }, // ketma-ket — bitta navbat
      { speaker: 'manager', at: at(5) }, // javob 5 daqiqada
      { speaker: 'client', at: at(10) },
      { speaker: 'manager', at: at(25) }, // javob 15 daqiqada
      { speaker: 'client', at: at(30) }, // javobsiz qoldi
    ]);
    check('mijoz navbatlari to\'g\'ri sanaldi (3)', metrics.customerTurns === 3, String(metrics.customerTurns));
    check('javob berilgan navbatlar (2)', metrics.repliedTurns === 2);
    check('javobsiz navbat aniqlandi (1)', metrics.unansweredTurns === 1);
    check('birinchi javob 300 soniya', metrics.firstResponseSeconds === 300);
    check('eng sekin javob 900 soniya', metrics.slowestResponseSeconds === 900);
    check('median 600 soniya', metrics.medianResponseSeconds === 600);

    const empty = computeReplyMetrics([]);
    check('bo\'sh suhbatda median null', empty.medianResponseSeconds === null);

    // ═══ UZISH ═══
    const disc = await app.inject({
      method: 'DELETE',
      url: `${base}/integrations/telegram`,
      cookies: auth,
    });
    check('integratsiya uzildi', disc.statusCode === 200);

    const afterDisc = await app.inject({
      method: 'POST',
      url: hook,
      headers: H,
      payload: update({ messageId: 301, chatId: 777, fromId: 500, text: 'yana', date: now }),
    });
    check(
      'uzilgandan keyin webhook sirni rad etadi',
      afterDisc.statusCode === 401,
      `kod: ${afterDisc.statusCode}`,
    );
  } finally {
    await app.close();
    // aiProvider platforma darajasida — biznesga bog'lanmagan, shuning
    // uchun cascade uni olib ketmaydi va alohida o'chiriladi.
    await withoutTenantIsolation('test tozalash: sinov AI provayderlari', async (tx) => {
      await tx.delete(aiProvider).where(like(aiProvider.label, '%Kalitsiz%'));
      await tx.delete(aiProvider).where(like(aiProvider.label, '%Asosiy Claude%'));
      if (previouslyActive.length > 0) {
        await tx
          .update(aiProvider)
          .set({ isActive: true })
          .where(inArray(aiProvider.id, previouslyActive.map((p) => p.id)));
      }
    });
    await cleanupTestDataQuietly(email);
    await closeDb();
  }

  console.log(
    fail === 0
      ? `\nTelegram va admin panel butun. ${pass}/${pass} tekshiruv o'tdi.\n`
      : `\n${fail} ta tekshiruv MUVAFFAQIYATSIZ.\n`,
  );
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
