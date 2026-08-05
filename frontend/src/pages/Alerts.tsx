import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtSana, type AlertRow } from '../api';
import { useAuth } from '../auth';

const TUR: Record<string, { ikon: string; nom: string }> = {
  red_flag: { ikon: '🚩', nom: 'Qizil bayroq' },
  missed_lead: { ikon: '📵', nom: 'Javobsiz mijoz' },
  broken_commitment: { ikon: '⏰', nom: 'Buzilgan va\'da' },
  low_confidence: { ikon: '🔍', nom: 'Inson ko\'rigi' },
  quality_drop: { ikon: '📉', nom: 'Sifat pasayishi' },
  sync_error: { ikon: '⚠️', nom: 'Sinxron xatosi' },
};

const FILTRLAR = [
  { key: '', nom: 'Faol' },
  { key: 'resolved', nom: 'Hal qilingan' },
] as const;

export function Alerts() {
  const { business } = useAuth();
  const [filter, setFilter] = useState('');
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const canResolve = business?.permissions.includes('alert:resolve') ?? false;

  const load = useCallback(() => {
    if (!base) return;
    setLoading(true);
    void api
      .get<{ alerts: AlertRow[] }>(`${base}/alerts?limit=100`)
      .then((r) =>
        setRows(
          filter === 'resolved'
            ? r.alerts.filter((a) => a.status === 'resolved')
            : r.alerts.filter((a) => a.status !== 'resolved'),
        ),
      )
      .finally(() => setLoading(false));
  }, [base, filter]);

  useEffect(load, [load]);

  async function setStatus(id: string, status: 'seen' | 'resolved') {
    await api.patch(`${base}/alerts/${id}`, { status });
    load();
  }

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>Ogohlantirishlar</h1>
          <div className="izoh">Darhol e'tibor talab qiladigan hodisalar</div>
        </div>
        <div className="tab-qator">
          {FILTRLAR.map((f) => (
            <button
              key={f.key}
              className={`tab${filter === f.key ? ' active' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.nom}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="yuklanmoqda">Yuklanmoqda…</div>
        ) : rows.length === 0 ? (
          <div className="hech-narsa">
            <div className="katta-ikon">✓</div>
            {filter === 'resolved' ? 'Hal qilingan ogohlantirish yo\'q' : 'Hammasi joyida — faol ogohlantirish yo\'q'}
          </div>
        ) : (
          rows.map((a) => {
            const t = TUR[a.kind] ?? { ikon: '•', nom: a.kind };
            return (
              <div className={`ogoh-satr ${a.severity}${a.status === 'resolved' ? ' resolved' : ''}`} key={a.id}>
                <div className="belgi">{t.ikon}</div>
                <div className="matn">
                  <div>
                    <b>{a.title}</b>{' '}
                    {a.status === 'new' && <span className="badge qizil">yangi</span>}
                  </div>
                  <div className="sana">
                    {t.nom} · {fmtSana(a.createdAt)}
                    {a.conversationId && (
                      <>
                        {' · '}
                        <Link to={`/suhbatlar/${a.conversationId}`} style={{ color: 'var(--toq-dark)', fontWeight: 500 }}>
                          suhbatni ko'rish →
                        </Link>
                      </>
                    )}
                  </div>
                </div>
                {canResolve && a.status !== 'resolved' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {a.status === 'new' && (
                      <button className="btn ikkinchi kichik" onClick={() => void setStatus(a.id, 'seen')}>
                        Ko'rildi
                      </button>
                    )}
                    <button className="btn kichik" onClick={() => void setStatus(a.id, 'resolved')}>
                      Hal qilindi
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
