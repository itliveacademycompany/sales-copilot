import { createContext, Fragment, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { LUGAT } from './lugat';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTERFEYS TILI (i18n)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Kalit — o'zbekcha matnning o'zi: `t("Bosh sahifa")`. Lug'atda yo'q matn
 * o'zbekcha qoladi — tarjima bosqichma-bosqich qo'shiladi va hech narsa
 * buzilmaydi. Lug'atlar bo'limlar bo'yicha `src/lugat/` da.
 *
 * O'rniga qo'yish: `t("Salom, {ism}!", { ism })`. Qiymat JSX bo'lishi kerak
 * bo'lsa (qalin nom, havola) — `joyla(t("…{ism}…"), { ism: <b>…</b> })`.
 *
 * QAYSI TIL USTUN:
 *   - Tizimga kirgan foydalanuvchi — profildagi til (server, `locale`).
 *   - Mehmon (landing, login) — oxirgi tanlov, brauzerda saqlanadi.
 *   - Mehmon tilni O'ZI tanlab, keyin kirsa — o'sha tanlov profilga ham
 *     yoziladi: landing'da tanlangan til butun platformada davom etadi.
 *     Faqat "mehmon tanladi" belgisi bo'lsa — aks holda bir qurilmadagi
 *     eski qiymat boshqa qurilmada o'zgartirilgan profilni bosib ketardi.
 */

export type Til = 'uz' | 'en' | 'ru';

type Qiymatlar = Record<string, string | number>;

interface TilHolati {
  til: Til;
  setTil: (t: Til) => void;
  t: (s: string, qiymatlar?: Qiymatlar) => string;
}

const TilCtx = createContext<TilHolati>({
  til: 'uz',
  setTil: () => undefined,
  t: (s, q) => qoy(s, q),
});

const normal = (l: string | null | undefined): Til => (l === 'en' ? 'en' : l === 'ru' ? 'ru' : 'uz');

/**
 * Kalitni tarjima qiladi. Kontekst belgisi: `"Ulangan##qo'ng'iroq"` —
 * bir xil o'zbekcha so'z turli joyda turli ma'noda bo'lsa (rus tilida
 * "состоялись" va "подключено"), `##` dan keyingi qism faqat lug'atni
 * ajratadi, ekranda ko'rinmaydi.
 */
function tarjimaQil(til: Til, s: string): string {
  if (til !== 'uz') {
    const t = LUGAT[s]?.[til];
    if (t !== undefined) return t;
  }
  const chegara = s.indexOf('##');
  return chegara === -1 ? s : s.slice(0, chegara);
}

/** `{nom}` belgilarini qiymat bilan almashtiradi. */
function qoy(matn: string, qiymatlar?: Qiymatlar): string {
  if (!qiymatlar) return matn;
  return matn.replace(/\{(\w+)\}/g, (butun, k: string) => (k in qiymatlar ? String(qiymatlar[k]) : butun));
}

/**
 * Tarjima qilingan matndagi `{nom}` o'rniga JSX qo'yadi. So'z tartibi
 * tillarda farq qiladi, shuning uchun matnni bo'laklarga bo'lib yozish
 * emas — butun gap tarjima qilinadi va qiymatlar o'z joyiga tushadi.
 */
export function joyla(matn: string, qiymatlar: Record<string, ReactNode>): ReactNode {
  return matn.split(/(\{\w+\})/g).map((bolak, i) => {
    const kalit = /^\{(\w+)\}$/.exec(bolak)?.[1];
    return <Fragment key={i}>{kalit !== undefined && kalit in qiymatlar ? qiymatlar[kalit] : bolak}</Fragment>;
  });
}

/**
 * Joriy til — React'dan tashqaridagi kod uchun (yordamchi `.ts` fayllar:
 * CSV eksport, `new Error(...)` matnlari, konstantalarni formatlash).
 * TilProvider har renderda yangilaydi.
 */
let joriyTil: Til = 'uz';

/**
 * Hook'siz tarjima — komponent bo'lmagan joylar uchun. Komponent ichida
 * har doim `useT()` ishlating: u til almashganda qayta render qiladi,
 * bu funksiya esa faqat chaqirilgan paytdagi tilni qaytaradi.
 */
export function tarjima(s: string, qiymatlar?: Qiymatlar): string {
  return qoy(tarjimaQil(joriyTil, s), qiymatlar);
}

const INTL_LOCALE: Record<Til, string> = { uz: 'uz', en: 'en-US', ru: 'ru-RU' };
const OYLAR_UZ = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

/**
 * Oy nomi joriy tilda (0 — yanvar). Rus tilida shakl kontekstga bog'liq:
 * `sanada: true` — kun bilan birga ("5 января"), aks holda bosh kelishik
 * ("январь"). Shu sabab oy nomini lug'at kaliti bilan emas, `Intl` bilan
 * olamiz — bitta `'yanvar'` kaliti ikki shaklni bera olmaydi.
 * O'zbekchada mavjud yozuv (kichik harf) saqlanadi.
 */
export function oyNomi(oy: number, sanada = false): string {
  if (joriyTil === 'uz') return OYLAR_UZ[oy] ?? '';
  const d = new Date(2000, oy, 15);
  const locale = INTL_LOCALE[joriyTil];
  if (!sanada) return new Intl.DateTimeFormat(locale, { month: 'long' }).format(d);
  return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }).formatToParts(d).find((q) => q.type === 'month')?.value ?? '';
}

const TIL_KALIT = 'sotuvai-til';
/** Mehmon tilni o'zi tanlaganini bildiradi — kirgandan keyin profilga yoziladi. */
const KUTILMOQDA_KALIT = 'sotuvai-til-kutilmoqda';

function oqi(kalit: string): string | null {
  try {
    return localStorage.getItem(kalit);
  } catch {
    return null;
  }
}

function yoz(kalit: string, qiymat: string | null) {
  try {
    if (qiymat === null) localStorage.removeItem(kalit);
    else localStorage.setItem(kalit, qiymat);
  } catch {
    /* xotira yopiq bo'lsa ham til joriy sessiyada almashadi */
  }
}

export function TilProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [til, setTilHolat] = useState<Til>(() => normal(user?.locale ?? oqi(TIL_KALIT)));
  const userRef = useRef(user);
  userRef.current = user;
  joriyTil = til;

  // Kirish va profil yangilanishi. Chiqishda (`user` yo'q) joriy til qoladi.
  useEffect(() => {
    if (!user) return;
    const mehmonTanlovi = oqi(KUTILMOQDA_KALIT) ? oqi(TIL_KALIT) : null;
    if (mehmonTanlovi) {
      const yangi = normal(mehmonTanlovi);
      yoz(KUTILMOQDA_KALIT, null);
      setTilHolat(yangi);
      if (yangi !== normal(user.locale)) {
        void api.patch('/api/v1/auth/me', { locale: yangi }).catch(() => undefined);
      }
      return;
    }
    const profil = normal(user.locale);
    setTilHolat(profil);
    yoz(TIL_KALIT, profil);
  }, [user?.id, user?.locale]);

  const setTil = useCallback((yangi: Til) => {
    setTilHolat(yangi);
    yoz(TIL_KALIT, yangi);
    if (!userRef.current) yoz(KUTILMOQDA_KALIT, '1');
  }, []);

  useEffect(() => {
    document.documentElement.lang = til;
  }, [til]);

  const t = useCallback(
    (s: string, qiymatlar?: Qiymatlar) => qoy(tarjimaQil(til, s), qiymatlar),
    [til],
  );
  const v = useMemo(() => ({ til, setTil, t }), [til, setTil, t]);
  return <TilCtx.Provider value={v}>{children}</TilCtx.Provider>;
}

export const useTil = () => useContext(TilCtx);
export const useT = () => useContext(TilCtx).t;
