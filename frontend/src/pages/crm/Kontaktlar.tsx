import { ArrowLeft, Building2, CalendarClock, Merge, PhoneCall, Plus, Search, Trash2, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, ApiError, ballKlass, fmtQachon, fmtSana, fmtSoniya } from '../../api';
import { VazifaOyna } from '../../crm/komponentlar';
import { muddatHolati, pul, useCrm } from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';

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

/** Kontaktlar: SotuvAI qo'ng'iroqlaridagi mijozlar ham, CRM da qo'shilganlar ham — bitta ro'yxat. */
export function Kontaktlar() {
  const { holat } = useCrm();
  const t = useT();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as 'kontakt' | 'kompaniya' | 'dublikat' | null) ?? 'kontakt';
  return (
    <div className="ci-sahifa">
      <div className="ci-bosh">
        <h1>{t('Kontaktlar')}</h1>
        <div className="tab-qator" role="tablist">
          <button role="tab" aria-selected={tab === 'kontakt'} className={`tab${tab === 'kontakt' ? ' active' : ''}`} onClick={() => setParams({}, { replace: true })}>
            {t('Kontaktlar')}
          </button>
          <button role="tab" aria-selected={tab === 'kompaniya'} className={`tab${tab === 'kompaniya' ? ' active' : ''}`} onClick={() => setParams({ tab: 'kompaniya' }, { replace: true })}>
            {t('Kompaniyalar')}
          </button>
          {holat.canConfigure && (
            <button role="tab" aria-selected={tab === 'dublikat'} className={`tab${tab === 'dublikat' ? ' active' : ''}`} onClick={() => setParams({ tab: 'dublikat' }, { replace: true })}>
              {t('Dublikatlar')}
            </button>
          )}
        </div>
      </div>
      {tab === 'kontakt' && <KontaktRoyxati />}
      {tab === 'kompaniya' && <KompaniyaRoyxati />}
      {tab === 'dublikat' && holat.canConfigure && <Dublikatlar />}
    </div>
  );
}

function KontaktRoyxati() {
  const { base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [sorov, setSorov] = useState('');
  const [sahifa, setSahifa] = useState(0);
  const [data, setData] = useState<{ total: number; items: KontaktQator[] } | null>(null);
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
    const p = new URLSearchParams({ limit: String(HAJM), offset: String(sahifa * HAJM) });
    if (sorov) p.set('q', sorov);
    api
      .get<{ total: number; items: KontaktQator[] }>(`${base}/contacts?${p}`)
      .then((r) => tirik && (setData(r), setXato(null)))
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")));
    return () => {
      tirik = false;
    };
  }, [base, sorov, sahifa, t]);

  const sahifalar = data ? Math.max(1, Math.ceil(data.total / HAJM)) : 1;
  return (
    <>
      <div className="ci-filtrlar">
        <div className="input-qobiq ikonli ci-qidiruv">
          <span className="input-ikon" aria-hidden="true">
            <Search />
          </span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Ism, kompaniya yoki telefon')} aria-label={t('Kontaktlarni qidirish')} />
        </div>
        <button className="btn" onClick={() => setYangi(true)}>
          <Plus /> {t('Yangi kontakt')}
        </button>
      </div>
      <div className="card ci-jadval-karta">
        {xato && <div className="xato-qator">{xato}</div>}
        {!data && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
        {data && data.items.length === 0 && <div className="ci-bosh-holat">{t('Kontaktlar topilmadi')}</div>}
        {data && data.items.length > 0 && (
          <div className="ci-jadval-qobiq">
            <table className="jadval">
              <thead>
                <tr>
                  <th>{t('Ism')}</th>
                  <th>{t('Telefon')}</th>
                  <th>{t('Kompaniya')}</th>
                  <th className="ci-ong">{t('Bitimlar')}</th>
                  <th className="ci-ong">{t("Qo'ng'iroqlar")}</th>
                  <th>{t('Oxirgi faollik')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="bosiladigan" onClick={() => navigate(`/crm/kontaktlar/${c.id}`)}>
                    <td>
                      <Link to={`/crm/kontaktlar/${c.id}`} className="ci-havola" onClick={(e) => e.stopPropagation()}>
                        {c.name ?? t('Ismsiz')}
                      </Link>
                      {c.role && <div className="yordam">{c.role}</div>}
                    </td>
                    <td>
                      {c.phone ?? '—'}
                      {c.phones.length > 0 && <div className="yordam">+{c.phones.length}</div>}
                    </td>
                    <td>{c.companyName ?? c.company ?? '—'}</td>
                    <td className="ci-ong ci-raqam">{c.deals}</td>
                    <td className="ci-ong ci-raqam">{c.calls}</td>
                    <td className="yordam">{fmtQachon(c.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && sahifalar > 1 && <Sahifalash sahifa={sahifa} sahifalar={sahifalar} setSahifa={setSahifa} />}
      </div>
      {yangi && <KontaktOyna onYop={() => setYangi(false)} onSaqlandi={(id) => navigate(`/crm/kontaktlar/${id}`)} />}
    </>
  );
}

function Sahifalash({ sahifa, sahifalar, setSahifa }: { sahifa: number; sahifalar: number; setSahifa: (f: (s: number) => number) => void }) {
  const t = useT();
  return (
    <div className="ci-sahifalash">
      <button className="btn ikkinchi kichik" disabled={sahifa === 0} onClick={() => setSahifa((s) => s - 1)}>
        {t('Oldingi')}
      </button>
      <span>
        {sahifa + 1} / {sahifalar}
      </span>
      <button className="btn ikkinchi kichik" disabled={sahifa + 1 >= sahifalar} onClick={() => setSahifa((s) => s + 1)}>
        {t('Keyingi')}
      </button>
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

/** Kontakt kartochkasi: ma'lumot, bitimlari, vazifalari va SotuvAI qo'ng'iroqlari. */
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
                <PhoneCall aria-hidden="true" /> {t("SotuvAI qo'ng'iroqlari")}
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
    const p = new URLSearchParams({ limit: String(HAJM), offset: String(sahifa * HAJM) });
    if (sorov) p.set('q', sorov);
    api
      .get<{ total: number; items: KompaniyaQator[] }>(`${base}/companies?${p}`)
      .then((r) => tirik && (setData(r), setXato(null)))
      .catch((e) => tirik && setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi")));
    return () => {
      tirik = false;
    };
  }, [base, sorov, sahifa, t]);

  const sahifalar = data ? Math.max(1, Math.ceil(data.total / HAJM)) : 1;
  return (
    <>
      <div className="ci-filtrlar">
        <div className="input-qobiq ikonli ci-qidiruv">
          <span className="input-ikon" aria-hidden="true">
            <Search />
          </span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Kompaniya nomi, telefon yoki sayt')} aria-label={t('Kompaniyalarni qidirish')} />
        </div>
        <button className="btn" onClick={() => setYangi(true)}>
          <Plus /> {t('Yangi kompaniya')}
        </button>
      </div>
      <div className="card ci-jadval-karta">
        {xato && <div className="xato-qator">{xato}</div>}
        {!data && !xato && <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}
        {data && data.items.length === 0 && <div className="ci-bosh-holat">{t('Kompaniyalar topilmadi')}</div>}
        {data && data.items.length > 0 && (
          <div className="ci-jadval-qobiq">
            <table className="jadval">
              <thead>
                <tr>
                  <th>{t('Nomi')}</th>
                  <th>{t('Telefon')}</th>
                  <th>{t('Sayt')}</th>
                  <th className="ci-ong">{t('Kontaktlar')}</th>
                  <th className="ci-ong">{t('Bitimlar')}</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id} className="bosiladigan" onClick={() => navigate(`/crm/kompaniyalar/${c.id}`)}>
                    <td>
                      <Link to={`/crm/kompaniyalar/${c.id}`} className="ci-havola" onClick={(e) => e.stopPropagation()}>
                        {c.name}
                      </Link>
                    </td>
                    <td>{c.phone ?? '—'}</td>
                    <td>{c.website ?? '—'}</td>
                    <td className="ci-ong ci-raqam">{c.contacts}</td>
                    <td className="ci-ong ci-raqam">{c.deals}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && sahifalar > 1 && <Sahifalash sahifa={sahifa} sahifalar={sahifalar} setSahifa={setSahifa} />}
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
