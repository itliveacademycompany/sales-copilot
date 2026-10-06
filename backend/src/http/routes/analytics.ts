import { desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant, type Tx } from '../../db/index.js';
import { playbook } from '../../db/schema/index.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import {
  amaldagiJadval,
  seatWorkHoursSchema,
  workHoursSchema,
} from '../../business/settings.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANALITIKA API — rahbar uchun chuqur kesimlar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `dashboard.ts` "30 soniyada holatni tushun" uchun. Bu esa boshqa savolga
 * javob beradi: "NEGA shunday?" — kesimlar, taqsimotlar, taqqoslashlar.
 *
 * ── Asosiy qoida: HISOBLANMAGAN ≠ NOL ───────────────────────────────────────
 * Har taqsimotda "ma'lumot yo'q" alohida qaytariladi (`nullCount`,
 * `missing`), nolga aylantirilmaydi. Sabab FR-80/82 bilan bir xil: model
 * "aniqlamadim" deganini "0 ta" deb ko'rsatish — rahbarni ishonchli
 * ko'rinadigan, lekin asossiz raqam bilan aldash. Bitim summasi bo'lmagan
 * suhbatlarni 0 so'm deb qo'shsak, "o'rtacha bitim" darhol yolg'on bo'ladi.
 *
 * Hisob-kitob har so'rovda SQL'da — `dashboard.ts` dagi bilan bir xil
 * sabab va bir xil kelajak yo'li (avval indeks, keyin kunlik agregat).
 *
 * Eslatma: raw SQL'ga sana ISO satr sifatida uzatiladi — postgres.js
 * drayveri raw so'rovda Date obyektini qabul qilmaydi.
 */

const periodQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

function period(q: { from?: Date; to?: Date }): { from: Date; to: Date } {
  const to = q.to ?? new Date();
  const from = q.from ?? new Date(to.getTime() - 7 * 24 * 3600 * 1000);
  return { from, to };
}

/** Oldingi teng uzunlikdagi davr — o'sish/pasayishni ko'rsatish uchun. */
function previousFrom(from: Date, to: Date): Date {
  return new Date(from.getTime() - (to.getTime() - from.getTime()));
}

type Row = Record<string, unknown>;

/** postgres.js natijasini oddiy massivga keltiradi. */
function rows(r: unknown): Row[] {
  return r as unknown as Row[];
}

/**
 * ── LID SIFATI YORLIG'INI NORMALLASHTIRISH ──────────────────────────────────
 *
 * `analysis.lead_quality` — erkin matn (`z.string().nullable()`), chunki
 * yorliqlar playbookda biznesga qarab belgilanadi. Playbookda lug'at
 * berilmagan bo'lsa, model har safar o'zicha yozadi: bitta bazada bir
 * vaqtning o'zida `hot`, `issiq`, `high` uchraydi.
 *
 * Shu sababli konversiyani `lead_quality in ('hot','warm')` deb hisoblash
 * JIM XATO beradi — 8 ta sifatli lid bor bo'lsa ham 0% ko'rsatadi. Bu
 * yerda ma'lum variantlar uchta chelakka keltiriladi, notanish yorliq esa
 * `unknown` bo'ladi va MAXRAJGA KIRMAYDI: tanimagan narsani "sovuq lid"
 * deb sanash — raqamni sun'iy yaxshilash yoki yomonlashtirish demakdir.
 *
 * Bu vaqtinchalik yamoq emas, doimiy himoya: playbook lug'ati keyin
 * to'ldirilsa ham, eski yozuvlar shu xilma-xillik bilan qolib ketadi.
 */
/**
 * Faol playbookdagi mezon ta'riflari (`description`) — `criterion_score`
 * jadvalida ular yo'q, u yerda faqat nom va rubrika nusxasi saqlanadi.
 * Kartochkada "nima talab qilinadi" ni ko'rsatish uchun kerak.
 */
async function criterionDescriptions(tx: Tx): Promise<Map<string, string>> {
  const [pb] = await tx
    .select({ criteria: playbook.criteria })
    .from(playbook)
    .where(eq(playbook.isActive, true))
    .orderBy(desc(playbook.version))
    .limit(1);

  const map = new Map<string, string>();
  const list = (pb?.criteria as { criteria?: unknown[] } | undefined)?.criteria;
  if (!Array.isArray(list)) return map;
  for (const item of list) {
    const c = item as { code?: unknown; description?: unknown };
    if (typeof c.code === 'string' && typeof c.description === 'string') {
      map.set(c.code, c.description);
    }
  }
  return map;
}

/**
 * Rubrika nusxasidan matn olish.
 *
 * `rubric_snapshot` — baholangan PAYTDAGI ta'rif ({"0": "...", "3": "..."}).
 * Shu tufayli playbook keyin o'zgarsa ham, eski baho o'z ma'nosini
 * yo'qotmaydi va "hozir shunday / shunga intilish kerak" juftligi doim
 * o'sha bahoga mos matnni ko'rsatadi.
 */
function rubricText(snapshot: unknown, level: number): string | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const v = (snapshot as Record<string, unknown>)[String(level)];
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

const leadBucket = sql`
  case
    when lower(trim(a.lead_quality)) in ('hot', 'issiq', 'high', 'yuqori')      then 'hot'
    when lower(trim(a.lead_quality)) in ('warm', 'iliq', 'medium', 'orta')      then 'warm'
    when lower(trim(a.lead_quality)) in ('cold', 'sovuq', 'low', 'past')        then 'cold'
    when a.lead_quality is null or trim(a.lead_quality) = ''                    then null
    else 'unknown'
  end
`;

/**
 * Bir davrning asosiy ko'rsatkichlari.
 *
 * `lead_conversion` — issiq/iliq lidlar ULUSHI (baholangan sotuv
 * suhbatlaridan). Bu "sotuv bo'ldi" degani emas: tizimda bitim yopilgani
 * haqida haqiqiy manba yo'q, shuning uchun uni sotuv deb atash noto'g'ri
 * bo'lardi. Nomi ham shunga ko'ra "lid sifati konversiyasi".
 */
async function overviewFor(tx: Tx, from: Date, to: Date): Promise<Row> {
  const r = rows(
    await tx.execute(sql`
      select
        count(*)::int                                              as conversations,
        count(a.id)::int                                           as analyzed,
        count(*) filter (where c.status = 'filtered')::int         as filtered,
        count(a.id) filter (where a.scoring_mode = 'scored')::int  as scored,
        round(avg(a.overall_score), 1)::float                      as avg_score,
        count(*) filter (where a.is_flagged)::int                  as flagged,
        count(*) filter (where ${leadBucket} in ('hot', 'warm'))::int   as warm_leads,
        count(*) filter (where ${leadBucket} in ('hot', 'warm', 'cold'))::int as lead_known,
        -- Bitim summasi faqat model aniq raqam topgan suhbatlarda bor.
        -- deal_known nol bo'lsa, o'rtacha ham, jami ham ko'rsatilmaydi.
        sum((a.deal #>> '{amount}')::numeric)::float               as deal_sum,
        count(*) filter (where (a.deal #>> '{amount}') is not null)::int as deal_known,
        round(avg(c.duration_seconds), 0)::float                   as avg_duration,
        round(sum(a.cost_usd), 4)::float                           as ai_cost_usd
      from conversation c
      left join analysis a on a.conversation_id = c.id
      where c.started_at >= ${from.toISOString()}::timestamptz
        and c.started_at <  ${to.toISOString()}::timestamptz
    `),
  )[0]!;

  const t = rows(
    await tx.execute(sql`
      select
        count(*)::int                                       as tasks,
        count(*) filter (where status = 'done')::int        as tasks_done,
        count(*) filter (where status in ('pending', 'in_progress', 'blocked')
                           and due_at is not null
                           and due_at < now())::int         as tasks_overdue
      from task
      where created_at >= ${from.toISOString()}::timestamptz
        and created_at <  ${to.toISOString()}::timestamptz
    `),
  )[0]!;

  const leadKnown = Number(r.lead_known ?? 0);
  const dealKnown = Number(r.deal_known ?? 0);
  const tasks = Number(t.tasks ?? 0);

  return {
    conversations: r.conversations,
    analyzed: r.analyzed,
    filtered: r.filtered,
    scored: r.scored,
    avgScore: r.avg_score,
    flagged: r.flagged,
    warmLeads: r.warm_leads,
    leadKnown,
    /** null = hech bir suhbatda lid sifati aniqlanmagan (0% EMAS). */
    leadConversionPct:
      leadKnown > 0 ? Math.round((Number(r.warm_leads) / leadKnown) * 1000) / 10 : null,
    dealSum: dealKnown > 0 ? r.deal_sum : null,
    dealKnown,
    avgDeal: dealKnown > 0 ? Math.round(Number(r.deal_sum) / dealKnown) : null,
    avgDurationSeconds: r.avg_duration,
    aiCostUsd: r.ai_cost_usd,
    tasks,
    tasksDone: t.tasks_done,
    tasksOverdue: t.tasks_overdue,
    taskCompletionPct:
      tasks > 0 ? Math.round((Number(t.tasks_done) / tasks) * 1000) / 10 : null,
  };
}

export function registerAnalyticsRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireBusiness, requirePermission('analytics:read:all')] };

  /**
   * UMUMIY KO'RINISH — sarlavha raqamlari va oldingi davr bilan farq.
   * Bitta so'rovda ikkala davr ham qaytadi: rahbar "112 ta" ni emas,
   * "112 ta, o'tgan davrga nisbatan -18%" ni ko'rishi kerak.
   */
  app.get('/api/v1/businesses/:businessId/analytics/overview', guard, async (req) => {
    const { from, to } = period(periodQuery.parse(req.query));
    const businessId = req.business!.businessId;

    const [current, previous] = await withTenant(businessId, (tx) =>
      Promise.all([overviewFor(tx, from, to), overviewFor(tx, previousFrom(from, to), from)]),
    );

    return { period: { from, to }, current, previous };
  });

  /**
   * TAQSIMOTLAR — "qo'ng'iroqlar nimadan iborat?" doiraviy diagrammalari.
   *
   * `businessRelevance` eng muhimi: u ish vaqtining qanchasi haqiqiy
   * sotuvga, qanchasi ichki/spam gaplarga ketganini ko'rsatadi.
   */
  app.get('/api/v1/businesses/:businessId/analytics/mix', guard, async (req) => {
    const { from, to } = period(periodQuery.parse(req.query));
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();

    const [relevance, family, service, channel, status] = await withTenant(businessId, (tx) =>
      Promise.all([
        tx.execute(sql`
          select coalesce(a.business_relevance, 'aniqlanmadi') as key, count(*)::int as count
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by count desc
        `),
        tx.execute(sql`
          select coalesce(a.call_family, 'aniqlanmadi') as key, count(*)::int as count,
                 round(avg(a.overall_score), 1)::float as avg_score
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by count desc
        `),
        tx.execute(sql`
          select coalesce(a.service_line, 'aniqlanmadi') as key, count(*)::int as count,
                 round(avg(a.overall_score), 1)::float as avg_score
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by count desc
        `),
        tx.execute(sql`
          select c.channel::text as key, count(*)::int as count,
                 round(avg(a.overall_score), 1)::float as avg_score
          from conversation c left join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by count desc
        `),
        tx.execute(sql`
          select c.status::text as key, count(*)::int as count
          from conversation c
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by count desc
        `),
      ]),
    );

    const map = (r: unknown) =>
      rows(r).map((x) => ({ key: x.key, count: x.count, avgScore: x.avg_score ?? null }));

    return {
      period: { from, to },
      businessRelevance: map(relevance),
      callFamily: map(family),
      serviceLine: map(service),
      channel: map(channel),
      status: map(status),
    };
  });

  /**
   * SIFAT NAZORATI — kategoriya darajasidagi kesim.
   *
   * Mezon darajasi (`dashboard/criteria`) juda mayda: 20 ta mezonni
   * ko'rib chiqib xulosa chiqarish qiyin. Kategoriya darajasi esa
   * "aloqa o'rnatish yaxshi, yopish yomon" degan boshqaruv qaroriga
   * to'g'ridan-to'g'ri olib keladi.
   */
  app.get('/api/v1/businesses/:businessId/analytics/quality', guard, async (req) => {
    const { from, to } = period(periodQuery.parse(req.query));
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();

    const [categories, distribution, compliance, gaps, criteria, matrix, seats, tavsiflar] =
      await withTenant(businessId, (tx) =>
      Promise.all([
        tx.execute(sql`
          select
            coalesce(category_code, '—')                     as category_code,
            count(*)::int                                    as evaluated,
            count(score)::int                                as scored,
            count(*) filter (where score is null)::int       as unknown_count,
            round(avg(score), 2)::float                      as avg_score,
            round(avg(score) / nullif(max(max_score), 0) * 100, 1)::float as avg_pct,
            count(*) filter (where score <= 1)::int          as weak_count,
            max(category_weight_pct)::float                  as weight_pct
          from criterion_score
          where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz
          group by 1
          order by avg_pct asc nulls last
        `),
        /**
         * Ball taqsimoti — o'rtacha yashiradigan narsani ochadi: 60%
         * o'rtacha "hamma 60 da" ham, "yarmi 90, yarmi 30" ham bo'lishi
         * mumkin, lekin bu ikkisi butunlay boshqa boshqaruv muammosi.
         */
        tx.execute(sql`
          select
            width_bucket(a.overall_score, 0, 100, 5) as bucket,
            count(*)::int                            as count
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
            and a.overall_score is not null
          group by 1 order by 1
        `),
        tx.execute(sql`
          select coalesce(a.compliance, 'aniqlanmadi') as key, count(*)::int as count
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by count desc
        `),
        /** Eng ko'p takrorlangan "asosiy zaif joy" — kouching mavzusi. */
        tx.execute(sql`
          select a.primary_gap as key, count(*)::int as count
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
            and a.primary_gap is not null and a.primary_gap <> ''
          group by 1 order by count desc limit 8
        `),
        /**
         * Mezon darajasidagi to'liq kesim + rubrika nusxasi.
         *
         * `(array_agg(... order by created_at desc))[1]` — ENG SO'NGGI
         * rubrika olinadi: davr ichida playbook yangilangan bo'lsa, eski
         * ta'rifni ko'rsatish chalg'itardi.
         */
        tx.execute(sql`
          select
            criterion_code,
            criterion_name,
            min(category_code)                                 as category_code,
            count(*)::int                                      as evaluated,
            count(score)::int                                  as scored,
            count(*) filter (where score is null)::int         as unknown_count,
            round(avg(score), 2)::float                        as avg_score,
            max(max_score)::int                                as max_score,
            round(avg(score) / nullif(max(max_score), 0) * 100, 1)::float as avg_pct,
            count(*) filter (where score <= 1)::int            as weak_count,
            (array_agg(rubric_snapshot order by created_at desc))[1] as rubric
          from criterion_score
          where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz
          group by criterion_code, criterion_name
          order by avg_pct asc nulls last
        `),
        /** Menejer × mezon xaritasi. */
        tx.execute(sql`
          select
            seat_id,
            criterion_code,
            criterion_name,
            count(score)::int                                             as scored,
            count(*) filter (where score is null)::int                    as unknown_count,
            round(avg(score) / nullif(max(max_score), 0) * 100, 1)::float as avg_pct
          from criterion_score
          where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz
            and seat_id is not null
          group by 1, 2, 3
        `),
        tx.execute(sql`
          select s.id as seat_id, s.display_name
          from seat s where s.is_active order by s.display_name
        `),
        criterionDescriptions(tx),
      ]),
    );

    const tavsifMap = tavsiflar as Map<string, string>;

    const criteriaRows = rows(criteria).map((r) => {
      const maxScore = Number(r.max_score ?? 3);
      const avg = r.avg_score === null ? null : Number(r.avg_score);
      // "Hozir ko'proq uchraydi" — o'rtacha ballga ENG YAQIN daraja.
      // Bu o'ylab topilgan gap emas, aynan shu bahoning rubrikadagi ta'rifi.
      const typicalLevel = avg === null ? null : Math.round(avg);
      return {
        code: r.criterion_code,
        name: r.criterion_name,
        description: tavsifMap.get(String(r.criterion_code)) ?? null,
        categoryCode: r.category_code,
        evaluated: r.evaluated,
        scored: r.scored,
        unknownCount: r.unknown_count,
        avgScore: avg,
        avgPct: r.avg_pct,
        weakCount: r.weak_count,
        maxScore,
        typicalLevel,
        typicalText: typicalLevel === null ? null : rubricText(r.rubric, typicalLevel),
        targetLevel: maxScore,
        targetText: rubricText(r.rubric, maxScore),
      };
    });

    /**
     * ── Nega kalit KOD emas, KOD+NOM ────────────────────────────────────
     * Mezon kodlari playbook avlodlari orasida QAYTA ISHLATILADI: eski
     * playbookdagi "A2 — Faol tinglash" va yangisidagi "A2 — Lid manbasi
     * va qulaylikni tekshirish" bazada bir xil kod bilan yotadi.
     *
     * Faqat kod bo'yicha guruhlansa, ikkita BUTUNLAY BOSHQA mezonning
     * ballari o'rtachalanib, ustiga bittasining nomi yopishtiriladi —
     * ya'ni raqam ham, kouching tavsiyasi ham noto'g'ri manzilga ketadi.
     * Kod+nom juftligi esa har bir ta'rifni alohida saqlaydi.
     */
    const kalit = (code: unknown, name: unknown) => `${String(code)} ${String(name)}`;

    const cells = rows(matrix).map((r) => ({
      seatId: r.seat_id as string,
      key: kalit(r.criterion_code, r.criterion_name),
      code: r.criterion_code as string,
      name: r.criterion_name as string,
      scored: r.scored as number,
      unknownCount: r.unknown_count as number,
      avgPct: r.avg_pct as number | null,
    }));

    // Ustunlar tartibi mezon ro'yxatining O'ZIDAN olinadi — xarita va
    // quyidagi ro'yxat bir xil tartibda bo'lishi uchun, aks holda ko'z
    // ikkalasini solishtira olmaydi.
    const ustunlar = criteriaRows
      .map((c) => ({ key: kalit(c.code, c.name), code: String(c.code), name: String(c.name) }))
      .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name));

    const matrixSeats = rows(seats)
      .map((s) => ({
        seatId: s.seat_id as string,
        displayName: s.display_name as string,
        cells: ustunlar.map((u) => {
          const hit = cells.find((c) => c.seatId === s.seat_id && c.key === u.key);
          return {
            code: u.code,
            name: u.name,
            avgPct: hit?.avgPct ?? null,
            scored: hit?.scored ?? 0,
          };
        }),
      }))
      .filter((s) => s.cells.some((c) => c.avgPct !== null));

    return {
      period: { from, to },
      criteria: criteriaRows,
      seatMatrix: {
        criteria: ustunlar.map((u) => ({ code: u.code, name: u.name })),
        seats: matrixSeats,
        // "O'rtacha" qatori mezon ro'yxatining O'ZIDAN olinadi, alohida
        // so'rovdan emas — shuning uchun xarita va ro'yxat hech qachon
        // bir-biriga zid raqam ko'rsatmaydi.
        average: ustunlar.map((u) => ({
          code: u.code,
          name: u.name,
          avgPct: criteriaRows.find((c) => kalit(c.code, c.name) === u.key)?.avgPct ?? null,
        })),
      },
      categories: rows(categories).map((r) => ({
        categoryCode: r.category_code,
        evaluated: r.evaluated,
        scored: r.scored,
        unknownCount: r.unknown_count,
        avgScore: r.avg_score,
        avgPct: r.avg_pct,
        weakCount: r.weak_count,
        weightPct: r.weight_pct,
      })),
      // width_bucket 1..5 → 0-20, 20-40, ... 80-100
      distribution: rows(distribution).map((r) => ({
        bucket: Number(r.bucket),
        label: `${(Number(r.bucket) - 1) * 20}–${Number(r.bucket) * 20}%`,
        count: r.count,
      })),
      compliance: rows(compliance).map((r) => ({ key: r.key, count: r.count })),
      topGaps: rows(gaps).map((r) => ({ key: r.key, count: r.count })),
    };
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * JAMOA MALAKASINI OSHIRISH — "kim bilan, nima ustida ishlash kerak"
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Bu blok reytingdan (`dashboard/leaderboard`) tubdan farq qiladi:
   * reyting KIM yaxshi ekanini aytadi, bu esa KEYINGI DUSHANBA KIM BILAN
   * NIMA MASHQ QILISH kerakligini.
   *
   * ── Nega qisqa yorliqlar mezon nomidan olinadi ──────────────────────────
   * Har tahlilda erkin matnli kouching bor (`manager_note`), lekin ular
   * to'liq gaplar: "Mijozning darsga qaytish muddati haqida aniqroq
   * kelishuvga erishish kerak." Bunday matnlarni sanab bo'lmaydi — har
   * biri bir marta uchraydi, ya'ni "eng ko'p takrorlanadigan muammo"
   * ro'yxati chiqmaydi.
   *
   * Shuning uchun takrorlanish MEZON darajasida sanaladi: mezon nomi
   * qisqa, barqaror va playbookdan keladi. Erkin matn esa aynan o'sha
   * qo'ng'iroq kartochkasida ko'rsatiladi — u yerda u o'rinli.
   */
  app.get('/api/v1/businesses/:businessId/analytics/coaching', guard, async (req) => {
    const { from, to } = period(periodQuery.parse(req.query));
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();

    const [seatRows, criterionRows, weakSpots, strongSpots, calls, trendRows] =
      await withTenant(businessId, (tx) =>
        Promise.all([
          tx.execute(sql`
            select
              s.id                                        as seat_id,
              s.display_name,
              count(a.id)::int                            as scored_calls,
              round(avg(a.overall_score), 1)::float       as avg_score,
              count(*) filter (where a.is_flagged)::int   as flagged
            from seat s
            join conversation c on c.seat_id = s.id
              and c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
            join analysis a on a.conversation_id = c.id and a.scoring_mode = 'scored'
            where s.is_active
            group by s.id, s.display_name
            order by avg_score asc nulls last
          `),
          /** Har sotuvchining har mezoni — eng zaifini topish uchun. */
          tx.execute(sql`
            select
              cs.seat_id,
              cs.criterion_code,
              cs.criterion_name,
              count(cs.score)::int                                               as scored,
              count(*) filter (where cs.score <= 1)::int                         as weak,
              round(avg(cs.score) / nullif(max(cs.max_score), 0) * 100, 1)::float as avg_pct
            from criterion_score cs
            where cs.created_at >= ${f}::timestamptz and cs.created_at < ${t}::timestamptz
              and cs.seat_id is not null
            group by 1, 2, 3
            having count(cs.score) > 0
          `),
          /**
           * Jamoa bo'ylab eng ko'p "zaif" chiqqan mezonlar.
           *
           * Kod+nom bo'yicha guruhlanadi: kodlar playbook avlodlari
           * orasida qayta ishlatiladi va faqat kod bo'yicha sanalsa,
           * ikkita boshqa mezon bitta qatorga qo'shilib ketardi.
           */
          tx.execute(sql`
            select criterion_code as code, criterion_name as name, count(*)::int as count
            from criterion_score
            where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz
              and score is not null and score <= 1
            group by 1, 2 order by count desc limit 8
          `),
          /** Eng ko'p to'liq ball olgan mezonlar — mustahkamlash kerak bo'lgan kuch. */
          tx.execute(sql`
            select criterion_code as code, criterion_name as name, count(*)::int as count
            from criterion_score
            where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz
              and score is not null and score >= max_score
            group by 1, 2 order by count desc limit 8
          `),
          /**
           * Ko'rib chiqiladigan va namunaviy qo'ng'iroqlar — bitta so'rovda.
           *
           * Juda qisqa suhbatlar chiqarib tashlanadi (4 tadan kam navbat):
           * "salom / band edim / xayr" tipidagi yozishma na muammo, na
           * namuna bo'la oladi, lekin balli past bo'lgani uchun ro'yxatni
           * to'ldirib yuborardi.
           */
          tx.execute(sql`
            select
              c.id                                   as conversation_id,
              c.started_at,
              s.display_name                         as seat_name,
              a.overall_score::float                 as overall_score,
              a.summary,
              a.primary_gap,
              a.manager_note #>> '{improvements,0}'  as improvement,
              a.manager_note #>> '{strengths,0}'     as strength,
              a.manager_note #>> '{betterPhrases,0,suggestion}' as suggestion,
              (select count(*) from transcript_segment ts where ts.conversation_id = c.id)::int
                                                     as turns
            from conversation c
            join analysis a on a.conversation_id = c.id and a.scoring_mode = 'scored'
            left join seat s on s.id = c.seat_id
            where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
              and a.overall_score is not null
              and (select count(*) from transcript_segment ts where ts.conversation_id = c.id) >= 4
            order by a.overall_score asc
          `),
          /** Sotuvchi bo'yicha kunlik trend — jamoa o'sayaptimi. */
          tx.execute(sql`
            select
              c.seat_id,
              date_trunc('day', c.started_at)         as day,
              round(avg(a.overall_score), 1)::float   as avg_score,
              count(*)::int                           as calls
            from conversation c
            join analysis a on a.conversation_id = c.id and a.scoring_mode = 'scored'
            where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
              and c.seat_id is not null and a.overall_score is not null
            group by 1, 2 order by 2
          `),
        ]),
      );

    const seatList = rows(seatRows).map((r) => ({
      seatId: r.seat_id as string,
      displayName: r.display_name as string,
      scoredCalls: r.scored_calls as number,
      avgScore: r.avg_score as number | null,
      flagged: r.flagged as number,
    }));

    const perSeat = rows(criterionRows);
    const allCalls = rows(calls);

    /**
     * Prioritet — kim bilan BIRINCHI ishlash kerak.
     *
     * Faqat past ball bo'yicha tartiblash noto'g'ri bo'lardi: bitta
     * baholangan suhbati bor sotuvchi tasodifan eng pastga tushib qolishi
     * mumkin. Shuning uchun kamida 2 ta baholangan qo'ng'iroq talab
     * qilinadi va tartib "zaif mezonlar soni" bilan birga hisoblanadi.
     */
    const priorities = seatList
      .filter((s) => s.scoredCalls >= 2 && s.avgScore !== null)
      .map((s) => {
        const mine = perSeat
          .filter((r) => r.seat_id === s.seatId && r.avg_pct !== null)
          .sort((a, b) => Number(a.avg_pct) - Number(b.avg_pct));
        const weakCount = mine.reduce((n, r) => n + Number(r.weak ?? 0), 0);
        const fokus = (r: Row | undefined) =>
          r
            ? {
                code: r.criterion_code as string,
                name: r.criterion_name as string,
                avgPct: r.avg_pct as number,
                weak: r.weak as number,
              }
            : null;
        return {
          ...s,
          weakCount,
          focus: fokus(mine[0]),
          secondFocus: fokus(mine[1]),
          reviewCalls: allCalls
            .filter((c) => c.seat_name === s.displayName)
            .slice(0, 2)
            .map((c) => ({
              conversationId: c.conversation_id as string,
              startedAt: c.started_at,
              overallScore: c.overall_score as number,
              summary: c.summary as string | null,
            })),
        };
      })
      // Eng katta ehtiyoj tepada: past ball + ko'p zaif mezon.
      .sort((a, b) => (a.avgScore ?? 100) - (b.avgScore ?? 100) || b.weakCount - a.weakCount);

    const kartochka = (c: Row) => ({
      conversationId: c.conversation_id,
      startedAt: c.started_at,
      seatName: c.seat_name,
      overallScore: c.overall_score,
      summary: c.summary,
      primaryGap: c.primary_gap,
      improvement: c.improvement,
      strength: c.strength,
      suggestion: c.suggestion,
    });

    const trendBySeat = new Map<string, { day: unknown; avgScore: number; calls: number }[]>();
    for (const r of rows(trendRows)) {
      const key = r.seat_id as string;
      if (!trendBySeat.has(key)) trendBySeat.set(key, []);
      trendBySeat.get(key)!.push({
        day: r.day,
        avgScore: r.avg_score as number,
        calls: r.calls as number,
      });
    }

    return {
      period: { from, to },
      kpi: {
        // "E'tibor kerak" — ball `yaxshi` chegarasidan (60%) past bo'lgan
        // sotuvchilar. Chegara `ballKlass` bilan bir xil manbadan.
        seatsNeedingAttention: priorities.filter((s) => (s.avgScore ?? 100) < 60).length,
        callsToReview: allCalls.filter((c) => Number(c.overall_score) < 60).length,
        scoredCalls: allCalls.length,
        seats: seatList.length,
      },
      priorities,
      improve: rows(weakSpots).map((r) => ({ code: r.code, name: r.name, count: r.count })),
      strong: rows(strongSpots).map((r) => ({ code: r.code, name: r.name, count: r.count })),
      reviewCalls: allCalls.slice(0, 6).map(kartochka),
      bestCalls: [...allCalls].reverse().slice(0, 6).map(kartochka),
      trend: seatList
        .map((s) => ({
          seatId: s.seatId,
          displayName: s.displayName,
          points: trendBySeat.get(s.seatId) ?? [],
        }))
        .filter((s) => s.points.length > 0),
    };
  });

  /**
   * OVOZ — kim ko'p gapirdi va qizil bayroqlar.
   *
   * ── Gaplashish nisbati qanday o'lchanadi ────────────────────────────────
   * To'g'ri o'lchov — AUDIO VAQTI: 30 soniya gapirgan odam 30 soniya
   * gapirgan, matn uzunligi bunga aloqasiz. Lekin `end_seconds` faqat
   * audio yozuvdan kelgan suhbatlarda to'ladi; Telegram yozishmasida u
   * yo'q va bo'lishi ham mumkin emas.
   *
   * Shuning uchun ikki usul bor va javob QAYSI USUL ishlatilganini
   * aytadi (`method`). UI shuni yozadi. Aks holda rahbar matnli
   * yozishmadagi "belgilar ulushi" ni gapirish vaqti deb o'qib,
   * noto'g'ri xulosa chiqarardi.
   */
  app.get('/api/v1/businesses/:businessId/analytics/voice', guard, async (req) => {
    const { from, to } = period(periodQuery.parse(req.query));
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();

    const [talk, flags, flagKinds] = await withTenant(businessId, (tx) =>
      Promise.all([
        tx.execute(sql`
          select
            s.id                                    as seat_id,
            s.display_name,
            count(distinct c.id)::int               as conversations,
            sum(length(ts.text)) filter (where ts.speaker = 'manager')::int as manager_chars,
            sum(length(ts.text)) filter (where ts.speaker = 'client')::int  as client_chars,
            sum(ts.end_seconds - ts.start_seconds)
              filter (where ts.speaker = 'manager' and ts.end_seconds is not null)::float
                                                    as manager_seconds,
            sum(ts.end_seconds - ts.start_seconds)
              filter (where ts.speaker = 'client' and ts.end_seconds is not null)::float
                                                    as client_seconds
          from seat s
          join conversation c on c.seat_id = s.id
            and c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          -- Faqat BAHOLANGAN suhbatlar: filtrlangan va tashlab yuborilgan
          -- yozuvlar nisbatni buzadi.
          join analysis a on a.conversation_id = c.id and a.scoring_mode = 'scored'
          join transcript_segment ts on ts.conversation_id = c.id
          where s.is_active
          group by s.id, s.display_name
          order by conversations desc
        `),
        tx.execute(sql`
          select
            s.id                                                       as seat_id,
            s.display_name,
            count(distinct c.id)::int                                  as conversations,
            count(distinct al.id)::int                                 as flags
          from seat s
          join conversation c on c.seat_id = s.id
            and c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          join analysis a on a.conversation_id = c.id and a.scoring_mode = 'scored'
          left join alert al on al.conversation_id = c.id and al.kind = 'red_flag'
          where s.is_active
          group by s.id, s.display_name
          order by flags desc, conversations desc
        `),
        tx.execute(sql`
          select al.title as key, count(*)::int as count
          from alert al
          join conversation c on c.id = al.conversation_id
          where al.kind = 'red_flag'
            and c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by count desc limit 10
        `),
      ]),
    );

    return {
      period: { from, to },
      talkRatio: rows(talk).map((r) => {
        const mSec = Number(r.manager_seconds ?? 0);
        const cSec = Number(r.client_seconds ?? 0);
        const vaqtBor = mSec + cSec > 0;
        const m = vaqtBor ? mSec : Number(r.manager_chars ?? 0);
        const c = vaqtBor ? cSec : Number(r.client_chars ?? 0);
        const jami = m + c;
        return {
          seatId: r.seat_id,
          displayName: r.display_name,
          conversations: r.conversations,
          method: vaqtBor ? ('duration' as const) : ('chars' as const),
          managerPct: jami > 0 ? Math.round((m / jami) * 1000) / 10 : null,
          clientPct: jami > 0 ? Math.round((c / jami) * 1000) / 10 : null,
        };
      }),
      redFlags: rows(flags).map((r) => ({
        seatId: r.seat_id,
        displayName: r.display_name,
        conversations: r.conversations,
        flags: r.flags,
      })),
      flagKinds: rows(flagKinds).map((r) => ({ key: r.key, count: r.count })),
    };
  });

  /**
   * LID ANALITIKASI — sifat, shoshilinchlik, e'tirozlar.
   *
   * E'tirozlar (`signals.objections`) jsonb massivi ichida: `jsonb_array_elements_text`
   * bilan yoyib sanaladi. Bu rahbarga eng qimmatli ro'yxatlardan biri —
   * "mijozlar eng ko'p nimadan qo'rqadi" savolining javobi.
   */
  app.get('/api/v1/businesses/:businessId/analytics/leads', guard, async (req) => {
    const { from, to } = period(periodQuery.parse(req.query));
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();

    const [quality, urgency, objections, deals, dm] = await withTenant(businessId, (tx) =>
      Promise.all([
        tx.execute(sql`
          select
            coalesce(${leadBucket}, 'aniqlanmadi')       as key,
            count(*)::int                                as count,
            round(avg(a.overall_score), 1)::float        as avg_score,
            -- Model aynan qaysi so'zlarni yozgani: 'unknown' chelagi
            -- katta bo'lsa, playbook lug'atini to'ldirish kerakligi shu
            -- yerdan ko'rinadi.
            array_agg(distinct a.lead_quality) filter (where a.lead_quality is not null) as raw_labels
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by count desc
        `),
        tx.execute(sql`
          select coalesce(a.signals #>> '{urgency}', 'aniqlanmadi') as key, count(*)::int as count
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by count desc
        `),
        tx.execute(sql`
          select lower(trim(o)) as key, count(*)::int as count
          from conversation c
          join analysis a on a.conversation_id = c.id
          cross join lateral jsonb_array_elements_text(
            case when jsonb_typeof(a.signals -> 'objections') = 'array'
                 then a.signals -> 'objections' else '[]'::jsonb end
          ) as o
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
            and trim(o) <> ''
          group by 1 order by count desc limit 12
        `),
        tx.execute(sql`
          select
            count(*) filter (where (a.deal #>> '{amount}') is not null)::int as known,
            sum((a.deal #>> '{amount}')::numeric)::float                     as total,
            round(avg((a.deal #>> '{amount}')::numeric), 0)::float           as avg,
            max((a.deal #>> '{amount}')::numeric)::float                     as max,
            min(nullif(a.deal #>> '{currency}', ''))                         as currency
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
        `),
        tx.execute(sql`
          select
            count(*) filter (where (a.client_extracted #>> '{isDecisionMaker}') = 'true')::int  as yes,
            count(*) filter (where (a.client_extracted #>> '{isDecisionMaker}') = 'false')::int as no,
            count(*) filter (where (a.client_extracted #>> '{isDecisionMaker}') is null)::int   as unknown
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
        `),
      ]),
    );

    const d = rows(deals)[0]!;
    const m = rows(dm)[0]!;

    return {
      period: { from, to },
      leadQuality: rows(quality).map((r) => ({
        key: r.key,
        count: r.count,
        avgScore: r.avg_score ?? null,
        rawLabels: (r.raw_labels as string[] | null) ?? [],
      })),
      urgency: rows(urgency).map((r) => ({ key: r.key, count: r.count })),
      objections: rows(objections).map((r) => ({ key: r.key, count: r.count })),
      deals: {
        known: d.known,
        total: Number(d.known) > 0 ? d.total : null,
        avg: Number(d.known) > 0 ? d.avg : null,
        max: Number(d.known) > 0 ? d.max : null,
        currency: d.currency ?? null,
      },
      decisionMaker: { yes: m.yes, no: m.no, unknown: m.unknown },
    };
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * LID VORONKASI — lidlar hayotiy sikli va nega yo'qotilyapti
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ── MUHIM: bu CRM natijasi EMAS ─────────────────────────────────────────
   * Bizda "bitim yutildi/yo'qotildi" degan haqiqiy manba yo'q — CRM
   * ulanmagan. Shuning uchun lid holati FAOLLIK bo'yicha aniqlanadi:
   *
   *   faol      — oxirgi aloqa `activeDays` kun ichida
   *   sovimoqda — `activeDays`..`lostDays` orasida
   *   sovigan   — `lostDays` dan ko'p vaqt o'tgan
   *
   * Bu "yutgan/yo'qotgan" degani EMAS va UI shuni ochiq yozadi. Aks holda
   * rahbar taxminni fakt deb o'qib, mavjud bo'lmagan konversiyaga qarab
   * qaror qilardi.
   *
   * "Yutilgan" deb faqat bitta narsa sanaladi: suhbatda ANIQ summa
   * kelishilgani (`deal.amount`) — bu modelning eshitgani, ya'ni dalil.
   */
  app.get('/api/v1/businesses/:businessId/analytics/funnel', guard, async (req) => {
    const q = periodQuery
      .extend({
        activeDays: z.coerce.number().int().min(1).max(120).default(14),
        lostDays: z.coerce.number().int().min(2).max(365).default(30),
      })
      .parse(req.query);
    const { from, to } = period(q);
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();

    /**
     * Lid = kontakt. Har kontakt uchun oxirgi holati yig'iladi.
     *
     * `lateral` ishlatilgan: har kontaktning ENG SO'NGGI tahlili kerak,
     * oddiy `join` esa hamma suhbatni qaytarib, agregatni buzardi.
     */
    const lidBaza = sql`
      select
        ct.id                                   as contact_id,
        ct.name,
        ct.first_seen_at,
        oxirgi.started_at                       as last_at,
        oxirgi.seat_id,
        s.display_name                          as seat_name,
        a.lead_quality,
        a.overall_score,
        a.primary_gap,
        a.summary,
        a.signals,
        (a.deal #>> '{amount}')::numeric        as deal_amount,
        (select count(*) from conversation c2 where c2.contact_id = ct.id)::int as suhbatlar,
        (select count(*) from conversation c3
           join analysis a3 on a3.conversation_id = c3.id
          where c3.contact_id = ct.id and (a3.deal #>> '{amount}') is not null)::int as bitimli,
        extract(epoch from (now() - oxirgi.started_at)) / 86400 as kun_otdi
      from contact ct
      cross join lateral (
        select c.id, c.started_at, c.seat_id
        from conversation c
        where c.contact_id = ct.id
          and c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
        order by c.started_at desc limit 1
      ) oxirgi
      left join analysis a on a.conversation_id = oxirgi.id
      left join seat s on s.id = oxirgi.seat_id
    `;

    const [lidlar, sabablar, bosqichlar] = await withTenant(businessId, (tx) =>
      Promise.all([
        tx.execute(sql`select * from (${lidBaza}) lid order by last_at desc`),
        /**
         * Nega yo'qotyapmiz — sovib qolgan lidlarning e'tirozlari.
         * Faqat SOVIGAN lidlar olinadi: faol lidning e'tirozi hali
         * yo'qotish sababi emas, u hozir ustida ishlanyapti.
         */
        tx.execute(sql`
          select lower(trim(o)) as key, count(*)::int as count,
                 min(lid.summary) as namuna
          from (${lidBaza}) lid
          cross join lateral jsonb_array_elements_text(
            case when jsonb_typeof(lid.signals -> 'objections') = 'array'
                 then lid.signals -> 'objections' else '[]'::jsonb end
          ) as o
          where lid.kun_otdi >= ${q.activeDays} and lid.bitimli = 0 and trim(o) <> ''
          group by 1 order by count desc limit 8
        `),
        /**
         * Qaysi bosqichda yo'qotyapmiz — sovib qolgan lidlarda eng zaif
         * chiqqan mezon KATEGORIYASI. Bu "e'tirozga javobda yiqilyapmiz"
         * degan aniq boshqaruv javobini beradi.
         */
        tx.execute(sql`
          select
            coalesce(cs.category_code, '—')                as key,
            min(cs.criterion_name)                         as namuna,
            count(*)::int                                  as count
          from (${lidBaza}) lid
          join conversation c on c.contact_id = lid.contact_id
          join criterion_score cs on cs.conversation_id = c.id
          where lid.kun_otdi >= ${q.activeDays} and lid.bitimli = 0
            and cs.score is not null and cs.score <= 1
          group by 1 order by count desc limit 8
        `),
      ]),
    );

    const lid = rows(lidlar).map((r) => {
      const kun = Number(r.kun_otdi ?? 0);
      const bitimli = Number(r.bitimli ?? 0) > 0;
      const holat = bitimli
        ? ('bitimli' as const)
        : kun < q.activeDays
          ? ('faol' as const)
          : kun < q.lostDays
            ? ('sovimoqda' as const)
            : ('sovigan' as const);
      return {
        contactId: r.contact_id as string,
        name: (r.name as string | null) ?? null,
        seatId: (r.seat_id as string | null) ?? null,
        seatName: (r.seat_name as string | null) ?? null,
        lastAt: r.last_at,
        daysSince: Math.round(kun * 10) / 10,
        conversations: r.suhbatlar as number,
        leadQuality: (r.lead_quality as string | null) ?? null,
        overallScore: r.overall_score === null ? null : Number(r.overall_score),
        primaryGap: (r.primary_gap as string | null) ?? null,
        summary: (r.summary as string | null) ?? null,
        dealAmount: r.deal_amount === null ? null : Number(r.deal_amount),
        holat,
      };
    });

    const sanoq = (h: string) => lid.filter((l) => l.holat === h).length;
    const ballar = lid.map((l) => l.overallScore).filter((v): v is number => v !== null);

    return {
      period: { from, to },
      thresholds: { activeDays: q.activeDays, lostDays: q.lostDays },
      lifecycle: {
        total: lid.length,
        withDeal: sanoq('bitimli'),
        active: sanoq('faol'),
        cooling: sanoq('sovimoqda'),
        cold: sanoq('sovigan'),
      },
      quality: {
        avgScore:
          ballar.length > 0
            ? Math.round((ballar.reduce((a, b) => a + b, 0) / ballar.length) * 10) / 10
            : null,
        low: ballar.filter((v) => v < 40).length,
        mid: ballar.filter((v) => v >= 40 && v < 60).length,
        high: ballar.filter((v) => v >= 60).length,
        scored: ballar.length,
      },
      lossReasons: rows(sabablar).map((r) => ({
        key: r.key,
        count: r.count,
        example: r.namuna,
      })),
      lossStages: rows(bosqichlar).map((r) => ({
        key: r.key,
        example: r.namuna,
        count: r.count,
      })),
      /**
       * Qayta bog'lanish mumkin bo'lgan lidlar — sovib qolgan, lekin
       * bitimi bo'lmagan kontaktlar. Tartib: eng ko'p suhbat qilgan va
       * eng yuqori baholangan yuqorida, ya'ni qaytarish ehtimoli kattaroq.
       */
      reconnect: lid
        .filter((l) => l.holat === 'sovimoqda' || l.holat === 'sovigan')
        .sort(
          (a, b) =>
            (b.overallScore ?? 0) - (a.overallScore ?? 0) || b.conversations - a.conversations,
        )
        .slice(0, 20),
    };
  });

  /**
   * VAZIFALAR TAHLILI — tahlil harakatga aylandimi?
   *
   * Eng muhim raqam bu yerda `overdue`: AI vazifa yaratdi, lekin uni
   * hech kim bajarmadi degani — ya'ni butun quvur bekorga ishlagan.
   */
  app.get('/api/v1/businesses/:businessId/analytics/tasks', guard, async (req) => {
    const q = periodQuery
      .extend({
        /** Manba filtri — `all` bo'lsa hamma vazifa hisobga olinadi. */
        source: z.enum(['all', 'playbook_analysis', 'other_analysis', 'manual']).default('all'),
      })
      .parse(req.query);
    const { from, to } = period(q);
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();

    // Manba filtri hamma so'rovga bir xil qo'llanadi — aks holda
    // yuqoridagi raqam va pastdagi jadval boshqa to'plamni sanardi.
    const manba = q.source === 'all' ? sql`` : sql` and source = ${q.source}`;
    const manbaK = q.source === 'all' ? sql`` : sql` and k.source = ${q.source}`;

    /** Ochiq deb hisoblanadigan holatlar — bitta joyda. */
    const OCHIQ = sql`('pending', 'in_progress', 'blocked')`;

    const [hozir, davr, byStatus, byAction, bySource, bySeat, daily, byStage, commitments] =
      await withTenant(businessId, (tx) =>
        Promise.all([
          /**
           * "HOZIR" — ayni damdagi holat, davrga BOG'LIQ EMAS.
           *
           * Bu farq muhim: "davrda 846 ta yaratildi" tarixiy fakt, "hozir
           * 589 tasi kechikkan" esa bugungi muammo. Ikkalasini bitta
           * blokka qo'shib yuborish rahbarni chalg'itadi, shuning uchun
           * UI'da ham ular alohida sarlavha ostida turadi.
           */
          tx.execute(sql`
            select
              count(*) filter (where status in ${OCHIQ})::int                as open,
              count(*) filter (where status in ${OCHIQ}
                                 and due_at is not null and due_at < now())::int as overdue,
              count(*) filter (where status in ${OCHIQ}
                                 and due_at is not null
                                 and due_at >= date_trunc('day', now())
                                 and due_at <  date_trunc('day', now()) + interval '1 day')::int
                                                                             as due_today
            from task where true${manba}
          `),
          tx.execute(sql`
            select
              count(*) filter (where created_at >= ${f}::timestamptz
                                 and created_at < ${t}::timestamptz)::int    as created,
              count(*) filter (where completed_at >= ${f}::timestamptz
                                 and completed_at < ${t}::timestamptz)::int  as completed,
              -- O'rtacha bajarilish vaqti FAQAT bajarilganlar bo'yicha:
              -- bajarilmaganini "cheksiz" deb qo'shib bo'lmaydi.
              round(avg(extract(epoch from (completed_at - created_at)))
                    filter (where completed_at >= ${f}::timestamptz
                              and completed_at < ${t}::timestamptz))::float  as avg_seconds
            from task where true${manba}
          `),
          tx.execute(sql`
            select status::text as key, count(*)::int as count
            from task
            where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz${manba}
            group by 1 order by count desc
          `),
          tx.execute(sql`
            select coalesce(action, 'boshqa') as key, count(*)::int as count,
                   count(*) filter (where status = 'done')::int as done
            from task
            where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz${manba}
            group by 1 order by count desc limit 10
          `),
          /** Manba kesimi — filtr qo'llanmaydi, chunki bu blokning O'ZI manbalar haqida. */
          tx.execute(sql`
            select
              source::text                                                   as key,
              count(*) filter (where status in ${OCHIQ})::int                as open,
              count(*) filter (where created_at >= ${f}::timestamptz
                                 and created_at < ${t}::timestamptz)::int    as created,
              count(*) filter (where completed_at >= ${f}::timestamptz
                                 and completed_at < ${t}::timestamptz)::int  as completed
            from task
            group by 1 order by created desc
          `),
          tx.execute(sql`
            select
              s.id as seat_id, s.display_name,
              count(*) filter (where k.status in ${OCHIQ})::int              as open,
              count(*) filter (where k.status in ${OCHIQ}
                                 and k.due_at is not null and k.due_at < now())::int as overdue,
              count(*) filter (where k.created_at >= ${f}::timestamptz
                                 and k.created_at < ${t}::timestamptz)::int  as created,
              count(*) filter (where k.completed_at >= ${f}::timestamptz
                                 and k.completed_at < ${t}::timestamptz)::int as completed
            from seat s
            join task k on k.seat_id = s.id${manbaK}
            where s.is_active
            group by s.id, s.display_name
            having count(k.id) > 0
            order by overdue desc, open desc
          `),
          /**
           * Kunlik "yaratildi va bajarildi".
           *
           * Ikki sana bo'yicha (yaratilgan va bajarilgan) alohida
           * sanaladi, keyin `full join` bilan birlashtiriladi — vazifa
           * bir kuni yaratilib boshqa kuni bajarilishi mumkin, shuning
           * uchun bitta `group by` yetmaydi.
           */
          tx.execute(sql`
            with yaratildi as (
              select date_trunc('day', created_at) as kun, count(*)::int as n
              from task
              where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz${manba}
              group by 1
            ),
            bajarildi as (
              select date_trunc('day', completed_at) as kun, count(*)::int as n
              from task
              where completed_at >= ${f}::timestamptz and completed_at < ${t}::timestamptz${manba}
              group by 1
            )
            select
              coalesce(y.kun, b.kun)   as kun,
              coalesce(y.n, 0)::int    as created,
              coalesce(b.n, 0)::int    as completed
            from yaratildi y
            full join bajarildi b on b.kun = y.kun
            order by 1
          `),
          /** CRM voronkasi bosqichlari — integratsiya bo'lmasa bo'sh qaytadi. */
          tx.execute(sql`
            select
              coalesce(nullif(crm_stage_name, ''), 'bosqichsiz')             as key,
              count(*) filter (where status in ${OCHIQ})::int                as open,
              count(*) filter (where status in ${OCHIQ}
                                 and due_at is not null and due_at < now())::int as overdue
            from task where true${manba}
            group by 1
            having count(*) filter (where status in ${OCHIQ}) > 0
            order by open desc limit 12
          `),
          tx.execute(sql`
            select by_party::text as party, status::text as status, count(*)::int as count
            from commitment
            where created_at >= ${f}::timestamptz and created_at < ${t}::timestamptz
            group by 1, 2
          `),
        ]),
      );

    const h = rows(hozir)[0]!;
    const d = rows(davr)[0]!;
    const created = Number(d.created ?? 0);
    const completed = Number(d.completed ?? 0);

    return {
      period: { from, to },
      source: q.source,
      now: {
        open: h.open,
        overdue: h.overdue,
        dueToday: h.due_today,
      },
      periodStats: {
        created,
        completed,
        /**
         * Maxraj — yaratilgan VA bajarilganlarning birlashmasi emas,
         * balki yaratilganlar soni. Sabab: "davr bajarilishi" savoli
         * "shu davrda tug'ilgan ishning qanchasi yopildi" degani.
         * Bajarilganlar orasida oldingi davrda yaratilganlari ham bo'ladi,
         * shuning uchun foiz 100 dan oshib ketishi mumkin — bu xato emas,
         * eski qarzning yopilgani.
         */
        completionPct: created > 0 ? Math.round((completed / created) * 1000) / 10 : null,
        avgCompletionSeconds: d.avg_seconds ?? null,
      },
      byStatus: rows(byStatus).map((r) => ({ key: r.key, count: r.count })),
      byAction: rows(byAction).map((r) => ({ key: r.key, count: r.count, done: r.done })),
      bySource: rows(bySource).map((r) => ({
        key: r.key,
        open: r.open,
        created: r.created,
        completed: r.completed,
      })),
      bySeat: rows(bySeat).map((r) => ({
        seatId: r.seat_id,
        displayName: r.display_name,
        open: r.open,
        overdue: r.overdue,
        created: r.created,
        completed: r.completed,
        completionPct:
          Number(r.created) > 0
            ? Math.round((Number(r.completed) / Number(r.created)) * 1000) / 10
            : null,
      })),
      daily: rows(daily).map((r) => ({
        day: r.kun,
        created: r.created,
        completed: r.completed,
      })),
      byStage: rows(byStage).map((r) => ({ key: r.key, open: r.open, overdue: r.overdue })),
      commitments: rows(commitments).map((r) => ({
        party: r.party,
        status: r.status,
        count: r.count,
      })),
    };
  });

  /**
   * FAOLIYAT TAHLILI — qachon va qancha ishlangani.
   *
   * Soat kesimi biznes vaqt zonasida hisoblanadi: UTC bo'yicha
   * "eng band soat 04:00" degan javob rahbarga hech narsa bermaydi.
   */
  app.get('/api/v1/businesses/:businessId/analytics/activity', guard, async (req) => {
    const q = periodQuery
      .extend({
        /** Qayta aloqa oynasi (daqiqa) — javobsizni "tashlab yuborilgan" deb sanash chegarasi. */
        callbackMinutes: z.coerce.number().int().min(5).max(1440).default(30),
      })
      .parse(req.query);
    const { from, to } = period(q);
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();
    const oyna = q.callbackMinutes;

    /**
     * Vaqt zonasi, biznes jadvali va menejerlar jadvali — BITTA
     * tranzaksiyada.
     *
     * Ilgari ikkita alohida `withTenant` bor edi, ya'ni har so'rovda
     * ikkita BEGIN/SET LOCAL/COMMIT. Ular bir xil ma'lumot to'plamiga
     * tegishli va ketma-ket bajarilardi — birlashtirish bitta borish-
     * kelishni tejaydi va tranzaksiya chegarasini soddalashtiradi.
     *
     * Menejerlar jadvali faqat bosh kalit yoqilganda so'raladi: aks
     * holda natija baribir ishlatilmasdi.
     */
    const { tz, orinlar } = await withTenant(businessId, async (tx) => {
      const [b] = (await tx.execute(
        sql`select timezone, work_hours from business limit 1`,
      )) as unknown as Row[];
      const jadval = workHoursSchema.parse(b?.work_hours ?? {});
      const o = jadval.perSeatSchedules
        ? ((await tx.execute(
            sql`select id, work_hours from seat where work_hours is not null`,
          )) as unknown as Row[])
        : [];
      return { tz: b, orinlar: o };
    });

    const zone = (tz?.timezone as string) || 'UTC';
    const biznesJadval = workHoursSchema.parse(tz?.work_hours ?? {});
    const orinJadvallar = orinlar.map((r) => ({
      seatId: String(r.id),
      jadval: amaldagiJadval(
        biznesJadval,
        seatWorkHoursSchema.parse(r.work_hours ?? null) ?? undefined,
      ),
    }));

    /**
     * Ish kunlari ro'yxati SQL matniga to'g'ridan-to'g'ri yoziladi.
     *
     * Parametr sifatida berilsa (`= any($1)`) drayver massivni kortejga
     * aylantirib, "operator does not exist" xatosini berardi. Qiymatlar
     * Zod orqali 1..7 butun sonlar deb tekshirilgan, ya'ni bu yerda
     * foydalanuvchi matni umuman yo'q.
     */
    const jadvalIfoda = (u: ReturnType<typeof sql.raw>, j: typeof biznesJadval) => sql`(
        extract(hour from ${u} at time zone ${zone}) >= ${j.startHour}
        and extract(hour from ${u} at time zone ${zone}) < ${j.endHour}
        and extract(isodow from ${u} at time zone ${zone})::int in ${sql.raw(`(${j.days.join(',')})`)}
      )`;

    /**
     * Berilgan USTUN (masalan `c.started_at`) ish vaqtiga tushadimi.
     *
     * `seatUstun` — qaysi o'ringa tegishli ekanini bildiradi. Alohida
     * jadvalli o'rin bo'lmasa, ikkinchi argument umuman ishlatilmaydi.
     */
    const ishVaqtida = (ustun: string, seatUstun?: string) => {
      const u = sql.raw(ustun);
      if (orinJadvallar.length === 0 || !seatUstun) return jadvalIfoda(u, biznesJadval);
      const shartlar = orinJadvallar.map(
        (o) => sql`when ${o.seatId}::uuid then ${jadvalIfoda(u, o.jadval)}`,
      );
      return sql`(case ${sql.raw(seatUstun)} ${sql.join(shartlar, sql` `)} else ${jadvalIfoda(u, biznesJadval)} end)`;
    };

    /**
     * "Javobsiz" ta'rifi — bitta joyda, chunki u bir nechta so'rovda
     * ishlatiladi va ogohlantirish mantiqi bilan bir xil bo'lishi shart
     * (analyze.ts): navbat javobsiz qolgan VA model uni javob kutayotgan
     * deb bilgan. Aks holda KPI va ogohlantirishlar soni bir-biriga mos
     * kelmay qoladi.
     */
    const JAVOBSIZ = sql`
      (a.dynamics #>> '{replyMetrics,unansweredTurns}')::int > 0
      and coalesce(a.dynamics #>> '{needsReply}', 'true') <> 'false'
    `;
    /** Birinchi javob soniyalari — takrorlanmasligi uchun. */
    const BIRINCHI = sql`(a.dynamics #>> '{replyMetrics,firstResponseSeconds}')::numeric`;

    /**
     * ── "ULANGAN" NIMA DEGANI ────────────────────────────────────────────
     * Telefoniyada bu "go'shak ko'tarildimi". Bizda qo'ng'iroq emas,
     * yozishma bor, shuning uchun ma'noviy ekvivalenti: MIJOZ ham,
     * MENEJER ham gapirgan suhbat — ya'ni aloqa haqiqatan o'rnatilgan.
     *
     * "Ulanmagan" — mijoz yozgan, lekin menejer umuman javob bermagan
     * (yoki aksincha). Bu telefoniyadagi "bog'lana olmagan" bilan bir xil
     * boshqaruv ma'nosiga ega: urinish bo'lgan, natija bo'lmagan.
     *
     * Segmentlar bo'yicha hisoblanadi (`analysis` emas): tahlil qilinmagan
     * suhbatlar ham bu kesimda ko'rinishi kerak.
     */
    const TOMONLAR = sql`
      (select count(*) filter (where ts.speaker = 'manager') from transcript_segment ts
        where ts.conversation_id = c.id) > 0
      and (select count(*) filter (where ts.speaker = 'client') from transcript_segment ts
        where ts.conversation_id = c.id) > 0
    `;

    const [
      byHour,
      byWeekday,
      duration,
      replies,
      daily,
      bySeat,
      speed,
      ishVaqti,
      qaytaAloqasiz,
      yangiLid,
    ] = await withTenant(businessId, (tx) =>
      Promise.all([
        tx.execute(sql`
          select
            extract(hour from c.started_at at time zone ${zone})::int as hour,
            count(*)::int                                            as count,
            round(avg(a.overall_score), 1)::float                    as avg_score,
            count(a.id) filter (where ${JAVOBSIZ})::int              as unanswered,
            count(a.id) filter (where a.id is not null and not (${JAVOBSIZ}))::int as answered
          from conversation c left join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by 1
        `),
        tx.execute(sql`
          select
            extract(isodow from c.started_at at time zone ${zone})::int as weekday,
            count(*)::int                                              as count,
            round(avg(a.overall_score), 1)::float                      as avg_score
          from conversation c left join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by 1
        `),
        tx.execute(sql`
          select
            count(c.duration_seconds)::int                                          as known,
            round(avg(c.duration_seconds), 0)::float                                as avg,
            percentile_cont(0.5) within group (order by c.duration_seconds)::float  as median,
            max(c.duration_seconds)::int                                            as max
          from conversation c
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
        `),
        tx.execute(sql`
          select
            percentile_cont(0.5) within group (order by ${BIRINCHI})::float as median_first_response,
            count(*) filter (where ${JAVOBSIZ})::int                        as unanswered,
            count(a.id)::int                                               as analyzed,
            count(a.id) filter (where a.scoring_mode = 'scored')::int       as scored
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
        `),
        /** Kunlik faollik — yaqinlashtiriladigan trend grafigi uchun. */
        tx.execute(sql`
          select
            date_trunc('day', c.started_at at time zone ${zone})            as kun,
            count(*)::int                                                   as jami,
            count(a.id) filter (where ${JAVOBSIZ})::int                     as unanswered,
            round(avg(a.overall_score), 1)::float                           as avg_score
          from conversation c left join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          group by 1 order by 1
        `),
        tx.execute(sql`
          select
            s.id as seat_id, s.display_name,
            count(c.id)::int                                                as total,
            count(c.id) filter (where ${TOMONLAR})::int                     as engaged,
            count(c.id) filter (where not (${TOMONLAR}))::int               as not_engaged,
            count(a.id)::int                                                as analyzed,
            count(a.id) filter (where a.scoring_mode = 'scored')::int       as scored,
            -- "Operatsion" — sotuv emas, xizmat/ichki gaplar. Menejer
            -- vaqtining qanchasi sotuvdan tashqarida ketganini ko'rsatadi.
            count(a.id) filter (
              where a.business_relevance in ('support', 'internal', 'other')
            )::int                                                          as operational,
            count(a.id) filter (where ${JAVOBSIZ})::int                     as unanswered,
            percentile_cont(0.5) within group (order by ${BIRINCHI})::float as median_first_response
          from seat s
          join conversation c on c.seat_id = s.id
            and c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          left join analysis a on a.conversation_id = c.id
          where s.is_active
          group by s.id, s.display_name
          order by total desc
        `),
        /**
         * Birinchi javob tezligi chelaklari.
         *
         * Chegaralar mijoz sabri bo'yicha tanlangan, teng bo'lakka
         * bo'lingan emas: 15 daqiqagacha "tez", 1 soatdan keyin mijoz
         * odatda boshqa joyga murojaat qiladi.
         */
        tx.execute(sql`
          select
            count(*) filter (where ${BIRINCHI} < 900)::int                       as t15,
            count(*) filter (where ${BIRINCHI} >= 900  and ${BIRINCHI} < 3600)::int  as t60,
            count(*) filter (where ${BIRINCHI} >= 3600 and ${BIRINCHI} < 14400)::int as t4h,
            count(*) filter (where ${BIRINCHI} >= 14400)::int                    as t4hp,
            count(*) filter (where ${BIRINCHI} is null)::int                     as noma_lum
          from conversation c join analysis a on a.conversation_id = c.id
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
        `),
        /**
         * Javobsiz sessiyalar ish vaqtida bo'ldimi?
         *
         * 9:00–18:00 va dushanba–shanba oralig'i olinadi. Bu qat'iy
         * taxmin — biznesning haqiqiy ish jadvali sozlamalarda yo'q,
         * shuning uchun UI'da oraliq ochiq yozilади va raqam "taxminiy"
         * sifatida taqdim etiladi.
         */
        tx.execute(sql`
          select
            s.id as seat_id, s.display_name,
            count(*) filter (where ${JAVOBSIZ} and ${ishVaqtida('c.started_at', 'c.seat_id')})::int as ish_vaqtida,
            count(*) filter (where ${JAVOBSIZ} and not ${ishVaqtida('c.started_at', 'c.seat_id')})::int as tashqarida
          from seat s
          join conversation c on c.seat_id = s.id
            and c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          join analysis a on a.conversation_id = c.id
          where s.is_active
          group by s.id, s.display_name
          having count(*) filter (where ${JAVOBSIZ}) > 0
          order by 3 desc
        `),
        /**
         * ── JAVOBSIZ VA QAYTA ALOQASIZ ──────────────────────────────────
         * Faqat "javob berilmadi" degan raqam yetarli emas: menejer 10
         * daqiqadan keyin o'zi yozgan bo'lsa, lid yo'qolmagan. Haqiqiy
         * muammo — javob ham berilmagan, tanlangan oyna ichida qayta
         * ham bog'lanilmagan holatlar.
         *
         * Qayta aloqa SHU KONTAKT bilan keyingi suhbat bor-yo'qligi
         * bo'yicha aniqlanadi, shuning uchun faqat kontaktga bog'langan
         * suhbatlar hisobga olinadi (bog'lanmaganini tekshirib bo'lmaydi).
         */
        tx.execute(sql`
          with javobsiz as (
            select c.id, c.contact_id, c.seat_id, c.started_at
            from conversation c join analysis a on a.conversation_id = c.id
            where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
              and c.contact_id is not null
              and ${JAVOBSIZ}
          )
          select
            s.id as seat_id, s.display_name,
            count(*)::int as jami,
            count(*) filter (where ${ishVaqtida('j.started_at', 'j.seat_id')})::int     as ish_vaqtida,
            count(*) filter (where not ${ishVaqtida('j.started_at', 'j.seat_id')})::int as tashqarida
          from javobsiz j
          left join seat s on s.id = j.seat_id
          where not exists (
            select 1 from conversation c2
            where c2.contact_id = j.contact_id
              and c2.started_at > j.started_at
              and c2.started_at <= j.started_at + make_interval(mins => ${oyna})
          )
          group by s.id, s.display_name
          order by jami desc
        `),
        /**
         * ── YANGI LIDGA BIRINCHI JAVOB TEZLIGI ──────────────────────────
         * "Yangi lid" — shu davrda BIRINCHI marta ko'ringan kontakt.
         * Uning eng birinchi suhbatidagi javob tezligi olinadi, chunki
         * savol aynan shu: yangi odam yozganda qancha kutdi.
         */
        tx.execute(sql`
          with yangi as (
            select
              ct.id as contact_id,
              (select c.id from conversation c
                where c.contact_id = ct.id order by c.started_at limit 1) as birinchi
            from contact ct
            where ct.first_seen_at >= ${f}::timestamptz
              and ct.first_seen_at <  ${t}::timestamptz
          )
          select
            s.id as seat_id,
            coalesce(s.display_name, 'biriktirilmagan')                     as display_name,
            count(*)::int                                                   as lidlar,
            count(${BIRINCHI})::int                                         as javob_berilgan,
            percentile_cont(0.5) within group (order by ${BIRINCHI})::float as median,
            count(*) filter (where ${BIRINCHI} < 3600)::int                 as h1,
            count(*) filter (where ${BIRINCHI} >= 3600 and ${BIRINCHI} < 14400)::int  as h4,
            count(*) filter (where ${BIRINCHI} >= 14400 and ${BIRINCHI} < 86400)::int as h24,
            count(*) filter (where ${BIRINCHI} >= 86400)::int               as h24p
          from yangi y
          join conversation c on c.id = y.birinchi
          left join analysis a on a.conversation_id = c.id
          left join seat s on s.id = c.seat_id
          group by s.id, s.display_name
          order by lidlar desc
        `),
      ]),
    );

    const d = rows(duration)[0]!;
    const rp = rows(replies)[0]!;
    const sp = rows(speed)[0]!;
    const soatlar = rows(byHour);

    // "Eng yaxshi javob soati" — javob berilgan ulushi eng yuqori soat.
    // Kamida 3 ta suhbat talab qilinadi: bitta suhbatli soat tasodifan
    // 100% chiqib, butun ko'rsatkichni ma'nosiz qilardi.
    const nomzodlar = soatlar
      .filter((r) => Number(r.answered) + Number(r.unanswered) >= 3)
      .map((r) => ({
        hour: Number(r.hour),
        pct: Number(r.answered) / (Number(r.answered) + Number(r.unanswered)),
      }))
      .sort((a, b) => b.pct - a.pct);

    return {
      period: { from, to },
      timezone: zone,
      /** Interfeys "ish vaqti" ta'rifini o'zi to'qimasligi uchun. */
      workHours: biznesJadval,
      /**
       * Nechta menejer o'z jadvali bo'yicha hisoblandi.
       *
       * Interfeysga kerak: "ish vaqtida" ustuni hamma uchun bir xil
       * oynani bildirmasligi mumkin, va buni aytmasak raqam
       * chalg'ituvchi bo'lardi.
       */
      customScheduleSeats: orinJadvallar.length,
      totals: {
        conversations: soatlar.reduce((n, r) => n + Number(r.count), 0),
        analyzed: rp.analyzed,
        scored: rp.scored,
        unanswered: rp.unanswered,
      },
      bestHour: nomzodlar[0]
        ? { hour: nomzodlar[0].hour, pct: Math.round(nomzodlar[0].pct * 1000) / 10 }
        : null,
      byHour: soatlar.map((r) => ({
        hour: r.hour,
        count: r.count,
        avgScore: r.avg_score ?? null,
        answered: r.answered,
        unanswered: r.unanswered,
      })),
      daily: rows(daily).map((r) => ({
        day: r.kun,
        total: r.jami,
        unanswered: r.unanswered,
        avgScore: r.avg_score ?? null,
      })),
      bySeat: rows(bySeat).map((r) => ({
        seatId: r.seat_id,
        displayName: r.display_name,
        total: r.total,
        engaged: r.engaged,
        notEngaged: r.not_engaged,
        analyzed: r.analyzed,
        scored: r.scored,
        operational: r.operational,
        unanswered: r.unanswered,
        engagedPct:
          Number(r.total) > 0
            ? Math.round((Number(r.engaged) / Number(r.total)) * 1000) / 10
            : null,
        // "AI ulangan" — bu sotuvchining suhbatlari haqiqatan tahlil
        // qilinyaptimi. Nol bo'lsa, integratsiya yoki biriktirish uzilgan.
        aiLinked: Number(r.analyzed) > 0,
        medianFirstResponseSeconds: r.median_first_response ?? null,
      })),
      callbackMinutes: oyna,
      noCallback: rows(qaytaAloqasiz).map((r) => ({
        seatId: r.seat_id,
        displayName: r.display_name ?? 'biriktirilmagan',
        total: r.jami,
        inHours: r.ish_vaqtida,
        outHours: r.tashqarida,
      })),
      newLeads: rows(yangiLid).map((r) => ({
        seatId: r.seat_id,
        displayName: r.display_name,
        leads: r.lidlar,
        responded: r.javob_berilgan,
        medianSeconds: r.median ?? null,
        under1h: r.h1,
        under4h: r.h4,
        under24h: r.h24,
        over24h: r.h24p,
      })),
      responseSpeed: {
        under15m: sp.t15,
        under1h: sp.t60,
        under4h: sp.t4h,
        over4h: sp.t4hp,
        unknown: sp.noma_lum,
      },
      unansweredBySeat: rows(ishVaqti).map((r) => ({
        seatId: r.seat_id,
        displayName: r.display_name,
        inHours: r.ish_vaqtida,
        outHours: r.tashqarida,
      })),
      byWeekday: rows(byWeekday).map((r) => ({
        weekday: r.weekday,
        count: r.count,
        avgScore: r.avg_score ?? null,
      })),
      duration: {
        known: d.known,
        avgSeconds: Number(d.known) > 0 ? d.avg : null,
        medianSeconds: Number(d.known) > 0 ? d.median : null,
        maxSeconds: Number(d.known) > 0 ? d.max : null,
      },
      medianFirstResponseSeconds: rp.median_first_response ?? null,
      unansweredSessions: rp.unanswered,
    };
  });

  /**
   * MIJOZ TAHLILI — yangi va qaytgan mijozlar.
   *
   * "Qaytgan" = shu davrda suhbati bo'lgan, lekin BIRINCHI marta ko'rinishi
   * davrdan oldin bo'lgan kontakt. Bu takroriy murojaat ulushini beradi.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * MIJOZ TAHLILI — bitimlar, e'tirozlar va anketa
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ── Nima uchun ba'zi bloklar "toza kategoriya" emas ─────────────────────
   * `signals.urgency` — enum (low/medium/high), shuning uchun doiraviy
   * diagramma to'g'ri chiqadi. `signals.budgetReaction` esa ERKIN MATN:
   * model "Qimmatroq ekan", "Juda qimmat-ku, boshqa joyda 600 mingga bor"
   * kabi gaplarni yozadi. Ularni 4-5 ta chiroyli kategoriyaga bo'lish uchun
   * kalit-so'z qoidalari kerak bo'lardi — bu esa o'ylab topilgan
   * klassifikatsiya, ya'ni rahbar ko'radigan raqam modelning haqiqiy
   * javobiga mos kelmay qolardi. Shuning uchun eng ko'p uchragan
   * javoblar RO'YXAT sifatida ko'rsatiladi, diagramma sifatida emas.
   */
  app.get('/api/v1/businesses/:businessId/analytics/customer', guard, async (req) => {
    const { from, to } = period(periodQuery.parse(req.query));
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();

    /** Anketa javoblarini yoyuvchi umumiy ifoda. */
    const javoblar = sql`
      cross join lateral jsonb_array_elements(
        case when jsonb_typeof(a.questionnaire_answers) = 'array'
             then a.questionnaire_answers else '[]'::jsonb end
      ) as ans
    `;

    const [deals, dealDaily, budget, serviceMix, qAgg, qBySeat, pbRow] = await withTenant(
      businessId,
      (tx) =>
        Promise.all([
          tx.execute(sql`
            select
              count(*) filter (where (a.deal #>> '{amount}') is not null)::int as known,
              sum((a.deal #>> '{amount}')::numeric)::float                     as total,
              round(avg((a.deal #>> '{amount}')::numeric), 0)::float           as avg,
              min(nullif(a.deal #>> '{currency}', ''))                         as currency,
              count(*)::int                                                    as analyzed
            from conversation c join analysis a on a.conversation_id = c.id
            where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          `),
          tx.execute(sql`
            select
              date_trunc('day', c.started_at)                                  as kun,
              count(*) filter (where (a.deal #>> '{amount}') is not null)::int  as count,
              coalesce(sum((a.deal #>> '{amount}')::numeric), 0)::float         as summa
            from conversation c join analysis a on a.conversation_id = c.id
            where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
            group by 1 order by 1
          `),
          tx.execute(sql`
            select trim(a.signals ->> 'budgetReaction') as key, count(*)::int as count
            from conversation c join analysis a on a.conversation_id = c.id
            where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
              and nullif(trim(coalesce(a.signals ->> 'budgetReaction', '')), '') is not null
            group by 1 order by count desc limit 10
          `),
          /** Xizmat yo'nalishi × biznesga tegishlilik — natija kesimi. */
          tx.execute(sql`
            select
              coalesce(a.service_line, 'aniqlanmadi')  as line,
              a.business_relevance                     as relevance,
              count(*)::int                            as count
            from conversation c join analysis a on a.conversation_id = c.id
            where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
            group by 1, 2
          `),
          /**
           * Anketa javoblari.
           *
           * Savol MATNI bo'yicha guruhlanadi, `questionId` bo'yicha emas:
           * javoblarda faqat savol matni saqlanadi (baholangan paytdagi
           * nusxasi), shu tufayli playbook keyin o'zgarsa ham eski javob
           * o'z savoliga bog'liq qoladi.
           */
          tx.execute(sql`
            select
              trim(ans ->> 'question')  as savol,
              trim(ans ->> 'answer')    as javob,
              count(*)::int             as count
            from conversation c
            join analysis a on a.conversation_id = c.id
            ${javoblar}
            where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
              and nullif(trim(coalesce(ans ->> 'answer', '')), '') is not null
              and nullif(trim(coalesce(ans ->> 'question', '')), '') is not null
            group by 1, 2
          `),
          tx.execute(sql`
            select
              s.display_name           as menejer,
              trim(ans ->> 'question') as savol,
              count(*)::int            as count
            from conversation c
            join analysis a on a.conversation_id = c.id
            join seat s on s.id = c.seat_id
            ${javoblar}
            where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
              and nullif(trim(coalesce(ans ->> 'answer', '')), '') is not null
              and nullif(trim(coalesce(ans ->> 'question', '')), '') is not null
            group by 1, 2
          `),
          tx
            .select({ questionnaire: playbook.questionnaire })
            .from(playbook)
            .where(eq(playbook.isActive, true))
            .orderBy(desc(playbook.version))
            .limit(1),
        ]),
    );

    const d = rows(deals)[0]!;
    const dealKnown = Number(d.known ?? 0);

    // Faol playbookdagi javob turlari — javobni qanday ko'rsatishni
    // shu belgilaydi. Savol playbookda topilmasa (eski avloddan qolgan
    // bo'lsa) `text` deb qaraladi: bu eng xavfsiz taxmin, chunki matnni
    // har doim ro'yxat qilib ko'rsatish mumkin.
    const turlar = new Map<string, string>();
    const qs = (pbRow[0]?.questionnaire as { questions?: unknown[] } | undefined)?.questions;
    if (Array.isArray(qs)) {
      for (const item of qs) {
        const q = item as { question?: unknown; answerType?: unknown };
        if (typeof q.question === 'string' && typeof q.answerType === 'string') {
          turlar.set(q.question.trim(), q.answerType);
        }
      }
    }

    /** "ha"/"yo'q" ni turli yozilishlardan tanib oladi. */
    const HA = /^(ha|ha,|yes|true|bor|roziq?|rozi)\b/i;
    const YOQ = /^(yo'q|yoq|yo‘q|no|false|nomalum|noma'lum)\b/i;

    interface Savol {
      question: string;
      answerType: string;
      total: number;
      answers: { value: string; count: number }[];
      yes: number;
      no: number;
      /** Raqamli savollarda: javobdan ajratib olingan sonlar taqsimoti. */
      numbers: { value: number; count: number }[];
      numericAvg: number | null;
    }

    const savolMap = new Map<string, Savol>();
    for (const r of rows(qAgg)) {
      const savol = String(r.savol);
      const javob = String(r.javob);
      const n = Number(r.count);
      if (!savolMap.has(savol)) {
        savolMap.set(savol, {
          question: savol,
          answerType: turlar.get(savol) ?? 'text',
          total: 0,
          answers: [],
          yes: 0,
          no: 0,
          numbers: [],
          numericAvg: null,
        });
      }
      const s = savolMap.get(savol)!;
      s.total += n;
      s.answers.push({ value: javob, count: n });
      if (HA.test(javob)) s.yes += n;
      else if (YOQ.test(javob)) s.no += n;

      // "13 yoshda" → 13. Model raqamni gap ichida qaytarishi odatiy hol,
      // shuning uchun birinchi son ajratib olinadi.
      const son = javob.match(/-?\d+([.,]\d+)?/);
      if (son) s.numbers.push({ value: Number(son[0].replace(',', '.')), count: n });
    }

    const savollar = [...savolMap.values()].map((s) => {
      s.answers.sort((a, b) => b.count - a.count);
      const jamiSon = s.numbers.reduce((x, y) => x + y.count, 0);
      s.numericAvg =
        jamiSon > 0
          ? Math.round((s.numbers.reduce((x, y) => x + y.value * y.count, 0) / jamiSon) * 10) / 10
          : null;
      // Taqsimot uchun bir xil qiymatlar birlashtiriladi.
      const birlashgan = new Map<number, number>();
      for (const n of s.numbers) birlashgan.set(n.value, (birlashgan.get(n.value) ?? 0) + n.count);
      s.numbers = [...birlashgan.entries()]
        .map(([value, count]) => ({ value, count }))
        .sort((a, b) => a.value - b.value);
      return { ...s, answers: s.answers.slice(0, 8) };
    });
    savollar.sort((a, b) => b.total - a.total);

    const menejerlar = [...new Set(rows(qBySeat).map((r) => String(r.menejer)))].sort();

    return {
      period: { from, to },
      deals: {
        known: dealKnown,
        analyzed: d.analyzed,
        total: dealKnown > 0 ? d.total : null,
        avg: dealKnown > 0 ? d.avg : null,
        currency: d.currency ?? null,
      },
      dealDaily: rows(dealDaily).map((r) => ({
        day: r.kun,
        count: r.count,
        sum: r.summa,
      })),
      budgetReaction: rows(budget).map((r) => ({ key: r.key, count: r.count })),
      serviceMix: rows(serviceMix).map((r) => ({
        line: r.line,
        relevance: r.relevance,
        count: r.count,
      })),
      questionnaire: {
        questions: savollar,
        matrix: {
          seats: menejerlar,
          questions: [...new Set(rows(qBySeat).map((r) => String(r.savol)))],
          cells: rows(qBySeat).map((r) => ({
            seat: r.menejer,
            question: r.savol,
            count: r.count,
          })),
        },
      },
    };
  });

  app.get('/api/v1/businesses/:businessId/analytics/clients', guard, async (req) => {
    const { from, to } = period(periodQuery.parse(req.query));
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();

    const [split, top, linked] = await withTenant(businessId, (tx) =>
      Promise.all([
        tx.execute(sql`
          select
            count(*) filter (where ct.first_seen_at >= ${f}::timestamptz)::int as new_clients,
            count(*) filter (where ct.first_seen_at <  ${f}::timestamptz)::int as returning_clients
          from contact ct
          where exists (
            select 1 from conversation c
            where c.contact_id = ct.id
              and c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          )
        `),
        tx.execute(sql`
          select
            ct.id, ct.name, ct.company, ct.is_decision_maker,
            count(c.id)::int                          as conversations,
            round(avg(a.overall_score), 1)::float     as avg_score,
            max(c.started_at)                         as last_at
          from contact ct
          join conversation c on c.contact_id = ct.id
            and c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          left join analysis a on a.conversation_id = c.id
          group by ct.id, ct.name, ct.company, ct.is_decision_maker
          order by conversations desc, last_at desc
          limit 10
        `),
        /**
         * Kontaktga bog'lanmagan suhbatlar ulushi. Yashirish mumkin
         * emas: bu raqam katta bo'lsa, yuqoridagi mijoz kesimlari
         * hodisalarning faqat kichik qismini qamrab olgan bo'ladi.
         */
        tx.execute(sql`
          select
            count(*) filter (where c.contact_id is not null)::int as linked,
            count(*)::int                                          as total
          from conversation c
          where c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
        `),
      ]),
    );

    const s = rows(split)[0]!;
    const l = rows(linked)[0]!;

    return {
      period: { from, to },
      newClients: s.new_clients,
      returningClients: s.returning_clients,
      linkedConversations: l.linked,
      totalConversations: l.total,
      top: rows(top).map((r) => ({
        id: r.id,
        name: r.name,
        company: r.company,
        isDecisionMaker: r.is_decision_maker,
        conversations: r.conversations,
        avgScore: r.avg_score ?? null,
        lastAt: r.last_at,
      })),
    };
  });

  /**
   * JAMOA MALAKASI — har sotuvchi × har kategoriya matritsasi.
   *
   * Reyting (`dashboard/leaderboard`) kimning yaxshi ekanini aytadi,
   * bu esa NIMANI o'rgatish kerakligini: bitta sotuvchining bitta zaif
   * kategoriyasi — aynan shu odam bilan o'tkaziladigan mashq mavzusi.
   */
  app.get('/api/v1/businesses/:businessId/analytics/team', guard, async (req) => {
    const { from, to } = period(periodQuery.parse(req.query));
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();

    const [matrix, seats] = await withTenant(businessId, (tx) =>
      Promise.all([
        tx.execute(sql`
          select
            cs.seat_id,
            coalesce(cs.category_code, '—')                              as category_code,
            count(cs.score)::int                                         as scored,
            count(*) filter (where cs.score is null)::int                as unknown_count,
            round(avg(cs.score) / nullif(max(cs.max_score), 0) * 100, 1)::float as avg_pct
          from criterion_score cs
          where cs.created_at >= ${f}::timestamptz and cs.created_at < ${t}::timestamptz
            and cs.seat_id is not null
          group by 1, 2
        `),
        tx.execute(sql`
          select
            s.id as seat_id, s.display_name,
            count(c.id)::int                       as conversations,
            round(avg(a.overall_score), 1)::float  as avg_score,
            count(*) filter (where a.is_flagged)::int as flagged
          from seat s
          left join conversation c on c.seat_id = s.id
            and c.started_at >= ${f}::timestamptz and c.started_at < ${t}::timestamptz
          left join analysis a on a.conversation_id = c.id
          where s.is_active
          group by s.id, s.display_name
          order by avg_score desc nulls last, conversations desc
        `),
      ]),
    );

    const cells = rows(matrix).map((r) => ({
      seatId: r.seat_id,
      categoryCode: r.category_code,
      scored: r.scored,
      unknownCount: r.unknown_count,
      avgPct: r.avg_pct,
    }));

    return {
      period: { from, to },
      categories: [...new Set(cells.map((c) => c.categoryCode as string))].sort(),
      seats: rows(seats).map((r) => ({
        seatId: r.seat_id,
        displayName: r.display_name,
        conversations: r.conversations,
        avgScore: r.avg_score ?? null,
        flagged: r.flagged,
      })),
      cells,
    };
  });
}
