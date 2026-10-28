import {
  ArrowRight,
  ArrowUp,
  CalendarDays,
  CircleCheck,
  CircleSlash,
  Hourglass,
  Phone,
  PieChart,
  TrendingUp,
  Trophy,
  Users,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, fmtPul } from '../../api';
import { useAuth } from '../../auth';
import { DavrTanlash } from '../../crm/komponentlar';
import { davrHisobla, pul, useCrm, type DavrTuri } from '../../crm/malumot';
import { MsBosh } from '../../crm/MsBosh';
import { useT } from '../../i18n';

/**
 * CRM bosh sahifasi — Metasell "Asosiy" ekrani namunasida:
 * to'lqinli AI qatori, 4 ta asosiy ko'rsatkich (avvalgi davrga nisbatan),
 * uchrashuvlar, eng ko'p sotganlar, vazifalar, lid manbai va rad sabablari
 * doira diagrammalari, menejerlar bo'yicha qo'ng'iroqlar, lid almashinuvi.
 * Barcha vidjetlar bitta filtrdan (davr, voronka, xodim).
 */

interface IshStoliJavob {
  kpi: {
    newCount: number;
    newSum: number;
    wonCount: number;
    wonSum: number;
    lostCount: number;
    openCount: number;
    openSum: number;
    noTask: number;
    winRate: number | null;
    overdueTasks: number;
    todayTasks: number;
    doneTasks: number;
    inboxPending: number;
  };
  sources: { source: string | null; count: number; won: number; wonSum: number }[];
  lossReasons: { id: string | null; name: string; count: number; sum: number }[];
  managers: {
    seatId: string;
    name: string;
    newCount: number;
    wonCount: number;
    wonSum: number;
    lostCount: number;
    winRate: number | null;
  }[];
}

interface BoshJavob {
  previous: { wonCount: number; lostCount: number; winRate: number | null } | null;
  meetings: {
    fieldId: string;
    fieldLabel: string;
    fieldType: string;
    total: number;
    ahead: number;
    items: { dealId: string; name: string; contact: string | null; seat: string | null; at: string; stage: string; stageColor: string; ahead: boolean }[];
    bySeat: { seatId: string | null; name: string; count: number }[];
  } | null;
  tasksBySeat: { seatId: string; name: string; done: number; total: number; overdue: number }[] | null;
  callsBySeat: { seatId: string; name: string; inbound: number; outbound: number; unique: number; durationSeconds: number; quality: number | null }[] | null;
  transfers: { total: number; items: { at: string; dealId: string; name: string; from: string | null; to: string | null }[] } | null;
}

const DAVR_KALIT = 'sotuvai-crm-davr';
const RANGLAR = ['#1f8ef1', '#22c3a6', '#f5a524', '#e5484d', '#8b5cf6', '#ec4899', '#14b8a6', '#64748b', '#f97316', '#0ea5e9'];
const DAVR_NOMI: Record<DavrTuri, string> = {
  bugun: 'bugun',
  kecha: 'kecha',
  hafta: 'oxirgi 7 kun',
  oy: 'shu oy',
  'otgan-oy': "o'tgan oy",
  maxsus: 'tanlangan davr',
};

function boshHarf(nom: string | null | undefined): string {
  const q = (nom ?? '').replace(/^@/, '').trim().split(/\s+/).filter(Boolean);
  return ((q[0]?.[0] ?? '') + (q[1]?.[0] ?? '')).toUpperCase() || '·';
}

function davomiylik(s: number, t: (k: string, p?: Record<string, string | number>) => string): string {
  const soat = Math.floor(s / 3600);
  const daq = Math.round((s % 3600) / 60);
  return soat > 0 ? t('{s} soat {d} daq', { s: soat, d: daq }) : t('{d} daq', { d: daq });
}

/** Avvalgi davrga nisbatan o'zgarish chipi (↑ 12% / ↓ 5% / ≈ 0%). */
function Ozgarish({ joriy, oldingi, pp, teskari }: { joriy: number | null; oldingi: number | null | undefined; pp?: boolean; teskari?: boolean }) {
  if (joriy === null || oldingi === null || oldingi === undefined) return null;
  let qiymat: number;
  if (pp) qiymat = Math.round((joriy - oldingi) * 100);
  else if (oldingi === 0) qiymat = joriy === 0 ? 0 : 100;
  else qiymat = Math.round(((joriy - oldingi) / oldingi) * 100);
  const yaxshi = teskari ? qiymat < 0 : qiymat > 0;
  const klass = qiymat === 0 ? 'teng' : yaxshi ? 'yaxshi' : 'yomon';
  const belgi = qiymat === 0 ? '≈' : qiymat > 0 ? '↑' : '↓';
  return (
    <span className={`ms-ozgarish ${klass}`}>
      {belgi} {Math.abs(qiymat)}
      {pp ? ' p.p.' : '%'}
    </span>
  );
}

function AsosiyKarta({ nom, ikon: Ikon, ohang, qiymat, ozgarish, izoh, onClick }: { nom: string; ikon: LucideIcon; ohang: string; qiymat: string; ozgarish?: ReactNode; izoh: string; onClick?: () => void }) {
  return (
    <button type="button" className="ms-ak" onClick={onClick}>
      <span className="ms-ak-bosh">
        <span>{nom}</span>
        <span className={`ms-ak-ikon ${ohang}`} aria-hidden="true">
          <Ikon />
        </span>
      </span>
      <span className="ms-ak-qiymat">
        <b>{qiymat}</b>
        {ozgarish}
      </span>
      <span className="ms-ak-izoh">{izoh}</span>
    </button>
  );
}

function Vidjet({ ikon: Ikon, nom, izoh, ong, children, className }: { ikon: LucideIcon; nom: string; izoh?: string; ong?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`ms-vidjet${className ? ` ${className}` : ''}`}>
      <header className="ms-vidjet-bosh">
        <span className="ms-vidjet-ikon" aria-hidden="true">
          <Ikon />
        </span>
        <span className="ms-vidjet-nom">
          <b>{nom}</b>
          {izoh && <small>{izoh}</small>}
        </span>
        {ong && <span className="ms-vidjet-ong">{ong}</span>}
      </header>
      {children}
    </section>
  );
}

/** Doira diagramma + izohli ro'yxat (Lidlar manbai, Rad etish sabablari). */
function Doira({ qatorlar, jamiNomi, onClick }: { qatorlar: { kalit: string; nom: string; qiymat: number }[]; jamiNomi: string; onClick?: (kalit: string) => void }) {
  const t = useT();
  const jami = qatorlar.reduce((s, q) => s + q.qiymat, 0);
  if (!jami) return <p className="ms-vidjet-bosh-holat">{t("Tanlangan davrda ma'lumot yo'q")}</p>;
  const r = 52;
  const aylana = 2 * Math.PI * r;
  let siljish = 0;
  return (
    <div className="ms-doira">
      <svg viewBox="0 0 140 140" className="ms-doira-svg" role="img" aria-label={`${jami} ${jamiNomi}`}>
        <circle cx="70" cy="70" r={r} fill="none" stroke="var(--bg-sunken)" strokeWidth="18" />
        {qatorlar.map((q, i) => {
          const uzun = (q.qiymat / jami) * aylana;
          const el = (
            <circle
              key={q.kalit}
              cx="70"
              cy="70"
              r={r}
              fill="none"
              stroke={RANGLAR[i % RANGLAR.length]}
              strokeWidth="18"
              strokeDasharray={`${Math.max(uzun - 1.5, 0.5)} ${aylana}`}
              strokeDashoffset={-siljish}
              transform="rotate(-90 70 70)"
            />
          );
          siljish += uzun;
          return el;
        })}
        <text x="70" y="68" textAnchor="middle" className="ms-doira-jami">
          {jami}
        </text>
        <text x="70" y="86" textAnchor="middle" className="ms-doira-nom">
          {jamiNomi}
        </text>
      </svg>
      <ul className="ms-doira-royxat">
        {qatorlar.map((q, i) => (
          <li key={q.kalit}>
            <button type="button" onClick={onClick ? () => onClick(q.kalit) : undefined} disabled={!onClick}>
              <i style={{ background: RANGLAR[i % RANGLAR.length] }} />
              <span className="ms-doira-n">{q.nom}</span>
              <b>{q.qiymat}</b>
              <span className="ms-doira-f">{Math.round((q.qiymat / jami) * 100)}%</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AiSavolQatori() {
  const { user } = useAuth();
  const t = useT();
  const navigate = useNavigate();
  const [savol, setSavol] = useState('');
  const soat = new Date().getHours();
  const salom = soat < 11 ? 'Xayrli tong' : soat < 18 ? 'Xayrli kun' : 'Xayrli kech';
  const ism = user?.displayName?.split(' ')[0] ?? '';
  return (
    <section className="ms-hero" aria-label={t('AI yordamchiga savol')}>
      <h2>
        {t(salom)}
        {ism ? `, ${ism}` : ''}
      </h2>
      <p>{t('Biznesingiz haqida nimani bilmoqchisiz?')}</p>
      <form
        className="ms-hero-maydon"
        onSubmit={(e) => {
          e.preventDefault();
          const q = savol.trim();
          if (q) navigate(`/crm/ai-chat?q=${encodeURIComponent(q)}`);
        }}
      >
        <input value={savol} onChange={(e) => setSavol(e.target.value)} maxLength={2000} placeholder={t('Savolingizni yozing…')} aria-label={t('Savolingizni yozing…')} />
        <button type="submit" disabled={!savol.trim()} aria-label={t('Yuborish')} title={t('Yuborish')}>
          <ArrowUp />
        </button>
      </form>
      <svg className="ms-hero-tolqin" viewBox="0 0 1440 120" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 70 C 240 20, 480 110, 720 64 S 1200 30, 1440 72 L1440 120 L0 120 Z" />
        <path d="M0 88 C 300 48, 560 120, 860 84 S 1260 52, 1440 92 L1440 120 L0 120 Z" />
      </svg>
    </section>
  );
}

export function IshStoli() {
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const bugun = new Date().toISOString().slice(0, 10);
  const [tur, setTur] = useState<DavrTuri>(() => {
    try {
      return (localStorage.getItem(DAVR_KALIT) as DavrTuri | null) ?? 'bugun';
    } catch {
      return 'bugun';
    }
  });
  const [maxsus, setMaxsus] = useState({ from: bugun.slice(0, 8) + '01', to: bugun });
  const [seat, setSeat] = useState('');
  const [voronka, setVoronka] = useState(holat.pipelines.find((p) => p.isMain)?.id ?? holat.pipelines[0]?.id ?? '');
  const [data, setData] = useState<IshStoliJavob | null>(null);
  const [qosh, setQosh] = useState<BoshJavob | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [qongiroqTur, setQongiroqTur] = useState<'soni' | 'unikal' | 'davomiylik'>('soni');
  const davr = useMemo(() => davrHisobla(tur, maxsus), [tur, maxsus]);

  useEffect(() => {
    let tirik = true;
    const q = new URLSearchParams({ from: davr.from, to: davr.to, pipelineId: voronka });
    if (seat) q.set('seat', seat);
    api
      .get<IshStoliJavob>(`${base}/crm-app/reports/dashboard?${q}`)
      .then((r) => tirik && (setData(r), setXato(null)))
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")));
    // Qo'shimcha vidjetlar alohida — ular kechiksa yoki xato bersa ham asosiy kartalar chiqadi
    api
      .get<BoshJavob>(`${base}/crm-app/reports/home?${q}`)
      .then((r) => tirik && setQosh(r))
      .catch(() => tirik && setQosh(null));
    return () => {
      tirik = false;
    };
  }, [base, davr, seat, voronka, t]);

  const och = (f: Record<string, string>) => {
    const q = new URLSearchParams({ k: 'jadval', v: voronka, ...f });
    if (seat) q.set('s', seat);
    navigate(`/crm/bitimlar?${q}`);
  };
  const davrF = { createdFrom: davr.from, createdTo: davr.to };
  const yopilishF = { closedFrom: davr.from, closedTo: davr.to };
  const davrNomi = t(DAVR_NOMI[tur]);

  const k = data?.kpi;
  const oldingi = qosh?.previous;
  const asosiySabab = data?.lossReasons[0];
  const qongiroqlar = qosh?.callsBySeat ?? [];
  const qongiroqMax = Math.max(
    1,
    ...qongiroqlar.map((q) => (qongiroqTur === 'soni' ? q.inbound + q.outbound : qongiroqTur === 'unikal' ? q.unique : q.durationSeconds)),
  );
  const kiruvchiJami = qongiroqlar.reduce((s, q) => s + q.inbound, 0);
  const chiquvchiJami = qongiroqlar.reduce((s, q) => s + q.outbound, 0);
  const uchr = qosh?.meetings;
  const kimdaMax = Math.max(1, ...(uchr?.bySeat.map((s) => s.count) ?? [1]));

  return (
    <div className="ci-sahifa ms-asosiy">
      <MsBosh
        sarlavha={t('Asosiy')}
        ai={false}
        chap={
          <DavrTanlash
            tur={tur}
            maxsus={maxsus}
            onChange={(yangi, m) => {
              setTur(yangi);
              if (m) setMaxsus(m);
              try {
                localStorage.setItem(DAVR_KALIT, yangi === 'maxsus' ? 'bugun' : yangi);
              } catch {
                /* ixtiyoriy */
              }
            }}
          />
        }
      >
        {holat.pipelines.length > 1 && (
          <select className="ms-hajm" value={voronka} onChange={(e) => setVoronka(e.target.value)} aria-label={t('Voronka')}>
            {holat.pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        {holat.scope === 'all' && (
          <select className="ms-hajm" value={seat} onChange={(e) => setSeat(e.target.value)} aria-label={t("Mas'ul")}>
            <option value="">{t('Hammasi')}</option>
            {seatlar.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
          </select>
        )}
      </MsBosh>

      <AiSavolQatori />

      <div className="ms-asosiy-panel">
        {xato && <div className="card xato-qator">{xato}</div>}
        {!data && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
        {k && data && (
          <>
            <div className="ms-ak-panjara">
              <AsosiyKarta
                nom={t('Sotuvlar')}
                ikon={Hourglass}
                ohang="yashil"
                qiymat={String(k.wonCount)}
                ozgarish={<Ozgarish joriy={k.wonCount} oldingi={oldingi?.wonCount} />}
                izoh={fmtPul(k.wonSum)}
                onClick={() => och({ status: 'won', ...yopilishF })}
              />
              <AsosiyKarta
                nom={t('Rad etilgan')}
                ikon={CircleSlash}
                ohang="kok"
                qiymat={String(k.lostCount)}
                ozgarish={<Ozgarish joriy={k.lostCount} oldingi={oldingi?.lostCount} teskari />}
                izoh={asosiySabab ? t('Asosiy sabab: {s}', { s: t(asosiySabab.name) }) : t("Sabab yo'q")}
                onClick={() => och({ status: 'lost', ...yopilishF })}
              />
              <AsosiyKarta
                nom={t('Konversiya')}
                ikon={TrendingUp}
                ohang="kok"
                qiymat={k.winRate === null ? '0%' : `${Math.round(k.winRate * 100)}%`}
                ozgarish={<Ozgarish joriy={k.winRate ?? 0} oldingi={oldingi ? (oldingi.winRate ?? 0) : null} pp />}
                izoh={t('{w} ta sotuv / {j} ta yopilgan', { w: k.wonCount, j: k.wonCount + k.lostCount })}
                onClick={() => och({ status: 'closed', ...yopilishF })}
              />
              <AsosiyKarta
                nom={t('Ochiq bitimlar')}
                ikon={WalletCards}
                ohang="kok"
                qiymat={fmtPul(k.openSum)}
                izoh={t('{n} ta ochiq bitim', { n: k.openCount.toLocaleString('ru-RU') })}
                onClick={() => och({ status: 'open' })}
              />
            </div>

            {uchr && (
              <Vidjet ikon={CalendarDays} nom={t('Uchrashuvlar')} izoh={t('«{m}» maydoni bo‘yicha, {d}', { m: uchr.fieldLabel, d: davrNomi })} className="ms-uchr">
                <div className="ms-uchr-ish">
                  <div className="ms-uchr-chap">
                    <div className="ms-uchr-sonlar">
                      <span>
                        <b>{uchr.total}</b>
                        {t('Jami')}
                      </span>
                      <span className="faol">
                        <b>{uchr.ahead}</b>
                        {t('Oldinda')}
                      </span>
                      <span>
                        <b>{uchr.total - uchr.ahead}</b>
                        {t("O'tdi")}
                      </span>
                    </div>
                    {uchr.bySeat.length > 0 && <div className="ms-kichik-sarlavha">{t('Kimda')}</div>}
                    <ul className="ms-chiziq-royxat">
                      {uchr.bySeat.map((s) => (
                        <li key={s.seatId ?? '-'}>
                          <span className="ms-avatar kichik">{boshHarf(s.name)}</span>
                          <span className="ms-chiziq-ism">
                            <span>
                              {s.name || t('Biriktirilmagan')}
                              <b>{s.count}</b>
                            </span>
                            <i>
                              <em style={{ width: `${(s.count / kimdaMax) * 100}%` }} />
                            </i>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <ul className="ms-uchr-royxat">
                    {uchr.items.length === 0 && <li className="ms-vidjet-bosh-holat">{t("Uchrashuv yo'q")}</li>}
                    {uchr.items.map((u) => (
                      <li key={u.dealId + u.at}>
                        <Link to={`/crm/bitimlar/${u.dealId}`} className={u.ahead ? undefined : 'otgan'}>
                          <time>
                            {uchr.fieldType === 'date'
                              ? new Date(u.at).toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })
                              : new Date(u.at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                          </time>
                          <span className="ms-uchr-nom">
                            <b>{u.name}</b>
                            <small>{[u.contact, u.seat].filter(Boolean).join(' · ')}</small>
                          </span>
                          <span className="ms-bosqich-chip">
                            <i style={{ background: u.stageColor }} />
                            {u.stage}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </Vidjet>
            )}

            <div className="ms-ikki">
              <Vidjet ikon={Trophy} nom={t("Eng ko'p sotganlar")} izoh={t('tanlangan davr uchun')}>
                <div className="ms-jadval-qobiq">
                  <table className="ms-mini-jadval">
                    <thead>
                      <tr>
                        <th>{t('Menejer')}</th>
                        <th>{t('Yangi')}</th>
                        <th>{t('Sotuv')}</th>
                        <th>{t('Rad etilgan')}</th>
                        <th>{t('Konversiya')}</th>
                        <th className="ong">{t('Summa')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.managers.length === 0 && (
                        <tr>
                          <td colSpan={6} className="ms-vidjet-bosh-holat">
                            {t("Ma'lumot yo'q")}
                          </td>
                        </tr>
                      )}
                      {data.managers.map((m) => (
                        <tr key={m.seatId} onClick={() => setSeat(m.seatId)} className="bosiladigan">
                          <td>
                            <span className="ms-ism-qator">
                              <span className="ms-avatar kichik">{boshHarf(m.name)}</span>
                              {m.name}
                            </span>
                          </td>
                          <td>{m.newCount}</td>
                          <td className={m.wonCount ? 'yashil' : 'sust'}>{m.wonCount}</td>
                          <td>{m.lostCount}</td>
                          <td>
                            {m.winRate === null ? (
                              <span className="sust">—</span>
                            ) : (
                              <span className="ms-konv">
                                <i>
                                  <em style={{ width: `${Math.round(m.winRate * 100)}%` }} />
                                </i>
                                {Math.round(m.winRate * 100)}%
                              </span>
                            )}
                          </td>
                          <td className={`ong${m.wonSum ? '' : ' sust'}`}>{pul(m.wonSum)} so'm</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Vidjet>

              <Vidjet ikon={CircleCheck} nom={t('Vazifalar')} izoh={t("Tanlangan davrda bajarilgan va hozir muddati o'tgan vazifalar")}>
                <ul className="ms-vaz-royxat">
                  {(qosh?.tasksBySeat ?? []).length === 0 && <li className="ms-vidjet-bosh-holat">{t("Vazifa yo'q")}</li>}
                  {(qosh?.tasksBySeat ?? []).map((v) => (
                    <li key={v.seatId}>
                      <button type="button" onClick={() => navigate(`/crm/vazifalar?seat=${v.seatId}`)}>
                        <span className="ms-avatar kichik">{boshHarf(v.name)}</span>
                        <span className="ms-chiziq-ism">
                          <span>
                            {v.name}
                            {v.overdue > 0 && <em className="ms-otgan-chip">{t("{n} ta muddati o'tgan", { n: v.overdue })}</em>}
                            <b>
                              {v.done}
                              <small>/{v.total}</small>
                            </b>
                          </span>
                          <i>
                            <em className="yashil" style={{ width: `${v.total ? (v.done / v.total) * 100 : 0}%` }} />
                          </i>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </Vidjet>
            </div>

            <div className="ms-ikki">
              <Vidjet ikon={PieChart} nom={t('Lidlar manbai')} izoh={t('tanlangan davr uchun')}>
                <Doira
                  jamiNomi={t('Jami')}
                  qatorlar={data.sources.map((s) => ({ kalit: s.source ?? '', nom: s.source ? t(s.source) : t("Qo'lda yaratildi"), qiymat: s.count }))}
                  onClick={(kalit) => (kalit ? och({ source: kalit, ...davrF }) : och(davrF))}
                />
              </Vidjet>
              <Vidjet ikon={CircleSlash} nom={t('Rad etish sabablari')} izoh={t('tanlangan davr uchun')}>
                <Doira
                  jamiNomi={t('Jami')}
                  qatorlar={data.lossReasons.map((s) => ({ kalit: s.id ?? s.name, nom: t(s.name), qiymat: s.count }))}
                  onClick={(kalit) => {
                    const r = data.lossReasons.find((s) => (s.id ?? s.name) === kalit);
                    och(r?.id ? { status: 'lost', lostReasonId: r.id, ...yopilishF } : { status: 'lost', ...yopilishF });
                  }}
                />
              </Vidjet>
            </div>

            {qosh?.callsBySeat && (
              <Vidjet
                ikon={Phone}
                nom={t("Menejerlar bo'yicha qo'ng'iroqlar")}
                ong={
                  <>
                    <span className="ms-legend kok">
                      {t('Kiruvchi')} <b>{kiruvchiJami}</b>
                    </span>
                    <span className="ms-legend yashil">
                      {t('Chiquvchi')} <b>{chiquvchiJami}</b>
                    </span>
                    <span className="ms-segment" role="group">
                      {(
                        [
                          ['soni', "Soni bo'yicha"],
                          ['unikal', 'Unikal mijozlar'],
                          ['davomiylik', "Davomiylik bo'yicha"],
                        ] as const
                      ).map(([kalit, nom]) => (
                        <button key={kalit} type="button" aria-pressed={qongiroqTur === kalit} onClick={() => setQongiroqTur(kalit)}>
                          {t(nom)}
                        </button>
                      ))}
                    </span>
                  </>
                }
              >
                <ul className="ms-qong-royxat">
                  {qongiroqlar.length === 0 && <li className="ms-vidjet-bosh-holat">{t("Tanlangan davrda qo'ng'iroq yo'q")}</li>}
                  {qongiroqlar.map((q) => {
                    const jami = q.inbound + q.outbound;
                    const qiymat = qongiroqTur === 'soni' ? jami : qongiroqTur === 'unikal' ? q.unique : q.durationSeconds;
                    const en = (qiymat / qongiroqMax) * 100;
                    return (
                      <li key={q.seatId}>
                        <span className="ms-qong-ism">
                          <b>{q.name}</b>
                          <small>{t('Suhbat: {v}', { v: davomiylik(q.durationSeconds, t) })}</small>
                        </span>
                        <span className="ms-qong-chiziq" style={{ width: `${Math.max(en, 4)}%` }}>
                          {qongiroqTur === 'soni' ? (
                            <>
                              {q.inbound > 0 && (
                                <em className="kok" style={{ flexGrow: q.inbound }}>
                                  {q.inbound}
                                </em>
                              )}
                              {q.outbound > 0 && (
                                <em className="yashil" style={{ flexGrow: q.outbound }}>
                                  {q.outbound} {t('chiquvchi')}
                                </em>
                              )}
                            </>
                          ) : (
                            <em className="kok" style={{ flexGrow: 1 }}>
                              {qongiroqTur === 'unikal' ? q.unique : davomiylik(q.durationSeconds, t)}
                            </em>
                          )}
                        </span>
                        {q.quality !== null && (
                          <span className={`ms-sifat ${q.quality >= 70 ? 'yaxshi' : q.quality >= 50 ? 'orta' : 'past'}`}>{t('Sifat {n}%', { n: q.quality })}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <Link to="/crm/qongiroqlar" className="ms-batafsil">
                  {t('Batafsil')} <ArrowRight />
                </Link>
              </Vidjet>
            )}

            {qosh?.transfers && (
              <div className="ms-ikki">
                <Vidjet ikon={Users} nom={t('Lid almashinuvi')} ong={<b className="ms-katta-son">{qosh.transfers.total}</b>}>
                  <ul className="ms-almash-royxat">
                    {qosh.transfers.items.length === 0 && <li className="ms-vidjet-bosh-holat">{t("Tanlangan davrda mas'ul almashmagan")}</li>}
                    {qosh.transfers.items.map((a) => (
                      <li key={a.dealId + a.at}>
                        <Link to={`/crm/bitimlar/${a.dealId}`}>
                          <span>
                            <b>{a.name}</b>
                            <small>{new Date(a.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</small>
                          </span>
                          <span className="ms-almash-kim">
                            {a.from ?? t('Biriktirilmagan')} <ArrowRight /> <b>{a.to ?? t('Biriktirilmagan')}</b>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Vidjet>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
