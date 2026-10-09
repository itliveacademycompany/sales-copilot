import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb } from '../db/index.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AUTH OQIMI TESTI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:auth
 *
 * `app.inject()` ishlatiladi — haqiqiy port ochilmaydi, lekin butun HTTP
 * zanjiri (hooklar, plaginlar, xato ishlovchi) real so'rovdagidek ishlaydi.
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
const emailA = `auth-a-${tag}@test.local`;
const emailB = `auth-b-${tag}@test.local`;
const PASSWORD = 'juda-maxfiy-parol-123';

async function main(): Promise<void> {
  const app = await buildApp();
  console.log('\nAuth oqimi\n');

  try {
    // ── 1. Ro'yxatdan o'tish ──
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: emailA,
        password: PASSWORD,
        displayName: 'Abdulla',
        businessName: 'IT Live Academy',
      },
    });
    check('ro\'yxatdan o\'tish 201 qaytardi', reg.statusCode === 201, `kod: ${reg.statusCode}`);

    const cookieA = reg.cookies.find((c) => c.name === 'sid')?.value ?? '';
    check('sessiya cookie o\'rnatildi', cookieA.length > 20);

    const sidCookie = reg.cookies.find((c) => c.name === 'sid');
    check('cookie httpOnly', sidCookie?.httpOnly === true);
    check('cookie sameSite=Lax', String(sidCookie?.sameSite).toLowerCase() === 'lax');

    const regBody = reg.json() as {
      user: { email: string };
      businesses: { role: string; permissions: string[]; businessId: string }[];
    };
    check('yaratuvchi "owner" roli oldi', regBody.businesses[0]?.role === 'owner');
    check(
      'owner ruxsatlari to\'liq',
      regBody.businesses[0]?.permissions.includes('subscription:manage') === true,
    );
    const businessIdA = regBody.businesses[0]?.businessId ?? '';

    // ── 2. Takroriy email ──
    const dup = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: emailA,
        password: PASSWORD,
        displayName: 'Boshqa',
        businessName: 'Boshqa biznes',
      },
    });
    check('takroriy email 409 qaytardi', dup.statusCode === 409, `kod: ${dup.statusCode}`);

    // ── 3. Zaif parol ──
    const weak = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `weak-${tag}@test.local`,
        password: '123',
        displayName: 'Test',
        businessName: 'Test',
      },
    });
    check('qisqa parol 422 qaytardi', weak.statusCode === 422, `kod: ${weak.statusCode}`);

    // ── 4. Kontekst: cookie'siz va cookie bilan ──
    const anon = await app.inject({ method: 'GET', url: '/api/v1/auth/context' });
    check('cookie\'siz kontekst 401', anon.statusCode === 401, `kod: ${anon.statusCode}`);

    const withCookie = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/context',
      cookies: { sid: cookieA },
    });
    check('cookie bilan kontekst 200', withCookie.statusCode === 200);

    // ── 5. Noto'g'ri parol ──
    const badPass = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: emailA, password: 'noto\'g\'ri-parol-butunlay' },
    });
    check('noto\'g\'ri parol 401', badPass.statusCode === 401);
    check(
      'xato xabari email mavjudligini oshkor qilmaydi',
      (badPass.json() as { title: string }).title === 'Login yoki parol noto\'g\'ri',
    );

    // ── 6. Mavjud bo'lmagan email — xuddi shu javob ──
    const noUser = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: `yoq-${tag}@test.local`, password: PASSWORD },
    });
    check(
      'mavjud bo\'lmagan email bir xil javob beradi',
      noUser.statusCode === 401 &&
        (noUser.json() as { title: string }).title ===
          (badPass.json() as { title: string }).title,
    );

    // ── 7. To'g'ri kirish ──
    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { email: emailA, password: PASSWORD },
    });
    check('to\'g\'ri parol bilan kirish 200', login.statusCode === 200);
    const cookieA2 = login.cookies.find((c) => c.name === 'sid')?.value ?? '';
    check('kirish yangi sessiya berdi', cookieA2 !== cookieA && cookieA2.length > 20);

    // ── 8. Tenant ajratilishi: ikkinchi foydalanuvchi ──
    const regB = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: emailB,
        password: PASSWORD,
        displayName: 'Begona',
        businessName: 'Begona biznes',
      },
    });
    const cookieB = regB.cookies.find((c) => c.name === 'sid')?.value ?? '';
    const ctxB = (
      await app.inject({
        method: 'GET',
        url: '/api/v1/auth/context',
        cookies: { sid: cookieB },
      })
    ).json() as { businesses: { businessId: string }[] };

    check(
      'B foydalanuvchi A ning biznesini ko\'rmaydi',
      !ctxB.businesses.some((b) => b.businessId === businessIdA),
    );
    check('B faqat bitta biznesga ega', ctxB.businesses.length === 1);

    // ── 9. Sessiyalar ro'yxati ──
    const sessions = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/sessions',
      cookies: { sid: cookieA2 },
    });
    const list = sessions.json() as { current: boolean }[];
    check('faol sessiyalar ro\'yxati keldi', Array.isArray(list) && list.length >= 1);
    check('joriy sessiya belgilangan', list.some((s) => s.current));

    // ── 10. Chiqish ──
    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      cookies: { sid: cookieA2 },
    });
    check('chiqish 200', logout.statusCode === 200);

    const afterLogout = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/context',
      cookies: { sid: cookieA2 },
    });
    check(
      'chiqishdan keyin token ishlamaydi',
      afterLogout.statusCode === 401,
      `kod: ${afterLogout.statusCode}`,
    );

    // ── 11. Bitta sessiyadan chiqish boshqalarini o'chirmaydi ──
    // cookieA — ro'yxatdan o'tishdagi sessiya, u alohida qurilma kabi.
    const otherDevice = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/context',
      cookies: { sid: cookieA },
    });
    check(
      'boshqa qurilma sessiyasi saqlandi',
      otherDevice.statusCode === 200,
      `kod: ${otherDevice.statusCode}`,
    );

    // ── 12. logout-all hammasini bekor qiladi ──
    const logoutAll = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout-all',
      cookies: { sid: cookieA },
    });
    check('logout-all 200', logoutAll.statusCode === 200);

    const afterAll = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/context',
      cookies: { sid: cookieA },
    });
    check(
      'logout-all dan keyin hech qanday sessiya ishlamaydi',
      afterAll.statusCode === 401,
      `kod: ${afterAll.statusCode}`,
    );
  } finally {
    await app.close();
    // Slug bo'yicha o'chirish ishonchsiz edi — slug nomdan hosil bo'ladi
    // va tag'ni har doim ham o'z ichiga olmaydi. Endi biznes egasining
    // email'i orqali topiladi.
    await cleanupTestDataQuietly(`%${tag}@test.local`);
    await closeDb();
  }

  console.log(
    fail === 0
      ? `\nAuth oqimi butun. ${pass}/${pass} tekshiruv o'tdi.\n`
      : `\n${fail} ta tekshiruv MUVAFFAQIYATSIZ.\n`,
  );
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
