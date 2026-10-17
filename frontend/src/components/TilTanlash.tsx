import { api } from '../api';
import { useAuth } from '../auth';
import { useTil, type Til } from '../i18n';

/**
 * Interfeys tili: UZ · RU · EN — landing tepa paneli va platforma tepa
 * panelida bir xil komponent.
 *
 * Til ilovaning umumiy holatini (`useTil`) darhol o'zgartiradi. Kirgan
 * foydalanuvchida tanlov profilga ham yoziladi (Sozlamalar → Ko'rinish
 * bilan bir xil) — aks holda keyingi kirishda profildagi eski til qaytardi.
 * Mehmon tanlovi esa kirgandan keyin TilProvider tomonidan yoziladi.
 */

const TILLAR: { til: Til; qisqa: string; nom: string }[] = [
  { til: 'uz', qisqa: 'UZ', nom: "O'zbekcha" },
  { til: 'ru', qisqa: 'RU', nom: 'Русский' },
  { til: 'en', qisqa: 'EN', nom: 'English' },
];

export function TilTanlash({ className }: { className?: string }) {
  const { til, setTil, t } = useTil();
  const { user } = useAuth();

  const tanla = (yangi: Til) => {
    if (yangi === til) return;
    setTil(yangi);
    if (user) void api.patch('/api/v1/auth/me', { locale: yangi }).catch(() => undefined);
  };

  return (
    <div className={`til-tanlash${className ? ` ${className}` : ''}`} role="group" aria-label={t('Interfeys tili')}>
      {TILLAR.map((v) => (
        <button
          key={v.til}
          type="button"
          lang={v.til}
          className={til === v.til ? 'faol' : undefined}
          aria-pressed={til === v.til}
          title={v.nom}
          onClick={() => tanla(v.til)}
        >
          {v.qisqa}
        </button>
      ))}
    </div>
  );
}
