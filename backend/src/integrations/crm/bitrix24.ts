import { z } from 'zod';
import {
  CrmXato,
  raqamlar,
  telefonKaliti,
  vaqtliFetch,
  type CrmAdapter,
  type CrmKontekst,
  type CrmLid,
  type CrmTuzilish,
  type CrmYozuv,
} from './adapter.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BITRIX24 ADAPTERI — kiruvchi webhook (входящий вебхук)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ulanish BITTA maydon: `https://<portal>.bitrix24.<tld>/rest/<user>/<kod>/`.
 * Manzilning o'zi sir (kodni bilgan har kim portalga yoza oladi), shuning
 * uchun u shifrlab saqlanadi va interfeysda faqat portal nomi ko'rinadi.
 *
 * Kerakli ruxsatlar (webhook yaratishda belgilanadi): `crm` (majburiy),
 * `user` (foydalanuvchilar ro'yxati uchun, ixtiyoriy).
 *
 * Yozish: sdelka (bo'lmasa kontakt) xronologiyasiga izoh
 * (`crm.timeline.comment.add`) va mas'ulga ish (`crm.activity.todo.add`).
 * Bitrix24 `tasks` moduli kerak emas — ish CRM kartochkasida ko'rinadi.
 *
 * Faqat bulutli Bitrix24 domenlari qabul qilinadi (SSRF himoyasi): o'z
 * serveridagi "коробка" ixtiyoriy domen bo'ladi — u keyinroq, IP manzilni
 * tekshirish bilan qo'shiladi.
 */

const BITRIX_DOMEN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.bitrix24\.(?:ru|com|kz|by|ua|uz|de|eu|es|fr|pl|it|in|uk|com\.br|com\.tr|cn|jp|vn|id)$/;
const YOL = /^\/rest\/(\d{1,10})\/([a-z0-9]{8,64})\/?/i;

export interface BitrixWebhook {
  portal: string;
  userId: string;
  kod: string;
}

/** Webhook manzilini ajratadi. Boshqa domen, http yoki noto'g'ri yo'l — `null`. */
export function webhookniAjrat(kirish: string): BitrixWebhook | null {
  let url: URL;
  try {
    url = new URL(kirish.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
  const portal = url.hostname.toLowerCase();
  if (!BITRIX_DOMEN.test(portal)) return null;
  const m = YOL.exec(url.pathname);
  if (!m) return null;
  return { portal, userId: m[1]!, kod: m[2]! };
}

function bazaManzil(w: BitrixWebhook): string {
  const test = process.env.BITRIX24_API_BASE;
  return test ? `${test.replace(/\/+$/, '')}/rest/${w.userId}/${w.kod}/` : `https://${w.portal}/rest/${w.userId}/${w.kod}/`;
}

interface BitrixJavob<T> {
  result?: T;
  /** Ro'yxat usullarida keyingi sahifaning `start` qiymati (bo'lmasa — oxirgi sahifa). */
  next?: number;
  total?: number;
  error?: string;
  error_description?: string;
}

function xatoTuri(status: number, kod: string | undefined): CrmXato {
  const k = (kod ?? '').toUpperCase();
  if (k === 'QUERY_LIMIT_EXCEEDED' || status === 429 || status === 503) {
    return new CrmXato('limit', "Bitrix24 so'rovlar limitiga yetildi — birozdan keyin qayta urinib ko'ring");
  }
  if (k === 'INSUFFICIENT_SCOPE' || k === 'ACCESS_DENIED' || status === 403) {
    return new CrmXato('ruxsat', 'Webhookka «CRM» ruxsati berilmagan — Bitrix24 da webhook ruxsatlarini tekshiring');
  }
  if (k === 'INVALID_CREDENTIALS' || k === 'WRONG_AUTH_TYPE' || k === 'EXPIRED_TOKEN' || status === 401) {
    return new CrmXato('token', "Webhook manzili noto'g'ri yoki Bitrix24 da o'chirilgan");
  }
  if (k === 'PAYMENT_REQUIRED' || k === 'ACCOUNT_BLOCKED' || status === 402) {
    return new CrmXato('tolov', "Bitrix24 portali to'lanmagan yoki bloklangan");
  }
  if (status === 404 || k === 'ERROR_METHOD_NOT_FOUND' || k === 'NOT_FOUND') {
    return new CrmXato('topilmadi', 'Bitrix24 portali topilmadi — webhook manzilini tekshiring');
  }
  return new CrmXato('server', `Bitrix24 javob bermadi (${k || `HTTP ${status}`})`);
}

/** Bitrix24 REST usuli. Hamma so'rov POST + JSON (Bitrix24 ikkalasini ham qabul qiladi). */
export async function bitrixChaqir<T>(w: BitrixWebhook, usul: string, param: Record<string, unknown> = {}): Promise<T> {
  return (await bitrixSorov<T>(w, usul, param)).result as T;
}

/** To'liq javob — ro'yxat usullarida `next` kerak bo'lganda. */
async function bitrixSorov<T>(w: BitrixWebhook, usul: string, param: Record<string, unknown> = {}): Promise<BitrixJavob<T>> {
  for (let urinish = 0; urinish < 2; urinish++) {
    let res: Response;
    try {
      res = await vaqtliFetch(`${bazaManzil(w)}${usul}.json`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(param),
      });
    } catch {
      throw new CrmXato('tarmoq', "Bitrix24 ga ulanib bo'lmadi — manzil va internetni tekshiring");
    }
    let j: BitrixJavob<T> | null = null;
    try {
      j = (await res.json()) as BitrixJavob<T>;
    } catch {
      j = null;
    }
    const xato = xatoTuri(res.status, j?.error);
    if (xato.tur === 'limit' && urinish === 0 && (!res.ok || j?.error)) {
      await new Promise((r) => setTimeout(r, 1000));
      continue;
    }
    if (!res.ok || !j || j.error) throw xato;
    return j;
  }
  throw new CrmXato('limit', "Bitrix24 so'rovlar limitiga yetildi — birozdan keyin qayta urinib ko'ring");
}

// ─── Tuzilish ────────────────────────────────────────────────────────────────

const yonalishlar = z.object({
  categories: z.array(z.object({ id: z.coerce.number(), name: z.string(), isDefault: z.union([z.boolean(), z.string()]).optional() })),
});
const bosqichlar = z.array(
  z.object({ STATUS_ID: z.string(), NAME: z.string(), SORT: z.coerce.number().optional(), SEMANTICS: z.string().nullish() }),
);
const odamlar = z.array(
  z.object({
    ID: z.coerce.string(),
    NAME: z.string().nullish(),
    LAST_NAME: z.string().nullish(),
    ACTIVE: z.union([z.boolean(), z.string()]).nullish(),
  }),
);

async function tuzilishniOl(w: BitrixWebhook): Promise<CrmTuzilish> {
  const y = yonalishlar.safeParse(await bitrixChaqir<unknown>(w, 'crm.category.list', { entityTypeId: 2 }));
  const kategoriyalar = y.success ? y.data.categories : [{ id: 0, name: 'Sdelkalar', isDefault: true }];

  const pipelines = [];
  for (const c of kategoriyalar.slice(0, 20)) {
    const b = bosqichlar.safeParse(
      await bitrixChaqir<unknown>(w, 'crm.status.list', {
        filter: { ENTITY_ID: c.id === 0 ? 'DEAL_STAGE' : `DEAL_STAGE_${c.id}` },
        order: { SORT: 'ASC' },
      }),
    );
    pipelines.push({
      id: String(c.id),
      name: c.name,
      isMain: c.isDefault === true || c.isDefault === 'Y' || c.id === 0,
      statuses: (b.success ? b.data : []).map((s) => ({
        id: s.STATUS_ID,
        name: s.NAME,
        tur: s.SEMANTICS === 'S' ? ('muvaffaqiyat' as const) : s.SEMANTICS === 'F' ? ('yopilgan' as const) : ('ochiq' as const),
      })),
    });
  }

  // `user` ruxsati bo'lmasa ro'yxat bo'sh — ulanish buzilgan emas
  const users = await bitrixChaqir<unknown>(w, 'user.get', { FILTER: { USER_TYPE: 'employee' } })
    .then((r) => odamlar.safeParse(r))
    .catch(() => null);
  const maydonlar = await bitrixChaqir<unknown[]>(w, 'crm.deal.userfield.list', {}).catch(() => []);

  return {
    pipelines,
    users: (users?.success ? users.data : []).map((u) => ({
      id: u.ID,
      name: [u.NAME, u.LAST_NAME].filter(Boolean).join(' ') || `#${u.ID}`,
      isAdmin: false,
      isActive: u.ACTIVE !== false && u.ACTIVE !== 'N',
    })),
    leadFieldCount: Array.isArray(maydonlar) ? maydonlar.length : 0,
    leadFields: [],
  };
}

// ─── Telefon bo'yicha sdelka ─────────────────────────────────────────────────

const dublikat = z.object({ CONTACT: z.array(z.coerce.number()).optional() }).or(z.array(z.unknown()));
const sdelkalar = z.array(
  z.object({ ID: z.coerce.string(), TITLE: z.string().nullish(), ASSIGNED_BY_ID: z.coerce.string().nullish() }),
);
const kontakt = z.object({
  ID: z.coerce.string(),
  NAME: z.string().nullish(),
  LAST_NAME: z.string().nullish(),
  ASSIGNED_BY_ID: z.coerce.string().nullish(),
});

/** CRM da raqam qanday yozilganini bilmaymiz — bir nechta ko'rinish bilan qidiriladi. */
function raqamVariantlari(telefon: string): string[] {
  const r = raqamlar(telefon);
  const oxirgi9 = r.slice(-9);
  return [...new Set([`+998${oxirgi9}`, `998${oxirgi9}`, oxirgi9, `8${oxirgi9}`, r, `+${r}`])];
}

async function telefondanTop(w: BitrixWebhook, telefon: string): Promise<CrmYozuv | null> {
  if (!telefonKaliti(telefon)) return null;
  const d = dublikat.safeParse(
    await bitrixChaqir<unknown>(w, 'crm.duplicate.findbycomm', {
      entity_type: 'CONTACT',
      type: 'PHONE',
      values: raqamVariantlari(telefon),
    }),
  );
  const kontaktIdlar = d.success && !Array.isArray(d.data) ? (d.data.CONTACT ?? []) : [];
  if (kontaktIdlar.length === 0) return null;

  const s = sdelkalar.safeParse(
    await bitrixChaqir<unknown>(w, 'crm.deal.list', {
      filter: { '@CONTACT_ID': kontaktIdlar.slice(0, 20), CLOSED: 'N' },
      order: { DATE_MODIFY: 'DESC' },
      select: ['ID', 'TITLE', 'ASSIGNED_BY_ID'],
      start: -1,
    }),
  );
  const ochiq = s.success ? s.data[0] : undefined;
  if (ochiq) {
    return {
      tur: 'deal',
      id: ochiq.ID,
      nom: ochiq.TITLE ?? null,
      url: `https://${w.portal}/crm/deal/details/${ochiq.ID}/`,
      masulId: ochiq.ASSIGNED_BY_ID ?? null,
    };
  }

  const k = kontakt.safeParse(await bitrixChaqir<unknown>(w, 'crm.contact.get', { id: kontaktIdlar[0] }));
  const id = String(kontaktIdlar[0]);
  return {
    tur: 'contact',
    id,
    nom: k.success ? [k.data.NAME, k.data.LAST_NAME].filter(Boolean).join(' ') || null : null,
    url: `https://${w.portal}/crm/contact/details/${id}/`,
    masulId: k.success ? (k.data.ASSIGNED_BY_ID ?? null) : null,
  };
}

// ─── Lidlar (sdelkalar) ──────────────────────────────────────────────────────

const bxSdelkalar = z.array(
  z.object({
    ID: z.coerce.string(),
    TITLE: z.string().nullish(),
    CATEGORY_ID: z.coerce.string().nullish(),
    STAGE_ID: z.string().nullish(),
    OPPORTUNITY: z.union([z.string(), z.number()]).nullish(),
    ASSIGNED_BY_ID: z.coerce.string().nullish(),
    CONTACT_ID: z.coerce.string().nullish(),
    DATE_CREATE: z.string().nullish(),
    DATE_MODIFY: z.string(),
    CLOSEDATE: z.string().nullish(),
    CLOSED: z.string().nullish(),
  }),
);

const bxKontaktlar = z.array(
  z.object({
    ID: z.coerce.string(),
    NAME: z.string().nullish(),
    LAST_NAME: z.string().nullish(),
    PHONE: z.array(z.object({ VALUE: z.string().nullish() })).nullish(),
  }),
);

/** Bitrix24 ro'yxat usullari sahifasi har doim 50 ta. */
const BX_SAHIFA = 50;

interface BxKursor {
  /** `DATE_MODIFY` shu vaqtdan (shu jumladan) boshlab, ISO. */
  dan: string | null;
  start: number;
}

function bxKursorniOqi(k: string | null): BxKursor {
  try {
    const j = k ? (JSON.parse(k) as Partial<BxKursor>) : {};
    return { dan: typeof j.dan === 'string' ? j.dan : null, start: Math.max(0, Number(j.start) || 0) };
  } catch {
    return { dan: null, start: 0 };
  }
}

function sana(s: string | null | undefined): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * O'zgargan sdelkalar — `DATE_MODIFY` o'sish tartibida, 50 tadan. Keyingi
 * joy amoCRM dagi kabi: sahifadagi eng katta vaqt; butun sahifa bir xil
 * vaqtda bo'lsa — `start` oshiriladi.
 */
async function lidlarniOl(w: BitrixWebhook, kursor: string | null) {
  const k = bxKursorniOqi(kursor);
  const javob = await bitrixSorov<unknown>(w, 'crm.deal.list', {
    filter: k.dan ? { '>=DATE_MODIFY': k.dan } : {},
    order: { DATE_MODIFY: 'ASC', ID: 'ASC' },
    select: ['ID', 'TITLE', 'CATEGORY_ID', 'STAGE_ID', 'OPPORTUNITY', 'ASSIGNED_BY_ID', 'CONTACT_ID', 'DATE_CREATE', 'DATE_MODIFY', 'CLOSEDATE', 'CLOSED'],
    start: k.start,
  });
  const sd = bxSdelkalar.safeParse(javob.result ?? []);
  if (!sd.success) throw new CrmXato('server', "Bitrix24 sdelkalar ro'yxatini o'qib bo'lmadi");

  const kontaktIdlar = [...new Set(sd.data.map((d) => d.CONTACT_ID).filter((x): x is string => Boolean(x && x !== '0')))];
  const kontaktlar = new Map<string, { nom: string | null; telefonlar: string[] }>();
  if (kontaktIdlar.length > 0) {
    const kj = bxKontaktlar.safeParse(
      await bitrixChaqir<unknown>(w, 'crm.contact.list', {
        filter: { '@ID': kontaktIdlar },
        select: ['ID', 'NAME', 'LAST_NAME', 'PHONE'],
      }),
    );
    for (const c of kj.success ? kj.data : []) {
      kontaktlar.set(c.ID, {
        nom: [c.NAME, c.LAST_NAME].filter(Boolean).join(' ') || null,
        telefonlar: (c.PHONE ?? []).map((p) => (p.VALUE ?? '').trim()).filter(Boolean),
      });
    }
  }

  const lidlar: CrmLid[] = sd.data.map((d) => {
    const c = d.CONTACT_ID ? kontaktlar.get(d.CONTACT_ID) : undefined;
    const summa = d.OPPORTUNITY === null || d.OPPORTUNITY === undefined ? null : Number(d.OPPORTUNITY);
    return {
      id: d.ID,
      nom: d.TITLE ?? null,
      voronkaId: d.CATEGORY_ID ?? '0',
      bosqichId: d.STAGE_ID ?? null,
      summa: summa !== null && Number.isFinite(summa) ? summa : null,
      masulId: d.ASSIGNED_BY_ID ?? null,
      kontaktId: d.CONTACT_ID && d.CONTACT_ID !== '0' ? d.CONTACT_ID : null,
      kontaktNom: c?.nom ?? null,
      telefonlar: c?.telefonlar ?? [],
      yaratilgan: sana(d.DATE_CREATE),
      yangilangan: sana(d.DATE_MODIFY) ?? new Date(),
      yopilgan: d.CLOSED === 'Y' ? sana(d.CLOSEDATE) : null,
      url: `https://${w.portal}/crm/deal/details/${d.ID}/`,
      maydonlar: {},
    };
  });

  const toliq = sd.data.length >= BX_SAHIFA && javob.next !== undefined;
  const engKatta = sd.data.reduce<string | null>((m, d) => (m === null || sana(d.DATE_MODIFY)! > sana(m)! ? d.DATE_MODIFY : m), k.dan);
  const keyingi: BxKursor =
    toliq && engKatta === k.dan ? { dan: k.dan, start: k.start + BX_SAHIFA } : { dan: engKatta, start: 0 };
  return { lidlar, kursor: JSON.stringify(keyingi), tugadi: !toliq };
}

// ─── Adapter ─────────────────────────────────────────────────────────────────

function kontekstdan(k: CrmKontekst): BitrixWebhook {
  const w = webhookniAjrat(k.sir);
  if (!w) throw new CrmXato('kirish', 'Bitrix24 webhook manzili saqlanmagan — qayta ulang');
  return w;
}

export const bitrix24Adapter: CrmAdapter = {
  kind: 'bitrix24',
  nom: 'Bitrix24',
  tavsif: 'Sdelkalar, kontaktlar va ishlar',
  qollanma: [
    'Bitrix24 da «Разработчикам» → «Другое» → «Входящий вебхук» ni oching.',
    '«Настройка прав» da «CRM (crm)» va «Пользователи (user)» ni belgilang.',
    '«Сохранить» ni bosing va «Вебхук для вызова rest api» manzilini nusxalab shu yerga qo‘ying.',
  ],
  maydonlar: [
    {
      kalit: 'webhook',
      nom: 'Webhook manzili',
      tur: 'sir',
      placeholder: 'https://kompaniya.bitrix24.ru/rest/1/abc123…/',
      yordam: 'Manzilning o‘zi kalit vazifasini bajaradi — uni hech kimga bermang.',
    },
  ],

  async ulash(kirish, eski) {
    const yangi = (kirish.webhook ?? '').trim();
    const manba = yangi || eski?.sir || '';
    if (!manba) throw new CrmXato('kirish', 'Webhook manzilini kiriting');
    const w = webhookniAjrat(manba);
    if (!w) {
      throw new CrmXato('kirish', "Webhook manzili noto'g'ri. Masalan: https://kompaniya.bitrix24.ru/rest/1/abc123…/");
    }

    const ruxsatlar = await bitrixChaqir<unknown>(w, 'scope');
    if (Array.isArray(ruxsatlar) && !ruxsatlar.includes('crm')) {
      throw new CrmXato('ruxsat', 'Webhookka «CRM» ruxsati berilmagan — Bitrix24 da webhook ruxsatlarini tekshiring');
    }
    const p = await bitrixChaqir<{ ID?: string | number; NAME?: string; LAST_NAME?: string }>(w, 'profile');
    const egasi = [p?.NAME, p?.LAST_NAME].filter(Boolean).join(' ');

    return {
      config: { portal: w.portal, address: w.portal, webhookUser: egasi || `#${w.userId}`, accountName: w.portal },
      sir: `https://${w.portal}/rest/${w.userId}/${w.kod}/`,
      tokenExpiresAt: null,
      hisob: { nom: w.portal, url: `https://${w.portal}` },
      sirKorinishi: `${w.portal}/rest/${w.userId}/${w.kod.slice(0, 3)}…`,
    };
  },

  async tekshir(k) {
    const w = kontekstdan(k);
    await bitrixChaqir<unknown>(w, 'profile');
    return { nom: w.portal };
  },

  tuzilish: (k) => tuzilishniOl(kontekstdan(k)),

  topish: (k, telefon) => telefondanTop(kontekstdan(k), telefon),

  async izoh(k, y, matn) {
    const r = await bitrixChaqir<unknown>(kontekstdan(k), 'crm.timeline.comment.add', {
      fields: { ENTITY_ID: Number(y.id), ENTITY_TYPE: y.tur === 'deal' ? 'deal' : 'contact', COMMENT: matn },
    });
    return r === null || r === undefined ? null : String(r);
  },

  lidlar: (k, kursor) => lidlarniOl(kontekstdan(k), kursor),

  async vazifa(k, y, v) {
    const r = await bitrixChaqir<{ id?: number } | number>(kontekstdan(k), 'crm.activity.todo.add', {
      ownerTypeId: y.tur === 'deal' ? 2 : 3,
      ownerId: Number(y.id),
      deadline: v.muddat.toISOString(),
      title: v.sarlavha.slice(0, 250),
      description: v.matn.slice(0, 2000),
      ...(y.masulId ? { responsibleId: Number(y.masulId) } : {}),
    });
    const id = typeof r === 'number' ? r : r?.id;
    return id === undefined ? null : String(id);
  },
};
