/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM ADAPTERI — har bir CRM uchun bitta umumiy shartnoma
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NEGA ADAPTER
 * ────────────
 * SotuvAI ning qolgan qismi (CRM sahifasi, worker, API) aniq CRM ni
 * bilmaydi — faqat shu interfeysni. Yangi CRM qo'shish = bitta fayl
 * (`<crm>.ts`) yozib, uni `index.ts` dagi ro'yxatga qo'shish. Sahifa
 * ulash formasini adapterning `maydonlar` ro'yxatidan o'zi chizadi,
 * worker esa `topish` / `izoh` / `vazifa` ni chaqiradi.
 *
 * QOIDALAR (har adapter uchun)
 * ────────────────────────────
 * • `ulash` saqlashdan OLDIN ulanishni haqiqatan tekshiradi — noto'g'ri
 *   kalit "ulandi ✓" bo'lib, keyin jimgina ishlamay yotmasin.
 * • Tashqi manzil foydalanuvchidan erkin URL sifatida olinmaydi: faqat
 *   CRM ning o'z domenlari (SSRF himoyasi).
 * • Sir (`sir`) — token yoki webhook manzili — shifrlab saqlanadi va
 *   hech qachon qaytarilmaydi.
 * • CRM ga faqat ikki narsa yoziladi: izoh va vazifa. Sdelka bosqichi,
 *   summa yoki mas'ul o'zgartirilmaydi — CRM menejerniki.
 */

export type CrmKind = 'amocrm' | 'bitrix24';

/** Ulash formasidagi maydon. `sir` — parol kabi yashirin, ko'zcha bilan. */
export interface CrmMaydon {
  kalit: string;
  nom: string;
  tur: 'matn' | 'sir';
  placeholder: string;
  yordam?: string;
}

/** Saqlangan ulanish — adapter ishlashi uchun kerak bo'lgan hamma narsa. */
export interface CrmKontekst {
  /** Ommaviy sozlama (manzil, hisob nomi…) — sirsiz. */
  config: Record<string, unknown>;
  /** Shifrdan ochilgan sir: token, webhook manzili yoki OAuth juftligi (JSON). */
  sir: string;
  /**
   * OAuth ulanishda — har chaqiruvdan oldin amal qiluvchi access token
   * (muddati tugayotgan bo'lsa yangilab, bazaga yozib beradi). Bo'lmasa
   * adapter `sir` ni token sifatida ishlatadi.
   */
  token?: () => Promise<string>;
}

/** `ulash` natijasi — saqlanadi. */
export interface CrmUlanishNatija {
  config: Record<string, unknown>;
  sir: string;
  tokenExpiresAt: Date | null;
  hisob: { nom: string; url: string };
  /** Sirning ko'rsatiladigan qismi (masalan portal nomi yoki token niqobi). */
  sirKorinishi: string;
}

/** Qo'ng'iroqqa mos CRM yozuvi: ochiq sdelka, bo'lmasa kontakt. */
export interface CrmYozuv {
  tur: 'deal' | 'contact';
  id: string;
  nom: string | null;
  url: string;
  masulId: string | null;
}

export interface CrmVoronka {
  id: string;
  name: string;
  isMain: boolean;
  statuses: { id: string; name: string; tur: 'ochiq' | 'muvaffaqiyat' | 'yopilgan' }[];
}

export interface CrmTuzilish {
  pipelines: CrmVoronka[];
  users: { id: string; name: string; isAdmin: boolean; isActive: boolean }[];
  leadFieldCount: number;
}

/**
 * CRM dagi sdelka (lid) — SotuvAI ga import qilinadigan ko'rinishda.
 * Voronka/bosqich NOMLARI bu yerda yo'q: ular `tuzilish` dan olinadi
 * (bitta sinxronlashda bir marta), har lidda takrorlanmaydi.
 */
export interface CrmLid {
  id: string;
  nom: string | null;
  voronkaId: string | null;
  bosqichId: string | null;
  summa: number | null;
  masulId: string | null;
  kontaktId: string | null;
  kontaktNom: string | null;
  telefonlar: string[];
  yaratilgan: Date | null;
  yangilangan: Date;
  yopilgan: Date | null;
  url: string;
}

/**
 * Lidlar sahifasi. `kursor` — keyingi chaqiruv shu joydan davom etadi
 * (saqlanadi). `tugadi` — hozircha boshqa o'zgarish yo'q: keyingi tikkacha
 * kutiladi. Sinxronlash `yangilangan` bo'yicha o'sib boradi: birinchi marta
 * hammasi, keyin faqat o'zgarganlari.
 */
export interface CrmLidSahifa {
  lidlar: CrmLid[];
  kursor: string;
  tugadi: boolean;
}

export interface CrmAdapter {
  kind: CrmKind;
  nom: string;
  tavsif: string;
  /** Kalitni qayerdan olish — qadamlar (o'zbekcha, frontend tarjima qiladi). */
  qollanma: string[];
  maydonlar: CrmMaydon[];

  /**
   * Kiritilgan maydonlarni tekshirib, ulanadi. `eski` — avvalgi ulanish:
   * sir maydoni bo'sh qoldirilsa, eski sir ishlatiladi (faqat hisob
   * o'zgarmagan bo'lsa).
   */
  ulash(kirish: Record<string, string>, eski: CrmKontekst | null): Promise<CrmUlanishNatija>;
  /** Ulanish hali ishlayaptimi. Hisob nomini qaytaradi. */
  tekshir(k: CrmKontekst): Promise<{ nom: string }>;
  tuzilish(k: CrmKontekst): Promise<CrmTuzilish>;
  /** Mijoz telefoniga mos yozuv: eng so'nggi ochiq sdelka, bo'lmasa kontakt. */
  topish(k: CrmKontekst, telefon: string): Promise<CrmYozuv | null>;
  /** Yozuvga izoh qo'shadi, izoh ID sini qaytaradi. */
  izoh(k: CrmKontekst, y: CrmYozuv, matn: string): Promise<string | null>;
  /** Yozuvga vazifa qo'shadi (mas'ul — yozuvning mas'uli). */
  vazifa(k: CrmKontekst, y: CrmYozuv, v: { sarlavha: string; matn: string; muddat: Date }): Promise<string | null>;
  /**
   * O'zgargan sdelkalar — eng eskisidan boshlab. `kursor` null bo'lsa
   * boshidan (birinchi import). Natijadagi `kursor` keyingi chaqiruvga.
   */
  lidlar(k: CrmKontekst, kursor: string | null): Promise<CrmLidSahifa>;
}

// ─── Xato ────────────────────────────────────────────────────────────────────

/**
 * Xato turi — interfeys va worker nima qilishni bilishi uchun:
 * `token`, `tolov`, `hisob`, `topilmadi` — DOIMIY (ulanish buzilgan, qayta
 * urinish befoyda); `limit`, `tarmoq`, `server` — VAQTINCHALIK.
 */
export type CrmXatoTuri = 'token' | 'tolov' | 'ruxsat' | 'topilmadi' | 'limit' | 'tarmoq' | 'server' | 'hisob' | 'kirish';

export class CrmXato extends Error {
  constructor(
    public readonly tur: CrmXatoTuri,
    message: string,
  ) {
    super(message);
    this.name = 'CrmXato';
  }

  get doimiy(): boolean {
    return this.tur === 'token' || this.tur === 'tolov' || this.tur === 'hisob' || this.tur === 'topilmadi';
  }
}

// ─── Telefon ─────────────────────────────────────────────────────────────────

/** Faqat raqamlar. */
export function raqamlar(s: string | null | undefined): string {
  return (s ?? '').replace(/\D/g, '');
}

/**
 * Taqqoslash kaliti — oxirgi 9 raqam. O'zbekiston raqami `+998 90 123 45 67`
 * CRM da `+998901234567`, `998901234567`, `901234567` yoki `8 90 …` bo'lib
 * yozilgan bo'lishi mumkin; oxirgi 9 raqam hammasida bir xil. 9 dan kam
 * raqam — ishonchsiz (ichki raqam), `null`.
 */
export function telefonKaliti(s: string | null | undefined): string | null {
  const r = raqamlar(s);
  return r.length >= 9 ? r.slice(-9) : null;
}

/** Vaqt cheklovli fetch — CRM sekin javob bersa butun tik osilib qolmasin. */
export async function vaqtliFetch(url: string, init: RequestInit, ms = 15_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, redirect: 'error', signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
