import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  ballKlass,
  fmtPul,
  fmtSana,
  type LidRoyxat,
  type LidStatus,
} from '../api';
import { useAuth } from '../auth';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID XULOSALARI — ro'yxat
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Analitika umumiy suratni beradi, bu ekran esa har bir lidni alohida
 * ko'rsatadi: qaysi menejerda, nega to'xtab qolgan va qaytarish
 * imkoniyati qanday. Rahbar shu yerdan aniq lidga kirib boradi.
 */

export const HOLAT_NOMI: Record<LidStatus, string> = {
  bitimli: 'Summa kelishilgan',
  faol: 'Faol',
  sovimoqda: 'Sovimoqda',
  sovigan: 'Sovib qolgan',
};

export const HOLAT_SINF: Record<LidStatus, string> = {
  bitimli: 'ok',
  faol: 'navy',
  sovimoqda: 'sariq',
  sovigan: 'qizil',
};

const IMKONIYAT_NOMI = { yuqori: 'Yuqori', ortacha: "O'rtacha", past: 'Past' } as const;
const IMKONIYAT_SINF = { yuqori: 'ok', ortacha: 'sariq', past: 'qizil' } as const;

export function Leads() {
  const { business } = useAuth();
  const [data, setData] = useState<LidRoyxat | null>(null);
  const [loading, setLoading] = useState(true);
  const [xato, setXato] = useState<string | null>(null);

  const [sort, setSort] = useState<'sana' | 'imkoniyat'>('sana');
  const [holat, setHolat] = useState<LidStatus | ''>('');
  const [seatId, setSeatId] = useState('');
  const [sabab, setSabab] = useState('');
  const [kunlar, setKunlar] = useState(90);
  const [yuklanmoqdaYana, setYuklanmoqdaYana] = useState(false);

  const yukla = useCallback(
    (offset: number) => {
      if (!business) return;
      const from = new Date(Date.now() - kunlar * 86400_000).toISOString();
      const p = new URLSearchParams({ from, sort });
      if (holat) p.set('holat', holat);
      if (seatId) p.set('seatId', seatId);
      if (sabab) p.set('sabab', sabab);
      if (offset > 0) p.set('offset', String(offset));

      const qoshib = offset > 0;
      if (qoshib) setYuklanmoqdaYana(true);
      else setLoading(true);
      setXato(null);
      void api
        .get<LidRoyxat>(`/api/v1/businesses/${business.businessId}/leads?${p}`)
        .then((r) =>
          setData((prev) => (qoshib && prev ? { ...r, leads: [...prev.leads, ...r.leads] } : r)),
        )
        .catch((e) => setXato(e instanceof Error ? e.message : 'Yuklab bo\'lmadi'))
        .finally(() => {
          setLoading(false);
          setYuklanmoqdaYana(false);
        });
    },
    [business, sort, holat, seatId, sabab, kunlar],
  );

  // Filtr o'zgarsa — ro'yxat boshidan (offset 0).
  useEffect(() => yukla(0), [yukla]);

  const tozala = () => {
    setHolat('');
    setSeatId('');
    setSabab('');
    setKunlar(90);
    setSort('sana');
  };
  const filtrBor = holat !== '' || seatId !== '' || sabab !== '' || kunlar !== 90;

  if (loading && !data) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>Lid xulosalari</h1>
          <div className="izoh">Har bir lidning butun tarixi asosida tahlil</div>
        </div>
      </div>

      {/*
        Holat ta'rifi ochiq yozilgan: bu CRM natijasi emas, faollik
        bo'yicha xulosa. Aks holda "sovib qolgan" ni "yo'qotilgan bitim"
        deb o'qish mumkin edi.
      */}
      {data && (
        <div className="etiroz-holat open" style={{ marginBottom: 12 }}>
          ℹ️ Holat <b>faollik</b> bo'yicha aniqlanadi: oxirgi aloqadan{' '}
          {data.thresholds.activeDays} kungacha — faol, {data.thresholds.lostDays} kundan ko'p —
          sovib qolgan. «Summa kelishilgan» — suhbatda aniq raqam aytilgan lidlar.
        </div>
      )}

      {/* ─── Filtrlar ─── */}
      <div className="filtr-panel">
        <div className="tab-qator">
          <button
            className={`tab ${sort === 'sana' ? 'active' : ''}`}
            onClick={() => setSort('sana')}
          >
            Sana bo'yicha
          </button>
          <button
            className={`tab ${sort === 'imkoniyat' ? 'active' : ''}`}
            onClick={() => setSort('imkoniyat')}
          >
            Imkoniyat bo'yicha
          </button>
        </div>

        <select value={holat} onChange={(e) => setHolat(e.target.value as LidStatus | '')}>
          <option value="">Holat: barchasi</option>
          {data?.filters.statuses.map((h) => (
            <option key={h} value={h}>
              {HOLAT_NOMI[h]}
            </option>
          ))}
        </select>

        <select value={sabab} onChange={(e) => setSabab(e.target.value)}>
          <option value="">Sabab: barchasi</option>
          {data?.filters.reasons.map((r) => (
            <option key={r.key} value={r.key}>
              {r.key} ({r.count})
            </option>
          ))}
        </select>

        <select value={seatId} onChange={(e) => setSeatId(e.target.value)}>
          <option value="">Menejer: barchasi</option>
          {data?.filters.seats.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select value={kunlar} onChange={(e) => setKunlar(Number(e.target.value))}>
          <option value={30}>Oxirgi 30 kun</option>
          <option value={90}>Oxirgi 90 kun</option>
          <option value={180}>Oxirgi 6 oy</option>
          <option value={365}>Oxirgi yil</option>
        </select>

        {filtrBor && (
          <button className="btn ikkinchi kichik" onClick={tozala}>
            Filtrlarni tozalash
          </button>
        )}
      </div>

      {xato && <div className="xato-qator">{xato}</div>}
      {loading && <div className="ok-qator">Yangilanmoqda…</div>}

      <div className="card">
        <div className="karta-bosh">
          <h2>{data?.total ?? 0} ta lid</h2>
          {data && data.leads.length < data.total && (
            <span className="diag-ost">
              {data.leads.length} / {data.total} ko'rsatilmoqda
            </span>
          )}
        </div>

        {!data || data.leads.length === 0 ? (
          <div className="hech-narsa">
            Tanlangan filtr bo'yicha lid topilmadi.
            {filtrBor && (
              <div style={{ marginTop: 8 }}>
                <button className="btn ikkinchi kichik" onClick={tozala}>
                  Filtrlarni tozalash
                </button>
              </div>
            )}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="jadval">
              <thead>
                <tr>
                  <th>Sana</th>
                  <th>Menejer</th>
                  <th>Holat</th>
                  <th>Nega to'xtadi</th>
                  <th>Zaif bosqich</th>
                  <th>Qaytish imkoniyati</th>
                  <th>Ball</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.leads.map((l) => (
                  <tr key={l.contactId} className="bosiladigan">
                    <td>
                      <div className="sana-katak">
                        <b>{fmtSana(l.lastAt)}</b>
                        <span>{Math.round(l.daysSince)} kun oldin</span>
                      </div>
                    </td>
                    <td>
                      {l.seatName ? (
                        <span className="menejer-katak">
                          <span className="avatar-kichik">
                            {l.seatName.slice(0, 1).toUpperCase()}
                          </span>
                          {l.seatName}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>biriktirilmagan</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${HOLAT_SINF[l.holat]}`}>
                        {HOLAT_NOMI[l.holat]}
                      </span>
                    </td>
                    <td className="qisqa-matn" title={l.reason ?? undefined}>
                      {l.reason ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td className="qisqa-matn" title={l.stage ?? undefined}>
                      {l.stage ?? <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td>
                      <span className="imkoniyat-katak">
                        <span className={`badge ${IMKONIYAT_SINF[l.winBackLevel]}`}>
                          {IMKONIYAT_NOMI[l.winBackLevel]}
                        </span>
                        <span className="oyna">{l.reconnectWindow}</span>
                      </span>
                    </td>
                    <td>
                      <span className={`ball ${ballKlass(l.overallScore)}`}>
                        {l.overallScore === null ? '—' : `${Math.round(l.overallScore)}%`}
                      </span>
                      {l.dealAmount !== null && (
                        <div style={{ fontSize: 11, color: 'var(--yuqori)', marginTop: 2 }}>
                          {fmtPul(l.dealAmount)}
                        </div>
                      )}
                    </td>
                    <td>
                      <Link to={`/lidlar/${l.contactId}`} className="btn ikkinchi kichik">
                        Ochish
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {data?.hasMore && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button
            className="btn ikkinchi"
            disabled={yuklanmoqdaYana}
            onClick={() => yukla(data.leads.length)}
          >
            {yuklanmoqdaYana ? 'Yuklanmoqda…' : 'Yana yuklash'}
          </button>
        </div>
      )}
    </>
  );
}
