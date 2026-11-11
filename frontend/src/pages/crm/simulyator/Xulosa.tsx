import { ChevronRight, FileText, RotateCcw, Sparkles, Target, ThumbsUp } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { errorText, type ResultResponse, type TrainingApi } from '../../../features/mashq';
import { davomiylik, type MashqKarta, mmss, navbatVaqti, type QongiroqIzi } from './yordamchi';

/**
 * Qo'ng'iroqdan keyingi ekran: avval "AI tahlil qilmoqda…", natija kelgach —
 * bitta asosiy xulosa, "Keyingi safar" maslahati va "Shunday deb ko'ring"
 * namunasi. Batafsil tahlil (mezonlar, grafik, transkript) — "To'liq tahlil".
 */

type Fikr = 'ha' | 'qisman' | 'yoq';

interface Props {
  api: TrainingApi;
  sessionId: string;
  iz: QongiroqIzi | null;
  karta: MashqKarta | null;
  onQaytaUrinish: (karta: MashqKarta) => void;
  onToliq: () => void;
  onQaytish: () => void;
  onFikr: (fikr: Fikr) => Promise<void>;
}

const POLL_MS = 2000;
const POLL_MAKS = 105; // ~3.5 daqiqa

/** Matnning birinchi gapi — sarlavha, qolgani — izoh. */
function ajrat(matn: string): { sarlavha: string; izoh: string } {
  const t = matn.trim();
  const m = /^(.+?[.!?])(\s+|$)/s.exec(t);
  if (!m || m[1]!.length < 12 || m[1]!.length > 140) return { sarlavha: t, izoh: '' };
  return { sarlavha: m[1]!, izoh: t.slice(m[0].length).trim() };
}

export function Xulosa({ api, sessionId, iz, karta, onQaytaUrinish, onToliq, onQaytish, onFikr }: Props) {
  const [data, setData] = useState<ResultResponse | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [vaqtOtdi, setVaqtOtdi] = useState(false);
  const [qayta, setQayta] = useState(0);
  const [fikr, setFikr] = useState<Fikr | null>(null);
  const urinish = useRef(0);

  useEffect(() => {
    let toxta = false;
    urinish.current = 0;
    setVaqtOtdi(false);
    const tick = async (): Promise<void> => {
      if (toxta) return;
      let tugadi = false;
      try {
        const r = await api.getResult(sessionId);
        if (toxta) return;
        setData(r);
        setXato(null);
        const run = r.latestRun ?? r.result;
        tugadi = run.status !== 'pending' && r.result.status !== 'pending';
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        if (!raw.includes('404') && !/not_found/i.test(raw)) {
          setXato(errorText(err, true));
          return;
        }
        // Baholash qo'ng'iroq tugashi bilan boshlanadi; uzoq vaqt yo'q bo'lsa — tahlil yaratilmagan.
        if (urinish.current >= 10) {
          setXato("Bu mashq uchun tahlil topilmadi (qo'ng'iroq yakunlanmagan bo'lishi mumkin).");
          return;
        }
      }
      if (tugadi || toxta) return;
      urinish.current += 1;
      if (urinish.current >= POLL_MAKS) {
        setVaqtOtdi(true);
        return;
      }
      window.setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      toxta = true;
    };
  }, [api, sessionId, qayta]);

  const qaytaBahola = async (): Promise<void> => {
    try {
      await api.requestScore(sessionId);
      setData(null);
      setQayta((n) => n + 1);
    } catch (err) {
      setXato(errorText(err, true));
    }
  };

  const ism = iz?.mijozIsmi ?? data?.revealed?.name ?? 'Mijoz';
  const tugashMatni = iz
    ? iz.tugatdi === 'vaqt'
      ? `Vaqt tugadi · qo'ng'iroq ${mmss(iz.jami)} da yakunlandi`
      : iz.tugatdi === 'mijoz'
        ? `${ism} qo'ng'iroqni ${mmss(iz.davom)} da yakunladi`
        : `Siz qo'ng'iroqni ${mmss(iz.davom)} da tugatdingiz`
    : null;

  const natija = data?.result;
  const kutilmoqda = !natija || natija.status === 'pending';
  const muvaffaqiyatsiz = natija?.status === 'failed';

  const sarlavhaQatori = (
    <div className="sm-x-tugadi">
      <span className="sm-x-harf">{ism.charAt(0).toUpperCase()}</span>
      Qo'ng'iroq tugadi{tugashMatni ? ` · ${tugashMatni}` : ''}
    </div>
  );

  // ── Kutish / xato ───────────────────────────────────────────────────────
  if (xato || kutilmoqda || muvaffaqiyatsiz) {
    return (
      <div className="sm-xulosa sm-xulosa-kutish">
        {sarlavhaQatori}
        {xato || muvaffaqiyatsiz ? (
          <>
            <p className="sm-x-kutish-nom">Tahlil qilib bo'lmadi</p>
            <p className="sm-x-kutish-izoh">{xato ?? natija?.error ?? "AI javob bermadi. Qayta urinib ko'ring."}</p>
            <button type="button" className="sm-x-oq" onClick={() => void qaytaBahola()}>
              <RotateCcw size={15} /> Qayta tahlil qilish
            </button>
          </>
        ) : (
          <>
            <span className="sm-x-spinner" aria-hidden />
            <p className="sm-x-kutish-nom">AI qo'ng'irog'ingizni tahlil qilmoqda…</p>
            <p className="sm-x-kutish-izoh">
              {vaqtOtdi ? "Tahlil odatdagidan uzoq ketyapti. Keyinroq Tarix bo'limidan ko'rishingiz mumkin." : 'Bu bir necha soniya oladi.'}
            </p>
          </>
        )}
        <button type="button" className="sm-x-oq" onClick={onQaytish}>
          Simulyatorga qaytish
        </button>
      </div>
    );
  }

  // ── Natija ──────────────────────────────────────────────────────────────
  const coaching = natija.coaching;
  const hisobot = coaching?.scenarioReport;
  const yetarliEmas = natija.quality === 'insufficient';
  const erishildi = data.outcome === 'won';
  const ball = hisobot?.score ?? natija.skillScore;

  const asosiy = yetarliEmas
    ? {
        sarlavha: "Suhbat tahlil qilish uchun juda qisqa bo'ldi.",
        izoh: "Mijoz bilan kamida bir necha marta gaplashing — shunda AI aniq maslahat bera oladi.",
      }
    : ajrat(hisobot?.summary || coaching?.summary || (erishildi ? 'Mijoz keyingi qadamga rozi bo\'ldi.' : ''));

  const yaxshilash = coaching?.improvements[0] ?? null;
  const keyingiMatn = yaxshilash ? yaxshilash.why || yaxshilash.title : (hisobot?.tip ?? null);
  const dalilVaqti = yaxshilash ? navbatVaqti(data.transcript, yaxshilash.evidenceTurnSeq, iz?.jurnal) : null;
  const kuchli = coaching?.strengths[0] ?? null;
  const qaytaKarta = karta ?? iz?.karta ?? null;

  const fikrBer = (f: Fikr): void => {
    setFikr(f);
    void onFikr(f).catch(() => undefined);
  };

  return (
    <div className="sm-xulosa">
      <div className="sm-x-chiplar">
        <span className="sm-x-chip">Mashq qo'ng'irog'i — {ism} AI mijoz, haqiqiy odam emas</span>
        {qaytaKarta ? <span className="sm-x-chip">{qaytaKarta.sarlavha}</span> : null}
      </div>

      <div className="sm-x-karta">
        {sarlavhaQatori}

        <div className="sm-x-asosiy">
          <span className={`sm-x-belgi${erishildi ? ' sm-x-belgi-ok' : ''}`} aria-hidden>
            <Target size={18} />
          </span>
          <div>
            <div className="sm-x-yorliq">
              {yetarliEmas ? 'TAHLIL UCHUN MA\'LUMOT KAM' : erishildi ? 'MAQSADGA ERISHILDI' : 'MAQSADGA HALI ERISHILMADI'}
              {!yetarliEmas && ball !== null && ball !== undefined ? (
                <span className="sm-x-ball">{Math.round(ball)}/100</span>
              ) : null}
            </div>
            <h1 className="sm-x-sarlavha">{asosiy.sarlavha}</h1>
            {asosiy.izoh ? <p className="sm-x-izoh">{asosiy.izoh}</p> : null}
          </div>
        </div>

        {!yetarliEmas && keyingiMatn ? (
          <div className="sm-x-keyingi">
            <div className="sm-x-keyingi-yorliq">KEYINGI SAFAR</div>
            <p>
              {keyingiMatn}
              {dalilVaqti !== null ? (
                <span className="sm-x-vaqt">{mmss(dalilVaqti)}</span>
              ) : yaxshilash?.evidenceTurnSeq ? (
                <span className="sm-x-vaqt">#{yaxshilash.evidenceTurnSeq}</span>
              ) : null}
            </p>
            {yaxshilash?.betterPhrasing ? (
              <div className="sm-x-namuna">
                <b>Shunday deb ko'ring:</b> “{yaxshilash.betterPhrasing}”
              </div>
            ) : null}
          </div>
        ) : null}

        {!yetarliEmas && kuchli ? (
          <div className="sm-x-kuchli">
            <Sparkles size={14} aria-hidden /> <span>{kuchli}</span>
          </div>
        ) : null}

        {qaytaKarta ? (
          <button type="button" className="sm-x-qayta" onClick={() => onQaytaUrinish(qaytaKarta)}>
            <RotateCcw size={15} /> Qayta urinish · {davomiylik(qaytaKarta.qiyinlik) / 60} daqiqa
          </button>
        ) : null}

        <button type="button" className="sm-x-toliq" onClick={onToliq}>
          <FileText size={18} aria-hidden />
          <span>
            <b>To'liq tahlilni ko'rish</b>
            <small>Matn, mezonlar va barcha lahzalar · faqat siz va rahbaringiz ko'radi</small>
          </span>
          <span className="sm-x-och">
            Ochish <ChevronRight size={16} />
          </span>
        </button>

        <div className="sm-x-fikr">
          <span>{ism} haqiqiy mijozdek tuyuldimi?</span>
          {fikr ? (
            <span className="sm-x-rahmat">
              <ThumbsUp size={14} /> Rahmat, fikringiz saqlandi
            </span>
          ) : (
            <span className="sm-x-fikr-tugmalar">
              <button type="button" onClick={() => fikrBer('ha')}>
                Ha
              </button>
              <button type="button" onClick={() => fikrBer('qisman')}>
                Qisman
              </button>
              <button type="button" onClick={() => fikrBer('yoq')}>
                Yo'q
              </button>
            </span>
          )}
        </div>

        <button type="button" className="sm-x-oq sm-x-qaytish" onClick={onQaytish}>
          Simulyatorga qaytish
        </button>
      </div>
    </div>
  );
}
