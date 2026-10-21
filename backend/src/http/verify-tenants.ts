import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { isAnalysisBlocked } from '../billing/engine.js';
import { keshniTozala } from '../auth/context-cache.js';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { buildApp } from './app.js';
import { ROOT_DOMAIN } from './tenant.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAAS TESTI — bitta tugma bilan kabinet va subdomen izolyatsiyasi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:tenants
 *
 * Subdomenlar `Host` sarlavhasi bilan taqlid qilinadi (brauzer ham aynan
 * shuni yuboradi). Tekshiriladi: faqat super admin yaratadi; subdomen
 * qoidalari; yaratish + admin bergan parol bilan kirish; izolyatsiya (boshqa
 * kabinet ko'rinmaydi, begona biznes 404); subdomenda faqat o'z xodimi
 * kira oladi; subdomenni almashtirish; parolni faqat admin almashtiradi;
 * TLS tekshiruvi.
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
const host = (slug: string | null) => ({ host: slug ? `${slug}.${ROOT_DOMAIN}` : ROOT_DOMAIN });

interface Ctx {
  businesses: { businessId: string; slug: string }[];
}

async function main(): Promise<void> {
  const app: FastifyInstance = await buildApp();
  console.log('\nSaaS: kabinetlar va subdomen izolyatsiyasi\n');

  const saEmail = `sa-${tag}@test.local`;
  const egaEmail = `ega-${tag}@test.local`;
  const slugA = `va-${tag}`;
  const slugB = `vb-${tag}`;
  const slugB2 = `vc-${tag}`;

  try {
    // ── Tayyorgarlik: oddiy ega va super admin ──
    const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', headers: host(null), payload: { email: saEmail, password: PAROL, displayName: 'Super', businessName: `SA ${tag}` } });
    const saSid = { sid: reg.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    // Hozircha oddiy foydalanuvchi — ruxsat tekshiruvi uchun
    const oddiy = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants', headers: host(null), cookies: saSid });
    check('super admin bo\'lmagan — mijozlar paneli 404', oddiy.statusCode === 404, String(oddiy.statusCode));
    await withoutTenantIsolation('test: super admin', (tx) => tx.execute(sql`update app_user set system_role = 'super_admin' where email = ${saEmail}`));
    keshniTozala(); // bazani to'g'ridan-to'g'ri o'zgartirdik — keshlangan kontekst eskirgan
    const anon = await app.inject({ method: 'GET', url: '/api/v1/admin/tenants', headers: host(null) });
    check('anonim — 401', anon.statusCode === 401);

    // ═══ A: SUBDOMEN QOIDALARI ═══
    console.log('\n— A: subdomen qoidalari —');
    const tekshir = async (slug: string) =>
      (await app.inject({ method: 'GET', url: `/api/v1/admin/tenants/slug-check?slug=${encodeURIComponent(slug)}`, headers: host(null), cookies: saSid })).json() as { ok: boolean; sabab?: string; url?: string };
    check('format: juda qisqa / katta harf / chiziqcha chetda', (await tekshir('ab')).sabab === 'format' && (await tekshir('-acme')).sabab === 'format' && (await tekshir('a--b')).sabab === 'format');
    check('zaxira: admin, www, api', (await tekshir('admin')).sabab === 'zaxira' && (await tekshir('www')).sabab === 'zaxira' && (await tekshir('api')).sabab === 'zaxira');
    const bosh = await tekshir(slugA);
    check('bo\'sh subdomen — ok va manzil', bosh.ok && bosh.url === `http://${slugA}.${ROOT_DOMAIN}${new URL(process.env.WEB_ORIGIN ?? 'http://localhost:5173').port ? `:${new URL(process.env.WEB_ORIGIN ?? 'http://localhost:5173').port}` : ''}`, JSON.stringify(bosh));

    // ═══ B: BITTA TUGMA ═══
    console.log('\n— B: kabinet yaratish —');
    const qisqa = await app.inject({ method: 'POST', url: '/api/v1/admin/tenants', headers: host(null), cookies: saSid, payload: { name: `Acme ${tag}`, slug: slugA, ownerEmail: egaEmail, ownerName: 'Ega Egayev', ownerPassword: 'qisqa' } });
    check('qisqa parol bilan yaratib bo\'lmaydi — 422', qisqa.statusCode === 422, String(qisqa.statusCode));
    const yarat = await app.inject({ method: 'POST', url: '/api/v1/admin/tenants', headers: host(null), cookies: saSid, payload: { name: `Acme ${tag}`, slug: slugA, ownerEmail: egaEmail, ownerName: 'Ega Egayev', ownerPassword: PAROL, locale: 'ru' } });
    const yJson = yarat.json() as { tenant: { id: string; slug: string; url: string; subscriptionStatus: string; ownerEmail: string; ownerActivated: boolean }; parolBerildi: boolean; ownerExisted: boolean; taklif?: unknown };
    check('201 — kabinet yaratildi', yarat.statusCode === 201, yarat.body);
    check('trial obuna va ega bog\'landi', yJson.tenant?.subscriptionStatus === 'trial' && yJson.tenant?.ownerEmail === egaEmail && !yJson.ownerExisted);
    check('parolni admin berdi, taklif havolasi yo\'q', yJson.parolBerildi && yJson.tenant.ownerActivated && yJson.taklif === undefined);
    check('javobda parol yoki xesh yo\'q', !yarat.body.includes(PAROL) && !yarat.body.includes('argon2'));
    const takror = await app.inject({ method: 'POST', url: '/api/v1/admin/tenants', headers: host(null), cookies: saSid, payload: { name: 'Takror', slug: slugA, ownerEmail: `x-${tag}@test.local`, ownerName: 'Xxx', ownerPassword: PAROL } });
    check('band subdomen — 409', takror.statusCode === 409);
    const zaxira = await app.inject({ method: 'POST', url: '/api/v1/admin/tenants', headers: host(null), cookies: saSid, payload: { name: 'Zaxira', slug: 'admin', ownerEmail: `x-${tag}@test.local`, ownerName: 'Xxx', ownerPassword: PAROL } });
    check('zaxira subdomen — 400', zaxira.statusCode === 400);

    const pub = (await app.inject({ method: 'GET', url: '/api/v1/public/tenant', headers: host(slugA) })).json() as { tur: string; name: string; locale: string };
    check('ochiq: kabinet nomi va tili', pub.tur === 'tenant' && pub.name === `Acme ${tag}` && pub.locale === 'ru', JSON.stringify(pub));
    const yoq = (await app.inject({ method: 'GET', url: '/api/v1/public/tenant', headers: host(`yoq-${tag}`) })).json() as { tur: string };
    check('ochiq: mavjud bo\'lmagan kabinet — topilmadi', yoq.tur === 'topilmadi');

    // ═══ C: ADMIN BERGAN PAROL BILAN KIRISH ═══
    console.log('\n— C: kirish —');
    const kirish = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: host(slugA), payload: { email: egaEmail, password: PAROL } });
    const egaSid = { sid: kirish.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    check('ega admin bergan parol bilan kirdi', kirish.statusCode === 200 && !!egaSid.sid, kirish.body);
    const egaA = (await app.inject({ method: 'GET', url: '/api/v1/auth/context', headers: host(slugA), cookies: egaSid })).json() as Ctx;
    check('kabinetda faqat o\'z biznesi', egaA.businesses.length === 1 && egaA.businesses[0]!.slug === slugA);
    const ozi = await app.inject({ method: 'POST', url: '/api/v1/auth/password-reset/request', headers: host(slugA), payload: { emailOrLogin: egaEmail } });
    check('kabinetda parolni o\'zi tiklay olmaydi — 403', ozi.statusCode === 403, String(ozi.statusCode));

    // ═══ D: IZOLYATSIYA ═══
    console.log('\n— D: izolyatsiya —');
    const yaratB = await app.inject({ method: 'POST', url: '/api/v1/admin/tenants', headers: host(null), cookies: saSid, payload: { name: `Beta ${tag}`, slug: slugB, ownerEmail: egaEmail, ownerName: 'Ega Egayev', ownerPassword: 'boshqa-parol-98765' } });
    const bJson = yaratB.json() as { tenant: { id: string }; parolBerildi: boolean; ownerExisted: boolean };
    check('mavjud egaga ikkinchi kabinet — eski paroli o\'zgarmaydi', yaratB.statusCode === 201 && bJson.ownerExisted && !bJson.parolBerildi, yaratB.body);
    const idA = egaA.businesses[0]!.businessId;
    const idB = bJson.tenant.id;

    const ctx = async (slug: string | null) => (await app.inject({ method: 'GET', url: '/api/v1/auth/context', headers: host(slug), cookies: egaSid })).json() as Ctx;
    const [cA, cB, cRoot] = [await ctx(slugA), await ctx(slugB), await ctx(null)];
    check('A kabinetida — faqat A', cA.businesses.length === 1 && cA.businesses[0]!.businessId === idA);
    check('B kabinetida — faqat B', cB.businesses.length === 1 && cB.businesses[0]!.businessId === idB);
    check('asosiy domenda — ikkalasi', cRoot.businesses.length === 2);
    const begona = await app.inject({ method: 'GET', url: `/api/v1/businesses/${idB}`, headers: host(slugA), cookies: egaSid });
    const oziniki = await app.inject({ method: 'GET', url: `/api/v1/businesses/${idA}`, headers: host(slugA), cookies: egaSid });
    check('A kabinetidan B biznesi — 404 (a\'zo bo\'lsa ham)', begona.statusCode === 404, String(begona.statusCode));
    check('A kabinetidan A biznesi — 200', oziniki.statusCode === 200, String(oziniki.statusCode));

    // ═══ E: KIRISH CHEKLOVI ═══
    console.log('\n— E: kirish —');
    const login = (slug: string | null, email: string) => app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: host(slug), payload: { email, password: PAROL } });
    const begonaLogin = await login(slugA, saEmail);
    check('A kabinetiga begona (super admin) kira olmaydi — 401, sessiya yo\'q', begonaLogin.statusCode === 401 && !begonaLogin.cookies.some((c) => c.name === 'sid' && c.value));
    check('xato matni parol xatosi bilan bir xil', (begonaLogin.json() as { title?: string }).title === ((await login(slugA, `yoq-${tag}@test.local`)).json() as { title?: string }).title);
    const egaLogin = await login(slugA, egaEmail);
    check('A kabinetiga ega kiradi — javobda faqat A', egaLogin.statusCode === 200 && (egaLogin.json() as Ctx).businesses.length === 1);
    check('asosiy domenga istalgan foydalanuvchi kiradi', (await login(null, saEmail)).statusCode === 200);
    check('noma\'lum subdomenga kirib bo\'lmaydi', (await login(`yoq-${tag}`, egaEmail)).statusCode === 401);

    // ═══ F: SUBDOMEN BIR MARTA, TAHRIRLASH, TAKLIF, TLS ═══
    console.log('\n— F: boshqaruv —');
    const tahrirB = (payload: Record<string, unknown>, cookies = saSid) =>
      app.inject({ method: 'PATCH', url: `/api/v1/admin/tenants/${idB}`, headers: host(null), cookies, payload });
    const qulf = await tahrirB({ slug: slugB2 });
    check('yaroqli subdomen yaratilgandan keyin o\'zgarmaydi — 409', qulf.statusCode === 409, `${qulf.statusCode} ${qulf.body}`);
    // Eski, subdomenga yaroqsiz slug'li kabinet — BIR MARTA tuzatiladi
    await withoutTenantIsolation('test: eski yaroqsiz slug', (tx) => tx.execute(sql`update business set slug = ${`Eski_${tag}`} where id = ${idB}`));
    const bandga = await tahrirB({ slug: slugA });
    check('yaroqsizni band subdomenga tuzatib bo\'lmaydi — 409', bandga.statusCode === 409);
    const tuzat = await tahrirB({ slug: slugB2 });
    check('yaroqsiz subdomen bir marta tuzatildi', tuzat.statusCode === 200 && (tuzat.json() as { tenant: { slug: string } }).tenant.slug === slugB2, tuzat.body);
    const yangi = (await app.inject({ method: 'GET', url: '/api/v1/public/tenant', headers: host(slugB2) })).json() as { tur: string };
    const yangiCtx = await ctx(slugB2);
    check('tuzatilgan subdomen darhol ishlaydi (kesh tozalandi)', yangi.tur === 'tenant' && yangiCtx.businesses.length === 1 && yangiCtx.businesses[0]!.businessId === idB);
    check('tuzatilgandan keyin yana o\'zgartirib bo\'lmaydi — 409', (await tahrirB({ slug: `vd-${tag}` })).statusCode === 409);

    // Kabinet va ega ma'lumotlari — bitta so'rovda
    const tahrir = await tahrirB({ name: `Beta Yangi ${tag}`, locale: 'en', ownerName: 'Yangi Ega' });
    const tJson = tahrir.json() as { tenant: { name: string; locale: string; ownerName: string } };
    check('nom, til va ega ismi tahrirlandi', tahrir.statusCode === 200 && tJson.tenant.name === `Beta Yangi ${tag}` && tJson.tenant.locale === 'en' && tJson.tenant.ownerName === 'Yangi Ega', tahrir.body);
    check('bo\'sh tahrir — 422', (await tahrirB({})).statusCode === 422);

    const inv = await app.inject({ method: 'POST', url: `/api/v1/admin/tenants/${idA}/invite`, headers: host(null), cookies: saSid });
    check('taklif havolasi endpointi yo\'q — 404', inv.statusCode === 404, String(inv.statusCode));
    // ── Kirish ma'lumotlari: faqat admin ──
    const YANGI_PAROL = 'admin-bergan-yangi-456';
    const tahrirA = (payload: Record<string, unknown>, cookies = saSid) =>
      app.inject({ method: 'PATCH', url: `/api/v1/admin/tenants/${idA}`, headers: host(null), cookies, payload });
    const egaParol = await tahrirA({ ownerPassword: YANGI_PAROL }, egaSid);
    check('ega o\'zi kabinetni/kirish ma\'lumotlarini tahrirlay olmaydi — 404', egaParol.statusCode === 404, String(egaParol.statusCode));
    const bandEmail = await tahrirA({ ownerEmail: saEmail });
    check('boshqa hisobning emailiga almashtirib bo\'lmaydi — 409', bandEmail.statusCode === 409, String(bandEmail.statusCode));

    // Faqat email: sessiya tirik qoladi, kirish yangi email bilan
    const yangiEgaEmail = `ega-tuzatildi-${tag}@test.local`;
    const email = await tahrirA({ ownerEmail: yangiEgaEmail.toUpperCase() });
    check('admin ega emailini tuzatdi (kichik harfga keltiriladi)', email.statusCode === 200 && (email.json() as { tenant: { ownerEmail: string } }).tenant.ownerEmail === yangiEgaEmail, email.body);
    const haliTirik = await app.inject({ method: 'GET', url: '/api/v1/auth/context', headers: host(slugA), cookies: egaSid });
    check('faqat email almashganda sessiya tirik qoladi', haliTirik.statusCode === 200, String(haliTirik.statusCode));
    check('eski email bilan kirib bo\'lmaydi, yangisi bilan kiradi', (await login(slugA, egaEmail)).statusCode === 401 && (await login(slugA, yangiEgaEmail)).statusCode === 200);

    // Parol: sessiyalar bekor bo'ladi
    const parol = await tahrirA({ ownerPassword: YANGI_PAROL });
    check('admin egaga yangi parol berdi', parol.statusCode === 200, parol.body);
    const eskiSessiya = await app.inject({ method: 'GET', url: '/api/v1/auth/context', headers: host(slugA), cookies: egaSid });
    check('parol almashganda eganing eski sessiyasi bekor qilindi', eskiSessiya.statusCode === 401, String(eskiSessiya.statusCode));
    const yangiKirish = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: host(slugA), payload: { email: yangiEgaEmail, password: YANGI_PAROL } });
    const egaSid2 = { sid: yangiKirish.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    check('eski parol ishlamaydi, yangisi ishlaydi', (await login(slugA, yangiEgaEmail)).statusCode === 401 && yangiKirish.statusCode === 200);
    const royxat = (await app.inject({ method: 'GET', url: '/api/v1/admin/tenants', headers: host(null), cookies: saSid })).json() as { items: { slug: string }[] };
    check('ro\'yxatda ikkala kabinet', royxat.items.some((i) => i.slug === slugA) && royxat.items.some((i) => i.slug === slugB2));

    // ═══ H: FAOLSIZLANTIRISH ═══
    console.log('\n— H: faolsizlantirish —');
    const holat = (bizId: string, faol: boolean) =>
      app.inject({ method: 'POST', url: `/api/v1/admin/tenants/${bizId}/status`, headers: host(null), cookies: saSid, payload: { faol } });
    const saBiznes = (reg.json() as { businesses: { businessId: string }[] }).businesses[0]!.businessId;
    check('admin o\'z kabinetini faolsizlantira olmaydi — 409', (await holat(saBiznes, false)).statusCode === 409);
    const toxtat = await holat(idA, false);
    check('kabinet faolsizlantirildi', toxtat.statusCode === 200 && !!(toxtat.json() as { tenant: { suspendedAt: string | null } }).tenant.suspendedAt, toxtat.body);
    const faolsizPub = (await app.inject({ method: 'GET', url: '/api/v1/public/tenant', headers: host(slugA) })).json() as { tur: string; name?: string };
    check('subdomen "faolsiz" holatini ko\'rsatadi', faolsizPub.tur === 'faolsiz' && !!faolsizPub.name, JSON.stringify(faolsizPub));
    const ichkari = await app.inject({ method: 'GET', url: `/api/v1/businesses/${idA}`, headers: host(slugA), cookies: egaSid2 });
    check('ochiq sessiya bilan ham faolsiz kabinet ma\'lumotiga kirib bo\'lmaydi', ichkari.statusCode === 404, String(ichkari.statusCode));
    const rootCtx = (await app.inject({ method: 'GET', url: '/api/v1/auth/context', headers: host(null), cookies: egaSid2 })).json() as Ctx;
    check('asosiy domenda faqat faol kabinet (B) qoladi', rootCtx.businesses.length === 1 && rootCtx.businesses[0]!.businessId === idB);
    // Alohida IP — login limitini (G bo'limi) iste'mol qilmasin
    const faolsizKirish = await app.inject({ method: 'POST', url: '/api/v1/auth/login', headers: host(slugA), remoteAddress: '10.9.8.7', payload: { email: yangiEgaEmail, password: YANGI_PAROL } });
    check('faolsiz kabinetga kirish — 403 va aniq sabab', faolsizKirish.statusCode === 403 && faolsizKirish.body.includes('to\'xtatilgan'), `${faolsizKirish.statusCode} ${faolsizKirish.body}`);
    check('faolsiz kabinetda yangi tahlil to\'xtaydi', await isAnalysisBlocked(idA));
    const qayta = await holat(idA, true);
    check('qayta faollashtirildi — subdomen, kirish va tahlil tiklandi', qayta.statusCode === 200 && ((await app.inject({ method: 'GET', url: '/api/v1/public/tenant', headers: host(slugA) })).json() as { tur: string }).tur === 'tenant' && (await app.inject({ method: 'GET', url: `/api/v1/businesses/${idA}`, headers: host(slugA), cookies: egaSid2 })).statusCode === 200 && !(await isAnalysisBlocked(idA)));

    // ═══ I: O'CHIRISH ═══
    console.log('\n— I: o\'chirish —');
    const ochir = (bizId: string, tasdiq: string) =>
      app.inject({ method: 'DELETE', url: `/api/v1/admin/tenants/${bizId}?tasdiq=${encodeURIComponent(tasdiq)}`, headers: host(null), cookies: saSid });
    check('noto\'g\'ri tasdiq bilan o\'chirib bo\'lmaydi — 400', (await ochir(idB, 'boshqa nom')).statusCode === 400);
    check('admin o\'z kabinetini o\'chira olmaydi — 409', (await ochir(saBiznes, `SA ${tag}`)).statusCode === 409);
    const ochdi = await ochir(idB, `Beta Yangi ${tag}`);
    check('kabinet o\'chirildi', ochdi.statusCode === 200, ochdi.body);
    const keyinRoyxat = (await app.inject({ method: 'GET', url: '/api/v1/admin/tenants', headers: host(null), cookies: saSid })).json() as { items: { id: string }[] };
    const ochganPub = (await app.inject({ method: 'GET', url: '/api/v1/public/tenant', headers: host(slugB2) })).json() as { tur: string };
    const ochganBand = (await app.inject({ method: 'GET', url: `/api/v1/admin/tenants/slug-check?slug=${slugB2}`, headers: host(null), cookies: saSid })).json() as { sabab?: string };
    check('o\'chirilgan: ro\'yxatda yo\'q, subdomen topilmaydi, lekin boshqaga berilmaydi', !keyinRoyxat.items.some((i) => i.id === idB) && ochganPub.tur === 'topilmadi' && ochganBand.sabab === 'band');
    check('o\'chirilgan kabinetni qayta o\'chirish/tahrirlash — 404', (await ochir(idB, `Beta Yangi ${tag}`)).statusCode === 404 && (await tahrirB({ name: 'X Y' })).statusCode === 404);
    const tls = async (d: string) => (await app.inject({ method: 'GET', url: `/api/v1/public/tls-check?domain=${d}`, headers: host(null) })).statusCode;
    check('TLS: asosiy domen va kabinet — 200', (await tls(ROOT_DOMAIN)) === 200 && (await tls(`${slugA}.${ROOT_DOMAIN}`)) === 200);
    check('TLS: noma\'lum, zaxira va begona domen — 404', (await tls(`yoq-${tag}.${ROOT_DOMAIN}`)) === 404 && (await tls(`admin.${ROOT_DOMAIN}`)) === 404 && (await tls('evil.example')) === 404);

    // ═══ G: KO'P XATO URINISH ═══ (eng oxirida — login limitini to'ldiradi)
    console.log('\n— G: rate limit —');
    let oxirgi = await login(slugA, `yoq-${tag}@test.local`);
    for (let i = 0; i < 15 && oxirgi.statusCode === 401; i++) oxirgi = await login(slugA, `yoq-${tag}@test.local`);
    const limitJson = oxirgi.json() as { status?: number; title?: string };
    check('ko\'p xato urinishdan keyin 429 (500 emas)', oxirgi.statusCode === 429 && limitJson.status === 429, `${oxirgi.statusCode} ${oxirgi.body}`);
    check('429 javobida Retry-After va tushunarli matn', Number(oxirgi.headers['retry-after']) > 0 && !!limitJson.title && !limitJson.title.includes('Serverda'), JSON.stringify(oxirgi.headers['retry-after']));
  } finally {
    await app.close();
    await cleanupTestDataQuietly(`%-${tag}@test.local`);
    await closeDb();
  }

  console.log(`\n${pass} o'tdi, ${fail} yiqildi`);
  if (fail > 0) process.exit(1);
  console.log('SaaS butun.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
