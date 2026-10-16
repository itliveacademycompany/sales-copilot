import {
  ArrowDown,
  ArrowRight,
  AudioLines,
  BadgeCheck,
  Bell,
  Check,
  ClipboardCheck,
  Clock,
  Flame,
  Lock,
  MessageSquareWarning,
  MessagesSquare,
  PhoneCall,
  Quote,
  ScanSearch,
  Send,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  UserRound,
  Workflow,
} from 'lucide-react';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { QADAM_MANZILLARI } from './malumot';
import { useMatn, type LandingMatn } from './tarjima';

/**
 * "Qanday ishlaydi" — skroll bilan boshqariladigan hikoya.
 *
 * Chapda qadamlar matni oddiy oqimda aylanadi, o'ngda sahna yopishib
 * (sticky) turadi va joriy qadamga qarab almashadi. Qadam — viewport
 * markazidan o'tgan oxirgi maqola. Bosqich chizig'i qadamlar orasidagi
 * oraliq bo'yicha uzluksiz to'ladi (`--p`, 0…1) — nuqtalarga aniq tushadi.
 *
 * Har sahna elementi `--i` tartib raqamiga ega: sahna faol bo'lganda ular
 * ketma-ket paydo bo'ladi (CSS transition-delay). Ikki tomonga ishlaydi —
 * orqaga aylantirilsa oldingi sahna qaytadi.
 *
 * Tor ekranda sahna yashiriladi, qadamlar oddiy kartalar bo'lib qoladi.
 * Sahnadagi ism, ball va matnlar — namuna, haqiqiy ma'lumot emas.
 * Barcha matnlar joriy tilda — `tarjima.ts`.
 */

const IKONLAR: ReactNode[] = [<Workflow />, <MessagesSquare />, <ScanSearch />, <Target />, <TrendingUp />];

type SahnaMatn = LandingMatn['jarayon']['sahna'];

const cheklash = (x: number, max = 1) => Math.min(max, Math.max(0, x));

/** Sahna elementining paydo bo'lish tartibi. */
const e = (i: number): CSSProperties => ({ '--i': i }) as CSSProperties;

export function Jarayon() {
  const m = useMatn().jarayon;
  const ildizRef = useRef<HTMLDivElement>(null);
  const qadamRef = useRef<(HTMLElement | null)[]>([]);
  const [faol, setFaol] = useState(0);

  useEffect(() => {
    const ildiz = ildizRef.current;
    if (!ildiz) return;
    let raf = 0;

    const hisobla = () => {
      raf = 0;
      const markaz = window.innerHeight / 2;
      const tepalar = qadamRef.current.map((el) => el?.getBoundingClientRect().top ?? Infinity);
      const n = tepalar.length;

      // Uzluksiz indeks: i-qadam tepasidan (i+1)-qadam tepasigacha 0→1
      let f = 0;
      for (let i = 0; i < n; i++) {
        const t = tepalar[i] ?? Infinity;
        if (t > markaz) break;
        const keyingi = tepalar[i + 1];
        f = keyingi === undefined ? i : i + cheklash((markaz - t) / (keyingi - t || 1));
      }
      ildiz.style.setProperty('--p', (f / Math.max(1, n - 1)).toFixed(4));
      setFaol(Math.min(n - 1, Math.floor(f + 0.0001)));
    };
    const sora = () => {
      if (!raf) raf = requestAnimationFrame(hisobla);
    };

    hisobla();
    window.addEventListener('scroll', sora, { passive: true });
    window.addEventListener('resize', sora);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', sora);
      window.removeEventListener('resize', sora);
    };
  }, []);

  const qadamgaBor = (i: number) => {
    const silliq = window.matchMedia('(prefers-reduced-motion: no-preference)').matches;
    qadamRef.current[i]?.scrollIntoView({ behavior: silliq ? 'smooth' : 'auto', block: 'center' });
  };

  const joriy = m.qadamlar[faol] ?? m.qadamlar[0];
  const raqam = (i: number) => String(i + 1).padStart(2, '0');

  return (
    <div className="ly-jarayon" ref={ildizRef}>
      {/* ─── Chap: qadamlar matni ─── */}
      <div className="ly-qadamlar">
        {m.qadamlar.map((q, i) => {
          const manzil = QADAM_MANZILLARI[i];
          return (
            <article
              key={i}
              ref={(el) => {
                qadamRef.current[i] = el;
              }}
              className={`ly-qadam${i === faol ? ' faol' : ''}${i < faol ? ' otdi' : ''}`}
            >
              <div className="ly-qadam-bosh">
                <span className="ly-qadam-raqam">{raqam(i)}</span>
                <span className="ly-qadam-ikon" aria-hidden="true">
                  {IKONLAR[i]}
                </span>
              </div>
              <h3>{q.nom}</h3>
              <p>{q.matn}</p>
              <ul>
                {q.bandlar.map((b) => (
                  <li key={b}>
                    <Check aria-hidden="true" /> {b}
                  </li>
                ))}
              </ul>
              {manzil && q.joy ? (
                <Link to={manzil} className="ly-joy">
                  {q.joy} <ArrowRight aria-hidden="true" />
                </Link>
              ) : (
                <span className="ly-joy avto">
                  <Sparkles aria-hidden="true" /> {m.avto}
                </span>
              )}
            </article>
          );
        })}
      </div>

      {/* ─── O'ng: yopishqoq sahna va bosqich chizig'i ─── */}
      <div className="ly-sahna-ustun">
        <div className="ly-sahna">
          <div className="ly-kadr" aria-hidden="true">
            <div className="ly-kadr-bosh">
              <span className="ly-kadr-ikon">{IKONLAR[faol]}</span>
              <span className="ly-kadr-nom" key={faol}>
                <small>
                  {m.qadam} {raqam(faol)}
                </small>
                <b>{joriy.nom}</b>
              </span>
              <span className="ly-kadr-hisob">
                {raqam(faol)} <i>/ {raqam(m.qadamlar.length - 1)}</i>
              </span>
            </div>

            <div className="ly-kadr-tana">
              <SahnaUlanish faol={faol === 0} s={m.sahna} />
              <SahnaYigish faol={faol === 1} s={m.sahna} />
              <SahnaTahlil faol={faol === 2} s={m.sahna} />
              <SahnaNatija faol={faol === 3} s={m.sahna} />
              <SahnaKouching faol={faol === 4} s={m.sahna} />
            </div>

            <div className="ly-kadr-chiziq">
              <i />
            </div>
          </div>

          <nav className="ly-chiziq" aria-label={m.chiziqAria}>
            <span className="ly-chiziq-iz" aria-hidden="true">
              <i />
            </span>
            {m.qadamlar.map((q, i) => (
              <button
                key={i}
                type="button"
                className={`ly-nuqta${i === faol ? ' faol' : ''}${i < faol ? ' otdi' : ''}`}
                style={{ top: `${(i / (m.qadamlar.length - 1)) * 100}%` }}
                onClick={() => qadamgaBor(i)}
                aria-label={m.qadamAria(i + 1, q.nom)}
                aria-current={i === faol ? 'step' : undefined}
              >
                {raqam(i)}
                <span className="ly-nuqta-nom">{q.qisqa}</span>
              </button>
            ))}
          </nav>
        </div>
      </div>
    </div>
  );
}

// ─── Sahnalar ─────────────────────────────────────────────────────────────────

interface SahnaProps {
  faol: boolean;
  s: SahnaMatn;
}

function Sahna({ faol, klass, children }: { faol: boolean; klass: string; children: ReactNode }) {
  return <div className={`ly-s ${klass}${faol ? ' faol' : ''}`}>{children}</div>;
}

const INTEGRATSIYA_IKONLARI: ReactNode[] = [<Send />, <PhoneCall />, <Upload />];

function SahnaUlanish({ faol, s }: SahnaProps) {
  return (
    <Sahna faol={faol} klass="ly-s1">
      {s.integratsiyalar.map((x, i) => (
        <div key={i} className="ly-integ ly-e" style={e(i)}>
          <span className="ly-integ-ikon">{INTEGRATSIYA_IKONLARI[i]}</span>
          <span className="ly-integ-matn">
            <b>{x.nom}</b>
            <small>{x.izoh}</small>
          </span>
          <span className="ly-integ-holat">{x.holat}</span>
          <span className="ly-tumbler" style={e(i + 2)}>
            <i />
          </span>
        </div>
      ))}
      <div className="ly-sahna-izoh ly-e" style={e(4)}>
        <Lock /> {s.botIzoh}
      </div>
    </Sahna>
  );
}

/** To'lqin ustunlari balandligi — tasodifiy emas, har renderda bir xil. */
const TOLQIN = [28, 46, 70, 52, 88, 64, 40, 74, 96, 58, 34, 66, 84, 48, 30, 62, 90, 54, 38, 72, 50, 26];

function SahnaYigish({ faol, s }: SahnaProps) {
  const [p1, p2, p3] = s.pufaklar;
  return (
    <Sahna faol={faol} klass="ly-s2">
      <div className="ly-s2-ustun">
        <div className="ly-mini-sarlavha ly-e" style={e(0)}>
          <MessagesSquare /> {s.yozishma}
        </div>
        <div className="ly-pufak mijoz ly-e" style={e(1)}>
          {p1}
        </div>
        <div className="ly-pufak menejer ly-e" style={e(2)}>
          {p2}
        </div>
        <div className="ly-pufak mijoz ly-e" style={e(3)}>
          {p3}
        </div>
        <div className="ly-sahna-izoh ly-e" style={e(4)}>
          <Clock /> {s.jimlik}
        </div>
      </div>

      <div className="ly-s2-ustun">
        <div className="ly-mini-sarlavha ly-e" style={e(1)}>
          <AudioLines /> {s.qongiroq}
        </div>
        <div className="ly-tolqin ly-e" style={e(2)}>
          {TOLQIN.map((h, i) => (
            <i key={i} style={{ '--h': `${h}%`, '--j': i } as CSSProperties} />
          ))}
        </div>
        <div className="ly-stt ly-e" style={e(3)}>
          <ArrowDown /> {s.stt}
        </div>
        <div className="ly-transkript ly-e" style={e(4)}>
          <p>
            <b>{s.menejer}</b> {s.transkript[0]}
          </p>
          <p>
            <b className="mijoz">{s.mijoz}</b> {s.transkript[1]}
          </p>
        </div>
      </div>
    </Sahna>
  );
}

/** Quvur bosqichlari kim tomonidan bajariladi: kod yoki AI (tartib `s.quvur` bilan bir xil). */
const QUVUR_TEGLARI: ('kod' | 'ai')[] = ['kod', 'ai', 'ai', 'kod'];

function SahnaTahlil({ faol, s }: SahnaProps) {
  return (
    <Sahna faol={faol} klass="ly-s3">
      <ol className="ly-quvur">
        {s.quvur.map((q, i) => (
          <li key={i} className="ly-e" style={e(i)}>
            <span className="ly-quvur-nuqta">
              <Check />
            </span>
            <span className="ly-quvur-matn">
              <b>{q.nom}</b>
              <small>{q.izoh}</small>
            </span>
            {QUVUR_TEGLARI[i] === 'kod' ? <span className="ly-teg kod">{s.kod}</span> : <span className="ly-teg">AI</span>}
          </li>
        ))}
      </ol>
      <div className="ly-iqtibos ly-e" style={e(4)}>
        <Quote className="ly-iqtibos-belgi" />
        <span className="ly-iqtibos-matn">{s.iqtibos}</span>
        <span className="ly-topildi">
          <BadgeCheck /> {s.topildi}
        </span>
      </div>
    </Sahna>
  );
}

const BALL = 87;
const AYLANA = 2 * Math.PI * 30;

function SahnaNatija({ faol, s }: SahnaProps) {
  const halqa = { '--to': AYLANA, '--qiymat': AYLANA * (1 - BALL / 100) } as CSSProperties;
  return (
    <Sahna faol={faol} klass="ly-s4">
      <div className="ly-natija ball ly-e" style={e(0)}>
        <div className="ly-halqa" style={halqa}>
          <svg viewBox="0 0 72 72">
            <circle className="iz" cx="36" cy="36" r="30" />
            <circle className="qiymat" cx="36" cy="36" r="30" strokeDasharray={AYLANA} />
          </svg>
          <span>{BALL}%</span>
        </div>
        <div>
          <b>{s.umumiyBall}</b>
          <small>{s.isbotlar}</small>
        </div>
      </div>
      <div className="ly-natija ly-e" style={e(1)}>
        <span className="ly-natija-ikon binafsha">
          <ClipboardCheck />
        </span>
        <div>
          <small>{s.vazifa.nom}</small>
          <b>{s.vazifa.izoh}</b>
        </div>
      </div>
      <div className="ly-natija ly-e" style={e(2)}>
        <span className="ly-natija-ikon qizil">
          <Bell />
        </span>
        <div>
          <small>{s.ogoh.nom}</small>
          <b>{s.ogoh.izoh}</b>
        </div>
      </div>
      <div className="ly-natija ly-e" style={e(3)}>
        <span className="ly-natija-ikon sariq">
          <Flame />
        </span>
        <div>
          <small>{s.lid.nom}</small>
          <b>{s.lid.izoh}</b>
        </div>
      </div>
    </Sahna>
  );
}

const HALQA_IKONLARI: ReactNode[] = [<Sparkles />, <UserRound />, <MessageSquareWarning />, <BadgeCheck />];

function SahnaKouching({ faol, s }: SahnaProps) {
  return (
    <Sahna faol={faol} klass="ly-s5">
      <div className="ly-davra ly-e" style={e(0)}>
        <svg className="ly-davra-iz" viewBox="0 0 220 220">
          <circle cx="110" cy="110" r="84" />
        </svg>
        <div className="ly-davra-markaz">
          <b>{s.kouching.nom}</b>
          <small>{s.kouching.izoh}</small>
        </div>
        {s.halqa.map((nom, i) => (
          <span key={i} className={`ly-davra-tugun t${i} ly-e`} style={e(i + 1)}>
            <span className="ly-davra-ikon">{HALQA_IKONLARI[i]}</span>
            <small>{nom}</small>
          </span>
        ))}
      </div>
      <div className="ly-sahna-izoh ly-e" style={e(5)}>
        <Send /> {s.hisobot}
      </div>
    </Sahna>
  );
}
