import { and, asc, desc, eq, ne, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { provayderKlienti } from '../../ai/llm.js';
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

/**
 * Bosqich → model nomi (`stage2`, `stage3`, `playbookBuilder`) va ixtiyoriy
 * `splitFields` — zaif modellarga katta sxemani bo'lib so'rash uchun RAQAM.
 * Ilgari faqat matn qabul qilinardi va bepul modelni sozlab bo'lmasdi.
 */
const modellar = z.record(z.union([z.string().trim().min(1).max(120), z.number().int().min(1).max(50)]));

/** Zaxira navbati: 1, 2, … yoki `null` — zaxirada emas. */
const zaxira = z.number().int().min(1).max(20).nullable();

const createProvider = z.object({
  purpose: z.enum(['llm', 'stt']),
  kind: z.enum(['anthropic', 'openai', 'google', 'deepgram', 'custom']),
  label: z.string().trim().min(2).max(80),
  apiKey: z.string().trim().min(8).max(500).optional(),
  models: modellar.default({}),
  baseUrl: z.string().url().max(300).optional(),
  monthlyBudgetUsd: z.number().int().min(0).max(1_000_000).default(0),
  fallbackOrder: zaxira.default(null),
});

const patchProvider = z.object({
  label: z.string().trim().min(2).max(80).optional(),
  /** Yangi kalit. Berilsa — eskisi almashtiriladi. Ochib ko'rish imkoni yo'q. */
  apiKey: z.string().trim().min(8).max(500).optional(),
  models: modellar.optional(),
  baseUrl: z.string().url().max(300).nullable().optional(),
  monthlyBudgetUsd: z.number().int().min(0).max(1_000_000).optional(),
  fallbackOrder: zaxira.optional(),
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
  fallbackOrder: aiProvider.fallbackOrder,
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
      tx
        .select(publicColumns)
        .from(aiProvider)
        .orderBy(desc(aiProvider.isActive), sql`${aiProvider.fallbackOrder} asc nulls last`, asc(aiProvider.createdAt)),
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
            fallbackOrder: body.fallbackOrder,
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
    if (body.fallbackOrder !== undefined) patch.fallbackOrder = body.fallbackOrder;

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
   * Ulanishni tekshirish — HAQIQIY so'rov.
   *
   * LLM uchun kichik JSON so'rov ishchi pipeline ishlatadigan AYNAN o'sha
   * klient (`provayderKlienti`) orqali yuboriladi: kalit, `baseUrl`, model
   * nomi va JSON rejimi birga tekshiriladi. «Sozlama to'liq» degani hali
   * ishlashini bildirmaydi — noto'g'ri model nomi faqat jonli so'rovda chiqadi.
   * STT uchun hozircha sozlama to'liqligi tekshiriladi.
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
          baseUrl: aiProvider.baseUrl,
        })
        .from(aiProvider)
        .where(eq(aiProvider.id, id))
        .limit(1),
    );
    if (!row) throw AppError.notFound();

    const problems: string[] = [];
    if (!row.key) problems.push('API kaliti kiritilmagan');
    const modelNomlari = Object.entries((row.models ?? {}) as Record<string, unknown>).filter(([k]) => k !== 'splitFields');
    if (modelNomlari.length === 0) problems.push('Model tanlanmagan');

    let liveCheck = false;
    let model: string | null = null;
    let ms: number | null = null;
    if (problems.length === 0 && row.purpose === 'llm') {
      liveCheck = true;
      const boshlandi = Date.now();
      try {
        const javob = await provayderKlienti({ kind: row.kind, apiKeyEncrypted: row.key, models: row.models, baseUrl: row.baseUrl }).completeJson({
          stage: 'stage2',
          system: 'Siz ulanish tekshiruvisiz. Faqat berilgan JSON sxemaga mos javob qaytaring.',
          user: 'Ulanish ishlayaptimi? ok maydoniga true yozing.',
          schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'], additionalProperties: false },
          maxTokens: 200,
        });
        model = javob.model;
        if ((javob.json as { ok?: unknown } | null)?.ok !== true) problems.push('Model javob berdi, lekin JSON sxemaga mos emas');
      } catch (err) {
        problems.push((err instanceof Error ? err.message : String(err)).slice(0, 500));
      }
      ms = Date.now() - boshlandi;
    }

    const ok = problems.length === 0;
    await withoutTenantIsolation('admin: tekshiruv natijasini yozish', (tx) =>
      tx
        .update(aiProvider)
        .set({
          lastCheckAt: new Date(),
          lastCheckOk: ok,
          lastCheckError: ok ? null : problems.join('; ').slice(0, 1000),
        })
        .where(eq(aiProvider.id, id)),
    );

    return {
      ok,
      problems,
      liveCheck,
      model,
      ms,
      note: ok
        ? liveCheck
          ? `Ishlayapti: ${model} ${ms} ms da javob berdi.`
          : 'Sozlama to\'liq (STT jonli tekshirilmaydi).'
        : 'Tekshiruv o\'tmadi.',
    };
  });
}
