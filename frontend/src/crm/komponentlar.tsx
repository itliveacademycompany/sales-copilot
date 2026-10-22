import { X } from 'lucide-react';
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { api, ApiError } from '../api';
import { useT } from '../i18n';
import { mahalliyVaqt, pul, useCrm, type DavrTuri } from './malumot';
import { Oyna } from './Oyna';

/**
 * Ichki CRM umumiy komponentlari: teg kiritish, vazifa oynalari, davr
 * tanlash va kichik grafiklar (SVG — kutubxonasiz).
 */

// ─── Teglar ──────────────────────────────────────────────────────────────────

export function TeglarKiritish({ qiymat, onChange, id }: { qiymat: string[]; onChange: (v: string[]) => void; id?: string }) {
  const { base } = useCrm();
  const t = useT();
  const [matn, setMatn] = useState('');
  const [hammasi, setHammasi] = useState<string[]>([]);
  const royxatId = useId();

  useEffect(() => {
    void api
      .get<{ items: { tag: string }[] }>(`${base}/crm-app/tags`)
      .then((r) => setHammasi(r.items.map((x) => x.tag)))
      .catch(() => undefined);
  }, [base]);

  const qosh = (s: string) => {
    const v = s.trim().replace(/\s+/g, ' ').slice(0, 50);
    if (!v || qiymat.some((x) => x.toLowerCase() === v.toLowerCase())) return setMatn('');
    onChange([...qiymat, v]);
    setMatn('');
  };
  const tugma = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      qosh(matn);
    } else if (e.key === 'Backspace' && !matn && qiymat.length) {
      onChange(qiymat.slice(0, -1));
    }
  };
  return (
    <div className="ci-teg-kiritish">
      {qiymat.map((tg) => (
        <span key={tg} className="ci-teg">
          {tg}
          <button type="button" onClick={() => onChange(qiymat.filter((x) => x !== tg))} aria-label={t('«{n}» tegini olib tashlash', { n: tg })}>
            <X />
          </button>
        </span>
      ))}
      <input
        id={id}
        list={royxatId}
        value={matn}
        onChange={(e) => setMatn(e.target.value)}
        onKeyDown={tugma}
        onBlur={() => matn && qosh(matn)}
        placeholder={qiymat.length ? '' : t("Teg qo'shing…")}
        aria-label={t('Teglar')}
        maxLength={50}
      />
      <datalist id={royxatId}>
        {hammasi
          .filter((x) => !qiymat.includes(x))
          .slice(0, 50)
          .map((x) => (
            <option key={x} value={x} />
          ))}
      </datalist>
    </div>
  );
}

export function Teglar({ teglar }: { teglar: string[] }) {
  if (!teglar.length) return null;
  return (
    <span className="ci-teglar">
      {teglar.map((x) => (
        <span key={x} className="ci-teg kichik">
          {x}
        </span>
      ))}
    </span>
  );
}

// ─── Vazifa oynalari ─────────────────────────────────────────────────────────

/** Yangi vazifa: bitimga, kontaktga yoki mustaqil. */
export function VazifaOyna({
  dealId,
  contactId,
  onYop,
  onSaqlandi,
}: {
  dealId?: string;
  contactId?: string;
  onYop: () => void;
  onSaqlandi: () => void | Promise<void>;
}) {
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const ertaga = new Date();
  ertaga.setDate(ertaga.getDate() + 1);
  ertaga.setHours(10, 0, 0, 0);
  const [nom, setNom] = useState('');
  const [tur, setTur] = useState(holat.taskTypes[0]?.id ?? 'call');
  const [muddat, setMuddat] = useState(mahalliyVaqt(ertaga.toISOString()));
  const [izoh, setIzoh] = useState('');
  const [masul, setMasul] = useState<string>('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const saqla = async () => {
    if (!nom.trim()) return setXato(t('Vazifa matnini kiriting'));
    setBand(true);
    try {
      const body = {
        title: nom.trim(),
        taskType: tur,
        description: izoh.trim() || null,
        dueAt: muddat ? new Date(muddat).toISOString() : null,
        ...(holat.canManageAll && masul ? { seatId: masul } : {}),
      };
      if (dealId) await api.post(`${base}/deals/${dealId}/tasks`, body);
      else await api.post(`${base}/crm-app/tasks`, { ...body, contactId: contactId ?? null });
      await onSaqlandi();
      onYop();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      setBand(false);
    }
  };

  const tez = (kun: number) => {
    const d = new Date();
    d.setDate(d.getDate() + kun);
    d.setHours(kun === 0 ? Math.min(d.getHours() + 2, 20) : 10, 0, 0, 0);
    setMuddat(mahalliyVaqt(d.toISOString()));
  };

  return (
    <Oyna
      sarlavha={t('Yangi vazifa')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn" disabled={band}>
            {band ? t('Saqlanmoqda…') : t('Qo‘shish')}
          </button>
        </>
      }
    >
      <div className="ci-tur-tanlash" role="radiogroup" aria-label={t('Vazifa turi')}>
        {holat.taskTypes.map((x) => (
          <button
            type="button"
            key={x.id}
            role="radio"
            aria-checked={tur === x.id}
            className={`ci-chip${tur === x.id ? ' faol' : ''}`}
            onClick={() => setTur(x.id)}
          >
            <span className="ci-nuqta" style={{ background: x.color }} aria-hidden="true" /> {t(x.name)}
          </button>
        ))}
      </div>
      <div className="maydon-blok">
        <label htmlFor="vo-nom">{t('Nima qilish kerak')}</label>
        <input id="vo-nom" className="input" value={nom} maxLength={300} onChange={(e) => setNom(e.target.value)} placeholder={t("Masalan: qayta qo'ng'iroq qilish")} />
      </div>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="vo-muddat">{t('Muddat')}</label>
          <input id="vo-muddat" className="input" type="datetime-local" value={muddat} onChange={(e) => setMuddat(e.target.value)} />
        </div>
        {holat.canManageAll && (
          <div className="maydon-blok">
            <label htmlFor="vo-masul">{t("Mas'ul")}</label>
            <select id="vo-masul" className="input" value={masul} onChange={(e) => setMasul(e.target.value)}>
              <option value="">{dealId ? t("Bitim mas'uli") : t('Men')}</option>
              {seatlar.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <div className="ci-tez">
        <button type="button" className="ci-chip" onClick={() => tez(0)}>
          {t('Bugun')}
        </button>
        <button type="button" className="ci-chip" onClick={() => tez(1)}>
          {t('Ertaga')}
        </button>
        <button type="button" className="ci-chip" onClick={() => tez(7)}>
          {t('Bir haftadan keyin')}
        </button>
      </div>
      <div className="maydon-blok">
        <label htmlFor="vo-izoh">{t('Izoh (ixtiyoriy)')}</label>
        <textarea id="vo-izoh" rows={2} maxLength={2000} value={izoh} onChange={(e) => setIzoh(e.target.value)} />
      </div>
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}

/** Vazifani bajarish — natija bilan (TASK-04). */
export function BajarishOyna({ sarlavha, onYop, onTasdiq }: { sarlavha: string; onYop: () => void; onTasdiq: (natija: string | null) => void | Promise<void> }) {
  const t = useT();
  const [natija, setNatija] = useState('');
  const [band, setBand] = useState(false);
  return (
    <Oyna
      sarlavha={t('Vazifani bajarish')}
      onYop={onYop}
      onSubmit={async () => {
        setBand(true);
        await onTasdiq(natija.trim() || null);
      }}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn" disabled={band}>
            {t('Bajarildi')}
          </button>
        </>
      }
    >
      <p className="ci-oyna-matn">{sarlavha}</p>
      <div className="maydon-blok">
        <label htmlFor="bo-natija">{t('Natija (ixtiyoriy)')}</label>
        <textarea id="bo-natija" rows={3} maxLength={2000} value={natija} onChange={(e) => setNatija(e.target.value)} placeholder={t('Masalan: mijoz ertaga keladi')} />
      </div>
    </Oyna>
  );
}

// ─── Davr tanlash ────────────────────────────────────────────────────────────

const DAVRLAR: { tur: DavrTuri; nom: string }[] = [
  { tur: 'bugun', nom: 'Bugun' },
  { tur: 'kecha', nom: 'Kecha' },
  { tur: 'hafta', nom: '7 kun' },
  { tur: 'oy', nom: 'Shu oy' },
  { tur: 'otgan-oy', nom: "O'tgan oy" },
];

export function DavrTanlash({
  tur,
  maxsus,
  onChange,
}: {
  tur: DavrTuri;
  maxsus: { from: string; to: string };
  onChange: (tur: DavrTuri, maxsus?: { from: string; to: string }) => void;
}) {
  const t = useT();
  const [f, setF] = useState(maxsus.from);
  const [to, setTo] = useState(maxsus.to);
  return (
    <div className="ci-davr">
      <div className="tab-qator" role="tablist" aria-label={t('Davr')}>
        {DAVRLAR.map((d) => (
          <button key={d.tur} role="tab" aria-selected={tur === d.tur} className={`tab${tur === d.tur ? ' active' : ''}`} onClick={() => onChange(d.tur)}>
            {t(d.nom)}
          </button>
        ))}
        <button role="tab" aria-selected={tur === 'maxsus'} className={`tab${tur === 'maxsus' ? ' active' : ''}`} onClick={() => onChange('maxsus', { from: f, to })}>
          {t('Maxsus')}
        </button>
      </div>
      {tur === 'maxsus' && (
        <div className="ci-davr-maxsus">
          <input className="input" type="date" value={f} max={to} onChange={(e) => setF(e.target.value)} aria-label={t('Boshlanish')} />
          <span aria-hidden="true">—</span>
          <input className="input" type="date" value={to} min={f} onChange={(e) => setTo(e.target.value)} aria-label={t('Tugash')} />
          <button className="btn ikkinchi kichik" onClick={() => f && to && f <= to && onChange('maxsus', { from: f, to })}>
            {t("Qo'llash")}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Grafiklar ───────────────────────────────────────────────────────────────

/**
 * Kunlik trend: ikki seriya (yangi va yutilgan bitimlar) — bitta o'q, guruhli
 * ustunlar. Rang — tasdiqlangan palitraning 1- va 2-sloti (`--seriya-1/2`).
 * Har kun ustiga borilganda — aniq qiymatlar (tooltip).
 */
export function TrendGrafik({ data }: { data: { day: string; created: number; won: number }[] }) {
  const t = useT();
  const [tanlangan, setTanlangan] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => Math.max(d.created, d.won)));
  const qadam = niceQadam(max);
  const tepa = Math.ceil(max / qadam) * qadam;
  const W = 640;
  const H = 200;
  const chap = 32;
  const past = 22;
  const kenglik = (W - chap - 8) / Math.max(1, data.length);
  const ustun = Math.max(2, Math.min(14, (kenglik - 6) / 2));
  const y = (v: number) => (H - past) - (v / tepa) * (H - past - 8);
  const chiziqlar = Array.from({ length: Math.round(tepa / qadam) + 1 }, (_, i) => i * qadam);
  const belgiHar = Math.ceil(data.length / 8);

  return (
    <figure className="ci-grafik">
      <div className="ci-legend">
        <span>
          <i style={{ background: 'var(--seriya-1)' }} aria-hidden="true" /> {t('Yangi bitimlar')}
        </span>
        <span>
          <i style={{ background: 'var(--seriya-2)' }} aria-hidden="true" /> {t('Muvaffaqiyatli')}
        </span>
      </div>
      <div className="ci-grafik-qobiq" onMouseLeave={() => setTanlangan(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t('Kunlik trend')} preserveAspectRatio="none">
          {chiziqlar.map((v) => (
            <g key={v}>
              <line x1={chap} x2={W} y1={y(v)} y2={y(v)} className="ci-grid" />
              <text x={chap - 6} y={y(v) + 4} className="ci-o-matn" textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x0 = chap + i * kenglik + (kenglik - ustun * 2 - 2) / 2;
            return (
              <g key={d.day} onMouseEnter={() => setTanlangan(i)}>
                <rect x={chap + i * kenglik} y={0} width={kenglik} height={H - past} fill="transparent" />
                {tanlangan === i && <rect x={chap + i * kenglik} y={0} width={kenglik} height={H - past} className="ci-hover-fon" />}
                <path d={ustunYoli(x0, y(d.created), ustun, H - past)} style={{ fill: 'var(--seriya-1)' }} />
                <path d={ustunYoli(x0 + ustun + 2, y(d.won), ustun, H - past)} style={{ fill: 'var(--seriya-2)' }} />
                {i % belgiHar === 0 && (
                  <text x={chap + i * kenglik + kenglik / 2} y={H - 6} className="ci-o-matn" textAnchor="middle">
                    {d.day.slice(8, 10)}.{d.day.slice(5, 7)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
        {tanlangan !== null && data[tanlangan] && (
          <div className="ci-tooltip" style={{ left: `${((chap + tanlangan * kenglik + kenglik / 2) / W) * 100}%` }} role="status">
            <b>
              {data[tanlangan]!.day.slice(8, 10)}.{data[tanlangan]!.day.slice(5, 7)}
            </b>
            <span>
              <i style={{ background: 'var(--seriya-1)' }} /> {t('Yangi')}: {data[tanlangan]!.created}
            </span>
            <span>
              <i style={{ background: 'var(--seriya-2)' }} /> {t('Muvaffaqiyatli')}: {data[tanlangan]!.won}
            </span>
          </div>
        )}
      </div>
      <details className="ci-jadval-korinish">
        <summary>{t("Jadval ko'rinishi")}</summary>
        <table className="jadval">
          <thead>
            <tr>
              <th>{t('Kun')}</th>
              <th className="ci-ong">{t('Yangi')}</th>
              <th className="ci-ong">{t('Muvaffaqiyatli')}</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.day}>
                <td>{d.day}</td>
                <td className="ci-ong">{d.created}</td>
                <td className="ci-ong">{d.won}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Ustun: tepasi 4px yumaloq, asosi to'g'ri (asosga tayanadi). */
function ustunYoli(x: number, yTepa: number, w: number, asos: number): string {
  const h = asos - yTepa;
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${asos} V${yTepa + r} Q${x},${yTepa} ${x + r},${yTepa} H${x + w - r} Q${x + w},${yTepa} ${x + w},${yTepa + r} V${asos} Z`;
}

function niceQadam(max: number): number {
  const xom = max / 4;
  const daraja = 10 ** Math.floor(Math.log10(Math.max(1, xom)));
  for (const k of [1, 2, 5, 10]) if (k * daraja >= xom) return Math.max(1, k * daraja);
  return Math.max(1, daraja * 10);
}

/**
 * Gorizontal ustunlar — bitta seriya (bitta rang), qiymat yozuvi matn
 * rangida. Bosqichlar, manbalar, rad sabablari uchun.
 */
export function GorizontalUstunlar({
  qatorlar,
  qiymatMatni,
}: {
  qatorlar: { kalit: string; nom: string; qiymat: number; izoh?: string; onClick?: () => void }[];
  qiymatMatni?: (v: number) => string;
}) {
  const t = useT();
  const max = useMemo(() => Math.max(1, ...qatorlar.map((q) => q.qiymat)), [qatorlar]);
  if (qatorlar.length === 0) return <p className="yordam">{t("Ma'lumot yo'q")}</p>;
  return (
    <ul className="ci-gustun">
      {qatorlar.map((q) => {
        const ichi = (
          <>
            <span className="ci-gustun-nom" title={q.nom}>
              {q.nom}
            </span>
            <span className="ci-gustun-trek" aria-hidden="true">
              <span style={{ width: `${(q.qiymat / max) * 100}%` }} />
            </span>
            <span className="ci-gustun-qiymat">
              {qiymatMatni ? qiymatMatni(q.qiymat) : q.qiymat}
              {q.izoh && <small>{q.izoh}</small>}
            </span>
          </>
        );
        return (
          <li key={q.kalit}>
            {q.onClick ? (
              <button type="button" className="ci-gustun-qator" onClick={q.onClick}>
                {ichi}
              </button>
            ) : (
              <div className="ci-gustun-qator">{ichi}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Reja bajarilishi: fakt / reja — reja yo'q bo'lsa foiz ko'rsatilmaydi. */
export function Progress({ fakt, reja, pulmi }: { fakt: number; reja: number | null; pulmi?: boolean }) {
  const t = useT();
  if (!reja) return <span className="yordam">{t('Reja belgilanmagan')}</span>;
  const f = Math.min(1, fakt / reja);
  return (
    <span className="ci-progress" title={`${pulmi ? pul(fakt) : fakt} / ${pulmi ? pul(reja) : reja}`}>
      <span className="ci-progress-trek" aria-hidden="true">
        <span style={{ width: `${f * 100}%` }} />
      </span>
      <b>{Math.round((fakt / reja) * 100)}%</b>
    </span>
  );
}
