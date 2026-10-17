import { ArrowDown, ArrowUp, ArrowUpRight, ChevronLeft, ChevronRight, CircleCheck, Flag, Target } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  api,
  ballKlass,
  ballRang,
  fmtSana,
  fmtSoniya,
  type ConversationRow,
  type SeatDashboard,
  type TaskRow,
} from '../api';
import { useAuth } from '../auth';
import { useT } from '../i18n';

/**
 * SOTUVCHI KABINETI — TZ 3.6, FR-112.
 *
 * TZ dagi izoh: *"Sotuvchi uchun tizim 'nazorat vositasi' emas, 'o'sish
 * vositasi' bo'lishi kerak"*. Bu ekran ataylab shu tamoyilga qurilgan.
 *
 * Shundan kelib chiqib sahifa **ayblov bilan emas, taqqoslash bilan**
 * qurilgan: har mezonda sotuvchining o'z bali yonida jamoa o'rtachasi
 * turadi. Yolg'iz "2.1 ball" hech narsa demaydi — jamoa 2.8 da ekanini
 * ko'rgandagina u harakatga aylanadi.
 *
 * Bitta sahifa ikki xil kirishga xizmat qiladi:
 *   - sotuvchi o'zi kiradi  → bosh sahifasi shu (`/`)
 *   - rahbar reytingdan bosadi → `/sotuvchi/:seatId`
 *
 * Ruxsat chegarasi serverda (`scope.ts`): sotuvchi begona `seatId` so'rasa
 * 404 oladi. Bu yerdagi hech narsa xavfsizlik chegarasi emas.
 */

const DAVRLAR = [
  { key: '7', nom: '7 kun' },
  { key: '30', nom: '30 kun' },
  { key: '90', nom: '90 kun' },
] as const;

export function SeatCabinet() {
  const { business } = useAuth();
  const navigate = useNavigate();
  const tr = useT();
  const params = useParams<{ seatId?: string }>();

  // URL da seatId bo'lmasa — foydalanuvchining o'z kabineti.
  const seatId = params.seatId ?? business?.seatId ?? null;
  const oziniki = seatId !== null && seatId === business?.seatId;

  const [days, setDays] = useState('30');
  const [d, setD] = useState<SeatDashboard | null>(null);
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [convs, setConvs] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    if (!business || !seatId) return;
    const biz = `/api/v1/businesses/${business.businessId}`;
    const from = new Date(Date.now() - Number(days) * 86400_000).toISOString();
    const q = `?from=${encodeURIComponent(from)}`;
    setLoading(true);
    setXato(null);
    void Promise.all([
      api.get<SeatDashboard>(`${biz}/dashboard/seats/${seatId}${q}`),
      api
        .get<{ tasks: TaskRow[] }>(`${biz}/tasks?seatId=${seatId}&limit=50`)
        .catch(() => ({ tasks: [] as TaskRow[] })),
      api
        .get<{ conversations: ConversationRow[] }>(`${biz}/conversations?seatId=${seatId}`)
        .catch(() => ({ conversations: [] as ConversationRow[] })),
    ])
      .then(([dash, t, c]) => {
        setD(dash);
        setTasks(t.tasks.filter((x) => x.status !== 'done' && x.status !== 'cancelled'));
        setConvs(c.conversations.filter((r) => r.status !== 'filtered').slice(0, 8));
      })
      .catch((e: unknown) => setXato(e instanceof Error ? e.message : tr("Yuklab bo'lmadi")))
      .finally(() => setLoading(false));
  }, [business, seatId, days]);

  if (!seatId) {
    return (
      <div className="card">
        <div className="hech-narsa">
          {tr("Sizning hisobingiz sotuvchi o'rniga bog'lanmagan — kabinet ko'rsatib bo'lmaydi.")}
        </div>
      </div>
    );
  }
  if (loading && !d) return <div className="yuklanmoqda">{tr('Yuklanmoqda…')}</div>;
  if (xato) return <div className="card"><div className="hech-narsa">{xato}</div></div>;

  const c = d?.current;
  const p = d?.previous;

  const delta = (cur: number | null, prev: number | null, teskari = false) => {
    if (cur === null || prev === null || prev === 0) return null;
    const diff = cur - prev;
    if (Math.abs(diff) < 0.05) return <span className="delta flat">{tr("o'zgarmadi")}</span>;
    const yaxshi = teskari ? diff < 0 : diff > 0;
    return (
      <span className={`delta ${yaxshi ? 'up' : 'down'}`}>
        {diff > 0 ? <ArrowUp /> : <ArrowDown />} {Math.abs(Math.round(diff * 10) / 10)}
      </span>
    );
  };

  const kechikkan = tasks.filter((t) => t.isOverdue).length;

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          {!oziniki && (
            <Link to="/" style={{ color: 'var(--kul-dark)', fontSize: 13 }}>
              <ChevronLeft /> {tr('Dashboard')}
            </Link>
          )}
          <h1>{oziniki ? tr('Mening kabinetim') : (d?.seat.displayName ?? tr('Sotuvchi'))}</h1>
          <div className="izoh">
            {oziniki
              ? tr("O'sishingiz, kuchli va zaif tomonlaringiz")
              : tr("{nom} — shaxsiy ko'rsatkichlar", { nom: d?.seat.displayName ?? '' })}
          </div>
        </div>
        <div className="tab-qator">
          {DAVRLAR.map((x) => (
            <button
              key={x.key}
              className={`tab${days === x.key ? ' active' : ''}`}
              onClick={() => setDays(x.key)}
            >
              {tr(x.nom)}
            </button>
          ))}
        </div>
      </div>

      <div className="card kpi-chiziq">
        <div className="katak">
          <div className="nom">{tr('Suhbatlar')}</div>
          <div className="qiymat">{c?.conversations ?? 0}</div>
          <div className="ost">{tr('{n} tahlil qilindi', { n: c?.analyzed ?? 0 })}</div>
        </div>
        <div className="katak">
          <div className="nom">{tr("O'rtacha ball")}</div>
          <div className="qiymat" style={{ color: ballRang(c?.avgScore ?? null) }}>
            {c?.avgScore === null || c?.avgScore === undefined ? '—' : `${c.avgScore}%`}
          </div>
          <div className="ost">{delta(c?.avgScore ?? null, p?.avgScore ?? null) ?? tr('oldingi davrga nisbatan')}</div>
        </div>
        <div className="katak">
          <div className="nom">{tr('Javob tezligi')}</div>
          <div className="qiymat">{fmtSoniya(c?.medianFirstResponseSeconds)}</div>
          <div className="ost">
            {delta(c?.medianFirstResponseSeconds ?? null, p?.medianFirstResponseSeconds ?? null, true) ?? tr('median')}
          </div>
        </div>
        <div className="katak">
          <div className="nom">{tr('Ochiq vazifa')}</div>
          <div className="qiymat" style={{ color: kechikkan > 0 ? 'var(--past)' : undefined }}>
            {tasks.length}
          </div>
          <div className="ost">{kechikkan > 0 ? tr('{n} tasi kechikkan', { n: kechikkan }) : tr("kechikkani yo'q")}</div>
        </div>
        <div className="katak">
          <div className="nom">{tr('Bayroqlangan')}</div>
          <div className="qiymat" style={{ color: (c?.flagged ?? 0) > 0 ? 'var(--orta)' : undefined }}>
            {c?.flagged ?? 0}
          </div>
          <div className="ost">{tr("ko'rik talab qiladi")}</div>
        </div>
      </div>

      {d?.weakestCriterion && (
        <div
          className="card"
          style={{
            marginBottom: 14,
            borderLeft: '4px solid var(--orta)',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{ fontSize: 24, color: 'var(--orta)', display: 'flex' }}>
            <Target />
          </div>
          <div>
            <b>
              {oziniki
                ? tr('Sizning eng zaif joyingiz: {nom}', { nom: d.weakestCriterion.name })
                : tr('Eng zaif joyi: {nom}', { nom: d.weakestCriterion.name })}
            </b>{' '}
            {tr("({kod}) — o'rtacha {ball}/3, {n} ta suhbatda baholangan.", {
              kod: d.weakestCriterion.code,
              ball: String(d.weakestCriterion.avgScore),
              n: d.weakestCriterion.scored,
            })}{' '}
            {oziniki
              ? tr("Keyingi hafta faqat shu bosqichga e'tibor bering.")
              : tr('Kouchingni shu bosqichdan boshlang.')}
          </div>
        </div>
      )}

      {/* ─── Men va jamoa: kabinetning yuragi ─── */}
      <div className="card">
        <div className="karta-bosh">
          <h2>
            {oziniki
              ? tr('Mezonlar — siz va jamoa')
              : tr('Mezonlar — {nom} va jamoa', { nom: d?.seat.displayName ?? tr('sotuvchi') })}
          </h2>
        </div>
        {(d?.criteria.length ?? 0) === 0 ? (
          <div className="hech-narsa">{tr("Bu davrda baholangan suhbat yo'q")}</div>
        ) : (
          <table className="jadval">
            <thead>
              <tr>
                <th>{tr('Mezon')}</th>
                <th>{oziniki ? tr('Siz') : (d?.seat.displayName ?? tr('Sotuvchi'))}</th>
                <th>{tr('Jamoa')}</th>
                <th>{tr('Farq')}</th>
                <th>{tr('Baholandi')}</th>
              </tr>
            </thead>
            <tbody>
              {d?.criteria.map((m) => {
                const meniki = m.myAvg;
                const jamoa = m.teamAvg;
                const farq = meniki !== null && jamoa !== null ? meniki - jamoa : null;
                const foiz = meniki === null ? null : (meniki / m.maxScore) * 100;
                return (
                  <tr key={m.code}>
                    <td>
                      <span className="kod">{m.code}</span> {m.name}
                    </td>
                    <td>
                      <span className={`ball ${ballKlass(foiz)}`}>
                        {meniki === null ? '—' : `${meniki}/${m.maxScore}`}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {jamoa === null ? '—' : `${jamoa}/${m.maxScore}`}
                    </td>
                    <td>
                      {farq === null ? (
                        '—'
                      ) : Math.abs(farq) < 0.05 ? (
                        <span className="delta flat">{tr('teng')}</span>
                      ) : (
                        <span className={`delta ${farq > 0 ? 'up' : 'down'}`}>
                          {farq > 0 ? <ArrowUp /> : <ArrowDown />} {Math.abs(Math.round(farq * 100) / 100)}
                        </span>
                      )}
                    </td>
                    <td style={{ color: 'var(--text-secondary)' }}>
                      {m.myScored}
                      {m.myUnknown > 0 && ` ${tr('(+{n} aniqlanmadi)', { n: m.myUnknown })}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
          {tr(`"Jamoa" ustuni — shu davrda boshqa sotuvchilarning o'rtachasi. "Aniqlanmadi" ballari o'rtachaga qo'shilmaydi.`)}
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="karta-bosh">
            <h2>{tr('Ochiq vazifalar')}</h2>
            <Link to="/vazifalar" className="havola">
              {tr('Hammasi')} <ChevronRight />
            </Link>
          </div>
          {tasks.length === 0 ? (
            <div className="hech-narsa">
              <div className="katta-ikon"><CircleCheck /></div>
              {tr("Ochiq vazifa yo'q")}
            </div>
          ) : (
            tasks.slice(0, 8).map((t) => (
              <div className={`ogoh-mini ${t.isOverdue ? 'critical' : 'info'}`} key={t.id}>
                <div className="matn">
                  <div className="sarlavha">{t.title}</div>
                  <div className="sana">
                    {t.dueAt ? fmtSana(t.dueAt) : tr('muddatsiz')}
                    {t.isOverdue && ` · ${tr('kechikkan')}`}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="card">
          <div className="karta-bosh">
            <h2>{tr("So'nggi suhbatlar")}</h2>
          </div>
          {convs.length === 0 ? (
            <div className="hech-narsa">{tr("Bu davrda suhbat yo'q")}</div>
          ) : (
            convs.map((r) => {
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
                      {r.isFlagged && (
                        <span className="badge qizil">
                          <Flag /> {tr('bayroq')}
                        </span>
                      )}
                      <span className="vaqt">· {tr('{n} xabar', { n: r.segmentCount })}</span>
                    </div>
                    <div className="xulosa">{r.summary ?? tr("Xulosa yo'q")}</div>
                    {r.primaryGap && (
                      <div className="zaif">
                        <span className="belgi"><ArrowUpRight /></span>
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
      </div>
    </>
  );
}
