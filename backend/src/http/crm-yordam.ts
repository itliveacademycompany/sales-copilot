import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { CrmXatosi } from '../crm/xato.js';
import { bitimFiltrSxemasi, type BitimFiltr, type CrmDoira } from '../crm/xizmat.js';
import { AppError } from './errors.js';

/** Ichki CRM marshrutlari uchun umumiy yordamchilar. */

export const BASE = '/api/v1/businesses/:businessId';

/** Ko'rish/yozish doirasi — vazifa ruxsatlaridan (rahbar — hammasi, sotuvchi — o'zi). */
export function doira(req: FastifyRequest): CrmDoira {
  const b = req.business!;
  const p = b.permissions;
  const hammasi = p.includes('task:read:all') || p.includes('analytics:read:all');
  if (!hammasi && !b.seatId) throw AppError.forbidden("CRM dan foydalanish uchun ruxsatingiz yo'q");
  return {
    korish: hammasi ? 'all' : 'own',
    yozish: p.includes('task:manage:all') ? 'all' : 'own',
    seatId: b.seatId,
  };
}

/** Xizmat xatosini HTTP javobiga aylantiradi. */
export async function bajar<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof CrmXatosi) {
      if (e.kod === 'topilmadi') throw AppError.notFound(e.message);
      if (e.kod === 'ziddiyat') throw AppError.conflict(e.message);
      if (e.kod === 'ruxsat') throw AppError.forbidden(e.message);
      throw AppError.badRequest(e.message);
    }
    throw e;
  }
}

export const idParam = z.object({ id: z.string().uuid() });
export const sahifa = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
};

const vergul = (s: unknown) =>
  typeof s === 'string' && s.trim()
    ? s
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean)
    : undefined;

/** Bitimlar filtri querystring'dan: ro'yxatlar vergul bilan (`stages=a,b`). */
export function filtrniOl(q: Record<string, unknown>): BitimFiltr {
  return bitimFiltrSxemasi.parse({
    q: q.q || undefined,
    seat: q.seat || undefined,
    seats: vergul(q.seats),
    stages: vergul(q.stages),
    status: q.status || undefined,
    tags: vergul(q.tags),
    task: q.task || undefined,
    createdFrom: q.createdFrom || undefined,
    createdTo: q.createdTo || undefined,
    closedFrom: q.closedFrom || undefined,
    closedTo: q.closedTo || undefined,
    amountMin: q.amountMin === undefined || q.amountMin === '' ? undefined : q.amountMin,
    amountMax: q.amountMax === undefined || q.amountMax === '' ? undefined : q.amountMax,
    source: q.source || undefined,
    companyId: q.companyId || undefined,
    lostReasonId: q.lostReasonId || undefined,
    trash: q.trash === '1' || q.trash === 'true' ? true : undefined,
  });
}
