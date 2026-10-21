import { Check, CirclePause, CirclePlay, Copy, Dices, ExternalLink, Globe, Link2, Lock, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, fmtSana } from '../../api';
import { tarjima, useT } from '../../i18n';
import { ParolInput } from '../ParolInput';
import './mijozlar.css';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → MIJOZLAR (SaaS, faqat super admin)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bitta tugma: biznes nomi, subdomen, ega emaili (login) va parol — kabinet
 * darhol `<subdomen>.<domen>` da ishlaydi. Server biznes, ega va sinov
 * obunasini bitta tranzaksiyada yaratadi. Login va parolni faqat admin
 * beradi: mijoz o'zi parol tiklay olmaydi, unutsa admin «Tahrirlash»
 * orqali yangisini beradi.
 *
 * Har qatorda: Ochish, manzilni Nusxalash (subdomen bir marta beriladi va
 * o'zgarmaydi), Tahrirlash (kabinet + ega), Faolsizlantirish, O'chirish.
 *
 * Subdomen biznes nomidan avtomatik taklif qilinadi (lotinlashtiriladi)
 * va yozish davomida serverda tekshiriladi: format, zaxira so'zlar, bandlik.
 */

interface Mijoz {
  id: string;
  slug: string;
  name: string;
  locale: string;
  createdAt: string;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerActivated: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  members: number;
  seats: number;
  url: string | null;
  slugYaroqli: boolean;
  /** Faolsizlantirilgan payt (null — faol). */
  suspendedAt: string | null;
}

interface Royxat {
  rootDomain: string;
  rootUrl: string;
  items: Mijoz[];
}

/** Yaratish natijasi. `parol` — faqat shu ekranda ko'rinadi, serverda xesh holida. */
interface Yaratildi {
  mijoz: Mijoz;
  parol: string | null;
}

/** Serverdagi MIN_PASSWORD_LENGTH bilan bir xil. */
const PAROL_MIN = 10;

const emailTogrimi = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

/** Ko'p ishlatiladigan pochta domenlari — xato yozilganini ushlash uchun. */
const POCHTA_DOMENLARI = [
  'gmail.com', 'mail.ru', 'yandex.ru', 'yandex.com', 'ya.ru', 'inbox.ru', 'list.ru', 'bk.ru', 'rambler.ru',
  'icloud.com', 'outlook.com', 'hotmail.com', 'live.com', 'yahoo.com', 'proton.me', 'protonmail.com',
];

/** Damerau-Levenshtein (qo'shni harflar almashinuvi = 1 xato): "gamil" ↔ "gmail" = 1. */
function masofa(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const narx = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + narx);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i]![j] = Math.min(d[i]![j]!, d[i - 2]![j - 2]! + 1);
    }
  }
  return d[a.length]![b.length]!;
}

/**
 * Email domeni mashhur pochtaga juda yaqin, lekin teng bo'lmasa — to'g'ri
 * variantni taklif qiladi ("sherzod@gamil.com" → "sherzod@gmail.com").
 * Login emailda xato qolsa, mijoz kira olmaydi — buni yaratishda ushlaymiz.
 * Faqat taklif: o'z domeni (kompaniya.uz) bo'lsa admin e'tiborsiz qoldiradi.
 */
export function emailTaklif(email: string): string | null {
  const s = email.trim().toLowerCase();
  // Format o'zi noto'g'ri bo'lsa (bir nechta "@" va h.k.) — taklif emas, format xatosi ko'rinadi
  if (!emailTogrimi(s)) return null;
  const at = s.indexOf('@');
  const domen = s.slice(at + 1);
  if (!domen.includes('.') || POCHTA_DOMENLARI.includes(domen)) return null;
  let eng: { d: string; m: number } | null = null;
  for (const d of POCHTA_DOMENLARI) {
    const m = masofa(domen, d);
    if (!eng || m < eng.m) eng = { d, m };
  }
  // 1 ta xato — har doim; 2 ta — faqat uzun domenda (qisqada begona domen ham yaqin chiqadi)
  if (!eng || eng.m === 0 || eng.m > 2 || (eng.m === 2 && domen.length < 9)) return null;
  return `${s.slice(0, at)}@${eng.d}`;
}

/**
 * Kuchli parol: 3×4 belgi, chiziqcha bilan (o'qish va diktovka qilish oson).
 * Adashtiriladigan belgilar (0/O, 1/l/I) yo'q — mijozga og'zaki aytilsa ham xato bo'lmaydi.
 */
function parolYarat(): string {
  const belgilar = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const r = crypto.getRandomValues(new Uint32Array(12));
  const s = Array.from(r, (x) => belgilar[x % belgilar.length]).join('');
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8, 12)}`;
}

type SlugHolat =
  | { tur: 'bosh' }
  | { tur: 'tekshirilmoqda' }
  | { tur: 'ok'; url: string }
  | { tur: 'xato'; matn: string };

/** Obuna holati → yorliq va rang (bzl-pill). */
const OBUNA: Record<string, { nom: string; ton: string }> = {
  trial: { nom: 'Sinov', ton: 'info' },
  active: { nom: 'Faol', ton: 'yaxshi' },
  past_due: { nom: "To'lov kechikkan", ton: 'orta' },
  grace: { nom: 'Imtiyozli davr', ton: 'orta' },
  degraded: { nom: 'Cheklangan', ton: 'xavf' },
  cancelled: { nom: 'Bekor qilingan', ton: 'xavf' },
};

const TILLAR = [
  { qiymat: 'uz', nom: "O'zbekcha" },
  { qiymat: 'ru', nom: 'Русский' },
  { qiymat: 'en', nom: 'English' },
] as const;

/** Kirill va o'zbek lotinidagi belgilar → subdomen uchun lotin. */
const LOTIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sh',
  ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu', я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
};

/** Biznes nomidan subdomen taklifi: "Yo'lchi O'quv Markazi" → "yolchi-oquv-markazi". */
export function slugTaklif(nom: string): string {
  return nom
    .toLowerCase()
    .split('')
    .map((c) => LOTIN[c] ?? c)
    .join('')
    .replace(/[ʻʼ'’`]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '');
}

/** Server xatolari o'zbekcha keladi — lug'atda bo'lsa joriy tilga o'giriladi. */
function xatoMatni(e: unknown, standart: string): string {
  return e instanceof ApiError ? tarjima(e.message) : standart;
}

/** Nusxalash + qisqa "Nusxalandi" holati. */
function useNusxa(): [string | null, (matn: string) => void] {
  const [nusxa, setNusxa] = useState<string | null>(null);
  const qil = (matn: string) => {
    void navigator.clipboard?.writeText(matn).then(
      () => {
        setNusxa(matn);
        window.setTimeout(() => setNusxa((n) => (n === matn ? null : n)), 1800);
      },
      () => window.prompt('', matn),
    );
  };
  return [nusxa, qil];
}

/**
 * Subdomenni yozish davomida serverda tekshiradi (350 ms tinch turgach).
 * Eskirgan javob yangisini bosib ketmasligi uchun so'rovlar raqamlanadi.
 */
function useSlugTekshiruv(slug: string, exceptId?: string): SlugHolat {
  const t = useT();
  const [holat, setHolat] = useState<SlugHolat>({ tur: 'bosh' });
  const raqam = useRef(0);
  useEffect(() => {
    const s = slug.trim();
    if (!s) {
      setHolat({ tur: 'bosh' });
      return;
    }
    const meniki = ++raqam.current;
    setHolat({ tur: 'tekshirilmoqda' });
    const vaqt = window.setTimeout(() => {
      const q = new URLSearchParams({ slug: s, ...(exceptId ? { exceptId } : {}) });
      api
        .get<{ ok: boolean; url?: string; matn?: string }>(`/api/v1/admin/tenants/slug-check?${q}`)
        .then((r) => {
          if (meniki !== raqam.current) return;
          setHolat(r.ok ? { tur: 'ok', url: r.url! } : { tur: 'xato', matn: t(r.matn ?? '') });
        })
        .catch((e: unknown) => meniki === raqam.current && setHolat({ tur: 'xato', matn: xatoMatni(e, t("Tekshirib bo'lmadi")) }));
    }, 350);
    return () => window.clearTimeout(vaqt);
  }, [slug, exceptId, t]);
  return holat;
}

function SlugIzoh({ holat }: { holat: SlugHolat }) {
  const t = useT();
  if (holat.tur === 'bosh') return <div className="yordam">{t('Lotin kichik harflari, raqam va chiziqcha; 3–40 belgi.')}</div>;
  if (holat.tur === 'tekshirilmoqda') return <div className="yordam">{t('Tekshirilmoqda…')}</div>;
  if (holat.tur === 'ok')
    return (
      <div className="yordam mjz-bosh">
        <Check aria-hidden="true" /> {t("{manzil} — bo'sh", { manzil: holat.url.replace(/^https?:\/\//, '') })}
      </div>
    );
  return <div className="yordam bzl-xato">{holat.matn}</div>;
}

/** Email (login) maydoni: format tekshiruvi + xato yozilgan domen taklifi. */
function EmailMaydon({
  id,
  value,
  onChange,
  izoh,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  izoh?: string;
}) {
  const t = useT();
  const taklif = emailTaklif(value);
  const notogri = value.trim().length > 3 && !emailTogrimi(value);
  return (
    <>
      <input
        id={id}
        type="email"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={255}
        autoComplete="off"
        spellCheck={false}
        autoCapitalize="none"
        aria-invalid={notogri}
        aria-describedby={`${id}-izoh`}
        placeholder="ega@kompaniya.uz"
      />
      <div id={`${id}-izoh`}>
        {taklif ? (
          <div className="yordam mjz-taklif" role="status">
            <TriangleAlert aria-hidden="true" />
            <span>{t('«{email}» ni nazarda tutdingizmi?', { email: taklif })}</span>
            <button type="button" className="mjz-taklif-tugma" onClick={() => onChange(taklif)}>
              {t('Tuzatish')}
            </button>
          </div>
        ) : notogri ? (
          <div className="yordam bzl-xato">{t("Email formati noto'g'ri")}</div>
        ) : (
          izoh && <div className="yordam">{izoh}</div>
        )}
      </div>
    </>
  );
}

/** Parol maydoni + «Yaratish» (kuchli parol taklifi). */
function ParolMaydon({
  id,
  value,
  onChange,
  autoFocus,
  izoh,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  autoFocus?: boolean;
  izoh?: string;
}) {
  const t = useT();
  const qisqa = value.length > 0 && value.length < PAROL_MIN;
  return (
    <>
      <div className="mjz-parol">
        <ParolInput
          id={id}
          ikon={<Lock />}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={200}
          autoComplete="new-password"
          spellCheck={false}
          aria-invalid={qisqa}
          placeholder={t('kamida {n} belgi', { n: PAROL_MIN })}
          autoFocus={autoFocus}
        />
        <button type="button" className="btn ikkinchi kichik" onClick={() => onChange(parolYarat())} title={t('Kuchli parol yaratish')}>
          <Dices /> {t('Yaratish')}
        </button>
      </div>
      <div className={qisqa ? 'yordam bzl-xato' : 'yordam'}>
        {qisqa ? t('Parol kamida {n} belgi bo\'lishi kerak', { n: PAROL_MIN }) : (izoh ?? t("Parolni egaga o'zingiz berasiz — mijoz uni o'zi tiklay olmaydi."))}
      </div>
    </>
  );
}

/** Login va parol — alohida nusxalanadi va bitta xabar sifatida ham. */
function KirishMalumoti({ url, login, parol }: { url: string | null; login: string; parol: string }) {
  const t = useT();
  const [nusxa, nusxala] = useNusxa();
  const xabar = [url && `${t('Kabinet manzili')}: ${url}`, `${t('Login')}: ${login}`, `${t('Parol')}: ${parol}`].filter(Boolean).join('\n');
  return (
    <>
      <NusxaQator yorliq={t('Login')} qiymat={login} nusxa={nusxa} onNusxa={nusxala} />
      <NusxaQator yorliq={t('Parol')} qiymat={parol} nusxa={nusxa} onNusxa={nusxala} />
      <div className="mjz-kirish-pastki">
        <p className="yordam">{t("Ma'lumotni egaga yuboring (Telegram, email). Parol faqat hozir ko'rinadi — keyin faqat yangisini o'rnatish mumkin.")}</p>
        <button type="button" className="btn kichik" onClick={() => nusxala(xabar)}>
          {nusxa === xabar ? <Check /> : <Copy />} {nusxa === xabar ? t('Nusxalandi') : t('Hammasini nusxalash')}
        </button>
      </div>
    </>
  );
}

export function Mijozlar() {
  const t = useT();
  const [royxat, setRoyxat] = useState<Royxat | null>(null);
  const [yuklashXato, setYuklashXato] = useState<string | null>(null);
  const [yangiOchiq, setYangiOchiq] = useState(false);
  const [natija, setNatija] = useState<Yaratildi | null>(null);

  const yukla = useCallback(async () => {
    try {
      setRoyxat(await api.get<Royxat>('/api/v1/admin/tenants'));
      setYuklashXato(null);
    } catch (e) {
      setYuklashXato(xatoMatni(e, t("Ro'yxatni yuklab bo'lmadi")));
    }
  }, [t]);
  useEffect(() => {
    void yukla();
  }, [yukla]);

  if (yuklashXato) {
    return (
      <section className="card sz-karta">
        <div className="yordam bzl-xato">{yuklashXato}</div>
      </section>
    );
  }
  if (!royxat) return <div className="card skelet" style={{ height: 320 }} aria-busy="true" />;

  return (
    <section className="card sz-karta">
      <div className="sz-karta-bosh">
        <div>
          <h2>{t('Mijozlar')}</h2>
          <p>
            {t("Har bir mijoz — o'z subdomenidagi alohida kabinet: faqat shu biznes xodimlari kira oladi, boshqa mijozlar ma'lumoti umuman ko'rinmaydi.")}
          </p>
        </div>
        <button
          type="button"
          className="btn mjz-yangi"
          onClick={() => {
            setYangiOchiq((v) => !v);
            setNatija(null);
          }}
          aria-expanded={yangiOchiq}
        >
          <Plus /> {yangiOchiq ? t('Yopish') : t('Yangi mijoz')}
        </button>
      </div>

      {yangiOchiq && (
        <YangiMijoz
          rootDomain={royxat.rootDomain}
          onYaratildi={async (n) => {
            setYangiOchiq(false);
            setNatija(n);
            await yukla();
          }}
        />
      )}

      {natija && <YaratildiKarta natija={natija} onYop={() => setNatija(null)} />}

      <div className="ai-prov-royxat">
        {royxat.items.length === 0 && <div className="bn-bosh-holat">{t("Hali mijoz yo'q — birinchisini «Yangi mijoz» tugmasi bilan yarating.")}</div>}
        {royxat.items.map((m) => (
          <MijozQatori key={m.id} m={m} rootDomain={royxat.rootDomain} onOzgardi={yukla} />
        ))}
      </div>

      <p className="sz-eslatma">
        {t("Kabinet manzili domen sozlamasidan olinadi (serverdagi WEB_ORIGIN). Domen o'zgarsa, barcha kabinetlar yangi domen ostida avtomatik ishlaydi — kodni o'zgartirish shart emas.")}
      </p>
    </section>
  );
}

function YangiMijoz({
  rootDomain,
  onYaratildi,
}: {
  rootDomain: string;
  onYaratildi: (n: Yaratildi) => Promise<void>;
}) {
  const t = useT();
  const [nom, setNom] = useState('');
  const [slug, setSlug] = useState('');
  const [slugQolda, setSlugQolda] = useState(false);
  const [egaIsm, setEgaIsm] = useState('');
  const [egaEmail, setEgaEmail] = useState('');
  const [parol, setParol] = useState('');
  const [til, setTil] = useState<'uz' | 'ru' | 'en'>('uz');
  const [kun, setKun] = useState('14');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const slugHolat = useSlugTekshiruv(slug);

  const emailTogri = emailTogrimi(egaEmail);
  const kunTogri = /^\d+$/.test(kun) && Number(kun) >= 1 && Number(kun) <= 90;
  const tayyor =
    nom.trim().length >= 2 && slugHolat.tur === 'ok' && egaIsm.trim().length >= 2 && emailTogri && parol.length >= PAROL_MIN && kunTogri;

  const yarat = async () => {
    setBand(true);
    setXato(null);
    try {
      const r = await api.post<{ tenant: Mijoz; parolBerildi: boolean }>('/api/v1/admin/tenants', {
        name: nom.trim(),
        slug: slug.trim(),
        ownerName: egaIsm.trim(),
        ownerEmail: egaEmail.trim(),
        ownerPassword: parol,
        locale: til,
        trialDays: Number(kun),
      });
      await onYaratildi({ mijoz: r.tenant, parol: r.parolBerildi ? parol : null });
    } catch (e) {
      setXato(xatoMatni(e, t('Kabinet yaratilmadi')));
    } finally {
      setBand(false);
    }
  };

  return (
    <form
      className="bzl-forma mjz-forma"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (tayyor && !band) void yarat();
      }}
    >
      <div className="bzl-forma-sarlavha">{t('Yangi mijoz kabineti')}</div>

      <div className="bzl-forma-panjara">
        <div className="maydon-blok">
          <label htmlFor="mjz-nom">{t('Biznes nomi')}</label>
          <input
            id="mjz-nom"
            value={nom}
            onChange={(e) => {
              setNom(e.target.value);
              if (!slugQolda) setSlug(slugTaklif(e.target.value));
            }}
            maxLength={120}
            placeholder={t("masalan: Yo'lchi o'quv markazi")}
            autoFocus
          />
        </div>
        <div className="maydon-blok">
          <label htmlFor="mjz-slug">{t('Subdomen')}</label>
          <div className="mjz-slug">
            <input
              id="mjz-slug"
              value={slug}
              onChange={(e) => {
                setSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'));
                setSlugQolda(true);
              }}
              maxLength={40}
              spellCheck={false}
              autoCapitalize="none"
              aria-invalid={slugHolat.tur === 'xato'}
              aria-describedby="mjz-slug-izoh"
              placeholder="yolchi"
            />
            <span className="mjz-slug-domen">.{rootDomain}</span>
          </div>
          <div id="mjz-slug-izoh">
            <SlugIzoh holat={slugHolat} />
          </div>
        </div>
      </div>

      <div className="bzl-forma-panjara">
        <div className="maydon-blok">
          <label htmlFor="mjz-ega">{t('Ega ismi')}</label>
          <input id="mjz-ega" value={egaIsm} onChange={(e) => setEgaIsm(e.target.value)} maxLength={100} autoComplete="off" placeholder={t('masalan: Aziz Karimov')} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="mjz-email">{t('Ega emaili (login)')}</label>
          <EmailMaydon
            id="mjz-email"
            value={egaEmail}
            onChange={setEgaEmail}
            izoh={t("Shu email bilan kiradi. Email tizimda bo'lsa — bu odamga yangi kabinet qo'shiladi.")}
          />
        </div>
      </div>

      <div className="bzl-forma-panjara">
        <div className="maydon-blok">
          <label htmlFor="mjz-parol">{t('Parol')}</label>
          <ParolMaydon id="mjz-parol" value={parol} onChange={setParol} />
        </div>
      </div>

      <div className="bzl-forma-panjara">
        <div className="maydon-blok">
          <span className="mjz-yorliq" id="mjz-til-yorliq">
            {t('Kabinet tili')}
          </span>
          <div className="til-tanlash mjz-til" role="radiogroup" aria-labelledby="mjz-til-yorliq">
            {TILLAR.map((v) => (
              <button key={v.qiymat} type="button" role="radio" aria-checked={til === v.qiymat} className={til === v.qiymat ? 'faol' : undefined} onClick={() => setTil(v.qiymat)}>
                {v.nom}
              </button>
            ))}
          </div>
        </div>
        <div className="maydon-blok">
          <label htmlFor="mjz-kun">{t('Sinov muddati (kun)')}</label>
          <input id="mjz-kun" value={kun} onChange={(e) => setKun(e.target.value.replace(/\D/g, ''))} inputMode="numeric" maxLength={2} aria-invalid={!kunTogri} />
        </div>
      </div>

      {xato && (
        <div className="bzl-izoh xato" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>{xato}</span>
        </div>
      )}
      <div>
        <button type="submit" className="btn" disabled={!tayyor || band}>
          <Globe /> {band ? t('Yaratilmoqda…') : t('Kabinetni yaratish')}
        </button>
      </div>
    </form>
  );
}

function YaratildiKarta({ natija, onYop }: { natija: Yaratildi; onYop: () => void }) {
  const t = useT();
  const [nusxa, nusxala] = useNusxa();
  const { mijoz, parol } = natija;

  return (
    <div className="mjz-natija" role="status">
      <div className="mjz-natija-bosh">
        <span className="mjz-natija-ikon" aria-hidden="true">
          <Check />
        </span>
        <div>
          <b>{t('«{nom}» kabineti tayyor', { nom: mijoz.name })}</b>
          <small>{t('Kabinet darhol ishlaydi — alohida sozlash yoki deploy kerak emas.')}</small>
        </div>
        <button type="button" className="btn ikkinchi kichik" onClick={onYop}>
          {t('Yopish')}
        </button>
      </div>

      {mijoz.url && <NusxaQator yorliq={t('Kabinet manzili')} qiymat={mijoz.url} nusxa={nusxa} onNusxa={nusxala} ochish />}
      {parol && mijoz.ownerEmail ? (
        <KirishMalumoti url={mijoz.url} login={mijoz.ownerEmail} parol={parol} />
      ) : (
        <p className="yordam">
          {t("Ega tizimda allaqachon bor — u o'z paroli bilan kabinet manzilida kiradi. Kerak bo'lsa, «Tahrirlash» orqali yangisini bering.")}
        </p>
      )}
    </div>
  );
}

function NusxaQator({
  yorliq,
  qiymat,
  nusxa,
  onNusxa,
  ochish,
}: {
  yorliq: string;
  qiymat: string;
  nusxa: string | null;
  onNusxa: (m: string) => void;
  ochish?: boolean;
}) {
  const t = useT();
  return (
    <div className="mjz-nusxa">
      <span className="mjz-nusxa-yorliq">{yorliq}</span>
      <div className="mjz-nusxa-qator">
        <code title={qiymat}>{qiymat}</code>
        <button type="button" className="btn ikkinchi kichik" onClick={() => onNusxa(qiymat)}>
          {nusxa === qiymat ? <Check /> : <Copy />} {nusxa === qiymat ? t('Nusxalandi') : t('Nusxalash')}
        </button>
        {ochish && (
          <a className="btn ikkinchi kichik" href={qiymat} target="_blank" rel="noopener noreferrer">
            <ExternalLink /> {t('Ochish')}
          </a>
        )}
      </div>
    </div>
  );
}

type Panel = 'tahrir' | 'faolsiz' | 'ochirish' | 'subdomen';

/**
 * Ro'yxat qatori: Ochish · Nusxalash · Tahrirlash · Faolsizlantirish · O'chirish.
 *
 * Subdomen yaratilgandan keyin o'zgarmaydi — uning o'rniga manzilni nusxalash.
 * Faqat eski, subdomenga yaroqsiz slug'li kabinetga BIR MARTA subdomen beriladi.
 * Faolsizlantirish va o'chirish oldidan oqibati aytilib, tasdiq so'raladi;
 * o'chirishda biznes nomini terish kerak (tasodifiy bosishdan himoya).
 */
function MijozQatori({ m, rootDomain, onOzgardi }: { m: Mijoz; rootDomain: string; onOzgardi: () => Promise<void> }) {
  const t = useT();
  const [nusxa, nusxala] = useNusxa();
  const [panel, setPanel] = useState<Panel | null>(m.slugYaroqli ? null : 'subdomen');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  /** Saqlangandan keyingi natija — login/parol admin egaga yuborishi uchun bir marta ko'rinadi. */
  const [natija, setNatija] = useState<{ login: string; parol: string | null; emailOzgardi: boolean } | null>(null);

  // Tahrirlash maydonlari
  const [nom, setNom] = useState(m.name);
  const [til, setTil] = useState(m.locale);
  const [egaIsm, setEgaIsm] = useState(m.ownerName ?? '');
  const [egaEmail, setEgaEmail] = useState(m.ownerEmail ?? '');
  const [yangiParol, setYangiParol] = useState('');
  // O'chirish tasdig'i va subdomen
  const [tasdiq, setTasdiq] = useState('');
  const [yangiSlug, setYangiSlug] = useState('');
  const slugHolat = useSlugTekshiruv(panel === 'subdomen' ? yangiSlug : '', m.id);

  const obuna = m.subscriptionStatus ? OBUNA[m.subscriptionStatus] : undefined;
  const faolsiz = m.suspendedAt !== null;

  const ochPanel = (p: Panel | null) => {
    setPanel((joriy) => (joriy === p ? null : p));
    setXato(null);
    setNatija(null);
    setNom(m.name);
    setTil(m.locale);
    setEgaIsm(m.ownerName ?? '');
    setEgaEmail(m.ownerEmail ?? '');
    setYangiParol('');
    setTasdiq('');
  };

  const amal = async (fn: () => Promise<void>) => {
    setBand(true);
    setXato(null);
    try {
      await fn();
    } catch (e) {
      setXato(xatoMatni(e, t('Bajarilmadi')));
    } finally {
      setBand(false);
    }
  };

  // ── Tahrirlash: faqat o'zgargan maydonlar yuboriladi ──
  const login = egaEmail.trim().toLowerCase();
  const ozgarish: Record<string, string> = {};
  if (nom.trim() !== m.name) ozgarish.name = nom.trim();
  if (til !== m.locale) ozgarish.locale = til;
  if (m.ownerEmail) {
    if (egaIsm.trim() !== (m.ownerName ?? '')) ozgarish.ownerName = egaIsm.trim();
    if (login !== m.ownerEmail) ozgarish.ownerEmail = login;
    if (yangiParol) ozgarish.ownerPassword = yangiParol;
  }
  const tahrirTayyor =
    Object.keys(ozgarish).length > 0 &&
    nom.trim().length >= 2 &&
    (!m.ownerEmail || (egaIsm.trim().length >= 2 && emailTogrimi(egaEmail))) &&
    (yangiParol.length === 0 || yangiParol.length >= PAROL_MIN);

  return (
    <div className={`ai-prov-qator mjz-qator${faolsiz ? ' faolsiz' : ''}`}>
      <div className="ai-prov-asosiy">
        <div className="ai-prov-nom">
          <b>{m.name}</b>
          {faolsiz ? (
            <span className="bzl-pill xavf">{t('Faolsiz')}</span>
          ) : (
            obuna && <span className={`bzl-pill ${obuna.ton}`}>{t(obuna.nom)}</span>
          )}
          {!m.slugYaroqli && <span className="bzl-pill xavf">{t('Subdomen yaroqsiz')}</span>}
        </div>
        <small>
          {m.url ? (
            <a className="mjz-manzil" href={m.url} target="_blank" rel="noopener noreferrer">
              {m.url.replace(/^https?:\/\//, '')}
            </a>
          ) : (
            <code>{m.slug}</code>
          )}
          {' · '}
          {m.ownerEmail ?? t("ega yo'q")}
          {m.ownerEmail && !m.ownerActivated && <> · <span className="mjz-kutilmoqda">{t('parol berilmagan')}</span></>}
        </small>
        <small>
          {faolsiz
            ? t("To'xtatilgan: {sana}", { sana: fmtSana(m.suspendedAt!) })
            : <>
                {t('Yaratilgan: {sana}', { sana: fmtSana(m.createdAt) })} · {t('{a} rahbar, {s} menejer', { a: m.members, s: m.seats })}
                {m.subscriptionStatus === 'trial' && m.trialEndsAt ? ` · ${t('sinov {sana} gacha', { sana: fmtSana(m.trialEndsAt) })}` : ''}
              </>}
        </small>
      </div>

      <div className="ai-prov-amallar mjz-amallar">
        {m.url ? (
          <>
            <a className="btn ikkinchi kichik" href={m.url} target="_blank" rel="noopener noreferrer">
              <ExternalLink /> {t('Ochish')}
            </a>
            <button
              type="button"
              className="btn ikkinchi kichik"
              onClick={() => nusxala(m.url!)}
              title={t('Kabinet manzilini nusxalash')}
            >
              {nusxa === m.url ? <Check /> : <Copy />} {nusxa === m.url ? t('Nusxalandi') : t('Nusxalash')}
            </button>
          </>
        ) : (
          <button type="button" className="btn kichik" disabled={band} onClick={() => ochPanel('subdomen')} aria-expanded={panel === 'subdomen'}>
            <Link2 /> {t('Subdomen berish')}
          </button>
        )}
        <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => ochPanel('tahrir')} aria-expanded={panel === 'tahrir'}>
          <Pencil /> {t('Tahrirlash')}
        </button>
        {faolsiz ? (
          <button
            type="button"
            className="btn ikkinchi kichik mjz-faollashtir"
            disabled={band}
            onClick={() =>
              void amal(async () => {
                await api.post(`/api/v1/admin/tenants/${m.id}/status`, { faol: true });
                setPanel(null);
                await onOzgardi();
              })
            }
          >
            <CirclePlay /> {t('Faollashtirish')}
          </button>
        ) : (
          <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => ochPanel('faolsiz')} aria-expanded={panel === 'faolsiz'}>
            <CirclePause /> {t('Faolsizlantirish')}
          </button>
        )}
        <button type="button" className="btn ikkinchi kichik mjz-xavfli" disabled={band} onClick={() => ochPanel('ochirish')} aria-expanded={panel === 'ochirish'}>
          <Trash2 /> {t("O'chirish")}
        </button>
      </div>

      {/* ── Tahrirlash ── */}
      {panel === 'tahrir' && (
        <div className="mjz-qator-parol">
          {natija ? (
            <>
              <div className="mjz-bosh">
                <Check aria-hidden="true" />{' '}
                {natija.parol
                  ? t('Saqlandi. Yangi parol berildi — ega barcha qurilmalardan chiqarildi va endi shu parol bilan kiradi.')
                  : natija.emailOzgardi
                    ? t("Saqlandi. Login yangilandi — parol o'zgarmadi, ega yangi login va eski paroli bilan kiradi.")
                    : t("O'zgarishlar saqlandi.")}
              </div>
              {natija.parol ? (
                <KirishMalumoti url={m.url} login={natija.login} parol={natija.parol} />
              ) : (
                natija.emailOzgardi && <NusxaQator yorliq={t('Login')} qiymat={natija.login} nusxa={nusxa} onNusxa={nusxala} />
              )}
              <div>
                <button type="button" className="btn ikkinchi kichik" onClick={() => ochPanel(null)}>
                  {t('Yopish')}
                </button>
              </div>
            </>
          ) : (
            <form
              className="mjz-parol-forma"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!tahrirTayyor) return;
                void amal(async () => {
                  await api.patch(`/api/v1/admin/tenants/${m.id}`, ozgarish);
                  setNatija({ login, parol: yangiParol || null, emailOzgardi: 'ownerEmail' in ozgarish });
                  await onOzgardi();
                });
              }}
            >
              <div className="mjz-guruh-sarlavha">{t('Kabinet')}</div>
              <div className="bzl-forma-panjara">
                <div className="maydon-blok">
                  <label htmlFor={`mjz-nom-${m.id}`}>{t('Biznes nomi')}</label>
                  <input id={`mjz-nom-${m.id}`} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} />
                </div>
                <div className="maydon-blok">
                  <span className="mjz-yorliq" id={`mjz-til-${m.id}`}>
                    {t('Kabinet tili')}
                  </span>
                  <div className="til-tanlash mjz-til" role="radiogroup" aria-labelledby={`mjz-til-${m.id}`}>
                    {TILLAR.map((v) => (
                      <button key={v.qiymat} type="button" role="radio" aria-checked={til === v.qiymat} className={til === v.qiymat ? 'faol' : undefined} onClick={() => setTil(v.qiymat)}>
                        {v.nom}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {m.ownerEmail && (
                <>
                  <div className="mjz-guruh-sarlavha">{t('Ega va kirish')}</div>
                  <div className="bzl-forma-panjara">
                    <div className="maydon-blok">
                      <label htmlFor={`mjz-ega-${m.id}`}>{t('Ega ismi')}</label>
                      <input id={`mjz-ega-${m.id}`} value={egaIsm} onChange={(e) => setEgaIsm(e.target.value)} maxLength={100} autoComplete="off" />
                    </div>
                    <div className="maydon-blok">
                      <label htmlFor={`mjz-login-${m.id}`}>{t('Login (email)')}</label>
                      <EmailMaydon
                        id={`mjz-login-${m.id}`}
                        value={egaEmail}
                        onChange={setEgaEmail}
                        izoh={t('Ega shu email bilan kiradi. Xato yozilgan bo\'lsa — shu yerda tuzating.')}
                      />
                    </div>
                  </div>
                  <div className="bzl-forma-panjara">
                    <div className="maydon-blok">
                      <label htmlFor={`mjz-parol-${m.id}`}>{t('Yangi parol')}</label>
                      <ParolMaydon
                        id={`mjz-parol-${m.id}`}
                        value={yangiParol}
                        onChange={setYangiParol}
                        izoh={t("Bo'sh qoldirsangiz — parol o'zgarmaydi. Yangisi berilsa, ega barcha qurilmalardan chiqariladi.")}
                      />
                    </div>
                  </div>
                </>
              )}

              <div className="mjz-kirish-tugmalar">
                <button type="submit" className="btn kichik" disabled={band || !tahrirTayyor}>
                  {band ? t('Saqlanmoqda…') : t('Saqlash')}
                </button>
                <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => ochPanel(null)}>
                  {t('Bekor qilish')}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* ── Faolsizlantirish tasdig'i ── */}
      {panel === 'faolsiz' && (
        <div className="mjz-tasdiq">
          <div className="mjz-tasdiq-matn">
            <b>{t('«{nom}» kabineti faolsizlantirilsinmi?', { nom: m.name })}</b>
            <span>
              {t("Xodimlar kira olmaydi, subdomenda «vaqtincha to'xtatilgan» xabari chiqadi va yangi suhbatlar tahlil qilinmaydi. Ma'lumotlar saqlanadi — istalgan payt qayta faollashtirasiz.")}
            </span>
          </div>
          <div className="mjz-kirish-tugmalar">
            <button
              type="button"
              className="btn kichik"
              disabled={band}
              onClick={() =>
                void amal(async () => {
                  await api.post(`/api/v1/admin/tenants/${m.id}/status`, { faol: false });
                  setPanel(null);
                  await onOzgardi();
                })
              }
            >
              <CirclePause /> {band ? t('Bajarilmoqda…') : t('Faolsizlantirish')}
            </button>
            <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => ochPanel(null)}>
              {t('Bekor qilish')}
            </button>
          </div>
        </div>
      )}

      {/* ── O'chirish tasdig'i ── */}
      {panel === 'ochirish' && (
        <form
          className="mjz-tasdiq xavfli"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (tasdiq.trim() !== m.name.trim()) return;
            void amal(async () => {
              await api.del(`/api/v1/admin/tenants/${m.id}?tasdiq=${encodeURIComponent(tasdiq.trim())}`);
              await onOzgardi();
            });
          }}
        >
          <div className="mjz-tasdiq-matn">
            <b>{t('«{nom}» kabineti o\'chirilsinmi?', { nom: m.name })}</b>
            <span>
              {t("Kabinet ro'yxatdan, kirishdan va barcha jarayonlardan chiqadi. Ma'lumotlar 90 kun saqlanadi, subdomen boshqa mijozga berilmaydi. Faqat vaqtincha to'xtatmoqchi bo'lsangiz — «Faolsizlantirish»dan foydalaning.")}
            </span>
          </div>
          <div className="maydon-blok">
            <label htmlFor={`mjz-tasdiq-${m.id}`}>{t('Tasdiqlash uchun biznes nomini yozing: {nom}', { nom: m.name })}</label>
            <input id={`mjz-tasdiq-${m.id}`} value={tasdiq} onChange={(e) => setTasdiq(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
          </div>
          <div className="mjz-kirish-tugmalar">
            <button type="submit" className="btn kichik xavfli" disabled={band || tasdiq.trim() !== m.name.trim()}>
              <Trash2 /> {band ? t('Bajarilmoqda…') : t("Butunlay o'chirish")}
            </button>
            <button type="button" className="btn ikkinchi kichik" disabled={band} onClick={() => ochPanel(null)}>
              {t('Bekor qilish')}
            </button>
          </div>
        </form>
      )}

      {/* ── Yaroqsiz eski subdomenni BIR MARTA tuzatish ── */}
      {panel === 'subdomen' && !m.slugYaroqli && (
        <form
          className="ai-prov-kalit mjz-slug-tahrir"
          onSubmit={(e) => {
            e.preventDefault();
            if (slugHolat.tur !== 'ok') return;
            void amal(async () => {
              await api.patch(`/api/v1/admin/tenants/${m.id}`, { slug: yangiSlug.trim() });
              setPanel(null);
              await onOzgardi();
            });
          }}
        >
          <div className="mjz-slug">
            <input
              value={yangiSlug}
              onChange={(e) => setYangiSlug(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
              maxLength={40}
              spellCheck={false}
              autoCapitalize="none"
              aria-label={t('{nom} — yangi subdomen', { nom: m.name })}
              aria-invalid={slugHolat.tur === 'xato'}
              placeholder={slugTaklif(m.name) || 'kabinet'}
            />
            <span className="mjz-slug-domen">.{rootDomain}</span>
          </div>
          <button type="submit" className="btn kichik" disabled={band || slugHolat.tur !== 'ok'}>
            {t('Saqlash')}
          </button>
          <div className="mjz-slug-izoh">
            <SlugIzoh holat={slugHolat} />
            <div className="yordam">{t("Diqqat: subdomen faqat bir marta beriladi — keyin o'zgartirib bo'lmaydi.")}</div>
          </div>
        </form>
      )}

      {xato && (
        <div className="bzl-izoh xato mjz-qator-xato" role="alert">
          <TriangleAlert aria-hidden="true" />
          <span>{xato}</span>
        </div>
      )}
    </div>
  );
}
