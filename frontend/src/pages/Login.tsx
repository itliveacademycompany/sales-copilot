import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';

/** Kirish + ro'yxatdan o'tish + parolni tiklash — bitta karta, uch rejim. */
export function Login() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<'login' | 'register' | 'tiklash'>('login');
  const [tiklashYuborildi, setTiklashYuborildi] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="login-fon">
      <form className="login-card" onSubmit={(e) => void submit(e)}>
        <div className="logo">
          Sotuv<em>AI</em>
        </div>
        <div className="kirish-izoh">
          {mode === 'login' && 'Hisobingizga kiring'}
          {mode === 'register' && 'Yangi biznes hisobini yarating — 2 daqiqa'}
          {mode === 'tiklash' && 'Parolni tiklash'}
        </div>

        {error && <div className="xato-banner">{error}</div>}

        {mode === 'tiklash' && tiklashYuborildi && (
          <div className="ok-qator">
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
              <label className="maydon">Ismingiz</label>
              <input
                className="input"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                minLength={2}
              />
            </div>
            <div className="maydon-blok">
              <label className="maydon">Biznes nomi</label>
              <input
                className="input"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                required
                minLength={2}
                placeholder="Masalan: IT Live Academy"
              />
            </div>
          </>
        )}

        <div className="maydon-blok">
          <label className="maydon">{mode === 'tiklash' ? 'Email yoki login' : 'Email'}</label>
          <input
            className="input"
            type={mode === 'tiklash' ? 'text' : 'email'}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="username"
          />
        </div>
        {mode !== 'tiklash' && (
          <div className="maydon-blok">
            <label className="maydon">Parol</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
        )}

        <button
          className="btn"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={busy || (mode === 'tiklash' && tiklashYuborildi)}
        >
          {busy
            ? 'Kuting…'
            : mode === 'login'
              ? 'Kirish'
              : mode === 'register'
                ? 'Ro\'yxatdan o\'tish'
                : 'Tiklash havolasini yuborish'}
        </button>

        {mode === 'login' && (
          <div style={{ marginTop: 10, textAlign: 'center' }}>
            <a
              href="#"
              style={{ color: 'var(--kul-dark)', fontSize: 12 }}
              onClick={(e) => {
                e.preventDefault();
                setMode('tiklash');
                setError('');
                setTiklashYuborildi(false);
              }}
            >
              Parolni unutdingizmi?
            </a>
          </div>
        )}

        <div style={{ marginTop: 14, fontSize: 13, textAlign: 'center', color: 'var(--kul-dark)' }}>
          {mode === 'tiklash' ? (
            <a
              href="#"
              style={{ color: 'var(--ia-text)', fontWeight: 700 }}
              onClick={(e) => {
                e.preventDefault();
                setMode('login');
                setError('');
              }}
            >
              ← Kirishga qaytish
            </a>
          ) : mode === 'login' ? (
            <>
              Hisobingiz yo'qmi?{' '}
              <a
                href="#"
                style={{ color: 'var(--ia-text)', fontWeight: 700 }}
                onClick={(e) => {
                  e.preventDefault();
                  setMode('register');
                  setError('');
                }}
              >
                Ro'yxatdan o'ting
              </a>
            </>
          ) : (
            <>
              Hisobingiz bormi?{' '}
              <a
                href="#"
                style={{ color: 'var(--ia-text)', fontWeight: 700 }}
                onClick={(e) => {
                  e.preventDefault();
                  setMode('login');
                  setError('');
                }}
              >
                Kiring
              </a>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
