import { CalendarClock, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Circle, List, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, fmtSana } from '../../api';
import { BajarishOyna, VazifaOyna } from '../../crm/komponentlar';
import { mahalliyVaqt, muddatHolati, useCrm, vazifaTuri } from '../../crm/malumot';
import { useT } from '../../i18n';

interface VazifaQator {
  id: string;
  title: string;
  description: string | null;
  status: string;
  taskType: string | null;
  result: string | null;
  dueAt: string | null;
  completedAt: string | null;
  source: string;
  seatId: string | null;
  seatName: string | null;
  dealId: string | null;
  dealName: string | null;
  stageName: string | null;
  stageColor: string | null;
  contactId: string | null;
  contactName: string | null;
  contactPhone: string | null;
}

interface Javob {
  total: number;
  counts: { overdue: number; today: number; tomorrow: number; all: number } | null;
  items: VazifaQator[];
}

type Davr = 'overdue' | 'today' | 'tomorrow' | 'week' | 'all' | 'done';
const HAJM = 50;

/**
 * Vazifalar (TASK-02/05): ro'yxat — muddat bo'yicha tablar; kalendar —
 * hafta yoki oy. Bitta vazifa barcha ko'rinishlarda bir xil. Sotuvchi
 * faqat o'zinikini ko'radi.
 */
export function CrmVazifalar() {
  const { holat, seatlar } = useCrm();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const korinish = params.get('k') === 'kalendar' ? 'kalendar' : 'royxat';
  const davr = (params.get('p') as Davr | null) ?? 'all';
  const tur = params.get('type') ?? '';
  const seat = params.get('seat') ?? '';
  const [yangi, setYangi] = useState(false);
  const [yangilash, setYangilash] = useState(0);

  const ozgartir = (ozg: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(ozg)) (v ? p.set(k, v) : p.delete(k));
    setParams(p, { replace: true });
  };

  return (
    <div className="ci-sahifa">
      <div className="ci-bosh">
        <h1>{t('Vazifalar')}</h1>
        <div className="ci-bosh-amallar">
          <div className="tab-qator" role="tablist" aria-label={t("Ko'rinish")}>
            <button role="tab" aria-selected={korinish === 'royxat'} className={`tab${korinish === 'royxat' ? ' active' : ''}`} onClick={() => ozgartir({ k: null })}>
              <List aria-hidden="true" /> {t("Ro'yxat")}
            </button>
            <button role="tab" aria-selected={korinish === 'kalendar'} className={`tab${korinish === 'kalendar' ? ' active' : ''}`} onClick={() => ozgartir({ k: 'kalendar' })}>
              <CalendarDays aria-hidden="true" /> {t('Kalendar')}
            </button>
          </div>
          <button className="btn" onClick={() => setYangi(true)}>
            <Plus /> {t('Yangi vazifa')}
          </button>
        </div>
      </div>
      <div className="ci-filtrlar">
        <select className="input ci-tor" value={tur} onChange={(e) => ozgartir({ type: e.target.value || null })} aria-label={t('Vazifa turi')}>
          <option value="">{t('Barcha turlar')}</option>
          {holat.taskTypes.map((x) => (
            <option key={x.id} value={x.id}>
              {t(x.name)}
            </option>
          ))}
        </select>
        {holat.scope === 'all' && (
          <select className="input ci-tor" value={seat} onChange={(e) => ozgartir({ seat: e.target.value || null })} aria-label={t("Mas'ul")}>
            <option value="">{t('Barcha xodimlar')}</option>
            {seatlar.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        )}
      </div>
      {korinish === 'royxat' ? (
        <Royxat davr={davr} tur={tur} seat={seat} onDavr={(p) => ozgartir({ p: p === 'all' ? null : p })} yangilash={yangilash} />
      ) : (
        <Kalendar tur={tur} seat={seat} yangilash={yangilash} />
      )}
      {yangi && <VazifaOyna onYop={() => setYangi(false)} onSaqlandi={() => setYangilash((x) => x + 1)} />}
    </div>
  );
}

function filtrQuery(p: { status: 'open' | 'done'; tur: string; seat: string; period?: string; from?: string; to?: string; limit: number; offset?: number }) {
  const q = new URLSearchParams({ status: p.status, limit: String(p.limit), offset: String(p.offset ?? 0) });
  if (p.tur) q.set('type', p.tur);
  if (p.seat) q.set('seat', p.seat);
  if (p.period) q.set('period', p.period);
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  return q.toString();
}

function Royxat({ davr, tur, seat, onDavr, yangilash }: { davr: Davr; tur: string; seat: string; onDavr: (p: Davr) => void; yangilash: number }) {
  const { base } = useCrm();
  const t = useT();
  const [sahifa, setSahifa] = useState(0);
  const [data, setData] = useState<Javob | null>(null);
  const [sonlar, setSonlar] = useState<Javob['counts']>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [tanlangan, setTanlangan] = useState<Set<string>>(new Set());
  const [bajarish, setBajarish] = useState<VazifaQator | null>(null);
  const [ichki, setIchki] = useState(0);

  useEffect(() => {
    setSahifa(0);
    setTanlangan(new Set());
  }, [davr, tur, seat]);

  useEffect(() => {
    let tirik = true;
    const status = davr === 'done' ? 'done' : 'open';
    const period = davr === 'done' || davr === 'all' ? undefined : davr;
    api
      .get<Javob>(`${base}/crm-app/tasks?${filtrQuery({ status, tur, seat, period, limit: HAJM, offset: sahifa * HAJM })}`)
      .then((r) => {
        if (!tirik) return;
        setData(r);
        if (r.counts) setSonlar(r.counts);
        setXato(null);
      })
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")));
    return () => {
      tirik = false;
    };
  }, [base, davr, tur, seat, sahifa, t, yangilash, ichki]);

  const qaytaOch = async (v: VazifaQator) => {
    try {
      await api.post(`${base}/crm-app/tasks/${v.id}/reopen`, {});
      setIchki((x) => x + 1);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  const ommaviy = async (action: 'done' | 'cancel' | 'due', dueAt?: string) => {
    try {
      await api.post(`${base}/crm-app/tasks/bulk`, { ids: [...tanlangan], action, dueAt });
      setTanlangan(new Set());
      setIchki((x) => x + 1);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  const tablar: { p: Davr; nom: string; n?: number }[] = [
    { p: 'overdue', nom: "Muddati o'tgan", n: sonlar?.overdue },
    { p: 'today', nom: 'Bugun', n: sonlar?.today },
    { p: 'tomorrow', nom: 'Ertaga', n: sonlar?.tomorrow },
    { p: 'week', nom: '7 kun' },
    { p: 'all', nom: 'Barcha ochiq', n: sonlar?.all },
    { p: 'done', nom: 'Bajarilgan##ro‘yxat' },
  ];
  const sahifalar = data ? Math.max(1, Math.ceil(data.total / HAJM)) : 1;
  const ochiqKorinish = davr !== 'done';

  return (
    <>
      <div className="tab-qator ci-voronkalar" role="tablist" aria-label={t('Muddat')}>
        {tablar.map((x) => (
          <button key={x.p} role="tab" aria-selected={davr === x.p} className={`tab${davr === x.p ? ' active' : ''}${x.p === 'overdue' && x.n ? ' xavf' : ''}`} onClick={() => onDavr(x.p)}>
            {t(x.nom)}
            {x.n !== undefined && x.n > 0 && <span className="ci-tab-soni">{x.n}</span>}
          </button>
        ))}
      </div>
      <div className="card ci-jadval-karta">
        {xato && <div className="xato-qator">{xato}</div>}
        {!data && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
        {tanlangan.size > 0 && ochiqKorinish && (
          <div className="ci-ommaviy" role="region" aria-label={t('Ommaviy amallar')}>
            <b>{t('{n} ta tanlandi', { n: tanlangan.size })}</b>
            <button className="btn kichik" onClick={() => void ommaviy('done')}>
              {t('Bajarildi')}
            </button>
            <button
              className="btn ikkinchi kichik"
              onClick={() => {
                const d = new Date();
                d.setDate(d.getDate() + 1);
                d.setHours(10, 0, 0, 0);
                void ommaviy('due', d.toISOString());
              }}
            >
              {t("Ertaga 10:00 ga ko'chirish")}
            </button>
            <button className="btn ikkinchi kichik" onClick={() => void ommaviy('cancel')}>
              {t('Bekor qilish')}
            </button>
            <button className="vr-amal" onClick={() => setTanlangan(new Set())} aria-label={t('Tanlovni bekor qilish')}>
              <X />
            </button>
          </div>
        )}
        {data && data.items.length === 0 && <div className="ci-bosh-holat">{davr === 'done' ? t("Bajarilgan vazifa yo'q") : t("Ochiq vazifa yo'q")}</div>}
        {data && data.items.length > 0 && (
          <ul className="ci-vazifalar keng">
            {data.items.map((v) => (
              <VazifaQatori
                key={v.id}
                v={v}
                tanlangan={tanlangan.has(v.id)}
                onTanla={
                  ochiqKorinish
                    ? () =>
                        setTanlangan((s) => {
                          const n = new Set(s);
                          n.has(v.id) ? n.delete(v.id) : n.add(v.id);
                          return n;
                        })
                    : undefined
                }
                onBelgi={() => (ochiqKorinish ? setBajarish(v) : void qaytaOch(v))}
              />
            ))}
          </ul>
        )}
        {data && sahifalar > 1 && (
          <div className="ci-sahifalash">
            <button className="btn ikkinchi kichik" disabled={sahifa === 0} onClick={() => setSahifa((s) => s - 1)}>
              {t('Oldingi')}
            </button>
            <span>
              {sahifa + 1} / {sahifalar}
            </span>
            <button className="btn ikkinchi kichik" disabled={sahifa + 1 >= sahifalar} onClick={() => setSahifa((s) => s + 1)}>
              {t('Keyingi')}
            </button>
          </div>
        )}
      </div>
      {bajarish && (
        <BajarishOyna
          sarlavha={bajarish.title}
          onYop={() => setBajarish(null)}
          onTasdiq={async (natija) => {
            try {
              await api.post(`${base}/crm-app/tasks/${bajarish.id}/complete`, { result: natija });
              setIchki((x) => x + 1);
            } catch (e) {
              setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
            }
            setBajarish(null);
          }}
        />
      )}
    </>
  );
}

function VazifaQatori({ v, tanlangan, onTanla, onBelgi }: { v: VazifaQator; tanlangan: boolean; onTanla?: () => void; onBelgi: () => void }) {
  const { holat } = useCrm();
  const t = useT();
  const ochiq = v.status !== 'done' && v.status !== 'cancelled';
  const m = ochiq ? muddatHolati(v.dueAt) : null;
  const tur = vazifaTuri(holat, v.taskType);
  return (
    <li className={ochiq ? (tanlangan ? 'tanlangan' : '') : 'yopiq'}>
      {onTanla && <input type="checkbox" className="ci-vazifa-tanlov" checked={tanlangan} onChange={onTanla} aria-label={t('«{n}» ni belgilash', { n: v.title })} />}
      <button className="ci-vazifa-belgi" onClick={onBelgi} aria-label={ochiq ? t('Bajarildi deb belgilash') : t('Qayta ochish')} aria-pressed={!ochiq}>
        {ochiq ? <Circle /> : <CheckCircle2 />}
      </button>
      <div className="ci-vazifa-matn">
        <b>{v.title}</b>
        {v.description && <span>{v.description}</span>}
        {v.result && (
          <span className="ci-natija">
            {t('Natija')}: {v.result}
          </span>
        )}
        <small>
          <span>
            <span className="ci-nuqta" style={{ background: tur.color }} aria-hidden="true" /> {t(tur.name)}
          </span>
          {v.dealId && (
            <Link to={`/crm/bitimlar/${v.dealId}`} className="ci-havola">
              {v.dealName}
            </Link>
          )}
          {v.stageName && (
            <span className="ci-bosqich-belgi" style={{ ['--bosqich' as string]: v.stageColor ?? '#ccc' }}>
              {v.stageName}
            </span>
          )}
          {!v.dealId && v.contactId && (
            <Link to={`/crm/kontaktlar/${v.contactId}`} className="ci-havola">
              {v.contactName ?? v.contactPhone}
            </Link>
          )}
          {v.contactPhone && v.dealId && <span>{v.contactPhone}</span>}
          {v.seatName && <span>{v.seatName}</span>}
        </small>
      </div>
      <span className={`ci-vazifa-muddat ${m === 'otgan' ? 'xavf' : m === 'bugun' ? 'ogoh' : ''}`}>
        <CalendarClock aria-hidden="true" />
        {ochiq ? (v.dueAt ? fmtSana(v.dueAt) : t('Muddatsiz')) : fmtSana(v.completedAt)}
      </span>
    </li>
  );
}

// ─── Kalendar ────────────────────────────────────────────────────────────────

const HAFTA_KUNLARI = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

function haftaBoshi(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

function Kalendar({ tur, seat, yangilash }: { tur: string; seat: string; yangilash: number }) {
  const { holat, base } = useCrm();
  const t = useT();
  const [rejim, setRejim] = useState<'hafta' | 'oy'>('hafta');
  const [langar, setLangar] = useState(() => new Date());
  const [data, setData] = useState<VazifaQator[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [kunOchiq, setKunOchiq] = useState<string | null>(null);
  const [ichki, setIchki] = useState(0);
  const [bajarish, setBajarish] = useState<VazifaQator | null>(null);
  const [sudrash, setSudrash] = useState<string | null>(null);

  const kunlar = useMemo(() => {
    if (rejim === 'hafta') {
      const b = haftaBoshi(langar);
      return Array.from({ length: 7 }, (_, i) => new Date(b.getTime() + i * 86400000));
    }
    const oyBosh = new Date(langar.getFullYear(), langar.getMonth(), 1);
    const b = haftaBoshi(oyBosh);
    const oxir = new Date(langar.getFullYear(), langar.getMonth() + 1, 0);
    const n = Math.ceil(((oxir.getTime() - b.getTime()) / 86400000 + 1) / 7) * 7;
    return Array.from({ length: n }, (_, i) => new Date(b.getFullYear(), b.getMonth(), b.getDate() + i));
  }, [rejim, langar]);

  const yukla = useCallback(async () => {
    const from = kunlar[0]!.toISOString();
    const to = new Date(kunlar[kunlar.length - 1]!.getTime() + 86400000).toISOString();
    try {
      const r = await api.get<Javob>(`${base}/crm-app/tasks?${filtrQuery({ status: 'open', tur, seat, from, to, limit: 500 })}`);
      setData(r.items);
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, kunlar, tur, seat, t]);

  useEffect(() => {
    void yukla();
  }, [yukla, yangilash, ichki]);

  const kunKaliti = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const guruh = useMemo(() => {
    const g = new Map<string, VazifaQator[]>();
    for (const v of data ?? []) {
      if (!v.dueAt) continue;
      const k = kunKaliti(new Date(v.dueAt));
      g.set(k, [...(g.get(k) ?? []), v]);
    }
    return g;
  }, [data]);

  const siljit = (n: number) => {
    const d = new Date(langar);
    if (rejim === 'hafta') d.setDate(d.getDate() + n * 7);
    else d.setMonth(d.getMonth() + n);
    setLangar(d);
  };

  /** Sudrab boshqa kunga — vaqt saqlanadi, sana o'zgaradi. */
  const kunigaKochir = async (id: string, kun: Date) => {
    const v = data?.find((x) => x.id === id);
    if (!v?.dueAt) return;
    const eski = new Date(v.dueAt);
    const yangi = new Date(kun);
    yangi.setHours(eski.getHours(), eski.getMinutes(), 0, 0);
    if (yangi.toDateString() === eski.toDateString()) return;
    try {
      await api.patch(`${base}/crm-app/tasks/${id}`, { dueAt: yangi.toISOString() });
      setIchki((x) => x + 1);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  const bugun = new Date().toDateString();
  const sarlavha =
    rejim === 'hafta'
      ? `${kunlar[0]!.toLocaleDateString('ru-RU')} – ${kunlar[6]!.toLocaleDateString('ru-RU')}`
      : `${String(langar.getMonth() + 1).padStart(2, '0')}.${langar.getFullYear()}`;
  const KO_PI = rejim === 'oy' ? 3 : 8;

  return (
    <section className="card ci-blok" aria-label={t('Kalendar')}>
      <div className="ci-kalendar-bosh">
        <div className="ci-bosh-amallar">
          <button className="vr-amal" onClick={() => siljit(-1)} aria-label={t('Oldingi')}>
            <ChevronLeft />
          </button>
          <button className="btn ikkinchi kichik" onClick={() => setLangar(new Date())}>
            {t('Bugun')}
          </button>
          <button className="vr-amal" onClick={() => siljit(1)} aria-label={t('Keyingi')}>
            <ChevronRight />
          </button>
          <b className="ci-kalendar-sarlavha">{sarlavha}</b>
        </div>
        <div className="tab-qator ci-kichik-tab" role="tablist">
          <button role="tab" aria-selected={rejim === 'hafta'} className={`tab${rejim === 'hafta' ? ' active' : ''}`} onClick={() => setRejim('hafta')}>
            {t('Hafta')}
          </button>
          <button role="tab" aria-selected={rejim === 'oy'} className={`tab${rejim === 'oy' ? ' active' : ''}`} onClick={() => setRejim('oy')}>
            {t('Oy')}
          </button>
        </div>
      </div>
      {xato && <div className="xato-qator">{xato}</div>}
      <div className={`ci-kalendar ${rejim}`} role="grid" aria-label={sarlavha}>
        {HAFTA_KUNLARI.map((k) => (
          <div key={k} className="ci-kalendar-kunnom" role="columnheader">
            {t(k)}
          </div>
        ))}
        {kunlar.map((d) => {
          const k = kunKaliti(d);
          const ichidagi = (guruh.get(k) ?? []).sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
          const boshqaOy = rejim === 'oy' && d.getMonth() !== langar.getMonth();
          const ochiq = kunOchiq === k;
          const korinadi = ochiq ? ichidagi : ichidagi.slice(0, KO_PI);
          return (
            <div
              key={k}
              role="gridcell"
              className={`ci-kalendar-kun${d.toDateString() === bugun ? ' bugun' : ''}${boshqaOy ? ' boshqa-oy' : ''}${sudrash ? ' tushadi' : ''}`}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/plain');
                setSudrash(null);
                if (id) void kunigaKochir(id, d);
              }}
            >
              <div className="ci-kalendar-sana">{d.getDate()}</div>
              {korinadi.map((v) => {
                const m = muddatHolati(v.dueAt);
                const tr = vazifaTuri(holat, v.taskType);
                return (
                  <button
                    key={v.id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/plain', v.id);
                      setSudrash(v.id);
                    }}
                    onDragEnd={() => setSudrash(null)}
                    className={`ci-kalendar-vazifa${m === 'otgan' ? ' xavf' : ''}`}
                    style={{ ['--tur' as string]: tr.color }}
                    onClick={() => setBajarish(v)}
                    title={`${v.title}${v.dealName ? ` — ${v.dealName}` : ''}`}
                  >
                    <time>{v.dueAt ? mahalliyVaqt(v.dueAt).slice(11) : ''}</time> {v.title}
                  </button>
                );
              })}
              {ichidagi.length > KO_PI && (
                <button type="button" className="ci-yana" onClick={() => setKunOchiq(ochiq ? null : k)}>
                  {ochiq ? t('Yig‘ish') : t('+{n} ta', { n: ichidagi.length - KO_PI })}
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="yordam">{t('Vazifani boshqa kunga sudrab ko‘chiring; bosib — bajarilgan deb belgilang.')}</p>
      {bajarish && (
        <BajarishOyna
          sarlavha={`${bajarish.title}${bajarish.dealName ? ` — ${bajarish.dealName}` : ''}`}
          onYop={() => setBajarish(null)}
          onTasdiq={async (natija) => {
            try {
              await api.post(`${base}/crm-app/tasks/${bajarish.id}/complete`, { result: natija });
              setIchki((x) => x + 1);
            } catch (e) {
              setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
            }
            setBajarish(null);
          }}
        />
      )}
    </section>
  );
}
