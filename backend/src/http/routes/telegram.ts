import { randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { decryptSecret, encryptSecret, maskSecret, safeCompare } from '../../crypto/secrets.js';
import { withoutTenantIsolation, withTenant } from '../../db/index.js';
import { integration, seat } from '../../db/schema/index.js';
import { ingestMessage } from '../../telegram/ingest.js';
import { sendTelegramMessage } from '../../telegram/send.js';
import { extractText, primaryMessage, telegramUpdate } from '../../telegram/types.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';
import { telegramManzil, telegramTargetsSchema } from '../../business/channels.js';

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


  /**
   * ═══════════════════════════════════════════════════════════════════════
   * BILDIRISHNOMA MANZILLARI — bot / guruh / kanal
   * ═══════════════════════════════════════════════════════════════════════
   *
   * `discovered` — bot ko'rgan chatlar (webhook to'ldiradi). U faqat
   * O'QISH uchun: foydalanuvchi ro'yxatdan tanlaydi, qo'lda yozmaydi.
   * Shu bilan birga qo'lda kiritish ham qoldirilgan — kanalga bot
   * administrator qilib qo'shilsa-yu hech kim yozmasa, kanal ro'yxatga
   * tushmaydi.
   */
  app.get(
    '/api/v1/businesses/:businessId/integrations/telegram/targets',
    { preHandler: [requireBusiness, requirePermission('business:read')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select({ config: integration.config })
          .from(integration)
          .where(eq(integration.kind, 'telegram_bot'))
          .limit(1),
      );
      const config = (row?.config ?? {}) as Record<string, unknown>;
      return { targets: telegramTargetsSchema.parse(config.telegramTargets ?? {}) };
    },
  );

  app.put(
    '/api/v1/businesses/:businessId/integrations/telegram/targets',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async (req) => {
      /**
       * `discovered` mijozdan QABUL QILINMAYDI — u serverning kuzatuvi.
       * Aks holda foydalanuvchi o'ylab topilgan chatlar ro'yxatini
       * yuborishi va interfeys yolg'on ma'lumot ko'rsatishi mumkin edi.
       */
      const body = z
        .object({
          dm: telegramManzil.nullable().default(null),
          group: telegramManzil.nullable().default(null),
          channel: telegramManzil.nullable().default(null),
        })
        .parse(req.body);

      const businessId = req.business!.businessId;
      const natija = await withTenant(businessId, async (tx) => {
        const [row] = await tx
          .select({ id: integration.id, config: integration.config })
          .from(integration)
          .where(eq(integration.kind, 'telegram_bot'))
          .limit(1);
        if (!row) throw AppError.badRequest('Avval Telegram botni ulang');

        const config = (row.config ?? {}) as Record<string, unknown>;
        const eski = telegramTargetsSchema.parse(config.telegramTargets ?? {});
        const yangi = { ...eski, ...body };

        await tx
          .update(integration)
          .set({
            config: { ...config, telegramTargets: yangi },
            updatedAt: new Date(),
          })
          .where(eq(integration.id, row.id));
        return yangi;
      });

      return { targets: natija };
    },
  );

  /**
   * Sinov xabari — manzil HAQIQATAN ishlaydimi.
   *
   * Bu tugma bo'lmasa, sozlama to'g'ri kiritilganini bilishning yagona
   * yo'li haqiqiy ogohlantirishni kutish bo'lardi. Botni guruhga
   * qo'shishni unutish esa eng ko'p uchraydigan xato.
   */
  app.post(
    '/api/v1/businesses/:businessId/integrations/telegram/targets/test',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async (req) => {
      const { kanal } = z
        .object({ kanal: z.enum(['dm', 'group', 'channel']) })
        .parse(req.body);

      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select({
            config: integration.config,
            credentials: integration.credentialsEncrypted,
            status: integration.status,
          })
          .from(integration)
          .where(eq(integration.kind, 'telegram_bot'))
          .limit(1),
      );
      if (!row || row.status !== 'connected' || !row.credentials) {
        throw AppError.badRequest('Telegram bot ulanmagan');
      }

      const config = (row.config ?? {}) as Record<string, unknown>;
      const targets = telegramTargetsSchema.parse(config.telegramTargets ?? {});
      const manzil = targets[kanal];
      if (!manzil) throw AppError.badRequest('Bu kanal uchun manzil tanlanmagan');

      const natija = await sendTelegramMessage(
        decryptSecret(row.credentials),
        manzil.chatId,
        'Sotuv Intellekti: sinov xabari. Bu manzilga ogohlantirishlar keladi.',
      );
      return { ok: natija.ok, error: natija.error ?? null };
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

      /**
       * GURUH VA KANAL — mijoz suhbati EMAS.
       *
       * Ilgari bu yerda chat turi umuman tekshirilmasdi: botni jamoa
       * guruhiga qo'shsangiz, hamkasblar yozishmasi "mijoz suhbati"
       * bo'lib bazaga tushar, tahlil qilinar va menejerlarga ball
       * qo'yilardi. Endi bunday chatlar faqat MANZIL sifatida
       * eslab qolinadi — bildirishnoma yuborish uchun ro'yxatdan
       * tanlash mumkin bo'lsin.
       */
      if (msg.chat.type !== 'private') {
        await manzilniEslab(found.businessId, {
          chatId: String(msg.chat.id),
          type: msg.chat.type,
          title: msg.chat.title ?? msg.chat.username ?? null,
        });
        return { ok: true, skipped: 'guruh/kanal — manzil sifatida qayd etildi' };
      }

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

/**
 * Bot ko'rgan guruh/kanalni integratsiya konfiguratsiyasiga yozadi.
 *
 * Nega kerak: Telegram guruhining chat id si (`-1001234567890`) hech
 * qayerda ochiq ko'rinmaydi va uni topish uchun odam uchinchi tomon
 * botlaridan foydalanishga majbur bo'lardi. Botni guruhga qo'shib
 * bitta xabar yozish — eng tabiiy yo'l.
 *
 * Ro'yxat 50 tada cheklangan va eng yangisi boshida turadi: bot ko'p
 * guruhda bo'lsa ham sozlama sahifasi cheksiz o'smasin.
 */
async function manzilniEslab(
  businessId: string,
  chat: { chatId: string; type: 'group' | 'supergroup' | 'channel'; title: string | null },
): Promise<void> {
  await withTenant(businessId, async (tx) => {
    const [row] = await tx
      .select({ id: integration.id, config: integration.config })
      .from(integration)
      .where(eq(integration.kind, 'telegram_bot'))
      .limit(1);
    if (!row) return;

    const config = (row.config ?? {}) as Record<string, unknown>;
    const targets = telegramTargetsSchema.parse(config.telegramTargets ?? {});
    const qolgan = targets.discovered.filter((d) => d.chatId !== chat.chatId);
    const yangi = [
      { ...chat, seenAt: new Date().toISOString() },
      ...qolgan,
    ].slice(0, 50);

    await tx
      .update(integration)
      .set({
        config: { ...config, telegramTargets: { ...targets, discovered: yangi } },
        updatedAt: new Date(),
      })
      .where(eq(integration.id, row.id));
  });
}
