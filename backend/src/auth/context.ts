import { and, eq, isNull } from 'drizzle-orm';
import { withoutTenantIsolation } from '../db/index.js';
import { appUser, business, businessMember, seat } from '../db/schema/index.js';
import { permissionsFor, type Permission, type Role } from './permissions.js';
import { keshdanOl, keshgaYoz } from './context-cache.js';

/**
 * Foydalanuvchining biznes a'zoliklarini aniqlash.
 *
 * ⚠ Bu yerda `withoutTenantIsolation` ishlatiladi va bu ataylab.
 *
 * Sabab: "bu foydalanuvchi qaysi bizneslarga tegishli?" degan savol
 * o'z tabiatiga ko'ra **tenantlar ustidan** so'raladi. Tenant kontekstini
 * o'rnatish uchun avval qaysi tenant ekanini bilish kerak — ya'ni
 * tovuq va tuxum. Auth yuklanishi shu tugunni yechadigan yagona joy.
 *
 * Xavfsizlik cheklovi: bu yerdagi har bir so'rov **aniq `userId` bo'yicha**
 * filtrlanadi. Bu fayldan tashqarida hech qanday tenantlararo so'rov yo'q.
 */

export interface BusinessAccess {
  businessId: string;
  slug: string;
  name: string;
  role: Role;
  /** Sotuvchi bo'lsa — uning o'rni. Rahbarlar uchun null. */
  seatId: string | null;
  departmentId: string | null;
  permissions: readonly Permission[];
  /** FR-17: onboarding sehrgari qaysi qadamda — frontend shuni ko'rib yo'naltiradi. */
  onboardingStep: string;
}

export interface AuthContext {
  user: {
    id: string;
    email: string | null;
    login: string | null;
    displayName: string;
    avatarUrl: string | null;
    locale: string;
    systemRole: string;
  };
  businesses: BusinessAccess[];
}

/**
 * Auth konteksti — keshdan yoki bazadan.
 *
 * Kesh HAR SO'ROVDA chaqiriladigan uchta so'rovni olib tashlaydi
 * (o'lchandi: 1.27 ms mediana). Eskirish chegarasi va bekor qilish
 * qoidalari `context-cache.ts` da tushuntirilgan.
 */
export async function loadAuthContext(userId: string): Promise<AuthContext | null> {
  const keshdan = keshdanOl(userId);
  if (keshdan !== undefined) return keshdan;

  const ctx = await bazadanYukla(userId);
  keshgaYoz(userId, ctx);
  return ctx;
}

/** Keshsiz, to'g'ridan-to'g'ri bazadan. */
async function bazadanYukla(userId: string): Promise<AuthContext | null> {
  return withoutTenantIsolation(
    'auth yuklanishi: foydalanuvchining biznes a\'zoliklari tenantlar ustidan so\'raladi',
    async (tx) => {
      const [user] = await tx
        .select({
          id: appUser.id,
          email: appUser.email,
          login: appUser.login,
          displayName: appUser.displayName,
          avatarUrl: appUser.avatarUrl,
          locale: appUser.locale,
          systemRole: appUser.systemRole,
        })
        .from(appUser)
        .where(and(eq(appUser.id, userId), isNull(appUser.deletedAt)))
        .limit(1);

      if (!user) return null;

      // ── Rahbarlik a'zoliklari ──
      const memberships = await tx
        .select({
          businessId: business.id,
          slug: business.slug,
          name: business.name,
          role: businessMember.role,
          departmentId: businessMember.departmentId,
          onboardingStep: business.onboardingStep,
        })
        .from(businessMember)
        .innerJoin(business, eq(business.id, businessMember.businessId))
        .where(
          and(
            eq(businessMember.userId, userId),
            eq(businessMember.isActive, true),
            isNull(business.deletedAt),
          ),
        );

      // ── Sotuvchi o'rinlari ──
      const seats = await tx
        .select({
          businessId: business.id,
          slug: business.slug,
          name: business.name,
          seatId: seat.id,
          departmentId: seat.departmentId,
          onboardingStep: business.onboardingStep,
        })
        .from(seat)
        .innerJoin(business, eq(business.id, seat.businessId))
        .where(
          and(eq(seat.userId, userId), eq(seat.isActive, true), isNull(business.deletedAt)),
        );

      const byBusiness = new Map<string, BusinessAccess>();

      for (const m of memberships) {
        byBusiness.set(m.businessId, {
          businessId: m.businessId,
          slug: m.slug,
          name: m.name,
          role: m.role as Role,
          seatId: null,
          departmentId: m.departmentId,
          permissions: permissionsFor(m.role as Role),
          onboardingStep: m.onboardingStep,
        });
      }

      for (const s of seats) {
        const existing = byBusiness.get(s.businessId);
        if (existing) {
          // Bir odam ham rahbar, ham sotuvchi bo'lishi mumkin (kichik
          // jamoalarda ega o'zi ham qo'ng'iroq qiladi). Rahbarlik roli
          // kuchliroq, shuning uchun uni saqlaymiz va faqat seat'ni
          // biriktiramiz — shunda "mening qo'ng'iroqlarim" ham ishlaydi.
          existing.seatId = s.seatId;
          continue;
        }
        byBusiness.set(s.businessId, {
          businessId: s.businessId,
          slug: s.slug,
          name: s.name,
          role: 'manager',
          seatId: s.seatId,
          departmentId: s.departmentId,
          permissions: permissionsFor('manager'),
          onboardingStep: s.onboardingStep,
        });
      }

      return { user, businesses: [...byBusiness.values()] };
    },
  );
}
