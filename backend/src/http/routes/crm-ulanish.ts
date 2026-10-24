import { and, count, desc, eq, isNotNull, max, ne } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { encryptSecret } from '../../crypto/secrets.js';
import { withTenant } from '../../db/index.js';
import { crmLead, crmSyncItem, deal, integration } from '../../db/schema/index.js';
import {
  ADAPTERLAR,
  CRM_TURLARI,
  crmConfigniOl,
  crmSozlamaSchema,
  crmTurimi,
  CrmXato,
  sozlamaniOl,
  type CrmKind,
  type CrmKontekst,
} from '../../integrations/crm/index.js';
import type { CrmUlanishNatija } from '../../integrations/crm/adapter.js';
import { amoOauthSozlama, holatYarat } from '../../integrations/crm/kontekst.js';
import { oauthHavola } from '../../integrations/crm/amocrm.js';
import { crmLidlarniSinxronla, lidSozlamaniOl, tuzilishKeshniTozala } from '../../integrations/crm/lidlar.js';
import { kontekstQur } from '../../integrations/crm/kontekst.js';
import { hostDanSlug, rootHostmi } from '../tenant.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CRM — ulash, tekshirish, sozlash, jurnal (har qanday CRM uchun bitta API)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mantiq adapterlarda (`integrations/crm/*`); bu yerda faqat HTTP qatlami.
 * Yangi CRM qo'shilganda bu fayl O'ZGARMAYDI.
 *
 * • Bir vaqtda bitta CRM: ikkitasiga birdan yozilsa, menejer bir
 *   qo'ng'iroq uchun ikki joyda ikki xil izoh ko'rardi.
 * • Sir (token / webhook manzili) HECH QACHON qaytarilmaydi — faqat
 *   niqob (`sirKorinishi`).
 * • Hamma marshrut `integration:manage` (ega, rahbar).
 */

const ulashBody = z.object({
  maydonlar: z.record(z.string(), z.string().max(4000)).default({}),
});

const sozlamaBody = z.object({
  izoh: z.boolean().optional(),
  vazifa: z.boolean().optional(),
  /** Lidlar faqat shu voronkalardan (ID). `null` — hammasi. */
  voronkalar: z.array(z.string().max(64)).max(200).nullable().optional(),
  /** Lidlar SotuvAI ichki CRM bitimlariga ham ko'chirilsinmi (bir tomonlama). */
  ichkiCrm: z.boolean().optional(),
});

function turniOl(req: FastifyRequest): CrmKind {
  const { kind } = z.object({ kind: z.string() }).parse(req.params);
  if (!crmTurimi(kind)) throw AppError.notFound('Bunday CRM qo\'llab-quvvatlanmaydi');
  return kind;
}

/** CRM xatosini foydalanuvchiga tushunarli 400 ga aylantiradi. */
function crmXatosi(err: unknown): never {
  if (err instanceof CrmXato) throw AppError.badRequest(err.message);
  throw err;
}

async function qatorlarniOl(businessId: string) {
  return withTenant(businessId, (tx) =>
    tx
      .select({
        id: integration.id,
        businessId: integration.businessId,
        kind: integration.kind,
        status: integration.status,
        config: integration.config,
        creds: integration.credentialsEncrypted,
        tokenExpiresAt: integration.tokenExpiresAt,
        lastSyncAt: integration.lastSyncAt,
        lastError: integration.lastError,
      })
      .from(integration),
  );
}

type Qator = Awaited<ReturnType<typeof qatorlarniOl>>[number];

function ulanganmi(q: Qator | undefined): boolean {
  return Boolean(q && q.creds && (q.status === 'connected' || q.status === 'error'));
}

function kontekst(q: Qator): CrmKontekst | null {
  return kontekstQur({ id: q.id, businessId: q.businessId, config: q.config, creds: q.creds });
}

/** Bitta CRM holati — sirsiz. */
function holat(kind: CrmKind, q: Qator | undefined) {
  const ulangan = ulanganmi(q);
  const cfg = crmConfigniOl(q?.config);
  const c = (q?.config ?? {}) as Record<string, unknown>;
  return {
    connected: ulangan,
    status: q?.status ?? 'disconnected',
    account: ulangan
      ? {
          name: typeof cfg.accountName === 'string' ? cfg.accountName : ADAPTERLAR[kind].nom,
          url: typeof c.crmHisobUrl === 'string' ? c.crmHisobUrl : null,
          address: typeof cfg.address === 'string' ? cfg.address : null,
        }
      : null,
    /** Uzilgandan keyin ham manzil formada qoladi — qayta ulash oson bo'lsin. */
    lastAddress: typeof cfg.address === 'string' ? cfg.address : null,
    secretHint: ulangan && typeof c.crmSirKorinishi === 'string' ? c.crmSirKorinishi : null,
    tokenExpiresAt: ulangan ? (q?.tokenExpiresAt ?? null) : null,
    connectedAt: typeof c.crmUlangan === 'string' ? c.crmUlangan : null,
    lastCheckAt: q?.lastSyncAt ?? null,
    lastError: q?.lastError ?? null,
    /** `oauth` — bir tugmada ulangan (token o'zi yangilanadi), `token` — qo'lda kiritilgan. */
    authType: cfg.authType === 'oauth' ? 'oauth' : ulangan ? 'token' : null,
    settings: sozlamaniOl(q?.config),
    leads: (() => {
      const l = lidSozlamaniOl(q?.config);
      return { voronkalar: l.voronkalar, birinchiTugadi: l.birinchiTugadi, oxirgi: l.oxirgi, xato: l.xato, ichkiCrm: l.ichkiCrm };
    })(),
  };
}

/**
 * Ulanishni saqlaydi — token bilan ham, OAuth bilan ham bitta yo'l.
 *
 * • Bir vaqtda bitta CRM (boshqasi ulangan bo'lsa — rad).
 * • Hisob O'ZGARSA (boshqa manzil) — eski hisobning lidlari o'chiriladi va
 *   import boshidan boshlanadi: ikki hisob ma'lumoti aralashmasin.
 * • Yangi ulanishda CRM ga faqat shu paytdan keyingi qo'ng'iroqlar yoziladi.
 */
export async function ulanishniSaqla(businessId: string, kind: CrmKind, n: CrmUlanishNatija): Promise<void> {
  const qatorlar = await qatorlarniOl(businessId);
  const boshqa = qatorlar.find((q) => q.kind !== kind && crmTurimi(q.kind) && ulanganmi(q));
  if (boshqa) {
    throw AppError.conflict(`Avval ${ADAPTERLAR[boshqa.kind as CrmKind].nom} ni uzing — bir vaqtda bitta CRM ulanadi`);
  }
  const mavjud = qatorlar.find((q) => q.kind === kind);
  const avvalgi = (mavjud?.config ?? {}) as Record<string, unknown>;
  const eskiManzil = crmConfigniOl(mavjud?.config).address;
  const shuHisob = eskiManzil === n.config.address;
  const qaytaUlanish = ulanganmi(mavjud) && shuHisob;
  const eskiSozlama = sozlamaniOl(mavjud?.config);
  const hozir = new Date();

  const config = {
    ...avvalgi,
    crm: n.config,
    crmHisobUrl: n.hisob.url,
    crmSirKorinishi: n.sirKorinishi,
    crmUlangan: qaytaUlanish && typeof avvalgi.crmUlangan === 'string' ? avvalgi.crmUlangan : hozir.toISOString(),
    crmSozlama: { ...eskiSozlama, boshlanish: qaytaUlanish && eskiSozlama.boshlanish ? eskiSozlama.boshlanish : hozir.toISOString() },
    // Boshqa hisob — lidlar importi boshidan, voronka tanlovi bekor
    ...(shuHisob ? {} : { crmLid: { kursor: null, voronkalar: null, birinchiTugadi: false, oxirgi: null, xato: null } }),
  };

  await withTenant(businessId, async (tx) => {
    const qiymat = {
      status: 'connected' as const,
      config,
      credentialsEncrypted: encryptSecret(n.sir),
      tokenExpiresAt: n.tokenExpiresAt,
      syncEnabled: true,
      lastSyncAt: hozir,
      lastSyncStatus: 'ok',
      lastError: null,
      updatedAt: hozir,
    };
    if (mavjud) {
      await tx.update(integration).set(qiymat).where(eq(integration.id, mavjud.id));
      if (!shuHisob) await tx.delete(crmLead).where(eq(crmLead.integrationId, mavjud.id));
      tuzilishKeshniTozala(mavjud.id);
    } else {
      await tx.insert(integration).values({ businessId, kind, pollIntervalMinutes: 1, ...qiymat });
    }
  });
}

export function registerCrmUlanishRoutes(app: FastifyInstance): void {
  const base = '/api/v1/businesses/:businessId/crm';
  const guard = { preHandler: [requireBusiness, requirePermission('integration:manage')] };
  const sekin = { ...guard, config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  /** Hamma CRM lar: forma tavsifi + holat. Tarmoqqa chiqmaydi. */
  app.get(base, guard, async (req) => {
    const businessId = req.business!.businessId;
    const [qatorlar, soni, bitimSoni, oauth] = await Promise.all([
      qatorlarniOl(businessId),
      withTenant(businessId, (tx) =>
        tx
          .select({ integrationId: crmLead.integrationId, n: count(), oxirgi: max(crmLead.crmUpdatedAt) })
          .from(crmLead)
          .groupBy(crmLead.integrationId),
      ),
      // Ichki CRM ga ko'chirilgan bitimlar soni (CRM bo'yicha)
      withTenant(businessId, (tx) =>
        tx
          .select({ integrationId: deal.integrationId, n: count() })
          .from(deal)
          .where(isNotNull(deal.integrationId))
          .groupBy(deal.integrationId),
      ),
      amoOauthSozlama(),
    ]);
    const crmlar = CRM_TURLARI.map((kind) => {
      const a = ADAPTERLAR[kind];
      const q = qatorlar.find((r) => r.kind === kind);
      const h = holat(kind, q);
      const s = q ? soni.find((x) => x.integrationId === q.id) : undefined;
      return {
        kind,
        name: a.nom,
        description: a.tavsif,
        guide: a.qollanma,
        fields: a.maydonlar,
        /** Bir tugmada ulash (OAuth) mumkinmi — platformada sozlangan bo'lsa. */
        oauthAvailable: kind === 'amocrm' && Boolean(oauth),
        ...h,
        leads: { ...h.leads, count: s ? Number(s.n) : 0, deals: Number((q && bitimSoni.find((x) => x.integrationId === q.id)?.n) ?? 0) },
      };
    });
    return { crmlar, active: crmlar.find((c) => c.connected)?.kind ?? null };
  });

  /**
   * Bir tugmada ulash (amoCRM OAuth) — ruxsat sahifasi manzili. Frontend
   * foydalanuvchini shu manzilga yuboradi; amoCRM ruxsatdan keyin
   * `/api/v1/crm/oauth/amocrm/callback` ga qaytaradi.
   */
  app.post(`${base}/amocrm/oauth`, { ...guard, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const s = await amoOauthSozlama();
    if (!s) throw AppError.badRequest('Bir tugmada ulash hali sozlanmagan — platforma administratori amoCRM integratsiyasini kiritishi kerak');
    const qatorlar = await qatorlarniOl(req.business!.businessId);
    const boshqa = qatorlar.find((q) => q.kind !== 'amocrm' && crmTurimi(q.kind) && ulanganmi(q));
    if (boshqa) {
      throw AppError.conflict(`Avval ${ADAPTERLAR[boshqa.kind as CrmKind].nom} ni uzing — bir vaqtda bitta CRM ulanadi`);
    }
    // Qaytish manzili — faqat shu biznesning o'z manzili (asosiy sayt yoki uning subdomeni).
    // Aks holda callback foydalanuvchini begona saytga yo'naltirishi mumkin edi (open redirect).
    const { qaytish } = z.object({ qaytish: z.string().max(300).optional() }).parse(req.body ?? {});
    let origin: string | undefined;
    try {
      const u = qaytish ? new URL(qaytish) : null;
      if (u && (u.protocol === 'http:' || u.protocol === 'https:') && (rootHostmi(u.host) || hostDanSlug(u.host) === req.business!.slug)) {
        origin = u.origin;
      }
    } catch {
      origin = undefined;
    }
    return { url: oauthHavola(s.clientId, holatYarat(req.business!.businessId, req.auth!.user.id, origin)) };
  });

  /**
   * Ulash / kalitni almashtirish. Saqlashdan OLDIN CRM da haqiqatan
   * tekshiriladi (adapter `ulash`).
   */
  app.put(`${base}/:kind`, { ...guard, config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
    const kind = turniOl(req);
    const body = ulashBody.parse(req.body);
    const businessId = req.business!.businessId;

    const qatorlar = await qatorlarniOl(businessId);
    const boshqa = qatorlar.find((q) => q.kind !== kind && crmTurimi(q.kind) && ulanganmi(q));
    if (boshqa) {
      throw AppError.conflict(`Avval ${ADAPTERLAR[boshqa.kind as CrmKind].nom} ni uzing — bir vaqtda bitta CRM ulanadi`);
    }
    const mavjud = qatorlar.find((q) => q.kind === kind);
    const eski = mavjud ? kontekst(mavjud) : null;

    const n = await ADAPTERLAR[kind].ulash(body.maydonlar, eski).catch(crmXatosi);
    await ulanishniSaqla(businessId, kind, n);
    return { ok: true, account: n.hisob, secretHint: n.sirKorinishi };
  });

  /** Qayta tekshirish. Doimiy xato — holat `error`; vaqtinchalik — o'zgarmaydi. */
  app.post(`${base}/:kind/check`, sekin, async (req) => {
    const kind = turniOl(req);
    const businessId = req.business!.businessId;
    const q = (await qatorlarniOl(businessId)).find((r) => r.kind === kind);
    const ctx = q && ulanganmi(q) ? kontekst(q) : null;
    if (!q || !ctx) throw AppError.badRequest('CRM ulanmagan');

    const hozir = new Date();
    try {
      await ADAPTERLAR[kind].tekshir(ctx);
      await withTenant(businessId, (tx) =>
        tx
          .update(integration)
          .set({ status: 'connected', lastSyncAt: hozir, lastSyncStatus: 'ok', lastError: null, updatedAt: hozir })
          .where(eq(integration.id, q.id)),
      );
      return { ok: true, checkedAt: hozir.toISOString() };
    } catch (err) {
      if (!(err instanceof CrmXato)) throw err;
      await withTenant(businessId, (tx) =>
        tx
          .update(integration)
          .set({
            ...(err.doimiy ? { status: 'error' as const } : {}),
            lastSyncAt: hozir,
            lastSyncStatus: 'error',
            lastError: err.message,
            updatedAt: hozir,
          })
          .where(eq(integration.id, q.id)),
      );
      return { ok: false, checkedAt: hozir.toISOString(), error: err.message };
    }
  });

  /** Hisob tuzilishi — CRM dan jonli. */
  app.get(`${base}/:kind/structure`, sekin, async (req) => {
    const kind = turniOl(req);
    const q = (await qatorlarniOl(req.business!.businessId)).find((r) => r.kind === kind);
    const ctx = q && ulanganmi(q) ? kontekst(q) : null;
    if (!ctx) throw AppError.badRequest('CRM ulanmagan');
    return ADAPTERLAR[kind].tuzilish(ctx).catch(crmXatosi);
  });

  /** SotuvAI CRM ga nima yozsin: izoh, vazifa. */
  app.patch(`${base}/:kind/settings`, guard, async (req) => {
    const kind = turniOl(req);
    const body = sozlamaBody.parse(req.body);
    const businessId = req.business!.businessId;
    const q = (await qatorlarniOl(businessId)).find((r) => r.kind === kind);
    if (!q || !ulanganmi(q)) throw AppError.badRequest('CRM ulanmagan');

    const config = (q.config ?? {}) as Record<string, unknown>;
    const { voronkalar, ichkiCrm, ...qolgan } = body;
    const yangi = crmSozlamaSchema.parse({ ...sozlamaniOl(q.config), ...qolgan });
    const lid = lidSozlamaniOl(q.config);
    // Voronka tanlovi o'zgarsa — import boshidan (yangi tanlangan voronkalar ham kelsin)
    let lidYangi =
      voronkalar === undefined
        ? lid
        : { ...lid, voronkalar: voronkalar && voronkalar.length > 0 ? voronkalar : null, kursor: null, birinchiTugadi: false };
    // Ichki CRM ga ko'chirish qayta yoqilsa — lidlar boshidan qayta olinadi (orada o'zgarganlari ham kelsin)
    if (ichkiCrm !== undefined && ichkiCrm !== lid.ichkiCrm) {
      lidYangi = { ...lidYangi, ichkiCrm, ...(ichkiCrm ? { ichkiBoshlangan: false } : {}) };
    }
    await withTenant(businessId, (tx) =>
      tx
        .update(integration)
        .set({ config: { ...config, crmSozlama: yangi, crmLid: lidYangi }, updatedAt: new Date() })
        .where(eq(integration.id, q.id)),
    );
    if (voronkalar !== undefined || ichkiCrm !== undefined) tuzilishKeshniTozala(q.id);
    return { ok: true, settings: yangi, leads: { voronkalar: lidYangi.voronkalar, ichkiCrm: lidYangi.ichkiCrm } };
  });

  /** Lidlarni hozir olish — keyingi avtomatik tikni kutmasdan (2 sahifagacha). */
  app.post(`${base}/:kind/leads/sync`, sekin, async (req) => {
    const kind = turniOl(req);
    const businessId = req.business!.businessId;
    const q = (await qatorlarniOl(businessId)).find((r) => r.kind === kind);
    if (!q || !ulanganmi(q)) throw AppError.badRequest('CRM ulanmagan');
    const [n] = await crmLidlarniSinxronla({ businessId, maksSahifa: 2 });
    if (!n) throw AppError.badRequest('CRM ulanmagan');
    if (n.xato) throw AppError.badRequest(n.xato);
    return n;
  });

  /** Oxirgi yozuvlar va hisob — "CRM ga nima ketdi" degan savolga javob. */
  app.get(`${base}/:kind/log`, guard, async (req) => {
    const kind = turniOl(req);
    const businessId = req.business!.businessId;
    const q = (await qatorlarniOl(businessId)).find((r) => r.kind === kind);
    if (!q) return { counts: { ok: 0, skipped: 0, error: 0 }, items: [] };

    const [hisob, items] = await withTenant(businessId, (tx) =>
      Promise.all([
        tx
          .select({ status: crmSyncItem.status, n: count() })
          .from(crmSyncItem)
          .where(and(eq(crmSyncItem.integrationId, q.id), eq(crmSyncItem.entity, 'conversation')))
          .groupBy(crmSyncItem.status),
        tx
          .select({
            id: crmSyncItem.id,
            entity: crmSyncItem.entity,
            localId: crmSyncItem.localId,
            status: crmSyncItem.status,
            crmEntity: crmSyncItem.crmEntity,
            crmEntityName: crmSyncItem.crmEntityName,
            crmUrl: crmSyncItem.crmUrl,
            error: crmSyncItem.error,
            attempts: crmSyncItem.attempts,
            updatedAt: crmSyncItem.updatedAt,
          })
          .from(crmSyncItem)
          .where(eq(crmSyncItem.integrationId, q.id))
          .orderBy(desc(crmSyncItem.updatedAt))
          .limit(20),
      ]),
    );
    const n = Object.fromEntries(hisob.map((h) => [h.status, Number(h.n)]));
    return { counts: { ok: n.ok ?? 0, skipped: n.skipped ?? 0, error: n.error ?? 0 }, items };
  });

  /** Uzish — sir o'chiriladi. CRM dagi hech narsaga tegilmaydi, jurnal qoladi. */
  app.delete(`${base}/:kind`, guard, async (req) => {
    const kind = turniOl(req);
    await withTenant(req.business!.businessId, (tx) =>
      tx
        .update(integration)
        .set({
          status: 'disconnected',
          credentialsEncrypted: null,
          tokenExpiresAt: null,
          syncEnabled: false,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(and(eq(integration.kind, kind), ne(integration.status, 'disconnected'))),
    );
    return { ok: true };
  });
}
