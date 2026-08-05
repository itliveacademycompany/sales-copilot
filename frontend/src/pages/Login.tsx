import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';

/** Kirish + ro'yxatdan o'tish — bitta karta, ikki rejim. */
export function Login() {
  const { refresh } = useAuth();
  const [mode, setMode] = useState<'login' | 'register'>('login');
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
          {mode === 'login'
            ? 'Hisobingizga kiring'
            : 'Yangi biznes hisobini yarating — 2 daqiqa'}
        </div>

        {error && <div className="xato-banner">{error}</div>}

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
          <label className="maydon">Email</label>
          <input
            className="input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
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

        <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
          {busy ? 'Kuting…' : mode === 'login' ? 'Kirish' : 'Ro\'yxatdan o\'tish'}
        </button>

        <div style={{ marginTop: 14, fontSize: 13, textAlign: 'center', color: 'var(--kul-dark)' }}>
          {mode === 'login' ? (
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
