import { ExternalLink, LoaderCircle, Play, RotateCcw, SkipForward, TriangleAlert } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n';
import { PROVAYDER_NOMI, type QollanmaVideo } from './qollanma';

interface Props {
  video: QollanmaVideo;
  /** Brauzer pleyerida oldin qayerda to'xtagani (soniya). */
  joy: number;
  onJoy: (sekund: number) => void;
  onKorildi: () => void;
  keyingi: QollanmaVideo | null;
  onKeyingi: () => void;
}

/** iframe pleyer (YouTube…) ichini kuzatib bo'lmaydi — shuncha vaqt ochiq tursa "ko'rildi". */
const IFRAME_KORILDI_MS = 30_000;

/**
 * Bitta ramka — uch xil manba:
 *   video  — yuklangan fayl yoki to'g'ridan-to'g'ri .mp4: brauzer pleyeri,
 *            to'xtagan joydan davom etadi, oxirida "keyingi dars" taklifi;
 *   iframe — YouTube, Vimeo, Drive, …: saytning o'z pleyeri;
 *   tashqi — iframe'ga qo'yib bo'lmaydigan sayt: "Manbada ochish".
 * Ramka har doim 16:9 — tik videolar (Shorts, Reels) uning ichida markazda.
 */
export function Pleyer({ video, joy, onJoy, onKorildi, keyingi, onKeyingi }: Props) {
  const t = useT();
  const ref = useRef<HTMLVideoElement>(null);
  const oxirgiYozuv = useRef(0);
  const [tugadi, setTugadi] = useState(false);
  const [davomEtdi, setDavomEtdi] = useState(false);

  // Callback'lar har renderda yangi — effektlar eskisini ushlab qolmasin.
  const cb = useRef({ onJoy, onKorildi });
  cb.current = { onJoy, onKorildi };

  useEffect(() => {
    setTugadi(false);
    setDavomEtdi(false);
    oxirgiYozuv.current = 0;
  }, [video.id]);

  useEffect(() => {
    if (video.player !== 'iframe' || video.status !== 'ready') return;
    const id = setTimeout(() => cb.current.onKorildi(), IFRAME_KORILDI_MS);
    return () => clearTimeout(id);
  }, [video.id, video.player, video.status]);

  useEffect(() => {
    if (!davomEtdi) return;
    const id = setTimeout(() => setDavomEtdi(false), 6000);
    return () => clearTimeout(id);
  }, [davomEtdi]);

  const provayder = t(PROVAYDER_NOMI[video.provider] ?? video.provider);

  let ichi;
  if (video.status === 'processing' || video.status === 'waiting') {
    ichi = (
      <div className="ql-ekran-holat">
        <LoaderCircle className="ql-aylanma" />
        <b>{video.status === 'waiting' ? t('Fayl hali yuklanmagan') : t('Video tayyorlanmoqda…')}</b>
        <span>
          {video.status === 'waiting'
            ? t('Tahrirlash orqali video faylni yuklang.')
            : t("Server videoni barcha qurilmalarda ochiladigan formatga o'tkazmoqda. Bu bir necha daqiqa olishi mumkin.")}
        </span>
      </div>
    );
  } else if (video.status === 'failed') {
    ichi = (
      <div className="ql-ekran-holat xato">
        <TriangleAlert />
        <b>{t('Video tayyorlanmadi')}</b>
        <span>{video.error ?? t('Faylni qayta yuklab ko\'ring.')}</span>
      </div>
    );
  } else if (video.player === 'video') {
    ichi = (
      <>
        <video
          key={video.id}
          ref={ref}
          className="ql-video"
          src={video.embedUrl}
          poster={video.thumbnailUrl ?? undefined}
          controls
          playsInline
          preload="metadata"
          controlsList="nodownload"
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            // Oxiriga yaqin to'xtagan bo'lsa — boshidan (aks holda darhol tugab qoladi).
            if (joy > 5 && Number.isFinite(v.duration) && joy < v.duration - 10) {
              v.currentTime = joy;
              setDavomEtdi(true);
            }
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget;
            if (v.duration && v.currentTime / v.duration >= 0.9) cb.current.onKorildi();
            if (Math.abs(v.currentTime - oxirgiYozuv.current) >= 5) {
              oxirgiYozuv.current = v.currentTime;
              cb.current.onJoy(v.currentTime);
            }
          }}
          onPlay={() => setTugadi(false)}
          onEnded={() => {
            cb.current.onKorildi();
            cb.current.onJoy(0);
            setTugadi(true);
          }}
        />
        {davomEtdi && !tugadi && (
          <button
            type="button"
            className="ql-davom"
            onClick={() => {
              if (ref.current) ref.current.currentTime = 0;
              setDavomEtdi(false);
            }}
          >
            <RotateCcw /> {t("To'xtagan joydan davom etmoqda · Boshidan ko'rish")}
          </button>
        )}
        {tugadi && (
          <div className="ql-tugadi">
            {keyingi ? (
              <>
                <span className="ql-tugadi-yorliq">{t('Keyingi dars')}</span>
                <b>{keyingi.title}</b>
                <div className="ql-tugadi-tugmalar">
                  <button type="button" className="btn ikkinchi" onClick={() => ref.current?.play()}>
                    <RotateCcw /> {t('Qayta ko\'rish')}
                  </button>
                  <button type="button" className="btn" onClick={onKeyingi}>
                    <SkipForward /> {t('Keyingisi')}
                  </button>
                </div>
              </>
            ) : (
              <>
                <b>{t("Barcha darslarni ko'rib chiqdingiz")}</b>
                <button type="button" className="btn ikkinchi" onClick={() => ref.current?.play()}>
                  <RotateCcw /> {t('Qayta ko\'rish')}
                </button>
              </>
            )}
          </div>
        )}
      </>
    );
  } else if (video.player === 'iframe') {
    ichi = (
      <div className={`ql-ramka${video.vertical ? ' vertikal' : ''}`}>
        <iframe
          key={video.id}
          src={video.embedUrl}
          title={video.title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
    );
  } else {
    ichi = (
      <div className="ql-ekran-holat tashqi" style={video.thumbnailUrl ? { backgroundImage: `url("${video.thumbnailUrl}")` } : undefined}>
        <div className="ql-tashqi-ichi">
          <span className="ql-katta-play" aria-hidden="true">
            <Play />
          </span>
          <b>{t('Bu video boshqa saytda joylashgan')}</b>
          <span>{t("Sayt videoni bu yerda ko'rsatishga ruxsat bermaydi — uni yangi oynada oching.")}</span>
          <a className="btn" href={video.embedUrl} target="_blank" rel="noopener noreferrer" onClick={() => cb.current.onKorildi()}>
            <ExternalLink /> {t('Manbada ochish')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="ql-ekran" aria-label={`${video.title} — ${provayder}`}>
      {ichi}
    </div>
  );
}
