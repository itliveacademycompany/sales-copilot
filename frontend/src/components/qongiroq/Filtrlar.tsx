import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';

/**
 * Qo'ng'iroqlar sahifasi filtrlari: umumiy ochiluvchi panel, ko'p tanlovli
 * ro'yxat va kalendarli sana tanlagich. Hammasi klaviatura bilan ishlaydi
 * (Esc yopadi), tashqariga bosilganda yopiladi.
 */

/** Element tashqarisiga bosilganda yoki Esc bosilganda chaqiriladi. */
export function useTashqiBosish(ref: RefObject<HTMLElement | null>, faol: boolean, yop: () => void) {
  useEffect(() => {
    if (!faol) return;
    const bosish = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) yop();
    };
    const tugma = (e: KeyboardEvent) => {
      if (e.key === 'Escape') yop();
    };
    document.addEventListener('mousedown', bosish);
    document.addEventListener('keydown', tugma);
    return () => {
      document.removeEventListener('mousedown', bosish);
      document.removeEventListener('keydown', tugma);
    };
  }, [ref, faol, yop]);
}

/** Filtr tugmasi + ochiluvchi panel. */
export function FiltrTugma({
  ikon,
  nom,
  soni,
  qiymat,
  faol,
  children,
  ong = false,
  kenglik,
}: {
  ikon: ReactNode;
  nom: string;
  /** Tanlangan qiymatlar soni — tugmada chip bo'lib ko'rinadi. */
  soni?: number;
  /** Tugmadagi qo'shimcha matn (masalan sana oralig'i). */
  qiymat?: string;
  /** Filtr qo'llanganmi — tugma ajralib turadi. */
  faol?: boolean;
  children: (yop: () => void) => ReactNode;
  /** Panel o'ng chetga tekislansin (ekran chetida). */
  ong?: boolean;
  kenglik?: number;
}) {
  const [ochiq, setOchiq] = useState(false);
  /** Panel chapga qancha surilgan (px). 0 — tugmaning chap chetida. */
  const [siljish, setSiljish] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const yop = () => setOchiq(false);
  useTashqiBosish(ref, ochiq, yop);

  /**
   * Panel tugma ostidan, uning chap chetidan ochiladi. Ekranga sig'masa —
   * butunlay boshqa tomonga "sakramaydi", faqat sig'maydigan qismicha
   * chapga suriladi: panel tugmaga imkon qadar yaqin qoladi.
   *
   * O'lcham kuzatiladi: panel ochiq turganda ichidan kengayishi mumkin
   * (sanada "Maxsus" bosilib kalendar qo'shilganda) va bu ota komponentni
   * qayta chizmaydi — shuning uchun oddiy effekt yetmaydi.
   */
  useLayoutEffect(() => {
    if (!ochiq || ong) {
      setSiljish(0);
      return;
    }
    const el = panel.current;
    const tugma = ref.current;
    if (!el || !tugma) return;
    const CHET = 16;
    const tekshir = () => {
      const chap = tugma.getBoundingClientRect().left;
      const kenglik = el.offsetWidth;
      const ortiqcha = chap + kenglik - (window.innerWidth - CHET);
      // Chapga ham ekrandan chiqib ketmasin
      setSiljish(Math.max(0, Math.min(ortiqcha, chap - CHET)));
    };
    tekshir();
    const kuzatuvchi = new ResizeObserver(tekshir);
    kuzatuvchi.observe(el);
    window.addEventListener('resize', tekshir);
    return () => {
      kuzatuvchi.disconnect();
      window.removeEventListener('resize', tekshir);
    };
  }, [ochiq, ong]);

  return (
    <div className="filtr" ref={ref}>
      <button
        type="button"
        className={`filtr-tugma${faol ? ' faol' : ''}${ochiq ? ' ochiq' : ''}`}
        onClick={() => setOchiq((v) => !v)}
        aria-expanded={ochiq}
        aria-haspopup="dialog"
      >
        {ikon}
        <span>{nom}</span>
        {qiymat && (
          <>
            <span className="filtr-ajratgich" aria-hidden="true" />
            <span className="filtr-qiymat">{qiymat}</span>
          </>
        )}
        {soni !== undefined && soni > 0 && (
          <>
            <span className="filtr-ajratgich" aria-hidden="true" />
            <span className="filtr-soni">{soni}</span>
          </>
        )}
      </button>
      {ochiq && (
        <div
          ref={panel}
          className={`filtr-panel${ong ? ' ong' : ''}`}
          role="dialog"
          aria-label={nom}
          style={{
            ...(kenglik ? { width: kenglik } : {}),
            ...(!ong ? { left: -siljish } : {}),
          }}
        >
          {children(yop)}
        </div>
      )}
    </div>
  );
}

export interface Tanlov {
  qiymat: string;
  nom: string;
  /** Joriy natijada nechta — tanlovdan oldin foydalanuvchi ko'radi. */
  soni?: number;
}

/** Guruhlangan, ko'p tanlovli ro'yxat. */
export function TanlovRoyxat({
  sarlavha,
  guruhlar,
  tanlangan,
  onOzgar,
  bosh,
}: {
  sarlavha: string;
  guruhlar: { nom?: string; tanlovlar: Tanlov[] }[];
  tanlangan: string[];
  onOzgar: (yangi: string[]) => void;
  /** Tanlovlar bo'sh bo'lganda ko'rsatiladigan matn yoki element. */
  bosh?: ReactNode;
}) {
  const almashtir = (q: string) =>
    onOzgar(tanlangan.includes(q) ? tanlangan.filter((x) => x !== q) : [...tanlangan, q]);
  const jami = guruhlar.reduce((s, g) => s + g.tanlovlar.length, 0);

  return (
    <div className="tanlov">
      <div className="tanlov-bosh">
        <b>{sarlavha}</b>
        {tanlangan.length > 0 && (
          <button type="button" className="tanlov-tozala" onClick={() => onOzgar([])}>
            Tozalash
          </button>
        )}
      </div>
      {jami === 0 ? (
        <div className="tanlov-bosh-matn">{bosh ?? 'Tanlov yo\'q'}</div>
      ) : (
        guruhlar.map((g, gi) =>
          g.tanlovlar.length === 0 ? null : (
            <div key={gi} className="tanlov-guruh">
              {g.nom && <div className="tanlov-guruh-nom">{g.nom}</div>}
              {g.tanlovlar.map((t) => {
                const bor = tanlangan.includes(t.qiymat);
                return (
                  <label key={t.qiymat} className={`tanlov-qator${bor ? ' tanlangan' : ''}`}>
                    <input type="checkbox" checked={bor} onChange={() => almashtir(t.qiymat)} />
                    <span className="tanlov-belgi" aria-hidden="true">
                      {bor && <Check />}
                    </span>
                    <span className="tanlov-nom">{t.nom}</span>
                    {t.soni !== undefined && <span className="tanlov-son">{t.soni}</span>}
                  </label>
                );
              })}
            </div>
          ),
        )
      )}
    </div>
  );
}

// ─── SANA ───────────────────────────────────────────────────────────────────

export type SanaTuri =
  | 'bugun'
  | 'kecha'
  | '7kun'
  | '30kun'
  | 'hafta'
  | 'oy'
  | 'oldingi-oy'
  | 'maxsus';

export const SANA_NOMLARI: Record<SanaTuri, string> = {
  bugun: 'Bugun',
  kecha: 'Kecha',
  '7kun': '7 kun',
  '30kun': '30 kun',
  hafta: 'Joriy hafta',
  oy: 'Joriy oy',
  'oldingi-oy': 'Oldingi oy',
  maxsus: 'Maxsus',
};

const KUN = 86400_000;
const OYLAR = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const HAFTA = ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Ya'];

export function kunBoshi(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Tayyor davr → [from, to) oralig'i. `to` — oxirgi kundan keyingi yarim tun. */
export function sanaOraliq(turi: Exclude<SanaTuri, 'maxsus'>): { from: Date; to: Date } {
  const bugun = kunBoshi(new Date());
  const ertaga = new Date(bugun.getTime() + KUN);
  switch (turi) {
    case 'bugun':
      return { from: bugun, to: ertaga };
    case 'kecha':
      return { from: new Date(bugun.getTime() - KUN), to: bugun };
    case '7kun':
      return { from: new Date(bugun.getTime() - 6 * KUN), to: ertaga };
    case '30kun':
      return { from: new Date(bugun.getTime() - 29 * KUN), to: ertaga };
    case 'hafta': {
      const dushanba = (bugun.getDay() + 6) % 7;
      return { from: new Date(bugun.getTime() - dushanba * KUN), to: ertaga };
    }
    case 'oy':
      return { from: new Date(bugun.getFullYear(), bugun.getMonth(), 1), to: ertaga };
    case 'oldingi-oy':
      return {
        from: new Date(bugun.getFullYear(), bugun.getMonth() - 1, 1),
        to: new Date(bugun.getFullYear(), bugun.getMonth(), 1),
      };
  }
}

export function sanaMatn(from: Date, to: Date): string {
  const f = (d: Date) =>
    `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;
  return `${f(from)} – ${f(new Date(to.getTime() - 1))}`;
}

const birXil = (a: Date, b: Date) => a.getTime() === b.getTime();

/** Tayyor davrlar + oylik kalendar (oraliq ikki bosishda tanlanadi). */
export function SanaTanlagich({
  turi,
  from,
  to,
  onTanla,
}: {
  turi: SanaTuri;
  from: Date;
  to: Date;
  onTanla: (turi: SanaTuri, from: Date, to: Date) => void;
}) {
  const [oy, setOy] = useState(() => new Date(from.getFullYear(), from.getMonth(), 1));
  /** Kalendar faqat "Maxsus" tanlanganda ochiladi — avval ixcham ro'yxat. */
  const [kalendar, setKalendar] = useState(turi === 'maxsus');
  const [boshlanish, setBoshlanish] = useState<Date | null>(null);
  const [ustida, setUstida] = useState<Date | null>(null);
  const bugun = kunBoshi(new Date());

  // Kalendar kataklari: dushanbadan boshlanadigan 6 hafta
  const birinchi = new Date(oy);
  const siljish = (birinchi.getDay() + 6) % 7;
  const kataklar = Array.from({ length: 42 }, (_, i) => new Date(oy.getFullYear(), oy.getMonth(), 1 - siljish + i));

  // Ko'rsatiladigan oraliq: tanlash jarayonida — boshlanish..ustida
  const oxirgiKun = new Date(to.getTime() - KUN);
  const [a, b] = boshlanish
    ? ustida && ustida < boshlanish
      ? [ustida, boshlanish]
      : [boshlanish, ustida ?? boshlanish]
    : [from, oxirgiKun];

  const bos = (d: Date) => {
    if (d > bugun) return;
    if (!boshlanish) {
      setBoshlanish(d);
      return;
    }
    const [x, y] = d < boshlanish ? [d, boshlanish] : [boshlanish, d];
    setBoshlanish(null);
    setUstida(null);
    onTanla('maxsus', x, new Date(y.getTime() + KUN));
  };

  return (
    <div className={`sana-tanlagich${kalendar ? ' kalendarli' : ''}`}>
      <div className="sana-sarlavha">Sana</div>
      <div className="sana-ichki">
        <div className="sana-tayyor">
          {(Object.keys(SANA_NOMLARI) as SanaTuri[]).map((t) => (
            <button
              key={t}
              type="button"
              className={`sana-tayyor-tugma${(t === 'maxsus' ? kalendar : turi === t && !kalendar) ? ' faol' : ''}`}
              aria-expanded={t === 'maxsus' ? kalendar : undefined}
              onClick={() => {
                if (t === 'maxsus') {
                  setBoshlanish(null);
                  setKalendar(true);
                  return;
                }
                const o = sanaOraliq(t);
                setOy(new Date(o.from.getFullYear(), o.from.getMonth(), 1));
                onTanla(t, o.from, o.to);
              }}
            >
              {SANA_NOMLARI[t]}
            </button>
          ))}
        </div>

        {kalendar && (
          <div className="kalendar">
            <div className="kalendar-bosh">
              <button
                type="button"
                className="kalendar-strelka"
                onClick={() => setOy(new Date(oy.getFullYear(), oy.getMonth() - 1, 1))}
                aria-label="Oldingi oy"
              >
                <ChevronLeft />
              </button>
              {/* Oy va yil — uzoq davrga bir bosishda o'tish uchun */}
              <span className="kalendar-oy-yil">
                <select
                  className="kalendar-tanla"
                  aria-label="Oy"
                  value={oy.getMonth()}
                  onChange={(e) => setOy(new Date(oy.getFullYear(), Number(e.target.value), 1))}
                >
                  {OYLAR.map((nom, i) => (
                    <option key={nom} value={i} disabled={new Date(oy.getFullYear(), i, 1) > bugun}>
                      {nom}
                    </option>
                  ))}
                </select>
                <select
                  className="kalendar-tanla"
                  aria-label="Yil"
                  value={oy.getFullYear()}
                  onChange={(e) => {
                    const yil = Number(e.target.value);
                    // Joriy yilda kelajak oyga tushib qolmasin
                    const oyIndeks = Math.min(oy.getMonth(), yil === bugun.getFullYear() ? bugun.getMonth() : 11);
                    setOy(new Date(yil, oyIndeks, 1));
                  }}
                >
                  {Array.from({ length: 6 }, (_, i) => bugun.getFullYear() - 5 + i).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </span>
              <button
                type="button"
                className="kalendar-strelka"
                onClick={() => setOy(new Date(oy.getFullYear(), oy.getMonth() + 1, 1))}
                aria-label="Keyingi oy"
                disabled={new Date(oy.getFullYear(), oy.getMonth() + 1, 1) > bugun}
              >
                <ChevronRight />
              </button>
            </div>
            <div className="kalendar-grid" role="grid">
              {HAFTA.map((h) => (
                <span key={h} className="kalendar-hafta">
                  {h}
                </span>
              ))}
              {kataklar.map((d, i) => {
                const boshqaOy = d.getMonth() !== oy.getMonth();
                const kelajak = d > bugun;
                const ichida = d >= a && d <= b;
                const chet = birXil(d, a) || birXil(d, b);
                return (
                  <button
                    key={d.getTime()}
                    type="button"
                    disabled={kelajak}
                    className={[
                      'kalendar-kun',
                      boshqaOy && 'boshqa',
                      ichida && 'ichida',
                      chet && 'chet',
                      // Uzluksiz oraliq chizig'ining yumaloq uchlari
                      birXil(d, a) && 'oraliq-bosh',
                      birXil(d, b) && 'oraliq-oxir',
                      i % 7 === 0 && 'hafta-bosh',
                      i % 7 === 6 && 'hafta-oxir',
                      birXil(d, bugun) && 'bugun',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => bos(d)}
                    onMouseEnter={() => boshlanish && setUstida(d)}
                    aria-label={`${d.getDate()} ${OYLAR[d.getMonth()]}`}
                    aria-pressed={chet}
                  >
                    <span className="kalendar-raqam">{d.getDate()}</span>
                  </button>
                );
              })}
            </div>
            <div className="kalendar-izoh">
              {boshlanish ? 'Tugash sanasini tanlang' : sanaMatn(from, to)}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
