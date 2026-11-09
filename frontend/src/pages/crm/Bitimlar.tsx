import {
  ArrowDown,
  ArrowUp,
  Bookmark,
  ChartNoAxesColumnIncreasing,
  Check,
  CircleX,
  Columns3,
  Download,
  Ellipsis,
  FileText,
  Filter,
  Info,
  List,
  PenLine,
  Phone,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type FormEvent, type ReactNode } from 'react';
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
import { TARMOQ_BELGISI, TarmoqIkonlari } from './IjtimoiyTarmoqlar';
import { avatarManzili, AvatarRasmi, boshHarflar } from './MurojaatAvatar';
import { ImportOyna } from './ImportOyna';
import './kanban.css';

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
  /** Menyudagi "Barcha bitimlar" (`?v=all`) — hamma voronkalar bitta jadvalda. */
  const hammasi = !savat && params.get('v') === 'all';
  const korinish: 'kanban' | 'jadval' = savat || hammasi
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
    if (savat || hammasi) return;
    let tirik = true;
    api
      .get<KpiStat>(`${base}/deals/board/stats?pipeline=${voronka.id}${filtr ? `&${filtr}` : ''}`)
      .then((r) => tirik && setStat(r))
      .catch(() => tirik && setStat(null));
    return () => {
      tirik = false;
    };
  }, [base, voronka.id, filtr, savat, hammasi, yangilash]);
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
        sarlavha={savat ? t('Savat') : hammasi ? t('Barcha bitimlar') : voronka.name}
        chap={
          !savat && !hammasi && (
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
        qidiruv={{ qiymat: qidiruv, onChange: setQidiruv, placeholder: t('Qidirish va filtr'), nom: t('Bitimlarni qidirish') }}
      >
        {savat ? (
          <button className="btn ikkinchi" onClick={() => ozgartir({ trash: null })}>
            <X /> {t('Savatdan chiqish')}
          </button>
        ) : (
          <>
            {!hammasi && stat && (
              <span className="kb-jami" title={t('Filtrga mos bitimlar soni va summasi')}>
                {t('{n} bitim:', { n: pul(stat.total) })} <b>{t('{s} so‘m', { s: pul(stat.sum) })}</b>
              </span>
            )}
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
            {holat.canConfigure && !hammasi && (
              <button type="button" className="btn ikkinchi" onClick={() => navigate(`/crm/bitimlar/sozlash?v=${voronka.id}`)} title={t('Voronka bosqichlari va sozlamalari')}>
                <Settings2 /> {t('Sozlash')}
              </button>
            )}
            <button className="btn" onClick={() => setYangi(true)}>
              <Plus /> {t('Yangi bitim')}
            </button>
          </>
        )}
      </MsBosh>

      {panel && <FiltrPanel params={params} voronkaId={voronka.id} ozgartir={ozgartir} onYop={() => setPanel(false)} />}
      <FaolFiltrlar params={params} ozgartir={ozgartir} seatlar={seatlar} />

      {korinish === 'kanban' ? (
        <Kanban voronkaId={voronka.id} filtr={filtr} yangilash={yangilash} onYangila={() => setYangilash((x) => x + 1)} />
      ) : (
        <Jadval voronkaId={savat || hammasi ? null : voronka.id} filtr={filtr} savat={savat} yangilash={yangilash} onYangila={() => setYangilash((x) => x + 1)} />
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

/** "26.10.2026 16:45" — kartadagi sana-vaqt. */
export function sanaVaqt(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ─── Kanban (amoCRM "Сделки" namunasi, Deal Mind dizayni) ─────────────────────

/**
 * Voronka kanbani — amoCRM'dagidek:
 *   • birinchi ustun — shu voronkaning "Saralanmagan" murojaatlari;
 *   • har bosqich: nomi, "N bitim: X so'm", ostida bosqich rangidagi chiziq;
 *   • birinchi ochiq bosqichda "Tezkor qo'shish";
 *   • ustun oxiriga aylantirilganda keyingi bitimlar o'zi yuklanadi;
 *   • kartani sudrab boshqa bosqichga o'tkazish (yo'qotilganda — sabab so'raladi).
 */
function Kanban({ voronkaId, filtr, yangilash, onYangila }: { voronkaId: string; filtr: string; yangilash: number; onYangila: () => void }) {
  const { base, holat } = useCrm();
  // amoCRM dan sinxronlanayotgan voronka: bosqich u yerda o'zgartiriladi
  const tashqi = holat.pipelines.find((p) => p.id === voronkaId)?.external ? (holat.externalSync ?? 'CRM') : null;
  const t = useT();
  const navigate = useNavigate();
  const [ustunlar, setUstunlar] = useState<KanbanUstun[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [ustida, setUstida] = useState<string | null>(null);
  const [yoqotish, setYoqotish] = useState<{ bitim: BitimKartasi; bosqich: KanbanUstun } | null>(null);
  const [yuklanayotgan, setYuklanayotgan] = useState<Set<string>>(new Set());
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

  /** Ustunning keyingi bitimlari (pastga aylantirilganda). */
  const yanaYukla = useCallback(
    async (u: KanbanUstun) => {
      if (yuklanayotgan.has(u.id) || u.deals.length >= u.count) return;
      setYuklanayotgan((s) => new Set(s).add(u.id));
      try {
        const q = `${base}/deals/board?pipeline=${voronkaId}&stage=${u.id}&offset=${u.deals.length}${filtr ? `&${filtr}` : ''}`;
        const r = await api.get<{ stages: KanbanUstun[] }>(q);
        const yangi = r.stages[0]?.deals ?? [];
        setUstunlar((eski) =>
          eski?.map((x) => {
            if (x.id !== u.id) return x;
            const bor = new Set(x.deals.map((d) => d.id));
            return { ...x, deals: [...x.deals, ...yangi.filter((d) => !bor.has(d.id))] };
          }) ?? eski,
        );
      } catch {
        /* keyingi aylantirishda qayta uriniladi */
      } finally {
        setYuklanayotgan((s) => {
          const n = new Set(s);
          n.delete(u.id);
          return n;
        });
      }
    },
    [base, voronkaId, filtr, yuklanayotgan],
  );

  /** Optimistik ko'chirish: karta darhol yangi ustunga o'tadi, xatoda qaytadi. */
  const kochir = async (b: BitimKartasi, ustun: KanbanUstun, sabab?: { lostReasonId: string | null; lostReason: string | null }) => {
    if (b.stageId === ustun.id || !ustunlar) return;
    const oldingi = ustunlar;
    setUstunlar(
      ustunlar.map((u) => {
        if (u.id === b.stageId) return { ...u, count: u.count - 1, sum: u.sum - (b.amount ?? 0), deals: u.deals.filter((d) => d.id !== b.id) };
        if (u.id === ustun.id)
          return {
            ...u,
            count: u.count + 1,
            sum: u.sum + (b.amount ?? 0),
            deals: [{ ...b, stageId: ustun.id, stageEnteredAt: new Date().toISOString(), lostReason: sabab?.lostReason ?? b.lostReason }, ...u.deals],
          };
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
  if (!ustunlar) return <KanbanSkelet />;

  const birinchiOchiq = ustunlar.find((u) => u.kind === 'open')?.id;

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
      <div className="kb-doska" role="list" aria-label={t('Bosqichlar')}>
        <SaralanmaganUstun voronkaId={voronkaId} yangilash={yangilash} onQabul={onYangila} />
        {ustunlar.map((u) => (
          <section
            key={u.id}
            role="listitem"
            className={`kb-ustun ${u.kind}${ustida === u.id ? ' ustida' : ''}`}
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
            <header className="kb-ustun-bosh">
              <h2 title={u.name}>{u.name}</h2>
              <p>{t('{n} bitim: {s} so‘m', { n: pul(u.count), s: pul(u.sum) })}</p>
              {holat.stageHints?.[u.id] && (
                <p className="kb-korsatma" title={holat.stageHints[u.id]}>
                  <Info aria-hidden="true" /> <span>{holat.stageHints[u.id]}</span>
                </p>
              )}
            </header>
            <div className="kb-ustun-ichi">
              {u.id === birinchiOchiq && !tashqi && <TezkorQoshish voronkaId={voronkaId} bosqichId={u.id} onQoshildi={onYangila} />}
              {u.deals.map((d) => (
                <KanbanKarta
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
              {u.deals.length < u.count && (
                // key: yangi bitimlar qo'shilgach kuzatuvchi qayta ulanadi — qisqa ustun ham oxirigacha yuklanadi
                <UstunOxiri
                  key={u.deals.length}
                  yuklanmoqda={yuklanayotgan.has(u.id)} qolgan={u.count - u.deals.length} onKorindi={() => void yanaYukla(u)} />
              )}
              {u.count === 0 && u.id !== birinchiOchiq && <div className="kb-bosh">{t("Bitim yo'q")}</div>}
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

function KanbanSkelet() {
  const t = useT();
  return (
    <div className="kb-doska" aria-busy="true" aria-label={t('Yuklanmoqda…')}>
      {Array.from({ length: 5 }, (_, i) => (
        <div key={i} className="kb-ustun">
          <div className="kb-ustun-bosh">
            <span className="kb-skelet" style={{ width: '50%', height: 14 }} />
            <span className="kb-skelet" style={{ width: '35%', height: 11 }} />
          </div>
          <div className="kb-ustun-ichi">
            {Array.from({ length: 4 - (i % 3) }, (_, j) => (
              <span key={j} className="kb-skelet kb-skelet-karta" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Ustun oxiri: ko'rinishga kirganda keyingi bitimlarni so'raydi (tugma — zaxira). */
function UstunOxiri({ yuklanmoqda, qolgan, onKorindi }: { yuklanmoqda: boolean; qolgan: number; onKorindi: () => void }) {
  const t = useT();
  const ref = useRef<HTMLButtonElement>(null);
  const chaqir = useRef(onKorindi);
  chaqir.current = onKorindi;
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const k = new IntersectionObserver((e) => e.some((x) => x.isIntersecting) && chaqir.current(), { rootMargin: '200px' });
    k.observe(el);
    return () => k.disconnect();
  }, []);
  return (
    <button ref={ref} type="button" className="kb-yana" onClick={onKorindi} disabled={yuklanmoqda}>
      {yuklanmoqda ? t('Yuklanmoqda…') : t('Yana {n} ta bitim', { n: pul(qolgan) })}
    </button>
  );
}

/** "Bugun 07:56" / "Kecha 23:48" / "02.11.2026" — amoCRM kartasidagi vaqt. */
function kartaVaqti(iso: string, t: (s: string, v?: Record<string, string | number>) => string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const soat = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const bugun = new Date();
  const kecha = new Date(bugun.getTime() - 86_400_000);
  if (d.toDateString() === bugun.toDateString()) return t('Bugun {v}', { v: soat });
  if (d.toDateString() === kecha.toDateString()) return t('Kecha {v}', { v: soat });
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/**
 * Bitim kartasi (amoCRM): "Ism, Kompaniya" va vaqt, katta havola — bitim nomi,
 * summa (bo'lsa), teglar va o'ngda keyingi vazifa belgisi: yo'q (sariq nuqta),
 * muddati o'tgan (qizil), bugun (yashil), keyin — sana.
 */
function KanbanKarta({
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
  const kontakt = d.contactName ?? d.contactPhone;
  const vazifa =
    tur !== 'open'
      ? null
      : d.openTasks === 0
        ? { k: 'yoq', matn: '', title: t("Vazifa yo'q — keyingi qadamni belgilang") }
        : muddat === 'otgan'
          ? { k: 'otgan', matn: t("Muddati o'tgan"), title: fmtQachonKeyin(d.nextTaskAt, t) }
          : muddat === 'bugun'
            ? { k: 'bugun', matn: t('Bugun'), title: fmtQachonKeyin(d.nextTaskAt, t) }
            : { k: 'keyin', matn: fmtQachonKeyin(d.nextTaskAt, t), title: t('Keyingi vazifa') };
  return (
    <article
      className={`kb-karta${qulf ? ' qulf' : ''}`}
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
      <div className="kb-karta-tepa">
        <span className="kb-karta-kim">
          {kontakt ? <b>{kontakt}</b> : <b className="sust">{t('Kontaktsiz')}</b>}
          {d.companyName && <span>, {d.companyName}</span>}
        </span>
        <time dateTime={d.createdAt} title={sanaVaqt(d.createdAt)}>
          {kartaVaqti(d.createdAt, t)}
        </time>
      </div>
      <Link className="kb-karta-nom" to={`/crm/bitimlar/${d.id}`} onClick={(e) => (e.preventDefault(), onOch())}>
        {d.name}
      </Link>
      {(d.amount ?? 0) > 0 && <div className="kb-karta-summa">{t('{s} so‘m', { s: pul(d.amount ?? 0) })}</div>}
      {tur === 'lost' && d.lostReason && (
        <div className="kb-rad">
          <CircleX aria-hidden="true" /> {t(d.lostReason)}
        </div>
      )}
      {((d.tags?.length ?? 0) > 0 || d.source || vazifa) && (
        <div className="kb-karta-past">
          <span className="kb-teglar">
            {d.source && <span className="kb-teg manba">{d.source}</span>}
            {d.tags.slice(0, 4).map((tg) => (
              <span key={tg} className="kb-teg">
                {tg}
              </span>
            ))}
            {d.tags.length > 4 && <span className="kb-teg">+{d.tags.length - 4}</span>}
          </span>
          {vazifa && (
            <span className={`kb-vazifa ${vazifa.k}`} title={vazifa.title}>
              {vazifa.matn}
            </span>
          )}
        </div>
      )}
    </article>
  );
}

interface MurojaatQisqa {
  id: string;
  source: 'call' | 'form' | 'manual' | 'facebook' | 'instagram' | 'telegram';
  name: string | null;
  phone: string | null;
  message: string | null;
  formName: string | null;
  contactName: string | null;
  createdAt: string;
  /** Tarmoq murojaatlarida — ulangan hisob nomi (sahifa, @instagram, @bot). */
  accountName?: string | null;
  payload?: { type?: string } | null;
}

const MANBA_NOMI = { call: "Qo'ng'iroq", form: 'Veb-forma', manual: "Qo'lda kiritilgan", facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram' } as const;
const MANBA_IKON = { call: Phone, form: FileText, manual: PenLine, ...TARMOQ_BELGISI } as const;

/**
 * Voronkaning birinchi ustuni — "Saralanmagan" (amoCRM "Неразобранное"):
 * shu voronkaga kelgan, hali bitimga aylanmagan murojaatlar. Kartadan
 * to'g'ridan-to'g'ri qabul qilish (shu voronkaning birinchi bosqichiga
 * bitim bo'ladi) yoki rad etish mumkin.
 */
function SaralanmaganUstun({ voronkaId, yangilash, onQabul }: { voronkaId: string; yangilash: number; onQabul: () => void }) {
  const { base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [data, setData] = useState<{ total: number; items: MurojaatQisqa[] } | null>(null);
  const [band, setBand] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [qayta, setQayta] = useState(0);

  useEffect(() => {
    let tirik = true;
    api
      .get<{ total: number; items: MurojaatQisqa[] }>(`${base}/crm-app/inbox?status=pending&limit=30&pipeline=${voronkaId}`)
      .then((r) => tirik && setData(r))
      .catch(() => tirik && setData({ total: 0, items: [] }));
    return () => {
      tirik = false;
    };
  }, [base, voronkaId, yangilash, qayta]);

  const amal = async (m: MurojaatQisqa, tur: 'accept' | 'reject') => {
    setBand(m.id);
    setXato(null);
    try {
      await api.post(`${base}/crm-app/inbox/${m.id}/${tur}`, tur === 'accept' ? { pipelineId: voronkaId } : {});
      setQayta((x) => x + 1);
      if (tur === 'accept') onQabul();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Bajarib bo'lmadi"));
    } finally {
      setBand(null);
    }
  };

  return (
    <section className="kb-ustun saralanmagan" role="listitem" aria-label={t('Saralanmagan')}>
      <header className="kb-ustun-bosh">
        <h2>{t('Saralanmagan')}</h2>
        <p>{t('Murojaat: {n}', { n: pul(data?.total ?? 0) })}</p>
        <TarmoqIkonlari yangilash={yangilash} />
      </header>
      <div className="kb-ustun-ichi">
        {xato && (
          <div className="xato-qator" role="alert">
            {xato}
          </div>
        )}
        {!data && <span className="kb-skelet kb-skelet-karta" />}
        {data?.items.map((m) => {
          const Ikon = MANBA_IKON[m.source] ?? PenLine;
          const nom = m.contactName ?? m.name ?? m.phone ?? t('Murojaat');
          return (
            <article
              key={m.id}
              className="kb-karta kb-murojaat ochiladi"
              onClick={(e) => {
                // Karta bosilsa murojaat oynasi ochiladi (tugma va havolalardan tashqari)
                if (!(e.target as HTMLElement).closest('button, a')) navigate(`/crm/saralanmagan/${m.id}`);
              }}
            >
              <span className="kb-avatar" aria-hidden="true">
                <AvatarRasmi src={avatarManzili(base, m)} harflar={boshHarflar(nom)} />
                <span className={`kb-avatar-belgi ${m.source}`}>
                  <Ikon />
                </span>
              </span>
              <div className="kb-murojaat-asos">
                <div className="kb-karta-tepa">
                  <span className="kb-karta-kim">
                    {t('dan:')} <b>{m.formName ?? m.accountName ?? t(MANBA_NOMI[m.source])}</b>
                  </span>
                  <time dateTime={m.createdAt} title={sanaVaqt(m.createdAt)}>
                    {kartaVaqti(m.createdAt, t)}
                  </time>
                </div>
                <Link className="kb-karta-nom" to={`/crm/saralanmagan/${m.id}`}>
                  {nom}
                </Link>
                {m.phone && nom !== m.phone && <div className="kb-karta-izoh">{m.phone}</div>}
                {m.message && <div className="kb-xabar">{oxirgiQator(m.message)}</div>}
                <div className="kb-murojaat-amallar">
                  <button type="button" className="kb-qabul" disabled={band === m.id} onClick={() => void amal(m, 'accept')}>
                    <Check aria-hidden="true" /> {t('Qabul qilish')}
                  </button>
                  <button type="button" className="kb-rad-tugma" disabled={band === m.id} onClick={() => void amal(m, 'reject')}>
                    <X aria-hidden="true" /> {t('Rad etish')}
                  </button>
                </div>
              </div>
            </article>
          );
        })}
        {data && data.total > data.items.length && (
          <Link className="kb-yana" to="/crm/saralanmagan">
            {t('Hammasini saralash ({n})', { n: pul(data.total) })}
          </Link>
        )}
        {data && data.total === 0 && <div className="kb-bosh">{t("Yangi murojaat yo'q")}</div>}
      </div>
    </section>
  );
}

/** Xabarlar qo'shilib boradigan murojaatda (Telegram, Direct) kartada oxirgi xabar ko'rinadi. */
function oxirgiQator(matn: string): string {
  const q = matn.split('\n').filter((x) => x.trim());
  return q[q.length - 1] ?? matn;
}

/**
 * "Tezkor qo'shish" (amoCRM "Быстрое добавление"): birinchi bosqich tepasida
 * kichik forma — bitim nomi, kontakt ismi va telefoni, summa. Enter — saqlash,
 * Esc — yopish. Kontakt telefon bo'yicha topiladi yoki yaratiladi.
 */
function TezkorQoshish({ voronkaId, bosqichId, onQoshildi }: { voronkaId: string; bosqichId: string; onQoshildi: () => void }) {
  const { base } = useCrm();
  const t = useT();
  const [ochiq, setOchiq] = useState(false);
  const [nom, setNom] = useState('');
  const [ism, setIsm] = useState('');
  const [tel, setTel] = useState('');
  const [summa, setSumma] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const tozala = () => {
    setNom('');
    setIsm('');
    setTel('');
    setSumma('');
    setXato(null);
  };

  if (!ochiq) {
    return (
      <button type="button" className="kb-tezkor" onClick={() => setOchiq(true)}>
        <Plus aria-hidden="true" /> {t("Tezkor qo'shish")}
      </button>
    );
  }

  const saqla = async (e: FormEvent) => {
    e.preventDefault();
    const n = nom.trim() || ism.trim() || tel.trim();
    if (!n) return setXato(t('Bitim nomi yoki kontaktni kiriting'));
    const s = summa.replace(/\s/g, '');
    if (s && !/^\d+(\.\d+)?$/.test(s)) return setXato(t("Summa raqam bo'lishi kerak"));
    setBand(true);
    setXato(null);
    try {
      await api.post(`${base}/deals`, {
        name: n,
        pipelineId: voronkaId,
        stageId: bosqichId,
        amount: s ? Number(s) : null,
        ...(ism.trim() || tel.trim() ? { contact: { name: ism.trim() || null, phone: tel.trim() || null } } : {}),
      });
      tozala();
      onQoshildi();
    } catch (err) {
      setXato(err instanceof ApiError ? t(err.message) : t("Saqlab bo'lmadi"));
    } finally {
      setBand(false);
    }
  };

  return (
    <form
      className="kb-tezkor-forma"
      onSubmit={(e) => void saqla(e)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          tozala();
          setOchiq(false);
        }
      }}
    >
      <input className="input" autoFocus value={nom} maxLength={250} onChange={(e) => setNom(e.target.value)} placeholder={t('Bitim nomi')} aria-label={t('Bitim nomi')} disabled={band} />
      <input className="input" value={ism} maxLength={200} onChange={(e) => setIsm(e.target.value)} placeholder={t('Kontakt: ism')} aria-label={t('Kontakt: ism')} disabled={band} />
      <input className="input" type="tel" value={tel} maxLength={40} onChange={(e) => setTel(e.target.value)} placeholder={t('Telefon')} aria-label={t('Telefon')} disabled={band} />
      <input className="input" inputMode="numeric" value={summa} maxLength={20} onChange={(e) => setSumma(e.target.value)} placeholder={t('Summa, so‘m')} aria-label={t('Summa, so‘m')} disabled={band} />
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
      <div className="kb-tezkor-tugmalar">
        <button
          type="button"
          className="btn ikkinchi kichik"
          onClick={() => {
            tozala();
            setOchiq(false);
          }}
        >
          {t('Bekor qilish')}
        </button>
        <button type="submit" className="btn kichik" disabled={band}>
          {band ? t('Saqlanmoqda…') : t("Qo'shish")}
        </button>
      </div>
    </form>
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
