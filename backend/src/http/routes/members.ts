import { and, eq, isNull, ne } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { isUniqueViolation } from '../../db/errors.js';
import { withoutTenantIsolation, withTenant } from '../../db/index.js';
import { appUser, businessMember } from '../../db/schema/index.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/** Rahbarlar. `manager` bu yerda yo'q — u `seat` orqali keladi. */
const inviteBody = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  displayName: z.string().trim().min(2).max(100),
  role: z.enum(['owner', 'supervisor', 'head', 'auditor']),
  departmentId: z.string().uuid().nullable().optional(),
});

const patchBody = z.object({
  role: z.enum(['owner', 'supervisor', 'head', 'auditor']).optional(),
  departmentId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
});

const memberParams = z.object({
  businessId: z.string().uuid(),
  memberId: z.string().uuid(),
});

/**
 * Oxirgi egani olib tashlash yoki roli tushirishdan himoya.
 *
 * Busiz biznes egasiz qolishi mumkin: obunani boshqara oladigan,
 * rahbar qo'sha oladigan hech kim qolmaydi va faqat qo'lda
 * aralashish bilan tuzatiladi.
 */
async function assertNotLastOwner(businessId: string, memberId: string): Promise<void> {
  const others = await withTenant(businessId, (tx) =>
    tx
      .select({ id: businessMember.id })
      .from(businessMember)
      .where(
        and(
          eq(businessMember.role, 'owner'),
          eq(businessMember.isActive, true),
          ne(businessMember.id, memberId),
        ),
      ),
  );

  if (others.length === 0) {
    throw AppError.conflict(
      'Biznesda kamida bitta ega qolishi kerak',
      'Avval boshqa foydalanuvchini ega qiling, keyin bu rolni o\'zgartiring.',
    );
  }
}

export function registerMemberRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/businesses/:businessId/members',
    { preHandler: [requireBusiness, requirePermission('business:read')] },
    async (req) => {
      const businessId = req.business!.businessId;

      // `app_user` tenant jadvali emas (bitta odam bir nechta biznesda
      // bo'ladi), shuning uchun ismni olish uchun egalik ulanishi kerak.
      // A'zolar ro'yxati esa RLS bilan cheklangan holda olinadi.
      const members = await withTenant(businessId, (tx) =>
        tx
          .select({
            id: businessMember.id,
            userId: businessMember.userId,
            role: businessMember.role,
            departmentId: businessMember.departmentId,
            activation: businessMember.activation,
            isActive: businessMember.isActive,
            addedAt: businessMember.addedAt,
          })
          .from(businessMember),
      );

      if (members.length === 0) return [];

      const users = await withoutTenantIsolation(
        'a\'zolar ro\'yxati: app_user tenant jadvali emas, ism/email olish uchun',
        (tx) =>
          tx
            .select({
              id: appUser.id,
              email: appUser.email,
              displayName: appUser.displayName,
              avatarUrl: appUser.avatarUrl,
              lastLoginAt: appUser.lastLoginAt,
            })
            .from(appUser),
      );

      const byId = new Map(users.map((u) => [u.id, u]));
      return members.map((m) => ({ ...m, user: byId.get(m.userId) ?? null }));
    },
  );

  /**
   * Rahbar taklif qilish.
   *
   * Email allaqachon platformada bo'lsa — mavjud foydalanuvchi biriktiriladi
   * (u boshqa biznesda ham ishlashi mumkin, FR-08). Bo'lmasa — parolsiz
   * yozuv yaratiladi; foydalanuvchi taklif havolasi orqali parol o'rnatadi.
   */
  app.post(
    '/api/v1/businesses/:businessId/members/invite',
    { preHandler: [requireBusiness, requirePermission('member:manage')] },
    async (req, reply) => {
      const body = inviteBody.parse(req.body);
      const businessId = req.business!.businessId;

      const userId = await withoutTenantIsolation(
        'taklif: foydalanuvchini email bo\'yicha topish/yaratish tenantlardan tashqarida',
        async (tx) => {
          const [existing] = await tx
            .select({ id: appUser.id })
            .from(appUser)
            .where(and(eq(appUser.email, body.email), isNull(appUser.deletedAt)))
            .limit(1);

          if (existing) return existing.id;

          const [created] = await tx
            .insert(appUser)
            .values({
              email: body.email,
              displayName: body.displayName,
              systemRole: 'user',
            })
            .returning({ id: appUser.id });

          if (!created) throw new Error('foydalanuvchi yaratilmadi');
          return created.id;
        },
      );

      try {
        const [row] = await withTenant(businessId, (tx) =>
          tx
            .insert(businessMember)
            .values({
              businessId,
              userId,
              role: body.role,
              departmentId: body.departmentId ?? null,
              invitedVia: 'email',
              activation: 'pending',
            })
            .returning(),
        );
        reply.status(201);
        return row;
      } catch (err) {
        if (isUniqueViolation(err, 'business_member_uq')) {
          throw AppError.conflict('Bu foydalanuvchi allaqachon jamoada');
        }
        throw err;
      }
    },
  );

  app.patch(
    '/api/v1/businesses/:businessId/members/:memberId',
    { preHandler: [requireBusiness, requirePermission('member:manage')] },
    async (req) => {
      const { memberId } = memberParams.parse(req.params);
      const patch = patchBody.parse(req.body);
      const businessId = req.business!.businessId;

      const [existing] = await withTenant(businessId, (tx) =>
        tx
          .select({ role: businessMember.role, userId: businessMember.userId })
          .from(businessMember)
          .where(eq(businessMember.id, memberId))
          .limit(1),
      );
      if (!existing) throw AppError.notFound();

      const losingOwner =
        existing.role === 'owner' &&
        ((patch.role !== undefined && patch.role !== 'owner') || patch.isActive === false);

      if (losingOwner) await assertNotLastOwner(businessId, memberId);

      const [row] = await withTenant(businessId, (tx) =>
        tx
          .update(businessMember)
          .set(patch)
          .where(eq(businessMember.id, memberId))
          .returning(),
      );
      return row;
    },
  );

  app.delete(
    '/api/v1/businesses/:businessId/members/:memberId',
    { preHandler: [requireBusiness, requirePermission('member:manage')] },
    async (req) => {
      const { memberId } = memberParams.parse(req.params);
      const businessId = req.business!.businessId;

      const [existing] = await withTenant(businessId, (tx) =>
        tx
          .select({ role: businessMember.role })
          .from(businessMember)
          .where(eq(businessMember.id, memberId))
          .limit(1),
      );
      if (!existing) throw AppError.notFound();

      if (existing.role === 'owner') await assertNotLastOwner(businessId, memberId);

      await withTenant(businessId, (tx) =>
        tx.delete(businessMember).where(eq(businessMember.id, memberId)),
      );
      return { ok: true };
    },
  );
}
