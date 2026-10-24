import { ApiError } from '../../api';

/** Backend: `routes/qollanma.ts` → `javob()`. */
export interface QollanmaVideo {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  source: 'link' | 'file';
  url: string | null;
  provider: string;
  /** `iframe` — sayt pleyeri, `video` — brauzer pleyeri, `tashqi` — faqat yangi oynada. */
  player: 'iframe' | 'video' | 'tashqi';
  embedUrl: string;
  thumbnailUrl: string | null;
  vertical: boolean;
  status: 'waiting' | 'processing' | 'ready' | 'failed';
  error: string | null;
  durationSec: number | null;
  fileName: string | null;
  fileSize: number | null;
  sortOrder: number;
  isPublished: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface QollanmaRoyxat {
  videos: QollanmaVideo[];
  canManage: boolean;
  maxUploadMb: number;
}

/** `POST /havola-tahlil` — saqlashdan oldingi ko'rib chiqish. */
export interface HavolaKorinish {
  provider: string;
  player: QollanmaVideo['player'];
  embedUrl: string;
  vertical: boolean;
  thumbnailUrl: string | null;
  title: string | null;
  durationSec: number | null;
}

export const API = '/api/v1/qollanma';

/** Interfeysda ko'rinadigan nom — brend nomlari tarjima qilinmaydi. */
export const PROVAYDER_NOMI: Record<string, string> = {
  youtube: 'YouTube',
  vimeo: 'Vimeo',
  gdrive: 'Google Drive',
  loom: 'Loom',
  rutube: 'Rutube',
  vk: 'VK Video',
  dailymotion: 'Dailymotion',
  kinescope: 'Kinescope',
  tiktok: 'TikTok',
  instagram: 'Instagram',
  facebook: 'Facebook',
  telegram: 'Telegram',
  fayl: 'Video fayl',
  yuklangan: 'SotuvAI',
  boshqa: 'Tashqi sayt',
};

/** 204 → "3:24", 3725 → "1:02:05". */
export function davomiylik(sek: number | null | undefined): string | null {
  if (!sek || sek <= 0) return null;
  const s = Math.round(sek);
  const soat = Math.floor(s / 3600);
  const daq = Math.floor((s % 3600) / 60);
  const son = String(s % 60).padStart(2, '0');
  return soat > 0 ? `${soat}:${String(daq).padStart(2, '0')}:${son}` : `${daq}:${son}`;
}

export function hajm(bayt: number | null | undefined): string {
  if (!bayt) return '';
  if (bayt < 1024 * 1024) return `${Math.max(1, Math.round(bayt / 1024))} KB`;
  if (bayt < 1024 * 1024 * 1024) return `${(bayt / 1024 / 1024).toFixed(bayt < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bayt / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Faylni progress bilan yuklaydi. `fetch` yuklash progressini bermaydi —
 * katta videoda "osilib qoldimi?" degan savol tug'ilmasligi uchun XHR.
 */
export function faylYukla(
  id: string,
  fayl: File,
  onProgress: (yuklandi: number, jami: number) => void,
): { vada: Promise<QollanmaVideo>; bekor: () => void } {
  const xhr = new XMLHttpRequest();
  const vada = new Promise<QollanmaVideo>((ok, rad) => {
    xhr.open('PUT', `${API}/${id}/fayl`);
    xhr.withCredentials = true;
    xhr.responseType = 'json';
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) ok(xhr.response as QollanmaVideo);
      else {
        const j = xhr.response as { title?: string; detail?: string } | null;
        rad(new ApiError(xhr.status, j?.title ?? j?.detail ?? xhr.statusText ?? 'Yuklanmadi'));
      }
    };
    xhr.onerror = () => rad(new ApiError(0, 'Tarmoq xatosi — internet ulanishini tekshiring'));
    xhr.onabort = () => rad(new ApiError(0, 'bekor'));
    const fd = new FormData();
    fd.append('file', fayl, fayl.name);
    xhr.send(fd);
  });
  return { vada, bekor: () => xhr.abort() };
}

// ─── Ko'rilganlar va to'xtagan joy — shu brauzerda, har foydalanuvchiga alohida ───

interface Eslatma {
  korilgan: string[];
  /** id → soniya: brauzer pleyerida qayerda to'xtagani. */
  joy: Record<string, number>;
}

const kalit = (userId: string) => `sotuvai-qollanma:${userId}`;

export function eslatmaOl(userId: string): Eslatma {
  try {
    const j = JSON.parse(localStorage.getItem(kalit(userId)) ?? '{}') as Partial<Eslatma>;
    return { korilgan: Array.isArray(j.korilgan) ? j.korilgan : [], joy: j.joy && typeof j.joy === 'object' ? j.joy : {} };
  } catch {
    return { korilgan: [], joy: {} };
  }
}

export function eslatmaYoz(userId: string, e: Eslatma): void {
  try {
    localStorage.setItem(kalit(userId), JSON.stringify(e));
  } catch {
    /* xotira yopiq (maxfiy oyna) — belgilar shu sessiyada qoladi */
  }
}
