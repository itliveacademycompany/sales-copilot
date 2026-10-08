import { useLayoutEffect, useRef, useState, type MouseEvent as SichqonchaHodisa, type ReactNode } from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANALITIKA GRAFIKLARI — kutubxonasiz, SVG
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Qoidalar (dataviz yo'riqnomasi):
 *   • bitta Y o'qi — ikki xil o'lchamli ko'rsatkich ikki alohida grafikda;
 *   • ingichka belgilar: 2px chiziq, ≥8px nuqta, ustun uchi 4px yumaloq;
 *   • to'ldirilgan bo'laklar orasida 2px fon rangidagi oraliq;
 *   • har grafikda hover maslahati (tooltip) — aniq qiymat shu yerda;
 *   • ≥2 seriyada legenda doim bor; matn seriya rangida emas, matn rangida.
 *
 * Ranglar CSS o'zgaruvchilarida (`--s1…`, `--seq-*`, `--lid-*`) — yorug' va
 * qorong'i rejim qiymatlari validatorda tekshirilgan (styles.css izohi).
 */

/** Konteyner kengligi — SVG shunga moslab chiziladi (piksel aniqligida). */
function useKenglik<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [kenglik, setKenglik] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const yangila = () => setKenglik(el.clientWidth);
    yangila();
    const k = new ResizeObserver(yangila);
    k.observe(el);
    return () => k.disconnect();
  }, []);
  return { ref, kenglik };
}

interface Maslahat {
  x: number;
  y: number;
  ichki: ReactNode;
}

/** Chetga yaqin nuqtada oyna konteynerdan chiqib kesilmasligi uchun suriladi. */
function MaslahatOyna({ m }: { m: Maslahat | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [siljish, setSiljish] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    const ota = el?.offsetParent as HTMLElement | null;
    if (!el || !ota || !m) return;
    const yarim = el.offsetWidth / 2;
    const chap = m.x - yarim;
    const ong = m.x + yarim - ota.clientWidth;
    setSiljish(chap < 0 ? -chap : ong > 0 ? -ong : 0);
  }, [m]);
  if (!m) return null;
  return (
    <div ref={ref} className="g-maslahat" style={{ left: m.x + siljish, top: m.y }} role="tooltip">
      {m.ichki}
    </div>
  );
}

const yaxlit = (v: number, n = 1) => Math.round(v * 10 ** n) / 10 ** n;

// ─── CHIZIQLI GRAFIK (bitta seriya) ─────────────────────────────────────────

export interface Nuqta {
  nom: string;
  qiymat: number | null;
  /** Maslahatda qo'shimcha qator (masalan "12 ta suhbat"). */
  izoh?: string;
}

export function ChiziqliGrafik({
  nuqtalar,
  birlik = '',
  yMax,
  rang = 'var(--s1)',
  balandlik = 220,
  nom,
}: {
  nuqtalar: Nuqta[];
  birlik?: string;
  /** Y o'qining yuqori chegarasi (masalan foiz uchun 100). Berilmasa ma'lumotdan. */
  yMax?: number;
  rang?: string;
  balandlik?: number;
  nom: string;
}) {
  const { ref, kenglik } = useKenglik<HTMLDivElement>();
  const [faol, setFaol] = useState<number | null>(null);
  const CHAP = 42;
  const ONG = 14;
  const TEPA = 14;
  const PAST = 28;
  const w = Math.max(0, kenglik - CHAP - ONG);
  const h = balandlik - TEPA - PAST;
  const qiymatlar = nuqtalar.map((n) => n.qiymat).filter((v): v is number => v !== null);
  const max = yMax ?? Math.max(1, ...qiymatlar.map((v) => v * 1.15));
  const n = nuqtalar.length;
  const x = (i: number) => CHAP + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => TEPA + h - (v / max) * h;
  const belgiOraliq = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(w / 70))));

  // Bo'sh (null) nuqtada chiziq uziladi — yo'q ma'lumot nolga aylanmasin
  const qismlar: string[] = [];
  let joriy: string[] = [];
  nuqtalar.forEach((p, i) => {
    if (p.qiymat === null) {
      if (joriy.length) qismlar.push(joriy.join(' L'));
      joriy = [];
    } else joriy.push(`${x(i).toFixed(1)},${y(p.qiymat).toFixed(1)}`);
  });
  if (joriy.length) qismlar.push(joriy.join(' L'));

  const fp = faol !== null ? nuqtalar[faol] : null;

  return (
    <div className="g-qobiq" ref={ref}>
      {kenglik > 0 && (
        <svg
          width={kenglik}
          height={balandlik}
          role="img"
          aria-label={`${nom}: ${nuqtalar.map((p) => `${p.nom} ${p.qiymat ?? 'yo\'q'}`).join(', ')}`}
          onMouseLeave={() => setFaol(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const mx = e.clientX - r.left - CHAP;
            const i = n <= 1 ? 0 : Math.round((mx / w) * (n - 1));
            setFaol(Math.max(0, Math.min(n - 1, i)));
          }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((k) => (
            <g key={k}>
              <line className="g-tor" x1={CHAP} x2={CHAP + w} y1={TEPA + h - k * h} y2={TEPA + h - k * h} />
              <text className="g-yorliq" x={CHAP - 8} y={TEPA + h - k * h + 4} textAnchor="end">
                {yaxlit(max * k, max < 10 ? 1 : 0)}
                {birlik}
              </text>
            </g>
          ))}
          {nuqtalar.map((p, i) =>
            i % belgiOraliq === 0 || i === n - 1 ? (
              <text key={p.nom + i} className="g-yorliq" x={x(i)} y={balandlik - 8} textAnchor="middle">
                {p.nom}
              </text>
            ) : null,
          )}
          {faol !== null && (
            <line className="g-krosh" x1={x(faol)} x2={x(faol)} y1={TEPA} y2={TEPA + h} />
          )}
          {qismlar.map((d, i) => (
            <path key={i} d={`M${d}`} fill="none" stroke={rang} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {nuqtalar.map((p, i) =>
            p.qiymat === null ? null : (
              <circle
                key={i}
                className="g-nuqta"
                cx={x(i)}
                cy={y(p.qiymat)}
                r={faol === i ? 5.5 : 4}
                fill={rang}
              />
            ),
          )}
        </svg>
      )}
      <MaslahatOyna
        m={
          fp && faol !== null
            ? {
                x: x(faol),
                y: fp.qiymat === null ? TEPA + h / 2 : y(fp.qiymat),
                ichki: (
                  <>
                    <b>{fp.nom}</b>
                    <span>
                      <i className="g-belgi" style={{ background: rang }} />
                      {nom}: {fp.qiymat === null ? 'ma\'lumot yo\'q' : `${yaxlit(fp.qiymat)}${birlik}`}
                    </span>
                    {fp.izoh && <small>{fp.izoh}</small>}
                  </>
                ),
              }
            : null
        }
      />
    </div>
  );
}

// ─── KO'P SERIYALI CHIZIQLI GRAFIK (bitta o'q, bir xil o'lchov) ─────────────

export interface ChiziqSeriya {
  kalit: string;
  nom: string;
  rang: string;
  /** `belgilar` bilan bir xil uzunlikda; null — shu nuqtada ma'lumot yo'q. */
  qiymatlar: (number | null)[];
  /** Maslahatdagi qo'shimcha izoh (masalan "2 ta qo'ng'iroq"). */
  izohlar?: (string | null)[];
}

/**
 * Monoton kubik egri chiziq (Fritsch–Carlson). Oddiy silliqlashdan farqi:
 * nuqtalar orasida "do'ng" hosil qilmaydi — chiziq hech qachon haqiqiy
 * qiymatdan yuqori yoki past ketmaydi (masalan 100% dan oshmaydi).
 */
function silliqYol(p: [number, number][]): string {
  const n = p.length;
  if (n === 0) return '';
  if (n === 1) return `M${p[0]![0]},${p[0]![1]}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(p[i + 1]![0] - p[i]![0]);
    m.push((p[i + 1]![1] - p[i]![1]) / dx[i]!);
  }
  const t: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2);
  t.push(m[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i]! / m[i]!;
    const b = t[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i]!;
      t[i + 1] = k * b * m[i]!;
    }
  }
  let d = `M${p[0]![0].toFixed(1)},${p[0]![1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3;
    d += ` C${(p[i]![0] + h).toFixed(1)},${(p[i]![1] + t[i]! * h).toFixed(1)} ${(p[i + 1]![0] - h).toFixed(1)},${(p[i + 1]![1] - t[i + 1]! * h).toFixed(1)} ${p[i + 1]![0].toFixed(1)},${p[i + 1]![1].toFixed(1)}`;
  }
  return d;
}

export function KopChiziqliGrafik({
  belgilar,
  seriyalar,
  birlik = '',
  yMax,
  balandlik = 300,
  nom,
  maydon = false,
}: {
  belgilar: string[];
  seriyalar: ChiziqSeriya[];
  birlik?: string;
  yMax?: number;
  balandlik?: number;
  nom: string;
  /** Chiziq ostini yengil gradient bilan to'ldirish (hajm ko'rsatkichlari uchun). */
  maydon?: boolean;
}) {
  const { ref, kenglik } = useKenglik<HTMLDivElement>();
  const [faol, setFaol] = useState<number | null>(null);
  const [ajratilgan, setAjratilgan] = useState<string | null>(null);
  const gradBosh = useRef(`kc-${Math.random().toString(36).slice(2, 8)}`).current;
  const oynaRef = useRef<HTMLDivElement>(null);
  const [oynaEni, setOynaEni] = useState(200);
  const CHAP = 46;
  const ONG = 20;
  const TEPA = 14;
  const PAST = 40;
  const w = Math.max(0, kenglik - CHAP - ONG);
  const h = balandlik - TEPA - PAST;
  const barcha = seriyalar.flatMap((s) => s.qiymatlar).filter((v): v is number => v !== null);
  // yMax berilmasa — yumaloq butun qadam (kichik qiymatlarda "1, 1, 3, 3" takrorlanmasin)
  const engKatta = Math.max(1, ...barcha);
  const qadamY = yMax ? yMax / 5 : [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((q) => engKatta / q <= 5) ?? Math.ceil(engKatta / 5);
  const max = yMax ?? Math.ceil((engKatta * 1.08) / qadamY) * qadamY;
  const tiklar = Array.from({ length: Math.round(max / qadamY) + 1 }, (_, i) => (i * qadamY) / max);
  const n = belgilar.length;
  const x = (i: number) => CHAP + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => TEPA + h - (v / max) * h;
  const belgiOraliq = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(w / 84))));

  // Null nuqtada chiziq uziladi — har uzluksiz bo'lak alohida silliq yo'l
  const yollar = (q: (number | null)[]) => {
    const natija: string[] = [];
    let joriy: [number, number][] = [];
    q.forEach((v, i) => {
      if (v === null) {
        if (joriy.length > 1) natija.push(silliqYol(joriy));
        joriy = [];
      } else joriy.push([x(i), y(v)]);
    });
    if (joriy.length > 1) natija.push(silliqYol(joriy));
    return natija;
  };
  const xira = (k: string) => ajratilgan !== null && ajratilgan !== k;

  useLayoutEffect(() => {
    if (oynaRef.current) setOynaEni(oynaRef.current.offsetWidth);
  }, [faol]);

  // Oyna krosh chizig'ining o'ng tomonida; sig'masa — chap tomonida
  const OYNA_ORALIQ = 14;
  const oynaChap =
    faol === null ? 0 : x(faol) + OYNA_ORALIQ + oynaEni > kenglik ? x(faol) - OYNA_ORALIQ - oynaEni : x(faol) + OYNA_ORALIQ;
  const faolBelgi = faol !== null ? belgilar[faol]! : '';
  const belgiEni = faolBelgi.length * 6.6 + 24;
  // Yorliq karta chetidan chiqmasin
  const belgiX = faol === null ? 0 : Math.min(Math.max(x(faol), belgiEni / 2 + 1), kenglik - belgiEni / 2 - 1);

  return (
    <div className="g-qobiq" ref={ref}>
      {kenglik > 0 && (
        <svg
          width={kenglik}
          height={balandlik}
          role="img"
          aria-label={nom}
          onMouseLeave={() => setFaol(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const i = n <= 1 ? 0 : Math.round(((e.clientX - r.left - CHAP) / w) * (n - 1));
            setFaol(Math.max(0, Math.min(n - 1, i)));
          }}
        >
          {tiklar.map((k) => (
            <g key={k}>
              <line className="g-tor" x1={CHAP} x2={CHAP + w} y1={TEPA + h - k * h} y2={TEPA + h - k * h} />
              <text className="g-yorliq" x={CHAP - 8} y={TEPA + h - k * h + 4} textAnchor="end">
                {yaxlit(max * k, 0)}
                {birlik}
              </text>
            </g>
          ))}
          {belgilar.map((b, i) =>
            (i % belgiOraliq === 0 || i === n - 1) && i !== faol ? (
              <g key={b + i}>
                <line className="g-tor" x1={x(i)} x2={x(i)} y1={TEPA + h} y2={TEPA + h + 5} />
                <text className="g-yorliq" x={x(i)} y={TEPA + h + 22} textAnchor="middle">
                  {b}
                </text>
              </g>
            ) : null,
          )}
          {faol !== null && (
            <>
              <line className="g-krosh" x1={x(faol)} x2={x(faol)} y1={TEPA} y2={TEPA + h} />
              {/* O'q ostidagi ajratilgan sana */}
              <g className="g-faol-belgi">
                <path d={`M${x(faol) - 5},${TEPA + h + 7} L${x(faol)},${TEPA + h + 2} L${x(faol) + 5},${TEPA + h + 7} Z`} />
                <rect x={belgiX - belgiEni / 2} y={TEPA + h + 7} width={belgiEni} height={24} rx={6} />
                <text x={belgiX} y={TEPA + h + 23} textAnchor="middle">
                  {faolBelgi}
                </text>
              </g>
            </>
          )}
          {maydon && (
            <defs>
              {seriyalar.map((s, i) => (
                <linearGradient key={s.kalit} id={`${gradBosh}-${i}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor={s.rang} stopOpacity="0.22" />
                  <stop offset="100%" stopColor={s.rang} stopOpacity="0" />
                </linearGradient>
              ))}
            </defs>
          )}
          {seriyalar.map((s, si) => (
            <g key={s.kalit} opacity={xira(s.kalit) ? 0.18 : 1} style={{ transition: 'opacity 0.15s' }}>
              {maydon &&
                yollar(s.qiymatlar).map((d, i) => {
                  // Yo'lning birinchi va oxirgi nuqtasi X'i — maydonni o'qqa yopish uchun
                  const nums = d.match(/-?[\d.]+/g)!.map(Number);
                  const x0 = nums[0]!;
                  const x1 = nums[nums.length - 2]!;
                  return <path key={`m${i}`} d={`${d} L${x1},${TEPA + h} L${x0},${TEPA + h} Z`} fill={`url(#${gradBosh}-${si})`} />;
                })}
              {yollar(s.qiymatlar).map((d, i) => (
                <path key={i} d={d} fill="none" stroke={s.rang} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ))}
              {s.qiymatlar.map((v, i) =>
                v === null ? null : (
                  <circle key={i} className="g-nuqta" cx={x(i)} cy={y(v)} r={faol === i ? 6 : 3.5} fill={s.rang} />
                ),
              )}
            </g>
          ))}
        </svg>
      )}
      {faol !== null && (
        <div ref={oynaRef} className="g-kop-maslahat" role="tooltip" style={{ left: Math.max(0, oynaChap), top: TEPA + 16 }}>
          <div className="g-kop-maslahat-bosh">{faolBelgi}</div>
          {seriyalar.map((s) => {
            const v = s.qiymatlar[faol];
            return (
              <div key={s.kalit} className="g-kop-maslahat-qator">
                <i style={{ background: s.rang }} />
                <span>{s.nom}:</span>
                <b>{v === null || v === undefined ? '—' : `${Math.round(v)}${birlik}`}</b>
                {s.izohlar?.[faol] && <small>{s.izohlar[faol]}</small>}
              </div>
            );
          })}
        </div>
      )}
      {seriyalar.length > 1 && (
        <div className="g-legenda g-legenda-doira">
          {seriyalar.map((s) => (
            <span
              key={s.kalit}
              className="g-legenda-tugma"
              onMouseEnter={() => setAjratilgan(s.kalit)}
              onMouseLeave={() => setAjratilgan(null)}
            >
              <i style={{ background: s.rang }} />
              {s.nom}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TAQSIMOT EGRI CHIZIG'I (raqamli javoblar: qiymat → necha marta) ────────

/**
 * Javoblar taqsimoti silliq maydon bilan. O'rtacha qiymat vertikal uzuq
 * chiziq bilan belgilanadi. X o'qi qiymatlar bo'yicha, lekin faqat
 * uchragan qiymatlar (siyrak oraliqlar siqiladi: 5,6,…,24, 37, 40).
 */
export function TaqsimotGrafik({
  nuqtalar,
  ortacha,
  birlik = '',
  balandlik = 230,
  rang = 'var(--s1)',
  nom,
}: {
  nuqtalar: { qiymat: number; soni: number }[];
  ortacha: number;
  birlik?: string;
  balandlik?: number;
  rang?: string;
  nom: string;
}) {
  const { ref, kenglik } = useKenglik<HTMLDivElement>();
  const [faol, setFaol] = useState<number | null>(null);
  const gradId = useRef(`tq-${Math.random().toString(36).slice(2, 8)}`).current;
  const CHAP = 40;
  const ONG = 14;
  const TEPA = 22;
  const PAST = 40;
  const w = Math.max(0, kenglik - CHAP - ONG);
  const h = balandlik - TEPA - PAST;
  const n = nuqtalar.length;
  const engKatta = Math.max(1, ...nuqtalar.map((p) => p.soni));
  const qadamY = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((q) => engKatta / q <= 4) ?? Math.ceil(engKatta / 4);
  const max = Math.ceil((engKatta * 1.08) / qadamY) * qadamY;
  const x = (i: number) => CHAP + (n <= 1 ? w / 2 : (i / (n - 1)) * w);
  const y = (v: number) => TEPA + h - (v / max) * h;
  const yol = n > 1 ? silliqYol(nuqtalar.map((p, i) => [x(i), y(p.soni)])) : '';
  const maydon = yol ? `${yol} L${x(n - 1)},${TEPA + h} L${x(0)},${TEPA + h} Z` : '';
  // O'rtacha qiymat qaysi ikki nuqta orasida — chiziqli interpolyatsiya
  const ortaI = (() => {
    if (n <= 1) return 0;
    const j = nuqtalar.findIndex((p) => p.qiymat >= ortacha);
    if (j <= 0) return Math.max(0, j);
    const a = nuqtalar[j - 1]!.qiymat;
    const b = nuqtalar[j]!.qiymat;
    return j - 1 + (ortacha - a) / Math.max(1e-9, b - a);
  })();
  const belgiOraliq = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(w / 34))));
  const chiziqlar = Array.from({ length: Math.round(max / qadamY) + 1 }, (_, i) => i * qadamY);
  const fp = faol !== null ? nuqtalar[faol] : null;
  const yaxlitO = Math.round(ortacha * 10) / 10;

  return (
    <div className="g-qobiq" ref={ref}>
      {kenglik > 0 && (
        <svg
          width={kenglik}
          height={balandlik}
          role="img"
          aria-label={`${nom}: o'rtacha ${yaxlitO}`}
          onMouseLeave={() => setFaol(null)}
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const i = n <= 1 ? 0 : Math.round(((e.clientX - r.left - CHAP) / w) * (n - 1));
            setFaol(Math.max(0, Math.min(n - 1, i)));
          }}
        >
          <defs>
            <linearGradient id={gradId} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={rang} stopOpacity="0.28" />
              <stop offset="100%" stopColor={rang} stopOpacity="0" />
            </linearGradient>
          </defs>
          {chiziqlar.map((v) => (
            <g key={v}>
              <line className="g-tor" x1={CHAP} x2={CHAP + w} y1={y(v)} y2={y(v)} />
              <text className="g-yorliq" x={CHAP - 8} y={y(v) + 4} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {nuqtalar.map((p, i) =>
            i % belgiOraliq === 0 || i === n - 1 ? (
              <g key={p.qiymat}>
                <line className="g-tor" x1={x(i)} x2={x(i)} y1={TEPA + h} y2={TEPA + h + 4} />
                <text className="g-yorliq" x={x(i)} y={TEPA + h + 14} textAnchor="end" transform={`rotate(-45 ${x(i)} ${TEPA + h + 14})`}>
                  {p.qiymat}
                </text>
              </g>
            ) : null,
          )}
          {maydon && <path d={maydon} fill={`url(#${gradId})`} />}
          {yol && <path d={yol} fill="none" stroke={rang} strokeWidth={2} strokeLinejoin="round" />}
          {n === 1 && <circle cx={x(0)} cy={y(nuqtalar[0]!.soni)} r={5} fill={rang} className="g-nuqta" />}
          {/* O'rtacha qiymat belgisi */}
          <line className="g-krosh g-ortacha" x1={x(ortaI)} x2={x(ortaI)} y1={TEPA} y2={TEPA + h} />
          <text className="g-ortacha-yorliq" x={x(ortaI)} y={TEPA - 8} textAnchor="middle">
            O'rtacha: {yaxlitO}
            {birlik}
          </text>
          {faol !== null && fp && (
            <>
              <line className="g-krosh" x1={x(faol)} x2={x(faol)} y1={TEPA} y2={TEPA + h} />
              <circle cx={x(faol)} cy={y(fp.soni)} r={5.5} fill={rang} className="g-nuqta" />
            </>
          )}
        </svg>
      )}
      <MaslahatOyna
        m={
          fp && faol !== null
            ? {
                x: x(faol),
                y: y(fp.soni),
                ichki: (
                  <>
                    <b>
                      {fp.qiymat}
                      {birlik}
                    </b>
                    <span>
                      <i className="g-belgi" style={{ background: rang }} />
                      {fp.soni} ta javob
                    </span>
                  </>
                ),
              }
            : null
        }
      />
    </div>
  );
}

// ─── GORIZONTAL USTUNLAR ────────────────────────────────────────────────────

/** Gorizontal ustunlar — uzun nomli turkumlar uchun (o'qilishi oson). */
export function GorizontalUstun({ royxat, rang }: { royxat: { nom: string; soni: number }[]; rang: string }) {
  const engKatta = Math.max(1, ...royxat.map((x) => x.soni));
  const qadam = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((q) => engKatta / q <= 7) ?? Math.ceil(engKatta / 7);
  const max = Math.ceil(engKatta / qadam) * qadam;
  const belgilar = Array.from({ length: max / qadam + 1 }, (_, i) => i * qadam);
  return (
    <div className="mt-gor">
      <div className="mt-gor-tana">
        <div className="mt-gor-tor" aria-hidden="true">
          {belgilar.map((b) => (
            <span key={b} style={{ left: `${(b / max) * 100}%` }} />
          ))}
        </div>
        {royxat.map((x) => (
          <div key={x.nom} className="mt-gor-qator" title={`${x.nom}: ${x.soni}`}>
            <span className="mt-gor-nom">{x.nom}</span>
            <span className="mt-gor-joy">
              <span className="mt-gor-ustun" style={{ width: `${(x.soni / max) * 100}%`, background: rang }}>
                <b>{x.soni}</b>
              </span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-gor-oq">
        <span />
        <span className="mt-gor-belgilar">
          {belgilar.map((b) => (
            <i key={b} style={{ left: `${(b / max) * 100}%` }}>
              {b}
            </i>
          ))}
        </span>
      </div>
    </div>
  );
}


// ─── GURUHLI USTUNLI GRAFIK (seriyalar yonma-yon — solishtirish uchun) ──────

/**
 * Ustma-ust emas, yonma-yon: "yaratildi" va "bajarildi" kabi bir xil
 * o'lchovdagi ikki qiymatni har bo'lakda to'g'ridan-to'g'ri solishtirish.
 */
export function GuruhliUstunGrafik({
  ustunlar,
  seriyalar,
  balandlik = 260,
  birlik = '',
  nom,
}: {
  ustunlar: Ustun[];
  seriyalar: Seriya[];
  balandlik?: number;
  birlik?: string;
  nom: string;
}) {
  const { ref, kenglik } = useKenglik<HTMLDivElement>();
  const [faol, setFaol] = useState<number | null>(null);
  const CHAP = 40;
  const ONG = 8;
  const TEPA = 12;
  const PAST = 30;
  const w = Math.max(0, kenglik - CHAP - ONG);
  const h = balandlik - TEPA - PAST;
  const engKatta = Math.max(1, ...ustunlar.flatMap((u) => seriyalar.map((s) => u.qiymatlar[s.kalit] ?? 0)));
  // O'q bo'linmasi "yumaloq" son bo'lsin: 0, 20, 40...
  const qadamY = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((q) => engKatta / q <= 4) ?? Math.ceil(engKatta / 4);
  const max = Math.ceil(engKatta / qadamY) * qadamY;
  const n = ustunlar.length;
  const qadam = n > 0 ? w / n : 0;
  const ORALIQ = 2;
  const en = Math.max(3, Math.min(30, (qadam * 0.7 - ORALIQ * (seriyalar.length - 1)) / seriyalar.length));
  const guruhEni = en * seriyalar.length + ORALIQ * (seriyalar.length - 1);
  const belgiOraliq = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(w / 56))));
  const fu = faol !== null ? ustunlar[faol] : null;
  const chiziqlar = Array.from({ length: Math.round(max / qadamY) + 1 }, (_, i) => i * qadamY);

  const ustun = (x0: number, v: number, rang: string, k: string) => {
    if (v <= 0) return null;
    const bh = Math.max(2, (v / max) * h);
    const y0 = TEPA + h - bh;
    const r = Math.min(4, en / 2, bh);
    return (
      <path
        key={k}
        d={`M${x0},${TEPA + h} V${y0 + r} Q${x0},${y0} ${x0 + r},${y0} H${x0 + en - r} Q${x0 + en},${y0} ${x0 + en},${y0 + r} V${TEPA + h} Z`}
        fill={rang}
        pointerEvents="none"
      />
    );
  };

  return (
    <div className="g-qobiq" ref={ref}>
      {seriyalar.length > 1 && (
        <div className="g-legenda g-legenda-doira g-legenda-chap">
          {seriyalar.map((s) => (
            <span key={s.kalit}>
              <i style={{ background: s.rang }} />
              {s.nom}
            </span>
          ))}
        </div>
      )}
      {kenglik > 0 && (
        <svg width={kenglik} height={balandlik} role="img" aria-label={nom} onMouseLeave={() => setFaol(null)}>
          {chiziqlar.map((v) => (
            <g key={v}>
              <line className="g-tor" x1={CHAP} x2={CHAP + w} y1={TEPA + h - (v / max) * h} y2={TEPA + h - (v / max) * h} />
              <text className="g-yorliq" x={CHAP - 8} y={TEPA + h - (v / max) * h + 4} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {ustunlar.map((u, i) => {
            const cx = CHAP + qadam * i + qadam / 2;
            const x0 = cx - guruhEni / 2;
            return (
              <g key={u.nom + i}>
                <rect x={CHAP + qadam * i} y={TEPA} width={qadam} height={h} fill="transparent" onMouseEnter={() => setFaol(i)} />
                {faol === i && <rect className="g-hover-fon" x={CHAP + qadam * i + 2} y={TEPA} width={qadam - 4} height={h} rx={6} />}
                {seriyalar.map((s, j) => ustun(x0 + j * (en + ORALIQ), u.qiymatlar[s.kalit] ?? 0, s.rang, s.kalit))}
                {(i % belgiOraliq === 0 || i === n - 1) && (
                  <text className="g-yorliq" x={cx} y={balandlik - 8} textAnchor="middle">
                    {u.nom}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      <MaslahatOyna
        m={
          fu && faol !== null
            ? {
                x: CHAP + qadam * faol + qadam / 2,
                y: TEPA + h - (Math.max(...seriyalar.map((s) => fu.qiymatlar[s.kalit] ?? 0)) / max) * h,
                ichki: (
                  <>
                    <b>{fu.nom}</b>
                    {seriyalar.map((s) => (
                      <span key={s.kalit}>
                        <i className="g-belgi" style={{ background: s.rang }} />
                        {s.nom}: {fu.qiymatlar[s.kalit] ?? 0}
                        {birlik}
                      </span>
                    ))}
                  </>
                ),
              }
            : null
        }
      />
    </div>
  );
}

// ─── DONUT ──────────────────────────────────────────────────────────────────

export interface Bolak {
  kalit: string;
  nom: string;
  qiymat: number;
  rang: string;
}

/** Fon rangiga qarab o'qiladigan matn rangi (WCAG nisbiy yorug'lik bo'yicha). */
function matnRangi(rgb: string): string {
  const m = rgb.match(/\d+(\.\d+)?/g);
  if (!m || m.length < 3) return '#fff';
  const [r, g, b] = m.slice(0, 3).map((v) => {
    const c = Number(v) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const L = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  // qalin yirik raqam — WCAG yirik matn chegarasi 3:1; undan past bo'lsa to'q matn
  return 1.05 / (L + 0.05) >= 3 ? '#fff' : '#14161a';
}

const FOIZ = (f: number) => `${f.toFixed(1)}%`;

export function Donut({
  bolaklar,
  markazNom,
  saralash = false,
  ixcham = false,
  chipLegenda = false,
}: {
  bolaklar: Bolak[];
  markazNom: string;
  /** Kattadan kichikka tartiblash. Tartibli (ordinal) turkumlar uchun false qoldiring. */
  saralash?: boolean;
  /** Tor ustun uchun: kichikroq halqa, legenda pastda. */
  ixcham?: boolean;
  /** Legenda — foiz chiziqlarisiz, ixcham chiplar qatori (bitta savol kartasi uchun). */
  chipLegenda?: boolean;
}) {
  const [faol, setFaol] = useState<string | null>(null);
  const [joy, setJoy] = useState<{ x: number; y: number } | null>(null);
  const [matnRang, setMatnRang] = useState<Record<string, string>>({});
  const rasmRef = useRef<HTMLDivElement>(null);
  const bolakRef = useRef<Record<string, SVGCircleElement | null>>({});

  const tartib = saralash ? [...bolaklar].sort((a, b) => b.qiymat - a.qiymat) : bolaklar;
  const jami = tartib.reduce((s, b) => s + b.qiymat, 0);
  const bor = tartib.filter((b) => b.qiymat > 0);

  const O = ixcham ? 184 : 260; // halqa diametri
  const QALINLIK = ixcham ? 40 : 56;
  const KENGAYISH = 8; // hover'da bo'lak qalinlashadi — shu uchun chetda joy
  const C = O / 2 + KENGAYISH;
  const r = O / 2 - QALINLIK / 2;
  const aylana = 2 * Math.PI * r;
  // 2px fon rangidagi oraliq — bitta bo'lak bo'lsa kerak emas
  const oraliq = bor.length > 1 ? 2 : 0;

  // CSS o'zgaruvchidagi rangni o'qib, bo'lak ichidagi matn rangini tanlaymiz.
  // Mavzu (yorug'/qorong'i) almashsa qayta hisoblanadi.
  const rangKalit = bor.map((b) => b.kalit + b.rang).join('|');
  useLayoutEffect(() => {
    const hisobla = () => {
      const yangi: Record<string, string> = {};
      for (const b of bor) {
        const el = bolakRef.current[b.kalit];
        if (el) yangi[b.kalit] = matnRangi(getComputedStyle(el).stroke);
      }
      setMatnRang(yangi);
    };
    hisobla();
    const k = new MutationObserver(hisobla);
    k.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => k.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangKalit]);

  const harakat = (kalit: string, e: SichqonchaHodisa) => {
    const q = rasmRef.current?.getBoundingClientRect();
    setFaol(kalit);
    if (q) setJoy({ x: e.clientX - q.left, y: e.clientY - q.top });
  };
  const chiq = () => {
    setFaol(null);
    setJoy(null);
  };

  const fb = faol ? tartib.find((b) => b.kalit === faol) : undefined;
  let siljish = 0;

  return (
    <div className={`g-donut${ixcham ? " ixcham" : ""}`}>
      <div className="g-donut-rasm" ref={rasmRef}>
        <svg width={C * 2} height={C * 2} viewBox={`0 0 ${C * 2} ${C * 2}`} role="img" aria-label={`${markazNom}: ${jami}`}>
          <circle cx={C} cy={C} r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth={QALINLIK} />
          {jami > 0 &&
            bor.map((b) => {
              const uzunlik = (b.qiymat / jami) * aylana;
              const el = (
                <circle
                  key={b.kalit}
                  ref={(n) => {
                    bolakRef.current[b.kalit] = n;
                  }}
                  cx={C}
                  cy={C}
                  r={r}
                  fill="none"
                  stroke={b.rang}
                  strokeWidth={faol === b.kalit ? QALINLIK + KENGAYISH * 2 : QALINLIK}
                  strokeDasharray={`${Math.max(0.5, uzunlik - oraliq)} ${aylana}`}
                  strokeDashoffset={-siljish}
                  transform={`rotate(-90 ${C} ${C})`}
                  opacity={faol && faol !== b.kalit ? 0.4 : 1}
                  onMouseEnter={(e) => harakat(b.kalit, e)}
                  onMouseMove={(e) => harakat(b.kalit, e)}
                  onMouseLeave={chiq}
                  className="g-bolak"
                />
              );
              siljish += uzunlik;
              return el;
            })}
          {/* Bo'lak ichidagi foiz — faqat sig'adigan (≥6%) bo'laklarda */}
          {jami > 0 &&
            (() => {
              let boshi = 0;
              return bor.map((b) => {
                const ulush = b.qiymat / jami;
                const orta = (boshi + ulush / 2) * 2 * Math.PI;
                boshi += ulush;
                if (ulush < 0.06) return null;
                return (
                  <text
                    key={b.kalit}
                    className="g-donut-foiz"
                    x={C + r * Math.sin(orta)}
                    y={C - r * Math.cos(orta)}
                    fill={matnRang[b.kalit] ?? '#fff'}
                    opacity={faol && faol !== b.kalit ? 0.4 : 1}
                  >
                    {Math.round(ulush * 100)}%
                  </text>
                );
              });
            })()}
        </svg>
        <div className="g-donut-markaz" style={{ inset: KENGAYISH + QALINLIK }}>
          <b>{fb ? fb.qiymat : jami}</b>
          <span>{fb ? fb.nom : markazNom}</span>
        </div>
        {fb && joy && (
          <div
            className="g-donut-maslahat"
            role="tooltip"
            style={{ left: joy.x, top: joy.y, background: fb.rang, color: matnRang[fb.kalit] ?? '#fff' }}
          >
            {fb.nom}: <b>{fb.qiymat} • {FOIZ((fb.qiymat / jami) * 100)}</b>
          </div>
        )}
      </div>
      {chipLegenda ? (
        <div className="g-legenda g-legenda-doira g-donut-chiplar">
          {tartib
            .filter((b) => b.qiymat > 0)
            .map((b) => (
              <span
                key={b.kalit}
                className={`g-legenda-tugma${faol === b.kalit ? " faol" : ""}`}
                onMouseEnter={() => setFaol(b.kalit)}
                onMouseLeave={chiq}
              >
                <i style={{ background: b.rang }} />
                {b.nom}
              </span>
            ))}
        </div>
      ) : (
      <ul className="g-legenda-royxat">
        {tartib.map((b) => {
          const f = jami > 0 ? (b.qiymat / jami) * 100 : 0;
          return (
            <li
              key={b.kalit}
              className={[faol === b.kalit ? 'faol' : '', b.qiymat === 0 ? 'bosh' : ''].join(' ')}
              onMouseEnter={() => b.qiymat > 0 && setFaol(b.kalit)}
              onMouseLeave={chiq}
            >
              <span className="g-legenda-bosh">
                <i className="g-belgi" style={{ background: b.rang }} />
                <span className="g-legenda-nom">{b.nom}</span>
                <b>{FOIZ(f)}</b>
              </span>
              <span className="g-legenda-chiziq">
                <span style={{ width: `${f}%`, background: b.rang }} />
              </span>
              <small>{b.qiymat}</small>
            </li>
          );
        })}
      </ul>
      )}
    </div>
  );
}

// ─── USTUNLI GRAFIK (bir yoki bir necha seriya, ustma-ust) ──────────────────

export interface Seriya {
  kalit: string;
  nom: string;
  rang: string;
}

export interface Ustun {
  nom: string;
  qiymatlar: Record<string, number>;
}

export function UstunliGrafik({
  ustunlar,
  seriyalar,
  balandlik = 220,
  birlik = '',
  nom,
}: {
  ustunlar: Ustun[];
  seriyalar: Seriya[];
  balandlik?: number;
  birlik?: string;
  nom: string;
}) {
  const { ref, kenglik } = useKenglik<HTMLDivElement>();
  const [faol, setFaol] = useState<number | null>(null);
  const CHAP = 36;
  const ONG = 8;
  const TEPA = 12;
  const PAST = 28;
  const w = Math.max(0, kenglik - CHAP - ONG);
  const h = balandlik - TEPA - PAST;
  const jamlar = ustunlar.map((u) => seriyalar.reduce((s, sr) => s + (u.qiymatlar[sr.kalit] ?? 0), 0));
  // O'q bo'linmasi yumaloq butun son: kichik qiymatlarda "1, 1, 0" takrorlanmasin
  const engKatta = Math.max(1, ...jamlar);
  const qadamY = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000].find((q) => engKatta / q <= 4) ?? Math.ceil(engKatta / 4);
  const max = Math.ceil((engKatta * 1.05) / qadamY) * qadamY;
  const chiziqlar = Array.from({ length: Math.round(max / qadamY) + 1 }, (_, i) => (i * qadamY) / max);
  const n = ustunlar.length;
  const qadam = n > 0 ? w / n : 0;
  const en = Math.max(4, Math.min(44, qadam * 0.62));
  const belgiOraliq = Math.max(1, Math.ceil(n / Math.max(1, Math.floor(w / 56))));
  const fu = faol !== null ? ustunlar[faol] : null;

  return (
    <div className="g-qobiq" ref={ref}>
      {kenglik > 0 && (
        <svg width={kenglik} height={balandlik} role="img" aria-label={nom} onMouseLeave={() => setFaol(null)}>
          {chiziqlar.map((k) => (
            <g key={k}>
              <line className="g-tor" x1={CHAP} x2={CHAP + w} y1={TEPA + h - k * h} y2={TEPA + h - k * h} />
              <text className="g-yorliq" x={CHAP - 8} y={TEPA + h - k * h + 4} textAnchor="end">
                {Math.round(max * k)}
              </text>
            </g>
          ))}
          {ustunlar.map((u, i) => {
            const cx = CHAP + qadam * i + qadam / 2;
            let ust = TEPA + h;
            const korin = seriyalar.filter((s) => (u.qiymatlar[s.kalit] ?? 0) > 0);
            return (
              <g key={u.nom + i}>
                {/* Ko'rinmas keng nishon — ustun ingichka bo'lsa ham hover oson */}
                <rect
                  x={CHAP + qadam * i}
                  y={TEPA}
                  width={qadam}
                  height={h}
                  fill="transparent"
                  onMouseEnter={() => setFaol(i)}
                />
                {faol === i && <rect className="g-hover-fon" x={CHAP + qadam * i + 2} y={TEPA} width={qadam - 4} height={h} rx={6} />}
                {korin.map((s, j) => {
                  const v = u.qiymatlar[s.kalit] ?? 0;
                  const bh = (v / max) * h;
                  ust -= bh;
                  const tepasi = j === korin.length - 1;
                  // 2px oraliq: bo'laklar orasida fon rangi ko'rinadi
                  const y0 = ust + (j > 0 ? 0 : 0);
                  const bhKorin = Math.max(1, bh - (j < korin.length - 1 ? 2 : 0));
                  return (
                    <path
                      key={s.kalit}
                      d={
                        tepasi
                          ? `M${cx - en / 2},${y0 + bhKorin} V${y0 + 4} Q${cx - en / 2},${y0} ${cx - en / 2 + 4},${y0} H${cx + en / 2 - 4} Q${cx + en / 2},${y0} ${cx + en / 2},${y0 + 4} V${y0 + bhKorin} Z`
                          : `M${cx - en / 2},${y0 + bhKorin} V${y0} H${cx + en / 2} V${y0 + bhKorin} Z`
                      }
                      fill={s.rang}
                      pointerEvents="none"
                    />
                  );
                })}
                {(i % belgiOraliq === 0 || i === n - 1) && (
                  <text className="g-yorliq" x={cx} y={balandlik - 8} textAnchor="middle">
                    {u.nom}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {seriyalar.length > 1 && (
        <div className="g-legenda">
          {seriyalar.map((s) => (
            <span key={s.kalit}>
              <i className="g-belgi" style={{ background: s.rang }} />
              {s.nom}
            </span>
          ))}
        </div>
      )}
      <MaslahatOyna
        m={
          fu && faol !== null
            ? {
                x: CHAP + qadam * faol + qadam / 2,
                y: TEPA + h - (jamlar[faol]! / max) * h,
                ichki: (
                  <>
                    <b>{fu.nom}</b>
                    {seriyalar.map((s) => (
                      <span key={s.kalit}>
                        <i className="g-belgi" style={{ background: s.rang }} />
                        {s.nom}: {fu.qiymatlar[s.kalit] ?? 0}
                        {birlik}
                      </span>
                    ))}
                    {seriyalar.length > 1 && <small>Jami: {jamlar[faol]}</small>}
                  </>
                ),
              }
            : null
        }
      />
    </div>
  );
}

// ─── HAFTA × SOAT ISSIQLIK XARITASI ─────────────────────────────────────────

const KUNLAR = ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Ya'];
const KUN_TOLIQ = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];

/** `matritsa[kun][soat]` — suhbatlar soni (kun 0 = dushanba). */
export function SoatXaritasi({ matritsa }: { matritsa: number[][] }) {
  const [faol, setFaol] = useState<{ k: number; s: number } | null>(null);
  const max = Math.max(1, ...matritsa.flat());
  const daraja = (v: number) => (v === 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5)));

  return (
    <div className="g-soat">
      <div className="g-soat-grid" role="grid" aria-label="Hafta kunlari va soatlar bo'yicha suhbatlar">
        <span />
        {Array.from({ length: 24 }, (_, s) => (
          <span key={s} className="g-soat-bosh">
            {s % 3 === 0 ? s : ''}
          </span>
        ))}
        {matritsa.map((qator, k) => (
          <div key={k} className="g-soat-qator" role="row">
            <span className="g-soat-kun">{KUNLAR[k]}</span>
            {qator.map((v, s) => (
              <span
                key={s}
                role="gridcell"
                className={`g-soat-katak d${daraja(v)}${faol?.k === k && faol.s === s ? ' faol' : ''}`}
                onMouseEnter={() => setFaol({ k, s })}
                onMouseLeave={() => setFaol(null)}
                aria-label={`${KUN_TOLIQ[k]} ${s}:00 — ${v} ta suhbat`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="g-soat-pastki">
        <span className="g-soat-faol">
          {faol
            ? `${KUN_TOLIQ[faol.k]}, ${String(faol.s).padStart(2, '0')}:00–${String(faol.s + 1).padStart(2, '0')}:00 — ${matritsa[faol.k]![faol.s]} ta suhbat`
            : 'Katak ustiga olib boring — aniq son ko\'rinadi'}
        </span>
        <span className="g-soat-shkala">
          Kam
          {[1, 2, 3, 4, 5].map((d) => (
            <i key={d} className={`g-soat-katak d${d}`} />
          ))}
          Ko'p
        </span>
      </div>
    </div>
  );
}
