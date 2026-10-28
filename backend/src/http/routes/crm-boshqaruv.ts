import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import { avtomatikaniUygot, ijroJurnali, qoidaKirish, qoidalar, qoidaniOchir, qoidaniYangila, qoidaYarat } from '../../crm/avtomatika.js';
import {
  davrSxemasi,
  hodisalarJurnali,
  boshSahifa,
  ishStoli,
  jurnalSxemasi,
  maqsadFakti,
  maqsadKirish,
  maqsadniSaqla,
  voronkaHisoboti,
  xodimlarHisoboti,
} from '../../crm/hisobot.js';
import { tovarKirish, tovarlar, tovarniYangila, tovarYarat } from '../../crm/katalog.js';
import {
  formaKirish,
  formalar,
  formaniOchir,
  formaniYangila,
  formaniYubor,
  formaYarat,
  murojaatlar,
  murojaatniQabul,
  murojaatniRad,
  murojaatQosh,
  ochiqForma,
  qabulSxemasi,
  qoldaSxemasi,
  yuborishSxemasi,
} from '../../crm/qabul.js';
import {
  filtrniOchir,
  filtrniSaqla,
  radSabablari,
  radSababiniSaqla,
  saqlanganFiltrlar,
  sozlamaniOl,
  sozlamaniSaqla,
  sozlamaYangilash,
} from '../../crm/sozlama.js';
import { vaqtZonasiniOrnat } from '../../crm/xizmat.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';
import { bajar, BASE, doira, idParam, sahifa, yozishDoirasi } from '../crm-yordam.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — boshqaruv marshrutlari
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   /crm-app/settings, /crm-app/loss-reasons  — sozlamalar (rahbar)
 *   /crm-app/inbox                            — "Saralanmagan" murojaatlar
 *   /crm-app/forms                            — veb-formalar (rahbar)
 *   /crm-app/automations                      — avtomatika qoidalari (rahbar)
 *   /crm-app/reports/*                        — ish stoli va analitika
 *   /crm-app/goals                            — oylik reja
 *   /crm-app/products                         — tovar katalogi
 *   /api/v1/public/forms/:slug                — ochiq forma (kirishsiz)
 */

export function registerCrmBoshqaruvRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireBusiness] };
  const sozlama = { preHandler: [requireBusiness, requirePermission('business:write')] };

  // ─── Sozlamalar ────────────────────────────────────────────────────────────

  app.get(`${BASE}/crm-app/settings`, guard, async (req) => {
    doira(req);
    return withTenant(req.business!.businessId, (tx) => sozlamaniOl(tx));
  });

  app.patch(`${BASE}/crm-app/settings`, sozlama, async (req) => {
    const k = sozlamaYangilash.parse(req.body);
    const businessId = req.business!.businessId;
    return bajar(() => withTenant(businessId, (tx) => sozlamaniSaqla(tx, businessId, k)));
  });

  app.get(`${BASE}/crm-app/loss-reasons`, guard, async (req) => {
    doira(req);
    const { all } = z.object({ all: z.string().optional() }).parse(req.query);
    return { items: await withTenant(req.business!.businessId, (tx) => radSabablari(tx, all === '1')) };
  });

  app.post(`${BASE}/crm-app/loss-reasons`, sozlama, async (req) => {
    const k = z.object({ name: z.string().trim().min(1, 'Sabab nomini kiriting').max(100) }).parse(req.body);
    const businessId = req.business!.businessId;
    const id = await bajar(() => withTenant(businessId, (tx) => radSababiniSaqla(tx, businessId, { name: k.name })));
    return { id };
  });

  app.patch(`${BASE}/crm-app/loss-reasons/:id`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = z
      .object({ name: z.string().trim().min(1).max(100).optional(), archived: z.boolean().optional(), sort: z.number().int().min(0).max(1000).optional() })
      .parse(req.body);
    const businessId = req.business!.businessId;
    await bajar(() => withTenant(businessId, (tx) => radSababiniSaqla(tx, businessId, { id, ...k })));
    return { ok: true };
  });

  // ─── Saqlangan filtrlar (har foydalanuvchiniki) ────────────────────────────

  app.get(`${BASE}/crm-app/saved-filters`, guard, async (req) => {
    doira(req);
    return { items: await withTenant(req.business!.businessId, (tx) => saqlanganFiltrlar(tx, req.auth!.user.id)) };
  });

  app.post(`${BASE}/crm-app/saved-filters`, guard, async (req) => {
    doira(req);
    const k = z.object({ name: z.string().trim().min(1, 'Filtr nomini kiriting').max(60), filter: z.record(z.string(), z.unknown()) }).parse(req.body);
    if (JSON.stringify(k.filter).length > 4000) throw AppError.badRequest('Filtr juda katta');
    const businessId = req.business!.businessId;
    const id = await bajar(() => withTenant(businessId, (tx) => filtrniSaqla(tx, { businessId, userId: req.auth!.user.id, name: k.name, filter: k.filter })));
    return { id };
  });

  app.delete(`${BASE}/crm-app/saved-filters/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    await withTenant(req.business!.businessId, (tx) => filtrniOchir(tx, { id, userId: req.auth!.user.id }));
    return { ok: true };
  });

  // ─── Saralanmagan murojaatlar (LEAD-04) ────────────────────────────────────

  app.get(`${BASE}/crm-app/inbox`, guard, async (req) => {
    doira(req);
    const q = z.object({ status: z.enum(['pending', 'accepted', 'rejected']).default('pending'), ...sahifa }).parse(req.query);
    return withTenant(req.business!.businessId, (tx) => murojaatlar(tx, q));
  });

  app.post(`${BASE}/crm-app/inbox`, guard, async (req) => {
    yozishDoirasi(req);
    const k = qoldaSxemasi.parse(req.body);
    const businessId = req.business!.businessId;
    const id = await bajar(() => withTenant(businessId, (tx) => murojaatQosh(tx, businessId, k)));
    return { id };
  });

  app.post(`${BASE}/crm-app/inbox/:id/accept`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = qabulSxemasi.parse(req.body ?? {});
    const d = yozishDoirasi(req);
    const businessId = req.business!.businessId;
    const r = await bajar(() =>
      withTenant(businessId, (tx) => murojaatniQabul(tx, { id, businessId, userId: req.auth!.user.id, doira: d, kirish: k })),
    );
    avtomatikaniUygot(businessId, r.dealId);
    return r;
  });

  app.post(`${BASE}/crm-app/inbox/:id/reject`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    yozishDoirasi(req);
    await bajar(() => withTenant(req.business!.businessId, (tx) => murojaatniRad(tx, { id, userId: req.auth!.user.id })));
    return { ok: true };
  });

  // ─── Veb-formalar (FORM-*) ─────────────────────────────────────────────────

  app.get(`${BASE}/crm-app/forms`, sozlama, async (req) => {
    return { items: await withTenant(req.business!.businessId, (tx) => formalar(tx)) };
  });

  app.post(`${BASE}/crm-app/forms`, sozlama, async (req) => {
    const k = formaKirish.parse(req.body);
    const businessId = req.business!.businessId;
    return bajar(() => withTenant(businessId, (tx) => formaYarat(tx, businessId, k)));
  });

  app.patch(`${BASE}/crm-app/forms/:id`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = formaKirish.partial().parse(req.body);
    await bajar(() => withTenant(req.business!.businessId, (tx) => formaniYangila(tx, id, k)));
    return { ok: true };
  });

  app.delete(`${BASE}/crm-app/forms/:id`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    await bajar(() => withTenant(req.business!.businessId, (tx) => formaniOchir(tx, id)));
    return { ok: true };
  });

  // Ochiq forma — kirishsiz; bot va spamdan: so'rov chegarasi + tuzoq maydon + idempotentlik
  const slugParam = z.object({ slug: z.string().regex(/^[a-z0-9]{4,40}$/) });

  app.get('/api/v1/public/forms/:slug', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req) => {
    const { slug } = slugParam.parse(req.params);
    const f = await ochiqForma(slug);
    if (!f) throw AppError.notFound('Forma topilmadi yoki o‘chirilgan');
    return f;
  });

  app.post('/api/v1/public/forms/:slug/submit', { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { slug } = slugParam.parse(req.params);
    const k = yuborishSxemasi.parse(req.body);
    const r = await bajar(() => formaniYubor(slug, k));
    return { ok: true, thankYou: r.thankYou };
  });

  // ─── Avtomatika (AUTO-*) ───────────────────────────────────────────────────

  app.get(`${BASE}/crm-app/automations`, sozlama, async (req) => {
    return { items: await withTenant(req.business!.businessId, (tx) => qoidalar(tx)) };
  });

  app.post(`${BASE}/crm-app/automations`, sozlama, async (req) => {
    const k = qoidaKirish.parse(req.body);
    const businessId = req.business!.businessId;
    const id = await bajar(() => withTenant(businessId, (tx) => qoidaYarat(tx, businessId, k)));
    return { id };
  });

  app.put(`${BASE}/crm-app/automations/:id`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = qoidaKirish.parse(req.body);
    await bajar(() => withTenant(req.business!.businessId, (tx) => qoidaniYangila(tx, id, k)));
    return { ok: true };
  });

  app.delete(`${BASE}/crm-app/automations/:id`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    await bajar(() => withTenant(req.business!.businessId, (tx) => qoidaniOchir(tx, id)));
    return { ok: true };
  });

  app.get(`${BASE}/crm-app/automations/log`, sozlama, async (req) => {
    const { automation } = z.object({ automation: z.string().uuid().optional() }).parse(req.query);
    return { items: await withTenant(req.business!.businessId, (tx) => ijroJurnali(tx, automation)) };
  });

  // ─── Ish stoli va analitika (DASH, RPT) ────────────────────────────────────

  const davrniOl = (q: unknown) => {
    const r = q as Record<string, unknown>;
    return davrSxemasi.parse({ ...r, pipelineId: r.pipelineId || undefined, seat: r.seat || undefined });
  };

  app.get(`${BASE}/crm-app/reports/dashboard`, guard, async (req) => {
    const davr = davrniOl(req.query);
    const d = doira(req);
    const businessId = req.business!.businessId;
    return withTenant(businessId, async (tx) => {
      await vaqtZonasiniOrnat(tx, businessId);
      return ishStoli(tx, { doira: d, davr });
    });
  });

  // Bosh sahifaning Metasell vidjetlari (uchrashuvlar, vazifalar, qo'ng'iroqlar, lid almashinuvi)
  app.get(`${BASE}/crm-app/reports/home`, guard, async (req) => {
    const davr = davrniOl(req.query);
    const d = doira(req);
    const businessId = req.business!.businessId;
    return withTenant(businessId, async (tx) => {
      await vaqtZonasiniOrnat(tx, businessId);
      return boshSahifa(tx, { doira: d, davr });
    });
  });

  app.get(`${BASE}/crm-app/reports/funnel`, guard, async (req) => {
    const davr = davrniOl(req.query);
    const d = doira(req);
    const businessId = req.business!.businessId;
    return bajar(() =>
      withTenant(businessId, async (tx) => {
        await vaqtZonasiniOrnat(tx, businessId);
        return voronkaHisoboti(tx, { doira: d, davr });
      }),
    );
  });

  app.get(`${BASE}/crm-app/reports/managers`, guard, async (req) => {
    const davr = davrniOl(req.query);
    const d = doira(req);
    return { items: await withTenant(req.business!.businessId, (tx) => xodimlarHisoboti(tx, { doira: d, davr })) };
  });

  app.get(`${BASE}/crm-app/reports/events`, guard, async (req) => {
    const r = req.query as Record<string, unknown>;
    const f = jurnalSxemasi.parse({ ...r, type: r.type || undefined, author: r.author || undefined, from: r.from || undefined, to: r.to || undefined });
    const d = doira(req);
    return withTenant(req.business!.businessId, (tx) => hodisalarJurnali(tx, { doira: d, f }));
  });

  app.get(`${BASE}/crm-app/goals`, guard, async (req) => {
    const davr = davrniOl(req.query);
    const d = doira(req);
    return withTenant(req.business!.businessId, (tx) => maqsadFakti(tx, { doira: d, davr }));
  });

  app.put(`${BASE}/crm-app/goals`, sozlama, async (req) => {
    const k = maqsadKirish.parse(req.body);
    const businessId = req.business!.businessId;
    await bajar(() => withTenant(businessId, (tx) => maqsadniSaqla(tx, businessId, k)));
    return { ok: true };
  });

  // ─── Tovar katalogi (CUST-02) ──────────────────────────────────────────────

  app.get(`${BASE}/crm-app/products`, guard, async (req) => {
    doira(req);
    const q = z.object({ q: z.string().trim().max(100).optional(), all: z.string().optional(), ...sahifa }).parse(req.query);
    return withTenant(req.business!.businessId, (tx) => tovarlar(tx, { q: q.q || undefined, hammasi: q.all === '1', limit: q.limit, offset: q.offset }));
  });

  app.post(`${BASE}/crm-app/products`, sozlama, async (req) => {
    const k = tovarKirish.parse(req.body);
    const businessId = req.business!.businessId;
    const id = await withTenant(businessId, (tx) => tovarYarat(tx, businessId, k));
    return { id };
  });

  app.patch(`${BASE}/crm-app/products/:id`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = tovarKirish.partial().extend({ archived: z.boolean().optional() }).parse(req.body);
    await bajar(() => withTenant(req.business!.businessId, (tx) => tovarniYangila(tx, id, k)));
    return { ok: true };
  });
}
