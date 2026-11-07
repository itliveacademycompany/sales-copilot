import { ArrowRight, Check, ChevronLeft, ChevronRight, FileText, Hand, Inbox, Link2, PhoneCall, Plus, Search, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, ballKlass, fmtSoniya } from '../../api';
import { useCrm } from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';
import { sanaVaqt } from './Bitimlar';
import { TARMOQ_BELGISI, type Kanal } from './IjtimoiyTarmoqlar';
import { avatarManzili, AvatarRasmi, boshHarflar } from './MurojaatAvatar';
import './saralanmagan.css';

const TARMOQ_NOMI: Record<Kanal, string> = { facebook: 'Facebook', instagram: 'Instagram', telegram: 'Telegram' };
const tarmoqmi = (s: string): s is Kanal => s in TARMOQ_NOMI;

function ManbaBelgisi({ source }: { source: Murojaat['source'] }) {
  if (tarmoqmi(source)) {
    const B = TARMOQ_BELGISI[source];
    return <B />;
  }
  return source === 'call' ? <PhoneCall aria-hidden="true" /> : source === 'form' ? <FileText aria-hidden="true" /> : <Hand aria-hidden="true" />;
}

export interface Murojaat {
  id: string;
  source: 'call' | 'form' | 'manual' | Kanal;
  status: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  payload: {
    score?: number | null;
    durationSeconds?: number | null;
    seatName?: string | null;
    direction?: string;
    values?: Record<string, string>;
    /** Ijtimoiy tarmoq: `lead_ad` — reklama formasi, `message` — xabar. */
    type?: 'lead_ad' | 'message';
    username?: string | null;
  };
  contactId: string | null;
  contactName: string | null;
  formName: string | null;
  conversationId: string | null;
  dealId: string | null;
  dealName: string | null;
  decidedAt: string | null;
  createdAt: string;
  openDeals: number;
  /** Tarmoq murojaatlarida — ulangan hisob nomi (sahifa, @instagram, @bot). */
  accountName?: string | null;
}

type Holat = 'pending' | 'accepted' | 'rejected';
type Manba = Murojaat['source'];

const HAJM = 30;
const HOLATLAR: [Holat, string][] = [
  ['pending', 'Kutilmoqda'],
  ['accepted', 'Qabul qilingan'],
  ['rejected', 'Rad etilgan'],
];
/** Filtr tugmalari tartibi. */
const MANBALAR: [Manba, string][] = [
  ['call', "Qo'ng'iroq"],
  ['telegram', 'Telegram'],
  ['instagram', 'Instagram'],
  ['facebook', 'Facebook'],
  ['form', 'Veb-forma'],
  ['manual', "Qo'lda"],
];
const MANBA_NOMI = Object.fromEntries(MANBALAR) as Record<Manba, string>;

/** Bugun — "14:05", kecha — "Kecha, 14:05", qolganlari — "03.11.2026". */
function qisqaVaqt(iso: string, t: (s: string) => string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  const soat = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const bugun = new Date();
  const kecha = new Date(bugun.getFullYear(), bugun.getMonth(), bugun.getDate() - 1);
  if (d.toDateString() === bugun.toDateString()) return soat;
  if (d.toDateString() === kecha.toDateString()) return `${t('Kecha')}, ${soat}`;
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`;
}

/** Xabarlar qo'shilib boradigan murojaatda (Telegram, Direct) — oxirgi xabar; qolganida — birinchi qator. */
function korinishMatni(m: Murojaat): string | null {
  const q = (m.message ?? '').split('\n').filter((x) => x.trim());
  if (!q.length) return null;
  return tarmoqmi(m.source) && m.payload.type === 'message' ? q[q.length - 1]! : q[0]!;
}

/**
 * "Saralanmagan" murojaatlar (LEAD-04) — amoCRM "Неразобранное" ro'yxati
 * namunasida: holat tablari, manba filtrlari (soni bilan), qidiruv va ixcham
 * qatorlar. Qator bosilsa — murojaat oynasi (chat, maydonlar, qabul).
 */
export function Saralanmagan() {
  const { base, yangila } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [holat, setHolat] = useState<Holat>('pending');
  const [manba, setManba] = useState<Manba | null>(null);
  const [qidiruv, setQidiruv] = useState('');
  const [sorov, setSorov] = useState('');
  const [sahifa, setSahifa] = useState(0);
  const [data, setData] = useState<{ total: number; counts: Record<string, number>; sources: Record<string, number>; items: Murojaat[] } | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [xato, setXato] = useState<string | null>(null);
  const [qabul, setQabul] = useState<Murojaat | null>(null);
  const [qolda, setQolda] = useState(false);
  const [band, setBand] = useState<string | null>(null);
  const [ichki, setIchki] = useState(0);

  // Qidiruv — yozib bo'lgach (300 ms)
  useEffect(() => {
    const taymer = window.setTimeout(() => {
      setSorov(qidiruv.trim());
      setSahifa(0);
    }, 300);
    return () => window.clearTimeout(taymer);
  }, [qidiruv]);

  const yukla = useCallback(async () => {
    setYuklanmoqda(true);
    try {
      const p = new URLSearchParams({ status: holat, limit: String(HAJM), offset: String(sahifa * HAJM) });
      if (manba) p.set('source', manba);
      if (sorov) p.set('q', sorov);
      setData(await api.get(`${base}/crm-app/inbox?${p.toString()}`));
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    } finally {
      setYuklanmoqda(false);
    }
  }, [base, holat, manba, sorov, sahifa, t]);
  useEffect(() => {
    void yukla();
  }, [yukla, ichki]);

  const rad = async (m: Murojaat) => {
    setBand(m.id);
    try {
      await api.post(`${base}/crm-app/inbox/${m.id}/reject`, {});
      setIchki((x) => x + 1);
      void yangila();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    } finally {
      setBand(null);
    }
  };

  const filtrlangan = Boolean(manba || sorov);
  const tozala = () => {
    setManba(null);
    setQidiruv('');
    setSorov('');
    setSahifa(0);
  };
  const jamiManba = Object.values(data?.sources ?? {}).reduce((a, b) => a + b, 0);
  const sahifalar = data ? Math.max(1, Math.ceil(data.total / HAJM)) : 1;
  const boshi = data && data.total ? sahifa * HAJM + 1 : 0;
  const oxiri = data ? Math.min(data.total, (sahifa + 1) * HAJM) : 0;

  return (
    <div className="ci-sahifa srl">
      <header className="srl-bosh">
        <div className="srl-sarlavha">
          <h1>
            {t('Saralanmagan')}
            {data?.counts.pending ? <span className="srl-jami">{data.counts.pending}</span> : null}
          </h1>
          <p>{t("Qo'ng'iroqlar, ijtimoiy tarmoqlar, veb-formalar va qo'lda kiritilgan murojaatlar. Qabul qilinsa — bitim bo'ladi.")}</p>
        </div>
        <button type="button" className="btn" onClick={() => setQolda(true)}>
          <Plus aria-hidden="true" /> {t('Murojaat')}
        </button>
      </header>

      <section className="srl-panel" aria-busy={yuklanmoqda}>
        <div className="srl-asboblar">
          <div className="srl-tablar" role="tablist" aria-label={t('Holat')}>
            {HOLATLAR.map(([h, nom]) => (
              <button
                key={h}
                type="button"
                role="tab"
                aria-selected={holat === h}
                className={holat === h ? 'faol' : undefined}
                onClick={() => {
                  setHolat(h);
                  setSahifa(0);
                }}
              >
                {t(nom)}
                {data?.counts[h] ? <span>{data.counts[h]}</span> : null}
              </button>
            ))}
          </div>
          <label className="srl-qidiruv">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={qidiruv}
              maxLength={100}
              placeholder={t("Ism, telefon yoki xabar bo'yicha qidirish")}
              aria-label={t('Qidirish')}
              onChange={(e) => setQidiruv(e.target.value)}
            />
          </label>
        </div>

        <div className="srl-manbalar" role="group" aria-label={t('Manba')}>
          <button type="button" className={manba === null ? 'faol' : undefined} aria-pressed={manba === null} onClick={() => (setManba(null), setSahifa(0))}>
            {t('Hammasi')} <span>{jamiManba}</span>
          </button>
          {MANBALAR.filter(([s]) => (data?.sources[s] ?? 0) > 0 || manba === s).map(([s, nom]) => (
            <button
              key={s}
              type="button"
              className={`${s}${manba === s ? ' faol' : ''}`}
              aria-pressed={manba === s}
              onClick={() => {
                setManba(manba === s ? null : s);
                setSahifa(0);
              }}
            >
              <ManbaBelgisi source={s} /> {t(nom)} <span>{data?.sources[s] ?? 0}</span>
            </button>
          ))}
        </div>

        {xato && (
          <div className="xato-qator srl-xato" role="alert">
            {xato}
          </div>
        )}

        {!data && !xato && (
          <ul className="srl-royxat" aria-hidden="true">
            {Array.from({ length: 6 }, (_, i) => (
              <li key={i} className="srl-qator skelet">
                <span className="srl-avatar" />
                <span className="srl-skelet-chiziq" />
              </li>
            ))}
          </ul>
        )}

        {data && data.items.length === 0 && (
          <div className="srl-bosh-holat">
            <Inbox aria-hidden="true" />
            <p>
              {filtrlangan
                ? t('Hech narsa topilmadi')
                : holat === 'pending'
                  ? t('Hamma murojaatlar ko‘rib chiqilgan')
                  : t('Bu yerda hali hech narsa yo‘q')}
            </p>
            {filtrlangan && (
              <button type="button" className="btn ikkinchi kichik" onClick={tozala}>
                {t('Filtrni tozalash')}
              </button>
            )}
          </div>
        )}

        {data && data.items.length > 0 && (
          <ul className={`srl-royxat${yuklanmoqda ? ' yangilanmoqda' : ''}`}>
            {data.items.map((m) => {
              const nom = m.contactName ?? m.name ?? m.payload.username ?? m.phone ?? t('Ismsiz');
              const qoshimcha = [m.phone && m.phone !== nom ? m.phone : null, m.payload.username && m.payload.username !== nom ? m.payload.username : null].filter(Boolean).join(' · ');
              const matn = korinishMatni(m);
              const manbaNomi = m.source === 'form' ? (m.formName ?? t('Veb-forma')) : (m.accountName ?? t(MANBA_NOMI[m.source]));
              return (
                <li
                  key={m.id}
                  className="srl-qator"
                  onClick={(e) => {
                    if (!(e.target as HTMLElement).closest('button, a')) navigate(`/crm/saralanmagan/${m.id}`);
                  }}
                >
                  <span className="srl-avatar" aria-hidden="true">
                    <AvatarRasmi src={avatarManzili(base, m)} harflar={boshHarflar(nom)} />
                    <span className={`srl-belgi ${m.source}`}>
                      <ManbaBelgisi source={m.source} />
                    </span>
                  </span>

                  <div className="srl-asos">
                    <div className="srl-kim">
                      <Link to={`/crm/saralanmagan/${m.id}`} className="srl-nom">
                        {nom}
                      </Link>
                      {qoshimcha && <span className="srl-qoshimcha">{qoshimcha}</span>}
                    </div>
                    <div className="srl-tafsil">
                      <span className={`srl-manba ${m.source}`} title={t(MANBA_NOMI[m.source])}>
                        <ManbaBelgisi source={m.source} />
                        {manbaNomi}
                        {m.payload.type === 'lead_ad' && ` · ${t('reklama formasi')}`}
                      </span>
                      {m.source === 'call' && (
                        <>
                          {m.payload.score !== null && m.payload.score !== undefined && (
                            <span className={`ball ${ballKlass(m.payload.score)} srl-ball`}>{Math.round(m.payload.score)}</span>
                          )}
                          <span className="srl-izoh">{[m.payload.seatName, fmtSoniya(m.payload.durationSeconds ?? null)].filter(Boolean).join(' · ')}</span>
                          {m.conversationId && (
                            <Link to={`/suhbatlar/${m.conversationId}`} className="srl-havola">
                              {t('Suhbatni ochish')}
                            </Link>
                          )}
                        </>
                      )}
                      {matn && <span className="srl-matn">{matn}</span>}
                    </div>
                    {m.openDeals > 0 && holat === 'pending' && (
                      <span className="srl-ogoh">
                        <Link2 aria-hidden="true" /> {t('Bu mijozning {n} ta ochiq bitimi bor — unga bog‘lash mumkin', { n: m.openDeals })}
                      </span>
                    )}
                  </div>

                  <div className="srl-ong">
                    <time dateTime={m.createdAt} title={sanaVaqt(m.createdAt)}>
                      {qisqaVaqt(m.createdAt, t)}
                    </time>
                    {holat === 'pending' ? (
                      <div className="srl-amallar">
                        <button type="button" className="srl-qabul" disabled={band === m.id} onClick={() => setQabul(m)}>
                          <Check aria-hidden="true" /> {t('Qabul qilish')}
                        </button>
                        <button
                          type="button"
                          className="srl-rad"
                          disabled={band === m.id}
                          onClick={() => void rad(m)}
                          aria-label={t('Rad etish')}
                          title={t('Rad etish')}
                        >
                          <X aria-hidden="true" />
                        </button>
                      </div>
                    ) : m.dealId ? (
                      <Link to={`/crm/bitimlar/${m.dealId}`} className="srl-bitim">
                        {m.dealName ?? t('Bitim')} <ArrowRight aria-hidden="true" />
                      </Link>
                    ) : (
                      <span className="srl-izoh">{m.decidedAt ? qisqaVaqt(m.decidedAt, t) : t('Rad etilgan')}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {data && data.total > 0 && (
          <footer className="srl-past">
            <span>{t('{a}–{b} / {n}', { a: boshi, b: oxiri, n: data.total })}</span>
            {sahifalar > 1 && (
              <div className="srl-sahifalash">
                <button type="button" disabled={sahifa === 0} onClick={() => setSahifa((s) => s - 1)} aria-label={t('Oldingi')} title={t('Oldingi')}>
                  <ChevronLeft aria-hidden="true" />
                </button>
                <span>
                  {sahifa + 1} / {sahifalar}
                </span>
                <button type="button" disabled={sahifa + 1 >= sahifalar} onClick={() => setSahifa((s) => s + 1)} aria-label={t('Keyingi')} title={t('Keyingi')}>
                  <ChevronRight aria-hidden="true" />
                </button>
              </div>
            )}
          </footer>
        )}
      </section>

      {qabul && (
        <QabulOyna
          m={qabul}
          onYop={() => setQabul(null)}
          onTugadi={() => {
            setQabul(null);
            setIchki((x) => x + 1);
            void yangila();
          }}
        />
      )}
      {qolda && <QoldaOyna onYop={() => setQolda(false)} onTugadi={() => (setQolda(false), setIchki((x) => x + 1), void yangila())} />}
    </div>
  );
}

/** Qabul: yangi bitim yoki mavjudiga bog'lash. Murojaat oynasida ham ishlatiladi (`boshRejim`). */
export function QabulOyna({
  m,
  onYop,
  onTugadi,
  boshRejim,
}: {
  m: Murojaat;
  onYop: () => void;
  onTugadi: () => void;
  boshRejim?: 'yangi' | 'boglash';
}) {
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const asosiy = holat.pipelines.find((p) => p.isMain) ?? holat.pipelines[0]!;
  const [rejim, setRejim] = useState<'yangi' | 'boglash'>(boshRejim ?? (m.openDeals > 0 ? 'boglash' : 'yangi'));
  const [pipelineId, setPipelineId] = useState(asosiy.id);
  const voronka = holat.pipelines.find((p) => p.id === pipelineId)!;
  const [stageId, setStageId] = useState(voronka.stages.find((s) => s.kind === 'open')?.id ?? '');
  const [seat, setSeat] = useState('');
  const [nom, setNom] = useState(m.name ?? m.contactName ?? '');
  const [bitimlar, setBitimlar] = useState<{ id: string; name: string; stageName: string; stageKind: string }[]>([]);
  const [dealId, setDealId] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    setStageId(voronka.stages.find((s) => s.kind === 'open')?.id ?? '');
  }, [voronka]);
  useEffect(() => {
    if (!m.contactId) return;
    void api
      .get<{ deals: { id: string; name: string; stageName: string; stageKind: string }[] }>(`${base}/contacts/${m.contactId}`)
      .then((r) => {
        const ochiq = r.deals.filter((d) => d.stageKind === 'open');
        setBitimlar(ochiq);
        if (ochiq[0]) setDealId(ochiq[0].id);
      })
      .catch(() => undefined);
  }, [base, m.contactId]);

  const qabulQil = async () => {
    setBand(true);
    setXato(null);
    try {
      const body =
        rejim === 'boglash'
          ? { dealId }
          : { pipelineId, stageId, name: nom.trim() || undefined, ...(holat.canManageAll && seat ? { seatId: seat } : {}) };
      const r = await api.post<{ dealId: string }>(`${base}/crm-app/inbox/${m.id}/accept`, body);
      onTugadi();
      navigate(`/crm/bitimlar/${r.dealId}`);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      setBand(false);
    }
  };

  return (
    <Oyna
      sarlavha={t('Murojaatni qabul qilish')}
      onYop={onYop}
      onSubmit={() => void qabulQil()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn" disabled={band || (rejim === 'boglash' && !dealId)}>
            {rejim === 'boglash' ? t('Bog‘lash') : t('Bitim yaratish')}
          </button>
        </>
      }
    >
      {bitimlar.length > 0 && (
        <div className="tab-qator" role="tablist">
          <button type="button" role="tab" aria-selected={rejim === 'yangi'} className={`tab${rejim === 'yangi' ? ' active' : ''}`} onClick={() => setRejim('yangi')}>
            <Plus aria-hidden="true" /> {t('Yangi bitim')}
          </button>
          <button type="button" role="tab" aria-selected={rejim === 'boglash'} className={`tab${rejim === 'boglash' ? ' active' : ''}`} onClick={() => setRejim('boglash')}>
            <Link2 aria-hidden="true" /> {t('Mavjud bitimga')}
          </button>
        </div>
      )}
      {rejim === 'boglash' ? (
        <div className="maydon-blok">
          <label htmlFor="qb-bitim">{t('Bitim')}</label>
          <select id="qb-bitim" className="input" value={dealId} onChange={(e) => setDealId(e.target.value)}>
            {bitimlar.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} — {d.stageName}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <>
          <div className="maydon-blok">
            <label htmlFor="qb-nom">{t('Bitim nomi')}</label>
            <input id="qb-nom" className="input" value={nom} maxLength={250} onChange={(e) => setNom(e.target.value)} />
          </div>
          <div className="vr-oyna-ikki">
            <div className="maydon-blok">
              <label htmlFor="qb-voronka">{t('Voronka')}</label>
              <select id="qb-voronka" className="input" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                {holat.pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="maydon-blok">
              <label htmlFor="qb-bosqich">{t('Bosqich')}</label>
              <select id="qb-bosqich" className="input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
                {voronka.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {holat.canManageAll && (
            <div className="maydon-blok">
              <label htmlFor="qb-masul">{t("Mas'ul")}</label>
              <select id="qb-masul" className="input" value={seat} onChange={(e) => setSeat(e.target.value)}>
                <option value="">{t('Navbat bilan (taqsimot sozlamasi)')}</option>
                {seatlar.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>
            </div>
          )}
        </>
      )}
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}

function QoldaOyna({ onYop, onTugadi }: { onYop: () => void; onTugadi: () => void }) {
  const { base } = useCrm();
  const t = useT();
  const [f, setF] = useState({ name: '', phone: '', email: '', message: '' });
  const [xato, setXato] = useState<string | null>(null);
  const saqla = async () => {
    if (!f.name.trim() && !f.phone.trim()) return setXato(t('Ism yoki telefonni kiriting'));
    try {
      await api.post(`${base}/crm-app/inbox`, { name: f.name.trim() || null, phone: f.phone.trim() || null, email: f.email.trim() || null, message: f.message.trim() || null });
      onTugadi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };
  return (
    <Oyna
      sarlavha={t('Yangi murojaat')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn">
            {t("Qo'shish")}
          </button>
        </>
      }
    >
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="qm-ism">{t('Ism')}</label>
          <input id="qm-ism" className="input" value={f.name} maxLength={200} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="qm-tel">{t('Telefon')}</label>
          <input id="qm-tel" className="input" type="tel" value={f.phone} maxLength={40} onChange={(e) => setF({ ...f, phone: e.target.value })} />
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="qm-email">{t('Email')}</label>
        <input id="qm-email" className="input" type="email" value={f.email} maxLength={200} onChange={(e) => setF({ ...f, email: e.target.value })} />
      </div>
      <div className="maydon-blok">
        <label htmlFor="qm-xabar">{t('Xabar')}</label>
        <textarea id="qm-xabar" rows={3} maxLength={5000} value={f.message} onChange={(e) => setF({ ...f, message: e.target.value })} />
      </div>
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}
