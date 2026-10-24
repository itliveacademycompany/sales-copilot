import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  CircleCheck,
  Clock,
  ExternalLink,
  Eye,
  EyeOff,
  Film,
  LoaderCircle,
  MonitorPlay,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useAuth } from '../auth';
import { useT } from '../i18n';
import { Pleyer } from '../components/qollanma/Pleyer';
import { VideoOyna } from '../components/qollanma/VideoOyna';
import {
  API,
  davomiylik,
  eslatmaOl,
  eslatmaYoz,
  PROVAYDER_NOMI,
  type QollanmaRoyxat,
  type QollanmaVideo,
} from '../components/qollanma/qollanma';
import '../components/qollanma/qollanma.css';

/**
 * QO'LLANMA — platformadan foydalanish bo'yicha video darslar.
 *
 * Kurs ko'rinishi: chapda katta pleyer va dars haqida, o'ngda darslar
 * ro'yxati (raqamlangan, ko'rilganlari belgilangan, umumiy progress).
 * Tanlangan dars manzilda (`?v=<id>`) — havolani hamkasbga yuborsa, u
 * aynan o'sha darsni ochadi.
 *
 * "Ko'rildi" va to'xtagan joy shu brauzerda (foydalanuvchiga alohida)
 * saqlanadi — bu shaxsiy qulaylik, server statistikasi emas.
 *
 * Super admin uchun shu sahifaning o'zi boshqaruv paneli: qo'shish,
 * tahrirlash, tartiblash, yashirish, o'chirish.
 */
export function Qollanma() {
  const t = useT();
  const { user } = useAuth();
  const [royxat, setRoyxat] = useState<QollanmaRoyxat | null>(null);
  const [yuklashXato, setYuklashXato] = useState<string | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [bolim, setBolim] = useState<string | null>(null);
  const [params, setParams] = useSearchParams();
  const [oyna, setOyna] = useState<{ video: QollanmaVideo | null } | null>(null);
  const [tasdiq, setTasdiq] = useState<string | null>(null);
  const [amalXato, setAmalXato] = useState<string | null>(null);
  const sahna = useRef<HTMLElement>(null);

  const userId = user?.id ?? 'mehmon';
  const [eslatma, setEslatma] = useState(() => eslatmaOl(userId));
  useEffect(() => setEslatma(eslatmaOl(userId)), [userId]);


  const yukla = useCallback(() => {
    return api
      .get<QollanmaRoyxat>(API)
      .then((r) => {
        setRoyxat(r);
        setYuklashXato(null);
      })
      .catch((err) => setYuklashXato(err instanceof ApiError ? err.message : t('Yuklanmadi')));
  }, [t]);

  useEffect(() => {
    void yukla();
  }, [yukla]);

  const videolar = royxat?.videos ?? [];
  const boshqaradi = royxat?.canManage ?? false;

  // Server videoni tayyorlayotgan bo'lsa — holatni har 4 soniyada yangilaymiz.
  const tayyorlanmoqda = videolar.some((v) => v.status === 'processing');
  useEffect(() => {
    if (!tayyorlanmoqda) return;
    const id = setInterval(() => void yukla(), 4000);
    return () => clearInterval(id);
  }, [tayyorlanmoqda, yukla]);

  const bolimlar = useMemo(() => [...new Set(videolar.map((v) => v.category).filter((c): c is string => Boolean(c)))], [videolar]);

  const korinadi = useMemo(() => {
    const q = qidiruv.trim().toLocaleLowerCase();
    return videolar.filter(
      (v) =>
        (!bolim || v.category === bolim) &&
        (!q || [v.title, v.description, v.category].some((m) => m?.toLocaleLowerCase().includes(q))),
    );
  }, [videolar, bolim, qidiruv]);
  const filtrBor = Boolean(bolim || qidiruv.trim());

  const korilgan = useMemo(() => new Set(eslatma.korilgan), [eslatma]);

  const tanlanganId = params.get('v');
  const tanlangan = useMemo(() => {
    const aniq = videolar.find((v) => v.id === tanlanganId);
    if (aniq) return aniq;
    // Birinchi ko'rilmagan dars — odam qayerda to'xtagan bo'lsa, o'sha yerdan.
    return korinadi.find((v) => v.status === 'ready' && !korilgan.has(v.id)) ?? korinadi[0] ?? videolar[0] ?? null;
  }, [videolar, korinadi, tanlanganId, korilgan]);

  const tartibRaqam = tanlangan ? videolar.indexOf(tanlangan) + 1 : 0;
  const keyingi = useMemo(() => {
    if (!tanlangan) return null;
    const i = korinadi.indexOf(tanlangan);
    return korinadi.slice(i + 1).find((v) => v.status === 'ready') ?? null;
  }, [korinadi, tanlangan]);

  const ommaviy = videolar.filter((v) => v.isPublished && v.status === 'ready');
  const korilganSoni = ommaviy.filter((v) => korilgan.has(v.id)).length;
  const foiz = ommaviy.length ? Math.round((korilganSoni / ommaviy.length) * 100) : 0;

  function tanla(v: QollanmaVideo) {
    setTasdiq(null);
    setParams((p) => {
      const n = new URLSearchParams(p);
      n.set('v', v.id);
      return n;
    }, { replace: true });
    // Tor ekranda pleyer ro'yxat tepasida — tanlangan dars ko'rinsin.
    const top = sahna.current?.getBoundingClientRect().top ?? 0;
    if (top < 0) sahna.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  const korildiDeb = useCallback(
    (id: string, ha = true) => {
      setEslatma((e) => {
        if (e.korilgan.includes(id) === ha) return e;
        const n = { ...e, korilgan: ha ? [...e.korilgan, id] : e.korilgan.filter((x) => x !== id) };
        eslatmaYoz(userId, n);
        return n;
      });
    },
    [userId],
  );

  /** To'xtagan joy. Funksional yangilash — `korildiDeb` bilan bir paytda chaqirilsa ham biri ikkinchisini bosib ketmaydi. */
  const joyniYoz = useCallback(
    (id: string, sekund: number) => {
      setEslatma((e) => {
        const joy = { ...e.joy };
        if (sekund > 0) joy[id] = Math.floor(sekund);
        else delete joy[id];
        const n = { ...e, joy };
        eslatmaYoz(userId, n);
        return n;
      });
    },
    [userId],
  );

  // ─── Boshqaruv (super admin) ───

  async function amal(fn: () => Promise<unknown>) {
    setAmalXato(null);
    try {
      await fn();
    } catch (err) {
      setAmalXato(err instanceof ApiError ? err.message : t('Saqlanmadi'));
      void yukla();
    }
  }

  function kochir(v: QollanmaVideo, yon: -1 | 1) {
    const i = videolar.indexOf(v);
    const j = i + yon;
    if (i < 0 || j < 0 || j >= videolar.length) return;
    const yangi = [...videolar];
    [yangi[i], yangi[j]] = [yangi[j]!, yangi[i]!];
    setRoyxat((r) => (r ? { ...r, videos: yangi } : r));
    void amal(() => api.post(`${API}/tartib`, { ids: yangi.map((x) => x.id) }));
  }

  function nashrAlmash(v: QollanmaVideo) {
    void amal(async () => {
      const yangi = await api.patch<QollanmaVideo>(`${API}/${v.id}`, { isPublished: !v.isPublished });
      setRoyxat((r) => (r ? { ...r, videos: r.videos.map((x) => (x.id === v.id ? yangi : x)) } : r));
    });
  }

  function ochir(v: QollanmaVideo) {
    setTasdiq(null);
    void amal(async () => {
      await api.del(`${API}/${v.id}`);
      setRoyxat((r) => (r ? { ...r, videos: r.videos.filter((x) => x.id !== v.id) } : r));
      if (tanlanganId === v.id) {
        setParams((p) => {
          const n = new URLSearchParams(p);
          n.delete('v');
          return n;
        }, { replace: true });
      }
    });
  }

  function saqlandi(v: QollanmaVideo) {
    setOyna(null);
    void yukla().then(() => tanla(v));
  }

  // ─── Ko'rinish ───

  const provayder = (v: QollanmaVideo) => t(PROVAYDER_NOMI[v.provider] ?? v.provider);

  const bosh = (
    <div className="sahifa-bosh">
      <div>
        <h1>{t("Qo'llanma")}</h1>
        <div className="izoh">{t('Platformadan foydalanish bo\'yicha video darslar — qadamma-qadam')}</div>
      </div>
      {boshqaradi && (
        <button type="button" className="btn" onClick={() => setOyna({ video: null })}>
          <Plus /> {t("Video qo'shish")}
        </button>
      )}
    </div>
  );

  const oynaEl = oyna && royxat && (
    <VideoOyna video={oyna.video} bolimlar={bolimlar} maxMb={royxat.maxUploadMb} onYop={() => setOyna(null)} onSaqlandi={saqlandi} />
  );

  if (!royxat) {
    return (
      <>
        {bosh}
        {yuklashXato ? (
          <div className="card hech-narsa">
            <div className="katta-ikon">
              <TriangleAlert />
            </div>
            {yuklashXato}
            <div style={{ marginTop: 14 }}>
              <button type="button" className="btn ikkinchi" onClick={() => void yukla()}>
                {t('Qayta urinish')}
              </button>
            </div>
          </div>
        ) : (
          <div className="ql-tartib" aria-busy="true">
            <div className="card ql-sahna">
              <div className="ql-ekran ql-skelet" />
              <div className="ql-malumot">
                <div className="ql-skelet-qator" style={{ width: '30%' }} />
                <div className="ql-skelet-qator katta" style={{ width: '70%' }} />
                <div className="ql-skelet-qator" style={{ width: '90%' }} />
              </div>
            </div>
            <div className="card ql-royxat">
              {[0, 1, 2].map((i) => (
                <div key={i} className="ql-skelet-dars">
                  <div className="ql-skelet" />
                  <div>
                    <div className="ql-skelet-qator" style={{ width: '85%' }} />
                    <div className="ql-skelet-qator" style={{ width: '50%' }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </>
    );
  }

  if (videolar.length === 0) {
    return (
      <>
        {bosh}
        <div className="card hech-narsa ql-bosh-holat">
          <div className="katta-ikon">
            <MonitorPlay />
          </div>
          <b>{t("Hali qo'llanma videolari yo'q")}</b>
          <span>
            {boshqaradi
              ? t("YouTube, Vimeo, Google Drive havolasini qo'ying yoki videoni kompyuterdan yuklang.")
              : t("Tez orada bu yerda platformadan foydalanish bo'yicha video darslar paydo bo'ladi.")}
          </span>
          {boshqaradi && (
            <button type="button" className="btn" onClick={() => setOyna({ video: null })}>
              <Plus /> {t("Birinchi videoni qo'shish")}
            </button>
          )}
        </div>
        {oynaEl}
      </>
    );
  }

  return (
    <>
      {bosh}

      <div className="ql-asboblar">
        <label className="ql-qidiruv">
          <Search aria-hidden="true" />
          <input type="search" value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('Darslardan qidirish…')} aria-label={t('Darslardan qidirish…')} />
        </label>
        {bolimlar.length > 0 && (
          <div className="tab-qator ql-bolimlar" role="tablist" aria-label={t("Bo'limlar")}>
            <button type="button" role="tab" aria-selected={!bolim} className={`tab${!bolim ? ' active' : ''}`} onClick={() => setBolim(null)}>
              {t('Hammasi')}
            </button>
            {bolimlar.map((b) => (
              <button key={b} type="button" role="tab" aria-selected={bolim === b} className={`tab${bolim === b ? ' active' : ''}`} onClick={() => setBolim(b)}>
                {b}
              </button>
            ))}
          </div>
        )}
      </div>

      {amalXato && (
        <div className="xato-qator ql-amal-xato">
          {amalXato}
          <button type="button" onClick={() => setAmalXato(null)} aria-label={t('Yopish')}>
            <X />
          </button>
        </div>
      )}

      <div className="ql-tartib">
        {tanlangan && (
          <section className="card ql-sahna" ref={sahna} aria-label={t('Tanlangan dars')}>
            <Pleyer
              video={tanlangan}
              joy={eslatma.joy[tanlangan.id] ?? 0}
              onJoy={(s) => joyniYoz(tanlangan.id, s)}
              onKorildi={() => korildiDeb(tanlangan.id)}
              keyingi={keyingi}
              onKeyingi={() => keyingi && tanla(keyingi)}
            />
            <div className="ql-malumot">
              <div className="ql-meta">
                <span className="ql-raqam">{t('{n}-dars', { n: tartibRaqam })}</span>
                {tanlangan.category && <span className="badge navy">{tanlangan.category}</span>}
                {davomiylik(tanlangan.durationSec) && (
                  <span className="ql-meta-qism">
                    <Clock /> {davomiylik(tanlangan.durationSec)}
                  </span>
                )}
                <span className="ql-meta-qism">{provayder(tanlangan)}</span>
                {!tanlangan.isPublished && <span className="badge sariq">{t('Qoralama')}</span>}
              </div>
              <h2>{tanlangan.title}</h2>
              {tanlangan.description && <p className="ql-tavsif">{tanlangan.description}</p>}
              <div className="ql-amallar">
                {tanlangan.status === 'ready' && (
                  <button
                    type="button"
                    className={`btn ikkinchi kichik ql-korildi${korilgan.has(tanlangan.id) ? ' faol' : ''}`}
                    aria-pressed={korilgan.has(tanlangan.id)}
                    onClick={() => korildiDeb(tanlangan.id, !korilgan.has(tanlangan.id))}
                  >
                    <CircleCheck /> {korilgan.has(tanlangan.id) ? t("Ko'rildi") : t("Ko'rildi deb belgilash")}
                  </button>
                )}
                {tanlangan.source === 'link' && tanlangan.player === 'iframe' && tanlangan.url && (
                  <a className="btn ikkinchi kichik" href={tanlangan.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink /> {t('Manbada ochish')}
                  </a>
                )}
                {boshqaradi && (
                  <button type="button" className="btn ikkinchi kichik" onClick={() => setOyna({ video: tanlangan })}>
                    <Pencil /> {t('Tahrirlash')}
                  </button>
                )}
                {keyingi && (
                  <button type="button" className="btn kichik ql-keyingi" onClick={() => tanla(keyingi)}>
                    {t('Keyingi dars')} <ChevronRight />
                  </button>
                )}
              </div>
            </div>
          </section>
        )}

        <aside className="card ql-royxat" aria-label={t('Darslar')}>
          <div className="ql-royxat-bosh">
            <div>
              <b>{t('Darslar')}</b>
              <span>{t('{n} ta video', { n: videolar.length })}</span>
            </div>
            {ommaviy.length > 0 && (
              <span className="ql-foiz" title={t("Ko'rilgan darslar")}>
                {korilganSoni}/{ommaviy.length}
              </span>
            )}
          </div>
          {ommaviy.length > 0 && (
            <div className="ql-umumiy" role="progressbar" aria-valuenow={foiz} aria-valuemin={0} aria-valuemax={100} aria-label={t("Ko'rilgan darslar")}>
              <div style={{ width: `${foiz}%` }} />
            </div>
          )}

          {korinadi.length === 0 ? (
            <div className="ql-topilmadi">
              <span>{t('Hech narsa topilmadi')}</span>
              <button
                type="button"
                className="btn ikkinchi kichik"
                onClick={() => {
                  setQidiruv('');
                  setBolim(null);
                }}
              >
                {t('Filtrni tozalash')}
              </button>
            </div>
          ) : (
            <ol className="ql-darslar">
              {korinadi.map((v) => {
                const aktiv = v.id === tanlangan?.id;
                const korildi = korilgan.has(v.id);
                const raqam = videolar.indexOf(v) + 1;
                const vaqt = davomiylik(v.durationSec);
                const tartibI = videolar.indexOf(v);
                return (
                  <li key={v.id} className={`ql-dars${aktiv ? ' aktiv' : ''}${korildi ? ' korildi' : ''}${!v.isPublished ? ' qoralama' : ''}`}>
                    <button type="button" className="ql-dars-tugma" onClick={() => tanla(v)} aria-current={aktiv ? 'true' : undefined}>
                      <span className="ql-dars-rasm" style={v.thumbnailUrl ? { backgroundImage: `url("${v.thumbnailUrl}")` } : undefined}>
                        {!v.thumbnailUrl && <Film className="ql-dars-bosh-ikon" />}
                        <span className="ql-dars-play" aria-hidden="true">
                          {aktiv ? <span className="ql-ekvalayzer"><i /><i /><i /></span> : <Play />}
                        </span>
                        {vaqt && <span className="ql-dars-vaqt">{vaqt}</span>}
                        {korildi && (
                          <span className="ql-dars-belgi" title={t("Ko'rildi")}>
                            <Check />
                          </span>
                        )}
                      </span>
                      <span className="ql-dars-matn">
                        <span className="ql-dars-nom">
                          <span className="ql-dars-raqam">{raqam}.</span> {v.title}
                        </span>
                        <span className="ql-dars-izoh">
                          {[v.category, provayder(v)].filter(Boolean).join(' · ')}
                        </span>
                        {(v.status !== 'ready' || !v.isPublished) && (
                          <span className="ql-dars-holat">
                            {v.status === 'processing' && (
                              <span className="badge toq">
                                <LoaderCircle className="ql-aylanma" /> {t('Tayyorlanmoqda')}
                              </span>
                            )}
                            {v.status === 'waiting' && <span className="badge sariq">{t('Fayl yuklanmagan')}</span>}
                            {v.status === 'failed' && <span className="badge qizil">{t('Xato')}</span>}
                            {!v.isPublished && <span className="badge kul">{t('Qoralama')}</span>}
                          </span>
                        )}
                      </span>
                    </button>

                    {boshqaradi && (
                      <div className="ql-dars-boshqaruv">
                        {tasdiq === v.id ? (
                          <>
                            <span className="ql-tasdiq-matn">{t("O'chirilsinmi?")}</span>
                            <button type="button" className="btn xavfli kichik" onClick={() => ochir(v)}>
                              {t("O'chirish")}
                            </button>
                            <button type="button" className="btn ikkinchi kichik" onClick={() => setTasdiq(null)}>
                              {t('Bekor')}
                            </button>
                          </>
                        ) : (
                          <>
                            {!filtrBor && (
                              <>
                                <button type="button" className="vr-amal" onClick={() => kochir(v, -1)} disabled={tartibI === 0} aria-label={t('Yuqoriga')} title={t('Yuqoriga')}>
                                  <ArrowUp />
                                </button>
                                <button type="button" className="vr-amal" onClick={() => kochir(v, 1)} disabled={tartibI === videolar.length - 1} aria-label={t('Pastga')} title={t('Pastga')}>
                                  <ArrowDown />
                                </button>
                              </>
                            )}
                            <button type="button" className="vr-amal" onClick={() => setOyna({ video: v })} aria-label={t('Tahrirlash')} title={t('Tahrirlash')}>
                              <Pencil />
                            </button>
                            <button
                              type="button"
                              className="vr-amal"
                              onClick={() => nashrAlmash(v)}
                              aria-label={v.isPublished ? t('Yashirish') : t('Hammaga ko\'rsatish')}
                              title={v.isPublished ? t('Yashirish') : t('Hammaga ko\'rsatish')}
                            >
                              {v.isPublished ? <Eye /> : <EyeOff />}
                            </button>
                            <button type="button" className="vr-amal ql-ochir" onClick={() => setTasdiq(v.id)} aria-label={t("O'chirish")} title={t("O'chirish")}>
                              <Trash2 />
                            </button>
                          </>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </aside>
      </div>

      {oynaEl}
    </>
  );
}
