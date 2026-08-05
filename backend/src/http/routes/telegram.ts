import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { encryptSecret, maskSecret, safeCompare } from '../../crypto/secrets.js';
import { withoutTenantIsolation, withTenant } from '../../db/index.js';
import { integration, seat } from '../../db/schema/index.js';
import { ingestMessage } from '../../telegram/ingest.js';
import { extractText, primaryMessage, telegramUpdate } from '../../telegram/types.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TELEGRAM INTEGRATSIYASI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * FAZA 1 da **Bot API** ishlatiladi, MTProto user-session emas.
 *
 * Sabab (TZ 1.4): user-session sotuvchining shaxsiy akkauntiga to'liq kirish
 * beradi — barcha yozishmalari, shaxsiylari ham. Bu Telegram shartlariga
 * nisbatan xavfli va axloqiy jihatdan og'ir. Bot esa faqat o'zi qo'shilgan
 * guruhdagi yoki o'ziga yozilgan xabarlarni ko'radi — chegara aniq va
 * sotuvchi uni tushunadi.
 *
 * User-session yo'li (QR login + telefon kodi) texnik jihatdan ko'proq
 * ma'lumot beradi, lekin bu narxga arzimaydi.
 */

const connectBody = z.object({
  /** BotFather bergan token: `123456789:AA...` */
  botToken: z
    .string()
    .trim()
    .regex(/^\d{6,}:[A-Za-z0-9_-]{30,}$/, 'Bot token formati noto\'g\'ri'),
  botUsername: z.string().trim().max(64).optional(),
});

const publicColumns = {
  id: integration.id,
  kind: integration.kind,
  status: integration.status,
  config: integration.config,
  syncEnabled: integration.syncEnabled,
  lastSyncAt: integration.lastSyncAt,
  lastSyncStatus: integration.lastSyncStatus,
  lastError: integration.lastError,
  createdAt: integration.createdAt,
  updatedAt: integration.updatedAt,
};

export function registerTelegramRoutes(app: FastifyInstance): void {
  /** Holat. Token hech qachon qaytarilmaydi — faqat niqob. */
  app.get(
    '/api/v1/businesses/:businessId/integrations/telegram',
    { preHandler: [requireBusiness, requirePermission('business:read')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select(publicColumns)
          .from(integration)
          .where(eq(integration.kind, 'telegram_bot'))
          .limit(1),
      );

      if (!row) return { connected: false };
      return { connected: row.status === 'connected', integration: row };
    },
  );

  /**
   * Botni ulash.
   *
   * Webhook sirini biz generatsiya qilamiz va Telegram'ga `setWebhook`
   * paytida beramiz. Telegram uni har so'rovda
   * `X-Telegram-Bot-Api-Secret-Token` sarlavhasida qaytaradi — shu orqali
   * begona so'rovlarni rad etamiz.
   *
   * `setWebhook` chaqiruvi hozircha bajarilmaydi (haqiqiy token kerak);
   * javobda foydalanuvchiga aniq buyruq beriladi.
   */
  app.post(
    '/api/v1/businesses/:businessId/integrations/telegram',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async (req, reply) => {
      const body = connectBody.parse(req.body);
      const businessId = req.business!.businessId;
      const webhookSecret = randomBytes(32).toString('base64url');

      const config = {
        botUsername: body.botUsername ?? null,
        tokenHint: maskSecret(body.botToken),
        connectedAt: new Date().toISOString(),
      };

      const [row] = await withTenant(businessId, (tx) =>
        tx
          .insert(integration)
          .values({
            businessId,
            kind: 'telegram_bot',
            status: 'connected',
            config,
            credentialsEncrypted: encryptSecret(body.botToken),
            webhookSecret,
            syncEnabled: true,
          })
          .onConflictDoUpdate({
            target: [integration.businessId, integration.kind],
            set: {
              status: 'connected',
              config,
              credentialsEncrypted: encryptSecret(body.botToken),
              webhookSecret,
              lastError: null,
              updatedAt: new Date(),
            },
          })
          .returning(publicColumns),
      );

      const webhookUrl = `${req.protocol}://${req.hostname}/api/v1/webhooks/telegram/${row!.id}`;

      reply.status(201);
      return {
        integration: row,
        webhookUrl,
        /**
         * Foydalanuvchi shu buyruqni bir marta bajaradi. Server ommaviy
         * domenda bo'lgach, buni biz avtomatik chaqiramiz.
         */
        setupCommand:
          `curl -X POST "https://api.telegram.org/bot<TOKEN>/setWebhook" ` +
          `-d "url=${webhookUrl}" -d "secret_token=${webhookSecret}"`,
        note: 'Webhook manzili HTTPS bo\'lishi shart. Lokal ishlab chiqishda ngrok ishlatiladi.',
      };
    },
  );

  app.delete(
    '/api/v1/businesses/:businessId/integrations/telegram',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async (req) => {
      const businessId = req.business!.businessId;
      await withTenant(businessId, (tx) =>
        tx
          .update(integration)
          .set({
            status: 'disconnected',
            syncEnabled: false,
            credentialsEncrypted: null,
            webhookSecret: null,
            updatedAt: new Date(),
          })
          .where(eq(integration.kind, 'telegram_bot')),
      );
      return { ok: true };
    },
  );

  /** Sotuvchiga Telegram user id biriktirish — FR-84 uchun zarur. */
  app.patch(
    '/api/v1/businesses/:businessId/seats/:seatId/telegram',
    { preHandler: [requireBusiness, requirePermission('seat:manage:all')] },
    async (req) => {
      const params = z
        .object({ businessId: z.string().uuid(), seatId: z.string().uuid() })
        .parse(req.params);
      const body = z
        .object({ telegramId: z.string().trim().regex(/^\d+$/).nullable() })
        .parse(req.body);

      const [row] = await withTenant(params.businessId, (tx) =>
        tx
          .update(seat)
          .set({
            telegramId: body.telegramId,
            telegramLinked: body.telegramId !== null,
            updatedAt: new Date(),
          })
          .where(eq(seat.id, params.seatId))
          .returning({
            id: seat.id,
            telegramId: seat.telegramId,
            telegramLinked: seat.telegramLinked,
          }),
      );
      if (!row) throw AppError.notFound();
      return row;
    },
  );

  /**
   * ═══ WEBHOOK ═══
   *
   * Autentifikatsiya sessiya orqali emas — Telegram sarlavhadagi sir orqali.
   *
   * MUHIM: har doim tez 200 qaytaramiz. Telegram javob olmasa, xabarni
   * soatlab qayta yuboradi va navbatni to'ldiradi. Ichki xatolarimiz
   * uning muammosi emas — ular logga yoziladi, lekin 200 baribir qaytadi.
   */
  app.post(
    '/api/v1/webhooks/telegram/:integrationId',
    {
      config: { rateLimit: { max: 3000, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { integrationId } = z
        .object({ integrationId: z.string().uuid() })
        .parse(req.params);

      const secret = req.headers['x-telegram-bot-api-secret-token'];

      // Integratsiya tenantlar ustidan qidiriladi — webhook'da kontekst yo'q.
      const [found] = await withoutTenantIsolation(
        'webhook: integratsiyani id bo\'yicha topish, tenant konteksti yo\'q',
        (tx) =>
          tx
            .select({
              id: integration.id,
              businessId: integration.businessId,
              secret: integration.webhookSecret,
              status: integration.status,
              syncEnabled: integration.syncEnabled,
            })
            .from(integration)
            .where(
              and(eq(integration.id, integrationId), eq(integration.kind, 'telegram_bot')),
            )
            .limit(1),
      );

      // Mavjud emas yoki sir mos emas — bir xil javob. Qaysi biri ekanini
      // oshkor qilmaymiz, aks holda id larni taxmin qilib topish mumkin.
      if (
        !found?.secret ||
        typeof secret !== 'string' ||
        !safeCompare(found.secret, secret)
      ) {
        req.log.warn({ integrationId }, 'telegram webhook: imzo mos kelmadi');
        reply.status(401);
        return { ok: false };
      }

      if (found.status !== 'connected' || !found.syncEnabled) {
        return { ok: true, skipped: 'integratsiya o\'chirilgan' };
      }

      const parsed = telegramUpdate.safeParse(req.body);
      if (!parsed.success) {
        req.log.warn({ issues: parsed.error.issues }, 'telegram webhook: notanish format');
        return { ok: true, skipped: 'format tushunilmadi' };
      }

      const msg = primaryMessage(parsed.data);
      if (!msg) return { ok: true, skipped: 'xabar yo\'q' };

      const text = extractText(msg);
      if (!text) return { ok: true, skipped: 'matn ajratilmadi' };

      try {
        const result = await ingestMessage({
          businessId: found.businessId,
          chatId: String(msg.chat.id),
          messageId: String(msg.message_id),
          senderId: msg.from ? String(msg.from.id) : null,
          senderIsBot: msg.from?.is_bot ?? false,
          text,
          sentAt: new Date(msg.date * 1000),
          chatTitle: msg.chat.title ?? msg.chat.username,
        });
        return { ok: true, ...result };
      } catch (err) {
        // Telegram qayta yubormasin — muammo bizda, uni o'zimiz hal qilamiz.
        req.log.error({ err, integrationId }, 'telegram webhook: saqlashda xato');
        return { ok: true, error: 'ichki xato, logga yozildi' };
      }
    },
  );
}
