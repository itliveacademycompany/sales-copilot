import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import { SHABLONLAR } from '../../crm/shablon.js';
import {
  bitimKartochkasi,
  bitimKirish,
  bitimKochirish,
  bitimlarRoyxati,
  bitimniKochir,
  bitimniOchir,
  bitimniYangila,
  bitimVazifasi,
  bitimYangilash,
  bitimYarat,
  bosqichlarKirish,
  bosqichlarniSaqla,
  crmVazifalari,
  crmniYoq,
  CrmXatosi,
  izohQosh,
  kanban,
  kontaktKartochkasi,
  kontaktKirish,
  kontaktlarRoyxati,
  kontaktniYangila,
  kontaktYarat,
  maydonKirish,
  maydonniYangila,
  maydonYarat,
  tuzilma,
  voronkaniYangila,
  voronkaYarat,
  type CrmDoira,
} from '../../crm/xizmat.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — HTTP marshrutlari
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Prefikslar tashqi CRM ulanishi (`/crm/:kind`) bilan to'qnashmaydi:
 *   /crm-app      — holat, tuzilma, yoqish
 *   /pipelines    — voronka va bosqich sozlamalari
 *   /crm-fields   — qo'shimcha maydonlar
 *   /deals        — bitimlar (Kanban, jadval, kartochka)
 *   /contacts     — kontaktlar
 *
 * Ko'rish/yozish doirasi vazifa ruxsatlaridan olinadi (rahbar — hammasi,
 * sotuvchi — faqat mas'uli o'zi bo'lgan bitimlar). Sozlamalar — `business:write`.
 */

const BASE = '/api/v1/businesses/:businessId';

function doira(req: FastifyRequest): CrmDoira {
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
async function bajar<T>(fn: () => Promise<T>): Promise<T> {
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

const idParam = z.object({ id: z.string().uuid() });
const sahifa = {
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).max(100_000).default(0),
};

export function registerCrmAppRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireBusiness] };
  const sozlama = { preHandler: [requireBusiness, requirePermission('business:write')] };

  // ─── Holat va tuzilma ──────────────────────────────────────────────────────

  app.get(`${BASE}/crm-app`, guard, async (req) => {
    const d = doira(req);
    const t = await withTenant(req.business!.businessId, (tx) => tuzilma(tx));
    return {
      enabled: t.pipelines.length > 0,
      canConfigure: req.business!.permissions.includes('business:write'),
      scope: d.korish,
      canManageAll: d.yozish === 'all',
      seatId: d.seatId,
      templates: Object.values(SHABLONLAR).map((s) => ({
        kod: s.kod,
        nom: s.nom,
        tavsif: s.tavsif,
        pipelines: s.voronkalar.length,
        fields: s.maydonlar.length,
      })),
      ...t,
    };
  });

  app.post(`${BASE}/crm-app/enable`, sozlama, async (req) => {
    const { template } = z.object({ template: z.enum(['bosh', 'talim']) }).parse(req.body);
    const businessId = req.business!.businessId;
    await bajar(() => withTenant(businessId, (tx) => crmniYoq(tx, businessId, template)));
    return { ok: true };
  });

  // ─── Voronka va bosqichlar ─────────────────────────────────────────────────

  app.post(`${BASE}/pipelines`, sozlama, async (req) => {
    const { name } = z.object({ name: z.string().trim().min(1, 'Voronka nomini kiriting').max(100) }).parse(req.body);
    const businessId = req.business!.businessId;
    const id = await withTenant(businessId, (tx) => voronkaYarat(tx, businessId, name));
    return { id };
  });

  app.patch(`${BASE}/pipelines/:id`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = z
      .object({ name: z.string().trim().min(1).max(100).optional(), archived: z.boolean().optional() })
      .parse(req.body);
    await bajar(() => withTenant(req.business!.businessId, (tx) => voronkaniYangila(tx, id, k)));
    return { ok: true };
  });

  app.put(`${BASE}/pipelines/:id/stages`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    const { stages } = z.object({ stages: bosqichlarKirish }).parse(req.body);
    const businessId = req.business!.businessId;
    await bajar(() =>
      withTenant(businessId, (tx) => bosqichlarniSaqla(tx, { businessId, pipelineId: id, bosqichlar: stages })),
    );
    return { ok: true };
  });

  // ─── Maydonlar ─────────────────────────────────────────────────────────────

  app.post(`${BASE}/crm-fields`, sozlama, async (req) => {
    const k = maydonKirish.parse(req.body);
    const businessId = req.business!.businessId;
    const id = await withTenant(businessId, (tx) => maydonYarat(tx, businessId, k));
    return { id };
  });

  app.patch(`${BASE}/crm-fields/:id`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = maydonKirish
      .omit({ type: true })
      .partial()
      .extend({ archived: z.boolean().optional() })
      .parse(req.body);
    await bajar(() => withTenant(req.business!.businessId, (tx) => maydonniYangila(tx, id, k)));
    return { ok: true };
  });

  // ─── Bitimlar ──────────────────────────────────────────────────────────────

  const filtrQuery = z.object({
    q: z.string().trim().max(100).optional(),
    seat: z.string().uuid().optional(),
  });

  app.get(`${BASE}/deals/board`, guard, async (req) => {
    const q = filtrQuery.extend({ pipeline: z.string().uuid() }).parse(req.query);
    const d = doira(req);
    const stages = await withTenant(req.business!.businessId, (tx) =>
      kanban(tx, { pipelineId: q.pipeline, doira: d, filtr: { q: q.q, seat: q.seat } }),
    );
    return { stages };
  });

  app.get(`${BASE}/deals`, guard, async (req) => {
    const q = filtrQuery
      .extend({ pipeline: z.string().uuid().optional(), stage: z.string().uuid().optional(), ...sahifa })
      .parse(req.query);
    const d = doira(req);
    return withTenant(req.business!.businessId, (tx) =>
      bitimlarRoyxati(tx, {
        pipelineId: q.pipeline,
        stageId: q.stage,
        doira: d,
        filtr: { q: q.q, seat: q.seat },
        limit: q.limit,
        offset: q.offset,
      }),
    );
  });

  app.post(`${BASE}/deals`, guard, async (req) => {
    const kirish = bitimKirish.parse(req.body);
    const d = doira(req);
    const businessId = req.business!.businessId;
    const id = await bajar(() =>
      withTenant(businessId, (tx) => bitimYarat(tx, { businessId, userId: req.auth!.user.id, doira: d, kirish })),
    );
    return { id };
  });

  app.get(`${BASE}/deals/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const d = doira(req);
    return bajar(() => withTenant(req.business!.businessId, (tx) => bitimKartochkasi(tx, { id, doira: d })));
  });

  app.patch(`${BASE}/deals/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const kirish = bitimYangilash.parse(req.body);
    const d = doira(req);
    const version = await bajar(() =>
      withTenant(req.business!.businessId, (tx) =>
        bitimniYangila(tx, { id, userId: req.auth!.user.id, doira: d, kirish }),
      ),
    );
    return { version };
  });

  app.post(`${BASE}/deals/:id/move`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const kirish = bitimKochirish.parse(req.body);
    const d = doira(req);
    await bajar(() =>
      withTenant(req.business!.businessId, (tx) => bitimniKochir(tx, { id, userId: req.auth!.user.id, doira: d, kirish })),
    );
    return { ok: true };
  });

  app.delete(`${BASE}/deals/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const d = doira(req);
    await bajar(() => withTenant(req.business!.businessId, (tx) => bitimniOchir(tx, { id, doira: d })));
    return { ok: true };
  });

  app.post(`${BASE}/deals/:id/notes`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const { text } = z.object({ text: z.string().trim().min(1, 'Izoh matnini kiriting').max(5000) }).parse(req.body);
    const d = doira(req);
    await bajar(() =>
      withTenant(req.business!.businessId, (tx) => izohQosh(tx, { id, userId: req.auth!.user.id, doira: d, matn: text })),
    );
    return { ok: true };
  });

  app.post(`${BASE}/deals/:id/tasks`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = z
      .object({
        title: z.string().trim().min(1, 'Vazifa matnini kiriting').max(300),
        description: z.string().trim().max(2000).nullable().optional(),
        dueAt: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .parse(req.body);
    const d = doira(req);
    const taskId = await bajar(() =>
      withTenant(req.business!.businessId, (tx) =>
        bitimVazifasi(tx, {
          id,
          userId: req.auth!.user.id,
          doira: d,
          title: k.title,
          description: k.description ?? null,
          dueAt: k.dueAt ? new Date(k.dueAt) : null,
        }),
      ),
    );
    return { id: taskId };
  });

  app.get(`${BASE}/crm-app/tasks`, guard, async (req) => {
    const q = z.object({ status: z.enum(['open', 'done']).default('open'), ...sahifa }).parse(req.query);
    const d = doira(req);
    return withTenant(req.business!.businessId, (tx) =>
      crmVazifalari(tx, { doira: d, holat: q.status, limit: q.limit, offset: q.offset }),
    );
  });

  // ─── Kontaktlar ────────────────────────────────────────────────────────────

  app.get(`${BASE}/contacts`, guard, async (req) => {
    const q = z.object({ q: z.string().trim().max(100).optional(), ...sahifa }).parse(req.query);
    const d = doira(req);
    return withTenant(req.business!.businessId, (tx) =>
      kontaktlarRoyxati(tx, { q: q.q, limit: q.limit, offset: q.offset, doira: d }),
    );
  });

  app.post(`${BASE}/contacts`, guard, async (req) => {
    const k = kontaktKirish.parse(req.body);
    doira(req);
    const businessId = req.business!.businessId;
    const id = await bajar(() => withTenant(businessId, (tx) => kontaktYarat(tx, businessId, k)));
    return { id };
  });

  app.get(`${BASE}/contacts/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const d = doira(req);
    return bajar(() => withTenant(req.business!.businessId, (tx) => kontaktKartochkasi(tx, { id, doira: d })));
  });

  app.patch(`${BASE}/contacts/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = kontaktKirish.partial().parse(req.body);
    const d = doira(req);
    const businessId = req.business!.businessId;
    await bajar(() =>
      withTenant(businessId, async (tx) => {
        // Sotuvchi faqat o'zi ko'ra oladigan kontaktni tahrirlaydi
        if (d.korish === 'own') await kontaktKartochkasi(tx, { id, doira: d });
        await kontaktniYangila(tx, id, k);
      }),
    );
    return { ok: true };
  });
}
