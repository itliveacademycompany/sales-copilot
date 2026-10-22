import { ArrowLeft, PhoneCall, Plus, Search, User } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, ballKlass, fmtQachon, fmtSana, fmtSoniya } from '../../api';
import { pul, useCrm } from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';

interface KontaktQator {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
  lastSeenAt: string;
  deals: number;
  calls: number;
}

const HAJM = 50;

/** Kontaktlar: SotuvAI qo'ng'iroqlaridagi mijozlar ham, CRM da qo'shilganlar ham — bitta ro'yxat. */
export function Kontaktlar() {
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
    <div className="ci-sahifa">
      <div className="ci-bosh">
        <h1>{t('Kontaktlar')}</h1>
        <div className="ci-bosh-amallar">
          <button className="btn" onClick={() => setYangi(true)}>
            <Plus /> {t('Yangi kontakt')}
          </button>
        </div>
      </div>
      <div className="ci-filtrlar">
        <div className="input-qobiq ikonli ci-qidiruv">
          <span className="input-ikon" aria-hidden="true">
            <Search />
          </span>
          <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('Ism, kompaniya yoki telefon')} aria-label={t('Kontaktlarni qidirish')} />
        </div>
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
                      {c.email && <div className="yordam">{c.email}</div>}
                    </td>
                    <td>{c.phone ?? '—'}</td>
                    <td>{c.company ?? '—'}</td>
                    <td className="ci-ong ci-raqam">{c.deals}</td>
                    <td className="ci-ong ci-raqam">{c.calls}</td>
                    <td className="yordam">{fmtQachon(c.lastSeenAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && sahifalar > 1 && (
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
        )}
      </div>

      {yangi && <KontaktOyna onYop={() => setYangi(false)} onSaqlandi={(id) => navigate(`/crm/kontaktlar/${id}`)} />}
    </div>
  );
}

interface KontaktMalumot {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  company: string | null;
}

function KontaktOyna({ kontakt, onYop, onSaqlandi }: { kontakt?: KontaktMalumot; onYop: () => void; onSaqlandi: (id: string) => void }) {
  const { base } = useCrm();
  const t = useT();
  const [ism, setIsm] = useState(kontakt?.name ?? '');
  const [tel, setTel] = useState(kontakt?.phone ?? '');
  const [email, setEmail] = useState(kontakt?.email ?? '');
  const [kompaniya, setKompaniya] = useState(kontakt?.company ?? '');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const saqla = async () => {
    if (!ism.trim()) {
      setXato(t('Ismni kiriting'));
      return;
    }
    setBand(true);
    setXato(null);
    const body = { name: ism.trim(), phone: tel.trim() || null, email: email.trim() || null, company: kompaniya.trim() || null };
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
      <div className="maydon-blok">
        <label htmlFor="ko-ism">{t('Ism')}</label>
        <input id="ko-ism" className="input" value={ism} maxLength={200} onChange={(e) => setIsm(e.target.value)} />
      </div>
      <div className="vr-oyna-ikki">
        <div className="maydon-blok">
          <label htmlFor="ko-tel">{t('Telefon')}</label>
          <input id="ko-tel" className="input" type="tel" value={tel} maxLength={40} onChange={(e) => setTel(e.target.value)} placeholder="+998 90 123 45 67" />
        </div>
        <div className="maydon-blok">
          <label htmlFor="ko-email">{t('Email')}</label>
          <input id="ko-email" className="input" type="email" value={email} maxLength={200} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="ko-komp">{t('Kompaniya')}</label>
        <input id="ko-komp" className="input" value={kompaniya} maxLength={200} onChange={(e) => setKompaniya(e.target.value)} />
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
  contact: KontaktMalumot & { firstSeenAt: string; lastSeenAt: string };
  deals: {
    id: string;
    name: string;
    amount: number | null;
    stageName: string;
    stageKind: string;
    stageColor: string;
    pipelineName: string;
    updatedAt: string;
  }[];
  calls: {
    id: string;
    channel: string;
    startedAt: string;
    durationSeconds: number | null;
    score: number | null;
    summary: string | null;
    seatName: string | null;
  }[];
}

/** Kontakt kartochkasi: ma'lumot, bitimlari va SotuvAI qo'ng'iroqlari. */
export function KontaktKarta() {
  const { id } = useParams<{ id: string }>();
  const { base } = useCrm();
  const t = useT();
  const [k, setK] = useState<KontaktKartochka | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [tahrir, setTahrir] = useState(false);

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
                  {[k.contact.phone, k.contact.email, k.contact.company].filter(Boolean).join(' · ') || '—'}
                </span>
              </span>
            </div>
            <button className="btn ikkinchi kichik" onClick={() => setTahrir(true)}>
              {t('Tahrirlash')}
            </button>
          </div>

          <div className="ci-bk-ish">
            <section className="card ci-blok" aria-labelledby="kk-bitim">
              <div className="ci-blok-bosh">
                <h2 id="kk-bitim">{t('Bitimlar')}</h2>
              </div>
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

            <section className="card ci-blok" aria-labelledby="kk-qongiroq">
              <div className="ci-blok-bosh">
                <h2 id="kk-qongiroq">
                  <PhoneCall aria-hidden="true" /> {t("SotuvAI qo'ng'iroqlari")}
                </h2>
              </div>
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
        </>
      )}
    </div>
  );
}
