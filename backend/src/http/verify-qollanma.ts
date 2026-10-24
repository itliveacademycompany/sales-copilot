/**
 * Qo'llanma moduli tekshiruvi — bazasiz (sof funksiyalar):
 *   1. Havola tahlilchisi: har bir sayt havolasi to'g'ri pleyerga o'giriladimi
 *   2. Video formati qarori: qaysi fayl qayta kodlanadi, qaysi biri yo'q
 *   3. Range sarlavhasi: `<video>` oldinga o'tkazish so'rovlari
 *
 *   npm run verify:qollanma
 */
import { closeDb } from '../db/index.js';
import { havolaniTahlilQil, havolaniTozala } from '../qollanma/havola.js';
import { rejaTuz } from '../qollanma/media.js';
import { oraliqniOl } from './routes/qollanma.js';

let otdi = 0;
let yiqildi = 0;

function tekshir(nom: string, shart: boolean, izoh?: unknown): void {
  if (shart) {
    otdi++;
  } else {
    yiqildi++;
    console.error(`  ✗ ${nom}`, izoh ?? '');
  }
}

function havola(kirish: string, kutilgan: { provayder: string; pleyer?: string; embed?: string | RegExp; vertikal?: boolean }): void {
  const n = havolaniTahlilQil(kirish);
  const embedMos =
    kutilgan.embed === undefined
      ? true
      : typeof kutilgan.embed === 'string'
        ? n?.embedUrl === kutilgan.embed
        : kutilgan.embed.test(n?.embedUrl ?? '');
  tekshir(
    `havola: ${kirish}`,
    !!n &&
      n.provayder === kutilgan.provayder &&
      (kutilgan.pleyer === undefined || n.pleyer === kutilgan.pleyer) &&
      (kutilgan.vertikal === undefined || n.vertikal === kutilgan.vertikal) &&
      embedMos,
    n,
  );
}

console.log("→ Havola tahlilchisi");
const yt = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1';
havola('https://www.youtube.com/watch?v=dQw4w9WgXcQ', { provayder: 'youtube', pleyer: 'iframe', embed: yt });
havola('youtube.com/watch?v=dQw4w9WgXcQ&feature=share', { provayder: 'youtube', embed: yt });
havola('https://youtu.be/dQw4w9WgXcQ?si=abc', { provayder: 'youtube', embed: yt });
havola('https://m.youtube.com/watch?v=dQw4w9WgXcQ', { provayder: 'youtube', embed: yt });
havola('https://youtu.be/dQw4w9WgXcQ?t=90', { provayder: 'youtube', embed: /start=90/ });
havola('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=1m30s', { provayder: 'youtube', embed: /start=90/ });
havola('https://www.youtube.com/shorts/dQw4w9WgXcQ', { provayder: 'youtube', vertikal: true, embed: /embed\/dQw4w9WgXcQ/ });
havola('https://www.youtube.com/live/dQw4w9WgXcQ', { provayder: 'youtube', embed: /embed\/dQw4w9WgXcQ/ });
havola('https://www.youtube.com/embed/dQw4w9WgXcQ', { provayder: 'youtube', embed: /embed\/dQw4w9WgXcQ/ });
havola('https://www.youtube.com/playlist?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs', { provayder: 'youtube', embed: /videoseries\?list=PL590L5WQmH8fJ54F369BLDSqIwcs-TCfs/ });
havola('https://www.youtube.com/watch?v=yoq', { provayder: 'boshqa', pleyer: 'tashqi' });
havola('https://vimeo.com/76979871', { provayder: 'vimeo', embed: 'https://player.vimeo.com/video/76979871?dnt=1' });
havola('https://vimeo.com/76979871/8272103f6e', { provayder: 'vimeo', embed: 'https://player.vimeo.com/video/76979871?dnt=1&h=8272103f6e' });
havola('https://player.vimeo.com/video/76979871?h=8272103f6e', { provayder: 'vimeo', embed: /h=8272103f6e/ });
havola('https://vimeo.com/channels/staffpicks/76979871', { provayder: 'vimeo', embed: /video\/76979871/ });
havola('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing', { provayder: 'gdrive', embed: 'https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview' });
havola('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp', { provayder: 'gdrive', embed: /file\/d\/1AbCdEfGhIjKlMnOp\/preview/ });
havola('https://www.loom.com/share/0281766fa2d04bb788eaf19e65135184', { provayder: 'loom', embed: 'https://www.loom.com/embed/0281766fa2d04bb788eaf19e65135184' });
havola('https://rutube.ru/video/c6cc4d620b1d4338901770a44b3e82f4/', { provayder: 'rutube', embed: 'https://rutube.ru/play/embed/c6cc4d620b1d4338901770a44b3e82f4' });
havola('https://vk.com/video-22822305_456241864', { provayder: 'vk', embed: 'https://vk.com/video_ext.php?oid=-22822305&id=456241864&hd=2' });
havola('https://vkvideo.ru/video-22822305_456241864', { provayder: 'vk', embed: /oid=-22822305&id=456241864/ });
havola('https://vk.com/video_ext.php?oid=-1&id=2&hash=abc123', { provayder: 'vk', embed: /hash=abc123/ });
havola('https://www.dailymotion.com/video/x8abcde', { provayder: 'dailymotion', embed: 'https://www.dailymotion.com/embed/video/x8abcde' });
havola('https://dai.ly/x8abcde', { provayder: 'dailymotion', embed: /embed\/video\/x8abcde/ });
havola('https://kinescope.io/abc123XYZ', { provayder: 'kinescope', embed: 'https://kinescope.io/embed/abc123XYZ' });
havola('https://www.tiktok.com/@user/video/7234567890123456789', { provayder: 'tiktok', vertikal: true, embed: /embed\/v2\/7234567890123456789/ });
havola('https://www.instagram.com/reel/C1a2B3c4D5e/', { provayder: 'instagram', vertikal: true, embed: 'https://www.instagram.com/reel/C1a2B3c4D5e/embed' });
havola('https://www.facebook.com/somepage/videos/1234567890/', { provayder: 'facebook', embed: /plugins\/video\.php\?href=/ });
havola('https://t.me/sotuvai_kanal/42', { provayder: 'telegram', embed: 'https://t.me/sotuvai_kanal/42?embed=1&mode=tme' });
havola('https://cdn.example.uz/darslar/kirish.mp4', { provayder: 'fayl', pleyer: 'video', embed: 'https://cdn.example.uz/darslar/kirish.mp4' });
havola('https://cdn.example.uz/darslar/kirish.webm?token=1', { provayder: 'fayl', pleyer: 'video' });
havola('/qollanma-media/qongiroqlar-bolimi.mp4', { provayder: 'fayl', pleyer: 'video', embed: '/qollanma-media/qongiroqlar-bolimi.mp4' });
havola('https://example.uz/kurs/1-dars', { provayder: 'boshqa', pleyer: 'tashqi' });

tekshir('xavfli: javascript:', havolaniTahlilQil('javascript:alert(1)') === null);
tekshir('xavfli: data:', havolaniTahlilQil('data:text/html,<script>alert(1)</script>') === null);
tekshir('xavfli: //evil.com (protokolsiz tashqi)', havolaniTozala('//evil.com/x.mp4') !== '//evil.com/x.mp4');
tekshir("bo'sh matn", havolaniTahlilQil('   ') === null);
tekshir('URL emas', havolaniTahlilQil('salom dunyo') === null);

console.log('→ Video formati qarori');
const probe = (konteyner: string, v: Record<string, string> | null, a?: Record<string, string>) => ({
  format: { format_name: konteyner, duration: '10' },
  streams: [...(v ? [{ codec_type: 'video', ...v }] : []), ...(a ? [{ codec_type: 'audio', ...a }] : [])],
});
const mp4 = 'mov,mp4,m4a,3gp,3g2,mj2';
tekshir('H.264 4:2:0 + AAC → qayta o\'rash', rejaTuz(probe(mp4, { codec_name: 'h264', pix_fmt: 'yuv420p', profile: 'High' }, { codec_name: 'aac' })) === 'mp4-qayta-orash');
tekshir('H.264 4:4:4 (ekran yozuvi) → kodlash', rejaTuz(probe(mp4, { codec_name: 'h264', pix_fmt: 'yuv444p', profile: 'High 4:4:4 Predictive' }, { codec_name: 'aac' })) === 'kodlash');
tekshir('HEVC → kodlash', rejaTuz(probe(mp4, { codec_name: 'hevc', pix_fmt: 'yuv420p' }, { codec_name: 'aac' })) === 'kodlash');
tekshir('H.264 + PCM ovoz (mov) → kodlash', rejaTuz(probe(mp4, { codec_name: 'h264', pix_fmt: 'yuv420p' }, { codec_name: 'pcm_s16le' })) === 'kodlash');
tekshir('ovozsiz H.264 → qayta o\'rash', rejaTuz(probe(mp4, { codec_name: 'h264', pix_fmt: 'yuv420p' })) === 'mp4-qayta-orash');
tekshir('VP9 + Opus webm → o\'zgarishsiz', rejaTuz(probe('matroska,webm', { codec_name: 'vp9', pix_fmt: 'yuv420p' }, { codec_name: 'opus' })) === 'webm-ozgarishsiz');
tekshir('MKV ichida H.264 → kodlash (konteyner)', rejaTuz(probe('matroska,webm', { codec_name: 'h264', pix_fmt: 'yuv420p' }, { codec_name: 'aac' })) === 'kodlash');
tekshir('faqat ovoz → video yo\'q', rejaTuz(probe('mp3', null, { codec_name: 'mp3' })) === null);

console.log('→ Range sarlavhasi');
const r = (h: string | undefined, hajm = 1000) => JSON.stringify(oraliqniOl(h, hajm));
tekshir('sarlavhasiz', r(undefined) === 'null');
tekshir('bytes=0-', r('bytes=0-') === '[0,999]');
tekshir('bytes=100-199', r('bytes=100-199') === '[100,199]');
tekshir('oxiridan oshgan', r('bytes=900-5000') === '[900,999]');
tekshir('bytes=-100 (oxirgi 100)', r('bytes=-100') === '[900,999]');
tekshir('chegaradan tashqari → 416', r('bytes=1000-') === '"chegaradan-tashqari"');
tekshir('teskari oraliq → 416', r('bytes=500-100') === '"chegaradan-tashqari"');
tekshir('bir nechta oraliq → butun fayl', r('bytes=0-1,5-6') === 'null');

await closeDb();
console.log(`\n${otdi}/${otdi + yiqildi} o'tdi`);
if (yiqildi > 0) process.exit(1);
