import { createServer, type Server } from 'node:http';
import { and, eq, sql } from 'drizzle-orm';
import type { LlmClient, LlmJsonRequest } from '../ai/llm.js';
import type { SttClient } from '../ai/stt.js';
import { refineAndAnalyzeTranscript } from '../ai/refine-and-analyze.js';
import { loadActivePlaybookAndBusiness } from '../calls/pipeline.js';
import { cleanupTestData, TEST_EMAIL_DOMAIN } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { analysis, contact, conversation, criterionScore, seat } from '../db/schema/index.js';
import { buildApp } from '../http/app.js';
import {
  baholashPauzasi,
  bugunBaholangan,
  limitXatosimi,
  MAX_URINISH,
  mzIdlar,
  oldindanTranskriptQil,
  osilganlarniQaytar,
  pauzalarniTozala,
  qongiroqlarniQaytaIshla,
  raqamniTozala,
  sinxronla,
  subdomenniAjrat,
} from './moizvonki.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOI ZVONKI — to'liq oqim: ulash → sinxronlash → bog'lash → baholash
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Haqiqiy Moi Zvonki o'rniga LOKAL soxta server (`calls.list`,
 * `company.list_employee` va yozuv fayli). Haqiqiy kalit bilan sinash
 * testni begona hisobga, tarmoqqa va pullik STT ga bog'lab qo'yardi.
 *
 * DIQQAT: dev-server (`npm run dev`) shu bazada ishlab tursa, uning worker'i
 * har 15 soniyada test biznesining qo'ng'iroqlarini ham olib, test bilan
 * poyga qiladi — G2 bo'limi tasodifiy yiqiladi. Testni server to'xtatilgan
 * holda yoki alohida bazada ishga tushiring.
 *
 * STT va LLM ham soxta — lekin ULARDAN KEYINGI hamma narsa haqiqiy:
 * pre-filter, baholash darvozasi va isbot tekshiruvi (`persistAnalysisTx`).
 * Ya'ni bu test "qo'ng'iroq bazaga baholangan holda tushadimi" degan
 * savolga aynan ishlab chiqarishdagi kod bilan javob beradi.
 */

const tag = `mz${Date.now().toString(36).slice(-6)}`;
const KALIT = 'test-moizvonki-kalit-123456';

let otdi = 0;
let yiqildi = 0;
function check(nom: string, ok: boolean, izoh = ''): void {
  if (ok) {
    otdi++;
    console.log(`  PASS  ${nom}`);
  } else {
    yiqildi++;
    console.error(`  FAIL  ${nom}${izoh ? ' — ' + izoh : ''}`);
  }
}

// ─── Soxta Moi Zvonki ────────────────────────────────────────────────────────

const soat = Math.floor(Date.now() / 1000) - 3600;

/** Qo'ng'iroqlar — har biri bitta holatni sinaydi. */
let QONGIROQLAR: Record<string, unknown>[] = [];
const kelganSorovlar: Record<string, unknown>[] = [];
let port = 0;
let ruxsatAdmin = true;

function qongiroqlarniTayyorla(): void {
  const rec = (id: number) => `http://127.0.0.1:${port}/rec/${id}.mp3`;
  QONGIROQLAR = [
    // 1001 — Aziz (xodim 501), kiruvchi, javob berilgan, uzun → BAHOLANADI
    { db_call_id: 1001, direction: 0, client_number: '+998 90 123-45-67', client_name: 'Mijoz Bir', start_time: soat, end_time: soat + 95, duration: 95, answered: 1, recording: rec(1001), src_number: '998711111111', user_id: 501, user_account: 'aziz@kompaniya.uz' },
    // 1002 — javobsiz → O'TKAZIB YUBORILADI
    { db_call_id: 1002, direction: 0, client_number: '998901112233', start_time: soat + 100, end_time: soat + 110, duration: 0, answered: 0, recording: '', user_id: 501 },
    // 1003 — 8 soniya → QISQA, olinmaydi
    { db_call_id: 1003, direction: 1, client_number: '998901112244', start_time: soat + 200, end_time: soat + 208, duration: 8, answered: 1, recording: rec(1003), user_id: 501 },
    // 1004 — xodim 777 hali bog'lanmagan → saqlanadi, LEKIN baholanmaydi
    { db_call_id: 1004, direction: 1, client_number: '998935556677', start_time: soat + 300, end_time: soat + 360, duration: 60, answered: 1, recording: rec(1004), src_number: '998712222222', user_id: 777, user_account: 'nodira@kompaniya.uz' },
    // 1005 — o'sha mijoz (1001) qayta qo'ng'iroq qildi → BITTA kontakt
    { db_call_id: 1005, direction: 0, client_number: '998901234567', start_time: soat + 400, end_time: soat + 470, duration: 70, answered: 1, recording: rec(1005), user_id: 501 },
  ];
}

function soxtaMoizvonki(): Promise<Server> {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      if (req.method === 'GET' && req.url?.startsWith('/rec/')) {
        // Soxta audio — STT ham soxta, mazmuni muhim emas, faqat yetib kelishi.
        res.writeHead(200, { 'content-type': 'audio/mpeg' });
        res.end(Buffer.from('ID3-soxta-mp3-' + req.url));
        return;
      }
      if (req.method === 'GET') {
        // Noma'lum yozuv — haqiqiy CDN kabi 404.
        res.writeHead(404);
        res.end();
        return;
      }
      let tana = '';
      req.on('data', (c) => (tana += c));
      req.on('end', () => {
        const j = JSON.parse(tana) as Record<string, unknown>;
        kelganSorovlar.push(j);
        const javob = (kod: number, body: unknown) => {
          res.writeHead(kod, { 'content-type': 'application/json' });
          res.end(JSON.stringify(body));
        };
        if (j.api_key !== KALIT) return javob(401, { error: `bad key ${String(j.api_key)}` });

        if (j.action === 'calls.list') {
          const fromId = typeof j.from_id === 'number' ? j.from_id : null;
          const tanlangan = QONGIROQLAR.filter((q) =>
            fromId === null ? true : Number(q.db_call_id) > fromId,
          );
          const max = Number(j.max_results ?? 100);
          const offset = Number(j.from_offset ?? 0);
          const sahifa = fromId === null ? tanlangan.slice(offset, offset + max) : tanlangan.slice(0, max);
          const qoldi = fromId === null ? Math.max(0, tanlangan.length - offset - sahifa.length) : Math.max(0, tanlangan.length - sahifa.length);
          return javob(200, {
            results_count: sahifa.length,
            results_remains: qoldi,
            results_next_offset: offset + sahifa.length,
            results: sahifa,
          });
        }
        if (j.action === 'company.list_employee') {
          if (!ruxsatAdmin) return javob(403, { error: 'access denied' });
          return javob(200, {
            results_count: 2,
            results_remains: 0,
            results: [
              { id: 501, email: 'aziz@kompaniya.uz', display_name: 'Aziz Karimov', role: 4 },
              { id: 777, email: 'nodira@kompaniya.uz', display_name: 'Nodira Aliyeva', role: 4 },
            ],
          });
        }
        return javob(400, { error: 'unknown action' });
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ─── Soxta STT va LLM ────────────────────────────────────────────────────────

const sttChaqiruvlar: number[] = [];
const soxtaStt: SttClient = {
  async transcribe(req) {
    sttChaqiruvlar.push(req.audio.length);
    return {
      utterances: [
        { speakerTag: 1, text: 'Assalomu alaykum, IT Live akademiyasi, eshitaman.', startSeconds: 0, endSeconds: 3, confidence: 0.9 },
        { speakerTag: 2, text: 'Salom, frontend kursi narxi qancha?', startSeconds: 3, endSeconds: 6, confidence: 0.9 },
        { speakerTag: 1, text: 'Oyiga bir million ikki yuz ming so\'m, natija kafolatlangan.', startSeconds: 6, endSeconds: 10, confidence: 0.9 },
        { speakerTag: 2, text: 'Biroz qimmat ekan, o\'ylab ko\'raman.', startSeconds: 10, endSeconds: 13, confidence: 0.9 },
        { speakerTag: 1, text: 'Ertaga sinov darsiga yozib qo\'yaymi?', startSeconds: 13, endSeconds: 16, confidence: 0.9 },
      ],
      language: 'uz',
      durationSeconds: 16,
      model: 'soxta-stt',
      costUsd: 0.01,
      speakerCount: 2,
    };
  },
};

const soxtaLlm: LlmClient = {
  async completeJson(_req: LlmJsonRequest) {
    return {
      model: 'soxta-llm',
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.002,
      json: {
        turns: [
          { sourceSeq: 0, speaker: 'manager', text: 'Assalomu alaykum, IT Live akademiyasi, eshitaman.' },
          { sourceSeq: 1, speaker: 'client', text: 'Salom, frontend kursi narxi qancha?' },
          { sourceSeq: 2, speaker: 'manager', text: 'Oyiga bir million ikki yuz ming so\'m, natija kafolatlangan.' },
          { sourceSeq: 3, speaker: 'client', text: 'Biroz qimmat ekan, o\'ylab ko\'raman.' },
          { sourceSeq: 4, speaker: 'manager', text: 'Ertaga sinov darsiga yozib qo\'yaymi?' },
        ],
        transcriptConfidence: 0.9,
        transcriptNote: 'soxta',
        classification: {
          businessRelevance: 'sales',
          callFamily: 'sales_lead',
          serviceLine: null,
          language: 'uz',
          client: { name: null, company: null, role: null, isDecisionMaker: null },
          deal: { amount: 1200000, currency: 'UZS', stage: 'interested' },
          signals: { urgency: 'medium', budgetReaction: 'qimmat dedi', objections: ['narx'] },
          commitments: [],
          questionnaireAnswers: [],
          lastClientMessageNeedsReply: false,
          summary: 'Mijoz frontend kursi narxini so\'radi.',
          confidence: 0.9,
        },
        scoring: {
          scores: [
            // Iqtibos SO'ZMA-SO'Z transkriptda bor → ball QOLADI
            { code: 'A1', score: 2, evidenceQuote: 'Oyiga bir million ikki yuz ming so\'m', evidenceSegment: 2, reasoning: '-', confidence: 0.9 },
            // Transkriptda YO'Q iqtibos → kod uni bekor qilishi (null) kerak
            { code: 'A2', score: 3, evidenceQuote: 'Sizga qaysi yo\'nalish qiziq?', evidenceSegment: 1, reasoning: '-', confidence: 0.9 },
            { code: 'B1', score: 2, evidenceQuote: 'Ertaga sinov darsiga yozib qo\'yaymi?', evidenceSegment: 4, reasoning: '-', confidence: 0.9 },
          ],
          primaryGap: 'A2',
          coaching: { strengths: [], improvements: [], betterPhrases: [] },
          redFlags: [],
          leadQuality: 'warm',
          compliance: 'ok',
        },
      },
    };
  },
};

// ─── Test ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\nMoi Zvonki integratsiyasi (soxta server)\n');

  console.log('— A: manzilni tozalash (SSRF himoyasi) —');
  check('subdomen o\'zi', subdomenniAjrat('kompaniya') === 'kompaniya');
  check('to\'liq domen', subdomenniAjrat('kompaniya.moizvonki.ru') === 'kompaniya');
  check('https va / bilan', subdomenniAjrat('https://Kompaniya.moizvonki.ru/') === 'kompaniya');
  check('begona domen RAD', subdomenniAjrat('evil.com') === null);
  check('ichki manzil RAD', subdomenniAjrat('127.0.0.1') === null);
  check('moizvonki niqobidagi begona domen RAD', subdomenniAjrat('kompaniya.moizvonki.ru.evil.com') === null);
  check('raqam tozalash', raqamniTozala('+998 90 123-45-67') === '998901234567');

  const server = await soxtaMoizvonki();
  port = (server.address() as { port: number }).port;
  process.env.MOIZVONKI_API_BASE = `http://127.0.0.1:${port}/api/v1`;
  qongiroqlarniTayyorla();

  const app = await buildApp();
  try {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: {
        email: `${tag}${TEST_EMAIL_DOMAIN}`,
        password: 'juda-maxfiy-parol-123',
        displayName: 'Ega',
        businessName: 'MZ Test',
      },
    });
    const businessId = (reg.json() as { businesses: { businessId: string }[] }).businesses[0]!.businessId;
    const auth = { sid: reg.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    const base = `/api/v1/businesses/${businessId}`;

    const rubric = (s: string) => ({ '0': `${s}: yo'q`, '1': `${s}: yuzaki`, '2': `${s}: qisman`, '3': `${s}: to'liq` });
    const pb = await app.inject({
      method: 'POST',
      url: `${base}/playbook`,
      cookies: auth,
      payload: {
        criteria: {
          categories: [
            { code: 'A', name: 'Ehtiyoj', weightPct: 60, order: 0 },
            { code: 'B', name: 'Yakunlash', weightPct: 40, order: 1 },
          ],
          criteria: [
            { code: 'A1', categoryCode: 'A', name: 'Narx taqdimoti', description: 'Narxni qiymat bilan', rubric: rubric('Narx') },
            { code: 'A2', categoryCode: 'A', name: 'Ehtiyoj savollari', description: 'Ehtiyojni ochish', rubric: rubric('Ehtiyoj') },
            { code: 'B1', categoryCode: 'B', name: 'Keyingi qadam', description: 'Aniq keyingi qadam', rubric: rubric('Qadam') },
          ],
        },
        classificationPolicy: {
          callFamilies: [{ key: 'sales_lead', name: 'Lid', description: 'Yangi mijoz', scored: true }],
          redFlags: [],
          serviceLines: [],
        },
        questionnaire: { title: 'Anketa', questions: [] },
      },
    });
    check('playbook yaratildi', pb.statusCode === 201, `kod ${pb.statusCode}`);

    const seatA = await app.inject({ method: 'POST', url: `${base}/seats`, cookies: auth, payload: { displayName: 'Aziz Karimov' } });
    const seatB = await app.inject({ method: 'POST', url: `${base}/seats`, cookies: auth, payload: { displayName: 'Nodira Aliyeva' } });
    const azizSeat = (seatA.json() as { id: string }).id;
    const nodiraSeat = (seatB.json() as { id: string }).id;

    // ═══ B: ULASH ═══
    console.log('\n— B: ulash —');
    const notogri = await app.inject({
      method: 'PUT',
      url: `${base}/integrations/moizvonki`,
      cookies: auth,
      payload: { domain: 'kompaniya.moizvonki.ru', userName: 'admin@kompaniya.uz', apiKey: 'noto-gri-kalit-0000' },
    });
    check('noto\'g\'ri kalit SAQLANMAYDI (400)', notogri.statusCode === 400, `kod ${notogri.statusCode}`);
    check('xato matnida kalit oshkor qilinmaydi', !notogri.body.includes('noto-gri-kalit-0000'), notogri.body.slice(0, 200));

    const begona = await app.inject({
      method: 'PUT',
      url: `${base}/integrations/moizvonki`,
      cookies: auth,
      payload: { domain: 'http://169.254.169.254/', userName: 'admin@kompaniya.uz', apiKey: KALIT },
    });
    check('begona manzil RAD (400)', begona.statusCode === 400, `kod ${begona.statusCode}`);

    const ulash = await app.inject({
      method: 'PUT',
      url: `${base}/integrations/moizvonki`,
      cookies: auth,
      payload: { domain: 'https://kompaniya.moizvonki.ru/', userName: 'Admin@Kompaniya.uz', apiKey: KALIT, minDurationSeconds: 20, backfillDays: 1 },
    });
    check('to\'g\'ri kalit bilan ulandi', ulash.statusCode === 200, ulash.body.slice(0, 200));

    const holat = await app.inject({ method: 'GET', url: `${base}/integrations/moizvonki`, cookies: auth });
    check('holatda kalit YO\'Q, faqat niqob', !holat.body.includes(KALIT) && holat.json().keyHint !== null);
    check('manzil subdomenga keltirildi', holat.json().config.domain === 'kompaniya');
    check('supervised=1 so\'ralgan (boshqa menejerlar ham)', kelganSorovlar.some((s) => s.action === 'calls.list' && s.supervised === 1));

    // ═══ C: XODIMLARNI BOG'LASH (Aziz) ═══
    console.log('\n— C: xodimlar —');
    const xodimlar = await app.inject({ method: 'GET', url: `${base}/integrations/moizvonki/employees`, cookies: auth });
    const xj = xodimlar.json() as { manba: string; employees: { id: string; name: string | null }[] };
    check('xodimlar API dan olindi', xj.manba === 'api' && xj.employees.length === 2, xodimlar.body.slice(0, 200));

    const bogla = await app.inject({
      method: 'PUT',
      url: `${base}/integrations/moizvonki/employees`,
      cookies: auth,
      payload: { xodimId: '501', seatId: azizSeat },
    });
    check('Aziz bog\'landi', bogla.statusCode === 200);

    // ═══ D: SINXRONLASH ═══
    console.log('\n— D: sinxronlash —');
    const [s1] = await sinxronla(businessId);
    check('5 ta qo\'ng\'iroq olindi', s1?.olindi === 5, JSON.stringify(s1));
    check('3 tasi saqlandi (javobsiz va qisqa emas)', s1?.saqlandi === 3, JSON.stringify(s1));
    check('javobsiz 1, qisqa 1', s1?.javobsiz === 1 && s1?.qisqa === 1);
    check('bog\'lanmagan xodim qo\'ng\'irog\'i hisoblandi', s1?.boglanmagan === 1);

    const suhbatlar = await withoutTenantIsolation('test: suhbatlarni o\'qish', (tx) =>
      tx.select().from(conversation).where(and(eq(conversation.businessId, businessId), eq(conversation.externalSource, 'moizvonki'))),
    );
    const c1001 = suhbatlar.find((c) => c.externalId === 'mz:1001');
    const c1004 = suhbatlar.find((c) => c.externalId === 'mz:1004');
    const c1005 = suhbatlar.find((c) => c.externalId === 'mz:1005');
    check('1001 Aziz\'ga tegishli', c1001?.seatId === azizSeat);
    check('1001 kiruvchi, telefon kanali', c1001?.direction === 'inbound' && c1001?.channel === 'phone');
    check('1004 menejersiz kutmoqda', c1004?.seatId === null && c1004?.externalUserId === '777');
    check('qaytgan mijoz — BITTA kontakt', Boolean(c1001?.contactId) && c1001?.contactId === c1005?.contactId);

    const kontaktlar = await withoutTenantIsolation('test: kontaktlar', (tx) =>
      tx.select({ id: contact.id }).from(contact).where(eq(contact.businessId, businessId)),
    );
    check('2 xil mijoz → 2 kontakt', kontaktlar.length === 2, `soni ${kontaktlar.length}`);

    // Takroriy sinxronlash — hech narsa ikki marta tushmaydi.
    const [s2] = await sinxronla(businessId);
    check('qayta sinxronlash yangi qo\'ng\'iroq bermaydi', s2?.olindi === 0 && s2?.saqlandi === 0, JSON.stringify(s2));
    const oxirgiSorov = [...kelganSorovlar].reverse().find((s) => s.action === 'calls.list');
    check('keyingi so\'rov from_id bilan (sana emas)', oxirgiSorov?.from_id === 1005, JSON.stringify(oxirgiSorov));

    // ═══ E: BAHOLASH ═══
    console.log('\n— E: baholash —');
    const q1 = await qongiroqlarniQaytaIshla({ businessId, stt: soxtaStt, llm: soxtaLlm, limit: 10 });
    check('2 ta qo\'ng\'iroq baholandi (Aziz\'niki)', q1.baholandi === 2 && q1.xato === 0, JSON.stringify(q1));
    check('STT haqiqiy yozuvni oldi', sttChaqiruvlar.length === 2 && sttChaqiruvlar.every((b) => b > 0));

    const [c1001b] = await withoutTenantIsolation('test: holat', (tx) =>
      tx.select({ status: conversation.status, kind: conversation.mediaKind }).from(conversation).where(eq(conversation.id, c1001!.id)),
    );
    check('1001 holati done', c1001b?.status === 'done', String(c1001b?.status));

    const [tahlil] = await withoutTenantIsolation('test: tahlil', (tx) =>
      tx.select({ id: analysis.id, method: analysis.speakerAttributionMethod }).from(analysis).where(eq(analysis.conversationId, c1001!.id)),
    );
    check('rol aniqlash usuli halol: llm_inferred', tahlil?.method === 'llm_inferred', String(tahlil?.method));

    const ballar = await withoutTenantIsolation('test: ballar', (tx) =>
      tx.select({ code: criterionScore.criterionCode, score: criterionScore.score }).from(criterionScore).where(eq(criterionScore.analysisId, tahlil!.id)),
    );
    const a1 = ballar.find((b) => b.code === 'A1');
    const a2 = ballar.find((b) => b.code === 'A2');
    check('isbotli ball qoldi (A1 = 2)', a1?.score === 2, JSON.stringify(ballar));
    check('isbotsiz ball BEKOR qilindi (A2 = null)', a2 !== undefined && a2.score === null, JSON.stringify(a2));

    const [c1004b] = await withoutTenantIsolation('test: kutayotgan', (tx) =>
      tx.select({ status: conversation.status }).from(conversation).where(eq(conversation.id, c1004!.id)),
    );
    check('menejersiz qo\'ng\'iroq baholanMAdi (pul sarflanmadi)', c1004b?.status === 'received');

    // ═══ F: KEYINROQ BOG'LASH ═══
    console.log('\n— F: keyinroq bog\'lash —');
    const bogla2 = await app.inject({
      method: 'PUT',
      url: `${base}/integrations/moizvonki/employees`,
      cookies: auth,
      payload: { xodimId: '777', seatId: nodiraSeat },
    });
    check('Nodira bog\'landi va kutayotgan 1 ta o\'tdi', bogla2.statusCode === 200 && bogla2.json().otkazildi === 1, bogla2.body);

    const q2 = await qongiroqlarniQaytaIshla({ businessId, stt: soxtaStt, llm: soxtaLlm, limit: 10 });
    check('endi uniki ham baholandi', q2.baholandi === 1, JSON.stringify(q2));

    // ═══ F2: BITTA MENEJER — IKKI MOI ZVONKI HISOBI ═══
    console.log('\n— F2: bitta menejerga ikki xodim —');
    check('mzIdlar: eski bitta qiymat', JSON.stringify(mzIdlar({ moizvonki: '501' })) === '["501"]');
    check('mzIdlar: ro\'yxat va bo\'sh joylar', JSON.stringify(mzIdlar({ moizvonki: '501, 777' })) === '["501","777"]');
    check('mzIdlar: kalit yo\'q', mzIdlar({}).length === 0 && mzIdlar(null).length === 0);

    const ikkinchi = await app.inject({
      method: 'PUT',
      url: `${base}/integrations/moizvonki/employees`,
      cookies: auth,
      payload: { xodimId: '777', seatId: azizSeat },
    });
    const orinExt = async (id: string) =>
      (await withoutTenantIsolation('test: o\'rin bog\'lanishi', (tx) =>
        tx.select({ ext: seat.externalIds }).from(seat).where(eq(seat.id, id)),
      ))[0]?.ext;
    check('ikkinchi xodim Aziz\'ga qo\'shildi', ikkinchi.statusCode === 200 && JSON.stringify(mzIdlar(await orinExt(azizSeat)).sort()) === '["501","777"]', JSON.stringify(await orinExt(azizSeat)));
    check('777 Nodira\'dan olib tashlandi (bir xodim — bir menejer)', mzIdlar(await orinExt(nodiraSeat)).length === 0, JSON.stringify(await orinExt(nodiraSeat)));

    const xj3 = (await app.inject({ method: 'GET', url: `${base}/integrations/moizvonki/employees`, cookies: auth })).json() as {
      employees: { id: string; seatId: string | null }[];
    };
    check(
      'xodimlar ro\'yxatida ikkalasi ham Aziz\'ga bog\'langan ko\'rinadi',
      xj3.employees.every((x) => x.seatId === azizSeat),
      JSON.stringify(xj3.employees),
    );

    // Bittasini qaytarib o'tkazish — ikkinchisi joyida qolishi kerak.
    await app.inject({ method: 'PUT', url: `${base}/integrations/moizvonki/employees`, cookies: auth, payload: { xodimId: '777', seatId: nodiraSeat } });
    // Xato bog'lashni tuzatish — tarix bilan ko'chirish.
    const egasi = async (jadval: 'conversation' | 'analysis' | 'criterion_score') =>
      (await withoutTenantIsolation('test: suhbat egasini tekshirish', (tx) =>
        tx.execute(sql`select t.seat_id::text as s, count(*)::int as n from ${sql.raw(jadval)} t
          join conversation c on c.id = ${sql.raw(jadval === 'conversation' ? 't.id' : 't.conversation_id')}
          where c.business_id = ${businessId} and c.external_user_id = '501' group by 1`),
      )) as unknown as { s: string; n: number }[];
    const tarixsiz = await app.inject({ method: 'PUT', url: `${base}/integrations/moizvonki/employees`, cookies: auth, payload: { xodimId: '501', seatId: nodiraSeat } });
    check(
      'tarixsiz o\'tkazish — baholangan suhbatlar eski menejerda qoladi',
      tarixsiz.json().kochirildi === 0 && (await egasi('conversation')).every((r) => r.s === azizSeat),
      JSON.stringify(await egasi('conversation')),
    );
    const tarixli = await app.inject({
      method: 'PUT',
      url: `${base}/integrations/moizvonki/employees`,
      cookies: auth,
      payload: { xodimId: '501', seatId: nodiraSeat, tarixniKochir: true },
    });
    const kochdi = tarixli.json() as { kochirildi: number };
    check('tarix bilan — qo\'ng\'iroqlar ko\'chdi', kochdi.kochirildi > 0, tarixli.body);
    for (const j of ['conversation', 'analysis', 'criterion_score'] as const) {
      const r = await egasi(j);
      check(`tarix bilan — ${j} to'liq Nodira'da`, r.length > 0 && r.every((x) => x.s === nodiraSeat), JSON.stringify(r));
    }
    // Qaytarish — keyingi bo'limlar avvalgi holatni kutadi.
    await app.inject({ method: 'PUT', url: `${base}/integrations/moizvonki/employees`, cookies: auth, payload: { xodimId: '501', seatId: azizSeat, tarixniKochir: true } });

    check('777 qaytdi, 501 Aziz\'da qoldi', JSON.stringify(mzIdlar(await orinExt(azizSeat))) === '["501"]' && JSON.stringify(mzIdlar(await orinExt(nodiraSeat))) === '["777"]');

    // ═══ G: XATO YO'LI ═══
    console.log('\n— G: xato yo\'li —');
    QONGIROQLAR.push({ db_call_id: 1006, direction: 0, client_number: '998977777777', start_time: soat + 500, end_time: soat + 560, duration: 60, answered: 1, recording: `http://127.0.0.1:${port}/yoq/1006.mp3`, user_id: 501 });
    // Soxta server /yoq/ uchun 404 qaytaradi — yozuv yuklanmaydi.
    await sinxronla(businessId);
    const q3 = await qongiroqlarniQaytaIshla({ businessId, stt: soxtaStt, llm: soxtaLlm, limit: 10 });
    check('yuklanmagan yozuv → failed, sikl yiqilmadi', q3.xato === 1, JSON.stringify(q3));
    const f1006 = (await withoutTenantIsolation('test: 1006 urinishlari', (tx) =>
      tx.select({ f: conversation.failCount }).from(conversation).where(eq(conversation.externalId, 'mz:1006')),
    ))[0]?.f;
    check('haqiqiy xato urinishlar sonini oshiradi (0 → 1)', f1006 === 1, `fail_count: ${f1006}`);

    const holat2 = await app.inject({ method: 'GET', url: `${base}/integrations/moizvonki`, cookies: auth });
    const h2 = holat2.json() as { counts: { baholandi: number; xato: number }; recentErrors: unknown[] };
    check('holatda hisoblar to\'g\'ri', h2.counts.baholandi === 3 && h2.counts.xato === 1, JSON.stringify(h2.counts));
    check('xato sababi ko\'rinadi', h2.recentErrors.length === 1);

    const qayta = await app.inject({ method: 'POST', url: `${base}/integrations/moizvonki/retry`, cookies: auth });
    const f1006b = (await withoutTenantIsolation('test: 1006 urinishlari', (tx) =>
      tx.select({ f: conversation.failCount }).from(conversation).where(eq(conversation.externalId, 'mz:1006')),
    ))[0]?.f;
    check('xatolilar qayta navbatga qo\'yildi, urinishlar 0 ga qaytdi', qayta.json().requeued === 1 && f1006b === 0, `fail_count: ${f1006b}`);

    // ═══ G2: AI LIMITI, KUNLIK LIMIT, OSILGAN QO'NG'IROQ ═══
    console.log('\n— G2: limitlar —');
    check('limitXatosimi: 429 / RESOURCE_EXHAUSTED', limitXatosimi("LLM so'rovi muvaffaqiyatsiz (429, gemini-2.5-flash): RESOURCE_EXHAUSTED"));
    check(
      'limitXatosimi: oddiy xatolar limit emas',
      !limitXatosimi("LLM so'rovi muvaffaqiyatsiz (400, x): bad request") && !limitXatosimi('Yozuvda nutq topilmadi'),
    );

    // 1006 (buzuq yozuv) bu bo'limga aralashmasin.
    // `failed` — urinishlari tugagan holda: aks holda avtomatik qayta urinish
    // (G6) uni darhol navbatga qaytarib, bu bo'limga aralashtirardi.
    const holatiniQoy = (extId: string, status: 'failed' | 'transcribing' | 'analyzing' | 'received', updatedAt = new Date()) =>
      withoutTenantIsolation('test: holatni qo\'yish', (tx) =>
        tx
          .update(conversation)
          .set({ status, updatedAt, ...(status === 'failed' ? { failCount: MAX_URINISH } : {}) })
          .where(eq(conversation.externalId, extId)),
      );
    const holatlar = async (...idlar: string[]) =>
      (await withoutTenantIsolation('test: holatlar', (tx) =>
        tx.select({ e: conversation.externalId, s: conversation.status }).from(conversation).where(eq(conversation.businessId, businessId)),
      )).filter((r) => idlar.includes(r.e ?? '')).map((r) => r.s);
    await holatiniQoy('mz:1006', 'failed');

    const yangiYozuv = (id: number) => `http://127.0.0.1:${port}/rec/${id}.mp3`;
    QONGIROQLAR.push(
      { db_call_id: 1007, direction: 0, client_number: '998971111111', start_time: soat + 600, end_time: soat + 680, duration: 80, answered: 1, recording: yangiYozuv(1007), user_id: 501 },
      { db_call_id: 1008, direction: 0, client_number: '998972222222', start_time: soat + 700, end_time: soat + 790, duration: 90, answered: 1, recording: yangiYozuv(1008), user_id: 501 },
    );
    await sinxronla(businessId);

    // AI limiti — xato emas, pauza; qo'ng'iroqlar navbatda qoladi.
    const limitLlm: LlmClient = {
      async completeJson() {
        throw new Error("LLM so'rovi muvaffaqiyatsiz (429, gemini-2.5-flash): RESOURCE_EXHAUSTED quota exceeded");
      },
    };
    const p1 = await qongiroqlarniQaytaIshla({ businessId, stt: soxtaStt, llm: limitLlm, limit: 10 });
    // Nomzodlar parallel bajariladi: bir partiyadagi barchasi limitga birga
    // urilishi mumkin, shuning uchun pauza soni >= 1. Muhimi — hech biri
    // «xato» bo'lmaydi va baholanmaydi (navbatga qaytadi).
    check('AI limiti: «xato» emas — pauza', p1.pauza >= 1 && p1.xato === 0 && p1.baholandi === 0, JSON.stringify(p1));
    const navbat = await holatlar('mz:1007', 'mz:1008');
    check("ikkala qo'ng'iroq navbatda qoldi", navbat.length === 2 && navbat.every((s) => s === 'received'), JSON.stringify(navbat));
    check('pauza qo\'yildi', baholashPauzasi(businessId) !== null);
    const p2 = await qongiroqlarniQaytaIshla({ businessId, stt: soxtaStt, llm: soxtaLlm, limit: 10 });
    check('pauza davomida hech narsa olinmaydi (GPU/AI behuda yonmaydi)', p2.qayta === 0, JSON.stringify(p2));
    const hp = (await app.inject({ method: 'GET', url: `${base}/integrations/moizvonki`, cookies: auth })).json() as { pauza: { gacha: string } | null };
    check('holat API pauzani ko\'rsatadi', hp.pauza !== null);
    pauzalarniTozala();

    // Kunlik limit — bugungi soni + 1: faqat bittasi o'tadi, ikkinchisi ertaga.
    const bugun = await bugunBaholangan(businessId);
    const sozla = (dailyLimit: number | null) =>
      app.inject({
        method: 'PUT',
        url: `${base}/integrations/moizvonki`,
        cookies: auth,
        payload: { domain: 'https://kompaniya.moizvonki.ru/', userName: 'Admin@Kompaniya.uz', minDurationSeconds: 20, backfillDays: 1, dailyLimit },
      });
    check('kunlik limit saqlandi', (await sozla(bugun + 1)).statusCode === 200);
    const p3 = await qongiroqlarniQaytaIshla({ businessId, stt: soxtaStt, llm: soxtaLlm, limit: 10 });
    check('kunlik limit: faqat 1 tasi baholandi', p3.baholandi === 1 && p3.qayta === 1, JSON.stringify(p3));
    const p4 = await qongiroqlarniQaytaIshla({ businessId, stt: soxtaStt, llm: soxtaLlm, limit: 10 });
    check('limit tugadi — qolgani navbatda kutadi', p4.qayta === 0 && (await holatlar('mz:1007', 'mz:1008')).includes('received'));
    const hl = (await app.inject({ method: 'GET', url: `${base}/integrations/moizvonki`, cookies: auth })).json() as {
      bugunBaholandi: number;
      config: { dailyLimit: number | null };
    };
    check('holat API: bugun baholangan va limit', hl.bugunBaholandi === bugun + 1 && hl.config.dailyLimit === bugun + 1, JSON.stringify({ b: hl.bugunBaholandi, l: hl.config.dailyLimit }));
    await sozla(null);
    const p5 = await qongiroqlarniQaytaIshla({ businessId, stt: soxtaStt, llm: soxtaLlm, limit: 10 });
    check('limit olib tashlangach qolgani ham baholandi', p5.baholandi === 1, JSON.stringify(p5));

    // Osilgan qo'ng'iroq — server ishlov o'rtasida to'xtagandek.
    await holatiniQoy('mz:1006', 'transcribing', new Date(Date.now() - 20 * 60_000));
    const qaytdi = await osilganlarniQaytar();
    check("20 daqiqa osilgan qo'ng'iroq navbatga qaytdi", qaytdi === 1 && (await holatlar('mz:1006'))[0] === 'received', `qaytdi: ${qaytdi}`);
    await holatiniQoy('mz:1006', 'transcribing');
    check("hozirgina egallangani TEGILMAYDI", (await osilganlarniQaytar()) === 0);
    // Baholash (LLM) uzoq davom etadi — 15 daqiqada tortib olinmasligi kerak.
    await holatiniQoy('mz:1006', 'analyzing', new Date(Date.now() - 20 * 60_000));
    check("baholanayotgani 20 daqiqada TEGILMAYDI (GLM uzoq o'ylaydi)", (await osilganlarniQaytar()) === 0);
    await holatiniQoy('mz:1006', 'analyzing', new Date(Date.now() - 35 * 60_000));
    check("baholash 35 daqiqa osilgani navbatga qaytdi", (await osilganlarniQaytar()) === 1);
    await holatiniQoy('mz:1006', 'failed');

    // ═══ G3: STT BAHOLASHNI KUTMAYDI ═══
    console.log('\n— G3: oldindan transkript (STT ↔ LLM ajratilgan) —');
    QONGIROQLAR.push(
      { db_call_id: 1009, direction: 0, client_number: '998973333333', start_time: soat + 800, end_time: soat + 880, duration: 80, answered: 1, recording: yangiYozuv(1009), user_id: 501 },
      { db_call_id: 1010, direction: 0, client_number: '998974444444', start_time: soat + 900, end_time: soat + 990, duration: 90, answered: 1, recording: yangiYozuv(1010), user_id: 501 },
    );
    await sinxronla(businessId);
    const sttMalumot = async (...idlar: string[]) =>
      (await withoutTenantIsolation('test: stt natijasi', (tx) =>
        tx
          .select({ e: conversation.externalId, s: conversation.status, r: conversation.sttResult, b: conversation.mediaBytes })
          .from(conversation)
          .where(eq(conversation.businessId, businessId)),
      )).filter((r) => idlar.includes(r.e ?? ''));
    /** Chaqirilsa test yiqiladi — baholash bosqichi STT'ni qayta ishlatmasligini isbotlaydi. */
    const portlovchiStt: SttClient = {
      async transcribe() {
        throw new Error("STT qayta chaqirilmasligi kerak edi");
      },
    };

    const bosh = await qongiroqlarniQaytaIshla({ businessId, stt: portlovchiStt, llm: soxtaLlm, limit: 10, faqatTranskriptlangan: true });
    check("faqatTranskriptlangan: transkripti yo'qlar olinmaydi", bosh.qayta === 0, JSON.stringify(bosh));

    const t1 = await oldindanTranskriptQil({ businessId, stt: soxtaStt, limit: 10 });
    const g1 = await sttMalumot('mz:1009', 'mz:1010');
    check('oldindan transkript: ikkalasi transkript qilindi', t1.transkript === 2 && t1.xato === 0, JSON.stringify(t1));
    check(
      "transkript saqlandi, qo'ng'iroq navbatda (baholanmagan)",
      g1.length === 2 && g1.every((r) => r.s === 'received' && r.r !== null),
      JSON.stringify(g1.map((r) => ({ e: r.e, s: r.s, bor: r.r !== null }))),
    );
    const t2 = await oldindanTranskriptQil({ businessId, stt: portlovchiStt, limit: 10 });
    check("qayta ishga tushganda tayyorlari QAYTA transkript qilinmaydi", t2.transkript === 0 && t2.xato === 0, JSON.stringify(t2));

    const b1 = await qongiroqlarniQaytaIshla({ businessId, stt: portlovchiStt, llm: soxtaLlm, limit: 10, faqatTranskriptlangan: true });
    const g2 = await sttMalumot('mz:1009', 'mz:1010');
    check('baholash saqlangan transkriptdan (STT chaqirilmadi)', b1.baholandi === 2 && b1.xato === 0, JSON.stringify(b1));
    check(
      "baholangach holat done, audio hajmi transkriptdan yozildi",
      g2.every((r) => r.s === 'done' && (r.b ?? 0) > 0),
      JSON.stringify(g2.map((r) => ({ e: r.e, s: r.s, b: r.b }))),
    );

    // Javob kesilsa — BIR MARTA `high` bilan qayta so'raladi, cheksiz emas.
    const pbk = await loadActivePlaybookAndBusiness(businessId);
    const segs = [
      { seq: 0, text: 'Assalomu alaykum, IT Live akademiyasi, eshitaman.', startSeconds: 0, endSeconds: 3 },
      { seq: 1, text: 'Salom, frontend kursi narxi qancha?', startSeconds: 3, endSeconds: 6 },
    ];
    const kesiluvchi = (necha: number, effortlar: (string | undefined)[]): LlmClient => ({
      async completeJson(req) {
        effortlar.push(req.reasoningEffort);
        if (effortlar.length <= necha) throw new Error('LLM javobi kesildi (max_tokens): glm-5.3-flash');
        return soxtaLlm.completeJson(req);
      },
    });
    const e1: (string | undefined)[] = [];
    const k1 = await refineAndAnalyzeTranscript(segs, pbk!.body, pbk!.businessContext, undefined, kesiluvchi(1, e1));
    check(
      "javob kesilsa 'high' bilan qayta so'raladi va muvaffaqiyatli",
      e1.length === 2 && e1[0] === undefined && e1[1] === 'high' && k1.model.endsWith('@high'),
      JSON.stringify({ e1, model: k1.model }),
    );
    const e2: (string | undefined)[] = [];
    const k2 = await refineAndAnalyzeTranscript(segs, pbk!.body, pbk!.businessContext, undefined, kesiluvchi(9, e2)).catch((e: Error) => e);
    check(
      "'high' ham kesilsa — to'xtaydi (3-urinish va behuda token yo'q)",
      k2 instanceof Error && e2.length === 2,
      JSON.stringify({ urinishlar: e2.length }),
    );

    // ═══ G4: AI BO'SH REPLIKA QAYTARSA ═══
    // 2026-10-22..27: GLM uzun dialogda bitta replikani `""` qaytarardi va
    // `min(1)` butun javobni rad etib, qo'ng'iroq abadiy `failed` bo'lardi.
    console.log("\n— G4: bo'sh replika —");
    const besh = (await soxtaStt.transcribe({ audio: Buffer.from('x'), mimeType: 'audio/mpeg' } as never)).utterances.map(
      (u, seq) => ({ seq, text: u.text, startSeconds: u.startSeconds, endSeconds: u.endSeconds }),
    );
    const boshReplikali: LlmClient = {
      async completeJson(req) {
        const r = await soxtaLlm.completeJson(req);
        const j = r.json as { turns: { text: string }[] };
        j.turns[3]!.text = '';
        j.turns[1]!.text = '   ';
        return r;
      },
    };
    const br = await refineAndAnalyzeTranscript(besh, pbk!.body, pbk!.businessContext, undefined, boshReplikali).catch(
      (e: Error) => e,
    );
    check(
      "bo'sh replika natijani buzmaydi — asl STT matni bilan to'ldiriladi",
      !(br instanceof Error) &&
        br.turns.length === 5 &&
        br.turns.every((t) => t.text.trim().length > 0) &&
        br.turns[3]!.text === besh[3]!.text &&
        /2 ta replika AI javobida bo'sh/.test(br.transcriptNote),
      br instanceof Error ? br.message.slice(0, 200) : JSON.stringify(br.turns.map((t) => t.text.slice(0, 15))),
    );

    // ═══ G5: YOZUVI KECH YUKLANGAN QO'NG'IROQ ═══
    // Xodim Moi Zvonki ilovasiga kech kirsa, qo'ng'iroq ro'yxatda yozuvsiz
    // paydo bo'ladi, yozuv esa keyin. Kursor undan o'tib ketadi — ilgari bu
    // qo'ng'iroq hech qachon olinmasdi.
    console.log('\n— G5: kech yuklangan yozuv —');
    const eskiT = Math.floor(Date.now() / 1000) - 25 * 3600;
    QONGIROQLAR.push(
      { db_call_id: 1011, direction: 1, client_number: '998973333333', start_time: soat + 900, end_time: soat + 960, duration: 60, answered: 1, recording: null, user_id: 501 },
      { db_call_id: 1012, direction: 1, client_number: '998974444444', start_time: eskiT, end_time: eskiT + 60, duration: 60, answered: 1, recording: null, user_id: 501 },
      // Yozuvsiz, lekin qisqa — kutilmaydi.
      { db_call_id: 1013, direction: 1, client_number: '998975555555', start_time: soat + 950, end_time: soat + 955, duration: 5, answered: 1, recording: null, user_id: 501 },
    );
    const borMi = async (extId: string) =>
      (await withoutTenantIsolation('test: suhbat bormi', (tx) =>
        tx.select({ s: conversation.status }).from(conversation).where(and(eq(conversation.businessId, businessId), eq(conversation.externalId, extId))),
      ))[0]?.s ?? null;
    const k5a = await sinxronla(businessId).then((r) => r[0]);
    check(
      'yozuvsiz 3 ta, uzunlari (2 ta) kutish ro\'yxatida, bazaga tushmadi',
      k5a?.yozuvsiz === 3 && k5a.yozuvKutilmoqda === 2 && (await borMi('mz:1011')) === null,
      JSON.stringify(k5a),
    );
    for (const q of QONGIROQLAR) {
      if ([1011, 1012, 1013].includes(Number(q.db_call_id))) q.recording = yangiYozuv(Number(q.db_call_id));
    }
    const k5b = await sinxronla(businessId).then((r) => r[0]);
    check(
      'yozuv paydo bo\'lgach — keyingi sinxronlashda olindi',
      k5b?.kechYozuv === 1 && (await borMi('mz:1011')) === 'received',
      JSON.stringify(k5b),
    );
    check(
      "24 soatdan eski kutish unutildi, qisqasi umuman kutilmadi",
      k5b?.yozuvKutilmoqda === 0 && (await borMi('mz:1012')) === null && (await borMi('mz:1013')) === null,
      JSON.stringify(k5b),
    );
    const k5c = await sinxronla(businessId).then((r) => r[0]);
    check('qayta sinxronlash ikki marta saqlamaydi', k5c?.saqlandi === 0 && k5c.kechYozuv === 0, JSON.stringify(k5c));
    const kursorSorov = [...kelganSorovlar].reverse().find((s) => s.action === 'calls.list');
    check('asosiy kursor joyida (eng oxirgi ID dan)', kursorSorov?.from_id === 1013, JSON.stringify(kursorSorov));

    // ═══ G6: XATO BILAN TUGAGAN QO'NG'IROQ QAYTA URINILADI ═══
    console.log('\n— G6: avtomatik qayta urinish —');
    const xatoQoy = (extId: string, failCount: number, oldin: number) =>
      withoutTenantIsolation('test: xato holatini qo\'yish', (tx) =>
        tx
          .update(conversation)
          .set({ status: 'failed', failCount, excludedReason: 'fetch failed', updatedAt: new Date(Date.now() - oldin * 60_000) })
          .where(eq(conversation.externalId, extId)),
      );
    const failSoni = async (extId: string) =>
      (await withoutTenantIsolation('test: urinishlar', (tx) =>
        tx.select({ f: conversation.failCount, s: conversation.status, r: conversation.excludedReason }).from(conversation).where(eq(conversation.externalId, extId)),
      ))[0];
    // `osilganlarniQaytar` butun baza bo'ylab ishlaydi — soniga emas, aynan
    // shu qo'ng'iroq holatiga qaraymiz.
    const supur = async () => {
      await osilganlarniQaytar();
      return (await failSoni('mz:1011'))?.s;
    };
    await xatoQoy('mz:1011', 0, 1);
    check("eski (urinish=0) failed darhol navbatga qaytadi", (await supur()) === 'received');
    check('qaytganda eski xato matni tozalandi', (await failSoni('mz:1011'))?.r === null);
    await xatoQoy('mz:1011', 1, 10);
    check('1-urinishdan 10 daqiqa o\'tgan — hali kutadi (15 daq)', (await supur()) === 'failed');
    await xatoQoy('mz:1011', 1, 16);
    check('1-urinishdan 16 daqiqa o\'tgan — qaytadi', (await supur()) === 'received');
    await xatoQoy('mz:1011', 2, 20);
    check('2-urinishdan 20 daqiqa — hali kutadi (30 daq)', (await supur()) === 'failed');
    await xatoQoy('mz:1011', MAX_URINISH, 600);
    check(`${MAX_URINISH} urinishdan keyin failed da qoladi`, (await supur()) === 'failed');

    // ═══ H: ADMIN HUQUQI YO'Q ═══
    console.log('\n— H: admin huquqisiz —');
    ruxsatAdmin = false;
    const xodimlar2 = await app.inject({ method: 'GET', url: `${base}/integrations/moizvonki/employees`, cookies: auth });
    const xj2 = xodimlar2.json() as { manba: string; employees: { id: string }[] };
    check('qo\'ng\'iroqlardan topilganlar ko\'rsatiladi', xodimlar2.statusCode === 200 && xj2.manba === 'qongiroqlar' && xj2.employees.length === 2, xodimlar2.body.slice(0, 200));

    // ═══ I: UZISH ═══
    const uz = await app.inject({ method: 'DELETE', url: `${base}/integrations/moizvonki`, cookies: auth });
    const [s3] = await sinxronla(businessId);
    check('uzilgach sinxronlash ishlamaydi', uz.statusCode === 200 && s3 === undefined);
  } finally {
    await app.close();
    server.close();
    await cleanupTestData(tag + TEST_EMAIL_DOMAIN);
    await closeDb();
  }

  console.log(
    yiqildi === 0
      ? `\nMoi Zvonki butun. ${otdi}/${otdi} tekshiruv o'tdi.`
      : `\n${yiqildi} ta tekshiruv yiqildi (${otdi} o'tdi).`,
  );
  process.exit(yiqildi > 0 ? 1 : 0);
}

void main();
