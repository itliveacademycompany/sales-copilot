import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { config, isProd } from '../config.js';
import { db } from '../db/index.js';
import { registerAuth } from './auth-plugin.js';
import { registerErrorHandler } from './errors.js';
import { registerAdminRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerAlertRoutes } from './routes/alerts.js';
import { registerAppealRoutes } from './routes/appeals.js';
import { registerBillingRoutes } from './routes/billing.js';
import { registerBusinessRoutes } from './routes/business.js';
import { registerConversationRoutes } from './routes/conversations.js';
import { registerImportRoutes } from './routes/import.js';
import { registerDashboardRoutes } from './routes/dashboard.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerMemberRoutes } from './routes/members.js';
import { registerPlaybookRoutes } from './routes/playbook.js';
import { registerReportRoutes } from './routes/reports.js';
import { registerSeatRoutes } from './routes/seats.js';
import { registerTelegramRoutes } from './routes/telegram.js';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      // Ishlab chiqishda o'qish uchun qulay, prod'da JSON (log yig'uvchi uchun)
      transport: isProd ? undefined : { target: 'pino-pretty' },
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'res.headers["set-cookie"]',
          'req.body.password',
          'req.body.currentPassword',
          'req.body.newPassword',
        ],
        remove: true,
      },
    },
    trustProxy: isProd,
    bodyLimit: 1024 * 1024, // 1 MB — media yuklash alohida marshrutda
    disableRequestLogging: false,
  });

  // ─── Xavfsizlik sarlavhalari ───
  await app.register(helmet, {
    // API JSON qaytaradi, HTML emas — CSP bu yerda ortiqcha.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  // ─── CORS ───
  // Cookie asosidagi sessiya ishlashi uchun `credentials: true` va
  // aniq origin kerak — `*` bilan brauzer cookie yubormaydi.
  await app.register(cors, {
    origin: [config.WEB_ORIGIN],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  });

  // ─── Cookie ───
  await app.register(cookie, {
    secret: config.COOKIE_SECRET,
    parseOptions: {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      path: '/',
    },
  });

  /**
   * Audio yuklash uchun (FAZA 2).
   *
   * 25 MB chegarasi ataylab: Google STT inline audioni ~10 MB gacha
   * qabul qiladi, lekin fayl bizga kelib, keyin rad etilgani —
   * "yukladim, hech narsa bo'lmadi" holatidan yaxshiroq: chegara
   * aniq xato bilan qaytariladi.
   */
  await app.register(multipart, {
    limits: { fileSize: 25 * 1024 * 1024, files: 1 },
  });

  // ─── Rate limiting (NFR-24) ───
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    // Kirgan foydalanuvchi bo'yicha, aks holda IP bo'yicha.
    keyGenerator: (req) => {
      const userId = (req as { user?: { id?: string } }).user?.id;
      return userId ?? req.ip;
    },
    // Javob boshqa xatolar bilan bir xil formatda (RFC 7807) bo'lishi uchun.
    errorResponseBuilder: (_req, ctx) => ({
      type: 'about:blank#too-many-requests',
      title: 'Juda ko\'p so\'rov. Biroz kuting.',
      status: 429,
      detail: `Limit: ${ctx.max} / ${ctx.after}`,
    }),
  });

  registerErrorHandler(app);
  registerAuth(app);
  registerAuthRoutes(app);
  registerAdminRoutes(app);
  registerBusinessRoutes(app);
  registerMemberRoutes(app);
  registerSeatRoutes(app);
  registerPlaybookRoutes(app);
  registerTelegramRoutes(app);
  registerReportRoutes(app);
  registerAppealRoutes(app);
  registerConversationRoutes(app);
  registerImportRoutes(app);
  registerTaskRoutes(app);
  registerAlertRoutes(app);
  registerDashboardRoutes(app);
  registerBillingRoutes(app);

  // ─── Sog'liq tekshiruvi ───
  // `/healthz` — jonli-mi (deploy va load balancer uchun)
  app.get('/healthz', async () => ({ ok: true }));

  // `/readyz` — ishga tayyormi (baza javob beradimi)
  app.get('/readyz', async (_req, reply) => {
    try {
      await db.execute(sql`select 1`);
      return { ok: true, db: 'up' };
    } catch {
      reply.status(503);
      return { ok: false, db: 'down' };
    }
  });

  return app;
}
