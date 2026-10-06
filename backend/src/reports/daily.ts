import { sql } from 'drizzle-orm';
import { decryptSecret } from '../crypto/secrets.js';
import { manzillarniTop, telegramTargetsSchema } from '../business/channels.js';
import { alertPrefsSchema } from '../business/settings.js';
import { withoutTenantIsolation } from '../db/index.js';
import { sendTelegramMessage } from '../telegram/send.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KUNLIK HISOBOT — TZ 3.8, FR-134
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Har kuni belgilangan soatda rahbarga Telegram orqali bir xabar: kecha
 * nima bo'ldi va bugun nimaga qarash kerak.
 *
 * Nega bu muhim: mahsulotning qolgan qismi rahbar SAYTGA KIRSA ishlaydi.
 * Kunlik hisobot esa uni saytga chaqiradi — aynan shu narsa mahsulotni
 * "kirib ko'rish kerak bo'lgan sayt" dan "har kuni o'zi keladigan xabar"
 * ga aylantiradi.
 *
 * ── Matn LLM'siz tuziladi ──
 * TZ da "AI yozgan matn" deyilgan, lekin bu yerda ataylab deterministik
 * shablon ishlatiladi:
 *   - hisobot har kuni, har biznes uchun ishlaydi — LLM bo'lsa bu doimiy
 *     xarajat va doimiy nosozlik manbai;
 *   - hisobotdagi hamma narsa raqam va nom, ya'ni modeldan izohlash
 *     talab qilinmaydi;
 *   - loyihaning asosiy tamoyili: aniq qoidali narsani modelga
 *     ishonmaymiz (playbook kodlari, vaznlar va isbot tekshiruvi ham
 *     shunday qilingan).
 * Kelajakda "kunning eng yaxshi/eng yomon suhbati izohi" kabi
 * matn qismi qo'shilsa — o'sha qism uchun LLM chaqiriladi, butun
 * hisobot uchun emas.
 *
 * ── Idempotentlik ──
 * Bitta biznes + bitta sana uchun faqat bitta qator. Worker soatda bir
 * marta uriladi va qayta ishga tushsa ham takror xabar yubormaydi:
 * `daily_summary` da qator bormi — birinchi tekshiruv shu.
 */

export interface DailyStats {
  conversations: number;
  analyzed: number;
  filtered: number;
  avgScore: number | null;
  flagged: number;
  unanswered: number;
  medianFirstResponseSeconds: number | null;
  newAlerts: number;
  overdueTasks: number;
  bestSeat: { name: string; score: number } | null;
  worstSeat: { name: string; score: number } | null;
  weakestCriterion: { code: string; name: string; avgScore: number } | null;
}

export interface DailyReportOutcome {
  businessId: string;
  date: string;
  /** Xabar yuborildimi. Yuborilmasa — sabab `skipped` da. */
  sent: boolean;
  skipped?: string;
}

/** Biznes vaqt zonasidagi joriy soat (0-23). */
export function localHour(timezone: string, now = new Date()): number {
  try {
    const s = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hour12: false,
    }).format(now);
    return Number(s);
  } catch {
    // Noto'g'ri zona nomi — hisobot butunlay to'xtab qolmasin.
    return new Date(now).getUTCHours();
  }
}

/** Biznes vaqt zonasidagi sana, YYYY-MM-DD. */
export function localDate(timezone: string, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

/**
 * Hisobot oynasi: hisobot yuborilayotgan paytdan **oldingi 24 soat**.
 *
 * "Kecha 00:00–23:59" emas: hisobot soati sozlanadigan bo'lgani uchun
 * (masalan 09:00) kalendar kuni bilan cheklash bugun ertalabki
 * suhbatlarni tashlab ketardi va rahbar ularni faqat ertaga ko'rardi.
 */
function oyna(now: Date): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - 24 * 3600 * 1000), to: now };
}

export async function buildDailyStats(
  businessId: string,
  now = new Date(),
): Promise<DailyStats> {
  const { from, to } = oyna(now);
  const f = from.toISOString();
  const t = to.toISOString();

  return withoutTenantIsolation('kunlik hisobot: statistika', async (tx) => {
    const [kpi] = (await tx.execute(sql`
      select
        count(*)::int                                                    as conversations,
        count(a.id)::int                                                 as analyzed,
        count(*) filter (where c.status = 'filtered')::int               as filtered,
        round(avg(a.overall_score), 1)::float                            as avg_score,
        count(*) filter (where a.is_flagged)::int                        as flagged,
        count(*) filter (
          where (a.dynamics #>> '{replyMetrics,unansweredTurns}')::int > 0
            and coalesce(a.dynamics #>> '{needsReply}', 'true') <> 'false'
        )::int                                                           as unanswered,
        percentile_cont(0.5) within group (
          order by (a.dynamics #>> '{replyMetrics,firstResponseSeconds}')::numeric
        )::float                                                         as median_first_response
      from conversation c
      left join analysis a on a.conversation_id = c.id
      where c.business_id = ${businessId}
        and c.started_at >= ${f}::timestamptz
        and c.started_at < ${t}::timestamptz
    `)) as Record<string, unknown>[];

    const seats = (await tx.execute(sql`
      select s.display_name, round(avg(a.overall_score), 1)::float as avg_score
      from conversation c
      join analysis a on a.conversation_id = c.id
      join seat s on s.id = c.seat_id
      where c.business_id = ${businessId}
        and c.started_at >= ${f}::timestamptz
        and c.started_at < ${t}::timestamptz
        and a.overall_score is not null
      group by s.display_name
      having count(*) >= 1
      order by avg(a.overall_score) desc
    `)) as Record<string, unknown>[];

    const [weak] = (await tx.execute(sql`
      select cs.criterion_code, min(cs.criterion_name) as criterion_name,
             round(avg(cs.score), 2)::float as avg_score
      from criterion_score cs
      where cs.business_id = ${businessId}
        and cs.created_at >= ${f}::timestamptz
        and cs.created_at < ${t}::timestamptz
        and cs.score is not null
      group by cs.criterion_code
      having count(*) >= 2
      order by avg(cs.score) asc
      limit 1
    `)) as Record<string, unknown>[];

    const [hisob] = (await tx.execute(sql`
      select
        (select count(*)::int from alert
          where business_id = ${businessId} and status = 'new')                as new_alerts,
        (select count(*)::int from task
          where business_id = ${businessId}
            and status in ('pending', 'in_progress', 'blocked')
            and due_at is not null and due_at < now())                          as overdue_tasks
    `)) as Record<string, unknown>[];

    const eng = seats[0];
    const past = seats.length > 1 ? seats[seats.length - 1] : undefined;

    return {
      conversations: Number(kpi?.conversations ?? 0),
      analyzed: Number(kpi?.analyzed ?? 0),
      filtered: Number(kpi?.filtered ?? 0),
      avgScore: (kpi?.avg_score as number | null) ?? null,
      flagged: Number(kpi?.flagged ?? 0),
      unanswered: Number(kpi?.unanswered ?? 0),
      medianFirstResponseSeconds: (kpi?.median_first_response as number | null) ?? null,
      newAlerts: Number(hisob?.new_alerts ?? 0),
      overdueTasks: Number(hisob?.overdue_tasks ?? 0),
      bestSeat: eng ? { name: String(eng.display_name), score: Number(eng.avg_score) } : null,
      worstSeat: past ? { name: String(past.display_name), score: Number(past.avg_score) } : null,
      weakestCriterion: weak
        ? {
            code: String(weak.criterion_code),
            name: String(weak.criterion_name),
            avgScore: Number(weak.avg_score),
          }
        : null,
    };
  });
}

function soniya(s: number | null): string {
  if (s === null) return '—';
  if (s < 60) return `${Math.round(s)} soniya`;
  if (s < 3600) return `${Math.round(s / 60)} daqiqa`;
  return `${(s / 3600).toFixed(1)} soat`;
}

/** Telegram xabari matni. Oddiy matn — Markdown emas (send.ts ga qarang). */
export function formatDailyReport(bizNomi: string, sana: string, s: DailyStats): string {
  const q: string[] = [];
  q.push(`${bizNomi} — kunlik hisobot (${sana})`);
  q.push('');

  if (s.conversations === 0) {
    q.push('Oxirgi 24 soatda yangi suhbat bo\'lmadi.');
  } else {
    q.push(`Suhbat: ${s.conversations} ta (${s.analyzed} tahlil qilindi${s.filtered > 0 ? `, ${s.filtered} filtrlandi` : ''})`);
    q.push(`O'rtacha ball: ${s.avgScore === null ? '—' : `${s.avgScore}%`}`);
    q.push(`Birinchi javob (median): ${soniya(s.medianFirstResponseSeconds)}`);
  }

  // Harakat talab qiladigan qism ataylab alohida va yuqorida turadi:
  // rahbar xabarni oxirigacha o'qimasligi mumkin.
  const harakat: string[] = [];
  if (s.unanswered > 0) harakat.push(`${s.unanswered} ta mijoz javob kutmoqda`);
  if (s.overdueTasks > 0) harakat.push(`${s.overdueTasks} ta vazifa muddati o'tgan`);
  if (s.flagged > 0) harakat.push(`${s.flagged} ta tahlil ko'rik talab qiladi`);
  if (s.newAlerts > 0) harakat.push(`${s.newAlerts} ta yangi ogohlantirish`);

  if (harakat.length > 0) {
    q.push('');
    q.push('E\'tibor talab qiladi:');
    for (const h of harakat) q.push(`• ${h}`);
  }

  if (s.bestSeat) {
    q.push('');
    q.push(`Eng yaxshi: ${s.bestSeat.name} — ${s.bestSeat.score}%`);
    // Bitta sotuvchi bo'lsa "eng yomon" ham o'zi bo'lardi — ma'nosiz.
    if (s.worstSeat && s.worstSeat.name !== s.bestSeat.name) {
      q.push(`Ko'proq yordam kerak: ${s.worstSeat.name} — ${s.worstSeat.score}%`);
    }
  }

  if (s.weakestCriterion) {
    q.push('');
    q.push(
      `Jamoaning zaif bosqichi: ${s.weakestCriterion.name} (${s.weakestCriterion.code}) — ${s.weakestCriterion.avgScore}/3`,
    );
  }

  return q.join('\n');
}

interface HisobotBiznesi {
  id: string;
  name: string;
  timezone: string;
  reportHour: number;
  reportChatId: string | null;
  /** Bildirishnoma kanallari matritsasi uchun — `business/channels.ts`. */
  telegramTargets: unknown;
  alertPrefs: unknown;
  botTokenEncrypted: Buffer | null;
}

/**
 * Hisobot sozlangan bizneslar. Sozlamalar `integration.config` ichida
 * saqlanadi — shu tufayli yangi migratsiya kerak emas.
 */
async function hisobotBizneslari(): Promise<HisobotBiznesi[]> {
  const rows = await withoutTenantIsolation('kunlik hisobot: bizneslar ro\'yxati', (tx) =>
    tx.execute(sql`
      select
        b.id, b.name, b.timezone,
        coalesce((i.config ->> 'reportHour')::int, 9) as report_hour,
        i.config ->> 'reportChatId'                   as report_chat_id,
        i.config -> 'telegramTargets'                 as telegram_targets,
        b.alert_prefs                                 as alert_prefs,
        i.credentials_encrypted                       as bot_token
      from business b
      join integration i
        on i.business_id = b.id
       and i.kind = 'telegram_bot'
       and i.status = 'connected'
      where b.deleted_at is null
    `),
  );

  return (rows as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    name: String(r.name),
    timezone: String(r.timezone ?? 'Asia/Tashkent'),
    reportHour: Number(r.report_hour ?? 9),
    reportChatId: (r.report_chat_id as string | null) ?? null,
    telegramTargets: r.telegram_targets ?? null,
    alertPrefs: r.alert_prefs ?? null,
    botTokenEncrypted: (r.bot_token as Buffer | null) ?? null,
  }));
}

/**
 * Bitta biznes uchun hisobotni yozadi va (sozlangan bo'lsa) yuboradi.
 *
 * `majburiy = true` bo'lganda soat va takrorlanish tekshiruvlari
 * o'tkazib yuboriladi — "hozir sinov uchun yuborish" tugmasi uchun.
 */
export async function runDailyReportFor(
  biz: HisobotBiznesi,
  now: Date,
  majburiy = false,
): Promise<DailyReportOutcome> {
  const sana = localDate(biz.timezone, now);
  const natija: DailyReportOutcome = { businessId: biz.id, date: sana, sent: false };

  if (!majburiy) {
    if (localHour(biz.timezone, now) !== biz.reportHour) {
      return { ...natija, skipped: 'soati emas' };
    }
    const mavjud = await withoutTenantIsolation('kunlik hisobot: takrorlanishni tekshirish', (tx) =>
      tx.execute(sql`
        select 1 from daily_summary
        where business_id = ${biz.id} and summary_date = ${sana} and seat_id is null
        limit 1
      `),
    );
    if ((mavjud as unknown[]).length > 0) return { ...natija, skipped: 'allaqachon yuborilgan' };
  }

  const stats = await buildDailyStats(biz.id, now);
  const matn = formatDailyReport(biz.name, sana, stats);

  // Yozuv har doim saqlanadi — yuborish muvaffaqiyatsiz bo'lsa ham
  // hisobot interfeysda ko'rinadi va takroriy urinish bo'lmaydi.
  await withoutTenantIsolation('kunlik hisobot: saqlash', (tx) =>
    tx.execute(sql`
      insert into daily_summary (business_id, seat_id, summary_date, content, stats, triggered_by)
      values (${biz.id}, null, ${sana}, ${matn}, ${JSON.stringify(stats)}::jsonb,
              ${majburiy ? 'manual' : 'cron'})
    `),
  );

  /**
   * Manzillar: avval «Bildirishnomalar» matritsasi, keyin ESKI
   * `reportChatId`.
   *
   * Tartib ataylab shunday: matritsa yangi va aniqroq, lekin uni hali
   * sozlamagan bizneslar bor va ularning hisoboti to'xtab qolmasligi
   * kerak. Matritsada biror kanal tanlansa — eski qiymat e'tiborsiz
   * qoladi, aks holda bitta hisobot ikki joyga ketardi.
   */
  const prefs = alertPrefsSchema.parse(biz.alertPrefs ?? {});
  const matritsadan = manzillarniTop(
    prefs.channels,
    telegramTargetsSchema.parse(biz.telegramTargets ?? {}),
    'daily_report',
  );
  const manzillar =
    matritsadan.length > 0 ? matritsadan : biz.reportChatId ? [biz.reportChatId] : [];

  /**
   * Tartib MUHIM: avval manzil, keyin token.
   *
   * Ikkalasi ham yo'q bo'lsa, foydalanuvchiga foydaliroq xabar —
   * "chat id sozlanmagan": token botni ulaganda o'zi paydo bo'ladi,
   * chat id ni esa odam o'zi tanlashi kerak.
   */
  if (manzillar.length === 0) return { ...natija, skipped: 'chat id sozlanmagan' };
  if (!biz.botTokenEncrypted) return { ...natija, skipped: "bot token yo'q" };

  const token = decryptSecret(biz.botTokenEncrypted);
  const xatolar: string[] = [];
  let bittasiKetdi = false;
  for (const chatId of manzillar) {
    const res = await sendTelegramMessage(token, chatId, matn);
    if (res.ok) bittasiKetdi = true;
    else xatolar.push(res.error ?? 'nomalum xato');
  }
  return bittasiKetdi
    ? { ...natija, sent: true }
    : { ...natija, skipped: 'yuborilmadi: ' + xatolar.join('; ') };
}

/** Worker chaqiradigan sikl — soatiga bir marta. */
export async function runDailyReportTick(now = new Date()): Promise<DailyReportOutcome[]> {
  const bizneslar = await hisobotBizneslari();
  const natijalar: DailyReportOutcome[] = [];
  for (const b of bizneslar) {
    try {
      natijalar.push(await runDailyReportFor(b, now));
    } catch (err) {
      natijalar.push({
        businessId: b.id,
        date: localDate(b.timezone, now),
        sent: false,
        skipped: `xato: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }
  return natijalar;
}

/** Bitta biznesni id bo'yicha topib, darhol yuborish (interfeysdagi tugma). */
export async function sendDailyReportNow(businessId: string): Promise<DailyReportOutcome> {
  const hammasi = await hisobotBizneslari();
  const biz = hammasi.find((b) => b.id === businessId);
  if (!biz) {
    return {
      businessId,
      date: localDate('Asia/Tashkent'),
      sent: false,
      skipped: 'Telegram integratsiyasi ulanmagan',
    };
  }
  return runDailyReportFor(biz, new Date(), true);
}
