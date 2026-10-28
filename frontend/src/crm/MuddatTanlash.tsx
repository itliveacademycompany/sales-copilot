import { CalendarDays, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MUDDAT TANLASH — Metasell uslubidagi oyna
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Chapda tez tanlovlar (15 daqiqadan keyin … bir yildan keyin), o'rtada oy
 * kalendari, o'ngda vaqt ("Kun bo'yi" yoki 30 daqiqalik qadamlar). Qiymat —
 * ISO satr yoki null. "Kun bo'yi" — o'sha kunning 23:59 i (kun oxirigacha
 * muddati o'tmaydi).
 */

const OYLAR = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const HAFTA = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

const p2 = (n: number) => String(n).padStart(2, '0');
const kunKaliti = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;

/** "Kun bo'yi" belgisi: soat 23:59. */
function kunBoyimi(d: Date): boolean {
  return d.getHours() === 23 && d.getMinutes() === 59;
}

function kunOxiri(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 0, 0);
  return x;
}

/** Tugmadagi matn: "26.10.2026 16:30" yoki kun bo'yi bo'lsa "26.10.2026". */
export function muddatMatni(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const sana = `${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
  return kunBoyimi(d) ? sana : `${sana} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}

const VAQTLAR: string[] = [];
for (let h = 7; h <= 22; h++) for (const m of [0, 30]) VAQTLAR.push(`${p2(h)}:${p2(m)}`);

export function MuddatTanlash({
  qiymat,
  onChange,
  nom,
}: {
  qiymat: string | null;
  onChange: (iso: string | null) => void;
  nom?: string;
}) {
  const t = useT();
  const [ochiq, setOchiq] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const tanlangan = qiymat ? new Date(qiymat) : null;
  const [oy, setOy] = useState(() => {
    const d = tanlangan ?? new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  useEffect(() => {
    if (!ochiq) return;
    const yop = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOchiq(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOchiq(false);
    document.addEventListener('mousedown', yop);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', yop);
      document.removeEventListener('keydown', esc);
    };
  }, [ochiq]);

  const tezkor = useMemo(() => {
    const hozir = () => {
      const d = new Date();
      d.setSeconds(0, 0);
      return d;
    };
    const keyin = (daq: number) => new Date(hozir().getTime() + daq * 60_000);
    const kun = (n: number) => {
      const d = hozir();
      d.setDate(d.getDate() + n);
      return kunOxiri(d);
    };
    const shanba = () => {
      const d = hozir();
      d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
      return kunOxiri(d);
    };
    const oyKeyin = (n: number) => {
      const d = hozir();
      d.setMonth(d.getMonth() + n);
      return kunOxiri(d);
    };
    return [
      { nom: '15 daqiqadan keyin', ol: () => keyin(15) },
      { nom: '30 daqiqadan keyin', ol: () => keyin(30) },
      { nom: 'Bir soatdan keyin', ol: () => keyin(60) },
      { nom: 'Bugun', ol: () => kun(0) },
      { nom: 'Ertaga', ol: () => kun(1) },
      { nom: 'Hafta oxirida', ol: shanba },
      { nom: 'Bir haftadan keyin', ol: () => kun(7) },
      { nom: 'Bir oydan keyin', ol: () => oyKeyin(1) },
      { nom: 'Bir yildan keyin', ol: () => oyKeyin(12) },
    ];
  }, []);

  /** Kalendar katagi: Dushanbadan boshlanadigan 6 hafta. */
  const kataklar = useMemo(() => {
    const bosh = new Date(oy);
    const siljish = (bosh.getDay() + 6) % 7;
    bosh.setDate(bosh.getDate() - siljish);
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(bosh);
      d.setDate(bosh.getDate() + i);
      return d;
    });
  }, [oy]);

  const qoy = (d: Date) => onChange(d.toISOString());
  const kunniTanla = (d: Date) => {
    const x = new Date(d);
    if (tanlangan && !kunBoyimi(tanlangan)) x.setHours(tanlangan.getHours(), tanlangan.getMinutes(), 0, 0);
    else x.setHours(23, 59, 0, 0);
    qoy(x);
  };
  const vaqtniTanla = (v: string | null) => {
    const x = tanlangan ? new Date(tanlangan) : new Date();
    if (v === null) x.setHours(23, 59, 0, 0);
    else {
      const [h, m] = v.split(':').map(Number);
      x.setHours(h!, m!, 0, 0);
    }
    qoy(x);
  };
  const bugunKalit = kunKaliti(new Date());
  const joriyVaqt = tanlangan && !kunBoyimi(tanlangan) ? `${p2(tanlangan.getHours())}:${p2(tanlangan.getMinutes())}` : null;

  return (
    <div className="ms-muddat" ref={ref}>
      <button type="button" className="ms-muddat-tugma" onClick={() => setOchiq((v) => !v)} aria-expanded={ochiq} aria-haspopup="dialog" aria-label={nom ?? t('Muddat')}>
        <span>{qiymat ? muddatMatni(qiymat) : t('Muddat')}</span>
        <CalendarDays aria-hidden="true" />
      </button>
      {ochiq && (
        <div className="ms-muddat-oyna" role="dialog" aria-label={t('Muddat tanlash')}>
          <div className="ms-muddat-tezkor">
            {tezkor.map((x) => (
              <button
                key={x.nom}
                type="button"
                onClick={() => {
                  const d = x.ol();
                  setOy(new Date(d.getFullYear(), d.getMonth(), 1));
                  qoy(d);
                  setOchiq(false);
                }}
              >
                {t(x.nom)}
              </button>
            ))}
          </div>
          <div className="ms-muddat-kalendar">
            <div className="ms-muddat-oy">
              <b>
                {t(OYLAR[oy.getMonth()]!)} {oy.getFullYear()}
              </b>
              <span>
                <button type="button" onClick={() => setOy(new Date(oy.getFullYear(), oy.getMonth() - 1, 1))} aria-label={t('Oldingi oy')}>
                  <ChevronLeft />
                </button>
                <button type="button" onClick={() => setOy(new Date(oy.getFullYear(), oy.getMonth() + 1, 1))} aria-label={t('Keyingi oy')}>
                  <ChevronRight />
                </button>
              </span>
            </div>
            <div className="ms-muddat-hafta">
              {HAFTA.map((h) => (
                <span key={h}>{t(h)}</span>
              ))}
            </div>
            <div className="ms-muddat-kunlar">
              {kataklar.map((d) => {
                const k = kunKaliti(d);
                const tanlanganmi = tanlangan ? kunKaliti(tanlangan) === k : false;
                return (
                  <button
                    key={k}
                    type="button"
                    className={`${d.getMonth() !== oy.getMonth() ? 'boshqa' : ''}${k === bugunKalit ? ' bugun' : ''}${tanlanganmi ? ' tanlangan' : ''}`}
                    onClick={() => kunniTanla(d)}
                    aria-pressed={tanlanganmi}
                  >
                    {d.getDate()}
                  </button>
                );
              })}
            </div>
            <div className="ms-muddat-past">
              <button type="button" onClick={() => kunniTanla(new Date())}>
                {t('Bugun')}
              </button>
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOchiq(false);
                }}
              >
                {t('Tozalash')}
              </button>
            </div>
          </div>
          <div className="ms-muddat-vaqtlar" role="listbox" aria-label={t('Vaqt')}>
            <div className="ms-muddat-vaqt-nom">{t('Vaqt')}</div>
            <button type="button" className={tanlangan && !joriyVaqt ? 'tanlangan' : undefined} onClick={() => vaqtniTanla(null)}>
              {t("Kun bo'yi")} {tanlangan && !joriyVaqt && <Check aria-hidden="true" />}
            </button>
            {VAQTLAR.map((v) => (
              <button key={v} type="button" className={joriyVaqt === v ? 'tanlangan' : undefined} onClick={() => vaqtniTanla(v)}>
                {v} {joriyVaqt === v && <Check aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
