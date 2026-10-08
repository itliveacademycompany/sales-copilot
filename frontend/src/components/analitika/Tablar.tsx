import {
  CircleCheck,
  Download,
  Flame,
  Gauge,
  ListChecks,
  MessageSquareX,
  MessagesSquare,
  Percent,
  Timer,
} from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ballRang, fmtSoniya, type ConversationRow } from '../../api';
import { BiznesPulsi, Farq, MalumotIkon, korsatkichlar } from '../bosh/Korsatkichlar';
import {
  avatarRang,
  ball,
  boshHarf,
  davomiylik,
  davomiylikMatn,
  foiz,
  lidHisobi,
  oraliqda,
  ortacha,
  type BoshMalumot,
  type Davr,
} from '../bosh/malumot';
import { csvYukla } from '../qongiroq/eksport';
import { ChiziqliGrafik, Donut, type Bolak as DonutBolak } from './grafiklar';
import { bolakda, bolaklar, useAnalitikaQoshimcha } from './qoshimcha';

/**
 * Analitika bo'limlari. Har biri bitta savolga javob beradi:
 *   Umumiy ko'rinish    — biznes qanday ketyapti, nima o'zgardi?
 *   Sifat nazorati      — suhbatlar qayerda ball yo'qotyapti?
 *   Jamoa malakasi      — kimga qaysi bosqichda yordam kerak?
 *   Vazifalar tahlili   — va'dalar bajarilyaptimi?
 *   Mijoz tahlili       — mijozlar kim va nimaga to'xtab qolyapti?
 *   Faoliyat tahlili    — jamoa qachon va qancha ishlayapti?
 *   Lid analitikasi     — lid sifati qanday o'zgaryapti?
 *
 * Faqat mavjud API'lardan haqiqatan hisoblanadigan raqamlar — yopilgan
 * bitimlar kabi backend bermaydigan ko'rsatkich o'ylab topilmaydi.
 */

export type Qoshimcha = ReturnType<typeof useAnalitikaQoshimcha>;
export interface TabProps {
  data: BoshMalumot;
  davr: Davr;
  q: Qoshimcha;
  /** Ma'lumotni serverdan qayta yuklash (AI tavsiyasini yangilash). */
  qaytaYukla?: () => void;
  yuklanmoqda?: boolean;
}

const SOHA: Record<string, string> = {
  sales: 'Sotuv suhbati',
  support: 'Qo\'llab-quvvatlash',
  internal: 'Ichki',
  spam: 'Spam',
  other: 'Boshqa',
};
const SERIYA = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)'];

const yaxlit = (v: number | null, n = 1) => (v === null ? null : Math.round(v * 10 ** n) / 10 ** n);

function useJoriy(data: BoshMalumot, davr: Davr) {
  return useMemo(() => oraliqda(data.suhbatlar, davr.from, davr.to), [data.suhbatlar, davr]);
}

// ─── Umumiy qurilish bloklari ───────────────────────────────────────────────

function Karta({ sarlavha, izoh, amal, children, className = '' }: {
  sarlavha: string;
  izoh?: string;
  amal?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card an-karta ${className}`}>
      <div className="karta-bosh">
        <h2>
          {sarlavha} {izoh && <MalumotIkon matn={izoh} />}
        </h2>
        {amal}
      </div>
      {children}
    </section>
  );
}

function KpiKarta({ ikon, nom, izoh, qiymat, farq, rang }: {
  ikon: ReactNode;
  nom: string;
  izoh: string;
  qiymat: string;
  farq?: ReactNode;
  rang?: string;
}) {
  return (
    <div className="an-kpi">
      <div className="an-kpi-bosh">
        <span className="an-kpi-ikon" aria-hidden="true">
          {ikon}
        </span>
        {farq}
      </div>
      <div className="an-kpi-qiymat" style={rang ? { color: rang } : undefined}>
        {qiymat}
      </div>
      <div className="an-kpi-nom">
        {nom} <MalumotIkon matn={izoh} />
      </div>
    </div>
  );
}

function Bosh({ matn }: { matn: string }) {
  return <div className="hech-narsa an-bosh-holat">{matn}</div>;
}

function TafsilotEslatma({ q }: { q: Qoshimcha }) {
  if (q.tafsilotKutilmoqda === 0) return null;
  return <div className="an-eslatma">Tahlil tafsilotlari yuklanmoqda — yana {q.tafsilotKutilmoqda} ta…</div>;
}

/** Sotuvchilar bo'yicha joriy davr hisobi — bir nechta bo'limda kerak. */
function sotuvchiHisobi(data: BoshMalumot, joriy: ConversationRow[]) {
  return data.board.map((r) => {
    const uniki = joriy.filter((c) => c.seatId === r.seatId);
    const tahlil = uniki.filter((c) => c.status === 'done');
    const lid = lidHisobi(tahlil);
    return {
      ...r,
      jamiSuhbat: uniki.length,
      lid,
      ulush: foiz(lid.hot, tahlil.length),
      davom: ortacha(tahlil.map(davomiylik).filter((v): v is number => v !== null)),
      javobsiz: data.javobsizSeat[r.seatId] ?? null,
    };
  });
}

// ═══ 1. UMUMIY KO'RINISH ════════════════════════════════════════════════════

export function UmumiyKorinish({ data, davr, q }: TabProps) {
  const joriy = useJoriy(data, davr);
  const k = korsatkichlar(data, davr);
  const { c, p } = k;
  const { royxat } = bolaklar(davr);
  const tahlil = joriy.filter((r) => r.status === 'done');

  const sifatTrend = royxat.map((b) => {
    const ichi = bolakda(tahlil, b);
    const v = ortacha(ichi.map(ball).filter((x): x is number => x !== null));
    return { nom: b.nom, qiymat: v, izoh: `${ichi.length} ta tahlil` };
  });
  const ulushTrend = royxat.map((b) => {
    const ichi = bolakda(tahlil, b);
    return { nom: b.nom, qiymat: foiz(lidHisobi(ichi).hot, ichi.length), izoh: `${ichi.length} ta tahlil` };
  });

  const natija: Record<string, number> = {};
  for (const r of tahlil) {
    const s = q.tafsilot[r.id]?.analysis?.businessRelevance;
    if (s) natija[s] = (natija[s] ?? 0) + 1;
  }
  const filtrlangan = joriy.filter((r) => r.status === 'filtered').length;
  const donut: DonutBolak[] = [
    ...['sales', 'support', 'internal', 'spam', 'other'].map((s, i) => ({
      kalit: s,
      nom: SOHA[s]!,
      qiymat: natija[s] ?? 0,
      rang: SERIYA[i]!,
    })),
    { kalit: 'filtered', nom: 'Filtrlangan', qiymat: filtrlangan, rang: SERIYA[5]! },
  ];

  const vazifaJami = q.vazifaStat?.total ?? q.vazifalar?.length ?? null;
  const bajarilish = q.vazifaStat?.completionRatePct ?? null;
  const dSifat = c.avgScore !== null && p.avgScore !== null ? c.avgScore - p.avgScore : null;

  return (
    <div className="an-bolim">
      <BiznesPulsi data={data} davr={davr} dinamik />

      <div className="an-kpi-grid">
        <KpiKarta ikon={<Flame />} nom="Issiq lidlar" izoh="AI issiq deb baholagan, yopilishga eng yaqin mijozlar" qiymat={String(k.lid.hot)} farq={<Farq d={k.lid.hot - k.lidOldin.hot} aniqlik={0} />} />
        <KpiKarta ikon={<MessagesSquare />} nom="Suhbatlar" izoh="Davrdagi barcha suhbatlar (filtrlanganlar bilan)" qiymat={String(c.conversations)} farq={<Farq d={c.conversations - p.conversations} aniqlik={0} />} />
        <KpiKarta ikon={<Percent />} nom="Issiq lid ulushi" izoh="Tahlil qilingan suhbatlarning issiq lid bilan tugagan ulushi" qiymat={k.issiqUlush === null ? '—' : `${k.issiqUlush.toFixed(2)}%`} farq={<Farq d={k.issiqUlush !== null && k.issiqUlushOldin !== null ? k.issiqUlush - k.issiqUlushOldin : null} birlik="%" />} />
        <KpiKarta ikon={<Timer />} nom="Javob tezligi" izoh="Mijozning birinchi xabariga javob vaqti (median). Kamaygani yaxshi" qiymat={fmtSoniya(c.medianFirstResponseSeconds)} farq={<Farq d={c.medianFirstResponseSeconds !== null && p.medianFirstResponseSeconds !== null ? (c.medianFirstResponseSeconds - p.medianFirstResponseSeconds) / 60 : null} teskari birlik=" daq" />} />
        <KpiKarta ikon={<Gauge />} nom="Suhbat sifati" izoh="Baholash mezonlari bo'yicha o'rtacha ball" qiymat={c.avgScore === null ? '—' : `${c.avgScore}%`} rang={ballRang(c.avgScore)} farq={<Farq d={dSifat} birlik="%" />} />
        <KpiKarta ikon={<MessageSquareX />} nom="Javobsiz mijozlar" izoh="Mijoz yozgan, lekin javob olmagan sessiyalar. Kamaygani yaxshi" qiymat={String(c.unansweredSessions)} rang={c.unansweredSessions > 0 ? 'var(--past)' : undefined} farq={<Farq d={c.unansweredSessions - p.unansweredSessions} teskari aniqlik={0} />} />
        <KpiKarta ikon={<ListChecks />} nom="Vazifalar" izoh="Suhbatlardagi va'dalardan yaratilgan va qo'lda qo'shilgan vazifalar" qiymat={vazifaJami === null ? '—' : String(vazifaJami)} />
        <KpiKarta ikon={<CircleCheck />} nom="Bajarilishi" izoh="Vazifalarning bajarilgan ulushi" qiymat={bajarilish === null ? '—' : `${Math.round(bajarilish)}%`} />
      </div>

      <div className="an-grid-2">
        <Karta sarlavha="Sifat va konversiya trendi" izoh="Ikki xil o'lchov — shuning uchun ikki alohida grafik, umumiy vaqt o'qi bilan">
          <div className="an-trend-qism">
            <span className="an-trend-nom">
              <i className="g-belgi" style={{ background: 'var(--s1)' }} /> Suhbat sifati, %
            </span>
            <ChiziqliGrafik nuqtalar={sifatTrend} birlik="%" yMax={100} rang="var(--s1)" balandlik={170} nom="Suhbat sifati" />
          </div>
          <div className="an-trend-qism">
            <span className="an-trend-nom">
              <i className="g-belgi" style={{ background: 'var(--s3)' }} /> Issiq lid ulushi, %
            </span>
            <ChiziqliGrafik nuqtalar={ulushTrend} birlik="%" yMax={100} rang="var(--s3)" balandlik={170} nom="Issiq lid ulushi" />
          </div>
        </Karta>
        <Karta sarlavha="Suhbat natijalari" izoh="Tahlil qilingan suhbatlar qaysi turga tegishli (AI tasnifi) va filtrlanganlar">
          <Donut bolaklar={donut} markazNom="Suhbatlar" saralash />
          <TafsilotEslatma q={q} />
        </Karta>
      </div>

      <ReytingJadvali data={data} joriy={joriy} davr={davr} />
    </div>
  );
}

function ReytingJadvali({ data, joriy, davr }: { data: BoshMalumot; joriy: ConversationRow[]; davr: Davr }) {
  const [rejim, setRejim] = useState<'natija' | 'sifat'>('natija');
  const qatorlar = sotuvchiHisobi(data, joriy).sort((a, b) =>
    rejim === 'natija'
      ? b.lid.hot - a.lid.hot || (b.avgScore ?? 0) - (a.avgScore ?? 0)
      : (b.avgScore ?? -1) - (a.avgScore ?? -1),
  );

  const eksport = () =>
    csvYukla(
      `menejerlar_reytingi_${davr.from.toISOString().slice(0, 10)}`,
      ['O\'rin', 'Menejer', 'Suhbatlar', 'Issiq lidlar', 'Issiq lid ulushi (%)', 'Suhbat sifati (%)', 'O\'rt. davomiylik', 'Javob tezligi'],
      qatorlar.map((r, i) => [
        i + 1,
        r.displayName,
        r.jamiSuhbat,
        r.lid.hot,
        r.ulush === null ? null : yaxlit(r.ulush, 2),
        r.avgScore,
        davomiylikMatn(r.davom),
        fmtSoniya(r.medianFirstResponseSeconds),
      ]),
    );

  return (
    <Karta
      sarlavha="Menejerlar reytingi"
      izoh="Natija — issiq lidlar soni bo'yicha; Sifat — suhbat sifati bo'yicha"
      amal={
        <div className="an-amallar">
          <div className="tab-qator">
            <button className={`tab${rejim === 'natija' ? ' active' : ''}`} onClick={() => setRejim('natija')}>
              Natija
            </button>
            <button className={`tab${rejim === 'sifat' ? ' active' : ''}`} onClick={() => setRejim('sifat')}>
              Sifat
            </button>
          </div>
          <button className="btn ikkinchi kichik" onClick={eksport} disabled={qatorlar.length === 0}>
            <Download /> CSV
          </button>
        </div>
      }
    >
      <p className="an-izoh-matn">
        {rejim === 'natija' ? 'Issiq lidlar soni bo\'yicha reyting.' : 'Suhbat sifati bo\'yicha reyting.'} Ma'lumot
        tanlangan davr bo'yicha.
      </p>
      {qatorlar.length === 0 ? (
        <Bosh matn="Bu davrda menejerlar faoliyati yo'q" />
      ) : (
        <table className="jadval an-jadval">
          <thead>
            <tr>
              <th>Menejer</th>
              <th>Issiq lidlar</th>
              <th>Issiq lid ulushi</th>
              <th>Suhbat sifati</th>
              <th>O'rt. davomiylik</th>
              <th>Javob tezligi</th>
            </tr>
          </thead>
          <tbody>
            {qatorlar.map((r, i) => (
              <tr key={r.seatId}>
                <td>
                  <span className="an-menejer">
                    <span className="an-orin">{i + 1}</span>
                    <span className="q-avatar" style={{ background: avatarRang(r.displayName) }}>
                      {boshHarf(r.displayName)}
                    </span>
                    <Link to={`/sotuvchi/${r.seatId}`}>{r.displayName}</Link>
                  </span>
                </td>
                <td className="an-son">{r.lid.hot}</td>
                <td className="an-son">{r.ulush === null ? '—' : `${r.ulush.toFixed(2)}%`}</td>
                <td>
                  <span className="an-chiziq-qator">
                    <span className="an-chiziq">
                      <span style={{ width: `${r.avgScore ?? 0}%`, background: ballRang(r.avgScore) }} />
                    </span>
                    <b>{r.avgScore === null ? '—' : `${r.avgScore}%`}</b>
                  </span>
                </td>
                <td className="an-son">{davomiylikMatn(r.davom)}</td>
                <td className="an-son">{fmtSoniya(r.medianFirstResponseSeconds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Karta>
  );
}

// ═══ 2. SIFAT NAZORATI ══════════════════════════════════════════════════════

export { SifatNazorati } from './SifatNazorati';

// ═══ 3. JAMOA MALAKASINI OSHIRISH ═══════════════════════════════════════════

export { JamoaMalakasi } from './JamoaMalakasi';

// ═══ 4. VAZIFALAR TAHLILI ═══════════════════════════════════════════════════

export { VazifalarTahlili } from './VazifalarTahlili';

// ═══ 5. MIJOZ TAHLILI ═══════════════════════════════════════════════════════

export { MijozTahlili } from './MijozTahlili';

// ═══ 6. FAOLIYAT TAHLILI ════════════════════════════════════════════════════

export { FaoliyatTahlili } from './FaoliyatTahlili';

// ═══ 7. LID ANALITIKASI ═════════════════════════════════════════════════════

export { LidAnalitikasi } from './LidAnalitikasi';
