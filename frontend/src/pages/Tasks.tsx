import { ChevronRight, ListChecks } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtSana, type SeatRow, type TaskAnalytics, type TaskRow } from '../api';
import { YuklashXatosi } from '../components/YuklashXatosi';
import { useAuth } from '../auth';
import { useT } from '../i18n';

const KORINISHLAR = [
  { key: '', nom: 'Hammasi' },
  { key: 'today', nom: 'Bugun' },
  { key: 'overdue', nom: 'Kechikkan' },
] as const;

const HOLAT_NOMI: Record<TaskRow['status'], string> = {
  pending: 'Kutilmoqda',
  in_progress: 'Jarayonda',
  done: 'Bajarildi',
  cancelled: 'Bekor qilindi',
  blocked: 'To\'silgan',
};

export function Tasks() {
  const { business } = useAuth();
  const tr = useT();
  // Boshqa sahifadan "?view=overdue" bilan kelinsa — shu ko'rinish ochiladi
  const [view, setView] = useState(() => {
    const v = new URLSearchParams(window.location.search).get('view') ?? '';
    return KORINISHLAR.some((k) => k.key === v) ? v : '';
  });
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [stats, setStats] = useState<TaskAnalytics | null>(null);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [seatId, setSeatId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [loading, setLoading] = useState(true);
  const [xato, setXato] = useState<unknown>(null);

  const base = business ? `/api/v1/businesses/${business.businessId}` : '';

  const load = useCallback(() => {
    if (!base) return;
    setLoading(true);
    setXato(null);
    const q = view ? `?view=${view}` : '';
    void Promise.all([
      api.get<{ tasks: TaskRow[] }>(`${base}/tasks${q}`),
      api.get<TaskAnalytics>(`${base}/tasks/analytics`),
    ])
      .then(([t, a]) => {
        setRows(t.tasks);
        setStats(a);
      })
      .catch((e: unknown) => setXato(e))
      .finally(() => setLoading(false));
  }, [base, view]);

  useEffect(load, [load]);

  useEffect(() => {
    if (!base) return;
    void api
      .get<SeatRow[] | { seats: SeatRow[] }>(`${base}/seats`)
      .then((r) => setSeats(Array.isArray(r) ? r : r.seats))
      .catch(() => setSeats([]));
  }, [base]);

  async function setStatus(id: string, status: TaskRow['status']) {
    await api.patch(`${base}/tasks/${id}`, { status });
    load();
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    await api.post(`${base}/tasks`, {
      title,
      seatId: seatId || null,
      dueAt: dueAt ? new Date(dueAt).toISOString() : null,
    });
    setTitle('');
    setSeatId('');
    setDueAt('');
    setShowForm(false);
    load();
  }

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>{tr('Vazifalar')}</h1>
          <div className="izoh">{tr("AI suhbatlardagi va'dalardan avtomatik yaratadi")}</div>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          + {tr('Yangi vazifa')}
        </button>
      </div>

      {stats && (
        <div className="kpi-grid">
          <div className="card kpi">
            <div className="nom">{tr('Ochiq')}</div>
            <div className="qiymat">{stats.pending + stats.inProgress}</div>
          </div>
          <div className="card kpi">
            <div className="nom">{tr('Kechikkan')}</div>
            <div className="qiymat" style={{ color: stats.overdue > 0 ? 'var(--qizil)' : undefined }}>
              {stats.overdue}
            </div>
          </div>
          <div className="card kpi">
            <div className="nom">{tr('Bajarilish')}</div>
            <div className="qiymat">
              {stats.completionRatePct === null ? '—' : `${stats.completionRatePct}%`}
            </div>
          </div>
          <div className="card kpi">
            <div className="nom">{tr('AI yaratgan')}</div>
            <div className="qiymat">{stats.fromAi}</div>
          </div>
        </div>
      )}

      {showForm && (
        <form className="card" style={{ marginBottom: 14 }} onSubmit={(e) => void create(e)}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label className="maydon">{tr('Vazifa')}</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={3}
                placeholder={tr('Masalan: Mijozga taklif yuborish')}
              />
            </div>
            <div>
              <label className="maydon">{tr('Sotuvchi')}</label>
              <select className="input" value={seatId} onChange={(e) => setSeatId(e.target.value)}>
                <option value="">— {tr('tanlanmagan')} —</option>
                {seats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="maydon">{tr('Muddat')}</label>
              <input
                className="input"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
            <button className="btn">{tr('Saqlash')}</button>
          </div>
        </form>
      )}

      <div className="sahifa-bosh" style={{ marginBottom: 10 }}>
        <div className="tab-qator">
          {KORINISHLAR.map((k) => (
            <button
              key={k.key}
              className={`tab${view === k.key ? ' active' : ''}`}
              onClick={() => setView(k.key)}
            >
              {tr(k.nom)}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {xato ? (
          <YuklashXatosi xato={xato} onQayta={load} ichki />
        ) : loading ? (
          <div className="yuklanmoqda">{tr('Yuklanmoqda…')}</div>
        ) : rows.length === 0 ? (
          <div className="hech-narsa">
            <div className="katta-ikon"><ListChecks /></div>
            {tr("Bu ko'rinishda vazifa yo'q")}
          </div>
        ) : (
          <table className="jadval">
            <thead>
              <tr>
                <th>{tr('Vazifa')}</th>
                <th>{tr('Sotuvchi')}</th>
                <th>{tr('Muddat')}</th>
                <th>{tr('Manba')}</th>
                <th>{tr('Holat')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => {
                const seat = seats.find((s) => s.id === t.seatId);
                return (
                  <tr key={t.id} style={t.status === 'done' ? { opacity: 0.55 } : undefined}>
                    <td style={{ maxWidth: 380 }}>
                      <b>{t.title}</b>
                      {t.description && (
                        <div style={{ fontSize: 12, color: 'var(--kul-dark)' }}>{t.description}</div>
                      )}
                      {t.conversationId && (
                        <Link
                          to={`/suhbatlar/${t.conversationId}`}
                          style={{ fontSize: 12, color: 'var(--ia-text)', fontWeight: 500 }}
                        >
                          {tr("suhbatni ko'rish")} <ChevronRight />
                        </Link>
                      )}
                    </td>
                    <td>{seat?.displayName ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {t.isOverdue && (
                        <span className="badge qizil" style={{ marginRight: 6 }}>
                          {tr('kechikkan')}
                        </span>
                      )}
                      {fmtSana(t.dueAt)}
                    </td>
                    <td>
                      <span className={`badge ${t.source === 'manual' ? 'navy' : 'toq'}`}>
                        {t.source === 'manual' ? tr("qo'lda") : 'AI'}
                      </span>
                    </td>
                    <td>
                      <select
                        className="input"
                        style={{ width: 'auto', padding: '6px 32px 6px 11px', fontSize: 13 }}
                        value={t.status}
                        onChange={(e) => void setStatus(t.id, e.target.value as TaskRow['status'])}
                      >
                        {(Object.keys(HOLAT_NOMI) as TaskRow['status'][]).map((h) => (
                          <option key={h} value={h}>
                            {tr(HOLAT_NOMI[h])}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
