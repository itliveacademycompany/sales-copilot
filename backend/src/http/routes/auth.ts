import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { loadAuthContext } from '../../auth/context.js';
import { hashPassword, MIN_PASSWORD_LENGTH, verifyPassword } from '../../auth/password.js';
import { consumeResetToken, requestReset } from '../../auth/password-reset.js';
import {
  createSession,
  listActiveSessions,
  revokeAllForUser,
  revokeSession,
} from '../../auth/session.js';
import { config } from '../../config.js';
import { withoutTenantIsolation } from '../../db/index.js';
import { db } from '../../db/index.js';
import {
  appUser,
  business,
  businessMember,
  subscription,
} from '../../db/schema/index.js';
import {
  clearSessionCookie,
  requireAuth,
  setSessionCookie,
} from '../auth-plugin.js';
import { AppError } from '../errors.js';

const email = z
  .string()
  .trim()
  .toLowerCase()
  .email('Email formati noto\'g\'ri')
  .max(255);

const password = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Parol kamida ${MIN_PASSWORD_LENGTH} belgi bo'lishi kerak`)
  .max(200);

const registerBody = z.object({
  email,
  password,
  displayName: z.string().trim().min(2).max(100),
  businessName: z.string().trim().min(2).max(120),
});

const loginBody = z.object({
  email,
  password: z.string().min(1).max(200),
});

/** Biznes nomidan URL uchun yaroqli slug yasaydi. */
function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/['`']/g, '')
    .replace(/[^a-z0-9Ѐ-ӿ]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'biznes';
}

export function registerAuthRoutes(app: FastifyInstance): void {
  /**
   * Ro'yxatdan o'tish — foydalanuvchi + biznes + ega a'zoligi + sinov obunasi.
   *
   * Hammasi bitta tranzaksiyada: yarim yaratilgan biznes (foydalanuvchi bor,
   * lekin a'zolik yo'q) hech kim kira olmaydigan yopiq holat bo'lardi.
   */
  app.post(
    '/api/v1/auth/register',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    },
    async (req, reply) => {
      const body = registerBody.parse(req.body);

      const existing = await withoutTenantIsolation(
        'ro\'yxatdan o\'tish: email band emasligini tekshirish tenantlardan tashqarida',
        (tx) =>
          tx
            .select({ id: appUser.id })
            .from(appUser)
            .where(eq(appUser.email, body.email))
            .limit(1),
      );

      if (existing.length > 0) {
        throw AppError.conflict('Bu email allaqachon ro\'yxatdan o\'tgan');
      }

      const passwordHash = await hashPassword(body.password);

      const userId = await withoutTenantIsolation(
        'ro\'yxatdan o\'tish: biznes hali mavjud emas, tenant konteksti yo\'q',
        async (tx) => {
          const slugBase = slugify(body.businessName);
          const slug = `${slugBase}-${Date.now().toString(36).slice(-4)}`;

          const [user] = await tx
            .insert(appUser)
            .values({
              email: body.email,
              passwordHash,
              displayName: body.displayName,
              systemRole: 'business_owner',
            })
            .returning({ id: appUser.id });

          const [biz] = await tx
            .insert(business)
            .values({ slug, name: body.businessName })
            .returning({ id: business.id });

          if (!user || !biz) throw new Error('ro\'yxatdan o\'tish muvaffaqiyatsiz');

          await tx.insert(businessMember).values({
            businessId: biz.id,
            userId: user.id,
            role: 'owner',
            activation: 'active',
            invitedVia: 'self',
          });

          /**
           * FR-157: 14 kunlik bepul sinov.
           *
           * `seatPrice` shu yerda "qulflab qo'yiladi" — keyin platforma
           * narxi (`SEAT_PRICE_UZS`) o'zgarsa ham, bu biznes ro'yxatdan
           * o'tgan paytdagi narxda qoladi (odatiy SaaS amaliyoti: narx
           * o'zgarishi mavjud mijozlarga orqaga qaytib ta'sir qilmaydi).
           */
          await tx.insert(subscription).values({
            businessId: biz.id,
            status: 'trial',
            trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
            seatPrice: config.SEAT_PRICE_UZS.toFixed(2),
          });

          return user.id;
        },
      );

      const { token } = await createSession(userId, {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });
      setSessionCookie(reply, token);

      const ctx = await loadAuthContext(userId);
      reply.status(201);
      return ctx;
    },
  );

  /**
   * Kirish.
   *
   * Xato xabari ataylab umumiy: "email topilmadi" va "parol noto'g'ri"
   * ni ajratish begona odamga qaysi emaillar ro'yxatdan o'tganini
   * aniqlash imkonini beradi.
   */
  app.post(
    '/api/v1/auth/login',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (req, reply) => {
      const body = loginBody.parse(req.body);

      const [user] = await withoutTenantIsolation(
        'kirish: foydalanuvchini email bo\'yicha topish tenantlardan tashqarida',
        (tx) =>
          tx
            .select({ id: appUser.id, passwordHash: appUser.passwordHash })
            .from(appUser)
            .where(and(eq(appUser.email, body.email), isNull(appUser.deletedAt)))
            .limit(1),
      );

      const ok = await verifyPassword(user?.passwordHash ?? null, body.password);
      if (!ok || !user) {
        throw AppError.unauthorized('Email yoki parol noto\'g\'ri');
      }

      const { token } = await createSession(user.id, {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      });
      setSessionCookie(reply, token);

      await db
        .update(appUser)
        .set({ lastLoginAt: new Date() })
        .where(eq(appUser.id, user.id));

      return loadAuthContext(user.id);
    },
  );

  app.post('/api/v1/auth/logout', async (req, reply) => {
    if (req.sessionId) await revokeSession(req.sessionId);
    clearSessionCookie(reply);
    return { ok: true };
  });

  /** FR-09: barcha qurilmalardan chiqish. */
  app.post(
    '/api/v1/auth/logout-all',
    { preHandler: requireAuth },
    async (req, reply) => {
      await revokeAllForUser(req.auth!.user.id);
      clearSessionCookie(reply);
      return { ok: true };
    },
  );

  /**
   * Frontend'ning kirish nuqtasi: kim men, qaysi bizneslarda va nima qila olaman.
   * Ruxsatlar ro'yxati UI ni yig'ish uchun, lekin haqiqiy tekshiruv serverda.
   */
  app.get('/api/v1/auth/context', { preHandler: requireAuth }, async (req) => req.auth);

  /** FR-09: faol sessiyalar ro'yxati. */
  app.get('/api/v1/auth/sessions', { preHandler: requireAuth }, async (req) => {
    const sessions = await listActiveSessions(req.auth!.user.id);
    return sessions.map((s) => ({ ...s, current: s.id === req.sessionId }));
  });

  /**
   * FR-06: parolni tiklashni so'rash.
   *
   * **Javob har doim bir xil** — foydalanuvchi topilsa ham, topilmasa ham.
   * Aks holda bu endpoint ro'yxatdan o'tgan email'larni tekshirish
   * vositasiga aylanardi (user enumeration).
   *
   * Rate limit majburiy: usiz kimdir begona odamning Telegram'iga
   * cheksiz xabar yuborib, uni bezovta qila olardi.
   */
  app.post(
    '/api/v1/auth/password-reset/request',
    {
      config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
    },
    async (req) => {
      const body = z.object({ emailOrLogin: z.string().trim().min(3).max(200) }).parse(req.body);
      const natija = await requestReset(body.emailOrLogin, config.WEB_ORIGIN);

      // Faqat jurnalga — javobga emas.
      req.log.info(
        { delivered: natija.delivered, reason: natija.reason },
        'parol tiklash so\'rovi',
      );

      return {
        ok: true,
        note:
          'Agar bunday hisob mavjud bo\'lsa va Telegram bog\'langan bo\'lsa, ' +
          'tiklash havolasi yuborildi. Havola 30 daqiqa amal qiladi.',
      };
    },
  );

  /** FR-06: yangi parolni o'rnatish. */
  app.post(
    '/api/v1/auth/password-reset/confirm',
    {
      config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
    },
    async (req, reply) => {
      const body = z
        .object({
          token: z.string().trim().min(20),
          newPassword: z.string().min(MIN_PASSWORD_LENGTH),
        })
        .parse(req.body);

      const natija = await consumeResetToken(body.token);
      if (!natija.ok) {
        const matn = {
          invalid: 'Havola noto\'g\'ri',
          expired: 'Havola muddati tugagan — yangisini so\'rang',
          used: 'Bu havola allaqachon ishlatilgan',
        }[natija.reason];
        throw AppError.badRequest(matn);
      }

      const hash = await hashPassword(body.newPassword);
      await withoutTenantIsolation('parol tiklash: yangi parolni yozish', (tx) =>
        tx
          .update(appUser)
          .set({ passwordHash: hash, updatedAt: new Date() })
          .where(eq(appUser.id, natija.userId)),
      );

      /**
       * Barcha eski sessiyalar bekor qilinadi. Parolni tiklashning
       * odatiy sababi — "hisobimga kimdir kirgan" shubhasi; eski
       * sessiyalar tirik qolsa bu amal ma'nosiz bo'lardi.
       */
      await revokeAllForUser(natija.userId);
      const fresh = await createSession(natija.userId);
      setSessionCookie(reply, fresh.token);

      return { ok: true };
    },
  );

  /**
   * FR-160: o'z profilini tahrirlash.
   *
   * Ataylab tor: faqat ism, til va avatar. Email o'zgartirish tasdiqlash
   * oqimini talab qiladi (yangi manzilga kod yuborish) — usiz email
   * o'zgartirish hisobni o'g'irlashning eng oson yo'li bo'lardi.
   * Parol o'zgartirish ham alohida: joriy parolni so'raydi.
   */
  app.patch(
    '/api/v1/auth/me',
    { preHandler: requireAuth },
    async (req) => {
      const patch = z
        .object({
          displayName: z.string().trim().min(2).max(120).optional(),
          locale: z.enum(['uz', 'uz-Cyrl', 'ru', 'en']).optional(),
          avatarUrl: z.string().url().max(500).nullable().optional(),
        })
        .parse(req.body);
      if (Object.keys(patch).length === 0) {
        throw AppError.badRequest('O\'zgartirish uchun maydon berilmagan');
      }

      const [row] = await withoutTenantIsolation(
        'profil: app_user tenant jadvali emas',
        (tx) =>
          tx
            .update(appUser)
            .set({ ...patch, updatedAt: new Date() })
            .where(eq(appUser.id, req.auth!.user.id))
            .returning({
              id: appUser.id,
              email: appUser.email,
              displayName: appUser.displayName,
              locale: appUser.locale,
              avatarUrl: appUser.avatarUrl,
            }),
      );
      return row;
    },
  );

  /** FR-160: parolni o'zgartirish — joriy parol majburiy. */
  app.post(
    '/api/v1/auth/change-password',
    { preHandler: requireAuth },
    async (req, reply) => {
      const body = z
        .object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(MIN_PASSWORD_LENGTH),
        })
        .parse(req.body);

      const [row] = await withoutTenantIsolation('parol almashtirish', (tx) =>
        tx
          .select({ hash: appUser.passwordHash })
          .from(appUser)
          .where(eq(appUser.id, req.auth!.user.id))
          .limit(1),
      );
      if (!row || !(await verifyPassword(row.hash, body.currentPassword))) {
        throw AppError.badRequest('Joriy parol noto\'g\'ri');
      }

      const hash = await hashPassword(body.newPassword);
      await withoutTenantIsolation('parol almashtirish: yozish', (tx) =>
        tx
          .update(appUser)
          .set({ passwordHash: hash, updatedAt: new Date() })
          .where(eq(appUser.id, req.auth!.user.id)),
      );

      /**
       * Parol o'zgargach BOSHQA hamma sessiya bekor qilinadi va joriysi
       * yangilanadi. Sabab: parol almashtirishning asosiy sababi —
       * "kimdir hisobimga kirgan" shubhasi. Eski sessiyalar tirik qolsa
       * bu amal ma'nosiz bo'lardi.
       */
      await revokeAllForUser(req.auth!.user.id);
      const fresh = await createSession(req.auth!.user.id);
      setSessionCookie(reply, fresh.token);
      return { ok: true };
    },
  );
}
