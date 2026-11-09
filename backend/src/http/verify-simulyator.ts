import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { LlmClient, LlmJsonRequest } from '../ai/llm.js';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withTenant, withoutTenantIsolation } from '../db/index.js';
import { aiProvider, simulyatorMashq } from '../db/schema/index.js';
import { baholash, javobBer, mashqniBoshla, mashqniTugat, type MatnQator } from '../simulyator/xizmat.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMULYATOR TESTI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:simulyator
 *
 * Haqiqiy LLM chaqirilmaydi — mijoz javobi va baholash soxta klient bilan.
 * Tekshiriladi: tayyor ssenariylar, ssenariy CRUD va ruxsat, AI'siz aniq 503,
 * mashq oqimi, "juda qisqa" qoidasi, AI xatosida menejer gapining qaytarilishi,
 * baholash natijasining chegaralarga qisilishi, statistika va fikr.
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

function soxtaLlm(javob: (req: LlmJsonRequest) => unknown): () => Promise<LlmClient> {
  return () =>
    Promise.resolve({
      completeJson: (req: LlmJsonRequest) =>
        Promise.resolve({ json: javob(req), model: 'mock', tokensIn: 1, tokensOut: 1, costUsd: 0 }),
    });
}

async function main(): Promise<void> {
  console.log('\nSimulyator\n');
  const app: FastifyInstance = await buildApp();
  const tag = Date.now().toString(36);
  try {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email: `sim-${tag}@test.local`, password: 'juda-maxfiy-parol-123', displayName: 'Rahbar', businessName: 'Simulyator Test' },
    });
    const regBody = reg.json() as { user: { id: string }; businesses: { businessId: string }[] };
    const cookies = { sid: reg.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    const businessId = regBody.businesses[0]!.businessId;
    const userId = regBody.user.id;
    const base = `/api/v1/businesses/${businessId}/simulyator`;

    // ═══ 1: ro'yxat va ssenariylar ═══
    const bosh = (await app.inject({ method: 'GET', url: base, cookies })).json() as {
      ssenariylar: { id: string; tayyor: boolean; mijozHaqida?: string }[];
      hafta: { soni: number };
      yarataOladi: boolean;
    };
    check('6 ta tayyor ssenariy bor', bosh.ssenariylar.filter((s) => s.tayyor).length === 6);
    check('rahbar ssenariy yarata oladi va yashirin xulqni ko\'radi', bosh.yarataOladi && bosh.ssenariylar.every((s) => typeof s.mijozHaqida === 'string'));
    check('yangi foydalanuvchida shu hafta 0 ta mashq', bosh.hafta.soni === 0);

    const yaroqsiz = await app.inject({ method: 'POST', url: `${base}/ssenariylar`, cookies, payload: { nom: 'x' } });
    check('to\'liqsiz ssenariy 400', yaroqsiz.statusCode === 400, `kod: ${yaroqsiz.statusCode}`);

    const yarat = await app.inject({
      method: 'POST',
      url: `${base}/ssenariylar`,
      cookies,
      payload: {
        nom: 'Sinov darsiga yozing',
        vaziyat: 'Javohir kurs haqida so\'radi, lekin ikkilanmoqda.',
        maqsad: 'Javohirni sinov darsiga aniq kunga yozish.',
        mijozIsmi: 'Javohir',
        mijozJinsi: 'erkak',
        mijozHaqida: 'Vaqti kam, lekin qiziqqan.',
        etirozlar: ['Vaqtim yo\'q'],
        kayfiyat: 'qattiq',
        davomiylikDaq: 3,
      },
    });
    const ssId = (yarat.json() as { id: string }).id;
    check('ssenariy yaratildi', yarat.statusCode === 200 && typeof ssId === 'string', yarat.body.slice(0, 200));
    const keyin = (await app.inject({ method: 'GET', url: base, cookies })).json() as { ssenariylar: { id: string; muallif: string | null }[] };
    check('o\'z ssenariysi ro\'yxat boshida, muallif bilan', keyin.ssenariylar[0]?.id === ssId && keyin.ssenariylar[0]?.muallif === 'Rahbar');

    const tahrir = await app.inject({
      method: 'PATCH',
      url: `${base}/ssenariylar/${ssId}`,
      cookies,
      payload: { nom: 'Sinov darsiga yozing!', vaziyat: 'Javohir ikkilanmoqda.', maqsad: 'Sinov darsiga yozish.', mijozIsmi: 'Javohir' },
    });
    check('ssenariy tahrirlandi', tahrir.statusCode === 200);

    // ═══ 2: AI yo'q — aniq 503, bazada osilgan mashq qolmaydi ═══
    const faollar = await withoutTenantIsolation('test: faol provayderlarni vaqtincha o\'chirish', async (tx) => {
      const rows = await tx.select({ id: aiProvider.id }).from(aiProvider).where(eq(aiProvider.isActive, true));
      if (rows.length > 0) await tx.update(aiProvider).set({ isActive: false }).where(inArray(aiProvider.id, rows.map((r) => r.id)));
      return rows;
    });
    try {
      const aiSiz = await app.inject({ method: 'POST', url: `${base}/mashqlar`, cookies, payload: { ssenariy: 'tayyor:rozilik' } });
      check('AI\'siz mashq boshlanmaydi — 503', aiSiz.statusCode === 503, `kod: ${aiSiz.statusCode}`);
      const h = (await app.inject({ method: 'GET', url: base, cookies })).json() as { ai: { matn: boolean } };
      check('holatda ai.matn = false', h.ai.matn === false);
    } finally {
      if (faollar.length > 0) {
        await withoutTenantIsolation('test: provayderlarni tiklash', (tx) =>
          tx.update(aiProvider).set({ isActive: true }).where(inArray(aiProvider.id, faollar.map((r) => r.id))),
        );
      }
    }

    // ═══ 3: mashq oqimi (soxta LLM) ═══
    const m = await withTenant(businessId, (tx) => mashqniBoshla(tx, { businessId, userId, kalit: 'tayyor:arzish' }));
    check('mashq mijoz salomi bilan boshlanadi', m.holat === 'jarayonda' && m.matn.length === 1 && m.matn[0]!.kim === 'mijoz');

    let soralgan: LlmJsonRequest | null = null;
    const javob = await javobBer(
      businessId,
      userId,
      m.id,
      'Assalomu alaykum, Dilnoza opa! Men kompaniyadan qo\'ng\'iroq qilyapman.',
      soxtaLlm((req) => {
        soralgan = req;
        return { javob: 'Ha, eshitaman, lekin men arzonroq joy topdim.', tugatish: false };
      }),
    );
    const sorov = soralgan as LlmJsonRequest | null;
    check('mijoz javob berdi', javob.mijoz.kim === 'mijoz' && javob.mijoz.matn.includes('arzonroq'));
    check('promptda ssenariy va biznes konteksti, matnda menejer gapi', !!sorov && sorov.system.includes('Dilnoza') && sorov.user.includes('Sotuvchi'));

    // AI yiqilsa — menejer gapi qaytarib olinadi
    let yiqildi = false;
    try {
      await javobBer(businessId, userId, m.id, 'Bu gap saqlanmasligi kerak', () => Promise.reject(new Error('tarmoq')));
    } catch {
      yiqildi = true;
    }
    const keyinXato = await withTenant(businessId, (tx) => tx.select({ matn: simulyatorMashq.matn }).from(simulyatorMashq).where(eq(simulyatorMashq.id, m.id)));
    const qatorlar = keyinXato[0]!.matn as MatnQator[];
    check('AI xatosida menejer gapi matndan olib tashlanadi', yiqildi && qatorlar.length === 3 && !qatorlar.some((q) => q.matn.includes('saqlanmasligi')), `${qatorlar.length} qator`);

    // Juda qisqa — baholanmaydi
    const qisqa = await withTenant(businessId, (tx) => mashqniTugat(tx, { userId, id: m.id, bekor: false }));
    check('30 soniyadan qisqa mashq "qisqa", baholanmaydi', qisqa.mashq.natijaHolat === 'qisqa' && !qisqa.baholash);

    // Uzunroq mashq — vaqtni orqaga suramiz
    const m2 = await withTenant(businessId, (tx) => mashqniBoshla(tx, { businessId, userId, kalit: ssId }));
    await withTenant(businessId, (tx) =>
      tx.update(simulyatorMashq).set({ boshlangan: new Date(Date.now() - 95_000) }).where(eq(simulyatorMashq.id, m2.id)),
    );
    const oddiy = soxtaLlm(() => ({ javob: 'Hmm, vaqtim kam.', tugatish: false }));
    await javobBer(businessId, userId, m2.id, 'Salom, Javohir! Sinov darsi haqida gaplashsak.', oddiy);
    await javobBer(businessId, userId, m2.id, 'Seshanba 18:00 yoki chorshanba 10:00 — qaysi qulay?', oddiy);
    const t2 = await withTenant(businessId, (tx) => mashqniTugat(tx, { userId, id: m2.id, bekor: false }));
    check('uzun mashq baholashga yuboriladi', t2.baholash && t2.mashq.natijaHolat === 'kutilmoqda' && t2.mashq.davomiylikSek >= 90);

    const takror = await javobBer(businessId, userId, m2.id, 'yana', oddiy).then(
      () => false,
      () => true,
    );
    check('tugagan mashqqa javob yozib bo\'lmaydi', takror);

    await baholash(
      businessId,
      userId,
      m2.id,
      soxtaLlm(() => ({
        maqsadgaErishildi: true,
        boshXulosa: 'Ikki aniq variant bilan kun kelishildi.',
        izoh: 'Yaxshi yakun.',
        keyingiSafar: { maslahat: 'Ehtiyojni avval so\'rang.', sek: -1 },
        namunaGap: 'Sizga qaysi vaqt qulay?',
        umumiyBall: 140,
        baholar: [{ nom: 'Yakunlash', ball: 15, izoh: 'Aniq' }],
      })),
    );
    const natija = (await app.inject({ method: 'GET', url: `${base}/mashqlar/${m2.id}`, cookies })).json() as {
      natijaHolat: string;
      natija: { umumiyBall: number; baholar: { ball: number }[]; keyingiSafar: { sek: number | null } } | null;
    };
    check('baholash tayyor', natija.natijaHolat === 'tayyor' && !!natija.natija, natija.natijaHolat);
    check('ballar chegaraga qisildi (140→100, 15→10), sek -1 → null', natija.natija?.umumiyBall === 100 && natija.natija?.baholar[0]?.ball === 10 && natija.natija?.keyingiSafar.sek === null);

    const fikr = await app.inject({ method: 'POST', url: `${base}/mashqlar/${m2.id}/fikr`, cookies, payload: { fikr: 'qisman' } });
    check('fikr saqlandi', fikr.statusCode === 200);

    const stat = (await app.inject({ method: 'GET', url: base, cookies })).json() as {
      hafta: { soni: number; sek: number };
      songgi: { id: string; maqsadgaErishildi: boolean | null }[];
    };
    check('shu hafta: 2 ta tugagan mashq', stat.hafta.soni === 2 && stat.hafta.sek >= 90, JSON.stringify(stat.hafta));
    check('so\'nggi mashqlarda natija belgisi', stat.songgi[0]?.id === m2.id && stat.songgi[0]?.maqsadgaErishildi === true);

    const begona = await app.inject({ method: 'GET', url: `${base}/mashqlar/00000000-0000-0000-0000-000000000000`, cookies });
    check('yo\'q mashq 404', begona.statusCode === 404);

    const ochir = await app.inject({ method: 'DELETE', url: `${base}/ssenariylar/${ssId}`, cookies });
    check('ssenariy o\'chirildi; tarixdagi mashq saqlanib qoldi', ochir.statusCode === 200 && (await app.inject({ method: 'GET', url: `${base}/mashqlar/${m2.id}`, cookies })).statusCode === 200);

    const noAuth = await app.inject({ method: 'GET', url: base });
    check('autentifikatsiyasiz 401', noAuth.statusCode === 401);
  } finally {
    await app.close();
    await cleanupTestDataQuietly(`%${tag}@test.local`);
  }

  await closeDb();
  console.log(`\n${fail === 0 ? 'Simulyator butun.' : 'XATOLAR BOR.'} ${pass}/${pass + fail} tekshiruv o'tdi.`);
  if (fail > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
