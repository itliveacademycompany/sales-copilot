import { spawn } from 'node:child_process';
import { mkdir, readdir, rename, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyBaseLogger } from 'fastify';
import { config } from '../config.js';
import { withoutTenantIsolation } from '../db/index.js';
import { guideVideo } from '../db/schema/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * YUKLANGAN QO'LLANMA VIDEOSINI TAYYORLASH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NEGA KERAK: "mp4" degani hali brauzerda o'ynaydi degani emas. Ekran
 * yozuvchi dasturlar (OBS va h.k.) ko'pincha H.264 4:4:4 yoki HEVC beradi —
 * Chrome'da balki ochiladi, Safari, Firefox va telefonlarda esa qora ekran.
 * Shuning uchun har bir fayl ffprobe bilan tekshiriladi:
 *
 *   - allaqachon mos (H.264 4:2:0 + AAC/MP3 mp4, yoki VP8/VP9/AV1 webm)
 *       → qayta kodlanmaydi, faqat `faststart` bilan qayta o'raladi
 *         (moov boshiga — video to'liq yuklanmasdan o'ynay boshlaydi);
 *   - qolgan hammasi (mov, mkv, avi, HEVC, 4:4:4, …)
 *       → H.264 + AAC mp4 ga o'giriladi.
 *
 * Keyin muqova kadri olinadi. Asl fayl o'chiriladi — diskda faqat tayyor
 * nusxa qoladi.
 *
 * Navbat jarayon ichida va BITTADAN: serverda STT ham protsessorni ishlatadi,
 * bir vaqtda bir nechta 1080p kodlash uni bo'g'ib qo'yardi. Server qayta
 * ishga tushsa — `processing` holatidagi yozuvlar navbatga qaytariladi.
 */

/** `MEDIA_DIR` nisbiy bo'lsa — backend papkasiga nisbatan. */
export const MEDIA_ILDIZ = isAbsolute(config.MEDIA_DIR) ? config.MEDIA_DIR : resolve(process.cwd(), config.MEDIA_DIR);

export function videoPapka(id: string): string {
  return join(MEDIA_ILDIZ, 'qollanma', id);
}

/** Tayyor fayl nomlari — `video.mp4` yoki `video.webm`, `muqova.jpg`. */
export const MUQOVA = 'muqova.jpg';

export async function tayyorVideo(id: string): Promise<{ yol: string; mime: string; hajm: number } | null> {
  for (const [nom, mime] of [
    ['video.mp4', 'video/mp4'],
    ['video.webm', 'video/webm'],
  ] as const) {
    const yol = join(videoPapka(id), nom);
    try {
      const s = await stat(yol);
      if (s.isFile()) return { yol, mime, hajm: s.size };
    } catch {
      /* keyingisini tekshiramiz */
    }
  }
  return null;
}

export async function papkaniOchir(id: string): Promise<void> {
  await rm(videoPapka(id), { recursive: true, force: true });
}

/** Papkadagi eski fayllar (oldingi yuklash qoldiqlari) — `asl.*` dan boshqasi. */
async function eskilarniTozala(papka: string, qoldir: string): Promise<void> {
  for (const f of await readdir(papka).catch(() => [] as string[])) {
    if (f !== qoldir) await rm(join(papka, f), { force: true });
  }
}

// ─── ffmpeg / ffprobe ────────────────────────────────────────────────────────

class DasturYoq extends Error {}

function ishgaTushir(dastur: string, args: string[], maxMs: number): Promise<string> {
  return new Promise((ok, rad) => {
    const p = spawn(dastur, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let chiqish = '';
    let xato = '';
    p.stdout.on('data', (b: Buffer) => {
      if (chiqish.length < 2_000_000) chiqish += b.toString();
    });
    // ffmpeg butun jarayonni stderr ga yozadi — faqat oxirini saqlaymiz.
    p.stderr.on('data', (b: Buffer) => {
      xato = (xato + b.toString()).slice(-4000);
    });
    const taymer = setTimeout(() => p.kill('SIGKILL'), maxMs);
    p.on('error', (e: NodeJS.ErrnoException) => {
      clearTimeout(taymer);
      rad(e.code === 'ENOENT' ? new DasturYoq(dastur) : e);
    });
    p.on('close', (kod) => {
      clearTimeout(taymer);
      if (kod === 0) ok(chiqish);
      else rad(new Error(xato.trim().split('\n').slice(-3).join(' ') || `${dastur} ${kod} kod bilan to'xtadi`));
    });
  });
}

interface Probe {
  format?: { format_name?: string; duration?: string };
  streams?: { codec_type?: string; codec_name?: string; pix_fmt?: string; profile?: string }[];
}

async function tekshir(fayl: string): Promise<Probe> {
  const json = await ishgaTushir(
    config.FFPROBE_PATH,
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', fayl],
    60_000,
  );
  return JSON.parse(json) as Probe;
}

export type Reja = 'mp4-qayta-orash' | 'webm-ozgarishsiz' | 'kodlash';

/**
 * Brauzerlar hammasi (Safari, Firefox, Android, iOS) o'ynay oladigan
 * kombinatsiyalar. Qolgani — kodlash. Alohida eksport: verify-qollanma.ts.
 */
export function rejaTuz(p: Probe): Reja | null {
  const v = p.streams?.find((s) => s.codec_type === 'video' && s.codec_name !== 'mjpeg' && s.codec_name !== 'png');
  if (!v) return null;
  const a = p.streams?.find((s) => s.codec_type === 'audio');
  const konteyner = p.format?.format_name ?? '';

  const mosH264 =
    v.codec_name === 'h264' &&
    (v.pix_fmt === 'yuv420p' || v.pix_fmt === 'yuvj420p') &&
    !/4:4:4|4:2:2|High 10/i.test(v.profile ?? '');
  if (/mp4|mov/.test(konteyner) && mosH264 && (!a || a.codec_name === 'aac' || a.codec_name === 'mp3')) {
    return 'mp4-qayta-orash';
  }
  if (/webm/.test(konteyner) && ['vp8', 'vp9', 'av1'].includes(v.codec_name ?? '') && (!a || ['opus', 'vorbis'].includes(a.codec_name ?? ''))) {
    return 'webm-ozgarishsiz';
  }
  return 'kodlash';
}

/** Juft o'lcham (yuv420p talabi), eni 1920 dan oshmaydi. */
const MASSHTAB = "scale='trunc(min(1920,iw)/2)*2':-2";

async function tayyorla(id: string, log: FastifyBaseLogger): Promise<void> {
  const papka = videoPapka(id);
  const asl = (await readdir(papka).catch(() => [] as string[])).find((f) => f.startsWith('asl.'));
  if (!asl) throw new Error('Yuklangan fayl topilmadi — qayta yuklang');
  const manba = join(papka, asl);

  let probe: Probe;
  try {
    probe = await tekshir(manba);
  } catch (err) {
    if (err instanceof DasturYoq) {
      // ffmpeg yo'q muhit (lokal kompyuter) — fayl o'zgarishsiz beriladi.
      const webm = /\.webm$/i.test(asl);
      await eskilarniTozala(papka, asl);
      await rename(manba, join(papka, webm ? 'video.webm' : 'video.mp4'));
      log.warn({ id }, "qo'llanma: ffprobe topilmadi — video o'zgarishsiz saqlandi");
      return yakunla(id, { mime: webm ? 'video/webm' : 'video/mp4', davomiylik: null, muqova: false });
    }
    throw new Error("Fayl o'qilmadi — u video emas yoki buzilgan");
  }

  const reja = rejaTuz(probe);
  if (!reja) throw new Error('Faylda video oqimi topilmadi');
  const davomiylik = Number(probe.format?.duration);

  let natija: string;
  if (reja === 'webm-ozgarishsiz') {
    natija = join(papka, 'video.webm');
    await rename(manba, natija);
  } else {
    natija = join(papka, 'video.mp4');
    const vaqtincha = join(papka, 'tayyorlanmoqda.mp4');
    const umumiy = ['-hide_banner', '-loglevel', 'error', '-y', '-i', manba, '-map', '0:v:0', '-map', '0:a:0?', '-sn', '-dn'];
    const args =
      reja === 'mp4-qayta-orash'
        ? [...umumiy, '-c', 'copy', '-movflags', '+faststart', vaqtincha]
        : [
            ...umumiy,
            '-vf', MASSHTAB,
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
            '-c:a', 'aac', '-b:a', '128k', '-ac', '2',
            // 2 ta oqim: STT bilan bir serverda — barcha yadrolarni egallamasin.
            '-threads', '2',
            '-movflags', '+faststart',
            vaqtincha,
          ];
    // Uzun (1-2 soatlik) yozuv veryfast bilan ham ancha vaqt oladi.
    await ishgaTushir(config.FFMPEG_PATH, args, 3 * 60 * 60_000);
    await rename(vaqtincha, natija);
  }
  await eskilarniTozala(papka, natija.endsWith('.webm') ? 'video.webm' : 'video.mp4');

  // Muqova: boshidagi logotip/qora kadr emas — ~10% joyidan (ko'pi bilan 15 s).
  let muqova = false;
  try {
    const t = Number.isFinite(davomiylik) && davomiylik > 0 ? Math.min(15, davomiylik * 0.1) : 1;
    await ishgaTushir(
      config.FFMPEG_PATH,
      ['-hide_banner', '-loglevel', 'error', '-y', '-ss', t.toFixed(2), '-i', natija, '-frames:v', '1', '-vf', "scale='trunc(min(1280,iw)/2)*2':-2", '-q:v', '3', join(papka, MUQOVA)],
      60_000,
    );
    muqova = true;
  } catch (err) {
    log.warn({ id, err }, "qo'llanma: muqova olinmadi");
  }

  await yakunla(id, {
    mime: natija.endsWith('.webm') ? 'video/webm' : 'video/mp4',
    davomiylik: Number.isFinite(davomiylik) && davomiylik > 0 ? Math.round(davomiylik) : null,
    muqova,
  });
}

async function yakunla(id: string, n: { mime: string; davomiylik: number | null; muqova: boolean }): Promise<void> {
  const fayl = await tayyorVideo(id);
  await withoutTenantIsolation("qo'llanma: tayyorlangan video holatini yozish", (tx) =>
    tx
      .update(guideVideo)
      .set({
        status: 'ready',
        error: null,
        fileMime: n.mime,
        fileSize: fayl?.hajm ?? null,
        durationSec: n.davomiylik,
        hasPoster: n.muqova,
        updatedAt: new Date(),
      })
      .where(eq(guideVideo.id, id)),
  );
}

// ─── Navbat ──────────────────────────────────────────────────────────────────

const navbat: string[] = [];
let ishlayapti = false;

export function navbatgaQosh(id: string, log: FastifyBaseLogger): void {
  if (!navbat.includes(id)) navbat.push(id);
  void aylan(log);
}

async function aylan(log: FastifyBaseLogger): Promise<void> {
  if (ishlayapti) return;
  ishlayapti = true;
  try {
    for (let id = navbat.shift(); id; id = navbat.shift()) {
      const boshlandi = Date.now();
      try {
        await tayyorla(id, log);
        log.info({ id, ms: Date.now() - boshlandi }, "qo'llanma: video tayyor");
      } catch (err) {
        const xabar = (err instanceof Error ? err.message : String(err)).slice(0, 500);
        log.error({ id, err }, "qo'llanma: video tayyorlanmadi");
        await withoutTenantIsolation("qo'llanma: tayyorlash xatosini yozish", (tx) =>
          tx.update(guideVideo).set({ status: 'failed', error: xabar, updatedAt: new Date() }).where(eq(guideVideo.id, id)),
        ).catch(() => undefined);
      }
    }
  } finally {
    ishlayapti = false;
  }
}

/** Server qayta ishga tushganda yarim qolgan ishlarni davom ettiradi. */
export async function yarimQolganlarniTikla(log: FastifyBaseLogger): Promise<void> {
  await mkdir(join(MEDIA_ILDIZ, 'qollanma'), { recursive: true });
  const qatorlar = await withoutTenantIsolation("qo'llanma: yarim qolgan tayyorlashlarni topish", (tx) =>
    tx.select({ id: guideVideo.id }).from(guideVideo).where(inArray(guideVideo.status, ['processing'])),
  );
  for (const q of qatorlar) navbatgaQosh(q.id, log);
}
