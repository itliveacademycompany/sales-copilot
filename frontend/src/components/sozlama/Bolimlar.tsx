import { Bug, Check, Copy, Info, Mail, PanelLeft, Plus, TriangleAlert, X } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { TanlovMenyu } from '../analitika/Ochiluvchi';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useTil, type Til } from '../../i18n';
import { api, ApiError, type AuthContext, type BillingStatus } from '../../api';

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
        <div className="kr-mavzular" role="radiogroup" aria-label="Mavzu">
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
        <div className="kr-tillar" role="radiogroup" aria-label="Til">
          {TILLAR.map((t) => (
            <button
              key={t.k}
              type="button"
              role="radio"
              aria-checked={til === t.k}
              className={`kr-til${til === t.k ? ' faol' : ''}`}
              disabled={tilHolat === 'ketmoqda'}
              onClick={() => void tilniSaqla(t.k)}
            >
              <span className="kr-bayroq">{t.bayroq}</span>
              {t.nom}
            </button>
          ))}
        </div>
      </div>

      <div className="kr-bolim">
        <h3>{t('Yon menyu')}</h3>
        <p>{t("Tor — faqat ikonlar va qisqa nom; keng — to'liq nomlar bilan.")}</p>
        <div className="kr-tillar" role="radiogroup" aria-label="Yon menyu">
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

// ─── Bizneslar ──────────────────────────────────────────────────────────────

const ROL: Record<string, string> = { owner: 'Ega', supervisor: 'Rahbar', head: "Bo'lim boshlig'i", auditor: 'Auditor', seller: 'Sotuvchi' };

/** Obuna holati → biznes kartasidagi belgi (rang semantik: yaxshi / ogoh / xavf). */
const OBUNA_HOLAT: Record<BillingStatus['status'], { nom: string; ton: string }> = {
  trial: { nom: 'Sinov davri', ton: 'neytral' },
  active: { nom: 'Faol', ton: 'yaxshi' },
  past_due: { nom: "To'lov kechikdi", ton: 'orta' },
  grace: { nom: 'Imtiyozli davr', ton: 'orta' },
  degraded: { nom: 'Muzlatilgan', ton: 'xavf' },
  cancelled: { nom: 'Bekor qilingan', ton: 'xavf' },
};

type BiznesQator = AuthContext['businesses'][number] & {
  tavsif: string | null;
  holat: BillingStatus['status'] | null;
};

// ─── Yangi biznes shakli ────────────────────────────────────────────────────

/** Nomdan domen (slug): lotin harflari, raqam va chiziqcha. */
const slugYasa = (nom: string) =>
  nom
    .toLowerCase()
    .replace(/[ʻʼ'`‘’]/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);

const BIZNES_TILLARI = [
  { qiymat: 'uz', nom: "O'zbek tili" },
  { qiymat: 'uz-Cyrl', nom: "O'zbek tili (kirill)" },
  { qiymat: 'ru', nom: 'Rus tili' },
  { qiymat: 'en', nom: 'Ingliz tili' },
];

function YangiBiznesForma({ onYaratildi }: { onYaratildi: () => void }) {
  const [nom, setNom] = useState('');
  const [slug, setSlug] = useState('');
  const [slugQolda, setSlugQolda] = useState(false);
  const [tavsif, setTavsif] = useState('');
  const [til, setTil] = useState('uz');
  const [holat, setHolat] = useState<'tinch' | 'ketmoqda' | 'qollanmaydi' | 'xato'>('tinch');
  const [xato, setXato] = useState('');
  const [tegildi, setTegildi] = useState(false);

  const domen = slugQolda ? slug : slugYasa(nom);
  const nomXato = tegildi && nom.trim().length < 2 ? 'Kamida 2 ta belgi' : '';
  const domenXato =
    tegildi && !/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(domen) ? 'Kichik lotin harflari, raqam va chiziqcha — 3–50 belgi' : '';

  const yubor = async (e: FormEvent) => {
    e.preventDefault();
    setTegildi(true);
    if (nom.trim().length < 2 || !/^[a-z0-9](?:[a-z0-9-]{1,48}[a-z0-9])$/.test(domen)) return;
    setHolat('ketmoqda');
    try {
      await api.post('/api/v1/businesses', { name: nom.trim(), slug: domen, locale: til, description: tavsif.trim() || undefined });
      onYaratildi();
    } catch (err) {
      // Server bu yo'lni hali qo'llab-quvvatlamaydi (404/405) — soxta muvaffaqiyat ko'rsatmaymiz
      if (err instanceof ApiError && (err.status === 404 || err.status === 405)) setHolat('qollanmaydi');
      else {
        setHolat('xato');
        setXato(err instanceof Error ? err.message : 'Nomalum xato');
      }
    }
  };

  return (
    <form className="bzl-forma" onSubmit={(e) => void yubor(e)} noValidate>
      <b className="bzl-forma-sarlavha">Yangi biznes yaratish</b>
      <div className="bzl-forma-panjara">
        <div className="maydon-blok">
          <label htmlFor="yb-nom">Nom *</label>
          <input id="yb-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Biznes nomi" maxLength={120} autoFocus aria-invalid={!!nomXato} />
          {nomXato && <div className="yordam bzl-xato">{nomXato}</div>}
        </div>
        <div className="maydon-blok">
          <label htmlFor="yb-domen">Biznes domeni *</label>
          <input
            id="yb-domen"
            value={domen}
            onChange={(e) => {
              setSlugQolda(true);
              setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
            }}
            placeholder="your-business"
            maxLength={50}
            spellCheck={false}
            aria-invalid={!!domenXato}
          />
          {domenXato && <div className="yordam bzl-xato">{domenXato}</div>}
        </div>
        <div className="maydon-blok">
          <label htmlFor="yb-tavsif">Tavsif</label>
          <input id="yb-tavsif" value={tavsif} onChange={(e) => setTavsif(e.target.value)} placeholder="Qisqacha tavsif" maxLength={2000} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="yb-til">Biznes tili *</label>
          <TanlovMenyu id="yb-til" aria="Biznes tili" qiymat={til} variantlar={BIZNES_TILLARI} onOzgar={setTil} kenglik="100%" />
          <div className="yordam">
            Bu playbooklar va tizim ishlaydigan asosiy til. Uni biznes yaratishda bir marta tanlaysiz, keyin o'zgartirib bo'lmaydi. Bu interfeys tili emas.
          </div>
        </div>
      </div>
      {holat === 'qollanmaydi' && (
        <div className="bzl-izoh" role="alert">
          <Info aria-hidden="true" />
          <span>
            Biznes yaratilmadi — server hali ilovadan yangi biznes yaratishni qo'llab-quvvatlamaydi. Administrator bilan bog'laning yoki{' '}
            <Link to="/sozlamalar?b=muammo">so'rov yuboring</Link>.
          </span>
        </div>
      )}
      {holat === 'xato' && (
        <div className="bzl-izoh xato" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>Biznes yaratilmadi: {xato}</span>
        </div>
      )}
      <div>
        <button type="submit" className="btn" disabled={holat === 'ketmoqda'}>
          {holat === 'ketmoqda' ? 'Yaratilmoqda…' : 'Yaratish'}
        </button>
      </div>
    </form>
  );
}

export function Bizneslar({ joriyId }: { joriyId: string }) {
  const [royxat, setRoyxat] = useState<BiznesQator[] | null>(null);
  const [yangi, setYangi] = useState(false);
  const [yangila, setYangila] = useState(0);
  useEffect(() => {
    let tirik = true;
    void api
      .get<AuthContext>('/api/v1/auth/context')
      .then(async (c) => {
        // Har biznes uchun tavsif va obuna holati — biri xato bersa ham qolganlari chiqadi
        const toliq = await Promise.all(
          c.businesses.map(async (b) => {
            const [biz, obuna] = await Promise.all([
              api.get<{ profile?: { businessDescription?: string } | null }>(`/api/v1/businesses/${b.businessId}`).catch(() => null),
              api.get<BillingStatus>(`/api/v1/businesses/${b.businessId}/billing/status`).catch(() => null),
            ]);
            return { ...b, tavsif: biz?.profile?.businessDescription?.trim() || null, holat: obuna?.status ?? null };
          }),
        );
        // Joriy biznes doim birinchi
        toliq.sort((a, b) => Number(b.businessId === joriyId) - Number(a.businessId === joriyId));
        if (tirik) setRoyxat(toliq);
      })
      .catch(() => tirik && setRoyxat([]));
    return () => {
      tirik = false;
    };
  }, [joriyId, yangila]);

  return (
    <section className="card sz-karta bzl-karta">
      <div className="sz-karta-bosh">
        <div>
          <h2>Bizneslarni boshqarish</h2>
          <p>Bizneslaringizni yarating va boshqaring.</p>
        </div>
        <button type="button" className={yangi ? "btn ikkinchi" : "btn"} aria-expanded={yangi} onClick={() => setYangi((v) => !v)}>
          {yangi ? (
            "Bekor qilish"
          ) : (
            <>
              <Plus /> Yangi biznes
            </>
          )}
        </button>
      </div>
      {yangi && (
        <YangiBiznesForma
          onYaratildi={() => {
            setYangi(false);
            setYangila((n) => n + 1);
          }}
        />
      )}
      {!royxat ? (
        <div className="card skelet" style={{ height: 72 }} aria-busy="true" />
      ) : royxat.length === 0 ? (
        <p className="sz-eslatma">Bizneslar ro'yxatini yuklab bo'lmadi.</p>
      ) : (
        <ul className="bzl-royxat">
          {royxat.map((b) => {
            const joriy = b.businessId === joriyId;
            const h = b.holat ? OBUNA_HOLAT[b.holat] : null;
            return (
              <li key={b.businessId} className={joriy ? 'joriy' : undefined}>
                <div className="bzl-matn">
                  <div className="bzl-nom">
                    <b>{b.name}</b>
                    {joriy && <span className="bzl-pill joriy">Joriy</span>}
                    {h && <span className={`bzl-pill ${h.ton}`}>{h.nom}</span>}
                    <span className="bzl-rol">{ROL[b.role] ?? b.role}</span>
                  </div>
                  <p>{b.tavsif ?? <i>Tavsif kiritilmagan</i>}</p>
                </div>
                {joriy ? (
                  <Link to="/sozlamalar?b=biznes" className="bzl-amal">
                    Tahrirlash
                  </Link>
                ) : (
                  <span className="bzl-amal ochiq-emas" title="Bizneslar orasida almashish hozircha qo'llab-quvvatlanmaydi">
                    Tahrirlash
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {royxat && royxat.length > 1 && (
        <p className="sz-eslatma">Bizneslar orasida almashish hozircha qo'llab-quvvatlanmaydi — faqat joriy biznesni tahrirlash mumkin.</p>
      )}
    </section>
  );
}

// ─── Muammo haqida xabar berish ─────────────────────────────────────────────

export function MuammoXabari({ biznes, foydalanuvchi }: { biznes: string; foydalanuvchi: string }) {
  const [ochiq, setOchiq] = useState(false);
  return (
    <section className="card sz-karta mx-karta">
      <div className="mx-bosh">
        <h2>Xabar yuborish</h2>
        <p>
          Agar sizda tavsiyalar, talablar, texnik muammolar yoki buglar bo'lsa, shu yerga yozing. Kerak bo'lsa, batafsil ma'lumot uchun siz bilan
          bog'lanamiz. Barcha taklif va tavsiyalar inobatga olinadi.
        </p>
      </div>
      <div className="mx-amal">
        <button type="button" className="mx-tugma" aria-haspopup="dialog" onClick={() => setOchiq(true)}>
          <Bug aria-hidden="true" /> Muammo haqida xabar berish
        </button>
      </div>
      {ochiq && <MuammoOynasi biznes={biznes} foydalanuvchi={foydalanuvchi} onYop={() => setOchiq(false)} />}
    </section>
  );
}

function MuammoOynasi({ biznes, foydalanuvchi, onYop }: { biznes: string; foydalanuvchi: string; onYop: () => void }) {
  const [tur, setTur] = useState('Xato');
  const [matn, setMatn] = useState('');
  const [nusxa, setNusxa] = useState(false);
  useEffect(() => {
    const tugma = (e: KeyboardEvent) => e.key === 'Escape' && onYop();
    window.addEventListener('keydown', tugma);
    return () => window.removeEventListener('keydown', tugma);
  }, [onYop]);

  const kontekst = [
    `Biznes: ${biznes}`,
    `Foydalanuvchi: ${foydalanuvchi}`,
    `Sahifa: ${window.location.pathname}`,
    `Brauzer: ${navigator.userAgent}`,
    `Ekran: ${window.innerWidth}×${window.innerHeight}`,
    `Vaqt: ${new Date().toLocaleString('uz')}`,
  ].join('\n');
  const toliq = `[${tur}] ${matn.trim()}\n\n— Texnik ma'lumot —\n${kontekst}`;
  const tayyor = matn.trim().length >= 10;

  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && onYop()}>
      <div className="vr-oyna mx-oyna" role="dialog" aria-modal="true" aria-labelledby="mx-nom">
        <div className="vr-oyna-bosh">
          <h3 id="mx-nom">Muammo haqida xabar berish</h3>
          <button type="button" className="mj-yop" onClick={onYop} aria-label="Yopish">
            <X />
          </button>
        </div>
        <p className="sz-eslatma">Nima bo'lganini yozing — texnik ma'lumot avtomatik qo'shiladi.</p>
        <div className="sz-turlar" role="radiogroup" aria-label="Xabar turi">
          {['Xato', 'Taklif', 'Savol'].map((t) => (
            <button key={t} type="button" role="radio" aria-checked={tur === t} className={`chip-tugma${tur === t ? ' faol' : ''}`} onClick={() => setTur(t)}>
              {t}
            </button>
          ))}
        </div>
        <div className="maydon-blok">
          <label htmlFor="sz-muammo">Tavsif</label>
          <textarea
            id="sz-muammo"
            rows={5}
            value={matn}
            autoFocus
            onChange={(e) => setMatn(e.target.value)}
            placeholder="Masalan: Analitika → Vazifalar tahlilida «Bugun uchun» kartasi bosilganda ro'yxat bo'sh chiqyapti"
          />
          <div className="yordam">Kamida 10 belgi. Qadamlarni yozsangiz, tezroq tuzatiladi.</div>
        </div>
        <details className="sz-kontekst">
          <summary>Qo'shiladigan texnik ma'lumot</summary>
          <pre>{kontekst}</pre>
        </details>
        <p className="sz-eslatma">Ilovada qo'llab-quvvatlash xizmati manzili hali sozlanmagan — matnni nusxalab yoki email orqali odatdagi aloqa kanalingizga yuboring.</p>
        <div className="vr-oyna-past">
          <a
            className={`btn ikkinchi${tayyor ? '' : ' o-chiq'}`}
            aria-disabled={!tayyor}
            href={tayyor ? `mailto:?subject=${encodeURIComponent(`SotuvAI: ${tur}`)}&body=${encodeURIComponent(toliq)}` : undefined}
          >
            <Mail /> Email orqali yuborish
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
            {nusxa ? <Check /> : <Copy />} {nusxa ? 'Nusxalandi' : 'Nusxalash'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
