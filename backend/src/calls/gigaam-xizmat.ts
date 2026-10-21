import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { config } from '../config.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GIGAAM DOIMIY XIZMATI — model bir marta yuklanadi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ilgari har qo'ng'iroq uchun yangi python jarayoni ochilib, GigaAM modeli
 * har safar noldan yuklanardi (serverda ~15 s / qo'ng'iroq, CPU'da). Endi
 * `tools/gigaam-local.py --serve` jarayonlari doimiy turadi: model xotirada,
 * so'rov stdin orqali JSON qator bilan beriladi, javob stdout'dan keladi.
 *
 * Hovuz (pool) hajmi — `STT_CONCURRENCY`. Har jarayon bir vaqtda bitta
 * so'rov bajaradi; ortiqchasi navbatda kutadi. Jarayon yiqilsa — joriy
 * so'rov xato bilan qaytadi va keyingi so'rovda yangi jarayon tug'iladi.
 * Model umuman yuklanmasa (masalan paket yo'q), navbatdagilar ham xato bilan
 * qaytadi — abadiy osilib qolmaydi.
 */

const SOROV_TIMEOUT_MS = 10 * 60_000;
const TAYYOR_TIMEOUT_MS = 10 * 60_000; // birinchi ishga tushishda model yuklab olinishi mumkin

interface Vazifa {
  input: string;
  output: string;
  resolve: () => void;
  reject: (e: Error) => void;
}

class Ishchi {
  readonly proc: ChildProcessWithoutNullStreams;
  tayyor = false;
  olik = false;
  joriy: (Vazifa & { id: string; timer: NodeJS.Timeout }) | null = null;
  private stderrDumi: string[] = [];
  private tayyorTimer: NodeJS.Timeout;

  constructor(
    private readonly hovuz: GigaamHovuzi,
    python: string,
    script: string,
  ) {
    this.proc = spawn(python, [script, '--serve', '--engine', 'gigaam', '--latin'], {
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.tayyorTimer = setTimeout(() => this.ol('model 10 daqiqada yuklanmadi'), TAYYOR_TIMEOUT_MS);

    createInterface({ input: this.proc.stdout }).on('line', (qator) => this.qatorKeldi(qator));
    createInterface({ input: this.proc.stderr }).on('line', (qator) => {
      const q = qator.trim();
      if (!q || /^\s*(Loading weights|W\d{4}|warnings\.warn|filtered by duration)/.test(q)) return;
      this.stderrDumi.push(q);
      if (this.stderrDumi.length > 20) this.stderrDumi.shift();
    });
    this.proc.on('exit', (code, signal) => this.ol(`jarayon tugadi (kod ${code ?? '-'}, ${signal ?? 'signal yo\'q'})`));
    this.proc.on('error', (err) => this.ol(`jarayon ochilmadi: ${err.message}`));
  }

  /** Oxirgi stderr qatorlari — xato sababini ko'rsatish uchun. */
  dum(): string {
    return this.stderrDumi.slice(-3).join(' | ');
  }

  private vaqtiOtdi = false;

  bajar(v: Vazifa): void {
    const id = Math.random().toString(36).slice(2);
    const timer = setTimeout(() => {
      // Osilgan so'rov — jarayonni o'ldiramiz; `exit` joriy vazifani xato qiladi.
      this.vaqtiOtdi = true;
      this.proc.kill('SIGKILL');
    }, SOROV_TIMEOUT_MS);
    this.joriy = { ...v, id, timer };
    this.proc.stdin.write(`${JSON.stringify({ id, input: v.input, out: v.output })}\n`);
  }

  private qatorKeldi(qator: string): void {
    let xabar: { ready?: boolean; id?: string; ok?: boolean; error?: string };
    try {
      xabar = JSON.parse(qator) as typeof xabar;
    } catch {
      return; // protokol qatori emas
    }
    if (xabar.ready) {
      clearTimeout(this.tayyorTimer);
      this.tayyor = true;
      this.hovuz.tarqat();
      return;
    }
    const j = this.joriy;
    if (!j || xabar.id !== j.id) return;
    clearTimeout(j.timer);
    this.joriy = null;
    if (xabar.ok) j.resolve();
    else j.reject(new Error(xabar.error ?? 'noma\'lum STT xatosi'));
    this.hovuz.tarqat();
  }

  private ol(sabab: string): void {
    if (this.olik) return;
    this.olik = true;
    clearTimeout(this.tayyorTimer);
    const toliq = `${sabab}${this.dum() ? ` — ${this.dum()}` : ''}`;
    if (this.joriy) {
      clearTimeout(this.joriy.timer);
      this.joriy.reject(new Error(this.vaqtiOtdi ? `so'rov 10 daqiqadan oshdi — ${toliq}` : toliq));
      this.joriy = null;
    }
    if (!this.proc.killed && this.proc.exitCode === null) this.proc.kill('SIGKILL');
    this.hovuz.ishchiOldi(this, toliq);
  }

  toxtat(): void {
    this.proc.stdin.end();
  }
}

class GigaamHovuzi {
  private ishchilar: Ishchi[] = [];
  private navbat: Vazifa[] = [];

  transkript(input: string, output: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.navbat.push({ input, output, resolve, reject });
      this.tarqat();
    });
  }

  tarqat(): void {
    while (this.navbat.length > 0) {
      const bosh = this.ishchilar.find((i) => i.tayyor && !i.olik && !i.joriy);
      if (bosh) {
        bosh.bajar(this.navbat.shift()!);
        continue;
      }
      const tirik = this.ishchilar.filter((i) => !i.olik).length;
      if (tirik < config.STT_CONCURRENCY) {
        const python = process.env.GIGAAM_PYTHON || process.env.PYTHON || 'python';
        const script = join(process.cwd(), '..', 'tools', 'gigaam-local.py');
        this.ishchilar.push(new Ishchi(this, python, script));
        continue; // yangi ishchi tayyor bo'lgach `tarqat` yana chaqiriladi
      }
      return;
    }
  }

  ishchiOldi(ishchi: Ishchi, sabab: string): void {
    const tayyorBolganmi = ishchi.tayyor;
    this.ishchilar = this.ishchilar.filter((i) => i !== ishchi);
    // Model umuman yuklanmagan bo'lsa — navbatdagilar ham shu sabab bilan
    // yiqiladi (aks holda har so'rov yangi jarayon ochib, cheksiz aylanardi).
    if (!tayyorBolganmi && this.ishchilar.every((i) => !i.tayyor)) {
      const kutayotganlar = this.navbat.splice(0);
      for (const v of kutayotganlar) v.reject(new Error(`GigaAM xizmati ishga tushmadi: ${sabab}`));
      return;
    }
    this.tarqat();
  }

  toxtat(): void {
    for (const i of this.ishchilar) i.toxtat();
  }
}

let hovuz: GigaamHovuzi | null = null;

/** GigaAM bilan transkript: `input` audio → `output` matn fayli. */
export function gigaamXizmatida(input: string, output: string): Promise<void> {
  hovuz ??= new GigaamHovuzi();
  return hovuz.transkript(input, output);
}

/** Server to'xtaganda — jarayonlarga stdin yopiladi, ular o'zi chiqadi. */
export function gigaamXizmatiniToxtat(): void {
  hovuz?.toxtat();
}
