import { CircleCheck } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useT } from '../i18n';
import './crm/crm-ilova.css';
import './crm/crm-ilova-2.css';

interface OchiqMaydon {
  key: string;
  label: string;
  type: 'text' | 'phone' | 'email' | 'textarea' | 'select' | 'number' | 'date' | 'checkbox';
  required: boolean;
  options?: string[];
  placeholder?: string;
}

interface OchiqForma {
  title: string;
  description: string | null;
  thankYou: string | null;
  fields: OchiqMaydon[];
}

/**
 * Ochiq veb-forma (FORM-*): kirishsiz, saytga iframe bilan joylanadi.
 * Server maydonlarni o'zi xaritalaydi; mijoz faqat qiymat yuboradi.
 * Bir martalik `submissionId` — qayta bosilsa dubl murojaat bo'lmaydi.
 */
export function FormaSahifa() {
  const { slug } = useParams<{ slug: string }>();
  const t = useT();
  const [forma, setForma] = useState<OchiqForma | null>(null);
  const [topilmadi, setTopilmadi] = useState(false);
  const [qiymat, setQiymat] = useState<Record<string, string | boolean>>({});
  const [tuzoq, setTuzoq] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [rahmat, setRahmat] = useState<string | null>(null);
  const submissionId = useMemo(() => crypto.randomUUID(), []);

  useEffect(() => {
    void fetch(`/api/v1/public/forms/${slug}`)
      .then(async (r) => {
        if (!r.ok) throw new Error();
        setForma((await r.json()) as OchiqForma);
      })
      .catch(() => setTopilmadi(true));
  }, [slug]);

  const yubor = async (e: FormEvent) => {
    e.preventDefault();
    if (!forma) return;
    for (const m of forma.fields) {
      if (m.required && !qiymat[m.key]) return setXato(t('«{n}» maydonini to‘ldiring', { n: m.label }));
    }
    setBand(true);
    setXato(null);
    try {
      const r = await fetch(`/api/v1/public/forms/${slug}/submit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ values: qiymat, submissionId, website: tuzoq || undefined, page: document.referrer.slice(0, 500) || undefined }),
      });
      const j = (await r.json().catch(() => ({}))) as { thankYou?: string | null; title?: string };
      if (!r.ok) throw new Error(j.title ?? '');
      setRahmat(j.thankYou || t('Rahmat! Murojaatingiz qabul qilindi, tez orada bog‘lanamiz.'));
    } catch (err) {
      setXato((err as Error).message ? t((err as Error).message) : t("Yuborib bo'lmadi. Qayta urinib ko'ring."));
      setBand(false);
    }
  };

  return (
    <main className="ci-ochiq-forma">
      {topilmadi && <div className="card ci-ochiq-karta">{t('Forma topilmadi yoki o‘chirilgan')}</div>}
      {!forma && !topilmadi && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
      {forma && rahmat && (
        <div className="card ci-ochiq-karta ci-rahmat" role="status">
          <CircleCheck aria-hidden="true" />
          <p>{rahmat}</p>
        </div>
      )}
      {forma && !rahmat && (
        <form className="card ci-ochiq-karta" onSubmit={(e) => void yubor(e)} noValidate>
          <h1>{forma.title}</h1>
          {forma.description && <p className="yordam">{forma.description}</p>}
          {forma.fields.map((m) => (
            <div className="maydon-blok" key={m.key}>
              {m.type === 'checkbox' ? (
                <label className="ci-belgi">
                  <input type="checkbox" checked={qiymat[m.key] === true} onChange={(e) => setQiymat({ ...qiymat, [m.key]: e.target.checked })} />
                  <span>
                    {m.label}
                    {m.required && <span className="ci-majburiy"> *</span>}
                  </span>
                </label>
              ) : (
                <>
                  <label htmlFor={`f-${m.key}`}>
                    {m.label}
                    {m.required && <span className="ci-majburiy"> *</span>}
                  </label>
                  {m.type === 'textarea' ? (
                    <textarea id={`f-${m.key}`} rows={3} maxLength={5000} required={m.required} value={String(qiymat[m.key] ?? '')} onChange={(e) => setQiymat({ ...qiymat, [m.key]: e.target.value })} />
                  ) : m.type === 'select' ? (
                    <select id={`f-${m.key}`} className="input" required={m.required} value={String(qiymat[m.key] ?? '')} onChange={(e) => setQiymat({ ...qiymat, [m.key]: e.target.value })}>
                      <option value="">{t('— tanlang —')}</option>
                      {(m.options ?? []).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      id={`f-${m.key}`}
                      className="input"
                      required={m.required}
                      type={m.type === 'phone' ? 'tel' : m.type === 'email' ? 'email' : m.type === 'number' ? 'number' : m.type === 'date' ? 'date' : 'text'}
                      autoComplete={m.type === 'phone' ? 'tel' : m.type === 'email' ? 'email' : undefined}
                      maxLength={500}
                      placeholder={m.placeholder ?? (m.type === 'phone' ? '+998 90 123 45 67' : undefined)}
                      value={String(qiymat[m.key] ?? '')}
                      onChange={(e) => setQiymat({ ...qiymat, [m.key]: e.target.value })}
                    />
                  )}
                </>
              )}
            </div>
          ))}
          {/* Bot tuzog'i — ekranda ko'rinmaydi, odam to'ldirmaydi */}
          <div className="ci-tuzoq" aria-hidden="true">
            <label htmlFor="f-website">Website</label>
            <input id="f-website" tabIndex={-1} autoComplete="off" value={tuzoq} onChange={(e) => setTuzoq(e.target.value)} />
          </div>
          {xato && (
            <div className="xato-qator" role="alert">
              {xato}
            </div>
          )}
          <button className="btn" type="submit" disabled={band}>
            {band ? t('Yuborilmoqda…') : t('Yuborish')}
          </button>
        </form>
      )}
    </main>
  );
}
