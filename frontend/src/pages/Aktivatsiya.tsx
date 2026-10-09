import { AtSign, Lock } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { ParolInput } from '../components/ParolInput';
import { useAuth } from '../auth';

/**
 * FR-04: menejer aktivatsiyasi — rahbar bergan havoladan parol o'rnatish.
 *
 * Rahbar Sozlamalar → Menejerlar'da «Aktivatsiya havolasi»ni oladi va
 * menejerga yuboradi. Menejer shu sahifada parol qo'yadi (login rahbar
 * tomonidan berilmagan bo'lsa, o'zi tanlaydi) va server darhol sessiya
 * ochadi — kirish ekraniga qaytarish ortiqcha qadam bo'lardi.
 *
 * Sahifa `App.tsx` da auth tekshiruvidan OLDIN turadi: menejerda hali hisob yo'q.
 */

interface Malumot {
  displayName: string;
  businessName: string;
  login: string | null;
  expiresAt: string | null;
}

const LOGIN_RE = /^[a-z0-9._-]{3,40}$/;

export function Aktivatsiya() {
  const { token } = useParams<{ token: string }>();
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const [malumot, setMalumot] = useState<Malumot | null>(null);
  const [yuklashXato, setYuklashXato] = useState('');
  const [login, setLogin] = useState('');
  const [parol, setParol] = useState('');
  const [takror, setTakror] = useState('');
  const [xato, setXato] = useState('');
  const [band, setBand] = useState(false);

  useEffect(() => {
    if (!token) return;
    void api
      .post<Malumot>('/api/v1/auth/activate/info', { token })
      .then(setMalumot)
      .catch((err: unknown) => setYuklashXato(err instanceof ApiError ? err.message : "Server bilan bog'lanib bo'lmadi"));
  }, [token]);

  const loginKerak = malumot !== null && malumot.login === null;
  const loginTogri = !loginKerak || LOGIN_RE.test(login.trim().toLowerCase());
  const mos = parol.length >= 10 && parol === takror && loginTogri;

  async function yubor(e: FormEvent) {
    e.preventDefault();
    if (!token || !mos) return;
    setXato('');
    setBand(true);
    try {
      await api.post('/api/v1/auth/activate', {
        token,
        password: parol,
        ...(loginKerak ? { login: login.trim().toLowerCase() } : {}),
      });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setXato(err instanceof ApiError ? err.message : "Server bilan bog'lanib bo'lmadi");
    } finally {
      setBand(false);
    }
  }

  return (
    <div className="login-fon">
      <form className="login-card" onSubmit={(e) => void yubor(e)}>
        <div className="logo">
          Sotuv<em>AI</em>
        </div>

        {yuklashXato ? (
          <>
            <div className="kirish-izoh">Hisobni faollashtirish</div>
            <div className="xato-banner">
              {yuklashXato}
              <div style={{ marginTop: 6, fontSize: 12 }}>Havola bir marta ishlaydi va 7 kun amal qiladi. Rahbaringizdan yangisini so'rang.</div>
            </div>
          </>
        ) : !malumot ? (
          <div className="kirish-izoh" aria-busy="true">
            Havola tekshirilmoqda…
          </div>
        ) : (
          <>
            <div className="kirish-izoh">
              Salom, <b>{malumot.displayName}</b>! <b>{malumot.businessName}</b> jamoasiga kirish uchun parol o'rnating.
            </div>

            {xato && <div className="xato-banner">{xato}</div>}

            <div className="maydon-blok">
              <label className="maydon" htmlFor="akt-login">
                Login
              </label>
              {loginKerak ? (
                <>
                  <input
                    id="akt-login"
                    className="input"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    autoFocus
                    aria-invalid={login.length > 0 && !loginTogri}
                    placeholder="masalan: aziz.karimov"
                  />
                  <div className="yordam" style={login.length > 0 && !loginTogri ? { color: 'var(--past)' } : undefined}>
                    3–40 belgi: lotin harflari, raqam va . _ -
                  </div>
                </>
              ) : (
                <div className="input" id="akt-login" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AtSign style={{ width: 16, height: 16 }} aria-hidden="true" />
                  <b>{malumot.login}</b>
                </div>
              )}
            </div>

            <div className="maydon-blok">
              <label className="maydon">Parol</label>
              <ParolInput
                ikon={<Lock />}
                value={parol}
                onChange={(e) => setParol(e.target.value)}
                required
                minLength={10}
                autoComplete="new-password"
                autoFocus={!loginKerak}
              />
              <div className="yordam">Kamida 10 belgi. Uzunlik murakkablikdan muhimroq.</div>
            </div>

            <div className="maydon-blok">
              <label className="maydon">Parolni takrorlang</label>
              <ParolInput ikon={<Lock />} value={takror} onChange={(e) => setTakror(e.target.value)} required autoComplete="new-password" />
              {takror.length > 0 && parol !== takror && (
                <div className="yordam" style={{ color: 'var(--past)' }}>
                  Parollar mos kelmadi
                </div>
              )}
            </div>

            <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={band || !mos}>
              {band ? 'Faollashtirilmoqda…' : 'Hisobni faollashtirish'}
            </button>

            <div style={{ marginTop: 12, fontSize: 12, textAlign: 'center', color: 'var(--text-muted)' }}>
              Keyingi safar shu login va parol bilan kirasiz.
            </div>
          </>
        )}
      </form>
    </div>
  );
}
