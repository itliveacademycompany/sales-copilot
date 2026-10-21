import { Bug, Check, Copy, Mail, PanelLeft, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../auth';
import { useT, useTil, type Til } from '../../i18n';
import { api } from '../../api';

/**
 * Sozlamalardagi yangi bo'limlar. Har biri faqat haqiqatan ishlaydigan narsani
 * ko'rsatadi: backendda maydoni yo'q sozlama "shu brauzerda saqlanadi" deb
 * ochiq yoziladi — foydalanuvchi uni butun jamoa uchun deb o'ylamasin.
 */

const MAVZU_KALIT = 'sotuvai-mavzu';
const MENYU_KALIT = 'sotuvai-menyu';

function oqi(k: string, z: string) {
  try {
    return localStorage.getItem(k) ?? z;
  } catch {
    return z;
  }
}
function yoz(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* xotira yopiq — tanlov shu sessiyada qoladi */
  }
}

// ─── Ko'rinish ──────────────────────────────────────────────────────────────

export function Korinish() {
  const { refresh } = useAuth();
  // Interfeys tili — tanlanganda DARHOL almashadi, keyin serverga saqlanadi
  const { til, setTil, t } = useTil();
  const [mavzu, setMavzu] = useState(() => oqi(MAVZU_KALIT, 'light'));
  const [menyu, setMenyu] = useState(() => (oqi(MENYU_KALIT, 'tor') === 'keng' ? 'keng' : 'tor'));
  const [tilHolat, setTilHolat] = useState<'tinch' | 'ketmoqda' | 'ok' | 'xato'>('tinch');

  const mavzuniQoll = (v: string) => {
    setMavzu(v);
    yoz(MAVZU_KALIT, v);
    const root = document.documentElement;
    if (v === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', v);
  };
  const menyuniQoll = (v: 'keng' | 'tor') => {
    setMenyu(v);
    yoz(MENYU_KALIT, v);
    window.dispatchEvent(new CustomEvent('sotuvai-menyu', { detail: v === 'keng' }));
  };
  async function tilniSaqla(v: Til) {
    if (v === til) return;
    const eski = til;
    setTil(v);
    setTilHolat('ketmoqda');
    try {
      await api.patch('/api/v1/auth/me', { locale: v });
      await refresh();
      setTilHolat('ok');
      setTimeout(() => setTilHolat('tinch'), 2000);
    } catch {
      setTil(eski);
      setTilHolat('xato');
    }
  }

  const MAVZULAR = [
    { k: 'system', nom: 'Tizim' },
    { k: 'light', nom: "Yorug'" },
    { k: 'dark', nom: "Qorong'i" },
  ];
  const TILLAR = [
    { k: 'uz' as Til, nom: "O'zbekcha", bayroq: <BayroqUz /> },
    { k: 'en' as Til, nom: 'English', bayroq: <BayroqGb /> },
    { k: 'ru' as Til, nom: 'Русский', bayroq: <BayroqRu /> },
  ];

  return (
    <section className="card kr-karta">
      <header className="kr-bosh">
        <h2>{t("Ko'rinish")}</h2>
        <p>{t("Ilovaning yorug', qorong'i yoki tizim ko'rinishini va til sozlamasini tanlang.")}</p>
      </header>

      <div className="kr-bolim">
        <h3>{t('Mavzu')}</h3>
        <p>{t("Yorug', Qorong'i yoki Tizim rejimini tanlang. Tizim rejimi qurilma sozlamalariga amal qiladi.")}</p>
        <div className="kr-mavzular" role="radiogroup" aria-label={t('Mavzu')}>
          {MAVZULAR.map((m) => (
            <button key={m.k} type="button" role="radio" aria-checked={mavzu === m.k} className={`kr-mavzu${mavzu === m.k ? ' faol' : ''}`} onClick={() => mavzuniQoll(m.k)}>
              <span className={`kr-namuna ${m.k}`} aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="kr-qator">
                    {i > 0 && <i className="kr-doira" />}
                    <span className="kr-chiziqlar">
                      <i />
                      {i === 0 && <i className="qisqa" />}
                    </span>
                  </span>
                ))}
              </span>
              <span className="kr-nom">
                {mavzu === m.k && <Check />} {t(m.nom)}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="kr-bolim">
        <h3>
          {t('Til')}
          {tilHolat === 'ketmoqda' && <small className="kr-holat">{t('Saqlanmoqda…')}</small>}
          {tilHolat === 'ok' && (
            <small className="kr-holat ok">
              <Check /> {t('Saqlandi')}
            </small>
          )}
          {tilHolat === 'xato' && <small className="kr-holat xato">{t("Saqlanmadi — qayta urinib ko'ring")}</small>}
        </h3>
        <p>{t("Interfeys tilini tanlang. Tarjima bosqichma-bosqich qo'shilmoqda — tarjima qilinmagan matnlar o'zbekcha qoladi.")}</p>
        <div className="kr-tillar" role="radiogroup" aria-label={t('Til')}>
          {TILLAR.map((tl) => (
            <button
              key={tl.k}
              type="button"
              role="radio"
              aria-checked={til === tl.k}
              className={`kr-til${til === tl.k ? ' faol' : ''}`}
              disabled={tilHolat === 'ketmoqda'}
              onClick={() => void tilniSaqla(tl.k)}
            >
              <span className="kr-bayroq">{tl.bayroq}</span>
              {tl.nom}
            </button>
          ))}
        </div>
      </div>

      <div className="kr-bolim">
        <h3>{t('Yon menyu')}</h3>
        <p>{t("Tor — faqat ikonlar va qisqa nom; keng — to'liq nomlar bilan.")}</p>
        <div className="kr-tillar" role="radiogroup" aria-label={t('Yon menyu')}>
          {(
            [
              ['tor', 'Tor'],
              ['keng', 'Keng'],
            ] as const
          ).map(([k, nom]) => (
            <button key={k} type="button" role="radio" aria-checked={menyu === k} className={`kr-til${menyu === k ? ' faol' : ''}`} onClick={() => menyuniQoll(k)}>
              <PanelLeft /> {t(nom)}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

/* Bayroqlar — kichik SVG (rasm yuklamasdan) */
function BayroqUz() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="8" fill="#1eb5e6" />
      <rect y="8" width="24" height="8" fill="#fff" />
      <rect y="16" width="24" height="8" fill="#1eb53a" />
      <rect y="7.5" width="24" height="1" fill="#ce1126" />
      <rect y="15.5" width="24" height="1" fill="#ce1126" />
      <circle cx="6" cy="4" r="2.2" fill="#fff" />
      <circle cx="6.9" cy="4" r="2" fill="#1eb5e6" />
    </svg>
  );
}
function BayroqGb() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" fill="#012169" />
      <path d="M0 0 24 24M24 0 0 24" stroke="#fff" strokeWidth="5" />
      <path d="M0 0 24 24M24 0 0 24" stroke="#c8102e" strokeWidth="2" />
      <path d="M12 0v24M0 12h24" stroke="#fff" strokeWidth="7" />
      <path d="M12 0v24M0 12h24" stroke="#c8102e" strokeWidth="4" />
    </svg>
  );
}
function BayroqRu() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="8" fill="#fff" />
      <rect y="8" width="24" height="8" fill="#0039a6" />
      <rect y="16" width="24" height="8" fill="#d52b1e" />
    </svg>
  );
}

// ─── Muammo haqida xabar berish ─────────────────────────────────────────────

export function MuammoXabari({ biznes, foydalanuvchi }: { biznes: string; foydalanuvchi: string }) {
  const t = useT();
  const [ochiq, setOchiq] = useState(false);
  return (
    <section className="card sz-karta mx-karta">
      <div className="mx-bosh">
        <h2>{t('Xabar yuborish')}</h2>
        <p>
          {t("Agar sizda tavsiyalar, talablar, texnik muammolar yoki buglar bo'lsa, shu yerga yozing. Kerak bo'lsa, batafsil ma'lumot uchun siz bilan bog'lanamiz. Barcha taklif va tavsiyalar inobatga olinadi.")}
        </p>
      </div>
      <div className="mx-amal">
        <button type="button" className="mx-tugma" aria-haspopup="dialog" onClick={() => setOchiq(true)}>
          <Bug aria-hidden="true" /> {t('Muammo haqida xabar berish')}
        </button>
      </div>
      {ochiq && <MuammoOynasi biznes={biznes} foydalanuvchi={foydalanuvchi} onYop={() => setOchiq(false)} />}
    </section>
  );
}

function MuammoOynasi({ biznes, foydalanuvchi, onYop }: { biznes: string; foydalanuvchi: string; onYop: () => void }) {
  const t = useT();
  const [tur, setTur] = useState('Xato');
  const [matn, setMatn] = useState('');
  const [nusxa, setNusxa] = useState(false);
  useEffect(() => {
    const tugma = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    window.addEventListener('keydown', tugma);
    return () => window.removeEventListener('keydown', tugma);
  }, [onYop]);

  const kontekst = [
    t('Biznes: {v}', { v: biznes }),
    t('Foydalanuvchi: {v}', { v: foydalanuvchi }),
    t('Sahifa: {v}', { v: window.location.pathname }),
    t('Brauzer: {v}', { v: navigator.userAgent }),
    t('Ekran: {v}', { v: `${window.innerWidth}×${window.innerHeight}` }),
    t('Vaqt: {v}', { v: new Date().toLocaleString('uz') }),
  ].join('\n');
  const toliq = `[${t(tur)}] ${matn.trim()}\n\n— ${t("Texnik ma'lumot")} —\n${kontekst}`;
  const tayyor = matn.trim().length >= 10;

  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <div className="vr-oyna mx-oyna" role="dialog" aria-modal="true" aria-labelledby="mx-nom">
        <div className="vr-oyna-bosh">
          <h3 id="mx-nom">{t('Muammo haqida xabar berish')}</h3>
          <button type="button" className="mj-yop" onClick={onYop} aria-label={t('Yopish')}>
            <X />
          </button>
        </div>
        <p className="sz-eslatma">{t("Nima bo'lganini yozing — texnik ma'lumot avtomatik qo'shiladi.")}</p>
        <div className="sz-turlar" role="radiogroup" aria-label={t('Xabar turi')}>
          {['Xato', 'Taklif', 'Savol'].map((k) => (
            <button key={k} type="button" role="radio" aria-checked={tur === k} className={`chip-tugma${tur === k ? ' faol' : ''}`} onClick={() => setTur(k)}>
              {t(k)}
            </button>
          ))}
        </div>
        <div className="maydon-blok">
          <label htmlFor="sz-muammo">{t('Tavsif')}</label>
          <textarea
            id="sz-muammo"
            rows={5}
            value={matn}
            autoFocus
            onChange={(e) => setMatn(e.target.value)}
            placeholder={t("Masalan: Analitika → Vazifalar tahlilida «Bugun uchun» kartasi bosilganda ro'yxat bo'sh chiqyapti")}
          />
          <div className="yordam">{t('Kamida 10 belgi. Qadamlarni yozsangiz, tezroq tuzatiladi.')}</div>
        </div>
        <details className="sz-kontekst">
          <summary>{t("Qo'shiladigan texnik ma'lumot")}</summary>
          <pre>{kontekst}</pre>
        </details>
        <p className="sz-eslatma">{t("Ilovada qo'llab-quvvatlash xizmati manzili hali sozlanmagan — matnni nusxalab yoki email orqali odatdagi aloqa kanalingizga yuboring.")}</p>
        <div className="vr-oyna-past">
          <a
            className={`btn ikkinchi${tayyor ? '' : ' o-chiq'}`}
            aria-disabled={!tayyor}
            href={tayyor ? `mailto:?subject=${encodeURIComponent(`SotuvAI: ${t(tur)}`)}&body=${encodeURIComponent(toliq)}` : undefined}
          >
            <Mail /> {t('Email orqali yuborish')}
          </a>
          <button
            type="button"
            className="btn"
            disabled={!tayyor}
            onClick={() => {
              void navigator.clipboard.writeText(toliq).then(() => {
                setNusxa(true);
                setTimeout(() => setNusxa(false), 2000);
              });
            }}
          >
            {nusxa ? <Check /> : <Copy />} {nusxa ? t('Nusxalandi') : t('Nusxalash')}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
