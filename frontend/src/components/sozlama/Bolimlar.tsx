import { Bug, Check, Copy, Info, Mail, Megaphone, PanelLeft, Plus, Send, TriangleAlert, Users, X } from 'lucide-react';
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { TanlovMenyu } from '../analitika/Ochiluvchi';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useTil, type Til } from '../../i18n';
import { api, ApiError, type AuthContext, type BillingStatus, type TelegramIntegration } from '../../api';
import { KATEGORIYALAR, manzilMetaOl, manzilMetaSaqla, sozlamaOl, sozlamaSaqla, type BildirishnomaSozlama, type Kanal, type Kategoriya } from './bildirishnoma';

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

// ─── Bildirishnomalar ───────────────────────────────────────────────────────

const KANAL_USTUNLARI: { k: Kanal; nom: string }[] = [
  { k: 'veb', nom: 'Veb' },
  { k: 'bot', nom: 'Telegram bot' },
  { k: 'guruh', nom: 'Telegram guruh' },
  { k: 'kanal', nom: 'Telegram kanal' },
];

const SOATLAR = Array.from({ length: 24 }, (_, h) => ({ qiymat: String(h), nom: `${String(h).padStart(2, '0')}:00` }));

function Almash({
  yoqilgan,
  onOzgar,
  aria,
  disabled,
  title,
}: {
  yoqilgan: boolean;
  onOzgar?: (v: boolean) => void;
  aria: string;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <label className="vr-almash bn-almash" title={title}>
      <input type="checkbox" role="switch" aria-label={aria} checked={yoqilgan} disabled={disabled} onChange={(e) => onOzgar?.(e.target.checked)} />
      <span className="vr-almash-yol" aria-hidden="true" />
    </label>
  );
}

type TgConfig = { botUsername?: string | null; reportChatId?: string | null; reportHour?: number };

export function Bildirishnomalar({ businessId, boshqaraOladi }: { businessId: string; boshqaraOladi: boolean }) {
  const base = `/api/v1/businesses/${businessId}`;
  const [aslSozlama, setAslSozlama] = useState<BildirishnomaSozlama>(() => sozlamaOl(businessId));
  const [sozlama, setSozlama] = useState<BildirishnomaSozlama>(aslSozlama);
  const [saqlash, setSaqlash] = useState<'tinch' | 'saqlandi' | 'xato'>('tinch');
  const [tg, setTg] = useState<TelegramIntegration | null>(null);
  const [tgYuklandi, setTgYuklandi] = useState(false);
  const [ulashOchiq, setUlashOchiq] = useState(false);
  const [ulashTur, setUlashTur] = useState<'guruh' | 'kanal'>('guruh');
  const manzilRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const tgYukla = useCallback(() => {
    void api
      .get<TelegramIntegration>(`${base}/integrations/telegram`)
      .then(setTg)
      .catch(() => setTg(null))
      .finally(() => setTgYuklandi(true));
  }, [base]);
  useEffect(tgYukla, [tgYukla]);

  const cfg = (tg?.integration?.config ?? {}) as TgConfig;
  const botUlangan = !!tg?.connected;
  const botNomi = cfg.botUsername ? `@${cfg.botUsername.replace(/^@/, '')}` : 'Bot';
  const chatId = botUlangan ? cfg.reportChatId ?? null : null;
  const manzilTuri = chatId ? manzilMetaOl(businessId, chatId)?.tur ?? 'guruh' : null;

  const ozgargan = JSON.stringify(sozlama) !== JSON.stringify(aslSozlama);
  const kanal = (kat: Exclude<Kategoriya, 'kunlik'>, k: Kanal, v: boolean) =>
    setSozlama((s) => ({ ...s, kanallar: { ...s.kanallar, [kat]: { ...s.kanallar[kat], [k]: v } } }));
  const pastSifat = (o: Partial<BildirishnomaSozlama['pastSifat']>) => setSozlama((s) => ({ ...s, pastSifat: { ...s.pastSifat, ...o } }));
  const chegaraTogri = Number.isInteger(sozlama.pastSifat.chegara) && sozlama.pastSifat.chegara >= 0 && sozlama.pastSifat.chegara <= 100;
  const daqiqaTogri = Number.isInteger(sozlama.pastSifat.minDaqiqa) && sozlama.pastSifat.minDaqiqa >= 0 && sozlama.pastSifat.minDaqiqa <= 240;

  /** Manzil bo'limini ochib, ko'rinadigan joyga suradi. */
  const ulashniOch = (t: 'guruh' | 'kanal') => {
    setUlashTur(t);
    setUlashOchiq(true);
    requestAnimationFrame(() => manzilRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  /**
   * Kunlik hisobot qatori — haqiqiy server holati (bot + bog'langan chat).
   * Tugmalar holatni o'zi o'zgartirmaydi: bosilganda tegishli amal boshlanadi
   * (bot sozlamasi, manzil ulash yoki uzish) va holat serverdan qayta o'qiladi.
   */
  const kunlikKatak = (k: Kanal) => {
    if (k === 'veb') return <span className="bn-yoq" title="Kunlik hisobot ilovada «Kunlik hisobot» sahifasida doim ko'rinadi">—</span>;
    if (k === 'bot')
      return (
        <Almash
          yoqilgan={botUlangan}
          aria="Kunlik hisobot — Telegram bot"
          title={botUlangan ? `${botNomi} ulangan — boshqarish uchun bosing` : 'Telegram botni ulash uchun bosing'}
          onOzgar={() => navigate('/sozlamalar?b=integratsiya')}
        />
      );
    const bu = manzilTuri === k;
    return (
      <Almash
        yoqilgan={bu}
        disabled={!boshqaraOladi}
        aria={`Kunlik hisobot — Telegram ${k}`}
        title={
          !boshqaraOladi
            ? "Manzilni faqat integratsiyani boshqaruvchi o'zgartira oladi"
            : bu
              ? "O'chirish — manzilni uzadi"
              : chatId
                ? `Hozir ${manzilTuri}ga yuboriladi — bosib ${k}ga almashtiring`
                : `Yoqish uchun ${k}ni ulang`
        }
        onOzgar={(v) => {
          if (v) ulashniOch(k as 'guruh' | 'kanal');
          else void manzilniUz();
        }}
      />
    );
  };

  const manzilniUz = async () => {
    if (!window.confirm("Telegram manzilini uzasizmi? Kunlik hisobot yuborilmay qoladi.")) return;
    try {
      await api.put(`${base}/reports/daily/settings`, { reportChatId: null });
      tgYukla();
    } catch {
      window.alert("Manzil uzilmadi — qayta urinib ko'ring");
    }
  };

  return (
    <section className="card sz-karta bn-karta">
      <div className="sz-karta-bosh">
        <div>
          <h2>Bildirishnomalar</h2>
          <p>Qaysi ogohlantirishlar yaratilishi va qayerga yuborilishini tanlang.</p>
        </div>
      </div>

      <div className="bn-bolim">
        <b className="bn-sarlavha">Bildirishnoma kanallari</b>
        <div className="bn-jadval-oram">
          <table className="bn-jadval">
            <thead>
              <tr>
                <th scope="col">Ogohlantirish turi</th>
                {KANAL_USTUNLARI.map((u) => (
                  <th key={u.k} scope="col">
                    {u.nom}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {KATEGORIYALAR.map((kat) => (
                <Fragment key={kat.k}>
                  <tr className={kat.k === 'qongiroq' ? 'bn-ochiq' : undefined}>
                    <th scope="row">
                      <b>{kat.nom}</b>
                      <small>{kat.izoh}</small>
                    </th>
                    {KANAL_USTUNLARI.map((u) => (
                      <td key={u.k}>
                        {kat.k === 'kunlik' ? (
                          kunlikKatak(u.k)
                        ) : (
                          <Almash
                            yoqilgan={sozlama.kanallar[kat.k][u.k]}
                            onOzgar={(v) => kanal(kat.k as Exclude<Kategoriya, 'kunlik'>, u.k, v)}
                            aria={`${kat.nom} — ${u.nom}`}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                  {kat.k === 'qongiroq' && (
                    <tr className="bn-ichki-qator">
                      <td colSpan={5}>
                        <div className="bn-ichki">
                          <div className="bn-ichki-karta">
                            <div className="bn-ichki-bosh">
                              <div>
                                <b>Past qo'ng'iroq sifati ogohlantirishi</b>
                                <small>Mos qo'ng'iroq tahlildan keyin chegaradan past baholansa ogohlantirish yarating.</small>
                              </div>
                              <Almash
                                yoqilgan={sozlama.pastSifat.yoqilgan}
                                onOzgar={(v) => pastSifat({ yoqilgan: v })}
                                aria="Past qo'ng'iroq sifati ogohlantirishi"
                              />
                            </div>
                            <div className="bn-ichki-maydonlar">
                              <div className="maydon-blok">
                                <label htmlFor="bn-chegara">Sifat chegarasi (0–100)</label>
                                <input
                                  id="bn-chegara"
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  max={100}
                                  value={Number.isNaN(sozlama.pastSifat.chegara) ? '' : sozlama.pastSifat.chegara}
                                  aria-invalid={!chegaraTogri}
                                  onChange={(e) => pastSifat({ chegara: e.target.value === '' ? NaN : Number(e.target.value) })}
                                />
                                {!chegaraTogri && <div className="yordam bzl-xato">0 dan 100 gacha butun son</div>}
                              </div>
                              <div className="maydon-blok">
                                <label htmlFor="bn-daqiqa">Qo'ng'iroqning minimal davomiyligi (daqiqa)</label>
                                <input
                                  id="bn-daqiqa"
                                  type="number"
                                  inputMode="numeric"
                                  min={0}
                                  max={240}
                                  value={Number.isNaN(sozlama.pastSifat.minDaqiqa) ? '' : sozlama.pastSifat.minDaqiqa}
                                  aria-invalid={!daqiqaTogri}
                                  onChange={(e) => pastSifat({ minDaqiqa: e.target.value === '' ? NaN : Number(e.target.value) })}
                                />
                                {!daqiqaTogri && <div className="yordam bzl-xato">0 dan 240 gacha butun son</div>}
                              </div>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sz-eslatma">
          «Veb» ustuni darhol ishlaydi: o'chirilgan tur Ogohlantirishlar sahifasida yashiriladi. Ogohlantirishlarni Telegram'ga yuborish va past sifat
          chegarasi server tomonida hali yo'q — tanlovlar shu brauzerda saqlanadi. Kunlik hisobot qatori esa haqiqiy holatni ko'rsatadi.
        </p>
      </div>

      <div className="bn-bolim" ref={manzilRef}>
        <div className="bn-manzil-bosh">
          <div>
            <b className="bn-sarlavha">Telegram guruh va kanallari</b>
            <small>Yoqilgan umumiy ogohlantirishlar yuboriladigan manzillarni ulang.</small>
          </div>
          {boshqaraOladi && (
            <button type="button" className={`btn ikkinchi`} aria-expanded={ulashOchiq} onClick={() => setUlashOchiq((v) => !v)}>
              {ulashOchiq ? 'Yopish' : 'Manzilni ulash'}
            </button>
          )}
        </div>

        {ulashOchiq && (
          <ManzilUlash
            businessId={businessId}
            botUlangan={botUlangan}
            botNomi={botNomi}
            boshTur={ulashTur}
            key={ulashTur}
            joriySoat={cfg.reportHour ?? 9}
            onUlandi={() => {
              setUlashOchiq(false);
              tgYukla();
            }}
          />
        )}

        {!tgYuklandi ? (
          <div className="card skelet" style={{ height: 56 }} aria-busy="true" />
        ) : chatId ? (
          <ManzilQatori
            base={base}
            chatId={chatId}
            nom={manzilMetaOl(businessId, chatId)?.nom || null}
            tur={manzilTuri ?? 'guruh'}
            soat={cfg.reportHour ?? 9}
            boshqaraOladi={boshqaraOladi}
            onUz={() => void manzilniUz()}
          />
        ) : (
          <div className="bn-bosh-holat">Hali Telegram guruhi yoki kanali ulanmagan.</div>
        )}
      </div>

      <div className="pr-past">
        {ozgargan && saqlash === 'tinch' && <span className="kr-holat">Saqlanmagan o'zgarishlar bor</span>}
        {saqlash === 'saqlandi' && (
          <span className="kr-holat ok">
            <Check /> Saqlandi
          </span>
        )}
        {saqlash === 'xato' && <span className="kr-holat xato">Brauzer xotirasi yopiq — saqlanmadi</span>}
        <button type="button" className="btn ikkinchi" disabled={!ozgargan} onClick={() => setSozlama(aslSozlama)}>
          Bekor qilish
        </button>
        <button
          type="button"
          className="btn"
          disabled={!ozgargan || !chegaraTogri || !daqiqaTogri}
          onClick={() => {
            const ok = sozlamaSaqla(businessId, sozlama);
            if (ok) setAslSozlama(sozlama);
            setSaqlash(ok ? 'saqlandi' : 'xato');
            setTimeout(() => setSaqlash('tinch'), 2200);
          }}
        >
          Saqlash
        </button>
      </div>
    </section>
  );
}

/** «Manzilni ulash» — guruh/kanal chat ID'sini kunlik hisobot manzili sifatida serverga yozadi. */
function ManzilUlash({
  businessId,
  botUlangan,
  botNomi,
  boshTur,
  joriySoat,
  onUlandi,
}: {
  boshTur: 'guruh' | 'kanal';
  businessId: string;
  botUlangan: boolean;
  botNomi: string;
  joriySoat: number;
  onUlandi: () => void;
}) {
  const base = `/api/v1/businesses/${businessId}`;
  const [tur, setTur] = useState<'guruh' | 'kanal'>(boshTur);
  const [chat, setChat] = useState('');
  const [nom, setNom] = useState('');
  const [soat, setSoat] = useState(String(joriySoat));
  const [holat, setHolat] = useState<'tinch' | 'ketmoqda' | 'xato'>('tinch');
  const [xato, setXato] = useState('');
  const chatTogri = /^-?\d{3,}$/.test(chat.trim());

  if (!botUlangan) {
    return (
      <div className="bzl-izoh" role="status">
        <Info aria-hidden="true" />
        <span>
          Manzil ulash uchun avval Telegram botni ulang. <Link to="/sozlamalar?b=integratsiya">Telegram bot sozlamalari</Link>
        </span>
      </div>
    );
  }

  return (
    <form
      className="bn-ulash"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (!chatTogri) {
          setHolat('xato');
          setXato("Chat ID faqat raqamlardan iborat bo'lishi kerak (guruh va kanallarda odatda -100 bilan boshlanadi)");
          return;
        }
        setHolat('ketmoqda');
        void api
          .put(`${base}/reports/daily/settings`, { reportChatId: chat.trim(), reportHour: Number(soat) })
          .then(() => {
            manzilMetaSaqla(businessId, chat.trim(), { tur, nom: nom.trim() });
            onUlandi();
          })
          .catch((err: unknown) => {
            setHolat('xato');
            setXato(err instanceof Error ? err.message : 'Manzil ulanmadi');
          });
      }}
    >
      <ol className="bn-qadamlar">
        <li>
          <b>{botNomi}</b> botini guruh yoki kanalingizga qo'shing va <b>administrator</b> qiling.
        </li>
        <li>
          Guruh/kanal ID'sini aniqlang — masalan, kanaldagi istalgan xabarni <b>@userinfobot</b> ga uzating yoki guruhga <b>@RawDataBot</b> ni vaqtincha
          qo'shing. ID odatda <code>-100</code> bilan boshlanadi.
          <div className="bn-kod">
            <code>-1001234567890</code>
          </div>
        </li>
        <li>ID'ni quyiga kiriting va ulang — sinov xabari bilan tekshirishingiz mumkin.</li>
      </ol>

      <div className="bn-turlar" role="radiogroup" aria-label="Manzil turi">
        {(['guruh', 'kanal'] as const).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={tur === t} className={`bn-tur${tur === t ? ' faol' : ''}`} onClick={() => setTur(t)}>
            {t === 'guruh' ? 'Guruh' : 'Kanal'}
          </button>
        ))}
      </div>

      <div className="bzl-forma-panjara bn-ulash-panjara">
        <div className="maydon-blok">
          <label htmlFor="bn-chat">Chat ID *</label>
          <input
            id="bn-chat"
            value={chat}
            onChange={(e) => setChat(e.target.value.replace(/\s/g, ''))}
            placeholder="-1001234567890"
            inputMode="numeric"
            spellCheck={false}
            autoFocus
            aria-invalid={holat === 'xato' && !chatTogri}
          />
        </div>
        <div className="maydon-blok">
          <label htmlFor="bn-nom">Nomi</label>
          <input id="bn-nom" value={nom} onChange={(e) => setNom(e.target.value)} placeholder={tur === 'guruh' ? 'Masalan: Sotuv bo\'limi' : 'Masalan: Rahbarlar kanali'} maxLength={60} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="bn-soat">Kunlik hisobot vaqti</label>
          <TanlovMenyu id="bn-soat" aria="Kunlik hisobot vaqti" qiymat={soat} variantlar={SOATLAR} onOzgar={setSoat} kenglik="100%" />
        </div>
      </div>

      {holat === 'xato' && (
        <div className="bzl-izoh xato" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>{xato}</span>
        </div>
      )}
      <p className="sz-eslatma">
        Server bitta manzilni saqlaydi — yangisini ulash avvalgisini almashtiradi. Bir martalik <code>/bind</code> kod orqali avtomatik ulash serverda hali yo'q.
      </p>
      <div>
        <button type="submit" className="btn" disabled={holat === 'ketmoqda' || !chat.trim()}>
          {holat === 'ketmoqda' ? 'Ulanmoqda…' : 'Ulash'}
        </button>
      </div>
    </form>
  );
}

function ManzilQatori({
  base,
  chatId,
  nom,
  tur,
  soat,
  boshqaraOladi,
  onUz,
}: {
  base: string;
  chatId: string;
  nom: string | null;
  tur: 'guruh' | 'kanal';
  soat: number;
  boshqaraOladi: boolean;
  onUz: () => void;
}) {
  const [sinov, setSinov] = useState<{ holat: 'tinch' | 'ketmoqda' | 'ok' | 'xato'; matn?: string }>({ holat: 'tinch' });
  return (
    <div className="bn-manzil">
      <span className="sz-ikon">{tur === 'kanal' ? <Megaphone /> : <Users />}</span>
      <div className="bn-manzil-matn">
        <div>
          <b>{nom ?? (tur === 'kanal' ? 'Telegram kanal' : 'Telegram guruh')}</b>
          <span className="bzl-pill info">{tur === 'kanal' ? 'Kanal' : 'Guruh'}</span>
        </div>
        <small>
          <code>{chatId}</code> · kunlik hisobot har kuni {String(soat).padStart(2, '0')}:00 da
        </small>
        {sinov.holat === 'ok' && <small className="bn-ok">{sinov.matn}</small>}
        {sinov.holat === 'xato' && <small className="bzl-xato">{sinov.matn}</small>}
      </div>
      {boshqaraOladi && (
        <div className="bn-manzil-amal">
          <button
            type="button"
            className="btn ikkinchi"
            disabled={sinov.holat === 'ketmoqda'}
            onClick={() => {
              setSinov({ holat: 'ketmoqda' });
              void api
                .post<{ sent?: boolean; skipped?: string; error?: string }>(`${base}/reports/daily/send`, {})
                .then((r) =>
                  setSinov(
                    r.sent
                      ? { holat: 'ok', matn: 'Hisobot yuborildi — Telegram’ni tekshiring' }
                      : { holat: 'xato', matn: `Yuborilmadi: ${r.skipped ?? r.error ?? 'nomaʼlum sabab'}` },
                  ),
                )
                .catch((e: unknown) => setSinov({ holat: 'xato', matn: e instanceof Error ? e.message : 'Yuborilmadi' }));
            }}
          >
            <Send /> {sinov.holat === 'ketmoqda' ? 'Yuborilmoqda…' : 'Sinov xabari'}
          </button>
          <button type="button" className="bzl-amal bn-uz" onClick={onUz}>
            Uzish
          </button>
        </div>
      )}
    </div>
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
