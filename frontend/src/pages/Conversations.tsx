import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ballKlass, fmtSana, type ConversationRow, type SeatRow } from '../api';
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
  const [seatId, setSeatId] = useState('');
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [yanaBor, setYanaBor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [yuklanmoqdaYana, setYuklanmoqdaYana] = useState(false);
  const [yangilash, setYangilash] = useState(0);

  const base = business ? `/api/v1/businesses/${business.businessId}` : '';

  // Yuklash huquqi qayta tahlil bilan bir xil: ikkalasi ham LLM pulini
  // sarflaydi, shuning uchun o'qish huquqi yetarli emas.
  const yuklayOladi = business?.permissions.includes('playbook:write') ?? false;

  const yukla = useCallback(
    (qoshib: boolean, oxirgiCursor: string | null) => {
      if (!base) return;
      if (qoshib) setYuklanmoqdaYana(true);
      else setLoading(true);

      const p = new URLSearchParams();
      if (status) p.set('status', status);
      if (seatId) p.set('seatId', seatId);
      if (qoshib && oxirgiCursor) p.set('before', oxirgiCursor);

      void api
        .get<{ conversations: ConversationRow[]; nextCursor: string | null }>(
          `${base}/conversations?${p}`,
        )
        .then((r) => {
          setRows((prev) => (qoshib ? [...prev, ...r.conversations] : r.conversations));
          setCursor(r.nextCursor);
          setYanaBor(r.nextCursor !== null);
        })
        .finally(() => {
          setLoading(false);
          setYuklanmoqdaYana(false);
        });
    },
    [base, status, seatId],
  );

  // Filtr o'zgarsa yoki yangi suhbat yuklansa — ro'yxat boshidan.
  useEffect(() => {
    yukla(false, null);
  }, [yukla, yangilash]);

  useEffect(() => {
    if (!base) return;
    void api
      .get<SeatRow[] | { seats: SeatRow[] }>(`${base}/seats`)
      .then((r) => setSeats(Array.isArray(r) ? r : r.seats))
      .catch(() => setSeats([]));
  }, [base]);

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
          {seats.length > 1 && (
            <div className="filtr-panel" style={{ marginBottom: 0 }}>
              <select value={seatId} onChange={(e) => setSeatId(e.target.value)}>
                <option value="">Sotuvchi: barchasi</option>
                {seats.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
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
            <div className="katta-ikon">💬</div>
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
                          ⚑ ko'rik kerak
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

      {yanaBor && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button
            className="btn ikkinchi"
            disabled={yuklanmoqdaYana}
            onClick={() => yukla(true, cursor)}
          >
            {yuklanmoqdaYana ? 'Yuklanmoqda…' : 'Yana yuklash'}
          </button>
        </div>
      )}
    </>
  );
}
