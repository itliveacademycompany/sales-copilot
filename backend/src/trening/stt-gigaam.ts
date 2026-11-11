import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gigaamJonli } from '../calls/gigaam-xizmat.js';
import type { SttPort, SttRequest, SttResult } from '../training/voice/ports.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIMULYATOR STT — serverdagi GigaAM (pulsiz, audio tashqariga chiqmaydi)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Modulning `SttPort` i shu yerda platformaning GigaAM xizmatiga ulanadi.
 * Jonli suhbat uchun ALOHIDA jarayon ishlatiladi (`gigaamJonli`) — qo'ng'iroq
 * transkripsiyasi navbatida kutib qolmaydi.
 *
 * Audio (16 kHz mono WAV, ≤30 s) vaqtinchalik papkaga yoziladi, GigaAM matn
 * faylini yozadi, ikkalasi ham darhol o'chiriladi — hech narsa saqlanmaydi.
 */

/** Birinchi chaqiruvda model yuklanishi ham shunga kiradi (isitish odatda oldinroq boshlanadi). */
const STT_TIMEOUT_MS = 90_000;

/** GigaAM chiqishi: `[mm:ss] matn` qatorlari → bitta gap. */
export function gigaamMatni(chiqish: string): string {
  return chiqish
    .split(/\r?\n/)
    .map((q) => q.trim().replace(/^\[\d{2}:\d{2}]\s*/, ''))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createGigaamStt(): SttPort {
  return {
    async transcribeShort(req: SttRequest): Promise<SttResult> {
      const boshi = Date.now();
      const papka = await mkdtemp(join(tmpdir(), 'sotuv-mashq-stt-'));
      const input = join(papka, 'gap.wav');
      const output = join(papka, 'gap.txt');
      let timer: NodeJS.Timeout | undefined;
      try {
        await writeFile(input, req.audio);
        await Promise.race([
          gigaamJonli(input, output),
          new Promise<never>((_, reject) => {
            timer = setTimeout(
              () => reject(new Error(`nutqni tanish ${STT_TIMEOUT_MS / 1000} s ichida tugamadi`)),
              STT_TIMEOUT_MS,
            );
          }),
        ]);
        const matn = gigaamMatni(await readFile(output, 'utf8').catch(() => ''));
        return { text: matn, latencyMs: Date.now() - boshi };
      } finally {
        if (timer) clearTimeout(timer);
        // Python hali faylni o'qiyotgan bo'lsa ham (timeout) — o'chirish xatosi muhim emas.
        await rm(papka, { recursive: true, force: true }).catch(() => undefined);
      }
    },
  };
}
