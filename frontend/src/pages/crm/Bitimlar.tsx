import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ArrowUpRight,
  Bookmark,
  ChartNoAxesColumnIncreasing,
  Check,
  CircleX,
  Clock,
  Columns3,
  Download,
  Ellipsis,
  Filter,
  List,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, fmtQachon } from '../../api';
import { Teglar, TeglarKiritish } from '../../crm/komponentlar';
import {
  bosqichTop,
  MaydonKiritish,
  muddatHolati,
  pul,
  qiymatniTayyorla,
  useCrm,
  yuklabOl,
  type BitimKartasi,
  type KanbanUstun,
} from '../../crm/malumot';
import { MsBosh } from '../../crm/MsBosh';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';
import { ImportOyna } from './ImportOyna';

const KORINISH_KALIT = 'sotuvai-crm-korinish';
const SAHIFA_HAJMI = 50;

/** URL'dagi filtr parametrlari — API nomlari bilan bir xil. */
const FILTR_KALITLARI = [
  'q',
  'seat',
  'status',
  'stages',
  'tags',
  'task',
  'createdFrom',
  'createdTo',
  'closedFrom',
  'closedTo',
  'amountMin',
  'amountMax',
  'source',
  'lostReasonId',
  'companyId',
  'trash',
] as const;

/**
 * Bitimlar: voronka bo'yicha Kanban (sudrab ko'chirish) yoki jadval
 * (belgilash, ommaviy amallar, saralash). Filtr, ko'rinish va voronka
 * manzilda — havola ulashilsa xuddi shu ko'rinish ochiladi.
 */
export function Bitimlar() {
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const asosiy = holat.pipelines.find((p) => p.isMain) ?? holat.pipelines[0]!;
  const voronka = holat.pipelines.find((p) => p.id === params.get('v')) ?? asosiy;
  const savat = params.get('trash') === '1';
  const korinish: 'kanban' | 'jadval' = savat
    ? 'jadval'
    : ((params.get('k') as 'kanban' | 'jadval' | null) ??
      (() => {
        try {
          return localStorage.getItem(KORINISH_KALIT) === 'jadval' ? 'jadval' : 'kanban';
        } catch {
          return 'kanban';
        }
      })());
  const [qidiruv, setQidiruv] = useState(params.get('q') ?? '');
  const [yangi, setYangi] = useState(false);
  const [panel, setPanel] = useState(false);
  const [importOyna, setImportOyna] = useState(false);
  const [yangilash, setYangilash] = useState(0);

  // Eski havolalar: `s` (mas'ul) va `b` (bitta bosqich)
  useEffect(() => {
    const n = new URLSearchParams(params);
    let o = false;
    if (n.get('s')) {
      n.set('seat', n.get('s')!);
      n.delete('s');
      o = true;
    }
    if (n.get('b')) {
      n.set('stages', n.get('b')!);
      n.delete('b');
      o = true;
    }
    if (o) setParams(n, { replace: true });
  }, [params, setParams]);

  const ozgartir = useCallback(
    (ozg: Record<string, string | null>) => {
      const p = new URLSearchParams(params);
      for (const [k, v] of Object.entries(ozg)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      setParams(p, { replace: true });
    },
    [params, setParams],
  );

  useEffect(() => {
    const id = setTimeout(() => {
      if ((params.get('q') ?? '') !== qidiruv.trim()) ozgartir({ q: qidiruv.trim() || null });
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qidiruv]);

  const filtr = useMemo(() => {
    const f = new URLSearchParams();
    for (const k of FILTR_KALITLARI) {
      const v = params.get(k);
      if (v) f.set(k, v);
    }
    return f.toString();
  }, [params]);

  const navigate = useNavigate();
  /** KPI qatori va "Jami" — kanban bilan bir xil voronka va filtr bo'yicha. */
  const [stat, setStat] = useState<KpiStat | null>(null);
  useEffect(() => {
    if (savat) return;
    let tirik = true;
    api
      .get<KpiStat>(`${base}/deals/board/stats?pipeline=${voronka.id}${filtr ? `&${filtr}` : ''}`)
      .then((r) => tirik && setStat(r))
      .catch(() => tirik && setStat(null));
    return () => {
      tirik = false;
    };
  }, [base, voronka.id, filtr, savat, yangilash]);
  const filtrSoni = FILTR_KALITLARI.filter((k) => k !== 'q' && k !== 'trash' && params.get(k)).length;

  const korinishniTanla = (k: 'kanban' | 'jadval') => {
    ozgartir({ k: k === 'kanban' ? null : 'jadval' });
    try {
      localStorage.setItem(KORINISH_KALIT, k);
    } catch {
      /* ixtiyoriy */
    }
  };

  const eksport = async () => {
    const q = new URLSearchParams(filtr);
    if (!savat) q.set('pipeline', voronka.id);
    try {
      await yuklabOl(`${base}/deals/export.csv?${q}`, `bitimlar-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch {
      alert(t("Eksport qilib bo'lmadi"));
    }
  };

  return (
    <div className="ci-sahifa ms-lidlar">
      <MsBosh
        sarlavha={savat ? t('Savat') : t('Lidlar')}
        chap={
          !savat && (
            <div className="ms-korinish" role="group" aria-label={t("Ko'rinish")}>
              <button type="button" aria-pressed={korinish === 'kanban'} onClick={() => korinishniTanla('kanban')} title={t('Kanban')} aria-label={t('Kanban')}>
                <Columns3 />
              </button>
              <button type="button" aria-pressed={korinish === 'jadval'} onClick={() => korinishniTanla('jadval')} title={t("Ro'yxat")} aria-label={t("Ro'yxat")}>
                <List />
              </button>
            </div>
          )
        }
        qidiruv={{ qiymat: qidiruv, onChange: setQidiruv, nom: t('Lidlarni qidirish') }}
        jami={!savat && stat ? `${pul(stat.total)} · ${pul(stat.sum)} ${t("so'm")}` : undefined}
      >
        {savat ? (
          <button className="btn ikkinchi" onClick={() => ozgartir({ trash: null })}>
            <X /> {t('Savatdan chiqish')}
          </button>
        ) : (
          <>
            <button
              type="button"
              className={`ms-ikon-tugma${panel || filtrSoni ? ' faol' : ''}`}
              onClick={() => setPanel((v) => !v)}
              aria-expanded={panel}
              title={t('Filtr')}
              aria-label={t('Filtr')}
            >
              <Filter />
              {filtrSoni > 0 && <span className="ms-nuqta-son">{filtrSoni}</span>}
            </button>
            <SaqlanganFiltrlar filtr={filtr} onTanla={(f) => setParams(new URLSearchParams({ ...(params.get('v') ? { v: params.get('v')! } : {}), ...(params.get('k') ? { k: params.get('k')! } : {}), ...f }), { replace: true })} />
            <KopMenyu
              bandlar={[
                { nom: t('CSV eksport'), ikon: <Download />, amal: () => void eksport() },
                ...(holat.canConfigure ? [{ nom: t('Import'), ikon: <Upload />, amal: () => setImportOyna(true) }] : []),
                { nom: t('Voronka tahlili'), ikon: <ChartNoAxesColumnIncreasing />, amal: () => navigate(`/crm/voronka-tahlili?v=${voronka.id}`) },
                { nom: t('Savat'), ikon: <Trash2 />, amal: () => ozgartir({ trash: '1', k: 'jadval' }) },
              ]}
            />
            <button className="btn" onClick={() => setYangi(true)}>
              <Plus /> {t('Yangi lid')}
            </button>
          </>
        )}
      </MsBosh>

      {!savat && <KpiQator stat={stat} params={params} ozgartir={ozgartir} />}
      {panel && <FiltrPanel params={params} voronkaId={voronka.id} ozgartir={ozgartir} onYop={() => setPanel(false)} />}
      <FaolFiltrlar params={params} ozgartir={ozgartir} seatlar={seatlar} />

      {korinish === 'kanban' ? (
        <Kanban voronkaId={voronka.id} asosiy={voronka.isMain} filtr={filtr} yangilash={yangilash} />
      ) : (
        <Jadval voronkaId={savat ? null : voronka.id} filtr={filtr} savat={savat} yangilash={yangilash} onYangila={() => setYangilash((x) => x + 1)} />
      )}

      {yangi && <YangiBitim voronkaId={voronka.id} onYop={() => setYangi(false)} />}
      {importOyna && <ImportOyna voronkaId={voronka.id} onYop={() => setImportOyna(false)} onTugadi={() => setYangilash((x) => x + 1)} />}
    </div>
  );
}

// ─── Filtrlar ────────────────────────────────────────────────────────────────

type Ozgartir = (ozg: Record<string, string | null>) => void;

interface KpiStat {
  total: number;
  sum: number;
  todayTasks: number;
  noTask: number;
  overdue: number;
  newToday: number;
  newYesterday: number;
  forecast: number;
}

/**
 * KPI qatori (Metasell): bugungi vazifalar · vazifasiz · muddati o'tgan ·
 * bugun/kecha yangi · savdo prognozi. Har ko'rsatkich bosilsa o'sha lidlar
 * filtrlanadi (qayta bosilsa — filtr olinadi).
 */
function KpiQator({ stat, params, ozgartir }: { stat: KpiStat | null; params: URLSearchParams; ozgartir: Ozgartir }) {
  const t = useT();
  const bugun = new Date();
  bugun.setHours(0, 0, 0, 0);
  const bandlar: { nom: string; qiymat: string; rang?: 'sariq' | 'qizil'; f: Record<string, string>; izoh: string }[] = [
    { nom: 'Bugungi vazifalar', qiymat: stat ? pul(stat.todayTasks) : '—', f: { task: 'today' }, izoh: "Muddati bugun tugaydigan ochiq vazifasi bor lidlar" },
    { nom: 'Vazifasiz', qiymat: stat ? pul(stat.noTask) : '—', rang: 'sariq', f: { status: 'open', task: 'none' }, izoh: "Ochiq, lekin keyingi qadami (vazifasi) yo'q lidlar" },
    { nom: "Muddati o'tgan", qiymat: stat ? pul(stat.overdue) : '—', rang: 'qizil', f: { task: 'overdue' }, izoh: "Vazifa muddati o'tib ketgan lidlar" },
    {
      nom: 'Bugun / kecha yangi',
      qiymat: stat ? `${pul(stat.newToday)} / ${pul(stat.newYesterday)}` : '—',
      f: { createdFrom: bugun.toISOString() },
      izoh: 'Bugun va kecha yaratilgan lidlar (bosilsa — bugungilar)',
    },
  ];
  return (
    <section className="ms-kpi" aria-label={t("Ko'rsatkichlar")}>
      {bandlar.map((b) => {
        const faol = Object.entries(b.f).every(([k, v]) => params.get(k) === v);
        return (
          <button
            key={b.nom}
            type="button"
            className={`ms-kpi-band${b.rang ? ` ${b.rang}` : ''}${faol ? ' faol' : ''}`}
            aria-pressed={faol}
            title={t(b.izoh)}
            onClick={() => ozgartir(Object.fromEntries(Object.keys(b.f).map((k) => [k, faol ? null : b.f[k]!])))}
          >
            <span className="ms-kpi-nom">{t(b.nom)}</span>
            <b className="ms-kpi-qiymat">{b.qiymat}</b>
          </button>
        );
      })}
      <div className="ms-kpi-band ms-kpi-prognoz" title={t("Ochiq lidlar summasi bosqich ehtimoliga ko'ra: oxirgi bosqichga qanchalik yaqin bo'lsa, shuncha to'liq hisoblanadi")}>
        <span className="ms-kpi-nom">{t('Savdo prognozi')}</span>
        <b className="ms-kpi-qiymat">
          {stat ? pul(stat.forecast) : '—'} <small>{t("so'm")}</small>
        </b>
      </div>
    </section>
  );
}

/** "⋯" yoki boshqa ikonka ostidagi kichik menyu. */
function KopMenyu({
  bandlar,
  ikon,
  nom,
}: {
  bandlar: { nom: string; ikon?: ReactNode; amal: () => void; faol?: boolean }[];
  ikon?: ReactNode;
  nom?: string;
}) {
  const t = useT();
  const [ochiq, setOchiq] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
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
  return (
    <div className="ci-menyu-qobiq" ref={ref}>
      <button
        type="button"
        className="ms-ikon-tugma"
        onClick={() => setOchiq((v) => !v)}
        aria-expanded={ochiq}
        aria-haspopup="menu"
        aria-label={nom ?? t('Boshqa amallar')}
        title={nom ?? t('Boshqa amallar')}
      >
        {ikon ?? <Ellipsis />}
      </button>
      {ochiq && (
        <div className="ci-menyu ms-menyu" role="menu">
          {bandlar.map((b) => (
            <button
              key={b.nom}
              type="button"
              role="menuitem"
              className={b.faol ? 'faol' : undefined}
              onClick={() => {
                setOchiq(false);
                b.amal();
              }}
            >
              {b.ikon}
              <span>{b.nom}</span>
              {b.faol && <Check className="ms-menyu-belgi" aria-hidden="true" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FiltrPanel({ params, voronkaId, ozgartir, onYop }: { params: URLSearchParams; voronkaId: string; ozgartir: Ozgartir; onYop: () => void }) {
  const { holat, seatlar } = useCrm();
  const t = useT();
  const voronka = holat.pipelines.find((p) => p.id === voronkaId)!;
  const sana = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('sv-SE') : '');
  const [f, setF] = useState({
    status: params.get('status') ?? '',
    stages: (params.get('stages') ?? '').split(',').filter(Boolean),
    seat: params.get('seat') ?? '',
    tags: (params.get('tags') ?? '').split(',').filter(Boolean),
    task: params.get('task') ?? '',
    createdFrom: sana(params.get('createdFrom')),
    createdTo: params.get('createdTo') ? sana(new Date(new Date(params.get('createdTo')!).getTime() - 1).toISOString()) : '',
    amountMin: params.get('amountMin') ?? '',
    amountMax: params.get('amountMax') ?? '',
    source: params.get('source') ?? '',
    lostReasonId: params.get('lostReasonId') ?? '',
  });
  const qolla = () => {
    ozgartir({
      status: f.status || null,
      stages: f.stages.join(',') || null,
      seat: f.seat || null,
      tags: f.tags.join(',') || null,
      task: f.task || null,
      createdFrom: f.createdFrom ? new Date(f.createdFrom + 'T00:00:00').toISOString() : null,
      createdTo: f.createdTo ? new Date(new Date(f.createdTo + 'T00:00:00').getTime() + 86400000).toISOString() : null,
      amountMin: f.amountMin || null,
      amountMax: f.amountMax || null,
      source: f.source || null,
      lostReasonId: f.lostReasonId || null,
    });
    onYop();
  };
  const tozala = () => {
    ozgartir(Object.fromEntries(FILTR_KALITLARI.filter((k) => k !== 'q' && k !== 'trash').map((k) => [k, null])));
    onYop();
  };
  return (
    <section className="card ci-filtr-panel" aria-label={t('Filtr')}>
      <div className="ci-filtr-panjara">
        <div className="maydon-blok">
          <label htmlFor="fp-holat">{t('Holat')}</label>
          <select id="fp-holat" className="input" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">{t('Hammasi')}</option>
            <option value="open">{t('Ochiq')}</option>
            <option value="won">{t('Muvaffaqiyatli')}</option>
            <option value="lost">{t("Yo'qotilgan")}</option>
            <option value="closed">{t('Yopilgan (hammasi)')}</option>
          </select>
        </div>
        {holat.scope === 'all' && (
          <div className="maydon-blok">
            <label htmlFor="fp-masul">{t("Mas'ul")}</label>
            <select id="fp-masul" className="input" value={f.seat} onChange={(e) => setF({ ...f, seat: e.target.value })}>
              <option value="">{t("Barcha mas'ullar")}</option>
              {seatlar.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="maydon-blok">
          <label htmlFor="fp-vazifa">{t('Vazifalar')}</label>
          <select id="fp-vazifa" className="input" value={f.task} onChange={(e) => setF({ ...f, task: e.target.value })}>
            <option value="">{t('Hammasi')}</option>
            <option value="none">{t('Vazifasiz')}</option>
            <option value="overdue">{t("Muddati o'tgan")}</option>
            <option value="today">{t('Bugungi')}</option>
          </select>
        </div>
        <div className="maydon-blok">
          <label htmlFor="fp-sabab">{t('Rad sababi')}</label>
          <select id="fp-sabab" className="input" value={f.lostReasonId} onChange={(e) => setF({ ...f, lostReasonId: e.target.value })}>
            <option value="">{t('Hammasi')}</option>
            {holat.lossReasons.map((r) => (
              <option key={r.id} value={r.id}>
                {t(r.name)}
              </option>
            ))}
          </select>
        </div>
        <div className="maydon-blok">
          <label htmlFor="fp-dan">{t('Yaratilgan: dan')}</label>
          <input id="fp-dan" className="input" type="date" value={f.createdFrom} onChange={(e) => setF({ ...f, createdFrom: e.target.value })} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="fp-gacha">{t('gacha')}</label>
          <input id="fp-gacha" className="input" type="date" value={f.createdTo} onChange={(e) => setF({ ...f, createdTo: e.target.value })} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="fp-min">{t('Summa: dan')}</label>
          <input id="fp-min" className="input" inputMode="numeric" value={f.amountMin} onChange={(e) => setF({ ...f, amountMin: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="fp-max">{t('gacha')}</label>
          <input id="fp-max" className="input" inputMode="numeric" value={f.amountMax} onChange={(e) => setF({ ...f, amountMax: e.target.value.replace(/\D/g, '') })} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="fp-manba">{t('Manba')}</label>
          <input id="fp-manba" className="input" value={f.source} maxLength={100} onChange={(e) => setF({ ...f, source: e.target.value })} />
        </div>
        <div className="maydon-blok ci-keng-maydon">
          <label htmlFor="fp-teg">{t('Teglar')}</label>
          <TeglarKiritish id="fp-teg" qiymat={f.tags} onChange={(tags) => setF({ ...f, tags })} />
        </div>
      </div>
      <div className="maydon-blok">
        <label>{t('Bosqichlar')}</label>
        <div className="ci-kopli">
          {voronka.stages.map((s) => {
            const bor = f.stages.includes(s.id);
            return (
              <button
                type="button"
                key={s.id}
                className={`ci-chip${bor ? ' faol' : ''}`}
                aria-pressed={bor}
                onClick={() => setF({ ...f, stages: bor ? f.stages.filter((x) => x !== s.id) : [...f.stages, s.id] })}
              >
                <span className="ci-nuqta" style={{ background: s.color }} aria-hidden="true" /> {s.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="ci-saqlash-qator">
        <button className="btn ikkinchi" onClick={tozala}>
          {t('Tozalash')}
        </button>
        <button className="btn" onClick={qolla}>
          {t("Qo'llash")}
        </button>
      </div>
    </section>
  );
}

/** Faol filtrlar — bittasini bosib olib tashlash. */
function FaolFiltrlar({ params, ozgartir, seatlar }: { params: URLSearchParams; ozgartir: Ozgartir; seatlar: { id: string; displayName: string }[] }) {
  const { holat } = useCrm();
  const t = useT();
  const sana = (iso: string) => new Date(iso).toLocaleDateString('ru-RU');
  const chiplar: { kalit: string[]; matn: string }[] = [];
  const st = params.get('status');
  if (st) chiplar.push({ kalit: ['status'], matn: t({ open: 'Ochiq', won: 'Muvaffaqiyatli', lost: "Yo'qotilgan", closed: 'Yopilgan (hammasi)' }[st] ?? st) });
  const sid = params.get('seat');
  if (sid) chiplar.push({ kalit: ['seat'], matn: `${t("Mas'ul")}: ${seatlar.find((s) => s.id === sid)?.displayName ?? '—'}` });
  for (const s of (params.get('stages') ?? '').split(',').filter(Boolean)) {
    const b = bosqichTop(holat, s);
    chiplar.push({ kalit: [`stages:${s}`], matn: b?.name ?? '—' });
  }
  for (const tg of (params.get('tags') ?? '').split(',').filter(Boolean)) chiplar.push({ kalit: [`tags:${tg}`], matn: `#${tg}` });
  const tk = params.get('task');
  if (tk) chiplar.push({ kalit: ['task'], matn: t({ none: 'Vazifasiz', overdue: "Muddati o'tgan vazifa", today: 'Bugungi vazifa' }[tk] ?? tk) });
  if (params.get('createdFrom') || params.get('createdTo'))
    chiplar.push({
      kalit: ['createdFrom', 'createdTo'],
      matn: `${t('Yaratilgan')}: ${params.get('createdFrom') ? sana(params.get('createdFrom')!) : '…'} – ${params.get('createdTo') ? sana(new Date(new Date(params.get('createdTo')!).getTime() - 1).toISOString()) : '…'}`,
    });
  if (params.get('closedFrom') || params.get('closedTo'))
    chiplar.push({
      kalit: ['closedFrom', 'closedTo'],
      matn: `${t('Yopilgan')}: ${params.get('closedFrom') ? sana(params.get('closedFrom')!) : '…'} – ${params.get('closedTo') ? sana(new Date(new Date(params.get('closedTo')!).getTime() - 1).toISOString()) : '…'}`,
    });
  if (params.get('amountMin') || params.get('amountMax'))
    chiplar.push({ kalit: ['amountMin', 'amountMax'], matn: `${t('Summa')}: ${pul(Number(params.get('amountMin') || 0))} – ${params.get('amountMax') ? pul(Number(params.get('amountMax'))) : '∞'}` });
  if (params.get('source')) chiplar.push({ kalit: ['source'], matn: `${t('Manba')}: ${params.get('source')}` });
  const lr = params.get('lostReasonId');
  if (lr) chiplar.push({ kalit: ['lostReasonId'], matn: `${t('Rad sababi')}: ${t(holat.lossReasons.find((r) => r.id === lr)?.name ?? '—')}` });
  if (!chiplar.length) return null;
  const olib = (kalit: string[]) => {
    const ozg: Record<string, string | null> = {};
    for (const k of kalit) {
      const [nom, qiymat] = k.split(':');
      if (qiymat) ozg[nom!] = (params.get(nom!) ?? '').split(',').filter((x) => x && x !== qiymat).join(',') || null;
      else ozg[nom!] = null;
    }
    ozgartir(ozg);
  };
  return (
    <div className="ci-faol-filtrlar">
      {chiplar.map((c) => (
        <span key={c.kalit.join()} className="ci-teg">
          {c.matn}
          <button type="button" onClick={() => olib(c.kalit)} aria-label={t('Filtrni olib tashlash')}>
            <X />
          </button>
        </span>
      ))}
    </div>
  );
}

function SaqlanganFiltrlar({ filtr, onTanla }: { filtr: string; onTanla: (f: Record<string, string>) => void }) {
  const { base } = useCrm();
  const t = useT();
  const [royxat, setRoyxat] = useState<{ id: string; name: string; filter: Record<string, string> }[]>([]);
  const [ochiq, setOchiq] = useState(false);
  const [nom, setNom] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const yukla = useCallback(() => {
    void api
      .get<{ items: { id: string; name: string; filter: Record<string, string> }[] }>(`${base}/crm-app/saved-filters`)
      .then((r) => setRoyxat(r.items))
      .catch(() => undefined);
  }, [base]);
  useEffect(yukla, [yukla]);
  useEffect(() => {
    if (!ochiq) return;
    const yop = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOchiq(false);
    document.addEventListener('mousedown', yop);
    return () => document.removeEventListener('mousedown', yop);
  }, [ochiq]);

  const saqla = async () => {
    if (!nom.trim()) return;
    const f = Object.fromEntries(new URLSearchParams(filtr));
    delete f.trash;
    await api.post(`${base}/crm-app/saved-filters`, { name: nom.trim(), filter: f }).catch(() => undefined);
    setNom('');
    yukla();
  };

  return (
    <div className="ci-menyu-qobiq" ref={ref}>
      <button className="btn ikkinchi kichik" onClick={() => setOchiq((v) => !v)} aria-expanded={ochiq} aria-haspopup="true">
        <Bookmark /> {t('Saqlangan')}
      </button>
      {ochiq && (
        <div className="ci-menyu" role="menu">
          {royxat.length === 0 && <div className="ci-menyu-bosh">{t("Saqlangan filtr yo'q")}</div>}
          {royxat.map((r) => (
            <div key={r.id} className="ci-menyu-qator">
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onTanla(r.filter);
                  setOchiq(false);
                }}
              >
                {r.name}
              </button>
              <button
                type="button"
                className="vr-amal"
                aria-label={t("O'chirish")}
                onClick={async () => {
                  await api.del(`${base}/crm-app/saved-filters/${r.id}`).catch(() => undefined);
                  yukla();
                }}
              >
                <X />
              </button>
            </div>
          ))}
          <form
            className="ci-menyu-forma"
            onSubmit={(e) => {
              e.preventDefault();
              void saqla();
            }}
          >
            <input className="input" value={nom} maxLength={60} onChange={(e) => setNom(e.target.value)} placeholder={t('Joriy filtrni saqlash…')} aria-label={t('Filtr nomi')} />
            <button className="btn kichik" type="submit" disabled={!nom.trim() || !filtr}>
              {t('Saqlash')}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Kanban ──────────────────────────────────────────────────────────────────

type UstunTartibi = 'yangi' | 'eski' | 'summa' | 'uzoq';
const USTUN_TARTIBI: { k: UstunTartibi; nom: string }[] = [
  { k: 'yangi', nom: 'Bosqichga yaqinda tushganlar' },
  { k: 'uzoq', nom: 'Bosqichda uzoq turganlar' },
  { k: 'summa', nom: "Summa bo'yicha" },
  { k: 'eski', nom: 'Avval yaratilganlar' },
];

function tartibla(deals: BitimKartasi[], tartib: UstunTartibi): BitimKartasi[] {
  if (tartib === 'yangi') return deals; // server tartibi: bosqichga tushgan vaqt bo'yicha, yangisi tepada
  const a = [...deals];
  if (tartib === 'uzoq') a.sort((x, y) => x.stageEnteredAt.localeCompare(y.stageEnteredAt));
  if (tartib === 'summa') a.sort((x, y) => (y.amount ?? 0) - (x.amount ?? 0));
  if (tartib === 'eski') a.sort((x, y) => x.createdAt.localeCompare(y.createdAt));
  return a;
}

function Kanban({ voronkaId, asosiy, filtr, yangilash }: { voronkaId: string; asosiy: boolean; filtr: string; yangilash: number }) {
  const { base, holat } = useCrm();
  const [tartib, setTartib] = useState<Record<string, UstunTartibi>>({});
  // amoCRM dan sinxronlanayotgan voronka: bosqich u yerda o'zgartiriladi
  const tashqi = holat.pipelines.find((p) => p.id === voronkaId)?.external ? (holat.externalSync ?? 'CRM') : null;
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
  }, [yukla, yangilash]);

  /** Optimistik ko'chirish: karta darhol yangi ustunga o'tadi, xatoda qaytadi. */
  const kochir = async (b: BitimKartasi, ustun: KanbanUstun, sabab?: { lostReasonId: string | null; lostReason: string | null }) => {
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
      await api.post(`${base}/deals/${b.id}/move`, { stageId: ustun.id, ...(sabab ?? {}) });
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
      {tashqi && (
        <div className="card ci-sinx-qator" role="note">
          <RefreshCw aria-hidden="true" />
          {t("Bu voronka {crm} dan har daqiqada sinxronlanadi — bitim bosqichi, summasi va mas'uli {crm} da o'zgartiriladi.", { crm: tashqi })}
        </div>
      )}
      <div className="ms-kanban" role="list" aria-label={t('Bosqichlar')}>
        {asosiy && <SaralanmaganUstun yangilash={yangilash} />}
        {ustunlar.map((u) => {
          const ut = tartib[u.id] ?? 'yangi';
          return (
            <section
              key={u.id}
              role="listitem"
              className={`ms-ustun ${u.kind}${ustida === u.id ? ' ustida' : ''}`}
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
              <header className="ms-ustun-bosh">
                <div className="ms-ustun-matn">
                  <div className="ms-ustun-nom" title={u.name}>
                    {u.name}
                  </div>
                  <div className="ms-ustun-jami">
                    {t('{n} ta lid', { n: pul(u.count) })} · {pul(u.sum)} {t("so'm")}
                  </div>
                </div>
                <KopMenyu
                  ikon={<ArrowUpDown />}
                  nom={t('Saralash')}
                  bandlar={USTUN_TARTIBI.map((x) => ({ nom: t(x.nom), faol: ut === x.k, amal: () => setTartib((s) => ({ ...s, [u.id]: x.k })) }))}
                />
              </header>
              <div className="ms-ustun-ichi">
                {tartibla(u.deals, ut).map((d) => (
                  <LidKarta
                    key={d.id}
                    d={d}
                    tur={u.kind}
                    qulf={Boolean(tashqi && d.externalId)}
                    onDragStart={() => {
                      sudralayotgan.current = d;
                    }}
                    onOch={() => navigate(`/crm/bitimlar/${d.id}`)}
                  />
                ))}
                {u.count > u.deals.length && (
                  <Link className="ms-yana" to={`/crm/bitimlar?v=${voronkaId}&k=jadval&stages=${u.id}`}>
                    {t("Yana {n} ta — ro'yxatda", { n: pul(u.count - u.deals.length) })}
                  </Link>
                )}
                {u.count === 0 && <div className="ms-ustun-bosh-holat">{t("Bu bosqichda lid yo'q")}</div>}
              </div>
            </section>
          );
        })}
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

/** Bosqichda shuncha kundan ko'p turgan ochiq lid qizil soat belgisi oladi. */
const UZOQ_KUN = 7;

/** "26.10.2026 16:45" — kartadagi sana-vaqt. */
export function sanaVaqt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/**
 * Lid kartasi (Metasell): tepada kontakt va yaratilgan vaqt, o'rtada lid
 * nomi ↗, pastda summa · mas'ul · vazifa holati, so'ng teglar. Bosqichda
 * uzoq turgan ochiq lidda "⏱ N kun", yo'qotilganida — rad sababi.
 */
function LidKarta({
  d,
  tur,
  qulf,
  onDragStart,
  onOch,
}: {
  d: BitimKartasi;
  tur: KanbanUstun['kind'];
  qulf: boolean;
  onDragStart: () => void;
  onOch: () => void;
}) {
  const t = useT();
  const muddat = muddatHolati(d.nextTaskAt);
  const kun = Math.floor((Date.now() - new Date(d.stageEnteredAt).getTime()) / 86_400_000);
  const vazifa =
    tur !== 'open'
      ? null
      : d.openTasks === 0
        ? { k: 'yoq', nom: 'Vazifasiz' }
        : muddat === 'otgan'
          ? { k: 'otgan', nom: "Muddati o'tgan" }
          : { k: 'bor', nom: 'Vazifa bor', title: fmtQachonKeyin(d.nextTaskAt, t) };
  return (
    <article
      className={`ms-karta${qulf ? ' qulf' : ''}`}
      draggable={!qulf}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', d.id);
        onDragStart();
      }}
      onClick={(e) => {
        // Ichidagi havolalar o'zi ishlaydi; kartaning bo'sh joyi bosilsa — ochiladi
        if (!(e.target as HTMLElement).closest('a,button')) onOch();
      }}
    >
      <div className="ms-karta-tepa">
        <span className="ms-karta-kontakt">{d.contactName ?? d.contactPhone ?? ''}</span>
        {tur === 'open' && kun >= UZOQ_KUN && (
          <span className="ms-kun-belgi" title={t('Shu bosqichda {n} kundan beri', { n: kun })}>
            <Clock aria-hidden="true" /> {t('{n} kun', { n: kun })}
          </span>
        )}
        <time className="ms-karta-vaqt" dateTime={d.createdAt}>
          {sanaVaqt(d.createdAt)}
        </time>
      </div>
      <div className="ms-karta-nom">
        <Link to={`/crm/bitimlar/${d.id}`} onClick={(e) => (e.preventDefault(), onOch())}>
          {d.name}
        </Link>
        <a href={`/crm/bitimlar/${d.id}`} target="_blank" rel="noopener noreferrer" className="ms-karta-ochish" aria-label={t('Yangi oynada ochish')} title={t('Yangi oynada ochish')}>
          <ArrowUpRight />
        </a>
      </div>
      <div className="ms-karta-past">
        <span className="ms-summa">
          {pul(d.amount ?? 0)} {t("so'm")}
        </span>
        {d.responsibleName && (
          <span className="ms-masul" title={t("Mas'ul")}>
            {d.responsibleName}
          </span>
        )}
        {vazifa && (
          <span className={`ms-vazifa ${vazifa.k}`} title={vazifa.title}>
            {t(vazifa.nom)}
          </span>
        )}
      </div>
      {tur === 'lost' && d.lostReason && (
        <div className="ms-rad">
          <CircleX aria-hidden="true" /> {t(d.lostReason)}
        </div>
      )}
      {(d.tags?.length ?? 0) > 0 && (
        <div className="ms-teglar">
          {d.tags.map((tg) => (
            <span key={tg} className="ms-teg">
              {tg}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

interface MurojaatQisqa {
  id: string;
  source: 'call' | 'form' | 'manual';
  name: string | null;
  phone: string | null;
  message: string | null;
  formName: string | null;
  createdAt: string;
}

/**
 * Asosiy voronkaning birinchi ustuni — saralanmagan murojaatlar (Metasell'dagi
 * "Неразобранное"): SotuvAI qo'ng'iroqlari, veb-formalar va qo'lda
 * kiritilganlar. Qabul / rad "Saralanmagan" sahifasida.
 */
function SaralanmaganUstun({ yangilash }: { yangilash: number }) {
  const { base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [data, setData] = useState<{ total: number; items: MurojaatQisqa[] } | null>(null);
  useEffect(() => {
    let tirik = true;
    api
      .get<{ total: number; items: MurojaatQisqa[] }>(`${base}/crm-app/inbox?status=pending&limit=20`)
      .then((r) => tirik && setData(r))
      .catch(() => tirik && setData({ total: 0, items: [] }));
    return () => {
      tirik = false;
    };
  }, [base, yangilash]);
  const manba = { call: "Qo'ng'iroq", form: 'Forma', manual: "Qo'lda" } as const;
  return (
    <section className="ms-ustun saralanmagan" role="listitem" aria-label={t('Saralanmagan')}>
      <header className="ms-ustun-bosh">
        <div className="ms-ustun-matn">
          <div className="ms-ustun-nom">{t('Saralanmagan')}</div>
          <div className="ms-ustun-jami">{t('{n} ta lid', { n: pul(data?.total ?? 0) })}</div>
        </div>
      </header>
      <div className="ms-ustun-ichi">
        {data?.items.map((m) => (
          <article key={m.id} className="ms-karta" onClick={() => navigate('/crm/saralanmagan')}>
            <div className="ms-karta-tepa">
              <span className="ms-karta-kontakt">{t(manba[m.source])}</span>
              <time className="ms-karta-vaqt" dateTime={m.createdAt}>
                {sanaVaqt(m.createdAt)}
              </time>
            </div>
            <div className="ms-karta-nom">
              <Link to="/crm/saralanmagan">{m.name ?? m.phone ?? t('Murojaat')}</Link>
            </div>
            {(m.message || m.formName) && <div className="ms-karta-izoh">{m.message ?? m.formName}</div>}
            {m.name && m.phone && <div className="ms-karta-izoh">{m.phone}</div>}
          </article>
        ))}
        {data && data.total > data.items.length && (
          <Link className="ms-yana" to="/crm/saralanmagan">
            {t('Hammasini saralash ({n})', { n: pul(data.total) })}
          </Link>
        )}
        {data && data.total === 0 && <div className="ms-ustun-bosh-holat">{t("Bu bosqichda lid yo'q")}</div>}
      </div>
    </section>
  );
}

/** Kelajakdagi muddat: "bugun 14:00", "25.10". */
export function fmtQachonKeyin(iso: string | null, t: (s: string, v?: Record<string, string | number>) => string): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  if (d.toDateString() === new Date().toDateString()) return t('bugun {v}', { v: `${p(d.getHours())}:${p(d.getMinutes())}` });
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}`;
}

/** Yo'qotish sababi: katalogdan tanlash + izoh (PIPE-03). */
export function YoqotishSababi({
  onYop,
  onTasdiq,
}: {
  onYop: () => void;
  onTasdiq: (sabab: { lostReasonId: string | null; lostReason: string | null }) => void;
}) {
  const { holat } = useCrm();
  const t = useT();
  const [sababId, setSababId] = useState<string | null>(null);
  const [izoh, setIzoh] = useState('');
  const [xato, setXato] = useState<string | null>(null);
  return (
    <Oyna
      sarlavha={t("Bitim yo'qotildi")}
      onYop={onYop}
      onSubmit={() => {
        if (holat.lossReasonRequired && !sababId && !izoh.trim()) return setXato(t("Yo'qotish sababini tanlang"));
        onTasdiq({ lostReasonId: sababId, lostReason: izoh.trim() || null });
      }}
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
      {holat.lossReasons.length > 0 && (
        <div className="maydon-blok">
          <label>
            {t('Sababi')}
            {holat.lossReasonRequired && <span className="ci-majburiy"> *</span>}
          </label>
          <div className="ci-kopli" role="radiogroup" aria-label={t('Sababi')}>
            {holat.lossReasons.map((r) => (
              <button
                type="button"
                key={r.id}
                role="radio"
                aria-checked={sababId === r.id}
                className={`ci-chip${sababId === r.id ? ' faol' : ''}`}
                onClick={() => setSababId(sababId === r.id ? null : r.id)}
              >
                {t(r.name)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="maydon-blok">
        <label htmlFor="ci-sabab">{t('Izoh (ixtiyoriy)')}</label>
        <textarea id="ci-sabab" rows={2} maxLength={500} value={izoh} onChange={(e) => setIzoh(e.target.value)} placeholder={t('Masalan: qimmat, boshqa markazni tanladi')} />
      </div>
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}

// ─── Jadval: belgilash, ommaviy amallar, saralash ────────────────────────────

type Saralash = 'updated' | 'created' | 'amount' | 'name' | 'stage';

function Jadval({
  voronkaId,
  filtr,
  savat,
  yangilash,
  onYangila,
}: {
  voronkaId: string | null;
  filtr: string;
  savat: boolean;
  yangilash: number;
  onYangila: () => void;
}) {
  const { holat, base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [sahifa, setSahifa] = useState(0);
  const [sort, setSort] = useState<{ by: Saralash; dir: 'asc' | 'desc' }>({ by: savat ? 'updated' : 'updated', dir: 'desc' });
  const [data, setData] = useState<{ total: number; sum: number; items: BitimKartasi[] } | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [tanlangan, setTanlangan] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSahifa(0);
    setTanlangan(new Set());
  }, [voronkaId, filtr]);

  useEffect(() => {
    let tirik = true;
    const q = new URLSearchParams(filtr);
    if (voronkaId) q.set('pipeline', voronkaId);
    q.set('limit', String(SAHIFA_HAJMI));
    q.set('offset', String(sahifa * SAHIFA_HAJMI));
    q.set('sort', sort.by);
    q.set('dir', sort.dir);
    api
      .get<{ total: number; sum: number; items: BitimKartasi[] }>(`${base}/deals?${q}`)
      .then((r) => tirik && (setData(r), setXato(null)))
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")));
    return () => {
      tirik = false;
    };
  }, [base, voronkaId, filtr, sahifa, sort, t, yangilash]);

  const sahifalar = data ? Math.max(1, Math.ceil(data.total / SAHIFA_HAJMI)) : 1;
  const sahifadagilar = data?.items.map((d) => d.id) ?? [];
  const hammasiBelgili = sahifadagilar.length > 0 && sahifadagilar.every((id) => tanlangan.has(id));

  const sarlavha = (by: Saralash, nom: string, ong?: boolean) => (
    <th className={ong ? 'ci-ong' : undefined} aria-sort={sort.by === by ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
      <button type="button" className="ci-saralash" onClick={() => setSort((s) => ({ by, dir: s.by === by && s.dir === 'desc' ? 'asc' : 'desc' }))}>
        {nom} {sort.by === by && (sort.dir === 'asc' ? <ArrowUp aria-hidden="true" /> : <ArrowDown aria-hidden="true" />)}
      </button>
    </th>
  );

  const hammasiniTanla = async () => {
    const q = new URLSearchParams(filtr);
    if (voronkaId) q.set('pipeline', voronkaId);
    const r = await api.get<{ ids: string[] }>(`${base}/deals/ids?${q}`).catch(() => null);
    if (r) setTanlangan(new Set(r.ids));
  };

  return (
    <div className="card ci-jadval-karta">
      {xato && <div className="xato-qator">{xato}</div>}
      {!data && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
      {data && (
        <div className="ci-jadval-tepa">
          <span className="yordam">
            {t('Jami: {n}', { n: data.total })}
            {data.sum > 0 && ` · ${pul(data.sum)}`}
          </span>
          {savat && <span className="yordam">{t("O'chirilgan bitimlar 30 kun saqlanadi, keyin tiklab bo'lmaydi.")}</span>}
        </div>
      )}
      {tanlangan.size > 0 && (
        <OmmaviyPanel
          ids={[...tanlangan]}
          savat={savat}
          voronkaId={voronkaId}
          onTozala={() => setTanlangan(new Set())}
          onTugadi={() => {
            setTanlangan(new Set());
            onYangila();
          }}
          onHammasi={data && tanlangan.size < data.total && hammasiBelgili ? () => void hammasiniTanla() : undefined}
          jami={data?.total ?? 0}
        />
      )}
      {data && data.items.length === 0 && <div className="ci-bosh-holat">{savat ? t('Savat bo‘sh') : t('Bitimlar topilmadi')}</div>}
      {data && data.items.length > 0 && (
        <div className="ci-jadval-qobiq">
          <table className="jadval">
            <thead>
              <tr>
                <th className="ci-belgilash">
                  <input
                    type="checkbox"
                    checked={hammasiBelgili}
                    onChange={() =>
                      setTanlangan((s) => {
                        const n = new Set(s);
                        for (const id of sahifadagilar) hammasiBelgili ? n.delete(id) : n.add(id);
                        return n;
                      })
                    }
                    aria-label={t('Sahifadagi hammasini belgilash')}
                  />
                </th>
                {sarlavha('name', t('Bitim'))}
                <th>{t('Kontakt')}</th>
                {sarlavha('stage', t('Bosqich'))}
                {sarlavha('amount', t('Summa'), true)}
                <th>{t("Mas'ul")}</th>
                <th>{savat ? t("O'chirilgan") : t('Keyingi vazifa')}</th>
                {sarlavha(savat ? 'updated' : 'created', savat ? t('Yangilangan') : t('Yaratilgan'))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((d) => {
                const b = bosqichTop(holat, d.stageId);
                const m = muddatHolati(d.nextTaskAt);
                const belgili = tanlangan.has(d.id);
                return (
                  <tr key={d.id} className={`bosiladigan${belgili ? ' tanlangan' : ''}`} onClick={() => !savat && navigate(`/crm/bitimlar/${d.id}`)}>
                    <td className="ci-belgilash" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={belgili}
                        onChange={() =>
                          setTanlangan((s) => {
                            const n = new Set(s);
                            belgili ? n.delete(d.id) : n.add(d.id);
                            return n;
                          })
                        }
                        aria-label={t('«{n}» ni belgilash', { n: d.name })}
                      />
                    </td>
                    <td>
                      {savat ? (
                        <b>{d.name}</b>
                      ) : (
                        <Link to={`/crm/bitimlar/${d.id}`} className="ci-havola" onClick={(e) => e.stopPropagation()}>
                          {d.name}
                        </Link>
                      )}
                      <Teglar teglar={d.tags ?? []} />
                    </td>
                    <td>
                      {d.contactName ?? '—'}
                      {d.contactPhone && <div className="yordam">{d.contactPhone}</div>}
                    </td>
                    <td>
                      {b && (
                        <span className="ci-bosqich-belgi" style={{ ['--bosqich' as string]: b.color }} title={b.voronka}>
                          {b.name}
                        </span>
                      )}
                    </td>
                    <td className="ci-ong ci-raqam">{pul(d.amount)}</td>
                    <td>{d.responsibleName ?? '—'}</td>
                    <td>
                      {savat ? (
                        <span className="yordam">{d.deletedAt ? fmtQachon(d.deletedAt) : '—'}</span>
                      ) : d.openTasks === 0 ? (
                        b?.kind === 'open' ? <span className="ci-belgi-matn ogoh">{t("Vazifa yo'q")}</span> : <span className="yordam">—</span>
                      ) : (
                        <span className={`ci-belgi-matn ${m === 'otgan' ? 'xavf' : ''}`}>{m === 'otgan' ? t("Muddati o'tgan") : fmtQachonKeyin(d.nextTaskAt, t) || t('Muddatsiz')}</span>
                      )}
                    </td>
                    <td className="yordam">{fmtQachon(savat ? d.updatedAt : d.createdAt)}</td>
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

function OmmaviyPanel({
  ids,
  savat,
  voronkaId,
  onTozala,
  onTugadi,
  onHammasi,
  jami,
}: {
  ids: string[];
  savat: boolean;
  voronkaId: string | null;
  onTozala: () => void;
  onTugadi: () => void;
  onHammasi?: () => void;
  jami: number;
}) {
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const [amal, setAmal] = useState<'' | 'stage' | 'responsible' | 'tag_add' | 'tag_remove' | 'task' | 'delete' | 'restore' | 'purge'>('');
  const [qiymat, setQiymat] = useState('');
  const [teglar, setTeglar] = useState<string[]>([]);
  const [vazifa, setVazifa] = useState('');
  const [band, setBand] = useState(false);
  const [natija, setNatija] = useState<string | null>(null);
  const [yoqotish, setYoqotish] = useState(false);
  const voronka = holat.pipelines.find((p) => p.id === voronkaId) ?? holat.pipelines[0]!;

  const bajar = async (qoshimcha: Record<string, unknown> = {}) => {
    if (!amal) return;
    if ((amal === 'delete' || amal === 'purge') && !confirm(amal === 'purge' ? t('{n} ta bitim butunlay o‘chiriladi. Davom etasizmi?', { n: ids.length }) : t('{n} ta bitim savatga o‘tkaziladi. Davom etasizmi?', { n: ids.length })))
      return;
    setBand(true);
    setNatija(null);
    try {
      const body: Record<string, unknown> = { ids, action: amal, ...qoshimcha };
      if (amal === 'stage') body.stageId = qiymat;
      if (amal === 'responsible') body.seatId = qiymat || null;
      if (amal === 'tag_add' || amal === 'tag_remove') body.tags = teglar;
      if (amal === 'task') body.task = { title: vazifa.trim(), taskType: holat.taskTypes[0]?.id ?? 'call', dueAt: new Date(Date.now() + 86400000).toISOString() };
      const r = await api.post<{ ok: number; failed: number; results: { ok: boolean; xato?: string }[] }>(`${base}/deals/bulk`, body);
      const birinchiXato = r.results.find((x) => !x.ok)?.xato;
      setNatija(r.failed ? t('{ok} ta bajarildi, {f} ta xato: {x}', { ok: r.ok, f: r.failed, x: t(birinchiXato ?? '') }) : t('{ok} ta bitim yangilandi', { ok: r.ok }));
      if (r.ok > 0) setTimeout(onTugadi, r.failed ? 2500 : 600);
    } catch (e) {
      setNatija(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    } finally {
      setBand(false);
    }
  };

  const tayyor =
    amal === 'stage' ? Boolean(qiymat) : amal === 'tag_add' || amal === 'tag_remove' ? teglar.length > 0 : amal === 'task' ? Boolean(vazifa.trim()) : Boolean(amal);
  const yoqotishBosqichi = amal === 'stage' && voronka.stages.find((s) => s.id === qiymat)?.kind === 'lost';

  return (
    <div className="ci-ommaviy" role="region" aria-label={t('Ommaviy amallar')}>
      <b>{t('{n} ta tanlandi', { n: ids.length })}</b>
      {onHammasi && (
        <button type="button" className="ci-havola-tugma" onClick={onHammasi}>
          {t('Filtrga mos hammasini tanlash ({n})', { n: jami })}
        </button>
      )}
      <select className="input ci-tor" value={amal} onChange={(e) => (setAmal(e.target.value as typeof amal), setQiymat(''))} aria-label={t('Amal')}>
        <option value="">{t('Amalni tanlang…')}</option>
        {savat ? (
          <>
            <option value="restore">{t('Tiklash')}</option>
            {holat.canManageAll && <option value="purge">{t("Butunlay o'chirish")}</option>}
          </>
        ) : (
          <>
            <option value="stage">{t('Bosqichga o‘tkazish')}</option>
            {holat.canManageAll && <option value="responsible">{t("Mas'ulni o'zgartirish")}</option>}
            <option value="tag_add">{t("Teg qo'shish")}</option>
            <option value="tag_remove">{t('Tegni olib tashlash')}</option>
            <option value="task">{t('Vazifa qo‘yish (ertaga)')}</option>
            <option value="delete">{t("Savatga o'tkazish")}</option>
          </>
        )}
      </select>
      {amal === 'stage' && (
        <select className="input ci-tor" value={qiymat} onChange={(e) => setQiymat(e.target.value)} aria-label={t('Bosqich')}>
          <option value="">{t('Bosqichni tanlang')}</option>
          {holat.pipelines.map((p) => (
            <optgroup key={p.id} label={p.name}>
              {p.stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {amal === 'responsible' && (
        <select className="input ci-tor" value={qiymat} onChange={(e) => setQiymat(e.target.value)} aria-label={t("Mas'ul")}>
          <option value="">{t('Biriktirilmagan')}</option>
          {seatlar.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      )}
      {(amal === 'tag_add' || amal === 'tag_remove') && <TeglarKiritish qiymat={teglar} onChange={setTeglar} />}
      {amal === 'task' && <input className="input ci-tor" value={vazifa} maxLength={300} onChange={(e) => setVazifa(e.target.value)} placeholder={t('Vazifa matni')} aria-label={t('Vazifa matni')} />}
      <button
        type="button"
        className={`btn kichik${amal === 'delete' || amal === 'purge' ? ' xavfli' : ''}`}
        disabled={!tayyor || band}
        onClick={() => (yoqotishBosqichi ? setYoqotish(true) : void bajar())}
      >
        {band ? t('Bajarilmoqda…') : t("Qo'llash")}
      </button>
      <button type="button" className="vr-amal" onClick={onTozala} aria-label={t('Tanlovni bekor qilish')}>
        <X />
      </button>
      {natija && (
        <span className="ci-ommaviy-natija" role="status">
          {natija}
        </span>
      )}
      {yoqotish && (
        <YoqotishSababi
          onYop={() => setYoqotish(false)}
          onTasdiq={(s) => {
            setYoqotish(false);
            void bajar({ lostReasonId: s.lostReasonId });
          }}
        />
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
  const [teglar, setTeglar] = useState<string[]>([]);
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
        tags: teglar,
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
      <div className="maydon-blok">
        <label htmlFor="yb-teg">{t('Teglar')}</label>
        <TeglarKiritish id="yb-teg" qiymat={teglar} onChange={setTeglar} />
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
