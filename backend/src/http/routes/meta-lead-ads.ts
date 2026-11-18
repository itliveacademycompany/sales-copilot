import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { malumotniOchir, ruxsatBekorQilindi, tasdiqKodiTogrimi, hodisalarniQaytar, metaHolati, ulanishFormalari, ulanishniTekshir, ulanishniUz, ulanishniYangila } from '../../crm/metaLeadAds/ulanish.js';
import { oauthBoshla, oauthCallback, sahifaniUla, sessiyaFormalari, sessiyaKorinishi } from '../../crm/metaLeadAds/oauth.js';
import { tezIshla, webhookQabul, webhookTasdiq, type WebhookManba } from '../../crm/metaLeadAds/ishlov.js';
import { ilovaKorinishi, ilovaniOchir, ilovaniSaqla } from '../../crm/metaLeadAds/ilova.js';
import { ilovaBoyicha, KOMPANIYA_WEBHOOK_YOLI, metaSozlama, tashqiManzil, WEBHOOK_YOLI } from '../../crm/metaLeadAds/sozlama.js';
import { signedRequestniOch } from '../../crm/metaLeadAds/sof.js';
import { rootUrl } from '../tenant.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { bajar, BASE } from '../crm-yordam.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * META LEAD ADS — "Facebook orqali ulash" (HTTP qatlami)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   GET    /businesses/:id/meta-lead-ads                              holat + diagnostika
 *   POST   /businesses/:id/meta-lead-ads/oauth/start                  Meta oynasi manzili
 *   GET    /businesses/:id/meta-lead-ads/sessions/:sid                ruxsat berilgan sahifalar
 *   GET    /businesses/:id/meta-lead-ads/sessions/:sid/pages/:pageId/forms
 *   POST   /businesses/:id/meta-lead-ads/connect                      sahifa + formalar → ulash
 *   GET    /businesses/:id/meta-lead-ads/:connId/forms                formalarni o'zgartirish uchun
 *   PATCH  /businesses/:id/meta-lead-ads/:connId                      formalar / voronka
 *   POST   /businesses/:id/meta-lead-ads/:connId/check                holatni tekshirish
 *   POST   /businesses/:id/meta-lead-ads/:connId/retry                xato hodisalarni qayta ishlash
 *   DELETE /businesses/:id/meta-lead-ads/:connId                      uzish (tenant doirasida)
 *
 *   GET      /api/v1/crm/oauth/meta/callback                  OAuth redirect URI (ommaviy)
 *   GET|PUT|DELETE /businesses/:id/meta-lead-ads/app           kompaniyaning o'z Meta ilovasi
 *   GET|POST /api/v1/webhooks/crm/meta                        platforma ilovasi webhook'i (Page → leadgen)
 *   GET|POST /api/v1/webhooks/crm/meta-app/:ilovaId           kompaniya ilovasi webhook'i (+ /deauthorize, /data-deletion)
 *   POST     /api/v1/webhooks/crm/meta/deauthorize            Deauthorize callback
 *   POST     /api/v1/webhooks/crm/meta/data-deletion          Data deletion callback
 *   GET      /api/v1/public/meta/data-deletion/:code          o'chirish so'rovi holati
 *
 * Boshqaruv — faqat `integration:manage` (ega va rahbar). Qo'lda ulash
 * (`/api/v1/webhooks/crm/meta/:integrationId`, crm-tarmoq.ts) o'zgarmagan.
 */

const sessiyaParam = z.object({ sid: z.string().uuid() });
const sahifaParam = z.object({ sid: z.string().uuid(), pageId: z.string().regex(/^\d{1,30}$/) });
const ulanishParam = z.object({ connId: z.string().uuid() });
const formaIdlar = z.array(z.string().regex(/^\d{1,30}$/)).min(1, 'Kamida bitta formani tanlang').max(200);

export function registerMetaLeadAdsRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireBusiness, requirePermission('integration:manage')] };
  const sekin = { ...guard, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };
  const yol = `${BASE}/meta-lead-ads`;

  app.get(yol, guard, async (req) => {
    const superAdmin = req.auth!.user.systemRole === 'super_admin';
    return metaHolati(req.business!.businessId, superAdmin);
  });

  // ─── Kompaniyaning o'z Meta ilovasi (App ID, App Secret, Configuration ID) ──
  app.get(yol + '/app', guard, async (req) => ilovaKorinishi(req.business!.businessId));

  app.put(yol + '/app', sekin, async (req) => {
    const body = z
      .object({
        appId: z.string().trim().max(30),
        appSecret: z.string().trim().max(200).optional(),
        loginConfigId: z.string().trim().max(30).nullable().optional(),
      })
      .parse(req.body);
    await bajar(() => ilovaniSaqla({ businessId: req.business!.businessId, userId: req.auth!.user.id, ...body, ip: req.ip }));
    req.log.info({ businessId: req.business!.businessId }, 'meta lead ads: kompaniya ilovasi saqlandi');
    return ilovaKorinishi(req.business!.businessId);
  });

  app.delete(yol + '/app', guard, async (req) => {
    await bajar(() => ilovaniOchir(req.business!.businessId, req.auth!.user.id));
    return { ok: true };
  });

  app.post(`${yol}/oauth/start`, sekin, async (req) => {
    const body = z
      .object({ qaytish: z.string().max(300).optional(), connectionId: z.string().uuid().optional(), qaytaSora: z.boolean().optional() })
      .parse(req.body ?? {});
    return bajar(() =>
      oauthBoshla({
        businessId: req.business!.businessId,
        userId: req.auth!.user.id,
        slug: req.business!.slug ?? null,
        qaytish: body.qaytish,
        connectionId: body.connectionId,
        qaytaSora: body.qaytaSora,
      }),
    );
  });

  app.get(`${yol}/sessions/:sid`, guard, async (req) => {
    const { sid } = sessiyaParam.parse(req.params);
    return bajar(() => sessiyaKorinishi(req.business!.businessId, req.auth!.user.id, sid));
  });

  app.get(`${yol}/sessions/:sid/pages/:pageId/forms`, sekin, async (req) => {
    const { sid, pageId } = sahifaParam.parse(req.params);
    return bajar(() => sessiyaFormalari(req.business!.businessId, req.auth!.user.id, sid, pageId));
  });

  app.post(`${yol}/connect`, sekin, async (req) => {
    const body = z
      .object({ sessionId: z.string().uuid(), pageId: z.string().regex(/^\d{1,30}$/), formIds: formaIdlar, pipelineId: z.string().uuid().nullable().optional() })
      .parse(req.body);
    const r = await bajar(() =>
      sahifaniUla({ businessId: req.business!.businessId, userId: req.auth!.user.id, ...body, ip: req.ip, userAgent: req.headers['user-agent'] ?? null }),
    );
    req.log.info({ businessId: req.business!.businessId, connectionId: r.connectionId, pageId: body.pageId }, 'meta lead ads: sahifa ulandi');
    return r;
  });

  app.get(`${yol}/:connId/forms`, sekin, async (req) => {
    const { connId } = ulanishParam.parse(req.params);
    return bajar(() => ulanishFormalari(req.business!.businessId, connId));
  });

  app.patch(`${yol}/:connId`, sekin, async (req) => {
    const { connId } = ulanishParam.parse(req.params);
    const body = z.object({ formIds: formaIdlar.optional(), pipelineId: z.string().uuid().nullable().optional() }).parse(req.body ?? {});
    await bajar(() => ulanishniYangila({ businessId: req.business!.businessId, id: connId, userId: req.auth!.user.id, ...body }));
    return { ok: true };
  });

  app.post(`${yol}/:connId/check`, sekin, async (req) => {
    const { connId } = ulanishParam.parse(req.params);
    return bajar(() => ulanishniTekshir(req.business!.businessId, connId));
  });

  app.post(`${yol}/:connId/retry`, sekin, async (req) => {
    const { connId } = ulanishParam.parse(req.params);
    const { eventId } = z.object({ eventId: z.string().uuid().optional() }).parse(req.body ?? {});
    const n = await bajar(() => hodisalarniQaytar(req.business!.businessId, connId, eventId));
    tezIshla((obj, msg) => req.log.info(obj, msg));
    return { requeued: n };
  });

  app.delete(`${yol}/:connId`, guard, async (req) => {
    const { connId } = ulanishParam.parse(req.params);
    const r = await bajar(() => ulanishniUz({ businessId: req.business!.businessId, id: connId, userId: req.auth!.user.id, ip: req.ip, userAgent: req.headers['user-agent'] ?? null }));
    req.log.info({ businessId: req.business!.businessId, connectionId: connId, unsubscribed: r.unsubscribed }, 'meta lead ads: uzildi');
    return r;
  });

  // ─── OAuth callback (ommaviy, sessiyasiz — tenant faqat server sessiyasidan) ─
  app.get('/api/v1/crm/oauth/meta/callback', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (req, reply) => {
    const q = z
      .object({ state: z.string().max(200).optional(), code: z.string().max(2000).optional(), error: z.string().max(200).optional(), error_reason: z.string().max(200).optional() })
      .catch({})
      .parse(req.query);
    try {
      const manzil = await oauthCallback(q, (obj, msg) => req.log.info(obj, msg));
      return reply.redirect(manzil);
    } catch (err) {
      req.log.error({ err: (err as Error).message }, 'meta oauth: callback xatosi');
      return reply.redirect(`${rootUrl()}/crm/integratsiya?meta_xato=almashtirish`);
    }
  });

  app.get('/api/v1/public/meta/data-deletion/:code', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { code } = z.object({ code: z.string().max(60) }).parse(req.params);
    if (!tasdiqKodiTogrimi(code)) return reply.status(404).send({ ok: false });
    return { confirmation_code: code, status: 'completed', detail: "Facebook'dan olingan tokenlar va foydalanuvchi identifikatori o'chirildi." };
  });

  // ─── Webhooklar: xom tana kerak (imzo) — alohida qamrov ─────────────────────
  void app.register(async (qamrov) => {
    qamrov.removeContentTypeParser('application/json');
    qamrov.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));
    // `application/x-www-form-urlencoded` — ilova darajasidagi parser (routes/oauth.ts) obyekt beradi
    const webhook = { config: { rateLimit: { max: 3000, timeWindow: '1 minute' } } };

    const ilovaParam = z.object({ ilovaId: z.string().uuid() });
    /** Platforma ilovasi (env) — `/webhooks/crm/meta`; kompaniya ilovasi — `/webhooks/crm/meta-app/:ilovaId`. */
    const manbaniOl = (params: unknown): WebhookManba | null => {
      if (!params || !(params as Record<string, unknown>).ilovaId) return { tur: 'platforma' };
      const p = ilovaParam.safeParse(params);
      return p.success ? { tur: 'kompaniya', ilovaId: p.data.ilovaId } : null;
    };

    const tasdiq = async (req: FastifyRequest, reply: FastifyReply) => {
      const manba = manbaniOl(req.params);
      const q = req.query as Record<string, string | undefined>;
      const javob = manba ? await webhookTasdiq(manba, { mode: q['hub.mode'], token: q['hub.verify_token'], challenge: q['hub.challenge'] }) : null;
      if (javob === null) {
        req.log.warn({ manba: manba?.tur }, 'meta lead ads webhook: verify token mos kelmadi yoki sozlanmagan');
        return reply.status(403).type('text/plain').send('forbidden');
      }
      return reply.type('text/plain').send(javob);
    };

    const qabul = async (req: FastifyRequest, reply: FastifyReply) => {
      const manba = manbaniOl(req.params);
      if (!manba) return reply.status(404).send({ ok: false });
      const xom = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      try {
        const r = await webhookQabul(manba, xom, req.headers['x-hub-signature-256']);
        if (r.kod === 401) req.log.warn({ manba: manba.tur }, 'meta lead ads webhook: imzo mos kelmadi');
        if (r.kod === 503) req.log.error({ manba: manba.tur }, 'meta lead ads webhook: ilova App Secret sozlanmagan — hodisa qabul qilinmadi');
        if (r.kod === 200 && r.saqlandi > 0) tezIshla((obj, msg) => req.log.info(obj, msg));
        if (r.kod === 200 && (r.saqlandi || r.etiborsiz || r.begona)) req.log.info({ manba: manba.tur, saqlandi: r.saqlandi, etiborsiz: r.etiborsiz, takror: r.takror, begona: r.begona }, 'meta lead ads webhook');
        return reply.status(r.kod).send({ ok: r.kod === 200 });
      } catch (err) {
        // Hodisa saqlanmadi — 500: Meta qayta yuboradi, unikal kalit tufayli dubl bo'lmaydi
        req.log.error({ err: (err as Error).message }, 'meta lead ads webhook: saqlashda xato');
        return reply.status(500).send({ ok: false });
      }
    };

    qamrov.get(WEBHOOK_YOLI, webhook, tasdiq);
    qamrov.post(WEBHOOK_YOLI, webhook, qabul);
    qamrov.get(KOMPANIYA_WEBHOOK_YOLI + '/:ilovaId', webhook, tasdiq);
    qamrov.post(KOMPANIYA_WEBHOOK_YOLI + '/:ilovaId', webhook, qabul);

    const signed = (body: unknown): string | null => {
      if (typeof body === 'string') return new URLSearchParams(body).get('signed_request');
      const v = body && typeof body === 'object' ? (body as Record<string, unknown>).signed_request : null;
      return typeof v === 'string' ? v : null;
    };

    /** signed_request — qaysi ilovaniki bo'lsa, o'sha App Secret bilan; doira — o'sha ilova tashkilotlari. */
    const signedniOch = async (req: FastifyRequest): Promise<{ userId: string; businessId: string | null } | null> => {
      const manba = manbaniOl(req.params);
      if (!manba) return null;
      if (manba.tur === 'platforma') {
        const s = metaSozlama();
        const d = s ? signedRequestniOch(signed(req.body), s.appSecret) : null;
        return d ? { userId: d.userId, businessId: null } : null;
      }
      const ilova = await ilovaBoyicha(manba.ilovaId);
      const d = ilova?.s ? signedRequestniOch(signed(req.body), ilova.s.appSecret) : null;
      return d ? { userId: d.userId, businessId: ilova!.businessId } : null;
    };

    const deauthorize = async (req: FastifyRequest, reply: FastifyReply) => {
      const d = await signedniOch(req);
      if (!d) return reply.status(400).send({ ok: false });
      const n = await ruxsatBekorQilindi(d.userId, d.businessId);
      req.log.info({ connections: n }, 'meta lead ads: foydalanuvchi ilova ruxsatini bekor qildi');
      return { ok: true };
    };

    const malumotOchirish = async (req: FastifyRequest, reply: FastifyReply) => {
      const d = await signedniOch(req);
      if (!d) return reply.status(400).send({ ok: false });
      const { confirmationCode } = await malumotniOchir(d.userId, d.businessId);
      req.log.info('meta lead ads: ma‘lumotni o‘chirish so‘rovi bajarildi');
      return { url: tashqiManzil() + '/api/v1/public/meta/data-deletion/' + confirmationCode, confirmation_code: confirmationCode };
    };

    qamrov.post(WEBHOOK_YOLI + '/deauthorize', webhook, deauthorize);
    qamrov.post(WEBHOOK_YOLI + '/data-deletion', webhook, malumotOchirish);
    qamrov.post(KOMPANIYA_WEBHOOK_YOLI + '/:ilovaId/deauthorize', webhook, deauthorize);
    qamrov.post(KOMPANIYA_WEBHOOK_YOLI + '/:ilovaId/data-deletion', webhook, malumotOchirish);
  });
}
