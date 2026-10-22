import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, ApiError, fmtSana } from '../../api';
import { DavrTanlash, Progress } from '../../crm/komponentlar';
import { davrHisobla, foiz, pul, useCrm, type DavrTuri } from '../../crm/malumot';
import { useT } from '../../i18n';

type Tab = 'voronka' | 'xodim' | 'jurnal' | 'maqsad';

/**
 * CRM analitikasi (RPT-01/03/05/06). Barcha tablar bir xil davr va voronka
 * filtridan. Ta'riflar sahifada yozilgan — raqam qanday hisoblangani
 * foydalanuvchiga ko'rinadi.
 */
export function CrmAnalitika() {
  const { holat } = useCrm();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab | null) ?? 'voronka';
  const bugun = new Date().toISOString().slice(0, 10);
  const [tur, setTur] = useState<DavrTuri>('oy');
  const [maxsus, setMaxsus] = useState({ from: bugun.slice(0, 8) + '01', to: bugun });
  const [voronka, setVoronka] = useState(holat.pipelines.find((p) => p.isMain)?.id ?? holat.pipelines[0]?.id ?? '');
  const davr = useMemo(() => davrHisobla(tur, maxsus), [tur, maxsus]);

  const tablar: { k: Tab; nom: string; faqatRahbar?: boolean }[] = [
    { k: 'voronka', nom: 'Savdo voronkasi' },
    { k: 'xodim', nom: 'Xodimlar', faqatRahbar: true },
    { k: 'jurnal', nom: 'Hodisalar jurnali' },
    { k: 'maqsad', nom: 'Maqsadlar' },
  ];

  return (
    <div className="ci-sahifa">
      <div className="ci-bosh">
        <h1>{t('Analitika')}</h1>
        <div className="tab-qator" role="tablist">
          {tablar
            .filter((x) => !x.faqatRahbar || holat.scope === 'all')
            .map((x) => (
              <button key={x.k} role="tab" aria-selected={tab === x.k} className={`tab${tab === x.k ? ' active' : ''}`} onClick={() => setParams({ tab: x.k }, { replace: true })}>
                {t(x.nom)}
              </button>
            ))}
        </div>
      </div>
      <div className="ci-filtrlar">
        <DavrTanlash tur={tur} maxsus={maxsus} onChange={(y, m) => (setTur(y), m && setMaxsus(m))} />
        {tab !== 'jurnal' && tab !== 'maqsad' && holat.pipelines.length > 1 && (
          <select className="input ci-tor" value={voronka} onChange={(e) => setVoronka(e.target.value)} aria-label={t('Voronka')}>
            {holat.pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {tab === 'voronka' && <VoronkaHisoboti davr={davr} voronka={voronka} />}
      {tab === 'xodim' && <XodimlarHisoboti davr={davr} voronka={voronka} />}
      {tab === 'jurnal' && <Jurnal davr={davr} />}
      {tab === 'maqsad' && <Maqsadlar davr={davr} />}
    </div>
  );
}

function useHisobot<T>(url: string | null) {
  const t = useT();
  const [data, setData] = useState<T | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!url) return;
    let tirik = true;
    setData(null);
    api
      .get<T>(url)
      .then((r) => tirik && (setData(r), setXato(null)))
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")));
    return () => {
      tirik = false;
    };
  }, [url, t, n]);
  return { data, xato, qayta: () => setN((x) => x + 1) };
}

interface VoronkaJavob {
  pipeline: { id: string; name: string };
  cohort: number;
  cohortSum: number;
  stages: { id: string; name: string; color: string; kind: string; reached: number; conversion: number | null; now: number; nowSum: number }[];
}

function VoronkaHisoboti({ davr, voronka }: { davr: { from: string; to: string }; voronka: string }) {
  const { base } = useCrm();
  const t = useT();
  const { data, xato } = useHisobot<VoronkaJavob>(`${base}/crm-app/reports/funnel?${new URLSearchParams({ from: davr.from, to: davr.to, pipelineId: voronka })}`);
  if (xato) return <div className="card xato-qator">{xato}</div>;
  if (!data) return <div className="card yuklanmoqda">{t('Yuklanmoqda…')}</div>;
  const ochiqlar = data.stages.filter((s) => s.kind === 'open');
  const yakun = data.stages.filter((s) => s.kind !== 'open');
  const max = Math.max(1, data.cohort);
  return (
    <section className="card ci-blok" aria-labelledby="an-voronka">
      <div className="ci-blok-bosh">
        <h2 id="an-voronka">{t('{v}: davrda yaratilgan {n} ta bitim', { v: data.pipeline.name, n: data.cohort })}</h2>
        <span className="yordam">{pul(data.cohortSum)}</span>
      </div>
      <p className="yordam">{t("Har bosqichga hech bo'lmasa bir marta yetgan bitimlar soni va kogortaga nisbati (bosqich tarixidan). «Hozir» — ular hozir qaysi bosqichda turgani.")}</p>
      <ol className="ci-voronka">
        {[...ochiqlar, ...yakun].map((s) => (
          <li key={s.id} className={s.kind}>
            <span className="ci-voronka-nom">
              <span className="ci-nuqta" style={{ background: s.color }} aria-hidden="true" /> {s.name}
            </span>
            <span className="ci-voronka-trek" aria-hidden="true">
              <span style={{ width: `${(s.reached / max) * 100}%` }} />
            </span>
            <span className="ci-voronka-son">
              <b>{s.reached}</b> <small>{foiz(s.conversion)}</small>
            </span>
            <span className="ci-voronka-hozir yordam">{t('Hozir: {n}', { n: s.now })}</span>
          </li>
        ))}
      </ol>
      <details className="ci-jadval-korinish">
        <summary>{t("Jadval ko'rinishi")}</summary>
        <table className="jadval">
          <thead>
            <tr>
              <th>{t('Bosqich')}</th>
              <th className="ci-ong">{t('Yetgan')}</th>
              <th className="ci-ong">{t('Konversiya')}</th>
              <th className="ci-ong">{t('Hozir')}</th>
              <th className="ci-ong">{t('Summa (hozir)')}</th>
            </tr>
          </thead>
          <tbody>
            {data.stages.map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td className="ci-ong">{s.reached}</td>
                <td className="ci-ong">{foiz(s.conversion)}</td>
                <td className="ci-ong">{s.now}</td>
                <td className="ci-ong">{pul(s.nowSum)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}

interface XodimQator {
  seatId: string;
  name: string;
  newCount: number;
  wonCount: number;
  wonSum: number;
  lostCount: number;
  openCount: number;
  overdue: number;
  tasksDone: number;
  notes: number;
  calls: number;
  winRate: number | null;
}

function XodimlarHisoboti({ davr, voronka }: { davr: { from: string; to: string }; voronka: string }) {
  const { base } = useCrm();
  const t = useT();
  const { data, xato } = useHisobot<{ items: XodimQator[] }>(`${base}/crm-app/reports/managers?${new URLSearchParams({ from: davr.from, to: davr.to, pipelineId: voronka })}`);
  if (xato) return <div className="card xato-qator">{xato}</div>;
  if (!data) return <div className="card yuklanmoqda">{t('Yuklanmoqda…')}</div>;
  const jami = data.items.reduce(
    (a, x) => ({ newCount: a.newCount + x.newCount, wonCount: a.wonCount + x.wonCount, wonSum: a.wonSum + x.wonSum, lostCount: a.lostCount + x.lostCount, openCount: a.openCount + x.openCount, overdue: a.overdue + x.overdue, tasksDone: a.tasksDone + x.tasksDone, notes: a.notes + x.notes, calls: a.calls + x.calls }),
    { newCount: 0, wonCount: 0, wonSum: 0, lostCount: 0, openCount: 0, overdue: 0, tasksDone: 0, notes: 0, calls: 0 },
  );
  return (
    <section className="card ci-blok">
      <p className="yordam">{t("Bitimning hozirgi mas'uli bo'yicha. Konversiya = yutilgan / (yutilgan + yo'qotilgan) shu davrda yopilganlar ichida.")}</p>
      <div className="ci-jadval-qobiq">
        <table className="jadval">
          <thead>
            <tr>
              <th>{t('Xodim')}</th>
              <th className="ci-ong">{t('Yangi')}</th>
              <th className="ci-ong">{t('Muvaffaqiyatli')}</th>
              <th className="ci-ong">{t('Tushum')}</th>
              <th className="ci-ong">{t("Yo'qotilgan")}</th>
              <th className="ci-ong">{t('Konversiya')}</th>
              <th className="ci-ong">{t('Ochiq')}</th>
              <th className="ci-ong">{t("Muddati o'tgan")}</th>
              <th className="ci-ong">{t('Bajarilgan vazifa')}</th>
              <th className="ci-ong">{t('Izohlar')}</th>
              <th className="ci-ong">{t("Qo'ng'iroqlar")}</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((m) => (
              <tr key={m.seatId}>
                <td>{m.name}</td>
                <td className="ci-ong ci-raqam">{m.newCount}</td>
                <td className="ci-ong ci-raqam">{m.wonCount}</td>
                <td className="ci-ong ci-raqam">{pul(m.wonSum)}</td>
                <td className="ci-ong ci-raqam">{m.lostCount}</td>
                <td className="ci-ong ci-raqam">{foiz(m.winRate)}</td>
                <td className="ci-ong ci-raqam">{m.openCount}</td>
                <td className={`ci-ong ci-raqam${m.overdue ? ' xavf' : ''}`}>{m.overdue}</td>
                <td className="ci-ong ci-raqam">{m.tasksDone}</td>
                <td className="ci-ong ci-raqam">{m.notes}</td>
                <td className="ci-ong ci-raqam">{m.calls}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>
                <b>{t('Jami')}</b>
              </td>
              <td className="ci-ong">{jami.newCount}</td>
              <td className="ci-ong">{jami.wonCount}</td>
              <td className="ci-ong">{pul(jami.wonSum)}</td>
              <td className="ci-ong">{jami.lostCount}</td>
              <td className="ci-ong">{foiz(jami.wonCount + jami.lostCount ? jami.wonCount / (jami.wonCount + jami.lostCount) : null)}</td>
              <td className="ci-ong">{jami.openCount}</td>
              <td className="ci-ong">{jami.overdue}</td>
              <td className="ci-ong">{jami.tasksDone}</td>
              <td className="ci-ong">{jami.notes}</td>
              <td className="ci-ong">{jami.calls}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  );
}

const HODISA_TURLARI: { k: string; nom: string }[] = [
  { k: '', nom: 'Barcha hodisalar' },
  { k: 'created', nom: 'Bitim yaratildi' },
  { k: 'stage', nom: 'Bosqich o‘zgardi' },
  { k: 'field', nom: 'Maydon o‘zgardi' },
  { k: 'responsible', nom: "Mas'ul o'zgardi" },
  { k: 'note', nom: 'Izoh' },
  { k: 'task', nom: 'Vazifa qo‘yildi' },
  { k: 'task_done', nom: 'Vazifa bajarildi' },
  { k: 'tags', nom: 'Teglar' },
  { k: 'deleted', nom: "O'chirildi" },
];

function Jurnal({ davr }: { davr: { from: string; to: string } }) {
  const { base } = useCrm();
  const t = useT();
  const [tur, setTur] = useState('');
  const [sahifa, setSahifa] = useState(0);
  useEffect(() => setSahifa(0), [tur, davr]);
  const q = new URLSearchParams({ from: davr.from, to: davr.to, limit: '50', offset: String(sahifa * 50) });
  if (tur) q.set('type', tur);
  const { data, xato } = useHisobot<{ total: number; items: { id: string; type: string; data: Record<string, unknown>; createdAt: string; dealId: string; dealName: string; authorName: string | null }[] }>(
    `${base}/crm-app/reports/events?${q}`,
  );
  const turNomi = (k: string) => t(HODISA_TURLARI.find((x) => x.k === k)?.nom ?? k);
  const qisqa = (e: { type: string; data: Record<string, unknown> }) => {
    const d = e.data;
    if (e.type === 'stage') return `${String(d.fromName ?? '—')} → ${String(d.toName ?? '')}`;
    if (e.type === 'note') return String(d.text ?? '').slice(0, 140);
    if (e.type === 'task' || e.type === 'task_done') return String(d.title ?? '');
    if (e.type === 'tags') return `${(d.after as string[] | undefined)?.join(', ') ?? ''}`;
    if (e.type === 'field' && d.field === 'amount') return `${pul(Number(d.before ?? 0))} → ${pul(Number(d.after ?? 0))}`;
    return '';
  };
  const sahifalar = data ? Math.max(1, Math.ceil(data.total / 50)) : 1;
  return (
    <section className="card ci-blok">
      <div className="ci-jadval-tepa">
        <select className="input ci-tor" value={tur} onChange={(e) => setTur(e.target.value)} aria-label={t('Hodisa turi')}>
          {HODISA_TURLARI.map((x) => (
            <option key={x.k} value={x.k}>
              {t(x.nom)}
            </option>
          ))}
        </select>
        {data && <span className="yordam">{t('Jami: {n}', { n: data.total })}</span>}
      </div>
      {xato && <div className="xato-qator">{xato}</div>}
      {!data && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
      {data && data.items.length === 0 && <div className="ci-bosh-holat">{t('Hodisa topilmadi')}</div>}
      {data && data.items.length > 0 && (
        <div className="ci-jadval-qobiq">
          <table className="jadval">
            <thead>
              <tr>
                <th>{t('Vaqt')}</th>
                <th>{t('Hodisa')}</th>
                <th>{t('Bitim')}</th>
                <th>{t('Tafsilot')}</th>
                <th>{t('Kim')}</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((e) => (
                <tr key={e.id}>
                  <td className="yordam">{fmtSana(e.createdAt)}</td>
                  <td>{turNomi(e.type)}</td>
                  <td>
                    <Link to={`/crm/bitimlar/${e.dealId}`} className="ci-havola">
                      {e.dealName}
                    </Link>
                  </td>
                  <td>{qisqa(e)}</td>
                  <td className="yordam">{e.data.automation ? t('Avtomatika: {n}', { n: String(e.data.automation) }) : (e.authorName ?? t('Tizim'))}</td>
                </tr>
              ))}
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
    </section>
  );
}

interface MaqsadQator {
  seatId: string | null;
  name: string;
  planSum: number | null;
  planCount: number | null;
  factSum: number;
  factCount: number;
}

function Maqsadlar({ davr }: { davr: { from: string; to: string } }) {
  const { holat, base } = useCrm();
  const t = useT();
  const { data, xato, qayta } = useHisobot<{ month: string; team: MaqsadQator | null; seats: MaqsadQator[] }>(`${base}/crm-app/goals?${new URLSearchParams({ from: davr.from, to: davr.to })}`);
  const [xabar, setXabar] = useState<string | null>(null);

  const saqla = useCallback(
    async (q: MaqsadQator, amount: string, count: string) => {
      if (!data) return;
      try {
        await api.put(`${base}/crm-app/goals`, {
          month: data.month,
          seatId: q.seatId,
          amount: amount.trim() ? Number(amount.replace(/\s/g, '')) : null,
          count: count.trim() ? Number(count) : null,
        });
        setXabar(t('Saqlandi'));
        qayta();
      } catch (e) {
        setXabar(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      }
    },
    [base, data, qayta, t],
  );

  if (xato) return <div className="card xato-qator">{xato}</div>;
  if (!data) return <div className="card yuklanmoqda">{t('Yuklanmoqda…')}</div>;
  const qatorlar = [...(data.team ? [{ ...data.team, name: t('Butun jamoa') }] : []), ...data.seats];
  return (
    <section className="card ci-blok">
      <div className="ci-blok-bosh">
        <h2>{t('{oy} oyi rejasi', { oy: data.month })}</h2>
        {xabar && (
          <span className="yordam" role="status">
            {xabar}
          </span>
        )}
      </div>
      <p className="yordam">{t("Fakt — shu oyda muvaffaqiyatli yopilgan bitimlar (hozirgi mas'ul bo'yicha). Reja kiritilmagan bo'lsa foiz ko'rsatilmaydi.")}</p>
      <div className="ci-jadval-qobiq">
        <table className="jadval">
          <thead>
            <tr>
              <th>{t('Kim')}</th>
              <th>{t('Reja: summa')}</th>
              <th>{t('Reja: soni')}</th>
              <th className="ci-ong">{t('Fakt: summa')}</th>
              <th className="ci-ong">{t('Fakt: soni')}</th>
              <th>{t('Bajarilishi')}</th>
            </tr>
          </thead>
          <tbody>
            {qatorlar.map((q) => (
              <MaqsadQatori key={q.seatId ?? 'jamoa'} q={q} tahrir={holat.canConfigure} onSaqla={saqla} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function MaqsadQatori({ q, tahrir, onSaqla }: { q: MaqsadQator; tahrir: boolean; onSaqla: (q: MaqsadQator, a: string, c: string) => void }) {
  const t = useT();
  const [a, setA] = useState(q.planSum === null ? '' : String(q.planSum));
  const [c, setC] = useState(q.planCount === null ? '' : String(q.planCount));
  const ozgardi = a !== (q.planSum === null ? '' : String(q.planSum)) || c !== (q.planCount === null ? '' : String(q.planCount));
  return (
    <tr>
      <td>{q.seatId ? q.name : <b>{q.name}</b>}</td>
      <td>
        {tahrir ? <input className="input ci-son-kiritish keng" inputMode="numeric" value={a} onChange={(e) => setA(e.target.value.replace(/[^\d\s]/g, ''))} aria-label={t('Reja: summa')} /> : pul(q.planSum)}
      </td>
      <td>
        {tahrir ? <input className="input ci-son-kiritish" inputMode="numeric" value={c} onChange={(e) => setC(e.target.value.replace(/\D/g, ''))} aria-label={t('Reja: soni')} /> : (q.planCount ?? '—')}
        {tahrir && ozgardi && (
          <button className="btn kichik ci-qator-saqla" onClick={() => onSaqla(q, a, c)}>
            {t('Saqlash')}
          </button>
        )}
      </td>
      <td className="ci-ong ci-raqam">{pul(q.factSum)}</td>
      <td className="ci-ong ci-raqam">{q.factCount}</td>
      <td>
        <Progress fakt={q.factSum} reja={q.planSum} pulmi />
      </td>
    </tr>
  );
}
