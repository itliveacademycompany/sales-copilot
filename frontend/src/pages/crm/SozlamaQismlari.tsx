import { Archive, ArrowDown, ArrowUp, Code2, Copy, ExternalLink, Pencil, Plus, RotateCcw, Trash2, Zap } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, fmtQachon } from '../../api';
import { pul, useCrm, type RadSababi, type VazifaTuri } from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';

/**
 * CRM sozlamalarining 2-bosqich bo'limlari: rad sabablari, vazifa turlari,
 * taqsimot va qabul, avtomatika, veb-formalar, tovarlar, teglar.
 */

function useXabar() {
  const [x, setX] = useState<{ ok: boolean; matn: string } | null>(null);
  const el = x ? (
    <div className={x.ok ? 'ok-qator' : 'xato-qator'} role={x.ok ? 'status' : 'alert'}>
      {x.matn}
    </div>
  ) : null;
  return { setX, el };
}

// ─── Rad sabablari (PIPE-03) ─────────────────────────────────────────────────

export function RadSabablariSozlama() {
  const { base, yangila, holat } = useCrm();
  const t = useT();
  const [royxat, setRoyxat] = useState<RadSababi[] | null>(null);
  const [yangi, setYangi] = useState('');
  const { setX, el } = useXabar();

  const yukla = useCallback(async () => {
    const r = await api.get<{ items: RadSababi[] }>(`${base}/crm-app/loss-reasons?all=1`).catch(() => null);
    if (r) setRoyxat(r.items);
  }, [base]);
  useEffect(() => {
    void yukla();
  }, [yukla]);

  const bajar = async (fn: () => Promise<unknown>) => {
    setX(null);
    try {
      await fn();
      await yukla();
      await yangila();
    } catch (e) {
      setX({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
    }
  };

  return (
    <section className="card ci-blok">
      <h2>{t('Rad sabablari')}</h2>
      <label className="ci-belgi">
        <input
          type="checkbox"
          checked={holat.lossReasonRequired}
          onChange={(e) => void bajar(() => api.patch(`${base}/crm-app/settings`, { lossReasonRequired: e.target.checked }))}
        />
        <span>{t("Bitim yo'qotilganda sababni tanlash majburiy")}</span>
      </label>
      <ul className="ci-royxat">
        {(royxat ?? []).map((r, i) => (
          <li key={r.id} className={`ci-royxat-band${r.archived ? ' arxiv' : ''}`}>
            <span>
              <b>{t(r.name)}</b>
              <small>{t('{n} ta bitimda', { n: r.used })}</small>
            </span>
            <span className="ci-qator-amallar">
              <button
                className="vr-amal"
                disabled={i === 0}
                onClick={() => {
                  const oldingi = royxat![i - 1]!;
                  // Qo'shni bilan o'rin almashadi — tartib raqamlari takrorlanmaydi
                  void bajar(() =>
                    Promise.all([
                      api.patch(`${base}/crm-app/loss-reasons/${r.id}`, { sort: i - 1 }),
                      api.patch(`${base}/crm-app/loss-reasons/${oldingi.id}`, { sort: i }),
                    ]),
                  );
                }}
                aria-label={t('Yuqoriga')}
              >
                <ArrowUp />
              </button>
              <button
                className="vr-amal"
                onClick={() => {
                  const nom = prompt(t('Yangi nom'), r.name);
                  if (nom?.trim()) void bajar(() => api.patch(`${base}/crm-app/loss-reasons/${r.id}`, { name: nom.trim() }));
                }}
                aria-label={t('Tahrirlash')}
              >
                <Pencil />
              </button>
              <button className="vr-amal" onClick={() => void bajar(() => api.patch(`${base}/crm-app/loss-reasons/${r.id}`, { archived: !r.archived }))} aria-label={r.archived ? t('Qaytarish') : t('Arxivlash')}>
                {r.archived ? <RotateCcw /> : <Archive />}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <form
        className="ci-qator-kiritish"
        onSubmit={(e) => {
          e.preventDefault();
          if (yangi.trim()) void bajar(() => api.post(`${base}/crm-app/loss-reasons`, { name: yangi.trim() })).then(() => setYangi(''));
        }}
      >
        <input className="input" value={yangi} maxLength={100} onChange={(e) => setYangi(e.target.value)} placeholder={t('Yangi sabab')} aria-label={t('Yangi sabab')} />
        <button className="btn kichik" type="submit" disabled={!yangi.trim()}>
          <Plus /> {t("Qo'shish")}
        </button>
      </form>
      {el}
    </section>
  );
}

// ─── Vazifa turlari ──────────────────────────────────────────────────────────

const STANDART = new Set(['call', 'meeting']);

export function VazifaTurlariSozlama() {
  const { holat, base, yangila } = useCrm();
  const t = useT();
  const [turlar, setTurlar] = useState<VazifaTuri[]>(holat.taskTypes);
  const { setX, el } = useXabar();
  useEffect(() => setTurlar(holat.taskTypes), [holat.taskTypes]);

  const saqla = async () => {
    setX(null);
    try {
      await api.patch(`${base}/crm-app/settings`, { taskTypes: turlar.filter((x) => x.name.trim()) });
      await yangila();
      setX({ ok: true, matn: t('Saqlandi') });
    } catch (e) {
      setX({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
    }
  };

  return (
    <section className="card ci-blok">
      <h2>{t('Vazifa turlari')}</h2>
      <p className="yordam">{t("«Bog'lanish» va «Uchrashuv» — standart, o'chirilmaydi. O'zingizniki: masalan «Demo dars», «Shartnoma».")}</p>
      <ol className="ci-bosqich-tahrir tor">
        {turlar.map((x, i) => (
          <li key={x.id}>
            <input type="color" className="ci-rang" value={x.color} onChange={(e) => setTurlar((s) => s.map((y, j) => (j === i ? { ...y, color: e.target.value } : y)))} aria-label={t('Rang')} />
            <input className="input" value={x.name} maxLength={60} onChange={(e) => setTurlar((s) => s.map((y, j) => (j === i ? { ...y, name: e.target.value } : y)))} aria-label={t('Nomi')} />
            <span className="ci-qator-amallar">
              <button className="vr-amal" disabled={STANDART.has(x.id)} onClick={() => setTurlar((s) => s.filter((_, j) => j !== i))} aria-label={t("O'chirish")}>
                <Trash2 />
              </button>
            </span>
          </li>
        ))}
      </ol>
      <div className="ci-saqlash-qator ci-chap">
        <button className="btn ikkinchi kichik" onClick={() => setTurlar((s) => [...s, { id: `t${Date.now().toString(36)}`, name: '', color: '#6250d6' }])}>
          <Plus /> {t('Tur')}
        </button>
        <button className="btn kichik" onClick={() => void saqla()}>
          {t('Saqlash')}
        </button>
      </div>
      {el}
    </section>
  );
}

// ─── Taqsimot va qabul (AUTO-03, LEAD-04) ────────────────────────────────────

interface Sozlama {
  roundRobin: { enabled: boolean; seatIds: string[] };
  callIntake: { enabled: boolean; pipelineId: string | null; autoAccept: boolean; since: string | null };
}

export function TaqsimotSozlama() {
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const [s, setS] = useState<Sozlama | null>(null);
  const { setX, el } = useXabar();

  useEffect(() => {
    void api
      .get<Sozlama>(`${base}/crm-app/settings`)
      .then(setS)
      .catch(() => undefined);
  }, [base]);

  const saqla = async () => {
    if (!s) return;
    setX(null);
    try {
      const r = await api.patch<Sozlama>(`${base}/crm-app/settings`, {
        roundRobin: { enabled: s.roundRobin.enabled, seatIds: s.roundRobin.seatIds },
        callIntake: { enabled: s.callIntake.enabled, pipelineId: s.callIntake.pipelineId, autoAccept: s.callIntake.autoAccept },
      });
      setS(r);
      setX({ ok: true, matn: t('Saqlandi') });
    } catch (e) {
      setX({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
    }
  };

  if (!s) return <div className="card yuklanmoqda">{t('Yuklanmoqda…')}</div>;
  return (
    <>
      <section className="card ci-blok">
        <h2>{t('Lidlarni taqsimlash')}</h2>
        <p className="yordam">{t('Yangi murojaat qabul qilinganda (mas’ul tanlanmasa) — tanlangan xodimlarga navbat bilan. Faol bo‘lmagan xodim o‘tkazib yuboriladi.')}</p>
        <label className="ci-belgi">
          <input type="checkbox" checked={s.roundRobin.enabled} onChange={(e) => setS({ ...s, roundRobin: { ...s.roundRobin, enabled: e.target.checked } })} />
          <span>{t('Navbat bilan taqsimlash yoqilgan')}</span>
        </label>
        <div className="ci-kopli" role="group" aria-label={t('Xodimlar')}>
          {seatlar.map((x) => {
            const bor = s.roundRobin.seatIds.includes(x.id);
            return (
              <button
                key={x.id}
                type="button"
                className={`ci-chip${bor ? ' faol' : ''}`}
                aria-pressed={bor}
                onClick={() => setS({ ...s, roundRobin: { ...s.roundRobin, seatIds: bor ? s.roundRobin.seatIds.filter((y) => y !== x.id) : [...s.roundRobin.seatIds, x.id] } })}
              >
                {x.displayName}
              </button>
            );
          })}
        </div>
      </section>
      <section className="card ci-blok">
        <h2>{t("SotuvAI qo'ng'iroqlaridan qabul")}</h2>
        <p className="yordam">{t("Ochiq bitimi yo'q mijoz qo'ng'iroq qilsa — u «Saralanmagan»ga o'zi tushadi (CRM yoqilgandan keyingi qo'ng'iroqlar).")}</p>
        {holat.externalSync && (
          <div className="card ci-sinx-qator" role="note">
            {t("Hozir lidlar {crm} dan sinxronlanmoqda — takror bitim bo'lmasligi uchun qo'ng'iroqlardan qabul to'xtatilgan.", { crm: holat.externalSync })}
          </div>
        )}
        <label className="ci-belgi">
          <input type="checkbox" checked={s.callIntake.enabled} onChange={(e) => setS({ ...s, callIntake: { ...s.callIntake, enabled: e.target.checked } })} />
          <span>{t('Yoqilgan')}</span>
        </label>
        <div className="vr-oyna-ikki">
          <div className="maydon-blok">
            <label htmlFor="tq-voronka">{t('Voronka')}</label>
            <select id="tq-voronka" className="input" value={s.callIntake.pipelineId ?? ''} onChange={(e) => setS({ ...s, callIntake: { ...s.callIntake, pipelineId: e.target.value || null } })}>
              <option value="">{t('Asosiy voronka')}</option>
              {holat.pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <label className="ci-belgi ci-ozod">
            <input type="checkbox" checked={s.callIntake.autoAccept} onChange={(e) => setS({ ...s, callIntake: { ...s.callIntake, autoAccept: e.target.checked } })} />
            <span>{t("Saralamasdan darhol bitim yaratish")}</span>
          </label>
        </div>
        {s.callIntake.since && <p className="yordam">{t('{v} dan keyingi qo‘ng‘iroqlar ko‘riladi', { v: new Date(s.callIntake.since).toLocaleString('ru-RU') })}</p>}
      </section>
      <div className="ci-saqlash-qator">
        <button className="btn" onClick={() => void saqla()}>
          {t('Saqlash')}
        </button>
      </div>
      {el}
    </>
  );
}

// ─── Avtomatika (AUTO-*) ─────────────────────────────────────────────────────

type Amal =
  | { type: 'task'; title: string; taskType: string; dueMinutes: number }
  | { type: 'responsible'; mode: 'roundrobin' | 'seat'; seatId?: string | null; seatIds?: string[] }
  | { type: 'move'; stageId: string }
  | { type: 'tag'; tag: string }
  | { type: 'note'; text: string }
  | { type: 'copy'; stageId: string };

interface QoidaShartlari {
  onlyIfNoOpenTasks?: boolean;
  onlyIfNoResponsible?: boolean;
  /** stage — bosqichga kirgandan keyin; date — sana maydonigacha N kun qolganda. */
  trigger?: 'stage' | 'date';
  dateFieldId?: string;
  daysBefore?: number;
}

interface Qoida {
  id: string;
  name: string;
  pipelineId: string;
  stageId: string;
  delayMinutes: number;
  conditions: QoidaShartlari;
  actions: Amal[];
  active: boolean;
  runs: number;
  errors: number;
  lastRunAt: string | null;
}

function kechikishMatni(daq: number, t: (s: string, v?: Record<string, string | number>) => string): string {
  if (daq === 0) return t('darhol');
  if (daq % 1440 === 0) return t('{n} kundan keyin', { n: daq / 1440 });
  if (daq % 60 === 0) return t('{n} soatdan keyin', { n: daq / 60 });
  return t('{n} daqiqadan keyin', { n: daq });
}

export function AvtomatikaSozlama() {
  const { holat, base } = useCrm();
  const t = useT();
  const [qoidalar, setQoidalar] = useState<Qoida[] | null>(null);
  const [tahrir, setTahrir] = useState<Qoida | 'yangi' | null>(null);
  const [jurnal, setJurnal] = useState<{ id: string; status: string; error: string | null; created_at: string; deal_id: string; deal_name: string | null; automation_name: string }[] | null>(null);
  const { setX, el } = useXabar();

  const yukla = useCallback(async () => {
    const r = await api.get<{ items: Qoida[] }>(`${base}/crm-app/automations`).catch(() => null);
    if (r) setQoidalar(r.items);
  }, [base]);
  useEffect(() => {
    void yukla();
  }, [yukla]);

  const bosqichNomi = (id: string) => {
    for (const p of holat.pipelines) {
      const s = p.stages.find((x) => x.id === id);
      if (s) return `${p.name} → ${s.name}`;
    }
    return '—';
  };
  const amalMatni = (a: Amal) => {
    if (a.type === 'task') return t('Vazifa: «{v}» ({d})', { v: a.title, d: kechikishMatni(a.dueMinutes, t) });
    if (a.type === 'responsible') return a.mode === 'seat' ? t("Mas'ul: {n}", { n: '…' }) : t("Mas'ul: navbat bilan");
    if (a.type === 'move') return t('Ko‘chirish: {b}', { b: bosqichNomi(a.stageId) });
    if (a.type === 'tag') return t('Teg: {v}', { v: a.tag });
    if (a.type === 'copy') return t('Nusxa: {b}', { b: bosqichNomi(a.stageId) });
    return t('Izoh: {v}', { v: a.text.slice(0, 40) });
  };
  const qachonMatni = (q: Qoida) => {
    if (q.conditions.trigger === 'date') {
      const m = holat.fields.find((f) => f.id === q.conditions.dateFieldId);
      const n = q.conditions.daysBefore ?? 0;
      return n > 0 ? t('«{m}» gacha {n} kun qolganda', { m: m?.label ?? '—', n }) : t('«{m}» kuni', { m: m?.label ?? '—' });
    }
    return kechikishMatni(q.delayMinutes, t);
  };

  const almashtir = async (q: Qoida) => {
    try {
      const { id: _i, runs: _r, errors: _e, lastRunAt: _l, pipelineId: _p, ...qolgan } = q;
      await api.put(`${base}/crm-app/automations/${q.id}`, { ...qolgan, active: !q.active });
      await yukla();
    } catch (e) {
      setX({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
    }
  };

  return (
    <>
      <section className="card ci-blok">
        <div className="ci-blok-bosh">
          <h2>
            <Zap aria-hidden="true" /> {t('Avtomatika qoidalari')}
          </h2>
          <div className="ci-bosh-amallar">
            <button className="btn ikkinchi kichik" onClick={() => void api.get<{ items: typeof jurnal }>(`${base}/crm-app/automations/log`).then((r) => setJurnal(r.items)).catch(() => undefined)}>
              {t('Ijro jurnali')}
            </button>
            <button className="btn kichik" onClick={() => setTahrir('yangi')}>
              <Plus /> {t('Qoida')}
            </button>
          </div>
        </div>
        <p className="yordam">{t("Lid bosqichga kirganda, unda belgilangan vaqt qolib ketganda yoki sana maydonigacha N kun qolganda — vazifa, mas'ul, ko'chirish, boshqa voronkada nusxa, teg. Har kirish uchun bir marta ishlaydi; qoida yaratilishidan oldingi lidlarga qo'llanmaydi.")}</p>
        {qoidalar?.length === 0 && <p className="yordam">{t("Hali qoida yo'q. Masalan: «Qayta aloqa» bosqichida 24 soat qolsa — mas'ulga vazifa.")}</p>}
        <ul className="ci-royxat">
          {(qoidalar ?? []).map((q) => (
            <li key={q.id} className={`ci-royxat-band ci-qoida${q.active ? '' : ' arxiv'}`}>
              <span>
                <b>{q.name}</b>
                <small>
                  {bosqichNomi(q.stageId)} · {qachonMatni(q)}
                  {q.conditions.onlyIfNoOpenTasks && ` · ${t('vazifasi bo‘lmasa')}`}
                </small>
                <small>{q.actions.map(amalMatni).join(' · ')}</small>
                <small className="yordam">
                  {t('{n} marta ishladi', { n: q.runs })}
                  {q.errors > 0 && <span className="xavf"> · {t('{n} xato', { n: q.errors })}</span>}
                  {q.lastRunAt && ` · ${fmtQachon(q.lastRunAt)}`}
                </small>
              </span>
              <span className="ci-qator-amallar">
                <label className="ci-belgi" title={q.active ? t("O'chirish") : t('Yoqish')}>
                  <input type="checkbox" checked={q.active} onChange={() => void almashtir(q)} aria-label={t('Faol')} />
                </label>
                <button className="vr-amal" onClick={() => setTahrir(q)} aria-label={t('Tahrirlash')}>
                  <Pencil />
                </button>
                <button
                  className="vr-amal"
                  onClick={async () => {
                    if (!confirm(t('Qoida o‘chirilsinmi?'))) return;
                    await api.del(`${base}/crm-app/automations/${q.id}`).catch(() => undefined);
                    await yukla();
                  }}
                  aria-label={t("O'chirish")}
                >
                  <Trash2 />
                </button>
              </span>
            </li>
          ))}
        </ul>
        {el}
      </section>
      {jurnal && (
        <section className="card ci-blok">
          <h2>{t('Ijro jurnali (oxirgi 100)')}</h2>
          {jurnal.length === 0 && <p className="yordam">{t("Hali ijro yo'q")}</p>}
          <ul className="ci-royxat">
            {jurnal.map((j) => (
              <li key={j.id} className="ci-royxat-band">
                <span>
                  <b>{j.automation_name}</b>
                  <small>{j.deal_name ?? '—'}</small>
                </span>
                <span className="ci-royxat-ong">
                  <span className={j.status === 'error' ? 'xavf' : j.status === 'skipped' ? 'yordam' : ''}>{t({ done: 'Bajarildi', skipped: "O'tkazildi (shart)", error: 'Xato' }[j.status] ?? j.status)}</span>
                  {j.error && <small className="xavf">{t(j.error)}</small>}
                  <small className="yordam">{fmtQachon(j.created_at)}</small>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {tahrir && <QoidaOyna q={tahrir === 'yangi' ? null : tahrir} onYop={() => setTahrir(null)} onSaqlandi={() => (setTahrir(null), void yukla())} />}
    </>
  );
}

function QoidaOyna({ q, onYop, onSaqlandi }: { q: Qoida | null; onYop: () => void; onSaqlandi: () => void }) {
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const [nom, setNom] = useState(q?.name ?? '');
  const [stageId, setStageId] = useState(q?.stageId ?? holat.pipelines[0]?.stages[0]?.id ?? '');
  const birlik = q && q.delayMinutes % 1440 === 0 && q.delayMinutes > 0 ? 1440 : q && q.delayMinutes % 60 === 0 && q.delayMinutes > 0 ? 60 : 1;
  const [kechikish, setKechikish] = useState(q ? String(q.delayMinutes / birlik) : '0');
  const [kBirlik, setKBirlik] = useState(birlik);
  const [shart, setShart] = useState<QoidaShartlari>(q?.conditions ?? {});
  const sanaMaydonlari = holat.fields.filter((f) => f.type === 'date' || f.type === 'datetime');
  const sanaQoidasi = shart.trigger === 'date';
  const [amallar, setAmallar] = useState<Amal[]>(q?.actions ?? [{ type: 'task', title: '', taskType: holat.taskTypes[0]?.id ?? 'call', dueMinutes: 60 }]);
  const [xato, setXato] = useState<string | null>(null);

  const amalniOzgartir = (i: number, a: Amal) => setAmallar((s) => s.map((x, j) => (j === i ? a : x)));
  const saqla = async () => {
    setXato(null);
    const body = {
      name: nom.trim(),
      stageId,
      delayMinutes: Math.max(0, Math.round(Number(kechikish || 0) * kBirlik)),
      conditions: shart,
      actions: amallar,
      active: q?.active ?? true,
    };
    try {
      if (q) await api.put(`${base}/crm-app/automations/${q.id}`, body);
      else await api.post(`${base}/crm-app/automations`, body);
      onSaqlandi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  return (
    <Oyna
      keng
      sarlavha={q ? t('Qoidani tahrirlash') : t('Yangi qoida')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn">
            {t('Saqlash')}
          </button>
        </>
      }
    >
      <div className="maydon-blok">
        <label htmlFor="qo-nom">{t('Qoida nomi')}</label>
        <input id="qo-nom" className="input" value={nom} maxLength={120} onChange={(e) => setNom(e.target.value)} placeholder={t('Masalan: 24 soatda qayta aloqa')} />
      </div>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="qo-bosqich">{t('Bosqich')}</label>
          <select id="qo-bosqich" className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
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
        </div>
        <div className="maydon-blok">
          <label htmlFor="qo-trigger">{t('Qachon ishlaydi')}</label>
          <select
            id="qo-trigger"
            className="input"
            value={sanaQoidasi ? 'date' : 'stage'}
            onChange={(e) =>
              setShart(
                e.target.value === 'date'
                  ? { ...shart, trigger: 'date', dateFieldId: shart.dateFieldId ?? sanaMaydonlari[0]?.id, daysBefore: shart.daysBefore ?? 0 }
                  : { onlyIfNoOpenTasks: shart.onlyIfNoOpenTasks, onlyIfNoResponsible: shart.onlyIfNoResponsible },
              )
            }
          >
            <option value="stage">{t('Bosqichga kirgandan keyin')}</option>
            <option value="date" disabled={sanaMaydonlari.length === 0}>
              {t("Sana maydoni bo'yicha")}
              {sanaMaydonlari.length === 0 ? ` (${t("sana maydoni yo'q")})` : ''}
            </option>
          </select>
        </div>
      </div>
      {sanaQoidasi ? (
        <div className="vr-oyna-ikki">
          <div className="maydon-blok">
            <label htmlFor="qo-sana">{t('Sana maydoni')}</label>
            <select id="qo-sana" className="input" value={shart.dateFieldId ?? ''} onChange={(e) => setShart({ ...shart, dateFieldId: e.target.value })}>
              {sanaMaydonlari.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="maydon-blok">
            <label htmlFor="qo-kun">{t('Necha kun qolganda')}</label>
            <input
              id="qo-kun"
              className="input ci-son-kiritish keng"
              inputMode="numeric"
              value={String(shart.daysBefore ?? 0)}
              onChange={(e) => setShart({ ...shart, daysBefore: Math.min(365, Number(e.target.value.replace(/\D/g, '') || 0)) })}
            />
            <span className="yordam">{t("Masalan, obuna tugashiga 30 / 14 / 7 kun. 0 — o'sha kuni. Lid tanlangan bosqichda turgan bo'lishi kerak; sana o'zgarsa qoida yana ishlaydi.")}</span>
          </div>
        </div>
      ) : (
        <div className="maydon-blok">
          <label htmlFor="qo-vaqt">{t('Qancha vaqtdan keyin')}</label>
          <div className="ci-qator-kiritish">
            <input id="qo-vaqt" className="input ci-son-kiritish keng" inputMode="numeric" value={kechikish} onChange={(e) => setKechikish(e.target.value.replace(/\D/g, ''))} />
            <select className="input" value={kBirlik} onChange={(e) => setKBirlik(Number(e.target.value))} aria-label={t('Birlik')}>
              <option value={1}>{t('daqiqa')}</option>
              <option value={60}>{t('soat')}</option>
              <option value={1440}>{t('kun')}</option>
            </select>
          </div>
          <span className="yordam">{t('0 — bosqichga kirishi bilan; aks holda shuncha vaqt shu bosqichda qolsa')}</span>
        </div>
      )}
      <div className="ci-kopli">
        <label className="ci-belgi">
          <input type="checkbox" checked={Boolean(shart.onlyIfNoOpenTasks)} onChange={(e) => setShart({ ...shart, onlyIfNoOpenTasks: e.target.checked })} />
          <span>{t("Faqat ochiq vazifasi bo'lmasa")}</span>
        </label>
        <label className="ci-belgi">
          <input type="checkbox" checked={Boolean(shart.onlyIfNoResponsible)} onChange={(e) => setShart({ ...shart, onlyIfNoResponsible: e.target.checked })} />
          <span>{t("Faqat mas'uli bo'lmasa")}</span>
        </label>
      </div>
      <div className="maydon-blok">
        <label>{t('Amallar')}</label>
        <ol className="ci-amallar">
          {amallar.map((a, i) => (
            <li key={i}>
              <select
                className="input ci-tor"
                value={a.type}
                onChange={(e) => {
                  const tur = e.target.value as Amal['type'];
                  amalniOzgartir(
                    i,
                    tur === 'task'
                      ? { type: 'task', title: '', taskType: holat.taskTypes[0]?.id ?? 'call', dueMinutes: 60 }
                      : tur === 'responsible'
                        ? { type: 'responsible', mode: 'roundrobin', seatIds: [] }
                        : tur === 'move'
                          ? { type: 'move', stageId: '' }
                          : tur === 'copy'
                            ? { type: 'copy', stageId: '' }
                            : tur === 'tag'
                              ? { type: 'tag', tag: '' }
                              : { type: 'note', text: '' },
                  );
                }}
                aria-label={t('Amal turi')}
              >
                <option value="task">{t('Vazifa qo‘yish')}</option>
                <option value="responsible">{t("Mas'ul tayinlash")}</option>
                <option value="move">{t('Bosqichga ko‘chirish')}</option>
                <option value="copy">{t('Boshqa voronkada nusxa yaratish')}</option>
                <option value="tag">{t("Teg qo'shish")}</option>
                <option value="note">{t('Izoh yozish')}</option>
              </select>
              {a.type === 'task' && (
                <>
                  <input className="input" value={a.title} maxLength={300} onChange={(e) => amalniOzgartir(i, { ...a, title: e.target.value })} placeholder={t('Vazifa matni')} aria-label={t('Vazifa matni')} />
                  <select className="input ci-tor" value={a.taskType} onChange={(e) => amalniOzgartir(i, { ...a, taskType: e.target.value })} aria-label={t('Vazifa turi')}>
                    {holat.taskTypes.map((x) => (
                      <option key={x.id} value={x.id}>
                        {t(x.name)}
                      </option>
                    ))}
                  </select>
                  <select className="input ci-tor" value={a.dueMinutes} onChange={(e) => amalniOzgartir(i, { ...a, dueMinutes: Number(e.target.value) })} aria-label={t('Muddat')}>
                    {[15, 30, 60, 120, 240, 1440, 2880, 10080].map((m) => (
                      <option key={m} value={m}>
                        {t('Muddat: {v}', { v: kechikishMatni(m, t) })}
                      </option>
                    ))}
                  </select>
                </>
              )}
              {a.type === 'responsible' && (
                <>
                  <select className="input ci-tor" value={a.mode} onChange={(e) => amalniOzgartir(i, { ...a, mode: e.target.value as 'roundrobin' | 'seat' })} aria-label={t('Usul')}>
                    <option value="roundrobin">{t('Navbat bilan')}</option>
                    <option value="seat">{t('Aniq xodim')}</option>
                  </select>
                  {a.mode === 'seat' ? (
                    <select className="input ci-tor" value={a.seatId ?? ''} onChange={(e) => amalniOzgartir(i, { ...a, seatId: e.target.value || null })} aria-label={t('Xodim')}>
                      <option value="">{t('Xodimni tanlang')}</option>
                      {seatlar.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="ci-kopli">
                      {seatlar.map((s) => {
                        const bor = (a.seatIds ?? []).includes(s.id);
                        return (
                          <button
                            type="button"
                            key={s.id}
                            className={`ci-chip${bor ? ' faol' : ''}`}
                            aria-pressed={bor}
                            onClick={() => amalniOzgartir(i, { ...a, seatIds: bor ? (a.seatIds ?? []).filter((x) => x !== s.id) : [...(a.seatIds ?? []), s.id] })}
                          >
                            {s.displayName}
                          </button>
                        );
                      })}
                      <span className="yordam">{t('Hech kim tanlanmasa — umumiy taqsimot ro‘yxati')}</span>
                    </div>
                  )}
                </>
              )}
              {a.type === 'move' && (
                <select className="input" value={a.stageId} onChange={(e) => amalniOzgartir(i, { ...a, stageId: e.target.value })} aria-label={t('Bosqich')}>
                  <option value="">{t('Bosqichni tanlang')}</option>
                  {holat.pipelines.map((p) => (
                    <optgroup key={p.id} label={p.name}>
                      {p.stages
                        .filter((s) => s.id !== stageId)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              )}
              {a.type === 'copy' && (
                <select className="input" value={a.stageId} onChange={(e) => amalniOzgartir(i, { ...a, stageId: e.target.value })} aria-label={t('Nusxa bosqichi')}>
                  <option value="">{t('Voronka va bosqichni tanlang')}</option>
                  {holat.pipelines
                    .filter((p) => !p.stages.some((s) => s.id === stageId))
                    .map((p) => (
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
              {a.type === 'tag' && <input className="input" value={a.tag} maxLength={50} onChange={(e) => amalniOzgartir(i, { ...a, tag: e.target.value })} placeholder={t('Teg')} aria-label={t('Teg')} />}
              {a.type === 'note' && <input className="input" value={a.text} maxLength={2000} onChange={(e) => amalniOzgartir(i, { ...a, text: e.target.value })} placeholder={t('Izoh matni')} aria-label={t('Izoh matni')} />}
              <button type="button" className="vr-amal" disabled={amallar.length === 1} onClick={() => setAmallar((s) => s.filter((_, j) => j !== i))} aria-label={t("O'chirish")}>
                <Trash2 />
              </button>
            </li>
          ))}
        </ol>
        {amallar.length < 10 && (
          <button type="button" className="btn ikkinchi kichik" onClick={() => setAmallar((s) => [...s, { type: 'tag', tag: '' }])}>
            <Plus /> {t('Amal')}
          </button>
        )}
      </div>
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}

// ─── Veb-formalar (FORM-*) ───────────────────────────────────────────────────

interface FormaMaydoni {
  key: string;
  label: string;
  type: 'text' | 'phone' | 'email' | 'textarea' | 'select' | 'number' | 'date' | 'checkbox';
  required: boolean;
  target: string;
  options?: string[];
}

interface Forma {
  id: string;
  slug: string;
  name: string;
  title: string;
  description: string | null;
  fields: FormaMaydoni[];
  pipelineId: string | null;
  source: string | null;
  tags: string[];
  thankYou: string | null;
  autoAccept: boolean;
  active: boolean;
  submissions: number;
}

export function FormalarSozlama() {
  const { base } = useCrm();
  const t = useT();
  const [formalar, setFormalar] = useState<Forma[] | null>(null);
  const [tahrir, setTahrir] = useState<Forma | 'yangi' | null>(null);
  const [kod, setKod] = useState<Forma | null>(null);

  const yukla = useCallback(async () => {
    const r = await api.get<{ items: Forma[] }>(`${base}/crm-app/forms`).catch(() => null);
    if (r) setFormalar(r.items);
  }, [base]);
  useEffect(() => {
    void yukla();
  }, [yukla]);

  const manzil = (f: Forma) => `${window.location.origin}/f/${f.slug}`;
  return (
    <section className="card ci-blok">
      <div className="ci-blok-bosh">
        <h2>{t('Veb-formalar')}</h2>
        <button className="btn kichik" onClick={() => setTahrir('yangi')}>
          <Plus /> {t('Forma')}
        </button>
      </div>
      <p className="yordam">{t("Saytingizga yoki ijtimoiy tarmoqqa havola — to'ldirilgan forma «Saralanmagan»ga tushadi (yoki darhol bitim bo'ladi).")}</p>
      {formalar?.length === 0 && <p className="yordam">{t("Hali forma yo'q")}</p>}
      <ul className="ci-royxat">
        {(formalar ?? []).map((f) => (
          <li key={f.id} className={`ci-royxat-band${f.active ? '' : ' arxiv'}`}>
            <span>
              <b>{f.name}</b>
              <small>
                {f.title} · {t('{n} ta yuborilgan', { n: f.submissions })}
              </small>
            </span>
            <span className="ci-qator-amallar">
              <a className="vr-amal" href={manzil(f)} target="_blank" rel="noopener noreferrer" aria-label={t('Ochish')} title={t('Ochish')}>
                <ExternalLink />
              </a>
              <button className="vr-amal" onClick={() => setKod(f)} aria-label={t('Havola va kod')} title={t('Havola va kod')}>
                <Code2 />
              </button>
              <button className="vr-amal" onClick={() => setTahrir(f)} aria-label={t('Tahrirlash')}>
                <Pencil />
              </button>
              <button
                className="vr-amal"
                onClick={async () => {
                  if (!confirm(t('Forma o‘chirilsinmi? Havola ishlamay qoladi.'))) return;
                  await api.del(`${base}/crm-app/forms/${f.id}`).catch(() => undefined);
                  await yukla();
                }}
                aria-label={t("O'chirish")}
              >
                <Trash2 />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {tahrir && <FormaOyna f={tahrir === 'yangi' ? null : tahrir} onYop={() => setTahrir(null)} onSaqlandi={() => (setTahrir(null), void yukla())} />}
      {kod && (
        <Oyna sarlavha={t('Havola va saytga joylash')} onYop={() => setKod(null)} past={<button type="button" className="btn" onClick={() => setKod(null)}>{t('Yopish')}</button>}>
          <KodQatori nom={t('Havola')} qiymat={manzil(kod)} />
          <KodQatori nom={t('Saytga joylash (iframe)')} qiymat={`<iframe src="${manzil(kod)}" width="100%" height="640" style="border:0" title="${kod.title.replace(/"/g, '&quot;')}"></iframe>`} />
        </Oyna>
      )}
    </section>
  );
}

function KodQatori({ nom, qiymat }: { nom: string; qiymat: string }) {
  const t = useT();
  const [nusxa, setNusxa] = useState(false);
  return (
    <div className="maydon-blok">
      <label>{nom}</label>
      <div className="ci-qator-kiritish">
        <input className="input ci-kod" readOnly value={qiymat} onFocus={(e) => e.target.select()} aria-label={nom} />
        <button
          type="button"
          className="btn ikkinchi kichik"
          onClick={() => {
            void navigator.clipboard?.writeText(qiymat);
            setNusxa(true);
            setTimeout(() => setNusxa(false), 1500);
          }}
        >
          <Copy /> {nusxa ? t('Nusxalandi') : t('Nusxalash')}
        </button>
      </div>
    </div>
  );
}

const FORMA_TURLARI: { k: FormaMaydoni['type']; nom: string }[] = [
  { k: 'text', nom: 'Matn' },
  { k: 'phone', nom: 'Telefon' },
  { k: 'email', nom: 'Email' },
  { k: 'textarea', nom: 'Uzun matn' },
  { k: 'select', nom: "Ro'yxat (bitta)" },
  { k: 'number', nom: 'Raqam' },
  { k: 'date', nom: 'Sana' },
  { k: 'checkbox', nom: 'Belgi (ha/yo‘q)' },
];

function FormaOyna({ f, onYop, onSaqlandi }: { f: Forma | null; onYop: () => void; onSaqlandi: () => void }) {
  const { holat, base } = useCrm();
  const t = useT();
  const [d, setD] = useState({
    name: f?.name ?? '',
    title: f?.title ?? '',
    description: f?.description ?? '',
    pipelineId: f?.pipelineId ?? '',
    source: f?.source ?? '',
    thankYou: f?.thankYou ?? '',
    autoAccept: f?.autoAccept ?? false,
    active: f?.active ?? true,
  });
  const [maydonlar, setMaydonlar] = useState<FormaMaydoni[]>(
    f?.fields ?? [
      { key: 'ism', label: 'Ismingiz', type: 'text', required: true, target: 'name' },
      { key: 'telefon', label: 'Telefon raqamingiz', type: 'phone', required: true, target: 'phone' },
    ],
  );
  const [xato, setXato] = useState<string | null>(null);

  const maqsadlar = [
    { k: 'name', nom: 'Kontakt ismi' },
    { k: 'phone', nom: 'Kontakt telefoni' },
    { k: 'email', nom: 'Kontakt emaili' },
    { k: 'company', nom: 'Kompaniya' },
    { k: 'message', nom: 'Xabar (izoh)' },
    ...holat.fields.map((m) => ({ k: `field:${m.id}`, nom: `${t('Bitim')}: ${m.label}` })),
    { k: 'none', nom: 'Faqat murojaat matnida' },
  ];
  const ozgartir = (i: number, o: Partial<FormaMaydoni>) => setMaydonlar((s) => s.map((x, j) => (j === i ? { ...x, ...o } : x)));
  const siljit = (i: number, n: -1 | 1) =>
    setMaydonlar((s) => {
      const a = [...s];
      const j = i + n;
      if (j < 0 || j >= a.length) return s;
      [a[i], a[j]] = [a[j]!, a[i]!];
      return a;
    });

  const saqla = async () => {
    setXato(null);
    const body = {
      ...d,
      description: d.description.trim() || null,
      pipelineId: d.pipelineId || null,
      source: d.source.trim() || null,
      thankYou: d.thankYou.trim() || null,
      fields: maydonlar.map((m, i) => ({ ...m, key: m.key || `m${i + 1}`, options: m.type === 'select' ? (m.options ?? []).filter(Boolean) : undefined })),
    };
    try {
      if (f) await api.patch(`${base}/crm-app/forms/${f.id}`, body);
      else await api.post(`${base}/crm-app/forms`, body);
      onSaqlandi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  return (
    <Oyna
      keng
      sarlavha={f ? t('Formani tahrirlash') : t('Yangi forma')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn">
            {t('Saqlash')}
          </button>
        </>
      }
    >
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="fo-nom">{t('Ichki nomi')}</label>
          <input id="fo-nom" className="input" value={d.name} maxLength={100} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder={t('Masalan: Sayt — kursga yozilish')} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="fo-sar">{t('Sarlavha (mijozga ko‘rinadi)')}</label>
          <input id="fo-sar" className="input" value={d.title} maxLength={200} onChange={(e) => setD({ ...d, title: e.target.value })} />
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="fo-tav">{t('Tavsif (ixtiyoriy)')}</label>
        <textarea id="fo-tav" rows={2} maxLength={1000} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </div>
      <div className="maydon-blok">
        <label>{t('Maydonlar')}</label>
        <ol className="ci-forma-maydonlar">
          {maydonlar.map((m, i) => (
            <li key={i}>
              <input className="input" value={m.label} maxLength={120} onChange={(e) => ozgartir(i, { label: e.target.value, key: m.key || e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 40) })} placeholder={t('Savol')} aria-label={t('Savol')} />
              <select className="input ci-tor" value={m.type} onChange={(e) => ozgartir(i, { type: e.target.value as FormaMaydoni['type'] })} aria-label={t('Turi')}>
                {FORMA_TURLARI.map((x) => (
                  <option key={x.k} value={x.k}>
                    {t(x.nom)}
                  </option>
                ))}
              </select>
              <select className="input ci-tor" value={m.target} onChange={(e) => ozgartir(i, { target: e.target.value })} aria-label={t('Qayerga yoziladi')}>
                {maqsadlar.map((x) => (
                  <option key={x.k} value={x.k}>
                    {t(x.nom)}
                  </option>
                ))}
              </select>
              <label className="ci-belgi">
                <input type="checkbox" checked={m.required} onChange={(e) => ozgartir(i, { required: e.target.checked })} />
                <span>{t('Majburiy')}</span>
              </label>
              <span className="ci-qator-amallar">
                <button type="button" className="vr-amal" disabled={i === 0} onClick={() => siljit(i, -1)} aria-label={t('Yuqoriga')}>
                  <ArrowUp />
                </button>
                <button type="button" className="vr-amal" disabled={i === maydonlar.length - 1} onClick={() => siljit(i, 1)} aria-label={t('Pastga')}>
                  <ArrowDown />
                </button>
                <button type="button" className="vr-amal" onClick={() => setMaydonlar((s) => s.filter((_, j) => j !== i))} aria-label={t("O'chirish")}>
                  <Trash2 />
                </button>
              </span>
              {m.type === 'select' && (
                <input
                  className="input ci-keng-maydon"
                  value={(m.options ?? []).join(', ')}
                  onChange={(e) => ozgartir(i, { options: e.target.value.split(',').map((x) => x.trim()) })}
                  placeholder={t('Variantlar vergul bilan: Frontend, Backend')}
                  aria-label={t('Variantlar')}
                />
              )}
            </li>
          ))}
        </ol>
        <button type="button" className="btn ikkinchi kichik" onClick={() => setMaydonlar((s) => [...s, { key: '', label: '', type: 'text', required: false, target: 'message' }])}>
          <Plus /> {t('Maydon')}
        </button>
      </div>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="fo-voronka">{t('Voronka')}</label>
          <select id="fo-voronka" className="input" value={d.pipelineId} onChange={(e) => setD({ ...d, pipelineId: e.target.value })}>
            <option value="">{t('Asosiy voronka')}</option>
            {holat.pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="maydon-blok">
          <label htmlFor="fo-manba">{t('Manba nomi')}</label>
          <input id="fo-manba" className="input" value={d.source} maxLength={100} onChange={(e) => setD({ ...d, source: e.target.value })} placeholder={t('Masalan: Sayt')} />
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="fo-rahmat">{t('Yuborilgandan keyingi matn')}</label>
        <input id="fo-rahmat" className="input" value={d.thankYou} maxLength={500} onChange={(e) => setD({ ...d, thankYou: e.target.value })} placeholder={t('Rahmat! Tez orada bog‘lanamiz.')} />
      </div>
      <div className="ci-kopli">
        <label className="ci-belgi">
          <input type="checkbox" checked={d.autoAccept} onChange={(e) => setD({ ...d, autoAccept: e.target.checked })} />
          <span>{t('Saralamasdan darhol bitim yaratish')}</span>
        </label>
        <label className="ci-belgi">
          <input type="checkbox" checked={d.active} onChange={(e) => setD({ ...d, active: e.target.checked })} />
          <span>{t('Faol (yangi murojaat qabul qiladi)')}</span>
        </label>
      </div>
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}

// ─── Tovarlar (CUST-02) ──────────────────────────────────────────────────────

interface Tovar {
  id: string;
  name: string;
  sku: string | null;
  price: number;
  description: string | null;
  archived: boolean;
  sold: number;
}

export function TovarlarSozlama() {
  const { base } = useCrm();
  const t = useT();
  const [royxat, setRoyxat] = useState<Tovar[] | null>(null);
  const [tahrir, setTahrir] = useState<Tovar | 'yangi' | null>(null);
  const yukla = useCallback(async () => {
    const r = await api.get<{ items: Tovar[] }>(`${base}/crm-app/products?all=1&limit=200`).catch(() => null);
    if (r) setRoyxat(r.items);
  }, [base]);
  useEffect(() => {
    void yukla();
  }, [yukla]);
  return (
    <section className="card ci-blok">
      <div className="ci-blok-bosh">
        <h2>{t('Tovar va xizmatlar katalogi')}</h2>
        <button className="btn kichik" onClick={() => setTahrir('yangi')}>
          <Plus /> {t('Tovar')}
        </button>
      </div>
      <p className="yordam">{t('Bitimga qo‘shilganda narx o‘sha paytdagisi saqlanadi — katalogda narx o‘zgarsa eski bitimlar o‘zgarmaydi.')}</p>
      {royxat?.length === 0 && <p className="yordam">{t("Hali tovar yo'q")}</p>}
      {royxat && royxat.length > 0 && (
        <table className="jadval">
          <thead>
            <tr>
              <th>{t('Nomi')}</th>
              <th>{t('Artikul')}</th>
              <th className="ci-ong">{t('Narx')}</th>
              <th className="ci-ong">{t('Sotilgan')}</th>
              <th aria-label={t('Amallar')} />
            </tr>
          </thead>
          <tbody>
            {royxat.map((p) => (
              <tr key={p.id} className={p.archived ? 'arxiv' : ''}>
                <td>{p.name}</td>
                <td className="yordam">{p.sku ?? '—'}</td>
                <td className="ci-ong ci-raqam">{pul(p.price)}</td>
                <td className="ci-ong ci-raqam">{p.sold}</td>
                <td className="ci-ong">
                  <button className="vr-amal" onClick={() => setTahrir(p)} aria-label={t('Tahrirlash')}>
                    <Pencil />
                  </button>
                  <button
                    className="vr-amal"
                    onClick={async () => {
                      await api.patch(`${base}/crm-app/products/${p.id}`, { archived: !p.archived }).catch(() => undefined);
                      await yukla();
                    }}
                    aria-label={p.archived ? t('Qaytarish') : t('Arxivlash')}
                  >
                    {p.archived ? <RotateCcw /> : <Archive />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {tahrir && <TovarOyna p={tahrir === 'yangi' ? null : tahrir} onYop={() => setTahrir(null)} onSaqlandi={() => (setTahrir(null), void yukla())} />}
    </section>
  );
}

function TovarOyna({ p, onYop, onSaqlandi }: { p: Tovar | null; onYop: () => void; onSaqlandi: () => void }) {
  const { base } = useCrm();
  const t = useT();
  const [d, setD] = useState({ name: p?.name ?? '', sku: p?.sku ?? '', price: p ? String(p.price) : '', description: p?.description ?? '' });
  const [xato, setXato] = useState<string | null>(null);
  const saqla = async () => {
    const body = { name: d.name.trim(), sku: d.sku.trim() || null, price: Number(d.price.replace(/\s/g, '') || 0), description: d.description.trim() || null };
    try {
      if (p) await api.patch(`${base}/crm-app/products/${p.id}`, body);
      else await api.post(`${base}/crm-app/products`, body);
      onSaqlandi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };
  return (
    <Oyna
      sarlavha={p ? t('Tovarni tahrirlash') : t('Yangi tovar')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn">
            {t('Saqlash')}
          </button>
        </>
      }
    >
      <div className="maydon-blok">
        <label htmlFor="tv-nom">{t('Nomi')}</label>
        <input id="tv-nom" className="input" value={d.name} maxLength={200} onChange={(e) => setD({ ...d, name: e.target.value })} />
      </div>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="tv-narx">{t('Narx')}</label>
          <input id="tv-narx" className="input" inputMode="numeric" value={d.price} onChange={(e) => setD({ ...d, price: e.target.value.replace(/[^\d\s]/g, '') })} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="tv-sku">{t('Artikul (ixtiyoriy)')}</label>
          <input id="tv-sku" className="input" value={d.sku} maxLength={60} onChange={(e) => setD({ ...d, sku: e.target.value })} />
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="tv-tav">{t('Tavsif (ixtiyoriy)')}</label>
        <textarea id="tv-tav" rows={2} maxLength={2000} value={d.description} onChange={(e) => setD({ ...d, description: e.target.value })} />
      </div>
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}

// ─── Teglar (LEAD-11) ────────────────────────────────────────────────────────

export function TeglarSozlama() {
  const { base } = useCrm();
  const t = useT();
  const [teglar, setTeglar] = useState<{ tag: string; count: number }[] | null>(null);
  const { setX, el } = useXabar();
  const yukla = useCallback(async () => {
    const r = await api.get<{ items: { tag: string; count: number }[] }>(`${base}/crm-app/tags`).catch(() => null);
    if (r) setTeglar(r.items);
  }, [base]);
  useEffect(() => {
    void yukla();
  }, [yukla]);

  const ozgartir = async (eski: string, yangi: string | null) => {
    try {
      const r = await api.post<{ updated: number }>(`${base}/crm-app/tags/rename`, { from: eski, to: yangi });
      setX({ ok: true, matn: t('{n} ta bitim yangilandi', { n: r.updated }) });
      await yukla();
    } catch (e) {
      setX({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
    }
  };

  return (
    <section className="card ci-blok">
      <h2>{t('Teglar')}</h2>
      <p className="yordam">{t('Teg bitim kartochkasida yoki ommaviy amal bilan qo‘shiladi. Bu yerda — qayta nomlash va o‘chirish (barcha bitimlarda).')}</p>
      {teglar?.length === 0 && <p className="yordam">{t("Hali teg yo'q")}</p>}
      <ul className="ci-royxat">
        {(teglar ?? []).map((x) => (
          <li key={x.tag} className="ci-royxat-band">
            <span>
              <span className="ci-teg">{x.tag}</span> <small className="yordam">{t('{n} ta bitimda', { n: x.count })}</small>
            </span>
            <span className="ci-qator-amallar">
              <button
                className="vr-amal"
                onClick={() => {
                  const yangi = prompt(t('Yangi nom'), x.tag);
                  if (yangi?.trim() && yangi.trim() !== x.tag) void ozgartir(x.tag, yangi.trim());
                }}
                aria-label={t('Qayta nomlash')}
              >
                <Pencil />
              </button>
              <button className="vr-amal" onClick={() => confirm(t('«{n}» tegi barcha bitimlardan olib tashlansinmi?', { n: x.tag })) && void ozgartir(x.tag, null)} aria-label={t("O'chirish")}>
                <Trash2 />
              </button>
            </span>
          </li>
        ))}
      </ul>
      {el}
    </section>
  );
}
