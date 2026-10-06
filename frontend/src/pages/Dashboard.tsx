import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  api,
  ballKlass,
  ballRang,
  fmtKun,
  fmtSana,
  fmtSoniya,
  type AlertRow,
  type ConversationRow,
  type CriterionAgg,
  type Kpi,
  type LeaderboardRow,
  type TrendPoint,
} from '../api';
import { useAuth } from '../auth';
import { Ikon } from '../icons';

/**
 * Rahbar dashboard'i — TZ 8.1 #1: "Ma'lumot birinchi. Rahbar 30 soniyada
 * holatni tushunishi kerak."
 *
 * Kompozitsiya ataylab tanlangan: har metrikani katta bo'sh kartaga qo'yish
 * o'rniga KPI bitta zich chiziqqa yig'iladi va bo'shagan joy HARAKAT talab
 * qiladigan narsaga beriladi — ogohlantirishlar va real
 * suhbatlar. Feedda har suhbatning zaif joyi ham ko'rsatiladi (primaryGap):
 * rahbar nima tuzatish kerakligini ro'yxatdan chiqmasdan biladi.
 */

const DAVRLAR = [
  { key: '7', nom: '7 kun' },
  { key: '30', nom: '30 kun' },
  { key: '90', nom: '90 kun' },
] as const;

const KANAL: Record<string, string> = {
  telegram: 'Telegram',
  phone: 'Telefon',
  meeting: 'Uchrashuv',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};

const LID_KLASS: Record<string, string> = { hot: 'qizil', warm: 'sariq', cold: 'navy' };
const LID_NOM: Record<string, string> = { hot: 'issiq lid', warm: 'iliq lid', cold: 'sovuq lid' };

export function Dashboard() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const [days, setDays] = useState('7');
  const [kpi, setKpi] = useState<{ current: Kpi; previous: Kpi } | null>(null);
  const [board, setBoard] = useState<LeaderboardRow[]>([]);
  const [criteria, setCriteria] = useState<CriterionAgg[]>([]);
  const [weakest, setWeakest] = useState<CriterionAgg | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [oxirgi, setOxirgi] = useState<ConversationRow[]>([]);
  const [ogohlar, setOgohlar] = useState<AlertRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business) return;
    const biz = `/api/v1/businesses/${business.businessId}`;
    const base = `${biz}/dashboard`;
    const from = new Date(Date.now() - Number(days) * 86400_000).toISOString();
    const q = `?from=${encodeURIComponent(from)}`;
    setLoading(true);
    void Promise.all([
      api.get<{ current: Kpi; previous: Kpi }>(`${base}/kpi${q}`),
      api.get<{ leaderboard: LeaderboardRow[] }>(`${base}/leaderboard${q}`),
      api.get<{ criteria: CriterionAgg[]; weakest: CriterionAgg | null }>(`${base}/criteria${q}`),
      api.get<{ points: TrendPoint[] }>(`${base}/trend${q}`),
      api.get<{ conversations: ConversationRow[] }>(`${biz}/conversations`).catch(() => ({
        conversations: [] as ConversationRow[],
      })),
      api.get<{ alerts: AlertRow[] }>(`${biz}/alerts?limit=20`).catch(() => ({
        alerts: [] as AlertRow[],
      })),
    ])
      .then(([k, l, c, t, s, o]) => {
        setKpi(k);
        setBoard(l.leaderboard);
        setCriteria(c.criteria);
        setWeakest(c.weakest);
        setTrend(t.points);
        setOxirgi(s.conversations.filter((r) => r.status !== 'filtered').slice(0, 6));
        setOgohlar(o.alerts.filter((a) => a.status !== 'resolved').slice(0, 4));
      })
      .finally(() => setLoading(false));
  }, [business, days]);

  if (loading && !kpi) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  const c = kpi?.current;
  const p = kpi?.previous;

  const delta = (cur: number | null, prev: number | null, teskari = false) => {
    if (cur === null || prev === null || prev === 0) return null;
    const d = cur - prev;
    if (Math.abs(d) < 0.05) return <span className="delta flat">o'zgarmadi</span>;
    const yaxshi = teskari ? d < 0 : d > 0;
    return (
      <span className={`delta ${yaxshi ? 'up' : 'down'}`}>
        {d > 0 ? '▲' : '▼'} {Math.abs(Math.round(d * 10) / 10)}
      </span>
    );
  };

  const maxTrend = Math.max(1, ...trend.map((t) => t.conversations));
  const zaifMezon = criteria.filter((m) => (m.avgPct ?? 100) < 60).length;

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>Dashboard</h1>
          <div className="izoh">Jamoa holati bir qarashda</div>
        </div>
        <div className="tab-qator">
          {DAVRLAR.map((d) => (
            <button
              key={d.key}
              className={`tab${days === d.key ? ' active' : ''}`}
              onClick={() => setDays(d.key)}
            >
              {d.nom}
            </button>
          ))}
        </div>
      </div>

      {/* ─── KPI: bitta zich chiziq, oltita metrika ─── */}
      <div className="card kpi-chiziq">
        <div className="katak">
          <div className="nom">Suhbatlar</div>
          <div className="qiymat">{c?.conversations ?? 0}</div>
          <div className="ost">
            {c?.analyzed ?? 0} tahlil qilindi
            {(c?.filtered ?? 0) > 0 && ` · ${c?.filtered} filtrlandi`}
          </div>
        </div>
        <div className="katak">
          <div className="nom">O'rtacha ball</div>
          <div className="qiymat" style={{ color: ballRang(c?.avgScore ?? null) }}>
            {c?.avgScore === null || c?.avgScore === undefined ? '—' : `${c.avgScore}%`}
          </div>
          <div className="ost">{delta(c?.avgScore ?? null, p?.avgScore ?? null) ?? '—'}</div>
        </div>
        <div className="katak">
          <div className="nom">Javob tezligi</div>
          <div className="qiymat">{fmtSoniya(c?.medianFirstResponseSeconds)}</div>
          <div className="ost">
            {delta(c?.medianFirstResponseSeconds ?? null, p?.medianFirstResponseSeconds ?? null, true) ?? 'median'}
          </div>
        </div>
        <div className="katak">
          <div className="nom">Javob kutmoqda</div>
          <div
            className="qiymat"
            style={{ color: (c?.unansweredSessions ?? 0) > 0 ? 'var(--past)' : undefined }}
          >
            {c?.unansweredSessions ?? 0}
          </div>
          <div className="ost">{(c?.unansweredSessions ?? 0) > 0 ? 'javobsiz sessiya' : 'hammasi javoblangan'}</div>
        </div>
        <div className="katak">
          <div className="nom">Bayroqlangan</div>
          <div className="qiymat" style={{ color: (c?.flagged ?? 0) > 0 ? 'var(--orta)' : undefined }}>
            {c?.flagged ?? 0}
          </div>
          <div className="ost">{zaifMezon > 0 ? `${zaifMezon} ta zaif mezon` : 'zaif mezon yo\'q'}</div>
        </div>
        <div className="katak">
          <div className="nom">AI xarajat</div>
          <div className="qiymat">
            {c?.aiCostUsd === null || c?.aiCostUsd === undefined ? '—' : `$${c.aiCostUsd.toFixed(2)}`}
          </div>
          <div className="ost">shu davr uchun</div>
        </div>
      </div>

      {weakest && (
        <div
          className="banner-diqqat"
          /* Kouching xulosasi — bu xato emas, o'sish imkoniyati.
             Shuning uchun "xavf" qizili emas, "e'tibor" sarig'i. */
        >
          <Ikon nom="ogohlantirish" />
          <div>
            <b>Jamoaning eng zaif joyi: {weakest.name}</b> ({weakest.code}) — o'rtacha{' '}
            {weakest.avgScore}/3. Shu bosqichni birgalikda mashq qilish eng katta o'sish beradi.
          </div>
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <div className="karta-bosh">
            <h2>Mezonlar bo'yicha jamoa</h2>
          </div>
          {criteria.length === 0 ? (
            <div className="hech-narsa">Hali baholangan suhbat yo'q</div>
          ) : (
            criteria.map((m) => (
              <div className="mezon-satr" key={m.code}>
                <span className="kod">{m.code}</span>
                <span className="nom">{m.name}</span>
                <div className="chiziq">
                  <div style={{ width: `${m.avgPct ?? 0}%`, background: ballRang(m.avgPct) }} />
                </div>
                <span className="foiz">
                  {m.avgPct === null ? '—' : `${Math.round(m.avgPct)}%`}
                </span>
              </div>
            ))
          )}
          {criteria.some((m) => m.unknownCount > 0) && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
              "Aniqlanmadi" ballari foizga qo'shilmaydi — ular alohida sanaladi.
            </div>
          )}
        </div>

        <div className="card">
          <div className="karta-bosh">
            <h2>Ogohlantirishlar</h2>
            <Link to="/ogohlantirishlar" className="havola">
              Hammasi →
            </Link>
          </div>
          {ogohlar.length === 0 ? (
            <div className="hech-narsa">
              <div className="katta-ikon">✓</div>
              Faol ogohlantirish yo'q
            </div>
          ) : (
            ogohlar.map((o) => (
              <div className={`ogoh-mini ${o.severity}`} key={o.id}>
                <div className="matn">
                  <div className="sarlavha">{o.title}</div>
                  <div className="sana">{fmtSana(o.createdAt)}</div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── So'nggi tahlillar: raqamlardan real suhbatga o'tish nuqtasi ─── */}
      <div className="card" style={{ marginTop: 14 }}>
        <div className="karta-bosh">
          <h2>So'nggi tahlillar</h2>
          <Link to="/suhbatlar" className="havola">
            Hammasi →
          </Link>
        </div>
        {oxirgi.length === 0 ? (
          <div className="hech-narsa">Hali tahlil qilingan suhbat yo'q</div>
        ) : (
          oxirgi.map((r) => {
            const ball = r.overallScore === null ? null : Number(r.overallScore);
            return (
              <button
                type="button"
                className="feed-satr"
                key={r.id}
                onClick={() => navigate(`/suhbatlar/${r.id}`)}
              >
                <div className="chap">
                  <div className="bosh">
                    <span className="vaqt">{fmtSana(r.startedAt)}</span>
                    <span className="badge kul">{KANAL[r.channel] ?? r.channel}</span>
                    {r.leadQuality && (
                      <span className={`badge ${LID_KLASS[r.leadQuality] ?? 'kul'}`}>
                        {LID_NOM[r.leadQuality] ?? r.leadQuality}
                      </span>
                    )}
                    {r.isFlagged && <span className="badge qizil">⚑ bayroq</span>}
                    <span className="vaqt">· {r.segmentCount} xabar</span>
                  </div>
                  <div className="xulosa">{r.summary ?? 'Xulosa yo\'q'}</div>
                  {r.primaryGap && (
                    <div className="zaif">
                      <span className="belgi">↗</span>
                      <span>{r.primaryGap}</span>
                    </div>
                  )}
                </div>
                <div className="ong">
                  <span className={`ball ${ballKlass(ball)}`}>
                    {ball === null ? '—' : `${Math.round(ball)}%`}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="karta-bosh">
            <h2>Sotuvchilar reytingi</h2>
          </div>
          {board.length === 0 ? (
            <div className="hech-narsa">Hali sotuvchi qo'shilmagan</div>
          ) : (
            <table className="jadval">
              <thead>
                <tr>
                  <th>Sotuvchi</th>
                  <th>Suhbat</th>
                  <th>Ball</th>
                  <th>Eng yaxshi</th>
                  <th>Javob</th>
                </tr>
              </thead>
              <tbody>
                {board.map((r, i) => (
                  // FR-112: reytingdan sotuvchining shaxsiy kabinetiga o'tish.
                  // Raqam ko'rgan rahbarning keyingi savoli doim "nega?" —
                  // javob shu bosishning narigi tomonida.
                  <tr
                    key={r.seatId}
                    className="bosiladigan"
                    onClick={() => navigate(`/sotuvchi/${r.seatId}`)}
                  >
                    <td>
                      <b>{i + 1}.</b>{' '}
                      {/* Havola — satr bosilishi sichqoncha uchun qulaylik,
                          klaviatura uchun esa haqiqiy fokuslanadigan element
                          kerak. */}
                      <Link to={`/sotuvchi/${r.seatId}`} className="havola">
                        {r.displayName}
                      </Link>
                      {r.flagged > 0 && (
                        <span className="badge qizil" style={{ marginLeft: 6 }}>
                          ⚑ {r.flagged}
                        </span>
                      )}
                    </td>
                    <td>{r.conversations}</td>
                    <td>
                      <span className={`ball ${ballKlass(r.avgScore)}`}>
                        {r.avgScore === null ? '—' : `${r.avgScore}%`}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {r.bestScore === null ? '—' : `${r.bestScore}%`}
                    </td>
                    <td>{fmtSoniya(r.medianFirstResponseSeconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="karta-bosh">
            <h2>Kunlik dinamika</h2>
          </div>
          {trend.length === 0 ? (
            <div className="hech-narsa">Bu davrda suhbat bo'lmagan</div>
          ) : (
            <div className="trend">
              {trend.map((t) => (
                <div
                  className="ustun-wrap"
                  key={t.bucket}
                  title={`${t.conversations} suhbat, o'rtacha ${t.avgScore ?? '—'}%`}
                >
                  <span className="son">{t.conversations}</span>
                  <div
                    className={`ustun${t.conversations > 0 ? ' bor' : ''}`}
                    style={{ height: `${(t.conversations / maxTrend) * 80}%` }}
                  />
                  <span className="sana">{fmtKun(t.bucket)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
