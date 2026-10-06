import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID XULOSALARI — "bu mijoz nega qo'lda qolmadi" ekrani
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Analitika UMUMIY suratni beradi ("e'tirozlarda yiqilyapmiz"), bu bo'lim
 * esa BITTA lidni oxirigacha ochadi: qaysi suhbatlarda nima bo'ldi, qaysi
 * e'tiroz javobsiz qoldi, menejer nima qilmadi va endi nima qilish kerak.
 *
 * ── Lid = kontakt ───────────────────────────────────────────────────────────
 * Bizda alohida "lead" jadvali yo'q va uni yaratish ortiqcha bo'lardi:
 * kontakt bilan bo'lgan barcha suhbatlar zanjiri aynan lidning tarixi.
 *
 * ── Holat CRM natijasi EMAS ────────────────────────────────────────────────
 * "Yo'qotilgan" deb belgilash uchun haqiqiy manba kerak — CRM ulanmagan.
 * Shuning uchun holat FAOLLIK bo'yicha aniqlanadi va nomlari ham shunga
 * mos: `bitimli / faol / sovimoqda / sovigan`. UI buni ochiq yozadi.
 */

const HOLATLAR = ['bitimli', 'faol', 'sovimoqda', 'sovigan'] as const;

const royxatQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  /** Faollik chegaralari — analitikadagi voronka bilan bir xil. */
  activeDays: z.coerce.number().int().min(1).max(120).default(14),
  lostDays: z.coerce.number().int().min(2).max(365).default(30),
  holat: z.enum(HOLATLAR).optional(),
  seatId: z.string().uuid().optional(),
  /** E'tiroz matni bo'yicha qidiruv (qismli moslik). */
  sabab: z.string().trim().min(1).max(120).optional(),
  sort: z.enum(['sana', 'imkoniyat']).default('sana'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  /** Sahifalash: `lid` massivi butunlay xotirada tayyor bo'lgani uchun offset kifoya. */
  offset: z.coerce.number().int().min(0).default(0),
});

type Row = Record<string, unknown>;
const rows = (r: unknown): Row[] => r as unknown as Row[];

/**
 * Qayta yutish imkoniyati — 0..100.
 *
 * Uchta signaldan yig'iladi: suhbat sifati (menejer yaxshi ishlagan bo'lsa
 * mijoz qaytishi osonroq), aloqa chuqurligi (necha marta gaplashilgan) va
 * sovish muddati (yangi uzilish — issiq iz). Bu BASHORAT emas, tartiblash
 * uchun ball: rahbar qaysi lidga birinchi qaytishni shu bo'yicha tanlaydi.
 */
function imkoniyat(ball: number | null, suhbatlar: number, kunOtdi: number): number {
  const sifat = ball === null ? 40 : Math.min(100, ball);
  const chuqurlik = Math.min(100, suhbatlar * 25);
  // 7 kungacha — deyarli to'liq, 90 kundan keyin — nolga yaqin.
  const yangilik = Math.max(0, 100 - Math.max(0, kunOtdi - 7) * 1.2);
  return Math.round(sifat * 0.45 + chuqurlik * 0.2 + yangilik * 0.35);
}

function imkoniyatDaraja(v: number): 'yuqori' | 'ortacha' | 'past' {
  return v >= 65 ? 'yuqori' : v >= 40 ? 'ortacha' : 'past';
}

/** Qayta aloqa oynasi — imkoniyatga qarab. */
function qaytaOyna(v: number): string {
  return v >= 65 ? '7–14 kun' : v >= 40 ? '14–30 kun' : '30–60 kun';
}

export function registerLeadRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireBusiness, requirePermission('analytics:read:all')] };

  /**
   * Lid bazasi — ro'yxat va tafsilot bir xil manbadan quriladi, shuning
   * uchun ikkalasi hech qachon boshqa raqam ko'rsatmaydi.
   */
  const lidBaza = (f: string, t: string) => sql`
    select
      ct.id                                   as contact_id,
      ct.name,
      ct.company,
      ct.phone,
      ct.first_seen_at,
      oxirgi.id                               as oxirgi_suhbat,
      oxirgi.started_at                       as last_at,
      oxirgi.seat_id,
      s.display_name                          as seat_name,
      a.lead_quality,
      a.overall_score,
      a.primary_gap,
      a.summary,
      a.signals,
      a.business_relevance,
      a.call_family,
      a.service_line,
      a.manager_note,
      a.client_extracted,
      (a.deal #>> '{amount}')::numeric        as deal_amount,
      (a.deal #>> '{currency}')               as deal_currency,
      (select count(*) from conversation c2
        where c2.contact_id = ct.id
          and c2.started_at >= ${f}::timestamptz and c2.started_at < ${t}::timestamptz)::int
                                              as suhbatlar,
      (select count(*) from conversation c3
         join analysis a3 on a3.conversation_id = c3.id
        where c3.contact_id = ct.id and (a3.deal #>> '{amount}') is not null)::int
                                              as bitimli,
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

  /** Holat — faollik bo'yicha (CRM natijasi emas). */
  function holatAniqla(kun: number, bitimli: number, aktiv: number, sovuq: number) {
    if (bitimli > 0) return 'bitimli' as const;
    if (kun < aktiv) return 'faol' as const;
    if (kun < sovuq) return 'sovimoqda' as const;
    return 'sovigan' as const;
  }

  /** Birinchi e'tiroz — "nega yo'qotildi" ustuni uchun. */
  function birinchiEtiroz(signals: unknown): string | null {
    const o = (signals as { objections?: unknown } | null)?.objections;
    if (!Array.isArray(o)) return null;
    const bor = o.find((x) => typeof x === 'string' && x.trim() !== '');
    return typeof bor === 'string' ? bor.trim() : null;
  }

  app.get('/api/v1/businesses/:businessId/leads', guard, async (req) => {
    const q = royxatQuery.parse(req.query);
    const to = q.to ?? new Date();
    const from = q.from ?? new Date(to.getTime() - 90 * 24 * 3600 * 1000);
    const businessId = req.business!.businessId;
    const f = from.toISOString();
    const t = to.toISOString();

    const [lidlar, sabablar, menejerlar] = await withTenant(businessId, (tx) =>
      Promise.all([
        tx.execute(sql`select * from (${lidBaza(f, t)}) lid order by last_at desc`),
        /** Filtr ro'yxati uchun — mavjud e'tirozlar. */
        tx.execute(sql`
          select lower(trim(o)) as key, count(*)::int as count
          from (${lidBaza(f, t)}) lid
          cross join lateral jsonb_array_elements_text(
            case when jsonb_typeof(lid.signals -> 'objections') = 'array'
                 then lid.signals -> 'objections' else '[]'::jsonb end
          ) as o
          where trim(o) <> ''
          group by 1 order by count desc limit 20
        `),
        tx.execute(sql`
          select s.id, s.display_name from seat s where s.is_active order by s.display_name
        `),
      ]),
    );

    let lid = rows(lidlar).map((r) => {
      const kun = Number(r.kun_otdi ?? 0);
      const ball = r.overall_score === null ? null : Number(r.overall_score);
      const suhbatlar = Number(r.suhbatlar ?? 0);
      const imk = imkoniyat(ball, suhbatlar, kun);
      return {
        contactId: r.contact_id as string,
        name: (r.name as string | null) ?? null,
        company: (r.company as string | null) ?? null,
        seatId: (r.seat_id as string | null) ?? null,
        seatName: (r.seat_name as string | null) ?? null,
        lastAt: r.last_at,
        daysSince: Math.round(kun * 10) / 10,
        conversations: suhbatlar,
        overallScore: ball,
        leadQuality: (r.lead_quality as string | null) ?? null,
        dealAmount: r.deal_amount === null ? null : Number(r.deal_amount),
        holat: holatAniqla(kun, Number(r.bitimli ?? 0), q.activeDays, q.lostDays),
        /** "Nega yo'qotildi" — birinchi e'tiroz, bo'lmasa asosiy zaif joy. */
        reason: birinchiEtiroz(r.signals) ?? (r.primary_gap as string | null) ?? null,
        /** "Yo'qotilgan bosqich" — o'sha suhbatning asosiy zaif joyi. */
        stage: (r.primary_gap as string | null) ?? null,
        summary: (r.summary as string | null) ?? null,
        winBack: imk,
        winBackLevel: imkoniyatDaraja(imk),
        reconnectWindow: qaytaOyna(imk),
      };
    });

    // ─── Filtrlar ───
    if (q.holat) lid = lid.filter((x) => x.holat === q.holat);
    if (q.seatId) lid = lid.filter((x) => x.seatId === q.seatId);
    if (q.sabab) {
      const s = q.sabab.toLowerCase();
      lid = lid.filter((x) => (x.reason ?? '').toLowerCase().includes(s));
    }
    if (q.sort === 'imkoniyat') lid.sort((a, b) => b.winBack - a.winBack);

    return {
      period: { from, to },
      thresholds: { activeDays: q.activeDays, lostDays: q.lostDays },
      total: lid.length,
      leads: lid.slice(q.offset, q.offset + q.limit),
      hasMore: q.offset + q.limit < lid.length,
      /** Filtr tanlovlari — interfeys ularni o'zi to'qib chiqarmasligi uchun. */
      filters: {
        reasons: rows(sabablar).map((r) => ({ key: r.key, count: r.count })),
        seats: rows(menejerlar).map((r) => ({ id: r.id, name: r.display_name })),
        statuses: HOLATLAR,
      },
    };
  });

  /**
   * Bitta lidning to'liq tahlili.
   *
   * Bu yerda hamma narsa MAVJUD tahlillardan yig'iladi — yangi LLM
   * chaqiruvi yo'q. Sabab: har bir suhbat allaqachon baholangan, uning
   * e'tirozlari, zaif joylari va kouching izohlari saqlangan. Ularni
   * lid bo'yicha birlashtirish — yangi ma'lumot emas, mavjudini
   * to'g'ri ko'rsatish.
   */
  app.get('/api/v1/businesses/:businessId/leads/:contactId', guard, async (req) => {
    const { contactId } = z
      .object({ businessId: z.string().uuid(), contactId: z.string().uuid() })
      .parse(req.params);
    const businessId = req.business!.businessId;

    const [kontakt, suhbatlar, mezonlar, vadalar] = await withTenant(businessId, (tx) =>
      Promise.all([
        tx.execute(sql`
          select id, name, company, phone, telegram_id, role, is_decision_maker,
                 first_seen_at, last_seen_at
          from contact where id = ${contactId}
        `),
        tx.execute(sql`
          select
            c.id, c.started_at, c.ended_at, c.channel::text as channel, c.status::text as status,
            s.display_name                                            as seat_name,
            c.seat_id,
            a.overall_score, a.summary, a.primary_gap, a.compliance,
            a.lead_quality, a.business_relevance, a.call_family, a.service_line,
            a.signals, a.manager_note, a.client_extracted, a.dynamics,
            (a.deal #>> '{amount}')::numeric                          as deal_amount,
            (a.deal #>> '{currency}')                                 as deal_currency,
            (select count(*) from transcript_segment ts
              where ts.conversation_id = c.id)::int                   as navbatlar
          from conversation c
          left join analysis a on a.conversation_id = c.id
          left join seat s on s.id = c.seat_id
          where c.contact_id = ${contactId}
          order by c.started_at
        `),
        /** Shu lid bo'yicha barcha mezon ballari — zaif tomonlarni topish uchun. */
        tx.execute(sql`
          select cs.criterion_code as kod, min(cs.criterion_name) as nom,
                 round(avg(cs.score), 2)::float as ball,
                 max(cs.max_score)::int as max_ball,
                 count(*)::int as soni
          from criterion_score cs
          join conversation c on c.id = cs.conversation_id
          where c.contact_id = ${contactId} and cs.score is not null
          group by cs.criterion_code
          order by avg(cs.score) asc
        `),
        tx.execute(sql`
          select cm.what, cm.by_party::text as party, cm.status::text as status,
                 cm.deadline, cm.created_at
          from commitment cm
          join conversation c on c.id = cm.conversation_id
          where c.contact_id = ${contactId}
          order by cm.created_at
        `),
      ]),
    );

    const k = rows(kontakt)[0];
    if (!k) throw AppError.notFound();

    const suh = rows(suhbatlar);
    if (suh.length === 0) throw AppError.notFound();

    const oxirgi = suh[suh.length - 1]!;
    const kunOtdi =
      (Date.now() - new Date(oxirgi.started_at as string).getTime()) / 86400000;
    const bitimli = suh.filter((x) => x.deal_amount !== null);
    const ballar = suh
      .map((x) => (x.overall_score === null ? null : Number(x.overall_score)))
      .filter((v): v is number => v !== null);
    const ortacha =
      ballar.length > 0
        ? Math.round((ballar.reduce((a, b) => a + b, 0) / ballar.length) * 10) / 10
        : null;

    const holat = holatAniqla(kunOtdi, bitimli.length, 14, 30);
    const imk = imkoniyat(ortacha, suh.length, kunOtdi);

    /** Barcha e'tirozlar — takrorlanmagan holda, uchragan tartibida. */
    const etirozlar: string[] = [];
    for (const x of suh) {
      const o = (x.signals as { objections?: unknown } | null)?.objections;
      if (Array.isArray(o)) {
        for (const e of o) {
          const s = String(e).trim();
          if (s && !etirozlar.some((y) => y.toLowerCase() === s.toLowerCase())) etirozlar.push(s);
        }
      }
    }

    const yaxshilashlar: string[] = [];
    const kuchlar: string[] = [];
    const iboralar: { context: string; suggestion: string }[] = [];
    for (const x of suh) {
      const mn = x.manager_note as
        | {
            strengths?: unknown;
            improvements?: unknown;
            betterPhrases?: { context?: unknown; suggestion?: unknown }[];
          }
        | null;
      if (Array.isArray(mn?.improvements)) {
        for (const i of mn.improvements) {
          const s = String(i).trim();
          if (s && !yaxshilashlar.includes(s)) yaxshilashlar.push(s);
        }
      }
      if (Array.isArray(mn?.strengths)) {
        for (const i of mn.strengths) {
          const s = String(i).trim();
          if (s && !kuchlar.includes(s)) kuchlar.push(s);
        }
      }
      if (Array.isArray(mn?.betterPhrases)) {
        for (const p of mn.betterPhrases) {
          if (typeof p?.suggestion === 'string') {
            iboralar.push({
              context: String(p.context ?? ''),
              suggestion: p.suggestion,
            });
          }
        }
      }
    }

    /** Javob tezligi — barcha suhbatlar bo'yicha median. */
    const javoblar = suh
      .map((x) => {
        const d = x.dynamics as { replyMetrics?: { firstResponseSeconds?: unknown } } | null;
        const v = d?.replyMetrics?.firstResponseSeconds;
        return typeof v === 'number' ? v : null;
      })
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    const medianJavob =
      javoblar.length > 0 ? javoblar[Math.floor(javoblar.length / 2)]! : null;

    /** Suhbatlar orasidagi o'rtacha tanaffus — follow-up ritmi. */
    let ortaTanaffus: number | null = null;
    if (suh.length > 1) {
      let jami = 0;
      for (let i = 1; i < suh.length; i++) {
        jami +=
          new Date(suh[i]!.started_at as string).getTime() -
          new Date(suh[i - 1]!.started_at as string).getTime();
      }
      ortaTanaffus = Math.round((jami / (suh.length - 1) / 86400000) * 10) / 10;
    }

    /** Ball tendensiyasi — oxirgi ikki baholangan suhbat bo'yicha. */
    const trend =
      ballar.length >= 2
        ? ballar[ballar.length - 1]! > ballar[ballar.length - 2]!
          ? 'osish'
          : ballar[ballar.length - 1]! < ballar[ballar.length - 2]!
            ? 'pasayish'
            : 'barqaror'
        : null;

    const jamiVaqt = suh.reduce((s, x) => {
      if (!x.ended_at) return s;
      return (
        s +
        (new Date(x.ended_at as string).getTime() -
          new Date(x.started_at as string).getTime()) /
          1000
      );
    }, 0);

    const zaif = rows(mezonlar).filter((m) => Number(m.ball) <= Number(m.max_ball) * 0.6);
    const kutilayotgan = rows(vadalar).filter(
      (v) => v.party === 'manager' && v.status !== 'done',
    );

    /**
     * Biznes xulosasi — raqamlar va mavjud tahlillardan yasaladi.
     * LLM chaqirilmaydi: har bir dalil allaqachon bazada, uni qayta
     * "o'ylab topish" faqat xato kiritishi mumkin edi.
     */
    function xulosa(): { sarlavha: string; matn: string } {
      if (holat === 'bitimli') {
        return {
          sarlavha: 'Summa kelishilgan',
          matn:
            `${suh.length} ta suhbatdan keyin ${bitimli.length} tasida aniq summa aytilgan. ` +
            (oxirgi.summary ? String(oxirgi.summary) : ''),
        };
      }
      if (holat === 'faol') {
        return {
          sarlavha: 'Lid faol — ish davom etyapti',
          matn:
            `Oxirgi aloqa ${Math.round(kunOtdi)} kun oldin bo'lgan. ` +
            (oxirgi.summary ? String(oxirgi.summary) : ''),
        };
      }
      const sabab = etirozlar[0]
        ? `Asosiy e'tiroz — «${etirozlar[0]}».`
        : oxirgi.primary_gap
          ? `Asosiy zaif joy — ${String(oxirgi.primary_gap)}.`
          : 'Aniq e\'tiroz qayd etilmagan.';
      return {
        sarlavha:
          holat === 'sovigan' ? 'Lid sovib qolgan: sababini aniqlang' : 'Lid sovimoqda',
        matn:
          `${suh.length} ta suhbat bo'lgan, oxirgisidan ${Math.round(kunOtdi)} kun o'tdi. ` +
          `${sabab}` +
          (kutilayotgan.length > 0
            ? ` Menejerning ${kutilayotgan.length} ta bajarilmagan va'dasi bor.`
            : ''),
      };
    }

    /** Keyingi eng yaxshi qadam — bajarilmagan va'da yoki birinchi tavsiya. */
    function keyingiQadam(): { matn: string; muddat: string } {
      if (kutilayotgan.length > 0) {
        return {
          matn: `Bajarilmagan va'dani yoping: «${String(kutilayotgan[0]!.what)}».`,
          muddat: 'Darhol',
        };
      }
      if (etirozlar.length > 0) {
        return {
          matn:
            `«${etirozlar[0]}» e'tirozi bilan qayta ishlang — qiymatni ochib, ` +
            'muqobil variant taklif qiling.',
          muddat: qaytaOyna(imk),
        };
      }
      if (yaxshilashlar.length > 0) {
        return { matn: yaxshilashlar[0]!, muddat: qaytaOyna(imk) };
      }
      return {
        matn: 'Mijoz bilan qayta bog\'lanib, hozirgi holatini aniqlang.',
        muddat: qaytaOyna(imk),
      };
    }

    /**
     * Kvalifikatsiya (BANT) — faqat DALIL bor bo'lgan qismi to'ldiriladi.
     * Ma'lumot yo'q bo'lsa "aniqlanmadi" qaytadi: taxminni fakt sifatida
     * ko'rsatish bu ekranning butun ma'nosini buzardi.
     */
    function kvalifikatsiya() {
      const byudjet = suh
        .map((x) => (x.signals as { budgetReaction?: unknown } | null)?.budgetReaction)
        .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
        .pop();
      const qaror = suh
        .map(
          (x) =>
            (x.client_extracted as { isDecisionMaker?: unknown } | null)?.isDecisionMaker,
        )
        .filter((v): v is boolean => typeof v === 'boolean')
        .pop();
      const shoshilinch = suh
        .map((x) => (x.signals as { urgency?: unknown } | null)?.urgency)
        .filter((v): v is string => typeof v === 'string')
        .pop();
      return {
        budget: byudjet ?? null,
        authority:
          qaror === undefined ? null : qaror ? 'Qaror qiluvchi' : 'Qaror qiluvchi emas',
        need: oxirgi.service_line ? String(oxirgi.service_line) : null,
        timing: shoshilinch ?? null,
      };
    }

    return {
      lead: {
        contactId,
        name: k.name ?? null,
        company: k.company ?? null,
        phone: k.phone ?? null,
        isDecisionMaker: k.is_decision_maker ?? null,
        firstSeenAt: k.first_seen_at,
        lastAt: oxirgi.started_at,
        daysSince: Math.round(kunOtdi * 10) / 10,
        holat,
        seatId: oxirgi.seat_id ?? null,
        seatName: oxirgi.seat_name ?? null,
        conversations: suh.length,
        avgScore: ortacha,
        dealAmount: bitimli.length > 0 ? Number(bitimli[bitimli.length - 1]!.deal_amount) : null,
        dealCurrency: bitimli.length > 0 ? bitimli[bitimli.length - 1]!.deal_currency : null,
        leadQuality: oxirgi.lead_quality ?? null,
        serviceLine: oxirgi.service_line ?? null,
        callFamily: oxirgi.call_family ?? null,
        winBack: imk,
        winBackLevel: imkoniyatDaraja(imk),
        reconnectWindow: qaytaOyna(imk),
      },
      summary: xulosa(),
      nextStep: keyingiQadam(),
      signals: {
        medianFirstResponseSeconds: medianJavob,
        avgFollowUpDays: ortaTanaffus,
        trend,
        totalTalkSeconds: Math.round(jamiVaqt),
      },
      reasons: {
        objections: etirozlar,
        primaryGap: oxirgi.primary_gap ?? null,
        /** Zaif mezonlar — "qaysi bosqichda yiqildik" savoliga javob. */
        weakCriteria: zaif.map((m) => ({
          code: m.kod,
          name: m.nom,
          avgScore: m.ball,
          maxScore: m.max_ball,
          count: m.soni,
        })),
      },
      coaching: {
        improvements: yaxshilashlar,
        strengths: kuchlar,
        betterPhrases: iboralar.slice(0, 4),
      },
      qualification: kvalifikatsiya(),
      commitments: rows(vadalar).map((v) => ({
        what: v.what,
        party: v.party,
        status: v.status,
        deadline: v.deadline,
        createdAt: v.created_at,
      })),
      /** Xronologiya — har suhbat bir voqea. */
      timeline: suh.map((x) => ({
        conversationId: x.id,
        startedAt: x.started_at,
        endedAt: x.ended_at,
        channel: x.channel,
        status: x.status,
        seatName: x.seat_name ?? null,
        overallScore: x.overall_score === null ? null : Number(x.overall_score),
        summary: x.summary ?? null,
        primaryGap: x.primary_gap ?? null,
        turns: x.navbatlar,
        objections: (() => {
          const o = (x.signals as { objections?: unknown } | null)?.objections;
          return Array.isArray(o) ? o.map(String) : [];
        })(),
        dealAmount: x.deal_amount === null ? null : Number(x.deal_amount),
      })),
    };
  });
}
