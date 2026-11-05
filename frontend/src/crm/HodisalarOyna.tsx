import { Download, Pause, Play, Search, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useT } from '../i18n';
import { davrHisobla, pul, qiymatMatni, useCrm, type DavrTuri } from './malumot';
import './hodisalar.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HODISALAR JURNALI — amoCRM "События" namunasida (SotuvAI dizayni)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bosh sahifadagi "Hodisalar" tugmasi ochadigan to'liq ekranli jadval:
 * Sana · Muallif · Obyekt · Nomi · Hodisa · Oldingi qiymat · Keyingi qiymat.
 * Bosqichlar rangli yorliq, teglar yorliq, qo'ng'iroqlar — davomiylik,
 * tinglash va yuklab olish. Qidiruv va filtrlar (obyekt, hodisa turi,
 * muallif, davr); pastga aylantirilganda keyingi 50 tasi yuklanadi.
 */

interface Hodisa {
  id: string;
  at: string;
  author: string | null;
  object: 'deal' | 'task' | 'call';
  dealId: string | null;
  contactId: string | null;
  conversationId: string | null;
  name: string;
  type: string;
  data: Record<string, unknown>;
  deleted: boolean;
}

type T = (s: string, v?: Record<string, string | number>) => string;

const QADAM = 50;

/** Hodisa turlari filtri — obyekt bo'yicha guruhlangan. */
const TURLAR: { guruh: string; turlar: { k: string; nom: string }[] }[] = [
  {
    guruh: 'Bitim',
    turlar: [
      { k: 'created', nom: 'Bitim yaratildi' },
      { k: 'stage', nom: 'Bosqich o‘zgarishi' },
      { k: 'field', nom: 'Maydon o‘zgarishi' },
      { k: 'responsible', nom: "Mas'ul o'zgarishi" },
      { k: 'tags', nom: 'Teglar' },
      { k: 'note', nom: 'Izoh' },
      { k: 'inbox', nom: 'Murojaatdan yaratildi' },
      { k: 'deleted', nom: "Bitim o'chirildi" },
      { k: 'restored', nom: 'Bitim tiklandi' },
    ],
  },
  {
    guruh: 'Vazifa',
    turlar: [
      { k: 'task', nom: 'Yangi vazifa' },
      { k: 'task_done', nom: 'Vazifa bajarildi' },
      { k: 'task_reschedule', nom: "Bajarish muddati o'zgarishi" },
      { k: 'task_reopen', nom: 'Vazifa qayta ochildi' },
    ],
  },
  {
    guruh: "Qo'ng'iroq",
    turlar: [
      { k: 'call_inbound', nom: "Kiruvchi qo'ng'iroq" },
      { k: 'call_outbound', nom: "Chiquvchi qo'ng'iroq" },
    ],
  },
];
const TUR_NOMI = Object.fromEntries(TURLAR.flatMap((g) => g.turlar.map((x) => [x.k, x.nom])));

const DAVRLAR: { k: 'hammasi' | DavrTuri; nom: string }[] = [
  { k: 'hammasi', nom: 'Hammasi' },
  { k: 'bugun', nom: 'Bugun' },
  { k: 'kecha', nom: 'Kecha' },
  { k: 'hafta', nom: 'Hafta' },
  { k: 'oy', nom: 'Oy' },
];

function vaqtMatni(iso: string, t: T): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const soat = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const bugun = new Date();
  const kecha = new Date(bugun.getTime() - 86_400_000);
  const ertaga = new Date(bugun.getTime() + 86_400_000);
  if (d.toDateString() === bugun.toDateString()) return t('Bugun {v}', { v: soat });
  if (d.toDateString() === kecha.toDateString()) return t('Kecha {v}', { v: soat });
  if (d.toDateString() === ertaga.toDateString()) return t('Ertaga {v}', { v: soat });
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${soat}`;
}

function davomiylik(s: unknown): string {
  const n = Math.max(0, Math.round(Number(s) || 0));
  const p = (x: number) => String(x).padStart(2, '0');
  return n >= 3600 ? `${p(Math.floor(n / 3600))}:${p(Math.floor((n % 3600) / 60))}:${p(n % 60)}` : `${p(Math.floor(n / 60))}:${p(n % 60)}`;
}

export function HodisalarOyna({ onYop }: { onYop: () => void }) {
  const { base, holat, seatlar } = useCrm();
  const t = useT();
  const [qidiruv, setQidiruv] = useState('');
  const [q, setQ] = useState('');
  const [obyekt, setObyekt] = useState<'' | 'deal' | 'task' | 'call'>('');
  const [tur, setTur] = useState('');
  const [seat, setSeat] = useState('');
  const [davr, setDavr] = useState<'hammasi' | DavrTuri>('hammasi');
  const [filtrOchiq, setFiltrOchiq] = useState(false);
  const [items, setItems] = useState<Hodisa[] | null>(null);
  const [total, setTotal] = useState(0);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const sorov = useRef(0);
  const ichkiRef = useRef<HTMLDivElement>(null);

  // Qidiruv — yozib bo'lgach (350 ms)
  useEffect(() => {
    const id = setTimeout(() => setQ(qidiruv.trim()), 350);
    return () => clearTimeout(id);
  }, [qidiruv]);

  const params = useCallback(
    (offset: number) => {
      const s = new URLSearchParams({ limit: String(QADAM), offset: String(offset) });
      if (q) s.set('q', q);
      if (obyekt) s.set('object', obyekt);
      if (tur) s.set('type', tur);
      if (seat) s.set('seat', seat);
      if (davr !== 'hammasi') {
        const d = davrHisobla(davr);
        s.set('from', d.from);
        s.set('to', d.to);
      }
      return s;
    },
    [q, obyekt, tur, seat, davr],
  );

  const yukla = useCallback(
    async (offset: number) => {
      const raqam = ++sorov.current;
      setBand(true);
      setXato(null);
      try {
        const r = await api.get<{ total: number; items: Hodisa[] }>(`${base}/crm-app/events-feed?${params(offset)}`);
        if (raqam !== sorov.current) return;
        setTotal(r.total);
        setItems((eski) => (offset === 0 ? r.items : [...(eski ?? []), ...r.items]));
      } catch (e) {
        if (raqam === sorov.current) setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
      } finally {
        if (raqam === sorov.current) setBand(false);
      }
    },
    [base, params, t],
  );

  useEffect(() => {
    setItems(null);
    ichkiRef.current?.scrollTo({ top: 0 });
    void yukla(0);
  }, [yukla]);

  // Esc — yopish; orqadagi sahifa aylanmasin
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    document.addEventListener('keydown', esc);
    const eski = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = eski;
    };
  }, [onYop]);

  // Oxiriga yetganda — keyingi sahifa
  const oxirRef = useRef<HTMLDivElement>(null);
  const yana = items !== null && items.length < total;
  useEffect(() => {
    const el = oxirRef.current;
    if (!el || !yana) return;
    const k = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && !band && void yukla(items?.length ?? 0), {
      root: ichkiRef.current,
      rootMargin: '300px',
    });
    k.observe(el);
    return () => k.disconnect();
  }, [yana, band, items, yukla]);

  // Qo'ng'iroq yozuvini tinglash — bitta umumiy pleyer
  const audio = useRef<HTMLAudioElement | null>(null);
  const [ijro, setIjro] = useState<string | null>(null);
  useEffect(() => () => audio.current?.pause(), []);
  const tingla = (id: string, url: string) => {
    if (ijro === id) {
      audio.current?.pause();
      setIjro(null);
      return;
    }
    audio.current?.pause();
    const a = new Audio(url);
    a.onended = () => setIjro(null);
    a.onerror = () => setIjro(null);
    audio.current = a;
    void a.play().catch(() => setIjro(null));
    setIjro(id);
  };

  const filtrSoni = [obyekt, tur, seat, davr !== 'hammasi' ? davr : ''].filter(Boolean).length;
  const ctx = { holat, seatlar, t, ijro, tingla };

  return createPortal(
    <div className="hj-fon" role="dialog" aria-modal="true" aria-label={t('Hodisalar')}>
      <header className="hj-tepa">
        <button type="button" className="hj-yop" onClick={onYop} aria-label={t('Yopish')} title={t('Yopish (Esc)')}>
          <X />
        </button>
        <label className="hj-qidiruv">
          <Search aria-hidden="true" />
          <input autoFocus value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('Filtr: bitim, kontakt yoki xodim nomi')} aria-label={t('Qidirish')} />
          {qidiruv && (
            <button type="button" onClick={() => setQidiruv('')} aria-label={t('Tozalash')}>
              <X />
            </button>
          )}
        </label>
        <button type="button" className={`hj-filtr-tugma${filtrOchiq || filtrSoni ? ' faol' : ''}`} onClick={() => setFiltrOchiq((v) => !v)} aria-expanded={filtrOchiq}>
          <SlidersHorizontal aria-hidden="true" /> {t('Filtr')}
          {filtrSoni > 0 && <span className="hj-son">{filtrSoni}</span>}
        </button>
        <span className="hj-jami">{t('{n} ta hodisa', { n: pul(total) })}</span>
      </header>

      {filtrOchiq && (
        <div className="hj-filtrlar">
          <div className="tab-qator" role="tablist" aria-label={t('Davr')}>
            {DAVRLAR.map((d) => (
              <button key={d.k} type="button" role="tab" aria-selected={davr === d.k} className={`tab${davr === d.k ? ' active' : ''}`} onClick={() => setDavr(d.k)}>
                {t(d.nom)}
              </button>
            ))}
          </div>
          <select
            className="input"
            value={obyekt}
            onChange={(e) => {
              setObyekt(e.target.value as typeof obyekt);
              setTur('');
            }}
            aria-label={t('Obyekt')}
          >
            <option value="">{t('Barcha obyektlar')}</option>
            <option value="deal">{t('Bitimlar')}</option>
            <option value="task">{t('Vazifalar')}</option>
            <option value="call">{t("Qo'ng'iroqlar")}</option>
          </select>
          <select className="input" value={tur} onChange={(e) => setTur(e.target.value)} aria-label={t('Hodisa turi')}>
            <option value="">{t('Barcha hodisalar')}</option>
            {TURLAR.filter((g) => !obyekt || (obyekt === 'deal' ? g.guruh === 'Bitim' : obyekt === 'task' ? g.guruh === 'Vazifa' : g.guruh === "Qo'ng'iroq")).map((g) => (
              <optgroup key={g.guruh} label={t(g.guruh)}>
                {g.turlar.map((x) => (
                  <option key={x.k} value={x.k}>
                    {t(x.nom)}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {holat.scope === 'all' && (
            <select className="input" value={seat} onChange={(e) => setSeat(e.target.value)} aria-label={t('Muallif')}>
              <option value="">{t('Barcha mualliflar')}</option>
              {seatlar.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          )}
          {filtrSoni > 0 && (
            <button
              type="button"
              className="btn ikkinchi kichik"
              onClick={() => {
                setObyekt('');
                setTur('');
                setSeat('');
                setDavr('hammasi');
              }}
            >
              {t('Filtrni tozalash')}
            </button>
          )}
        </div>
      )}

      <div className="hj-ichki" ref={ichkiRef}>
        {xato && (
          <div className="card xato-qator" role="alert">
            {xato}{' '}
            <button type="button" className="btn ikkinchi kichik" onClick={() => void yukla(items?.length ?? 0)}>
              {t('Qayta urinish')}
            </button>
          </div>
        )}
        <div className="hj-karta">
          <table className="hj-jadval">
            <thead>
              <tr>
                <th>{t('Sana')}</th>
                <th>{t('Muallif')}</th>
                <th>{t('Obyekt')}</th>
                <th>{t('Nomi')}</th>
                <th>{t('Hodisa')}</th>
                <th>{t('Oldingi qiymat')}</th>
                <th>{t('Keyingi qiymat')}</th>
              </tr>
            </thead>
            <tbody>
              {items?.map((h) => (
                <Qator key={`${h.object}-${h.id}`} h={h} ctx={ctx} onYop={onYop} />
              ))}
              {items === null &&
                Array.from({ length: 10 }, (_, i) => (
                  <tr key={i} className="hj-skelet-qator" aria-hidden="true">
                    {Array.from({ length: 7 }, (_, j) => (
                      <td key={j}>
                        <span className="hj-skelet" />
                      </td>
                    ))}
                  </tr>
                ))}
            </tbody>
          </table>
          {items?.length === 0 && !band && <p className="hj-bosh">{t("Tanlangan filtr bo'yicha hodisa yo'q")}</p>}
          <div ref={oxirRef} className="hj-oxir">
            {yana && (
              <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => void yukla(items?.length ?? 0)}>
                {band ? t('Yuklanmoqda…') : t('Yana {n} ta', { n: Math.min(QADAM, total - (items?.length ?? 0)) })}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─── Jadval qatori ──────────────────────────────────────────────────────────

interface QatorKontekst {
  holat: ReturnType<typeof useCrm>['holat'];
  seatlar: ReturnType<typeof useCrm>['seatlar'];
  t: T;
  ijro: string | null;
  tingla: (id: string, url: string) => void;
}

function BosqichYorligi({ id, nom, holat }: { id: unknown; nom: unknown; holat: QatorKontekst['holat'] }) {
  for (const p of holat.pipelines) {
    const s = p.stages.find((x) => x.id === id);
    if (s) {
      return (
        <span className="hj-bosqich">
          <span className="hj-voronka">{p.name}</span>
          <span className="hj-bosqich-nom" style={{ background: s.color }}>
            {s.name}
          </span>
        </span>
      );
    }
  }
  return nom ? (
    <span className="hj-bosqich">
      <span className="hj-bosqich-nom bosh">{String(nom)}</span>
    </span>
  ) : null;
}

function Teglar({ teglar }: { teglar: string[] }) {
  if (!teglar.length) return null;
  return (
    <span className="hj-teglar">
      {teglar.map((x) => (
        <span key={x} className="hj-teg">
          {x}
        </span>
      ))}
    </span>
  );
}

function Matn({ v }: { v: unknown }) {
  const s = v === null || v === undefined || v === '' ? '' : String(v);
  return s ? (
    <span className="hj-matn" title={s}>
      {s}
    </span>
  ) : null;
}

/** Hodisa → (nomi, oldingi qiymat, keyingi qiymat). */
function tavsif(h: Hodisa, c: QatorKontekst): { hodisa: string; oldin: ReactNode; keyin: ReactNode } {
  const { t, holat, seatlar } = c;
  const d = h.data;
  const seatNomi = (id: unknown) => seatlar.find((s) => s.id === id)?.displayName ?? (id ? t('Xodim') : '');
  switch (h.type) {
    case 'created':
      return { hodisa: d.copiedFrom ? t('Bitim nusxalandi') : t('Bitim yaratildi'), oldin: null, keyin: <BosqichYorligi id={d.stageId} nom={d.stageName} holat={holat} /> };
    case 'stage':
      return {
        hodisa: d.stageDeleted ? t("Bosqich o'chirildi — bitim ko'chirildi") : t('Bosqich o‘zgarishi'),
        oldin: <BosqichYorligi id={d.fromStageId} nom={d.fromName} holat={holat} />,
        keyin: <BosqichYorligi id={d.toStageId} nom={d.toName} holat={holat} />,
      };
    case 'field': {
      if (d.field === 'name') return { hodisa: t('Nomi o‘zgardi'), oldin: <Matn v={d.before} />, keyin: <Matn v={d.after} /> };
      if (d.field === 'amount') {
        const f = (x: unknown) => (x === null || x === undefined ? '' : `${pul(Number(x))} ${t("so'm")}`);
        return { hodisa: t('Summa o‘zgardi'), oldin: <Matn v={f(d.before)} />, keyin: <Matn v={f(d.after)} /> };
      }
      const m = holat.fields.find((x) => x.id === d.fieldId);
      const qiymat = (v: unknown) => (v === null || v === undefined || v === '' ? '' : m ? qiymatMatni(m, v, t, seatlar) : Array.isArray(v) ? v.join(', ') : String(v));
      return { hodisa: t('«{m}» maydoni o‘zgardi', { m: m?.label ?? t('Maydon') }), oldin: <Matn v={qiymat(d.before)} />, keyin: <Matn v={qiymat(d.after)} /> };
    }
    case 'responsible':
      return { hodisa: t("Mas'ul o'zgardi"), oldin: <Matn v={seatNomi(d.before)} />, keyin: <Matn v={seatNomi(d.after)} /> };
    case 'tags': {
      const oldin = Array.isArray(d.before) ? (d.before as string[]) : [];
      const keyin = Array.isArray(d.after) ? (d.after as string[]) : [];
      const qoshildi = keyin.filter((x) => !oldin.includes(x));
      const olindi = oldin.filter((x) => !keyin.includes(x));
      return {
        hodisa: qoshildi.length && !olindi.length ? t("Teglar qo'shildi") : olindi.length && !qoshildi.length ? t('Teglar olib tashlandi') : t('Teglar o‘zgardi'),
        oldin: <Teglar teglar={olindi} />,
        keyin: <Teglar teglar={qoshildi} />,
      };
    }
    case 'note':
      return { hodisa: t("Izoh qo'shildi"), oldin: null, keyin: <Matn v={d.text} /> };
    case 'inbox':
      return { hodisa: t('Murojaatdan yaratildi'), oldin: null, keyin: <Matn v={[d.name, d.phone].filter(Boolean).join(' · ')} /> };
    case 'merge':
      return { hodisa: t('Kontaktlar birlashtirildi'), oldin: null, keyin: <Matn v={Array.isArray(d.merged) ? (d.merged as { name?: string }[]).map((x) => x.name).filter(Boolean).join(', ') : ''} /> };
    case 'deleted':
      return { hodisa: t("Bitim o'chirildi"), oldin: null, keyin: null };
    case 'restored':
      return { hodisa: t('Bitim tiklandi'), oldin: null, keyin: null };
    case 'task':
      return { hodisa: t('Yangi vazifa'), oldin: null, keyin: <Matn v={d.title} /> };
    case 'task_done':
      return { hodisa: t('Vazifa bajarildi'), oldin: <Matn v={d.title} />, keyin: <Matn v={d.result || ''} /> };
    case 'task_reopen':
      return { hodisa: t('Vazifa qayta ochildi'), oldin: null, keyin: <Matn v={d.title} /> };
    case 'task_reschedule':
      return {
        hodisa: t("Bajarish muddati o'zgardi"),
        oldin: <Matn v={d.before ? vaqtMatni(String(d.before), t) : ''} />,
        keyin: <Matn v={d.after ? vaqtMatni(String(d.after), t) : ''} />,
      };
    case 'call_inbound':
    case 'call_outbound':
    case 'call_na': {
      const url = typeof d.mediaUrl === 'string' && d.mediaUrl ? d.mediaUrl : null;
      return {
        hodisa: h.type === 'call_inbound' ? t("Kiruvchi qo'ng'iroq") : h.type === 'call_outbound' ? t("Chiquvchi qo'ng'iroq") : t("Qo'ng'iroq"),
        oldin: null,
        keyin: (
          <span className="hj-qongiroq">
            <span className="hj-davom">{d.duration ? davomiylik(d.duration) : t('Javobsiz')}</span>
            {url && (
              <>
                <button
                  type="button"
                  className={`hj-ikon${c.ijro === h.id ? ' faol' : ''}`}
                  onClick={() => c.tingla(h.id, url)}
                  aria-label={c.ijro === h.id ? t("To'xtatish") : t('Tinglash')}
                  title={c.ijro === h.id ? t("To'xtatish") : t('Tinglash')}
                >
                  {c.ijro === h.id ? <Pause /> : <Play />}
                </button>
                <a className="hj-ikon" href={url} download target="_blank" rel="noopener noreferrer" aria-label={t('Yuklab olish')} title={t('Yuklab olish')}>
                  <Download />
                </a>
              </>
            )}
          </span>
        ),
      };
    }
    default:
      return { hodisa: t(TUR_NOMI[h.type] ?? h.type), oldin: null, keyin: null };
  }
}

function Qator({ h, ctx, onYop }: { h: Hodisa; ctx: QatorKontekst; onYop: () => void }) {
  const { t } = ctx;
  const { hodisa, oldin, keyin } = tavsif(h, ctx);
  const d = h.data;
  // Muallifsiz hodisa — avtomatika, tashqi CRM sinxroni yoki tizim
  const muallif = h.author ?? (d.automation ? t('Avtomatika') : typeof d.sync === 'string' ? d.sync : t('Tizim'));
  const obyektNomi = h.object === 'task' ? t('Vazifa') : h.object === 'call' ? t('Kontakt') : t('Bitim');
  const havola = h.object === 'call' ? (h.contactId ? `/crm/kontaktlar/${h.contactId}` : h.conversationId ? `/crm/suhbatlar/${h.conversationId}` : null) : h.dealId ? `/crm/bitimlar/${h.dealId}` : null;
  return (
    <tr>
      <td className="hj-sana">
        <time dateTime={h.at}>{vaqtMatni(h.at, t)}</time>
      </td>
      <td className={h.author ? undefined : 'hj-sust'}>{muallif}</td>
      <td>
        {havola ? (
          <Link to={havola} className="hj-havola" onClick={onYop}>
            {obyektNomi}
          </Link>
        ) : (
          obyektNomi
        )}
      </td>
      <td className="hj-nomi">
        <span title={h.name}>{h.name}</span>
        {h.deleted && <small className="hj-ochirilgan">{t("o'chirilgan")}</small>}
      </td>
      <td className="hj-hodisa">
        <span title={hodisa}>{hodisa}</span>
      </td>
      <td>{oldin}</td>
      <td>{keyin}</td>
    </tr>
  );
}
