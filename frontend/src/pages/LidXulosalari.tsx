import { ArrowUpRight, ChevronRight, FileText, Flag, Flame, Snowflake, Thermometer } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ballKlass, fmtSana, lidTuri, type ConversationRow, type SeatRow } from '../api';
import { useAuth } from '../auth';

const KANAL: Record<string, string> = {
  telegram: 'Telegram',
  phone: 'Telefon',
  meeting: 'Uchrashuv',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};

const LID: Record<string, { nom: string; klass: string; ikon: ReactNode }> = {
  hot: { nom: 'Issiq', klass: 'qizil', ikon: <Flame /> },
  warm: { nom: 'Iliq', klass: 'sariq', ikon: <Thermometer /> },
  cold: { nom: 'Sovuq', klass: 'navy', ikon: <Snowflake /> },
};

const FILTRLAR = [
  { key: '', nom: 'Hammasi' },
  { key: 'hot', nom: 'Issiq' },
  { key: 'warm', nom: 'Iliq' },
  { key: 'cold', nom: 'Sovuq' },
] as const;

/**
 * Lid xulosalari — har bir tahlil qilingan suhbatdan mijoz haqida qisqa
 * xulosa: lid sifati, AI xulosasi, eng zaif joy va ball.
 *
 * Ma'lumot suhbatlar ro'yxatidan olinadi (alohida API kerak emas);
 * sotuvchi faqat o'z lidlarini ko'radi — cheklov serverda.
 */
export function LidXulosalari() {
  const { business } = useAuth();
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [seats, setSeats] = useState<Record<string, string>>({});
  const [filtr, setFiltr] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!business) return;
    const base = `/api/v1/businesses/${business.businessId}`;
    setLoading(true);
    void Promise.all([
      api.get<{ conversations: ConversationRow[] }>(`${base}/conversations?status=done&limit=100`),
      api.get<SeatRow[]>(`${base}/seats`).catch(() => [] as SeatRow[]),
    ])
      .then(([c, s]) => {
        setRows(c.conversations.filter((r) => r.summary));
        setSeats(Object.fromEntries(s.map((x) => [x.id, x.displayName])));
      })
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [business]);

  const soni = useMemo(() => {
    const m: Record<string, number> = { hot: 0, warm: 0, cold: 0 };
    for (const r of rows) {
      const t = lidTuri(r.leadQuality);
      if (t) m[t]! += 1;
    }
    return m;
  }, [rows]);

  const korinadi = filtr ? rows.filter((r) => lidTuri(r.leadQuality) === filtr) : rows;

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>Lid xulosalari</h1>
          <div className="izoh">Har bir mijoz bo'yicha AI xulosasi — kim issiq, kim kutmoqda</div>
        </div>
        <div className="tab-qator">
          {FILTRLAR.map((f) => (
            <button
              key={f.key}
              className={`tab${filtr === f.key ? ' active' : ''}`}
              onClick={() => setFiltr(f.key)}
            >
              {f.nom}
              {f.key && ` · ${soni[f.key] ?? 0}`}
            </button>
          ))}
        </div>
      </div>

      <div className="lid-statlar">
        {(['hot', 'warm', 'cold'] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`lid-stat ${k}${filtr === k ? ' tanlangan' : ''}`}
            onClick={() => setFiltr(filtr === k ? '' : k)}
            aria-pressed={filtr === k}
          >
            <span className="lid-stat-ikon">{LID[k]!.ikon}</span>
            <span>
              <span className="lid-stat-son">{soni[k]}</span>
              <span className="lid-stat-nom">{LID[k]!.nom} lid</span>
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <div className="yuklanmoqda">Yuklanmoqda…</div>
      ) : korinadi.length === 0 ? (
        <div className="card hech-narsa">
          <div className="katta-ikon">
            <FileText />
          </div>
          {rows.length === 0
            ? 'Hali tahlil qilingan suhbat yo\'q — xulosalar tahlildan keyin shu yerda paydo bo\'ladi'
            : 'Bu turdagi lid yo\'q'}
        </div>
      ) : (
        <div className="lid-grid">
          {korinadi.map((r) => {
            const tur = lidTuri(r.leadQuality);
            const lid = tur ? LID[tur] : undefined;
            const ball = r.overallScore === null ? null : Number(r.overallScore);
            return (
              <article className="card lid-karta" key={r.id}>
                <div className="lid-bosh">
                  {lid ? (
                    <span className={`badge ${lid.klass}`}>
                      {lid.ikon} {lid.nom} lid
                    </span>
                  ) : (
                    <span className="badge kul">Lid baholanmagan</span>
                  )}
                  {r.isFlagged && (
                    <span className="badge qizil">
                      <Flag /> ko'rik
                    </span>
                  )}
                  <span className={`ball ${ballKlass(ball)}`} style={{ marginLeft: 'auto' }}>
                    {ball === null ? '—' : `${Math.round(ball)}%`}
                  </span>
                </div>
                <p className="lid-xulosa">{r.summary}</p>
                {r.primaryGap && (
                  <div className="lid-zaif">
                    <ArrowUpRight /> <span>{r.primaryGap}</span>
                  </div>
                )}
                <div className="lid-pastki">
                  <span>
                    {fmtSana(r.startedAt)} · {KANAL[r.channel] ?? r.channel}
                    {r.seatId && seats[r.seatId] && ` · ${seats[r.seatId]}`}
                  </span>
                  <Link to={`/suhbatlar/${r.id}`} className="lid-havola">
                    Batafsil <ChevronRight />
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
