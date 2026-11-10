import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { withoutTenantIsolation } from '../../db/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SERVER SALOMATLIGI — sekinlik / osilib qolishni tashxislash
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nega kerak: jonli serverda vaqti-vaqti bilan kirgan foydalanuvchining
 * barcha so'rovlari daqiqalab kutib qolardi, kirishsiz so'rovlar esa tez
 * ishlardi (ilova ulanish puli to'lgan). Serverga to'g'ridan-to'g'ri kirish
 * bo'lmasa, sababini (sekin so'rov? qulf? tranzaksiyada osilgan kod?) ko'rib
 * bo'lmasdi.
 *
 * Endpoint ATAYLAB auth'siz: auth tekshiruvining o'zi ilova pulidan
 * foydalanadi — pul to'lganda auth'li tashxis endpointi ham osilib qolardi.
 * Shuning uchun faqat SONLAR qaytariladi: SQL matni, ID, foydalanuvchi
 * ma'lumoti yo'q. Marshrutlar ID'siz shablon ko'rinishida
 * (`/api/v1/businesses/:businessId/...`). Baza so'rovi egalik pulidan.
 *
 * Bundan tashqari 5 soniyadan uzun javob logga `warn` bilan yoziladi
 * (`docker compose logs backend | grep "sekin so'rov"`).
 */

const SEKIN_MS = 5_000;

interface Uchishda {
  marshrut: string;
  boshi: number;
}

export function registerSalomatlikRoutes(app: FastifyInstance): void {
  /** Hozir bajarilayotgan HTTP so'rovlar (so'rov ID → marshrut, boshlanish). */
  const uchishda = new Map<string, Uchishda>();

  app.addHook('onRequest', async (req) => {
    uchishda.set(req.id, { marshrut: `${req.method} ${req.routeOptions.url ?? '?'}`, boshi: Date.now() });
  });
  app.addHook('onResponse', async (req, reply) => {
    const u = uchishda.get(req.id);
    uchishda.delete(req.id);
    if (!u) return;
    const ms = Date.now() - u.boshi;
    if (ms >= SEKIN_MS) req.log.warn({ marshrut: u.marshrut, ms, status: reply.statusCode }, "sekin so'rov");
  });
  // Mijoz ulanishni uzsa `onResponse` chaqirilmasligi mumkin — ro'yxat o'smasin.
  app.addHook('onRequestAbort', async (req) => {
    uchishda.delete(req.id);
  });

  app.get('/api/v1/public/salomatlik', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async () => {
    const hozir = Date.now();
    const eng = [...uchishda.values()]
      .map((u) => ({ marshrut: u.marshrut, ms: hozir - u.boshi }))
      .sort((a, b) => b.ms - a.ms);

    const guruhlash = new Map<string, { soni: number; engUzunMs: number }>();
    for (const u of eng) {
      const g = guruhlash.get(u.marshrut) ?? { soni: 0, engUzunMs: 0 };
      g.soni++;
      g.engUzunMs = Math.max(g.engUzunMs, u.ms);
      guruhlash.set(u.marshrut, g);
    }

    let baza: unknown = null;
    try {
      baza = await withoutTenantIsolation('salomatlik: baza ulanishlari holati (faqat sonlar)', async (tx) => {
        const r = await tx.execute(sql`
          select
            case when usename = current_user then 'egalik' else coalesce(usename, '-') end as rol,
            coalesce(state, '-') as holat,
            coalesce(wait_event_type || ':' || wait_event, '') as kutish,
            count(*)::int as soni,
            coalesce(max(extract(epoch from now() - xact_start)), 0)::int as eng_uzun_tranzaksiya_s,
            coalesce(max(extract(epoch from now() - query_start)), 0)::int as eng_uzun_sorov_s
          from pg_stat_activity
          where datname = current_database() and pid <> pg_backend_pid() and backend_type = 'client backend'
          group by 1, 2, 3
          order by soni desc
        `);
        return r;
      });
    } catch (e) {
      baza = { xato: e instanceof Error ? e.message.slice(0, 120) : 'nomalum' };
    }

    return {
      vaqt: new Date(hozir).toISOString(),
      http: {
        bajarilmoqda: eng.length,
        marshrutlar: [...guruhlash.entries()]
          .map(([marshrut, g]) => ({ marshrut, ...g }))
          .sort((a, b) => b.engUzunMs - a.engUzunMs)
          .slice(0, 15),
      },
      baza,
    };
  });
}
