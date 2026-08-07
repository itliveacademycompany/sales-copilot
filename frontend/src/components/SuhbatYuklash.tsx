import { useEffect, useState } from 'react';
import { api, ApiError, type SeatRow } from '../api';

/**
 * QO'LDA SUHBAT YUKLASH — sinov vositasi.
 *
 * Telegram ulanishini kutmasdan haqiqiy suhbatni tizimga berib, baholash
 * to'g'ri ishlayotganini ko'rish uchun.
 *
 * Oqim ataylab ikki qadamli: avval **ko'rib chiqish**, keyin yuklash.
 * Sabab — rollar. Agar matndagi yorliqlar noto'g'ri tushunilsa (menejer
 * `mijoz` deb olinsa), butun tahlil teskari chiqadi va buni natijadan
 * payqash qiyin. Ko'rib chiqish qadami buni saqlashdan OLDIN ko'rsatadi.
 */

interface ParsedSegment {
  seq: number;
  speaker: 'manager' | 'client';
  text: string;
}

const NAMUNA = `Mijoz: Assalomu alaykum, kurs haqida bilsam bo'ladimi?
Menejer: Assalomu alaykum! Albatta. Avval bilsam — qaysi yo'nalish qiziqtiryapti?
Mijoz: Frontend. Lekin tajribam yo'q
Menejer: Tushunarli. Noldan boshlovchilar uchun 6 oylik dastur bor, narxi oyiga 1.2 mln
Mijoz: O'ylab ko'raman
Menejer: Albatta! Ertaga bepul sinov darsiga yozib qo'yaymi?`;

export function SuhbatYuklash({
  businessId,
  onYuklandi,
}: {
  businessId: string;
  onYuklandi: (conversationId: string) => void;
}) {
  const [ochiq, setOchiq] = useState(false);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [seatId, setSeatId] = useState('');
  const [matn, setMatn] = useState('');
  const [sana, setSana] = useState('');
  const [korish, setKorish] = useState<ParsedSegment[] | null>(null);
  const [ogohlar, setOgohlar] = useState<string[]>([]);
  const [xato, setXato] = useState<string | null>(null);
  const [band, setBand] = useState(false);

  useEffect(() => {
    if (!ochiq) return;
    void api
      .get<SeatRow[]>(`/api/v1/businesses/${businessId}/seats`)
      .then((r) => {
        const faol = r.filter((s) => s.isActive);
        setSeats(faol);
        setSeatId((oldingi) => oldingi || (faol[0]?.id ?? ''));
      })
      .catch(() => undefined);
  }, [ochiq, businessId]);

  const url = `/api/v1/businesses/${businessId}/conversations/import`;

  async function korib() {
    setBand(true);
    setXato(null);
    try {
      const r = await api.post<{ segments: ParsedSegment[]; warnings: string[] }>(url, {
        seatId,
        text: matn,
        dryRun: true,
      });
      setKorish(r.segments);
      setOgohlar(r.warnings);
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : 'Matnni tahlil qilib bo\'lmadi');
      setKorish(null);
    } finally {
      setBand(false);
    }
  }

  async function yukla() {
    setBand(true);
    setXato(null);
    try {
      const r = await api.post<{ conversationId: string }>(url, {
        seatId,
        text: matn,
        ...(sana ? { startedAt: new Date(sana).toISOString() } : {}),
      });
      setOchiq(false);
      setMatn('');
      setKorish(null);
      setOgohlar([]);
      onYuklandi(r.conversationId);
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : 'Yuklab bo\'lmadi');
    } finally {
      setBand(false);
    }
  }

  if (!ochiq) {
    return (
      <button className="btn ikkinchi" onClick={() => setOchiq(true)}>
        ＋ Suhbat yuklash
      </button>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 14, borderLeft: '4px solid var(--ia)' }}>
      <div className="karta-bosh">
        <h2>Qo'lda suhbat yuklash</h2>
        <button className="btn ikkinchi kichik" onClick={() => setOchiq(false)}>
          Yopish
        </button>
      </div>

      <div className="yordam" style={{ marginBottom: 10 }}>
        Yuklangan suhbat xuddi Telegram'dan kelgani kabi <b>o'sha quvurdan</b> o'tadi:
        pre-filter → ekstraksiya → isbotli baholash. Ya'ni bu yerda ko'rgan natijangiz
        haqiqiy natija.
      </div>

      <div className="maydon-blok">
        <label htmlFor="y-seat">Sotuvchi</label>
        <select id="y-seat" value={seatId} onChange={(e) => setSeatId(e.target.value)}>
          {seats.length === 0 && <option value="">Avval sotuvchi qo'shing</option>}
          {seats.map((s) => (
            <option key={s.id} value={s.id}>
              {s.displayName}
            </option>
          ))}
        </select>
      </div>

      <div className="maydon-blok">
        <label htmlFor="y-sana">Suhbat sanasi (ixtiyoriy)</label>
        <input
          id="y-sana"
          type="datetime-local"
          value={sana}
          onChange={(e) => setSana(e.target.value)}
        />
        <div className="yordam">Bo'sh qoldirilsa — hozirgi vaqt.</div>
      </div>

      <div className="maydon-blok">
        <label htmlFor="y-matn">Suhbat matni</label>
        <textarea
          id="y-matn"
          value={matn}
          onChange={(e) => {
            setMatn(e.target.value);
            setKorish(null);
          }}
          rows={10}
          placeholder={NAMUNA}
          style={{ fontFamily: 'inherit', lineHeight: 1.5 }}
        />
        <div className="yordam">
          Har qatorni <b>Mijoz:</b> yoki <b>Menejer:</b> bilan boshlang. Vaqt belgisi
          (<code>[10:05]</code>) bo'lsa — javob tezligi ham hisoblanadi. Ruscha va inglizcha
          yorliqlar ham tushuniladi.
        </div>
        {matn.trim().length === 0 && (
          <button
            className="btn ikkinchi kichik"
            style={{ marginTop: 6 }}
            onClick={() => setMatn(NAMUNA)}
          >
            Namuna matnni qo'yish
          </button>
        )}
      </div>

      {xato && <div className="xato-qator">{xato}</div>}

      {ogohlar.map((o, i) => (
        <div key={i} className="etiroz-holat open" style={{ marginBottom: 8 }}>
          ⚠ {o}
        </div>
      ))}

      {korish && (
        <div className="card" style={{ marginBottom: 10, background: 'var(--bg-base)' }}>
          <b>Shunday tushunildi — {korish.length} ta xabar</b>
          <div className="yordam" style={{ marginBottom: 8 }}>
            Rollar to'g'rimi? Noto'g'ri bo'lsa tahlil ham teskari chiqadi.
          </div>
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {korish.map((s) => (
              <div key={s.seq} style={{ display: 'flex', gap: 8, marginBottom: 4, fontSize: 13 }}>
                <span
                  className={`badge ${s.speaker === 'manager' ? 'navy' : 'kul'}`}
                  style={{ flexShrink: 0 }}
                >
                  {s.speaker === 'manager' ? 'MENEJER' : 'MIJOZ'}
                </span>
                <span>{s.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8 }}>
        {!korish ? (
          <button
            className="btn"
            disabled={band || matn.trim().length < 20 || !seatId}
            onClick={() => void korib()}
          >
            {band ? 'Tekshirilmoqda…' : 'Ko\'rib chiqish'}
          </button>
        ) : (
          <>
            <button className="btn" disabled={band} onClick={() => void yukla()}>
              {band ? 'Yuklanmoqda…' : 'To\'g\'ri — yuklash va tahlil qilish'}
            </button>
            <button className="btn ikkinchi" onClick={() => setKorish(null)}>
              Matnni tahrirlash
            </button>
          </>
        )}
      </div>
    </div>
  );
}
