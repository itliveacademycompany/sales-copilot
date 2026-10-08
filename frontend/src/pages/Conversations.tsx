import { Flag, MessagesSquare } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ballKlass, fmtSana, type ConversationRow } from '../api';
import { SuhbatYuklash } from '../components/SuhbatYuklash';
import { useAuth } from '../auth';

const HOLATLAR: { key: string; nom: string }[] = [
  { key: '', nom: 'Hammasi' },
  { key: 'done', nom: 'Tahlil qilingan' },
  { key: 'received', nom: 'Kutilmoqda' },
  { key: 'queued', nom: 'Navbatda' },
  { key: 'failed', nom: 'Xato' },
  { key: 'filtered', nom: 'Filtrlangan' },
];

const HOLAT_BADGE: Record<string, { nom: string; klass: string }> = {
  received: { nom: 'Kutilmoqda', klass: 'kul' },
  queued: { nom: 'Navbatda', klass: 'navy' },
  analyzing: { nom: 'Tahlilda', klass: 'sariq' },
  done: { nom: 'Tayyor', klass: 'ok' },
  failed: { nom: 'Xato', klass: 'qizil' },
  filtered: { nom: 'Filtrlangan', klass: 'kul' },
};

export function Conversations() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [yangilash, setYangilash] = useState(0);

  // Yuklash huquqi qayta tahlil bilan bir xil: ikkalasi ham LLM pulini
  // sarflaydi, shuning uchun o'qish huquqi yetarli emas.
  const yuklayOladi = business?.permissions.includes('playbook:write') ?? false;

  useEffect(() => {
    if (!business) return;
    setLoading(true);
    const q = status ? `?status=${status}` : '';
    void api
      .get<{ conversations: ConversationRow[] }>(
        `/api/v1/businesses/${business.businessId}/conversations${q}`,
      )
      .then((r) => setRows(r.conversations))
      .finally(() => setLoading(false));
  }, [business, status, yangilash]);

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>Suhbatlar</h1>
          <div className="izoh">Yozishmalar — har biri isbotli baho bilan</div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div className="tab-qator">
            {HOLATLAR.map((h) => (
              <button
                key={h.key}
                className={`tab${status === h.key ? ' active' : ''}`}
                onClick={() => setStatus(h.key)}
              >
                {h.nom}
              </button>
            ))}
          </div>
        </div>
      </div>

      {yuklayOladi && business && (
        <SuhbatYuklash
          businessId={business.businessId}
          onYuklandi={(id) => {
            setYangilash((v) => v + 1);
            navigate(`/suhbatlar/${id}`);
          }}
        />
      )}

      <div className="card">
        {loading ? (
          <div className="yuklanmoqda">Yuklanmoqda…</div>
        ) : rows.length === 0 ? (
          <div className="hech-narsa">
            <div className="katta-ikon"><MessagesSquare /></div>
            Hali suhbat yo'q. Telegram botini ulang — yozishmalar avtomatik tushadi.
          </div>
        ) : (
          <table className="jadval">
            <thead>
              <tr>
                <th>Vaqt</th>
                <th>Xulosa</th>
                <th>Xabarlar</th>
                <th>Holat</th>
                <th>Ball</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const b = HOLAT_BADGE[r.status] ?? { nom: r.status, klass: 'kul' };
                const score = r.overallScore === null ? null : Number(r.overallScore);
                return (
                  <tr
                    key={r.id}
                    className="bosiladigan"
                    onClick={() => navigate(`/suhbatlar/${r.id}`)}
                  >
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtSana(r.startedAt)}</td>
                    <td style={{ maxWidth: 420 }}>
                      {r.isFlagged && (
                        <span className="badge qizil" style={{ marginRight: 6 }}>
                          <Flag /> ko'rik kerak
                        </span>
                      )}
                      {r.summary ?? (
                        <span style={{ color: 'var(--kul-dark)' }}>
                          {r.excludedReason ?? 'Hali tahlil qilinmagan'}
                        </span>
                      )}
                    </td>
                    <td>{r.segmentCount}</td>
                    <td>
                      <span className={`badge ${b.klass}`}>{b.nom}</span>
                    </td>
                    <td>
                      <span className={`ball ${ballKlass(score)}`}>
                        {score === null ? '—' : `${score}%`}
                      </span>
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
