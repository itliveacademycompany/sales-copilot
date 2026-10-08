import { ArrowDownRight, ArrowUpRight, ChevronDown, Info, Minus, Sparkles, TriangleAlert } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { fmtSoniya, type Kpi } from '../../api';
import {
  davomiylik,
  davomiylikMatn,
  foiz,
  lidHisobi,
  oldingiDavr,
  oraliqda,
  ortacha,
  type BoshMalumot,
  type Davr,
} from './malumot';
import { Sparkline } from './Sparkline';
import { sanaOraliq } from './TepaPanel';

// ─── Kichik qurilish bloklari ───────────────────────────────────────────────

export function MalumotIkon({ matn }: { matn: string }) {
  return (
    <span className="malumot-ikon" title={matn} aria-label={matn} role="img">
      <Info />
    </span>
  );
}

/** Oldingi davrga nisbatan o'zgarish chipi. `teskari` — kamaygani yaxshi. */
export function Farq({
  d,
  teskari = false,
  birlik = '',
  aniqlik = 1,
}: {
  d: number | null;
  teskari?: boolean;
  birlik?: string;
  aniqlik?: number;
}) {
  if (d === null || Number.isNaN(d)) return null;
  const k = 10 ** aniqlik;
  const r = Math.round(d * k) / k;
  if (r === 0) {
    return (
      <span className="farq tekis">
        <Minus /> 0{birlik}
      </span>
    );
  }
  const yaxshi = teskari ? r < 0 : r > 0;
  return (
    <span className={`farq ${yaxshi ? 'yaxshi' : 'yomon'}`}>
      {r > 0 ? <ArrowUpRight /> : <ArrowDownRight />}
      {r > 0 ? '+' : ''}
      {r}
      {birlik}
    </span>
  );
}

const ayir = (a: number | null, b: number | null) => (a === null || b === null ? null : a - b);
const yaxlit = (v: number | null, n = 1) => (v === null ? null : Math.round(v * 10 ** n) / 10 ** n);

/** Javob berish darajasi: tahlil qilinganlarning javobsiz qolmagan ulushi. */
function javobDarajasi(k: Kpi): number | null {
  return k.analyzed > 0 ? ((k.analyzed - k.unansweredSessions) / k.analyzed) * 100 : null;
}

// ─── Hisob-kitob — ikkala bo'lim uchun umumiy ───────────────────────────────

export function korsatkichlar(data: BoshMalumot, davr: Davr) {
  const oldin = oldingiDavr(davr);
  const joriyRows = oraliqda(data.suhbatlar, davr.from, davr.to).filter((r) => r.status === 'done');
  const oldinRows = oraliqda(data.suhbatlar, oldin.from, oldin.to).filter((r) => r.status === 'done');
  const lid = lidHisobi(joriyRows);
  const lidOldin = lidHisobi(oldinRows);
  const c = data.kpi.current;
  const p = data.kpi.previous;

  const issiqUlush = foiz(lid.hot, joriyRows.length);
  const issiqUlushOldin = foiz(lidOldin.hot, oldinRows.length);
  const lidSifati = foiz(lid.hot + lid.warm, lid.baholangan);
  const javob = javobDarajasi(c);
  const javobOldin = javobDarajasi(p);
  const ortDavom = ortacha(joriyRows.map(davomiylik).filter((v): v is number => v !== null));

  return {
    c,
    p,
    joriyRows,
    lid,
    lidOldin,
    issiqUlush,
    issiqUlushOldin,
    lidSifati,
    javob,
    javobOldin,
    ortDavom,
  };
}

// ─── BIZNES PULSI ───────────────────────────────────────────────────────────

type Holat = { nom: string; klass: 'barqaror' | 'osish' | 'etibor' | 'yoq' };

interface Pasayish {
  kalit: 'javob' | 'sifat' | 'ulush' | 'issiq';
  nom: string;
  qiymat: string;
  oldin: string;
  d: number;
  /** Shu ko'rsatkich uchun "sezilarli" pasayish chegarasi (manfiy). */
  chegara: number;
  birlik: string;
}

/**
 * Biznes pulsi. `dinamik` rejimida (Analitika) asosiy raqam o'rniga eng
 * ko'p YOMONLASHGAN ko'rsatkich chiqadi — rahbar birinchi bo'lib muammoni
 * ko'rsin. Sezilarli pasayish bo'lmasa — odatiy ko'rinish (issiq lidlar).
 */
export function BiznesPulsi({ data, davr, dinamik = false }: { data: BoshMalumot; davr: Davr; dinamik?: boolean }) {
  const navigate = useNavigate();
  const [ochiq, setOchiq] = useState(false);
  const k = korsatkichlar(data, davr);
  const { c, p } = k;

  const dSifat = ayir(c.avgScore, p.avgScore);
  const dJavob = ayir(k.javob, k.javobOldin);
  const dUlush = ayir(k.issiqUlush, k.issiqUlushOldin);

  const nomzodlar: Pasayish[] = [];
  if (dJavob !== null)
    nomzodlar.push({ kalit: 'javob', nom: 'Javob berish darajasi', qiymat: `${yaxlit(k.javob)}%`, oldin: `${yaxlit(k.javobOldin)}%`, d: dJavob, chegara: -5, birlik: '' });
  if (dSifat !== null)
    nomzodlar.push({ kalit: 'sifat', nom: 'Suhbat sifati', qiymat: String(c.avgScore), oldin: String(p.avgScore), d: dSifat, chegara: -3, birlik: '' });
  if (dUlush !== null)
    nomzodlar.push({ kalit: 'ulush', nom: 'Issiq lid ulushi', qiymat: `${yaxlit(k.issiqUlush)}%`, oldin: `${yaxlit(k.issiqUlushOldin)}%`, d: dUlush, chegara: -5, birlik: '' });
  if (k.lidOldin.hot > 0)
    nomzodlar.push({
      kalit: 'issiq',
      nom: 'Issiq lidlar',
      qiymat: String(k.lid.hot),
      oldin: String(k.lidOldin.hot),
      d: k.lid.hot - k.lidOldin.hot,
      chegara: -Math.max(1, Math.ceil(k.lidOldin.hot * 0.3)),
      birlik: '',
    });
  const eng = dinamik
    ? nomzodlar
        .map((n) => ({ ...n, kuch: n.d / n.chegara }))
        .filter((n) => n.kuch >= 1)
        .sort((a, b) => b.kuch - a.kuch)[0]
    : undefined;

  const holat: Holat = eng
    ? { nom: `${eng.nom} pasaydi`, klass: 'etibor' }
    :
    c.conversations === 0
      ? { nom: 'Ma\'lumot yo\'q', klass: 'yoq' }
      : (dSifat !== null && dSifat <= -5) || (dJavob !== null && dJavob <= -10)
        ? { nom: 'E\'tibor talab', klass: 'etibor' }
        : dSifat !== null && dSifat >= 5
          ? { nom: 'O\'sishda', klass: 'osish' }
          : { nom: 'Barqaror', klass: 'barqaror' };

  const sifatMatn = c.avgScore === null ? '—' : String(c.avgScore);
  const javobMatn = k.javob === null ? '—' : `${yaxlit(k.javob)}%`;

  const xulosa = eng
    ? `${eng.nom} ${eng.qiymat}, o'tgan davrda ${eng.oldin} edi (${yaxlit(eng.d)}).`
    : holat.klass === 'yoq'
      ? 'Bu davrda suhbat bo\'lmadi — davrni kengaytirib ko\'ring.'
      : holat.klass === 'etibor'
        ? dSifat !== null && dSifat <= -5
          ? `Suhbat sifati ${Math.abs(yaxlit(dSifat)!)} ballga pasaydi: ${p.avgScore} → ${sifatMatn}.`
          : `Javob berish darajasi ${Math.abs(yaxlit(dJavob)!)} foizga tushdi: hozir ${javobMatn}.`
        : holat.klass === 'osish'
          ? `Suhbat sifati ${yaxlit(dSifat)} ballga oshdi: ${p.avgScore} → ${sifatMatn}.`
          : `Keskin o'zgarish yo'q: issiq lidlar ${k.lid.hot}, javob darajasi ${javobMatn}, sifat ${sifatMatn}.`;

  const zaif = [...data.criteria]
    .filter((m) => m.scored > 0 && m.avgPct !== null)
    .sort((a, b) => (a.avgPct ?? 0) - (b.avgPct ?? 0))[0];
  // Pasaygan ko'rsatkichga mos aniq qadam va tegishli bo'limga yo'l
  const engTavsiya: Record<Pasayish['kalit'], { matn: string; tugma: string; yol: string }> = {
    javob: {
      matn: `Javobsiz qolgan mijozlarni tekshiring: ${c.unansweredSessions} ta sessiyada xabar javobsiz qolgan.`,
      tugma: 'Ogohlantirishlar',
      yol: '/ogohlantirishlar',
    },
    sifat: {
      matn: zaif
        ? `Eng zaif bosqich — «${zaif.name}» (${Math.round(zaif.avgPct!)}%). Shu bosqichni jamoa bilan mashq qiling.`
        : 'Sifat pasaygan suhbatlarni ko\'rib chiqing — qaysi bosqich tushib ketganini aniqlang.',
      tugma: 'Suhbatlar',
      yol: '/suhbatlar',
    },
    ulush: {
      matn: 'Iliq lidlarga qayta aloqa rejalashtiring — issiq lidlar ulushi kamaymoqda.',
      tugma: 'Lid xulosalari',
      yol: '/lidlar',
    },
    issiq: {
      matn: 'Issiq lidlar kamaydi — iliq lidlarni qayta faollashtirish va javob tezligini tekshiring.',
      tugma: 'Lid xulosalari',
      yol: '/lidlar',
    },
  };

  const tavsiya = eng
    ? engTavsiya[eng.kalit].matn
    : c.unansweredSessions > 0
      ? `Javobsiz qolgan ${c.unansweredSessions} ta mijozga bugun qayta yozing — bular eng tez qaytadigan lidlar.`
      : zaif && (zaif.avgPct ?? 100) < 70
        ? `O'sish uchun bitta mezonni tanlang — «${zaif.name}» hozir ${Math.round(zaif.avgPct!)}%.`
        : 'Ko\'rsatkichlar yaxshi — eng kuchli suhbatlarni jamoa bilan namuna sifatida ko\'rib chiqing.';

  const qatorlar: { nom: string; izoh: string; qiymat: string; oldin: string; d: ReactNode }[] = [
    {
      nom: 'Issiq lidlar',
      izoh: 'AI "issiq" deb baholagan mijozlar soni — sotuvga eng yaqin suhbatlar.',
      qiymat: String(k.lid.hot),
      oldin: `odatda ${k.lidOldin.hot}`,
      d: <Farq d={k.lid.hot - k.lidOldin.hot} aniqlik={0} />,
    },
    {
      nom: 'Issiq lid ulushi',
      izoh: 'Tahlil qilingan suhbatlarning qancha qismi issiq lid bilan yakunlangan.',
      qiymat: k.issiqUlush === null ? '—' : `${k.issiqUlush.toFixed(2)}%`,
      oldin: `o'tgan davr ${k.issiqUlushOldin === null ? '—' : `${k.issiqUlushOldin.toFixed(2)}%`}`,
      d: <Farq d={ayir(k.issiqUlush, k.issiqUlushOldin)} />,
    },
    {
      nom: 'Suhbat sifati',
      izoh: 'Baholash mezonlari bo\'yicha o\'rtacha ball (0–100). Har ball isbot bilan.',
      qiymat: sifatMatn,
      oldin: `o'tgan davr ${p.avgScore ?? '—'}`,
      d: <Farq d={dSifat} />,
    },
    {
      nom: 'Javob berish darajasi',
      izoh: 'Mijoz xabari javobsiz qolmagan sessiyalar ulushi.',
      qiymat: javobMatn,
      oldin: `o'tgan davr ${k.javobOldin === null ? '—' : `${yaxlit(k.javobOldin)}%`}`,
      d: <Farq d={dJavob} />,
    },
  ];

  const hammasi: { nom: string; c: string; p: string; d: number | null; teskari?: boolean }[] = [
    { nom: 'Suhbatlar', c: String(c.conversations), p: String(p.conversations), d: c.conversations - p.conversations },
    { nom: 'Tahlil qilingan', c: String(c.analyzed), p: String(p.analyzed), d: c.analyzed - p.analyzed },
    { nom: 'Filtrlangan', c: String(c.filtered), p: String(p.filtered), d: c.filtered - p.filtered, teskari: true },
    { nom: 'Bayroqlangan', c: String(c.flagged), p: String(p.flagged), d: c.flagged - p.flagged, teskari: true },
    {
      nom: 'Birinchi javob (median)',
      c: fmtSoniya(c.medianFirstResponseSeconds),
      p: fmtSoniya(p.medianFirstResponseSeconds),
      d: ayir(c.medianFirstResponseSeconds, p.medianFirstResponseSeconds),
      teskari: true,
    },
    {
      nom: 'Javobsiz sessiyalar',
      c: String(c.unansweredSessions),
      p: String(p.unansweredSessions),
      d: c.unansweredSessions - p.unansweredSessions,
      teskari: true,
    },
    {
      nom: 'AI xarajat',
      c: c.aiCostUsd === null ? '—' : `$${c.aiCostUsd.toFixed(2)}`,
      p: p.aiCostUsd === null ? '—' : `$${p.aiCostUsd.toFixed(2)}`,
      d: ayir(c.aiCostUsd, p.aiCostUsd),
      teskari: true,
    },
  ];

  return (
    <section className="card puls" aria-labelledby="puls-sarlavha">
      <div className="puls-asosiy">
        <div className="puls-chap">
          <div className="puls-bosh">
            <span className="puls-yorliq" id="puls-sarlavha">
              <Sparkles /> Biznes pulsi
            </span>
            <span className={`puls-holat ${holat.klass}`}>
              {eng && <TriangleAlert />}
              {holat.nom}
            </span>
            <span className="puls-sana">{sanaOraliq(davr)}</span>
          </div>

          <div className="puls-hero">
            {eng ? (
              <div>
                <div className="puls-raqam yomon">
                  {eng.qiymat} <Farq d={eng.d} />
                </div>
                <div className="puls-raqam-izoh">
                  {eng.nom} · o'tgan davr {eng.oldin}
                </div>
              </div>
            ) : (
              <div>
                <div className="puls-raqam">{k.lid.hot}</div>
                <div className="puls-raqam-izoh">
                  Issiq lidlar · odatda {k.lidOldin.hot}
                </div>
              </div>
            )}
            <div className="puls-grafik">
              {eng?.kalit === 'sifat' ? (
                <Sparkline
                  qiymatlar={data.trend.map((t) => t.avgScore)}
                  kenglik={300}
                  balandlik={70}
                  rang="var(--past)"
                  nom="Kunlik o'rtacha ball"
                />
              ) : (
                <Sparkline
                  qiymatlar={data.trend.map((t) => t.conversations)}
                  kenglik={300}
                  balandlik={70}
                  rang={eng ? 'var(--past)' : 'var(--ia)'}
                  nom="Kunlik suhbatlar soni"
                />
              )}
              <span className="puls-grafik-izoh">{eng?.kalit === 'sifat' ? 'Kunlik o\'rtacha ball' : 'Kunlik suhbatlar'}</span>
            </div>
          </div>

          <p className="puls-xulosa">{xulosa}</p>
          <div className="puls-tavsiya">
            <p>{tavsiya}</p>
            {eng ? (
              <button className="btn" onClick={() => navigate(engTavsiya[eng.kalit].yol)}>
                {engTavsiya[eng.kalit].tugma}
              </button>
            ) : (
              !dinamik && (
                <button className="btn" onClick={() => navigate('/analitika')}>
                  Umumiy ko'rinish
                </button>
              )
            )}
          </div>
        </div>

        <dl className="puls-ong">
          {qatorlar.map((q) => (
            <div className="puls-qator" key={q.nom}>
              <dt>
                {q.nom} <MalumotIkon matn={q.izoh} />
              </dt>
              <dd>
                <span className="puls-qiymat">
                  {q.qiymat} {q.d}
                </span>
                <span className="puls-oldin">{q.oldin}</span>
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <button
        type="button"
        className={`puls-hammasi${ochiq ? ' ochiq' : ''}`}
        onClick={() => setOchiq((v) => !v)}
        aria-expanded={ochiq}
      >
        <ChevronDown /> Barcha raqamlar
      </button>
      {ochiq && (
        <div className="puls-jadval">
          {hammasi.map((h) => (
            <div className="puls-katak" key={h.nom}>
              <span className="nom">{h.nom}</span>
              <span className="qiymat">
                {h.c} <Farq d={h.d} teskari={h.teskari} />
              </span>
              <span className="oldin">o'tgan davr: {h.p}</span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ─── SIFAT KO'RINISHI ───────────────────────────────────────────────────────

export function SifatKorinishi({ data, davr }: { data: BoshMalumot; davr: Davr }) {
  const k = korsatkichlar(data, davr);
  const { c, p } = k;
  const kunlar = Math.max(1, Math.round((davr.to.getTime() - davr.from.getTime()) / 86400_000));

  const plitkalar: { qiymat: string; nom: string; izoh: string; d?: ReactNode; rang?: string }[] = [
    {
      qiymat: String(c.analyzed),
      nom: 'Tahlil qilingan',
      izoh: 'Davrda AI baholagan suhbatlar soni.',
    },
    {
      qiymat: c.avgScore === null ? '—' : String(c.avgScore),
      nom: 'O\'rtacha suhbat sifati',
      izoh: 'Barcha baholangan suhbatlarning o\'rtacha bali.',
      d: <Farq d={ayir(c.avgScore, p.avgScore)} />,
    },
    {
      qiymat: k.lidSifati === null ? '—' : `${Math.round(k.lidSifati)}%`,
      nom: 'Lid sifati',
      izoh: 'Lid sifati baholangan suhbatlarning issiq yoki iliq ulushi.',
    },
    {
      qiymat: String(c.unansweredSessions),
      nom: 'Javobsiz',
      izoh: 'Mijoz yozgan, lekin javob olmagan sessiyalar.',
      rang: c.unansweredSessions > 0 ? 'var(--past)' : undefined,
    },
    {
      qiymat: davomiylikMatn(k.ortDavom),
      nom: 'O\'rt. davomiylik',
      izoh: 'Sessiyaning birinchi va oxirgi xabari orasidagi o\'rtacha vaqt.',
    },
  ];

  return (
    <section className="card sifat" aria-labelledby="sifat-sarlavha">
      <div className="karta-bosh">
        <h2 id="sifat-sarlavha">
          Sifat ko'rinishi <MalumotIkon matn="Tanlangan davrdagi suhbatlar sifati va lidlar holati" />
        </h2>
        <span className="mono-izoh">
          {sanaOraliq(davr)} · {kunlar} kun
        </span>
      </div>

      <div className="sifat-plitkalar">
        {plitkalar.map((t) => (
          <div className="sifat-plitka" key={t.nom}>
            <div className="sifat-qiymat" style={t.rang ? { color: t.rang } : undefined}>
              {t.qiymat} {t.d}
            </div>
            <div className="sifat-nom">
              {t.nom} <MalumotIkon matn={t.izoh} />
            </div>
          </div>
        ))}
      </div>

      <div className="jamoa-ortacha">
        <div>
          <div className="jamoa-yorliq">Jamoa o'rtachasi</div>
          <div className="jamoa-qiymat">
            {c.avgScore === null ? '—' : `${c.avgScore.toFixed(2)}%`} <Farq d={ayir(c.avgScore, p.avgScore)} birlik="%" />
          </div>
          <div className="jamoa-izoh">
            Og'irlikda hisoblangan · {c.conversations} suhbat · {data.board.length} menejer
          </div>
        </div>
        <div className="jamoa-grafik">
          <Sparkline
            qiymatlar={data.trend.map((t) => t.avgScore)}
            kenglik={180}
            balandlik={46}
            rang="var(--info)"
            nom="Kunlik o'rtacha ball"
          />
          <span className="mono-izoh">{kunlar} kun · kunlik o'rtacha</span>
        </div>
      </div>
    </section>
  );
}
