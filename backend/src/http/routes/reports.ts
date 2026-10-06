import { and, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import { dailySummary, integration } from '../../db/schema/index.js';
import { sendDailyReportNow } from '../../reports/daily.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * KUNLIK HISOBOT — TZ 3.8, FR-134.
 *
 * Sozlamalar (qabul qiluvchi chat va soat) `integration.config` ichida
 * saqlanadi: hisobot Telegram botiga bog'liq va usiz ma'nosi yo'q,
 * shuning uchun alohida jadval ham, migratsiya ham kerak emas.
 */

const settingsBody = z.object({
  /** Guruh yoki shaxsiy chat id. Guruhlarda manfiy bo'ladi. */
  reportChatId: z
    .string()
    .trim()
    .regex(/^-?\d{3,}$/, 'Chat ID faqat raqamlardan iborat bo\'lishi kerak')
    .nullable(),
  reportHour: z.number().int().min(0).max(23).optional(),
});

export function registerReportRoutes(app: FastifyInstance): void {
  /** Oxirgi hisobotlar — interfeysda ko'rish uchun. */
  app.get(
    '/api/v1/businesses/:businessId/reports/daily',
    { preHandler: [requireBusiness, requirePermission('analytics:read:all')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const rows = await withTenant(businessId, (tx) =>
        tx
          .select({
            id: dailySummary.id,
            summaryDate: dailySummary.summaryDate,
            content: dailySummary.content,
            stats: dailySummary.stats,
            triggeredBy: dailySummary.triggeredBy,
            createdAt: dailySummary.createdAt,
          })
          .from(dailySummary)
          .orderBy(desc(dailySummary.createdAt))
          .limit(14),
      );
      return { reports: rows };
    },
  );

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * KUNLIK HISOBOT — kalendar va bir kunning to'liq kesimi
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ── Nega raqamlar saqlangan hisobotdan olinmaydi ────────────────────────
   * `daily_summary` faqat hisobot YUBORILGAN kunlarda yoziladi (cron yoki
   * qo'lda). Bot ulanmagan yoki o'sha kuni cron ishlamagan bo'lsa, yozuv
   * yo'q — lekin suhbatlar bor va rahbar ularni ko'rishi kerak.
   *
   * Shuning uchun raqamlar HAR DOIM jonli hisoblanadi, saqlangan yozuvdan
   * esa faqat AI matni olinadi (bo'lsa). Natijada har qanday o'tgan kunni
   * ochish mumkin, "bu kun uchun hisobot yaratilmagan" degan tupik yo'q.
   */
  app.get(
    '/api/v1/businesses/:businessId/reports/daily/calendar',
    { preHandler: [requireBusiness, requirePermission('analytics:read:all')] },
    async (req) => {
      const q = z
        .object({ from: z.string(), to: z.string() })
        .parse(req.query);
      const businessId = req.business!.businessId;

      const rows = await withTenant(businessId, (tx) =>
        tx.execute(sql`
          with kunlar as (
            select generate_series(${q.from}::date, ${q.to}::date, interval '1 day')::date as kun
          )
          select
            to_char(k.kun, 'YYYY-MM-DD')                                as sana,
            coalesce(s.suhbatlar, 0)::int                               as suhbatlar,
            coalesce(s.baholangan, 0)::int                              as baholangan,
            s.ball                                                      as ball,
            (select count(*) from daily_summary d
              where d.summary_date = to_char(k.kun, 'YYYY-MM-DD')
                and d.seat_id is null)::int                             as hisobot
          from kunlar k
          left join lateral (
            select
              count(*)::int                                             as suhbatlar,
              count(a.id) filter (where a.scoring_mode = 'scored')::int  as baholangan,
              round(avg(a.overall_score), 1)::float                      as ball
            from conversation c
            left join analysis a on a.conversation_id = c.id
            where (c.started_at at time zone (select timezone from business limit 1))::date = k.kun
          ) s on true
          order by k.kun
        `),
      );

      return {
        days: (rows as unknown as Record<string, unknown>[]).map((r) => ({
          date: r.sana,
          conversations: r.suhbatlar,
          scored: r.baholangan,
          avgScore: r.ball ?? null,
          hasReport: Number(r.hisobot) > 0,
        })),
      };
    },
  );

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * BIR KUNNING TO'LIQ HISOBOTI — biznes va har menejer kesimida
   * ═══════════════════════════════════════════════════════════════════════
   *
   * ── Nega matn LLM bilan yozilmaydi ──────────────────────────────────────
   * Hisobotdagi jumlalar RAQAMLARDAN yasaladi ("589 ta vazifa muddati
   * o'tgan — ertaga shular ustida ishlash kerak"). LLM ishlatilsa uch
   * muammo chiqardi: har ochilishda pul ketardi, matn har safar boshqacha
   * bo'lardi (rahbar kecha bilan solishtira olmasdi) va model raqamni
   * noto'g'ri talqin qilishi mumkin edi.
   *
   * Shablonli jumla esa doim raqamga MOS: agar 0 ta kechikish bo'lsa,
   * "kechikish bor" degan gap umuman paydo bo'lmaydi.
   */
  app.get(
    '/api/v1/businesses/:businessId/reports/daily/day',
    { preHandler: [requireBusiness, requirePermission('analytics:read:all')] },
    async (req) => {
      const { date } = z
        .object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
        .parse(req.query);
      const businessId = req.business!.businessId;

      /** Biznes vaqt zonasidagi kun chegarasi. */
      const kun = (jadval: string) =>
        sql`(${sql.raw(jadval)}.started_at at time zone (select timezone from business limit 1))::date = ${date}::date`;

      /** Ikkala tomon ham gapirgan suhbat — "bog'langan" ekvivalenti. */
      const BOGLANGAN = sql`
        (select count(*) filter (where ts.speaker = 'manager') from transcript_segment ts
          where ts.conversation_id = c.id) > 0
        and (select count(*) filter (where ts.speaker = 'client') from transcript_segment ts
          where ts.conversation_id = c.id) > 0
      `;
      const JAVOBSIZ = sql`
        (a.dynamics #>> '{replyMetrics,unansweredTurns}')::int > 0
        and coalesce(a.dynamics #>> '{needsReply}', 'true') <> 'false'
      `;

      const [asosiy, oldingi, vazifa, anketa, zaif, saqlangan] = await withTenant(
        businessId,
        (tx) =>
          Promise.all([
            /** Menejer kesimida barcha asosiy raqamlar — umumiysi JS da yig'iladi. */
            tx.execute(sql`
              select
                c.seat_id,
                s.display_name,
                count(*)::int                                                  as suhbatlar,
                count(*) filter (where ${BOGLANGAN})::int                      as boglangan,
                count(*) filter (where not (${BOGLANGAN}))::int                as boglanmagan,
                sum(extract(epoch from (c.ended_at - c.started_at)))::int       as suhbat_vaqti,
                count(a.id)::int                                               as tahlil,
                count(a.id) filter (where a.scoring_mode = 'scored')::int      as baholangan,
                count(a.id) filter (
                  where a.business_relevance in ('support','internal','other')
                )::int                                                         as operatsion,
                round(avg(a.overall_score), 1)::float                          as ball,
                count(a.id) filter (where ${JAVOBSIZ})::int                    as javobsiz,
                count(*) filter (where a.is_flagged)::int                      as bayroqli,
                count(*) filter (where (a.deal #>> '{amount}') is not null)::int as bitimli,
                sum((a.deal #>> '{amount}')::numeric)::float                   as summa,
                percentile_cont(0.5) within group (
                  order by (a.dynamics #>> '{replyMetrics,firstResponseSeconds}')::numeric
                )::float                                                       as median_javob,
                count(distinct c.contact_id) filter (
                  where ct.first_seen_at::date = ${date}::date
                )::int                                                         as yangi_lid,
                (array_agg(a.manager_note #>> '{strengths,0}')
                   filter (where a.manager_note #>> '{strengths,0}' is not null))[1]    as kuch,
                (array_agg(a.manager_note #>> '{improvements,0}')
                   filter (where a.manager_note #>> '{improvements,0}' is not null))[1] as yaxshilash
              from conversation c
              left join analysis a on a.conversation_id = c.id
              left join seat s on s.id = c.seat_id
              left join contact ct on ct.id = c.contact_id
              where ${kun('c')}
              group by c.seat_id, s.display_name
            `),
            /** Oldingi ISH kuni — suhbat bo'lgan eng yaqin oldingi kun. */
            tx.execute(sql`
              with oldin as (
                select (c.started_at at time zone (select timezone from business limit 1))::date as k
                from conversation c
                where (c.started_at at time zone (select timezone from business limit 1))::date < ${date}::date
                group by 1 order by 1 desc limit 1
              )
              select
                (select k from oldin)                                          as sana,
                count(*)::int                                                  as suhbatlar,
                count(*) filter (where ${BOGLANGAN})::int                      as boglangan,
                sum(extract(epoch from (c.ended_at - c.started_at)))::int       as suhbat_vaqti,
                round(avg(a.overall_score), 1)::float                          as ball,
                count(a.id) filter (where a.scoring_mode = 'scored')::int      as baholangan
              from conversation c
              left join analysis a on a.conversation_id = c.id
              where (c.started_at at time zone (select timezone from business limit 1))::date
                    = (select k from oldin)
            `),
            /**
             * Vazifalar — menejer kesimida.
             * "Bugun yaratilgan" va "hozir ochiq" boshqa savollar:
             * birinchisi shu kunning mahsuli, ikkinchisi to'plangan qarz.
             */
            tx.execute(sql`
              select
                k.seat_id,
                count(*) filter (
                  where (k.created_at at time zone (select timezone from business limit 1))::date
                        = ${date}::date
                )::int                                                         as yaratildi,
                count(*) filter (
                  where (k.completed_at at time zone (select timezone from business limit 1))::date
                        = ${date}::date
                )::int                                                         as bajarildi,
                count(*) filter (
                  where k.status in ('pending','in_progress','blocked')
                )::int                                                         as ochiq,
                count(*) filter (
                  where k.status in ('pending','in_progress','blocked')
                    and k.due_at is not null
                    and (k.due_at at time zone (select timezone from business limit 1))::date
                        <= ${date}::date
                )::int                                                         as kechikkan
              from task k
              group by k.seat_id
            `),
            /** Anketa javoblari — savol bo'yicha nechta javob yig'ilgan. */
            tx.execute(sql`
              select
                trim(ans ->> 'question')  as savol,
                count(*)::int             as javoblar
              from conversation c
              join analysis a on a.conversation_id = c.id
              cross join lateral jsonb_array_elements(
                case when jsonb_typeof(a.questionnaire_answers) = 'array'
                     then a.questionnaire_answers else '[]'::jsonb end
              ) as ans
              where ${kun('c')}
                and nullif(trim(coalesce(ans ->> 'answer', '')), '') is not null
              group by 1 order by javoblar desc
            `),
            tx.execute(sql`
              select cs.criterion_code as kod, min(cs.criterion_name) as nom,
                     round(avg(cs.score), 2)::float as ball, count(*)::int as soni
              from criterion_score cs
              join conversation c on c.id = cs.conversation_id
              where ${kun('c')} and cs.score is not null
              group by cs.criterion_code
              order by avg(cs.score) asc
              limit 5
            `),
            tx.execute(sql`
              select content, created_at, triggered_by
              from daily_summary
              where summary_date = ${date} and seat_id is null
              order by created_at desc limit 1
            `),
          ]),
      );

      const R = (x: unknown) => x as unknown as Record<string, unknown>[];
      const n = (v: unknown) => Number(v ?? 0);

      const qatorlar = R(asosiy);
      const vazifaMap = new Map(R(vazifa).map((v) => [String(v.seat_id), v]));

      /** Bitta menejer (yoki butun biznes) uchun bo'limlarni yig'adi. */
      function bolimlar(
        src: Record<string, unknown>[],
        vz: { yaratildi: number; bajarildi: number; ochiq: number; kechikkan: number },
      ) {
        const yig = (k: string) => src.reduce((s, r) => s + n(r[k]), 0);
        const suhbatlar = yig('suhbatlar');
        const boglangan = yig('boglangan');
        const baholangan = yig('baholangan');
        const bitimli = yig('bitimli');
        // O'rtacha ball suhbatlar soniga VAZNLANADI: menejerlar ballarining
        // oddiy o'rtachasi 1 suhbatli odamni 20 suhbatli bilan tenglashtirardi.
        const ballBor = src.filter((r) => r.ball !== null);
        const ballOgirlik = ballBor.reduce((s, r) => s + n(r.suhbatlar), 0);
        const ball =
          ballOgirlik > 0
            ? Math.round(
                (ballBor.reduce((s, r) => s + n(r.ball) * n(r.suhbatlar), 0) / ballOgirlik) * 10,
              ) / 10
            : null;

        return {
          activity: {
            conversations: suhbatlar,
            engaged: boglangan,
            notEngaged: yig('boglanmagan'),
            engagementPct:
              suhbatlar > 0 ? Math.round((boglangan / suhbatlar) * 1000) / 10 : null,
            talkSeconds: yig('suhbat_vaqti'),
          },
          tasks: vz,
          quality: {
            analyzed: yig('tahlil'),
            scored: baholangan,
            operational: yig('operatsion'),
            unanswered: yig('javobsiz'),
            flagged: yig('bayroqli'),
            avgScore: ball,
            medianFirstResponseSeconds:
              src.length === 1 ? (src[0]!.median_javob as number | null) : null,
          },
          leads: {
            newLeads: yig('yangi_lid'),
            withDeal: bitimli,
            dealSum: bitimli > 0 ? yig('summa') : null,
          },
        };
      }

      const bosh = R(oldingi)[0];
      const oldinBogl = n(bosh?.boglangan);
      const oldinSuh = n(bosh?.suhbatlar);

      interface VazifaSoni {
        yaratildi: number;
        bajarildi: number;
        ochiq: number;
        kechikkan: number;
      }
      const umumiyVazifa = R(vazifa).reduce<VazifaSoni>(
        (a, v) => ({
          yaratildi: a.yaratildi + n(v.yaratildi),
          bajarildi: a.bajarildi + n(v.bajarildi),
          ochiq: a.ochiq + n(v.ochiq),
          kechikkan: a.kechikkan + n(v.kechikkan),
        }),
        { yaratildi: 0, bajarildi: 0, ochiq: 0, kechikkan: 0 },
      );

      const umumiy = bolimlar(qatorlar, umumiyVazifa);

      /**
       * Tavsiyalar — RAQAMDAN kelib chiqadi.
       * Har biri shartli: mos muammo bo'lmasa, jumla umuman qo'shilmaydi.
       * Shu tufayli hisobotda hech qachon "0 ta kechikish bor" kabi
       * bo'sh gap paydo bo'lmaydi.
       */
      function tavsiyalar(b: ReturnType<typeof bolimlar>, kim: string | null): string[] {
        const t: string[] = [];
        const kimlik = kim ? `${kim}: ` : '';
        if (b.tasks.kechikkan > 0) {
          t.push(
            `${kimlik}muddati o'tgan ${b.tasks.kechikkan} ta vazifani qayta ko'rib chiqing va ` +
              'eng muhimlarini birinchi navbatda yoping.',
          );
        }
        if (b.quality.unanswered > 0) {
          t.push(
            `${kimlik}javobsiz qolgan ${b.quality.unanswered} ta suhbat bor — mijoz javob ` +
              'kutgan, ular bilan qayta aloqaga chiqing.',
          );
        }
        if (b.activity.notEngaged > 0) {
          t.push(
            `${kimlik}${b.activity.notEngaged} ta suhbatda aloqa o'rnatilmagan (bir tomon ` +
              'javob bermagan) — sababini tekshiring.',
          );
        }
        if (b.quality.avgScore !== null && b.quality.avgScore < 60) {
          t.push(
            `${kimlik}o'rtacha ball ${b.quality.avgScore}% — pastdagi zaif mezonlar bo'yicha ` +
              'mashq o\'tkazish kerak.',
          );
        }
        if (b.quality.flagged > 0) {
          t.push(`${kimlik}${b.quality.flagged} ta suhbat bayroqlangan — qo'lda ko'rib chiqing.`);
        }
        return t;
      }

      /** Xulosa — kunning eng muhim ikki faktini bitta jumlaga yig'adi. */
      function xulosa(b: ReturnType<typeof bolimlar>): string {
        if (b.activity.conversations === 0) {
          return 'Bu kuni suhbat qayd etilmagan. Dam olish kuni yoki integratsiya ishlamagan bo\'lishi mumkin.';
        }
        const qism: string[] = [];
        qism.push(
          `Kun davomida ${b.activity.conversations} ta suhbat bo'ldi, ` +
            `${b.activity.engaged} tasida aloqa o'rnatildi` +
            (b.activity.engagementPct !== null ? ` (${b.activity.engagementPct}%)` : ''),
        );
        if (b.quality.avgScore !== null) {
          qism.push(
            `o'rtacha sifat ${b.quality.avgScore}%` +
              (b.quality.avgScore >= 80
                ? ' — bu yaxshi ko\'rsatkich'
                : b.quality.avgScore >= 60
                  ? ''
                  : ' — bu e\'tibor talab qiladi'),
          );
        }
        if (b.leads.withDeal > 0) {
          qism.push(`${b.leads.withDeal} ta suhbatda aniq summa kelishildi`);
        }
        if (b.tasks.kechikkan > 0) {
          qism.push(`lekin ${b.tasks.kechikkan} ta vazifa muddati o'tgan`);
        }
        return `${qism.join(', ')}.`;
      }

      const perSeat = qatorlar
        .filter((r) => r.seat_id !== null)
        .map((r) => {
          const vz = vazifaMap.get(String(r.seat_id));
          const b = bolimlar([r], {
            yaratildi: n(vz?.yaratildi),
            bajarildi: n(vz?.bajarildi),
            ochiq: n(vz?.ochiq),
            kechikkan: n(vz?.kechikkan),
          });
          return {
            seatId: r.seat_id,
            displayName: r.display_name,
            strength: r.kuch ?? null,
            improvement: r.yaxshilash ?? null,
            ...b,
            recommendations: tavsiyalar(b, String(r.display_name)),
            conclusion: xulosa(b),
          };
        })
        .sort((a, b) => (b.quality.avgScore ?? -1) - (a.quality.avgScore ?? -1));

      const s = R(saqlangan)[0];

      return {
        date,
        overall: {
          ...umumiy,
          previous: bosh?.sana
            ? {
                date: bosh.sana,
                conversations: oldinSuh,
                engaged: oldinBogl,
                engagementPct: oldinSuh > 0 ? Math.round((oldinBogl / oldinSuh) * 1000) / 10 : null,
                talkSeconds: n(bosh.suhbat_vaqti),
                avgScore: (bosh.ball as number | null) ?? null,
                scored: n(bosh.baholangan),
              }
            : null,
          questionnaire: R(anketa).map((x) => ({ question: x.savol, answers: x.javoblar })),
          weakest: R(zaif).map((x) => ({
            code: x.kod,
            name: x.nom,
            avgScore: x.ball,
            count: x.soni,
          })),
          recommendations: tavsiyalar(umumiy, null),
          conclusion: xulosa(umumiy),
        },
        bySeat: perSeat,
        report: s
          ? { content: s.content, createdAt: s.created_at, triggeredBy: s.triggered_by }
          : null,
      };
    },
  );

  /** Hisobot sozlamalari. */
  app.put(
    '/api/v1/businesses/:businessId/reports/daily/settings',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async (req) => {
      const body = settingsBody.parse(req.body);
      const businessId = req.business!.businessId;

      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select({ id: integration.id, config: integration.config })
          .from(integration)
          .where(eq(integration.kind, 'telegram_bot'))
          .limit(1),
      );
      if (!row) throw AppError.badRequest('Avval Telegram botni ulang');

      const config = {
        ...(row.config as Record<string, unknown>),
        reportChatId: body.reportChatId,
        ...(body.reportHour !== undefined ? { reportHour: body.reportHour } : {}),
      };

      await withTenant(businessId, (tx) =>
        tx
          .update(integration)
          .set({ config, updatedAt: new Date() })
          .where(and(eq(integration.id, row.id), eq(integration.kind, 'telegram_bot'))),
      );

      return { reportChatId: config.reportChatId, reportHour: config.reportHour ?? 9 };
    },
  );

  /**
   * "Hozir yuborish" — sozlashni tekshirish uchun.
   *
   * Soat va takrorlanish tekshiruvlarini chetlab o'tadi, chunki
   * foydalanuvchi aynan natijani DARHOL ko'rmoqchi. Yuborilmasa,
   * sabab matn bilan qaytadi — "hech narsa bo'lmadi" holati yo'q.
   */
  app.post(
    '/api/v1/businesses/:businessId/reports/daily/send',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async (req) => {
      const result = await sendDailyReportNow(req.business!.businessId);
      return result;
    },
  );
}
