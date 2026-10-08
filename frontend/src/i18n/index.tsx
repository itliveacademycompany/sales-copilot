import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * INTERFEYS TILI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * KALIT SIFATIDA O'ZBEKCHA MATNNING O'ZI ISHLATILADI
 * ──────────────────────────────────────────────────
 * `t('Saqlash')`, `t('settings.save')` emas. Uch sabab:
 *
 *   1. Tarjima yo'q bo'lsa, ekranda kalit emas — o'qiladigan o'zbekcha
 *      matn qoladi. Kalitli tizimda tarjima unutilsa foydalanuvchi
 *      `settings.save` degan yozuvni ko'radi.
 *   2. Loyiha o'zbek tilida yozilgan va shunday qoladi (CLAUDE.md).
 *      Kod o'qiyotgan odam `t('Saqlash')` ni ko'rib nima yozilishini
 *      biladi, kalitni esa lug'atdan qidirishi kerak bo'lardi.
 *   3. Migratsiya xavfsiz: matnni `t(...)` ga o'rash matnning o'zini
 *      o'zgartirmaydi, ya'ni o'zbekcha interfeys hech qachon buzilmaydi.
 *
 * LUG'ATLAR TALAB BO'YICHA YUKLANADI
 * ──────────────────────────────────
 * `en.ts` va `ru.ts` — 95 KB manba. Ilgari ular statik import qilinardi
 * va HAR bir foydalanuvchi, jumladan o'zbek tilida ishlaydiganlar ham,
 * ikkala lug'atni yuklab olardi. Endi ular alohida bo'lak: o'zbek tili
 * uchun umuman so'ralmaydi.
 *
 * Yuklanmagan paytda `t()` o'zbekcha matnni qaytaradi — bu allaqachon
 * "tarjima topilmadi" holatidagi xatti-harakat, ya'ni yangi holat emas.
 *
 * O'RINBOSARLAR
 * ─────────────
 * `t('{n} ta suhbat', { n: 5 })` — sonlar va nomlar matn ichida
 * qoladi, konkatenatsiya qilinmaydi. Sabab: rus va ingliz tilida so'z
 * tartibi boshqacha va `n + ' ta suhbat'` shaklidagi yig'ishni tarjima
 * qilib bo'lmaydi.
 */

export type Til = 'uz' | 'en' | 'ru';

export const TILLAR: { key: Til; nom: string; qisqa: string; tayyor: boolean }[] = [
  { key: 'uz', nom: 'O\'zbekcha', qisqa: 'UZ', tayyor: true },
  { key: 'en', nom: 'English', qisqa: 'EN', tayyor: true },
  { key: 'ru', nom: 'Русский', qisqa: 'RU', tayyor: true },
];

/** Lug'at: o'zbekcha matn → tarjima. */
export type Lugat = Record<string, string>;

/** Yuklab olingan lug'atlar. O'zbekcha — bo'sh, u asos til. */
const LUGATLAR: Partial<Record<Til, Lugat>> = { uz: {} };

/**
 * Lug'atni yuklaydi (agar hali yuklanmagan bo'lsa).
 *
 * Eksport qilingan, chunki `main.tsx` uni React ishga tushishidan OLDIN
 * chaqiradi: saqlangan til ruscha bo'lsa, birinchi kadr ham ruscha
 * chiqishi kerak — aks holda ekran bir lahza o'zbekcha ko'rinib, keyin
 * almashardi.
 */
export async function lugatniYukla(til: Til): Promise<void> {
  if (LUGATLAR[til]) return;
  if (til === 'en') LUGATLAR.en = (await import('./en')).EN;
  else if (til === 'ru') LUGATLAR.ru = (await import('./ru')).RU;
}

export type TFunc = (matn: string, orinbosar?: Record<string, string | number>) => string;

interface TilHolat {
  til: Til;
  t: TFunc;
  tilniOzgartir: (v: Til) => void;
}

const Ctx = createContext<TilHolat | null>(null);

const KALIT = 'sotuvai-til';

/** Saqlangan til — noma'lum qiymat kelsa o'zbekchaga qaytadi. */
export function tilniOqi(): Til {
  const v = localStorage.getItem(KALIT);
  return TILLAR.some((t) => t.key === v) ? (v as Til) : 'uz';
}

/**
 * O'rinbosarlarni almashtiradi: `{n}` → qiymat.
 *
 * Topilmagan o'rinbosar O'Z HOLICHA qoladi (`{n}` bo'lib ko'rinadi) —
 * jimgina bo'sh joy qoldirsak, xato sezilmay o'tib ketardi.
 */
function orinbosarlar(matn: string, qiymatlar?: Record<string, string | number>): string {
  if (!qiymatlar) return matn;
  return matn.replace(/\{(\w+)\}/g, (butun, nom: string) =>
    nom in qiymatlar ? String(qiymatlar[nom]) : butun,
  );
}

export function TilProvider({ children }: { children: ReactNode }) {
  const [til, setTil] = useState<Til>(() => tilniOqi());
  /**
   * Lug'at yuklangach qayta render qilish uchun hisoblagich.
   *
   * `LUGATLAR` — modul darajasidagi obyekt, uning o'zgarishi React'ga
   * ko'rinmaydi. Hisoblagichsiz til almashsa-yu lug'at keyin kelsa,
   * ekran eski holatda qotib qolardi.
   */
  const [avlod, setAvlod] = useState(0);

  const tilniOzgartir = useCallback((v: Til) => {
    localStorage.setItem(KALIT, v);
    document.documentElement.lang = v;
    setTil(v);
  }, []);

  useEffect(() => {
    let tirik = true;
    void lugatniYukla(til).then(() => {
      if (tirik) setAvlod((n) => n + 1);
    });
    return () => {
      tirik = false;
    };
  }, [til]);

  const t = useCallback<TFunc>(
    (matn, qiymatlar) => {
      const lugat = LUGATLAR[til];
      // Tarjima yo'q bo'lsa o'zbekcha matnning o'zi qaytadi — bu
      // ATAYLAB: yarim tarjima kalitdan ko'ra tushunarliroq.
      return orinbosarlar(lugat?.[matn] ?? matn, qiymatlar);
    },
    // `avlod` — lug'at kelganda `t` ni yangilash uchun.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [til, avlod],
  );

  const qiymat = useMemo(() => ({ til, t, tilniOzgartir }), [til, t, tilniOzgartir]);

  return <Ctx.Provider value={qiymat}>{children}</Ctx.Provider>;
}

export function useTil(): TilHolat {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTil TilProvider ichida chaqirilishi kerak');
  return v;
}

/** Qisqa yordamchi — komponentlarning ko'pchiligiga faqat `t` kerak. */
export function useT(): TFunc {
  return useTil().t;
}
