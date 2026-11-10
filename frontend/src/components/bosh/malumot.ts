import { useEffect, useState } from 'react';
import {
  api,
  lidTuri,
  type AlertRow,
  type BusinessAccess,
  type ConversationRow,
  type CriterionAgg,
  type Kpi,
  type LeaderboardRow,
  type PlaybookBody,
  type SeatRow,
  type TrendPoint,
} from '../../api';
import { tarjima } from '../../i18n';

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
  return { from, to, nom: tarjima(OYLAR[from.getMonth()]!) };
}

export function qs(from: Date, to: Date): string {
  return `?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`;
}

/**
 * Suhbatlarni `since` gacha sahifalab yuklaydi (ko'pi bilan `maxSahifa` * 2000).
 * `since` serverga ham beriladi — davrdan eski qatorlar umuman kelmaydi.
 *
 * Tezlik: sahifalar kursor bilan KETMA-KET keladi, har biri serverga bitta
 * aylanma yo'l. Ilgari 500 talik sahifa 60 kunlik davrda 6+ so'rov bo'lardi
 * va har qatorda transkript bo'laklari sanalardi — bosh sahifa shuni kutib
 * qolardi. Endi 2000 talik sahifa va `lite=1` (bo'laklar sanalmaydi —
 * bu sahifalar `segmentCount` ishlatmaydi). `kanal` berilsa, boshqa kanal
 * qatorlari serverdan umuman kelmaydi.
 */
export async function suhbatlarniYukla(
  biz: string,
  since: Date,
  maxSahifa = 10,
  kanal?: 'phone' | 'telegram',
): Promise<ConversationRow[]> {
  const hammasi: ConversationRow[] = [];
  let before: string | null = null;
  const dan = `&lite=1&since=${encodeURIComponent(since.toISOString())}${kanal ? `&channel=${kanal}` : ''}`;
  for (let i = 0; i < maxSahifa; i++) {
    const url: string = `${biz}/conversations?limit=2000${dan}${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    const r: { conversations: ConversationRow[]; nextCursor: string | null } = await api.get(url);
    hammasi.push(...r.conversations);
    const oxirgi = r.conversations[r.conversations.length - 1];
    if (!r.nextCursor || !oxirgi || new Date(oxirgi.startedAt) < since) break;
    before = r.nextCursor;
  }
  return hammasi;
}

/** `GET …/conversations/compact` javobi (backend `http/routes/suhbat-royxati.ts`). */
interface IxchamJavob {
  v: number;
  kesildi: boolean;
  lugat: Record<'seat' | 'status' | 'lead' | 'oila' | 'xizmat' | 'soha' | 'yonalish' | 'kanal', string[]> & { rejim?: string[] };
  /** [id, boshlanish(s), tugash(s)|null, seat, holat, lid, ball|null, davomiylik|null, oila, xizmat, soha, yo'nalish, kanal, bayroq, baholash rejimi?] */
  rows: [string, number, number | null, number, number, number, number | null, number | null, number, number, number, number, number, 0 | 1, number?][];
  /** id → [xulosa, eng zaif joy] — faqat oxirgi tahlillar uchun. */
  matnlar: Record<string, [string | null, string | null]>;
}

/**
 * Bosh sahifa uchun suhbatlar — BITTA so'rovda, ixcham shaklda.
 *
 * Ilgari 60 kunlik barcha suhbatlar to'liq qatorlar bilan (har birida xulosa
 * matni) 2000 talik sahifalab ketma-ket yuklanardi: ~3 MB va 2+ so'rov. Bosh
 * sahifa hisob-kitobiga matn kerak emas — u faqat "So'nggi tahlillar" va
 * tepa qidiruvda, shuning uchun server matnni oxirgi 100 ta tahlilga beradi.
 * Natija odatdagi `ConversationRow` — bo'limlar kodi o'zgarmaydi.
 */
export async function ixchamYukla(biz: string, since: Date): Promise<{ rows: ConversationRow[]; kesildi: boolean }> {
  const j = await api.get<IxchamJavob>(`${biz}/conversations/compact?since=${encodeURIComponent(since.toISOString())}`);
  const L = j.lugat;
  const ol = (lug: string[], i: number) => (i < 0 ? null : (lug[i] ?? null));
  const iso = (s: number | null) => (s === null ? null : new Date(s * 1000).toISOString());
  const rows = j.rows.map(([id, s, e, seat, holat, lid, ball, davom, oila, xizmat, soha, yonalish, kanal, bayroq, rejim]): ConversationRow => {
    const matn = j.matnlar[id];
    return {
      id,
      channel: ol(L.kanal, kanal) ?? 'telegram',
      direction: ol(L.yonalish, yonalish) ?? 'na',
      seatId: ol(L.seat, seat),
      startedAt: iso(s)!,
      endedAt: iso(e),
      status: ol(L.status, holat) ?? 'received',
      excludedReason: null,
      language: null,
      overallScore: ball === null ? null : String(ball),
      leadQuality: ol(L.lead, lid),
      primaryGap: matn?.[1] ?? null,
      summary: matn?.[0] ?? null,
      isFlagged: bayroq === 1,
      scoringMode: rejim === undefined ? null : ol(L.rejim ?? [], rejim),
      callFamily: ol(L.oila, oila),
      serviceLine: ol(L.xizmat, xizmat),
      businessRelevance: ol(L.soha, soha),
      phoneFrom: null,
      phoneTo: null,
      durationSeconds: davom,
      contactName: null,
      segmentCount: 0,
    };
  });
  return { rows, kesildi: j.kesildi };
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
  /** Har sotuvchi bo'yicha davrdagi javobsiz sessiyalar (reyting API'sidan). */
  javobsizSeat: Record<string, number>;
}

/**
 * `ixcham` — suhbatlar `ixchamYukla` orqali (bitta yengil so'rov). Bosh sahifa,
 * Analitika va kunlik hisobot shu rejimda: ularga kerakli matn va telefonlar
 * tahlil tafsilotidan (`useAnalitikaQoshimcha`) olinadi, ro'yxatdan emas.
 */
export function useBoshMalumot(business: BusinessAccess | null, davr: Davr, opts: { ixcham?: boolean } = {}) {
  const ixcham = opts.ixcham ?? false;
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
            // Xato YUTILMAYDI: ilgari bo'sh ro'yxat qo'yilardi va sahifa "0 issiq lid",
            // bo'sh issiqlik xaritasi kabi NOTO'G'RI raqamlarni chizardi (serverda 269 ta
            // bo'lganda ham). Pulsdan so'nggi tahlillargacha hammasi shu ro'yxatdan
            // hisoblanadi — u bo'lmasa, xato va "Qayta urinish" ko'rsatilgani to'g'ri.
            ixcham ? ixchamYukla(biz, eng).then((r) => r.rows) : suhbatlarniYukla(biz, eng),
            ogohKoradi
              ? api
                  .get<{ alerts: AlertRow[]; unseenCount: number }>(`${biz}/alerts?limit=20`)
                  .catch(() => ({ alerts: [] as AlertRow[], unseenCount: 0 }))
              : Promise.resolve({ alerts: [] as AlertRow[], unseenCount: 0 }),
            api.get<SeatRow[]>(`${biz}/seats`).catch(() => [] as SeatRow[]),
            api.get<PlaybookBody>(`${biz}/playbook`).catch(() => null),
          ]);

        // Ilgari bu yerda ikkinchi to'lqin bor edi: 5 ta to'liq suhbat
        // tafsiloti (transkript bilan) va 12 tagacha sotuvchi kabineti —
        // hammasi suhbatlar ro'yxatini kutib, keyin boshlanardi. Kerakli
        // maydonlar (suhbat turi, yo'nalish, xizmat, javobsizlar) endi ro'yxat
        // va reyting javobida keladi.
        const javobsizSeat: Record<string, number> = {};
        for (const r of board.leaderboard) javobsizSeat[r.seatId] = r.unansweredSessions ?? 0;

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
          javobsizSeat,
        });
      } catch {
        if (!bekor) setXato(tarjima("Ma'lumotni yuklab bo'lmadi. Sahifani yangilab ko'ring."));
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
  }, [business?.businessId, fromMs, toMs, yangilash, ixcham]);

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
  if (s < 60) return tarjima('hozirgina');
  if (s < 3600) return tarjima('{n} daq oldin', { n: Math.floor(s / 60) });
  if (s < 86400) return tarjima('{n} soat oldin', { n: Math.floor(s / 3600) });
  if (s < 30 * 86400) return tarjima('{n} kun oldin', { n: Math.floor(s / 86400) });
  if (s < 365 * 86400) return tarjima('{n} oy oldin', { n: Math.floor(s / (30 * 86400)) });
  return tarjima('{n} yil oldin', { n: Math.floor(s / (365 * 86400)) });
}

/** "1:28" — daqiqa:soniya; uzun bo'lsa "2 soat 5 daq". */
export function davomiylikMatn(s: number | null): string {
  if (s === null) return '—';
  // 10 daqiqadan uzun "16:00" soat vaqtiga o'xshab qoladi — so'z bilan yoziladi.
  if (s >= 600 && s < 3600) return tarjima('{m} daq', { m: Math.round(s / 60) });
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const ss = Math.round(s % 60);
    return `${m}:${String(ss).padStart(2, '0')}`;
  }
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return m > 0 ? tarjima('{h} soat {m} daq', { h, m }) : tarjima('{h} soat', { h });
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
