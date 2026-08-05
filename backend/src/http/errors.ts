import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { isProd } from '../config.js';

/**
 * Xatolar RFC 7807 (Problem Details) formatida qaytadi.
 *
 * Nega standart format: integratsiya yozadigan odam (va bizning frontend)
 * har endpoint uchun alohida xato shaklini o'rganmasligi kerak.
 */
export interface Problem {
  type: string;
  title: string;
  status: number;
  detail?: string;
  /** Maydon bo'yicha validatsiya xatolari. */
  errors?: Record<string, string[]>;
  /** Log bilan bog'lash uchun — foydalanuvchi support'ga shu kodni aytadi. */
  traceId?: string;
}

export class AppError extends Error {
  readonly status: number;
  readonly type: string;
  readonly detail?: string;

  constructor(status: number, type: string, message: string, detail?: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.type = type;
    this.detail = detail;
  }

  static badRequest(message: string, detail?: string): AppError {
    return new AppError(400, 'bad-request', message, detail);
  }

  static unauthorized(message = 'Kirish talab qilinadi'): AppError {
    return new AppError(401, 'unauthorized', message);
  }

  /** Ruxsat yo'q. Sabab ochilmaydi — mavjudlikni oshkor qilmaslik uchun. */
  static forbidden(message = 'Bu amal uchun ruxsatingiz yo\'q'): AppError {
    return new AppError(403, 'forbidden', message);
  }

  static notFound(message = 'Topilmadi'): AppError {
    return new AppError(404, 'not-found', message);
  }

  static conflict(message: string, detail?: string): AppError {
    return new AppError(409, 'conflict', message, detail);
  }

  static tooMany(message = 'Juda ko\'p so\'rov. Biroz kuting.'): AppError {
    return new AppError(429, 'too-many-requests', message);
  }

  /** FR-156: obuna degraded holatda — yangi tahlil to'xtatilgan. */
  static paymentRequired(message: string, detail?: string): AppError {
    return new AppError(402, 'payment-required', message, detail);
  }
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((req: FastifyRequest, reply: FastifyReply) => {
    reply.status(404).type('application/problem+json').send({
      type: 'about:blank#not-found',
      title: 'Bunday manzil yo\'q',
      status: 404,
      detail: `${req.method} ${req.url}`,
    } satisfies Problem);
  });

  app.setErrorHandler((err, req, reply) => {
    const traceId = req.id;

    // ── Zod validatsiyasi ──
    if (err instanceof ZodError) {
      const errors: Record<string, string[]> = {};
      for (const issue of err.issues) {
        const key = issue.path.join('.') || '_';
        (errors[key] ??= []).push(issue.message);
      }
      req.log.info({ errors }, 'validatsiya xatosi');
      reply.status(422).type('application/problem+json').send({
        type: 'about:blank#validation',
        title: 'Kiritilgan ma\'lumot noto\'g\'ri',
        status: 422,
        errors,
        traceId,
      } satisfies Problem);
      return;
    }

    // ── Bizning xatolarimiz ──
    if (err instanceof AppError) {
      req.log.info({ err: err.message, type: err.type }, 'ilova xatosi');
      reply.status(err.status).type('application/problem+json').send({
        type: `about:blank#${err.type}`,
        title: err.message,
        status: err.status,
        detail: err.detail,
        traceId,
      } satisfies Problem);
      return;
    }

    // ── Fastify o'zining xatolari (rate limit, payload hajmi...) ──
    const known = err as { statusCode?: number; message?: string };
    const status = known.statusCode ?? 500;
    if (status < 500) {
      reply.status(status).type('application/problem+json').send({
        type: 'about:blank#request-error',
        title: known.message ?? 'So\'rov qabul qilinmadi',
        status,
        traceId,
      } satisfies Problem);
      return;
    }

    // ── Kutilmagan xato ──
    // Ichki tafsilotlar mijozga chiqmaydi (ular tizim haqida ma'lumot beradi),
    // lekin logda to'liq saqlanadi va traceId orqali topiladi.
    req.log.error({ err }, 'kutilmagan xato');
    reply.status(500).type('application/problem+json').send({
      type: 'about:blank#internal',
      title: 'Serverda xatolik yuz berdi',
      status: 500,
      detail: isProd ? undefined : known.message,
      traceId,
    } satisfies Problem);
  });
}
