import { and, count, desc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { decryptSecret, encryptSecret, maskSecret } from '../../crypto/secrets.js';
import { withTenant } from '../../db/index.js';
import { appUser, conversation, integration, seat } from '../../db/schema/index.js';
import {
  moizvonkiConfigSchema,
  mzIdlar,
  MoizvonkiXato,
  sinxronla,
  subdomenniAjrat,
  ulanishniTekshir,
  xodimlarniOl,
  xodimniBogla,
} from '../../integrations/moizvonki.js';
import { requireBusiness, requirePermission } from '../auth-plugin.js';
import { AppError } from '../errors.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOI ZVONKI — sozlash, holat, xodimlarni bog'lash
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Mantiq `integrations/moizvonki.ts` da; bu yerda faqat HTTP qatlami.
 *
 * API kalit HECH QACHON qaytarilmaydi — faqat niqob. Bir marta kiritilgach
 * uni ko'rish emas, faqat almashtirish mumkin.
 */

const sozlashBody = z.object({
  /** `kompaniya`, `kompaniya.moizvonki.ru` yoki `https://kompaniya.moizvonki.ru/` */
  domain: z.string().trim().min(1).max(200),
  userName: z.string().trim().toLowerCase().email().max(200),
  /** `null` — eski kalit qoladi. */
  apiKey: z.string().trim().min(8).max(200).nullable().default(null),
  autoAnalyze: z.boolean().default(true),
  minDurationSeconds: z.number().int().min(0).max(600).default(20),
  backfillDays: z.number().int().min(0).max(30).default(1),
});

const boglashBody = z.object({
  xodimId: z.string().trim().min(1).max(64),
  seatId: z.string().uuid().nullable(),
});

/** Integratsiya qatori — kalit shifr ochilgan holda. */
async function qatorniOl(businessId: string) {
  const [row] = await withTenant(businessId, (tx) =>
    tx
      .select({
        id: integration.id,
        status: integration.status,
        config: integration.config,
        creds: integration.credentialsEncrypted,
        lastSyncAt: integration.lastSyncAt,
        lastError: integration.lastError,
      })
      .from(integration)
      .where(eq(integration.kind, 'moizvonki'))
      .limit(1),
  );
  if (!row) return null;
  const cfg = moizvonkiConfigSchema.parse((row.config as Record<string, unknown>)?.moizvonki ?? {});
  let apiKey: string | null = null;
  try {
    apiKey = row.creds ? decryptSecret(row.creds) : null;
  } catch {
    apiKey = null;
  }
  return { ...row, cfg, apiKey };
}

export function registerMoizvonkiRoutes(app: FastifyInstance): void {
  const base = '/api/v1/businesses/:businessId/integrations/moizvonki';

  /** Holat: sozlama, oxirgi sinxronlash va qo'ng'iroqlar hisobi. */
  app.get(base, { preHandler: [requireBusiness, requirePermission('business:read')] }, async (req) => {
    const businessId = req.business!.businessId;
    const q = await qatorniOl(businessId);

    const holatlar = await withTenant(businessId, (tx) =>
      tx
        .select({ status: conversation.status, n: count() })
        .from(conversation)
        .where(eq(conversation.externalSource, 'moizvonki'))
        .groupBy(conversation.status),
    );
    const [boglanmagan] = await withTenant(businessId, (tx) =>
      tx
        .select({ n: count() })
        .from(conversation)
        .where(
          and(
            eq(conversation.externalSource, 'moizvonki'),
            sql`${conversation.seatId} is null`,
          ),
        ),
    );
    const oxirgiXatolar = await withTenant(businessId, (tx) =>
      tx
        .select({
          id: conversation.id,
          startedAt: conversation.startedAt,
          reason: conversation.excludedReason,
        })
        .from(conversation)
        .where(and(eq(conversation.externalSource, 'moizvonki'), eq(conversation.status, 'failed')))
        .orderBy(desc(conversation.updatedAt))
        .limit(5),
    );

    const hisob = Object.fromEntries(holatlar.map((h) => [h.status, Number(h.n)]));

    return {
      connected: q?.status === 'connected',
      config: q
        ? {
            domain: q.cfg.domain,
            userName: q.cfg.userName,
            autoAnalyze: q.cfg.autoAnalyze,
            minDurationSeconds: q.cfg.minDurationSeconds,
            backfillDays: q.cfg.backfillDays,
            lastCallId: q.cfg.lastCallId,
            lastStats: q.cfg.lastStats,
          }
        : null,
      keyHint: q?.apiKey ? maskSecret(q.apiKey) : null,
      lastSyncAt: q?.lastSyncAt ?? null,
      lastError: q?.lastError ?? null,
      counts: {
        kutmoqda: hisob.received ?? 0,
        ishlanmoqda: (hisob.transcribing ?? 0) + (hisob.analyzing ?? 0),
        baholandi: hisob.done ?? 0,
        filtrlangan: hisob.filtered ?? 0,
        xato: hisob.failed ?? 0,
        boglanmagan: Number(boglanmagan?.n ?? 0),
      },
      recentErrors: oxirgiXatolar,
    };
  });

  /**
   * Ulash / sozlamani yangilash.
   *
   * Saqlashdan OLDIN ulanish haqiqatan tekshiriladi. Noto'g'ri kalit
   * "saqlandi ✓" deb ko'rsatilib, keyin jimgina ishlamay yotsa — eng
   * yomon tajriba: odam bir haftadan keyin "nega qo'ng'iroqlar yo'q" deb
   * so'raydi.
   */
  app.put(base, { preHandler: [requireBusiness, requirePermission('integration:manage')] }, async (req) => {
    const body = sozlashBody.parse(req.body);
    const businessId = req.business!.businessId;

    const domain = subdomenniAjrat(body.domain);
    if (!domain) {
      throw AppError.badRequest('Manzil noto\'g\'ri. Masalan: kompaniya.moizvonki.ru');
    }

    const mavjud = await qatorniOl(businessId);
    const apiKey = body.apiKey ?? mavjud?.apiKey ?? null;
    if (!apiKey) throw AppError.badRequest('API kalitni kiriting');

    try {
      await ulanishniTekshir({ domain, userName: body.userName }, apiKey);
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      throw AppError.badRequest(
        `Moi Zvonki ulanishni rad etdi: ${m}. Email, kalit va manzilni tekshiring; ` +
          'boshqa menejerlarning qo\'ng\'iroqlarini olish uchun foydalanuvchi rahbar (supervisor) bo\'lishi kerak.',
      );
    }

    /**
     * Manzil yoki foydalanuvchi o'zgarsa — boshqa hisob. Eski
     * `lastCallId` u yerda ma'nosiz (boshqa ID ketma-ketligi), shuning
     * uchun sinxronlash qaytadan `backfillDays` dan boshlanadi.
     */
    const boshqaHisob =
      !mavjud || mavjud.cfg.domain !== domain || mavjud.cfg.userName !== body.userName;

    const cfg = moizvonkiConfigSchema.parse({
      ...(mavjud?.cfg ?? {}),
      domain,
      userName: body.userName,
      autoAnalyze: body.autoAnalyze,
      minDurationSeconds: body.minDurationSeconds,
      backfillDays: body.backfillDays,
      lastCallId: boshqaHisob ? null : (mavjud?.cfg.lastCallId ?? null),
      lastStats: boshqaHisob ? null : (mavjud?.cfg.lastStats ?? null),
    });

    await withTenant(businessId, async (tx) => {
      if (mavjud) {
        const config = (mavjud.config ?? {}) as Record<string, unknown>;
        await tx
          .update(integration)
          .set({
            status: 'connected',
            config: { ...config, moizvonki: cfg },
            credentialsEncrypted: encryptSecret(apiKey),
            syncEnabled: true,
            lastError: null,
            updatedAt: new Date(),
          })
          .where(eq(integration.id, mavjud.id));
      } else {
        await tx.insert(integration).values({
          businessId,
          kind: 'moizvonki',
          status: 'connected',
          config: { moizvonki: cfg },
          credentialsEncrypted: encryptSecret(apiKey),
          pollIntervalMinutes: 2,
        });
      }
    });

    return { ok: true, domain, keyHint: maskSecret(apiKey) };
  });

  /** Uzish — kalit o'chiriladi, qo'ng'iroqlar va baholar joyida qoladi. */
  app.delete(base, { preHandler: [requireBusiness, requirePermission('integration:manage')] }, async (req) => {
    const businessId = req.business!.businessId;
    await withTenant(businessId, (tx) =>
      tx
        .update(integration)
        .set({
          status: 'disconnected',
          credentialsEncrypted: null,
          syncEnabled: false,
          updatedAt: new Date(),
        })
        .where(eq(integration.kind, 'moizvonki')),
    );
    return { ok: true };
  });

  /** Hozir sinxronlash — keyingi avtomatik tikni kutmasdan. */
  app.post(`${base}/sync`, { preHandler: [requireBusiness, requirePermission('integration:manage')] }, async (req) => {
    const [natija] = await sinxronla(req.business!.businessId);
    if (!natija) throw AppError.badRequest('Moi Zvonki ulanmagan');
    return natija;
  });

  /** Xatoga uchragan qo'ng'iroqlarni qayta navbatga qo'yish. */
  app.post(`${base}/retry`, { preHandler: [requireBusiness, requirePermission('integration:manage')] }, async (req) => {
    const rows = await withTenant(req.business!.businessId, (tx) =>
      tx
        .update(conversation)
        .set({ status: 'received', excludedReason: null, updatedAt: new Date() })
        .where(and(eq(conversation.externalSource, 'moizvonki'), eq(conversation.status, 'failed')))
        .returning({ id: conversation.id }),
    );
    return { requeued: rows.length };
  });

  /**
   * Xodimlar va ularning menejerlarga bog'lanishi.
   *
   * `company.list_employee` faqat ADMIN huquqli foydalanuvchiga ochiq.
   * Huquq bo'lmasa xato bermaymiz — sinxronlangan qo'ng'iroqlardagi
   * xodimlar ro'yxatini ko'rsatamiz (ismsiz, faqat ID va email bilan).
   * Shunda ham bog'lash ishlaydi.
   */
  app.get(`${base}/employees`, { preHandler: [requireBusiness, requirePermission('business:read')] }, async (req) => {
    const businessId = req.business!.businessId;
    const q = await qatorniOl(businessId);
    if (!q?.cfg.domain || !q.cfg.userName || !q.apiKey) {
      throw AppError.badRequest('Moi Zvonki ulanmagan');
    }

    let xodimlar: { id: string; email: string | null; name: string | null }[] = [];
    let manba: 'api' | 'qongiroqlar' = 'api';
    let izoh: string | null = null;
    try {
      xodimlar = (await xodimlarniOl({ domain: q.cfg.domain, userName: q.cfg.userName }, q.apiKey)).map(
        (x) => ({ id: x.id, email: x.email ?? null, name: x.display_name ?? null }),
      );
    } catch (err) {
      manba = 'qongiroqlar';
      izoh =
        err instanceof MoizvonkiXato && (err.status === 401 || err.status === 403)
          ? 'Xodimlar ro\'yxatini olish uchun Moi Zvonki admin huquqi kerak — qo\'ng\'iroqlardan topilganlar ko\'rsatilmoqda.'
          : 'Xodimlar ro\'yxati olinmadi — qo\'ng\'iroqlardan topilganlar ko\'rsatilmoqda.';
      const rows = await withTenant(businessId, (tx) =>
        tx
          .selectDistinct({ id: conversation.externalUserId })
          .from(conversation)
          .where(
            and(
              eq(conversation.externalSource, 'moizvonki'),
              sql`${conversation.externalUserId} is not null`,
            ),
          ),
      );
      xodimlar = rows.map((r) => ({ id: String(r.id), email: null, name: null }));
    }

    const orinlar = await withTenant(businessId, (tx) =>
      tx
        .select({
          id: seat.id,
          name: seat.displayName,
          login: seat.login,
          ext: seat.externalIds,
          email: appUser.email,
        })
        .from(seat)
        .leftJoin(appUser, eq(appUser.id, seat.userId))
        .where(eq(seat.isActive, true)),
    );

    const qongiroqSoni = await withTenant(businessId, (tx) =>
      tx
        .select({ id: conversation.externalUserId, n: count() })
        .from(conversation)
        .where(eq(conversation.externalSource, 'moizvonki'))
        .groupBy(conversation.externalUserId),
    );
    const soni = new Map(qongiroqSoni.map((r) => [String(r.id), Number(r.n)]));

    return {
      manba,
      izoh,
      seats: orinlar.map((o) => ({ id: o.id, name: o.name })),
      employees: xodimlar.map((x) => {
        const boglangan = orinlar.find(
          (o) => mzIdlar(o.ext).includes(x.id),
        );
        /**
         * Taklif — email mos kelgan menejer. Faqat TAKLIF: avtomatik
         * bog'lamaymiz, chunki bir xil emailli ikki hisob (eski va yangi)
         * bo'lishi mumkin va noto'g'ri bog'lash balllarni boshqa odamga
         * yozib yuborardi.
         */
        const taklif =
          !boglangan && x.email
            ? orinlar.find(
                (o) =>
                  (o.email && o.email.toLowerCase() === x.email!.toLowerCase()) ||
                  (o.login && o.login.toLowerCase() === x.email!.toLowerCase()),
              )
            : undefined;
        return {
          id: x.id,
          email: x.email,
          name: x.name,
          seatId: boglangan?.id ?? null,
          suggestedSeatId: taklif?.id ?? null,
          calls: soni.get(x.id) ?? 0,
        };
      }),
    };
  });

  app.put(`${base}/employees`, { preHandler: [requireBusiness, requirePermission('integration:manage')] }, async (req) => {
    const body = boglashBody.parse(req.body);
    try {
      return await xodimniBogla(req.business!.businessId, body.xodimId, body.seatId);
    } catch (err) {
      throw AppError.badRequest(err instanceof Error ? err.message : 'Bog\'lab bo\'lmadi');
    }
  });
}
