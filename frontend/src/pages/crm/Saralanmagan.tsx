import { Check, FileText, Hand, Inbox, Link2, PhoneCall, Plus, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, ApiError, ballKlass, fmtQachon, fmtSoniya } from '../../api';
import { useCrm } from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';

interface Murojaat {
  id: string;
  source: 'call' | 'form' | 'manual';
  status: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  message: string | null;
  payload: { score?: number | null; durationSeconds?: number | null; seatName?: string | null; direction?: string; values?: Record<string, string> };
  contactId: string | null;
  contactName: string | null;
  formName: string | null;
  conversationId: string | null;
  dealId: string | null;
  dealName: string | null;
  decidedAt: string | null;
  createdAt: string;
  openDeals: number;
}

const HAJM = 30;

/**
 * "Saralanmagan" murojaatlar (LEAD-04). SotuvAI qo'ng'iroqlari (ochiq
 * bitimi yo'q mijozlar), veb-formalar va qo'lda kiritilganlar. Qabul —
 * bitim (mas'ul navbat bilan) yoki mavjud bitimga bog'lash.
 */
export function Saralanmagan() {
  const { base, yangila } = useCrm();
  const t = useT();
  const [holat, setHolat] = useState<'pending' | 'accepted' | 'rejected'>('pending');
  const [sahifa, setSahifa] = useState(0);
  const [data, setData] = useState<{ total: number; counts: Record<string, number>; items: Murojaat[] } | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [qabul, setQabul] = useState<Murojaat | null>(null);
  const [qolda, setQolda] = useState(false);
  const [ichki, setIchki] = useState(0);

  const yukla = useCallback(async () => {
    try {
      setData(await api.get(`${base}/crm-app/inbox?status=${holat}&limit=${HAJM}&offset=${sahifa * HAJM}`));
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, holat, sahifa, t]);
  useEffect(() => {
    void yukla();
  }, [yukla, ichki]);

  const rad = async (m: Murojaat) => {
    try {
      await api.post(`${base}/crm-app/inbox/${m.id}/reject`, {});
      setIchki((x) => x + 1);
      void yangila();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  const sahifalar = data ? Math.max(1, Math.ceil(data.total / HAJM)) : 1;
  return (
    <div className="ci-sahifa">
      <div className="ci-bosh">
        <div>
          <h1>{t('Saralanmagan')}</h1>
          <p className="yordam">{t("Yangi murojaatlar: SotuvAI qo'ng'iroqlari, veb-formalar va qo'lda kiritilganlar. Qabul qilinsa — bitim bo'ladi.")}</p>
        </div>
        <div className="ci-bosh-amallar">
          <div className="tab-qator" role="tablist">
            {(
              [
                ['pending', 'Kutilmoqda'],
                ['accepted', 'Qabul qilingan'],
                ['rejected', 'Rad etilgan'],
              ] as const
            ).map(([h, nom]) => (
              <button key={h} role="tab" aria-selected={holat === h} className={`tab${holat === h ? ' active' : ''}`} onClick={() => (setHolat(h), setSahifa(0))}>
                {t(nom)}
                {data?.counts[h] ? <span className="ci-tab-soni">{data.counts[h]}</span> : null}
              </button>
            ))}
          </div>
          <button className="btn" onClick={() => setQolda(true)}>
            <Plus /> {t('Murojaat')}
          </button>
        </div>
      </div>
      {xato && <div className="card xato-qator">{xato}</div>}
      {!data && !xato && <div className="card yuklanmoqda">{t('Yuklanmoqda…')}</div>}
      {data && data.items.length === 0 && (
        <div className="card ci-bosh-holat">
          <Inbox className="ci-bosh-ikon" aria-hidden="true" />
          <p>{holat === 'pending' ? t('Hamma murojaatlar ko‘rib chiqilgan') : t('Bu yerda hali hech narsa yo‘q')}</p>
        </div>
      )}
      <div className="ci-murojaatlar">
        {data?.items.map((m) => (
          <article key={m.id} className="card ci-murojaat">
            <header>
              <span className={`ci-manba ${m.source}`}>
                {m.source === 'call' ? <PhoneCall aria-hidden="true" /> : m.source === 'form' ? <FileText aria-hidden="true" /> : <Hand aria-hidden="true" />}
                {m.source === 'call' ? t("Qo'ng'iroq") : m.source === 'form' ? (m.formName ?? t('Veb-forma')) : t("Qo'lda")}
              </span>
              <time className="yordam">{fmtQachon(m.createdAt)}</time>
            </header>
            <div className="ci-murojaat-kim">
              <b>{m.contactName ?? m.name ?? t('Ismsiz')}</b>
              <span className="yordam">{[m.phone, m.email].filter(Boolean).join(' · ')}</span>
            </div>
            {m.source === 'call' && (
              <div className="ci-murojaat-qongiroq">
                {m.payload.score !== null && m.payload.score !== undefined && <span className={`ball ${ballKlass(m.payload.score)} ci-ball`}>{Math.round(m.payload.score)}</span>}
                <span className="yordam">
                  {[m.payload.seatName, fmtSoniya(m.payload.durationSeconds ?? null)].filter(Boolean).join(' · ')}
                </span>
                {m.conversationId && (
                  <Link to={`/suhbatlar/${m.conversationId}`} className="ci-havola">
                    {t('Suhbatni ochish')}
                  </Link>
                )}
              </div>
            )}
            {m.message && <p className="ci-murojaat-matn">{m.message}</p>}
            {m.openDeals > 0 && holat === 'pending' && <p className="ci-ogoh-qator">{t('Bu mijozning {n} ta ochiq bitimi bor — unga bog‘lash mumkin', { n: m.openDeals })}</p>}
            {holat === 'pending' ? (
              <footer>
                <button className="btn kichik" onClick={() => setQabul(m)}>
                  <Check /> {t('Qabul qilish')}
                </button>
                <button className="btn ikkinchi kichik" onClick={() => void rad(m)}>
                  <X /> {t('Rad etish')}
                </button>
              </footer>
            ) : (
              <footer className="yordam">
                {m.dealId ? (
                  <Link to={`/crm/bitimlar/${m.dealId}`} className="ci-havola">
                    {t('Bitim: {n}', { n: m.dealName ?? '—' })}
                  </Link>
                ) : (
                  t('Rad etilgan')
                )}
                {m.decidedAt && ` · ${fmtQachon(m.decidedAt)}`}
              </footer>
            )}
          </article>
        ))}
      </div>
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

function QabulOyna({ m, onYop, onTugadi }: { m: Murojaat; onYop: () => void; onTugadi: () => void }) {
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const asosiy = holat.pipelines.find((p) => p.isMain) ?? holat.pipelines[0]!;
  const [rejim, setRejim] = useState<'yangi' | 'boglash'>(m.openDeals > 0 ? 'boglash' : 'yangi');
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
