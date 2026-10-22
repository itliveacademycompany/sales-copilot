import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Circle,
  History,
  ListChecks,
  MessageSquareText,
  Phone,
  PhoneCall,
  Plus,
  Send,
  Sparkles,
  Trash2,
  User,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, ballKlass, fmtSana, fmtSoniya } from '../../api';
import {
  bosqichTop,
  guruhla,
  MaydonKiritish,
  mahalliyVaqt,
  muddatHolati,
  pul,
  qiymatMatni,
  qiymatniTayyorla,
  useCrm,
} from '../../crm/malumot';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';
import { YoqotishSababi } from './Bitimlar';

interface Hodisa {
  id: string;
  type: 'created' | 'stage' | 'field' | 'note' | 'responsible' | 'contact';
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
  conversationId: string | null;
  seatId: string | null;
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

interface Kartochka {
  deal: {
    id: string;
    name: string;
    amount: number | null;
    pipelineId: string;
    stageId: string;
    responsibleSeatId: string | null;
    contactId: string | null;
    fields: Record<string, unknown>;
    lostReason: string | null;
    closedAt: string | null;
    version: number;
    createdAt: string;
    stageEnteredAt: string;
  };
  contact: { id: string; name: string | null; phone: string | null; email: string | null; company: string | null } | null;
  responsible: { id: string; name: string } | null;
  events: Hodisa[];
  tasks: Vazifa[];
  calls: Qongiroq[];
}

const OCHIQ = new Set(['pending', 'in_progress', 'blocked']);

/**
 * Bitim kartochkasi. Chapda — asosiy ma'lumot va qo'shimcha maydonlar
 * (bitta "Saqlash" bilan, optimistik qulf bilan); o'ngda — tarix (izoh,
 * bosqich, maydon o'zgarishi va SotuvAI qo'ng'iroqlari bitta lentada),
 * vazifalar.
 */
export function BitimKarta() {
  const { id } = useParams<{ id: string }>();
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [k, setK] = useState<Kartochka | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const [qoralama, setQoralama] = useState<{ name: string; amount: string; responsibleSeatId: string; fields: Record<string, unknown> } | null>(null);
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
        name: qoralama.name.trim() || d.name,
        amount: Number.isFinite(amount as number) || amount === null ? amount : undefined,
        responsibleSeatId: holat.canManageAll ? qoralama.responsibleSeatId || null : undefined,
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

  const kochir = async (stageId: string, lostReason?: string | null) => {
    setXabar(null);
    try {
      await api.post(`${base}/deals/${d.id}/move`, { stageId, lostReason: lostReason ?? null });
      await yukla();
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
                disabled={!yozaOladi || faol}
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
      {d.lostReason && bosqich?.kind === 'lost' && (
        <div className="card ci-sabab-qator">
          <b>{t("Yo'qotish sababi:")}</b> {d.lostReason}
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
                <input id="bk-nom" className="input" value={qoralama.name} maxLength={250} onChange={(e) => setQoralama({ ...qoralama, name: e.target.value })} />
              </div>
              <div className="vr-oyna-ikki">
                <div className="maydon-blok">
                  <label htmlFor="bk-summa">{t('Summa')}</label>
                  <input
                    id="bk-summa"
                    className="input"
                    inputMode="decimal"
                    value={qoralama.amount}
                    onChange={(e) => setQoralama({ ...qoralama, amount: e.target.value.replace(/[^\d.,\s]/g, '') })}
                  />
                </div>
                <div className="maydon-blok">
                  <label htmlFor="bk-masul">{t("Mas'ul")}</label>
                  {holat.canManageAll ? (
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
                  {k.contact.phone && (
                    <span className="yordam">
                      <Phone aria-hidden="true" /> {k.contact.phone}
                    </span>
                  )}
                  {k.contact.email && <span className="yordam">{k.contact.email}</span>}
                </span>
              </Link>
            ) : (
              <p className="yordam">{t("Kontakt biriktirilmagan.")}</p>
            )}
          </section>

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
                    <MaydonKiritish
                      id={`bk-${m.id}`}
                      m={m}
                      qiymat={qoralama.fields[m.id]}
                      onChange={(v) => setQoralama({ ...qoralama, fields: { ...qoralama.fields, [m.id]: v } })}
                    />
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
      {vazifaOyna && <YangiVazifa dealId={d.id} onYop={() => setVazifaOyna(false)} onSaqlandi={yukla} />}
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
                {t("O'chirish")}
              </button>
            </>
          }
        >
          <p>{t('«{n}» bitimi o‘chiriladi. Kontakt va qo‘ng‘iroqlar saqlanib qoladi.', { n: d.name })}</p>
        </Oyna>
      )}
    </div>
  );
}

// ─── Vazifalar ───────────────────────────────────────────────────────────────

function Vazifalar({ k, yozaOladi, onYangi, onOzgardi }: { k: Kartochka; yozaOladi: boolean; onYangi: () => void; onOzgardi: () => Promise<void> }) {
  const { base } = useCrm();
  const t = useT();
  const [xato, setXato] = useState<string | null>(null);
  const ochiq = k.tasks.filter((v) => OCHIQ.has(v.status)).sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
  const yopiq = k.tasks.filter((v) => !OCHIQ.has(v.status)).slice(0, 5);

  const bajarildi = async (v: Vazifa) => {
    setXato(null);
    try {
      await api.patch(`${base}/tasks/${v.id}`, { status: OCHIQ.has(v.status) ? 'done' : 'pending' });
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
      {ochiq.length === 0 && (
        <div className="ci-ogoh-qator">
          {t("Ochiq vazifa yo'q — keyingi qadamni belgilang, bitim unutilib qolmasin.")}
        </div>
      )}
      <ul className="ci-vazifalar">
        {[...ochiq, ...yopiq].map((v) => {
          const m = OCHIQ.has(v.status) ? muddatHolati(v.dueAt) : null;
          return (
            <li key={v.id} className={OCHIQ.has(v.status) ? '' : 'yopiq'}>
              <button
                className="ci-vazifa-belgi"
                onClick={() => void bajarildi(v)}
                aria-label={OCHIQ.has(v.status) ? t('Bajarildi deb belgilash') : t('Qayta ochish')}
                aria-pressed={!OCHIQ.has(v.status)}
              >
                {OCHIQ.has(v.status) ? <Circle /> : <CheckCircle2 />}
              </button>
              <div className="ci-vazifa-matn">
                <b>{v.title}</b>
                {v.description && <span>{v.description}</span>}
                <small>
                  {v.dueAt && (
                    <span className={m === 'otgan' ? 'xavf' : m === 'bugun' ? 'ogoh' : ''}>
                      <CalendarClock aria-hidden="true" /> {fmtSana(v.dueAt)}
                    </span>
                  )}
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
    </section>
  );
}

function YangiVazifa({ dealId, onYop, onSaqlandi }: { dealId: string; onYop: () => void; onSaqlandi: () => Promise<void> }) {
  const { base } = useCrm();
  const t = useT();
  const ertaga = new Date();
  ertaga.setDate(ertaga.getDate() + 1);
  ertaga.setHours(10, 0, 0, 0);
  const [nom, setNom] = useState('');
  const [muddat, setMuddat] = useState(mahalliyVaqt(ertaga.toISOString()));
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const saqla = async () => {
    if (!nom.trim()) {
      setXato(t('Vazifa matnini kiriting'));
      return;
    }
    setBand(true);
    try {
      await api.post(`${base}/deals/${dealId}/tasks`, {
        title: nom.trim(),
        description: izoh.trim() || null,
        dueAt: muddat ? new Date(muddat).toISOString() : null,
      });
      await onSaqlandi();
      onYop();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
      setBand(false);
    }
  };

  const tez = (kun: number) => {
    const d = new Date();
    d.setDate(d.getDate() + kun);
    d.setHours(kun === 0 ? Math.min(d.getHours() + 2, 20) : 10, 0, 0, 0);
    setMuddat(mahalliyVaqt(d.toISOString()));
  };

  return (
    <Oyna
      sarlavha={t('Yangi vazifa')}
      onYop={onYop}
      onSubmit={() => void saqla()}
      past={
        <>
          <button type="button" className="btn ikkinchi" onClick={onYop}>
            {t('Bekor')}
          </button>
          <button type="submit" className="btn" disabled={band}>
            {band ? t('Saqlanmoqda…') : t('Qo‘shish')}
          </button>
        </>
      }
    >
      <div className="maydon-blok">
        <label htmlFor="yv-nom">{t('Nima qilish kerak')}</label>
        <input id="yv-nom" className="input" value={nom} maxLength={300} onChange={(e) => setNom(e.target.value)} placeholder={t("Masalan: qayta qo'ng'iroq qilish")} />
      </div>
      <div className="maydon-blok">
        <label htmlFor="yv-muddat">{t('Muddat')}</label>
        <input id="yv-muddat" className="input" type="datetime-local" value={muddat} onChange={(e) => setMuddat(e.target.value)} />
        <div className="ci-tez">
          <button type="button" className="ci-chip" onClick={() => tez(0)}>
            {t('Bugun')}
          </button>
          <button type="button" className="ci-chip" onClick={() => tez(1)}>
            {t('Ertaga')}
          </button>
          <button type="button" className="ci-chip" onClick={() => tez(7)}>
            {t('Bir haftadan keyin')}
          </button>
        </div>
      </div>
      <div className="maydon-blok">
        <label htmlFor="yv-izoh">{t('Izoh (ixtiyoriy)')}</label>
        <textarea id="yv-izoh" rows={2} maxLength={2000} value={izoh} onChange={(e) => setIzoh(e.target.value)} />
      </div>
      {xato && (
        <div className="xato-qator" role="alert">
          {xato}
        </div>
      )}
    </Oyna>
  );
}

// ─── Tarix lentasi ───────────────────────────────────────────────────────────

type LentaBandi =
  | { tur: 'hodisa'; vaqt: string; h: Hodisa }
  | { tur: 'qongiroq'; vaqt: string; q: Qongiroq };

function Lenta({ k, maydonNomi, onIzoh }: { k: Kartochka; maydonNomi: Map<string, ReturnType<typeof useCrm>['holat']['fields'][number]>; onIzoh: () => Promise<void> }) {
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
      case 'field': {
        if (d.field === 'name') return t('Nomi: «{a}» → «{b}»', { a: String(d.before ?? ''), b: String(d.after ?? '') });
        if (d.field === 'amount') return t('Summa: {a} → {b}', { a: pul(d.before === null ? null : Number(d.before)), b: pul(d.after === null ? null : Number(d.after)) });
        const m = maydonNomi.get(String(d.fieldId));
        return t('«{m}»: {a} → {b}', { m: m?.label ?? t('Maydon'), a: qiymatMatni(m, d.before, t), b: qiymatMatni(m, d.after, t) });
      }
      default:
        return '';
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
                {b.h.type === 'note' ? <MessageSquareText /> : <History />}
              </span>
              <div className="ci-lenta-matn">
                {b.h.type === 'note' ? <p className="ci-izoh">{String(b.h.data.text ?? '')}</p> : <p>{hodisaMatni(b.h)}</p>}
                <small>
                  {b.h.authorName ?? t('Tizim')} · {fmtSana(b.h.createdAt)}
                </small>
              </div>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}
