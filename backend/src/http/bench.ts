import { performance } from 'node:perf_hooks';
import { closeDb } from '../db/index.js';
import { buildApp } from './app.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEZLIK O'LCHOVI — optimizatsiyadan OLDIN va KEYIN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nega kerak: "sekin" degan tuyg'u bilan optimizatsiya qilish — taxmin.
 * Bu skript aniq raqam beradi va o'zgarish haqiqatan yordam berganini
 * yoki yo'qligini ko'rsatadi.
 *
 * Ishga tushirish:
 *   npm run bench -- bench@local.test
 *
 * ── Nega `app.inject`, haqiqiy HTTP emas ───────────────────────────────────
 * Tarmoq kechikishi va TCP ochilishi o'lchovga shovqin qo'shadi, biz esa
 * SERVER ichidagi vaqtni o'lchamoqchimiz. `inject` butun Fastify quvurini
 * (auth, validatsiya, marshrut) o'tkazadi, faqat soket yo'q.
 *
 * ── Nega mediana va p95, o'rtacha emas ─────────────────────────────────────
 * Bitta sekin ishga tushish (masalan birinchi so'rovda ulanish hovuzi
 * to'lishi) o'rtachani buzadi. Mediana buni ko'rsatmaydi, p95 esa "eng
 * yomon holat qanday" degan savolga javob beradi — foydalanuvchi aynan
 * shuni sezadi.
 */

const email = process.argv[2] ?? 'bench@local.test';
const parol = process.argv[3] ?? 'BenchmarkParol2026';
const TAKROR = Number(process.env.BENCH_N ?? 7);

interface Olcham {
  nom: string;
  median: number;
  p95: number;
  min: number;
  max: number;
}

function foizil(v: number[], p: number): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((s.length - 1) * p))]!;
}

async function main(): Promise<void> {
  const app = await buildApp();

  const kirish = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { email, password: parol },
  });
  if (kirish.statusCode !== 200) {
    console.error(`Kirib bo'lmadi (${kirish.statusCode}). Avval seed qiling.`);
    process.exit(1);
  }
  const cookie = { sid: kirish.cookies.find((c) => c.name === 'sid')?.value ?? '' };
  const businessId = (kirish.json() as { businesses: { businessId: string }[] })
    .businesses[0]!.businessId;
  const base = `/api/v1/businesses/${businessId}`;

  const yollar: [string, string][] = [
    ['dashboard', `${base}/dashboard?days=30`],
    ['overview', `${base}/analytics/overview?days=30`],
    ['mix', `${base}/analytics/mix?days=30`],
    ['quality', `${base}/analytics/quality?days=30`],
    ['coaching', `${base}/analytics/coaching?days=30`],
    ['voice', `${base}/analytics/voice?days=30`],
    ['leads', `${base}/analytics/leads?days=30`],
    ['funnel', `${base}/analytics/funnel?days=30`],
    ['tasks', `${base}/analytics/tasks?days=30`],
    ['activity', `${base}/analytics/activity?days=30`],
    ['customer', `${base}/analytics/customer?days=30`],
    ['clients', `${base}/analytics/clients?days=30`],
    ['team', `${base}/analytics/team?days=30`],
    ['conversations', `${base}/conversations?limit=50`],
    ['lidlar', `${base}/leads?limit=50`],
    ['vazifalar', `${base}/tasks?limit=50`],
    ['ogohlantirish', `${base}/alerts?limit=50`],
    ['kunlik', `${base}/reports/daily/day?date=${new Date().toISOString().slice(0, 10)}`],
  ];

  const natijalar: Olcham[] = [];

  for (const [nom, url] of yollar) {
    // Isitish — birinchi so'rov ulanish hovuzini to'ldiradi va reja
    // keshini isitadi; uni o'lchovga qo'shsak raqam yolg'on chiqardi.
    const isitish = await app.inject({ method: 'GET', url, cookies: cookie });
    if (isitish.statusCode !== 200) {
      console.log(`  ${nom.padEnd(15)} — ${isitish.statusCode} (o'tkazildi)`);
      continue;
    }

    const v: number[] = [];
    for (let i = 0; i < TAKROR; i++) {
      const t0 = performance.now();
      await app.inject({ method: 'GET', url, cookies: cookie });
      v.push(performance.now() - t0);
    }
    natijalar.push({
      nom,
      median: foizil(v, 0.5),
      p95: foizil(v, 0.95),
      min: Math.min(...v),
      max: Math.max(...v),
    });
  }

  natijalar.sort((a, b) => b.median - a.median);

  console.log('\n┌─────────────────┬─────────┬─────────┬─────────┐');
  console.log('│ Endpoint        │ mediana │     p95 │     max │');
  console.log('├─────────────────┼─────────┼─────────┼─────────┤');
  for (const r of natijalar) {
    console.log(
      `│ ${r.nom.padEnd(15)} │ ${r.median.toFixed(0).padStart(6)}ms │ ${r.p95
        .toFixed(0)
        .padStart(6)}ms │ ${r.max.toFixed(0).padStart(6)}ms │`,
    );
  }
  console.log('└─────────────────┴─────────┴─────────┴─────────┘');
  const jami = natijalar.reduce((n, r) => n + r.median, 0);
  console.log(`Jami (mediana yig'indisi): ${jami.toFixed(0)}ms`);

  await app.close();
  await closeDb();
  process.exit(0);
}

void main();
