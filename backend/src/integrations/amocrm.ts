import { z } from 'zod';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * amoCRM — ulanish, tekshirish va hisob ko'rinishi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bu bosqichda faqat ULANISH: biznes o'z amoCRM hisobini uzoq muddatli
 * token bilan ulaydi, biz uni tekshirib, shifrlab saqlaymiz va hisobning
 * tuzilishini (voronkalar, foydalanuvchilar) ko'rsatamiz. amoCRM ga HECH
 * NARSA YOZILMAYDI — faqat GET so'rovlar.
 *
 * NEGA UZOQ MUDDATLI TOKEN (OAuth emas)
 * ─────────────────────────────────────
 * amoCRM "приватная интеграция" uchun 5 yilgacha amal qiladigan token
 * beradi: refresh oqimi, redirect manzili va amoMarket'da ro'yxatdan
 * o'tish kerak emas. Mijoz uni o'z hisobida bir marta yaratadi va
 * istalgan payt o'zi bekor qila oladi. OAuth keyingi bosqichda qo'shiladi.
 *
 * XAVFSIZLIK
 * ──────────
 * • Token `credentials_encrypted` da shifrlangan, hech qachon qaytarilmaydi.
 * • Manzil foydalanuvchidan faqat SUBDOMEN + ruxsat etilgan domen sifatida
 *   olinadi (`amocrm.ru`, `amocrm.com`, `kommo.com`). Istalgan URL qabul
 *   qilinsa, server ichki tarmoqqa so'rov yuboradigan bo'lardi (SSRF).
 * • Token boshqa hisobga tegishli bo'lsa (manzil ≠ tokenning hisobi) — rad
 *   etiladi: aks holda "A kompaniya" sozlamasida "B kompaniya" ma'lumoti
 *   ko'rinardi.
 */

/** amoCRM hisoblari joylashadigan domenlar. Boshqasi — rad. */
export const AMO_DOMENLAR = ['amocrm.ru', 'amocrm.com', 'kommo.com'] as const;
export type AmoDomen = (typeof AMO_DOMENLAR)[number];

const SUBDOMEN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface AmoManzil {
  subdomain: string;
  baseDomain: AmoDomen;
}

/**
 * Foydalanuvchi kiritgan manzildan hisobni ajratadi.
 *
 * Qabul qilinadi: `kompaniya`, `kompaniya.amocrm.ru`,
 * `https://kompaniya.amocrm.ru/leads/pipeline/123/` (brauzerdan nusxa).
 * Faqat subdomen yozilsa — `amocrm.ru`. Boshqa domen yoki ichma-ich
 * subdomen (`a.b.amocrm.ru`) — `null`.
 */
export function manzilniAjrat(kirish: string): AmoManzil | null {
  let s = kirish.trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/[/?#].*$/, '').replace(/:\d+$/, '').replace(/\.$/, '');
  if (!s) return null;
  if (!s.includes('.')) return SUBDOMEN.test(s) ? { subdomain: s, baseDomain: 'amocrm.ru' } : null;
  for (const d of AMO_DOMENLAR) {
    if (s.endsWith(`.${d}`)) {
      const sub = s.slice(0, -(d.length + 1));
      return SUBDOMEN.test(sub) ? { subdomain: sub, baseDomain: d } : null;
    }
  }
  return null;
}

/** Hisobning to'liq manzili (havola uchun). */
export function hisobManzili(m: AmoManzil): string {
  return `https://${m.subdomain}.${m.baseDomain}`;
}

/**
 * API manzili. Testda `AMOCRM_API_BASE` (lokal soxta server) — faqat
 * shunda `http` ruxsat. Ishlab chiqarishda har doim
 * `https://<subdomain>.<domen>`.
 */
function apiManzil(m: AmoManzil): string {
  const test = process.env.AMOCRM_API_BASE;
  if (test) return test.replace(/\/+$/, '');
  return hisobManzili(m);
}

/**
 * Uzoq muddatli token — JWT. Uning `exp` maydonidan amal qilish muddati
 * olinadi (faqat KO'RSATISH uchun: "token 12 kunda tugaydi"). Imzo
 * tekshirilmaydi — tokenning haqiqiyligini amoCRM ning o'zi tekshiradi.
 */
export function tokenMuddati(token: string): Date | null {
  const qism = token.split('.')[1];
  if (!qism) return null;
  try {
    const json = JSON.parse(Buffer.from(qism.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')) as {
      exp?: unknown;
    };
    return typeof json.exp === 'number' && Number.isFinite(json.exp) ? new Date(json.exp * 1000) : null;
  } catch {
    return null;
  }
}

/** Xato turi — interfeys foydalanuvchiga nima qilishni aniq aytishi uchun. */
export type AmoXatoTuri = 'token' | 'tolov' | 'ruxsat' | 'topilmadi' | 'limit' | 'tarmoq' | 'server' | 'hisob';

export class AmoXato extends Error {
  constructor(
    public readonly tur: AmoXatoTuri,
    message: string,
  ) {
    super(message);
    this.name = 'AmoXato';
  }
}

const TIMEOUT_MS = 15_000;

function holatXatosi(status: number): AmoXato {
  if (status === 401) return new AmoXato('token', "Token noto'g'ri, muddati tugagan yoki amoCRM da bekor qilingan");
  if (status === 402) return new AmoXato('tolov', "amoCRM hisobi to'lanmagan yoki bloklangan");
  if (status === 403) return new AmoXato('ruxsat', "Tokenga bu ma'lumotni o'qishga ruxsat berilmagan");
  if (status === 404) return new AmoXato('topilmadi', 'amoCRM hisobi topilmadi — manzilni tekshiring');
  if (status === 429) return new AmoXato('limit', "amoCRM so'rovlar limitiga yetildi — birozdan keyin qayta urinib ko'ring");
  return new AmoXato('server', `amoCRM javob bermadi (HTTP ${status})`);
}

/**
 * amoCRM API ga GET so'rov. 429 da bir marta 1 soniya kutib qayta uriniladi
 * (amoCRM limiti — hisobga soniyasiga 7 ta so'rov). 204 — bo'sh ro'yxat.
 */
export async function chaqir<T>(m: AmoManzil, token: string, yol: string): Promise<T | null> {
  for (let urinish = 0; urinish < 2; urinish++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(`${apiManzil(m)}${yol}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        redirect: 'error',
        signal: controller.signal,
      });
    } catch {
      throw new AmoXato('tarmoq', "amoCRM ga ulanib bo'lmadi — manzil va internetni tekshiring");
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 429 && urinish === 0) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    if (res.status === 204) return null;
    if (!res.ok) throw holatXatosi(res.status);
    try {
      return (await res.json()) as T;
    } catch {
      throw new AmoXato('server', "amoCRM javobini o'qib bo'lmadi");
    }
  }
  throw holatXatosi(429);
}

// ─── Hisob ───────────────────────────────────────────────────────────────────

const hisobJavob = z.object({
  id: z.number(),
  name: z.string(),
  subdomain: z.string(),
  country: z.string().nullish(),
  currency: z.string().nullish(),
});

export interface AmoHisob {
  id: number;
  name: string;
  subdomain: string;
  country: string | null;
  currency: string | null;
}

/**
 * Token haqiqatan shu manzildagi hisobga tegishli ekanini tekshiradi va
 * hisob ma'lumotini qaytaradi. Ulashdan OLDIN chaqiriladi.
 */
export async function hisobniTekshir(m: AmoManzil, token: string): Promise<AmoHisob> {
  const javob = hisobJavob.safeParse(await chaqir<unknown>(m, token, '/api/v4/account'));
  if (!javob.success) throw new AmoXato('server', "amoCRM hisob ma'lumotini qaytarmadi");
  const h = javob.data;
  if (h.subdomain.toLowerCase() !== m.subdomain) {
    throw new AmoXato(
      'hisob',
      `Token boshqa hisobga tegishli (${h.subdomain}). Tokenni aynan ${m.subdomain} hisobida yarating`,
    );
  }
  return { id: h.id, name: h.name, subdomain: h.subdomain, country: h.country ?? null, currency: h.currency ?? null };
}

// ─── Tuzilish: voronkalar va foydalanuvchilar ────────────────────────────────

const voronkalarJavob = z.object({
  _embedded: z.object({
    pipelines: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        sort: z.number().optional(),
        is_main: z.boolean().optional(),
        is_archive: z.boolean().optional(),
        _embedded: z
          .object({
            statuses: z.array(z.object({ id: z.number(), name: z.string(), sort: z.number().optional(), type: z.number().optional() })),
          })
          .optional(),
      }),
    ),
  }),
});

const foydalanuvchilarJavob = z.object({
  _embedded: z.object({
    users: z.array(
      z.object({
        id: z.number(),
        name: z.string(),
        rights: z.object({ is_admin: z.boolean().optional(), is_active: z.boolean().optional() }).partial().optional(),
      }),
    ),
  }),
});

const maydonlarJavob = z.object({
  _embedded: z.object({ custom_fields: z.array(z.object({ id: z.number() })) }),
  _page_count: z.number().optional(),
});

/** amoCRM tizim bosqichlari: 142 — "Успешно реализовано", 143 — "Закрыто и не реализовано". */
const MUVAFFAQIYAT = 142;
const YOPILGAN = 143;

export interface AmoVoronka {
  id: number;
  name: string;
  isMain: boolean;
  statuses: { id: number; name: string; tur: 'ochiq' | 'muvaffaqiyat' | 'yopilgan' }[];
}

export interface AmoFoydalanuvchi {
  id: number;
  name: string;
  isAdmin: boolean;
  isActive: boolean;
}

export interface AmoTuzilish {
  pipelines: AmoVoronka[];
  users: AmoFoydalanuvchi[];
  leadFieldCount: number;
}

/** Hisob tuzilishi — CRM sahifasida ulanish haqiqatan ishlayotganini ko'rsatadi. */
export async function tuzilishniOl(m: AmoManzil, token: string): Promise<AmoTuzilish> {
  const [v, f, mf] = await Promise.all([
    chaqir<unknown>(m, token, '/api/v4/leads/pipelines'),
    chaqir<unknown>(m, token, '/api/v4/users?limit=250'),
    chaqir<unknown>(m, token, '/api/v4/leads/custom_fields?limit=250'),
  ]);

  const voronkalar = v ? voronkalarJavob.safeParse(v) : null;
  if (voronkalar && !voronkalar.success) throw new AmoXato('server', "amoCRM voronkalar ro'yxatini o'qib bo'lmadi");
  const users = f ? foydalanuvchilarJavob.safeParse(f) : null;
  const maydonlar = mf ? maydonlarJavob.safeParse(mf) : null;

  const pipelines = (voronkalar?.data._embedded.pipelines ?? [])
    .filter((p) => !p.is_archive)
    .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
    .map((p) => ({
      id: p.id,
      name: p.name,
      isMain: Boolean(p.is_main),
      statuses: (p._embedded?.statuses ?? [])
        .slice()
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        .map((s) => ({
          id: s.id,
          name: s.name,
          tur: s.id === MUVAFFAQIYAT ? ('muvaffaqiyat' as const) : s.id === YOPILGAN ? ('yopilgan' as const) : ('ochiq' as const),
        })),
    }));

  return {
    pipelines,
    users: (users?.success ? users.data._embedded.users : []).map((u) => ({
      id: u.id,
      name: u.name,
      isAdmin: Boolean(u.rights?.is_admin),
      isActive: u.rights?.is_active !== false,
    })),
    leadFieldCount: maydonlar?.success ? maydonlar.data._embedded.custom_fields.length : 0,
  };
}

// ─── Saqlanadigan sozlama ────────────────────────────────────────────────────

export const amocrmConfigSchema = z
  .object({
    subdomain: z.string(),
    baseDomain: z.enum(AMO_DOMENLAR),
    accountId: z.number(),
    accountName: z.string(),
    country: z.string().nullable().default(null),
    currency: z.string().nullable().default(null),
    connectedAt: z.string(),
  })
  .partial();

export type AmocrmConfig = z.infer<typeof amocrmConfigSchema>;
