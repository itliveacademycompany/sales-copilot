import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtSana, type SeatRow, type TaskAnalytics, type TaskRow } from '../api';
import { useAuth } from '../auth';

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
  const [view, setView] = useState('');
  const [statusFiltr, setStatusFiltr] = useState('');
  const [seatFiltr, setSeatFiltr] = useState('');
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [stats, setStats] = useState<TaskAnalytics | null>(null);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [seatId, setSeatId] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [loading, setLoading] = useState(true);

  const base = business ? `/api/v1/businesses/${business.businessId}` : '';

  const load = useCallback(() => {
    if (!base) return;
    setLoading(true);
    const p = new URLSearchParams();
    if (view) p.set('view', view);
    if (statusFiltr) p.set('status', statusFiltr);
    if (seatFiltr) p.set('seatId', seatFiltr);
    void Promise.all([
      api.get<{ tasks: TaskRow[] }>(`${base}/tasks?${p}`),
      api.get<TaskAnalytics>(`${base}/tasks/analytics`),
    ])
      .then(([t, a]) => {
        setRows(t.tasks);
        setStats(a);
      })
      .finally(() => setLoading(false));
  }, [base, view, statusFiltr, seatFiltr]);

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
          <h1>Vazifalar</h1>
          <div className="izoh">AI suhbatlardagi va'dalardan avtomatik yaratadi</div>
        </div>
        <button className="btn" onClick={() => setShowForm((v) => !v)}>
          + Yangi vazifa
        </button>
      </div>

      {stats && (
        <div className="kpi-grid">
          <div className="card kpi">
            <div className="nom">Ochiq</div>
            <div className="qiymat">{stats.pending + stats.inProgress}</div>
          </div>
          <div className="card kpi">
            <div className="nom">Kechikkan</div>
            <div className="qiymat" style={{ color: stats.overdue > 0 ? 'var(--qizil)' : undefined }}>
              {stats.overdue}
            </div>
          </div>
          <div className="card kpi">
            <div className="nom">Bajarilish</div>
            <div className="qiymat">
              {stats.completionRatePct === null ? '—' : `${stats.completionRatePct}%`}
            </div>
          </div>
          <div className="card kpi">
            <div className="nom">AI yaratgan</div>
            <div className="qiymat">{stats.fromAi}</div>
          </div>
        </div>
      )}

      {showForm && (
        <form className="card" style={{ marginBottom: 14 }} onSubmit={(e) => void create(e)}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
            <div>
              <label className="maydon">Vazifa</label>
              <input
                className="input"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                minLength={3}
                placeholder="Masalan: Mijozga taklif yuborish"
              />
            </div>
            <div>
              <label className="maydon">Sotuvchi</label>
              <select className="input" value={seatId} onChange={(e) => setSeatId(e.target.value)}>
                <option value="">— tanlanmagan —</option>
                {seats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="maydon">Muddat</label>
              <input
                className="input"
                type="datetime-local"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
              />
            </div>
            <button className="btn">Saqlash</button>
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
              {k.nom}
            </button>
          ))}
        </div>
        <div className="filtr-panel" style={{ marginBottom: 0 }}>
          <select value={statusFiltr} onChange={(e) => setStatusFiltr(e.target.value)}>
            <option value="">Holat: barchasi</option>
            {(Object.keys(HOLAT_NOMI) as TaskRow['status'][]).map((h) => (
              <option key={h} value={h}>
                {HOLAT_NOMI[h]}
              </option>
            ))}
          </select>
          {seats.length > 1 && (
            <select value={seatFiltr} onChange={(e) => setSeatFiltr(e.target.value)}>
              <option value="">Sotuvchi: barchasi</option>
              {seats.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          )}
          {(statusFiltr || seatFiltr) && (
            <button
              className="btn ikkinchi kichik"
              onClick={() => {
                setStatusFiltr('');
                setSeatFiltr('');
              }}
            >
              Filtrlarni tozalash
            </button>
          )}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="yuklanmoqda">Yuklanmoqda…</div>
        ) : rows.length === 0 ? (
          <div className="hech-narsa">
            <div className="katta-ikon">☑</div>
            Bu ko'rinishda vazifa yo'q
          </div>
        ) : (
          <table className="jadval">
            <thead>
              <tr>
                <th>Vazifa</th>
                <th>Sotuvchi</th>
                <th>Muddat</th>
                <th>Manba</th>
                <th>Holat</th>
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
                          style={{ fontSize: 12, color: 'var(--toq-dark)', fontWeight: 500 }}
                        >
                          suhbatni ko'rish →
                        </Link>
                      )}
                    </td>
                    <td>{seat?.displayName ?? '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      {t.isOverdue && (
                        <span className="badge qizil" style={{ marginRight: 6 }}>
                          kechikkan
                        </span>
                      )}
                      {fmtSana(t.dueAt)}
                    </td>
                    <td>
                      <span className={`badge ${t.source === 'manual' ? 'navy' : 'toq'}`}>
                        {t.source === 'manual' ? 'qo\'lda' : 'AI'}
                      </span>
                    </td>
                    <td>
                      <select
                        className="input"
                        style={{ width: 'auto', padding: '5px 8px', fontSize: 13 }}
                        value={t.status}
                        onChange={(e) => void setStatus(t.id, e.target.value as TaskRow['status'])}
                      >
                        {(Object.keys(HOLAT_NOMI) as TaskRow['status'][]).map((h) => (
                          <option key={h} value={h}>
                            {HOLAT_NOMI[h]}
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
