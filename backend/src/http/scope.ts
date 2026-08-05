import type { FastifyRequest } from 'fastify';
import { readScope, type Scope } from '../auth/permissions.js';
import { AppError } from './errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KO'LAM DARVOZASI — "hammasi" yoki "faqat o'zimniki"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Nega kerak: dastlab barcha ma'lumot marshrutlari `requirePermission(':all')`
 * bilan yopilgan edi. Bu rahbar uchun to'g'ri ishlardi, lekin **sotuvchi
 * (`manager` roli) tizimga kira olsa ham har bir so'rovda 403 olardi** —
 * ya'ni TZ 3.6 FR-112 dagi "sotuvchining shaxsiy kabineti" amalda
 * qurib bo'lmaydigan holatda edi.
 *
 * Ruxsatlar matritsasida sotuvchi uchun `:own` ruxsatlari allaqachon
 * ta'riflangan (`analytics:read:own`, `conversation:read:own`,
 * `task:read:own`). Yetishmagani — marshrutlarda shu ko'lamni hisobga
 * oladigan darvoza.
 *
 * Qoida oddiy:
 *   `all`   → cheklovsiz
 *   `own`   → faqat foydalanuvchining o'z `seatId` si
 *   `none`  → 404
 *
 * **`department` ataylab `own` kabi ishlaydi.** Bo'lim bo'yicha filtrlash
 * `seat.department_id` ni tekshirishni talab qiladi va u hali hech qayerda
 * qurilmagan. Kengroq huquq berib qo'yishdan ko'ra torroq berish xavfsiz:
 * bo'lim boshlig'i hozircha o'z ma'lumotini ko'radi, begonasini emas.
 */

export interface SeatScope {
  scope: Scope;
  /** `own` bo'lganda — shu seat'dan boshqasiga ruxsat yo'q. */
  ownSeatId: string | null;
}

export function analyticsScope(req: FastifyRequest): SeatScope {
  return resolve(req, 'analytics');
}

export function conversationScope(req: FastifyRequest): SeatScope {
  return resolve(req, 'conversation');
}

function resolve(
  req: FastifyRequest,
  resource: 'conversation' | 'analytics' | 'media',
): SeatScope {
  const b = req.business;
  if (!b) throw new Error('scope: requireBusiness dan keyin ishlatilishi kerak');
  const scope = readScope(b.permissions, resource);
  if (scope === 'none') throw AppError.notFound();
  return { scope, ownSeatId: b.seatId };
}

/**
 * Vazifalar uchun alohida: ular `task:read:*` ruxsatlari bilan boshqariladi
 * va `readScope` faqat conversation/analytics/media ni biladi.
 */
export function taskScope(req: FastifyRequest): SeatScope {
  const b = req.business;
  if (!b) throw new Error('scope: requireBusiness dan keyin ishlatilishi kerak');
  const p = b.permissions;
  if (p.includes('task:read:all')) return { scope: 'all', ownSeatId: b.seatId };
  if (p.includes('task:read:department') || p.includes('task:read:own')) {
    return { scope: 'own', ownSeatId: b.seatId };
  }
  throw AppError.notFound();
}

/**
 * So'ralgan `seatId` ni ko'lam bilan solishtiradi va **haqiqiy filtrni**
 * qaytaradi.
 *
 * `own` ko'lamida begona seat so'ralsa — **404**, 403 emas. Sabab boshqa
 * joylardagi bilan bir xil: 403 "bunday sotuvchi bor" degan ma'lumotni
 * oshkor qilardi.
 *
 * @returns SQL filtriga qo'yiladigan seatId, yoki `undefined` (cheklovsiz).
 */
export function seatFilter(s: SeatScope, requested?: string | null): string | undefined {
  if (s.scope === 'all') return requested ?? undefined;

  // Seat'ga bog'lanmagan foydalanuvchi (masalan rahbar bo'lmagan a'zo)
  // `own` ko'lamida hech narsa ko'ra olmaydi.
  if (!s.ownSeatId) throw AppError.notFound();
  if (requested && requested !== s.ownSeatId) throw AppError.notFound();
  return s.ownSeatId;
}

/** Yagona yozuv uchun: shu qator ko'lamga to'g'ri keladimi. */
export function assertSeatAllowed(s: SeatScope, rowSeatId: string | null): void {
  if (s.scope === 'all') return;
  if (!s.ownSeatId || rowSeatId !== s.ownSeatId) throw AppError.notFound();
}
