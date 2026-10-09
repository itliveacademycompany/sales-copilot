import { and, eq, isNull } from 'drizzle-orm';
import { withoutTenantIsolation } from '../db/index.js';
import { appUser, business, seat } from '../db/schema/index.js';
import { hashPassword } from './password.js';
import { hashToken } from './tokens.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MENEJER AKTIVATSIYASI — FR-04
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Rahbar menejer o'rnini yaratadi va «Aktivatsiya havolasi»ni oladi
 * (`POST /seats/:id/activation-link`). Menejer havolani ochib parol
 * o'rnatadi — shu paytda unga hisob (`app_user`) yaratiladi va o'rin
 * unga biriktiriladi. Keyin u login va parol bilan kiradi.
 *
 * Token tenantlardan TASHQARIDA qidiriladi: menejer hali hech qaysi
 * biznesga kirmagan, uning yagona "kaliti" — havoladagi token. Shuning
 * uchun bu yerdagi har bir so'rov xesh bo'yicha bitta qatorga toraytiriladi.
 */

export type AktivatsiyaXato = 'invalid' | 'expired' | 'disabled' | 'login_required' | 'login_taken';

export interface AktivatsiyaMalumoti {
  displayName: string;
  businessName: string;
  /** Rahbar bergan login; `null` bo'lsa menejer o'zi tanlaydi. */
  login: string | null;
  expiresAt: string | null;
}

const LOGIN_RE = /^[a-z0-9._-]{3,40}$/;

async function topish(token: string) {
  const hash = hashToken(token);
  const [row] = await withoutTenantIsolation('aktivatsiya: o\'rinni token xeshi bo\'yicha topish', (tx) =>
    tx
      .select({
        id: seat.id,
        businessId: seat.businessId,
        userId: seat.userId,
        login: seat.login,
        displayName: seat.displayName,
        isActive: seat.isActive,
        expiresAt: seat.activationExpiresAt,
        businessName: business.name,
        businessDeletedAt: business.deletedAt,
      })
      .from(seat)
      .innerJoin(business, eq(business.id, seat.businessId))
      .where(eq(seat.activationToken, hash))
      .limit(1),
  );
  return { row, hash };
}

function tekshir(row: Awaited<ReturnType<typeof topish>>['row']): AktivatsiyaXato | null {
  if (!row || row.businessDeletedAt) return 'invalid';
  if (!row.isActive) return 'disabled';
  if (row.expiresAt && row.expiresAt.getTime() < Date.now()) return 'expired';
  return null;
}

/** Sahifa ochilganda: kimning havolasi, login oldindan berilganmi. Hech narsani o'zgartirmaydi. */
export async function aktivatsiyaMalumoti(
  token: string,
): Promise<{ ok: true; info: AktivatsiyaMalumoti } | { ok: false; reason: AktivatsiyaXato }> {
  const { row } = await topish(token);
  const xato = tekshir(row);
  if (xato || !row) return { ok: false, reason: xato ?? 'invalid' };
  return {
    ok: true,
    info: {
      displayName: row.displayName,
      businessName: row.businessName,
      login: row.login,
      expiresAt: row.expiresAt?.toISOString() ?? null,
    },
  };
}

/**
 * Parol o'rnatib, hisobni faollashtiradi.
 *
 * Token bir martalik: yakuniy UPDATE `activation_token = xesh` sharti bilan
 * bajariladi — ikki parallel so'rovdan faqat bittasi o'tadi, ikkinchisi
 * `invalid` oladi (parol tiklashdagi bilan bir xil himoya).
 */
export async function aktivlashtir(params: {
  token: string;
  password: string;
  login?: string;
}): Promise<{ ok: true; userId: string } | { ok: false; reason: AktivatsiyaXato }> {
  const { row, hash } = await topish(params.token);
  const xato = tekshir(row);
  if (xato || !row) return { ok: false, reason: xato ?? 'invalid' };

  // Rahbar bergan login ustun — u hisobotlarda va kirishda shu nom bilan tanilgan.
  const login = row.login ?? params.login?.trim().toLowerCase() ?? null;
  if (!login || !LOGIN_RE.test(login)) return { ok: false, reason: 'login_required' };

  const passwordHash = await hashPassword(params.password);

  return withoutTenantIsolation('aktivatsiya: hisob yaratish va o\'rinni biriktirish', async (tx) => {
    let userId = row.userId;

    if (userId) {
      // O'rinda allaqachon hisob bor (masalan, qayta aktivatsiya) — faqat parol.
      await tx.update(appUser).set({ passwordHash, updatedAt: new Date() }).where(eq(appUser.id, userId));
    } else {
      // `app_user.login` butun tizim bo'yicha yagona — boshqa biznesdagi
      // menejer shu loginni olgan bo'lishi mumkin.
      const [band] = await tx
        .select({ id: appUser.id })
        .from(appUser)
        .where(and(eq(appUser.login, login), isNull(appUser.deletedAt)))
        .limit(1);
      if (band) return { ok: false, reason: 'login_taken' } as const;

      const [yangi] = await tx
        .insert(appUser)
        .values({ login, displayName: row.displayName, passwordHash, systemRole: 'user' })
        .returning({ id: appUser.id });
      userId = yangi!.id;
    }

    const biriktirildi = await tx
      .update(seat)
      .set({
        userId,
        login,
        activation: 'active',
        activationToken: null,
        activationExpiresAt: null,
        updatedAt: new Date(),
      })
      .where(and(eq(seat.id, row.id), eq(seat.activationToken, hash)))
      .returning({ id: seat.id });

    if (biriktirildi.length === 0) {
      // Parallel so'rov oldinroq ishlatib bo'ldi — yaratilgan hisob tranzaksiya
      // bilan birga bekor bo'lishi uchun xato tashlaymiz.
      throw new AktivatsiyaPoygasi();
    }
    return { ok: true, userId } as const;
  }).catch((e: unknown) => {
    if (e instanceof AktivatsiyaPoygasi) return { ok: false, reason: 'invalid' } as const;
    throw e;
  });
}

class AktivatsiyaPoygasi extends Error {}
