import { useEffect, useState } from 'react';
import {
  api,
  lidTuri,
  type AlertRow,
  type BusinessAccess,
  type ConversationDetail,
  type ConversationRow,
  type CriterionAgg,
  type Kpi,
  type LeaderboardRow,
  type PlaybookBody,
  type SeatDashboard,
  type SeatRow,
  type TrendPoint,
} from '../../api';
import { tafsilotOl } from '../tafsilotKesh';

/**
 * BOSH SAHIFA MA'LUMOT QATLAMI
 *
 * Faqat MAVJUD backend API'lari ishlatiladi. API bermaydigan ko'rsatkich
 * (masalan yopilgan bitimlar soni) o'ylab topilmaydi — o'rniga haqiqatan
 * hisoblanadigan eng yaqin ko'rsatkich halol nom bilan ko'rsatiladi
 * (issiq lidlar, javob berish darajasi).
 *
 * Ko'p narsa suhbatlar ro'yxatidan hisoblanadi (kunlik issiqlik xaritasi,
 * davomiylik, lid ulushi), shuning uchun ro'yxat `before` kursori bilan
 * sahifalab yuklanadi — cheklov bilan, katta bazada sahifa qotmasin.
 */

export type DavrTuri = 'bugun' | 'hafta' | 'oy' | 'maxsus';

export interface Davr {
  turi: DavrTuri;
  from: Date;
  to: Date;
}

const KUN = 86400_000;

function kunBoshi(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function davrYasash(turi: DavrTuri, maxsus?: { from: string; to: string }): Davr {
  const now = new Date();
  if (turi === 'bugun') return { turi, from: kunBoshi(now), to: now };
  if (turi === 'hafta') return { turi, from: new Date(now.getTime() - 7 * KUN), to: now };
  if (turi === 'oy') return { turi, from: new Date(now.getTime() - 30 * KUN), to: now };
  const from = maxsus ? kunBoshi(new Date(maxsus.from)) : new Date(now.getTime() - 30 * KUN);
  const to = maxsus ? new Date(kunBoshi(new Date(maxsus.to)).getTime() + KUN) : now;
  return { turi, from, to: to > now ? now : to };
}

/** Joriy davr bilan teng uzunlikdagi oldingi davr — KPI solishtiruvi bilan bir xil. */
export function oldingiDavr(d: { from: Date; to: Date }): { from: Date; to: Date } {
  const len = d.to.getTime() - d.from.getTime();
  return { from: new Date(d.from.getTime() - len), to: d.from };
}

/** O'tgan kalendar oy — mukofotlar uchun. */
export function otganOy(): { from: Date; to: Date; nom: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const to = new Date(now.getFullYear(), now.getMonth(), 1);
  const OYLAR = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
  return { from, to, nom: OYLAR[from.getMonth()]! };
}

export function qs(from: Date, to: Date): string {
  return `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}

/** Suhbatlarni `since` gacha sahifalab yuklaydi (ko'pi bilan `maxSahifa` * 100). */
export async function suhbatlarniYukla(biz: string, since: Date, maxSahifa = 10): Promise<ConversationRow[]> {
  const hammasi: ConversationRow[] = [];
  let before: string | null = null;
  for (let i = 0; i < maxSahifa; i++) {
    const url: string = `${biz}/conversations?limit=100${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    const r: { conversations: ConversationRow[]; nextCursor: string | null } = await api.get(url);
    hammasi.push(...r.conversations);
    const oxirgi = r.conversations[r.conversations.length - 1];
    if (!r.nextCursor || !oxirgi || new Date(oxirgi.startedAt) < since) break;
    before = r.nextCursor;
  }
  return hammasi;
}

export interface BoshMalumot {
  kpi: { current: Kpi; previous: Kpi };
  trend: TrendPoint[];
  board: LeaderboardRow[];
  boardOldin: LeaderboardRow[];
  boardOtganOy: LeaderboardRow[];
  criteria: CriterionAgg[];
  /** Joriy va oldingi davr hamda o'tgan oy suhbatlari (filtrlash keyin). */
  suhbatlar: ConversationRow[];
  ogohlar: AlertRow[];
  ogohSoni: number;
  seats: SeatRow[];
  playbook: PlaybookBody | null;
  /** Oxirgi tahlillar tafsiloti — suhbat turi, yo'nalish, xizmat. */
  tafsilotlar: Record<string, ConversationDetail>;
  /** Har sotuvchi bo'yicha davrdagi javobsiz sessiyalar (kabinet API'si). */
  javobsizSeat: Record<string, number>;
  /** Har sotuvchi kabineti (zaif mezon, mezonlar jamoaga nisbatan) — Analitika uchun. */
  seatKabinet: Record<string, SeatDashboard>;
}

export function useBoshMalumot(business: BusinessAccess | null, davr: Davr) {
  const [data, setData] = useState<BoshMalumot | null>(null);
  const [loading, setLoading] = useState(true);
  const [xato, setXato] = useState<string | null>(null);
  /** Qo'lda qayta yuklash — sanoq o'zgarsa effekt qayta ishlaydi. */
  const [yangilash, setYangilash] = useState(0);

  const fromMs = davr.from.getTime();
  const toMs = davr.to.getTime();

  useEffect(() => {
    if (!business) return;
    let bekor = false;
    const biz = `/api/v1/businesses/${business.businessId}`;
    const joriy = { from: new Date(fromMs), to: new Date(toMs) };
    const oldin = oldingiDavr(joriy);
    const oy = otganOy();
    const q = qs(joriy.from, joriy.to);
    const ogohKoradi = business.permissions.includes('alert:read');
    const eng = new Date(Math.min(oldin.from.getTime(), oy.from.getTime()));

    setLoading(true);
    setXato(null);

    void (async () => {
      try {
        const [kpi, trend, board, boardOldin, boardOtganOy, crit, suhbatlar, ogoh, seats, playbook] =
          await Promise.all([
            api.get<{ current: Kpi; previous: Kpi }>(`${biz}/dashboard/kpi${q}`),
            api
              .get<{ points: TrendPoint[] }>(`${biz}/dashboard/trend${q}&granularity=day`)
              .catch(() => ({ points: [] as TrendPoint[] })),
            api.get<{ leaderboard: LeaderboardRow[] }>(`${biz}/dashboard/leaderboard${q}`),
            api
              .get<{ leaderboard: LeaderboardRow[] }>(`${biz}/dashboard/leaderboard${qs(oldin.from, oldin.to)}`)
              .catch(() => ({ leaderboard: [] as LeaderboardRow[] })),
            api
              .get<{ leaderboard: LeaderboardRow[] }>(`${biz}/dashboard/leaderboard${qs(oy.from, oy.to)}`)
              .catch(() => ({ leaderboard: [] as LeaderboardRow[] })),
            api
              .get<{ criteria: CriterionAgg[] }>(`${biz}/dashboard/criteria${q}`)
              .catch(() => ({ criteria: [] as CriterionAgg[] })),
            suhbatlarniYukla(biz, eng).catch(() => [] as ConversationRow[]),
            ogohKoradi
              ? api
                  .get<{ alerts: AlertRow[]; unseenCount: number }>(`${biz}/alerts?limit=20`)
                  .catch(() => ({ alerts: [] as AlertRow[], unseenCount: 0 }))
              : Promise.resolve({ alerts: [] as AlertRow[], unseenCount: 0 }),
            api.get<SeatRow[]>(`${biz}/seats`).catch(() => [] as SeatRow[]),
            api.get<PlaybookBody>(`${biz}/playbook`).catch(() => null),
          ]);

        // Oxirgi 5 ta tahlil tafsiloti (suhbat turi, yo'nalish, davomiylik)
        const songgi = suhbatlar.filter((s) => s.status === 'done').slice(0, 5);
        const tafsilotRoyxat = await Promise.all(
          songgi.map((s) => tafsilotOl(biz, s.id).catch(() => null)),
        );
        const tafsilotlar: Record<string, ConversationDetail> = {};
        tafsilotRoyxat.forEach((t, i) => {
          if (t) tafsilotlar[songgi[i]!.id] = t;
        });

        // Har sotuvchi bo'yicha javobsiz sessiyalar — kabinet API'si (kichik jamoa uchun)
        const javobsizSeat: Record<string, number> = {};
        const seatKabinet: Record<string, SeatDashboard> = {};
        await Promise.all(
          board.leaderboard.slice(0, 12).map(async (r) => {
            const d = await api
              .get<SeatDashboard>(`${biz}/dashboard/seats/${r.seatId}${q}`)
              .catch(() => null);
            if (d) {
              javobsizSeat[r.seatId] = d.current.unansweredSessions;
              seatKabinet[r.seatId] = d;
            }
          }),
        );

        if (bekor) return;
        setData({
          kpi,
          trend: trend.points,
          board: board.leaderboard,
          boardOldin: boardOldin.leaderboard,
          boardOtganOy: boardOtganOy.leaderboard,
          criteria: crit.criteria,
          suhbatlar,
          ogohlar: ogoh.alerts.filter((a) => a.status !== 'resolved'),
          ogohSoni: ogoh.unseenCount,
          seats,
          playbook,
          tafsilotlar,
          javobsizSeat,
          seatKabinet,
        });
      } catch {
        if (!bekor) setXato('Ma\'lumotni yuklab bo\'lmadi. Sahifani yangilab ko\'ring.');
      } finally {
        if (!bekor) setLoading(false);
      }
    })();

    return () => {
      bekor = true;
    };
    // Biznes ID'siga bog'langan: auth konteksti biznes obyektini yangi nusxa
    // bilan almashtirganda ma'lumot qayta yuklanmasin (ortiqcha so'rovlar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.businessId, fromMs, toMs, yangilash]);

  return { data, loading, xato, qaytaYukla: () => setYangilash((n) => n + 1) };
}

// ─── Hisob-kitob yordamchilari ──────────────────────────────────────────────

export function oraliqda(rows: ConversationRow[], from: Date, to: Date): ConversationRow[] {
  const a = from.getTime();
  const b = to.getTime();
  return rows.filter((r) => {
    const t = new Date(r.startedAt).getTime();
    return t >= a && t < b;
  });
}

export function ball(r: ConversationRow): number | null {
  return r.overallScore === null ? null : Number(r.overallScore);
}

export function ortacha(nums: number[]): number | null {
  return nums.length === 0 ? null : nums.reduce((s, n) => s + n, 0) / nums.length;
}

/** Issiq / iliq / sovuq lidlar soni. */
export function lidHisobi(rows: ConversationRow[]) {
  let hot = 0;
  let warm = 0;
  let cold = 0;
  for (const r of rows) {
    const t = lidTuri(r.leadQuality);
    if (t === 'hot') hot++;
    else if (t === 'warm') warm++;
    else if (t === 'cold') cold++;
  }
  return { hot, warm, cold, baholangan: hot + warm + cold };
}

/** Sessiya davomiyligi (soniya) — boshlanish va oxirgi xabar orasi. */
export function davomiylik(r: ConversationRow): number | null {
  if (!r.endedAt) return null;
  const s = (new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 1000;
  return s > 0 ? s : null;
}

export function foiz(qism: number, jami: number): number | null {
  return jami > 0 ? (qism / jami) * 100 : null;
}

/** "3 oy oldin", "5 daq oldin" — nisbiy vaqt. */
export function qachon(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return 'hozirgina';
  if (s < 3600) return `${Math.floor(s / 60)} daq oldin`;
  if (s < 86400) return `${Math.floor(s / 3600)} soat oldin`;
  if (s < 30 * 86400) return `${Math.floor(s / 86400)} kun oldin`;
  if (s < 365 * 86400) return `${Math.floor(s / (30 * 86400))} oy oldin`;
  return `${Math.floor(s / (365 * 86400))} yil oldin`;
}

/** "1:28" — daqiqa:soniya; uzun bo'lsa "2 soat 5 daq". */
export function davomiylikMatn(s: number | null): string {
  if (s === null) return '—';
  // 10 daqiqadan uzun "16:00" soat vaqtiga o'xshab qoladi — so'z bilan yoziladi.
  if (s >= 600 && s < 3600) return `${Math.round(s / 60)} daq`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const ss = Math.round(s % 60);
    return `${m}:${String(ss).padStart(2, '0')}`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m > 0 ? `${h} soat ${m} daq` : `${h} soat`;
}

/** Ism → bosh harflar ("Malika Karimova" → "MK"). */
export function boshHarf(ism: string | null | undefined): string {
  const q = (ism ?? '').trim().split(/\s+/).filter(Boolean);
  if (q.length === 0) return '?';
  return ((q[0]![0] ?? '') + (q[1]?.[0] ?? q[0]![1] ?? '')).toUpperCase();
}

/** Ism bo'yicha barqaror avatar rangi (har safar bir xil). */
const AVATAR_RANGLAR = ['#d98b4b', '#3fae7a', '#5b7be0', '#b06ad6', '#d1606f', '#2fa3b5'];
export function avatarRang(kalit: string): string {
  let h = 0;
  for (const c of kalit) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_RANGLAR[h % AVATAR_RANGLAR.length]!;
}
