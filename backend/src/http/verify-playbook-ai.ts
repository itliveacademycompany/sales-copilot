import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { draftToPlaybookBody } from '../ai/playbook-builder.js';
import type { LlmClient, LlmJsonRequest, LlmJsonResponse } from '../ai/llm.js';
import type { PlaybookDraftResult } from '../ai/prompts.js';
import type { BusinessProfile } from '../business/profile.js';
import { profileSchema } from '../business/profile.js';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withTenant, withoutTenantIsolation } from '../db/index.js';
import { aiProvider, playbook } from '../db/schema/index.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI PLAYBOOK BUILDER TESTI — FR-12
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:playbook-ai
 *
 * Markaziy da'vo: LLM noaniq/nomukammal ma'lumot qaytarsa ham (vaznlar
 * 100% ga teng emas, kategoriya bo'sh qoladi) — natija HAR DOIM
 * playbookBodySchema orqali o'tadi, chunki kodlar va vaznlar
 * deterministik tuziladi, modelga ishonilmaydi.
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

const profile: BusinessProfile = profileSchema.parse({
  businessDescription: 'IT o\'quv markazi, dasturlash kurslari',
  primaryOffers: ['Frontend kursi', 'Backend kursi'],
  typicalCustomers: '18-30 yosh, ish topmoqchi bo\'lganlar',
  customerProblem: 'Kasb almashtirish, IT sohaga kirish',
  commonObjections: ['Narxi qimmat', 'Vaqtim yo\'q'],
  vocabulary: ['React', 'Node.js'],
});

/** Model NOMUKAMMAL javob beradi: vaznlar 100% emas, bitta kategoriya bo'sh. */
const messyDraft: PlaybookDraftResult = {
  categories: [
    { name: 'Ehtiyoj aniqlash', weightPct: 30 },
    { name: 'Taqdimot', weightPct: 45 }, // jami 30+45+10 = 85, 100 emas
    { name: 'E\'tiroz bilan ishlash', weightPct: 10 },
    { name: 'Yakunlash', weightPct: 0 }, // vazni 0
    { name: 'Kuzatuv', weightPct: 5 }, // hech qanday mezoni yo'q bo'ladi
  ],
  criteria: [
    { categoryIndex: 0, name: 'Ochuvchi savol', description: 'Mijoz ehtiyojini so\'raydi va tinglaydi', rubric0: 'So\'ramadi', rubric1: 'Yuzaki so\'radi', rubric2: 'So\'radi', rubric3: 'Chuqur so\'radi va tingladi' },
    { categoryIndex: 1, name: 'Kurs taqdimoti', description: 'Kursni mijoz ehtiyojiga moslab tushuntiradi', rubric0: 'Tushuntirmadi', rubric1: 'Umumiy gapirdi', rubric2: 'Yaxshi tushuntirdi', rubric3: 'To\'liq moslab tushuntirdi' },
    { categoryIndex: 1, name: 'Narx taqdimoti', description: 'Narxni qiymat bilan birga aytadi', rubric0: 'Aytmadi', rubric1: 'Faqat raqam aytdi', rubric2: 'Qisman qiymat bilan', rubric3: 'To\'liq qiymat bilan' },
    { categoryIndex: 2, name: 'E\'tirozga javob', description: 'Narx e\'tiroziga qiymat orqali javob beradi', rubric0: 'Javob bermadi', rubric1: 'Yuzaki', rubric2: 'Yaxshi', rubric3: 'Chuqur va ishonarli' },
    // categoryIndex 3 (Yakunlash) va 4 (Kuzatuv) uchun HECH qanday mezon yo'q!
  ],
  callFamilies: [
    { key: 'yangi_lid', name: 'Yangi lid', description: 'Birinchi murojaat', scored: true },
    { key: 'spam', name: 'Spam', description: 'Reklama', scored: false },
  ],
  redFlags: [{ key: 'qopollik', description: 'Qo\'pol muomala', severity: 'critical' }],
  vocabulary: ['frontend', 'backend', 'JavaScript'],
};

class MockLlm implements LlmClient {
  completeJson(_req: LlmJsonRequest): Promise<LlmJsonResponse> {
    return Promise.resolve({
      json: messyDraft,
      model: 'mock-playbook-builder',
      tokensIn: 800,
      tokensOut: 1200,
      costUsd: 0.03,
    });
  }
}

async function main(): Promise<void> {
  console.log('\nAI Playbook Builder (FR-12)\n');

  // ═══ 1: Nomukammal LLM javobi ham har doim to'g'ri playbook beradi ═══
  const body = draftToPlaybookBody(messyDraft, profile);

  const totalWeight = body.criteria.categories.reduce((s, c) => s + c.weightPct, 0);
  check(
    'vaznlar aynan 100% ga normallashtirildi',
    Math.abs(totalWeight - 100) < 0.01,
    `jami: ${totalWeight}`,
  );

  const codes = body.criteria.categories.map((c) => c.code);
  check('kategoriya kodlari A, B, C, D, E tartibida', codes.join('') === 'ABCDE', codes.join(','));

  const critCodes = body.criteria.criteria.map((c) => c.code).sort();
  check(
    'mezon kodlari deterministik (A1, B1, B2, C1...)',
    new Set(critCodes).size === critCodes.length,
    critCodes.join(','),
  );

  const catD = body.criteria.criteria.filter((c) => c.categoryCode === 'D');
  const catE = body.criteria.criteria.filter((c) => c.categoryCode === 'E');
  check(
    'mezonsiz qolgan kategoriyalarga avtomatik mezon qo\'shildi',
    catD.length === 1 && catE.length === 1,
    `D: ${catD.length}, E: ${catE.length}`,
  );

  check(
    'har mezon o\'z kategoriyasiga mos kodlangan (A1 → A, B1/B2 → B)',
    body.criteria.criteria.every((c) => c.code.startsWith(c.categoryCode)),
  );

  check(
    'soha lug\'ati LLM + profil ikkalasidan birlashtirilgan',
    body.promptNotes.stage1.vocabulary.includes('React') &&
      body.promptNotes.stage1.vocabulary.includes('frontend'),
  );

  check(
    'xizmat yo\'nalishlari profil.primaryOffers dan olindi (LLM emas)',
    body.classificationPolicy.serviceLines.includes('Frontend kursi'),
  );

  check(
    'spam oilasi scored:false saqlandi',
    body.classificationPolicy.callFamilies.find((f) => f.key === 'spam')?.scored === false,
  );

  // ═══ 2: API orqali — generatsiya qilinadi, SAQLANMAYDI ═══
  console.log('\n— API: generate endpoint —');
  const app: FastifyInstance = await buildApp();
  const tag = Date.now().toString(36);
  try {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `pbai-${tag}@test.local`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Owner',
        businessName: 'AI Playbook Test',
      },
    });
    const regBody = reg.json() as { businesses: { businessId: string }[] };
    const cookie = reg.cookies.find((c) => c.name === 'sid')?.value ?? '';
    const businessId = regBody.businesses[0]!.businessId;
    const auth = { sid: cookie };
    const base = `/api/v1/businesses/${businessId}`;

    // Profil to'ldirilmagan holda — talab qilingan maydonlar yo'qligi haqida xato.
    const tooEarly = await app.inject({
      method: 'POST',
      url: `${base}/playbook/generate`,
      cookies: auth,
    });
    check('profilsiz generatsiya rad etiladi', tooEarly.statusCode === 400, `kod: ${tooEarly.statusCode}`);

    // So'rov tanasida to'g'ridan-to'g'ri anketa berish (onboarding paytida
    // hali saqlanmagan bo'lishi mumkin).
    // Bu yerda faqat marshrutning xato holati tekshiriladi: faol provayder
    // bo'lmasa, endpoint jimgina o'chib qolmasligi kerak.
    //
    // Ilgari bu tekshiruv "dev bazasida faol provayder yo'q" degan JIM
    // taxminga tayanardi. Taxmin buzilishi bilan (provayder sozlangach) test
    // haqiqiy LLM'ni chaqirib 200 qaytardi — ya'ni testlar pul sarflay
    // boshlagan bo'lardi. Endi holat vaqtincha o'zi tayyorlanadi va
    // tiklanadi, ya'ni test atrof-muhitdan mustaqil.
    const activeProviders = await withoutTenantIsolation(
      'test: faol provayderlarni vaqtincha o\'chirish',
      async (tx) => {
        const rows = await tx
          .select({ id: aiProvider.id })
          .from(aiProvider)
          .where(eq(aiProvider.isActive, true));
        if (rows.length > 0) {
          await tx
            .update(aiProvider)
            .set({ isActive: false })
            .where(inArray(aiProvider.id, rows.map((r) => r.id)));
        }
        return rows;
      },
    );

    try {
      const withoutProvider = await app.inject({
        method: 'POST',
        url: `${base}/playbook/generate`,
        cookies: auth,
        payload: profile,
      });
      check(
        'faol LLM provayder yo\'qligi aniq xato beradi (o\'chib qolmaydi)',
        withoutProvider.statusCode >= 400,
        `kod: ${withoutProvider.statusCode}`,
      );
    } finally {
      if (activeProviders.length > 0) {
        await withoutTenantIsolation('test: faol provayderlarni tiklash', (tx) =>
          tx
            .update(aiProvider)
            .set({ isActive: true })
            .where(inArray(aiProvider.id, activeProviders.map((r) => r.id))),
        );
      }
    }

    const noAuth = await app.inject({ method: 'POST', url: `${base}/playbook/generate` });
    check('autentifikatsiyasiz 401', noAuth.statusCode === 401);

    // ═══ 3: eski/to'liqsiz yozuv ham to'liq shaklda qaytadi ═══
    // Real xato: skript orqali `promptNotes: {}` bilan yozilgan qator
    // frontend'ni "Cannot read properties of undefined" bilan yiqitgan
    // edi. GET javobi endi har doim to'liq shaklni kafolatlashi kerak.
    console.log('\n— to\'liqsiz yozuvni himoyalash —');
    await withTenant(businessId, (tx) =>
      tx.insert(playbook).values({
        businessId,
        version: 1,
        isActive: true,
        criteria: {
          categories: [{ code: 'A', name: 'Test', weightPct: 100, order: 0 }],
          criteria: [
            {
              code: 'A1',
              categoryCode: 'A',
              name: 'Test mezon',
              description: 'Tavsif',
              rubric: { '0': '-', '1': '-', '2': '-', '3': '-' },
              appliesTo: { callFamilies: [], serviceLines: [], directions: [] },
              isActive: true,
              order: 0,
            },
          ],
        },
        // Ataylab CHALA obyektlar — skript/qo'lda kiritishda sodir bo'lgani kabi.
        questionnaire: {},
        classificationPolicy: {},
        promptNotes: {},
      }),
    );

    const incomplete = await app.inject({ method: 'GET', url: `${base}/playbook`, cookies: auth });
    const incompleteBody = incomplete.json() as {
      promptNotes: { stage1: { vocabulary: string[] } };
      classificationPolicy: { callFamilies: unknown[] };
      questionnaire: { questions: unknown[] };
    };
    check(
      'to\'liqsiz promptNotes to\'liq shaklda qaytdi',
      Array.isArray(incompleteBody.promptNotes?.stage1?.vocabulary),
      JSON.stringify(incompleteBody.promptNotes),
    );
    check(
      'to\'liqsiz classificationPolicy to\'liq shaklda qaytdi',
      Array.isArray(incompleteBody.classificationPolicy?.callFamilies),
    );
    check(
      'to\'liqsiz questionnaire to\'liq shaklda qaytdi',
      Array.isArray(incompleteBody.questionnaire?.questions),
    );
  } finally {
    await app.close();
    await cleanupTestDataQuietly(`%${tag}@test.local`);
  }

  await closeDb();
  console.log(`\n${fail === 0 ? 'Playbook Builder butun.' : 'XATOLAR BOR.'} ${pass}/${pass + fail} tekshiruv o'tdi.`);
  if (fail > 0) process.exit(1);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
