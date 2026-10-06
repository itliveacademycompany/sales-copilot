import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtQachon, fmtSana, type AlertRow } from '../api';
import { useAuth } from '../auth';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OGOHLANTIRISHLAR — darhol e'tibor talab qiladigan hodisalar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ro'yxat emas, KARTOCHKA: har ogohlantirishda sarlavhadan tashqari
 * tafsilot, menejer va harakat tugmasi bor — bir qatorga sig'maydi.
 *
 * Vaqt "3 kun oldin" ko'rinishida: rahbar uchun muhimi qachon bo'lgani
 * emas, qancha vaqt javobsiz turgani.
 */

const TUR: Record<string, { ikon: string; nom: string; izoh: string }> = {
  red_flag: {
    ikon: '🚩',
    nom: 'Qizil bayroq',
    izoh: 'Suhbatda jiddiy qoida buzilishi aniqlandi',
  },
  missed_lead: {
    ikon: '📵',
    nom: 'Javobsiz mijoz',
    izoh: 'Mijoz yozgan, lekin javob berilmagan',
  },
  broken_commitment: {
    ikon: '⏰',
    nom: 'Buzilgan va\'da',
    izoh: 'Suhbatda berilgan so\'z bajarilmagan',
  },
  low_confidence: {
    ikon: '🔍',
    nom: 'Inson ko\'rigi kerak',
    izoh: 'AI o\'z bahosiga ishonchi past — tekshiring',
  },
  quality_drop: {
    ikon: '📉',
    nom: 'Sifat pasayishi',
    izoh: 'Ko\'rsatkich sezilarli tushdi',
  },
  sync_error: {
    ikon: '⚠️',
    nom: 'Sinxron xatosi',
    izoh: 'Integratsiya ma\'lumot ololmadi',
  },
  score_appeal: {
    ikon: '✋',
    nom: 'Bahoga e\'tiroz',
    izoh: 'Sotuvchi qo\'yilgan ballga e\'tiroz bildirdi',
  },
};

const HOLATLAR = [
  { key: '', nom: 'Faol' },
  { key: 'resolved', nom: 'Hal qilingan' },
] as const;

/** Jiddiylik → chap chiziq rangi. */
const CHEGARA: Record<string, string> = {
  critical: 'var(--past)',
  warning: 'var(--orta)',
  info: 'var(--ia)',
};

const SAHIFA = 50;

export function Alerts() {
  const { business } = useAuth();
  const [holat, setHolat] = useState<string>('');
  const [tur, setTur] = useState<string>('');
  const [rows, setRows] = useState<AlertRow[]>([]);
  const [turlar, setTurlar] = useState<{ kind: string; count: number }[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [yanaBor, setYanaBor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [yuklanmoqdaYana, setYuklanmoqdaYana] = useState(false);
  const [band, setBand] = useState<string | null>(null);

  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const halQila = business?.permissions.includes('alert:resolve') ?? false;

  /**
   * `status` doim yuboriladi — "Faol" yorlig'i `active` (resolved BO'LMAGAN
   * hammasi) degani. Ilgari bu filtr faqat mijozda (JS'da) qo'llanardi va
   * server 100 tagacha aralash (yangi+ko'rilgan+hal qilingan) qatorni
   * qaytargani uchun 100 tadan ortiq ogohlantirish bo'lsa "Faol" yorlig'i
   * ba'zi yangi hodisalarni jimgina yashirib qo'yardi — bu tuzatildi.
   */
  const yukla = useCallback(
    (qoshib: boolean) => {
      if (!base) return;
      if (qoshib) setYuklanmoqdaYana(true);
      else setLoading(true);

      const p = new URLSearchParams({ limit: String(SAHIFA), status: holat === 'resolved' ? 'resolved' : 'active' });
      if (tur) p.set('kind', tur);
      if (qoshib && cursor) p.set('before', cursor);

      void api
        .get<{
          alerts: AlertRow[];
          byKind: { kind: string; count: number }[];
          nextCursor: string | null;
        }>(`${base}/alerts?${p}`)
        .then((r) => {
          setRows((prev) => (qoshib ? [...prev, ...r.alerts] : r.alerts));
          setTurlar(r.byKind ?? []);
          setCursor(r.nextCursor);
          setYanaBor(r.nextCursor !== null);
        })
        .finally(() => {
          setLoading(false);
          setYuklanmoqdaYana(false);
        });
    },
    [base, holat, tur, cursor],
  );

  // Filtr o'zgarsa — ro'yxat boshidan, kursorsiz. `yukla` ataylab
  // bog'liqlikka qo'shilmagan: u `cursor`ga bog'liq va cursor
  // yuklashdan KEYIN o'rnatiladi — qo'shsak cheksiz halqa bo'lardi.
  useEffect(() => {
    setCursor(null);
    yukla(false);
  }, [base, holat, tur]);

  async function holatQoy(id: string, status: 'seen' | 'resolved') {
    setBand(id);
    try {
      await api.patch(`${base}/alerts/${id}`, { status });
      // Ro'yxatni boshidan yangilaymiz — kartochka o'z joyidan yo'qoladi.
      setCursor(null);
      yukla(false);
    } finally {
      setBand(null);
    }
  }

  const jamiFaol = turlar.reduce((s, t) => s + t.count, 0);

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>Ogohlantirishlar</h1>
          <div className="izoh">Darhol e'tibor talab qiladigan hodisalar</div>
        </div>
        <div className="tab-qator">
          {HOLATLAR.map((f) => (
            <button
              key={f.key}
              className={`tab${holat === f.key ? ' active' : ''}`}
              onClick={() => setHolat(f.key)}
            >
              {f.nom}
              {f.key === '' && jamiFaol > 0 && <span className="tab-soni">{jamiFaol}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Tur bo'yicha filtr ─── */}
      {turlar.length > 0 && (
        <div className="tur-filtr">
          <button className={`tur-tugma${tur === '' ? ' active' : ''}`} onClick={() => setTur('')}>
            Barchasi <span className="soni">{jamiFaol}</span>
          </button>
          {turlar
            .slice()
            .sort((a, b) => b.count - a.count)
            .map((t) => {
              const m = TUR[t.kind] ?? { ikon: '•', nom: t.kind, izoh: '' };
              return (
                <button
                  key={t.kind}
                  className={`tur-tugma${tur === t.kind ? ' active' : ''}`}
                  onClick={() => setTur(tur === t.kind ? '' : t.kind)}
                  title={m.izoh}
                >
                  <span aria-hidden="true">{m.ikon}</span> {m.nom}{' '}
                  <span className="soni">{t.count}</span>
                </button>
              );
            })}
        </div>
      )}

      {loading ? (
        <div className="yuklanmoqda">Yuklanmoqda…</div>
      ) : rows.length === 0 ? (
        <div className="card">
          <div className="hech-narsa">
            <div className="katta-ikon">✓</div>
            {holat === 'resolved'
              ? 'Hal qilingan ogohlantirish yo\'q'
              : tur
                ? 'Bu turdagi faol ogohlantirish yo\'q'
                : 'Hammasi joyida — faol ogohlantirish yo\'q'}
          </div>
        </div>
      ) : (
        <div className="ogoh-grid">
          {rows.map((a) => {
            const m = TUR[a.kind] ?? { ikon: '•', nom: a.kind, izoh: '' };
            return (
              <div
                className={`ogoh-karta${a.status === 'resolved' ? ' hal' : ''}`}
                key={a.id}
                style={{ borderLeftColor: CHEGARA[a.severity] ?? 'var(--border-strong)' }}
              >
                <div className="bosh">
                  <span className={`tur-belgi ${a.severity}`}>
                    <span aria-hidden="true">{m.ikon}</span> {m.nom}
                  </span>
                  <span className="vaqt" title={fmtSana(a.createdAt)}>
                    {fmtQachon(a.createdAt)}
                  </span>
                </div>

                <div className="sarlavha">
                  {a.title}
                  {a.status === 'new' && <span className="badge qizil">yangi</span>}
                </div>

                {/* Izoh: avval suhbat xulosasi, bo'lmasa turning ta'rifi. */}
                <div className="izoh">{a.conversationSummary ?? m.izoh}</div>

                <div className="oyoq">
                  {a.seatName ? (
                    <span className="menejer-katak">
                      <span className="avatar-kichik">
                        {a.seatName.slice(0, 1).toUpperCase()}
                      </span>
                      {a.seatId ? (
                        <Link to={`/sotuvchi/${a.seatId}`} className="havola">
                          {a.seatName}
                        </Link>
                      ) : (
                        a.seatName
                      )}
                    </span>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
                      sotuvchi biriktirilmagan
                    </span>
                  )}

                  <div className="tugmalar">
                    {a.conversationId && (
                      <Link to={`/suhbatlar/${a.conversationId}`} className="btn ikkinchi kichik">
                        Suhbatni ochish
                      </Link>
                    )}
                    {halQila && a.status !== 'resolved' && (
                      <button
                        className="btn kichik"
                        disabled={band === a.id}
                        onClick={() => void holatQoy(a.id, 'resolved')}
                      >
                        {band === a.id ? '…' : 'Bekor qilish'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {yanaBor && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <button className="btn ikkinchi" disabled={yuklanmoqdaYana} onClick={() => yukla(true)}>
            {yuklanmoqdaYana ? 'Yuklanmoqda…' : 'Yana yuklash'}
          </button>
        </div>
      )}
    </>
  );
}
