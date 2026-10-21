import { and, eq, isNull, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { withoutTenantIsolation } from '../db/index.js';
import { business } from '../db/schema/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAAS: SUBDOMEN → TENANT
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Har mijoz (biznes) o'z subdomenida ishlaydi: `<slug>.<ROOT_DOMAIN>`.
 * Asosiy domen (`ROOT_DOMAIN`, `www.ROOT_DOMAIN`) — landing, umumiy kirish
 * va super admin.
 *
 * NEGA SERVERDA
 * ─────────────
 * Tenant so'rovning `Host` sarlavhasidan aniqlanadi va kirgan
 * foydalanuvchining bizneslar ro'yxati shu tenant bilan CHEKLANADI
 * (`auth-plugin.ts`). Natijada `acme.` dagi sessiya `beta` biznesini
 * hech qanday marshrutda ko'rmaydi — frontend nimani so'rashidan qat'i
 * nazar. Frontend faqat ko'rinishni moslaydi; chegara shu yerda.
 *
 * Yagona haqiqat manbai — `WEB_ORIGIN` (ixtiyoriy `ROOT_DOMAIN`):
 * domen tanlanganda faqat sozlama o'zgaradi, kod emas.
 */

const ORIGIN = new URL(config.WEB_ORIGIN);

/** Subdomenlar ostidagi asosiy domen (portsiz, kichik harfda). */
export const ROOT_DOMAIN = (config.ROOT_DOMAIN ?? ORIGIN.hostname).toLowerCase();

/**
 * Mijozga berib bo'lmaydigan subdomenlar: texnik xizmatlar, kelajakdagi
 * bo'limlar va adashtiradigan nomlar (fishingga qarshi — "admin.",
 * "login." kabi manzil ishonch uyg'otib, aldash uchun ishlatilishi mumkin).
 */
const ZAXIRA = new Set([
  'www', 'app', 'api', 'admin', 'administrator', 'root', 'super', 'superadmin',
  'mail', 'email', 'smtp', 'imap', 'pop', 'ftp', 'ssh', 'vpn', 'ns', 'ns1', 'ns2', 'dns', 'mx',
  'static', 'cdn', 'assets', 'media', 'files', 'img', 'images', 'upload', 'uploads',
  'auth', 'login', 'logout', 'kirish', 'signin', 'signup', 'register', 'sso', 'oauth', 'mcp', 'account', 'accounts',
  'dashboard', 'panel', 'console', 'billing', 'pay', 'payment', 'payments', 'checkout',
  'help', 'support', 'yordam', 'status', 'docs', 'doc', 'blog', 'news', 'about', 'contact',
  'dev', 'test', 'testing', 'stage', 'staging', 'prod', 'production', 'demo-admin', 'internal',
  'sotuvai', 'sotuv',
]);

/** 3–40 belgi: lotin kichik harflari, raqam va chiziqcha (boshi/oxirida emas, ketma-ket emas). */
const SLUG_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){1,38}[a-z0-9]$/;

export type SlugXato = 'format' | 'zaxira' | 'band';

/** Slug subdomen sifatida yaroqlimi. Bandlikni tekshirmaydi (bu baza ishi). */
export function slugFormatXatosi(slug: string): Exclude<SlugXato, 'band'> | null {
  if (!SLUG_RE.test(slug)) return 'format';
  if (ZAXIRA.has(slug)) return 'zaxira';
  return null;
}

/** Foydalanuvchiga ko'rsatiladigan izoh. */
export const SLUG_XATO_MATNI: Record<SlugXato, string> = {
  format: "Subdomen 3–40 belgi bo'lishi kerak: lotin kichik harflari, raqam va chiziqcha (boshida/oxirida emas)",
  zaxira: 'Bu subdomen tizim uchun ajratilgan — boshqasini tanlang',
  band: 'Bu subdomen band — boshqasini tanlang',
};

/**
 * Xostdan tenant slug'ini ajratadi.
 *
 *   - asosiy domen, `www.`, IP manzil yoki begona domen → `null` (asosiy sayt);
 *   - har qanday subdomen → o'sha subdomen, HATTO zaxira yoki noto'g'ri
 *     bo'lsa ham (`admin.`, `a.b.`). Bunday "slug" hech bir biznesga mos
 *     kelmaydi va kabinet "topilmadi" bo'ladi — asosiy saytga aylanib
 *     qolmaydi. Aks holda `admin.example.uz` umumiy kirish sahifasini
 *     ko'rsatib, fishing uchun ishonchli manzilga aylanardi.
 */
export function hostDanSlug(host: string | undefined | null): string | null {
  if (!host) return null;
  const h = host.toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (h === ROOT_DOMAIN || h === `www.${ROOT_DOMAIN}`) return null;
  const qoshimcha = `.${ROOT_DOMAIN}`;
  if (!h.endsWith(qoshimcha)) return null;
  const sub = h.slice(0, -qoshimcha.length);
  return sub || null;
}

/** Xost asosiy domenmi (landing / super admin). */
export function rootHostmi(host: string | undefined | null): boolean {
  if (!host) return false;
  const h = host.toLowerCase().replace(/:\d+$/, '');
  return h === ROOT_DOMAIN || h === `www.${ROOT_DOMAIN}`;
}

/** Mijoz kabinetining to'liq manzili: `https://acme.example.uz`. */
export function tenantUrl(slug: string): string {
  return `${ORIGIN.protocol}//${slug}.${ROOT_DOMAIN}${ORIGIN.port ? `:${ORIGIN.port}` : ''}`;
}

/** Asosiy sayt manzili (oxirida `/` siz). */
export function rootUrl(): string {
  return ORIGIN.origin;
}

/** So'rov kelgan xostga mos frontend manzili — havolalar shu manzilga yasaladi. */
export function frontendUrl(slug: string | null): string {
  return slug ? tenantUrl(slug) : rootUrl();
}

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
  locale: string;
  /** Platforma admini vaqtincha to'xtatgan — kabinet bor, lekin kirib bo'lmaydi. */
  faolsiz: boolean;
}

/** Slug bo'yicha o'chirilmagan biznes (faolsizlantirilgani ham). Tenant tashqarisidagi so'rov. */
export async function slugBoyichaBiznes(slug: string): Promise<TenantInfo | null> {
  const [row] = await withoutTenantIsolation('saas: subdomen bo\'yicha biznesni topish', (tx) =>
    tx
      .select({
        id: business.id,
        slug: business.slug,
        name: business.name,
        logoUrl: business.logoUrl,
        locale: business.locale,
        faolsiz: sql<boolean>`${business.suspendedAt} is not null`,
      })
      .from(business)
      .where(and(eq(business.slug, slug), isNull(business.deletedAt)))
      .limit(1),
  );
  return row ?? null;
}
