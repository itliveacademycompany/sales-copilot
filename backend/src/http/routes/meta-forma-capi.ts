import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  capiKorinishi,
  capiniOchir,
  capiQaytaYubor,
  capiQoidaOchir,
  capiQoidaQosh,
  capiQoidaSxemasi,
  capiQoidaYangila,
  capiSozlamaSxemasi,
  capiSozlamasiniSaqla,
  STANDART_HODISALAR,
} from '../../crm/metaLeadAds/capi.js';
import { formaSozlamalari, formaSozlamaSxemasi, formaSozlamasiniSaqla } from '../../crm/metaLeadAds/forma.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { bajar, BASE } from '../crm-yordam.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META: FORMA SOZLAMASI va CONVERSIONS API (amoCRM bilan tenglik)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   GET    /businesses/:id/meta-lead-ads/forms              formalar + CRM maydonlari
 *   PUT    /businesses/:id/meta-lead-ads/forms/:id          voronka, xarita, teg, manba, avto-taqsimot
 *   GET    /businesses/:id/meta-capi                        sozlama (tokensiz), qoidalar, jurnal
 *   PUT    /businesses/:id/meta-capi                        dataset + token (Meta'da tekshiriladi)
 *   DELETE /businesses/:id/meta-capi                        uzish
 *   POST   /businesses/:id/meta-capi/rules                  bosqich → hodisa
 *   PATCH  /businesses/:id/meta-capi/rules/:id              yoqish/o'chirish, summa
 *   DELETE /businesses/:id/meta-capi/rules/:id
 *   POST   /businesses/:id/meta-capi/resend                 o'tkazilgan/yiqilganlarni qayta navbatga
 *
 * Hammasi — `integration:manage` (ega va rahbar). Token javobda hech qachon qaytmaydi.
 */

const idParam = z.object({ id: z.string().uuid() });

export function registerMetaFormaCapiRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireBusiness, requirePermission('integration:manage')] };
  const sekin = { ...guard, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  // ─── Formalar ──────────────────────────────────────────────────────────
  app.get(`${BASE}/meta-lead-ads/forms`, guard, async (req) => formaSozlamalari(req.business!.businessId));

  app.put(`${BASE}/meta-lead-ads/forms/:id`, sekin, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = formaSozlamaSxemasi.parse(req.body);
    await bajar(() => formaSozlamasiniSaqla(req.business!.businessId, id, req.auth!.user.id, body));
    return { ok: true };
  });

  // ─── Conversions API ───────────────────────────────────────────────────
  const capi = `${BASE}/meta-capi`;

  app.get(capi, guard, async (req) => ({ ...(await capiKorinishi(req.business!.businessId)), standartHodisalar: STANDART_HODISALAR }));

  app.put(capi, sekin, async (req) => {
    const body = capiSozlamaSxemasi.parse(req.body);
    await bajar(() => capiSozlamasiniSaqla(req.business!.businessId, req.auth!.user.id, body));
    req.log.info({ businessId: req.business!.businessId }, 'meta capi: sozlama saqlandi');
    return { ok: true };
  });

  app.delete(capi, guard, async (req) => {
    await capiniOchir(req.business!.businessId);
    return { ok: true };
  });

  app.post(`${capi}/rules`, sekin, async (req) => {
    const body = capiQoidaSxemasi.parse(req.body);
    const id = await bajar(() => capiQoidaQosh(req.business!.businessId, req.auth!.user.id, body));
    return { id };
  });

  app.patch(`${capi}/rules/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = z.object({ active: z.boolean().optional(), sendValue: z.boolean().optional() }).parse(req.body);
    await bajar(() => capiQoidaYangila(req.business!.businessId, id, body));
    return { ok: true };
  });

  app.delete(`${capi}/rules/:id`, guard, async (req) => {
    const { id } = idParam.parse(req.params);
    await bajar(() => capiQoidaOchir(req.business!.businessId, id));
    return { ok: true };
  });

  app.post(`${capi}/resend`, sekin, async (req) => ({ qaytarildi: await capiQaytaYubor(req.business!.businessId) }));
}
