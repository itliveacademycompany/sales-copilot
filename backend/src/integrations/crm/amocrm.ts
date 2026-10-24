import { z } from 'zod';
import {
  CrmXato,
  telefonKaliti,
  vaqtliFetch,
  type CrmAdapter,
  type CrmKontekst,
  type CrmLid,
  type CrmLidMaydon,
  type CrmTuzilish,
  type CrmYozuv,
} from './adapter.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * amoCRM ADAPTERI — uzoq muddatli token (приватная интеграция)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ulanish: hisob manzili + uzoq muddatli token (5 yilgacha). Token saqlashdan
 * oldin `/api/v4/account` bilan tekshiriladi va aynan shu manzildagi hisobga
 * tegishli ekani solishtiriladi — aks holda "A" sozlamasida "B" ma'lumoti
 * ko'rinardi.
 *
 * Yozish: sdelkaga (bo'lmasa kontaktga) `common` izoh va `Связаться`
 * vazifasi. Boshqa hech narsa o'zgartirilmaydi.
 *
 * Limit: amoCRM hisobga soniyasiga 7 ta so'rov beradi. Worker yozuvlarni
 * ketma-ket yuboradi, 429 da bir marta 1 soniya kutib qayta uriniladi.
 */

/** amoCRM hisoblari joylashadigan domenlar. Boshqasi — rad (SSRF). */
export const AMO_DOMENLAR = ['amocrm.ru', 'amocrm.com', 'kommo.com'] as const;
export type AmoDomen = (typeof AMO_DOMENLAR)[number];

const SUBDOMEN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface AmoManzil {
  subdomain: string;
  baseDomain: AmoDomen;
}

/**
 * Kiritilgan manzildan hisobni ajratadi: `kompaniya`, `kompaniya.amocrm.ru`
 * yoki brauzerdan nusxalangan to'liq manzil. Boshqa domen, IP yoki
 * ichma-ich subdomen — `null`.
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

export function hisobManzili(m: AmoManzil): string {
  return `https://${m.subdomain}.${m.baseDomain}`;
}

/** Testda `AMOCRM_API_BASE` (lokal soxta server), aks holda hisob manzili. */
function apiManzil(m: AmoManzil): string {
  const test = process.env.AMOCRM_API_BASE;
  return test ? test.replace(/\/+$/, '') : hisobManzili(m);
}

/** JWT `exp` → amal qilish muddati (faqat ko'rsatish uchun, imzo tekshirilmaydi). */
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

function holatXatosi(status: number): CrmXato {
  if (status === 401) return new CrmXato('token', "Token noto'g'ri, muddati tugagan yoki amoCRM da bekor qilingan");
  if (status === 402) return new CrmXato('tolov', "amoCRM hisobi to'lanmagan yoki bloklangan");
  if (status === 403) return new CrmXato('ruxsat', "Tokenga bu ma'lumotni o'qishga ruxsat berilmagan");
  if (status === 404) return new CrmXato('topilmadi', 'amoCRM hisobi topilmadi — manzilni tekshiring');
  if (status === 429) return new CrmXato('limit', "amoCRM so'rovlar limitiga yetildi — birozdan keyin qayta urinib ko'ring");
  return new CrmXato('server', `amoCRM javob bermadi (HTTP ${status})`);
}

/** amoCRM API so'rovi. 204 — bo'sh natija (`null`). */
export async function chaqir<T>(
  m: AmoManzil,
  token: string,
  yol: string,
  usul: 'GET' | 'POST' = 'GET',
  tana?: unknown,
): Promise<T | null> {
  for (let urinish = 0; urinish < 2; urinish++) {
    let res: Response;
    try {
      res = await vaqtliFetch(`${apiManzil(m)}${yol}`, {
        method: usul,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
          ...(tana === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        body: tana === undefined ? undefined : JSON.stringify(tana),
      });
    } catch {
      throw new CrmXato('tarmoq', "amoCRM ga ulanib bo'lmadi — manzil va internetni tekshiring");
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
      throw new CrmXato('server', "amoCRM javobini o'qib bo'lmadi");
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

export async function hisobniTekshir(m: AmoManzil, token: string) {
  const javob = hisobJavob.safeParse(await chaqir<unknown>(m, token, '/api/v4/account'));
  if (!javob.success) throw new CrmXato('server', "amoCRM hisob ma'lumotini qaytarmadi");
  const h = javob.data;
  if (h.subdomain.toLowerCase() !== m.subdomain) {
    throw new CrmXato('hisob', `Token boshqa hisobga tegishli (${h.subdomain}). Tokenni aynan ${m.subdomain} hisobida yarating`);
  }
  return { id: h.id, name: h.name, subdomain: h.subdomain, country: h.country ?? null, currency: h.currency ?? null };
}

// ─── Tuzilish ────────────────────────────────────────────────────────────────

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
            statuses: z.array(z.object({ id: z.number(), name: z.string(), sort: z.number().optional(), color: z.string().nullish() })),
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
  _embedded: z.object({
    custom_fields: z.array(
      z.object({
        id: z.number(),
        name: z.string().nullish(),
        type: z.string().nullish(),
        sort: z.number().nullish(),
        group_id: z.string().nullish(),
        enums: z.array(z.object({ id: z.number(), value: z.string().nullish(), sort: z.number().nullish() })).nullish(),
      }),
    ),
  }),
});

const guruhlarJavob = z.object({
  _embedded: z.object({ custom_field_groups: z.array(z.object({ id: z.string(), name: z.string().nullish() })) }),
});

/** amoCRM maydon turi → ichki CRM turi. Qo'llab-quvvatlanmaydigani (fayl, yuridik shaxs…) — `null`. */
const AMO_TURLAR: Record<string, CrmLidMaydon['type']> = {
  text: 'text',
  textarea: 'textarea',
  numeric: 'number',
  price: 'money',
  monetary: 'money',
  checkbox: 'checkbox',
  select: 'select',
  radiobutton: 'select',
  multiselect: 'multiselect',
  date: 'date',
  birthday: 'date',
  date_time: 'datetime',
  url: 'url',
  streetaddress: 'text',
  tracking_data: 'text',
};

/** Barcha sdelka maydonlari (sahifalab) va guruh nomlari. */
async function lidMaydonlariniOl(m: AmoManzil, token: string): Promise<{ maydonlar: CrmLidMaydon[]; jami: number }> {
  const xom: z.infer<typeof maydonlarJavob>['_embedded']['custom_fields'] = [];
  for (let sahifa = 1; sahifa <= 20; sahifa++) {
    const r = await chaqir<unknown>(m, token, `/api/v4/leads/custom_fields?limit=250&page=${sahifa}`);
    const j = r ? maydonlarJavob.safeParse(r) : null;
    const bolak = j?.success ? j.data._embedded.custom_fields : [];
    xom.push(...bolak);
    if (bolak.length < 250) break;
  }
  const g = await chaqir<unknown>(m, token, '/api/v4/leads/custom_fields/groups').catch(() => null);
  const gj = g ? guruhlarJavob.safeParse(g) : null;
  const guruhlar = new Map((gj?.success ? gj.data._embedded.custom_field_groups : []).map((x) => [x.id, x.name ?? null]));
  const maydonlar: CrmLidMaydon[] = [];
  for (const f of xom) {
    const type = f.type ? AMO_TURLAR[f.type] : undefined;
    if (!type || !f.name) continue;
    maydonlar.push({
      id: String(f.id),
      name: f.name,
      type,
      group: (f.group_id && guruhlar.get(f.group_id)) || null,
      sort: f.sort ?? 0,
      options: (f.enums ?? [])
        .slice()
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        .map((e) => ({ id: String(e.id), label: (e.value ?? '').trim() || `#${e.id}` })),
    });
  }
  return { maydonlar, jami: xom.length };
}

/** amoCRM tizim bosqichlari: 142 — "Успешно реализовано", 143 — "Закрыто и не реализовано". */
const MUVAFFAQIYAT = 142;
const YOPILGAN = 143;

export async function tuzilishniOl(m: AmoManzil, token: string): Promise<CrmTuzilish> {
  const [v, f, mf] = await Promise.all([
    chaqir<unknown>(m, token, '/api/v4/leads/pipelines'),
    chaqir<unknown>(m, token, '/api/v4/users?limit=250'),
    // Maydonlar ixtiyoriy: o'qib bo'lmasa ham ulanish va lidlar ishlayveradi
    lidMaydonlariniOl(m, token).catch(() => ({ maydonlar: [] as CrmLidMaydon[], jami: 0 })),
  ]);
  const voronkalar = v ? voronkalarJavob.safeParse(v) : null;
  if (voronkalar && !voronkalar.success) throw new CrmXato('server', "amoCRM voronkalar ro'yxatini o'qib bo'lmadi");
  const users = f ? foydalanuvchilarJavob.safeParse(f) : null;

  return {
    pipelines: (voronkalar?.data._embedded.pipelines ?? [])
      .filter((p) => !p.is_archive)
      .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
      .map((p) => ({
        id: String(p.id),
        name: p.name,
        isMain: Boolean(p.is_main),
        statuses: (p._embedded?.statuses ?? [])
          .slice()
          .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
          .map((s) => ({
            id: String(s.id),
            name: s.name,
            tur: s.id === MUVAFFAQIYAT ? ('muvaffaqiyat' as const) : s.id === YOPILGAN ? ('yopilgan' as const) : ('ochiq' as const),
            color: s.color && /^#[0-9a-fA-F]{6}$/.test(s.color) ? s.color.toLowerCase() : null,
          })),
      })),
    users: (users?.success ? users.data._embedded.users : []).map((u) => ({
      id: String(u.id),
      name: u.name,
      isAdmin: Boolean(u.rights?.is_admin),
      isActive: u.rights?.is_active !== false,
    })),
    leadFieldCount: mf.jami,
    leadFields: mf.maydonlar,
  };
}

// ─── Telefon bo'yicha sdelka ─────────────────────────────────────────────────

const kontaktlarJavob = z.object({
  _embedded: z.object({
    contacts: z.array(
      z.object({
        id: z.number(),
        name: z.string().nullish(),
        responsible_user_id: z.number().nullish(),
        custom_fields_values: z
          .array(
            z.object({
              field_code: z.string().nullish(),
              values: z.array(z.object({ value: z.union([z.string(), z.number()]).nullish() })).nullish(),
            }),
          )
          .nullish(),
        _embedded: z.object({ leads: z.array(z.object({ id: z.number() })).nullish() }).nullish(),
      }),
    ),
  }),
});

const sdelkalarJavob = z.object({
  _embedded: z.object({
    leads: z.array(
      z.object({
        id: z.number(),
        name: z.string().nullish(),
        status_id: z.number().nullish(),
        responsible_user_id: z.number().nullish(),
        updated_at: z.number().nullish(),
        is_deleted: z.boolean().nullish(),
      }),
    ),
  }),
});

/**
 * Telefon bo'yicha: kontakt → uning eng so'nggi OCHIQ sdelkasi.
 *
 * `query` matn bo'yicha qidiradi va raqam bo'lagi boshqa maydonda ham
 * uchrashi mumkin, shuning uchun topilgan kontaktning PHONE maydoni oxirgi
 * 9 raqam bo'yicha QAYTA tekshiriladi — begona sdelkaga izoh tushmasin.
 */
export async function telefondanTop(m: AmoManzil, token: string, telefon: string): Promise<CrmYozuv | null> {
  const kalit = telefonKaliti(telefon);
  if (!kalit) return null;
  const k = await chaqir<unknown>(m, token, `/api/v4/contacts?query=${kalit}&with=leads&limit=10`);
  if (!k) return null;
  const kontaktlar = kontaktlarJavob.safeParse(k);
  if (!kontaktlar.success) return null;

  const mos = kontaktlar.data._embedded.contacts.filter((c) =>
    (c.custom_fields_values ?? []).some(
      (f) => f.field_code === 'PHONE' && (f.values ?? []).some((v) => telefonKaliti(String(v.value ?? '')) === kalit),
    ),
  );
  if (mos.length === 0) return null;

  const sdelkaIdlar = [...new Set(mos.flatMap((c) => (c._embedded?.leads ?? []).map((l) => l.id)))].slice(0, 50);
  if (sdelkaIdlar.length > 0) {
    const filtr = sdelkaIdlar.map((id) => `filter[id][]=${id}`).join('&');
    const s = await chaqir<unknown>(m, token, `/api/v4/leads?${filtr}&limit=50`);
    const sdelkalar = s ? sdelkalarJavob.safeParse(s) : null;
    const ochiq = (sdelkalar?.success ? sdelkalar.data._embedded.leads : [])
      .filter((l) => !l.is_deleted && l.status_id !== MUVAFFAQIYAT && l.status_id !== YOPILGAN)
      .sort((a, b) => (b.updated_at ?? 0) - (a.updated_at ?? 0))[0];
    if (ochiq) {
      return {
        tur: 'deal',
        id: String(ochiq.id),
        nom: ochiq.name ?? null,
        url: `${hisobManzili(m)}/leads/detail/${ochiq.id}`,
        masulId: ochiq.responsible_user_id ? String(ochiq.responsible_user_id) : null,
      };
    }
  }

  const c = mos[0]!;
  return {
    tur: 'contact',
    id: String(c.id),
    nom: c.name ?? null,
    url: `${hisobManzili(m)}/contacts/detail/${c.id}`,
    masulId: c.responsible_user_id ? String(c.responsible_user_id) : null,
  };
}

const yaratildiJavob = (kalit: 'notes' | 'tasks') =>
  z.object({ _embedded: z.object({ [kalit]: z.array(z.object({ id: z.number() })).min(1) }) });

function entityYoli(y: CrmYozuv): string {
  return y.tur === 'deal' ? 'leads' : 'contacts';
}

// ─── OAuth (bir tugmada ulash) ───────────────────────────────────────────────

/**
 * OAuth juftligi `sir` ichida JSON bo'lib saqlanadi. Uzoq muddatli token esa
 * oddiy satr — ikkalasini shu belgi ajratadi.
 */
export interface AmoOauthSir {
  t: 'oauth';
  access: string;
  refresh: string;
  /** access token tugash vaqti (unix soniya). */
  exp: number;
}

export function oauthSirmi(sir: string): AmoOauthSir | null {
  if (!sir.startsWith('{')) return null;
  try {
    const j = JSON.parse(sir) as Partial<AmoOauthSir>;
    return j.t === 'oauth' && typeof j.access === 'string' && typeof j.refresh === 'string' && typeof j.exp === 'number'
      ? (j as AmoOauthSir)
      : null;
  } catch {
    return null;
  }
}

/** So'rov uchun token: OAuth bo'lsa yangilanadigan access, bo'lmasa uzoq muddatli token. */
async function amoToken(k: CrmKontekst): Promise<string> {
  if (k.token) return k.token();
  return oauthSirmi(k.sir)?.access ?? k.sir;
}

/**
 * Foydalanuvchi ruxsat beradigan sahifa. `state` — imzolangan, qaytishda
 * tekshiriladi. `mode=popup` — ruxsatdan keyin asosiy oyna redirect
 * manziliga o'tadi (popup bloklanmaydi, chunki sahifaning o'zi ochiladi).
 */
export function oauthHavola(clientId: string, state: string): string {
  const q = new URLSearchParams({ client_id: clientId, state, mode: 'popup' });
  return `https://www.amocrm.ru/oauth?${q.toString()}`;
}

const tokenJavob = z.object({
  access_token: z.string().min(10),
  refresh_token: z.string().min(10),
  expires_in: z.coerce.number().positive(),
});

/**
 * Kodni (20 daqiqa amal qiladi) yoki refresh tokenni (BIR MARTALIK!) yangi
 * juftlikka almashtiradi. So'rov foydalanuvchi hisobiga ketadi — manzil
 * avval `manzilniAjrat` dan o'tgan bo'lishi shart (SSRF).
 */
export async function oauthAlmashtir(
  m: AmoManzil,
  p: { clientId: string; clientSecret: string; redirectUri: string } & (
    | { tur: 'kod'; kod: string }
    | { tur: 'yangilash'; refresh: string }
  ),
): Promise<AmoOauthSir> {
  const tana = {
    client_id: p.clientId,
    client_secret: p.clientSecret,
    redirect_uri: p.redirectUri,
    ...(p.tur === 'kod'
      ? { grant_type: 'authorization_code', code: p.kod }
      : { grant_type: 'refresh_token', refresh_token: p.refresh }),
  };
  let res: Response;
  try {
    res = await vaqtliFetch(`${apiManzil(m)}/oauth2/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(tana),
    });
  } catch {
    throw new CrmXato('tarmoq', "amoCRM ga ulanib bo'lmadi — manzil va internetni tekshiring");
  }
  if (res.status === 400 || res.status === 401) {
    throw new CrmXato(
      'token',
      p.tur === 'kod'
        ? 'amoCRM ruxsat kodini qabul qilmadi — «amoCRM bilan ulash» ni qaytadan bosing'
        : "amoCRM ruxsati bekor qilingan yoki muddati o'tgan — amoCRM ni qayta ulang",
    );
  }
  if (!res.ok) throw holatXatosi(res.status);
  const j = tokenJavob.safeParse(await res.json().catch(() => null));
  if (!j.success) throw new CrmXato('server', "amoCRM token javobini o'qib bo'lmadi");
  return {
    t: 'oauth',
    access: j.data.access_token,
    refresh: j.data.refresh_token,
    exp: Math.floor(Date.now() / 1000) + j.data.expires_in,
  };
}

// ─── Lidlar (sdelkalar) ──────────────────────────────────────────────────────

const lidlarJavob = z.object({
  _embedded: z.object({
    leads: z.array(
      z.object({
        id: z.number(),
        name: z.string().nullish(),
        price: z.number().nullish(),
        responsible_user_id: z.number().nullish(),
        status_id: z.number().nullish(),
        pipeline_id: z.number().nullish(),
        created_at: z.number().nullish(),
        updated_at: z.number(),
        closed_at: z.number().nullish(),
        is_deleted: z.boolean().nullish(),
        custom_fields_values: z
          .array(
            z.object({
              field_id: z.number(),
              values: z
                .array(z.object({ value: z.union([z.string(), z.number(), z.boolean()]).nullish(), enum_id: z.number().nullish() }))
                .nullish(),
            }),
          )
          .nullish(),
        _embedded: z
          .object({ contacts: z.array(z.object({ id: z.number(), is_main: z.boolean().nullish() })).nullish() })
          .nullish(),
      }),
    ),
  }),
});

const LID_SAHIFA = 250;

interface AmoKursor {
  /** `updated_at` shu qiymatdan (shu jumladan) boshlab. */
  dan: number;
  sahifa: number;
}

function kursorniOqi(k: string | null): AmoKursor {
  try {
    const j = k ? (JSON.parse(k) as Partial<AmoKursor>) : {};
    return { dan: Number(j.dan) || 0, sahifa: Math.max(1, Number(j.sahifa) || 1) };
  } catch {
    return { dan: 0, sahifa: 1 };
  }
}

/**
 * O'zgargan sdelkalar — `updated_at` o'sish tartibida, 250 tadan.
 *
 * Keyingi joy: sahifadagi eng katta `updated_at` (shu jumladan — chegaradagi
 * lid ikki marta kelsa ham upsert zararsiz). Agar butun sahifa BIR XIL
 * vaqtga ega bo'lsa (ommaviy tahrir), vaqt siljimaydi — shunda sahifa raqami
 * oshiriladi, aks holda sinxronlash bir joyda aylanib qolardi.
 */
/**
 * Qaysi sdelkalar hali bor. ID bo'yicha filtr, 100 tadan (URL uzunligi
 * xavfsiz chegarada). `is_deleted` — savatdagi sdelka ham "yo'q" hisoblanadi.
 * 204 (birortasi topilmadi) — bo'sh to'plam, xato emas.
 */
const mavjudJavob = z.object({
  _embedded: z.object({ leads: z.array(z.object({ id: z.number(), is_deleted: z.boolean().nullish() })) }),
});

async function mavjudLidlarniOl(m: AmoManzil, token: string, idlar: string[]): Promise<Set<string>> {
  const bor = new Set<string>();
  const sonli = idlar.filter((id) => /^\d+$/.test(id));
  for (let i = 0; i < sonli.length; i += 100) {
    const bolak = sonli.slice(i, i + 100);
    const r = await chaqir<unknown>(m, token, `/api/v4/leads?limit=250&${bolak.map((id) => `filter[id][]=${id}`).join('&')}`);
    if (r === null) continue;
    const j = mavjudJavob.safeParse(r);
    if (!j.success) throw new CrmXato('server', "amoCRM sdelkalarini tekshirib bo'lmadi");
    for (const l of j.data._embedded.leads) if (!l.is_deleted) bor.add(String(l.id));
  }
  return bor;
}

async function lidlarniOl(m: AmoManzil, token: string, kursor: string | null) {
  const k = kursorniOqi(kursor);
  const filtr = k.dan > 0 ? `&filter[updated_at][from]=${k.dan}` : '';
  const r = await chaqir<unknown>(
    m,
    token,
    `/api/v4/leads?with=contacts&limit=${LID_SAHIFA}&page=${k.sahifa}&order[updated_at]=asc${filtr}`,
  );
  const j = r ? lidlarJavob.safeParse(r) : null;
  if (j && !j.success) throw new CrmXato('server', "amoCRM sdelkalar ro'yxatini o'qib bo'lmadi");
  const hammasi = j?.data._embedded.leads ?? [];
  const xom = hammasi.filter((l) => !l.is_deleted);

  // Asosiy kontaktlar: ism va telefon (250 tadan bitta so'rov)
  const kontaktId = new Map<number, number>();
  for (const l of xom) {
    const c = l._embedded?.contacts ?? [];
    const asosiy = c.find((x) => x.is_main) ?? c[0];
    if (asosiy) kontaktId.set(l.id, asosiy.id);
  }
  const kontaktlar = new Map<number, { nom: string | null; telefonlar: string[] }>();
  const idlar = [...new Set(kontaktId.values())];
  for (let i = 0; i < idlar.length; i += 250) {
    const bolak = idlar.slice(i, i + 250);
    const kr = await chaqir<unknown>(m, token, `/api/v4/contacts?limit=250&${bolak.map((id) => `filter[id][]=${id}`).join('&')}`);
    const kj = kr ? kontaktlarJavob.safeParse(kr) : null;
    for (const c of kj?.success ? kj.data._embedded.contacts : []) {
      const telefonlar = (c.custom_fields_values ?? [])
        .filter((f) => f.field_code === 'PHONE')
        .flatMap((f) => (f.values ?? []).map((v) => String(v.value ?? '').trim()))
        .filter(Boolean);
      kontaktlar.set(c.id, { nom: c.name ?? null, telefonlar });
    }
  }

  const sekund = (v: number | null | undefined) => (v ? new Date(v * 1000) : null);
  const lidlar: CrmLid[] = xom.map((l) => {
    const cid = kontaktId.get(l.id);
    const c = cid ? kontaktlar.get(cid) : undefined;
    return {
      id: String(l.id),
      nom: l.name ?? null,
      voronkaId: l.pipeline_id ? String(l.pipeline_id) : null,
      bosqichId: l.status_id ? String(l.status_id) : null,
      summa: l.price ?? null,
      masulId: l.responsible_user_id ? String(l.responsible_user_id) : null,
      kontaktId: cid ? String(cid) : null,
      kontaktNom: c?.nom ?? null,
      telefonlar: c?.telefonlar ?? [],
      yaratilgan: sekund(l.created_at),
      yangilangan: new Date(l.updated_at * 1000),
      yopilgan: sekund(l.closed_at),
      url: `${hisobManzili(m)}/leads/detail/${l.id}`,
      maydonlar: Object.fromEntries(
        (l.custom_fields_values ?? []).map((f) => {
          const v = f.values ?? [];
          return [
            String(f.field_id),
            {
              enum: v.filter((x) => x.enum_id !== null && x.enum_id !== undefined).map((x) => String(x.enum_id)),
              qiymatlar: v.map((x) => x.value).filter((x): x is string | number | boolean => x !== null && x !== undefined),
            },
          ];
        }),
      ),
    };
  });

  const toliq = hammasi.length >= LID_SAHIFA;
  const engKatta = Math.max(k.dan, ...hammasi.map((l) => l.updated_at));
  const keyingi: AmoKursor =
    toliq && engKatta === k.dan ? { dan: k.dan, sahifa: k.sahifa + 1 } : { dan: engKatta, sahifa: 1 };
  return { lidlar, kursor: JSON.stringify(keyingi), tugadi: !toliq };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

function kontekstdan(k: CrmKontekst): AmoManzil {
  const sub = typeof k.config.subdomain === 'string' ? k.config.subdomain : '';
  const dom = AMO_DOMENLAR.find((d) => d === k.config.baseDomain) ?? 'amocrm.ru';
  if (!SUBDOMEN.test(sub)) throw new CrmXato('kirish', 'amoCRM manzili saqlanmagan — qayta ulang');
  return { subdomain: sub, baseDomain: dom };
}

export const amocrmAdapter: CrmAdapter = {
  kind: 'amocrm',
  nom: 'amoCRM',
  tavsif: "Sdelkalar, kontaktlar va qo'ng'iroqlar",
  qollanma: [
    'amoCRM da amoМаркет → yuqori o‘ng burchakdagi «⋯» → «Создать интеграцию» → «Внешняя интеграция» ni tanlang.',
    '«Ссылка для перенаправления» ga istalgan https manzil yozing (masalan amoCRM hisobingiz manzili), «Предоставить доступ: Все» ni belgilang, «Название интеграции» ga «SotuvAI» deb yozing va «Сохранить» ni bosing.',
    'Ochilgan integratsiya oynasida «Ключи и доступы» bo‘limiga o‘ting va «Долгосрочный токен» yarating.',
    'Muddatini tanlang (uzoqroq — qulayroq), «eyJ…» bilan boshlanadigan tokenni to‘liq nusxalab shu yerga qo‘ying.',
  ],
  maydonlar: [
    {
      kalit: 'address',
      nom: 'Hisob manzili',
      tur: 'matn',
      placeholder: 'kompaniya.amocrm.ru',
      yordam: 'Brauzerdagi amoCRM manzilini nusxalab qo‘yishingiz mumkin.',
    },
    { kalit: 'token', nom: 'Uzoq muddatli token', tur: 'sir', placeholder: 'eyJ0eXAiOiJKV1Qi…' },
  ],

  async ulash(kirish, eski) {
    const manzil = manzilniAjrat(kirish.address ?? '');
    if (!manzil) throw new CrmXato('kirish', "Manzil noto'g'ri. Masalan: kompaniya.amocrm.ru");
    const ozgarmagan = eski?.config.subdomain === manzil.subdomain && eski.config.baseDomain === manzil.baseDomain;
    // OAuth bilan ulangan bo'lsa, eski "sir" token emas — yangisini kiritish shart
    const eskiToken = eski && !oauthSirmi(eski.sir) ? eski.sir : '';
    const token = (kirish.token ?? '').trim() || (ozgarmagan ? eskiToken : '') || '';
    if (!token) throw new CrmXato('kirish', 'Uzoq muddatli tokenni kiriting');

    const hisob = await hisobniTekshir(manzil, token);
    const muddat = tokenMuddati(token);
    if (muddat && muddat.getTime() <= Date.now()) {
      throw new CrmXato('token', 'Token muddati tugagan — amoCRM da yangisini yarating');
    }
    return {
      config: {
        subdomain: manzil.subdomain,
        baseDomain: manzil.baseDomain,
        address: `${manzil.subdomain}.${manzil.baseDomain}`,
        accountId: hisob.id,
        accountName: hisob.name,
        authType: 'token',
      },
      sir: token,
      tokenExpiresAt: muddat,
      hisob: { nom: hisob.name, url: hisobManzili(manzil) },
      sirKorinishi: `${token.slice(0, 4)}…${token.slice(-4)}`,
    };
  },

  async tekshir(k) {
    const h = await hisobniTekshir(kontekstdan(k), await amoToken(k));
    return { nom: h.name };
  },

  tuzilish: async (k) => tuzilishniOl(kontekstdan(k), await amoToken(k)),

  topish: async (k, telefon) => telefondanTop(kontekstdan(k), await amoToken(k), telefon),

  lidlar: async (k, kursor) => lidlarniOl(kontekstdan(k), await amoToken(k), kursor),

  mavjudLidlar: async (k, idlar) => mavjudLidlarniOl(kontekstdan(k), await amoToken(k), idlar),

  async izoh(k, y, matn) {
    const r = await chaqir<unknown>(kontekstdan(k), await amoToken(k), `/api/v4/${entityYoli(y)}/${y.id}/notes`, 'POST', [
      { note_type: 'common', params: { text: matn } },
    ]);
    const j = yaratildiJavob('notes').safeParse(r);
    return j.success ? String((j.data._embedded.notes as { id: number }[])[0]!.id) : null;
  },

  async vazifa(k, y, v) {
    const r = await chaqir<unknown>(kontekstdan(k), await amoToken(k), '/api/v4/tasks', 'POST', [
      {
        task_type_id: 1, // «Связаться»
        text: `${v.sarlavha}${v.matn ? `\n${v.matn}` : ''}`.slice(0, 2000),
        complete_till: Math.floor(v.muddat.getTime() / 1000),
        entity_id: Number(y.id),
        entity_type: entityYoli(y),
        ...(y.masulId ? { responsible_user_id: Number(y.masulId) } : {}),
      },
    ]);
    const j = yaratildiJavob('tasks').safeParse(r);
    return j.success ? String((j.data._embedded.tasks as { id: number }[])[0]!.id) : null;
  },
};
