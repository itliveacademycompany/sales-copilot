import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { generateToken, hashToken } from '../../auth/tokens.js';
import { hasPermission } from '../../auth/permissions.js';
import { isForeignKeyViolation, isUniqueViolation } from '../../db/errors.js';
import { withTenant } from '../../db/index.js';
import { seat } from '../../db/schema/index.js';
import { requireBusiness } from '../auth-plugin.js';
import { AppError } from '../errors.js';
import { seatWorkHoursSchema } from '../../business/settings.js';

/**
 * Sotuvchi o'rinlari — litsenziya birligi.
 *
 * Ko'lam: `seat:manage:all` (ega, rahbar) barcha o'rinlarni boshqaradi;
 * `seat:manage:department` (bo'lim boshlig'i) faqat o'z bo'limidagilarni.
 */

/** FR-04: aktivatsiya havolasi 7 kun amal qiladi — yangi xodim birinchi kunlarda kiradi. */
export const AKTIVATSIYA_MUDDATI_MS = 7 * 24 * 60 * 60 * 1000;

/** O'zbek raqamlari uchun: +998XXXXXXXXX yoki 9 xonali ichki format. */
const phone = z
  .string()
  .trim()
  .regex(/^\+?\d{7,15}$/, 'Telefon raqami formati noto\'g\'ri');

const createSeat = z.object({
  displayName: z.string().trim().min(2).max(100),
  login: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9._-]{3,40}$/, 'Login faqat harf, raqam, . _ - dan iborat bo\'lsin')
    .optional(),
  departmentId: z.string().uuid().nullable().optional(),
  /** FR-84 uchun kritik: speaker rolini deterministik aniqlash shunga tayanadi. */
  phoneNumbers: z.array(phone).max(10).default([]),
  externalIds: z.record(z.string()).default({}),
});

const patchSeat = createSeat.partial().extend({
  isActive: z.boolean().optional(),
});

const seatParams = z.object({
  businessId: z.string().uuid(),
  seatId: z.string().uuid(),
});

const publicColumns = {
  id: seat.id,
  userId: seat.userId,
  departmentId: seat.departmentId,
  displayName: seat.displayName,
  login: seat.login,
  phoneNumbers: seat.phoneNumbers,
  externalIds: seat.externalIds,
  activation: seat.activation,
  telegramLinked: seat.telegramLinked,
  /** `null` — biznes jadvalidan foydalanadi. */
  workHours: seat.workHours,
  isActive: seat.isActive,
  isOccupied: seat.isOccupied,
  totalConversations: seat.totalConversations,
  avgScore: seat.avgScore,
  lastConversationAt: seat.lastConversationAt,
  createdAt: seat.createdAt,
};

/**
 * Ko'rsatkichlar JONLI hisoblanadi, `seat` jadvalidagi ustunlardan emas.
 *
 * `seat.total_conversations` va `seat.avg_score` ustunlari sxemada bor,
 * lekin ularga **hech qachon hech narsa yozilmagan** — ya'ni interfeys
 * har doim "0 suhbat, ball yo'q" deb ko'rsatardi, holbuki reytingda
 * o'sha sotuvchining haqiqiy ballari turardi. Ikki ekran bir-biriga
 * zid ma'lumot berardi.
 *
 * Denormalizatsiyani to'g'ri qilish (har tahlildan keyin hisoblagichni
 * yangilash) qo'shimcha yozuv va eskirish xavfini keltiradi. MVP hajmida
 * jonli `count`/`avg` millisekundlar — shuning uchun oddiy yo'l tanlandi.
 * Sekinlashsa: indeks, keyin kunlik agregat.
 */
// `${seat.id}` bu yerda ishlatilmaydi: drizzle uni qisqa `"id"` shaklida
// chiqaradi va ichki so'rovdagi `conversation c` bilan to'qnashadi
// ("column reference id is ambiguous"). Shuning uchun to'liq nom.
const SEAT_ID = sql.raw('"seat"."id"');

const jonliKorsatkichlar = {
  totalConversations: sql<number>`(
    select count(*)::int from conversation c where c.seat_id = ${SEAT_ID}
  )`,
  avgScore: sql<number | null>`(
    select round(avg(a.overall_score), 1)::float
    from analysis a
    join conversation c on c.id = a.conversation_id
    where c.seat_id = ${SEAT_ID}
  )`,
  lastConversationAt: sql<string | null>`(
    select max(c.started_at) from conversation c where c.seat_id = ${SEAT_ID}
  )`,
};

/**
 * Boshqarish huquqini tekshiradi.
 *
 * Bo'lim boshlig'i faqat o'z bo'limidagi o'rinlarga tegishi mumkin.
 * Bo'limi ko'rsatilmagan o'rinlarga ham tegolmaydi — aks holda
 * "bo'limsiz" o'rin orqali cheklovni chetlab o'tish mumkin bo'lardi.
 */
function assertSeatScope(req: FastifyRequest, seatDepartmentId: string | null): void {
  const access = req.business!;
  if (hasPermission(access.permissions, 'seat:manage:all')) return;

  if (hasPermission(access.permissions, 'seat:manage:department')) {
    if (access.departmentId && seatDepartmentId === access.departmentId) return;
    throw AppError.forbidden('Faqat o\'z bo\'limingizdagi sotuvchilarni boshqara olasiz');
  }

  throw AppError.forbidden();
}

export function registerSeatRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/businesses/:businessId/seats',
    { preHandler: requireBusiness },
    async (req) => {
      const access = req.business!;
      const canAll = hasPermission(access.permissions, 'seat:manage:all');
      const canDept = hasPermission(access.permissions, 'seat:manage:department');

      // Sotuvchining o'zi ham ro'yxatni ko'radi (reyting uchun), lekin
      // faqat ism va ko'rsatkichlar — login va telefon raqamlarisiz.
      if (!canAll && !canDept) {
        return withTenant(access.businessId, (tx) =>
          tx
            .select({
              id: seat.id,
              displayName: seat.displayName,
              isActive: seat.isActive,
              ...jonliKorsatkichlar,
            })
            .from(seat)
            .where(eq(seat.isActive, true))
            .orderBy(asc(seat.displayName)),
        );
      }

      return withTenant(access.businessId, (tx) => {
        const q = tx.select({ ...publicColumns, ...jonliKorsatkichlar }).from(seat);
        return canAll
          ? q.orderBy(asc(seat.displayName))
          : q
              .where(eq(seat.departmentId, access.departmentId ?? ''))
              .orderBy(asc(seat.displayName));
      });
    },
  );

  app.post(
    '/api/v1/businesses/:businessId/seats',
    { preHandler: requireBusiness },
    async (req, reply) => {
      const body = createSeat.parse(req.body);
      assertSeatScope(req, body.departmentId ?? null);

      const businessId = req.business!.businessId;

      try {
        const [row] = await withTenant(businessId, (tx) =>
          tx
            .insert(seat)
            .values({
              businessId,
              displayName: body.displayName,
              login: body.login ?? null,
              departmentId: body.departmentId ?? null,
              phoneNumbers: body.phoneNumbers,
              externalIds: body.externalIds,
            })
            .returning(publicColumns),
        );
        reply.status(201);
        return row;
      } catch (err) {
        if (isUniqueViolation(err, 'seat_login_uq')) {
          throw AppError.conflict('Bu login allaqachon band');
        }
        if (isForeignKeyViolation(err)) {
          throw AppError.badRequest('Ko\'rsatilgan bo\'lim topilmadi');
        }
        throw err;
      }
    },
  );

  app.patch(
    '/api/v1/businesses/:businessId/seats/:seatId',
    { preHandler: requireBusiness },
    async (req) => {
      const { seatId } = seatParams.parse(req.params);
      const patch = patchSeat.parse(req.body);
      const businessId = req.business!.businessId;

      const [existing] = await withTenant(businessId, (tx) =>
        tx
          .select({ departmentId: seat.departmentId })
          .from(seat)
          .where(eq(seat.id, seatId))
          .limit(1),
      );
      if (!existing) throw AppError.notFound();

      assertSeatScope(req, existing.departmentId);
      // Bo'limni o'zgartirish ham yangi bo'lim doirasida ruxsat talab qiladi,
      // aks holda boshqa bo'limga "ko'chirib" nazoratni qo'lga olish mumkin.
      if (patch.departmentId !== undefined) {
        assertSeatScope(req, patch.departmentId ?? null);
      }

      const [row] = await withTenant(businessId, (tx) =>
        tx
          .update(seat)
          .set({ ...patch, updatedAt: new Date() })
          .where(eq(seat.id, seatId))
          .returning(publicColumns),
      );
      return row;
    },
  );

  /**
   * O'chirish — **yumshoq**. Qator o'chirilmaydi, faqat `isActive = false`.
   *
   * Sabab: o'rin o'chirilsa, unga bog'langan barcha suhbatlar va baholar
   * egasiz qoladi va tarixiy analitika buziladi. Litsenziya hisobi esa
   * `isActive` bo'yicha yuritiladi, shuning uchun to'lov ham to'g'ri bo'ladi.
   */
  app.delete(
    '/api/v1/businesses/:businessId/seats/:seatId',
    { preHandler: requireBusiness },
    async (req) => {
      const { seatId } = seatParams.parse(req.params);
      const businessId = req.business!.businessId;

      const [existing] = await withTenant(businessId, (tx) =>
        tx
          .select({ departmentId: seat.departmentId })
          .from(seat)
          .where(eq(seat.id, seatId))
          .limit(1),
      );
      if (!existing) throw AppError.notFound();
      assertSeatScope(req, existing.departmentId);

      await withTenant(businessId, (tx) =>
        tx
          .update(seat)
          .set({
            isActive: false,
            isOccupied: false,
            userId: null,
            activation: 'disabled',
            updatedAt: new Date(),
          })
          .where(eq(seat.id, seatId)),
      );
      return { ok: true };
    },
  );

  /**
   * FR-04: aktivatsiya havolasi.
   *
   * Token bir martalik va faqat shu javobda ko'rinadi — bazada saqlanadi,
   * lekin boshqa hech qanday endpoint uni qaytarmaydi.
   */
  app.post(
    '/api/v1/businesses/:businessId/seats/:seatId/activation-link',
    { preHandler: requireBusiness },
    async (req) => {
      const { seatId } = seatParams.parse(req.params);
      const businessId = req.business!.businessId;

      const [existing] = await withTenant(businessId, (tx) =>
        tx
          .select({ departmentId: seat.departmentId, isActive: seat.isActive })
          .from(seat)
          .where(eq(seat.id, seatId))
          .limit(1),
      );
      if (!existing) throw AppError.notFound();
      assertSeatScope(req, existing.departmentId);
      if (!existing.isActive) {
        throw AppError.badRequest('O\'chirilgan o\'rin uchun havola berilmaydi');
      }

      // Bazaga faqat xesh yoziladi; ochiq token shu javobda bir marta ko'rinadi.
      // Yangi havola eskisini bekor qiladi — bir o'rinda bitta amaldagi token.
      const token = generateToken();
      const expiresAt = new Date(Date.now() + AKTIVATSIYA_MUDDATI_MS);
      await withTenant(businessId, (tx) =>
        tx
          .update(seat)
          .set({ activationToken: hashToken(token), activationExpiresAt: expiresAt, activation: 'pending', updatedAt: new Date() })
          .where(and(eq(seat.id, seatId), eq(seat.businessId, businessId))),
      );

      return { activationToken: token, expiresAt: expiresAt.toISOString() };
    },
  );

  /**
   * ═════════════════════════════════════════════════════════════════════
   * O'RIN ISH JADVALI — «Menejerlar uchun alohida jadval»
   * ═════════════════════════════════════════════════════════════════════
   *
   * `null` yuborilsa jadval O'CHIRILADI va o'rin biznesnikiga qaytadi.
   * Bu «hammasini biznesnikiga tenglashtirib qo'yish» dan farq qiladi:
   * qaytgan o'rin biznes jadvali o'zgarganda unga ergashadi.
   *
   * Yozish huquqi `business:write` da — jadval hisobot raqamlariga
   * ta'sir qiladi, ya'ni bu menejerni tahrirlash emas, biznes qarori.
   */
  app.get(
    '/api/v1/businesses/:businessId/seats/:seatId/work-hours',
    { preHandler: requireBusiness },
    async (req) => {
      const { seatId } = seatParams.parse(req.params);
      const businessId = req.business!.businessId;
      const [row] = await withTenant(businessId, (tx) =>
        tx
          .select({ workHours: seat.workHours, departmentId: seat.departmentId })
          .from(seat)
          .where(eq(seat.id, seatId))
          .limit(1),
      );
      if (!row) throw AppError.notFound();
      assertSeatScope(req, row.departmentId);
      return { workHours: seatWorkHoursSchema.parse(row.workHours ?? null) };
    },
  );

  app.put(
    '/api/v1/businesses/:businessId/seats/:seatId/work-hours',
    { preHandler: requireBusiness },
    async (req) => {
      const { seatId } = seatParams.parse(req.params);
      const businessId = req.business!.businessId;
      if (!hasPermission(req.business!.permissions, 'business:write')) {
        throw AppError.forbidden();
      }

      const workHours = seatWorkHoursSchema.parse(req.body ?? null);
      if (workHours) {
        if (workHours.endHour <= workHours.startHour) {
          throw AppError.badRequest("Tugash soati boshlanishdan keyin bo'lishi kerak");
        }
        if (workHours.days.length === 0) {
          throw AppError.badRequest('Kamida bitta ish kuni tanlang');
        }
      }

      const [mavjud] = await withTenant(businessId, (tx) =>
        tx
          .select({ departmentId: seat.departmentId })
          .from(seat)
          .where(eq(seat.id, seatId))
          .limit(1),
      );
      if (!mavjud) throw AppError.notFound();
      assertSeatScope(req, mavjud.departmentId);

      await withTenant(businessId, (tx) =>
        tx
          .update(seat)
          .set({ workHours, updatedAt: new Date() })
          .where(and(eq(seat.id, seatId), eq(seat.businessId, businessId))),
      );
      return { workHours };
    },
  );
}
