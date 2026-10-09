import { eq, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { appUser, seat } from '../db/schema/index.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MENEJER AKTIVATSIYASI TESTI — FR-04
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:activation
 *
 * Aktivatsiya havolasi — begona odamga hisob ochib beradigan eshik. Shu
 * sababli "ishlaydimi"dan tashqari "suiiste'mol qilib bo'ladimi" ham:
 *
 *   • token bazada ochiq saqlanmaydi, muddati bor
 *   • token bir martalik, yangisi eskisini bekor qiladi
 *   • muddati o'tgan / o'chirilgan o'rin uchun ishlamaydi
 *   • begona biznes rahbari havola yarata olmaydi
 *   • band login bilan hisob ochilmaydi
 *   • aktivatsiyadan keyin menejer LOGIN bilan kira oladi va faqat o'z biznesini ko'radi
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
const PAROL = 'juda-maxfiy-parol-123';
const MENEJER_PAROL = 'menejer-kuchli-parol-456';

async function main(): Promise<void> {
  const app: FastifyInstance = await buildApp();
  console.log('\nMenejer aktivatsiyasi (FR-04)\n');

  const ega = async (nom: string) => {
    const r = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: `${nom}-${tag}@test.local`, password: PAROL, displayName: 'Egasi', businessName: `Aktivatsiya ${nom}` },
    });
    return {
      businessId: (r.json() as { businesses: { businessId: string }[] }).businesses[0]!.businessId,
      cookies: { sid: r.cookies.find((c) => c.name === 'sid')?.value ?? '' },
    };
  };
  const orin = async (b: { businessId: string; cookies: Record<string, string> }, displayName: string, login?: string) => {
    const r = await app.inject({
      method: 'POST',
      url: `/api/v1/businesses/${b.businessId}/seats`,
      cookies: b.cookies,
      payload: { displayName, ...(login ? { login } : {}) },
    });
    return (r.json() as { id: string }).id;
  };
  const havola = async (b: { businessId: string; cookies: Record<string, string> }, seatId: string) =>
    app.inject({ method: 'POST', url: `/api/v1/businesses/${b.businessId}/seats/${seatId}/activation-link`, cookies: b.cookies });
  const faollashtir = (payload: Record<string, unknown>) => app.inject({ method: 'POST', url: '/api/v1/auth/activate', payload });

  try {
    const A = await ega('a');
    const B = await ega('b');

    // ═══ HAVOLA YARATISH ═══
    console.log('— havola yaratish —');
    const login = `aziz-${tag}`;
    const seatId = await orin(A, 'Aziz Karimov', login);
    const h1 = await havola(A, seatId);
    check('rahbar havola yaratadi', h1.statusCode === 200, `kod: ${h1.statusCode}`);
    const t1 = (h1.json() as { activationToken: string; expiresAt: string }).activationToken;
    const muddat = new Date((h1.json() as { expiresAt: string }).expiresAt).getTime() - Date.now();
    check('muddat ~7 kun', muddat > 6.9 * 864e5 && muddat <= 7 * 864e5, `${Math.round(muddat / 36e5)} soat`);

    const [saqlangan] = await withoutTenantIsolation('test: token saqlanishi', (tx) =>
      tx.select({ token: seat.activationToken, exp: seat.activationExpiresAt }).from(seat).where(eq(seat.id, seatId)),
    );
    check('bazada token OCHIQ saqlanmaydi', !!saqlangan?.token && saqlangan.token !== t1 && saqlangan.token.length === 64);
    check('bazada muddat yozilgan', !!saqlangan?.exp);

    const begona = await havola(B, seatId);
    check('begona biznes rahbari havola yarata olmaydi', begona.statusCode === 404 || begona.statusCode === 403, `kod: ${begona.statusCode}`);

    // ═══ MA'LUMOT SAHIFASI ═══
    console.log('\n— ma\'lumot —');
    const info = await app.inject({ method: 'POST', url: '/api/v1/auth/activate/info', payload: { token: t1 } });
    const ij = info.json() as { displayName: string; businessName: string; login: string | null };
    check('info: ism, biznes va login qaytadi', info.statusCode === 200 && ij.displayName === 'Aziz Karimov' && ij.businessName === 'Aktivatsiya a' && ij.login === login);
    const yomon = await app.inject({ method: 'POST', url: '/api/v1/auth/activate/info', payload: { token: 'x'.repeat(43) } });
    check("noto'g'ri token — 400", yomon.statusCode === 400);

    // ═══ YANGI HAVOLA ESKISINI BEKOR QILADI ═══
    console.log('\n— token bir martalik —');
    const t2 = ((await havola(A, seatId)).json() as { activationToken: string }).activationToken;
    const eskisi = await faollashtir({ token: t1, password: MENEJER_PAROL });
    check('yangi havola eskisini bekor qiladi', eskisi.statusCode === 400, `kod: ${eskisi.statusCode}`);

    const qisqa = await faollashtir({ token: t2, password: '123' });
    check('qisqa parol rad etiladi (422)', qisqa.statusCode === 422, `kod: ${qisqa.statusCode}`);

    const ok = await faollashtir({ token: t2, password: MENEJER_PAROL });
    check('aktivatsiya muvaffaqiyatli', ok.statusCode === 200, `kod: ${ok.statusCode} ${ok.body.slice(0, 120)}`);
    check('aktivatsiya sessiya beradi', (ok.cookies.find((c) => c.name === 'sid')?.value ?? '').length > 20);
    const ctx = ok.json() as { businesses: { businessId: string; seatId: string | null }[] };
    check(
      'menejer faqat o\'z biznesini ko\'radi',
      ctx.businesses.length === 1 && ctx.businesses[0]!.businessId === A.businessId && ctx.businesses[0]!.seatId === seatId,
      JSON.stringify(ctx.businesses),
    );

    const ikkinchi = await faollashtir({ token: t2, password: MENEJER_PAROL });
    check('token ikkinchi marta ishlamaydi', ikkinchi.statusCode === 400);

    const [o] = await withoutTenantIsolation('test: o\'rin holati', (tx) =>
      tx.select({ a: seat.activation, t: seat.activationToken, u: seat.userId }).from(seat).where(eq(seat.id, seatId)),
    );
    check("o'rin faol, token tozalangan, hisob biriktirilgan", o?.a === 'active' && o.t === null && !!o.u);

    // ═══ LOGIN BILAN KIRISH ═══
    console.log('\n— login bilan kirish —');
    const kir = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: login.toUpperCase(), password: MENEJER_PAROL } });
    check('menejer login (katta-kichik harfga qaramay) bilan kiradi', kir.statusCode === 200, `kod: ${kir.statusCode}`);
    const notogri = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: login, password: 'boshqa-parol-789' } });
    check("noto'g'ri parol — 401", notogri.statusCode === 401);
    const emailKir = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: { email: `a-${tag}@test.local`, password: PAROL } });
    check('email bilan kirish avvalgidek ishlaydi', emailKir.statusCode === 200);

    // ═══ LOGINSIZ O'RIN — MENEJER O'ZI TANLAYDI ═══
    console.log('\n— login tanlash —');
    const s2 = await orin(A, 'Nodira Aliyeva');
    const t3 = ((await havola(A, s2)).json() as { activationToken: string }).activationToken;
    const loginsiz = await faollashtir({ token: t3, password: MENEJER_PAROL });
    check('login berilmagan bo\'lsa — so\'raladi (400)', loginsiz.statusCode === 400);
    const band = await faollashtir({ token: t3, password: MENEJER_PAROL, login });
    check('band login — 409', band.statusCode === 409, `kod: ${band.statusCode}`);
    const tanladi = await faollashtir({ token: t3, password: MENEJER_PAROL, login: `nodira-${tag}` });
    check('o\'zi tanlagan login bilan faollashadi', tanladi.statusCode === 200, `kod: ${tanladi.statusCode} ${tanladi.body.slice(0, 120)}`);

    // ═══ MUDDAT VA O'CHIRILGAN O'RIN ═══
    console.log('\n— muddat va o\'chirilgan o\'rin —');
    const s3 = await orin(A, 'Muddati Otgan', `eski-${tag}`);
    const t4 = ((await havola(A, s3)).json() as { activationToken: string }).activationToken;
    await withoutTenantIsolation('test: muddatni o\'tkazish', (tx) =>
      tx.update(seat).set({ activationExpiresAt: new Date(Date.now() - 1000) }).where(eq(seat.id, s3)),
    );
    const eskirgan = await faollashtir({ token: t4, password: MENEJER_PAROL });
    check('muddati o\'tgan havola ishlamaydi', eskirgan.statusCode === 400 && eskirgan.body.includes('muddati'));

    const s4 = await orin(A, 'Ochirilgan Orin', `ochiq-${tag}`);
    const t5 = ((await havola(A, s4)).json() as { activationToken: string }).activationToken;
    await app.inject({ method: 'PATCH', url: `/api/v1/businesses/${A.businessId}/seats/${s4}`, cookies: A.cookies, payload: { isActive: false } });
    const ochirilgan = await faollashtir({ token: t5, password: MENEJER_PAROL });
    check("o'chirilgan o'rin uchun ishlamaydi", ochirilgan.statusCode === 400);
  } finally {
    await app.close();
    await withoutTenantIsolation('test: login bilan yaratilgan hisoblarni tozalash', (tx) =>
      tx.delete(appUser).where(like(appUser.login, `%-${tag}`)),
    );
    await cleanupTestDataQuietly(`%${tag}@test.local`);
    await closeDb();
  }

  console.log(`\n${pass} o'tdi, ${fail} yiqildi`);
  if (fail > 0) process.exit(1);
  console.log('Aktivatsiya butun.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
