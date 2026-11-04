import { BriefcaseBusiness, Check, List, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { joyla, useT } from '../i18n';
import { crmHolatiniQaytaYukla, type MenyuVoronka } from './voronkalar';
import './bitimlar-menyu.css';

/**
 * Chap menyudagi "Bitimlar" bandi — amoCRM'dagi "Сделки" kabi.
 *
 * Sichqoncha olib borilganda (yoki bosilganda / fokusda) menyu yonida panel
 * ochiladi: barcha voronkalar ro'yxati, "Voronka qo'shish" (+) va pastda
 * "Barcha bitimlar". Yangi voronka standart bosqichlar bilan yaratiladi
 * va darhol ochiladi — bosqichlarini keyin CRM sozlamalarida o'zgartirasiz.
 */

const OCHISH_MS = 90;
const YOPISH_MS = 220;

export function BitimlarMenyu({
  voronkalar,
  keng,
  qoshaOladi,
  businessId,
  onTanlandi,
}: {
  voronkalar: MenyuVoronka[];
  keng: boolean;
  qoshaOladi: boolean;
  businessId: string;
  /** Mobil menyuni yopish uchun. */
  onTanlandi: () => void;
}) {
  const t = useT();
  const loc = useLocation();
  const navigate = useNavigate();
  const bandRef = useRef<HTMLAnchorElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const taymer = useRef<number | null>(null);
  const fokusniOtkaz = useRef(false);
  const [ochiq, setOchiq] = useState(false);
  const [chap, setChap] = useState(0);
  const [qoshish, setQoshish] = useState(false);
  const [nom, setNom] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  /** Nomi o'zgartirilayotgan / o'chirish tasdig'i so'ralayotgan voronka. */
  const [tahrir, setTahrir] = useState<{ id: string; nom: string } | null>(null);
  const [ochirish, setOchirish] = useState<string | null>(null);
  const [qatorXato, setQatorXato] = useState<{ id: string; matn: string } | null>(null);

  const bitimlarda = loc.pathname === '/crm/bitimlar' || loc.pathname.startsWith('/crm/bitimlar/');
  const joriy = new URLSearchParams(loc.search).get('v');
  const asosiy = voronkalar.find((v) => v.isMain) ?? voronkalar[0];

  const tozala = () => {
    if (taymer.current !== null) window.clearTimeout(taymer.current);
    taymer.current = null;
  };
  const och = useCallback(() => {
    const r = bandRef.current?.closest('.sidebar')?.getBoundingClientRect();
    setChap(r ? r.right : 0);
    setOchiq(true);
  }, []);
  const yop = useCallback(() => {
    tozala();
    setOchiq(false);
    setQoshish(false);
    setNom('');
    setXato(null);
    setTahrir(null);
    setOchirish(null);
    setQatorXato(null);
  }, []);
  const kechikibOch = () => {
    tozala();
    taymer.current = window.setTimeout(och, OCHISH_MS);
  };
  const kechikibYop = () => {
    tozala();
    // Nom yozilayotgan yoki o'chirish so'ralayotgan bo'lsa panel sichqoncha chiqib ketganda ham yopilmasin
    if (qoshish || tahrir || ochirish) return;
    taymer.current = window.setTimeout(yop, YOPISH_MS);
  };

  // Boshqa sahifaga o'tilsa panel yopiladi
  useEffect(() => {
    yop();
  }, [loc.pathname, loc.search, yop]);

  // Esc va tashqariga bosish
  useEffect(() => {
    if (!ochiq) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        yop();
        fokusniOtkaz.current = true;
        bandRef.current?.focus();
      }
    };
    const tashqi = (e: MouseEvent) => {
      const n = e.target as Node;
      if (!panelRef.current?.contains(n) && !bandRef.current?.contains(n)) yop();
    };
    document.addEventListener('keydown', esc);
    document.addEventListener('mousedown', tashqi);
    return () => {
      document.removeEventListener('keydown', esc);
      document.removeEventListener('mousedown', tashqi);
    };
  }, [ochiq, yop]);

  useEffect(() => () => tozala(), []);

  const yarat = async (e: FormEvent) => {
    e.preventDefault();
    const n = nom.trim();
    if (!n) return setXato(t('Voronka nomini kiriting'));
    setBand(true);
    setXato(null);
    try {
      const r = await api.post<{ id: string }>(`/api/v1/businesses/${businessId}/pipelines`, { name: n });
      await crmHolatiniQaytaYukla();
      yop();
      onTanlandi();
      navigate(`/crm/bitimlar?v=${r.id}`);
    } catch (err) {
      setXato(err instanceof ApiError ? t(err.message) : t('Voronkani yaratib bo‘lmadi'));
    } finally {
      setBand(false);
    }
  };

  const qatorniBekor = () => {
    setTahrir(null);
    setOchirish(null);
    setQatorXato(null);
  };

  const nomniSaqla = async (e: FormEvent) => {
    e.preventDefault();
    if (!tahrir) return;
    const n = tahrir.nom.trim();
    if (!n) return setQatorXato({ id: tahrir.id, matn: t('Voronka nomini kiriting') });
    if (n === voronkalar.find((v) => v.id === tahrir.id)?.name) return qatorniBekor();
    setBand(true);
    setQatorXato(null);
    try {
      await api.patch(`/api/v1/businesses/${businessId}/pipelines/${tahrir.id}`, { name: n });
      await crmHolatiniQaytaYukla();
      setTahrir(null);
    } catch (err) {
      setQatorXato({ id: tahrir.id, matn: err instanceof ApiError ? t(err.message) : t("Nomini o'zgartirib bo'lmadi") });
    } finally {
      setBand(false);
    }
  };

  const ochir = async (id: string) => {
    setBand(true);
    setQatorXato(null);
    try {
      // Voronka arxivlanadi — bitimlari va tarixi bazada qoladi
      await api.patch(`/api/v1/businesses/${businessId}/pipelines/${id}`, { archived: true });
      await crmHolatiniQaytaYukla();
      setOchirish(null);
      // Shu voronka ochiq turgan bo'lsa — asosiy voronkaga o'tamiz
      if (bitimlarda && joriy === id) navigate('/crm/bitimlar', { replace: true });
    } catch (err) {
      setQatorXato({ id, matn: err instanceof ApiError ? t(err.message) : t("O'chirib bo'lmadi") });
    } finally {
      setBand(false);
    }
  };

  const nomi = t('Bitimlar');

  return (
    <>
      <Link
        ref={bandRef}
        to={asosiy ? `/crm/bitimlar?v=${asosiy.id}` : '/crm/bitimlar'}
        className={`nav-item${bitimlarda ? ' active' : ''}${ochiq ? ' bvm-ochiq' : ''}`}
        aria-current={bitimlarda ? 'page' : undefined}
        aria-haspopup="true"
        aria-expanded={ochiq}
        title={keng ? undefined : nomi}
        onMouseEnter={kechikibOch}
        onMouseLeave={kechikibYop}
        onFocus={(e) => {
          // Faqat klaviatura bilan kelinganda (Tab) — sichqoncha bosishda emas
          if (fokusniOtkaz.current) {
            fokusniOtkaz.current = false;
            return;
          }
          if (e.currentTarget.matches(':focus-visible')) och();
        }}
        onClick={(e) => {
          // Sensorli ekranda birinchi bosish panelni ochadi (hover yo'q)
          if (!ochiq && window.matchMedia('(hover: none)').matches) {
            e.preventDefault();
            och();
            return;
          }
          onTanlandi();
        }}
      >
        <span className="ikon">
          <BriefcaseBusiness />
        </span>
        <span className="nom">{nomi}</span>
      </Link>

      {ochiq &&
        createPortal(
          <div
            ref={panelRef}
            className="bvm-panel"
            style={{ left: chap }}
            role="menu"
            aria-label={nomi}
            onMouseEnter={tozala}
            onMouseLeave={kechikibYop}
          >
            <div className="bvm-sarlavha">
              <span>{nomi}</span>
              <button type="button" className="bvm-yopish" onClick={yop} aria-label={t('Yopish')}>
                <X />
              </button>
            </div>
            <nav className="bvm-royxat">
              {voronkalar.map((v) => {
                const faol = bitimlarda && joriy !== 'all' && (joriy ? joriy === v.id : v.isMain);
                const xatoMatn = qatorXato?.id === v.id ? qatorXato.matn : null;

                // Nomini o'zgartirish — qator o'rnida maydon
                if (tahrir?.id === v.id) {
                  return (
                    <form key={v.id} className="bvm-qoshish-forma bvm-qator-forma" onSubmit={(e) => void nomniSaqla(e)}>
                      <input
                        className="input"
                        autoFocus
                        value={tahrir.nom}
                        maxLength={100}
                        onChange={(e) => setTahrir({ id: v.id, nom: e.target.value })}
                        onFocus={(e) => e.currentTarget.select()}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            qatorniBekor();
                          }
                        }}
                        aria-label={t('Voronka nomi')}
                        disabled={band}
                      />
                      <button type="submit" className="bvm-ikon-tugma asosiy" disabled={band || !tahrir.nom.trim()} aria-label={t('Saqlash')} title={t('Saqlash')}>
                        <Check />
                      </button>
                      <button type="button" className="bvm-ikon-tugma" onClick={qatorniBekor} aria-label={t('Bekor qilish')} title={t('Bekor qilish')}>
                        <X />
                      </button>
                      {xatoMatn && <p className="bvm-xato">{xatoMatn}</p>}
                    </form>
                  );
                }

                // O'chirishni tasdiqlash — qator o'rnida
                if (ochirish === v.id) {
                  // Yagona voronka o'chirilmaydi (server ham rad etadi) — sababi tushuntiriladi
                  const yagona = voronkalar.length <= 1;
                  // Asosiy voronka o'chirilsa, belgi keyingisiga o'tadi (avval o'z voronkalaringiz)
                  const keyingi = v.isMain ? (voronkalar.find((x) => x.id !== v.id && !x.external) ?? voronkalar.find((x) => x.id !== v.id)) : undefined;
                  return (
                    <div key={v.id} className={`bvm-tasdiq${yagona ? ' yagona' : ''}`} role="alertdialog" aria-label={t("Voronkani o'chirish")}>
                      {yagona ? (
                        <>
                          <p>{joyla(t("«{nom}» — yagona voronka"), { nom: <b>{v.name}</b> })}</p>
                          <small>{t("CRMda kamida bitta voronka bo'lishi kerak. O'chirishdan oldin «Voronka qo'shish» bilan boshqasini yarating.")}</small>
                        </>
                      ) : (
                        <>
                          <p>{joyla(t("«{nom}» voronkasi o'chirilsinmi?"), { nom: <b>{v.name}</b> })}</p>
                          <small>{t("Bitimlar o'chmaydi — voronka bilan birga arxivda saqlanadi.")}</small>
                          {keyingi && (
                            <small className="bvm-ogoh">
                              {joyla(t("Bu asosiy voronka: yangi murojaatlar va qo'ng'iroqlar endi «{nom}» voronkasiga tushadi."), { nom: <b>{keyingi.name}</b> })}
                            </small>
                          )}
                        </>
                      )}
                      {xatoMatn && <p className="bvm-xato">{xatoMatn}</p>}
                      <div className="bvm-tasdiq-tugmalar">
                        <button type="button" className="btn ikkinchi kichik" onClick={qatorniBekor} autoFocus disabled={band}>
                          {yagona ? t('Tushunarli') : t('Bekor qilish')}
                        </button>
                        {yagona ? (
                          <button
                            type="button"
                            className="btn kichik"
                            onClick={() => {
                              qatorniBekor();
                              setQoshish(true);
                            }}
                          >
                            <Plus /> {t("Voronka qo'shish")}
                          </button>
                        ) : (
                          <button type="button" className="btn kichik bvm-xavfli" onClick={() => void ochir(v.id)} disabled={band}>
                            <Trash2 /> {band ? t("O'chirilmoqda…") : t("O'chirish")}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                // Tahrirlash huquqi: sozlash ruxsati bor va voronka tashqi CRM dan sinxronlanmaydi.
                // O'chirish ham shunday — asosiy voronka ham (belgi keyingisiga o'tadi).
                const tahrirlaydi = qoshaOladi && !v.external;
                const ochiradi = tahrirlaydi;
                return (
                  <div key={v.id} className={`bvm-qator${faol ? ' faol' : ''}`}>
                    <Link
                      role="menuitem"
                      to={`/crm/bitimlar?v=${v.id}`}
                      className={`bvm-band${faol ? ' faol' : ''}`}
                      aria-current={faol ? 'page' : undefined}
                      onClick={() => {
                        yop();
                        onTanlandi();
                      }}
                    >
                      <span className="bvm-band-nom">{v.name}</span>
                    </Link>
                    {tahrirlaydi && (
                      <span className="bvm-amallar">
                        <button
                          type="button"
                          className="bvm-amal"
                          onClick={() => {
                            setOchirish(null);
                            setQatorXato(null);
                            setTahrir({ id: v.id, nom: v.name });
                          }}
                          aria-label={t('{nom} — nomini o‘zgartirish', { nom: v.name })}
                          title={t('Nomini o‘zgartirish')}
                        >
                          <Pencil />
                        </button>
                        {ochiradi && (
                          <button
                            type="button"
                            className="bvm-amal xavfli"
                            onClick={() => {
                              setTahrir(null);
                              setQatorXato(null);
                              setOchirish(v.id);
                            }}
                            aria-label={t('{nom} — o‘chirish', { nom: v.name })}
                            title={t("O'chirish")}
                          >
                            <Trash2 />
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                );
              })}

              {qoshaOladi &&
                (qoshish ? (
                  <form className="bvm-qoshish-forma" onSubmit={(e) => void yarat(e)}>
                    <input
                      className="input"
                      autoFocus
                      value={nom}
                      maxLength={100}
                      onChange={(e) => setNom(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.stopPropagation();
                          setQoshish(false);
                          setNom('');
                          setXato(null);
                        }
                      }}
                      placeholder={t('Voronka nomi')}
                      aria-label={t('Voronka nomi')}
                      disabled={band}
                    />
                    <button type="submit" className="bvm-ikon-tugma asosiy" disabled={band || !nom.trim()} aria-label={t('Yaratish')} title={t('Yaratish')}>
                      <Check />
                    </button>
                    <button
                      type="button"
                      className="bvm-ikon-tugma"
                      onClick={() => {
                        setQoshish(false);
                        setNom('');
                        setXato(null);
                      }}
                      aria-label={t('Bekor qilish')}
                      title={t('Bekor qilish')}
                    >
                      <X />
                    </button>
                    {xato && <p className="bvm-xato">{xato}</p>}
                    {!xato && <p className="bvm-izoh">{t("Standart bosqichlar bilan yaratiladi — keyin sozlamalarda o'zgartirasiz")}</p>}
                  </form>
                ) : (
                  <button type="button" role="menuitem" className="bvm-band bvm-qosh" onClick={() => setQoshish(true)}>
                    <span>{t("Voronka qo'shish")}</span>
                    <span className="bvm-ikon-tugma" aria-hidden="true">
                      <Plus />
                    </span>
                  </button>
                ))}
            </nav>
            <Link
              role="menuitem"
              to="/crm/bitimlar?v=all"
              className={`bvm-hammasi${bitimlarda && joriy === 'all' ? ' faol' : ''}`}
              onClick={() => {
                yop();
                onTanlandi();
              }}
            >
              <span>{t('Barcha bitimlar')}</span>
              <List aria-hidden="true" />
            </Link>
          </div>,
          document.body,
        )}
    </>
  );
}
