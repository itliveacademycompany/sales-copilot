/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VIDEO HAVOLASI TAHLILCHISI — "qayerdan bo'lsa ham qo'yib bo'lsin"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Admin brauzer manzil satridan nima nusxa olgan bo'lsa — o'shani qo'yadi:
 * `youtu.be/…`, `youtube.com/shorts/…`, Vimeo'ning yopiq havolasi, Google
 * Drive'ning "view" havolasi va h.k. Bu modul uni pleyer tushunadigan
 * shaklga (iframe `src` yoki to'g'ridan-to'g'ri video fayl) o'giradi.
 *
 * Natija BAZADA SAQLANMAYDI — har o'qishda hisoblanadi. Shu sabab biror
 * sayt embed formatini o'zgartirsa, faqat shu faylni tuzatish kifoya:
 * eski yozuvlar ham avtomatik to'g'ri ishlaydi.
 *
 * Tanilmagan sayt ham rad etilmaydi — `pleyer: 'tashqi'`: interfeys uni
 * "Manbada ochish" tugmasi bilan ko'rsatadi. Ko'p saytlar o'zini iframe'ga
 * qo'yishni taqiqlaydi (X-Frame-Options), shuning uchun noma'lum saytni
 * ko'r-ko'rona iframe'ga solish bo'sh oq to'rtburchak berardi.
 */

export type Provayder =
  | 'youtube'
  | 'vimeo'
  | 'gdrive'
  | 'loom'
  | 'rutube'
  | 'vk'
  | 'dailymotion'
  | 'kinescope'
  | 'tiktok'
  | 'instagram'
  | 'facebook'
  | 'telegram'
  | 'fayl'
  | 'boshqa';

export interface HavolaNatija {
  provayder: Provayder;
  /** `iframe` — sayt pleyeri; `video` — brauzerning o'z pleyeri; `tashqi` — faqat yangi oynada. */
  pleyer: 'iframe' | 'video' | 'tashqi';
  /** iframe `src` yoki video fayl manzili. `tashqi` da — asl havola. */
  embedUrl: string;
  /** Tarmoqqa chiqmasdan aniqlanadigan muqova (YouTube, Dailymotion…). */
  muqova: string | null;
  /** Tik video (Shorts, TikTok, Reels) — pleyer 9:16 ramkada ko'rsatiladi. */
  vertikal: boolean;
}

const VIDEO_KENGAYTMA = /\.(mp4|m4v|webm|ogv|ogg|mov)$/i;

/** Saytdagi nisbiy yo'l: `/qollanma-media/x.mp4`. `//evil.com` (protokolsiz tashqi) emas. */
const NISBIY = /^\/(?!\/)[^\s]*$/;

/**
 * Kiritilgan matnni URL ga aylantiradi. `www.youtube.com/…` kabi
 * protokolsiz nusxalar ham qabul qilinadi — odamlar shunday nusxalaydi.
 */
export function havolaniTozala(kirish: string): string | null {
  const v = kirish.trim();
  if (!v || v.length > 2000) return null;
  if (NISBIY.test(v)) return v;
  const protokolli = /^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`;
  let u: URL;
  try {
    u = new URL(protokolli);
  } catch {
    return null;
  }
  // `javascript:`, `data:` va boshqalar — iframe/video `src` ga hech qachon tushmasin.
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  if (!u.hostname.includes('.')) return null;
  return u.toString();
}

/** Soniyaga: `90`, `1m30s`, `1h2m3s`. YouTube `t=` parametri uchun. */
function vaqtSoniya(t: string | null): number | null {
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(t);
  if (!m || !m[0]) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

function youtube(u: URL): HavolaNatija | null {
  const host = u.hostname.replace(/^(www\.|m\.|music\.)/, '');
  let id: string | null = null;
  let vertikal = false;

  if (host === 'youtu.be') {
    id = u.pathname.slice(1).split('/')[0] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const [, bolim, qism] = u.pathname.split('/');
    if (bolim === 'watch') id = u.searchParams.get('v');
    else if (bolim === 'shorts') {
      id = qism ?? null;
      vertikal = true;
    } else if (bolim === 'embed' || bolim === 'live' || bolim === 'v') {
      id = qism ?? null;
      if (qism === 'videoseries') id = null;
    }

    // Faqat playlist: `youtube.com/playlist?list=…`
    const list = u.searchParams.get('list');
    if (!id && list && /^[A-Za-z0-9_-]+$/.test(list)) {
      return {
        provayder: 'youtube',
        pleyer: 'iframe',
        embedUrl: `https://www.youtube-nocookie.com/embed/videoseries?list=${list}&rel=0`,
        muqova: null,
        vertikal: false,
      };
    }
  } else {
    return null;
  }

  if (!id || !YT_ID.test(id)) return null;
  const p = new URLSearchParams({ rel: '0', modestbranding: '1', playsinline: '1' });
  const start = vaqtSoniya(u.searchParams.get('t') ?? u.searchParams.get('start'));
  if (start) p.set('start', String(start));
  const list = u.searchParams.get('list');
  if (list && /^[A-Za-z0-9_-]+$/.test(list)) p.set('list', list);
  return {
    provayder: 'youtube',
    pleyer: 'iframe',
    // nocookie — ko'rgan odam reklama profiliga yozilmaydi.
    embedUrl: `https://www.youtube-nocookie.com/embed/${id}?${p.toString()}`,
    muqova: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    vertikal,
  };
}

function vimeo(u: URL): HavolaNatija | null {
  const host = u.hostname.replace(/^www\./, '');
  if (host !== 'vimeo.com' && host !== 'player.vimeo.com') return null;
  // vimeo.com/123, vimeo.com/123/abcdef (yopiq), player.vimeo.com/video/123?h=…,
  // vimeo.com/channels/x/123, vimeo.com/showcase/1/video/123
  const m = /\/(\d{5,})(?:\/([a-f0-9]{6,}))?\/?$/.exec(u.pathname);
  if (!m) return null;
  const hash = m[2] ?? u.searchParams.get('h');
  const p = new URLSearchParams({ dnt: '1' });
  if (hash && /^[a-f0-9]+$/.test(hash)) p.set('h', hash);
  return {
    provayder: 'vimeo',
    pleyer: 'iframe',
    embedUrl: `https://player.vimeo.com/video/${m[1]}?${p.toString()}`,
    muqova: null,
    vertikal: false,
  };
}

function gdrive(u: URL): HavolaNatija | null {
  if (u.hostname !== 'drive.google.com' && u.hostname !== 'docs.google.com') return null;
  const id = /\/file\/d\/([\w-]{10,})/.exec(u.pathname)?.[1] ?? u.searchParams.get('id');
  if (!id || !/^[\w-]{10,}$/.test(id)) return null;
  return {
    provayder: 'gdrive',
    pleyer: 'iframe',
    embedUrl: `https://drive.google.com/file/d/${id}/preview`,
    muqova: `https://drive.google.com/thumbnail?id=${id}&sz=w640`,
    vertikal: false,
  };
}

function loom(u: URL): HavolaNatija | null {
  if (u.hostname.replace(/^www\./, '') !== 'loom.com') return null;
  const id = /^\/(?:share|embed)\/([a-f0-9]{16,})/.exec(u.pathname)?.[1];
  if (!id) return null;
  return { provayder: 'loom', pleyer: 'iframe', embedUrl: `https://www.loom.com/embed/${id}`, muqova: null, vertikal: false };
}

function rutube(u: URL): HavolaNatija | null {
  if (u.hostname.replace(/^www\./, '') !== 'rutube.ru') return null;
  const m = /^\/(?:video\/(?:private\/)?|play\/embed\/|shorts\/)([a-f0-9]{32})/.exec(u.pathname);
  if (!m) return null;
  const kalit = u.searchParams.get('p');
  return {
    provayder: 'rutube',
    pleyer: 'iframe',
    embedUrl: `https://rutube.ru/play/embed/${m[1]}${kalit && /^[\w-]+$/.test(kalit) ? `/?p=${kalit}` : ''}`,
    muqova: null,
    vertikal: u.pathname.startsWith('/shorts/'),
  };
}

function vk(u: URL): HavolaNatija | null {
  const host = u.hostname.replace(/^(www\.|m\.)/, '');
  if (host !== 'vk.com' && host !== 'vkvideo.ru' && host !== 'vk.ru') return null;

  // Tayyor embed havolasi (hash bilan) — o'zgarishsiz.
  if (u.pathname === '/video_ext.php') {
    const oid = u.searchParams.get('oid');
    const id = u.searchParams.get('id');
    if (!oid || !id || !/^-?\d+$/.test(oid) || !/^\d+$/.test(id)) return null;
    const p = new URLSearchParams({ oid, id, hd: '2' });
    const hash = u.searchParams.get('hash');
    if (hash && /^[a-f0-9]+$/.test(hash)) p.set('hash', hash);
    return { provayder: 'vk', pleyer: 'iframe', embedUrl: `https://vk.com/video_ext.php?${p.toString()}`, muqova: null, vertikal: false };
  }

  // vk.com/video-123_456, vkvideo.ru/video-123_456, …?z=video-123_456
  const manba = `${u.pathname}?${u.searchParams.get('z') ?? ''}`;
  const m = /(?:video|clip)(-?\d+)_(\d+)/.exec(manba);
  if (!m) return null;
  return {
    provayder: 'vk',
    pleyer: 'iframe',
    embedUrl: `https://vk.com/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2`,
    muqova: null,
    vertikal: manba.includes('clip'),
  };
}

function dailymotion(u: URL): HavolaNatija | null {
  const host = u.hostname.replace(/^www\./, '');
  let id: string | undefined;
  if (host === 'dai.ly') id = u.pathname.slice(1);
  else if (host === 'dailymotion.com') id = /\/(?:embed\/)?video\/([a-zA-Z0-9]+)/.exec(u.pathname)?.[1];
  else return null;
  if (!id || !/^[a-zA-Z0-9]+$/.test(id)) return null;
  return {
    provayder: 'dailymotion',
    pleyer: 'iframe',
    embedUrl: `https://www.dailymotion.com/embed/video/${id}`,
    muqova: `https://www.dailymotion.com/thumbnail/video/${id}`,
    vertikal: false,
  };
}

function kinescope(u: URL): HavolaNatija | null {
  if (u.hostname.replace(/^www\./, '') !== 'kinescope.io') return null;
  const id = /^\/(?:embed\/)?([a-zA-Z0-9]{6,})\/?$/.exec(u.pathname)?.[1];
  if (!id) return null;
  return { provayder: 'kinescope', pleyer: 'iframe', embedUrl: `https://kinescope.io/embed/${id}`, muqova: null, vertikal: false };
}

function tiktok(u: URL): HavolaNatija | null {
  if (u.hostname.replace(/^(www\.|m\.)/, '') !== 'tiktok.com') return null;
  const id = /\/(?:video|embed\/v2|embed)\/(\d{8,})/.exec(u.pathname)?.[1];
  if (!id) return null;
  return { provayder: 'tiktok', pleyer: 'iframe', embedUrl: `https://www.tiktok.com/embed/v2/${id}`, muqova: null, vertikal: true };
}

function instagram(u: URL): HavolaNatija | null {
  if (u.hostname.replace(/^www\./, '') !== 'instagram.com') return null;
  const m = /^\/(?:[\w.]+\/)?(reel|reels|p|tv)\/([\w-]+)/.exec(u.pathname);
  if (!m) return null;
  const tur = m[1] === 'reels' ? 'reel' : m[1];
  return {
    provayder: 'instagram',
    pleyer: 'iframe',
    embedUrl: `https://www.instagram.com/${tur}/${m[2]}/embed`,
    muqova: null,
    vertikal: tur === 'reel',
  };
}

function facebook(u: URL): HavolaNatija | null {
  const host = u.hostname.replace(/^(www\.|m\.|web\.)/, '');
  if (host !== 'facebook.com' && host !== 'fb.watch') return null;
  if (host === 'facebook.com' && !/\/(videos|watch|reel|share\/v|share\/r)\b/.test(`${u.pathname}`)) return null;
  const tozaHref = `${u.origin}${u.pathname}${u.searchParams.get('v') ? `?v=${u.searchParams.get('v')}` : ''}`;
  return {
    provayder: 'facebook',
    pleyer: 'iframe',
    embedUrl: `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(tozaHref)}&show_text=false`,
    muqova: null,
    vertikal: /\/(reel|share\/r)\b/.test(u.pathname),
  };
}

function telegram(u: URL): HavolaNatija | null {
  const host = u.hostname.replace(/^www\./, '');
  if (host !== 't.me' && host !== 'telegram.me') return null;
  // Faqat OCHIQ kanal posti: t.me/kanal/123 yoki t.me/s/kanal/123
  const m = /^\/(?:s\/)?([a-zA-Z][\w]{3,})\/(\d+)\/?$/.exec(u.pathname);
  if (!m) return null;
  return {
    provayder: 'telegram',
    pleyer: 'iframe',
    embedUrl: `https://t.me/${m[1]}/${m[2]}?embed=1&mode=tme`,
    muqova: null,
    vertikal: false,
  };
}

const TAHLILCHILAR = [youtube, vimeo, gdrive, loom, rutube, vk, dailymotion, kinescope, tiktok, instagram, facebook, telegram];

/**
 * Havolani pleyer ko'rinishiga o'giradi. Noto'g'ri (URL bo'lmagan) matn
 * uchun `null` — aks holda har doim natija bor (eng yomoni `tashqi`).
 */
export function havolaniTahlilQil(kirish: string): HavolaNatija | null {
  const toza = havolaniTozala(kirish);
  if (!toza) return null;

  if (NISBIY.test(toza)) {
    const yol = toza.split(/[?#]/)[0]!;
    return VIDEO_KENGAYTMA.test(yol)
      ? { provayder: 'fayl', pleyer: 'video', embedUrl: toza, muqova: null, vertikal: false }
      : { provayder: 'boshqa', pleyer: 'tashqi', embedUrl: toza, muqova: null, vertikal: false };
  }

  const u = new URL(toza);
  for (const f of TAHLILCHILAR) {
    const n = f(u);
    if (n) return n;
  }
  if (VIDEO_KENGAYTMA.test(u.pathname)) {
    return { provayder: 'fayl', pleyer: 'video', embedUrl: toza, muqova: null, vertikal: false };
  }
  return { provayder: 'boshqa', pleyer: 'tashqi', embedUrl: toza, muqova: null, vertikal: false };
}

// ─── oEmbed: sarlavha, muqova, davomiylik ────────────────────────────────────

export interface OembedNatija {
  sarlavha: string | null;
  muqova: string | null;
  davomiylik: number | null;
}

/**
 * FAQAT shu ro'yxatdagi rasmiy oEmbed manzillariga so'rov ketadi —
 * foydalanuvchi bergan ixtiyoriy URL'ga server hech qachon o'zi bormaydi
 * (SSRF: ichki tarmoqdagi xizmatlarni "skanerlash" imkoni bo'lmasin).
 * Havola faqat so'rov parametri sifatida uzatiladi.
 */
const OEMBED: Partial<Record<Provayder, string>> = {
  youtube: 'https://www.youtube.com/oembed?format=json&url=',
  vimeo: 'https://vimeo.com/api/oembed.json?url=',
  loom: 'https://www.loom.com/v1/oembed?format=json&url=',
  dailymotion: 'https://www.dailymotion.com/services/oembed?format=json&url=',
  rutube: 'https://rutube.ru/api/oembed/?format=json&url=',
  tiktok: 'https://www.tiktok.com/oembed?url=',
};

const kesh = new Map<string, { vaqt: number; natija: OembedNatija }>();
const KESH_MS = 10 * 60_000;

function matn(v: unknown, max: number): string | null {
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
}

/**
 * Sarlavha/muqova/davomiylikni sayt o'zidan so'raydi. Xato yoki sekin
 * javob — jim `null`lar: bu faqat qulaylik, video baribir ishlaydi.
 * Natija 10 daqiqa keshlanadi: oynada ko'rib chiqish va saqlash bir xil
 * havolani ikki marta so'raydi.
 */
export async function oembedOl(kirish: string, provayder: Provayder): Promise<OembedNatija> {
  const bosh: OembedNatija = { sarlavha: null, muqova: null, davomiylik: null };
  const manzil = OEMBED[provayder];
  const toza = havolaniTozala(kirish);
  if (!manzil || !toza || NISBIY.test(toza)) return bosh;

  const k = kesh.get(toza);
  if (k && Date.now() - k.vaqt < KESH_MS) return k.natija;

  try {
    const res = await fetch(manzil + encodeURIComponent(toza), {
      signal: AbortSignal.timeout(5000),
      headers: { accept: 'application/json' },
      redirect: 'follow',
    });
    if (!res.ok) return bosh;
    const j = (await res.json()) as Record<string, unknown>;
    const muqova = matn(j.thumbnail_url, 1000);
    const natija: OembedNatija = {
      sarlavha: matn(j.title, 200),
      muqova: muqova && /^https:\/\//.test(muqova) ? muqova : null,
      davomiylik: typeof j.duration === 'number' && j.duration > 0 ? Math.round(j.duration) : null,
    };
    if (kesh.size > 500) kesh.clear();
    kesh.set(toza, { vaqt: Date.now(), natija });
    return natija;
  } catch {
    return bosh;
  }
}
