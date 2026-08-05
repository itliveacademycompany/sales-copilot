import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { appUser, seat, task } from '../db/schema/index.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * API TESTI — biznes profili, playbook, seats, members
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:api
 *
 * Diqqat markazida ikki narsa:
 *   1. Playbook versiyalash to'g'ri ishlashi (eski versiya o'zgarmaydi)
 *   2. Ruxsatlar **serverda** majburlanishi — sotuvchi rahbar amallarini
 *      bajara olmasligi va begona tenant ko'rinmasligi
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

/** Vaznlari 100% ga teng, to'g'ri tuzilgan playbook. */
function validPlaybook() {
  return {
    criteria: {
      categories: [
        { code: 'A', name: 'Salomlashish', weightPct: 40, order: 0 },
        { code: 'B', name: 'Ehtiyojni aniqlash', weightPct: 60, order: 1 },
      ],
      criteria: [
        {
          code: 'A1',
          categoryCode: 'A',
          name: 'Brend va menejer tanishtiruvi',
          description: 'Menejer o\'zini va markazni aniq tanishtirishi kerak.',
          rubric: {
            '0': 'O\'zini ham, markazni ham tanishtirmadi.',
            '1': 'Faqat ismini yoki faqat markaz nomini aytdi.',
            '2': 'O\'zini va markazni aniq tanishtirdi.',
            '3': 'Ishonchli tanishtirdi va mijozga ismi bilan murojaat qildi.',
          },
        },
        {
          code: 'B1',
          categoryCode: 'B',
          name: 'Diagnostika savollari',
          description: 'Mijozning ehtiyoji haqida kamida ikkita ochiq savol berishi kerak.',
          rubric: {
            '0': 'Umuman savol bermadi.',
            '1': 'Bitta yopiq savol berdi.',
            '2': 'Kamida bitta ochiq savol berdi.',
            '3': 'Ikkita ochiq savol berib, holatni to\'liq aniqladi.',
          },
        },
      ],
    },
  };
}

async function registerUser(
  app: FastifyInstance,
  suffix: string,
  businessName: string,
): Promise<{ cookie: string; businessId: string; userId: string; email: string }> {
  const email = `api-${suffix}-${tag}@test.local`;
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { email, password: PASSWORD, displayName: 'Test', businessName },
  });
  const body = res.json() as {
    user: { id: string };
    businesses: { businessId: string }[];
  };
  return {
    cookie: res.cookies.find((c) => c.name === 'sid')?.value ?? '',
    businessId: body.businesses[0]!.businessId,
    userId: body.user.id,
    email,
  };
}

async function main(): Promise<void> {
  const app = await buildApp();
  console.log('\nAPI: profil, playbook, seats, members\n');

  try {
    const owner = await registerUser(app, 'owner', 'IT Live Academy');
    const stranger = await registerUser(app, 'stranger', 'Begona biznes');
    const base = `/api/v1/businesses/${owner.businessId}`;
    const auth = { sid: owner.cookie };

    // ═══ BIZNES PROFILI ═══
    const emptyProfile = await app.inject({
      method: 'GET',
      url: `${base}/profile`,
      cookies: auth,
    });
    const ep = emptyProfile.json() as { completeness: { readyForPlaybook: boolean } };
    check('bo\'sh profil playbook uchun tayyor emas', ep.completeness.readyForPlaybook === false);

    const putProfile = await app.inject({
      method: 'PUT',
      url: `${base}/profile`,
      cookies: auth,
      payload: {
        businessDescription: 'Bolalar uchun IT o\'quv markazi',
        primaryOffers: ['Web dasturlash', 'Robototexnika'],
        typicalCustomers: '6-17 yoshli bolalarning ota-onalari',
        customerProblem: 'Farzandi bo\'sh vaqtini foydali o\'tkazishini xohlaydi',
        commonObjections: ['Qimmat', 'Uzoq', 'Vaqti mos kelmaydi'],
        vocabulary: ['IT Live Academy', 'robototexnika', 'Scratch'],
      },
    });
    const pp = putProfile.json() as {
      completeness: { readyForPlaybook: boolean; percent: number };
    };
    check('profil saqlandi va playbook uchun tayyor', pp.completeness.readyForPlaybook === true);
    check('to\'liqlik foizi hisoblandi', pp.completeness.percent > 0);

    // ═══ PLAYBOOK VALIDATSIYASI ═══
    const badWeights = await app.inject({
      method: 'POST',
      url: `${base}/playbook/validate`,
      cookies: auth,
      payload: (() => {
        const p = validPlaybook();
        p.criteria.categories[0]!.weightPct = 30; // jami 90%
        return p;
      })(),
    });
    const bw = badWeights.json() as { valid: boolean; errors: Record<string, string[]> };
    check('vaznlar 100% emasligi aniqlandi', bw.valid === false);
    check(
      'xato xabari aniq',
      JSON.stringify(bw.errors).includes('100%'),
      JSON.stringify(bw.errors).slice(0, 120),
    );

    const orphan = await app.inject({
      method: 'POST',
      url: `${base}/playbook/validate`,
      cookies: auth,
      payload: (() => {
        const p = validPlaybook();
        p.criteria.criteria[0]!.categoryCode = 'Z'; // mavjud bo'lmagan kategoriya
        return p;
      })(),
    });
    check('yetim mezon aniqlandi', (orphan.json() as { valid: boolean }).valid === false);

    const good = await app.inject({
      method: 'POST',
      url: `${base}/playbook/validate`,
      cookies: auth,
      payload: validPlaybook(),
    });
    check('to\'g\'ri playbook validatsiyadan o\'tdi', (good.json() as { valid: boolean }).valid);

    // ═══ PLAYBOOK VERSIYALASH ═══
    const noPlaybook = await app.inject({ method: 'GET', url: `${base}/playbook`, cookies: auth });
    check('playbook yo\'qligida 404', noPlaybook.statusCode === 404);

    const v1 = await app.inject({
      method: 'POST',
      url: `${base}/playbook`,
      cookies: auth,
      payload: { ...validPlaybook(), changeNote: 'Birinchi versiya' },
    });
    check('1-versiya yaratildi', v1.statusCode === 201);
    check('versiya raqami 1', (v1.json() as { version: number }).version === 1);
    check('1-versiya faol', (v1.json() as { isActive: boolean }).isActive === true);

    const v2 = await app.inject({
      method: 'POST',
      url: `${base}/playbook`,
      cookies: auth,
      payload: (() => {
        const p = validPlaybook();
        p.criteria.categories[0]!.name = 'Salomlashish (yangilangan)';
        return { ...p, changeNote: 'Nom o\'zgardi' };
      })(),
    });
    check('2-versiya yaratildi', (v2.json() as { version: number }).version === 2);

    const versions = await app.inject({
      method: 'GET',
      url: `${base}/playbook/versions`,
      cookies: auth,
    });
    const vlist = versions.json() as { version: number; isActive: boolean }[];
    check('ikkita versiya bor', vlist.length === 2);
    check(
      'faqat bitta versiya faol',
      vlist.filter((v) => v.isActive).length === 1,
    );
    check('faol versiya — eng yangisi', vlist.find((v) => v.isActive)?.version === 2);

    // Eski versiya o'zgarmaganini tekshiramiz — bu FR-22 ning mohiyati.
    const v1again = await app.inject({
      method: 'GET',
      url: `${base}/playbook/versions/1`,
      cookies: auth,
    });
    const v1data = v1again.json() as {
      criteria: { categories: { name: string }[] };
    };
    check(
      '1-versiya mazmuni o\'zgarmagan',
      v1data.criteria.categories[0]?.name === 'Salomlashish',
      v1data.criteria.categories[0]?.name,
    );

    const rollback = await app.inject({
      method: 'POST',
      url: `${base}/playbook/versions/1/activate`,
      cookies: auth,
    });
    check('1-versiyaga qaytish ishladi', rollback.statusCode === 200);
    const active = await app.inject({ method: 'GET', url: `${base}/playbook`, cookies: auth });
    check('faol versiya endi 1', (active.json() as { version: number }).version === 1);

    // ═══ SEATS ═══
    const seatRes = await app.inject({
      method: 'POST',
      url: `${base}/seats`,
      cookies: auth,
      payload: {
        displayName: 'Muxlisa',
        login: 'muxlisa',
        phoneNumbers: ['+998901234567'],
      },
    });
    check('sotuvchi o\'rni yaratildi', seatRes.statusCode === 201);
    const seatId = (seatRes.json() as { id: string }).id;

    const dupLogin = await app.inject({
      method: 'POST',
      url: `${base}/seats`,
      cookies: auth,
      payload: { displayName: 'Boshqa', login: 'muxlisa' },
    });
    check('takroriy login 409', dupLogin.statusCode === 409, `kod: ${dupLogin.statusCode}`);

    const badPhone = await app.inject({
      method: 'POST',
      url: `${base}/seats`,
      cookies: auth,
      payload: { displayName: 'Test', phoneNumbers: ['salom'] },
    });
    check('noto\'g\'ri telefon 422', badPhone.statusCode === 422);

    const link = await app.inject({
      method: 'POST',
      url: `${base}/seats/${seatId}/activation-link`,
      cookies: auth,
    });
    check(
      'aktivatsiya tokeni berildi',
      ((link.json() as { activationToken: string }).activationToken ?? '').length > 20,
    );

    const del = await app.inject({
      method: 'DELETE',
      url: `${base}/seats/${seatId}`,
      cookies: auth,
    });
    check('o\'rin o\'chirildi', del.statusCode === 200);

    const stillThere = await withoutTenantIsolation('test: yumshoq o\'chirishni tekshirish', (tx) =>
      tx.select({ isActive: seat.isActive }).from(seat).where(eq(seat.id, seatId)),
    );
    check(
      'o\'chirish yumshoq (qator saqlandi, isActive=false)',
      stillThere.length === 1 && stillThere[0]?.isActive === false,
    );

    // ═══ MEMBERS ═══
    const invite = await app.inject({
      method: 'POST',
      url: `${base}/members/invite`,
      cookies: auth,
      payload: {
        email: `head-${tag}@test.local`,
        displayName: 'Bo\'lim boshlig\'i',
        role: 'head',
      },
    });
    check('rahbar taklif qilindi', invite.statusCode === 201);

    const members = await app.inject({ method: 'GET', url: `${base}/members`, cookies: auth });
    const mlist = members.json() as { role: string; id: string }[];
    check('a\'zolar ro\'yxatida ikkita', mlist.length === 2);

    const ownerMember = mlist.find((m) => m.role === 'owner')!;
    const removeOwner = await app.inject({
      method: 'DELETE',
      url: `${base}/members/${ownerMember.id}`,
      cookies: auth,
    });
    check(
      'oxirgi egani o\'chirib bo\'lmaydi',
      removeOwner.statusCode === 409,
      `kod: ${removeOwner.statusCode}`,
    );

    // ═══ TENANTLARARO KIRISH ═══
    const foreign = await app.inject({
      method: 'GET',
      url: `${base}/playbook`,
      cookies: { sid: stranger.cookie },
    });
    check(
      'begona tenant 404 oladi (403 emas — mavjudlik oshkor bo\'lmaydi)',
      foreign.statusCode === 404,
      `kod: ${foreign.statusCode}`,
    );

    const foreignWrite = await app.inject({
      method: 'POST',
      url: `${base}/seats`,
      cookies: { sid: stranger.cookie },
      payload: { displayName: 'Hujum' },
    });
    check('begona tenant yoza olmaydi', foreignWrite.statusCode === 404);

    // ═══ RUXSATLAR: sotuvchi rahbar amallarini bajara olmaydi ═══
    const managerEmail = `mgr-${tag}@test.local`;
    const { userId: managerId, seatId: mgrSeatId, otherSeatId } = await withoutTenantIsolation(
      'test: sotuvchi foydalanuvchisini o\'ringa biriktirish',
      async (tx) => {
        const [u] = await tx
          .insert(appUser)
          .values({ email: managerEmail, displayName: 'Sotuvchi', systemRole: 'user' })
          .returning({ id: appUser.id });
        const [s] = await tx
          .insert(seat)
          .values({
            businessId: owner.businessId,
            userId: u!.id,
            displayName: 'Sotuvchi',
            isOccupied: true,
            activation: 'active',
          })
          .returning({ id: seat.id });
        // Ikkinchi o'rin — "begonasini ko'ra olmaydi" tekshiruvi uchun.
        const [other] = await tx
          .insert(seat)
          .values({ businessId: owner.businessId, displayName: 'Begona sotuvchi' })
          .returning({ id: seat.id });
        return { userId: u!.id, seatId: s!.id, otherSeatId: other!.id };
      },
    );

    // Sotuvchi uchun sessiya — parol o'rnatmasdan, to'g'ridan-to'g'ri.
    const { createSession } = await import('../auth/session.js');
    const mgrSession = await createSession(managerId);
    const mgrAuth = { sid: mgrSession.token };

    const mgrCtx = await app.inject({
      method: 'GET',
      url: '/api/v1/auth/context',
      cookies: mgrAuth,
    });
    const mgrBody = mgrCtx.json() as { businesses: { role: string; permissions: string[] }[] };
    check('sotuvchi "manager" rolini oldi', mgrBody.businesses[0]?.role === 'manager');

    const mgrCreateSeat = await app.inject({
      method: 'POST',
      url: `${base}/seats`,
      cookies: mgrAuth,
      payload: { displayName: 'Ruxsatsiz' },
    });
    check(
      'sotuvchi o\'rin yarata olmaydi (403)',
      mgrCreateSeat.statusCode === 403,
      `kod: ${mgrCreateSeat.statusCode}`,
    );

    const mgrWritePlaybook = await app.inject({
      method: 'POST',
      url: `${base}/playbook`,
      cookies: mgrAuth,
      payload: validPlaybook(),
    });
    check(
      'sotuvchi playbook o\'zgartira olmaydi (403)',
      mgrWritePlaybook.statusCode === 403,
      `kod: ${mgrWritePlaybook.statusCode}`,
    );

    const mgrReadPlaybook = await app.inject({
      method: 'GET',
      url: `${base}/playbook`,
      cookies: mgrAuth,
    });
    check('sotuvchi playbook o\'qiy oladi', mgrReadPlaybook.statusCode === 200);

    const mgrInvite = await app.inject({
      method: 'POST',
      url: `${base}/members/invite`,
      cookies: mgrAuth,
      payload: { email: 'x@y.uz', displayName: 'X', role: 'supervisor' },
    });
    check('sotuvchi rahbar taklif qila olmaydi (403)', mgrInvite.statusCode === 403);

    const mgrSeats = await app.inject({ method: 'GET', url: `${base}/seats`, cookies: mgrAuth });
    const mgrSeatList = mgrSeats.json() as Record<string, unknown>[];
    check('sotuvchi o\'rinlar ro\'yxatini ko\'radi', mgrSeats.statusCode === 200);
    check(
      'lekin login va telefon raqamlarisiz',
      mgrSeatList.length > 0 && !('login' in mgrSeatList[0]!) && !('phoneNumbers' in mgrSeatList[0]!),
    );

    // ═══ FR-112: SOTUVCHINING O'Z KABINETI ═══
    //
    // Ilgari bu marshrutlarning HAMMASI `:all` ruxsatini talab qilardi,
    // ya'ni sotuvchi kira olsa ham har so'rovda 403 olardi va kabinetni
    // umuman qurib bo'lmasdi. Quyidagi tekshiruvlar shu chegarani
    // qotiradi: o'ziniki ochiq, begonasi 404.
    const mgrOwnDash = await app.inject({
      method: 'GET',
      url: `${base}/dashboard/seats/${mgrSeatId}`,
      cookies: mgrAuth,
    });
    check(
      'sotuvchi O\'Z kabinetini ochadi (FR-112)',
      mgrOwnDash.statusCode === 200,
      `kod: ${mgrOwnDash.statusCode}`,
    );
    const dashBody = mgrOwnDash.json() as { criteria?: unknown[]; seat?: { id: string } };
    check(
      'kabinet javobida mezonlar solishtiruvi bor',
      Array.isArray(dashBody.criteria) && dashBody.seat?.id === mgrSeatId,
    );

    const mgrOtherDash = await app.inject({
      method: 'GET',
      url: `${base}/dashboard/seats/${otherSeatId}`,
      cookies: mgrAuth,
    });
    check(
      'sotuvchi BEGONA kabinetni ko\'rmaydi (404)',
      mgrOtherDash.statusCode === 404,
      `kod: ${mgrOtherDash.statusCode}`,
    );

    const mgrTeamDash = await app.inject({
      method: 'GET',
      url: `${base}/dashboard/kpi`,
      cookies: mgrAuth,
    });
    check(
      'sotuvchi jamoa dashboard\'ini ko\'rmaydi (403)',
      mgrTeamDash.statusCode === 403,
      `kod: ${mgrTeamDash.statusCode}`,
    );

    const mgrConvs = await app.inject({
      method: 'GET',
      url: `${base}/conversations`,
      cookies: mgrAuth,
    });
    check(
      'sotuvchi suhbatlar ro\'yxatini ochadi',
      mgrConvs.statusCode === 200,
      `kod: ${mgrConvs.statusCode}`,
    );
    const convBody = mgrConvs.json() as { conversations: { seatId: string | null }[] };
    check(
      'ro\'yxatda faqat O\'Z suhbatlari',
      convBody.conversations.every((r) => r.seatId === mgrSeatId),
    );

    const mgrForeignConvs = await app.inject({
      method: 'GET',
      url: `${base}/conversations?seatId=${otherSeatId}`,
      cookies: mgrAuth,
    });
    check(
      'begona seatId bilan so\'rov 404',
      mgrForeignConvs.statusCode === 404,
      `kod: ${mgrForeignConvs.statusCode}`,
    );

    // Vazifa: o'zinikining HOLATINI o'zgartira oladi, muddatini emas.
    const [mgrTask] = await withoutTenantIsolation('test: sotuvchiga vazifa berish', (tx) =>
      tx
        .insert(task)
        .values({
          businessId: owner.businessId,
          seatId: mgrSeatId,
          title: 'Mijozga qo\'ng\'iroq qilish',
          source: 'manual',
        })
        .returning({ id: task.id }),
    );
    const mgrDone = await app.inject({
      method: 'PATCH',
      url: `${base}/tasks/${mgrTask!.id}`,
      cookies: mgrAuth,
      payload: { status: 'done' },
    });
    check(
      'sotuvchi o\'z vazifasini bajarildi deb belgilaydi',
      mgrDone.statusCode === 200,
      `kod: ${mgrDone.statusCode}`,
    );

    const mgrMoveDue = await app.inject({
      method: 'PATCH',
      url: `${base}/tasks/${mgrTask!.id}`,
      cookies: mgrAuth,
      payload: { dueAt: new Date(Date.now() + 86400_000).toISOString() },
    });
    check(
      'sotuvchi vazifa muddatini SURA OLMAYDI (403)',
      mgrMoveDue.statusCode === 403,
      `kod: ${mgrMoveDue.statusCode}`,
    );
  } finally {
    await app.close();
    await cleanupTestDataQuietly(`%${tag}@test.local`);
    await closeDb();
  }

  console.log(
    fail === 0
      ? `\nAPI butun. ${pass}/${pass} tekshiruv o'tdi.\n`
      : `\n${fail} ta tekshiruv MUVAFFAQIYATSIZ.\n`,
  );
  process.exitCode = fail === 0 ? 0 : 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
