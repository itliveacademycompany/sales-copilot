import { useEffect, useState } from 'react';
import { api, ApiError, type SeatRow } from '../api';
import { getSttModel, setSttModel, STT_MODELLAR, type SttModelKey } from '../sttModels';

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

/**
 * AI allaqachon rol bergan va kerak bo'lsa STT bo'lagini bir nechta
 * navbatga bo'lgan natija — `transcript-refine.ts` ga qarang.
 */
interface RefinedTurn {
  speaker: 'manager' | 'client';
  text: string;
  startSeconds: number;
}

/** Birlashtirilgan oqimda (refine-and-analyze.ts) transkript bilan birga keladigan bahoning qisqa ko'rinishi. */
interface AnalysisPreview {
  businessRelevance: string;
  callFamily: string | null;
  serviceLine: string | null;
  summary: string;
  classificationConfidence: number;
  leadQuality: string | null;
  primaryGap: string | null;
  compliance: string | null;
  scores: { code: string; score: number | null; reasoning: string }[];
  redFlags: { key: string; quote: string }[];
}

/** `/transcribe` javobidagi, `/import-analyzed` ga o'zgarishsiz qaytariladigan xom natija. */
interface AnalysisPayload {
  turns: RefinedTurn[];
  extracted: unknown;
  stage3: unknown;
  transcriptConfidence: number;
  costUsd: number;
  tokensIn: number;
  tokensOut: number;
  model: string;
}

/** AI bergan navbatlarni "[MM:SS] Menejer: ..." matn shakliga o'giradi. */
function turnsToMatn(turns: RefinedTurn[]): string {
  return turns
    .map((t) => {
      const jami = Math.max(0, Math.round(t.startSeconds));
      const mm = String(Math.floor(jami / 60)).padStart(2, '0');
      const ss = String(jami % 60).padStart(2, '0');
      return `[${mm}:${ss}] ${t.speaker === 'manager' ? 'Menejer' : 'Mijoz'}: ${t.text.trim()}`;
    })
    .join('\n');
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

  // ─── Audio (FAZA 2) ───
  const [rejim, setRejim] = useState<'matn' | 'audio'>('matn');
  const [turns, setTurns] = useState<RefinedTurn[] | null>(null);
  const [aiDegraded, setAiDegraded] = useState(false);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const [sttMalumot, setSttMalumot] = useState<string | null>(null);
  const [holat, setHolat] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioInputKey, setAudioInputKey] = useState(0);
  const [sttModel, setSttModelState] = useState<SttModelKey>(() => getSttModel());
  /** Birlashtirilgan oqim: transkript bilan BIRGA kelgan baho — bo'lsa, tasdiqlash to'g'ridan-to'g'ri saqlaydi (qayta LLM chaqirmasdan). */
  const [preview, setPreview] = useState<AnalysisPreview | null>(null);
  const [analysisPayload, setAnalysisPayload] = useState<AnalysisPayload | null>(null);

  /**
   * Audio → transkript. Rolni ham, kerak bo'lsa bo'lakni qayta bo'lishni
   * ham AI hal qiladi (transcript-refine.ts) — chunki STT ko'pincha ikki
   * odamning gapini bitta bo'lakka birlashtirib qo'yadi (telefon
   * suhbatida orada yetarli jimlik qolmasa). Natija baribir ODAM
   * tomonidan tekshiriladi — pastdagi ro'yxat va "Tasdiqlash" qadami
   * aynan shu uchun (FR-84: yakuniy qaror avtomatik emas).
   */
  async function audioYubor(file: File) {
    setBand(true);
    setXato(null);
    setHolat('Transkript qilinmoqda va AI orqali rollarga ajratilmoqda... bu bir necha daqiqa olishi mumkin.');
    try {
      const fd = new FormData();
      fd.append('speakerCount', '2');
      fd.append('sttModel', sttModel);
      fd.append('file', file);
      const res = await fetch(
        `/api/v1/businesses/${businessId}/conversations/transcribe`,
        { method: 'POST', credentials: 'include', body: fd },
      );
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { title?: string; detail?: string };
        throw new Error(j.detail ?? j.title ?? `Xato ${res.status}`);
      }
      const r = (await res.json()) as {
        turns: RefinedTurn[];
        speakerCount: number;
        durationSeconds: number;
        costUsd: number;
        language: string;
        roleConfidence?: number;
        degraded?: boolean;
        note?: string;
        preview?: AnalysisPreview | null;
        analysisPayload?: AnalysisPayload | null;
      };
      setTurns(r.turns);
      setAiDegraded(r.degraded ?? false);
      setAiConfidence(r.roleConfidence ?? null);
      setPreview(r.preview ?? null);
      setAnalysisPayload(r.analysisPayload ?? null);
      setSttMalumot(
        `${Math.round(r.durationSeconds)} soniya · ${r.speakerCount} so'zlovchi · ` +
          `${r.language} · $${r.costUsd.toFixed(3)}` +
          (r.note ? ` · ${r.note}` : ''),
      );
      setHolat(null);
    } catch (e) {
      setXato(e instanceof Error ? e.message : 'Audioni matnga aylantirib bo\'lmadi');
      setHolat(null);
    } finally {
      setBand(false);
    }
  }

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
      setAudioFile(null);
      setAudioInputKey((k) => k + 1);
      setKorish(null);
      setOgohlar([]);
      onYuklandi(r.conversationId);
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : 'Yuklab bo\'lmadi');
    } finally {
      setBand(false);
    }
  }

  /**
   * Birlashtirilgan oqim uchun: transkript BILAN BIRGA kelgan bahoni
   * (`analysisPayload`) o'zgarishsiz saqlash endpointiga jo'natadi — LLM
   * QAYTA chaqirilmaydi, faqat allaqachon olingan natija bazaga yoziladi.
   */
  async function saqlaTasdiqlangan() {
    if (!analysisPayload) return;
    setBand(true);
    setXato(null);
    try {
      const r = await api.post<{ conversationId: string }>(
        `/api/v1/businesses/${businessId}/conversations/import-analyzed`,
        {
          seatId,
          channel: 'phone',
          ...(sana ? { startedAt: new Date(sana).toISOString() } : {}),
          ...analysisPayload,
        },
      );
      setOchiq(false);
      setTurns(null);
      setPreview(null);
      setAnalysisPayload(null);
      setAudioFile(null);
      setAudioInputKey((k) => k + 1);
      setSttMalumot(null);
      onYuklandi(r.conversationId);
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : 'Saqlab bo\'lmadi');
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
        <button
          className="btn ikkinchi kichik"
          onClick={() => {
            setOchiq(false);
            setAudioFile(null);
            setAudioInputKey((k) => k + 1);
          }}
        >
          Yopish
        </button>
      </div>

      <div className="yordam" style={{ marginBottom: 10 }}>
        Yuklangan suhbat xuddi Telegram'dan kelgani kabi <b>o'sha quvurdan</b> o'tadi:
        pre-filter → ekstraksiya → isbotli baholash. Ya'ni bu yerda ko'rgan natijangiz
        haqiqiy natija.
      </div>

      <div className="tab-qator" style={{ marginBottom: 12 }}>
        <button
          className={`tab${rejim === 'matn' ? ' active' : ''}`}
          onClick={() => setRejim('matn')}
        >
          Matn
        </button>
        <button
          className={`tab${rejim === 'audio' ? ' active' : ''}`}
          onClick={() => setRejim('audio')}
        >
          Audio yozuv
        </button>
      </div>

      {rejim === 'audio' && !turns && (
        <div className="maydon-blok">
          <label htmlFor="y-stt-model">Transkript modeli</label>
          <select
            id="y-stt-model"
            value={sttModel}
            disabled={band}
            onChange={(e) => {
              const v = e.target.value as SttModelKey;
              setSttModelState(v);
              setSttModel(v);
            }}
          >
            {STT_MODELLAR.map((m) => (
              <option key={m.key} value={m.key}>
                {m.name}
              </option>
            ))}
          </select>
          <div className="yordam" style={{ marginBottom: 10 }}>
            {STT_MODELLAR.find((m) => m.key === sttModel)?.note}
          </div>
          <label htmlFor="y-audio">Audio fayl</label>
          <input
            key={audioInputKey}
            id="y-audio"
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/ogg,audio/flac,audio/webm,.mp3,.wav,.ogg,.flac"
            disabled={band}
            onChange={(e) => {
              const f = e.target.files?.[0];
              setAudioFile(f ?? null);
              setTurns(null);
              setAiDegraded(false);
              setPreview(null);
              setAnalysisPayload(null);
              setSttMalumot(null);
              setHolat(null);
              setXato(null);
              setKorish(null);
            }}
          />
          {audioFile && (
            <div className="yordam" style={{ marginTop: 6 }}>
              Fayl tanlandi: <b>{audioFile.name}</b>. Ma'lumotlarni tekshirib, tayyor bo'lganda boshlang.
            </div>
          )}
          <div className="yordam">
            MP3, WAV, OGG yoki FLAC — 10 MB gacha. M4A qo'llab-quvvatlanmaydi.
            Yozuvda ikkala tomon ham eshitilishi kerak, aks holda so'zlovchilar ajralmaydi.
          </div>
          <div className="yordam" style={{ marginTop: 6 }}>
            <b>Bulutli STT sozlanmagan bo'lsa</b> — kompyuteringizda lokal aylantiring
            (kalit ham, karta ham kerak emas):
            <br />
            <code>npm run stt:local -- "C:\yozuvlar\qongiroq.mp3"</code>
            <br />
            Natijani <b>Matn</b> bo'limiga joylashtiring.
          </div>
          <button
            className="btn"
            style={{ marginTop: 12 }}
            disabled={band || !audioFile || !seatId}
            onClick={() => {
              if (audioFile) void audioYubor(audioFile);
            }}
          >
            {band ? 'Transkript qilinmoqda...' : 'Boshlash'}
          </button>
        </div>
      )}

      {holat && <div className="ok-qator">{holat}</div>}

      {/* AI natijasi — rol va bo'linish avtomatik, lekin ODAM tasdiqlaydi (FR-84) */}
      {turns && (
        <div className="card" style={{ marginBottom: 10, background: 'var(--bg-base)' }}>
          <b>AI natijasi — tekshiring va tasdiqlang</b>
          <div className="yordam" style={{ marginBottom: 8 }}>
            {sttMalumot}
            <br />
            AI kim gapirganini va matn xatolarini tuzatishga urindi. Noto'g'ri joy
            bo'lsa — "Matnni tahrirlash" orqali keyingi qadamda qo'lda to'g'rilang.
          </div>

          {aiDegraded && (
            <div className="etiroz-holat open" style={{ marginBottom: 10 }}>
              ⚠ AI ishlamadi, oddiy kalit-so'z qoidalari bilan taxminiy ajratildi.
              Bu ancha xato bo'lishi mumkin — diqqat bilan tekshiring.
            </div>
          )}
          {!aiDegraded && aiConfidence !== null && aiConfidence < 0.75 && (
            <div className="etiroz-holat open" style={{ marginBottom: 10 }}>
              ⚠ AI o'zi ham bu suhbatni ajratishga unchalik ishonmadi (ishonch:{' '}
              {Math.round(aiConfidence * 100)}%) — suhbatdoshlar bir-birini tez-tez
              bo'lib gapirgan bo'lishi mumkin. Har qatorni diqqat bilan tekshiring.
            </div>
          )}

          <div style={{ maxHeight: 320, overflowY: 'auto', marginBottom: 10 }}>
            {turns.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 6, fontSize: 13 }}>
                <span
                  className={`badge ${t.speaker === 'manager' ? 'navy' : 'kul'}`}
                  style={{ flexShrink: 0 }}
                >
                  {t.speaker === 'manager' ? 'MENEJER' : 'MIJOZ'}
                </span>
                <span>{t.text}</span>
              </div>
            ))}
          </div>

          {/* Birlashtirilgan oqim: baho transkript BILAN BIRGA keldi — LLM qayta chaqirilmaydi. */}
          {preview && (
            <div className="card" style={{ marginBottom: 10 }}>
              <b>AI bahosi (oldindan ko'rish)</b>
              <div className="yordam" style={{ marginBottom: 8 }}>
                {preview.summary}
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, fontSize: 12 }}>
                <span className="badge kul">{preview.businessRelevance}</span>
                {preview.callFamily && <span className="badge kul">{preview.callFamily}</span>}
                {preview.leadQuality && <span className="badge kul">lid: {preview.leadQuality}</span>}
                {preview.compliance && preview.compliance !== 'ok' && (
                  <span className="badge kul">muvofiqlik: {preview.compliance}</span>
                )}
              </div>
              <div style={{ maxHeight: 200, overflowY: 'auto', fontSize: 13 }}>
                {preview.scores.map((s) => (
                  <div key={s.code} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <span className="badge navy" style={{ flexShrink: 0 }}>
                      {s.code}: {s.score === null ? '—' : s.score}
                    </span>
                    <span>{s.reasoning}</span>
                  </div>
                ))}
              </div>
              {preview.redFlags.length > 0 && (
                <div className="etiroz-holat open" style={{ marginTop: 8 }}>
                  ⚠ Qizil bayroq: {preview.redFlags.map((f) => f.key).join(', ')}
                </div>
              )}
              <div className="yordam" style={{ marginTop: 8 }}>
                Bu — yakuniy emas, dastlabki baho. Tasdiqlagach isbot (iqtibos) kod darajasida
                tekshiriladi; isbotsiz ballar bekor qilinadi.
              </div>
            </div>
          )}

          {analysisPayload ? (
            <button className="btn" disabled={band || !seatId} onClick={() => void saqlaTasdiqlangan()}>
              {band ? 'Saqlanmoqda...' : 'Tasdiqlash va saqlash'}
            </button>
          ) : (
            <button
              className="btn"
              onClick={() => {
                setMatn(turnsToMatn(turns));
                setTurns(null);
                setAudioFile(null);
                setAudioInputKey((k) => k + 1);
                setRejim('matn');
                setKorish(null);
              }}
            >
              Tasdiqlash va matnga o'tish
            </button>
          )}{' '}
          <button
            className="btn ikkinchi"
            onClick={() => {
              setTurns(null);
              setAiDegraded(false);
              setPreview(null);
              setAnalysisPayload(null);
              setAudioFile(null);
              setAudioInputKey((k) => k + 1);
              setSttMalumot(null);
            }}
          >
            Bekor
          </button>
        </div>
      )}

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

      <div className="maydon-blok" style={{ display: rejim === 'matn' && !turns ? undefined : 'none' }}>
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

      <div
        style={{
          display: rejim === 'matn' && !turns ? 'flex' : 'none',
          gap: 8,
        }}
      >
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
