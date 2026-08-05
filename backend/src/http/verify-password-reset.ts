import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createResetForUser } from '../auth/password-reset.js';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { appUser, passwordReset } from '../db/schema/index.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAROLNI TIKLASH TESTI — FR-06
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:password-reset
 *
 * Parol tiklash — hisobni egallab olishning eng keng tarqalgan yo'li.
 * Shuning uchun bu yerda tekshiriladigan narsalar "ishlaydimi" emas,
 * "SUIISTE'MOL QILIB BO'LADIMI":
 *
 *   • javob foydalanuvchi bor-yo'qligini oshkor qiladimi
 *   • token ikki marta ishlaydimi
 *   • muddati o'tgan token o'tadimi
 *   • yangi token eskisini bekor qiladimi
 *   • tiklashdan keyin eski sessiyalar tirik qoladimi
 *   • begona biznes rahbari havola yarata oladimi
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
const ESKI_PAROL = 'juda-maxfiy-parol-123';
const YANGI_PAROL = 'yangi-kuchli-parol-456';

async function main(): Promise<void> {
  const app: FastifyInstance = await buildApp();
  console.log('\nParolni tiklash (FR-06)\n');

  try {
    const email = `reset-${tag}@test.local`;
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email,
        password: ESKI_PAROL,
        displayName: 'Egasi',
        businessName: 'Tiklash Testi',
      },
    });
    const businessId = (reg.json() as { businesses: { businessId: string }[] }).businesses[0]!
      .businessId;
    const auth = { sid: reg.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    const [user] = await withoutTenantIsolation('test: foydalanuvchini olish', (tx) =>
      tx.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, email)),
    );
    const userId = user!.id;

    // ═══ MA'LUMOT OSHKOR QILMASLIK ═══
    console.log('— oshkor qilmaslik —');
    const mavjud = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { emailOrLogin: email },
    });
    const yoq = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/request',
      payload: { emailOrLogin: `yoq-${tag}@test.local` },
    });
    check('mavjud hisob uchun 200', mavjud.statusCode === 200);
    check('mavjud bo\'lmagan hisob uchun ham 200', yoq.statusCode === 200);
    check(
      'ikkala javob AYNAN bir xil — hisob bor-yo\'qligi bilinmaydi',
      mavjud.body === yoq.body,
      `${mavjud.body} vs ${yoq.body}`,
    );
    check('javobda token yo\'q', !mavjud.body.toLowerCase().includes('token'));

    // ═══ RAHBAR YARATGAN HAVOLA ═══
    console.log('\n— rahbar yaratgan havola —');
    const havola = await app.inject({
      method: 'POST',
      url: `/api/v1/businesses/${businessId}/users/${userId}/reset-link`,
      cookies: auth,
    });
    check('rahbar havola yaratadi', havola.statusCode === 200, `kod: ${havola.statusCode}`);
    const token = (havola.json() as { resetToken: string }).resetToken;
    check('token yetarlicha uzun', token.length >= 20, `uzunlik: ${token.length}`);

    const [saqlangan] = await withoutTenantIsolation('test: token xeshini tekshirish', (tx) =>
      tx
        .select({ hash: passwordReset.tokenHash })
        .from(passwordReset)
        .where(eq(passwordReset.userId, userId))
        .orderBy(sql`created_at desc`)
        .limit(1),
    );
    check(
      'bazada token OCHIQ holda saqlanmaydi',
      saqlangan !== undefined && saqlangan.hash !== token,
    );

    // Begona foydalanuvchiga havola — 404.
    const begonaReg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `stranger-${tag}@test.local`,
        password: ESKI_PAROL,
        displayName: 'Begona',
        businessName: 'Begona Biznes',
      },
    });
    const [begonaUser] = await withoutTenantIsolation('test: begona foydalanuvchi', (tx) =>
      tx
        .select({ id: appUser.id })
        .from(appUser)
        .where(eq(appUser.email, `stranger-${tag}@test.local`)),
    );
    void begonaReg;
    const begonaHavola = await app.inject({
      method: 'POST',
      url: `/api/v1/businesses/${businessId}/users/${begonaUser!.id}/reset-link`,
      cookies: auth,
    });
    check(
      'begona biznes foydalanuvchisiga havola yaratib bo\'lmaydi (404)',
      begonaHavola.statusCode === 404,
      `kod: ${begonaHavola.statusCode}`,
    );

    const ruxsatsiz = await app.inject({
      method: 'POST',
      url: `/api/v1/businesses/${businessId}/users/${userId}/reset-link`,
    });
    check('autentifikatsiyasiz havola yaratib bo\'lmaydi', ruxsatsiz.statusCode === 401);

    // ═══ ESKI TOKENNI BEKOR QILISH ═══
    console.log('\n— eski token bekor bo\'ladi —');
    const ikkinchi = await app.inject({
      method: 'POST',
      url: `/api/v1/businesses/${businessId}/users/${userId}/reset-link`,
      cookies: auth,
    });
    const yangiToken = (ikkinchi.json() as { resetToken: string }).resetToken;

    const eskiBilan = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token, newPassword: YANGI_PAROL },
    });
    check(
      'yangi havola berilgach ESKISI ishlamaydi',
      eskiBilan.statusCode === 400,
      `kod: ${eskiBilan.statusCode}`,
    );

    // ═══ MUDDAT ═══
    console.log('\n— muddat —');
    const { token: muddatli } = await createResetForUser(userId, 'admin');
    await withoutTenantIsolation('test: muddatni o\'tkazish', (tx) =>
      tx.execute(sql`
        update password_reset set expires_at = now() - interval '1 minute'
        where user_id = ${userId} and used_at is null
      `),
    );
    const eskirgan = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: muddatli, newPassword: YANGI_PAROL },
    });
    check('muddati o\'tgan token rad etiladi', eskirgan.statusCode === 400);

    const notogri = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: 'a'.repeat(43), newPassword: YANGI_PAROL },
    });
    check('mavjud bo\'lmagan token rad etiladi', notogri.statusCode === 400);

    const qisqaParol = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: yangiToken, newPassword: 'qisqa' },
    });
    check('qisqa parol rad etiladi', qisqaParol.statusCode === 422, `kod: ${qisqaParol.statusCode}`);

    // ═══ HAQIQIY TIKLASH ═══
    console.log('\n— tiklash —');
    // Yuqoridagi muddat sinovi yangi token yaratgani uchun `yangiToken`
    // ham bekor bo'lgan (har yangi so'rov eskilarini o'chiradi — bu
    // ataylab). Shuning uchun tiklash uchun yangisini olamiz.
    const { token: yakuniyToken } = await createResetForUser(userId, 'admin');
    // Tiklashdan oldin eski sessiya ishlayotganini tasdiqlaymiz.
    const oldin = await app.inject({ method: 'GET', url: '/api/v1/auth/context', cookies: auth });
    check('tiklashdan OLDIN eski sessiya ishlaydi', oldin.statusCode === 200);

    const tiklandi = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: yakuniyToken, newPassword: YANGI_PAROL },
    });
    check('parol tiklandi', tiklandi.statusCode === 200, `kod: ${tiklandi.statusCode}`);

    const keyin = await app.inject({ method: 'GET', url: '/api/v1/auth/context', cookies: auth });
    check(
      'tiklashdan KEYIN eski sessiya bekor qilingan',
      keyin.statusCode === 401,
      `kod: ${keyin.statusCode}`,
    );

    const takror = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/password-reset/confirm',
      payload: { token: yakuniyToken, newPassword: 'boshqa-parol-789' },
    });
    check(
      'token IKKINCHI marta ishlamaydi',
      takror.statusCode === 400,
      `kod: ${takror.statusCode}`,
    );

    const eskiParolBilan = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: ESKI_PAROL },
    });
    check('eski parol endi ishlamaydi', eskiParolBilan.statusCode === 401);

    const yangiParolBilan = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email, password: YANGI_PAROL },
    });
    check(
      'yangi parol bilan kirish mumkin',
      yangiParolBilan.statusCode === 200,
      `kod: ${yangiParolBilan.statusCode}`,
    );
  } finally {
    await app.close();
    await cleanupTestDataQuietly(`%${tag}@test.local`);
    await closeDb();
  }

  console.log(
    `\n${fail === 0 ? 'Parol tiklash butun.' : 'XATOLAR BOR.'} ${pass}/${pass + fail} tekshiruv o'tdi.`,
  );
  if (fail > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
