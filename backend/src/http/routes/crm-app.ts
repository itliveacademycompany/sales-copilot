import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import { avtomatikaniUygot } from '../../crm/avtomatika.js';
import { csvYasa, bitimlarniImportla, importSxemasi } from '../../crm/importlash.js';
import { qatorKirish, qatorniOchir, qatorniYangila, qatorQosh } from '../../crm/katalog.js';
import {
  dublikatlar,
  kompaniyaKartochkasi,
  kompaniyaKirish,
  kompaniyalar,
  kompaniyaniOchir,
  kompaniyaniYangila,
  kompaniyaYarat,
  kontaktKartochkasi,
  kontaktKirish,
  kontaktlarniBirlashtir,
  kontaktlarRoyxati,
  kontaktniYangila,
  kontaktYarat,
} from '../../crm/kontakt.js';
import { kutayotganlarSoni } from '../../crm/qabul.js';
import { faolTashqiSinxBormi } from '../../crm/tashqi.js';
import { SHABLONLAR } from '../../crm/shablon.js';
import { radSabablari, sozlamaniOl } from '../../crm/sozlama.js';
import {
  crmVazifalari,
  vazifaFiltrSxemasi,
  vazifaKirish,
  vazifalarOmmaviy,
  vazifaniBajar,
  vazifaniQaytaOch,
  vazifaniYangila,
  vazifaYangilash,
  vazifaYarat,
} from '../../crm/vazifa.js';
import {
  bitimKartochkasi,
  bitimKirish,
  bitimKochirish,
  bitimlarRoyxati,
  bitimniKochir,
  bitimniOchir,
  bitimniTikla,
  bitimniYangila,
  bitimYangilash,
  bitimYarat,
  bosqichlarKirish,
  bosqichlarniSaqla,
  crmniYoq,
  crmSozlamalariniBoshla,
  filtrIdlari,
  izohQosh,
  kanban,
  maydonKirish,
  maydonniYangila,
  maydonYarat,
  ommaviyAmal,
  ommaviySxema,
  teglar,
  tegniOzgartir,
  tuzilma,
  vaqtZonasiniOrnat,
  voronkaniYangila,
  voronkaYarat,
} from '../../crm/xizmat.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { bajar, BASE, doira, filtrniOl, idParam, sahifa, yozishDoirasi } from '../crm-yordam.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — HTTP marshrutlari (asosiy ish)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Prefikslar tashqi CRM ulanishi (`/crm/:kind`) bilan to'qnashmaydi:
 *   /crm-app            — holat, tuzilma, yoqish, vazifalar, teglar
 *   /pipelines          — voronka va bosqich sozlamalari
 *   /crm-fields         — qo'shimcha maydonlar
 *   /deals              — bitimlar (Kanban, jadval, kartochka, ommaviy, savat, CSV)
 *   /contacts, /companies — kontaktlar, kompaniyalar, dublikatlar
 *
 * Sozlamalar va ommaviy import — `business:write`. Ko'rish/yozish doirasi —
 * `crm-yordam.ts` (rahbar hammasi, sotuvchi faqat o'zi).
 */

export function registerCrmAppRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireBusiness] };
  const sozlama = { preHandler: [requireBusiness, requirePermission('business:write')] };

  // ─── Holat va tuzilma ──────────────────────────────────────────────────────

  app.get(`${BASE}/crm-app`, guard, async (req) => {
    const d = doira(req);
    const businessId = req.business!.businessId;
    const t = await withTenant(businessId, (tx) => tuzilma(tx));
    const qoshimcha = await withTenant(businessId, async (tx) => {
      // 1-bosqichda yoqilgan bizneslar uchun sozlama qatori bir marta yaratiladi
      if (t.pipelines.length > 0) await crmSozlamalariniBoshla(tx, businessId);
      const [s, sabablar, kutayotgan, sync] = await Promise.all([sozlamaniOl(tx), radSabablari(tx), kutayotganlarSoni(tx), faolTashqiSinxBormi(tx)]);
      return {
        taskTypes: s.taskTypes,
        lossReasonRequired: s.lossReasonRequired,
        lossReasons: sabablar,
        inboxPending: kutayotgan,
        /** Ichki CRM ga sinxronlanayotgan tashqi CRM nomi (amoCRM) — bo'lsa, qo'ng'iroqlardan qabul ishlamaydi. */
        externalSync: sync,
      };
    });
    return {
      enabled: t.pipelines.length > 0,
      canConfigure: req.business!.permissions.includes('business:write'),
      canIntegrate: req.business!.permissions.includes('integration:manage'),
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
      ...qoshimcha,
    };
  });

  app.post(`${BASE}/crm-app/enable`, sozlama, async (req) => {
    const { template } = z.object({ template: z.enum(['bosh', 'talim']) }).parse(req.body);
    const businessId = req.business!.businessId;
    await bajar(() => withTenant(businessId, (tx) => crmniYoq(tx, businessId, template)));
    return { ok: true };
  });

  app.get(`${BASE}/crm-app/tags`, guard, async (req) => {
    doira(req);
    return { items: await withTenant(req.business!.businessId, (tx) => teglar(tx)) };
  });

  app.post(`${BASE}/crm-app/tags/rename`, sozlama, async (req) => {
    const k = z.object({ from: z.string().min(1).max(60), to: z.string().max(60).nullable() }).parse(req.body);
    const n = await withTenant(req.business!.businessId, (tx) => tegniOzgartir(tx, { eski: k.from, yangi: k.to || null }));
    return { updated: n };
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

  // ─── Bitimlar: Kanban, jadval ──────────────────────────────────────────────

  app.get(`${BASE}/deals/board`, guard, async (req) => {
    const q = req.query as Record<string, unknown>;
    const { pipeline } = z.object({ pipeline: z.string().uuid() }).parse(q);
    const filtr = filtrniOl(q);
    const d = doira(req);
    const businessId = req.business!.businessId;
    const stages = await withTenant(businessId, async (tx) => {
      await vaqtZonasiniOrnat(tx, businessId);
      return kanban(tx, { pipelineId: pipeline, doira: d, filtr });
    });
    return { stages };
  });

  const royxatQuery = z.object({
    pipeline: z.string().uuid().optional(),
    stage: z.string().uuid().optional(),
    sort: z.enum(['updated', 'created', 'amount', 'name', 'stage']).optional(),
    dir: z.enum(['asc', 'desc']).optional(),
    ...sahifa,
  });

  app.get(`${BASE}/deals`, guard, async (req) => {
    const raw = req.query as Record<string, unknown>;
    const q = royxatQuery.parse(raw);
    const filtr = filtrniOl(raw);
    const d = doira(req);
    const businessId = req.business!.businessId;
    return withTenant(businessId, async (tx) => {
      await vaqtZonasiniOrnat(tx, businessId);
      return bitimlarRoyxati(tx, {
        pipelineId: q.pipeline,
        stageId: q.stage,
        doira: d,
        filtr,
        limit: q.limit,
        offset: q.offset,
        sort: q.sort,
        dir: q.dir,
      });
    });
  });

  /** "Filtrga mos hammasini tanlash" — IDlar (ko'pi bilan 5000). */
  app.get(`${BASE}/deals/ids`, guard, async (req) => {
    const raw = req.query as Record<string, unknown>;
    const { pipeline } = z.object({ pipeline: z.string().uuid().optional() }).parse(raw);
    const d = doira(req);
    const businessId = req.business!.businessId;
    const ids = await withTenant(businessId, async (tx) => {
      await vaqtZonasiniOrnat(tx, businessId);
      return filtrIdlari(tx, { pipelineId: pipeline, doira: d, filtr: filtrniOl(raw) });
    });
    return { ids };
  });

  /** CSV eksport — filtrga mos bitimlar (ko'pi bilan 5000). */
  app.get(`${BASE}/deals/export.csv`, { preHandler: [requireBusiness], config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req, reply) => {
    const raw = req.query as Record<string, unknown>;
    const { pipeline } = z.object({ pipeline: z.string().uuid().optional() }).parse(raw);
    const d = doira(req);
    const businessId = req.business!.businessId;
    const csv = await withTenant(businessId, async (tx) => {
      await vaqtZonasiniOrnat(tx, businessId);
      const t = await tuzilma(tx);
      const r = await bitimlarRoyxati(tx, { pipelineId: pipeline, doira: d, filtr: filtrniOl(raw), limit: 5000, offset: 0, sort: 'created', dir: 'desc' });
      const bosqich = new Map(t.pipelines.flatMap((p) => p.stages.map((s) => [s.id, { stage: s.name, pipeline: p.name }] as const)));
      return csvYasa(
        ['Bitim', 'Voronka', 'Bosqich', 'Summa', "Mas'ul", 'Kontakt', 'Telefon', 'Teglar', 'Manba', 'Yaratilgan', 'Yopilgan', 'Rad sababi'],
        r.items.map((x) => [
          x.name,
          bosqich.get(x.stageId)?.pipeline ?? '',
          bosqich.get(x.stageId)?.stage ?? '',
          x.amount ?? '',
          x.responsibleName ?? '',
          x.contactName ?? '',
          x.contactPhone ?? '',
          (x.tags ?? []).join(', '),
          x.source ?? '',
          new Date(x.createdAt).toISOString(),
          x.closedAt ? new Date(x.closedAt).toISOString() : '',
          x.lostReason ?? '',
        ]),
      );
    });
    reply.header('content-type', 'text/csv; charset=utf-8');
    reply.header('content-disposition', `attachment; filename="bitimlar-${new Date().toISOString().slice(0, 10)}.csv"`);
    return csv;
  });

  app.post(`${BASE}/deals/import`, { ...sozlama, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const k = importSxemasi.parse(req.body);
    const d = doira(req);
    const businessId = req.business!.businessId;
    const natija = await bajar(() =>
      withTenant(businessId, (tx) => bitimlarniImportla(tx, { businessId, userId: req.auth!.user.id, doira: d, kirish: k })),
    );
    return { results: natija, created: natija.filter((x) => x.ok).length, failed: natija.filter((x) => !x.ok).length };
  });

  app.post(`${BASE}/deals/bulk`, guard, async (req) => {
    const k = ommaviySxema.parse(req.body);
    const d = yozishDoirasi(req);
    const businessId = req.business!.businessId;
    const natija = await bajar(() => withTenant(businessId, (tx) => ommaviyAmal(tx, { userId: req.auth!.user.id, doira: d, kirish: k })));
    if (k.action === 'stage') for (const r of natija) if (r.ok) avtomatikaniUygot(businessId, r.id);
    return { results: natija, ok: natija.filter((x) => x.ok).length, failed: natija.filter((x) => !x.ok).length };
  });

  // ─── Bitim CRUD ────────────────────────────────────────────────────────────

  app.post(`${BASE}/deals`, guard, async (req) => {
    const kirish = bitimKirish.parse(req.body);
    const d = yozishDoirasi(req);
    const businessId = req.business!.businessId;
    const id = await bajar(() =>
      withTenant(businessId, (tx) => bitimYarat(tx, { businessId, userId: req.auth!.user.id, doira: d, kirish })),
    );
    avtomatikaniUygot(businessId, id);
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
    const d = yozishDoirasi(req);
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
    const d = yozishDoirasi(req);
    const businessId = req.business!.businessId;
    await bajar(() =>
      withTenant(businessId, (tx) => bitimniKochir(tx, { id, userId: req.auth!.user.id, doira: d, kirish })),
    );
    avtomatikaniUygot(businessId, id);
    return { ok: true };
  });

  app.delete(`${BASE}/deals/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const d = yozishDoirasi(req);
    await bajar(() => withTenant(req.business!.businessId, (tx) => bitimniOchir(tx, { id, doira: d, userId: req.auth!.user.id })));
    return { ok: true };
  });

  app.post(`${BASE}/deals/:id/restore`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const d = yozishDoirasi(req);
    await bajar(() => withTenant(req.business!.businessId, (tx) => bitimniTikla(tx, { id, doira: d, userId: req.auth!.user.id })));
    return { ok: true };
  });

  app.post(`${BASE}/deals/:id/notes`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const { text } = z.object({ text: z.string().trim().min(1, 'Izoh matnini kiriting').max(5000) }).parse(req.body);
    const d = yozishDoirasi(req);
    await bajar(() =>
      withTenant(req.business!.businessId, (tx) => izohQosh(tx, { id, userId: req.auth!.user.id, doira: d, matn: text })),
    );
    return { ok: true };
  });

  app.post(`${BASE}/deals/:id/tasks`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = vazifaKirish.omit({ dealId: true, contactId: true }).parse(req.body);
    const d = yozishDoirasi(req);
    const businessId = req.business!.businessId;
    const taskId = await bajar(() =>
      withTenant(businessId, (tx) =>
        vazifaYarat(tx, { businessId, userId: req.auth!.user.id, doira: d, kirish: { ...k, dealId: id } }),
      ),
    );
    return { id: taskId };
  });

  // Bitimdagi tovarlar
  app.post(`${BASE}/deals/:id/items`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = qatorKirish.parse(req.body);
    const d = yozishDoirasi(req);
    const itemId = await bajar(() =>
      withTenant(req.business!.businessId, (tx) => qatorQosh(tx, { dealId: id, userId: req.auth!.user.id, doira: d, kirish: k })),
    );
    return { id: itemId };
  });

  app.patch(`${BASE}/deals/:id/items/:itemId`, guard, async (req) => {
    const { id, itemId } = z.object({ id: z.string().uuid(), itemId: z.string().uuid() }).parse(req.params);
    const k = qatorKirish.partial().parse(req.body);
    const d = yozishDoirasi(req);
    await bajar(() =>
      withTenant(req.business!.businessId, (tx) => qatorniYangila(tx, { dealId: id, itemId, userId: req.auth!.user.id, doira: d, kirish: k })),
    );
    return { ok: true };
  });

  app.delete(`${BASE}/deals/:id/items/:itemId`, guard, async (req) => {
    const { id, itemId } = z.object({ id: z.string().uuid(), itemId: z.string().uuid() }).parse(req.params);
    const d = yozishDoirasi(req);
    await bajar(() =>
      withTenant(req.business!.businessId, (tx) => qatorniOchir(tx, { dealId: id, itemId, userId: req.auth!.user.id, doira: d })),
    );
    return { ok: true };
  });

  // ─── Vazifalar (TASK-01..05) ───────────────────────────────────────────────

  app.get(`${BASE}/crm-app/tasks`, guard, async (req) => {
    const q = req.query as Record<string, unknown>;
    const f = vazifaFiltrSxemasi.parse({ ...q, q: q.q || undefined, type: q.type || undefined, seat: q.seat || undefined, period: q.period || undefined });
    const { limit, offset } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(50), offset: sahifa.offset }).parse(q);
    const d = doira(req);
    const businessId = req.business!.businessId;
    return withTenant(businessId, async (tx) => {
      await vaqtZonasiniOrnat(tx, businessId);
      return crmVazifalari(tx, { doira: d, filtr: f, limit, offset });
    });
  });

  app.post(`${BASE}/crm-app/tasks`, guard, async (req) => {
    const k = vazifaKirish.parse(req.body);
    const d = yozishDoirasi(req);
    const businessId = req.business!.businessId;
    const id = await bajar(() => withTenant(businessId, (tx) => vazifaYarat(tx, { businessId, userId: req.auth!.user.id, doira: d, kirish: k })));
    return { id };
  });

  app.patch(`${BASE}/crm-app/tasks/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = vazifaYangilash.parse(req.body);
    const d = yozishDoirasi(req);
    await bajar(() => withTenant(req.business!.businessId, (tx) => vazifaniYangila(tx, { id, userId: req.auth!.user.id, doira: d, kirish: k })));
    return { ok: true };
  });

  app.post(`${BASE}/crm-app/tasks/:id/complete`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const { result } = z.object({ result: z.string().trim().max(2000).nullable().optional() }).parse(req.body ?? {});
    const d = yozishDoirasi(req);
    await bajar(() => withTenant(req.business!.businessId, (tx) => vazifaniBajar(tx, { id, userId: req.auth!.user.id, doira: d, result: result || null })));
    return { ok: true };
  });

  app.post(`${BASE}/crm-app/tasks/:id/reopen`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const d = yozishDoirasi(req);
    await bajar(() => withTenant(req.business!.businessId, (tx) => vazifaniQaytaOch(tx, { id, userId: req.auth!.user.id, doira: d })));
    return { ok: true };
  });

  app.post(`${BASE}/crm-app/tasks/bulk`, guard, async (req) => {
    const k = z
      .object({
        ids: z.array(z.string().uuid()).min(1).max(500),
        action: z.enum(['done', 'cancel', 'due']),
        dueAt: z.string().datetime({ offset: true }).nullable().optional(),
      })
      .parse(req.body);
    const d = yozishDoirasi(req);
    const natija = await bajar(() =>
      withTenant(req.business!.businessId, (tx) => vazifalarOmmaviy(tx, { ids: k.ids, userId: req.auth!.user.id, doira: d, amal: k.action, dueAt: k.dueAt })),
    );
    return { results: natija };
  });

  // ─── Kontaktlar ────────────────────────────────────────────────────────────

  app.get(`${BASE}/contacts`, guard, async (req) => {
    const q = z.object({ q: z.string().trim().max(100).optional(), companyId: z.string().uuid().optional(), ...sahifa }).parse(req.query);
    const d = doira(req);
    return withTenant(req.business!.businessId, (tx) =>
      kontaktlarRoyxati(tx, { q: q.q || undefined, companyId: q.companyId, limit: q.limit, offset: q.offset, doira: d }),
    );
  });

  app.post(`${BASE}/contacts`, guard, async (req) => {
    const k = kontaktKirish.parse(req.body);
    yozishDoirasi(req);
    const businessId = req.business!.businessId;
    const id = await bajar(() => withTenant(businessId, (tx) => kontaktYarat(tx, businessId, k)));
    return { id };
  });

  app.get(`${BASE}/contacts/duplicates`, sozlama, async (req) => {
    return { groups: await withTenant(req.business!.businessId, (tx) => dublikatlar(tx)) };
  });

  app.post(`${BASE}/contacts/merge`, sozlama, async (req) => {
    const k = z.object({ primaryId: z.string().uuid(), otherIds: z.array(z.string().uuid()).min(1).max(20) }).parse(req.body);
    const businessId = req.business!.businessId;
    await bajar(() =>
      withTenant(businessId, (tx) => kontaktlarniBirlashtir(tx, { businessId, asosiyId: k.primaryId, boshqalar: k.otherIds, userId: req.auth!.user.id })),
    );
    return { ok: true };
  });

  app.get(`${BASE}/contacts/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const d = doira(req);
    return bajar(() => withTenant(req.business!.businessId, (tx) => kontaktKartochkasi(tx, { id, doira: d })));
  });

  app.patch(`${BASE}/contacts/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = kontaktKirish.partial().parse(req.body);
    const d = yozishDoirasi(req);
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

  // ─── Kompaniyalar ──────────────────────────────────────────────────────────

  app.get(`${BASE}/companies`, guard, async (req) => {
    const q = z.object({ q: z.string().trim().max(100).optional(), ...sahifa }).parse(req.query);
    doira(req);
    return withTenant(req.business!.businessId, (tx) => kompaniyalar(tx, { q: q.q || undefined, limit: q.limit, offset: q.offset }));
  });

  app.post(`${BASE}/companies`, guard, async (req) => {
    const k = kompaniyaKirish.parse(req.body);
    yozishDoirasi(req);
    const businessId = req.business!.businessId;
    const id = await bajar(() => withTenant(businessId, (tx) => kompaniyaYarat(tx, businessId, k)));
    return { id };
  });

  app.get(`${BASE}/companies/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const d = doira(req);
    return bajar(() => withTenant(req.business!.businessId, (tx) => kompaniyaKartochkasi(tx, { id, doira: d })));
  });

  app.patch(`${BASE}/companies/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const k = kompaniyaKirish.partial().parse(req.body);
    yozishDoirasi(req);
    await bajar(() => withTenant(req.business!.businessId, (tx) => kompaniyaniYangila(tx, id, k)));
    return { ok: true };
  });

  app.delete(`${BASE}/companies/:id`, sozlama, async (req) => {
    const { id } = idParam.parse(req.params);
    await bajar(() => withTenant(req.business!.businessId, (tx) => kompaniyaniOchir(tx, id)));
    return { ok: true };
  });
}
