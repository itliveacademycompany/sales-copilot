import { createServer, type Server } from 'node:http';
import { eq, inArray, like } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  getActiveLlm,
  limitXatosimi,
  LlmRefusalError,
  sovuganlarniTozala,
  ZaxiraLlm,
  type LlmClient,
  type LlmJsonRequest,
} from '../ai/llm.js';
import { keshniTozala } from '../auth/context-cache.js';
import { cleanupTestDataQuietly } from '../db/clean-test-data.js';
import { closeDb, withoutTenantIsolation } from '../db/index.js';
import { aiProvider, appUser } from '../db/schema/index.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI PROVAYDERLAR — zaxira zanjiri va admin panel
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ishga tushirish: npm run verify:ai-providers
 *
 * Haqiqiy holat: bepul Gemini kvotasi 18 ta qo'ng'iroqdan keyin tugadi va
 * butun baholash to'xtadi. Endi faol provayder limitga urilsa, so'rov
 * zaxiralarga o'tadi. Bu yerda tekshiriladi:
 *   • limit / 5xx da keyingisiga o'tish, 400 / rad etishda O'TMASLIK
 *   • limitga urilgan provayder vaqtincha chetlab o'tiladi
 *   • hammasi limitda — xato «limit» deb taniladi (Moi Zvonki pauza qiladi)
 *   • admin «Tekshirish» HAQIQIY so'rov yuboradi (soxta OpenAI-uyg'un server)
 *   • zaxira navbati va `splitFields` (raqam) saqlanadi
 *
 * Platformaning haqiqiy provayderlari (faollik va navbat) test oxirida tiklanadi.
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
const so: LlmJsonRequest = { stage: 'stage2', system: 's', user: 'u', schema: { type: 'object' } };

function soxta(nom: string, xulq: () => Promise<unknown> | unknown): LlmClient & { chaqiruv: number } {
  const k = {
    chaqiruv: 0,
    async completeJson() {
      k.chaqiruv++;
      const json = await xulq();
      return { json, model: nom, tokensIn: 1, tokensOut: 1, costUsd: 0 };
    },
  };
  return k;
}
const xato = (m: string) => () => {
  throw new Error(m);
};

/** Soxta OpenAI-uyg'un server: /ok — javob, /limit — 429, /yomon — 401. */
let port = 0;
function serverniOch(): Promise<Server> {
  return new Promise((ok) => {
    const s = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        const yoz = (kod: number, j: unknown) => {
          res.writeHead(kod, { 'content-type': 'application/json' });
          res.end(JSON.stringify(j));
        };
        if (req.url?.startsWith('/limit/')) return yoz(429, { error: { message: 'You exceeded your current quota' } });
        if (req.url?.startsWith('/yomon/')) return yoz(401, { error: { message: 'Invalid API Key' } });
        if (req.url?.startsWith('/ok/')) {
          return yoz(200, {
            choices: [{ message: { content: '{"ok":true}' }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 12, completion_tokens: 4 },
          });
        }
        yoz(404, { error: { message: 'yo\'q' } });
      });
    });
    s.listen(0, '127.0.0.1', () => {
      port = (s.address() as { port: number }).port;
      ok(s);
    });
  });
}

async function main(): Promise<void> {
  console.log('\nAI provayderlar: zaxira zanjiri va admin panel\n');

  // ═══ A: ZAXIRA ZANJIRI (bazasiz) ═══
  console.log('— A: zaxira zanjiri —');
  sovuganlarniTozala();
  {
    const a = soxta('A', xato("LLM so'rovi muvaffaqiyatsiz (429, a): You exceeded your current quota"));
    const b = soxta('B', () => ({ ok: true }));
    const z = new ZaxiraLlm([{ nom: 'A', klient: a }, { nom: 'B', klient: b }]);
    const r1 = await z.completeJson(so);
    check('limit — keyingi provayder javob berdi', r1.model === 'B' && a.chaqiruv === 1 && b.chaqiruv === 1);
    await z.completeJson(so);
    check('limitga urilgan provayder vaqtincha chetlab o\'tiladi', a.chaqiruv === 1 && b.chaqiruv === 2);
  }
  sovuganlarniTozala();
  {
    const a = soxta('A5', xato("LLM so'rovi muvaffaqiyatsiz (503, a): overloaded"));
    const b = soxta('B5', () => ({ ok: true }));
    const z = new ZaxiraLlm([{ nom: 'A5', klient: a }, { nom: 'B5', klient: b }]);
    await z.completeJson(so);
    await z.completeJson(so);
    check('5xx — o\'tadi, lekin sovutilmaydi (keyingi so\'rovda yana uriniladi)', a.chaqiruv === 2 && b.chaqiruv === 2);
  }
  {
    const a = soxta('A4', xato("LLM so'rovi muvaffaqiyatsiz (400, a): invalid schema"));
    const b = soxta('B4', () => ({ ok: true }));
    let tashlandi = false;
    try {
      await new ZaxiraLlm([{ nom: 'A4', klient: a }, { nom: 'B4', klient: b }]).completeJson(so);
    } catch {
      tashlandi = true;
    }
    check('400 (sozlama xatosi) — boshqasiga O\'TILMAYDI', tashlandi && b.chaqiruv === 0);
  }
  {
    const a = soxta('AR', () => {
      throw new LlmRefusalError('a');
    });
    const b = soxta('BR', () => ({ ok: true }));
    let rad = false;
    try {
      await new ZaxiraLlm([{ nom: 'AR', klient: a }, { nom: 'BR', klient: b }]).completeJson(so);
    } catch (e) {
      rad = e instanceof LlmRefusalError;
    }
    check('xavfsizlik rad etishi — boshqasiga O\'TILMAYDI', rad && b.chaqiruv === 0);
  }
  sovuganlarniTozala();
  {
    const z = new ZaxiraLlm([
      { nom: 'L1', klient: soxta('L1', xato("LLM so'rovi muvaffaqiyatsiz (429, x): quota")) },
      { nom: 'L2', klient: soxta('L2', xato("LLM so'rovi muvaffaqiyatsiz (429, y): rate limit")) },
    ]);
    let m = '';
    try {
      await z.completeJson(so);
    } catch (e) {
      m = e instanceof Error ? e.message : '';
    }
    check('hammasi limitda — xato «limit» deb taniladi (pauza uchun)', limitXatosimi(m), m.slice(0, 120));
  }
  sovuganlarniTozala();

  // ═══ B: ADMIN PANEL + JONLI TEKSHIRUV ═══
  console.log('\n— B: admin panel —');
  const server = await serverniOch();
  const app: FastifyInstance = await buildApp();
  const email = `ai-prov-${tag}@test.local`;
  const asl = await withoutTenantIsolation('test: provayderlar holatini eslab qolish', (tx) =>
    tx.select({ id: aiProvider.id, isActive: aiProvider.isActive, fallbackOrder: aiProvider.fallbackOrder }).from(aiProvider),
  );

  try {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { email, password: 'juda-maxfiy-parol-123', displayName: 'Admin', businessName: 'AI provayder testi' },
    });
    const auth = { sid: reg.cookies.find((c) => c.name === 'sid')?.value ?? '' };
    await withoutTenantIsolation('test: super-admin huquqini berish', (tx) =>
      tx.update(appUser).set({ systemRole: 'super_admin' }).where(eq(appUser.email, email)),
    );
    keshniTozala();

    const yarat = async (label: string, yol: string, extra: Record<string, unknown> = {}) => {
      const r = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/providers',
        cookies: auth,
        payload: {
          purpose: 'llm',
          kind: 'openai',
          label: `${label} ${tag}`,
          apiKey: 'test-kalit-12345678',
          baseUrl: `http://127.0.0.1:${port}/${yol}`,
          models: { stage2: 'soxta-model', stage3: 'soxta-model', playbookBuilder: 'soxta-model' },
          ...extra,
        },
      });
      return { kod: r.statusCode, id: (r.json() as { id: string }).id, body: r.body };
    };

    const ishlaydi = await yarat('Ishlaydi', 'ok', { models: { stage2: 'soxta-model', splitFields: 4 } });
    check('splitFields (raqam) bilan provayder saqlanadi', ishlaydi.kod === 201, ishlaydi.body.slice(0, 200));

    const t1 = await app.inject({ method: 'POST', url: `/api/v1/admin/providers/${ishlaydi.id}/test`, cookies: auth });
    const tj1 = t1.json() as { ok: boolean; liveCheck: boolean; model: string | null; ms: number | null };
    check('Tekshirish — HAQIQIY so\'rov o\'tdi', tj1.ok && tj1.liveCheck && tj1.model === 'soxta-model' && tj1.ms !== null, t1.body.slice(0, 300));

    const yomon = await yarat('Yomon', 'yomon');
    const t2 = (await app.inject({ method: 'POST', url: `/api/v1/admin/providers/${yomon.id}/test`, cookies: auth })).json() as {
      ok: boolean;
      problems: string[];
    };
    check('noto\'g\'ri kalit — tekshiruv yiqiladi va sababi ko\'rinadi', !t2.ok && t2.problems.join(' ').includes('401'), JSON.stringify(t2.problems));

    // Zaxira zanjiri — getActiveLlm orqali (worker aynan shu yo'ldan yuradi).
    const tugagan = await yarat('Tugagan', 'limit');
    await app.inject({ method: 'POST', url: `/api/v1/admin/providers/${tugagan.id}/activate`, cookies: auth });
    const z1 = await app.inject({ method: 'PATCH', url: `/api/v1/admin/providers/${ishlaydi.id}`, cookies: auth, payload: { fallbackOrder: 1 } });
    check('zaxira navbati saqlandi', (z1.json() as { fallbackOrder: number | null }).fallbackOrder === 1, z1.body.slice(0, 200));

    const royxat = (await app.inject({ method: 'GET', url: '/api/v1/admin/providers', cookies: auth })).json() as { id: string; isActive: boolean }[];
    check('ro\'yxatda faol provayder birinchi', royxat[0]?.isActive === true && royxat[0]?.id === tugagan.id);

    sovuganlarniTozala();
    const llm = await getActiveLlm();
    const javob = await llm.completeJson({
      stage: 'stage2',
      system: 's',
      user: 'u',
      schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
    });
    check('faol provayder kvotasi tugagan — zaxira javob berdi', (javob.json as { ok?: boolean }).ok === true, JSON.stringify(javob).slice(0, 200));

    await app.inject({ method: 'PATCH', url: `/api/v1/admin/providers/${ishlaydi.id}`, cookies: auth, payload: { fallbackOrder: null } });
    sovuganlarniTozala();
    let zaxirasiz = '';
    try {
      await (await getActiveLlm()).completeJson({ stage: 'stage2', system: 's', user: 'u', schema: { type: 'object' } });
    } catch (e) {
      zaxirasiz = e instanceof Error ? e.message : '';
    }
    check('zaxira olib tashlansa — limit xatosi qaytadi (pauza uchun)', limitXatosimi(zaxirasiz), zaxirasiz.slice(0, 120));
  } finally {
    await app.close();
    server.close();
    await withoutTenantIsolation('test tozalash: sinov AI provayderlari va asl holat', async (tx) => {
      await tx.delete(aiProvider).where(like(aiProvider.label, `% ${tag}`));
      await tx.update(aiProvider).set({ isActive: false });
      for (const p of asl) {
        await tx.update(aiProvider).set({ isActive: p.isActive, fallbackOrder: p.fallbackOrder }).where(eq(aiProvider.id, p.id));
      }
    });
    const qolgan = await withoutTenantIsolation('test: tiklanganini tekshirish', (tx) =>
      tx.select({ id: aiProvider.id }).from(aiProvider).where(inArray(aiProvider.id, asl.length ? asl.map((p) => p.id) : ['00000000-0000-0000-0000-000000000000'])),
    );
    check('haqiqiy provayderlar joyida va tiklandi', qolgan.length === asl.length);
    await cleanupTestDataQuietly(email);
    await closeDb();
  }

  console.log(`\n${pass} o'tdi, ${fail} yiqildi`);
  if (fail > 0) process.exit(1);
  console.log('AI provayderlar butun.');
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
