import { and, desc, eq, ne } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { encryptSecret, maskSecret } from '../../crypto/secrets.js';
import { withoutTenantIsolation } from '../../db/index.js';
import { aiProvider, auditLog } from '../../db/schema/index.js';
import { AppError } from '../errors.js';
import { requireAuth } from '../auth-plugin.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ADMIN PANELI — platforma sozlamalari
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Faqat `system_role = 'super_admin'`. Bu bizneslardan ustun daraja:
 * bu yerdagi sozlamalar butun platformaga ta'sir qiladi.
 *
 * Hozircha AI provayderlari (LLM va STT kalitlari). Keyinchalik:
 * partnyor dasturi, obuna narxlari, umumiy sozlamalar.
 */

/** Super-admin tekshiruvi. Boshqalarga 404 — panel mavjudligi ham oshkor bo'lmasin. */
async function requireSuperAdmin(req: FastifyRequest): Promise<void> {
  if (!req.auth) throw AppError.unauthorized();
  if (req.auth.user.systemRole !== 'super_admin') {
    throw AppError.notFound();
  }
}

const createProvider = z.object({
  purpose: z.enum(['llm', 'stt']),
  kind: z.enum(['anthropic', 'openai', 'google', 'deepgram', 'custom']),
  label: z.string().trim().min(2).max(80),
  apiKey: z.string().trim().min(8).max(500).optional(),
  models: z.record(z.string().trim().min(1).max(80)).default({}),
  baseUrl: z.string().url().max(300).optional(),
  monthlyBudgetUsd: z.number().int().min(0).max(1_000_000).default(0),
});

const patchProvider = z.object({
  label: z.string().trim().min(2).max(80).optional(),
  /** Yangi kalit. Berilsa — eskisi almashtiriladi. Ochib ko'rish imkoni yo'q. */
  apiKey: z.string().trim().min(8).max(500).optional(),
  models: z.record(z.string().trim().min(1).max(80)).optional(),
  baseUrl: z.string().url().max(300).nullable().optional(),
  monthlyBudgetUsd: z.number().int().min(0).max(1_000_000).optional(),
});

const idParam = z.object({ id: z.string().uuid() });

/**
 * Javobda **hech qachon** `apiKeyEncrypted` bo'lmaydi.
 * Ustunlar ro'yxati ataylab aniq yozilgan — `select()` bilan hammasini
 * olib, keyin maydonni o'chirishga tayanmaymiz, chunki o'sha o'chirishni
 * unutish oson.
 */
const publicColumns = {
  id: aiProvider.id,
  purpose: aiProvider.purpose,
  kind: aiProvider.kind,
  label: aiProvider.label,
  apiKeyHint: aiProvider.apiKeyHint,
  apiKeyRotatedAt: aiProvider.apiKeyRotatedAt,
  models: aiProvider.models,
  baseUrl: aiProvider.baseUrl,
  isActive: aiProvider.isActive,
  lastCheckAt: aiProvider.lastCheckAt,
  lastCheckOk: aiProvider.lastCheckOk,
  lastCheckError: aiProvider.lastCheckError,
  monthlyBudgetUsd: aiProvider.monthlyBudgetUsd,
  createdAt: aiProvider.createdAt,
  updatedAt: aiProvider.updatedAt,
};

async function writeAudit(
  req: FastifyRequest,
  action: string,
  entityId: string,
  before: unknown,
  after: unknown,
): Promise<void> {
  await withoutTenantIsolation(
    'audit: platforma darajasidagi amal, biznesga tegishli emas',
    (tx) =>
      tx.insert(auditLog).values({
        businessId: null,
        actorId: req.auth!.user.id,
        action,
        entity: 'ai_provider',
        entityId,
        before: before as never,
        after: after as never,
        ip: req.ip,
        userAgent: req.headers['user-agent'] ?? null,
      }),
  );
}

export function registerAdminRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireAuth, requireSuperAdmin] };

  app.get('/api/v1/admin/providers', guard, async () =>
    withoutTenantIsolation('admin: AI provayderlari platforma darajasida', (tx) =>
      tx.select(publicColumns).from(aiProvider).orderBy(desc(aiProvider.createdAt)),
    ),
  );

  app.post('/api/v1/admin/providers', guard, async (req, reply) => {
    const body = createProvider.parse(req.body);

    const [row] = await withoutTenantIsolation(
      'admin: AI provayderi yaratish',
      (tx) =>
        tx
          .insert(aiProvider)
          .values({
            purpose: body.purpose,
            kind: body.kind,
            label: body.label,
            apiKeyEncrypted: body.apiKey ? encryptSecret(body.apiKey) : null,
            apiKeyHint: body.apiKey ? maskSecret(body.apiKey) : null,
            apiKeyRotatedAt: body.apiKey ? new Date() : null,
            models: body.models,
            baseUrl: body.baseUrl ?? null,
            monthlyBudgetUsd: body.monthlyBudgetUsd,
            createdBy: req.auth!.user.id,
          })
          .returning(publicColumns),
    );

    await writeAudit(req, 'provider.create', row!.id, null, { label: body.label });
    reply.status(201);
    return row;
  });

  app.patch('/api/v1/admin/providers/:id', guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = patchProvider.parse(req.body);

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    if (body.label !== undefined) patch.label = body.label;
    if (body.models !== undefined) patch.models = body.models;
    if (body.baseUrl !== undefined) patch.baseUrl = body.baseUrl;
    if (body.monthlyBudgetUsd !== undefined) patch.monthlyBudgetUsd = body.monthlyBudgetUsd;

    if (body.apiKey !== undefined) {
      patch.apiKeyEncrypted = encryptSecret(body.apiKey);
      patch.apiKeyHint = maskSecret(body.apiKey);
      patch.apiKeyRotatedAt = new Date();
      // Kalit o'zgargach eski tekshiruv natijasi ma'nosini yo'qotadi.
      patch.lastCheckAt = null;
      patch.lastCheckOk = null;
      patch.lastCheckError = null;
    }

    const [row] = await withoutTenantIsolation('admin: AI provayderini yangilash', (tx) =>
      tx.update(aiProvider).set(patch).where(eq(aiProvider.id, id)).returning(publicColumns),
    );
    if (!row) throw AppError.notFound();

    await writeAudit(req, body.apiKey ? 'provider.rotate_key' : 'provider.update', id, null, {
      fields: Object.keys(patch).filter((k) => k !== 'apiKeyEncrypted'),
    });
    return row;
  });

  /**
   * Faollashtirish. Har `purpose` uchun faqat bitta faol provayder bo'ladi —
   * buni qisman unikal indeks kafolatlaydi, shuning uchun avval
   * qolganlarini o'chiramiz.
   */
  app.post('/api/v1/admin/providers/:id/activate', guard, async (req) => {
    const { id } = idParam.parse(req.params);

    const row = await withoutTenantIsolation('admin: provayderni faollashtirish', async (tx) => {
      const [target] = await tx
        .select({ id: aiProvider.id, purpose: aiProvider.purpose, key: aiProvider.apiKeyEncrypted })
        .from(aiProvider)
        .where(eq(aiProvider.id, id))
        .limit(1);

      if (!target) throw AppError.notFound();
      if (!target.key) {
        throw AppError.badRequest('API kaliti kiritilmagan — avval kalitni qo\'shing');
      }

      await tx
        .update(aiProvider)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(aiProvider.purpose, target.purpose), ne(aiProvider.id, id)));

      const [updated] = await tx
        .update(aiProvider)
        .set({ isActive: true, updatedAt: new Date() })
        .where(eq(aiProvider.id, id))
        .returning(publicColumns);

      return updated;
    });

    await writeAudit(req, 'provider.activate', id, null, null);
    return row;
  });

  app.delete('/api/v1/admin/providers/:id', guard, async (req) => {
    const { id } = idParam.parse(req.params);

    const [row] = await withoutTenantIsolation('admin: provayderni o\'chirish', (tx) =>
      tx.delete(aiProvider).where(eq(aiProvider.id, id)).returning({ id: aiProvider.id }),
    );
    if (!row) throw AppError.notFound();

    await writeAudit(req, 'provider.delete', id, null, null);
    return { ok: true };
  });

  /**
   * Ulanishni tekshirish.
   *
   * Hozircha faqat sozlama to'liqligini tekshiradi — haqiqiy API chaqiruvi
   * LLM klienti yozilgach qo'shiladi. Endpoint shakli hozirdan qat'iy,
   * shunda frontend keyin o'zgarmaydi.
   */
  app.post('/api/v1/admin/providers/:id/test', guard, async (req) => {
    const { id } = idParam.parse(req.params);

    const [row] = await withoutTenantIsolation('admin: provayder ulanishini tekshirish', (tx) =>
      tx
        .select({
          id: aiProvider.id,
          kind: aiProvider.kind,
          purpose: aiProvider.purpose,
          key: aiProvider.apiKeyEncrypted,
          models: aiProvider.models,
        })
        .from(aiProvider)
        .where(eq(aiProvider.id, id))
        .limit(1),
    );
    if (!row) throw AppError.notFound();

    const problems: string[] = [];
    if (!row.key) problems.push('API kaliti kiritilmagan');
    if (Object.keys(row.models as object).length === 0) problems.push('Model tanlanmagan');

    const ok = problems.length === 0;
    await withoutTenantIsolation('admin: tekshiruv natijasini yozish', (tx) =>
      tx
        .update(aiProvider)
        .set({
          lastCheckAt: new Date(),
          lastCheckOk: ok,
          lastCheckError: ok ? null : problems.join('; '),
        })
        .where(eq(aiProvider.id, id)),
    );

    return {
      ok,
      problems,
      // Haqiqiy API chaqiruvi LLM klienti tayyor bo'lgach ishga tushadi.
      liveCheck: false,
      note: ok
        ? 'Sozlama to\'liq. Jonli tekshiruv LLM klienti ulangach ishlaydi.'
        : 'Sozlamani to\'ldiring.',
    };
  });
}
