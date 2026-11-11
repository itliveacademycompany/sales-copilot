import { useCallback, useEffect, useRef, useState } from 'react';
import { encodeWav, ensureAudioRunning, joinChunks, trimSilence } from '../../../features/mashq';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * JONLI MIKROFON — qo'lsiz suhbat (tugma bosmasdan)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Telefondagidek: sotuvchi gapiradi, pauza qilsa gap o'zi yuboriladi.
 * Brauzerda oddiy ovoz faolligi aniqlagichi (VAD):
 *   - fon shovqini darajasi doimiy o'lchanadi, chegara undan ~3 barobar baland;
 *   - chegaradan baland ovoz ~130 ms davom etsa — gap boshlandi (oldingi
 *     ~0.4 s ham qo'shiladi, so'z boshi kesilmasin);
 *   - ~1 s jimlik — gap tugadi: jimlik kesiladi va 16 kHz WAV `onGap` ga beriladi;
 *   - 25 s dan uzun gap o'zi bo'linadi (server chegarasi 30 s).
 *
 * `tinglash=false` bo'lganda (mijoz gapiryapti, javob kutilyapti, mikrofon
 * o'chirilgan) hech narsa yig'ilmaydi — mijoz ovozi qayta "eshitilib" ketmaydi.
 * Daraja (`daraja`) baribir yangilanadi — mikrofon tekshiruvi uchun.
 */

const NAMUNA = 16_000;
const BUFER = 1024; // 64 ms
const BOSHLASH_BUFER = 2; // ~130 ms ovoz — gap boshlandi
const PAUZA_MS = 1000;
const OLDINGI_MS = 400;
const MAKS_GAP_S = 25;
const MIN_GAP_S = 0.35;

export interface JonliMikrofonXatosi {
  tur: 'ruxsat' | 'qollanmaydi' | 'qurilma';
  matn: string;
}

export interface JonliMikrofon {
  /** Mikrofon ochiqmi. */
  ochiq: boolean;
  /** 0..1 — ko'rsatkich uchun. */
  daraja: number;
  /** Sotuvchi hozir gapiryapti (gap yig'ilyapti). */
  gapiryapti: boolean;
  xato: JonliMikrofonXatosi | null;
  /** Mikrofonni ochadi (yoki boshqa qurilmaga o'tadi). */
  och: (qurilmaId?: string) => Promise<boolean>;
  yop: () => void;
}

export interface JonliMikrofonOptions {
  /** Gap yig'ilsinmi (mijoz gapirayotganda/javob kutilganda `false`). */
  tinglash: boolean;
  /** Tugagan gap (16 kHz mono WAV). */
  onGap?: (wav: Blob, soniya: number) => void;
}

export function useJonliMikrofon({ tinglash, onGap }: JonliMikrofonOptions): JonliMikrofon {
  const [ochiq, setOchiq] = useState(false);
  const [daraja, setDaraja] = useState(0);
  const [gapiryapti, setGapiryapti] = useState(false);
  const [xato, setXato] = useState<JonliMikrofonXatosi | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const procRef = useRef<ScriptProcessorNode | null>(null);

  // `onaudioprocess` ichida o'qiladigan qiymatlar — ref'larda.
  const tinglashRef = useRef(tinglash);
  const onGapRef = useRef(onGap);
  onGapRef.current = onGap;

  const holat = useRef({
    fon: 0.006,
    baland: 0, // ketma-ket baland buferlar
    jimMs: 0,
    gapda: false,
    oldingi: [] as Float32Array[],
    gap: [] as Float32Array[],
    gapNamuna: 0,
  });

  const gapniTashla = useCallback((): void => {
    const h = holat.current;
    h.gapda = false;
    h.baland = 0;
    h.jimMs = 0;
    h.gap = [];
    h.gapNamuna = 0;
    setGapiryapti(false);
  }, []);

  useEffect(() => {
    tinglashRef.current = tinglash;
    if (!tinglash) gapniTashla();
  }, [tinglash, gapniTashla]);

  const gapniYubor = useCallback((): void => {
    const h = holat.current;
    const bolaklar = h.gap;
    gapniTashla();
    const rate = ctxRef.current?.sampleRate ?? NAMUNA;
    const nutq = trimSilence(joinChunks(bolaklar), rate);
    const soniya = nutq.length / rate;
    if (soniya < MIN_GAP_S) return; // yo'tal, tasodifiy shovqin — yuborilmaydi
    onGapRef.current?.(encodeWav([nutq], rate), soniya);
  }, [gapniTashla]);

  const yop = useCallback((): void => {
    procRef.current?.disconnect();
    procRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close().catch(() => undefined);
    ctxRef.current = null;
    gapniTashla();
    setOchiq(false);
    setDaraja(0);
  }, [gapniTashla]);

  useEffect(() => yop, [yop]);

  const och = useCallback(
    async (qurilmaId?: string): Promise<boolean> => {
      yop();
      setXato(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setXato({ tur: 'qollanmaydi', matn: "Bu brauzer mikrofonni qo'llamaydi. Chrome yoki Edge'da oching." });
        return false;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            ...(qurilmaId ? { deviceId: { exact: qurilmaId } } : {}),
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (err) {
        const nom = err instanceof DOMException ? err.name : '';
        setXato(
          nom === 'NotAllowedError' || nom === 'SecurityError'
            ? { tur: 'ruxsat', matn: "Mikrofonga ruxsat berilmagan. Manzil qatoridagi qulf belgisi orqali ruxsat bering." }
            : { tur: 'qurilma', matn: 'Mikrofon topilmadi yoki band. Boshqa qurilmani tanlab ko\'ring.' },
        );
        return false;
      }
      streamRef.current = stream;
      const ctx = new AudioContext({ sampleRate: NAMUNA });
      ctxRef.current = ctx;
      const manba = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(BUFER, 1, 1);
      procRef.current = proc;
      const buferMs = (BUFER / ctx.sampleRate) * 1000;
      const oldingiSoni = Math.ceil(OLDINGI_MS / buferMs);
      let oxirgiDaraja = 0;

      proc.onaudioprocess = (e): void => {
        const kirish = e.inputBuffer.getChannelData(0);
        let yig = 0;
        for (let i = 0; i < kirish.length; i += 1) yig += (kirish[i] as number) ** 2;
        const rms = Math.sqrt(yig / kirish.length);

        // Ko'rsatkich: logarifmik shkala, sezilarli o'zgarishdagina qayta chizish.
        const d = Math.min(1, Math.max(0, (Math.log10(rms + 1e-5) + 3.2) / 2.4));
        if (Math.abs(d - oxirgiDaraja) > 0.03) {
          oxirgiDaraja = d;
          setDaraja(d);
        }

        const h = holat.current;
        const chegara = Math.min(0.08, Math.max(0.012, h.fon * 3.2));
        const bolak = new Float32Array(kirish);

        if (!tinglashRef.current) {
          // Tinglamayotganda ham fon darajasini o'rganamiz.
          if (rms < chegara) h.fon = h.fon * 0.97 + rms * 0.03;
          return;
        }

        if (!h.gapda) {
          h.oldingi.push(bolak);
          if (h.oldingi.length > oldingiSoni) h.oldingi.shift();
          if (rms >= chegara) {
            h.baland += 1;
            if (h.baland >= BOSHLASH_BUFER) {
              h.gapda = true;
              h.jimMs = 0;
              h.gap = [...h.oldingi];
              h.gapNamuna = h.gap.reduce((n, c) => n + c.length, 0);
              h.oldingi = [];
              setGapiryapti(true);
            }
          } else {
            h.baland = 0;
            h.fon = h.fon * 0.97 + rms * 0.03;
          }
          return;
        }

        h.gap.push(bolak);
        h.gapNamuna += bolak.length;
        h.jimMs = rms < chegara * 0.7 ? h.jimMs + buferMs : 0;
        if (h.jimMs >= PAUZA_MS || h.gapNamuna / ctx.sampleRate >= MAKS_GAP_S) gapniYubor();
      };

      manba.connect(proc);
      const jim = ctx.createGain();
      jim.gain.value = 0; // ScriptProcessor chiqishga ulanmasa ishlamaydi
      proc.connect(jim);
      jim.connect(ctx.destination);
      await ensureAudioRunning(ctx);
      setOchiq(true);
      return true;
    },
    [yop, gapniYubor],
  );

  return { ochiq, daraja, gapiryapti, xato, och, yop };
}

/** Kirish qurilmalari (ruxsatdan keyin nomlari ko'rinadi). */
export async function mikrofonlar(): Promise<MediaDeviceInfo[]> {
  try {
    const hammasi = await navigator.mediaDevices.enumerateDevices();
    return hammasi.filter((d) => d.kind === 'audioinput');
  } catch {
    return [];
  }
}
