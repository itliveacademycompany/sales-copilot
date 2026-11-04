import { BriefcaseBusiness, Check, List, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api, ApiError } from '../api';
import { useT } from '../i18n';
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
  }, []);
  const kechikibOch = () => {
    tozala();
    taymer.current = window.setTimeout(och, OCHISH_MS);
  };
  const kechikibYop = () => {
    tozala();
    // Nom yozilayotgan bo'lsa panel sichqoncha chiqib ketganda ham yopilmasin
    if (qoshish) return;
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

  const nomi = t('Bitimlar');

  return (
    <>
      <Link
        ref={bandRef}
        to={asosiy ? `/crm/bitimlar?v=${asosiy.id}` : '/crm/bitimlar'}
        className={`nav-item${bitimlarda ? ' active' : ''}${ochiq ? ' bm-ochiq' : ''}`}
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
            className="bm-panel"
            style={{ left: chap }}
            role="menu"
            aria-label={nomi}
            onMouseEnter={tozala}
            onMouseLeave={kechikibYop}
          >
            <div className="bm-sarlavha">
              <span>{nomi}</span>
              <button type="button" className="bm-yopish" onClick={yop} aria-label={t('Yopish')}>
                <X />
              </button>
            </div>
            <nav className="bm-royxat">
              {voronkalar.map((v) => {
                const faol = bitimlarda && joriy !== 'all' && (joriy ? joriy === v.id : v.isMain);
                return (
                  <Link
                    key={v.id}
                    role="menuitem"
                    to={`/crm/bitimlar?v=${v.id}`}
                    className={`bm-band${faol ? ' faol' : ''}`}
                    aria-current={faol ? 'page' : undefined}
                    onClick={() => {
                      yop();
                      onTanlandi();
                    }}
                  >
                    {v.name}
                  </Link>
                );
              })}

              {qoshaOladi &&
                (qoshish ? (
                  <form className="bm-qoshish-forma" onSubmit={(e) => void yarat(e)}>
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
                    <button type="submit" className="bm-ikon-tugma asosiy" disabled={band || !nom.trim()} aria-label={t('Yaratish')} title={t('Yaratish')}>
                      <Check />
                    </button>
                    <button
                      type="button"
                      className="bm-ikon-tugma"
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
                    {xato && <p className="bm-xato">{xato}</p>}
                    {!xato && <p className="bm-izoh">{t("Standart bosqichlar bilan yaratiladi — keyin sozlamalarda o'zgartirasiz")}</p>}
                  </form>
                ) : (
                  <button type="button" role="menuitem" className="bm-band bm-qosh" onClick={() => setQoshish(true)}>
                    <span>{t("Voronka qo'shish")}</span>
                    <span className="bm-ikon-tugma" aria-hidden="true">
                      <Plus />
                    </span>
                  </button>
                ))}
            </nav>
            <Link
              role="menuitem"
              to="/crm/bitimlar?v=all"
              className={`bm-hammasi${bitimlarda && joriy === 'all' ? ' faol' : ''}`}
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
