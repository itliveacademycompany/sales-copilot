import { sql, type SQL } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import { requireBusiness } from '../auth-plugin.js';
import { conversationScope, seatFilter } from '../scope.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SUHBATLAR RO'YXATI — BOSH SAHIFA VA QO'NG'IROQLAR UCHUN SERVER TOMONI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MUAMMO: Bosh sahifa "Oy" davrida 60 kunlik BARCHA suhbatlarni (~2400 qator,
 * ~3 MB — har qatorda xulosa matni) 2000 talik sahifalar bilan KETMA-KET
 * yuklab, hisob-kitobni brauzerda qilardi. Qo'ng'iroqlar sahifasi esa 30
 * kunlik hammasini olib, filtr/qidiruv/saralashni brauzerda qilardi. Server
 * band paytida bu so'rovlar eng sekini bo'lib, sahifa skeletda qolardi.
 *
 * YECHIM:
 *   1. `GET …/conversations/compact` — Bosh sahifa hisob-kitobiga kerakli
 *      maydonlar xolos, ixcham (lug'at + kortej) shaklda, BITTA so'rovda.
 *      Uzun matn (xulosa, eng zaif joy) faqat oxirgi 100 ta tahlil uchun
 *      ("So'nggi tahlillar" va tepa qidiruv shuni ishlatadi). Hajm ~10× kam.
 *   2. `GET …/calls` — Qo'ng'iroqlar: filtr, qidiruv, saralash va sahifalash
 *      SQL'da. Brauzerga faqat ko'rinadigan sahifa va filtr sonlari keladi.
 *
 * Ko'rish doirasi `GET /conversations` bilan bir xil (conversationScope):
 * rahbar — hammasi, sotuvchi — faqat o'zining suhbatlari.
 */

/** Bir so'rovda ko'pi bilan shuncha qator (Bosh sahifa). Oshsa `kesildi: true`. */
const COMPACT_MAX = 20_000;
/** Matni bilan qaytariladigan oxirgi tahlillar soni. */
const MATNLI = 100;

function qatorlar<T>(r: unknown): T[] {
  return ((r as { rows?: unknown[] }).rows ?? (r as unknown[])) as T[];
}

/** Takrorlanadigan satrlarni lug'atga yig'adi: kortejda faqat indeks qoladi. */
class Lugat {
  readonly qiymatlar: string[] = [];
  private readonly ix = new Map<string, number>();
  id(v: string | null | undefined): number {
    if (v === null || v === undefined) return -1;
    let i = this.ix.get(v);
    if (i === undefined) {
      i = this.qiymatlar.length;
      this.qiymatlar.push(v);
      this.ix.set(v, i);
    }
    return i;
  }
}

const compactQuery = z.object({
  since: z.coerce.date(),
  to: z.coerce.date().optional(),
  channel: z.enum(['phone', 'telegram']).optional(),
});

// ─── Qo'ng'iroqlar filtri ───────────────────────────────────────────────────

const royxat = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 50) : []));

const callsQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  holat: royxat,
  oila: royxat,
  xizmat: royxat,
  menejer: royxat,
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['vaqt', 'ball', 'davom']).default('vaqt'),
  dir: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(5000).default(25),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
});

/** Frontend bilan bir xil kalitlar (Qongiroqlar.tsx). */
const MAXSUS_BIZNES = 'maxsus:biznesga-oid-emas';
const MAXSUS_YAQIN = 'maxsus:yopilishga-yaqin';
const BIRIKTIRILMAGAN = 'biriktirilmagan';

/** `lidTuri` (frontend api.ts) bilan bir xil qoida: "hot…/issiq…/qaynoq…". */
const ISSIQ = sql`(lower(btrim(coalesce(a.lead_quality, ''))) ~ '^(hot|issiq|qaynoq)')`;
const BIZNESGA_OID_EMAS = sql`(a.business_relevance is not null and a.business_relevance <> 'sales')`;

const HOLAT_SHARTI: Record<string, SQL> = {
  done: sql`c.status = 'done'`,
  jarayonda: sql`c.status in ('queued', 'transcribing', 'analyzing')`,
  received: sql`c.status = 'received'`,
  failed: sql`c.status = 'failed'`,
  filtered: sql`c.status = 'filtered'`,
  korik: sql`coalesce(a.is_flagged, false)`,
};

const yoki = (shartlar: SQL[]): SQL => (shartlar.length ? sql`(${sql.join(shartlar, sql` or `)})` : sql`true`);

export function registerSuhbatRoyxatiRoutes(app: FastifyInstance): void {
  // ─── 1. Bosh sahifa: ixcham ro'yxat ──────────────────────────────────────
  app.get(
    '/api/v1/businesses/:businessId/conversations/compact',
    { preHandler: [requireBusiness] },
    async (req) => {
      const q = compactQuery.parse(req.query);
      const businessId = req.business!.businessId;
      const onlySeat = seatFilter(conversationScope(req));
      const to = q.to ?? new Date();

      const { asosiy, matnlar } = await withTenant(businessId, async (tx) => {
        // Sana ISO satr + ::timestamptz: drizzle postgres-js'da sana serializeri
        // o'chirilgan — Date obyekti xom SQL'da 500 xato beradi (analytics.ts ham shunday).
        const shart = sql`c.started_at >= ${q.since.toISOString()}::timestamptz and c.started_at < ${to.toISOString()}::timestamptz
          ${onlySeat ? sql`and c.seat_id = ${onlySeat}` : sql``}
          ${q.channel ? sql`and c.channel = ${q.channel}` : sql``}`;
        const asosiy = qatorlar<{
          id: string;
          s: string;
          e: string | null;
          seat_id: string | null;
          status: string;
          lead_quality: string | null;
          overall_score: string | null;
          duration_seconds: number | null;
          call_family: string | null;
          service_line: string | null;
          business_relevance: string | null;
          direction: string;
          channel: string;
          is_flagged: boolean | null;
        }>(
          await tx.execute(sql`
            select c.id,
                   extract(epoch from c.started_at)::bigint as s,
                   extract(epoch from c.ended_at)::bigint as e,
                   c.seat_id, c.status, a.lead_quality, a.overall_score, c.duration_seconds,
                   a.call_family, a.service_line, a.business_relevance, c.direction, c.channel, a.is_flagged
            from conversation c
            left join analysis a on a.conversation_id = c.id
            where ${shart}
            order by c.started_at desc, c.id desc
            limit ${COMPACT_MAX + 1}
          `),
        );
        // Matn faqat oxirgi tahlillar uchun — "So'nggi tahlillar" va tepa qidiruv
        const matnlar = qatorlar<{ id: string; summary: string | null; primary_gap: string | null }>(
          await tx.execute(sql`
            select c.id, a.summary, a.primary_gap
            from conversation c
            join analysis a on a.conversation_id = c.id
            where ${shart} and c.status = 'done'
            order by c.started_at desc, c.id desc
            limit ${MATNLI}
          `),
        );
        return { asosiy, matnlar };
      });

      const kesildi = asosiy.length > COMPACT_MAX;
      const qator = kesildi ? asosiy.slice(0, COMPACT_MAX) : asosiy;
      const L = {
        seat: new Lugat(),
        status: new Lugat(),
        lead: new Lugat(),
        oila: new Lugat(),
        xizmat: new Lugat(),
        soha: new Lugat(),
        yonalish: new Lugat(),
        kanal: new Lugat(),
      };
      /**
       * Kortej tartibi (frontend `components/bosh/malumot.ts` → `ixchamniOch`):
       * [id, boshlanish(s), tugash(s)|null, seat, holat, lid, ball|null,
       *  davomiylik|null, oila, xizmat, soha, yo'nalish, kanal, bayroq(0/1)]
       * Lug'at maydonlarida -1 = null.
       */
      const rows = qator.map((r) => [
        r.id,
        Number(r.s),
        r.e === null ? null : Number(r.e),
        L.seat.id(r.seat_id),
        L.status.id(r.status),
        L.lead.id(r.lead_quality),
        r.overall_score === null ? null : Number(r.overall_score),
        r.duration_seconds,
        L.oila.id(r.call_family),
        L.xizmat.id(r.service_line),
        L.soha.id(r.business_relevance),
        L.yonalish.id(r.direction),
        L.kanal.id(r.channel),
        r.is_flagged ? 1 : 0,
      ]);

      return {
        v: 1,
        kesildi,
        lugat: Object.fromEntries(Object.entries(L).map(([k, l]) => [k, l.qiymatlar])),
        rows,
        matnlar: Object.fromEntries(matnlar.map((m) => [m.id, [m.summary, m.primary_gap]])),
      };
    },
  );

  // ─── 2. Qo'ng'iroqlar: server tomonda filtr va sahifalash ────────────────
  app.get(
    '/api/v1/businesses/:businessId/calls',
    { preHandler: [requireBusiness] },
    async (req) => {
      const q = callsQuery.parse(req.query);
      const businessId = req.business!.businessId;
      const onlySeat = seatFilter(conversationScope(req));

      // Davr + ko'rish doirasi — filtr sonlari shu asosda (boshqa filtrlarsiz),
      // xuddi avvalgi brauzer hisobidagidek.
      // Sana ISO satr + ::timestamptz (Date obyekti xom SQL'da ishlamaydi — yuqoriga qarang)
      const asos = sql`c.channel = 'phone' and c.started_at >= ${q.from.toISOString()}::timestamptz and c.started_at < ${q.to.toISOString()}::timestamptz
        ${onlySeat ? sql`and c.seat_id = ${onlySeat}` : sql``}`;

      const holat = yoki(q.holat.filter((h) => HOLAT_SHARTI[h]).map((h) => HOLAT_SHARTI[h]!));
      const oila = yoki(
        q.oila.map((o) =>
          o === MAXSUS_YAQIN ? ISSIQ : o === MAXSUS_BIZNES ? BIZNESGA_OID_EMAS : sql`a.call_family = ${o}`,
        ),
      );
      const xizmat = q.xizmat.length
        ? sql`lower(a.service_line) in (${sql.join(q.xizmat.map((x) => sql`${x.toLowerCase()}`), sql`, `)})`
        : sql`true`;
      const menejerlar = q.menejer.filter((m) => m !== BIRIKTIRILMAGAN && /^[0-9a-f-]{36}$/i.test(m));
      const menejer = q.menejer.length
        ? yoki([
            ...(menejerlar.length ? [sql`c.seat_id in (${sql.join(menejerlar.map((m) => sql`${m}::uuid`), sql`, `)})`] : []),
            ...(q.menejer.includes(BIRIKTIRILMAGAN) ? [sql`c.seat_id is null`] : []),
          ])
        : sql`true`;
      const qidiruv = q.q
        ? (() => {
            const naqsh = `%${q.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
            return sql`(a.summary ilike ${naqsh} or a.primary_gap ilike ${naqsh} or s.display_name ilike ${naqsh}
              or c.phone_from ilike ${naqsh} or c.phone_to ilike ${naqsh} or ct.name ilike ${naqsh}
              or a.call_family ilike ${naqsh} or a.service_line ilike ${naqsh})`;
          })()
        : sql`true`;

      const DAVOM = sql`coalesce(c.duration_seconds, extract(epoch from (c.ended_at - c.started_at))::int, -1)`;
      const tartibUstun =
        q.sort === 'ball' ? sql`coalesce(a.overall_score, -1)` : q.sort === 'davom' ? DAVOM : sql`c.started_at`;
      const yon = q.dir === 'asc' ? sql`asc` : sql`desc`;

      const JOIN = sql`from conversation c
        left join analysis a on a.conversation_id = c.id
        left join contact ct on ct.id = c.contact_id
        left join seat s on s.id = c.seat_id`;

      return withTenant(businessId, async (tx) => {
        const filtr = sql`${asos} and ${holat} and ${oila} and ${xizmat} and ${menejer} and ${qidiruv}`;
        const [sahifa, jami, sonlar] = await Promise.all([
          tx.execute(sql`
            select c.id, c.channel, c.direction, c.seat_id, c.started_at, c.ended_at, c.status, c.excluded_reason,
                   c.language, a.overall_score, a.lead_quality, a.primary_gap, a.summary, a.is_flagged, a.scoring_mode,
                   a.call_family, a.service_line, a.business_relevance, c.phone_from, c.phone_to, c.duration_seconds,
                   nullif(btrim(ct.name), '') as contact_name
            ${JOIN}
            where ${filtr}
            order by ${tartibUstun} ${yon}, c.started_at desc, c.id desc
            limit ${q.limit} offset ${q.offset}
          `),
          tx.execute(sql`select count(*)::int as n ${JOIN} where ${filtr}`),
          // Filtr variantlari sonlari — davr bo'yicha, boshqa filtrlarsiz
          tx.execute(sql`
            select
              count(*)::int as jami,
              count(*) filter (where c.status = 'done')::int as h_done,
              count(*) filter (where c.status in ('queued','transcribing','analyzing'))::int as h_jarayonda,
              count(*) filter (where c.status = 'received')::int as h_received,
              count(*) filter (where c.status = 'failed')::int as h_failed,
              count(*) filter (where c.status = 'filtered')::int as h_filtered,
              count(*) filter (where coalesce(a.is_flagged, false))::int as h_korik,
              count(*) filter (where ${ISSIQ})::int as m_yaqin,
              count(*) filter (where ${BIZNESGA_OID_EMAS})::int as m_biznes,
              count(*) filter (where c.seat_id is null)::int as biriktirilmagan,
              coalesce((select jsonb_object_agg(k, n) from (
                select a2.call_family as k, count(*)::int as n
                from conversation c join analysis a2 on a2.conversation_id = c.id
                where ${asos} and a2.call_family is not null group by 1) t), '{}'::jsonb) as oilalar,
              coalesce((select jsonb_object_agg(k, n) from (
                select a2.service_line as k, count(*)::int as n
                from conversation c join analysis a2 on a2.conversation_id = c.id
                where ${asos} and a2.service_line is not null group by 1) t), '{}'::jsonb) as xizmatlar,
              coalesce((select jsonb_object_agg(k, n) from (
                select c.seat_id::text as k, count(*)::int as n
                from conversation c
                where ${asos} and c.seat_id is not null group by 1) t), '{}'::jsonb) as menejerlar
            from conversation c left join analysis a on a.conversation_id = c.id
            where ${asos}
          `),
        ]);

        const s = qatorlar<Record<string, unknown>>(sonlar)[0] ?? {};
        const n = (k: string) => Number(s[k] ?? 0);
        return {
          jami: Number(qatorlar<{ n: number }>(jami)[0]?.n ?? 0),
          davrdaJami: n('jami'),
          sonlar: {
            holat: {
              done: n('h_done'),
              jarayonda: n('h_jarayonda'),
              received: n('h_received'),
              failed: n('h_failed'),
              filtered: n('h_filtered'),
              korik: n('h_korik'),
            },
            maxsus: { [MAXSUS_YAQIN]: n('m_yaqin'), [MAXSUS_BIZNES]: n('m_biznes') },
            oila: (s.oilalar ?? {}) as Record<string, number>,
            xizmat: (s.xizmatlar ?? {}) as Record<string, number>,
            menejer: { ...((s.menejerlar ?? {}) as Record<string, number>), [BIRIKTIRILMAGAN]: n('biriktirilmagan') },
          },
          rows: qatorlar<Record<string, unknown>>(sahifa).map((r) => ({
            id: r.id,
            channel: r.channel,
            direction: r.direction,
            seatId: r.seat_id,
            startedAt: new Date(r.started_at as string).toISOString(),
            endedAt: r.ended_at ? new Date(r.ended_at as string).toISOString() : null,
            status: r.status,
            excludedReason: r.excluded_reason,
            language: r.language,
            overallScore: r.overall_score === null ? null : String(r.overall_score),
            leadQuality: r.lead_quality,
            primaryGap: r.primary_gap,
            summary: r.summary,
            isFlagged: r.is_flagged,
            scoringMode: r.scoring_mode,
            callFamily: r.call_family,
            serviceLine: r.service_line,
            businessRelevance: r.business_relevance,
            phoneFrom: r.phone_from,
            phoneTo: r.phone_to,
            durationSeconds: r.duration_seconds,
            contactName: r.contact_name,
            externalThreadId: null,
            segmentCount: 0,
          })),
        };
      });
    },
  );
}
