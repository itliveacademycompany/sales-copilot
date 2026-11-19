import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { and, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { cleanupTestDataQuietly } from '../../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../../db/index.js';
import { encryptSecret } from '../../crypto/secrets.js';
import { crmInbox, crmStage, deal, makeLeadIntake, metaCapiConfig, metaCapiEvent, metaFormSetting, metaLeadgenEvent, metaPageConnection } from '../../db/schema/index.js';
import { buildApp } from '../../http/app.js';
import { capiNavbatgaQoy, capiTanasi, capiYubor } from './capi.js';
import { xaritaniQolla } from './forma.js';
import { bazaPortlari, metaLidlariniIshla } from './ishlov.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META: FORMA SOZLAMASI + CONVERSIONS API — amoCRM bilan tenglik testi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:meta-forma-capi
 *
 * Haqiqiy baza va HTTP orqali (Make yo'li — bevosita Meta ham aynan shu
 * `metaLidiniYoz` dan o'tadi), Meta o'rniga soxta Graph server:
 *   A. sof: savol → kontakt/maydon xaritasi va taxmin; CAPI tanasi, xesh, lead_id
 *   B. forma: o'zi ro'yxatga tushadi, o'zbekcha "Ismingiz?/Telefon?" taniladi
 *   C. sozlash: voronka, bosqich, maydon, teg, manba, avto-taqsimot (round-robin)
 *   D. CAPI: token tekshiruvi, qoida, tarix himoyasi, yuborish, idempotentlik,
 *      no_contact, vaqtinchalik va doimiy xato, token javobda yo'q
 *
 * DIQQAT: dev-server shu bazada ishlab tursa, uning worker'i CAPI navbatini
 * test bilan bir vaqtda oladi — testni server to'xtatilgan holda ishga tushiring.
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
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ─── Soxta Meta Graph server ─────────────────────────────────────────────────
const DATASET = '987654321012345';
const TOKEN = `test-capi-token-${tag}-abcdefghijklmnop`;
/** Bevosita webhook yo'li uchun Meta lead ID (E bo'limi). */
const LEADGEN = `55${Date.now()}`;
let rejim: 'ok' | 'vaqtinchalik' | 'token' = 'ok';
const yuborilgan: { data: string; test_event_code: string | null }[] = [];
let port = 0;

function serverniOch(): Promise<Server> {
  return new Promise((ok) => {
    const s = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const u = new URL(req.url ?? '/', 'http://x');
        const yoz = (kod: number, j: unknown) => {
          res.writeHead(kod, { 'content-type': 'application/json' });
          res.end(JSON.stringify(j));
        };
        const token = u.searchParams.get('access_token') ?? new URLSearchParams(body).get('access_token');
        if (token !== TOKEN) return yoz(400, { error: { message: 'Invalid OAuth access token', code: 190 } });
        if (req.method === 'GET' && u.pathname.endsWith(`/${DATASET}`)) return yoz(200, { id: DATASET, name: 'IT Live Pixel' });
        if (req.method === 'GET' && u.pathname.endsWith(`/${LEADGEN}`)) {
          if (u.searchParams.get('fields')?.includes('ad_name')) return yoz(200, { ad_name: 'Kuz aksiyasi' });
          return yoz(200, {
            id: LEADGEN,
            created_time: new Date().toISOString(),
            form_id: '777001',
            field_data: [
              { name: 'ismingiz?', values: ['Bevosita Mijoz'] },
              { name: 'telefon_raqamingiz?', values: ['+998 93 555 44 33'] },
              { name: 'farzandingiz_nechi_yoshda?', values: ['11'] },
            ],
          });
        }
        if (req.method === 'POST' && u.pathname.endsWith(`/${DATASET}/events`)) {
          if (rejim === 'vaqtinchalik') return yoz(503, { error: { message: 'Service temporarily unavailable', code: 2 } });
          if (rejim === 'token') return yoz(400, { error: { message: 'Error validating access token', code: 190 } });
          const p = new URLSearchParams(body);
          yuborilgan.push({ data: p.get('data') ?? '', test_event_code: p.get('test_event_code') });
          return yoz(200, { events_received: 1, fbtrace_id: 'trace-1' });
        }
        yoz(404, { error: { message: 'not found', code: 803 } });
      });
    });
    s.listen(0, '127.0.0.1', () => {
      port = (s.address() as { port: number }).port;
      ok(s);
    });
  });
}

async function main(): Promise<void> {
  console.log('\nMeta: forma sozlamasi + Conversions API (amoCRM tengligi)\n');

  // ═══ A: SOF ═══
  console.log('— A: sof mantiq —');
  const x1 = xaritaniQolla(
    { name: null, phone: null, email: null },
    { 'ismingiz?': 'Aziza Karimova', 'telefon_raqamingiz?': '+998 90 123-45-67', 'farzandingiz_nechi_yoshda?': '9' },
    {},
  );
  check('taxmin: «Ismingiz?» → ism', x1.name === 'Aziza Karimova', String(x1.name));
  check('taxmin: «Telefon raqamingiz?» → telefon (tozalangan)', x1.phone === '+998901234567', String(x1.phone));
  check('taxmin: xaritasiz boshqa savol maydonga tushmaydi', Object.keys(x1.fields).length === 0);
  const x2 = xaritaniQolla({ name: null, phone: null, email: null }, { 'telefon_raqamingiz?': 'ertaga qo\'ng\'iroq qiling' }, {});
  check('taxmin: telefonga o\'xshamagan javob telefon emas', x2.phone === null);
  const x3 = xaritaniQolla(
    { name: 'Standart', phone: '+998911111111', email: null },
    { 'qo\'shimcha_raqam': '+998 93 000 00 00', yosh: '12', pochta: 'a@b.uz' },
    { 'qo\'shimcha_raqam': 'contact:phone', yosh: 'field:00000000-0000-0000-0000-000000000001' },
  );
  check('aniq xarita taxmindan ustun (telefon almashdi)', x3.phone === '+998930000000', String(x3.phone));
  check('aniq xarita: savol → CRM maydoni', x3.fields['00000000-0000-0000-0000-000000000001'] === '12');
  check('taxmin: email javob → email', x3.email === 'a@b.uz');

  const katta = '12345678901234567'; // > 2^53
  const t1 = capiTanasi({
    eventName: 'Purchase',
    eventId: 'dm.e.r',
    eventTime: new Date(),
    contactId: 'c1',
    phone: '+998 90 123-45-67',
    email: ' Ali@Mail.UZ ',
    name: 'Aziza Karimova',
    leadgenId: katta,
    amount: 1500000,
    sendValue: true,
    currency: 'UZS',
  });
  check('CAPI: tana yasaldi', 'data' in t1);
  if ('data' in t1) {
    check('CAPI: lead_id 2^53 dan katta — aniq, qo\'shtirnoqsiz', t1.data.includes(`"lead_id":${katta}`), t1.data.slice(0, 200));
    const j = JSON.parse(t1.data.replace(`"lead_id":${katta}`, '"lead_id":0'))[0];
    check('CAPI: telefon SHA-256 (faqat raqamlar)', j.user_data.ph[0] === sha('998901234567'));
    check('CAPI: email SHA-256 (kichik harf, bo\'shliqsiz)', j.user_data.em[0] === sha('ali@mail.uz'));
    check('CAPI: ism ochiq ketmaydi (fn/ln xesh)', j.user_data.fn[0] === sha('aziza') && j.user_data.ln[0] === sha('karimova'));
    check('CAPI: action_source=system_generated, value+currency', j.action_source === 'system_generated' && j.custom_data.value === 1500000 && j.custom_data.currency === 'UZS');
    check('CAPI: matchKeys qiymatsiz', JSON.stringify(t1.matchKeys) === '["ph","em","lead_id"]');
  }
  const t2 = capiTanasi({ eventName: 'Lead', eventId: 'x', eventTime: new Date(), contactId: null, phone: null, email: null, name: 'Faqat ism', leadgenId: null, amount: null, sendValue: false, currency: 'UZS' });
  check('CAPI: kontakt ma\'lumotisiz — no_contact', 'skip' in t2 && t2.skip === 'no_contact');
  const t3 = capiTanasi({ eventName: 'Lead', eventId: 'x', eventTime: new Date(Date.now() - 8 * 86400_000), contactId: null, phone: '+998901234567', email: null, name: null, leadgenId: null, amount: null, sendValue: false, currency: 'UZS' });
  check('CAPI: 7 kundan eski — too_old', 'skip' in t3 && t3.skip === 'too_old');
  const t4 = capiTanasi({ eventName: 'Lead', eventId: 'x', eventTime: new Date(), contactId: null, phone: '+998901234567', email: null, name: null, leadgenId: null, amount: 5, sendValue: false, currency: 'UZS' });
  check('CAPI: sendValue o\'chiq — summa yuborilmaydi', 'data' in t4 && !t4.data.includes('"value"'));

  // ═══ B–D: BAZA + HTTP ═══
  const server = await serverniOch();
  const eskiBase = process.env.META_GRAPH_BASE;
  process.env.META_GRAPH_BASE = `http://127.0.0.1:${port}`;
  const app: FastifyInstance = await buildApp();
  const email = `forma-capi-${tag}@test.local`;
  try {
    const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { email, password: 'juda-maxfiy-parol-123', displayName: 'Rahbar', businessName: `Forma CAPI ${tag}` } });
    const auth = { sid: reg.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    const businessId = (reg.json() as { businesses: { businessId: string }[] }).businesses[0]!.businessId;
    const base = `/api/v1/businesses/${businessId}`;
    const api = async <T = unknown>(method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', url: string, payload?: unknown) => {
      const r = await app.inject({ method, url: `${base}${url}`, cookies: auth, ...(payload !== undefined ? { payload: payload as object } : {}) });
      return { kod: r.statusCode, j: (r.body ? r.json() : null) as T, body: r.body };
    };
    const ichida = <T>(fn: (tx: Parameters<Parameters<typeof withoutTenantIsolation>[1]>[0]) => Promise<T>) => withoutTenantIsolation('test: natijani tekshirish', fn);

    const pipelineId = (await api<{ id: string }>('POST', '/pipelines', { name: 'Call-Center' })).j.id;
    const bosqichlar = await ichida((tx) => tx.select({ id: crmStage.id, name: crmStage.name }).from(crmStage).where(eq(crmStage.pipelineId, pipelineId)));
    const yangi = bosqichlar.find((b) => b.name === 'Yangi')!.id;
    const jarayonda = bosqichlar.find((b) => b.name === 'Jarayonda')!.id;
    const yutuq = bosqichlar.find((b) => b.name === 'Muvaffaqiyatli')!.id;
    const fieldId = (await api<{ id: string }>('POST', '/crm-fields', { label: 'Farzand yoshi', type: 'text' })).j.id;
    const s1 = (await api<{ id: string }>('POST', '/seats', { displayName: 'Maktuba' })).j.id;
    const s2 = (await api<{ id: string }>('POST', '/seats', { displayName: 'Muxlisa' })).j.id;

    const mk = await api<{ key: string; url: string }>('POST', '/make-leads');
    const intakeYoli = new URL(mk.j.url).pathname;
    const lid = (id: string, extra: Record<string, unknown> = {}) =>
      app.inject({
        method: 'POST',
        url: intakeYoli,
        headers: { 'x-api-key': mk.j.key, 'content-type': 'application/json' },
        payload: {
          external_lead_id: id,
          form_id: '777001',
          form_name: 'IT KIDS',
          page_name: 'ITlive OQUV Markazi',
          custom_fields: { 'ismingiz?': `Mijoz ${id.slice(-2)}`, 'telefon_raqamingiz?': `+998 90 ${id.slice(-3)} 12 34`, 'farzandingiz_nechi_yoshda?': '9' },
          ...extra,
        },
      });

    // ═══ B: FORMA O'ZI RO'YXATGA TUSHADI ═══
    console.log('\n— B: birinchi lid —');
    const r1 = await lid('12345678901234501');
    check('Make orqali lid qabul qilindi (201)', r1.statusCode === 201, r1.body.slice(0, 200));
    const [m1] = await ichida((tx) => tx.select().from(crmInbox).where(eq(crmInbox.externalId, 'lead:12345678901234501')));
    check('o\'zbekcha «Ismingiz?» → murojaat ismi', m1?.name === 'Mijoz 01', String(m1?.name));
    check('«Telefon raqamingiz?» → telefon va kontakt yaratildi', m1?.phone === '+998905011234' && !!m1.contactId, `${m1?.phone}`);
    const forms = await api<{ formalar: { id: string; formId: string; formName: string; questions: string[]; leadCount: number }[]; maydonlar: { id: string }[] }>('GET', '/meta-lead-ads/forms');
    const f = forms.j.formalar.find((x) => x.formId === '777001');
    check('forma o\'zi ro\'yxatga tushdi (savollar bilan)', !!f && f.formName === 'IT KIDS' && f.questions.length === 3 && f.leadCount === 1, JSON.stringify(f));
    check('formalar ro\'yxatida CRM maydonlari ham bor', forms.j.maydonlar.some((m) => m.id === fieldId));
    // Regressiya: `qayd()` Date'ni sql`` ichiga berib yiqilardi, catch yutardi — Make
    // kartasi "haqiqiy lid hali yo'q" va 0 ta lid ko'rsatib qolardi.
    const [mkq] = await ichida((tx) => tx.select().from(makeLeadIntake).where(eq(makeLeadIntake.businessId, businessId)));
    check('Make statistikasi yangilandi (leadCount, firstLeadAt, lastLeadAt)', mkq?.leadCount === 1 && !!mkq.firstLeadAt && !!mkq.lastLeadAt && !!mkq.lastRequestAt, JSON.stringify({ lc: mkq?.leadCount, f: mkq?.firstLeadAt }));

    // ═══ C: SOZLASH ═══
    console.log('\n— C: voronka, xarita, teg, avto-taqsimot —');
    const yomon = await api('PUT', `/meta-lead-ads/forms/${f!.id}`, { pipelineId, stageId: '00000000-0000-0000-0000-000000000000', mapping: {}, tags: [], sourceName: null, autoAccept: false, seatIds: [] });
    check('boshqa voronka bosqichi rad etiladi', yomon.kod === 400, yomon.body.slice(0, 150));
    const saqla = await api('PUT', `/meta-lead-ads/forms/${f!.id}`, {
      pipelineId,
      stageId: jarayonda,
      mapping: { 'farzandingiz_nechi_yoshda?': `field:${fieldId}` },
      tags: ['IT KIDS', 'Facebook'],
      sourceName: 'IT KIDS forma',
      autoAccept: true,
      seatIds: [s1, s2],
    });
    check('forma sozlamasi saqlandi', saqla.kod === 200, saqla.body.slice(0, 200));

    await lid('12345678901234502');
    await lid('12345678901234503');
    await lid('12345678901234504');
    const bitimlar = await ichida((tx) =>
      tx
        .select({ id: deal.id, pipelineId: deal.pipelineId, stageId: deal.stageId, fields: deal.fields, tags: deal.tags, source: deal.source, masul: deal.responsibleSeatId, nom: deal.name, inbox: crmInbox.externalId })
        .from(deal)
        .innerJoin(crmInbox, eq(crmInbox.dealId, deal.id))
        .where(eq(deal.businessId, businessId))
        .orderBy(deal.createdAt),
    );
    check('avto-qabul: 3 ta bitim (Saralanmagan\'da kutmadi)', bitimlar.length === 3, String(bitimlar.length));
    const b2 = bitimlar[0]!;
    check('voronka va bosqich — forma sozlamasidan', bitimlar.every((b) => b.pipelineId === pipelineId && b.stageId === jarayonda));
    check('savol → CRM maydoni', (b2.fields as Record<string, unknown>)[fieldId] === '9', JSON.stringify(b2.fields));
    check('teglar va manba nomi', JSON.stringify([...b2.tags].sort()) === JSON.stringify(['Facebook', 'IT KIDS']) && b2.source === 'IT KIDS forma', `${b2.tags} / ${b2.source}`);
    check('mas\'ul — haqiqiy navbat: Maktuba, Muxlisa, Maktuba', bitimlar.map((b) => b.masul).join() === [s1, s2, s1].join(), bitimlar.map((b) => (b.masul === s1 ? 'M1' : b.masul === s2 ? 'M2' : b.masul)).join());
    const takror = await lid('12345678901234502');
    const soni = await ichida((tx) => tx.select({ n: sql<number>`count(*)::int` }).from(deal).where(eq(deal.businessId, businessId)));
    check('takroriy lid — yangi bitim yo\'q', takror.statusCode === 200 && soni[0]!.n === 3);

    // ═══ D: CONVERSIONS API ═══
    console.log('\n— D: Conversions API —');
    const yomonToken = await api('PUT', '/meta-capi', { datasetId: DATASET, token: 'notogri-token-1234567890abcdef' });
    check('noto\'g\'ri token — Meta\'da tekshirilib rad etildi', yomonToken.kod === 400 && yomonToken.body.includes('Token'), yomonToken.body.slice(0, 160));
    const saqlandi = await api('PUT', '/meta-capi', { datasetId: DATASET, token: TOKEN });
    check('dataset + token saqlandi', saqlandi.kod === 200, saqlandi.body.slice(0, 160));
    const korinish = await api<{ sozlama: { datasetName: string; tokenHint: string } }>('GET', '/meta-capi');
    check('javobda token yo\'q, faqat niqob va dataset nomi', !korinish.body.includes(TOKEN) && korinish.j.sozlama.datasetName === 'IT Live Pixel');

    // Tarix himoyasi: bitimlar «Jarayonda»ga qoidadan OLDIN kirgan — yuborilmasligi kerak
    const tarixQoida = await api<{ id: string }>('POST', '/meta-capi/rules', { pipelineId, stageId: jarayonda, eventName: 'Lead', sendValue: false, currency: 'UZS' });
    const qoida = await api<{ id: string }>('POST', '/meta-capi/rules', { pipelineId, stageId: yutuq, eventName: 'Purchase', sendValue: true, currency: 'UZS' });
    check('qoidalar qo\'shildi', tarixQoida.kod === 200 && qoida.kod === 200);
    const dubl = await api('POST', '/meta-capi/rules', { pipelineId, stageId: yutuq, eventName: 'Purchase', sendValue: true, currency: 'UZS' });
    check('bir bosqichga bir xil hodisa ikki marta — 409', dubl.kod === 409);
    await capiNavbatgaQoy();
    const tarix = await ichida((tx) => tx.select({ n: sql<number>`count(*)::int` }).from(metaCapiEvent).where(eq(metaCapiEvent.businessId, businessId)));
    check('qoidadan oldingi bosqich hodisalari navbatga tushmadi', tarix[0]!.n === 0, String(tarix[0]!.n));

    await ichida((tx) => tx.update(deal).set({ amount: '1500000' }).where(eq(deal.id, b2.id)));
    const kochdi = await api('POST', `/deals/${b2.id}/move`, { stageId: yutuq });
    check('bitim «Muvaffaqiyatli»ga ko\'chdi', kochdi.kod === 200, kochdi.body.slice(0, 150));
    // Kontaktsiz bitim ham yutadi — no_contact
    const yalang = await api<{ id: string }>('POST', '/deals', { name: 'Kontaktsiz', pipelineId, stageId: yangi });
    await api('POST', `/deals/${yalang.j.id}/move`, { stageId: yutuq });

    const q1 = await capiNavbatgaQoy();
    check('ikkita bosqichga kirish navbatga tushdi', q1 === 2, String(q1));
    const q2 = await capiNavbatgaQoy();
    check('qayta navbat — takror yo\'q (idempotent)', q2 === 0);
    const y1 = await capiYubor();
    check('yuborish: 1 ta yuborildi, 1 ta o\'tkazildi', y1.yuborildi === 1 && y1.otkazildi === 1, JSON.stringify(y1));
    const yb = yuborilgan[0];
    const hodisa = yb ? JSON.parse(yb.data.replace(/"lead_id":\d+/, '"lead_id":0'))[0] : null;
    check('Meta\'ga: Purchase, summa, lead_id aniq', !!hodisa && hodisa.event_name === 'Purchase' && hodisa.custom_data.value === 1500000 && yb!.data.includes('"lead_id":12345678901234502'), yb?.data.slice(0, 220));
    check('Meta\'ga: telefon xeshlangan, ochiq telefon yo\'q', !!hodisa && hodisa.user_data.ph[0] === sha('998905021234') && !yb!.data.includes('998905021234'));
    const jurnal = await ichida((tx) => tx.select({ status: metaCapiEvent.status, reason: metaCapiEvent.reason, matchKeys: metaCapiEvent.matchKeys }).from(metaCapiEvent).where(eq(metaCapiEvent.businessId, businessId)));
    check('jurnal: sent (matchKeys) + skipped/no_contact', jurnal.some((j) => j.status === 'sent' && j.matchKeys.includes('lead_id')) && jurnal.some((j) => j.status === 'skipped' && j.reason === 'no_contact'), JSON.stringify(jurnal));
    check('qayta yuborishda — 0 (bir marta)', (await capiYubor()).yuborildi === 0);

    // Vaqtinchalik xato → navbatda qoladi; doimiy (token) → failed + kartada xato
    const b3 = bitimlar[1]!;
    await api('POST', `/deals/${b3.id}/move`, { stageId: yutuq });
    await capiNavbatgaQoy();
    rejim = 'vaqtinchalik';
    await capiYubor();
    const [v1] = await ichida((tx) => tx.select({ status: metaCapiEvent.status, attempts: metaCapiEvent.attempts }).from(metaCapiEvent).where(and(eq(metaCapiEvent.businessId, businessId), eq(metaCapiEvent.dealId, b3.id))));
    check('503 — navbatga qaytdi (qayta urinadi)', v1?.status === 'queued' && v1.attempts === 1, JSON.stringify(v1));
    rejim = 'token';
    await ichida((tx) => tx.update(metaCapiEvent).set({ runAfter: new Date() }).where(eq(metaCapiEvent.dealId, b3.id)));
    await capiYubor();
    const [v2] = await ichida((tx) => tx.select({ status: metaCapiEvent.status, reason: metaCapiEvent.reason }).from(metaCapiEvent).where(eq(metaCapiEvent.dealId, b3.id)));
    const [cfg] = await ichida((tx) => tx.select({ ok: metaCapiConfig.lastCheckOk, err: metaCapiConfig.lastError }).from(metaCapiConfig).where(eq(metaCapiConfig.businessId, businessId)));
    check('token xatosi — failed va kartada xato ko\'rinadi', v2?.status === 'failed' && cfg?.ok === 0 && !!cfg.err, JSON.stringify({ v2, cfg }));
    rejim = 'ok';
    const qayta = await api<{ qaytarildi: number }>('POST', '/meta-capi/resend');
    check('«Qayta yuborish» — failed qaytdi, no_contact qaytmadi', qayta.j.qaytarildi === 1, JSON.stringify(qayta.j));
    check('tuzatilgach yuborildi', (await capiYubor()).yuborildi === 1);

    const umumiy = await api<{ holatlar: { status: string; n: number }[]; oxirgi: unknown[] }>('GET', '/meta-capi');
    check('karta: holatlar va jurnal', umumiy.j.holatlar.some((h) => h.status === 'sent') && umumiy.j.oxirgi.length === 3);
    // Bitim o'chirilsa (yoki forma tashqariga) — RLS: boshqa biznes ko'rmaydi (forma jadvali tenant'da)
    const [fs1] = await ichida((tx) => tx.select({ lc: metaFormSetting.leadCount }).from(metaFormSetting).where(eq(metaFormSetting.businessId, businessId)));
    check('forma hisoblagichi: 4 ta yangi lid', fs1?.lc === 4, String(fs1?.lc));

    // ═══ E: BEVOSITA META WEBHOOK YO'LI (worker, haqiqiy baza) ═══
    // Regressiya: `natijaniYoz` Date'ni sql`` ichiga berardi — tranzaksiya qaytib,
    // hodisa "processing"da qotardi va sahifa statistikasi hech yangilanmasdi.
    console.log('\n— E: bevosita Meta webhook yo\'li —');
    const [ulanish] = await ichida((tx) =>
      tx
        .insert(metaPageConnection)
        .values({ businessId, pageId: 'page-e2e', pageName: 'ITlive OQUV Markazi', status: 'active', forms: [{ id: '777001', name: 'IT KIDS' }], pageTokenEncrypted: encryptSecret(TOKEN) })
        .returning({ id: metaPageConnection.id }),
    );
    await ichida((tx) => tx.insert(metaLeadgenEvent).values({ businessId, connectionId: ulanish!.id, pageId: 'page-e2e', leadgenId: LEADGEN, formId: '777001' }));
    const asl = bazaPortlari();
    // Kompaniya Meta ilovasi (App Secret) bu testda yo'q — faqat shu qismi almashtiriladi
    const son = await metaLidlariniIshla({ ...asl, ulanish: async (b, c) => { const u = await asl.ulanish(b, c); return u && { ...u, appSecret: 'sinov-app-secret' }; } });
    const [hod] = await ichida((tx) => tx.select({ status: metaLeadgenEvent.status, inboxId: metaLeadgenEvent.inboxId }).from(metaLeadgenEvent).where(eq(metaLeadgenEvent.leadgenId, LEADGEN)));
    check('webhook hodisasi → done (processing\'da qotmadi)', son.done === 1 && hod?.status === 'done', JSON.stringify({ son, hod }));
    const [ul] = await ichida((tx) => tx.select({ f: metaPageConnection.firstLeadAt, l: metaPageConnection.lastLeadAt }).from(metaPageConnection).where(eq(metaPageConnection.id, ulanish!.id)));
    check('sahifa statistikasi yangilandi (firstLeadAt, lastLeadAt)', !!ul?.f && !!ul.l, JSON.stringify(ul));
    const [m5] = await ichida((tx) => tx.select({ name: crmInbox.name, status: crmInbox.status, dealId: crmInbox.dealId }).from(crmInbox).where(eq(crmInbox.externalId, `lead:${LEADGEN}`)));
    check('bevosita yo\'l ham forma sozlamasidan o\'tdi (o\'zbekcha ism + avto-bitim)', m5?.name === 'Bevosita Mijoz' && !!m5.dealId, JSON.stringify(m5));
  } finally {
    await app.close();
    server.close();
    if (eskiBase === undefined) delete process.env.META_GRAPH_BASE;
    else process.env.META_GRAPH_BASE = eskiBase;
    await cleanupTestDataQuietly(email);
    await closeDb();
  }

  console.log(`\n${pass} o'tdi, ${fail} yiqildi`);
  if (fail > 0) process.exit(1);
  console.log('Forma va CAPI butun.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
