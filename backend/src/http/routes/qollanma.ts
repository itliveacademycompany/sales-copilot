import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { and, asc, eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { config } from '../../config.js';
import { db, withoutTenantIsolation } from '../../db/index.js';
import { auditLog, guideVideo } from '../../db/schema/index.js';
import { havolaniTahlilQil, oembedOl, type HavolaNatija } from '../../qollanma/havola.js';
import { MUQOVA, navbatgaQosh, papkaniOchir, tayyorVideo, videoPapka, yarimQolganlarniTikla } from '../../qollanma/media.js';
import { requireAuth } from '../auth-plugin.js';
import { AppError } from '../errors.js';
import { requireSuperAdmin } from './admin.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QO'LLANMA — platformadan foydalanish bo'yicha video darslar
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ko'rish — har qanday kirgan foydalanuvchi (sotuvchi ham). Qo'shish,
 * tahrirlash, tartiblash, o'chirish — faqat super admin.
 *
 * Video ikki xil:
 *   havola — YouTube, Vimeo, Drive, … (pleyer manzili `havola.ts` da)
 *   fayl   — serverga yuklanadi: avval yozuv (`POST`), keyin fayl
 *            (`PUT /:id/fayl`). Ikki qadam ataylab: katta fayl uzilsa ham
 *            sarlavha/tavsif yo'qolmaydi va faylni keyin almashtirsa bo'ladi.
 */

const idParam = z.object({ id: z.string().uuid() });

const ixtiyoriyMatn = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

const yaratish = z.object({
  title: z.string().trim().min(2, 'Sarlavha kamida 2 belgi').max(200),
  description: ixtiyoriyMatn(3000),
  category: ixtiyoriyMatn(60),
  isPublished: z.boolean().default(true),
  source: z.enum(['link', 'file']),
  url: z.string().trim().max(2000).optional(),
});

const tahrirlash = z.object({
  title: z.string().trim().min(2, 'Sarlavha kamida 2 belgi').max(200).optional(),
  description: ixtiyoriyMatn(3000),
  category: ixtiyoriyMatn(60),
  isPublished: z.boolean().optional(),
  /** Berilsa — video havolaga almashadi (yuklangan fayl o'chiriladi). */
  url: z.string().trim().max(2000).optional(),
});

type Qator = typeof guideVideo.$inferSelect;

/** Javob shakli. Pleyer maydonlari o'qish paytida hisoblanadi (havola.ts izohi). */
function javob(q: Qator, admin: boolean) {
  const v = q.updatedAt.getTime();
  let pleyer: Pick<HavolaNatija, 'pleyer' | 'embedUrl' | 'vertikal'> & { provayder: string; muqova: string | null };
  if (q.source === 'file') {
    pleyer = {
      provayder: 'yuklangan',
      pleyer: 'video',
      // `?v=` — fayl almashtirilsa brauzer keshidagi eskisi ko'rinmasin.
      embedUrl: `/api/v1/qollanma/${q.id}/video?v=${v}`,
      muqova: q.hasPoster ? `/api/v1/qollanma/${q.id}/muqova?v=${v}` : null,
      vertikal: false,
    };
  } else {
    const n = havolaniTahlilQil(q.url ?? '');
    pleyer = n
      ? { ...n, muqova: q.thumbnailUrl ?? n.muqova }
      : { provayder: 'boshqa', pleyer: 'tashqi', embedUrl: q.url ?? '', muqova: q.thumbnailUrl, vertikal: false };
  }

  return {
    id: q.id,
    title: q.title,
    description: q.description,
    category: q.category,
    source: q.source,
    url: q.source === 'link' ? q.url : null,
    provider: pleyer.provayder,
    player: pleyer.pleyer,
    embedUrl: pleyer.embedUrl,
    thumbnailUrl: pleyer.muqova,
    vertical: pleyer.vertikal,
    status: q.status,
    // Texnik xato matni (ffmpeg) — faqat adminga.
    error: admin ? q.error : null,
    durationSec: q.durationSec,
    fileName: admin ? q.fileName : null,
    fileSize: q.fileSize,
    sortOrder: q.sortOrder,
    isPublished: q.isPublished,
    createdAt: q.createdAt,
    updatedAt: q.updatedAt,
  };
}

function adminmi(req: FastifyRequest): boolean {
  return req.auth?.user.systemRole === 'super_admin';
}

async function audit(req: FastifyRequest, action: string, entityId: string, after: unknown): Promise<void> {
  await withoutTenantIsolation("audit: qo'llanma platforma darajasida, biznesga tegishli emas", (tx) =>
    tx.insert(auditLog).values({
      businessId: null,
      actorId: req.auth!.user.id,
      action,
      entity: 'guide_video',
      entityId,
      before: null,
      after: after as never,
      ip: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    }),
  );
}

/** Havolani tekshiradi; noto'g'ri bo'lsa — tushunarli xato. */
function havolaShart(url: string | undefined): HavolaNatija {
  const n = url ? havolaniTahlilQil(url) : null;
  if (!n) {
    throw AppError.badRequest("Havola noto'g'ri", 'Video manzilini to\'liq qo\'ying, masalan https://youtu.be/…');
  }
  return n;
}

async function bitta(id: string): Promise<Qator | undefined> {
  const [q] = await db.select().from(guideVideo).where(eq(guideVideo.id, id)).limit(1);
  return q;
}

/** Oddiy foydalanuvchi faqat nashr qilingan va tayyor videoni ko'radi. */
async function korishMumkin(req: FastifyRequest, id: string): Promise<Qator> {
  const q = await bitta(id);
  if (!q || (!adminmi(req) && (!q.isPublished || q.status !== 'ready'))) throw AppError.notFound();
  return q;
}

/**
 * `Range: bytes=…` sarlavhasi → [boshi, oxiri] (ikkalasi ham kiradi).
 * `null` — sarlavha yo'q yoki biz qo'llamaydigan shakl (bir nechta
 * oraliq): butun fayl beriladi. `'chegaradan-tashqari'` — 416.
 */
export function oraliqniOl(sarlavha: string | undefined, hajm: number): [number, number] | null | 'chegaradan-tashqari' {
  if (!sarlavha) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(sarlavha.trim());
  if (!m || (m[1] === '' && m[2] === '')) return null;
  let boshi: number;
  let oxiri: number;
  if (m[1] === '') {
    // `bytes=-500` — oxirgi 500 bayt
    boshi = Math.max(0, hajm - Number(m[2]));
    oxiri = hajm - 1;
  } else {
    boshi = Number(m[1]);
    oxiri = m[2] === '' ? hajm - 1 : Math.min(Number(m[2]), hajm - 1);
  }
  if (boshi >= hajm || boshi > oxiri) return 'chegaradan-tashqari';
  return [boshi, oxiri];
}

/**
 * Faylni Range qo'llab-quvvatlagan holda beradi. Busiz `<video>` oldinga
 * o'tkazib bo'lmaydi va Safari umuman o'ynamaydi.
 */
async function faylBer(req: FastifyRequest, reply: FastifyReply, yol: string, mime: string, hajm: number) {
  reply
    .header('Accept-Ranges', 'bytes')
    .header('Content-Type', mime)
    // Manzilda `?v=` versiya bor — fayl o'zgarsa manzil ham o'zgaradi.
    .header('Cache-Control', 'private, max-age=86400');

  const oraliq = oraliqniOl(req.headers.range, hajm);
  if (oraliq === 'chegaradan-tashqari') {
    return reply.code(416).header('Content-Range', `bytes */${hajm}`).send();
  }
  if (oraliq) {
    const [boshi, oxiri] = oraliq;
    return reply
      .code(206)
      .header('Content-Range', `bytes ${boshi}-${oxiri}/${hajm}`)
      .header('Content-Length', oxiri - boshi + 1)
      .send(createReadStream(yol, { start: boshi, end: oxiri }));
  }
  return reply.header('Content-Length', hajm).send(createReadStream(yol));
}

const VIDEO_KENGAYTMA = /^(mp4|m4v|mov|webm|mkv|avi|wmv|flv|mpg|mpeg|3gp|ts|mts|m2ts|ogv|ogg)$/;

export function registerQollanmaRoutes(app: FastifyInstance): void {
  const admin = { preHandler: [requireAuth, requireSuperAdmin] };

  // Server qayta ishga tushganda yarim qolgan videolarni tayyorlashni davom ettirish.
  app.addHook('onReady', async () => {
    await yarimQolganlarniTikla(app.log).catch((err) => app.log.error({ err }, "qo'llanma: navbatni tiklab bo'lmadi"));
  });

  app.get('/api/v1/qollanma', { preHandler: [requireAuth] }, async (req) => {
    const boshqaradi = adminmi(req);
    const qatorlar = await db
      .select()
      .from(guideVideo)
      .where(boshqaradi ? undefined : and(eq(guideVideo.isPublished, true), eq(guideVideo.status, 'ready')))
      .orderBy(asc(guideVideo.sortOrder), asc(guideVideo.createdAt));
    return {
      videos: qatorlar.map((q) => javob(q, boshqaradi)),
      canManage: boshqaradi,
      maxUploadMb: config.QOLLANMA_MAX_MB,
    };
  });

  /** Yuklangan video — Range bilan. Rate limit yo'q: oldinga o'tkazish ko'p so'rov beradi. */
  app.get('/api/v1/qollanma/:id/video', { preHandler: [requireAuth], config: { rateLimit: false } }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const q = await korishMumkin(req, id);
    if (q.source !== 'file') throw AppError.notFound();
    const f = await tayyorVideo(id);
    if (!f) throw AppError.notFound('Video fayli topilmadi');
    return faylBer(req, reply, f.yol, f.mime, f.hajm);
  });

  app.get('/api/v1/qollanma/:id/muqova', { preHandler: [requireAuth], config: { rateLimit: false } }, async (req, reply) => {
    const { id } = idParam.parse(req.params);
    const q = await korishMumkin(req, id);
    if (q.source !== 'file' || !q.hasPoster) throw AppError.notFound();
    const yol = join(videoPapka(id), MUQOVA);
    const s = await stat(yol).catch(() => null);
    if (!s) throw AppError.notFound();
    return faylBer(req, reply, yol, 'image/jpeg', s.size);
  });

  /**
   * Havolani saqlashdan OLDIN ko'rib chiqish: qaysi sayt, pleyer, muqova va
   * (bo'lsa) sarlavha — oynada darhol ko'rinadi va sarlavha avto to'ladi.
   */
  app.post('/api/v1/qollanma/havola-tahlil', admin, async (req) => {
    const { url } = z.object({ url: z.string().trim().min(1).max(2000) }).parse(req.body);
    const n = havolaShart(url);
    const o = await oembedOl(url, n.provayder);
    return {
      provider: n.provayder,
      player: n.pleyer,
      embedUrl: n.embedUrl,
      vertical: n.vertikal,
      thumbnailUrl: o.muqova ?? n.muqova,
      title: o.sarlavha,
      durationSec: o.davomiylik,
    };
  });

  app.post('/api/v1/qollanma', admin, async (req, reply) => {
    const body = yaratish.parse(req.body);
    let thumbnailUrl: string | null = null;
    let durationSec: number | null = null;
    if (body.source === 'link') {
      const n = havolaShart(body.url);
      const o = await oembedOl(body.url!, n.provayder);
      thumbnailUrl = o.muqova;
      durationSec = o.davomiylik;
    }

    const [q] = await withoutTenantIsolation("qo'llanma: video qo'shish (super admin)", async (tx) => {
      const [{ max }] = (await tx.select({ max: sql<number>`coalesce(max(${guideVideo.sortOrder}), 0)::int` }).from(guideVideo)) as [{ max: number }];
      return tx
        .insert(guideVideo)
        .values({
          title: body.title,
          description: body.description,
          category: body.category,
          isPublished: body.isPublished,
          source: body.source,
          url: body.source === 'link' ? body.url!.trim() : null,
          thumbnailUrl,
          durationSec,
          // Fayl hali yuklanmagan — `PUT /:id/fayl` kutiladi.
          status: body.source === 'link' ? 'ready' : 'waiting',
          sortOrder: max + 1,
          createdBy: req.auth!.user.id,
        })
        .returning();
    });

    await audit(req, 'guide.create', q!.id, { title: body.title, source: body.source });
    reply.status(201);
    return javob(q!, true);
  });

  app.patch('/api/v1/qollanma/:id', admin, async (req) => {
    const { id } = idParam.parse(req.params);
    const body = tahrirlash.parse(req.body);
    const eski = await bitta(id);
    if (!eski) throw AppError.notFound();

    const patch: Partial<typeof guideVideo.$inferInsert> = { updatedAt: new Date() };
    if (body.title !== undefined) patch.title = body.title;
    if (req.body && typeof req.body === 'object') {
      if ('description' in req.body) patch.description = body.description;
      if ('category' in req.body) patch.category = body.category;
    }
    if (body.isPublished !== undefined) patch.isPublished = body.isPublished;

    // Havola o'zgardi (yoki fayldan havolaga o'tildi) — muqova qaytadan.
    const havolaYangi = body.url !== undefined && (eski.source !== 'link' || body.url.trim() !== eski.url);
    if (havolaYangi) {
      const n = havolaShart(body.url);
      const o = await oembedOl(body.url!, n.provayder);
      Object.assign(patch, {
        source: 'link',
        url: body.url!.trim(),
        thumbnailUrl: o.muqova,
        durationSec: o.davomiylik,
        status: 'ready',
        error: null,
        fileName: null,
        fileSize: null,
        fileMime: null,
        hasPoster: false,
      } satisfies Partial<typeof guideVideo.$inferInsert>);
    }

    const [q] = await withoutTenantIsolation("qo'llanma: videoni tahrirlash (super admin)", (tx) =>
      tx.update(guideVideo).set(patch).where(eq(guideVideo.id, id)).returning(),
    );
    if (!q) throw AppError.notFound();
    if (havolaYangi && eski.source === 'file') await papkaniOchir(id);

    await audit(req, 'guide.update', id, { fields: Object.keys(patch).filter((k) => k !== 'updatedAt') });
    return javob(q, true);
  });

  /**
   * Faylni yuklash (yoki almashtirish). Oqim to'g'ridan-to'g'ri diskka
   * yoziladi — xotiraga sig'masligi mumkin bo'lgan GB lik fayl ham RAM'ni
   * to'ldirmaydi. Tayyorlash (ffmpeg) fonda: javob darhol `processing`.
   */
  app.put('/api/v1/qollanma/:id/fayl', { ...admin, config: { rateLimit: false } }, async (req) => {
    const { id } = idParam.parse(req.params);
    if (!(await bitta(id))) throw AppError.notFound();

    const maxBayt = config.QOLLANMA_MAX_MB * 1024 * 1024;
    const fayl = await req.file({ limits: { fileSize: maxBayt, files: 1 } });
    if (!fayl) throw AppError.badRequest('Fayl yuborilmadi');

    const kengaytma = (/\.([a-z0-9]{2,5})$/i.exec(fayl.filename)?.[1] ?? '').toLowerCase();
    if (!fayl.mimetype.startsWith('video/') && !VIDEO_KENGAYTMA.test(kengaytma)) {
      fayl.file.resume(); // oqimni oxirigacha o'qimasak, so'rov osilib qoladi
      throw AppError.badRequest('Video fayl tanlang', 'MP4, MOV, WEBM, MKV, AVI va boshqa video formatlar qabul qilinadi.');
    }

    const papka = videoPapka(id);
    await mkdir(papka, { recursive: true });
    const vaqtincha = join(papka, `yuklanmoqda-${Date.now()}.part`);
    try {
      await pipeline(fayl.file, createWriteStream(vaqtincha));
    } catch (err) {
      await rm(vaqtincha, { force: true });
      if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE' || fayl.file.truncated) {
        throw new AppError(413, 'payload-too-large', `Fayl juda katta — ${config.QOLLANMA_MAX_MB} MB dan oshmasin`);
      }
      // Odatda brauzer yuklashni bekor qilgan (ulanish uzildi).
      throw AppError.badRequest('Yuklash uzildi — qaytadan urinib ko\'ring');
    }
    const hajm = (await stat(vaqtincha)).size;
    if (hajm === 0) {
      await rm(vaqtincha, { force: true });
      throw AppError.badRequest("Fayl bo'sh");
    }
    await rename(vaqtincha, join(papka, `asl.${VIDEO_KENGAYTMA.test(kengaytma) ? kengaytma : 'bin'}`));

    const [q] = await withoutTenantIsolation("qo'llanma: yuklangan faylni qayd etish (super admin)", (tx) =>
      tx
        .update(guideVideo)
        .set({
          source: 'file',
          url: null,
          thumbnailUrl: null,
          status: 'processing',
          error: null,
          fileName: fayl.filename.slice(0, 255),
          fileSize: hajm,
          fileMime: null,
          hasPoster: false,
          durationSec: null,
          updatedAt: new Date(),
        })
        .where(eq(guideVideo.id, id))
        .returning(),
    );
    if (!q) {
      // Yuklash davomida o'chirilgan.
      await papkaniOchir(id);
      throw AppError.notFound();
    }

    navbatgaQosh(id, req.log);
    await audit(req, 'guide.upload', id, { fileName: q.fileName, bytes: hajm });
    return javob(q, true);
  });

  /** Tartib: `ids` — yangi tartibdagi BARCHA videolar. */
  app.post('/api/v1/qollanma/tartib', admin, async (req) => {
    const { ids } = z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) }).parse(req.body);
    await withoutTenantIsolation("qo'llanma: tartibni saqlash (super admin)", async (tx) => {
      for (const [i, id] of ids.entries()) {
        await tx.update(guideVideo).set({ sortOrder: i + 1 }).where(eq(guideVideo.id, id));
      }
    });
    return { ok: true };
  });

  app.delete('/api/v1/qollanma/:id', admin, async (req) => {
    const { id } = idParam.parse(req.params);
    const [q] = await withoutTenantIsolation("qo'llanma: videoni o'chirish (super admin)", (tx) =>
      tx.delete(guideVideo).where(eq(guideVideo.id, id)).returning({ id: guideVideo.id, title: guideVideo.title }),
    );
    if (!q) throw AppError.notFound();
    await papkaniOchir(id);
    await audit(req, 'guide.delete', id, { title: q.title });
    return { ok: true };
  });
}
