import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isProd } from '../config.js';
import { loadAuthContext, type AuthContext, type BusinessAccess } from '../auth/context.js';
import { hasPermission, type Permission } from '../auth/permissions.js';
import { validateSession } from '../auth/session.js';
import { keshniTozala } from '../auth/context-cache.js';
import { accessTekshir, type AccessInfo } from '../mcp/oauth.js';
import { AppError } from './errors.js';
import { hostDanSlug } from './tenant.js';

export const SESSION_COOKIE = 'sid';

declare module 'fastify' {
  interface FastifyRequest {
    /** Kirgan foydalanuvchi. Anonim so'rovlarda null. */
    auth: AuthContext | null;
    sessionId: string | null;
    /** `requireBusiness` o'rnatadi. */
    business: BusinessAccess | null;
    /**
     * OAuth (Claude / MCP) orqali kelgan so'rov — kim nomidan, qaysi ruxsat bilan.
     * Cookie sessiyasida null.
     */
    oauth: AccessInfo | null;
    /** Shu so'rovning Bearer tokeni — MCP vositalari ichki API chaqiruvida qayta ishlatadi. */
    bearerToken: string | null;
    /**
     * SaaS: so'rov kelgan subdomen (`acme.example.uz` → `acme`). Asosiy
     * domenda null. O'rnatilgan bo'lsa, `auth.businesses` faqat shu
     * biznes bilan cheklangan bo'ladi (`tenant.ts`).
     */
    tenantSlug: string | null;
  }
}

/**
 * Bearer token bilan ochiq yo'llar. Hisob amallari (parol, sessiyalar,
 * admin panel, chiqish) TOKEN bilan qilinmaydi: Claude'ga berilgan ruxsat
 * biznes ma'lumotlarini boshqarish uchun, hisobni egallash uchun emas.
 */
function bearerYoliOchiqmi(method: string, url: string): boolean {
  const yol = url.split('?')[0]!;
  if (yol === '/mcp') return true;
  if (yol.startsWith('/api/v1/businesses/')) return true;
  return method === 'GET' && yol === '/api/v1/auth/context';
}

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  // 30 kun — sessiyaning mutlaq muddati bilan bir xil.
  maxAge: 30 * 24 * 60 * 60,
};

export function setSessionCookie(reply: FastifyReply, token: string): void {
  reply.setCookie(SESSION_COOKIE, token, COOKIE_OPTIONS);
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/' });
}

/**
 * Sessiyani o'qish — har so'rovda, lekin **majburiy emas**.
 *
 * Bu hook faqat kim ekanini aniqlaydi. "Kirish shartmi" degan qaror
 * marshrut darajasida `requireAuth` orqali qabul qilinadi. Shu ajratish
 * tufayli ochiq marshrutlar (login, webhook, healthz) qo'shimcha
 * sozlamasiz ishlaydi.
 */
export function registerAuth(app: FastifyInstance): void {
  app.decorateRequest('auth', null);
  app.decorateRequest('sessionId', null);
  app.decorateRequest('business', null);
  app.decorateRequest('oauth', null);
  app.decorateRequest('bearerToken', null);
  app.decorateRequest('tenantSlug', null);

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    // `hostname` — portsiz; ishlab chiqarishda (trustProxy) X-Forwarded-Host'dan
    req.tenantSlug = hostDanSlug(req.hostname);

    const token = req.cookies[SESSION_COOKIE];
    if (!token) {
      await bearerniAniqla(req);
      return;
    }

    const meta = { userAgent: req.headers['user-agent'], ip: req.ip };
    const info = await validateSession(token, meta);

    if (!info) {
      // Yaroqsiz yoki bekor qilingan token — cookie'ni tozalaymiz,
      // lekin xato qaytarmaymiz: marshrut ochiq bo'lishi mumkin.
      clearSessionCookie(reply);
      return;
    }

    if (info.renewedToken) {
      setSessionCookie(reply, info.renewedToken);
    }

    const ctx = await loadAuthContext(info.userId);
    if (!ctx) {
      clearSessionCookie(reply);
      return;
    }

    req.auth = tenantgaChekla(ctx, req.tenantSlug);
    req.sessionId = info.sessionId;
  });

  /**
   * ═══════════════════════════════════════════════════════════════════
   * KESHNI BEKOR QILISH — bitta joyda, unutib bo'lmaydigan qilib
   * ═══════════════════════════════════════════════════════════════════
   *
   * Auth konteksti to'rtta jadvaldan yig'iladi: `app_user`,
   * `business_member`, `seat`, `business`. Ularni o'zgartiradigan
   * endpointlar o'nlab joyda va ular yana ko'payadi.
   *
   * Har biriga qo'lda `keshniBekorQil()` yozish mumkin edi, lekin
   * bunday qoida DISTSIPLINAGA tayanadi: yangi endpoint yozgan odam
   * uni unutadi va huquq eskirib qoladi. Xato jimgina bo'ladi va
   * xavfsizlikka tegadi — eng yomon tur.
   *
   * Shuning uchun qoida strukturaviy: `/auth/` yoki `/businesses/`
   * ostidagi HAR QANDAY muvaffaqiyatli o'zgartirish keshni tozalaydi.
   * Yangi endpoint qo'shgan odam hech narsa qilmasa ham to'g'ri
   * ishlaydi.
   *
   * NEGA BUTUN KESH, faqat bitta foydalanuvchi emas
   * ───────────────────────────────────────────────
   * Rol o'zgartirgan odam bilan roli o'zgargan odam — BOSHQA-BOSHQA
   * odamlar. Faqat so'rov yuborganning keshini tozalash aynan kerakli
   * holatni o'tkazib yuborardi.
   *
   * NARXI
   * ─────
   * `Map.clear()` — bir amal. Kesh keyingi so'rovlarda foydalanuvchi
   * boshiga bitta so'rov bilan qayta to'ladi (1.27 ms). Bu mahsulot
   * o'qishga og'ir: yozuv har necha soniyada bir marta bo'ladi,
   * o'qish esa sekundiga o'nlab marta.
   *
   * Webhook (`/api/v1/webhooks/…`) bu naqshga TUSHMAYDI — u tez-tez
   * keladi va auth kontekstiga umuman tegmaydi.
   */
  app.addHook('onResponse', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD') return;
    if (reply.statusCode >= 400) return;
    const url = req.url;
    if (url.startsWith('/api/v1/auth/') || url.startsWith('/api/v1/businesses/')) {
      keshniTozala();
    }
  });
}

/**
 * OAuth Bearer (Claude / MCP).
 *
 * Token foydalanuvchining O'Z auth kontekstini oladi — ruxsatlar, tenant
 * izolatsiyasi va validatsiya cookie sessiyasidagi bilan aynan bir xil.
 * Ustiga ikki cheklov: faqat biznes yo'llari va `read` ruxsatida faqat o'qish.
 */
async function bearerniAniqla(req: FastifyRequest): Promise<void> {
  const h = req.headers.authorization;
  if (!h || !h.startsWith('Bearer ')) return;
  const token = h.slice(7).trim();
  const info = await accessTekshir(token);
  if (!info) return; // yaroqsiz token — anonim; himoyalangan yo'l 401 qaytaradi
  if (!bearerYoliOchiqmi(req.method, req.url)) {
    throw AppError.forbidden("Bu amal Claude ulanishi orqali bajarilmaydi — saytda bajaring");
  }
  const yozish = !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.url.split('?')[0] !== '/mcp';
  if (yozish && !info.scope.includes('write')) {
    throw AppError.forbidden("Claude'ga faqat o'qish ruxsati berilgan — o'zgartirish uchun «O'qish va boshqarish» ruxsati bilan qayta ulang");
  }
  const ctx = await loadAuthContext(info.userId);
  if (!ctx) return;
  req.auth = tenantgaChekla(ctx, req.tenantSlug);
  req.oauth = info;
  req.bearerToken = token;
}

/**
 * SaaS izolyatsiyasi: subdomenda faqat o'sha biznes ko'rinadi.
 *
 * Kontekst keshlangan bo'lishi mumkin — shuning uchun nusxa olinadi,
 * asl obyekt o'zgartirilmaydi. Foydalanuvchi bu biznesga a'zo bo'lmasa,
 * ro'yxat bo'sh qoladi: `requireBusiness` har qanday biznesga 404
 * qaytaradi, frontend esa "kirish huquqi yo'q" ekranini ko'rsatadi.
 */
export function tenantgaChekla(ctx: AuthContext, slug: string | null): AuthContext {
  if (!slug) return ctx;
  return { ...ctx, businesses: ctx.businesses.filter((b) => b.slug === slug) };
}

/** Marshrutga kirish uchun autentifikatsiya talab qiladi. */
export async function requireAuth(req: FastifyRequest): Promise<void> {
  if (!req.auth) throw AppError.unauthorized();
}

/**
 * Biznes kontekstini aniqlaydi va a'zolikni tekshiradi.
 *
 * URL dagi `:businessId` ga tayanadi. A'zo bo'lmasa **404** qaytariladi,
 * 403 emas — aks holda javob "bunday biznes bor" degan ma'lumotni
 * oshkor qiladi va begona odam mavjud biznes ID'larini topa oladi.
 */
export async function requireBusiness(req: FastifyRequest): Promise<void> {
  if (!req.auth) throw AppError.unauthorized();

  const { businessId } = req.params as { businessId?: string };
  if (!businessId) throw AppError.badRequest('businessId ko\'rsatilmagan');

  const access = req.auth.businesses.find((b) => b.businessId === businessId);
  if (!access) throw AppError.notFound();

  req.business = access;
}

/**
 * Ruxsatni tekshiradi. `requireBusiness` dan keyin ishlatiladi.
 *
 * Frontend ham ruxsatlar ro'yxatini oladi va UI ni shunga qarab yig'adi,
 * lekin **bu yerdagi tekshiruv haqiqiy chegara**. Frontend hech qachon
 * xavfsizlik chegarasi emas.
 */
export function requirePermission(permission: Permission) {
  return async (req: FastifyRequest): Promise<void> => {
    if (!req.business) {
      throw new Error(
        'requirePermission requireBusiness dan keyin ishlatilishi kerak',
      );
    }
    if (!hasPermission(req.business.permissions, permission)) {
      throw AppError.forbidden();
    }
  };
}
