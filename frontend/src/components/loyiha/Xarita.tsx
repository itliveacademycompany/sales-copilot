import {
  Bell,
  ClipboardCheck,
  GraduationCap,
  PhoneCall,
  Send,
  Sparkles,
  Target,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { useMatn } from './tarjima';

/**
 * Hero'dagi "ma'lumot oqimi" xaritasi: chapda manbalar, markazda AI tahlil,
 * o'ngda natijalar. Chiziqlar bo'ylab paketlar oqadi (CSS `offset-path`).
 *
 * Sahna qat'iy loyiha o'lchamida (KADR_W × KADR_H) chiziladi va joyga
 * `--k` masshtab bilan sig'diriladi — shunda egri chiziqlar va tugunlar
 * har qanday kenglikda bir-biriga aniq tushadi. LoginSahna bilan bir xil usul.
 */

const KADR_W = 520;
const KADR_H = 440;

const MARKAZ = { x: 260, y: 220, r: 52 };
const TUGUN_W = 154;

interface Tugun {
  ikon: ReactNode;
  y: number;
  /** Semantik rang klassi (faqat natijalar uchun). */
  rang?: string;
}

/** Tugunlar joylashuvi; nomlari joriy tilda `tarjima.ts` dan (shu tartibda). */
const MANBALAR: Tugun[] = [
  { ikon: <Send />, y: 96 },
  { ikon: <PhoneCall />, y: 220 },
  { ikon: <Upload />, y: 344 },
];

const NATIJALAR: Tugun[] = [
  { ikon: <Target />, y: 64, rang: 'yashil' },
  { ikon: <ClipboardCheck />, y: 172, rang: 'binafsha' },
  { ikon: <Bell />, y: 268, rang: 'qizil' },
  { ikon: <GraduationCap />, y: 376, rang: 'kok' },
];

const CHAP_X = 12 + TUGUN_W / 2;
const ONG_X = KADR_W - 12 - TUGUN_W / 2;

/** Manba tugunining o'ng chetidan markazning chap chetiga — silliq S-egri. */
function kirish(y: number): string {
  const x0 = CHAP_X + TUGUN_W / 2;
  const x1 = MARKAZ.x - MARKAZ.r;
  const o = (x1 - x0) / 2;
  return `M${x0} ${y} C ${x0 + o} ${y}, ${x1 - o} ${MARKAZ.y}, ${x1} ${MARKAZ.y}`;
}

/** Markazning o'ng chetidan natija tugunining chap chetiga. */
function chiqish(y: number): string {
  const x0 = MARKAZ.x + MARKAZ.r;
  const x1 = ONG_X - TUGUN_W / 2;
  const o = (x1 - x0) / 2;
  return `M${x0} ${MARKAZ.y} C ${x0 + o} ${MARKAZ.y}, ${x1 - o} ${y}, ${x1} ${y}`;
}

function paket(d: string, kechikish: number): CSSProperties {
  return { offsetPath: `path('${d}')`, animationDelay: `${kechikish}s` } as CSSProperties;
}

function TugunKarta({ t, matn, x, tur }: { t: Tugun; matn: { nom: string; izoh: string }; x: number; tur: 'manba' | 'natija' }) {
  return (
    <div
      className={`ly-tugun ${tur}${t.rang ? ` ${t.rang}` : ''}`}
      style={{ left: x, top: t.y, width: TUGUN_W }}
    >
      <span className="ly-tugun-ikon">{t.ikon}</span>
      <span className="ly-tugun-matn">
        <b>{matn.nom}</b>
        <small>{matn.izoh}</small>
      </span>
    </div>
  );
}

export function Xarita() {
  const m = useMatn().xarita;
  const ildizRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ildiz = ildizRef.current;
    if (!ildiz) return;
    const kuzatuvchi = new ResizeObserver(() => {
      const k = ildiz.getBoundingClientRect().width / KADR_W;
      ildiz.style.setProperty('--k', Math.max(0.3, k).toFixed(4));
    });
    kuzatuvchi.observe(ildiz);
    return () => kuzatuvchi.disconnect();
  }, []);

  const kirishlar = MANBALAR.map((t) => kirish(t.y));
  const chiqishlar = NATIJALAR.map((n) => chiqish(n.y));

  return (
    <div className="ly-xarita">
      <div className="ly-xarita-bosh">
        <span>{m.sarlavha}</span>
        <span className="ly-jonli">
          <i /> {m.jonli}
        </span>
      </div>

      <div className="ly-xarita-joy" ref={ildizRef} aria-hidden="true">
        <div className="ly-xarita-kadr" style={{ width: KADR_W, height: KADR_H }}>
          <svg className="ly-xarita-chiziqlar" viewBox={`0 0 ${KADR_W} ${KADR_H}`} width={KADR_W} height={KADR_H}>
            {[...kirishlar, ...chiqishlar].map((d, i) => (
              <g key={i}>
                <path className="iz" d={d} />
                <path className="oqim" d={d} style={{ animationDelay: `${-i * 0.35}s` }} />
              </g>
            ))}
          </svg>

          {/* Kirish paketlari markazga, chiqishlari — undan keyin natijalarga */}
          {kirishlar.map((d, i) => (
            <span key={`k${i}`} className="ly-paket kirish" style={paket(d, i * 0.9)} />
          ))}
          {chiqishlar.map((d, i) => (
            <span key={`c${i}`} className="ly-paket chiqish" style={paket(d, 1.4 + i * 0.7)} />
          ))}

          {MANBALAR.map((t, i) => (
            <TugunKarta key={i} t={t} matn={m.manbalar[i]!} x={CHAP_X} tur="manba" />
          ))}

          <div className="ly-markaz" style={{ left: MARKAZ.x, top: MARKAZ.y }}>
            <span className="ly-markaz-halqa" />
            <span className="ly-markaz-halqa ikkinchi" />
            <span className="ly-markaz-yuz">
              <span className="logo-belgi katta">
                <Sparkles />
              </span>
            </span>
            <span className="ly-markaz-nom">
              <b>{m.markaz.nom}</b>
              <small>{m.markaz.izoh}</small>
            </span>
          </div>

          {NATIJALAR.map((t, i) => (
            <TugunKarta key={i} t={t} matn={m.natijalar[i]!} x={ONG_X} tur="natija" />
          ))}
        </div>
      </div>
    </div>
  );
}
