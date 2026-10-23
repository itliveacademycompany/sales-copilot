import {
  ArrowLeft,
  Building2,
  CalendarClock,
  CheckCircle2,
  Circle,
  ExternalLink,
  History,
  ListChecks,
  MessageSquareText,
  Package,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  User,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, ballKlass, fmtSana, fmtSoniya } from '../../api';
import { BajarishOyna, TeglarKiritish, VazifaOyna } from '../../crm/komponentlar';
import {
  bosqichTop,
  guruhla,
  MaydonKiritish,
  muddatHolati,
  pul,
  qiymatMatni,
  qiymatniTayyorla,
  useCrm,
  vazifaTuri,
  type Maydon,
} from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';
import { YoqotishSababi } from './Bitimlar';

interface Hodisa {
  id: string;
  type: string;
  data: Record<string, unknown>;
  authorName: string | null;
  createdAt: string;
}

interface Vazifa {
  id: string;
  title: string;
  description: string | null;
  status: 'pending' | 'in_progress' | 'done' | 'cancelled' | 'blocked';
  dueAt: string | null;
  source: string;
  taskType: string | null;
  result: string | null;
  conversationId: string | null;
  seatId: string | null;
  seatName: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface Qongiroq {
  id: string;
  channel: string;
  direction: string | null;
  startedAt: string;
  durationSeconds: number | null;
  status: string;
  score: number | null;
  summary: string | null;
  leadQuality: string | null;
  seatName: string | null;
}

interface TovarQatori {
  id: string;
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  discount: number;
}

interface Kartochka {
  deal: {
    id: string;
    name: string;
    amount: number | null;
    pipelineId: string;
    stageId: string;
    responsibleSeatId: string | null;
    contactId: string | null;
    companyId: string | null;
    tags: string[];
    fields: Record<string, unknown>;
    lostReason: string | null;
    closedAt: string | null;
    source: string | null;
    version: number;
    createdAt: string;
    stageEnteredAt: string;
    externalId: string | null;
    externalUrl: string | null;
  };
  /** Tashqi CRM nomi (masalan "amoCRM") — bitim u yerdan sinxronlanadi. */
  sync: string | null;
  company: { id: string; name: string; phone: string | null; website: string | null } | null;
  lossReason: { id: string; name: string } | null;
  items: TovarQatori[];
  contact: {
    id: string;
    name: string | null;
    phone: string | null;
    phones: string[];
    email: string | null;
    emails: string[];
    company: string | null;
    role: string | null;
  } | null;
  responsible: { id: string; name: string } | null;
  events: Hodisa[];
  tasks: Vazifa[];
  calls: Qongiroq[];
}

const OCHIQ = new Set(['pending', 'in_progress', 'blocked']);

/**
 * Bitim kartochkasi. Chapda — asosiy ma'lumot, teglar, kompaniya, tovarlar
 * va qo'shimcha maydonlar (bitta "Saqlash", optimistik qulf bilan); o'ngda —
 * vazifalar va tarix lentasi (izoh, bosqich, maydon, vazifa, avtomatika va
 * SotuvAI qo'ng'iroqlari).
 */
export function BitimKarta() {
  const { id } = useParams<{ id: string }>();
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [k, setK] = useState<Kartochka | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const [qoralama, setQoralama] = useState<{
    name: string;
    amount: string;
    responsibleSeatId: string;
    companyId: string;
    tags: string[];
    fields: Record<string, unknown>;
  } | null>(null);
  const [band, setBand] = useState(false);
  const [yoqotish, setYoqotish] = useState<string | null>(null);
  const [vazifaOyna, setVazifaOyna] = useState(false);
  const [ochirish, setOchirish] = useState(false);

  const yukla = useCallback(async () => {
    try {
      const r = await api.get<Kartochka>(`${base}/deals/${id}`);
      setK(r);
      setQoralama({
        name: r.deal.name,
        amount: r.deal.amount === null ? '' : String(r.deal.amount),
        responsibleSeatId: r.deal.responsibleSeatId ?? '',
        companyId: r.deal.companyId ?? '',
        tags: r.deal.tags ?? [],
        fields: { ...r.deal.fields },
      });
      setXato(null);
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("Ma'lumotni yuklab bo'lmadi"));
    }
  }, [base, id, t]);

  useEffect(() => {
    void yukla();
  }, [yukla]);

  const ozgargan = useMemo(() => {
    if (!k || !qoralama) return false;
    if (qoralama.name.trim() !== k.deal.name) return true;
    const a = qoralama.amount.trim() === '' ? null : Number(qoralama.amount.replace(/\s/g, '').replace(',', '.'));
    if (a !== k.deal.amount) return true;
    if ((qoralama.responsibleSeatId || null) !== k.deal.responsibleSeatId) return true;
    if ((qoralama.companyId || null) !== k.deal.companyId) return true;
    if (JSON.stringify(qoralama.tags) !== JSON.stringify(k.deal.tags ?? [])) return true;
    return holat.fields.some((m) => JSON.stringify(qiymatniTayyorla(m, qoralama.fields[m.id]) ?? null) !== JSON.stringify(k.deal.fields[m.id] ?? null));
  }, [k, qoralama, holat.fields]);

  if (xato && !k) {
    return (
      <div className="ci-sahifa">
        <Link to="/crm/bitimlar" className="ci-orqaga">
          <ArrowLeft /> {t('Bitimlar')}
        </Link>
        <div className="card xato-qator">{xato}</div>
      </div>
    );
  }
  if (!k || !qoralama) return <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>;

  const d = k.deal;
  const bosqich = bosqichTop(holat, d.stageId);
  const voronka = holat.pipelines.find((p) => p.id === d.pipelineId);
  const yozaOladi = holat.canManageAll || d.responsibleSeatId === holat.seatId;
  const maydonNomi = new Map(holat.fields.map((f) => [f.id, f]));
  const tovarli = k.items.length > 0;
  // amoCRM dan sinxronlanadi: nom, summa, bosqich, mas'ul va amoCRM maydonlari faqat o'qiladi
  const sinx = k.sync;

  const saqla = async () => {
    setBand(true);
    setXabar(null);
    try {
      const fields: Record<string, unknown> = {};
      for (const m of holat.fields) {
        const yangi = qiymatniTayyorla(m, qoralama.fields[m.id]) ?? null;
        if (JSON.stringify(yangi) !== JSON.stringify(d.fields[m.id] ?? null)) fields[m.id] = yangi;
      }
      const amount = qoralama.amount.trim() === '' ? null : Number(qoralama.amount.replace(/\s/g, '').replace(',', '.'));
      await api.patch(`${base}/deals/${d.id}`, {
        version: d.version,
        name: sinx ? undefined : qoralama.name.trim() || d.name,
        amount: tovarli || sinx ? undefined : Number.isFinite(amount as number) || amount === null ? amount : undefined,
        responsibleSeatId: holat.canManageAll && !sinx ? qoralama.responsibleSeatId || null : undefined,
        companyId: qoralama.companyId || null,
        tags: qoralama.tags,
        fields: Object.keys(fields).length ? fields : undefined,
      });
      setXabar({ ok: true, matn: t('Saqlandi') });
      await yukla();
    } catch (e) {
      setXabar({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
      if (e instanceof ApiError && e.status === 409) await yukla();
    } finally {
      setBand(false);
    }
  };

  const kochir = async (stageId: string, sabab?: { lostReasonId: string | null; lostReason: string | null }) => {
    setXabar(null);
    try {
      await api.post(`${base}/deals/${d.id}/move`, { stageId, ...(sabab ?? {}) });
      await yukla();
      // "Darhol" avtomatika qoidalari natijasi (vazifa, mas'ul) bir lahzadan keyin ko'rinadi
      setTimeout(() => void yukla(), 1500);
    } catch (e) {
      setXabar({ ok: false, matn: e instanceof ApiError ? t(e.message) : t("Ko'chirib bo'lmadi") });
    }
  };

  const ochir = async () => {
    try {
      await api.del(`${base}/deals/${d.id}`);
      navigate(`/crm/bitimlar?v=${d.pipelineId}`, { replace: true });
    } catch (e) {
      setOchirish(false);
      setXabar({ ok: false, matn: e instanceof ApiError ? t(e.message) : t("O'chirib bo'lmadi") });
    }
  };

  return (
    <div className="ci-sahifa">
      <Link to={`/crm/bitimlar?v=${d.pipelineId}`} className="ci-orqaga">
        <ArrowLeft /> {voronka?.name ?? t('Bitimlar')}
      </Link>

      <div className="ci-bk-bosh">
        <div className="ci-bk-sarlavha">
          <h1>{d.name}</h1>
          <div className="ci-bk-meta">
            {bosqich && (
              <span className="ci-bosqich-belgi" style={{ ['--bosqich' as string]: bosqich.color }}>
                {bosqich.name}
              </span>
            )}
            <span>{t('Yaratilgan: {v}', { v: fmtSana(d.createdAt) })}</span>
            {d.source && <span>{t('Manba: {m}', { m: t(d.source) })}</span>}
            {d.amount !== null && <b className="ci-raqam">{pul(d.amount)}</b>}
          </div>
        </div>
        {yozaOladi && (
          <button className="vr-amal" onClick={() => setOchirish(true)} aria-label={t("Bitimni o'chirish")} title={t("Bitimni o'chirish")}>
            <Trash2 />
          </button>
        )}
      </div>

      {/* Bosqichlar chizig'i — bosib ko'chirish (sudrashga muqobil, klaviatura bilan ham) */}
      {voronka && (
        <div className="ci-bosqich-chiziq" role="group" aria-label={t('Bosqichga o‘tkazish')}>
          {voronka.stages.map((s) => {
            const faol = s.id === d.stageId;
            const otgan = !faol && bosqich && s.sort < bosqich.sort && s.kind === 'open';
            return (
              <button
                key={s.id}
                type="button"
                disabled={!yozaOladi || faol || Boolean(sinx)}
                aria-current={faol ? 'step' : undefined}
                className={`ci-qadam ${s.kind}${faol ? ' faol' : ''}${otgan ? ' otgan' : ''}`}
                style={{ ['--bosqich' as string]: s.color }}
                onClick={() => (s.kind === 'lost' ? setYoqotish(s.id) : void kochir(s.id))}
                title={s.name}
              >
                {s.name}
              </button>
            );
          })}
        </div>
      )}
      {sinx && (
        <div className="card ci-sinx-qator" role="note">
          <RefreshCw aria-hidden="true" />
          <span>{t("{crm} dan sinxronlanadi — nom, summa, bosqich, mas'ul va {crm} maydonlari u yerda o'zgartiriladi. Teglar, kompaniya, izoh va vazifalarni shu yerda qo'shish mumkin.", { crm: sinx })}</span>
          {d.externalUrl && (
            <a href={d.externalUrl} target="_blank" rel="noopener noreferrer">
              {t('{crm} da ochish', { crm: sinx })} <ExternalLink aria-hidden="true" />
            </a>
          )}
        </div>
      )}
      {bosqich?.kind === 'lost' && (k.lossReason || d.lostReason) && (
        <div className="card ci-sabab-qator">
          <b>{t("Yo'qotish sababi:")}</b> {k.lossReason ? t(k.lossReason.name) : ''}
          {d.lostReason && d.lostReason !== k.lossReason?.name && <span> — {d.lostReason}</span>}
        </div>
      )}
      {xabar && (
        <div className={`card ${xabar.ok ? 'ok-qator' : 'xato-qator'}`} role={xabar.ok ? 'status' : 'alert'}>
          {xabar.matn}
        </div>
      )}

      <div className="ci-bk-ish">
        <div className="ci-bk-chap">
          <section className="card ci-blok" aria-labelledby="bk-asosiy">
            <h2 id="bk-asosiy">{t("Asosiy ma'lumot")}</h2>
            <fieldset disabled={!yozaOladi} className="ci-fieldset">
              <div className="maydon-blok">
                <label htmlFor="bk-nom">{t('Bitim nomi')}</label>
                <input
                  id="bk-nom"
                  className="input"
                  value={qoralama.name}
                  maxLength={250}
                  readOnly={Boolean(sinx)}
                  onChange={(e) => setQoralama({ ...qoralama, name: e.target.value })}
                />
              </div>
              <div className="vr-oyna-ikki">
                <div className="maydon-blok">
                  <label htmlFor="bk-summa">{t('Summa')}</label>
                  <input
                    id="bk-summa"
                    className="input"
                    inputMode="decimal"
                    value={qoralama.amount}
                    readOnly={tovarli || Boolean(sinx)}
                    title={tovarli ? t('Summa tovarlardan hisoblanadi') : undefined}
                    onChange={(e) => setQoralama({ ...qoralama, amount: e.target.value.replace(/[^\d.,\s]/g, '') })}
                  />
                </div>
                <div className="maydon-blok">
                  <label htmlFor="bk-masul">{t("Mas'ul")}</label>
                  {holat.canManageAll && !sinx ? (
                    <select id="bk-masul" className="input" value={qoralama.responsibleSeatId} onChange={(e) => setQoralama({ ...qoralama, responsibleSeatId: e.target.value })}>
                      <option value="">{t('Biriktirilmagan')}</option>
                      {seatlar.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.displayName}
                        </option>
                      ))}
                      {k.responsible && !seatlar.some((s) => s.id === k.responsible!.id) && <option value={k.responsible.id}>{k.responsible.name}</option>}
                    </select>
                  ) : (
                    <input id="bk-masul" className="input" value={k.responsible?.name ?? '—'} readOnly />
                  )}
                </div>
              </div>
              <div className="maydon-blok">
                <label htmlFor="bk-teg">{t('Teglar')}</label>
                <TeglarKiritish id="bk-teg" qiymat={qoralama.tags} onChange={(tags) => setQoralama({ ...qoralama, tags })} />
              </div>
              <KompaniyaTanlash qiymat={qoralama.companyId} joriy={k.company} onChange={(companyId) => setQoralama({ ...qoralama, companyId })} />
            </fieldset>
          </section>

          <section className="card ci-blok" aria-labelledby="bk-kontakt">
            <h2 id="bk-kontakt">{t('Kontakt')}</h2>
            {k.contact ? (
              <Link to={`/crm/kontaktlar/${k.contact.id}`} className="ci-kontakt-qator">
                <span className="ci-avatar" aria-hidden="true">
                  <User />
                </span>
                <span>
                  <b>{k.contact.name ?? t('Ismsiz')}</b>
                  {k.contact.role && <span className="yordam">{k.contact.role}</span>}
                  {[k.contact.phone, ...(k.contact.phones ?? [])].filter(Boolean).map((p) => (
                    <span key={p} className="yordam">
                      <Phone aria-hidden="true" /> {p}
                    </span>
                  ))}
                  {k.contact.email && <span className="yordam">{k.contact.email}</span>}
                </span>
              </Link>
            ) : (
              <p className="yordam">{t('Kontakt biriktirilmagan.')}</p>
            )}
          </section>

          <Tovarlar dealId={d.id} items={k.items} yozaOladi={yozaOladi && !sinx} onOzgardi={yukla} />

          {guruhla(holat.fields).map((g) => (
            <section className="card ci-blok" key={g.nom} aria-label={t(g.nom)}>
              <h2>{t(g.nom)}</h2>
              <fieldset disabled={!yozaOladi} className="ci-fieldset">
                {g.maydonlar.map((m) => (
                  <div className="maydon-blok" key={m.id}>
                    <label htmlFor={`bk-${m.id}`}>
                      {m.label}
                      {m.required && <span className="ci-majburiy"> *</span>}
                    </label>
                    {sinx && m.external ? (
                      <fieldset disabled className="ci-fieldset" title={t('{crm} da o‘zgartiriladi', { crm: sinx })}>
                        <MaydonKiritish id={`bk-${m.id}`} m={m} qiymat={qoralama.fields[m.id]} onChange={() => undefined} />
                      </fieldset>
                    ) : (
                      <MaydonKiritish
                        id={`bk-${m.id}`}
                        m={m}
                        qiymat={qoralama.fields[m.id]}
                        onChange={(v) => setQoralama({ ...qoralama, fields: { ...qoralama.fields, [m.id]: v } })}
                      />
                    )}
                  </div>
                ))}
              </fieldset>
            </section>
          ))}

          {yozaOladi && (
            <div className={`ci-saqlash-panel${ozgargan ? ' korinadi' : ''}`} aria-hidden={!ozgargan}>
              <span>{t("O'zgarishlar saqlanmagan")}</span>
              <button className="btn ikkinchi kichik" onClick={() => void yukla()} tabIndex={ozgargan ? 0 : -1}>
                {t('Bekor')}
              </button>
              <button className="btn kichik" onClick={() => void saqla()} disabled={band || !ozgargan} tabIndex={ozgargan ? 0 : -1}>
                {band ? t('Saqlanmoqda…') : t('Saqlash')}
              </button>
            </div>
          )}
        </div>

        <div className="ci-bk-ong">
          <Vazifalar k={k} yozaOladi={yozaOladi} onYangi={() => setVazifaOyna(true)} onOzgardi={yukla} />
          <Lenta k={k} maydonNomi={maydonNomi} onIzoh={yukla} />
        </div>
      </div>

      {yoqotish && (
        <YoqotishSababi
          onYop={() => setYoqotish(null)}
          onTasdiq={(sabab) => {
            void kochir(yoqotish, sabab);
            setYoqotish(null);
          }}
        />
      )}
      {vazifaOyna && <VazifaOyna dealId={d.id} onYop={() => setVazifaOyna(false)} onSaqlandi={yukla} />}
      {ochirish && (
        <Oyna
          sarlavha={t("Bitimni o'chirish")}
          onYop={() => setOchirish(false)}
          onSubmit={() => void ochir()}
          past={
            <>
              <button type="button" className="btn ikkinchi" onClick={() => setOchirish(false)}>
                {t('Bekor')}
              </button>
              <button type="submit" className="btn xavfli">
                {t("Savatga o'tkazish")}
              </button>
            </>
          }
        >
          <p>{t('«{n}» bitimi savatga o‘tkaziladi va 30 kun ichida tiklash mumkin. Kontakt va qo‘ng‘iroqlar saqlanib qoladi.', { n: d.name })}</p>
        </Oyna>
      )}
    </div>
  );
}

// ─── Kompaniya tanlash ───────────────────────────────────────────────────────

function KompaniyaTanlash({
  qiymat,
  joriy,
  onChange,
}: {
  qiymat: string;
  joriy: { id: string; name: string } | null;
  onChange: (id: string) => void;
}) {
  const { base } = useCrm();
  const t = useT();
  const [royxat, setRoyxat] = useState<{ id: string; name: string }[]>(joriy ? [joriy] : []);
  const [yangi, setYangi] = useState(false);
  const [nom, setNom] = useState('');

  const yukla = useCallback(() => {
    void api
      .get<{ items: { id: string; name: string }[] }>(`${base}/companies?limit=200`)
      .then((r) => setRoyxat(r.items))
      .catch(() => undefined);
  }, [base]);
  useEffect(yukla, [yukla]);

  const yarat = async () => {
    if (!nom.trim()) return;
    try {
      const r = await api.post<{ id: string }>(`${base}/companies`, { name: nom.trim() });
      setRoyxat((x) => [...x, { id: r.id, name: nom.trim() }]);
      onChange(r.id);
      setYangi(false);
      setNom('');
    } catch (e) {
      alert(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  return (
    <div className="maydon-blok">
      <label htmlFor="bk-komp">
        <Building2 className="ci-label-ikon" aria-hidden="true" /> {t('Kompaniya')}
      </label>
      {yangi ? (
        <div className="ci-qator-kiritish">
          <input className="input" value={nom} maxLength={200} onChange={(e) => setNom(e.target.value)} placeholder={t('Kompaniya nomi')} aria-label={t('Kompaniya nomi')} autoFocus />
          <button type="button" className="btn kichik" onClick={() => void yarat()}>
            {t('Yaratish')}
          </button>
          <button type="button" className="btn ikkinchi kichik" onClick={() => setYangi(false)}>
            {t('Bekor')}
          </button>
        </div>
      ) : (
        <div className="ci-qator-kiritish">
          <select id="bk-komp" className="input" value={qiymat} onChange={(e) => onChange(e.target.value)}>
            <option value="">{t('— tanlanmagan —')}</option>
            {royxat.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <button type="button" className="vr-amal" onClick={() => setYangi(true)} aria-label={t('Yangi kompaniya')} title={t('Yangi kompaniya')}>
            <Plus />
          </button>
          {qiymat && (
            <Link to={`/crm/kompaniyalar/${qiymat}`} className="ci-havola">
              {t('Ochish')}
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Tovarlar (CUST-02) ──────────────────────────────────────────────────────

function Tovarlar({ dealId, items, yozaOladi, onOzgardi }: { dealId: string; items: TovarQatori[]; yozaOladi: boolean; onOzgardi: () => Promise<void> }) {
  const { base } = useCrm();
  const t = useT();
  const [katalog, setKatalog] = useState<{ id: string; name: string; price: number }[] | null>(null);
  const [ochiq, setOchiq] = useState(false);
  const [tanlov, setTanlov] = useState('');
  const [nom, setNom] = useState('');
  const [narx, setNarx] = useState('');
  const [miqdor, setMiqdor] = useState('1');
  const [xato, setXato] = useState<string | null>(null);
  const jami = items.reduce((a, i) => a + i.price * i.quantity * (1 - i.discount / 100), 0);

  useEffect(() => {
    if (!ochiq || katalog) return;
    void api
      .get<{ items: { id: string; name: string; price: number }[] }>(`${base}/crm-app/products?limit=200`)
      .then((r) => setKatalog(r.items))
      .catch(() => setKatalog([]));
  }, [ochiq, katalog, base]);

  const qosh = async () => {
    setXato(null);
    try {
      await api.post(`${base}/deals/${dealId}/items`, {
        productId: tanlov || null,
        name: tanlov ? undefined : nom.trim(),
        price: narx.trim() ? Number(narx.replace(/\s/g, '')) : undefined,
        quantity: Number(miqdor.replace(',', '.')) || 1,
      });
      setTanlov('');
      setNom('');
      setNarx('');
      setMiqdor('1');
      setOchiq(false);
      await onOzgardi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  const ozgartir = async (i: TovarQatori, k: { quantity?: number; discount?: number }) => {
    try {
      await api.patch(`${base}/deals/${dealId}/items/${i.id}`, k);
      await onOzgardi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  const ochir = async (i: TovarQatori) => {
    try {
      await api.del(`${base}/deals/${dealId}/items/${i.id}`);
      await onOzgardi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t("O'chirib bo'lmadi"));
    }
  };

  if (!yozaOladi && items.length === 0) return null;
  return (
    <section className="card ci-blok" aria-labelledby="bk-tovar">
      <div className="ci-blok-bosh">
        <h2 id="bk-tovar">
          <Package aria-hidden="true" /> {t('Tovarlar va xizmatlar')}
        </h2>
        {yozaOladi && !ochiq && (
          <button className="btn ikkinchi kichik" onClick={() => setOchiq(true)}>
            <Plus /> {t('Tovar')}
          </button>
        )}
      </div>
      {items.length > 0 && (
        <table className="jadval ci-tovar-jadval">
          <thead>
            <tr>
              <th>{t('Nomi')}</th>
              <th className="ci-ong">{t('Narx')}</th>
              <th className="ci-ong">{t('Miqdor')}</th>
              <th className="ci-ong">{t('Chegirma %')}</th>
              <th className="ci-ong">{t('Jami')}</th>
              {yozaOladi && <th aria-label={t('Amallar')} />}
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id}>
                <td>{i.name}</td>
                <td className="ci-ong ci-raqam">{pul(i.price)}</td>
                <td className="ci-ong">
                  {yozaOladi ? (
                    <input
                      className="input ci-son-kiritish"
                      inputMode="decimal"
                      defaultValue={String(i.quantity)}
                      aria-label={t('Miqdor')}
                      onBlur={(e) => {
                        const v = Number(e.target.value.replace(',', '.'));
                        if (v > 0 && v !== i.quantity) void ozgartir(i, { quantity: v });
                      }}
                    />
                  ) : (
                    i.quantity
                  )}
                </td>
                <td className="ci-ong">
                  {yozaOladi ? (
                    <input
                      className="input ci-son-kiritish"
                      inputMode="decimal"
                      defaultValue={String(i.discount)}
                      aria-label={t('Chegirma %')}
                      onBlur={(e) => {
                        const v = Number(e.target.value.replace(',', '.'));
                        if (v >= 0 && v <= 100 && v !== i.discount) void ozgartir(i, { discount: v });
                      }}
                    />
                  ) : (
                    i.discount
                  )}
                </td>
                <td className="ci-ong ci-raqam">{pul(i.price * i.quantity * (1 - i.discount / 100))}</td>
                {yozaOladi && (
                  <td className="ci-ong">
                    <button className="vr-amal" onClick={() => void ochir(i)} aria-label={t("O'chirish")}>
                      <Trash2 />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={4}>
                <b>{t('Bitim summasi')}</b>
              </td>
              <td className="ci-ong ci-raqam">
                <b>{pul(jami)}</b>
              </td>
              {yozaOladi && <td />}
            </tr>
          </tfoot>
        </table>
      )}
      {items.length === 0 && !ochiq && <p className="yordam">{t("Tovar qo'shilsa, bitim summasi avtomatik hisoblanadi.")}</p>}
      {ochiq && (
        <div className="ci-tovar-qosh">
          <select className="input" value={tanlov} onChange={(e) => setTanlov(e.target.value)} aria-label={t('Katalogdan')}>
            <option value="">{t('— katalogdan tanlang yoki pastda yozing —')}</option>
            {(katalog ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {pul(p.price)}
              </option>
            ))}
          </select>
          {!tanlov && <input className="input" value={nom} maxLength={200} onChange={(e) => setNom(e.target.value)} placeholder={t('Nomi')} aria-label={t('Nomi')} />}
          <input className="input" inputMode="numeric" value={narx} onChange={(e) => setNarx(e.target.value.replace(/[^\d\s]/g, ''))} placeholder={tanlov ? t('Narx (katalogdagi)') : t('Narx')} aria-label={t('Narx')} />
          <input className="input" inputMode="decimal" value={miqdor} onChange={(e) => setMiqdor(e.target.value.replace(/[^\d.,]/g, ''))} aria-label={t('Miqdor')} />
          <button className="btn kichik" onClick={() => void qosh()} disabled={!tanlov && !nom.trim()}>
            {t("Qo'shish")}
          </button>
          <button className="btn ikkinchi kichik" onClick={() => setOchiq(false)}>
            {t('Bekor')}
          </button>
        </div>
      )}
      {xato && <div className="xato-qator">{xato}</div>}
    </section>
  );
}

// ─── Vazifalar ───────────────────────────────────────────────────────────────

function Vazifalar({ k, yozaOladi, onYangi, onOzgardi }: { k: Kartochka; yozaOladi: boolean; onYangi: () => void; onOzgardi: () => Promise<void> }) {
  const { holat, base } = useCrm();
  const t = useT();
  const [xato, setXato] = useState<string | null>(null);
  const [bajarish, setBajarish] = useState<Vazifa | null>(null);
  const ochiq = k.tasks.filter((v) => OCHIQ.has(v.status)).sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
  const yopiq = k.tasks.filter((v) => !OCHIQ.has(v.status)).slice(0, 5);

  const qaytaOch = async (v: Vazifa) => {
    setXato(null);
    try {
      await api.post(`${base}/crm-app/tasks/${v.id}/reopen`, {});
      await onOzgardi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    }
  };

  return (
    <section className="card ci-blok" aria-labelledby="bk-vazifa">
      <div className="ci-blok-bosh">
        <h2 id="bk-vazifa">
          <ListChecks aria-hidden="true" /> {t('Vazifalar')}
        </h2>
        {yozaOladi && (
          <button className="btn ikkinchi kichik" onClick={onYangi}>
            <Plus /> {t('Vazifa')}
          </button>
        )}
      </div>
      {ochiq.length === 0 && bosqichOchiqmi(holat, k.deal.stageId) && (
        <div className="ci-ogoh-qator">{t("Ochiq vazifa yo'q — keyingi qadamni belgilang, bitim unutilib qolmasin.")}</div>
      )}
      <ul className="ci-vazifalar">
        {[...ochiq, ...yopiq].map((v) => {
          const m = OCHIQ.has(v.status) ? muddatHolati(v.dueAt) : null;
          const tur = vazifaTuri(holat, v.taskType);
          return (
            <li key={v.id} className={OCHIQ.has(v.status) ? '' : 'yopiq'}>
              <button
                className="ci-vazifa-belgi"
                onClick={() => (OCHIQ.has(v.status) ? setBajarish(v) : void qaytaOch(v))}
                aria-label={OCHIQ.has(v.status) ? t('Bajarildi deb belgilash') : t('Qayta ochish')}
                aria-pressed={!OCHIQ.has(v.status)}
              >
                {OCHIQ.has(v.status) ? <Circle /> : <CheckCircle2 />}
              </button>
              <div className="ci-vazifa-matn">
                <b>{v.title}</b>
                {v.description && <span>{v.description}</span>}
                {v.result && (
                  <span className="ci-natija">
                    {t('Natija')}: {v.result}
                  </span>
                )}
                <small>
                  {v.taskType && (
                    <span>
                      <span className="ci-nuqta" style={{ background: tur.color }} aria-hidden="true" /> {t(tur.name)}
                    </span>
                  )}
                  {v.dueAt && (
                    <span className={m === 'otgan' ? 'xavf' : m === 'bugun' ? 'ogoh' : ''}>
                      <CalendarClock aria-hidden="true" /> {fmtSana(v.dueAt)}
                    </span>
                  )}
                  {v.seatName && <span>{v.seatName}</span>}
                  {v.source !== 'manual' && (
                    <span className="ci-ai-belgi">
                      <Sparkles aria-hidden="true" /> {t('SotuvAI')}
                    </span>
                  )}
                </small>
              </div>
            </li>
          );
        })}
      </ul>
      {xato && <div className="xato-qator">{xato}</div>}
      {bajarish && (
        <BajarishOyna
          sarlavha={bajarish.title}
          onYop={() => setBajarish(null)}
          onTasdiq={async (natija) => {
            try {
              await api.post(`${base}/crm-app/tasks/${bajarish.id}/complete`, { result: natija });
              setBajarish(null);
              await onOzgardi();
            } catch (e) {
              setBajarish(null);
              setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
            }
          }}
        />
      )}
    </section>
  );
}

function bosqichOchiqmi(holat: ReturnType<typeof useCrm>['holat'], stageId: string): boolean {
  return bosqichTop(holat, stageId)?.kind === 'open';
}

// ─── Tarix lentasi ───────────────────────────────────────────────────────────

type LentaBandi = { tur: 'hodisa'; vaqt: string; h: Hodisa } | { tur: 'qongiroq'; vaqt: string; q: Qongiroq };

function Lenta({ k, maydonNomi, onIzoh }: { k: Kartochka; maydonNomi: Map<string, Maydon>; onIzoh: () => Promise<void> }) {
  const { base, seatlar } = useCrm();
  const t = useT();
  const [matn, setMatn] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [filtr, setFiltr] = useState<'hammasi' | 'izoh' | 'qongiroq'>('hammasi');

  const bandlar = useMemo<LentaBandi[]>(() => {
    const a: LentaBandi[] = [];
    if (filtr !== 'qongiroq') for (const h of k.events) if (filtr === 'hammasi' || h.type === 'note') a.push({ tur: 'hodisa', vaqt: h.createdAt, h });
    if (filtr !== 'izoh') for (const q of k.calls) a.push({ tur: 'qongiroq', vaqt: q.startedAt, q });
    return a.sort((x, y) => y.vaqt.localeCompare(x.vaqt));
  }, [k, filtr]);

  const yubor = async () => {
    if (!matn.trim()) return;
    setBand(true);
    setXato(null);
    try {
      await api.post(`${base}/deals/${k.deal.id}/notes`, { text: matn.trim() });
      setMatn('');
      await onIzoh();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    } finally {
      setBand(false);
    }
  };

  const seatNomi = (id: unknown) => (typeof id === 'string' ? seatlar.find((s) => s.id === id)?.displayName ?? t('xodim') : t('hech kim'));
  const teglar = (v: unknown) => (Array.isArray(v) && v.length ? v.join(', ') : '—');

  const hodisaMatni = (h: Hodisa): string => {
    const d = h.data;
    switch (h.type) {
      case 'created':
        return t('Bitim yaratildi — «{b}»', { b: String(d.stageName ?? '') });
      case 'stage':
        return d.toName
          ? t('Bosqich: «{a}» → «{b}»', { a: String(d.fromName ?? '—'), b: String(d.toName) }) + (d.lostReason ? ` (${String(d.lostReason)})` : '')
          : t('Bosqich o‘zgardi');
      case 'responsible':
        return t("Mas'ul: {a} → {b}", { a: seatNomi(d.before), b: seatNomi(d.after) });
      case 'contact':
        return t('Kontakt o‘zgardi');
      case 'company':
        return t('Kompaniya o‘zgardi');
      case 'tags':
        return t('Teglar: {a} → {b}', { a: teglar(d.before), b: teglar(d.after) });
      case 'task':
        return t('Vazifa qo‘yildi: «{v}»', { v: String(d.title ?? '') }) + (d.dueAt ? ` — ${fmtSana(String(d.dueAt))}` : '');
      case 'task_done':
        return t('Vazifa bajarildi: «{v}»', { v: String(d.title ?? '') }) + (d.result ? ` — ${String(d.result)}` : '');
      case 'task_reopen':
        return t('Vazifa qayta ochildi: «{v}»', { v: String(d.title ?? '') });
      case 'task_reschedule':
        return t('Vazifa muddati ko‘chirildi: «{v}» → {s}', { v: String(d.title ?? ''), s: d.after ? fmtSana(String(d.after)) : t('muddatsiz') });
      case 'deleted':
        return t('Bitim savatga o‘tkazildi');
      case 'restored':
        return t('Bitim savatdan tiklandi');
      case 'inbox':
        return t('Murojaat biriktirildi: {n}', { n: [d.name, d.phone].filter(Boolean).join(', ') || '—' }) + (d.message ? ` — ${String(d.message)}` : '');
      case 'merge':
        return t('Kontaktlar birlashtirildi');
      case 'field': {
        if (d.field === 'name') return t('Nomi: «{a}» → «{b}»', { a: String(d.before ?? ''), b: String(d.after ?? '') });
        if (d.field === 'amount')
          return (
            t('Summa: {a} → {b}', { a: pul(d.before === null ? null : Number(d.before)), b: pul(d.after === null ? null : Number(d.after)) }) +
            (d.auto === 'items' ? ` (${t('tovarlardan')})` : '')
          );
        const m = maydonNomi.get(String(d.fieldId));
        return t('«{m}»: {a} → {b}', { m: m?.label ?? t('Maydon'), a: qiymatMatni(m, d.before, t), b: qiymatMatni(m, d.after, t) });
      }
      default:
        return h.type;
    }
  };

  return (
    <section className="card ci-blok" aria-labelledby="bk-lenta">
      <div className="ci-blok-bosh">
        <h2 id="bk-lenta">
          <History aria-hidden="true" /> {t('Tarix')}
        </h2>
        <div className="tab-qator ci-kichik-tab" role="tablist" aria-label={t('Tarix filtri')}>
          {(
            [
              ['hammasi', 'Hammasi'],
              ['izoh', 'Izohlar'],
              ['qongiroq', "Qo'ng'iroqlar"],
            ] as const
          ).map(([k2, nom]) => (
            <button key={k2} role="tab" aria-selected={filtr === k2} className={`tab${filtr === k2 ? ' active' : ''}`} onClick={() => setFiltr(k2)}>
              {t(nom)}
            </button>
          ))}
        </div>
      </div>

      <div className="ci-izoh-yozish">
        <textarea
          rows={2}
          value={matn}
          maxLength={5000}
          onChange={(e) => setMatn(e.target.value)}
          placeholder={t('Izoh yozing…')}
          aria-label={t('Izoh')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void yubor();
          }}
        />
        <button className="btn kichik" onClick={() => void yubor()} disabled={band || !matn.trim()} aria-keyshortcuts="Control+Enter">
          <Send /> {t('Yuborish')}
        </button>
      </div>
      {xato && <div className="xato-qator">{xato}</div>}

      {k.calls.length === 0 && filtr === 'qongiroq' && (
        <p className="yordam">{t("Bu mijoz bilan SotuvAI orqali qo'ng'iroq hali yo'q. Qo'ng'iroq bo'lsa, tahlili shu yerda o'zi chiqadi.")}</p>
      )}

      <ol className="ci-lenta">
        {bandlar.map((b) =>
          b.tur === 'qongiroq' ? (
            <li key={`q-${b.q.id}`} className="ci-lenta-band qongiroq">
              <span className="ci-lenta-ikon" aria-hidden="true">
                <PhoneCall />
              </span>
              <div className="ci-lenta-matn">
                <div className="ci-lenta-sarlavha">
                  <Link to={`/suhbatlar/${b.q.id}`} className="ci-havola">
                    {b.q.direction === 'outbound' ? t("Chiquvchi qo'ng'iroq") : b.q.direction === 'inbound' ? t("Kiruvchi qo'ng'iroq") : t('Suhbat')}
                  </Link>
                  {b.q.score !== null && <span className={`ball ${ballKlass(b.q.score)} ci-ball`}>{Math.round(b.q.score)}</span>}
                  <span className="yordam">
                    {b.q.seatName ?? ''} · {fmtSoniya(b.q.durationSeconds)}
                  </span>
                </div>
                {b.q.summary && <p>{b.q.summary}</p>}
                <small>{fmtSana(b.q.startedAt)}</small>
              </div>
            </li>
          ) : (
            <li key={b.h.id} className={`ci-lenta-band ${b.h.type}`}>
              <span className="ci-lenta-ikon" aria-hidden="true">
                {b.h.type === 'note' ? (
                  <MessageSquareText />
                ) : b.h.type.startsWith('task') ? (
                  <ListChecks />
                ) : b.h.type === 'restored' ? (
                  <RotateCcw />
                ) : b.h.data.automation ? (
                  <Zap />
                ) : b.h.data.sync ? (
                  <RefreshCw />
                ) : (
                  <History />
                )}
              </span>
              <div className="ci-lenta-matn">
                {b.h.type === 'note' ? <p className="ci-izoh">{String(b.h.data.text ?? '')}</p> : <p>{hodisaMatni(b.h)}</p>}
                <small>
                  {b.h.data.automation
                    ? t('Avtomatika: {n}', { n: String(b.h.data.automation) })
                    : b.h.data.sync
                      ? t('{crm} dan', { crm: String(b.h.data.sync) })
                      : (b.h.authorName ?? t('Tizim'))} · {fmtSana(b.h.createdAt)}
                </small>
              </div>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
