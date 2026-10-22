import { CalendarClock, Columns3, List, Plus, Search, TriangleAlert, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, fmtQachon } from '../../api';
import {
  MaydonKiritish,
  muddatHolati,
  pul,
  qiymatniTayyorla,
  useCrm,
  type BitimKartasi,
  type Bosqich,
  type KanbanUstun,
} from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';

const KORINISH_KALIT = 'sotuvai-crm-korinish';
const SAHIFA_HAJMI = 50;

/**
 * Bitimlar: voronka bo'yicha Kanban (sudrab ko'chirish) yoki jadval.
 * Tanlangan voronka va ko'rinish manzilda (`?v=…&k=jadval`) — havola
 * bilan ulashsa, xuddi shu ko'rinish ochiladi.
 */
export function Bitimlar() {
  const { holat, seatlar } = useCrm();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const asosiy = holat.pipelines.find((p) => p.isMain) ?? holat.pipelines[0]!;
  const voronka = holat.pipelines.find((p) => p.id === params.get('v')) ?? asosiy;
  const korinish: 'kanban' | 'jadval' =
    (params.get('k') as 'kanban' | 'jadval' | null) ??
    (() => {
      try {
        return localStorage.getItem(KORINISH_KALIT) === 'jadval' ? 'jadval' : 'kanban';
      } catch {
        return 'kanban';
      }
    })();
  const [qidiruv, setQidiruv] = useState(params.get('q') ?? '');
  const [seat, setSeat] = useState(params.get('s') ?? '');
  const [yangi, setYangi] = useState(false);

  const ozgartir = (k: string, v: string | null) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v);
    else p.delete(k);
    setParams(p, { replace: true });
  };

  // Qidiruv — yozib bo'lgach (300 ms) manzilga
  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get('q') ?? '') !== qidiruv.trim()) ozgartir('q', qidiruv.trim() || null);
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qidiruv]);

  const filtr = new URLSearchParams();
  if (params.get('q')) filtr.set('q', params.get('q')!);
  if (seat) filtr.set('seat', seat);

  return (
    <div className="ci-sahifa">
      <div className="ci-bosh">
        <div>
          <h1>{t('Bitimlar')}</h1>
        </div>
        <div className="ci-bosh-amallar">
          <div className="tab-qator" role="tablist" aria-label={t("Ko'rinish")}>
            <button
              role="tab"
              aria-selected={korinish === 'kanban'}
              className={`tab${korinish === 'kanban' ? ' active' : ''}`}
              onClick={() => {
                ozgartir('k', null);
                try {
                  localStorage.setItem(KORINISH_KALIT, 'kanban');
                } catch {
                  /* ixtiyoriy */
                }
              }}
            >
              <Columns3 aria-hidden="true" /> {t('Kanban')}
            </button>
            <button
              role="tab"
              aria-selected={korinish === 'jadval'}
              className={`tab${korinish === 'jadval' ? ' active' : ''}`}
              onClick={() => {
                ozgartir('k', 'jadval');
                try {
                  localStorage.setItem(KORINISH_KALIT, 'jadval');
                } catch {
                  /* ixtiyoriy */
                }
              }}
            >
              <List aria-hidden="true" /> {t('Jadval')}
            </button>
          </div>
          <button className="btn" onClick={() => setYangi(true)}>
            <Plus /> {t('Yangi bitim')}
          </button>
        </div>
      </div>

      <div className="ci-filtrlar">
        {holat.pipelines.length > 1 && (
          <div className="tab-qator ci-voronkalar" role="tablist" aria-label={t('Voronka')}>
            {holat.pipelines.map((p) => (
              <button
                key={p.id}
                role="tab"
                aria-selected={p.id === voronka.id}
                className={`tab${p.id === voronka.id ? ' active' : ''}`}
                onClick={() => {
                  const n = new URLSearchParams(params);
                  n.set('v', p.id);
                  n.delete('b');
                  setParams(n, { replace: true });
                }}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
        <div className="input-qobiq ikonli ci-qidiruv">
          <span className="input-ikon" aria-hidden="true">
            <Search />
          </span>
          <input
            className="input"
            value={qidiruv}
            onChange={(e) => setQidiruv(e.target.value)}
            placeholder={t('Bitim, mijoz yoki telefon')}
            aria-label={t('Bitimlarni qidirish')}
          />
        </div>
        {holat.scope === 'all' && seatlar.length > 0 && (
          <select
            className="input ci-tor"
            value={seat}
            onChange={(e) => {
              setSeat(e.target.value);
              ozgartir('s', e.target.value || null);
            }}
            aria-label={t("Mas'ul")}
          >
            <option value="">{t("Barcha mas'ullar")}</option>
            {seatlar.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        )}
      </div>

      {korinish === 'kanban' ? (
        <Kanban voronkaId={voronka.id} filtr={filtr.toString()} />
      ) : (
        <Jadval voronkaId={voronka.id} bosqichlar={voronka.stages} filtr={filtr.toString()} bosqich={params.get('b')} onBosqich={(b) => ozgartir('b', b)} />
      )}

      {yangi && <YangiBitim voronkaId={voronka.id} onYop={() => setYangi(false)} />}
    </div>
  );
}

// ─── Kanban ──────────────────────────────────────────────────────────────────

function Kanban({ voronkaId, filtr }: { voronkaId: string; filtr: string }) {
  const { base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [ustunlar, setUstunlar] = useState<KanbanUstun[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [ustida, setUstida] = useState<string | null>(null);
  const [yoqotish, setYoqotish] = useState<{ bitim: BitimKartasi; bosqich: KanbanUstun } | null>(null);
  const sudralayotgan = useRef<BitimKartasi | null>(null);

  const yukla = useCallback(async () => {
    try {
      const r = await api.get<{ stages: KanbanUstun[] }>(`${base}/deals/board?pipeline=${voronkaId}${filtr ? `&${filtr}` : ''}`);
      setUstunlar(r.stages);
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, voronkaId, filtr, t]);

  useEffect(() => {
    setUstunlar(null);
    void yukla();
  }, [yukla]);

  /** Optimistik ko'chirish: karta darhol yangi ustunga o'tadi, xatoda qaytadi. */
  const kochir = async (b: BitimKartasi, ustun: KanbanUstun, lostReason?: string | null) => {
    if (b.stageId === ustun.id || !ustunlar) return;
    const oldingi = ustunlar;
    setUstunlar(
      ustunlar.map((u) => {
        if (u.id === b.stageId) return { ...u, count: u.count - 1, sum: u.sum - (b.amount ?? 0), deals: u.deals.filter((d) => d.id !== b.id) };
        if (u.id === ustun.id)
          return { ...u, count: u.count + 1, sum: u.sum + (b.amount ?? 0), deals: [{ ...b, stageId: ustun.id, stageEnteredAt: new Date().toISOString() }, ...u.deals] };
        return u;
      }),
    );
    try {
      await api.post(`${base}/deals/${b.id}/move`, { stageId: ustun.id, lostReason: lostReason ?? null });
    } catch (e) {
      setUstunlar(oldingi);
      setXato(e instanceof ApiError ? t(e.message) : t("Ko'chirib bo'lmadi"));
    }
  };

  const tushdi = (e: DragEvent, ustun: KanbanUstun) => {
    e.preventDefault();
    setUstida(null);
    const b = sudralayotgan.current;
    sudralayotgan.current = null;
    if (!b || b.stageId === ustun.id) return;
    if (ustun.kind === 'lost') setYoqotish({ bitim: b, bosqich: ustun });
    else void kochir(b, ustun);
  };

  if (xato && !ustunlar) return <div className="card xato-qator">{xato}</div>;
  if (!ustunlar) return <div className="card yuklanmoqda">{t('Yuklanmoqda…')}</div>;

  return (
    <>
      {xato && (
        <div className="card xato-qator ci-xato" role="alert">
          {xato}
        </div>
      )}
      <div className="ci-kanban" role="list" aria-label={t('Bosqichlar')}>
        {ustunlar.map((u) => (
          <section
            key={u.id}
            role="listitem"
            className={`ci-ustun${ustida === u.id ? ' ustida' : ''} ${u.kind}`}
            style={{ ['--bosqich' as string]: u.color }}
            aria-label={u.name}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (ustida !== u.id) setUstida(u.id);
            }}
            onDragLeave={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) setUstida(null);
            }}
            onDrop={(e) => tushdi(e, u)}
          >
            <header className="ci-ustun-bosh">
              <div className="ci-ustun-nom" title={u.name}>
                {u.name}
              </div>
              <div className="ci-ustun-jami">
                <span>{t('{n} ta bitim', { n: u.count })}</span>
                {u.sum > 0 && <b>{pul(u.sum)}</b>}
              </div>
            </header>
            <div className="ci-ustun-ichi">
              {u.deals.map((d) => (
                <KanbanKarta
                  key={d.id}
                  d={d}
                  onDragStart={() => {
                    sudralayotgan.current = d;
                  }}
                  onOch={() => navigate(`/crm/bitimlar/${d.id}`)}
                />
              ))}
              {u.count > u.deals.length && (
                <Link className="ci-yana" to={`/crm/bitimlar?v=${voronkaId}&k=jadval&b=${u.id}`}>
                  {t('Yana {n} ta — jadvalda', { n: u.count - u.deals.length })}
                </Link>
              )}
              {u.count === 0 && <div className="ci-ustun-bosh-holat">{t("Bitim yo'q")}</div>}
            </div>
          </section>
        ))}
      </div>

      {yoqotish && (
        <YoqotishSababi
          onYop={() => setYoqotish(null)}
          onTasdiq={(sabab) => {
            void kochir(yoqotish.bitim, yoqotish.bosqich, sabab);
            setYoqotish(null);
          }}
        />
      )}
    </>
  );
}

function KanbanKarta({ d, onDragStart, onOch }: { d: BitimKartasi; onDragStart: () => void; onOch: () => void }) {
  const t = useT();
  const muddat = muddatHolati(d.nextTaskAt);
  return (
    <article
      className="ci-karta"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', d.id);
        onDragStart();
      }}
    >
      <Link to={`/crm/bitimlar/${d.id}`} className="ci-karta-nom" onClick={(e) => (e.preventDefault(), onOch())}>
        {d.name}
      </Link>
      {(d.contactName || d.contactPhone) && (
        <div className="ci-karta-kontakt">
          {d.contactName ?? d.contactPhone}
          {d.contactName && d.contactPhone && <span> · {d.contactPhone}</span>}
        </div>
      )}
      <div className="ci-karta-past">
        {d.amount !== null && <b className="ci-karta-summa">{pul(d.amount)}</b>}
        {d.responsibleName && (
          <span className="ci-karta-masul" title={t("Mas'ul")}>
            <User aria-hidden="true" /> {d.responsibleName}
          </span>
        )}
      </div>
      <div className="ci-karta-holat">
        {d.openTasks === 0 ? (
          <span className="ci-belgi-matn ogoh">
            <TriangleAlert aria-hidden="true" /> {t("Vazifa yo'q")}
          </span>
        ) : (
          <span className={`ci-belgi-matn ${muddat === 'otgan' ? 'xavf' : ''}`}>
            <CalendarClock aria-hidden="true" /> {muddat === 'otgan' ? t("Muddati o'tgan") : fmtQachonKeyin(d.nextTaskAt, t)}
          </span>
        )}
        <span className="ci-karta-vaqt" title={t('Bosqichda')}>
          {fmtQachon(d.stageEnteredAt)}
        </span>
      </div>
    </article>
  );
}

/** Kelajakdagi muddat: "bugun 14:00", "25.10". */
function fmtQachonKeyin(iso: string | null, t: (s: string, v?: Record<string, string | number>) => string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  if (d.toDateString() === new Date().toDateString()) return t('bugun {v}', { v: `${p(d.getHours())}:${p(d.getMinutes())}` });
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}`;
}

export function YoqotishSababi({ onYop, onTasdiq }: { onYop: () => void; onTasdiq: (sabab: string | null) => void }) {
  const t = useT();
  const [sabab, setSabab] = useState('');
  return (
    <Oyna
      sarlavha={t("Bitim yo'qotildi")}
      onYop={onYop}
      onSubmit={() => onTasdiq(sabab.trim() || null)}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn xavfli">
            {t("Yo'qotildi deb belgilash")}
          </button>
        </>
      }
    >
      <div className="maydon-blok">
        <label htmlFor="ci-sabab">{t('Sababi (ixtiyoriy)')}</label>
        <textarea id="ci-sabab" rows={3} maxLength={500} value={sabab} onChange={(e) => setSabab(e.target.value)} placeholder={t('Masalan: qimmat, boshqa markazni tanladi')} />
      </div>
    </Oyna>
  );
}

// ─── Jadval ──────────────────────────────────────────────────────────────────

function Jadval({
  voronkaId,
  bosqichlar,
  filtr,
  bosqich,
  onBosqich,
}: {
  voronkaId: string;
  bosqichlar: Bosqich[];
  filtr: string;
  bosqich: string | null;
  onBosqich: (b: string | null) => void;
}) {
  const { base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [sahifa, setSahifa] = useState(0);
  const [data, setData] = useState<{ total: number; items: BitimKartasi[] } | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => setSahifa(0), [voronkaId, filtr, bosqich]);

  useEffect(() => {
    let tirik = true;
    const q = new URLSearchParams(filtr);
    q.set('pipeline', voronkaId);
    if (bosqich) q.set('stage', bosqich);
    q.set('limit', String(SAHIFA_HAJMI));
    q.set('offset', String(sahifa * SAHIFA_HAJMI));
    api
      .get<{ total: number; items: BitimKartasi[] }>(`${base}/deals?${q}`)
      .then((r) => tirik && (setData(r), setXato(null)))
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")));
    return () => {
      tirik = false;
    };
  }, [base, voronkaId, filtr, bosqich, sahifa, t]);

  const bosqichMap = useMemo(() => new Map(bosqichlar.map((b) => [b.id, b])), [bosqichlar]);
  const sahifalar = data ? Math.max(1, Math.ceil(data.total / SAHIFA_HAJMI)) : 1;

  return (
    <div className="card ci-jadval-karta">
      <div className="ci-jadval-tepa">
        <select className="input ci-tor" value={bosqich ?? ''} onChange={(e) => onBosqich(e.target.value || null)} aria-label={t('Bosqich')}>
          <option value="">{t('Barcha bosqichlar')}</option>
          {bosqichlar.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        {data && <span className="yordam">{t('Jami: {n}', { n: data.total })}</span>}
      </div>
      {xato && <div className="xato-qator">{xato}</div>}
      {!data && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
      {data && data.items.length === 0 && <div className="ci-bosh-holat">{t('Bitimlar topilmadi')}</div>}
      {data && data.items.length > 0 && (
        <div className="ci-jadval-qobiq">
          <table className="jadval">
            <thead>
              <tr>
                <th>{t('Bitim')}</th>
                <th>{t('Kontakt')}</th>
                <th>{t('Bosqich')}</th>
                <th className="ci-ong">{t('Summa')}</th>
                <th>{t("Mas'ul")}</th>
                <th>{t('Keyingi vazifa')}</th>
                <th>{t('Yangilangan')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => {
                const b = bosqichMap.get(d.stageId);
                const m = muddatHolati(d.nextTaskAt);
                return (
                  <tr key={d.id} className="bosiladigan" onClick={() => navigate(`/crm/bitimlar/${d.id}`)}>
                    <td>
                      <Link to={`/crm/bitimlar/${d.id}`} className="ci-havola" onClick={(e) => e.stopPropagation()}>
                        {d.name}
                      </Link>
                    </td>
                    <td>
                      {d.contactName ?? '—'}
                      {d.contactPhone && <div className="yordam">{d.contactPhone}</div>}
                    </td>
                    <td>
                      {b && (
                        <span className="ci-bosqich-belgi" style={{ ['--bosqich' as string]: b.color }}>
                          {b.name}
                        </span>
                      )}
                    </td>
                    <td className="ci-ong ci-raqam">{pul(d.amount)}</td>
                    <td>{d.responsibleName ?? '—'}</td>
                    <td>
                      {d.openTasks === 0 ? (
                        <span className="ci-belgi-matn ogoh">{t("Vazifa yo'q")}</span>
                      ) : (
                        <span className={`ci-belgi-matn ${m === 'otgan' ? 'xavf' : ''}`}>
                          {m === 'otgan' ? t("Muddati o'tgan") : fmtQachonKeyin(d.nextTaskAt, t) || t('Muddatsiz')}
                        </span>
                      )}
                    </td>
                    <td className="yordam">{fmtQachon(d.updatedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
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
  );
}

// ─── Yangi bitim ─────────────────────────────────────────────────────────────

function YangiBitim({ voronkaId, onYop }: { voronkaId: string; onYop: () => void }) {
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [pipelineId, setPipelineId] = useState(voronkaId);
  const voronka = holat.pipelines.find((p) => p.id === pipelineId) ?? holat.pipelines[0]!;
  const birinchiOchiq = voronka.stages.find((s) => s.kind === 'open') ?? voronka.stages[0]!;
  const [stageId, setStageId] = useState(birinchiOchiq.id);
  const [nom, setNom] = useState('');
  const [summa, setSumma] = useState('');
  const [ism, setIsm] = useState('');
  const [tel, setTel] = useState('');
  const [masul, setMasul] = useState(holat.seatId ?? '');
  const majburiy = holat.fields.filter((f) => f.required);
  const [maydonlar, setMaydonlar] = useState<Record<string, unknown>>({});
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    if (!voronka.stages.some((s) => s.id === stageId)) setStageId(birinchiOchiq.id);
  }, [voronka, stageId, birinchiOchiq.id]);

  const saqla = async () => {
    if (!nom.trim() && !ism.trim()) {
      setXato(t('Bitim nomini yoki mijoz ismini kiriting'));
      return;
    }
    setBand(true);
    setXato(null);
    try {
      const fields: Record<string, unknown> = {};
      for (const m of majburiy) fields[m.id] = qiymatniTayyorla(m, maydonlar[m.id]);
      const r = await api.post<{ id: string }>(`${base}/deals`, {
        name: nom.trim() || ism.trim(),
        pipelineId,
        stageId,
        amount: summa.trim() ? Number(summa.replace(/\s/g, '').replace(',', '.')) : null,
        responsibleSeatId: holat.canManageAll ? masul || null : undefined,
        contact: ism.trim() || tel.trim() ? { name: ism.trim() || null, phone: tel.trim() || null } : undefined,
        fields,
      });
      navigate(`/crm/bitimlar/${r.id}`);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      setBand(false);
    }
  };

  return (
    <Oyna
      sarlavha={t('Yangi bitim')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn" disabled={band}>
            {band ? t('Saqlanmoqda…') : t('Yaratish')}
          </button>
        </>
      }
    >
      <div className="maydon-blok">
        <label htmlFor="yb-nom">{t('Bitim nomi')}</label>
        <input id="yb-nom" className="input" value={nom} maxLength={250} onChange={(e) => setNom(e.target.value)} placeholder={t('Bo‘sh qolsa — mijoz ismi')} />
      </div>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="yb-ism">{t('Mijoz ismi')}</label>
          <input id="yb-ism" className="input" value={ism} maxLength={200} onChange={(e) => setIsm(e.target.value)} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="yb-tel">{t('Telefon')}</label>
          <input id="yb-tel" className="input" type="tel" value={tel} maxLength={40} onChange={(e) => setTel(e.target.value)} placeholder="+998 90 123 45 67" />
        </div>
      </div>
      <p className="vr-oyna-eslatma">{t("Bu raqamli mijoz bazada bo'lsa, bitim unga bog'lanadi — qo'ng'iroqlari ham ko'rinadi.")}</p>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="yb-voronka">{t('Voronka')}</label>
          <select id="yb-voronka" className="input" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
            {holat.pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="maydon-blok">
          <label htmlFor="yb-bosqich">{t('Bosqich')}</label>
          <select id="yb-bosqich" className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
            {voronka.stages.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="yb-summa">{t('Summa')}</label>
          <input id="yb-summa" className="input" inputMode="decimal" value={summa} onChange={(e) => setSumma(e.target.value.replace(/[^\d.,\s]/g, ''))} placeholder="0" />
        </div>
        {holat.canManageAll && (
          <div className="maydon-blok">
            <label htmlFor="yb-masul">{t("Mas'ul")}</label>
            <select id="yb-masul" className="input" value={masul} onChange={(e) => setMasul(e.target.value)}>
              <option value="">{t('Biriktirilmagan')}</option>
              {seatlar.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {majburiy.map((m) => (
        <div className="maydon-blok" key={m.id}>
          <label htmlFor={`yb-${m.id}`}>
            {m.label} <span className="ci-majburiy">*</span>
          </label>
          <MaydonKiritish id={`yb-${m.id}`} m={m} qiymat={maydonlar[m.id]} onChange={(v) => setMaydonlar((x) => ({ ...x, [m.id]: v }))} />
        </div>
      ))}
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}
