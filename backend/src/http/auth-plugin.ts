import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { isProd } from '../config.js';
import { loadAuthContext, type AuthContext, type BusinessAccess } from '../auth/context.js';
import { hasPermission, type Permission } from '../auth/permissions.js';
import { validateSession } from '../auth/session.js';
import { AppError } from './errors.js';

export const SESSION_COOKIE = 'sid';

declare module 'fastify' {
  interface FastifyRequest {
    /** Kirgan foydalanuvchi. Anonim so'rovlarda null. */
    auth: AuthContext | null;
    sessionId: string | null;
    /** `requireBusiness` o'rnatadi. */
    business: BusinessAccess | null;
  }
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

  app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (!token) return;

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

    req.auth = ctx;
    req.sessionId = info.sessionId;
  });
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
