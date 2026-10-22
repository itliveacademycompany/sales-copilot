import { z } from 'zod';
import {
  CrmXato,
  telefonKaliti,
  vaqtliFetch,
  type CrmAdapter,
  type CrmKontekst,
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
          .object({ statuses: z.array(z.object({ id: z.number(), name: z.string(), sort: z.number().optional() })) })
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

const maydonlarJavob = z.object({ _embedded: z.object({ custom_fields: z.array(z.object({ id: z.number() })) }) });

/** amoCRM tizim bosqichlari: 142 — "Успешно реализовано", 143 — "Закрыто и не реализовано". */
const MUVAFFAQIYAT = 142;
const YOPILGAN = 143;

export async function tuzilishniOl(m: AmoManzil, token: string): Promise<CrmTuzilish> {
  const [v, f, mf] = await Promise.all([
    chaqir<unknown>(m, token, '/api/v4/leads/pipelines'),
    chaqir<unknown>(m, token, '/api/v4/users?limit=250'),
    chaqir<unknown>(m, token, '/api/v4/leads/custom_fields?limit=250'),
  ]);
  const voronkalar = v ? voronkalarJavob.safeParse(v) : null;
  if (voronkalar && !voronkalar.success) throw new CrmXato('server', "amoCRM voronkalar ro'yxatini o'qib bo'lmadi");
  const users = f ? foydalanuvchilarJavob.safeParse(f) : null;
  const maydonlar = mf ? maydonlarJavob.safeParse(mf) : null;

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
          })),
      })),
    users: (users?.success ? users.data._embedded.users : []).map((u) => ({
      id: String(u.id),
      name: u.name,
      isAdmin: Boolean(u.rights?.is_admin),
      isActive: u.rights?.is_active !== false,
    })),
    leadFieldCount: maydonlar?.success ? maydonlar.data._embedded.custom_fields.length : 0,
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
    const token = (kirish.token ?? '').trim() || (ozgarmagan ? eski?.sir : '') || '';
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
      },
      sir: token,
      tokenExpiresAt: muddat,
      hisob: { nom: hisob.name, url: hisobManzili(manzil) },
      sirKorinishi: `${token.slice(0, 4)}…${token.slice(-4)}`,
    };
  },

  async tekshir(k) {
    const h = await hisobniTekshir(kontekstdan(k), k.sir);
    return { nom: h.name };
  },

  tuzilish: (k) => tuzilishniOl(kontekstdan(k), k.sir),

  topish: (k, telefon) => telefondanTop(kontekstdan(k), k.sir, telefon),

  async izoh(k, y, matn) {
    const r = await chaqir<unknown>(kontekstdan(k), k.sir, `/api/v4/${entityYoli(y)}/${y.id}/notes`, 'POST', [
      { note_type: 'common', params: { text: matn } },
    ]);
    const j = yaratildiJavob('notes').safeParse(r);
    return j.success ? String((j.data._embedded.notes as { id: number }[])[0]!.id) : null;
  },

  async vazifa(k, y, v) {
    const r = await chaqir<unknown>(kontekstdan(k), k.sir, '/api/v4/tasks', 'POST', [
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
