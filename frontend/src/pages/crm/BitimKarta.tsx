import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Circle,
  CircleCheck,
  Copy,
  ExternalLink,
  FileText,
  History,
  ListChecks,
  MessageSquareText,
  Package,
  PhoneCall,
  PhoneIncoming,
  PhoneOutgoing,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Sparkles,
  Tag,
  Trash2,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, ballKlass, fmtQachon, fmtSoniya } from '../../api';
import { AudioPleyer } from '../../components/AudioPleyer';
import { BajarishOyna, TeglarKiritish } from '../../crm/komponentlar';
import {
  bosqichTop,
  MaydonKiritish,
  muddatHolati,
  pul,
  qiymatMatni,
  qiymatniTayyorla,
  useCrm,
  vazifaTuri,
  type CrmHolat,
  type Maydon,
} from '../../crm/malumot';
import { MuddatTanlash, muddatMatni } from '../../crm/MuddatTanlash';
import { Oyna } from '../../crm/Oyna';
import { useT } from '../../i18n';
import { sanaVaqt, YoqotishSababi } from './Bitimlar';

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

interface MijozProfili {
  name: string | null;
  company: string | null;
  role: string | null;
  isDecisionMaker: boolean | null;
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
  mediaUrl: string | null;
  mediaKind: string | null;
  primaryGap: string | null;
  callFamily: string | null;
  serviceLine: string | null;
  clientExtracted: MijozProfili | null;
  dealInfo: { amount: number | null; currency: string | null; stage: string | null } | null;
  signals: { urgency: string | null; budgetReaction: string | null; objections: string[] } | null;
}

interface TovarQatori {
  id: string;
  productId: string | null;
  name: string;
  price: number;
  quantity: number;
  discount: number;
}

interface Forma {
  id: string;
  source: string;
  sourceName: string | null;
  createdAt: string;
  answers: { label: string; value: string }[];
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
  forms?: Forma[];
}

interface Qoralama {
  name: string;
  amount: string;
  responsibleSeatId: string;
  companyId: string;
  tags: string[];
  fields: Record<string, unknown>;
}

const OCHIQ = new Set(['pending', 'in_progress', 'blocked']);
/** "Barcha maydonlarni ko'rsatish" bosilmaguncha ko'rinadigan qo'shimcha maydonlar soni. */
const KORINADIGAN_MAYDON = 6;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID (BITIM) KARTASI — Metasell uslubi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Tepada: orqaga · voronka tablari (bosilsa lid o'sha voronkaga o'tadi) ·
 * bosqich lentasi · nom va AI xulosa. Chapda: ID va teglar, maydonlar
 * (joyida tahrirlanadi, bitta "Saqlash"), forma javoblari, kontakt,
 * kompaniya, tovarlar. O'ngda: kunlar bo'yicha tarix (qo'ng'iroq audiosi va
 * AI tahlili bilan), AI'ning maydon to'ldirish takliflari, qadalgan ochiq
 * vazifalar va Izoh / Vazifa yozish maydoni.
 */
export function BitimKarta() {
  const { id } = useParams<{ id: string }>();
  const { holat, base } = useCrm();
  const t = useT();
  const navigate = useNavigate();
  const [k, setK] = useState<Kartochka | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const [xabar, setXabar] = useState<{ ok: boolean; matn: string } | null>(null);
  const [qoralama, setQoralamaXom] = useState<Qoralama | null>(null);
  // Metasell'dagidek avtomatik saqlash: har tahrir hisoblanadi — saqlash
  // davomida yangi tahrir bo'lsa, serverdan kelgan javob qoralamani bosib ketmaydi.
  const tahrirlar = useRef(0);
  const setQoralama = useCallback((q: Qoralama) => {
    tahrirlar.current += 1;
    setQoralamaXom(q);
  }, []);
  const [avtoHolat, setAvtoHolat] = useState<'saqlanmoqda' | 'saqlandi' | null>(null);
  const saqlaRef = useRef<(() => Promise<void>) | null>(null);
  const [band, setBand] = useState(false);
  const [yoqotish, setYoqotish] = useState<string | null>(null);
  const [ochirish, setOchirish] = useState(false);
  const [chapYopiq, setChapYopiq] = useState(false);

  const yukla = useCallback(async () => {
    try {
      const r = await api.get<Kartochka>(`${base}/deals/${id}`);
      setK(r);
      setQoralamaXom({
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

  // Avtomatik saqlash: o'zgarish bo'lsa va foydalanuvchi matn yozib turmagan
  // bo'lsa (fokus matn maydonidan chiqqan) — o'zi saqlanadi.
  const yozaOladiAvto = Boolean(k && (holat.canManageAll || k.deal.responsibleSeatId === holat.seatId));
  useEffect(() => {
    if (!ozgargan || !yozaOladiAvto) return;
    let taymer = 0;
    const tekshir = () => {
      const a = document.activeElement as HTMLElement | null;
      const yozmoqda =
        a &&
        a.closest('.ms-bk') &&
        (a.tagName === 'TEXTAREA' || (a.tagName === 'INPUT' && !['checkbox', 'radio'].includes((a as HTMLInputElement).type)));
      if (yozmoqda) {
        taymer = window.setTimeout(tekshir, 700);
        return;
      }
      void saqlaRef.current?.();
    };
    taymer = window.setTimeout(tekshir, 500);
    return () => window.clearTimeout(taymer);
  }, [qoralama, ozgargan, yozaOladiAvto]);

  if (xato && !k) {
    return (
      <div className="ci-sahifa">
        <Link to="/crm/bitimlar" className="ci-orqaga">
          <ArrowLeft /> {t('Lidlar')}
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
  // amoCRM dan sinxronlanadi: nom, summa, bosqich, mas'ul va amoCRM maydonlari faqat o'qiladi
  const sinx = k.sync;
  const tovarli = k.items.length > 0;
  // Sarlavha ostidagi AI xulosa — eng oxirgi tahlil qilingan qo'ng'iroqdan
  const oxirgiTahlil = k.calls.find((c) => c.summary);

  const saqla = async () => {
    if (band) return;
    setBand(true);
    setXabar(null);
    setAvtoHolat('saqlanmoqda');
    const boshlanish = tahrirlar.current;
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
      const r = await api.get<Kartochka>(`${base}/deals/${d.id}`);
      setK(r);
      // Saqlash paytida yangi tahrir bo'lmagan bo'lsa — qoralama serverdagi holatga tenglashadi
      if (tahrirlar.current === boshlanish) {
        setQoralamaXom({
          name: r.deal.name,
          amount: r.deal.amount === null ? '' : String(r.deal.amount),
          responsibleSeatId: r.deal.responsibleSeatId ?? '',
          companyId: r.deal.companyId ?? '',
          tags: r.deal.tags ?? [],
          fields: { ...r.deal.fields },
        });
      }
      setAvtoHolat('saqlandi');
    } catch (e) {
      setAvtoHolat(null);
      setXabar({ ok: false, matn: e instanceof ApiError ? t(e.message) : t('Saqlanmadi') });
      if (e instanceof ApiError && e.status === 409) await yukla();
    } finally {
      setBand(false);
    }
  };
  saqlaRef.current = saqla;

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

  /** Boshqa voronkaga o'tkazish — o'sha voronkaning birinchi ochiq bosqichiga. */
  const voronkaga = (pipelineId: string) => {
    const v = holat.pipelines.find((p) => p.id === pipelineId);
    const birinchi = v?.stages.find((s) => s.kind === 'open') ?? v?.stages[0];
    if (birinchi) void kochir(birinchi.id);
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
    <div className="ci-sahifa ms-bk">
      <section className="ms-bk-bosh">
        <div className="ms-bk-tepa">
          <Link to={`/crm/bitimlar?v=${d.pipelineId}`} className="ms-ikon-tugma" aria-label={t('Orqaga')} title={t('Orqaga')}>
            <ArrowLeft />
          </Link>
          <nav className="ms-bk-voronkalar" aria-label={t('Voronkalar')}>
            {holat.pipelines.map((p) => (
              <button
                key={p.id}
                type="button"
                className={p.id === d.pipelineId ? 'faol' : undefined}
                aria-current={p.id === d.pipelineId ? 'true' : undefined}
                disabled={p.id === d.pipelineId || !yozaOladi || Boolean(sinx)}
                onClick={() => voronkaga(p.id)}
                title={p.id === d.pipelineId ? undefined : t('Lidni «{v}» voronkasiga o‘tkazish', { v: p.name })}
              >
                {p.name}
              </button>
            ))}
          </nav>
          {yozaOladi && (
            <button type="button" className="ms-ikon-tugma ms-bk-ochir" onClick={() => setOchirish(true)} aria-label={t("Lidni o'chirish")} title={t("Lidni o'chirish")}>
              <Trash2 />
            </button>
          )}
        </div>

        {voronka && <BosqichLenta voronka={voronka} joriyId={d.stageId} yoqilgan={yozaOladi && !sinx} onTanla={(s) => (s.kind === 'lost' ? setYoqotish(s.id) : void kochir(s.id))} />}

        <div className="ms-bk-sarlavha">
          <input
            className="ms-bk-nom"
            value={qoralama.name}
            maxLength={250}
            readOnly={!yozaOladi || Boolean(sinx)}
            onChange={(e) => setQoralama({ ...qoralama, name: e.target.value })}
            aria-label={t('Lid nomi')}
          />
          {oxirgiTahlil?.summary && <p className="ms-bk-xulosa">{oxirgiTahlil.summary}</p>}
        </div>
      </section>

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

      <div className={`ms-bk-ish${chapYopiq ? ' chap-yopiq' : ''}`}>
        {!chapYopiq && (
          <aside className="ms-bk-chap">
            <section className="ms-blok">
              <IdQatori k={k} voronkaNomi={voronka?.name ?? ''} qoralama={qoralama} setQoralama={setQoralama} yozaOladi={yozaOladi} />
              <Maydonlar k={k} qoralama={qoralama} setQoralama={setQoralama} yozaOladi={yozaOladi} />
              {yozaOladi && (ozgargan || avtoHolat) && (
                <div className={`ms-avto-holat${avtoHolat === 'saqlandi' && !ozgargan ? ' ok' : ''}`} role="status">
                  {band || avtoHolat === 'saqlanmoqda' ? (
                    t('Saqlanmoqda…')
                  ) : ozgargan ? (
                    t('Tahrirlanmoqda — maydondan chiqqach saqlanadi')
                  ) : (
                    <>
                      <Check aria-hidden="true" /> {t('Saqlandi')}
                    </>
                  )}
                </div>
              )}
            </section>
            {(k.forms?.length ?? 0) > 0 && <FormaJavoblari formalar={k.forms!} />}
            <KontaktBlok k={k} />
            <KompaniyaBlok k={k} qiymat={qoralama.companyId} yozaOladi={yozaOladi} onChange={(companyId) => setQoralama({ ...qoralama, companyId })} />
            <Tovarlar dealId={d.id} items={k.items} yozaOladi={yozaOladi && !sinx} onOzgardi={yukla} />
          </aside>
        )}

        <section className="ms-bk-ong" aria-label={t('Lid tarixi')}>
          <Lenta k={k} yozaOladi={yozaOladi} chapYopiq={chapYopiq} onChapAlmashtir={() => setChapYopiq((v) => !v)} onOzgardi={yukla} />
        </section>
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
      {ochirish && (
        <Oyna
          sarlavha={t("Lidni o'chirish")}
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

// ─── Bosqich lentasi ─────────────────────────────────────────────────────────

/** O'q shaklidagi bosqichlar: o'tganlari ✓, joriysi bosqich rangida; bosilsa ko'chadi. */
function BosqichLenta({
  voronka,
  joriyId,
  yoqilgan,
  onTanla,
}: {
  voronka: CrmHolat['pipelines'][number];
  joriyId: string;
  yoqilgan: boolean;
  onTanla: (s: CrmHolat['pipelines'][number]['stages'][number]) => void;
}) {
  const t = useT();
  const joriy = voronka.stages.find((s) => s.id === joriyId);
  return (
    <div className="ms-lenta-bosqich" role="group" aria-label={t('Bosqichga o‘tkazish')}>
      {voronka.stages.map((s) => {
        const faol = s.id === joriyId;
        const otgan = !faol && joriy && s.kind === 'open' && s.sort < joriy.sort;
        return (
          <button
            key={s.id}
            type="button"
            disabled={!yoqilgan || faol}
            aria-current={faol ? 'step' : undefined}
            className={`ms-qadam ${s.kind}${faol ? ' faol' : ''}${otgan ? ' otgan' : ''}`}
            style={{ ['--bosqich' as string]: s.color }}
            onClick={() => onTanla(s)}
            title={s.name}
          >
            {otgan ? <Check aria-label={s.name} /> : <span>{s.name}</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── Chap ustun ──────────────────────────────────────────────────────────────

function IdQatori({
  k,
  voronkaNomi,
  qoralama,
  setQoralama,
  yozaOladi,
}: {
  k: Kartochka;
  voronkaNomi: string;
  qoralama: Qoralama;
  setQoralama: (q: Qoralama) => void;
  yozaOladi: boolean;
}) {
  const t = useT();
  const [tegOchiq, setTegOchiq] = useState(false);
  const [nusxa, setNusxa] = useState(false);
  const d = k.deal;
  const nusxala = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/crm/bitimlar/${d.id}`);
      setNusxa(true);
      setTimeout(() => setNusxa(false), 1500);
    } catch {
      /* clipboard yopiq — jim */
    }
  };
  return (
    <>
      <div className="ms-id-qator">
        <span className="ms-id" title={d.id}>
          #{d.id.slice(0, 8).toUpperCase()} · {voronkaNomi}
        </span>
        <button type="button" className="ms-mini-tugma" onClick={() => void nusxala()} aria-label={t('Havolani nusxalash')} title={t('Havolani nusxalash')}>
          {nusxa ? <Check /> : <Copy />}
        </button>
        {d.source && <span className="ms-manba-teg">{t(d.source)}</span>}
        {qoralama.tags.map((tg) => (
          <span key={tg} className="ms-teg">
            {tg}
            {yozaOladi && (
              <button type="button" onClick={() => setQoralama({ ...qoralama, tags: qoralama.tags.filter((x) => x !== tg) })} aria-label={t('Tegni olib tashlash')}>
                <X />
              </button>
            )}
          </span>
        ))}
        {yozaOladi && (
          <button type="button" className="ms-teg-qosh" onClick={() => setTegOchiq((v) => !v)} aria-expanded={tegOchiq}>
            <Plus aria-hidden="true" /> {t("Teg qo'shish")}
          </button>
        )}
      </div>
      {tegOchiq && (
        <div className="ms-teg-kiritish">
          <TeglarKiritish id="bk-teg" qiymat={qoralama.tags} onChange={(tags) => setQoralama({ ...qoralama, tags })} />
        </div>
      )}
    </>
  );
}

function Maydonlar({
  k,
  qoralama,
  setQoralama,
  yozaOladi,
}: {
  k: Kartochka;
  qoralama: Qoralama;
  setQoralama: (q: Qoralama) => void;
  yozaOladi: boolean;
}) {
  const { holat, seatlar } = useCrm();
  const t = useT();
  const [hammasi, setHammasi] = useState(false);
  const sinx = k.sync;
  const tovarli = k.items.length > 0;
  // To'ldirilganlari va majburiylari tepada — ko'rinadigan qismga muhimi tushsin
  const tartiblangan = [...holat.fields].sort((a, b) => {
    const ta = Number(qoralama.fields[a.id] != null && qoralama.fields[a.id] !== '') + Number(a.required);
    const tb = Number(qoralama.fields[b.id] != null && qoralama.fields[b.id] !== '') + Number(b.required);
    return tb - ta || a.sort - b.sort;
  });
  const korinadi = hammasi ? tartiblangan : tartiblangan.slice(0, KORINADIGAN_MAYDON);
  const yashirin = tartiblangan.length - korinadi.length;

  return (
    <fieldset disabled={!yozaOladi} className="ms-maydonlar">
      <div className="ms-maydon">
        <label htmlFor="bk-masul">{t("Mas'ul xodim")}</label>
        {holat.canManageAll && !sinx ? (
          <select id="bk-masul" className="input" value={qoralama.responsibleSeatId} onChange={(e) => setQoralama({ ...qoralama, responsibleSeatId: e.target.value })}>
            <option value="">···</option>
            {seatlar.map((s) => (
              <option key={s.id} value={s.id}>
                {s.displayName}
              </option>
            ))}
            {k.responsible && !seatlar.some((s) => s.id === k.responsible!.id) && <option value={k.responsible.id}>{k.responsible.name}</option>}
          </select>
        ) : (
          <span className="ms-maydon-qiymat">{k.responsible?.name ?? '—'}</span>
        )}
      </div>
      <div className="ms-maydon">
        <label htmlFor="bk-summa">{t('Summa')}</label>
        <input
          id="bk-summa"
          className="input"
          inputMode="decimal"
          value={qoralama.amount}
          placeholder="···"
          readOnly={tovarli || Boolean(sinx)}
          title={tovarli ? t('Summa tovarlardan hisoblanadi') : undefined}
          onChange={(e) => setQoralama({ ...qoralama, amount: e.target.value.replace(/[^\d.,\s]/g, '') })}
        />
      </div>
      {korinadi.map((m) => (
        <div className="ms-maydon" key={m.id}>
          <label htmlFor={`bk-${m.id}`} title={m.label}>
            {m.label}
            {m.required && <span className="ci-majburiy"> *</span>}
          </label>
          {sinx && m.external ? (
            <span className="ms-maydon-qiymat" title={t('{crm} da o‘zgartiriladi', { crm: sinx })}>
              {qiymatMatni(m, qoralama.fields[m.id], t)}
            </span>
          ) : (
            <MaydonKiritish ixcham id={`bk-${m.id}`} m={m} qiymat={qoralama.fields[m.id]} onChange={(v) => setQoralama({ ...qoralama, fields: { ...qoralama.fields, [m.id]: v } })} />
          )}
        </div>
      ))}
      {tartiblangan.length > KORINADIGAN_MAYDON && (
        <button type="button" className="ms-hammasi" onClick={() => setHammasi((v) => !v)} aria-expanded={hammasi}>
          {hammasi ? t('Kamroq ko‘rsatish') : t("Barcha maydonlarni ko'rsatish")} {!hammasi && <span>{yashirin}</span>}
          <ChevronDown className={hammasi ? 'aylangan' : undefined} aria-hidden="true" />
        </button>
      )}
    </fieldset>
  );
}

function FormaJavoblari({ formalar }: { formalar: Forma[] }) {
  const t = useT();
  const manba = { call: "Qo'ng'iroq", form: 'Forma', manual: "Qo'lda" } as Record<string, string>;
  return (
    <>
      {formalar.map((f) => (
        <section className="ms-blok" key={f.id}>
          <header className="ms-blok-bosh">
            <h2>{t('Forma javoblari')}</h2>
            <span className="ms-manba-teg">{f.sourceName ?? t(manba[f.source] ?? f.source)}</span>
            <time className="ms-blok-vaqt">{sanaVaqt(f.createdAt).slice(-5)}</time>
          </header>
          {f.answers.length === 0 ? (
            <p className="yordam">{t("Javoblar yo'q")}</p>
          ) : (
            <dl className="ms-javoblar">
              {f.answers.map((a, i) => (
                <div key={i}>
                  <dt>{a.label}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>
          )}
        </section>
      ))}
    </>
  );
}

function boshHarflar(nom: string | null | undefined): string {
  const s = (nom ?? '').trim();
  if (!s) return '•';
  const q = s.split(/\s+/);
  return ((q[0]?.[0] ?? '') + (q[1]?.[0] ?? '')).toUpperCase() || '•';
}

function KontaktBlok({ k }: { k: Kartochka }) {
  const t = useT();
  const c = k.contact;
  return (
    <section className="ms-blok">
      <header className="ms-blok-bosh">
        <h2>{t('Kontaktlar')}</h2>
      </header>
      {c ? (
        <Link to={`/crm/kontaktlar/${c.id}`} className="ms-kontakt">
          <span className="ms-avatar">{boshHarflar(c.name ?? c.phone)}</span>
          <span className="ms-kontakt-matn">
            <b>
              {c.name ?? t('Ismsiz')} <span className="ms-asosiy-belgi">{t('Asosiy')}</span>
            </b>
            {[c.phone, ...(c.phones ?? [])].filter(Boolean).map((p) => (
              <span key={p} className="ms-kontakt-tel">
                {p}
              </span>
            ))}
            {c.role && <span className="yordam">{c.role}</span>}
          </span>
          <ArrowRight className="ms-kontakt-strelka" aria-hidden="true" />
        </Link>
      ) : (
        <p className="yordam">{t('Kontakt biriktirilmagan.')}</p>
      )}
    </section>
  );
}

function KompaniyaBlok({ k, qiymat, yozaOladi, onChange }: { k: Kartochka; qiymat: string; yozaOladi: boolean; onChange: (id: string) => void }) {
  const t = useT();
  const [tanlash, setTanlash] = useState(false);
  if (!qiymat && !tanlash) {
    if (!yozaOladi) return null;
    return (
      <button type="button" className="ms-blok ms-biriktir" onClick={() => setTanlash(true)}>
        <Plus aria-hidden="true" /> {t('Kompaniya biriktirish')}
      </button>
    );
  }
  return (
    <section className="ms-blok">
      <header className="ms-blok-bosh">
        <h2>
          <Building2 aria-hidden="true" /> {t('Kompaniya')}
        </h2>
      </header>
      <fieldset disabled={!yozaOladi} className="ci-fieldset">
        <KompaniyaTanlash qiymat={qiymat} joriy={k.company} onChange={onChange} />
      </fieldset>
    </section>
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
      .then((r) => setRoyxat(joriy && !r.items.some((x) => x.id === joriy.id) ? [joriy, ...r.items] : r.items))
      .catch(() => undefined);
  }, [base, joriy]);
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

  return yangi ? (
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
      <select className="input" value={qiymat} onChange={(e) => onChange(e.target.value)} aria-label={t('Kompaniya')}>
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
  if (items.length === 0 && !ochiq) {
    return (
      <button type="button" className="ms-blok ms-biriktir" onClick={() => setOchiq(true)}>
        <Package aria-hidden="true" /> {t("Tovar yoki xizmat qo'shish")}
      </button>
    );
  }
  return (
    <section className="ms-blok" aria-labelledby="bk-tovar">
      <header className="ms-blok-bosh">
        <h2 id="bk-tovar">
          <Package aria-hidden="true" /> {t('Tovarlar va xizmatlar')}
        </h2>
        {yozaOladi && !ochiq && (
          <button className="ms-mini-tugma" onClick={() => setOchiq(true)} aria-label={t("Tovar qo'shish")} title={t("Tovar qo'shish")}>
            <Plus />
          </button>
        )}
      </header>
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

// ─── Tarix lentasi ───────────────────────────────────────────────────────────

const HAFTA_KUNLARI = ['Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba'];
const OY_NOMLARI = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];

type LentaBandi = { tur: 'hodisa'; vaqt: string; h: Hodisa } | { tur: 'qongiroq'; vaqt: string; q: Qongiroq };
type LentaFiltr = 'hammasi' | 'izoh' | 'qongiroq' | 'vazifa' | 'bosqich';

function Lenta({
  k,
  yozaOladi,
  chapYopiq,
  onChapAlmashtir,
  onOzgardi,
}: {
  k: Kartochka;
  yozaOladi: boolean;
  chapYopiq: boolean;
  onChapAlmashtir: () => void;
  onOzgardi: () => Promise<void>;
}) {
  const t = useT();
  const [filtr, setFiltr] = useState<LentaFiltr>('hammasi');
  const [qidiruvOchiq, setQidiruvOchiq] = useState(false);
  const [qidiruv, setQidiruv] = useState('');
  const pastRef = useRef<HTMLDivElement>(null);

  const bandlar = useMemo<LentaBandi[]>(() => {
    const a: LentaBandi[] = [];
    for (const h of k.events) {
      if (filtr === 'izoh' && h.type !== 'note') continue;
      if (filtr === 'vazifa' && !h.type.startsWith('task')) continue;
      if (filtr === 'bosqich' && h.type !== 'stage' && h.type !== 'created') continue;
      if (filtr === 'qongiroq') continue;
      a.push({ tur: 'hodisa', vaqt: h.createdAt, h });
    }
    if (filtr === 'hammasi' || filtr === 'qongiroq') for (const q of k.calls) a.push({ tur: 'qongiroq', vaqt: q.startedAt, q });
    const s = qidiruv.trim().toLowerCase();
    const mos = s
      ? a.filter((b) =>
          (b.tur === 'qongiroq' ? [b.q.summary, b.q.seatName] : [JSON.stringify(b.h.data), b.h.authorName]).some((x) => (x ?? '').toLowerCase().includes(s)),
        )
      : a;
    // Metasell'dagidek eskisi tepada, eng yangisi pastda (yozish maydoniga yaqin)
    return mos.sort((x, y) => x.vaqt.localeCompare(y.vaqt));
  }, [k, filtr, qidiruv]);

  // Kunlar bo'yicha guruhlash
  const kunlar = useMemo(() => {
    const g: { kalit: string; sana: Date; bandlar: LentaBandi[] }[] = [];
    for (const b of bandlar) {
      const d = new Date(b.vaqt);
      const kalit = d.toDateString();
      const oxirgi = g[g.length - 1];
      if (oxirgi && oxirgi.kalit === kalit) oxirgi.bandlar.push(b);
      else g.push({ kalit, sana: d, bandlar: [b] });
    }
    return g;
  }, [bandlar]);

  // Ochilganda va yangi hodisa qo'shilganda pastga (eng yangisiga) aylantirish
  useEffect(() => {
    pastRef.current?.scrollIntoView({ block: 'end' });
  }, [k.events.length, k.calls.length]);

  const kunNomi = (d: Date) => {
    const bugun = new Date();
    const kecha = new Date();
    kecha.setDate(bugun.getDate() - 1);
    if (d.toDateString() === bugun.toDateString()) return t('Bugun');
    if (d.toDateString() === kecha.toDateString()) return t('Kecha');
    return `${d.getDate()} ${t(OY_NOMLARI[d.getMonth()]!)}`;
  };
  const p2 = (n: number) => String(n).padStart(2, '0');
  const kunChipi = (d: Date) => `${t(HAFTA_KUNLARI[d.getDay()]!)}, ${p2(d.getDate())}.${p2(d.getMonth() + 1)}.${d.getFullYear()}`;
  // AI maydon takliflari eng oxirgi tahlil qilingan qo'ng'iroq ostida chiqadi
  const takliflarQongirogi = k.calls.find((c) => c.clientExtracted || c.dealInfo)?.id;

  return (
    <div className="ms-lenta-qobiq">
      <div className="ms-lenta-asboblar">
        <button type="button" className="ms-ikon-tugma" onClick={onChapAlmashtir} aria-label={chapYopiq ? t("Ma'lumotlarni ko'rsatish") : t("Ma'lumotlarni yashirish")} title={chapYopiq ? t("Ma'lumotlarni ko'rsatish") : t("Ma'lumotlarni yashirish")}>
          {chapYopiq ? <ChevronsRight /> : <ChevronsLeft />}
        </button>
        {qidiruvOchiq ? (
          <label className="ms-qidiruv ms-lenta-qidiruv">
            <Search aria-hidden="true" />
            <input value={qidiruv} onChange={(e) => setQidiruv(e.target.value)} placeholder={t('Tarixdan qidirish')} aria-label={t('Tarixdan qidirish')} autoFocus />
            <button
              type="button"
              className="ms-mini-tugma"
              onClick={() => {
                setQidiruv('');
                setQidiruvOchiq(false);
              }}
              aria-label={t('Yopish')}
            >
              <X />
            </button>
          </label>
        ) : (
          <div className="ms-lenta-filtr" role="tablist" aria-label={t('Tarix filtri')}>
            {(
              [
                ['hammasi', 'Hammasi'],
                ['izoh', 'Izohlar'],
                ['qongiroq', "Qo'ng'iroqlar"],
                ['vazifa', 'Vazifalar'],
                ['bosqich', 'Bosqichlar'],
              ] as const
            ).map(([kalit, nom]) => (
              <button key={kalit} role="tab" type="button" aria-selected={filtr === kalit} className={filtr === kalit ? 'faol' : undefined} onClick={() => setFiltr(kalit)}>
                {t(nom)}
              </button>
            ))}
          </div>
        )}
        {!qidiruvOchiq && (
          <button type="button" className="ms-ikon-tugma" onClick={() => setQidiruvOchiq(true)} aria-label={t('Tarixdan qidirish')} title={t('Tarixdan qidirish')}>
            <Search />
          </button>
        )}
      </div>

      <div className="ms-lenta">
        {kunlar.length === 0 && <p className="ms-lenta-bosh">{qidiruv ? t('Hech narsa topilmadi') : t("Hali hodisa yo'q")}</p>}
        {kunlar.map((g) => (
          <div key={g.kalit} className="ms-kun">
            <div className="ms-kun-bosh">
              <b>{kunNomi(g.sana)}</b>
              <span className="ms-kun-chip">{kunChipi(g.sana)}</span>
            </div>
            {g.bandlar.map((b) =>
              b.tur === 'qongiroq' ? (
                <QongiroqHodisa key={`q-${b.q.id}`} q={b.q} k={k} takliflar={b.q.id === takliflarQongirogi && yozaOladi} onOzgardi={onOzgardi} />
              ) : (
                <HodisaBandi key={b.h.id} h={b.h} />
              ),
            )}
          </div>
        ))}
        <div ref={pastRef} />
      </div>

      <QadalganVazifalar k={k} yozaOladi={yozaOladi} onOzgardi={onOzgardi} />
      {yozaOladi && <Kompozer dealId={k.deal.id} masulId={k.deal.responsibleSeatId} onYuborildi={onOzgardi} />}
    </div>
  );
}

function HodisaBandi({ h }: { h: Hodisa }) {
  const { seatlar } = useCrm();
  const t = useT();
  const d = h.data;
  const seatNomi = (id: unknown) => (typeof id === 'string' ? (seatlar.find((s) => s.id === id)?.displayName ?? t('xodim')) : t('hech kim'));
  const teglar = (v: unknown) => (Array.isArray(v) && v.length ? v.join(', ') : '—');
  const muallif = d.automation ? t('Avtomatika: {n}', { n: String(d.automation) }) : d.sync ? t('{crm} dan', { crm: String(d.sync) }) : (h.authorName ?? t('Tizim'));
  const vaqt = (
    <time className="ms-hodisa-vaqt" dateTime={h.createdAt}>
      {sanaVaqt(h.createdAt).slice(-5)}
    </time>
  );

  let ikon: ReactNode = <History />;
  let mazmun: ReactNode;
  let sarlavha: string;
  switch (h.type) {
    case 'note':
      ikon = <MessageSquareText />;
      sarlavha = t('Izoh');
      mazmun = <p className="ms-izoh-matn">{String(d.text ?? '')}</p>;
      break;
    case 'created':
      ikon = <Plus />;
      sarlavha = t('Lid yaratildi');
      mazmun = d.stageName ? <span className="ms-chip">{String(d.stageName)}</span> : null;
      break;
    case 'stage':
      ikon = <ArrowRight />;
      sarlavha = t("Bosqich o'zgartirildi");
      mazmun = (
        <div className="ms-bosqich-otish">
          {d.fromName ? <span className="ms-chip">{String(d.fromName)}</span> : null}
          <ArrowRight aria-hidden="true" />
          <span className="ms-chip faol">{String(d.toName ?? '—')}</span>
          {d.lostReason ? <span className="ms-rad">{String(d.lostReason)}</span> : null}
        </div>
      );
      break;
    case 'task':
      ikon = <ListChecks />;
      sarlavha = t("Vazifa qo'yildi");
      mazmun = (
        <p>
          «{String(d.title ?? '')}»{d.dueAt ? ` — ${muddatMatni(String(d.dueAt))}` : ''}
        </p>
      );
      break;
    case 'task_done':
      ikon = <CircleCheck />;
      sarlavha = t('Vazifa bajarildi');
      mazmun = (
        <p>
          «{String(d.title ?? '')}»{d.result ? ` — ${String(d.result)}` : ''}
        </p>
      );
      break;
    case 'task_reopen':
      ikon = <RotateCcw />;
      sarlavha = t('Vazifa qayta ochildi');
      mazmun = <p>«{String(d.title ?? '')}»</p>;
      break;
    case 'task_reschedule':
      ikon = <ListChecks />;
      sarlavha = t('Vazifa muddati ko‘chirildi');
      mazmun = (
        <p>
          «{String(d.title ?? '')}» → {d.after ? muddatMatni(String(d.after)) : t('muddatsiz')}
        </p>
      );
      break;
    case 'responsible':
      sarlavha = t("Mas'ul o'zgardi");
      mazmun = (
        <div className="ms-bosqich-otish">
          <span className="ms-chip">{seatNomi(d.before)}</span>
          <ArrowRight aria-hidden="true" />
          <span className="ms-chip faol">{seatNomi(d.after)}</span>
        </div>
      );
      break;
    case 'tags':
      ikon = <Tag />;
      sarlavha = t("Teglar o'zgardi");
      mazmun = (
        <p>
          {teglar(d.before)} → {teglar(d.after)}
        </p>
      );
      break;
    case 'inbox':
      ikon = <FileText />;
      sarlavha = t('Murojaat biriktirildi');
      mazmun = <p>{[d.name, d.phone].filter(Boolean).join(', ') || '—'}{d.message ? ` — ${String(d.message)}` : ''}</p>;
      break;
    case 'deleted':
      ikon = <Trash2 />;
      sarlavha = d.sync ? t('{crm} da o‘chirilgan — bitim savatga o‘tkazildi', { crm: String(d.sync) }) : t('Bitim savatga o‘tkazildi');
      mazmun = null;
      break;
    case 'restored':
      ikon = <RotateCcw />;
      sarlavha = d.sync ? t('{crm} da tiklangan — bitim savatdan qaytarildi', { crm: String(d.sync) }) : t('Bitim savatdan tiklandi');
      mazmun = null;
      break;
    case 'merge':
      sarlavha = t('Kontaktlar birlashtirildi');
      mazmun = null;
      break;
    case 'contact':
      sarlavha = t('Kontakt o‘zgardi');
      mazmun = null;
      break;
    case 'company':
      ikon = <Building2 />;
      sarlavha = t('Kompaniya o‘zgardi');
      mazmun = null;
      break;
    case 'field':
      sarlavha = t("Maydon o'zgardi");
      mazmun = <MaydonOzgarishi d={d} />;
      break;
    default:
      sarlavha = h.type;
      mazmun = null;
  }
  if (d.automation) ikon = <Zap />;
  else if (d.sync) ikon = <RefreshCw />;

  return (
    <article className={`ms-hodisa ${h.type}`}>
      <span className="ms-hodisa-ikon" aria-hidden="true">
        {ikon}
      </span>
      <div className="ms-hodisa-karta">
        <div className="ms-hodisa-bosh">
          <b>{sarlavha}</b>
          <span className="ms-hodisa-kim">{muallif}</span>
          <span className="ms-hodisa-qachon">{fmtQachon(h.createdAt)}</span>
          {vaqt}
        </div>
        {mazmun}
      </div>
    </article>
  );
}

function MaydonOzgarishi({ d }: { d: Record<string, unknown> }) {
  const { holat } = useCrm();
  const t = useT();
  if (d.field === 'name') return <p>{t('Nomi: «{a}» → «{b}»', { a: String(d.before ?? ''), b: String(d.after ?? '') })}</p>;
  if (d.field === 'amount')
    return (
      <p>
        {t('Summa: {a} → {b}', { a: pul(d.before === null ? null : Number(d.before)), b: pul(d.after === null ? null : Number(d.after)) })}
        {d.auto === 'items' ? ` (${t('tovarlardan')})` : ''}
      </p>
    );
  const m = holat.fields.find((f) => f.id === String(d.fieldId));
  return <p>{t('«{m}»: {a} → {b}', { m: m?.label ?? t('Maydon'), a: qiymatMatni(m, d.before, t), b: qiymatMatni(m, d.after, t) })}</p>;
}

/** Qo'ng'iroq hodisasi: holat, audio, SotuvAI tahlili va (oxirgisida) maydon takliflari. */
function QongiroqHodisa({ q, k, takliflar, onOzgardi }: { q: Qongiroq; k: Kartochka; takliflar: boolean; onOzgardi: () => Promise<void> }) {
  const t = useT();
  const [tahlilOchiq, setTahlilOchiq] = useState(true);
  const yonalish = q.direction === 'outbound' ? t("Chiquvchi qo'ng'iroq") : q.direction === 'inbound' ? t("Kiruvchi qo'ng'iroq") : t('Suhbat');
  const javobsiz = !q.durationSeconds || q.durationSeconds <= 0;
  const tahlilBor = Boolean(q.summary || q.score !== null);
  const profil = q.clientExtracted;
  return (
    <article className="ms-hodisa qongiroq">
      <span className="ms-hodisa-ikon" aria-hidden="true">
        {q.direction === 'outbound' ? <PhoneOutgoing /> : q.direction === 'inbound' ? <PhoneIncoming /> : <PhoneCall />}
      </span>
      <div className="ms-hodisa-karta">
        <div className="ms-hodisa-bosh">
          <Link to={`/crm/suhbatlar/${q.id}`} className="ms-qongiroq-nom">
            {yonalish}
          </Link>
          <span className={`ms-holat-chip ${javobsiz ? 'qizil' : 'yashil'}`}>{javobsiz ? t('Javobsiz') : t('Tugallandi')}</span>
          <span className="ms-hodisa-qachon">{fmtQachon(q.startedAt)}</span>
          <span className="ms-hodisa-kim">
            {q.seatName ?? ''}
            {q.durationSeconds ? ` · ${fmtSoniya(q.durationSeconds)}` : ''}
          </span>
          <time className="ms-hodisa-vaqt" dateTime={q.startedAt}>
            {sanaVaqt(q.startedAt).slice(-5)}
          </time>
        </div>
        {q.mediaUrl && <AudioPleyer src={q.mediaUrl} kind={q.mediaKind} duration={q.durationSeconds} />}
        {tahlilBor && (
          <div className="ms-ai-tahlil">
            <button type="button" className="ms-ai-tahlil-bosh" onClick={() => setTahlilOchiq((v) => !v)} aria-expanded={tahlilOchiq}>
              <Sparkles aria-hidden="true" /> {t('SotuvAI tahlili')}
              <ChevronDown className={tahlilOchiq ? 'aylangan' : undefined} aria-hidden="true" />
            </button>
            {tahlilOchiq && (
              <>
                <div className="ms-ai-xulosa">
                  {q.score !== null && <BallHalqa ball={q.score} />}
                  {q.summary && <p>{q.summary}</p>}
                </div>
                {(q.primaryGap || q.callFamily || q.serviceLine) && (
                  <div className="ms-ai-kartalar">
                    {q.primaryGap && (
                      <div>
                        <span>{t('Asosiy kamchilik')}</span>
                        <b>{t(q.primaryGap)}</b>
                      </div>
                    )}
                    {q.callFamily && (
                      <div>
                        <span>{t('Suhbat oilasi')}</span>
                        <b>{t(q.callFamily)}</b>
                      </div>
                    )}
                    {q.serviceLine && (
                      <div>
                        <span>{t("Xizmat yo'nalishi")}</span>
                        <b>{t(q.serviceLine)}</b>
                      </div>
                    )}
                  </div>
                )}
                {profil && (profil.name || profil.role || profil.company) && (
                  <div className="ms-mijoz-profil">
                    <span className="ms-avatar kichik">{boshHarflar(profil.name ?? k.contact?.name)}</span>
                    <div>
                      <b>
                        {profil.name ?? k.contact?.name ?? t('Mijoz')}
                        {profil.isDecisionMaker && <span className="ms-asosiy-belgi">{t('Qaror qabul qiluvchi')}</span>}
                      </b>
                      <span className="yordam">{[profil.role, profil.company].filter(Boolean).join(' · ')}</span>
                    </div>
                  </div>
                )}
                {(q.signals?.objections?.length ?? 0) > 0 && (
                  <div className="ms-faktlar">
                    {q.signals!.objections.slice(0, 4).map((o, i) => (
                      <span key={i} className="ms-fakt">
                        {o}
                      </span>
                    ))}
                  </div>
                )}
                <Link to={`/crm/suhbatlar/${q.id}`} className="ms-batafsil">
                  {t("To'liq tahlil")} <ArrowRight aria-hidden="true" />
                </Link>
              </>
            )}
          </div>
        )}
        {takliflar && <MaydonTakliflari q={q} k={k} onOzgardi={onOzgardi} />}
      </div>
    </article>
  );
}

function BallHalqa({ ball }: { ball: number }) {
  const r = 18;
  const uzunlik = 2 * Math.PI * r;
  const ulush = Math.max(0, Math.min(100, ball)) / 100;
  return (
    <span className={`ms-ball-halqa ${ballKlass(ball)}`} aria-label={`${Math.round(ball * 10) / 10} / 100`}>
      <svg viewBox="0 0 44 44" aria-hidden="true">
        <circle cx="22" cy="22" r={r} className="iz" />
        <circle cx="22" cy="22" r={r} className="qiymat" strokeDasharray={`${uzunlik * ulush} ${uzunlik}`} transform="rotate(-90 22 22)" />
      </svg>
      <b>{Math.round(ball * 10) / 10}</b>
      <small>/100</small>
    </span>
  );
}

/**
 * "Lid maydonlarini to'ldirish" — AI qo'ng'iroqdan topgan, lekin kartada hali
 * bo'sh qiymatlar. Chip'dagi "+" bosilsa qiymat o'z joyiga yoziladi:
 * lavozim → "Lavozim" maydoni yoki kontakt lavozimi; qaror qabul qiluvchi →
 * shu nomdagi maydon; kompaniya → yangi kompaniya yaratilib biriktiriladi;
 * summa → lid summasi (tovar yo'q bo'lsa).
 */
function MaydonTakliflari({ q, k, onOzgardi }: { q: Qongiroq; k: Kartochka; onOzgardi: () => Promise<void> }) {
  const { holat, base } = useCrm();
  const t = useT();
  const [yopiq, setYopiq] = useState(false);
  const [band, setBand] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const d = k.deal;
  const p = q.clientExtracted;
  const bosh = (v: unknown) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
  const maydonTop = (re: RegExp) => holat.fields.find((m) => re.test(m.label) && !m.external);

  const takliflar: { kalit: string; nom: string; qiymat: string; qolla: () => Promise<void> }[] = [];
  if (p?.role) {
    const m = maydonTop(/lavozim/i);
    if (m && (m.type === 'text' || m.type === 'textarea') && bosh(d.fields[m.id]))
      takliflar.push({ kalit: 'rol-m', nom: m.label, qiymat: p.role, qolla: () => maydonniYoz(m, p.role) });
    else if (!m && k.contact && !k.contact.role)
      takliflar.push({ kalit: 'rol-k', nom: t('Lavozim'), qiymat: p.role, qolla: () => api.patch(`${base}/contacts/${k.contact!.id}`, { role: p.role }).then(() => undefined) });
  }
  if (p?.isDecisionMaker !== null && p?.isDecisionMaker !== undefined) {
    const m = maydonTop(/qaror/i);
    if (m && bosh(d.fields[m.id])) {
      if (m.type === 'checkbox') takliflar.push({ kalit: 'qaror', nom: m.label, qiymat: p.isDecisionMaker ? t('Ha') : t("Yo'q"), qolla: () => maydonniYoz(m, p.isDecisionMaker) });
      if (m.type === 'select') {
        const v = m.options.find((o) => (p.isDecisionMaker ? /^ha$/i : /^yo.?q$/i).test(o.label.trim()));
        if (v) takliflar.push({ kalit: 'qaror', nom: m.label, qiymat: v.label, qolla: () => maydonniYoz(m, v.id) });
      }
    }
  }
  if (p?.company && !d.companyId) {
    takliflar.push({
      kalit: 'kompaniya',
      nom: t('Kompaniya'),
      qiymat: p.company,
      qolla: async () => {
        const r = await api.post<{ id: string }>(`${base}/companies`, { name: p.company });
        await api.patch(`${base}/deals/${d.id}`, { version: d.version, companyId: r.id });
      },
    });
  }
  if (q.dealInfo?.amount && d.amount === null && k.items.length === 0 && !k.sync) {
    takliflar.push({
      kalit: 'summa',
      nom: t('Summa'),
      qiymat: `${pul(q.dealInfo.amount)} ${t("so'm")}`,
      qolla: () => api.patch(`${base}/deals/${d.id}`, { version: d.version, amount: q.dealInfo!.amount }).then(() => undefined),
    });
  }

  async function maydonniYoz(m: Maydon, qiymat: unknown) {
    await api.patch(`${base}/deals/${d.id}`, { version: d.version, fields: { [m.id]: qiymat } });
  }

  if (yopiq || takliflar.length === 0) return null;
  return (
    <div className="ms-takliflar">
      <div className="ms-takliflar-bosh">
        <span>
          <Sparkles aria-hidden="true" /> {t("Lid maydonlarini to'ldirish")} · {takliflar.length}
        </span>
        <button type="button" className="ms-mini-tugma" onClick={() => setYopiq(true)} aria-label={t('Yopish')}>
          <X />
        </button>
      </div>
      <div className="ms-takliflar-chiplar">
        {takliflar.map((x) => (
          <span key={x.kalit} className="ms-taklif">
            <span className="ms-taklif-nom">{x.nom}:</span> {x.qiymat}
            <button
              type="button"
              disabled={band !== null}
              aria-label={t("Qo'llash")}
              title={t("Qo'llash")}
              onClick={async () => {
                setBand(x.kalit);
                setXato(null);
                try {
                  await x.qolla();
                  await onOzgardi();
                } catch (e) {
                  setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
                } finally {
                  setBand(null);
                }
              }}
            >
              <Plus />
            </button>
          </span>
        ))}
      </div>
      {xato && <div className="xato-qator">{xato}</div>}
    </div>
  );
}

// ─── Qadalgan vazifalar va yozish maydoni ────────────────────────────────────

function QadalganVazifalar({ k, yozaOladi, onOzgardi }: { k: Kartochka; yozaOladi: boolean; onOzgardi: () => Promise<void> }) {
  const { holat, base } = useCrm();
  const t = useT();
  const [bajarish, setBajarish] = useState<Vazifa | null>(null);
  const [ochiq, setOchiq] = useState<string | null>(null);
  const [xato, setXato] = useState<string | null>(null);
  const vazifalar = k.tasks.filter((v) => OCHIQ.has(v.status)).sort((a, b) => (a.dueAt ?? '9').localeCompare(b.dueAt ?? '9'));
  const bosqichOchiq = bosqichTop(holat, k.deal.stageId)?.kind === 'open';

  if (vazifalar.length === 0) {
    return bosqichOchiq ? <div className="ms-vazifasiz">{t("Ochiq vazifa yo'q — keyingi qadamni belgilang, lid unutilib qolmasin.")}</div> : null;
  }
  const holatChip = (iso: string | null) => {
    const m = muddatHolati(iso);
    if (!iso) return <span className="ms-holat-chip">{t('Muddatsiz')}</span>;
    const d = new Date(iso);
    const vaqt = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    if (m === 'otgan') return <span className="ms-holat-chip qizil">{t("Muddati o'tgan")}</span>;
    if (m === 'bugun') return <span className="ms-holat-chip sariq">{d.getHours() === 23 && d.getMinutes() === 59 ? t('Bugun') : t('Bugun, {v}', { v: vaqt })}</span>;
    return <span className="ms-holat-chip">{muddatMatni(iso)}</span>;
  };

  return (
    <div className="ms-qadalgan">
      {vazifalar.map((v) => {
        const tur = vazifaTuri(holat, v.taskType);
        return (
          <div key={v.id} className={`ms-qadalgan-vazifa${muddatHolati(v.dueAt) === 'otgan' ? ' otgan' : ''}`}>
            <button
              type="button"
              className="ms-belgilash"
              disabled={!yozaOladi}
              onClick={() => setBajarish(v)}
              aria-label={t('Bajarildi deb belgilash')}
              title={t('Bajarildi deb belgilash')}
            >
              <Circle />
            </button>
            <div className="ms-qadalgan-matn">
              <b>{v.title}</b>
              <small>
                {v.seatName && <span>{v.seatName}</span>}
                {v.dueAt && <span className="ci-raqam">{muddatMatni(v.dueAt)}</span>}
                {v.source !== 'manual' && (
                  <span className="ms-ai-belgi">
                    <Sparkles aria-hidden="true" /> AI
                  </span>
                )}
              </small>
              {ochiq === v.id && (
                <div className="ms-qadalgan-batafsil">
                  {v.taskType && (
                    <span>
                      <span className="ci-nuqta" style={{ background: tur.color }} aria-hidden="true" /> {t(tur.name)}
                    </span>
                  )}
                  {v.description && <p>{v.description}</p>}
                </div>
              )}
            </div>
            {holatChip(v.dueAt)}
            <button type="button" className="ms-mini-tugma" onClick={() => setOchiq(ochiq === v.id ? null : v.id)} aria-expanded={ochiq === v.id} aria-label={t('Batafsil')}>
              <ChevronDown className={ochiq === v.id ? 'aylangan' : undefined} />
            </button>
          </div>
        );
      })}
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
    </div>
  );
}

/**
 * Yozish maydoni — Metasell'dagidek tablar: Izoh | Vazifa. Vazifada: turi,
 * mas'uli, muddati (tez tanlovli oyna) va ixtiyoriy izoh; Ctrl+Enter yuboradi.
 */
function Kompozer({ dealId, masulId, onYuborildi }: { dealId: string; masulId: string | null; onYuborildi: () => Promise<void> }) {
  const { holat, base, seatlar } = useCrm();
  const t = useT();
  const [tab, setTab] = useState<'izoh' | 'vazifa'>('izoh');
  const [matn, setMatn] = useState('');
  const [tur, setTur] = useState(holat.taskTypes[0]?.id ?? 'call');
  const [masul, setMasul] = useState(masulId ?? holat.seatId ?? '');
  const [muddat, setMuddat] = useState<string | null>(() => {
    const d = new Date();
    d.setSeconds(0, 0);
    d.setMinutes(d.getMinutes() + 60);
    return d.toISOString();
  });
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const yubor = async () => {
    if (band) return;
    if (tab === 'izoh' && !matn.trim()) return;
    setBand(true);
    setXato(null);
    try {
      if (tab === 'izoh') {
        await api.post(`${base}/deals/${dealId}/notes`, { text: matn.trim() });
      } else {
        const vt = holat.taskTypes.find((x) => x.id === tur);
        await api.post(`${base}/deals/${dealId}/tasks`, {
          title: t(vt?.name ?? 'Vazifa'),
          taskType: tur,
          description: matn.trim() || null,
          dueAt: muddat,
          ...(holat.canManageAll && masul ? { seatId: masul } : {}),
        });
      }
      setMatn('');
      await onYuborildi();
    } catch (e) {
      setXato(e instanceof ApiError ? t(e.message) : t('Saqlanmadi'));
    } finally {
      setBand(false);
    }
  };

  return (
    <div className="ms-kompozer">
      {tab === 'vazifa' && (
        <div className="ms-kompozer-vazifa">
          <select className="ms-kichik-select" value={tur} onChange={(e) => setTur(e.target.value)} aria-label={t('Vazifa turi')}>
            {holat.taskTypes.map((x) => (
              <option key={x.id} value={x.id}>
                {t(x.name)}
              </option>
            ))}
          </select>
          {holat.canManageAll ? (
            <select className="ms-kichik-select" value={masul} onChange={(e) => setMasul(e.target.value)} aria-label={t("Mas'ul")}>
              <option value="">{t("Lid mas'uli")}</option>
              {seatlar.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          ) : null}
          <MuddatTanlash qiymat={muddat} onChange={setMuddat} />
        </div>
      )}
      <div className="ms-kompozer-qator">
        <div className="ms-kompozer-tablar" role="tablist" aria-label={t('Yozish turi')}>
          <button type="button" role="tab" aria-selected={tab === 'izoh'} className={tab === 'izoh' ? 'faol' : undefined} onClick={() => setTab('izoh')} title={t('Izoh')} aria-label={t('Izoh')}>
            <MessageSquareText />
          </button>
          <button type="button" role="tab" aria-selected={tab === 'vazifa'} className={tab === 'vazifa' ? 'faol' : undefined} onClick={() => setTab('vazifa')} title={t('Vazifa')} aria-label={t('Vazifa')}>
            <ListChecks />
          </button>
        </div>
        <textarea
          rows={1}
          value={matn}
          maxLength={5000}
          onChange={(e) => setMatn(e.target.value)}
          placeholder={tab === 'izoh' ? t('Izoh yozing…') : t('Vazifa izohi (ixtiyoriy)…')}
          aria-label={tab === 'izoh' ? t('Izoh') : t('Vazifa izohi')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void yubor();
          }}
        />
        <span className="ms-kompozer-izoh" aria-hidden="true">
          ⌘/Ctrl + Enter
        </span>
        <button type="button" className="ms-yuborish" onClick={() => void yubor()} disabled={band || (tab === 'izoh' && !matn.trim())} aria-label={t('Yuborish')} title={t('Yuborish')}>
          <Send />
        </button>
      </div>
      {xato && <div className="xato-qator">{xato}</div>}
    </div>
  );
}
