import { randomBytes } from 'node:crypto';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { crmExportConfigSchema, imzoSarlavhalari } from '../../integrations/crm-export.js';
import { decryptSecret, encryptSecret, maskSecret } from '../../crypto/secrets.js';
import { withTenant } from '../../db/index.js';
import { integration, task } from '../../db/schema/index.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM EKSPORTI — «Vazifalarni CRM'ga yuborish»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sabab va imzo sxemasi `integrations/crm-export.ts` da tushuntirilgan.
 *
 * Sir HECH QACHON qaytarilmaydi — faqat "o'rnatilgan/o'rnatilmagan" va
 * niqob. Bir marta kiritilgach uni ko'rish emas, faqat almashtirish
 * mumkin: ekran ko'rsatish paytida sizib chiqmasligi uchun.
 */

const sozlashBody = z.object({
  exportTasks: z.boolean(),
  url: z.string().url().max(500).nullable(),
  /**
   * Yangi sir. `null` — o'zgartirilmasin (eskisi qoladi).
   *
   * `''` (bo'sh matn) EMAS: bo'sh matn "sirni o'chir" degani bo'lib
   * tuyulishi mumkin, lekin sirsiz webhook imzolanmaydi va biz uni
   * umuman ruxsat bermaymiz.
   */
  secret: z.string().trim().min(16).max(200).nullable().default(null),
});

export function registerCrmRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/businesses/:businessId/integrations/crm',
    { preHandler: [requireBusiness, requirePermission('business:read')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select({
            config: integration.config,
            credentials: integration.credentialsEncrypted,
            status: integration.status,
            lastError: integration.lastError,
          })
          .from(integration)
          .where(eq(integration.kind, 'generic_webhook'))
          .limit(1),
      );

      const cfg = crmExportConfigSchema.parse(
        (row?.config as Record<string, unknown>)?.crmExport ?? {},
      );

      // Sirning o'zi emas, faqat niqob.
      let secretHint: string | null = null;
      if (row?.credentials) {
        try {
          secretHint = maskSecret(decryptSecret(row.credentials));
        } catch {
          secretHint = null;
        }
      }

      /** Oxirgi yuborishlar — sozlama ishlayotganini ko'rsatadi. */
      const oxirgilar = await withTenant(businessId, (tx) =>
        tx
          .select({
            id: task.id,
            title: task.title,
            exportedAt: task.exportedAt,
            exportError: task.exportError,
          })
          .from(task)
          .where(isNotNull(task.exportedAt))
          .orderBy(desc(task.exportedAt))
          .limit(5),
      );

      return {
        config: { ...cfg, hasSecret: secretHint !== null },
        secretHint,
        status: row?.status ?? 'disconnected',
        lastError: row?.lastError ?? null,
        recent: oxirgilar,
      };
    },
  );

  app.put(
    '/api/v1/businesses/:businessId/integrations/crm',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async (req) => {
      const body = sozlashBody.parse(req.body);
      const businessId = req.business!.businessId;

      if (body.exportTasks && !body.url) {
        throw AppError.badRequest('Eksportni yoqish uchun webhook manzili kerak');
      }

      const natija = await withTenant(businessId, async (tx) => {
        const [mavjud] = await tx
          .select({ id: integration.id, config: integration.config, creds: integration.credentialsEncrypted })
          .from(integration)
          .where(eq(integration.kind, 'generic_webhook'))
          .limit(1);

        /**
         * Sirsiz yoqib bo'lmaydi.
         *
         * Imzosiz webhook — manzilni bilgan har kimga soxta vazifa
         * yuborish imkoni. Uni ixtiyoriy qilsak, ko'pchilik e'tibor
         * bermay o'tib ketardi.
         */
        const sirBor = body.secret !== null || Boolean(mavjud?.creds);
        if (body.exportTasks && !sirBor) {
          throw AppError.badRequest('Eksportni yoqish uchun imzo siri kerak');
        }

        const cfg = { exportTasks: body.exportTasks, url: body.url };
        const yangiCreds = body.secret ? encryptSecret(body.secret) : undefined;

        if (mavjud) {
          const config = (mavjud.config ?? {}) as Record<string, unknown>;
          await tx
            .update(integration)
            .set({
              config: { ...config, crmExport: cfg },
              status: body.exportTasks ? 'connected' : 'disconnected',
              ...(yangiCreds ? { credentialsEncrypted: yangiCreds } : {}),
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(integration.id, mavjud.id));
        } else {
          await tx.insert(integration).values({
            businessId,
            kind: 'generic_webhook',
            status: body.exportTasks ? 'connected' : 'disconnected',
            config: { crmExport: cfg },
            credentialsEncrypted: yangiCreds,
          });
        }
        return cfg;
      });

      return { config: crmExportConfigSchema.parse(natija) };
    },
  );

  /** Yangi sir taklif qiladi — odam o'zi o'ylab topmasin. */
  app.post(
    '/api/v1/businesses/:businessId/integrations/crm/secret',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async () => ({ secret: randomBytes(24).toString('base64url') }),
  );

  /**
   * Sinov so'rovi.
   *
   * Haqiqiy vazifa kutmasdan manzil ishlayotganini tekshiradi. Tana
   * haqiqiysi bilan bir xil shaklda, lekin `event: 'test'` — qabul
   * qiluvchi uni CRM ga yozmasligi kerakligini bilsin.
   */
  app.post(
    '/api/v1/businesses/:businessId/integrations/crm/test',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select({ config: integration.config, creds: integration.credentialsEncrypted })
          .from(integration)
          .where(eq(integration.kind, 'generic_webhook'))
          .limit(1),
      );
      const cfg = crmExportConfigSchema.parse(
        (row?.config as Record<string, unknown>)?.crmExport ?? {},
      );
      if (!cfg.url || !row?.creds) {
        throw AppError.badRequest('Avval manzil va imzo sirini saqlang');
      }

      const tana = JSON.stringify({
        event: 'test',
        message: 'Sotuv Intellekti: sinov so\'rovi. Bu vazifa emas.',
        sentAt: new Date().toISOString(),
      });

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(cfg.url, {
          method: 'POST',
          headers: imzoSarlavhalari(decryptSecret(row.creds), tana),
          body: tana,
          signal: controller.signal,
        });
        return {
          ok: res.ok,
          status: res.status,
          error: res.ok ? null : (await res.text()).slice(0, 200),
        };
      } catch (err) {
        const m = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          status: 0,
          error: m === 'The operation was aborted.' ? 'vaqt tugadi' : m,
        };
      } finally {
        clearTimeout(timer);
      }
    },
  );

  /**
   * Yuborilmagan vazifalarni qayta navbatga qo'yish.
   *
   * Xato tuzatilgandan keyin kerak: dispetcher muvaffaqiyatsiz yozuvni
   * qayta urinmaydi (sabab `crm-export.ts` da), shuning uchun odam
   * o'zi qayta yuborishi mumkin bo'lishi kerak.
   */
  app.post(
    '/api/v1/businesses/:businessId/integrations/crm/retry',
    { preHandler: [requireBusiness, requirePermission('integration:manage')] },
    async (req) => {
      const businessId = req.business!.businessId;
      const qatorlar = await withTenant(businessId, (tx) =>
        tx
          .update(task)
          .set({ exportedAt: null, exportError: null })
          .where(and(isNotNull(task.exportError), isNotNull(task.exportedAt)))
          .returning({ id: task.id }),
      );
      return { requeued: qatorlar.length };
    },
  );
}
