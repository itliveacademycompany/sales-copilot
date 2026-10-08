import { Lock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { ParolInput } from '../components/ParolInput';
import { useAuth } from '../auth';

/**
 * FR-06: havoladan kelgan token bilan yangi parol o'rnatish.
 *
 * Bu sahifa kirmagan foydalanuvchiga ko'rinadi, shuning uchun u
 * `App.tsx` dagi auth tekshiruvidan OLDIN turadi — aks holda parolni
 * unutgan odam kirish ekranidan nariga o'ta olmasdi.
 *
 * Muvaffaqiyatli tiklashdan keyin server yangi sessiya cookie'sini
 * o'rnatadi, ya'ni foydalanuvchi darhol ichkarida bo'ladi. Uni yana
 * kirish ekraniga qaytarish ortiqcha qadam bo'lardi.
 */
export function PasswordReset() {
  const { token } = useParams<{ token: string }>();
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const [parol, setParol] = useState('');
  const [takror, setTakror] = useState('');
  const [xato, setXato] = useState('');
  const [band, setBand] = useState(false);

  const mos = parol.length >= 10 && parol === takror;

  async function yubor(e: FormEvent) {
    e.preventDefault();
    if (!token || !mos) return;
    setXato('');
    setBand(true);
    try {
      await api.post('/api/v1/auth/password-reset/confirm', { token, newPassword: parol });
      await refresh();
      navigate('/', { replace: true });
    } catch (err) {
      setXato(err instanceof ApiError ? err.message : 'Server bilan bog\'lanib bo\'lmadi');
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
        <div className="kirish-izoh">Yangi parol o'rnating</div>

        {xato && (
          <div className="xato-banner">
            {xato}
            <div style={{ marginTop: 6, fontSize: 12 }}>
              Havola eskirgan bo'lsa, kirish ekranidan yangisini so'rang.
            </div>
          </div>
        )}

        <div className="maydon-blok">
          <label className="maydon">Yangi parol</label>
          <ParolInput
            ikon={<Lock />}
            value={parol}
            onChange={(e) => setParol(e.target.value)}
            required
            minLength={10}
            autoComplete="new-password"
            autoFocus
          />
          <div className="yordam">Kamida 10 belgi. Uzunlik murakkablikdan muhimroq.</div>
        </div>

        <div className="maydon-blok">
          <label className="maydon">Parolni takrorlang</label>
          <ParolInput
            ikon={<Lock />}
            value={takror}
            onChange={(e) => setTakror(e.target.value)}
            required
            autoComplete="new-password"
          />
          {takror.length > 0 && parol !== takror && (
            <div className="yordam" style={{ color: 'var(--past)' }}>
              Parollar mos kelmadi
            </div>
          )}
        </div>

        <button
          className="btn"
          style={{ width: '100%', justifyContent: 'center' }}
          disabled={band || !mos}
        >
          {band ? 'Saqlanmoqda…' : 'Parolni o\'rnatish'}
        </button>

        <div style={{ marginTop: 12, fontSize: 12, textAlign: 'center', color: 'var(--kul-dark)' }}>
          Parol o'zgargach barcha qurilmalardagi eski sessiyalar bekor qilinadi.
        </div>
      </form>
    </div>
  );
}
