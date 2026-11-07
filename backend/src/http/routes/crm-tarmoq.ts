import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../../db/index.js';
import {
  KANALLAR,
  metaHodisa,
  metaTasdiq,
  murojaatRasmi,
  tarmoqlarHolati,
  tarmoqniSaqla,
  tarmoqniSina,
  tarmoqniTayyorla,
  tarmoqniUz,
  tarmoqSaqlashSxemasi,
  telegramHodisa,
} from '../../crm/tarmoq.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { bajar, BASE, doira } from '../crm-yordam.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ICHKI CRM — ijtimoiy tarmoq integratsiyalari (HTTP qatlami)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   GET    /crm-app/social                — uchala kanal holati (CRM foydalanuvchisi)
 *   POST   /crm-app/social/:kanal/prepare — webhook manzili + verify token (kalitsiz)
 *   PUT    /crm-app/social/:kanal         — kalit va sozlamalarni saqlash + sinash
 *   POST   /crm-app/social/:kanal/test    — qayta sinash
 *   DELETE /crm-app/social/:kanal         — uzish (kalitlar o'chiriladi)
 *   GET    /crm-app/inbox/:id/avatar      — murojaat yozuvchisining profil rasmi
 *
 *   GET/POST /api/v1/webhooks/crm/meta/:id     — Facebook va Instagram
 *   POST     /api/v1/webhooks/crm/telegram/:id — Telegram bot
 *
 * O'zgartirish — faqat `integration:manage` (ega va rahbar). Mantiq `crm/tarmoq.ts` da.
 */

const kanalParam = z.object({ kanal: z.enum(KANALLAR) });
const idParam = z.object({ integrationId: z.string().uuid() });

export function registerCrmTarmoqRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireBusiness] };
  const boshqaruv = { preHandler: [requireBusiness, requirePermission('integration:manage')] };

  app.get(`${BASE}/crm-app/social`, guard, async (req) => {
    doira(req); // CRM dan foydalanish huquqi
    const boshqaruvchi = req.business!.permissions.includes('integration:manage');
    const kanallar = await withTenant(req.business!.businessId, (tx) => tarmoqlarHolati(tx, boshqaruvchi));
    return { canManage: boshqaruvchi, channels: kanallar };
  });

  app.post(`${BASE}/crm-app/social/:kanal/prepare`, boshqaruv, async (req) => {
    const { kanal } = kanalParam.parse(req.params);
    const businessId = req.business!.businessId;
    await withTenant(businessId, (tx) => tarmoqniTayyorla(tx, businessId, kanal));
    const kanallar = await withTenant(businessId, (tx) => tarmoqlarHolati(tx, true));
    return { channel: kanallar.find((k) => k.kanal === kanal) };
  });

  /** Saqlash va darhol sinash: kalit noto'g'ri bo'lsa ham saqlanadi, holat "xato" bo'ladi va sababi ko'rinadi. */
  app.put(`${BASE}/crm-app/social/:kanal`, { ...boshqaruv, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { kanal } = kanalParam.parse(req.params);
    const kirish = tarmoqSaqlashSxemasi.parse(req.body);
    const businessId = req.business!.businessId;
    await bajar(() => withTenant(businessId, (tx) => tarmoqniSaqla(tx, businessId, kanal, kirish)));
    const sinov = await bajar(() => tarmoqniSina(businessId, kanal));
    const kanallar = await withTenant(businessId, (tx) => tarmoqlarHolati(tx, true));
    return { test: sinov, channel: kanallar.find((k) => k.kanal === kanal) };
  });

  app.post(`${BASE}/crm-app/social/:kanal/test`, { ...boshqaruv, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (req) => {
    const { kanal } = kanalParam.parse(req.params);
    const businessId = req.business!.businessId;
    const sinov = await bajar(() => tarmoqniSina(businessId, kanal));
    const kanallar = await withTenant(businessId, (tx) => tarmoqlarHolati(tx, true));
    return { test: sinov, channel: kanallar.find((k) => k.kanal === kanal) };
  });

  app.delete(`${BASE}/crm-app/social/:kanal`, boshqaruv, async (req) => {
    const { kanal } = kanalParam.parse(req.params);
    const businessId = req.business!.businessId;
    await tarmoqniUz(businessId, kanal);
    const kanallar = await withTenant(businessId, (tx) => tarmoqlarHolati(tx, true));
    return { channel: kanallar.find((k) => k.kanal === kanal) };
  });

  /**
   * Murojaat kartasidagi profil rasmi (Telegram, Messenger, Instagram).
   * Rasm yo'q yoki yopiq bo'lsa 404 — kartada bosh harflar qoladi.
   */
  app.get(`${BASE}/crm-app/inbox/:id/avatar`, guard, async (req, reply) => {
    doira(req);
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const rasm = await murojaatRasmi(req.business!.businessId, id);
    if (!rasm) return reply.status(404).header('cache-control', 'private, max-age=3600').send({ ok: false });
    return reply
      .type(rasm.turi)
      .header('cache-control', 'private, max-age=21600')
      .header('x-content-type-options', 'nosniff')
      .send(rasm.data);
  });

  // ─── Webhooklar (sessiyasiz — imzo yoki sir bilan) ──────────────────────────

  /**
   * Meta imzosi xom tana bo'yicha hisoblanadi — shu sababli bu yo'llar alohida
   * (inkapsulyatsiyalangan) qamrovda: JSON bu yerda Buffer sifatida keladi,
   * ilovaning boshqa yo'llaridagi oddiy JSON tahlili o'zgarmaydi.
   */
  void app.register(async (qamrov) => {
    qamrov.removeContentTypeParser('application/json');
    qamrov.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

    const webhook = { config: { rateLimit: { max: 3000, timeWindow: '1 minute' } } };

    /** Meta "Verify and save" bosilganda: `hub.challenge` ni aynan qaytarish kerak. */
    qamrov.get('/api/v1/webhooks/crm/meta/:integrationId', webhook, async (req, reply) => {
      const { integrationId } = idParam.parse(req.params);
      const q = req.query as Record<string, string | undefined>;
      const javob = await metaTasdiq(integrationId, { mode: q['hub.mode'], token: q['hub.verify_token'], challenge: q['hub.challenge'] });
      if (javob === null) {
        req.log.warn({ integrationId }, 'meta webhook: verify token mos kelmadi');
        return reply.status(403).type('text/plain').send('forbidden');
      }
      return reply.type('text/plain').send(javob);
    });

    qamrov.post('/api/v1/webhooks/crm/meta/:integrationId', webhook, async (req, reply) => {
      const { integrationId } = idParam.parse(req.params);
      const xom = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
      const imzo = req.headers['x-hub-signature-256'];
      try {
        const r = await metaHodisa(integrationId, xom, typeof imzo === 'string' ? imzo : undefined);
        if (r.kod === 401) req.log.warn({ integrationId }, 'meta webhook: imzo mos kelmadi');
        return reply.status(r.kod).send(r.natija);
      } catch (err) {
        // Lid saqlanmadi (masalan, baza vaqtincha ishlamadi) — 500: Meta qayta yuboradi,
        // idempotentlik tufayli dubl bo'lmaydi. Lid yo'qolgandan qayta urinish yaxshi.
        req.log.error({ err, integrationId }, 'meta webhook: ishlashda xato');
        return reply.status(500).send({ ok: false });
      }
    });

    qamrov.post('/api/v1/webhooks/crm/telegram/:integrationId', webhook, async (req, reply) => {
      const { integrationId } = idParam.parse(req.params);
      let tana: unknown = null;
      try {
        tana = Buffer.isBuffer(req.body) && req.body.length ? JSON.parse(req.body.toString('utf8')) : null;
      } catch {
        tana = null;
      }
      try {
        const r = await telegramHodisa(integrationId, req.headers['x-telegram-bot-api-secret-token'], tana);
        if (r.kod === 401) req.log.warn({ integrationId }, 'crm telegram webhook: sir mos kelmadi');
        return reply.status(r.kod).send(r.natija);
      } catch (err) {
        // Telegram qayta yuboradi; xabar ID si bo'yicha dubl bo'lmaydi
        req.log.error({ err, integrationId }, 'crm telegram webhook: ishlashda xato');
        return reply.status(500).send({ ok: false });
      }
    });
  });
}
