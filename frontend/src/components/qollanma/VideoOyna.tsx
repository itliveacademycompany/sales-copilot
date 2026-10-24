import { CloudUpload, FileVideo, Link2, LoaderCircle, TriangleAlert, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError } from '../../api';
import { useT } from '../../i18n';
import { API, davomiylik, faylYukla, hajm, PROVAYDER_NOMI, type HavolaKorinish, type QollanmaVideo } from './qollanma';

interface Props {
  /** Tahrirlanayotgan video; yangi qo'shishda `null`. */
  video: QollanmaVideo | null;
  bolimlar: string[];
  maxMb: number;
  onYop: () => void;
  onSaqlandi: (v: QollanmaVideo) => void;
}

const QOLLANADI = ['YouTube', 'Vimeo', 'Google Drive', 'Loom', 'Rutube', 'VK Video', 'Telegram', 'TikTok', 'Instagram', '.mp4'];

/** "01-kirish_darsi.mp4" → "01 kirish darsi" — sarlavha uchun boshlang'ich taklif. */
function faylNomidanSarlavha(nom: string): string {
  return nom.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/**
 * Video qo'shish/tahrirlash. Ikki manba:
 *   Havola — qo'yilishi bilan server tahlil qiladi: qaysi sayt, muqova va
 *            sarlavha darhol ko'rinadi (sarlavha bo'sh bo'lsa avto to'ladi);
 *   Fayl   — sudrab tashlash yoki tanlash, progress va bekor qilish bilan.
 * Fayl oqimi: avval yozuv, keyin fayl. Yuklash uzilsa/bekor qilinsa —
 * yangi yaratilgan yozuv o'chiriladi, ro'yxatda "yetim" qolmaydi.
 */
export function VideoOyna({ video, bolimlar, maxMb, onYop, onSaqlandi }: Props) {
  const t = useT();
  const idPrefix = useId();
  const [manba, setManba] = useState<'link' | 'file'>(video?.source ?? 'link');
  const [title, setTitle] = useState(video?.title ?? '');
  const sarlavhaQolda = useRef(Boolean(video));
  const [description, setDescription] = useState(video?.description ?? '');
  const [category, setCategory] = useState(video?.category ?? '');
  const [isPublished, setIsPublished] = useState(video?.isPublished ?? true);
  const [url, setUrl] = useState(video?.url ?? '');
  const [korinish, setKorinish] = useState<HavolaKorinish | null>(null);
  const [tahlil, setTahlil] = useState<'yoq' | 'kutilmoqda' | 'xato'>('yoq');
  const [fayl, setFayl] = useState<File | null>(null);
  const [sudrash, setSudrash] = useState(false);
  const [progress, setProgress] = useState<{ yuklandi: number; jami: number } | null>(null);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const bekorRef = useRef<(() => void) | null>(null);
  const chegara = maxMb >= 1024 ? `${Number((maxMb / 1024).toFixed(1))} GB` : `${maxMb} MB`;
  const faylInput = useRef<HTMLInputElement>(null);
  const birinchi = useRef<HTMLInputElement>(null);

  useEffect(() => {
    birinchi.current?.focus();
  }, [manba]);

  // Esc — yopish (yuklash paytida emas: tasodifan bosilsa GB lik yuklash yo'qolmasin).
  useEffect(() => {
    const tingla = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !band) onYop();
    };
    window.addEventListener('keydown', tingla);
    return () => window.removeEventListener('keydown', tingla);
  }, [band, onYop]);

  // Havola o'zgarsa — 500 ms dan keyin serverda tahlil.
  useEffect(() => {
    if (manba !== 'link') return;
    const v = url.trim();
    if (!v) {
      setKorinish(null);
      setTahlil('yoq');
      return;
    }
    setTahlil('kutilmoqda');
    let tirik = true;
    const id = setTimeout(() => {
      api
        .post<HavolaKorinish>(`${API}/havola-tahlil`, { url: v })
        .then((k) => {
          if (!tirik) return;
          setKorinish(k);
          setTahlil('yoq');
          if (!sarlavhaQolda.current && k.title) setTitle(k.title);
        })
        .catch(() => {
          if (!tirik) return;
          setKorinish(null);
          setTahlil('xato');
        });
    }, 500);
    return () => {
      tirik = false;
      clearTimeout(id);
    };
  }, [url, manba]);

  function faylTanla(f: File | undefined) {
    if (!f) return;
    setXato(null);
    if (f.size > maxMb * 1024 * 1024) {
      setXato(t('Fayl juda katta — {hajm} dan oshmasin', { hajm: chegara }));
      return;
    }
    if (!f.type.startsWith('video/') && !/\.(mp4|m4v|mov|webm|mkv|avi|wmv|flv|mpg|mpeg|3gp|ts|mts|m2ts|ogv)$/i.test(f.name)) {
      setXato(t('Video fayl tanlang'));
      return;
    }
    setFayl(f);
    if (!sarlavhaQolda.current && !title.trim()) setTitle(faylNomidanSarlavha(f.name));
  }

  function tashla(e: DragEvent) {
    e.preventDefault();
    setSudrash(false);
    if (!band) faylTanla(e.dataTransfer.files[0]);
  }

  const faylKerak = manba === 'file' && (!video || video.source !== 'file');
  const tayyor =
    title.trim().length >= 2 &&
    (manba === 'link' ? Boolean(url.trim()) && tahlil !== 'xato' : !faylKerak || Boolean(fayl));

  async function saqla(e: FormEvent) {
    e.preventDefault();
    if (!tayyor || band) return;
    setBand(true);
    setXato(null);
    const meta = {
      title: title.trim(),
      description: description.trim() || null,
      category: category.trim() || null,
      isPublished,
    };

    let yangiId: string | null = null;
    try {
      let natija: QollanmaVideo;
      if (manba === 'link') {
        natija = video
          ? await api.patch<QollanmaVideo>(`${API}/${video.id}`, { ...meta, url: url.trim() })
          : await api.post<QollanmaVideo>(API, { ...meta, source: 'link', url: url.trim() });
      } else {
        natija = video
          ? await api.patch<QollanmaVideo>(`${API}/${video.id}`, meta)
          : await api.post<QollanmaVideo>(API, { ...meta, source: 'file' });
        if (!video) yangiId = natija.id;
        if (fayl) {
          setProgress({ yuklandi: 0, jami: fayl.size });
          const y = faylYukla(natija.id, fayl, (yuklandi, jami) => setProgress({ yuklandi, jami }));
          bekorRef.current = y.bekor;
          natija = await y.vada;
        }
      }
      onSaqlandi(natija);
    } catch (err) {
      const bekorQilindi = err instanceof ApiError && err.message === 'bekor';
      // Yangi yozuv uchun fayl yetib bormadi — bo'sh yozuvni qoldirmaymiz.
      if (yangiId) await api.del(`${API}/${yangiId}`).catch(() => undefined);
      setXato(bekorQilindi ? null : err instanceof ApiError ? err.message : t('Saqlanmadi'));
      setProgress(null);
      setBand(false);
    } finally {
      bekorRef.current = null;
    }
  }

  const foiz = progress ? Math.min(100, Math.round((progress.yuklandi / Math.max(1, progress.jami)) * 100)) : 0;
  const k = korinish;

  return createPortal(
    <div className="vr-fon" onMouseDown={(e) => e.target === e.currentTarget && !band && onYop()}>
      <form className="vr-oyna ql-oyna" role="dialog" aria-modal="true" aria-labelledby={`${idPrefix}-nom`} onSubmit={saqla}>
        <div className="vr-oyna-bosh">
          <h3 id={`${idPrefix}-nom`}>{video ? t('Videoni tahrirlash') : t("Video qo'shish")}</h3>
          <button type="button" className="vr-amal" onClick={onYop} disabled={band} aria-label={t('Yopish')}>
            <X />
          </button>
        </div>

        <div className="tab-qator ql-manba" role="tablist" aria-label={t('Video manbasi')}>
          <button type="button" role="tab" aria-selected={manba === 'link'} className={`tab${manba === 'link' ? ' active' : ''}`} disabled={band} onClick={() => setManba('link')}>
            <Link2 /> {t('Havola')}
          </button>
          <button type="button" role="tab" aria-selected={manba === 'file'} className={`tab${manba === 'file' ? ' active' : ''}`} disabled={band} onClick={() => setManba('file')}>
            <CloudUpload /> {t('Fayl yuklash')}
          </button>
        </div>

        {manba === 'link' ? (
          <div className="maydon-blok">
            <label htmlFor={`${idPrefix}-url`}>{t('Video havolasi')}</label>
            <input
              id={`${idPrefix}-url`}
              ref={birinchi}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://youtu.be/…"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              disabled={band}
              aria-invalid={tahlil === 'xato'}
            />
            <div className="ql-qollanadi">
              {QOLLANADI.map((n) => (
                <span key={n}>{n}</span>
              ))}
              <span>{t('va boshqalar')}</span>
            </div>
            {tahlil === 'kutilmoqda' && (
              <div className="ql-korinish yuklanmoqda-holat">
                <LoaderCircle className="ql-aylanma" /> {t('Havola tekshirilmoqda…')}
              </div>
            )}
            {tahlil === 'xato' && <div className="xato-qator ql-havola-xato">{t("Havola noto'g'ri — video manzilini to'liq qo'ying")}</div>}
            {tahlil === 'yoq' && k && (
              <div className="ql-korinish">
                <div className="ql-korinish-rasm" style={k.thumbnailUrl ? { backgroundImage: `url("${k.thumbnailUrl}")` } : undefined}>
                  {!k.thumbnailUrl && <FileVideo />}
                </div>
                <div className="ql-korinish-matn">
                  <b>{t(PROVAYDER_NOMI[k.provider] ?? k.provider)}</b>
                  {k.title && <span className="ql-korinish-nom">{k.title}</span>}
                  <span className={k.player === 'tashqi' ? 'ql-ogoh' : 'ql-ok'}>
                    {k.player === 'tashqi' ? (
                      <>
                        <TriangleAlert /> {t("Bu sayt ichki pleyerni qo'llamaydi — video yangi oynada ochiladi")}
                      </>
                    ) : k.player === 'video' ? (
                      t("Video fayl — platformaning o'z pleyerida ochiladi")
                    ) : (
                      t("Platforma ichida o'ynaydi")
                    )}
                    {davomiylik(k.durationSec) && ` · ${davomiylik(k.durationSec)}`}
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="maydon-blok">
            <label>{t('Video fayl')}</label>
            <div
              className={`ql-tashla${sudrash ? ' ustida' : ''}${fayl ? ' tanlangan' : ''}`}
              onDragOver={(e) => {
                e.preventDefault();
                setSudrash(true);
              }}
              onDragLeave={() => setSudrash(false)}
              onDrop={tashla}
            >
              <input
                ref={faylInput}
                type="file"
                accept="video/*,.mkv,.mov,.avi,.wmv,.flv,.m4v,.mts,.m2ts,.ts"
                hidden
                onChange={(e) => {
                  faylTanla(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              {fayl ? (
                <div className="ql-tanlangan-fayl">
                  <FileVideo />
                  <div>
                    <b>{fayl.name}</b>
                    <span>{hajm(fayl.size)}</span>
                  </div>
                  {!band && (
                    <button type="button" className="btn ikkinchi kichik" onClick={() => faylInput.current?.click()}>
                      {t('Almashtirish')}
                    </button>
                  )}
                </div>
              ) : (
                <button type="button" className="ql-tashla-tugma" onClick={() => faylInput.current?.click()} disabled={band}>
                  <span className="ql-tashla-ikon">
                    <CloudUpload />
                  </span>
                  <b>{t('Faylni shu yerga tashlang yoki tanlang')}</b>
                  <span>{t('MP4, MOV, MKV, WEBM, AVI — {hajm} gacha', { hajm: chegara })}</span>
                </button>
              )}
            </div>
            <small className="vr-oyna-eslatma ql-eslatma">
              {video?.source === 'file' && !fayl
                ? t('Joriy fayl: {nom}. Yangi fayl tanlasangiz, u almashtiriladi.', { nom: video.fileName ?? '—' })
                : t("Server videoni telefon, Safari va boshqa barcha brauzerlarda ochiladigan formatga o'zi o'tkazadi.")}
            </small>
          </div>
        )}

        <div className="maydon-blok">
          <label htmlFor={`${idPrefix}-sarlavha`}>{t('Sarlavha')}</label>
          <input
            id={`${idPrefix}-sarlavha`}
            value={title}
            onChange={(e) => {
              sarlavhaQolda.current = true;
              setTitle(e.target.value);
            }}
            placeholder={t("Masalan: Qo'ng'iroqlar bo'limi bilan ishlash")}
            maxLength={200}
            disabled={band}
          />
        </div>
        <div className="vr-oyna-ikki">
          <div className="maydon-blok">
            <label htmlFor={`${idPrefix}-bolim`}>{t("Bo'lim")}</label>
            <input
              id={`${idPrefix}-bolim`}
              list={`${idPrefix}-bolimlar`}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('Masalan: Boshlash')}
              maxLength={60}
              disabled={band}
            />
            <datalist id={`${idPrefix}-bolimlar`}>
              {bolimlar.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </div>
          <div className="ql-nashr">
            <label className="vr-almash">
              <input type="checkbox" role="switch" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} disabled={band} />
              <span className="vr-almash-yol" aria-hidden="true" />
              {isPublished ? t("Hammaga ko'rinadi") : t('Qoralama — faqat siz ko\'rasiz')}
            </label>
          </div>
        </div>
        <div className="maydon-blok">
          <label htmlFor={`${idPrefix}-tavsif`}>{t('Tavsif')}</label>
          <textarea
            id={`${idPrefix}-tavsif`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            maxLength={3000}
            placeholder={t('Bu darsda nimani o\'rganadi — qisqacha')}
            disabled={band}
          />
        </div>

        {progress && (
          <div className="ql-progress" role="progressbar" aria-valuenow={foiz} aria-valuemin={0} aria-valuemax={100}>
            <div className="ql-progress-qator">
              <span>{foiz < 100 ? t('Yuklanmoqda… {foiz}%', { foiz }) : t('Server qabul qilmoqda…')}</span>
              <span>
                {hajm(progress.yuklandi)} / {hajm(progress.jami)}
              </span>
            </div>
            <div className="ql-progress-yol">
              <div style={{ width: `${foiz}%` }} />
            </div>
          </div>
        )}
        {xato && <div className="xato-qator">{xato}</div>}

        <div className="vr-oyna-past">
          {progress && bekorRef.current ? (
            <button type="button" className="btn ikkinchi" onClick={() => bekorRef.current?.()}>
              {t('Yuklashni bekor qilish')}
            </button>
          ) : (
            <button type="button" className="btn ikkinchi" onClick={onYop} disabled={band}>
              {t('Bekor qilish')}
            </button>
          )}
          <button type="submit" className="btn" disabled={band || !tayyor}>
            {band ? (progress ? t('Yuklanmoqda…') : t('Saqlanmoqda…')) : t('Saqlash')}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
