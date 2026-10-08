import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronLeft,
  LoaderCircle,
  Lock,
  Mail,
  MessagesSquare,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserRound,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { IkonliInput, ParolInput } from '../components/ParolInput';

type Rejim = 'login' | 'register' | 'tiklash';

/**
 * Mahsulotning asosiy va'dalari — chap paneldagi taqdimot.
 * Faqat haqiqatan ishlaydigan imkoniyatlar yozilgan.
 */
const AFZALLIKLAR = [
  {
    ikon: <ShieldCheck />,
    nom: 'Isbotli baholash',
    matn: 'Har bir ball yozishmadagi aniq iqtibos bilan tasdiqlanadi.',
  },
  {
    ikon: <MessagesSquare />,
    nom: 'Telegram yozishmalari',
    matn: 'Suhbatlar avtomatik yig\'iladi va sizning skriptingiz bo\'yicha tahlil qilinadi.',
  },
  {
    ikon: <TrendingUp />,
    nom: 'Kouching va o\'sish',
    matn: 'Har bir sotuvchi uchun eng zaif joy va aniq tavsiya.',
  },
];

/** Kirish + ro'yxatdan o'tish + parolni tiklash — bitta karta, uch rejim. */
export function Login() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<Rejim>('login');
  const [tiklashYuborildi, setTiklashYuborildi] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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
      if (mode === 'login') {
        await api.post('/api/v1/auth/login', { email, password });
      } else {
        await api.post('/api/v1/auth/register', { email, password, displayName, businessName });
      }
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Server bilan bog\'lanib bo\'lmadi');
    } finally {
      setBusy(false);
    }
  }

  const sarlavha =
    mode === 'login' ? 'Xush kelibsiz' : mode === 'register' ? 'Hisob yarating' : 'Parolni tiklash';
  const izoh =
    mode === 'login'
      ? 'Davom etish uchun hisobingizga kiring'
      : mode === 'register'
        ? 'Yangi biznes hisobini yarating — 2 daqiqa'
        : 'Email yoki loginingizni kiriting — tiklash havolasini yuboramiz';
  const tugmaMatni =
    mode === 'login' ? 'Kirish' : mode === 'register' ? 'Ro\'yxatdan o\'tish' : 'Tiklash havolasini yuborish';

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

      <div className="login-sahna">
        {/* ─── Chap panel: mahsulot taqdimoti (keng ekranda) ─── */}
        <aside className="login-taqdimot">
          <div className="login-brend">
            <span className="logo-belgi katta" aria-hidden="true">
              <Sparkles />
            </span>
            <span className="logo-matn">
              Sotuv<em>AI</em>
            </span>
          </div>

          <h1 className="taqdimot-sarlavha">
            Har bir ball ortida —<br />
            <span className="urgu">isbot.</span>
          </h1>
          <p className="taqdimot-matn">
            Sotuv bo'limingiz yozishmalarini kompaniyangizning o'z skripti bo'yicha baholaydigan va
            har bir sotuvchiga kouching beradigan platforma.
          </p>

          <ul className="afzalliklar">
            {AFZALLIKLAR.map((a, i) => (
              <li key={a.nom} style={{ animationDelay: `${0.25 + i * 0.12}s` }}>
                <span className="afzallik-ikon" aria-hidden="true">
                  {a.ikon}
                </span>
                <span>
                  <b>{a.nom}</b>
                  <span className="afzallik-matn">{a.matn}</span>
                </span>
              </li>
            ))}
          </ul>

          {/* Mahsulot ko'rinishidan namuna — bezak, haqiqiy ma'lumot emas */}
          <div className="namuna-karta" aria-hidden="true">
            <div className="namuna-ball">
              <svg viewBox="0 0 44 44">
                <circle className="iz" cx="22" cy="22" r="18" />
                <circle className="qiymat" cx="22" cy="22" r="18" />
              </svg>
              <span>87%</span>
            </div>
            <div className="namuna-tafsilot">
              <div className="namuna-qator">
                <span>Ehtiyojni aniqlash</span>
                <span className="namuna-chip">3/3</span>
              </div>
              <div className="namuna-iqtibos">
                <BadgeCheck /> "Avval maqsadingizni bilsam…"
              </div>
            </div>
          </div>
        </aside>

        {/* ─── O'ng panel: forma ─── */}
        <form className="login-card" onSubmit={(e) => void submit(e)}>
          <div className="login-karta-bosh">
            <span className="logo-belgi" aria-hidden="true">
              <Sparkles />
            </span>
            <div className="logo">
              Sotuv<em>AI</em>
            </div>
          </div>

          <h2 className="login-sarlavha">{sarlavha}</h2>
          <div className="kirish-izoh">{izoh}</div>

          {mode !== 'tiklash' && (
            <div className="tab-qator login-almashtirgich" role="tablist" aria-label="Kirish usuli">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                className={`tab${mode === 'login' ? ' active' : ''}`}
                onClick={() => rejimgaOt('login')}
              >
                Kirish
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                className={`tab${mode === 'register' ? ' active' : ''}`}
                onClick={() => rejimgaOt('register')}
              >
                Ro'yxatdan o'tish
              </button>
            </div>
          )}

          {error && (
            <div className="xato-banner" role="alert">
              {error}
            </div>
          )}

          {mode === 'tiklash' && tiklashYuborildi && (
            <div className="ok-qator" role="status">
              Agar bunday hisob mavjud bo'lsa va Telegram bog'langan bo'lsa, tiklash havolasi
              yuborildi. Havola 30 daqiqa amal qiladi.
              <div style={{ marginTop: 6, fontSize: 12 }}>
                Telegram bog'lanmagan bo'lsa — rahbaringizdan tiklash havolasini so'rang.
              </div>
            </div>
          )}

          {mode === 'register' && (
            <>
              <div className="maydon-blok">
                <label className="maydon" htmlFor="l-ism">
                  Ismingiz
                </label>
                <IkonliInput
                  id="l-ism"
                  ikon={<UserRound />}
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  required
                  minLength={2}
                  autoComplete="name"
                  placeholder="Ism Familiya"
                />
              </div>
              <div className="maydon-blok">
                <label className="maydon" htmlFor="l-biznes">
                  Biznes nomi
                </label>
                <IkonliInput
                  id="l-biznes"
                  ikon={<Building2 />}
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  required
                  minLength={2}
                  autoComplete="organization"
                  placeholder="Masalan: IT Live Academy"
                />
              </div>
            </>
          )}

          <div className="maydon-blok">
            <label className="maydon" htmlFor="l-email">
              {mode === 'tiklash' ? 'Email yoki login' : 'Email'}
            </label>
            <IkonliInput
              id="l-email"
              ikon={<Mail />}
              type={mode === 'tiklash' ? 'text' : 'email'}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
              placeholder="siz@kompaniya.uz"
            />
          </div>

          {mode !== 'tiklash' && (
            <div className="maydon-blok">
              <div className="label-qator">
                <label className="maydon" htmlFor="l-parol">
                  Parol
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
                    Parolni unutdingizmi?
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
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
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
                <LoaderCircle className="aylanuvchi" /> Kuting…
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
                <ChevronLeft /> Kirishga qaytish
              </a>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
