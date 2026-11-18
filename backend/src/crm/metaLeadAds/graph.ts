import { createHmac } from 'node:crypto';
import { grafVersiyasi } from './sozlama.js';
import { xatoniTurla, type XatoTuri } from './sof.js';

/**
 * Meta Graph API klienti (Lead Ads uchun). Token va App Secret hech qachon
 * loglanmaydi va xato matniga qo'shilmaydi — tashqariga faqat xato TURI,
 * kodi va qisqartirilgan Meta xabari chiqadi.
 *
 * `META_GRAPH_BASE` — faqat testda soxta serverga yo'naltirish uchun
 * (mavjud `crm/tarmoq.ts` bilan bir xil o'zgaruvchi).
 */

export type GraphJavob<T> =
  | { ok: true; data: T }
  | { ok: false; tur: XatoTuri; code: number | null; subcode: number | null; httpStatus: number | null; xabar: string };

export function grafBase(): string {
  return (process.env.META_GRAPH_BASE || 'https://graph.facebook.com').replace(/\/+$/, '');
}

/** Meta xato matnidan token ko'rinishidagi qismlarni olib tashlaydi (ehtiyot chorasi). */
function tozala(m: string): string {
  return m.replace(/EAA[A-Za-z0-9]{10,}/g, '[token]').replace(/access_token=[^&\s]+/g, 'access_token=[…]').slice(0, 220);
}

export async function graf<T>(p: {
  yol: string;
  token?: string | null;
  appSecret?: string | null;
  usul?: 'GET' | 'POST' | 'DELETE';
  params?: Record<string, string>;
  timeoutMs?: number;
  kontekst?: 'lid' | 'boshqa';
}): Promise<GraphJavob<T>> {
  const params = new URLSearchParams(p.params ?? {});
  if (p.token) {
    params.set('access_token', p.token);
    // appsecret_proof: token o'g'irlansa ham App Secret'siz ishlatib bo'lmaydi
    if (p.appSecret) params.set('appsecret_proof', createHmac('sha256', p.appSecret).update(p.token).digest('hex'));
  }
  const url = `${grafBase()}/${grafVersiyasi()}${p.yol}`;
  const ctrl = new AbortController();
  const taymer = setTimeout(() => ctrl.abort(), p.timeoutMs ?? 10_000);
  try {
    const usul = p.usul ?? 'GET';
    const res =
      usul === 'GET'
        ? await fetch(`${url}?${params.toString()}`, { signal: ctrl.signal })
        : await fetch(url, { method: usul, body: params, signal: ctrl.signal });
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; code?: number; error_subcode?: number } } & T;
    if (!res.ok || json.error) {
      const code = typeof json.error?.code === 'number' ? json.error.code : null;
      const subcode = typeof json.error?.error_subcode === 'number' ? json.error.error_subcode : null;
      return {
        ok: false,
        tur: xatoniTurla({ httpStatus: res.status, code, subcode }, p.kontekst),
        code,
        subcode,
        httpStatus: res.status,
        xabar: tozala(json.error?.message ?? `HTTP ${res.status}`),
      };
    }
    return { ok: true, data: json };
  } catch {
    return { ok: false, tur: 'transient', code: null, subcode: null, httpStatus: null, xabar: "Meta serveriga ulanib bo'lmadi" };
  } finally {
    clearTimeout(taymer);
  }
}

/**
 * Sahifalangan ro'yxat (`data` + `paging.cursors.after`). `paging.next`
 * ishlatilmaydi — unda token bor va u boshqa xostga ham ishora qilishi mumkin;
 * kursor bilan o'sha yo'lning o'zi qayta so'raladi.
 */
export async function hammasiniOl<T>(p: Parameters<typeof graf>[0] & { maxSahifa?: number }): Promise<GraphJavob<T[]>> {
  const natija: T[] = [];
  let after: string | null = null;
  for (let i = 0; i < (p.maxSahifa ?? 20); i++) {
    const params: Record<string, string> = { ...(p.params ?? {}) };
    if (after) params.after = after;
    const r = await graf<{ data?: T[]; paging?: { cursors?: { after?: string }; next?: string } }>({ ...p, params });
    if (!r.ok) return r;
    natija.push(...(Array.isArray(r.data.data) ? r.data.data : []));
    const keyingi = r.data.paging?.next ? (r.data.paging.cursors?.after ?? null) : null;
    if (!keyingi || keyingi === after) break;
    after = keyingi;
  }
  return { ok: true, data: natija };
}
