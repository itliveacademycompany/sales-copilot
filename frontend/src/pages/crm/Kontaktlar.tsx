import { ArrowLeft, Building2, CalendarClock, Merge, PhoneCall, Plus, Search, Sparkles, Trash2, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError, ballKlass, fmtSana, fmtSoniya } from '../../api';
import { VazifaOyna } from '../../crm/komponentlar';
import { MsBosh, MsSahifalash } from '../../crm/MsBosh';
import { muddatHolati, pul, useCrm } from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';
import { sanaVaqt } from './Bitimlar';
import { boshHarflar } from './MurojaatAvatar';
import { qisqaVaqt } from './Saralanmagan';
import './kontaktlar.css';

interface KontaktQator {
  id: string;
  name: string | null;
  phone: string | null;
  phones: string[];
  email: string | null;
  company: string | null;
  companyId: string | null;
  companyName: string | null;
  role: string | null;
  lastSeenAt: string;
  deals: number;
  calls: number;
}

interface KompaniyaQator {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  contacts: number;
  deals: number;
}

const HAJM = 50;

/**
 * Kontaktlar va Kompaniyalar — Metasell'dagidek menyuda alohida bo'limlar.
 * Kontaktlar: Dill Mind qo'ng'iroqlaridagi mijozlar ham, CRM da qo'shilganlar
 * ham — bitta ro'yxat; rahbarda "Dublikatlar" tabi ham bor.
 */
export function Kontaktlar({ bolim }: { bolim: 'kontakt' | 'kompaniya' }) {
  const { holat } = useCrm();
  const t = useT();
  const [params, setParams] = useSearchParams();
  // Eski havola: /crm/kontaktlar?tab=kompaniya → Kompaniyalar bo'limi
  if (bolim === 'kontakt' && params.get('tab') === 'kompaniya') return <Navigate to="/crm/kompaniyalar" replace />;
  if (bolim === 'kompaniya') {
    return (
      <div className="ci-sahifa">
        <KompaniyaRoyxati />
      </div>
    );
  }
  const tab = params.get('tab') === 'dublikat' && holat.canConfigure ? 'dublikat' : 'kontakt';
  return (
    <div className="ci-sahifa">
      {holat.canConfigure && (
        <div className="ci-bosh-tablar">
          <div className="tab-qator" role="tablist">
            <button role="tab" aria-selected={tab === 'kontakt'} className={`tab${tab === 'kontakt' ? ' active' : ''}`} onClick={() => setParams({}, { replace: true })}>
              {t('Kontaktlar')}
            </button>
            <button role="tab" aria-selected={tab === 'dublikat'} className={`tab${tab === 'dublikat' ? ' active' : ''}`} onClick={() => setParams({ tab: 'dublikat' }, { replace: true })}>
              {t('Dublikatlar')}
            </button>
          </div>
        </div>
      )}
      {tab === 'kontakt' ? <KontaktRoyxati /> : <Dublikatlar />}
    </div>
  );
}

type KontaktFiltr = 'hammasi' | 'bitimli' | 'bitimsiz' | 'qongiroqli';
const KONTAKT_FILTRLARI: [KontaktFiltr, string][] = [
  ['hammasi', 'Hammasi'],
  ['bitimli', 'Bitimi bor'],
  ['bitimsiz', 'Bitimsiz'],
  ['qongiroqli', "Qo'ng'iroq qilgan"],
];

/** "998901234567" → "+998 90 123 45 67", "901234567" → "90 123 45 67"; boshqasi o'zgarmaydi. */
function telefonKorinishi(tel: string): string {
  const r = tel.replace(/\D/g, '');
  if (r.length === 12 && r.startsWith('998')) return `+998 ${r.slice(3, 5)} ${r.slice(5, 8)} ${r.slice(8, 10)} ${r.slice(10)}`;
  if (r.length === 9) return `${r.slice(0, 2)} ${r.slice(2, 5)} ${r.slice(5, 7)} ${r.slice(7)}`;
  return tel;
}

/** Avatar foni — ism bo'yicha doim bir xil, yumshoq rang (ro'yxat bir xil ko'rinmasin). */
const AVATAR_RANGLARI = ['ia', 'yuqori', 'info', 'orta', 'data'] as const;
function avatarRangi(kalit: string): (typeof AVATAR_RANGLARI)[number] {
  let h = 0;
  for (const b of kalit) h = (h * 31 + b.charCodeAt(0)) >>> 0;
  return AVATAR_RANGLARI[h % AVATAR_RANGLARI.length]!;
}

/**
 * Kontaktlar ro'yxati — amoCRM "Контакты" namunasida, Dill Mind dizayni:
 * sarlavha (jami, AI yordamchi, yangi kontakt), tezkor filtrlar (soni bilan),
 * qidiruv va ixcham jadval — avatar, aloqa (telefon + email), kompaniya,
 * lidlar, qo'ng'iroqlar, oxirgi faollik. Qator bosilsa — kontakt kartasi.
 */
function KontaktRoyxati() {
  const { base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sorov, setSorov] = useState('');
  const [filtr, setFiltr] = useState<KontaktFiltr>('hammasi');
  const [sahifa, setSahifa] = useState(0);
  const [hajm, setHajm] = useState(HAJM);
  const [data, setData] = useState<{ total: number; counts?: Record<KontaktFiltr, number>; items: KontaktQator[] } | null>(null);
  const [yuklanmoqda, setYuklanmoqda] = useState(true);
  const [xato, setXato] = useState<string | null>(null);
  const [yangi, setYangi] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setSorov(q.trim());
      setSahifa(0);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    let tirik = true;
    const p = new URLSearchParams({ limit: String(hajm), offset: String(sahifa * hajm) });
    if (sorov) p.set('q', sorov);
    if (filtr !== 'hammasi') p.set('filtr', filtr);
    setYuklanmoqda(true);
    api
      .get<{ total: number; counts?: Record<KontaktFiltr, number>; items: KontaktQator[] }>(`${base}/contacts?${p}`)
      .then((r) => tirik && (setData(r), setXato(null)))
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")))
      .finally(() => tirik && setYuklanmoqda(false));
    return () => {
      tirik = false;
    };
  }, [base, sorov, filtr, sahifa, hajm, t]);

  const sahifalar = data ? Math.max(1, Math.ceil(data.total / hajm)) : 1;
  const boshi = data && data.total ? sahifa * hajm + 1 : 0;
  const oxiri = data ? Math.min(data.total, (sahifa + 1) * hajm) : 0;
  const filtrlangan = Boolean(sorov || filtr !== 'hammasi');
  return (
    <div className="kt">
      <header className="kt-bosh">
        <div className="kt-sarlavha">
          <h1>
            {t('Kontaktlar')}
            {data?.counts ? <span className="kt-jami">{pul(data.counts.hammasi)}</span> : null}
          </h1>
          <p>{t("Mijozlar, ularning bitimlari va qo'ng'iroqlari — bitta ro'yxatda.")}</p>
        </div>
        <div className="kt-bosh-amallar">
          <Link to="/crm/ai-chat" className="ms-ai-tugma">
            <Sparkles aria-hidden="true" /> {t('AI yordamchi')}
          </Link>
          <button type="button" className="btn" onClick={() => setYangi(true)}>
            <Plus aria-hidden="true" /> {t('Yangi kontakt')}
          </button>
        </div>
      </header>

      <section className="kt-panel" aria-busy={yuklanmoqda}>
        <div className="kt-asboblar">
          <div className="kt-filtrlar" role="group" aria-label={t('Filtr')}>
            {KONTAKT_FILTRLARI.map(([f, nom]) => (
              <button
                key={f}
                type="button"
                aria-pressed={filtr === f}
                className={filtr === f ? 'faol' : undefined}
                onClick={() => {
                  setFiltr(f);
                  setSahifa(0);
                }}
              >
                {t(nom)}
                {data?.counts && <span>{pul(data.counts[f])}</span>}
              </button>
            ))}
          </div>
          <label className="kt-qidiruv">
            <Search aria-hidden="true" />
            <input
              type="search"
              value={q}
              maxLength={100}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('Ism, kompaniya yoki telefon')}
              aria-label={t('Kontaktlarni qidirish')}
            />
          </label>
        </div>

        {xato && (
          <div className="xato-qator kt-xato" role="alert">
            {xato}
          </div>
        )}

        {!data && !xato && (
          <div className="kt-skelet" aria-hidden="true">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i}>
                <span />
                <i />
              </div>
            ))}
          </div>
        )}

        {data && data.items.length === 0 && (
          <div className="kt-bosh-holat">
            <User aria-hidden="true" />
            <p>{t('Kontaktlar topilmadi')}</p>
            {filtrlangan && (
              <button
                type="button"
                className="btn ikkinchi kichik"
                onClick={() => {
                  setQ('');
                  setSorov('');
                  setFiltr('hammasi');
                  setSahifa(0);
                }}
              >
                {t('Filtrni tozalash')}
              </button>
            )}
          </div>
        )}

        {data && data.items.length > 0 && (
          <div className={`kt-jadval-qobiq${yuklanmoqda ? ' yangilanmoqda' : ''}`}>
            <table className="kt-jadval">
              <thead>
                <tr>
                  <th>{t('Kontakt')}</th>
                  <th>{t('Aloqa')}</th>
                  <th>{t('Kompaniya')}</th>
                  <th className="kt-son">{t('Lidlar')}</th>
                  <th className="kt-son">{t("Qo'ng'iroqlar")}</th>
                  <th className="kt-vaqt">{t('Oxirgi faollik')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => {
                  const ism = c.name?.trim() || null;
                  const sarlavha = ism ?? (c.phone ? telefonKorinishi(c.phone) : t('Ismsiz'));
                  const kompaniya = c.companyName ?? c.company;
                  return (
                    <tr key={c.id} onClick={(e) => !(e.target as HTMLElement).closest('a') && navigate(`/crm/kontaktlar/${c.id}`)}>
                      <td>
                        <div className="kt-kontakt">
                          <span className={`kt-avatar ${avatarRangi(c.id)}`} aria-hidden="true">
                            {ism ? boshHarflar(ism) : <User />}
                          </span>
                          <div className="kt-kontakt-matn">
                            <Link to={`/crm/kontaktlar/${c.id}`} className={`kt-nom${ism ? '' : ' ismsiz'}`}>
                              {sarlavha}
                            </Link>
                            {c.role ? (
                              <span className="kt-lavozim" title={c.role}>
                                {c.role}
                              </span>
                            ) : (
                              !ism && <span className="kt-lavozim sust">{t('Ism kiritilmagan')}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="kt-aloqa">
                          {c.phone ? (
                            <a href={`tel:${c.phone}`} className="kt-tel">
                              {telefonKorinishi(c.phone)}
                              {c.phones.length > 0 && <span className="kt-qoshimcha" title={c.phones.map(telefonKorinishi).join(', ')}>+{c.phones.length}</span>}
                            </a>
                          ) : (
                            <span className="kt-bosh">—</span>
                          )}
                          {c.email && (
                            <a href={`mailto:${c.email}`} className="kt-email">
                              {c.email}
                            </a>
                          )}
                        </div>
                      </td>
                      <td>
                        {kompaniya ? (
                          c.companyId ? (
                            <Link to={`/crm/kompaniyalar/${c.companyId}`} className="kt-kompaniya">
                              <Building2 aria-hidden="true" /> {kompaniya}
                            </Link>
                          ) : (
                            <span className="kt-kompaniya matn">
                              <Building2 aria-hidden="true" /> {kompaniya}
                            </span>
                          )
                        ) : (
                          <span className="kt-bosh">—</span>
                        )}
                      </td>
                      <td className="kt-son">
                        <span className={`kt-hisob${c.deals ? ' bor' : ''}`}>{c.deals}</span>
                      </td>
                      <td className="kt-son">
                        <span className={`kt-hisob qongiroq${c.calls ? ' bor' : ''}`}>{c.calls}</span>
                      </td>
                      <td className="kt-vaqt">
                        <time dateTime={c.lastSeenAt} title={sanaVaqt(c.lastSeenAt)}>
                          {qisqaVaqt(c.lastSeenAt, t)}
                        </time>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {data && data.total > 0 && (
          <footer className="kt-past">
            <span className="kt-oraliq">{t('{a}–{b} / {n}', { a: pul(boshi), b: pul(oxiri), n: pul(data.total) })}</span>
            <MsSahifalash
              sahifa={sahifa}
              sahifalar={sahifalar}
              onSahifa={setSahifa}
              hajm={hajm}
              onHajm={(h) => {
                setHajm(h);
                setSahifa(0);
              }}
            />
          </footer>
        )}
      </section>
      {yangi && <KontaktOyna onYop={() => setYangi(false)} onSaqlandi={(id) => navigate(`/crm/kontaktlar/${id}`)} />}
    </div>
  );
}

interface KontaktMalumot {
  id: string;
  name: string | null;
  phone: string | null;
  phones: string[];
  email: string | null;
  emails: string[];
  company: string | null;
  companyId: string | null;
  role: string | null;
}

/** Ko'p qiymatli maydon: qator qo'shish/olib tashlash. */
function KopQiymat({ qiymat, onChange, turi, nom }: { qiymat: string[]; onChange: (v: string[]) => void; turi: 'tel' | 'email'; nom: string }) {
  const t = useT();
  return (
    <div className="ci-kop-qiymat">
      {qiymat.map((v, i) => (
        <div key={i} className="ci-qator-kiritish">
          <input className="input" type={turi} value={v} maxLength={turi === 'tel' ? 40 : 200} onChange={(e) => onChange(qiymat.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`${nom} ${i + 2}`} />
          <button type="button" className="vr-amal" onClick={() => onChange(qiymat.filter((_, j) => j !== i))} aria-label={t("O'chirish")}>
            <Trash2 />
          </button>
        </div>
      ))}
      {qiymat.length < 10 && (
        <button type="button" className="ci-havola-tugma" onClick={() => onChange([...qiymat, ''])}>
          <Plus aria-hidden="true" /> {turi === 'tel' ? t("Yana telefon qo'shish") : t("Yana email qo'shish")}
        </button>
      )}
    </div>
  );
}

function KontaktOyna({ kontakt, onYop, onSaqlandi }: { kontakt?: KontaktMalumot; onYop: () => void; onSaqlandi: (id: string) => void }) {
  const { base } = useCrm();
  const t = useT();
  const [ism, setIsm] = useState(kontakt?.name ?? '');
  const [tel, setTel] = useState(kontakt?.phone ?? '');
  const [tellar, setTellar] = useState<string[]>(kontakt?.phones ?? []);
  const [email, setEmail] = useState(kontakt?.email ?? '');
  const [emaillar, setEmaillar] = useState<string[]>(kontakt?.emails ?? []);
  const [lavozim, setLavozim] = useState(kontakt?.role ?? '');
  const [kompaniyaId, setKompaniyaId] = useState(kontakt?.companyId ?? '');
  const [kompaniyalar, setKompaniyalar] = useState<{ id: string; name: string }[]>([]);
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  useEffect(() => {
    void api
      .get<{ items: { id: string; name: string }[] }>(`${base}/companies?limit=200`)
      .then((r) => setKompaniyalar(r.items))
      .catch(() => undefined);
  }, [base]);

  const saqla = async () => {
    if (!ism.trim()) {
      setXato(t('Ismni kiriting'));
      return;
    }
    setBand(true);
    setXato(null);
    const body = {
      name: ism.trim(),
      phone: tel.trim() || null,
      phones: tellar.map((x) => x.trim()).filter(Boolean),
      email: email.trim() || null,
      emails: emaillar.map((x) => x.trim()).filter(Boolean),
      role: lavozim.trim() || null,
      companyId: kompaniyaId || null,
    };
    try {
      if (kontakt) {
        await api.patch(`${base}/contacts/${kontakt.id}`, body);
        onSaqlandi(kontakt.id);
      } else {
        const r = await api.post<{ id: string }>(`${base}/contacts`, body);
        onSaqlandi(r.id);
      }
      onYop();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      setBand(false);
    }
  };

  return (
    <Oyna
      sarlavha={kontakt ? t('Kontaktni tahrirlash') : t('Yangi kontakt')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn" disabled={band}>
            {band ? t('Saqlanmoqda…') : t('Saqlash')}
          </button>
        </>
      }
    >
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="ko-ism">{t('Ism')}</label>
          <input id="ko-ism" className="input" value={ism} maxLength={200} onChange={(e) => setIsm(e.target.value)} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="ko-lav">{t('Lavozim')}</label>
          <input id="ko-lav" className="input" value={lavozim} maxLength={120} onChange={(e) => setLavozim(e.target.value)} />
        </div>
      </div>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="ko-tel">{t('Telefon')}</label>
          <input id="ko-tel" className="input" type="tel" value={tel} maxLength={40} onChange={(e) => setTel(e.target.value)} placeholder="+998 90 123 45 67" />
          <KopQiymat qiymat={tellar} onChange={setTellar} turi="tel" nom={t('Telefon')} />
        </div>
        <div className="maydon-blok">
          <label htmlFor="ko-email">{t('Email')}</label>
          <input id="ko-email" className="input" type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
          <KopQiymat qiymat={emaillar} onChange={setEmaillar} turi="email" nom={t('Email')} />
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="ko-komp">{t('Kompaniya')}</label>
        <select id="ko-komp" className="input" value={kompaniyaId} onChange={(e) => setKompaniyaId(e.target.value)}>
          <option value="">{t('— tanlanmagan —')}</option>
          {kompaniyalar.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}

interface KontaktKartochka {
  contact: KontaktMalumot & { firstSeenAt: string; lastSeenAt: string; companyName: string | null };
  deals: { id: string; name: string; amount: number | null; stageName: string; stageKind: string; stageColor: string; pipelineName: string; updatedAt: string }[];
  calls: { id: string; channel: string; startedAt: string; durationSeconds: number | null; score: number | null; summary: string | null; seatName: string | null }[];
  tasks: { id: string; title: string; status: string; dueAt: string | null; taskType: string | null; dealId: string | null; seatName: string | null }[];
}

/** Kontakt kartochkasi: ma'lumot, bitimlari, vazifalari va Dill Mind qo'ng'iroqlari. */
export function KontaktKarta() {
  const { id } = useParams<{ id: string }>();
  const { base } = useCrm();
  const t = useT();
  const [k, setK] = useState<KontaktKartochka | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [tahrir, setTahrir] = useState(false);
  const [vazifa, setVazifa] = useState(false);

  const yukla = useCallback(async () => {
    try {
      setK(await api.get<KontaktKartochka>(`${base}/contacts/${id}`));
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, id, t]);

  useEffect(() => {
    void yukla();
  }, [yukla]);

  return (
    <div className="ci-sahifa">
      <Link to="/crm/kontaktlar" className="ci-orqaga">
        <ArrowLeft /> {t('Kontaktlar')}
      </Link>
      {xato && <div className="card xato-qator">{xato}</div>}
      {!k && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
      {k && (
        <>
          <div className="ci-bk-bosh">
            <div className="ci-kontakt-qator katta">
              <span className="ci-avatar" aria-hidden="true">
                <User />
              </span>
              <span>
                <h1>{k.contact.name ?? t('Ismsiz')}</h1>
                <span className="yordam">
                  {[k.contact.role, k.contact.phone, ...k.contact.phones, k.contact.email, ...k.contact.emails].filter(Boolean).join(' · ') || '—'}
                </span>
                {k.contact.companyId && (
                  <Link to={`/crm/kompaniyalar/${k.contact.companyId}`} className="ci-havola">
                    <Building2 className="ci-label-ikon" aria-hidden="true" /> {k.contact.companyName}
                  </Link>
                )}
              </span>
            </div>
            <div className="ci-bosh-amallar">
              <button className="btn ikkinchi kichik" onClick={() => setVazifa(true)}>
                <Plus /> {t('Vazifa')}
              </button>
              <button className="btn ikkinchi kichik" onClick={() => setTahrir(true)}>
                {t('Tahrirlash')}
              </button>
            </div>
          </div>

          <div className="ci-bk-ish">
            <div className="ci-bk-chap">
              <section className="card ci-blok" aria-labelledby="kk-bitim">
                <h2 id="kk-bitim">{t('Bitimlar')}</h2>
                {k.deals.length === 0 && <p className="yordam">{t("Bu kontaktda bitim yo'q.")}</p>}
                <ul className="ci-royxat">
                  {k.deals.map((d) => (
                    <li key={d.id}>
                      <Link to={`/crm/bitimlar/${d.id}`} className="ci-royxat-band">
                        <span>
                          <b>{d.name}</b>
                          <small>{d.pipelineName}</small>
                        </span>
                        <span className="ci-royxat-ong">
                          <span className="ci-bosqich-belgi" style={{ ['--bosqich' as string]: d.stageColor }}>
                            {d.stageName}
                          </span>
                          {d.amount !== null && <b className="ci-raqam">{pul(d.amount)}</b>}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="card ci-blok" aria-labelledby="kk-vazifa">
                <h2 id="kk-vazifa">{t('Ochiq vazifalar')}</h2>
                {k.tasks.length === 0 && <p className="yordam">{t("Ochiq vazifa yo'q")}</p>}
                <ul className="ci-vazifalar">
                  {k.tasks.map((v) => {
                    const m = muddatHolati(v.dueAt);
                    return (
                      <li key={v.id}>
                        <div className="ci-vazifa-matn">
                          <b>{v.title}</b>
                          <small>
                            {v.dueAt && (
                              <span className={m === 'otgan' ? 'xavf' : m === 'bugun' ? 'ogoh' : ''}>
                                <CalendarClock aria-hidden="true" /> {fmtSana(v.dueAt)}
                              </span>
                            )}
                            {v.seatName && <span>{v.seatName}</span>}
                          </small>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>

            <section className="card ci-blok" aria-labelledby="kk-qongiroq">
              <h2 id="kk-qongiroq">
                <PhoneCall aria-hidden="true" /> {t("Dill Mind qo'ng'iroqlari")}
              </h2>
              {k.calls.length === 0 && <p className="yordam">{t("Bu mijoz bilan qo'ng'iroq hali yo'q.")}</p>}
              <ol className="ci-lenta">
                {k.calls.map((c) => (
                  <li key={c.id} className="ci-lenta-band qongiroq">
                    <span className="ci-lenta-ikon" aria-hidden="true">
                      <PhoneCall />
                    </span>
                    <div className="ci-lenta-matn">
                      <div className="ci-lenta-sarlavha">
                        <Link to={`/suhbatlar/${c.id}`} className="ci-havola">
                          {fmtSana(c.startedAt)}
                        </Link>
                        {c.score !== null && <span className={`ball ${ballKlass(c.score)} ci-ball`}>{Math.round(c.score)}</span>}
                        <span className="yordam">
                          {c.seatName ?? ''} · {fmtSoniya(c.durationSeconds)}
                        </span>
                      </div>
                      {c.summary && <p>{c.summary}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          </div>
          {tahrir && <KontaktOyna kontakt={k.contact} onYop={() => setTahrir(false)} onSaqlandi={() => void yukla()} />}
          {vazifa && <VazifaOyna contactId={k.contact.id} onYop={() => setVazifa(false)} onSaqlandi={yukla} />}
        </>
      )}
    </div>
  );
}

// ─── Kompaniyalar ────────────────────────────────────────────────────────────

function KompaniyaRoyxati() {
  const { base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sorov, setSorov] = useState('');
  const [sahifa, setSahifa] = useState(0);
  const [hajm, setHajm] = useState(25);
  const [data, setData] = useState<{ total: number; items: KompaniyaQator[] } | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [yangi, setYangi] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => {
      setSorov(q.trim());
      setSahifa(0);
    }, 300);
    return () => clearTimeout(id);
  }, [q]);

  useEffect(() => {
    let tirik = true;
    const p = new URLSearchParams({ limit: String(hajm), offset: String(sahifa * hajm) });
    if (sorov) p.set('q', sorov);
    api
      .get<{ total: number; items: KompaniyaQator[] }>(`${base}/companies?${p}`)
      .then((r) => tirik && (setData(r), setXato(null)))
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")));
    return () => {
      tirik = false;
    };
  }, [base, sorov, sahifa, hajm, t]);

  const sahifalar = data ? Math.max(1, Math.ceil(data.total / hajm)) : 1;
  return (
    <>
      <MsBosh
        sarlavha={t('Kompaniyalar')}
        qidiruv={{ qiymat: q, onChange: setQ, placeholder: t('Kompaniya nomi, telefon yoki sayt'), nom: t('Kompaniyalarni qidirish') }}
        jami={data ? pul(data.total) : undefined}
      >
        <button className="btn" onClick={() => setYangi(true)}>
          <Plus /> {t('Yangi kompaniya')}
        </button>
      </MsBosh>
      <div className="card ci-jadval-karta">
        {xato && <div className="xato-qator">{xato}</div>}
        {!data && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
        {data && data.items.length === 0 && <div className="ci-bosh-holat">{t('Kompaniyalar topilmadi')}</div>}
        {data && data.items.length > 0 && (
          <div className="ci-jadval-qobiq">
            <table className="jadval ms-jadval">
              <thead>
                <tr>
                  <th>{t('Kompaniya nomi')}</th>
                  <th>{t('Telefon raqami')}</th>
                  <th>{t('Veb-sayt')}</th>
                  <th>{t('Email')}</th>
                  <th>{t('Manzil')}</th>
                  <th className="ci-ong">{t('Kontaktlar')}</th>
                  <th className="ci-ong">{t('Lidlar')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="bosiladigan" onClick={() => navigate(`/crm/kompaniyalar/${c.id}`)}>
                    <td>
                      <Link to={`/crm/kompaniyalar/${c.id}`} className="ms-jadval-nom" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                    </td>
                    <td className="ci-raqam">{c.phone ?? '—'}</td>
                    <td>{c.website ?? '—'}</td>
                    <td>{c.email ?? '—'}</td>
                    <td>{c.address ?? '—'}</td>
                    <td className="ci-ong ci-raqam">{c.contacts}</td>
                    <td className="ci-ong ci-raqam">{c.deals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && (
          <MsSahifalash
            sahifa={sahifa}
            sahifalar={sahifalar}
            onSahifa={setSahifa}
            hajm={hajm}
            onHajm={(h) => {
              setHajm(h);
              setSahifa(0);
            }}
          />
        )}
      </div>
      {yangi && <KompaniyaOyna onYop={() => setYangi(false)} onSaqlandi={(id) => navigate(`/crm/kompaniyalar/${id}`)} />}
    </>
  );
}

interface KompaniyaMalumot {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  note: string | null;
}

function KompaniyaOyna({ k, onYop, onSaqlandi }: { k?: KompaniyaMalumot; onYop: () => void; onSaqlandi: (id: string) => void }) {
  const { base } = useCrm();
  const t = useT();
  const [f, setF] = useState({ name: k?.name ?? '', phone: k?.phone ?? '', email: k?.email ?? '', website: k?.website ?? '', address: k?.address ?? '', note: k?.note ?? '' });
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const saqla = async () => {
    if (!f.name.trim()) return setXato(t('Kompaniya nomini kiriting'));
    setBand(true);
    const body = Object.fromEntries(Object.entries(f).map(([a, v]) => [a, v.trim() || (a === 'name' ? v : null)]));
    try {
      if (k) {
        await api.patch(`${base}/companies/${k.id}`, body);
        onSaqlandi(k.id);
      } else onSaqlandi((await api.post<{ id: string }>(`${base}/companies`, body)).id);
      onYop();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      setBand(false);
    }
  };
  const maydon = (kalit: keyof typeof f, nom: string, tur = 'text') => (
    <div className="maydon-blok">
      <label htmlFor={`kp-${kalit}`}>{t(nom)}</label>
      <input id={`kp-${kalit}`} className="input" type={tur} value={f[kalit]} maxLength={kalit === 'address' ? 500 : 300} onChange={(e) => setF({ ...f, [kalit]: e.target.value })} />
    </div>
  );
  return (
    <Oyna
      sarlavha={k ? t('Kompaniyani tahrirlash') : t('Yangi kompaniya')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn" disabled={band}>
            {t('Saqlash')}
          </button>
        </>
      }
    >
      {maydon('name', 'Nomi')}
      <div className="vr-oyna-ikki">
        {maydon('phone', 'Telefon', 'tel')}
        {maydon('email', 'Email', 'email')}
      </div>
      <div className="vr-oyna-ikki">
        {maydon('website', 'Sayt')}
        {maydon('address', 'Manzil')}
      </div>
      <div className="maydon-blok">
        <label htmlFor="kp-note">{t('Izoh')}</label>
        <textarea id="kp-note" rows={2} maxLength={5000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
      </div>
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}

export function KompaniyaKarta() {
  const { id } = useParams<{ id: string }>();
  const { holat, base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [k, setK] = useState<{ company: KompaniyaMalumot; contacts: { id: string; name: string | null; phone: string | null; role: string | null }[]; deals: KontaktKartochka['deals'] } | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [tahrir, setTahrir] = useState(false);

  const yukla = useCallback(async () => {
    try {
      setK(await api.get(`${base}/companies/${id}`));
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, id, t]);
  useEffect(() => {
    void yukla();
  }, [yukla]);

  const ochir = async () => {
    if (!confirm(t('Kompaniya o‘chiriladi. Kontakt va bitimlar saqlanadi. Davom etasizmi?'))) return;
    try {
      await api.del(`${base}/companies/${id}`);
      navigate('/crm/kontaktlar?tab=kompaniya', { replace: true });
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("O'chirib bo'lmadi"));
    }
  };

  return (
    <div className="ci-sahifa">
      <Link to="/crm/kontaktlar?tab=kompaniya" className="ci-orqaga">
        <ArrowLeft /> {t('Kompaniyalar')}
      </Link>
      {xato && <div className="card xato-qator">{xato}</div>}
      {!k && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
      {k && (
        <>
          <div className="ci-bk-bosh">
            <div className="ci-kontakt-qator katta">
              <span className="ci-avatar" aria-hidden="true">
                <Building2 />
              </span>
              <span>
                <h1>{k.company.name}</h1>
                <span className="yordam">{[k.company.phone, k.company.email, k.company.website, k.company.address].filter(Boolean).join(' · ') || '—'}</span>
              </span>
            </div>
            <div className="ci-bosh-amallar">
              <button className="btn ikkinchi kichik" onClick={() => setTahrir(true)}>
                {t('Tahrirlash')}
              </button>
              {holat.canConfigure && (
                <button className="vr-amal" onClick={() => void ochir()} aria-label={t("O'chirish")}>
                  <Trash2 />
                </button>
              )}
            </div>
          </div>
          {k.company.note && <div className="card ci-sabab-qator">{k.company.note}</div>}
          <div className="ci-bk-ish">
            <section className="card ci-blok">
              <h2>{t('Kontaktlar')}</h2>
              {k.contacts.length === 0 && <p className="yordam">{t("Kontakt yo'q")}</p>}
              <ul className="ci-royxat">
                {k.contacts.map((c) => (
                  <li key={c.id}>
                    <Link to={`/crm/kontaktlar/${c.id}`} className="ci-royxat-band">
                      <span>
                        <b>{c.name ?? t('Ismsiz')}</b>
                        <small>{[c.role, c.phone].filter(Boolean).join(' · ')}</small>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section className="card ci-blok">
              <h2>{t('Bitimlar')}</h2>
              {k.deals.length === 0 && <p className="yordam">{t("Bitim yo'q")}</p>}
              <ul className="ci-royxat">
                {k.deals.map((d) => (
                  <li key={d.id}>
                    <Link to={`/crm/bitimlar/${d.id}`} className="ci-royxat-band">
                      <span>
                        <b>{d.name}</b>
                        <small>{d.pipelineName}</small>
                      </span>
                      <span className="ci-royxat-ong">
                        <span className="ci-bosqich-belgi" style={{ ['--bosqich' as string]: d.stageColor }}>
                          {d.stageName}
                        </span>
                        {d.amount !== null && <b className="ci-raqam">{pul(d.amount)}</b>}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </div>
          {tahrir && <KompaniyaOyna k={k.company} onYop={() => setTahrir(false)} onSaqlandi={() => void yukla()} />}
        </>
      )}
    </div>
  );
}

// ─── Dublikatlar (LEAD-12) ───────────────────────────────────────────────────

interface DublikatGuruh {
  key: string;
  contacts: { id: string; name: string | null; phone: string | null; email: string | null; firstSeenAt: string; deals: number; calls: number }[];
}

function Dublikatlar() {
  const { base } = useCrm();
  const t = useT();
  const [guruhlar, setGuruhlar] = useState<DublikatGuruh[] | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [asosiy, setAsosiy] = useState<Record<string, string>>({});
  const [band, setBand] = useState<string | null>(null);

  const yukla = useCallback(async () => {
    try {
      const r = await api.get<{ groups: DublikatGuruh[] }>(`${base}/contacts/duplicates`);
      setGuruhlar(r.groups);
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, t]);
  useEffect(() => {
    void yukla();
  }, [yukla]);

  const birlashtir = async (g: DublikatGuruh) => {
    const primaryId = asosiy[g.key] ?? g.contacts[0]!.id;
    if (!confirm(t('{n} ta kontakt bittaga birlashtiriladi: bitim, qo‘ng‘iroq va vazifalari asosiy kontaktga o‘tadi. Bu amalni qaytarib bo‘lmaydi. Davom etasizmi?', { n: g.contacts.length }))) return;
    setBand(g.key);
    try {
      await api.post(`${base}/contacts/merge`, { primaryId, otherIds: g.contacts.map((c) => c.id).filter((x) => x !== primaryId) });
      await yukla();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    } finally {
      setBand(null);
    }
  };

  return (
    <div className="ci-sahifa-ichki">
      <p className="yordam">{t('Bir xil telefon (oxirgi 9 raqam) yoki email bo‘yicha topilgan kontaktlar. Asosiysini tanlang — qolganlarining ma’lumoti unga o‘tadi.')}</p>
      {xato && <div className="card xato-qator">{xato}</div>}
      {!guruhlar && !xato && <div className="card yuklanmoqda">{t('Yuklanmoqda…')}</div>}
      {guruhlar && guruhlar.length === 0 && <div className="card ci-bosh-holat">{t('Dublikat topilmadi')}</div>}
      {guruhlar?.map((g) => (
        <section className="card ci-blok" key={g.key} aria-label={g.key}>
          <div className="ci-blok-bosh">
            <h2>{g.key}</h2>
            <button className="btn kichik" disabled={band === g.key} onClick={() => void birlashtir(g)}>
              <Merge /> {t('Birlashtirish')}
            </button>
          </div>
          <ul className="ci-royxat" role="radiogroup" aria-label={t('Asosiy kontakt')}>
            {g.contacts.map((c) => (
              <li key={c.id} className="ci-royxat-band">
                <label className="ci-belgi">
                  <input type="radio" name={`asosiy-${g.key}`} checked={(asosiy[g.key] ?? g.contacts[0]!.id) === c.id} onChange={() => setAsosiy((a) => ({ ...a, [g.key]: c.id }))} />
                  <span>
                    <b>{c.name ?? t('Ismsiz')}</b>{' '}
                    <small className="yordam">{[c.phone, c.email].filter(Boolean).join(' · ')}</small>
                  </span>
                </label>
                <span className="yordam">
                  {t('{d} bitim · {c} qo‘ng‘iroq', { d: c.deals, c: c.calls })} · {fmtSana(c.firstSeenAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
