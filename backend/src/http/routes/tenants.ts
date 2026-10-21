import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { keshniTozala } from '../../auth/context-cache.js';
import { hashPassword, MIN_PASSWORD_LENGTH } from '../../auth/password.js';
import { revokeAllForUser } from '../../auth/session.js';
import { config } from '../../config.js';
import { isUniqueViolation } from '../../db/errors.js';
import { withoutTenantIsolation } from '../../db/index.js';
import { appUser, auditLog, business, businessMember, passwordReset, subscription } from '../../db/schema/index.js';
import { requireAuth } from '../auth-plugin.js';
import { AppError } from '../errors.js';
import {
  hostDanSlug,
  ROOT_DOMAIN,
  rootHostmi,
  rootUrl,
  SLUG_XATO_MATNI,
  slugBoyichaBiznes,
  slugFormatXatosi,
  tenantUrl,
  type SlugXato,
} from '../tenant.js';
import { requireSuperAdmin } from './admin.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAAS: MIJOZ KABINETLARI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Super admin bitta tugma bilan yangi mijoz yaratadi: biznes + ega (login va
 * parolini admin beradi) + sinov obunasi — bitta tranzaksiyada. Kabinet darhol
 * `<slug>.<ROOT_DOMAIN>` da ishlaydi (alohida server, baza yoki deploy
 * kerak emas: izolyatsiya RLS va `tenant.ts` da).
 *
 * Ochiq endpointlar:
 *   GET /api/v1/public/tenant      — frontend qaysi kabinetda ekanini biladi
 *   GET /api/v1/public/tls-check   — Caddy on-demand TLS: sertifikat faqat
 *                                     mavjud kabinetlarga beriladi
 *
 * ── Parolni faqat admin beradi ──
 * Mijozga taklif havolasi yuborilmaydi: login (email) va parolni super admin
 * o'zi beradi va keyin ham faqat u almashtiradi (`PATCH /tenants/:id`).
 * Mijoz o'zi parol tiklay olmaydi (`password-reset/request` — faqat super admin).
 */

const slugMaydon = z.string().trim().toLowerCase().max(63);

const parolMaydon = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Parol kamida ${MIN_PASSWORD_LENGTH} belgi bo'lishi kerak`)
  .max(200);

const yaratishBody = z.object({
  name: z.string().trim().min(2, "Biznes nomi kamida 2 belgi").max(120),
  slug: slugMaydon,
  ownerEmail: z.string().trim().toLowerCase().email("Email formati noto'g'ri").max(255),
  ownerName: z.string().trim().min(2, 'Ega ismi kamida 2 belgi').max(100),
  ownerPassword: parolMaydon,
  locale: z.enum(['uz', 'ru', 'en']).default('uz'),
  trialDays: z.coerce.number().int().min(1).max(90).default(14),
});

/**
 * Tahrirlash: kabinet (nom, til) va ega (ism, login, parol) — bitta
 * tranzaksiyada. Subdomen bu yerda faqat yaroqsiz eski qiymatni BIR MARTA
 * tuzatish uchun: yaroqli subdomen yaratilgandan keyin o'zgarmaydi
 * (havolalar, xodimlar xatcho'plari va TLS sertifikati shunga bog'langan).
 */
const tahrirBody = z
  .object({
    name: z.string().trim().min(2, 'Biznes nomi kamida 2 belgi').max(120).optional(),
    locale: z.enum(['uz', 'ru', 'en']).optional(),
    slug: slugMaydon.optional(),
    ownerName: z.string().trim().min(2, 'Ega ismi kamida 2 belgi').max(100).optional(),
    ownerEmail: z.string().trim().toLowerCase().email("Email formati noto'g'ri").max(255).optional(),
    ownerPassword: parolMaydon.optional(),
  })
  .refine((b) => Object.values(b).some((v) => v !== undefined), "O'zgartirish uchun kamida bitta maydon kerak");

/** Slug yaroqlimi va bo'shmi. `exceptId` — o'z subdomenini qayta saqlash band hisoblanmasin. */
async function slugTekshir(slug: string, exceptId?: string): Promise<SlugXato | null> {
  const format = slugFormatXatosi(slug);
  if (format) return format;
  // O'chirilgan bizneslar ham hisobga olinadi: unikal indeks ularni ham qamraydi,
  // va eski mijozning subdomenini darhol boshqaga berish havolalarni chalkashtirardi.
  const [bor] = await withoutTenantIsolation('saas: subdomen bandligini tekshirish', (tx) =>
    tx.select({ id: business.id }).from(business).where(eq(business.slug, slug)).limit(1),
  );
  if (bor && bor.id !== exceptId) return 'band';
  return null;
}

function slugXatosiniOt(sabab: SlugXato): never {
  if (sabab === 'band') throw AppError.conflict(SLUG_XATO_MATNI.band);
  throw AppError.badRequest(SLUG_XATO_MATNI[sabab]);
}

async function audit(req: FastifyRequest, action: string, businessId: string, before: unknown, after: unknown) {
  await withoutTenantIsolation('saas audit: platforma darajasidagi amal', (tx) =>
    tx.insert(auditLog).values({
      businessId,
      actorId: req.auth!.user.id,
      action,
      entity: 'business',
      entityId: businessId,
      before: before as never,
      after: after as never,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    }),
  );
}

/** Kabinet egasi — eng birinchi qo'shilgan `owner`. */
async function eganiTop(businessId: string): Promise<string | null> {
  const [ega] = await withoutTenantIsolation('saas: mijoz egasini topish', (tx) =>
    tx
      .select({ userId: businessMember.userId })
      .from(businessMember)
      .where(and(eq(businessMember.businessId, businessId), eq(businessMember.role, 'owner')))
      .orderBy(asc(businessMember.addedAt))
      .limit(1),
  );
  return ega?.userId ?? null;
}

/**
 * Admin o'zi a'zo bo'lgan kabinetni to'xtata yoki o'chira olmaydi: Sozlamalar
 * (shu jumladan Mijozlar paneli) biznes ichida ochiladi — o'z kabinetini
 * o'chirgan admin platformani boshqarish imkonidan qulflanib qolardi.
 */
async function ozKabinetimi(req: FastifyRequest, businessId: string): Promise<boolean> {
  const rows = await withoutTenantIsolation("saas: admin o'z kabinetimi", (tx) =>
    tx.execute(sql`
      select 1 from business_member where business_id = ${businessId} and user_id = ${req.auth!.user.id} and is_active
      union all
      select 1 from seat where business_id = ${businessId} and user_id = ${req.auth!.user.id} and is_active
      limit 1
    `),
  );
  return (rows as unknown[]).length > 0;
}

interface MijozQator {
  id: string;
  slug: string;
  name: string;
  locale: string;
  createdAt: string;
  ownerEmail: string | null;
  ownerName: string | null;
  ownerActivated: boolean;
  subscriptionStatus: string | null;
  trialEndsAt: string | null;
  members: number;
  seats: number;
  onboardingStep: string;
  /** Faolsizlantirilgan payt (null — faol). */
  suspendedAt: string | null;
}

async function mijozlarRoyxati(id?: string): Promise<MijozQator[]> {
  const rows = await withoutTenantIsolation('saas: mijozlar ro\'yxati platforma darajasida', (tx) =>
    tx.execute(sql`
      select
        b.id, b.slug, b.name, b.locale, b.created_at as "createdAt", b.onboarding_step as "onboardingStep",
        b.suspended_at as "suspendedAt",
        o.email as "ownerEmail", o.display_name as "ownerName", (o.password_hash is not null) as "ownerActivated",
        s.status as "subscriptionStatus", s.trial_ends_at as "trialEndsAt",
        (select count(*)::int from business_member m where m.business_id = b.id and m.is_active) as members,
        (select count(*)::int from seat st where st.business_id = b.id and st.is_active) as seats
      from business b
      left join lateral (
        select u.email, u.display_name, u.password_hash
        from business_member bm join app_user u on u.id = bm.user_id
        where bm.business_id = b.id and bm.role = 'owner'
        order by bm.added_at asc limit 1
      ) o on true
      left join lateral (
        select status, trial_ends_at from subscription where business_id = b.id
        order by created_at desc limit 1
      ) s on true
      where b.deleted_at is null ${id ? sql`and b.id = ${id}` : sql``}
      order by b.created_at desc
    `),
  );
  return (rows as unknown as MijozQator[]).map((r) => ({
    ...r,
    createdAt: new Date(r.createdAt).toISOString(),
    trialEndsAt: r.trialEndsAt ? new Date(r.trialEndsAt).toISOString() : null,
    suspendedAt: r.suspendedAt ? new Date(r.suspendedAt).toISOString() : null,
  }));
}

/** Javob shakli: qator + kabinet manzili + subdomen yaroqliligi. */
function qatorJavob(r: MijozQator) {
  const yaroqli = slugFormatXatosi(r.slug) === null;
  return { ...r, url: yaroqli ? tenantUrl(r.slug) : null, slugYaroqli: yaroqli };
}

export function registerTenantRoutes(app: FastifyInstance): void {
  const guard = { preHandler: [requireAuth, requireSuperAdmin] };

  // ─── Ochiq: frontend qaysi kabinetda ekanini biladi ───────────────────────

  app.get('/api/v1/public/tenant', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (req) => {
    const umumiy = { rootUrl: rootUrl(), rootDomain: ROOT_DOMAIN };
    if (!req.tenantSlug) return { tur: 'root' as const, ...umumiy };
    const t = slugFormatXatosi(req.tenantSlug) === null ? await slugBoyichaBiznes(req.tenantSlug) : null;
    if (!t) return { tur: 'topilmadi' as const, slug: req.tenantSlug, ...umumiy };
    // To'xtatilgan kabinet: login o'rniga tushuntiruvchi ekran ko'rsatiladi
    if (t.faolsiz) return { tur: 'faolsiz' as const, slug: t.slug, name: t.name, ...umumiy };
    return { tur: 'tenant' as const, slug: t.slug, name: t.name, logoUrl: t.logoUrl, locale: t.locale, ...umumiy };
  });

  /**
   * Caddy on-demand TLS "ask": sertifikat faqat mavjud kabinet uchun.
   * Aks holda istalgan `random.example.uz` so'rovi Let's Encrypt
   * limitlarini tugatib, haqiqiy mijozlarni sertifikatsiz qoldirardi.
   */
  app.get('/api/v1/public/tls-check', { config: { rateLimit: { max: 600, timeWindow: '1 minute' } } }, async (req, reply) => {
    const { domain } = z.object({ domain: z.string().trim().toLowerCase().max(255) }).parse(req.query);
    if (rootHostmi(domain)) return { ok: true };
    const slug = hostDanSlug(domain);
    if (slug && slugFormatXatosi(slug) === null && (await slugBoyichaBiznes(slug))) return { ok: true };
    reply.status(404);
    return { ok: false };
  });

  // ─── Super admin: mijozlar ────────────────────────────────────────────────

  app.get('/api/v1/admin/tenants', guard, async () => {
    const qatorlar = await mijozlarRoyxati();
    return { rootDomain: ROOT_DOMAIN, rootUrl: rootUrl(), items: qatorlar.map(qatorJavob) };
  });

  app.get('/api/v1/admin/tenants/slug-check', guard, async (req) => {
    const { slug, exceptId } = z
      .object({ slug: slugMaydon, exceptId: z.string().uuid().optional() })
      .parse(req.query);
    const sabab = await slugTekshir(slug, exceptId);
    return sabab
      ? { ok: false, sabab, matn: SLUG_XATO_MATNI[sabab] }
      : { ok: true, url: tenantUrl(slug) };
  });

  /** Bitta tugma: yangi mijoz kabineti. */
  app.post('/api/v1/admin/tenants', guard, async (req, reply) => {
    const { ownerPassword, ...body } = yaratishBody.parse(req.body);
    const sabab = await slugTekshir(body.slug);
    if (sabab) slugXatosiniOt(sabab);
    // Tranzaksiyadan oldin: argon2 ataylab sekin — tranzaksiya ochiq turmasin
    const parolXesh = await hashPassword(ownerPassword);

    let natija: { businessId: string; ownerExisted: boolean; parolBerildi: boolean };
    try {
      natija = await withoutTenantIsolation('saas: yangi mijoz — biznes hali mavjud emas', async (tx) => {
        // Ega: bor foydalanuvchi bo'lsa — o'sha (bitta odam bir nechta biznesda bo'lishi mumkin, FR-08)
        const [bor] = await tx
          .select({ id: appUser.id, passwordHash: appUser.passwordHash, deletedAt: appUser.deletedAt })
          .from(appUser)
          .where(eq(appUser.email, body.ownerEmail))
          .limit(1);
        if (bor?.deletedAt) throw AppError.conflict("Bu email o'chirilgan hisobga tegishli — boshqa email kiriting");

        /**
         * Paroli bor mavjud foydalanuvchining paroli o'zgartirilmaydi: u boshqa
         * kabinetlarga ham shu parol bilan kiradi. Kerak bo'lsa admin uni
         * «Login va parol» orqali ataylab almashtiradi.
         */
        let userId = bor?.id;
        let parolBerildi = false;
        if (!userId) {
          const [yangi] = await tx
            .insert(appUser)
            .values({
              email: body.ownerEmail,
              displayName: body.ownerName,
              locale: body.locale,
              systemRole: 'business_owner',
              passwordHash: parolXesh,
            })
            .returning({ id: appUser.id });
          userId = yangi!.id;
          parolBerildi = true;
        } else if (!bor!.passwordHash) {
          await tx.update(appUser).set({ passwordHash: parolXesh, updatedAt: new Date() }).where(eq(appUser.id, userId));
          parolBerildi = true;
        }

        const [biz] = await tx
          .insert(business)
          .values({ slug: body.slug, name: body.name, locale: body.locale })
          .returning({ id: business.id });

        await tx.insert(businessMember).values({
          businessId: biz!.id,
          userId,
          role: 'owner',
          activation: 'active',
          invitedVia: 'email',
        });

        // Narx yaratilgan paytda qulflanadi — keyin platforma narxi o'zgarsa ham shu qoladi
        await tx.insert(subscription).values({
          businessId: biz!.id,
          status: 'trial',
          trialEndsAt: new Date(Date.now() + body.trialDays * 24 * 60 * 60 * 1000),
          seatPrice: config.SEAT_PRICE_UZS.toFixed(2),
        });

        return { businessId: biz!.id, ownerExisted: Boolean(bor), parolBerildi };
      });
    } catch (err) {
      // Parallel ikki so'rov bir xil subdomenni olishga urinsa — unikal indeks hakam
      if (isUniqueViolation(err, 'business_slug_uq')) throw AppError.conflict(SLUG_XATO_MATNI.band);
      throw err;
    }

    keshniTozala(); // /admin/ yo'li kesh naqshiga tushmaydi — mavjud egada yangi biznes darhol ko'rinsin
    // Parolning o'zi auditga yozilmaydi — faqat berilgan-berilmagani
    await audit(req, 'tenant.create', natija.businessId, null, {
      ...body,
      ownerExisted: natija.ownerExisted,
      parolBerildi: natija.parolBerildi,
    });
    const [qator] = await mijozlarRoyxati(natija.businessId);

    reply.status(201);
    return { tenant: qatorJavob(qator!), ownerExisted: natija.ownerExisted, parolBerildi: natija.parolBerildi };
  });

  /**
   * Tahrirlash — kabinet va ega ma'lumotlari, bitta tranzaksiyada.
   *
   * Ega emaili (login) — foydalanuvchi darajasida: ega boshqa kabinetlarda
   * ham bo'lsa, u yerga ham yangi email bilan kiradi (bitta odam — bitta login).
   * Parol almashsa — ega hamma qurilmadan chiqariladi va ishlatilmagan
   * tiklash/taklif havolalari bekor bo'ladi. Faqat email almashsa sessiyalar
   * tegilmaydi.
   */
  app.patch('/api/v1/admin/tenants/:id', guard, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const body = tahrirBody.parse(req.body);
    const [oldin] = await mijozlarRoyxati(id);
    if (!oldin) throw AppError.notFound();

    // ── Subdomen: yaratilgandan keyin o'zgarmaydi; faqat yaroqsiz eskisini bir marta tuzatish ──
    const yangiSlug = body.slug !== undefined && body.slug !== oldin.slug ? body.slug : undefined;
    if (yangiSlug) {
      if (slugFormatXatosi(oldin.slug) === null) {
        throw AppError.conflict("Subdomen yaratilgandan keyin o'zgartirilmaydi — havolalar va xodimlar shu manzilga bog'langan");
      }
      const sabab = await slugTekshir(yangiSlug, id);
      if (sabab) slugXatosiniOt(sabab);
    }

    // ── Ega ──
    const egaKerak = body.ownerName !== undefined || body.ownerEmail !== undefined || body.ownerPassword !== undefined;
    const egaId = egaKerak ? await eganiTop(id) : null;
    if (egaKerak && !egaId) throw AppError.badRequest("Bu kabinetda ega yo'q");
    const yangiEmail = body.ownerEmail !== undefined && body.ownerEmail !== oldin.ownerEmail ? body.ownerEmail : undefined;
    if (yangiEmail) {
      const [band] = await withoutTenantIsolation('saas: email bandligini tekshirish', (tx) =>
        tx.select({ id: appUser.id }).from(appUser).where(eq(appUser.email, yangiEmail)).limit(1),
      );
      if (band && band.id !== egaId) throw AppError.conflict('Bu email boshqa hisobga tegishli — boshqasini kiriting');
    }
    // Tranzaksiyadan oldin: argon2 ataylab sekin
    const parolXesh = body.ownerPassword !== undefined ? await hashPassword(body.ownerPassword) : undefined;

    const kabinetga = {
      ...(body.name !== undefined && body.name !== oldin.name ? { name: body.name } : {}),
      ...(body.locale !== undefined && body.locale !== oldin.locale ? { locale: body.locale } : {}),
      ...(yangiSlug ? { slug: yangiSlug } : {}),
    };
    const egaga = {
      ...(body.ownerName !== undefined && body.ownerName !== oldin.ownerName ? { displayName: body.ownerName } : {}),
      ...(yangiEmail ? { email: yangiEmail, emailVerifiedAt: null } : {}),
      ...(parolXesh ? { passwordHash: parolXesh } : {}),
    };
    if (Object.keys(kabinetga).length === 0 && Object.keys(egaga).length === 0) return { tenant: qatorJavob(oldin) };

    try {
      await withoutTenantIsolation("saas: mijoz kabineti va egasini tahrirlash", async (tx) => {
        if (Object.keys(kabinetga).length > 0) {
          await tx
            .update(business)
            .set({ ...kabinetga, updatedAt: new Date() })
            .where(and(eq(business.id, id), isNull(business.deletedAt)));
        }
        if (egaId && Object.keys(egaga).length > 0) {
          await tx.update(appUser).set({ ...egaga, updatedAt: new Date() }).where(eq(appUser.id, egaId));
        }
        if (egaId && parolXesh) {
          await tx
            .update(passwordReset)
            .set({ usedAt: new Date() })
            .where(and(eq(passwordReset.userId, egaId), isNull(passwordReset.usedAt)));
        }
      });
    } catch (err) {
      // Parallel so'rov shu subdomen/emailni olib qo'ygan bo'lsa — unikal indeks hakam
      if (isUniqueViolation(err, 'business_slug_uq')) throw AppError.conflict(SLUG_XATO_MATNI.band);
      if (isUniqueViolation(err, 'app_user_email_uq')) throw AppError.conflict('Bu email boshqa hisobga tegishli — boshqasini kiriting');
      throw err;
    }
    if (egaId && parolXesh) await revokeAllForUser(egaId);
    keshniTozala(); // nom, slug va email auth kontekstida ham turadi

    // Parolning o'zi auditga yozilmaydi — faqat o'zgargani
    const { passwordHash: _yashirin, ...egaAudit } = egaga;
    await audit(
      req,
      'tenant.update',
      id,
      { name: oldin.name, locale: oldin.locale, slug: oldin.slug, ownerName: oldin.ownerName, ownerEmail: oldin.ownerEmail },
      { ...kabinetga, ...egaAudit, parolAlmashdi: Boolean(parolXesh) },
    );
    const [keyin] = await mijozlarRoyxati(id);
    return { tenant: qatorJavob(keyin!) };
  });

  /**
   * Faolsizlantirish / qayta faollashtirish. Ma'lumotlar o'chmaydi.
   * Faolsiz kabinet: xodimlar kira olmaydi (auth kontekstida yo'q), subdomenda
   * tushuntiruvchi ekran, yangi tahlil navbatga qo'yilmaydi (`isAnalysisBlocked`).
   */
  app.post('/api/v1/admin/tenants/:id/status', guard, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { faol } = z.object({ faol: z.boolean() }).parse(req.body);
    const [oldin] = await mijozlarRoyxati(id);
    if (!oldin) throw AppError.notFound();
    if (!faol && (await ozKabinetimi(req, id))) {
      throw AppError.conflict("O'zingiz a'zo bo'lgan kabinetni faolsizlantirib bo'lmaydi — aks holda boshqaruv paneliga kira olmay qolasiz");
    }
    if (faol === (oldin.suspendedAt === null)) return { tenant: qatorJavob(oldin) }; // holat o'zgarmadi

    await withoutTenantIsolation('saas: kabinet holatini o\'zgartirish', (tx) =>
      tx
        .update(business)
        .set({ suspendedAt: faol ? null : new Date(), updatedAt: new Date() })
        .where(and(eq(business.id, id), isNull(business.deletedAt))),
    );
    keshniTozala(); // xodimlarning keshlangan konteksti darhol yangilansin
    await audit(req, faol ? 'tenant.activate' : 'tenant.suspend', id, { suspendedAt: oldin.suspendedAt }, { faol });
    const [keyin] = await mijozlarRoyxati(id);
    return { tenant: qatorJavob(keyin!) };
  });

  /**
   * O'chirish — yumshoq (FR-159: ma'lumot 90 kun saqlanadi). Kabinet
   * ro'yxatdan, kirishdan va barcha fon jarayonlaridan chiqadi; subdomen
   * boshqa mijozga berilmaydi (eski havolalar adashtirmasin).
   * Tasodifiy o'chirishga qarshi: so'rov biznes nomini aynan takrorlashi kerak.
   */
  app.delete('/api/v1/admin/tenants/:id', guard, async (req) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params);
    const { tasdiq } = z.object({ tasdiq: z.string().trim().max(200).default('') }).parse(req.query);
    const [oldin] = await mijozlarRoyxati(id);
    if (!oldin) throw AppError.notFound();
    if (tasdiq !== oldin.name.trim()) throw AppError.badRequest("Tasdiqlash uchun biznes nomini aynan yozing");
    if (await ozKabinetimi(req, id)) {
      throw AppError.conflict("O'zingiz a'zo bo'lgan kabinetni o'chirib bo'lmaydi — aks holda boshqaruv paneliga kira olmay qolasiz");
    }

    await withoutTenantIsolation('saas: kabinetni o\'chirish (yumshoq)', (tx) =>
      tx
        .update(business)
        .set({ deletedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(business.id, id), isNull(business.deletedAt))),
    );
    keshniTozala();
    await audit(req, 'tenant.delete', id, { name: oldin.name, slug: oldin.slug, ownerEmail: oldin.ownerEmail }, null);
    return { ok: true };
  });
}
