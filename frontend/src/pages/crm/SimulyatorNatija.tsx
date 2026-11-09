import { ArrowLeft, CheckCircle2, ChevronDown, CircleAlert, Lightbulb, MessageSquareQuote, RotateCcw, Sparkles, Timer } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../../api';
import { useCrm } from '../../crm/malumot';
import { mmss, QISQA_SEK, type Mashq } from '../../crm/simulyator';
import { tarjima, useT } from '../../i18n';
import './simulyator.css';

/** Baholash fonda ketadi — natija tayyor bo'lguncha holat so'rab turiladi. */
const SOROV_MS = 2500;
const SOROV_MAX = 60;

export function SimulyatorNatija() {
  const { base } = useCrm();
  const { id = '' } = useParams();
  const t = useT();
  const navigate = useNavigate();
  const [m, setM] = useState<Mashq | null>(null);
  const [xato, setXato] = useState('');
  const [toliq, setToliq] = useState(false);
  const [fikrBand, setFikrBand] = useState(false);

  const yukla = useCallback(async () => {
    try {
      setM(await api.get<Mashq>(`${base}/simulyator/mashqlar/${id}`));
      setXato('');
    } catch (e) {
      setXato(e instanceof ApiError ? tarjima(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, id, t]);

  useEffect(() => {
    void yukla();
  }, [yukla]);

  // Tahlil tayyor bo'lguncha so'rab turish
  useEffect(() => {
    if (m?.natijaHolat !== 'kutilmoqda') return;
    let n = 0;
    const tsikl = window.setInterval(() => {
      n += 1;
      if (n > SOROV_MAX) window.clearInterval(tsikl);
      else void yukla();
    }, SOROV_MS);
    return () => window.clearInterval(tsikl);
  }, [m?.natijaHolat, yukla]);

  async function qaytaTahlil() {
    try {
      setM(await api.post<Mashq>(`${base}/simulyator/mashqlar/${id}/baholash`));
    } catch (e) {
      setXato(e instanceof ApiError ? tarjima(e.message) : t("Qayta tahlil qilib bo'lmadi"));
    }
  }

  async function fikrBer(fikr: 'ha' | 'qisman' | 'yoq') {
    if (!m || fikrBand) return;
    setFikrBand(true);
    setM({ ...m, fikr });
    try {
      await api.post(`${base}/simulyator/mashqlar/${id}/fikr`, { fikr });
    } catch {
      setM((x) => (x ? { ...x, fikr: m.fikr } : x));
    } finally {
      setFikrBand(false);
    }
  }

  const orqaga = (
    <Link to="/crm/simulyator" className="sim-n-orqa">
      <ArrowLeft size={16} /> {t('Simulyatorga qaytish')}
    </Link>
  );

  if (xato && !m) {
    return (
      <div className="sim-natija">
        {orqaga}
        <div className="xato-banner" role="alert">
          {xato}
        </div>
      </div>
    );
  }
  if (!m) {
    return (
      <div className="sim-natija">
        <div className="sim-n-karta sim-skelet" style={{ minHeight: 320 }} aria-hidden="true" />
      </div>
    );
  }

  const s = m.ssenariy;
  const n = m.natija;
  const qisqa = m.natijaHolat === 'qisqa' || m.davomiylikSek < QISQA_SEK;

  return (
    <div className="sim-natija">
      {orqaga}

      <article className="sim-n-karta">
        <header className="sim-n-bosh">
          <span className="sim-n-belgi" aria-hidden="true">
            <Timer size={22} />
          </span>
          <div>
            <h1>{t("Qo'ng'iroq tugadi")}</h1>
            <p>
              {s.nom} · {t("Siz qo'ng'iroqni {v} da tugatdingiz", { v: mmss(m.davomiylikSek) })}
            </p>
          </div>
        </header>

        {m.natijaHolat === 'kutilmoqda' ? (
          <div className="sim-n-kutish" aria-live="polite">
            <Sparkles size={20} aria-hidden="true" />
            <div>
              <b>{t("AI qo'ng'iroqni tahlil qilmoqda…")}</b>
              <span>{t('Odatda 10-20 soniya oladi.')}</span>
            </div>
          </div>
        ) : qisqa ? (
          <div className="sim-n-holat kulrang">
            <CircleAlert size={18} aria-hidden="true" />
            <div>
              <b>{t('Juda qisqa')}</b>
              <span>{t("Baholash uchun kamida 30 soniya va 2 ta gapingiz kerak. Yana bir bor urinib ko'ring.")}</span>
            </div>
          </div>
        ) : m.natijaHolat === 'ai_yoq' || m.natijaHolat === 'xato' || !n ? (
          <div className="sim-n-holat kulrang">
            <CircleAlert size={18} aria-hidden="true" />
            <div>
              <b>{m.natijaHolat === 'ai_yoq' ? t('AI provayder ulanmagan') : t("Tahlil qilib bo'lmadi")}</b>
              <span>{t("Qo'ng'iroq matni saqlangan — qayta tahlil qilishingiz mumkin.")}</span>
            </div>
            <button type="button" className="btn ikkinchi kichik" onClick={() => void qaytaTahlil()}>
              <RotateCcw size={15} /> {t('Qayta tahlil qilish')}
            </button>
          </div>
        ) : (
          <>
            <div className={`sim-n-holat ${n.maqsadgaErishildi ? 'yashil' : 'sariq'}`}>
              {n.maqsadgaErishildi ? <CheckCircle2 size={18} aria-hidden="true" /> : <CircleAlert size={18} aria-hidden="true" />}
              <div>
                <b>{n.maqsadgaErishildi ? t('Maqsadga erishildi') : t('Maqsadga hali erishilmadi')}</b>
                <span>{s.maqsad}</span>
              </div>
              <span className="sim-n-ball" title={t('Umumiy baho')}>
                {n.umumiyBall}
                <small>/100</small>
              </span>
            </div>

            <section className="sim-n-xulosa">
              <h2>{n.boshXulosa}</h2>
              {n.izoh && <p>{n.izoh}</p>}
            </section>

            {n.keyingiSafar.maslahat && (
              <section className="sim-n-blok">
                <h3>
                  <Lightbulb size={16} aria-hidden="true" /> {t('Keyingi safar')}
                  {n.keyingiSafar.sek !== null && <span className="sim-n-vaqt">{mmss(n.keyingiSafar.sek)}</span>}
                </h3>
                <p>{n.keyingiSafar.maslahat}</p>
              </section>
            )}

            {n.namunaGap && (
              <section className="sim-n-blok namuna">
                <h3>
                  <MessageSquareQuote size={16} aria-hidden="true" /> {t("Shunday deb ko'ring:")}
                </h3>
                <blockquote>«{n.namunaGap}»</blockquote>
              </section>
            )}
          </>
        )}

        <div className="sim-n-amallar">
          <button type="button" className="btn" onClick={() => navigate(`/crm/simulyator?boshla=${encodeURIComponent(m.ssenariyKalit)}`)}>
            <RotateCcw size={16} /> {t('Qayta urinish · {n} daqiqa', { n: s.davomiylikDaq })}
          </button>
          <button type="button" className="btn ikkinchi" aria-expanded={toliq} onClick={() => setToliq((v) => !v)}>
            {t("To'liq tahlilni ko'rish")} <ChevronDown size={16} className={toliq ? 'sim-aylan' : ''} />
          </button>
        </div>
        <p className="sim-n-izoh">{t("Matn va barcha baholar — faqat siz ko'rasiz.")}</p>

        {toliq && (
          <section className="sim-n-toliq">
            {n && n.baholar.length > 0 && (
              <div className="sim-n-baholar">
                <h3>{t('Baholar')}</h3>
                <ul>
                  {n.baholar.map((b) => (
                    <li key={b.nom}>
                      <div className="sim-n-baho-bosh">
                        <span>{b.nom}</span>
                        <b>{b.ball}/10</b>
                      </div>
                      <div className="sim-n-baho-chiziq" aria-hidden="true">
                        <div className={b.ball >= 7 ? 'yashil' : b.ball >= 4 ? 'sariq' : 'qizil'} style={{ width: `${b.ball * 10}%` }} />
                      </div>
                      {b.izoh && <p>{b.izoh}</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div className="sim-n-matn">
              <h3>{t("Qo'ng'iroq matni")}</h3>
              {m.matn.length === 0 ? (
                <p className="sim-bosh-kichik">{t("Matn yo'q")}</p>
              ) : (
                <ol>
                  {m.matn.map((q, i) => (
                    <li key={i} className={q.kim}>
                      <span>
                        {q.kim === 'menejer' ? t('Siz') : s.mijozIsmi} · {mmss(q.sek)}
                      </span>
                      <p>{q.matn}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </section>
        )}

        <footer className="sim-n-fikr">
          <span>{t('{ism} haqiqiy mijozdek tuyuldimi?', { ism: s.mijozIsmi })}</span>
          <div className="sim-segment" role="radiogroup" aria-label={t('{ism} haqiqiy mijozdek tuyuldimi?', { ism: s.mijozIsmi })}>
            {(
              [
                ['ha', 'Ha'],
                ['qisman', 'Qisman'],
                ['yoq', "Yo'q"],
              ] as const
            ).map(([k, nom]) => (
              <button key={k} type="button" role="radio" aria-checked={m.fikr === k} className={m.fikr === k ? 'faol' : ''} disabled={fikrBand} onClick={() => void fikrBer(k)}>
                {t(nom)}
              </button>
            ))}
          </div>
        </footer>

        {xato && (
          <div className="xato-banner" role="alert">
            {xato}
          </div>
        )}
      </article>
    </div>
  );
}
