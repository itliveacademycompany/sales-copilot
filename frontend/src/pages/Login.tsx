import { ArrowLeft, ArrowRight, ChevronLeft, LoaderCircle, Lock, Mail, Sparkles } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { LoginSahna } from '../components/login/LoginSahna';
import { IkonliInput, ParolInput } from '../components/ParolInput';
import { useT } from '../i18n';

/**
 * Ro'yxatdan o'tish yo'q: mahsulotni sotib olgan mijozga hisobni biz
 * o'zimiz qo'lda yaratib beramiz. Shuning uchun faqat kirish va tiklash.
 *
 * Til landing'da tanlanganidek (umumiy `useTil` holati) — matnlar
 * `lugat/kirish.ts` da.
 */
type Rejim = 'login' | 'tiklash';

/** Kirish + parolni tiklash — bitta karta, ikki rejim. */
export function Login() {
  const { refresh } = useAuth();
  const t = useT();
  const [mode, setMode] = useState<Rejim>('login');
  const [tiklashYuborildi, setTiklashYuborildi] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  /** Logo va strelka yorlig'i (ekran o'quvchilar va sichqoncha uchun). */
  const ORQAGA = t('Bosh sahifaga qaytish');

  function rejimgaOt(yangi: Rejim) {
    setMode(yangi);
    setError('');
    if (yangi === 'tiklash') setTiklashYuborildi(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'tiklash') {
        await api.post('/api/v1/auth/password-reset/request', { emailOrLogin: email });
        // Javob har doim bir xil — hisob bor-yo'qligi oshkor qilinmaydi.
        setTiklashYuborildi(true);
        return;
      }
      await api.post('/api/v1/auth/login', { email, password });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("Server bilan bog'lanib bo'lmadi"));
    } finally {
      setBusy(false);
    }
  }

  const sarlavha = t(mode === 'login' ? 'Xush kelibsiz' : 'Parolni tiklash');
  const izoh =
    mode === 'login'
      ? t('Davom etish uchun hisobingizga kiring')
      : t('Email yoki loginingizni kiriting — tiklash havolasini yuboramiz');
  const tugmaMatni = t(mode === 'login' ? 'Kirish' : 'Tiklash havolasini yuborish');

  return (
    <div className="login-fon">
      {/* Fondagi suzuvchi shakllar — faqat bezak */}
      <div className="login-shakllar" aria-hidden="true">
        <span className="shar s1" />
        <span className="shar s2" />
        <span className="shar s3" />
        <span className="halqa h1" />
        <span className="halqa h2" />
      </div>

      {/* Sahifaning o'ng yuqori burchagi — landing'ga ("Loyiha haqida") qaytish */}
      <Link to="/" className="login-orqaga" aria-label={ORQAGA} title={ORQAGA}>
        <ArrowLeft />
      </Link>

      <div className="login-sahna">
        {/* ─── Chap panel: mahsulot taqdimoti (keng ekranda) ─── */}
        <aside className="login-taqdimot">
          {/* Logo ham landing'ga qaytaradi */}
          <div className="login-brend">
            <Link to="/" className="login-logo" aria-label={ORQAGA}>
              <span className="logo-belgi katta" aria-hidden="true">
                <Sparkles />
              </span>
              <span className="logo-matn">
                Sotuv<em>AI</em>
              </span>
            </Link>
          </div>

          <h1 className="taqdimot-sarlavha">
            {t('Har bir ball ortida —')}
            <br />
            <span className="urgu">{t('isbot.')}</span>
          </h1>
          <p className="taqdimot-matn">
            {t(
              "Sotuv bo'limingiz yozishmalarini kompaniyangizning o'z skripti bo'yicha baholaydigan va har bir sotuvchiga kouching beradigan platforma.",
            )}
          </p>

          <LoginSahna />
        </aside>

        {/* ─── O'ng panel: forma ─── */}
        <form className="login-card" onSubmit={(e) => void submit(e)}>
          {/* Tor ekranda chap panel yashirin — logo kartaning o'zida */}
          <div className="login-karta-bosh">
            <Link to="/" className="login-logo" aria-label={ORQAGA}>
              <span className="logo-belgi" aria-hidden="true">
                <Sparkles />
              </span>
              <span className="logo">
                Sotuv<em>AI</em>
              </span>
            </Link>
          </div>

          <h2 className="login-sarlavha">{sarlavha}</h2>
          <div className="kirish-izoh">{izoh}</div>

          {error && (
            <div className="xato-banner" role="alert">
              {error}
            </div>
          )}

          {mode === 'tiklash' && tiklashYuborildi && (
            <div className="ok-qator" role="status">
              {t(
                "Agar bunday hisob mavjud bo'lsa va Telegram bog'langan bo'lsa, tiklash havolasi yuborildi. Havola 30 daqiqa amal qiladi.",
              )}
              <div style={{ marginTop: 6, fontSize: 12 }}>
                {t("Telegram bog'lanmagan bo'lsa — rahbaringizdan tiklash havolasini so'rang.")}
              </div>
            </div>
          )}

          <div className="maydon-blok">
            <label className="maydon" htmlFor="l-email">
              {t('Email yoki login')}
            </label>
            <IkonliInput
              id="l-email"
              ikon={<Mail />}
              // Menejerlar rahbar bergan LOGIN bilan kiradi (FR-04) — email maydoni uni rad etardi.
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder={t('siz@kompaniya.uz')}
            />
          </div>

          {mode !== 'tiklash' && (
            <div className="maydon-blok">
              <div className="label-qator">
                <label className="maydon" htmlFor="l-parol">
                  {t('Parol')}
                </label>
                {mode === 'login' && (
                  <a
                    href="#"
                    className="unutdim"
                    onClick={(e) => {
                      e.preventDefault();
                      rejimgaOt('tiklash');
                    }}
                  >
                    {t('Parolni unutdingizmi?')}
                  </a>
                )}
              </div>
              <ParolInput
                id="l-parol"
                ikon={<Lock />}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                autoComplete="current-password"
                placeholder="••••••••"
              />
            </div>
          )}

          <button
            className="btn login-tugma"
            disabled={busy || (mode === 'tiklash' && tiklashYuborildi)}
          >
            {busy ? (
              <>
                <LoaderCircle className="aylanuvchi" /> {t('Kuting…')}
              </>
            ) : (
              <>
                {tugmaMatni} <ArrowRight />
              </>
            )}
          </button>

          {mode === 'tiklash' && (
            <div className="login-pastki">
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  rejimgaOt('login');
                }}
              >
                <ChevronLeft /> {t('Kirishga qaytish')}
              </a>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
