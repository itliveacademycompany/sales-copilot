import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { ballRang, type Ulush } from '../api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DIAGRAMMALAR — kutubxonasiz, sof SVG va CSS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Recharts/Chart.js qo'shilmadi: bizga kerak bo'lgan to'rt shakl (doira,
 * gorizontal chiziq, ustun, issiqlik matritsasi) ellik qatordan iborat va
 * ular loyihaning CSS o'zgaruvchilariga to'liq bo'ysunadi. Kutubxona
 * qo'shilsa, mavzu almashuvi (light/dark) va ranglar tizimi ikkinchi marta,
 * boshqa qoidalar bilan ta'riflanardi.
 *
 * Umumiy qoida: "ma'lumot yo'q" hech qachon nol ustun sifatida
 * chizilmaydi — u alohida, kul rangda va aniq matn bilan ko'rsatiladi.
 */

/**
 * Neytral palitra — ball emas, kategoriya farqini ko'rsatish uchun.
 *
 * Stitch dizayni (2026-08): oldingi palitra ko'k+yashil+binafsha+jigarrang
 * kabi bir-biriga mos kelmaydigan ranglarni aralashtirardi — bir nechta
 * kategoriya yonma-yon turganda "jiggling"/notinch ko'rinardi. Endi
 * hammasi BITTA issiq oila (oltin → to'q qizil → jigarrang) — kategoriyalar
 * baribir bir-biridan farqlanadi, lekin diagramma yaxlit va tinch ko'rinadi.
 */
const PALITRA = [
  '#f0b84e',
  '#e8743d',
  '#d94f36',
  '#c1381f',
  '#a8560a',
  '#8a5a3a',
  '#e0916f',
  '#703a1f',
];

/** "Aniqlanmadi" har doim kul rang — u kategoriya emas, ma'lumot yo'qligi. */
function rang(key: string, i: number): string {
  return key === 'aniqlanmadi' || key === 'unknown' ? 'var(--text-muted)' : PALITRA[i % PALITRA.length]!;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SILLIQ CHIZIQ — monoton kubik interpolatsiya (Fritsch–Carlson)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nuqtalarni to'g'ri chiziq bilan bog'lash burchakli ko'rinadi. Lekin
 * ODDIY silliqlash (masalan Catmull-Rom) xavfli: u nuqtalar orasida
 * qiymatdan OSHIB yoki PASAYIB ketadi — grafikda 0 dan past "javobsiz
 * suhbatlar" yoki eng yuqori nuqtadan balandroq cho'qqi paydo bo'ladi.
 * Ya'ni chiziq mavjud bo'lmagan ma'lumotni ko'rsatadi.
 *
 * Monoton variant esa buni kafolatlab to'xtatadi: egri chiziq hech qachon
 * qo'shni ikki nuqta oralig'idan chiqmaydi. Ko'rinishi yumshoq, ma'nosi
 * esa to'g'ri qoladi.
 */
export function silliqYol(nuqtalar: { x: number; y: number }[]): string {
  const n = nuqtalar.length;
  if (n === 0) return '';
  if (n === 1) return `M ${nuqtalar[0]!.x},${nuqtalar[0]!.y}`;
  if (n === 2) {
    return `M ${nuqtalar[0]!.x},${nuqtalar[0]!.y} L ${nuqtalar[1]!.x},${nuqtalar[1]!.y}`;
  }

  // 1) Qo'shni nuqtalar orasidagi qiyaliklar
  const dx: number[] = [];
  const dy: number[] = [];
  const delta: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = nuqtalar[i + 1]!.x - nuqtalar[i]!.x;
    dy[i] = nuqtalar[i + 1]!.y - nuqtalar[i]!.y;
    delta[i] = dx[i] === 0 ? 0 : dy[i]! / dx[i]!;
  }

  // 2) Har nuqtadagi boshlang'ich urinma
  const m: number[] = [delta[0]!];
  for (let i = 1; i < n - 1; i++) m[i] = (delta[i - 1]! + delta[i]!) / 2;
  m[n - 1] = delta[n - 2]!;

  // 3) Monotonlikni majburlash — aynan shu qadam "oshib ketish"ni to'xtatadi
  for (let i = 0; i < n - 1; i++) {
    if (delta[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / delta[i]!;
    const b = m[i + 1]! / delta[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * delta[i]!;
      m[i + 1] = t * b * delta[i]!;
    }
  }

  // 4) Kubik Bezier bo'laklari
  let d = `M ${nuqtalar[0]!.x},${nuqtalar[0]!.y}`;
  for (let i = 0; i < n - 1; i++) {
    const uch = dx[i]! / 3;
    const c1x = nuqtalar[i]!.x + uch;
    const c1y = nuqtalar[i]!.y + m[i]! * uch;
    const c2x = nuqtalar[i + 1]!.x - uch;
    const c2y = nuqtalar[i + 1]!.y - m[i + 1]! * uch;
    d += ` C ${c1x},${c1y} ${c2x},${c2y} ${nuqtalar[i + 1]!.x},${nuqtalar[i + 1]!.y}`;
  }
  return d;
}

export function BoshQator({ nom, ost }: { nom: string; ost?: string }) {
  return (
    <div className="karta-bosh">
      <div>
        <h2>{nom}</h2>
        {ost && <div className="diag-ost">{ost}</div>}
      </div>
    </div>
  );
}

/**
 * Doiraviy diagramma (donut) + yon tomonda izoh ro'yxati.
 *
 * `stroke-dasharray` usuli tanlandi: har bo'lak uchun alohida `path`
 * yasashdan ko'ra qisqa va aylana perimetri bo'yicha aniq foizga tushadi.
 *
 * ── Sichqoncha bilan tanlash ────────────────────────────────────────────
 * Bo'lak ustiga borilganda uchta narsa BIR VAQTDA o'zgaradi:
 *   1. o'sha bo'lak yo'g'onlashadi, qolganlari xiralashadi,
 *   2. MARKAZDAGI raqam jamiga emas, TANLANGAN bo'lakka o'tadi,
 *   3. izoh (tooltip) aniq qiymat va foizni ko'rsatadi.
 *
 * Markazdagi raqamning almashuvi ataylab: doiraviy diagrammaning eng
 * kuchsiz tomoni — bo'lak kattaligini ko'z bilan baholash qiyinligi.
 * Raqamni markazga chiqarish shu kamchilikni yopadi.
 *
 * Ro'yxatdagi satr ham xuddi shu bo'lakni yoritadi: ba'zi bo'laklar juda
 * ingichka bo'lib, ularni sichqoncha bilan ushlash qiyin.
 */
export function Doira({ data, jami }: { data: Ulush[]; jami?: number }) {
  const [faol, setFaol] = useState<number | null>(null);
  const [izoh, setIzoh] = useState<IzohHolat | null>(null);
  const blokRef = useRef<HTMLDivElement | null>(null);

  const total = jami ?? data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <div className="hech-narsa">Bu davrda ma'lumot yo'q</div>;

  const R = 52;
  const C = 2 * Math.PI * R;

  const korsat = faol !== null ? data[faol] : undefined;
  const foiz = (n: number) => Math.round((n / total) * 100);

  const QALINLIK = 15;
  const HOVER_QALINLIK = 17;
  /** Ikki qo'shni bo'lakning yumaloq uchlari qo'shilganda kerak bo'ladigan bo'shliq. */
  const BOSHLIQ = QALINLIK / 2 + HOVER_QALINLIK / 2 + 1; // ≈ 17
  /** Har bir bo'lak ko'zga YAKKA-YAKKA ko'rinishi uchun eng kam chizilgan uzunlik. */
  const MIN_CHIZILGAN = 6;
  const MIN_TOLIQ = BOSHLIQ + MIN_CHIZILGAN;

  /**
   * Juda kichik ulushlar (masalan, umumiy 2%) sof proporsional hisobda
   * bo'shliqdan ham kichikroq chiqib, ko'rinmay ketadi yoki qo'shnisiga
   * ustma-ust tushadi ("Muvofiqlik" diagrammasida aynan shu ko'rilgan
   * edi — uchta kichik bo'lak bir-biriga yopishib qolgan). Shuning uchun
   * har biriga MINIMAL joy kafolatlanadi — bu "qarz" katta bo'laklardan
   * ULARNING ulushiga mutanosib olib qo'yiladi, haqiqiy diagramma
   * kutubxonalari (masalan, D3) ham shu usulni ishlatadi.
   */
  const xomUzunlik = data.map((d) => (d.count / total) * C);
  const yetishmovchi = xomUzunlik.map((x) => Math.max(0, MIN_TOLIQ - x));
  const qarz = yetishmovchi.reduce((s, k) => s + k, 0);
  const donorHavza = xomUzunlik.reduce((s, x, i) => s + (yetishmovchi[i] === 0 ? x : 0), 0);
  const joylashuv =
    qarz > 0 && donorHavza > 0
      ? xomUzunlik.map((x, i) =>
          yetishmovchi[i]! > 0 ? x + yetishmovchi[i]! : x - qarz * (x / donorHavza),
        )
      : xomUzunlik;

  let offset = 0;

  /** Izohni konteynerga nisbatan joylashtiradi. */
  function izohKorsat(i: number, clientX: number, clientY: number) {
    const box = blokRef.current?.getBoundingClientRect();
    if (!box) return;
    const d = data[i]!;
    setIzoh({
      x: clientX - box.left,
      y: clientY - box.top,
      mazmun: (
        <>
          <div className="qator">
            <span className="nuqta" style={{ background: rang(d.key, i) }} />
            {d.key}: <b>{d.count}</b>
          </div>
          <div className="qator" style={{ opacity: 0.8 }}>
            {foiz(d.count)}% · jami {total}
            {d.avgScore !== undefined && d.avgScore !== null && (
              <> · o'rtacha ball {d.avgScore}%</>
            )}
          </div>
        </>
      ),
    });
  }

  function tozala() {
    setFaol(null);
    setIzoh(null);
  }

  return (
    <div className="doira-blok" ref={blokRef} onMouseLeave={tozala}>
      <svg viewBox="0 0 140 140" className="doira" role="img" aria-label="Taqsimot">
        {data.map((d, i) => {
          const uzunlikToliq = joylashuv[i]!;
          const bosh = data.length > 1 ? BOSHLIQ : 0;
          const uzunlik = Math.max(0, uzunlikToliq - bosh);
          const el = (
            <circle
              key={d.key}
              cx="70"
              cy="70"
              r={R}
              fill="none"
              stroke={rang(d.key, i)}
              strokeWidth={faol === i ? HOVER_QALINLIK : QALINLIK}
              strokeLinecap={data.length > 1 ? 'round' : 'butt'}
              className={faol !== null && faol !== i ? 'bolak xira' : 'bolak'}
              strokeDasharray={`${uzunlik} ${C - uzunlik}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 70 70)"
              onMouseMove={(e) => {
                setFaol(i);
                izohKorsat(i, e.clientX, e.clientY);
              }}
            />
          );
          offset += uzunlikToliq;
          return el;
        })}

        <text x="70" y={korsat ? 64 : 66} textAnchor="middle" className="doira-son">
          {korsat ? korsat.count : total}
        </text>
        <text x="70" y={korsat ? 80 : 82} textAnchor="middle" className="doira-nom">
          {korsat
            ? // Uzun nom doira ichiga sig'maydi — qisqartiriladi, to'liq
              // matn esa izoh va ro'yxatda baribir ko'rinadi.
              String(korsat.key).length > 14
              ? `${String(korsat.key).slice(0, 13)}…`
              : korsat.key
            : 'jami'}
        </text>
        {korsat && (
          <text x="70" y="94" textAnchor="middle" className="doira-foiz">
            {foiz(korsat.count)}%
          </text>
        )}
      </svg>

      <div className="doira-izoh">
        {data.map((d, i) => (
          <div
            className={`izoh-satr${faol === i ? ' faol' : ''}`}
            key={d.key}
            onMouseMove={(e) => {
              setFaol(i);
              izohKorsat(i, e.clientX, e.clientY);
            }}
          >
            <span className="nuqta" style={{ background: rang(d.key, i) }} />
            <span className="nom" title={d.key}>
              {d.key}
            </span>
            <span className="son">{d.count}</span>
            <span className="foiz">{foiz(d.count)}%</span>
          </div>
        ))}
      </div>

      <Izoh holat={izoh} />
    </div>
  );
}

/**
 * Gorizontal chiziqlar ro'yxati — "eng ko'p uchragan N ta narsa" uchun.
 * Uzunlik eng katta qiymatga nisbatan, chunki bu yerda savol "qaysi biri
 * ko'proq", "umumiy ulushi qancha" emas.
 */
export function Chiziqlar({
  data,
  rangBall,
  birlik,
}: {
  data: { key: string; count: number; avgScore?: number | null }[];
  /** Ball bo'yicha ranglash — sifat kesimlarida ma'noli. */
  rangBall?: boolean;
  birlik?: string;
}) {
  if (data.length === 0) return <div className="hech-narsa">Bu davrda ma'lumot yo'q</div>;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div>
      {data.map((d, i) => (
        <div className="chiziq-satr" key={d.key}>
          <span className="nom" title={d.key}>
            {d.key}
          </span>
          <div className="yol">
            <div
              style={
                {
                  width: `${(d.count / max) * 100}%`,
                  background: rangBall ? ballRang(d.avgScore ?? null) : rang(d.key, i),
                  // Ketma-ket o'sish — ro'yxat tartibi ko'zga o'qiladi.
                  '--i': i,
                } as CSSProperties
              }
            />
          </div>
          <span className="son">
            {d.count}
            {birlik ? ` ${birlik}` : ''}
          </span>
          {d.avgScore !== undefined && (
            <span className="ball-kichik" style={{ color: ballRang(d.avgScore ?? null) }}>
              {d.avgScore === null ? '—' : `${d.avgScore}%`}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Vertikal ustunlar — vaqt o'qi bo'yicha (soat, hafta kuni).
 * Ustun balandligi sonni, rangi esa o'rtacha ballni ko'rsatadi: shu
 * ikkisini bitta shaklga sig'dirish "qachon ko'p ishlaymiz" va "qachon
 * yaxshi ishlaymiz" savollariga bir qarashda javob beradi.
 */
export function Ustunlar({
  data,
  birlik = 'ta',
}: {
  data: { label: string; count: number; avgScore: number | null }[];
  birlik?: string;
}) {
  const [izoh, setIzoh] = useState<IzohHolat | null>(null);
  if (data.length === 0) return <div className="hech-narsa">Bu davrda ma'lumot yo'q</div>;
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="ustunlar" onMouseLeave={() => setIzoh(null)}>
      {data.map((d, i) => (
        <div
          className="ustun-katak"
          key={d.label}
          onMouseMove={(e) => {
            const box = e.currentTarget.parentElement!.getBoundingClientRect();
            const r = e.currentTarget.getBoundingClientRect();
            setIzoh({
              x: r.left - box.left + r.width / 2,
              y: 0,
              mazmun: (
                <>
                  <div className="sana">{d.label}</div>
                  <div className="qator">
                    {d.count} {birlik}
                  </div>
                  {d.avgScore !== null && (
                    <div className="qator" style={{ color: ballRang(d.avgScore) }}>
                      o'rtacha ball: <b>{d.avgScore}%</b>
                    </div>
                  )}
                </>
              ),
            });
          }}
        >
          <div className="son">{d.count || ''}</div>
          <div className="yol">
            <div
              className="tola"
              style={
                {
                  height: `${Math.max((d.count / max) * 100, d.count > 0 ? 4 : 0)}%`,
                  background: d.count === 0 ? 'var(--bg-sunken)' : ballRang(d.avgScore),
                  '--i': i,
                } as CSSProperties
              }
            />
          </div>
          <div className="belgi">{d.label}</div>
        </div>
      ))}
      <Izoh holat={izoh} />
    </div>
  );
}

/**
 * Ko'p chiziqli trend — har sotuvchi uchun bitta chiziq.
 *
 * Uzilishlar ATAYLAB qoldiriladi: sotuvchi bir kun ishlamagan bo'lsa,
 * chiziq uzilib turadi. Nuqtalarni to'g'ri chiziq bilan bog'lash "o'sha
 * kuni ham shu ball edi" degan mavjud bo'lmagan ma'lumotni chizardi.
 */
export function KopChiziq({
  qatorlar,
  balandlik = 200,
}: {
  qatorlar: { id: string; nom: string; nuqtalar: { x: string; y: number }[] }[];
  balandlik?: number;
}) {
  const barchaX = [...new Set(qatorlar.flatMap((q) => q.nuqtalar.map((n) => n.x)))].sort();
  if (barchaX.length === 0) return <div className="hech-narsa">Bu davrda ma'lumot yo'q</div>;

  const W = 720;
  const H = balandlik;
  const P = { chap: 34, ong: 8, tep: 10, past: 26 };
  const xPos = (x: string) =>
    barchaX.length === 1
      ? P.chap + (W - P.chap - P.ong) / 2
      : P.chap + (barchaX.indexOf(x) / (barchaX.length - 1)) * (W - P.chap - P.ong);
  const yPos = (y: number) => P.tep + (1 - y / 100) * (H - P.tep - P.past);

  return (
    <div className="trend-svg-wrap">
      <svg viewBox={`0 0 ${W} ${H}`} className="trend-svg" role="img" aria-label="Jamoa trendi">
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line
              x1={P.chap}
              x2={W - P.ong}
              y1={yPos(g)}
              y2={yPos(g)}
              className="tur-chiziq"
            />
            <text x={P.chap - 6} y={yPos(g) + 3} textAnchor="end" className="tur-belgi">
              {g}%
            </text>
          </g>
        ))}

        {qatorlar.map((q, qi) => {
          const rang = PALITRA[qi % PALITRA.length]!;
          // Uzluksiz bo'laklarga ajratamiz — bo'sh kunlarda chiziq uzuladi.
          const bolaklar: { x: string; y: number }[][] = [];
          let joriy: { x: string; y: number }[] = [];
          for (const x of barchaX) {
            const n = q.nuqtalar.find((p) => p.x === x);
            if (n) joriy.push(n);
            else if (joriy.length > 0) {
              bolaklar.push(joriy);
              joriy = [];
            }
          }
          if (joriy.length > 0) bolaklar.push(joriy);

          return (
            <g key={q.id}>
              {bolaklar.map((b, bi) => (
                <path
                  key={bi}
                  className="trend-yol"
                  d={silliqYol(b.map((n) => ({ x: xPos(n.x), y: yPos(n.y) })))}
                  stroke={rang}
                />
              ))}
              {q.nuqtalar.map((n) => (
                <circle key={n.x} cx={xPos(n.x)} cy={yPos(n.y)} r="3" fill={rang}>
                  <title>{`${q.nom} · ${n.x} · ${n.y}%`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      <div className="trend-afsona">
        {qatorlar.map((q, qi) => (
          <span className="band" key={q.id}>
            <span className="nuqta" style={{ background: PALITRA[qi % PALITRA.length] }} />
            {q.nom}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SICHQONCHA IZOHI (tooltip)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Diagramma faqat SHAKLNI ko'rsatadi — aniq raqam kerak bo'lganda odam
 * ustiga olib boradi. Shuning uchun izoh `pointer-events: none` bilan
 * chiziladi: u sichqoncha yo'lini to'smasligi kerak, aks holda ustiga
 * kelganda o'zi yo'qolib, titrab qoladi.
 *
 * Joylashuvi konteynerga nisbatan (`position: absolute`), sahifaga emas —
 * shunda sahifa aylanganda izoh diagramma bilan birga siljiydi.
 */
interface IzohHolat {
  x: number;
  y: number;
  mazmun: ReactNode;
}

function Izoh({ holat }: { holat: IzohHolat | null }) {
  if (!holat) return null;
  return (
    <div
      className="diag-izoh"
      style={{ left: holat.x, top: holat.y }}
      role="tooltip"
      aria-hidden="true"
    >
      {holat.mazmun}
    </div>
  );
}

/**
 * Guruhlangan ustunlar — bir kunda ikki qiymat (masalan yaratildi va
 * bajarildi). Ular yonma-yon turadi, ustma-ust emas: taqqoslash savoli
 * "qaysi biri katta", "ikkalasi jami qancha" emas.
 */
export function GuruhUstunlar({
  data,
  qatorlar,
  balandlik = 190,
}: {
  data: { label: string; qiymatlar: number[] }[];
  qatorlar: { nom: string; rang: string }[];
  balandlik?: number;
}) {
  const [izoh, setIzoh] = useState<IzohHolat | null>(null);
  if (data.length === 0) return <div className="hech-narsa">Bu davrda ma'lumot yo'q</div>;

  const max = Math.max(1, ...data.flatMap((d) => d.qiymatlar));
  // O'q belgilari: yaxlit to'rt bo'lak — ko'z balandlikni shu bo'yicha o'lchaydi.
  const turlar = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(max * k));

  return (
    <div className="guruh-wrap">
      <div className="diag-afsona">
        {qatorlar.map((q) => (
          <span className="band" key={q.nom}>
            <span className="nuqta" style={{ background: q.rang }} />
            {q.nom}
          </span>
        ))}
      </div>

      <div className="guruh-maydon" style={{ height: balandlik }}>
        <div className="guruh-turlar">
          {[...turlar].reverse().map((v, i) => (
            <div className="tur" key={i}>
              <span className="belgi">{v}</span>
            </div>
          ))}
        </div>

        <div className="guruh-ustunlar" onMouseLeave={() => setIzoh(null)}>
          {data.map((d, i) => (
            <div
              className="guruh-katak"
              key={d.label}
              onMouseMove={(e) => {
                const box = e.currentTarget.parentElement!.getBoundingClientRect();
                const r = e.currentTarget.getBoundingClientRect();
                setIzoh({
                  x: r.left - box.left + r.width / 2,
                  y: 0,
                  mazmun: (
                    <>
                      <div className="sana">{d.label}</div>
                      {qatorlar.map((q, qi) => (
                        <div className="qator" key={q.nom}>
                          <span className="nuqta" style={{ background: q.rang }} />
                          {q.nom}: <b>{d.qiymatlar[qi] ?? 0}</b>
                        </div>
                      ))}
                    </>
                  ),
                });
              }}
            >
              <div className="ustunlar-juft">
                {d.qiymatlar.map((v, qi) => (
                  <div
                    className="tola"
                    key={qi}
                    style={
                      {
                        height: `${(v / max) * 100}%`,
                        background: qatorlar[qi]?.rang,
                        '--i': i,
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
            </div>
          ))}
          <Izoh holat={izoh} />
        </div>
      </div>

      <div className="guruh-belgilar">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * Ikki o'qli kombinatsiya: ustunlar (chap o'q, son) + chiziq (o'ng o'q,
 * summa). Ular BOSHQA birlikda, shuning uchun bitta o'qqa sig'maydi —
 * 44 ta bitim va 3 300 000 so'm bir shkalada chizilsa, ustunlar ko'rinmay
 * qolardi.
 */
export function Kombo({
  data,
  ustunNom,
  chiziqNom,
  chiziqFmt,
  balandlik = 210,
}: {
  data: { label: string; ustun: number; chiziq: number }[];
  ustunNom: string;
  chiziqNom: string;
  chiziqFmt: (v: number) => string;
  balandlik?: number;
}) {
  const [izoh, setIzoh] = useState<IzohHolat | null>(null);
  if (data.length === 0) return <div className="hech-narsa">Bu davrda ma'lumot yo'q</div>;

  const maxU = Math.max(1, ...data.map((d) => d.ustun));
  const maxC = Math.max(1, ...data.map((d) => d.chiziq));
  const W = 720;
  const H = balandlik;
  const P = { chap: 34, ong: 54, tep: 12, past: 4 };
  const xPos = (i: number) =>
    data.length === 1
      ? P.chap + (W - P.chap - P.ong) / 2
      : P.chap + ((i + 0.5) / data.length) * (W - P.chap - P.ong);
  const yPos = (v: number) => P.tep + (1 - v / maxC) * (H - P.tep - P.past);

  return (
    <div className="kombo-wrap">
      <div className="diag-afsona">
        <span className="band">
          <span className="nuqta" style={{ background: 'var(--yuqori)' }} />
          {ustunNom}
        </span>
        <span className="band">
          <span className="nuqta" style={{ background: 'var(--ia)' }} />
          {chiziqNom}
        </span>
      </div>

      <div className="kombo-maydon" style={{ height: H }} onMouseLeave={() => setIzoh(null)}>
        {/* Ustunlar — CSS bilan, shunda o'sish animatsiyasi ishlaydi */}
        <div className="kombo-turlar chap">
          {[1, 0.75, 0.5, 0.25, 0].map((k) => (
            <span key={k}>{Math.round(maxU * k)}</span>
          ))}
        </div>
        <div className="kombo-ustunlar">
          {data.map((d, i) => (
            <div
              className="kombo-katak"
              key={d.label}
              onMouseMove={(e) => {
                const box = e.currentTarget.parentElement!.getBoundingClientRect();
                const r = e.currentTarget.getBoundingClientRect();
                setIzoh({
                  x: r.left - box.left + r.width / 2,
                  y: 0,
                  mazmun: (
                    <>
                      <div className="sana">{d.label}</div>
                      <div className="qator">
                        <span className="nuqta" style={{ background: 'var(--yuqori)' }} />
                        {ustunNom}: <b>{d.ustun}</b>
                      </div>
                      <div className="qator">
                        <span className="nuqta" style={{ background: 'var(--ia)' }} />
                        {chiziqNom}: <b>{chiziqFmt(d.chiziq)}</b>
                      </div>
                    </>
                  ),
                });
              }}
            >
              <div
                className="tola"
                style={
                  { height: `${(d.ustun / maxU) * 100}%`, '--i': i } as CSSProperties
                }
              />
            </div>
          ))}

          {/* Chiziq ustunlar USTIDAN o'tadi — hodisalarni to'smasligi kerak */}
          <svg viewBox={`0 0 ${W} ${H}`} className="kombo-svg" preserveAspectRatio="none">
            <path
              className="kombo-yol"
              d={silliqYol(data.map((d, i) => ({ x: xPos(i), y: yPos(d.chiziq) })))}
            />
            {data.map((d, i) => (
              <circle key={d.label} cx={xPos(i)} cy={yPos(d.chiziq)} r="3.5" className="kombo-nuqta" />
            ))}
          </svg>

          <Izoh holat={izoh} />
        </div>
        <div className="kombo-turlar ong">
          {[1, 0.75, 0.5, 0.25, 0].map((k) => (
            <span key={k}>{chiziqFmt(maxC * k)}</span>
          ))}
        </div>
      </div>

      <div className="kombo-belgilar">
        {data.map((d) => (
          <span key={d.label}>{d.label}</span>
        ))}
      </div>
    </div>
  );
}

/**
 * Yig'ma ustunlar — bitta toifa ichidagi bo'linish (masalan xizmat
 * yo'nalishi ichida sotuv/qo'llab-quvvatlash nisbati). Bu yerda ustma-ust
 * qo'yish TO'G'RI, chunki bo'laklar bir butunning qismlari.
 */
export function YigmaUstunlar({
  data,
  qatorlar,
  balandlik = 190,
}: {
  data: { label: string; qiymatlar: number[] }[];
  qatorlar: { nom: string; rang: string }[];
  balandlik?: number;
}) {
  const [izoh, setIzoh] = useState<IzohHolat | null>(null);
  if (data.length === 0) return <div className="hech-narsa">Bu davrda ma'lumot yo'q</div>;
  const jamilar = data.map((d) => d.qiymatlar.reduce((a, b) => a + b, 0));
  const max = Math.max(1, ...jamilar);

  return (
    <div className="guruh-wrap">
      <div className="diag-afsona">
        {qatorlar.map((q) => (
          <span className="band" key={q.nom}>
            <span className="nuqta" style={{ background: q.rang }} />
            {q.nom}
          </span>
        ))}
      </div>
      <div className="guruh-maydon" style={{ height: balandlik }}>
        <div className="guruh-turlar">
          {[1, 0.75, 0.5, 0.25, 0].map((k) => (
            <div className="tur" key={k}>
              <span className="belgi">{Math.round(max * k)}</span>
            </div>
          ))}
        </div>
        <div className="guruh-ustunlar" onMouseLeave={() => setIzoh(null)}>
          {data.map((d, i) => (
            <div
              className="guruh-katak"
              key={d.label}
              onMouseMove={(e) => {
                const box = e.currentTarget.parentElement!.getBoundingClientRect();
                const r = e.currentTarget.getBoundingClientRect();
                setIzoh({
                  x: r.left - box.left + r.width / 2,
                  y: 0,
                  mazmun: (
                    <>
                      <div className="sana">{d.label}</div>
                      {qatorlar.map((q, qi) =>
                        (d.qiymatlar[qi] ?? 0) > 0 ? (
                          <div className="qator" key={q.nom}>
                            <span className="nuqta" style={{ background: q.rang }} />
                            {q.nom}: <b>{d.qiymatlar[qi]}</b>
                          </div>
                        ) : null,
                      )}
                      <div className="qator">
                        Jami: <b>{jamilar[i]}</b>
                      </div>
                    </>
                  ),
                });
              }}
            >
              <div className="yigma" style={{ height: `${(jamilar[i]! / max) * 100}%` }}>
                {d.qiymatlar.map((v, qi) =>
                  v > 0 ? (
                    <div
                      key={qi}
                      className="bolak"
                      style={
                        {
                          height: `${(v / (jamilar[i] || 1)) * 100}%`,
                          background: qatorlar[qi]?.rang,
                          '--i': i,
                        } as CSSProperties
                      }
                    />
                  ) : null,
                )}
              </div>
            </div>
          ))}
          <Izoh holat={izoh} />
        </div>
      </div>
      <div className="guruh-belgilar">
        {data.map((d) => (
          <span key={d.label} title={d.label}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * YAQINLASHTIRILADIGAN TREND — g'ildirak bilan, uzilishsiz
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── Nega React holati EMAS, to'g'ridan-to'g'ri DOM ──────────────────────────
 * G'ildirak sekundiga 50-100 hodisa yuboradi. Har biriga `setState` qilinsa,
 * React butun daraxtni qayta hisoblaydi va harakat sakraydi. Shuning uchun
 * joriy oyna `ref` da saqlanadi, `requestAnimationFrame` esa faqat BITTA
 * atributni (`transform`) yozadi — bu brauzer uchun kompozitor darajasidagi
 * arzon amal.
 *
 * ── Nega `transform`, `viewBox` emas ───────────────────────────────────────
 * `viewBox` ni o'zgartirish butun SVG ni, jumladan MATNNI ham cho'zadi —
 * yaqinlashtirilganda yorliqlar buzilib ketardi. `transform` esa faqat
 * chiziqlar guruhiga qo'llanadi; `vector-effect: non-scaling-stroke`
 * chiziq qalinligini o'zgarmas saqlaydi, matn esa umuman tashqarida turadi.
 *
 * ── Silliqlik ──────────────────────────────────────────────────────────────
 * Maqsad qiymatga bir zumda sakrash o'rniga har kadrda 18% yaqinlashiladi
 * (lerp). Natijada g'ildirakning har bir "tiq"i yumshoq harakatga aylanadi
 * va to'xtaganda inersiya bilan joyiga o'tiradi.
 */
export function ZoomTrend({
  nuqtalar,
  qatorlar,
  balandlik = 230,
  fmtQiymat = (v: number) => String(v),
}: {
  /** Har element — bitta vaqt nuqtasi; `qiymatlar` qatorlar tartibida. */
  nuqtalar: { label: string; qiymatlar: (number | null)[] }[];
  qatorlar: { nom: string; rang: string }[];
  balandlik?: number;
  fmtQiymat?: (v: number) => string;
}) {
  const svgRef = useRef<SVGGElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const belgiRef = useRef<HTMLDivElement | null>(null);

  /** Ko'rinayotgan oyna: [0..1] oralig'idagi boshlanish va kenglik. */
  const joriy = useRef({ x: 0, w: 1 });
  const maqsad = useRef({ x: 0, w: 1 });
  const kadr = useRef(0);
  const [izoh, setIzoh] = useState<IzohHolat | null>(null);
  const [oynaMatn, setOynaMatn] = useState<string | null>(null);

  const W = 1000;
  const H = balandlik;
  const P = { chap: 38, ong: 10, tep: 12, past: 26 };

  const n = nuqtalar.length;
  const barchaQiymat = nuqtalar.flatMap((p) => p.qiymatlar.filter((v): v is number => v !== null));
  const max = Math.max(1, ...barchaQiymat);

  const xBase = (i: number) =>
    n <= 1 ? P.chap + (W - P.chap - P.ong) / 2 : P.chap + (i / (n - 1)) * (W - P.chap - P.ong);
  const yPos = (v: number) => P.tep + (1 - v / max) * (H - P.tep - P.past);

  /**
   * Oynaga qarab guruhni siljitadi va cho'zadi.
   *
   * Kelib chiqishi: `xb` — nuqtaning asl o'rni, `u = (xb - chap)/ichki`
   * uning [0,1] dagi ulushi. Yaqinlashtirilgandan keyin u `(u - x)/w`
   * ga o'tishi kerak, ya'ni ekranda:
   *     xs = chap + ((xb - chap)/ichki - x)/w * ichki
   *        = xb/w - chap/w + chap - x*ichki/w
   * Buni `translate(tx) scale(sx)` ko'rinishiga keltirsak (sx = 1/w):
   *     tx = chap - (chap + x*ichki) * sx
   */
  function qolla() {
    const g = svgRef.current;
    if (!g) return;
    const { x, w } = joriy.current;
    const ichki = W - P.chap - P.ong;
    const sx = 1 / w;
    const tx = P.chap - (P.chap + x * ichki) * sx;
    g.setAttribute('transform', `translate(${tx},0) scale(${sx},1)`);
  }

  function yur() {
    const j = joriy.current;
    const m = maqsad.current;
    j.x += (m.x - j.x) * 0.18;
    j.w += (m.w - j.w) * 0.18;
    qolla();
    if (Math.abs(m.x - j.x) > 0.0002 || Math.abs(m.w - j.w) > 0.0002) {
      kadr.current = requestAnimationFrame(yur);
    } else {
      joriy.current = { ...m };
      qolla();
      kadr.current = 0;
      belgilarniYangila();
    }
  }

  function boshla() {
    if (!kadr.current) kadr.current = requestAnimationFrame(yur);
  }

  /**
   * O'q yorliqlari — SVG dan TASHQARIDA, oddiy HTML. Shu tufayli ular
   * yaqinlashtirilganda cho'zilmaydi; faqat qaysi sanalar ko'rinishi
   * qayta hisoblanadi (kadr sayin emas, harakat to'xtaganda).
   */
  function belgilarniYangila() {
    const el = belgiRef.current;
    if (!el) return;
    const { x, w } = joriy.current;
    const boshI = Math.max(0, Math.floor(x * (n - 1)));
    const oxirI = Math.min(n - 1, Math.ceil((x + w) * (n - 1)));
    const korinadi = oxirI - boshI + 1;
    const qadam = Math.max(1, Math.ceil(korinadi / 8));
    const bolaklar: string[] = [];
    for (let i = boshI; i <= oxirI; i += qadam) bolaklar.push(nuqtalar[i]?.label ?? '');
    el.textContent = '';
    for (const b of bolaklar) {
      const s = document.createElement('span');
      s.textContent = b;
      el.appendChild(s);
    }
    setOynaMatn(
      w >= 0.999
        ? null
        : `${nuqtalar[boshI]?.label ?? ''} – ${nuqtalar[oxirI]?.label ?? ''}`,
    );
  }

  useEffect(() => {
    joriy.current = { x: 0, w: 1 };
    maqsad.current = { x: 0, w: 1 };
    qolla();
    belgilarniYangila();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  useEffect(() => () => { if (kadr.current) cancelAnimationFrame(kadr.current); }, []);

  /**
   * G'ildirak. `passive: false` SHART — aks holda `preventDefault()`
   * ishlamaydi va sahifa grafik bilan birga aylanib ketadi.
   */
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const box = el.getBoundingClientRect();
      // Kursor ostidagi nuqta joyida qolishi kerak — shunda yaqinlashtirish
      // "qayerga qarayotgan bo'lsang, o'sha yer" tuyg'usini beradi.
      const kursor = Math.min(1, Math.max(0, (e.clientX - box.left) / box.width));
      const m = maqsad.current;
      const nuqtaX = m.x + kursor * m.w;
      const koef = e.deltaY > 0 ? 1.18 : 1 / 1.18;
      // 3 nuqtadan kam ko'rinmasin: undan keyin grafik ma'nosini yo'qotadi.
      const engKichik = n > 3 ? 3 / n : 1;
      const yangiW = Math.min(1, Math.max(engKichik, m.w * koef));
      let yangiX = nuqtaX - kursor * yangiW;
      yangiX = Math.min(1 - yangiW, Math.max(0, yangiX));
      maqsad.current = { x: yangiX, w: yangiW };
      boshla();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n]);

  /** Sudrab surish — yaqinlashtirilganda oynani siljitadi. */
  const sudrash = useRef<{ boshX: number; boshOyna: number } | null>(null);

  function nuqtaIndeks(clientX: number): number {
    const el = wrapRef.current;
    if (!el) return 0;
    const box = el.getBoundingClientRect();
    const nisbat = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    const { x, w } = joriy.current;
    return Math.round((x + nisbat * w) * (n - 1));
  }

  return (
    <div className="zoom-wrap">
      <div className="zoom-bosh">
        <div className="diag-afsona" style={{ marginBottom: 0 }}>
          {qatorlar.map((q) => (
            <span className="band" key={q.nom}>
              <span className="nuqta" style={{ background: q.rang }} />
              {q.nom}
            </span>
          ))}
        </div>
        <div className="zoom-holat">
          {oynaMatn ? (
            <>
              <span>{oynaMatn}</span>
              <button
                className="btn ikkinchi kichik"
                onClick={() => {
                  maqsad.current = { x: 0, w: 1 };
                  boshla();
                }}
              >
                Butun davr
              </button>
            </>
          ) : (
            <span className="maslahat">G'ildirak bilan yaqinlashtiring, sudrab suring</span>
          )}
        </div>
      </div>

      <div
        className="zoom-maydon"
        ref={wrapRef}
        style={{ height: H }}
        onMouseDown={(e) => {
          sudrash.current = { boshX: e.clientX, boshOyna: maqsad.current.x };
        }}
        onMouseUp={() => {
          sudrash.current = null;
        }}
        onMouseLeave={() => {
          sudrash.current = null;
          setIzoh(null);
        }}
        onMouseMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          if (sudrash.current) {
            const siljish = ((e.clientX - sudrash.current.boshX) / box.width) * maqsad.current.w;
            const yangiX = Math.min(
              1 - maqsad.current.w,
              Math.max(0, sudrash.current.boshOyna - siljish),
            );
            maqsad.current = { ...maqsad.current, x: yangiX };
            boshla();
            return;
          }
          const i = nuqtaIndeks(e.clientX);
          const p = nuqtalar[i];
          if (!p) return;
          setIzoh({
            x: e.clientX - box.left,
            y: 0,
            mazmun: (
              <>
                <div className="sana">{p.label}</div>
                {qatorlar.map((q, qi) => (
                  <div className="qator" key={q.nom}>
                    <span className="nuqta" style={{ background: q.rang }} />
                    {q.nom}:{' '}
                    <b>{p.qiymatlar[qi] === null ? '—' : fmtQiymat(p.qiymatlar[qi]!)}</b>
                  </div>
                ))}
              </>
            ),
          });
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} className="zoom-svg" preserveAspectRatio="none">
          {/* To'r va o'q yorliqlari — guruhdan TASHQARIDA, cho'zilmaydi */}
          {[0, 0.25, 0.5, 0.75, 1].map((k) => (
            <g key={k}>
              <line
                x1={P.chap}
                x2={W - P.ong}
                y1={yPos(max * k)}
                y2={yPos(max * k)}
                className="zoom-tur"
              />
            </g>
          ))}

          {/* Chiziqlar — faqat shu guruh yaqinlashtiriladi */}
          <g ref={svgRef} clipPath="url(#zoom-clip)">
            {qatorlar.map((q, qi) => {
              const bolaklar: { i: number; v: number }[][] = [];
              let joriyB: { i: number; v: number }[] = [];
              nuqtalar.forEach((p, i) => {
                const v = p.qiymatlar[qi];
                if (v === null || v === undefined) {
                  if (joriyB.length) bolaklar.push(joriyB);
                  joriyB = [];
                } else joriyB.push({ i, v });
              });
              if (joriyB.length) bolaklar.push(joriyB);

              return (
                <g key={q.nom}>
                  {bolaklar.map((b, bi) => {
                    const yol = silliqYol(b.map((p) => ({ x: xBase(p.i), y: yPos(p.v) })));
                    return (
                      <g key={bi}>
                        {/* Maydoncha AYNAN shu egri chiziqdan yasaladi va
                            pastdan yopiladi — aks holda to'ldirish chegarasi
                            chiziqdan ajralib, soya "sirg'algan" ko'rinardi. */}
                        <path
                          className="zoom-maydoncha"
                          fill={q.rang}
                          d={
                            `${yol} L ${xBase(b[b.length - 1]!.i)},${yPos(0)}` +
                            ` L ${xBase(b[0]!.i)},${yPos(0)} Z`
                          }
                        />
                        <path className="zoom-yol" stroke={q.rang} d={yol} />
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </g>

          <defs>
            <clipPath id="zoom-clip">
              <rect x={P.chap} y={0} width={W - P.chap - P.ong} height={H} />
            </clipPath>
          </defs>

          {[0, 0.25, 0.5, 0.75, 1].map((k) => (
            <text
              key={k}
              x={P.chap - 6}
              y={yPos(max * k) + 3}
              textAnchor="end"
              className="zoom-belgi"
            >
              {Math.round(max * k)}
            </text>
          ))}
        </svg>
        <Izoh holat={izoh} />
      </div>

      <div className="zoom-belgilar" ref={belgiRef} />
    </div>
  );
}

/**
 * Doiraviy progress — bitta foizni katta va tez o'qiladigan qilib
 * ko'rsatadi. Rang ball shkalasidan: 57% sariq, 85% yashil.
 */
export function Gauge({
  foiz,
  ost,
  olcham = 108,
}: {
  foiz: number | null;
  ost?: string;
  olcham?: number;
}) {
  const R = 46;
  const C = 2 * Math.PI * R;
  const q = foiz === null ? 0 : Math.max(0, Math.min(100, foiz));
  const rang = ballRang(foiz);

  return (
    <div className="gauge" style={{ width: olcham, height: olcham }}>
      <svg viewBox="0 0 110 110" role="img" aria-label={`${foiz ?? 0}%`}>
        <circle cx="55" cy="55" r={R} className="gauge-fon" />
        <circle
          cx="55"
          cy="55"
          r={R}
          className="gauge-yoy"
          stroke={rang}
          strokeDasharray={`${(q / 100) * C} ${C}`}
          transform="rotate(-90 55 55)"
        />
        <text x="55" y="59" textAnchor="middle" className="gauge-son" style={{ fill: rang }}>
          {foiz === null ? '—' : `${Math.round(foiz)}%`}
        </text>
      </svg>
      {ost && <div className="gauge-ost">{ost}</div>}
    </div>
  );
}

/** Katta raqam + tagida izoh. Analitikaning asosiy qurilish bloki. */
export function Metrika({
  nom,
  qiymat,
  ost,
  rang: matnRang,
  delta,
}: {
  nom: string;
  qiymat: string;
  ost?: string;
  rang?: string;
  delta?: number | null;
}) {
  return (
    <div className="katak">
      <div className="nom">{nom}</div>
      <div className="qiymat" style={matnRang ? { color: matnRang } : undefined}>
        {qiymat}
      </div>
      <div className="ost">
        {delta !== undefined && delta !== null ? (
          <span className={`delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat'}`}>
            {delta > 0 ? '▲' : delta < 0 ? '▼' : ''} {Math.abs(Math.round(delta * 10) / 10)}
            {ost ? ` ${ost}` : ''}
          </span>
        ) : (
          (ost ?? '')
        )}
      </div>
    </div>
  );
}
