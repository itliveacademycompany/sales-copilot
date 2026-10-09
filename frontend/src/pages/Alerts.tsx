import { AlarmClock, ArrowUpRight, Bell, CircleCheck, Flag, MessageSquareX, Scale, ScanSearch, TrendingDown, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, type AlertRow, type SeatRow } from '../api';
import { useAuth } from '../auth';
import { Ochiluvchi } from '../components/analitika/Ochiluvchi';
import { MalumotIkon } from '../components/bosh/Korsatkichlar';
import { avatarRang, boshHarf, qachon } from '../components/bosh/malumot';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OGOHLANTIRISHLAR — darhol e'tibor talab qiladigan hodisalar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Holatlar backend bilan bir xil: yangi → o'qilgan (seen) → yopilgan
 * (resolved). "Bekor qilish" — ogohlantirishni yopish: u ro'yxatdan
 * chiqadi, lekin "Bekor qilingan" tabida saqlanib qoladi.
 */

const TUR: Record<string, { ikon: ReactNode; nom: string }> = {
  red_flag: { ikon: <Flag />, nom: 'Qizil bayroq' },
  missed_lead: { ikon: <MessageSquareX />, nom: 'Javobsiz mijoz' },
  broken_commitment: { ikon: <AlarmClock />, nom: "Buzilgan va'da" },
  low_confidence: { ikon: <ScanSearch />, nom: "Inson ko'rigi kerak" },
  quality_drop: { ikon: <TrendingDown />, nom: 'Sifat pasayishi' },
  sync_error: { ikon: <TriangleAlert />, nom: 'Sinxronlash xatosi' },
  score_appeal: { ikon: <Scale />, nom: "Bahoga e'tiroz" },
};
const HOLAT_NOMI: Record<AlertRow['status'], string> = { new: 'Yangi', seen: "O'qilgan", resolved: 'Bekor qilingan' };
type Tab = 'hammasi' | AlertRow['status'];
const TABLAR: { k: Tab; nom: string }[] = [
  { k: 'hammasi', nom: 'Barchasi' },
  { k: 'new', nom: 'Yangi' },
  { k: 'seen', nom: "O'qilgan" },
  { k: 'resolved', nom: 'Bekor qilingan' },
];

/** Har tur uchun body'dan inson o'qiydigan izoh. */
function izohMatni(a: AlertRow): string | null {
  const b = a.body ?? {};
  const s = (k: string) => (typeof b[k] === 'string' && (b[k] as string).trim() ? (b[k] as string).trim() : null);
  switch (a.kind) {
    case 'missed_lead': {
      const n = Number(b.unansweredTurns);
      return n > 0 ? `Mijozning ${n} ta xabari javobsiz qolgan. Tezroq yozing — javobsiz lid tez soviydi.` : 'Mijoz xabariga javob berilmagan.';
    }
    case 'red_flag':
      return s('quote') ? `Suhbatdan: «${s('quote')}»` : null;
    case 'low_confidence':
      return s('reason') ? `Sabab: ${s('reason')}` : "AI natijasiga ishonchi past — suhbatni ko'rib chiqing.";
    case 'score_appeal':
      return s('reason') ? `Menejer izohi: «${s('reason')}»` : null;
    default:
      return s('message') ?? s('reason') ?? null;
  }
}

export function Alerts() {
  const { business } = useAuth();
  const [tab, setTab] = useState<Tab>('new');
  const [tur, setTur] = useState('');
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [yangiSoni, setYangiSoni] = useState(0);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [band, setBand] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);

  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const yopaOladi = business?.permissions.includes('alert:resolve') ?? false;

  const load = useCallback(() => {
    if (!base) return;
    setLoading(true);
    void api
      .get<{ alerts: AlertRow[]; unseenCount: number }>(`${base}/alerts?limit=200`)
      .then((r) => {
        // O'chirilgan turlar serverda umuman yaratilmaydi (Sozlamalar → Bildirishnomalar).
        setRows(r.alerts);
        setYangiSoni(r.unseenCount);
      })
      .catch(() => setXato("Ogohlantirishlarni yuklab bo'lmadi."))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base]);

  useEffect(load, [load]);
  useEffect(() => {
    if (!base) return;
    void api.get<SeatRow[]>(`${base}/seats`).then(setSeats).catch(() => undefined);
  }, [base]);

  const ism = useMemo(() => new Map(seats.map((s) => [s.id, s.displayName])), [seats]);
  const korinadi = rows.filter((a) => (tab === 'hammasi' || a.status === tab) && (!tur || a.kind === tur));
  const soni = (t: Tab) => rows.filter((a) => (t === 'hammasi' || a.status === t) && (!tur || a.kind === tur)).length;
  const turlar = [...new Set([...Object.keys(TUR), ...rows.map((a) => a.kind)])].map((k) => ({
    qiymat: k,
    nom: TUR[k]?.nom ?? k,
    soni: rows.filter((a) => a.kind === k && (tab === 'hammasi' || a.status === tab)).length,
  }));

  async function holat(a: AlertRow, status: 'seen' | 'resolved') {
    setBand(a.id);
    setXato(null);
    try {
      await api.patch(`${base}/alerts/${a.id}`, { status });
      // Qayta yuklamasdan joyida yangilaymiz
      setRows((r) => r.map((x) => (x.id === a.id ? { ...x, status } : x)));
      if (a.status === 'new') setYangiSoni((n) => Math.max(0, n - 1));
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : 'Saqlanmadi');
    } finally {
      setBand(null);
    }
  }

  return (
    <div className="og-sahifa">
      <div className="og-bosh">
        <h1>
          Ogohlantirishlar <MalumotIkon matn="Darhol e'tibor talab qiladigan hodisalar: javobsiz mijozlar, qizil bayroqlar, buzilgan va'dalar" />
        </h1>
        {yangiSoni > 0 && <span className="og-oqilmagan">{yangiSoni} o'qilmagan</span>}
      </div>

      <div className="og-filtrlar">
        <nav className="sd-tablar og-tablar" role="tablist" aria-label="Holat">
          {TABLAR.map((t) => (
            <button key={t.k} type="button" role="tab" aria-selected={tab === t.k} className={`sd-tab${tab === t.k ? ' faol' : ''}`} onClick={() => setTab(t.k)}>
              {t.nom} <small>{soni(t.k)}</small>
            </button>
          ))}
        </nav>
        <Ochiluvchi belgi="Tur" qiymat={tur} variantlar={turlar} onOzgar={setTur} hammasiNomi="Barcha turlar" kenglik={270} />
      </div>

      {xato && <div className="xato-qator">{xato}</div>}

      {loading ? (
        <div className="og-panjara" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="card skelet" style={{ height: 210 }} />
          ))}
        </div>
      ) : korinadi.length === 0 ? (
        <div className="card og-bosh-holat">
          <span className="og-bosh-ikon">{tab === 'new' || tab === 'hammasi' ? <CircleCheck /> : <Bell />}</span>
          <b>{tab === 'new' ? "Yangi ogohlantirish yo'q — hammasi joyida" : tab === 'seen' ? "O'qilgan ogohlantirish yo'q" : tab === 'resolved' ? "Bekor qilingan ogohlantirish yo'q" : "Ogohlantirish yo'q"}</b>
          {tur && <span>Tur filtri qo'yilgan — «Barcha turlar»ni tanlab ko'ring.</span>}
        </div>
      ) : (
        <div className="og-panjara">
          {korinadi.map((a) => {
            const t = TUR[a.kind] ?? { ikon: <Bell />, nom: a.kind };
            const izoh = izohMatni(a);
            const nom = a.seatId ? ism.get(a.seatId) ?? 'Menejer' : null;
            return (
              <article key={a.id} className={`og-karta ${a.severity}${a.status === 'resolved' ? ' yopiq' : ''}`}>
                <div className="og-karta-bosh">
                  <span className={`og-tur ${a.severity}`}>
                    {t.ikon} {t.nom}
                  </span>
                  <span className={`og-holat ${a.status}`}>{HOLAT_NOMI[a.status]}</span>
                  <time className="og-vaqt" dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString('uz')}>
                    {qachon(a.createdAt)}
                  </time>
                </div>
                <h2 className="og-sarlavha">{a.title}</h2>
                {izoh && <p className="og-izoh">{izoh}</p>}
                {(nom || a.conversationId) && (
                  <div className="og-kim">
                    {nom && (
                      <span className="sn-ism">
                        <span className="sn-avatar katta" style={{ background: avatarRang(a.seatId!) }}>
                          {boshHarf(nom)}
                        </span>
                        <b>{nom}</b>
                      </span>
                    )}
                    {a.conversationId && (
                      <Link to={`/suhbatlar/${a.conversationId}`} className="og-havola">
                        Suhbatni ko'rish <ArrowUpRight />
                      </Link>
                    )}
                  </div>
                )}
                {yopaOladi && a.status !== 'resolved' && (
                  <div className="og-amallar">
                    {a.status === 'new' && (
                      <button type="button" className="og-tugma" disabled={band === a.id} onClick={() => void holat(a, 'seen')}>
                        O'qilgan deb belgilash
                      </button>
                    )}
                    <button type="button" className="og-tugma" disabled={band === a.id} onClick={() => void holat(a, 'resolved')}>
                      Bekor qilish
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
