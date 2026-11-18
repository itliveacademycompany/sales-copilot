/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FACEBOOK LEAD ADS — MAKE ORQALI: tekshiruv (BAZASIZ)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mock test: integratsiya va CRM yozuvi xotiradagi soxta omborda. Soxta ombor
 * bazadagi `crm_inbox_external_uq` (biznes + manba + external_id) unikal
 * kalitini takrorlaydi — parallel so'rovlarda ham bitta yozuv.
 * Haqiqiy Make scenario'si va Meta lidi bilan end-to-end sinov EMAS
 * (docs/make-lead-ads.md dagi tartib bo'yicha alohida bajariladi).
 *
 * Tekshiriladi: kalit (yaratish, xesh, shakl, almashtirilgan/o'chirilgan),
 * tenantlar ajratilishi, payload turlari va o'lchami, ixtiyoriy maydonlar,
 * telefon normallashtirish, platforma taxmin qilinmasligi, takroriy va
 * parallel so'rov, test so'rovi, HTTP statuslar (415/413/400/401).
 */

process.env.LOG_LEVEL = 'fatal';

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

async function main(): Promise<void> {
  const m = await import('./make.js');

  console.log('\nA. API kaliti');
  const k1 = m.yangiKalit();
  const k2 = m.yangiKalit();
  check('kalit shakli dm_mk_ + 43 belgi', m.KALIT_SHAKLI.test(k1.kalit));
  check('har safar yangi kalit', k1.kalit !== k2.kalit && k1.xesh !== k2.xesh);
  check("bazaga faqat xesh — kalit ochiq emas", k1.xesh.length === 64 && !k1.xesh.includes(k1.kalit.slice(6)));
  check('niqobda kalitning o‘rtasi yo‘q', k1.niqob.startsWith('dm_mk_') && k1.niqob.includes('…') && k1.niqob.length < 20);
  check("to'g'ri kalit → mos", m.kalitMosmi(k1.xesh, k1.kalit));
  check('boshqa tenantning kaliti → mos emas', !m.kalitMosmi(k1.xesh, k2.kalit));
  check("kalit yo'q / bo'sh / shakli noto'g'ri → mos emas", !m.kalitMosmi(k1.xesh, undefined) && !m.kalitMosmi(k1.xesh, '') && !m.kalitMosmi(k1.xesh, 'dm_mk_qisqa'));

  console.log('\nB. Payload kontrakti');
  const toliq = {
    external_lead_id: '1234567890123456789',
    full_name: 'Aziza Karimova',
    phone_number: '+998 (90) 123-45-67',
    email: 'aziza@example.com',
    page_id: '102030405060708',
    page_name: 'Test sahifa',
    form_id: '900800700600',
    form_name: 'Kuzgi qabul formasi',
    ad_id: '120200000000001',
    ad_name: 'Reklama A',
    campaign_id: '120200000000003',
    campaign_name: 'Kuzgi qabul',
    created_time: '2026-11-18T10:00:00+0000',
    custom_fields: { 'qaysi_kurs_sizni_qiziqtiradi?': 'Frontend', filial: 'Chilonzor' },
  };
  const t1 = m.payloadniTekshir(toliq);
  check("to'liq payload → qabul", t1.ok);
  const minimal = m.payloadniTekshir({ external_lead_id: '555' });
  check('faqat external_lead_id → qabul (ixtiyoriy maydonlar yo‘q)', minimal.ok);
  const bosh = m.payloadniTekshir({ external_lead_id: '556', full_name: '', phone_number: null, email: '   ', custom_fields: '' });
  check('Make yuborgan bo‘sh qiymatlar ("" / null) → yo‘q deb olinadi', bosh.ok && bosh.p.full_name === undefined && bosh.p.phone_number === undefined && bosh.p.custom_fields === undefined);
  const yoq = m.payloadniTekshir({ full_name: 'X' });
  check("external_lead_id yo'q → xato, maydon nomi bilan", !yoq.ok && yoq.xatolar.some((x) => x.field === 'external_lead_id'));
  const raqam = m.payloadniTekshir({ external_lead_id: 1234567 });
  check('kichik raqamli ID → string', raqam.ok && raqam.p.external_lead_id === '1234567');
  const katta = m.payloadniTekshir({ external_lead_id: 12345678901234567890 });
  check("aniqligi yo'qolgan katta raqam → rad (matn so'raladi)", !katta.ok);
  const tur = m.payloadniTekshir({ external_lead_id: '1', full_name: { ism: 'x' }, custom_fields: 5 });
  check("noto'g'ri tur → xato (full_name, custom_fields)", !tur.ok && tur.xatolar.some((x) => x.field === 'full_name') && tur.xatolar.some((x) => x.field === 'custom_fields'));
  check('xato javobida qiymat yo‘q (faqat maydon)', !tur.ok && !JSON.stringify(tur.xatolar).includes('ism'));
  check("buzuq ID (bo'shliq, ;) → rad", !m.payloadniTekshir({ external_lead_id: '1; drop' }).ok);
  check('uzun ism (>200) → rad', !m.payloadniTekshir({ external_lead_id: '1', full_name: 'a'.repeat(201) }).ok);
  check('101 ta custom field → rad', !m.payloadniTekshir({ external_lead_id: '1', custom_fields: Array.from({ length: 101 }, (_, i) => ({ name: `q${i}`, values: ['a'] })) }).ok);
  check('massiv tana → rad', !m.payloadniTekshir([toliq]).ok);
  const fd = m.payloadniTekshir({ external_lead_id: '7', custom_fields: [{ name: 'kurs', values: ['Frontend', 'Backend'] }, { name: 'vaqt', value: 'kechqurun' }] });
  check('Meta field_data shakli ([{name, values}]) ham qabul', fd.ok);
  check('noma’lum qo‘shimcha maydonlar e’tiborsiz (yiqilmaydi)', m.payloadniTekshir({ external_lead_id: '8', tenant_id: 'begona', organization_id: 'x' }).ok);

  console.log('\nC. CRM lidiga moslash');
  const B1 = '11111111-1111-4111-8111-111111111111';
  const l1 = m.makeLidi(B1, (t1 as { ok: true; p: Parameters<typeof m.makeLidi>[1] }).p, null);
  check('ism, normallashtirilgan telefon, email', l1.name === 'Aziza Karimova' && l1.phone === '+998901234567' && l1.email === 'aziza@example.com');
  check('asl telefon saqlanadi', l1.payload.phoneRaw === '+998 (90) 123-45-67');
  check('manba lead_ad, yetkazib beruvchi make', l1.payload.type === 'lead_ad' && l1.payload.provider === 'make');
  check('Meta ID lar string', [l1.leadgenId, l1.payload.pageId, l1.payload.formId, l1.payload.adId, l1.payload.campaignId].every((x) => typeof x === 'string'));
  check("custom savollar matnga va values'ga", l1.message?.includes('Qaysi kurs sizni qiziqtiradi?: Frontend') === true && (l1.payload.values as Record<string, string>).filial === 'Chilonzor');
  check('forma va reklama nomi matnda', l1.message?.includes('Forma: Kuzgi qabul formasi') === true && l1.message?.includes('Reklama: Kuzgi qabul / Reklama A') === true);
  check("platforma kelmadi → null (Instagram deb taxmin qilinmaydi)", l1.payload.platform === null && l1.payload.channel === null);
  check('created_time → ISO', l1.payload.createdTime === '2026-11-18T10:00:00.000Z');
  const p2 = m.payloadniTekshir({ external_lead_id: '9', platform: 'ig', email: 'yomon-email', created_time: 1763460000 });
  const l2 = m.makeLidi(B1, (p2 as { ok: true; p: Parameters<typeof m.makeLidi>[1] }).p, null);
  check("platform 'ig' → instagram", l2.payload.platform === 'instagram');
  check("noto'g'ri email → CRM'ga yo'q, asl qiymat payload'da", l2.email === null && l2.payload.emailRaw === 'yomon-email');
  check('unix created_time → ISO', l2.payload.createdTime === new Date(1763460000 * 1000).toISOString());
  const l3 = m.makeLidi(B1, (minimal as { ok: true; p: Parameters<typeof m.makeLidi>[1] }).p, null);
  check("ism/telefon yo'q → null, yiqilmaydi", l3.name === null && l3.phone === null && l3.message === null);
  const l4 = m.makeLidi(B1, (fd as { ok: true; p: Parameters<typeof m.makeLidi>[1] }).p, null);
  check('field_data qiymatlari birlashtiriladi', (l4.payload.values as Record<string, string>).kurs === 'Frontend, Backend' && (l4.payload.values as Record<string, string>).vaqt === 'kechqurun');

  console.log('\nD. Qabul qilish: kalit, tenant, takroriy, parallel, test');
  const B2 = '22222222-2222-4222-8222-222222222222';
  const I1 = '33333333-3333-4333-8333-333333333333';
  const I2 = '44444444-4444-4444-8444-444444444444';
  const kA = m.yangiKalit();
  const kB = m.yangiKalit();
  const intakelar = new Map([
    [I1, { id: I1, businessId: B1, keyHash: kA.xesh, pipelineId: null as string | null }],
    [I2, { id: I2, businessId: B2, keyHash: kB.xesh, pipelineId: null as string | null }],
  ]);
  const inbox = new Map<string, { id: string; businessId: string; name: string | null }>();
  const qaydlar: { businessId: string; o: Record<string, unknown> }[] = [];
  let topSorov = 0;
  const port = {
    top: async (id: string) => {
      topSorov++;
      return intakelar.get(id) ?? null;
    },
    // Bazadagi unikal kalit o'rnini bosadi: tekshirish va yozish bitta sinxron qadamda
    yoz: async (k: { businessId: string; leadgenId: string; name: string | null }) => {
      await new Promise((r) => setTimeout(r, 3));
      const kalit = `${k.businessId}:meta_lead_ads:lead:${k.leadgenId}`;
      const bor = inbox.get(kalit);
      if (bor) return { inboxId: bor.id, takror: true };
      const id = `inbox-${inbox.size + 1}`;
      inbox.set(kalit, { id, businessId: k.businessId, name: k.name });
      return { inboxId: id, takror: false };
    },
    qayd: async (businessId: string, _id: string, o: Record<string, unknown>) => {
      qaydlar.push({ businessId, o });
    },
  };

  const r1 = await m.makeQabul(I1, kA.kalit, toliq, port);
  check("to'g'ri payload → 201 created", r1.kod === 201 && r1.javob.status === 'created');
  const r2 = await m.makeQabul(I1, kA.kalit, toliq, port);
  check('takroriy so‘rov → 200 duplicate, o‘sha lead_id', r2.kod === 200 && r2.javob.status === 'duplicate' && 'lead_id' in r2.javob && r2.javob.lead_id === (r1.javob as { lead_id: string }).lead_id);
  const parallel = await Promise.all(Array.from({ length: 8 }, () => m.makeQabul(I1, kA.kalit, { ...toliq, external_lead_id: 'p-100' }, port)));
  check('parallel 8 ta bir xil → 1 created, 7 duplicate', parallel.filter((x) => x.kod === 201).length === 1 && parallel.filter((x) => x.kod === 200).length === 7);
  check('parallel → bitta CRM lid', [...inbox.keys()].filter((x) => x.endsWith(':lead:p-100')).length === 1);
  check("telefon dedup kaliti emas: bir xil telefon, boshqa lead ID → yangi lid", (await m.makeQabul(I1, kA.kalit, { ...toliq, external_lead_id: 'p-101' }, port)).kod === 201);

  const r3 = await m.makeQabul(I2, kA.kalit, toliq, port);
  check('A tenant kaliti B integratsiyasida → 401', r3.kod === 401);
  const r4 = await m.makeQabul(I2, kB.kalit, toliq, port);
  check('bir xil Meta lead ID B tenantda → alohida lid (tenantlar aralashmaydi)', r4.kod === 201 && inbox.get(`${B2}:meta_lead_ads:lead:${toliq.external_lead_id}`)?.businessId === B2);
  check("body'dagi tenant_id ga ishonilmaydi", (await m.makeQabul(I2, kB.kalit, { ...toliq, external_lead_id: 't-1', tenant_id: B1, organization_id: B1 }, port)).kod === 201 && inbox.has(`${B2}:meta_lead_ads:lead:t-1`) && !inbox.has(`${B1}:meta_lead_ads:lead:t-1`));

  topSorov = 0;
  check("kalit yo'q → 401, bazaga so'rov yo'q", (await m.makeQabul(I1, undefined, toliq, port)).kod === 401 && topSorov === 0);
  check("shakli noto'g'ri kalit → 401, bazaga so'rov yo'q", (await m.makeQabul(I1, 'Bearer abc', toliq, port)).kod === 401 && topSorov === 0);
  const eski = kA;
  const yangi = m.yangiKalit();
  intakelar.set(I1, { ...intakelar.get(I1)!, keyHash: yangi.xesh });
  check('almashtirilgan (eski) kalit → 401', (await m.makeQabul(I1, eski.kalit, toliq, port)).kod === 401);
  check('yangi kalit → ishlaydi', (await m.makeQabul(I1, yangi.kalit, { ...toliq, external_lead_id: 'r-1' }, port)).kod === 201);
  check("401 diagnostikaga yoziladi, kalitsiz", qaydlar.some((q) => typeof q.o.xato === 'string' && (q.o.xato as string).includes('401') && !(q.o.xato as string).includes(eski.kalit)));
  intakelar.delete(I1);
  check("o'chirilgan integratsiya → 401", (await m.makeQabul(I1, yangi.kalit, toliq, port)).kod === 401);

  const r5 = await m.makeQabul(I2, kB.kalit, { full_name: 'Shaxsiy Ism', phone_number: '901234567' }, port);
  check("noto'g'ri payload → 422, maydon ro'yxati bilan", r5.kod === 422 && r5.javob.error === 'invalid_payload' && r5.javob.details.some((d) => d.field === 'external_lead_id'));
  const xatoQayd = qaydlar.filter((q) => q.businessId === B2 && typeof q.o.xato === 'string').at(-1)?.o.xato as string;
  check("oxirgi xatoda shaxsiy ma'lumot yo'q", Boolean(xatoQayd) && !xatoQayd.includes('Shaxsiy') && !xatoQayd.includes('901234567'));

  const oldin = inbox.size;
  const r6 = await m.makeQabul(I2, kB.kalit, { external_lead_id: 'test-1', test: true }, port);
  check('test so‘rovi → 200 test_ok, CRM lid yaratilmaydi', r6.kod === 200 && r6.javob.status === 'test_ok' && inbox.size === oldin);
  check('test → "Test request qabul qilindi" qaydi', qaydlar.some((q) => q.businessId === B2 && q.o.test === true));
  check('haqiqiy lid → "Meta lidi qabul qilindi" qaydi alohida', qaydlar.some((q) => q.businessId === B2 && q.o.lid === 'created'));

  console.log('\nE. HTTP qatlami (bazasiz holatlar)');
  const { buildApp } = await import('../../http/app.js');
  const app = await buildApp();
  await app.ready();
  const url = `/api/v1/webhooks/crm/make/${I2}/leads`;
  const so = (o: { payload?: string; headers?: Record<string, string> }) => app.inject({ method: 'POST', url, ...o });
  check('JSON emas (text/plain) → 415', (await so({ payload: 'salom', headers: { 'content-type': 'text/plain', 'x-api-key': kB.kalit } })).statusCode === 415);
  check('64 KB dan katta → 413', (await so({ payload: JSON.stringify({ external_lead_id: '1', full_name: 'a'.repeat(70_000) }), headers: { 'content-type': 'application/json', 'x-api-key': kB.kalit } })).statusCode === 413);
  check('buzilgan JSON → 400', (await so({ payload: '{"external_lead_id": ', headers: { 'content-type': 'application/json', 'x-api-key': kB.kalit } })).statusCode === 400);
  check("kalitsiz → 401", (await so({ payload: JSON.stringify(toliq), headers: { 'content-type': 'application/json' } })).statusCode === 401);
  check("kalit query'da (?api_key=) → qabul qilinmaydi, 401", (await app.inject({ method: 'POST', url: `${url}?api_key=${kB.kalit}`, payload: JSON.stringify(toliq), headers: { 'content-type': 'application/json' } })).statusCode === 401);
  check("yaroqsiz integratsiya ID → 401", (await app.inject({ method: 'POST', url: '/api/v1/webhooks/crm/make/abc/leads', payload: '{}', headers: { 'content-type': 'application/json', 'x-api-key': kB.kalit } })).statusCode === 401);
  check('Meta hub.challenge talab qilinmaydi (GET marshruti yo‘q)', (await app.inject({ method: 'GET', url: `${url}?hub.mode=subscribe&hub.challenge=1` })).statusCode === 404);
  await app.close();

  console.log(`\nMake orqali Lead Ads (mock, bazasiz): ${otdi} ta o'tdi, ${yiqildi} ta yiqildi.`);
  process.exit(yiqildi > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
