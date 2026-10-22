import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { DavrTanlash, GorizontalUstunlar, Progress, TrendGrafik } from '../../crm/komponentlar';
import { davrHisobla, foiz, pul, useCrm, type DavrTuri } from '../../crm/malumot';
import { useT } from '../../i18n';

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
  pipeline: { id: string; name: string; stages: { id: string; name: string; color: string; kind: string; count: number; sum: number }[] } | null;
  sources: { source: string | null; count: number; won: number; wonSum: number }[];
  lossReasons: { id: string | null; name: string; count: number; sum: number }[];
  trend: { day: string; created: number; won: number; wonSum: number }[];
  managers: {
    seatId: string;
    name: string;
    newCount: number;
    wonCount: number;
    wonSum: number;
    lostCount: number;
    openCount: number;
    overdue: number;
    tasksDone: number;
    calls: number;
    winRate: number | null;
  }[];
  goals: {
    month: string;
    team: { planSum: number | null; planCount: number | null; factSum: number; factCount: number } | null;
    seats: { seatId: string | null; name: string; planSum: number | null; factSum: number; planCount: number | null; factCount: number }[];
  };
}

const DAVR_KALIT = 'sotuvai-crm-davr';

/**
 * Ish stoli (DASH-01/02). Barcha vidjetlar bir xil filtrdan (davr, xodim,
 * voronka). KPI bosilsa — mos bitimlar ro'yxati ochiladi.
 */
export function IshStoli() {
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const bugun = new Date().toISOString().slice(0, 10);
  const [tur, setTur] = useState<DavrTuri>(() => {
    try {
      return (localStorage.getItem(DAVR_KALIT) as DavrTuri | null) ?? 'oy';
    } catch {
      return 'oy';
    }
  });
  const [maxsus, setMaxsus] = useState({ from: bugun.slice(0, 8) + '01', to: bugun });
  const [seat, setSeat] = useState('');
  const [voronka, setVoronka] = useState(holat.pipelines.find((p) => p.isMain)?.id ?? holat.pipelines[0]?.id ?? '');
  const [data, setData] = useState<IshStoliJavob | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const davr = useMemo(() => davrHisobla(tur, maxsus), [tur, maxsus]);

  useEffect(() => {
    let tirik = true;
    const q = new URLSearchParams({ from: davr.from, to: davr.to, pipelineId: voronka });
    if (seat) q.set('seat', seat);
    api
      .get<IshStoliJavob>(`${base}/crm-app/reports/dashboard?${q}`)
      .then((r) => tirik && (setData(r), setXato(null)))
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")));
    return () => {
      tirik = false;
    };
  }, [base, davr, seat, voronka, t]);

  /** KPI bosilganda — bitimlar jadvali shu filtr bilan. */
  const och = (f: Record<string, string>) => {
    const q = new URLSearchParams({ k: 'jadval', v: voronka, ...f });
    if (seat) q.set('s', seat);
    navigate(`/crm/bitimlar?${q}`);
  };
  const davrF = { createdFrom: davr.from, createdTo: davr.to };
  const yopilishF = { closedFrom: davr.from, closedTo: davr.to };

  return (
    <div className="ci-sahifa">
      <div className="ci-bosh">
        <h1>{t('Ish stoli')}</h1>
        <div className="ci-bosh-amallar">
          {holat.pipelines.length > 1 && (
            <select className="input ci-tor" value={voronka} onChange={(e) => setVoronka(e.target.value)} aria-label={t('Voronka')}>
              {holat.pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          {holat.scope === 'all' && (
            <select className="input ci-tor" value={seat} onChange={(e) => setSeat(e.target.value)} aria-label={t("Mas'ul")}>
              <option value="">{t('Butun jamoa')}</option>
              {seatlar.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
      <DavrTanlash
        tur={tur}
        maxsus={maxsus}
        onChange={(yangi, m) => {
          setTur(yangi);
          if (m) setMaxsus(m);
          try {
            localStorage.setItem(DAVR_KALIT, yangi === 'maxsus' ? 'oy' : yangi);
          } catch {
            /* ixtiyoriy */
          }
        }}
      />

      {xato && <div className="card xato-qator">{xato}</div>}
      {!data && !xato && <div className="card yuklanmoqda">{t('Yuklanmoqda…')}</div>}
      {data && (
        <>
          <div className="ci-kpi-panjara">
            <Kpi nom={t('Yangi bitimlar')} qiymat={data.kpi.newCount} izoh={pul(data.kpi.newSum)} onClick={() => och(davrF)} />
            <Kpi nom={t('Muvaffaqiyatli')} qiymat={data.kpi.wonCount} izoh={pul(data.kpi.wonSum)} onClick={() => och({ status: 'won', ...yopilishF })} ohang="yaxshi" />
            <Kpi nom={t("Yo'qotilgan")} qiymat={data.kpi.lostCount} izoh={t('Konversiya: {f}', { f: foiz(data.kpi.winRate) })} onClick={() => och({ status: 'lost', ...yopilishF })} />
            <Kpi nom={t('Ochiq bitimlar')} qiymat={data.kpi.openCount} izoh={pul(data.kpi.openSum)} onClick={() => och({ status: 'open' })} />
            <Kpi nom={t('Vazifasiz bitimlar')} qiymat={data.kpi.noTask} onClick={() => och({ status: 'open', task: 'none' })} ohang={data.kpi.noTask > 0 ? 'ogoh' : undefined} />
            <Kpi nom={t("Muddati o'tgan vazifalar")} qiymat={data.kpi.overdueTasks} onClick={() => navigate('/crm/vazifalar?p=overdue')} ohang={data.kpi.overdueTasks > 0 ? 'xavf' : undefined} />
            <Kpi nom={t('Bugungi vazifalar')} qiymat={data.kpi.todayTasks} izoh={t('Bajarildi: {n}', { n: data.kpi.doneTasks })} onClick={() => navigate('/crm/vazifalar?p=today')} />
            <Kpi nom={t('Saralanmagan')} qiymat={data.kpi.inboxPending} onClick={() => navigate('/crm/saralanmagan')} ohang={data.kpi.inboxPending > 0 ? 'ogoh' : undefined} />
          </div>

          <div className="ci-ikki-ustun">
            <section className="card ci-blok" aria-labelledby="is-trend">
              <h2 id="is-trend">{t('Kunlar bo‘yicha')}</h2>
              <TrendGrafik data={data.trend} />
            </section>
            {data.pipeline && (
              <section className="card ci-blok" aria-labelledby="is-bosqich">
                <h2 id="is-bosqich">{t('Bosqichlar: {v}', { v: data.pipeline.name })}</h2>
                <GorizontalUstunlar
                  qatorlar={data.pipeline.stages
                    .filter((s) => s.kind === 'open')
                    .map((s) => ({ kalit: s.id, nom: s.name, qiymat: s.count, izoh: s.sum ? pul(s.sum) : undefined, onClick: () => och({ stages: s.id }) }))}
                />
              </section>
            )}
          </div>

          <div className="ci-ikki-ustun">
            <section className="card ci-blok" aria-labelledby="is-manba">
              <h2 id="is-manba">{t('Manbalar')}</h2>
              <GorizontalUstunlar
                qatorlar={data.sources.map((s) => ({
                  kalit: s.source ?? '-',
                  nom: s.source || t("Ko'rsatilmagan"),
                  qiymat: s.count,
                  izoh: s.won ? t('{n} ta yutuq', { n: s.won }) : undefined,
                  onClick: s.source ? () => och({ source: s.source!, ...davrF }) : undefined,
                }))}
              />
            </section>
            <section className="card ci-blok" aria-labelledby="is-sabab">
              <h2 id="is-sabab">{t('Rad sabablari')}</h2>
              <GorizontalUstunlar
                qatorlar={data.lossReasons.map((s) => ({
                  kalit: s.id ?? s.name,
                  nom: t(s.name),
                  qiymat: s.count,
                  onClick: s.id ? () => och({ status: 'lost', lostReasonId: s.id!, ...yopilishF }) : undefined,
                }))}
              />
            </section>
          </div>

          {holat.scope === 'all' && (
            <section className="card ci-blok" aria-labelledby="is-xodim">
              <h2 id="is-xodim">{t('Xodimlar')}</h2>
              <div className="ci-jadval-qobiq">
                <table className="jadval">
                  <thead>
                    <tr>
                      <th>{t('Xodim')}</th>
                      <th className="ci-ong">{t('Yangi')}</th>
                      <th className="ci-ong">{t('Muvaffaqiyatli')}</th>
                      <th className="ci-ong">{t('Tushum')}</th>
                      <th className="ci-ong">{t('Konversiya')}</th>
                      <th className="ci-ong">{t('Ochiq')}</th>
                      <th className="ci-ong">{t("Muddati o'tgan")}</th>
                      <th className="ci-ong">{t("Qo'ng'iroqlar")}</th>
                      <th>{t('Reja')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.managers.map((m) => {
                      const g = data.goals.seats.find((s) => s.seatId === m.seatId);
                      return (
                        <tr key={m.seatId} className="bosiladigan" onClick={() => setSeat(m.seatId)}>
                          <td>{m.name}</td>
                          <td className="ci-ong ci-raqam">{m.newCount}</td>
                          <td className="ci-ong ci-raqam">{m.wonCount}</td>
                          <td className="ci-ong ci-raqam">{pul(m.wonSum)}</td>
                          <td className="ci-ong ci-raqam">{foiz(m.winRate)}</td>
                          <td className="ci-ong ci-raqam">{m.openCount}</td>
                          <td className={`ci-ong ci-raqam${m.overdue ? ' xavf' : ''}`}>{m.overdue}</td>
                          <td className="ci-ong ci-raqam">{m.calls}</td>
                          <td>{g && <Progress fakt={g.factSum} reja={g.planSum} pulmi />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {data.goals.team && (
                <div className="ci-jamoa-reja">
                  <span>{t('Jamoa rejasi ({oy})', { oy: data.goals.month })}:</span>
                  <Progress fakt={data.goals.team.factSum} reja={data.goals.team.planSum} pulmi />
                  <span className="yordam">
                    {pul(data.goals.team.factSum)} / {pul(data.goals.team.planSum)}
                  </span>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ nom, qiymat, izoh, onClick, ohang }: { nom: string; qiymat: number; izoh?: string; onClick?: () => void; ohang?: 'yaxshi' | 'ogoh' | 'xavf' }) {
  return (
    <button type="button" className={`card ci-kpi${ohang ? ` ${ohang}` : ''}`} onClick={onClick}>
      <span className="ci-kpi-nom">{nom}</span>
      <b className="ci-kpi-qiymat">{qiymat}</b>
      {izoh && <span className="ci-kpi-izoh">{izoh}</span>}
    </button>
  );
}
