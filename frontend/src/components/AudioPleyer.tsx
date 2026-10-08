import { Pause, Play } from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

/**
 * Suhbat audiosi — TZ 8.3: "isbotga bosilsa transkript o'sha joyga sakraydi
 * VA audio o'sha soniyadan ijro etiladi".
 *
 * FAZA holati: sxemada `media_url` bor, lekin FAZA 1 faqat Telegram matni
 * bo'lgani uchun hozir hech bir suhbatda audio yo'q. Shuning uchun komponent
 * `mediaUrl` bo'lmasa umuman render qilinmaydi — FAZA 2 (audio + STT) kelganda
 * o'zi ishlab ketadi, qo'shimcha o'zgarish talab qilmaydi.
 */

export interface AudioPleyerHandle {
  /** Berilgan soniyaga o'tib, ijroni boshlaydi. */
  sakraVaIjro: (soniya: number) => void;
}

function vaqtMatn(s: number): string {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

export const AudioPleyer = forwardRef<
  AudioPleyerHandle,
  { src: string; kind: string | null; duration: number | null }
>(function AudioPleyer({ src, kind, duration }, ref) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [ijro, setIjro] = useState(false);
  const [joriy, setJoriy] = useState(0);
  const [uzunlik, setUzunlik] = useState(duration ?? 0);
  const [xato, setXato] = useState(false);

  useImperativeHandle(ref, () => ({
    sakraVaIjro(soniya: number) {
      const el = audioRef.current;
      if (!el) return;
      el.currentTime = Math.max(0, soniya);
      void el.play().catch(() => undefined);
    },
  }));

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    const onTime = () => setJoriy(el.currentTime);
    const onMeta = () => Number.isFinite(el.duration) && setUzunlik(el.duration);
    const onPlay = () => setIjro(true);
    const onPause = () => setIjro(false);
    const onError = () => setXato(true);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('error', onError);
    };
  }, []);

  if (xato) {
    return (
      <div className="card audio-pleyer xato">
        Audio yuklanmadi. Fayl mavjud emas yoki formati qo'llab-quvvatlanmaydi.
      </div>
    );
  }

  const foiz = uzunlik > 0 ? (joriy / uzunlik) * 100 : 0;

  return (
    <div className="card audio-pleyer">
      <audio ref={audioRef} src={src} preload="metadata">
        {kind && <source src={src} type={kind} />}
      </audio>
      <button
        type="button"
        className="ijro-tugma"
        aria-label={ijro ? 'To\'xtatish' : 'Ijro etish'}
        onClick={() => {
          const el = audioRef.current;
          if (!el) return;
          if (el.paused) void el.play().catch(() => undefined);
          else el.pause();
        }}
      >
        {ijro ? <Pause fill="currentColor" /> : <Play fill="currentColor" />}
      </button>
      <input
        type="range"
        className="ijro-chiziq"
        min={0}
        max={Math.max(1, uzunlik)}
        step={0.1}
        value={joriy}
        aria-label="Audio pozitsiyasi"
        onChange={(e) => {
          const el = audioRef.current;
          if (el) el.currentTime = Number(e.target.value);
        }}
        style={{ ['--foiz' as string]: `${foiz}%` }}
      />
      <span className="ijro-vaqt">
        {vaqtMatn(joriy)} / {vaqtMatn(uzunlik)}
      </span>
    </div>
  );
});
