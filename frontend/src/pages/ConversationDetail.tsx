import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  CircleCheck,
  Clock,
  Flag,
  Hourglass,
  Link2,
  MessageSquareQuote,
  PhoneOff,
  Quote,
  RotateCw,
  Share2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  api,
  ApiError,
  ballKlass,
  ballRang,
  fmtSana,
  fmtSoniya,
  type AlertRow,
  type AppealRow,
  type ConversationDetail as Detail,
  type PlaybookBody,
} from '../api';
import { AudioPleyer, type AudioPleyerHandle } from '../components/AudioPleyer';
import { davomiylik, davomiylikMatn } from '../components/bosh/malumot';
import { TepaPanel } from '../components/bosh/TepaPanel';
import { useAuth } from '../auth';
import { savolMatni } from '../components/anketa/savolMatni';

/**
 * TZ 8.3 dagi "eng muhim ekran": chapda transkript, o'ngda to'liq kontekst.
 * Ma'lumot zich, lekin har ball ortida isbot turadi (FR-81) va har faktning
 * manbasi ko'rsatilgan — ya'ni zichlik ishonchni kamaytirmaydi.
 */

const KANAL_NOMI: Record<string, string> = {
  telegram: 'Telegram',
  phone: 'Telefon',
  meeting: 'Uchrashuv',
  whatsapp: 'WhatsApp',
  instagram: 'Instagram',
};
const YONALISH_NOMI: Record<string, string> = { inbound: 'Kiruvchi', outbound: 'Chiquvchi', na: '—' };
const MUVOFIQLIK_NOMI: Record<string, { nom: string; klass: string }> = {
  ok: { nom: 'Muammo yo\'q', klass: 'ok' },
  warning: { nom: 'Ogohlantirish', klass: 'sariq' },
  violation: { nom: 'Qoidabuzarlik', klass: 'qizil' },
};
const SHOSHILINCHLIK_NOMI: Record<string, string> = { low: 'Past', medium: 'O\'rtacha', high: 'Yuqori' };
const SPEAKER_USUL_NOMI: Record<string, string> = {
  telegram_id: 'Telegram ID (100% aniq)',
  channel: 'Audio kanal (100% aniq)',
  phone: 'Telefon raqami',
  llm_inferred: 'AI taxmini',
};
const VADA_HOLAT_NOMI: Record<string, { nom: string; klass: string }> = {
  pending: { nom: 'Kutilmoqda', klass: 'kul' },
  done: { nom: 'Bajarildi', klass: 'ok' },
  missed: { nom: 'Muddati o\'tdi', klass: 'qizil' },
};

/**
 * E'tirozni hal qilish (FR-124) — rahbar uchun.
 *
 * Ataylab suhbat detalida turadi, alohida "e'tirozlar" ekranida emas:
 * ballni ko'tarish uchun transkriptdan iqtibos keltirish shart va
 * server uni tekshiradi. Transkriptsiz bu formani to'ldirib bo'lmaydi.
 */
function EtirozHal({
  appeal,
  maxScore,
  isbotsiz,
  businessId,
  onTugadi,
}: {
  appeal: AppealRow;
  maxScore: number;
  isbotsiz: boolean;
  businessId: string;
  onTugadi: () => void;
}) {
  const [rejim, setRejim] = useState<'yopiq' | 'qabul' | 'rad'>('yopiq');
  const [ball, setBall] = useState(maxScore);
  const [iqtibos, setIqtibos] = useState('');
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  async function yubor(status: 'accepted' | 'rejected') {
    setBand(true);
    setXato(null);
    try {
      await api.patch(`/api/v1/businesses/${businessId}/appeals/${appeal.id}`, {
        status,
        ...(status === 'accepted'
          ? { newScore: ball, ...(iqtibos.trim() ? { evidenceQuote: iqtibos.trim() } : {}) }
          : {}),
        ...(izoh.trim() ? { resolutionNote: izoh.trim() } : {}),
      });
      onTugadi();
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : 'Saqlanmadi');
    } finally {
      setBand(false);
    }
  }

  if (rejim === 'yopiq') {
    return (
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button className="btn kichik" onClick={() => setRejim('qabul')}>
          Qabul qilish
        </button>
        <button className="btn ikkinchi kichik" onClick={() => setRejim('rad')}>
          Rad etish
        </button>
      </div>
    );
  }

  return (
    <div className="etiroz-forma">
      {rejim === 'qabul' ? (
        <>
          <div className="maydon-blok">
            <label htmlFor={`ball-${appeal.id}`}>Yangi ball</label>
            <select
              id={`ball-${appeal.id}`}
              value={ball}
              onChange={(e) => setBall(Number(e.target.value))}
            >
              {Array.from({ length: maxScore + 1 }, (_, i) => (
                <option key={i} value={i}>
                  {i} / {maxScore}
                </option>
              ))}
            </select>
          </div>
          <div className="maydon-blok">
            <label htmlFor={`iqtibos-${appeal.id}`}>
              Yozishmadan iqtibos {isbotsiz ? '(majburiy)' : '(ixtiyoriy)'}
            </label>
            <textarea
              id={`iqtibos-${appeal.id}`}
              value={iqtibos}
              onChange={(e) => setIqtibos(e.target.value)}
              rows={2}
              placeholder="Matnni yozishmadan aynan nusxalang"
            />
            <div className="yordam">
              Iqtibos yozishmada bor-yo'qligi tekshiriladi — ball qo'ygan odam ham
              isbot keltiradi, xuddi AI kabi.
            </div>
          </div>
        </>
      ) : (
        <div className="maydon-blok">
          <label htmlFor={`sabab-${appeal.id}`}>Rad etish sababi</label>
          <textarea
            id={`sabab-${appeal.id}`}
            value={izoh}
            onChange={(e) => setIzoh(e.target.value)}
            rows={2}
            placeholder="Sotuvchi buni o'qiydi — sababni aniq yozing"
          />
        </div>
      )}
      {xato && <div className="xato-qator">{xato}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          className="btn kichik"
          disabled={band || (rejim === 'rad' && izoh.trim().length === 0)}
          onClick={() => void yubor(rejim === 'qabul' ? 'accepted' : 'rejected')}
        >
          {band ? 'Saqlanmoqda…' : 'Tasdiqlash'}
        </button>
        <button className="btn ikkinchi kichik" onClick={() => setRejim('yopiq')}>
          Bekor
        </button>
      </div>
    </div>
  );
}

// ─── Yangi ko'rinish uchun yordamchilar ─────────────────────────────────────

const OYLAR = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
/** "25 Iyun 2026, 11:26" */
function toliqSana(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${OYLAR[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const SOHA_NOMI: Record<string, string> = {
  sales: 'Biznesga tegishli — sotuv',
  support: "Biznesga tegishli — qo'llab-quvvatlash",
  internal: 'Ichki suhbat',
  spam: 'Spam',
  other: 'Boshqa',
};
const BAHOLASH_REJIMI: Record<string, string> = {
  scored: "Baholash mezonlari bo'yicha",
  skipped_low_confidence: 'Ishonch past — baholanmadi',
  not_scored: 'Baholanmaydigan tur',
};
const BAHO_NOMI: Record<string, string> = { yuqori: "a'lo", yaxshi: 'yaxshi', orta: "o'rta", past: 'zaif', yoq: '—' };

type Tab = 'xulosa' | 'mezonlar' | 'transkript';
/** Transkript shu xabar sonigacha qisqartirib ko'rsatiladi. */
const QISQA = 12;

/** Ikki ustunli "nom — qiymat" qatori. */
function Qator({ nom, children }: { nom: string; children: ReactNode }) {
  return (
    <div className="sd-qator">
      <span className="sd-qator-nom">{nom}</span>
      <span className="sd-qator-qiymat">{children}</span>
    </div>
  );
}

export function ConversationDetail() {
  const { id } = useParams<{ id: string }>();
  const { business, user } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [d, setD] = useState<Detail | null>(null);
  const [yuklashXato, setYuklashXato] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [showFullTranscript, setShowFullTranscript] = useState(false);
  const [kutayotganSakrash, setKutayotganSakrash] = useState<string | null>(null);
  const [kutayotganMezon, setKutayotganMezon] = useState<string | null>(null);
  const [mezonYoritish, setMezonYoritish] = useState<string | null>(null);
  const [ogohSoni, setOgohSoni] = useState(0);
  const [oilaNomi, setOilaNomi] = useState<Record<string, string>>({});
  const [nusxa, setNusxa] = useState(false);
  const segRefs = useRef(new Map<string, HTMLDivElement>());
  const mezonRefs = useRef(new Map<string, HTMLDivElement>());
  const mijozRef = useRef<HTMLElement>(null);
  const audioRef = useRef<AudioPleyerHandle>(null);

  // FR-124 / FR-123
  const [etirozOchiq, setEtirozOchiq] = useState<string | null>(null);
  const [etirozSabab, setEtirozSabab] = useState('');
  const [yangiIzoh, setYangiIzoh] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const ruxsat = business?.permissions ?? [];
  const etirozBildiraOladi = ruxsat.includes('appeal:create');
  const izohQoldiraOladi = ruxsat.includes('task:manage:all');
  const etirozHalQilaOladi = ruxsat.includes('appeal:resolve');

  const tab: Tab = (['xulosa', 'mezonlar', 'transkript'] as const).find((t) => t === params.get('tab')) ?? 'xulosa';
  const tabniOch = useCallback(
    (t: Tab) =>
      setParams(
        (eski) => {
          const p = new URLSearchParams(eski);
          if (t === 'xulosa') p.delete('tab');
          else p.set('tab', t);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );

  /** Mezonga bog'lanmagan izohlar — ular alohida kartada ko'rsatiladi. */
  const umumiyIzohlar = d?.comments.filter((c) => c.criterionCode === null) ?? [];

  const load = useCallback(() => {
    if (!business || !id) return;
    setYuklashXato(false);
    void api
      .get<Detail>(`/api/v1/businesses/${business.businessId}/conversations/${id}`)
      .then(setD)
      .catch(() => setYuklashXato(true));
  }, [business, id]);

  useEffect(load, [load]);

  // Tepa panel uchun ogohlantirishlar soni va qo'ng'iroq turlari nomlari
  useEffect(() => {
    if (!business) return;
    const biz = `/api/v1/businesses/${business.businessId}`;
    if (business.permissions.includes('alert:read')) {
      void api
        .get<{ alerts: AlertRow[]; unseenCount: number }>(`${biz}/alerts?limit=1`)
        .then((r) => setOgohSoni(r.unseenCount))
        .catch(() => undefined);
    }
    void api
      .get<PlaybookBody>(`${biz}/playbook`)
      .then((pb) => setOilaNomi(Object.fromEntries(pb.classificationPolicy.callFamilies.map((f) => [f.key, f.name]))))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.businessId]);

  /**
   * FR-123: sotuvchi sahifani ochsa, izohlar o'qilgan deb belgilanadi.
   *
   * Alohida "o'qidim" tugmasi qo'yilmadi — hech kim uni bosmaydi va
   * rahbar "izohim yetib bordimi" degan savolga javob ololmasdi.
   * Belgilash faqat sotuvchi uchun: rahbar o'z izohini ochgani
   * "sotuvchi ko'rdi" degani emas.
   */
  useEffect(() => {
    if (!business || !d || izohQoldiraOladi) return;
    const korilmagan = d.comments.filter((c) => c.seenAt === null);
    if (korilmagan.length === 0) return;
    void Promise.all(
      korilmagan.map((c) =>
        api
          .patch(`/api/v1/businesses/${business.businessId}/comments/${c.id}/seen`)
          .catch(() => undefined),
      ),
    );
  }, [business, d, izohQoldiraOladi]);

  /** Elementga yumshoq aylantirib, qisqa vaqt yoritadi. */
  const korsat = (el: HTMLElement) => {
    const tinch = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: tinch ? 'auto' : 'smooth', block: 'center' });
  };

  const sakra = useCallback((segmentId: string) => {
    const el = segRefs.current.get(segmentId);
    if (!el || !el.isConnected) return false;
    korsat(el);
    setHighlight(segmentId);
    setTimeout(() => setHighlight(null), 2200);
    return true;
  }, []);

  /**
   * Isbotdan transkriptga sakrash (TZ 8.3). Transkript boshqa tabda — avval
   * u ochiladi, sakrash esa keyingi chizilishdan keyin bajariladi (element
   * hali DOM'da yo'q). Isbot qisqartirilgan qismdan keyin bo'lsa, transkript
   * to'liq ochiladi.
   */
  useEffect(() => {
    if (!kutayotganSakrash || tab !== 'transkript') return;
    if (sakra(kutayotganSakrash)) setKutayotganSakrash(null);
  }, [kutayotganSakrash, showFullTranscript, tab, sakra]);

  /** Xabardan mezon kartasiga sakrash (teskari yo'nalish). */
  useEffect(() => {
    if (!kutayotganMezon || tab !== 'mezonlar') return;
    const el = mezonRefs.current.get(kutayotganMezon);
    if (!el || !el.isConnected) return;
    korsat(el);
    setMezonYoritish(kutayotganMezon);
    setKutayotganMezon(null);
    setTimeout(() => setMezonYoritish(null), 2200);
  }, [kutayotganMezon, tab]);

  const mezongaSakra = useCallback(
    (kod: string) => {
      tabniOch('mezonlar');
      setKutayotganMezon(kod);
    },
    [tabniOch],
  );

  /** Qaysi xabar qaysi mezonlarga isbot bo'lgan (teskari bog'lanish). */
  const segmentMezonlari = useMemo(() => {
    const m = new Map<string, { kod: string; nom: string }[]>();
    if (!d) return m;
    for (const s of d.scores) {
      if (!s.evidenceSegmentId) continue;
      const royxat = m.get(s.evidenceSegmentId) ?? [];
      royxat.push({ kod: s.criterionCode, nom: s.criterionName });
      m.set(s.evidenceSegmentId, royxat);
    }
    return m;
  }, [d]);

  // Mezonlar kategoriya bo'yicha — "% + progress bar". Faqat baholangan
  // (score != null) mezonlar foizga qo'shiladi.
  const categoryRollup = useMemo(() => {
    if (!d) return [];
    const byCode = new Map<string, { code: string; scored: number[]; unknown: number; items: typeof d.scores }>();
    for (const s of d.scores) {
      const key = s.categoryCode ?? '—';
      const bucket = byCode.get(key) ?? { code: key, scored: [], unknown: 0, items: [] };
      if (s.score !== null) bucket.scored.push(s.score / s.maxScore);
      else bucket.unknown++;
      bucket.items.push(s);
      byCode.set(key, bucket);
    }
    return [...byCode.values()].map((b) => ({
      ...b,
      pct: b.scored.length > 0 ? (b.scored.reduce((a, c) => a + c, 0) / b.scored.length) * 100 : null,
    }));
  }, [d]);

  /** Kim qancha gapirgani — yozilgan so'zlar bo'yicha. */
  const nisbat = useMemo(() => {
    if (!d) return null;
    let men = 0;
    let mij = 0;
    for (const s of d.segments) {
      const n = s.text.split(/\s+/).filter(Boolean).length;
      if (s.speaker === 'manager') men += n;
      else if (s.speaker === 'client') mij += n;
    }
    if (men + mij === 0) return null;
    const m = Math.round((men / (men + mij)) * 100);
    return { menejer: m, mijoz: 100 - m };
  }, [d]);

  const tepa = business && (
    <div className="sd-tepa">
      <button
        type="button"
        className="sd-orqaga"
        onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/qongiroqlar'))}
        aria-label="Orqaga"
        title="Orqaga"
      >
        <ArrowLeft />
      </button>
      <TepaPanel
        biznesNomi={business.name}
        foydalanuvchi={user?.displayName ?? ''}
        ogohSoni={ogohSoni}
        ogohKoradi={business.permissions.includes('alert:read')}
        suhbatlar={[]}
      />
    </div>
  );

  if (yuklashXato)
    return (
      <div className="sd-sahifa">
        {tepa}
        <div className="card hech-narsa">
          Suhbatni yuklab bo'lmadi.{' '}
          <button type="button" className="btn ikkinchi kichik" onClick={load}>
            Qayta urinish
          </button>
        </div>
      </div>
    );
  if (!d)
    return (
      <div className="sd-sahifa" aria-busy="true">
        {tepa}
        <div className="card skelet" style={{ height: 220 }} />
        <div className="card skelet" style={{ height: 320 }} />
      </div>
    );

  const a = d.analysis;
  const c = d.conversation;
  const score = a?.overallScore === null || !a ? null : Number(a.overallScore);
  const coaching = a?.managerNote;
  const metrics = a?.dynamics?.replyMetrics;
  const compliance = a?.compliance ? MUVOFIQLIK_NOMI[a.compliance] : null;
  const ovozli = !!c.mediaUrl || c.channel === 'phone';
  const davom = c.durationSeconds ?? davomiylik(c);
  const mijozTel = c.direction === 'outbound' ? c.phoneTo : c.phoneFrom;
  const mijozVada = d.commitments.filter((x) => x.byParty === 'client');
  const menejerVada = d.commitments.filter((x) => x.byParty === 'manager');
  const keyingi = d.commitments.find((x) => x.status === 'pending') ?? d.commitments[0];
  const bahoKlass = ballKlass(score);
  // Muddati o'tgan va'dani "aniq kelishilgan" deb ko'rsatish chalg'itadi
  const keyingiHolat = !keyingi
    ? { nom: 'Keyingi qadam kelishilmagan', klass: 'ogoh' }
    : keyingi.status === 'missed'
      ? { nom: "Kelishilgan qadam muddati o'tgan", klass: 'xavf' }
      : keyingi.status === 'done'
        ? { nom: 'Kelishilgan qadam bajarildi', klass: 'yaxshi' }
        : { nom: 'Keyingi qadam aniq kelishilgan', klass: 'neytral' };
  const mijozIsm = a?.clientExtracted?.name ?? d.contact?.name ?? null;
  const mijozKomp = a?.clientExtracted?.company ?? d.contact?.company ?? null;
  const mijozLav = a?.clientExtracted?.role ?? d.contact?.role ?? null;
  const qarorQiluvchi = a?.clientExtracted?.isDecisionMaker ?? d.contact?.isDecisionMaker ?? null;
  const mijozBor = !!(mijozIsm || mijozKomp || mijozLav || mijozTel || qarorQiluvchi !== null);

  function jumpTo(segmentId: string | null, startSeconds?: string | number | null) {
    if (!segmentId || !d) return;
    if (startSeconds !== null && startSeconds !== undefined) {
      audioRef.current?.sakraVaIjro(Number(startSeconds));
    }
    if (d.segments.findIndex((s) => s.id === segmentId) >= QISQA) setShowFullTranscript(true);
    tabniOch('transkript');
    setKutayotganSakrash(segmentId);
  }

  /** FR-124: sotuvchi bahoga e'tiroz bildiradi. */
  async function etirozYubor(scoreId: string) {
    if (!business || etirozSabab.trim().length < 10) return;
    setBand(true);
    setXato(null);
    try {
      await api.post(`/api/v1/businesses/${business.businessId}/appeals?scoreId=${scoreId}`, {
        reason: etirozSabab.trim(),
      });
      setEtirozOchiq(null);
      setEtirozSabab('');
      load();
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : 'E\'tiroz yuborilmadi');
    } finally {
      setBand(false);
    }
  }

  /** FR-123: rahbar kouching izohi qoldiradi. */
  async function izohYubor() {
    if (!business || !id || yangiIzoh.trim().length < 2) return;
    setBand(true);
    setXato(null);
    try {
      await api.post(`/api/v1/businesses/${business.businessId}/conversations/${id}/comments`, {
        body: yangiIzoh.trim(),
      });
      setYangiIzoh('');
      load();
    } catch (e) {
      setXato(e instanceof ApiError ? e.message : 'Izoh saqlanmadi');
    } finally {
      setBand(false);
    }
  }

  async function reanalyze() {
    if (!business || !id) return;
    setReanalyzing(true);
    try {
      await api.post(`/api/v1/businesses/${business.businessId}/conversations/${id}/analyze`);
      setTimeout(() => {
        load();
        setReanalyzing(false);
      }, 1500);
    } catch {
      setReanalyzing(false);
    }
  }

  /** Havolani ulashish: telefonda tizim oynasi, kompyuterda nusxa. */
  async function ulash() {
    const url = window.location.href.split('?')[0]!;
    try {
      if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        await navigator.share({ title: 'Suhbat tahlili', url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setNusxa(true);
      setTimeout(() => setNusxa(false), 2000);
    } catch {
      /* foydalanuvchi bekor qildi */
    }
  }

  function mijozgaOt() {
    tabniOch('xulosa');
    requestAnimationFrame(() => mijozRef.current && korsat(mijozRef.current));
  }

  const boshlanish = new Date(c.startedAt).getTime();
  const vaqt = (startSeconds: string | number): string => {
    const s = Number(startSeconds);
    if (c.channel === 'telegram') {
      const t = new Date(boshlanish + s * 1000);
      return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
    }
    const m = Math.floor(s / 60);
    return `${String(m).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  const visibleSegments = showFullTranscript ? d.segments : d.segments.slice(0, QISQA);
  const hiddenCount = d.segments.length - visibleSegments.length;

  const holat =
    c.status === 'done'
      ? { nom: 'Tahlil qilingan', klass: 'ok' }
      : c.status === 'filtered'
        ? { nom: 'Filtrlangan', klass: 'kul' }
        : { nom: 'Tahlil kutilmoqda', klass: 'sariq' };

  return (
    <div className="sd-sahifa">
      {tepa}

      {/* ─── Sarlavha: xulosa + sifat ─── */}
      <section className="card sd-bosh">
        <div className="sd-bosh-chap">
          <div className="sd-yorliq-qator">
            <span className="sd-yorliq">Asosiy xulosa</span>
            {a?.primaryGap ? (
              <span className="sd-holat-chip ogoh">{a.primaryGap}</span>
            ) : a ? (
              <span className="sd-holat-chip ok">Asosiy kamchilik topilmadi</span>
            ) : null}
            {a?.isFlagged && (
              <span className="sd-holat-chip xavf">
                <Flag /> {a.flaggedReason ?? "Ko'rik talab qilinadi"}
              </span>
            )}
          </div>
          <h1 className="sd-sarlavha">Qisqa suhbat xulosasi</h1>
          <p className="sd-xulosa-matn">{a?.summary ?? c.summary ?? 'Xulosa hali tayyor emas.'}</p>
          <div className="sd-chiplar">
            <span className={`sd-chip ${holat.klass}`}>
              <CircleCheck /> {holat.nom}
            </span>
            <span className="sd-chip">{toliqSana(c.startedAt)}</span>
            {c.direction !== 'na' && <span className="sd-chip">{YONALISH_NOMI[c.direction] ?? c.direction}</span>}
            <span className="sd-chip">{KANAL_NOMI[c.channel] ?? c.channel}</span>
            {c.managerName && <span className="sd-chip">{c.managerName}</span>}
            {davom !== null && (
              <span className="sd-chip">
                <Clock /> {davomiylikMatn(davom)}
              </span>
            )}
          </div>
        </div>

        <div className="sd-bosh-ong">
          <div className="sd-amallar">
            <button type="button" className="btn ikkinchi" onClick={() => void ulash()}>
              {nusxa ? <Check /> : <Share2 />} {nusxa ? 'Nusxalandi' : 'Ulashish'}
            </button>
            {a && (
              <button type="button" className="btn" onClick={mijozgaOt}>
                <Link2 /> Lid tafsilotlari
              </button>
            )}
          </div>
          <div className="sd-sifat">
            <span className="sd-yorliq">Suhbat sifati</span>
            <div className="sd-sifat-qator">
              <b className="sd-sifat-son">{score === null ? '—' : Math.round(score)}</b>
              <span className="sd-sifat-max">/100</span>
              {score !== null && <span className={`sd-baho ${bahoKlass}`}>{BAHO_NOMI[bahoKlass]}</span>}
            </div>
            <div className="sd-sifat-chiziq" role="img" aria-label={`Sifat ${score ?? 'yo\'q'} / 100`}>
              <span style={{ width: `${score ?? 0}%`, background: ballRang(score) }} />
            </div>
            <button type="button" className="sd-qayta" onClick={() => void reanalyze()} disabled={reanalyzing}>
              <RotateCw className={reanalyzing ? 'aylanuvchi' : ''} /> {reanalyzing ? "Navbatga qo'yildi…" : 'Qayta tahlil'}
            </button>
          </div>
        </div>
      </section>

      {c.mediaUrl && <AudioPleyer ref={audioRef} src={c.mediaUrl} kind={c.mediaKind} duration={c.durationSeconds} />}

      {/* ─── Tablar ─── */}
      <nav className="sd-tablar" role="tablist" aria-label="Suhbat bo'limlari">
        {(
          [
            ['xulosa', 'Xulosa'],
            ['mezonlar', `Mezonlar${d.scores.length ? ` (${d.scores.length})` : ''}`],
            ['transkript', ovozli ? 'Transkript' : 'Yozishma'],
          ] as const
        ).map(([k, nom]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={`sd-tab${tab === k ? ' faol' : ''}`} onClick={() => tabniOch(k)}>
            {nom}
          </button>
        ))}
      </nav>

      {/* ═══ XULOSA ═══ */}
      {tab === 'xulosa' &&
        (!a ? (
          <div className="card hech-narsa">
            <div className="katta-ikon">
              <Hourglass />
            </div>
            {c.status === 'filtered'
              ? `Tahlil qilinmagan: ${c.excludedReason ?? 'filtrlangan'}`
              : "Tahlil hali tayyor emas. Sessiya jim bo'lgach avtomatik boshlanadi."}
          </div>
        ) : (
          <div className="sd-bolim">
            <section className="card sd-karta">
              <div className="sd-ikki">
                <div>
                  <h2 className="sd-kichik-sarlavha yaxshi">
                    <CheckCircle2 /> Yaxshi bajarilgan
                  </h2>
                  {coaching?.strengths.length ? (
                    <ul className="sd-nuqtali yaxshi">
                      {coaching.strengths.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="sd-bosh-matn">AI alohida kuchli tomon belgilamagan.</p>
                  )}
                </div>
                <div>
                  <h2 className="sd-kichik-sarlavha yomon">
                    <AlertTriangle /> Yaxshilash kerak
                  </h2>
                  {coaching?.improvements.length || a.primaryGap ? (
                    <ul className="sd-nuqtali yomon">
                      {(coaching?.improvements.length ? coaching.improvements : [a.primaryGap!]).map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="sd-bosh-matn">Yaxshilash kerak bo'lgan joy topilmadi.</p>
                  )}
                </div>
              </div>

              {coaching?.betterPhrases.map((p, i) => (
                <div className="sd-ibora" key={i}>
                  <span className="sd-ibora-bosh">
                    <MessageSquareQuote /> Tavsiya etilgan ibora
                    {p.context && <small> — {p.context}</small>}
                  </span>
                  <p>“{p.suggestion}”</p>
                </div>
              ))}

              <div className="sd-qatorlar">
                <Qator nom="Shoshilinchlik darajasi">
                  {a.signals?.urgency ? (
                    <span className={`sd-pill ${a.signals.urgency === 'high' ? 'xavf' : a.signals.urgency === 'medium' ? 'ogoh' : 'neytral'}`}>
                      {SHOSHILINCHLIK_NOMI[a.signals.urgency]}
                    </span>
                  ) : (
                    <span className="sd-pill neytral">Aniqlanmadi</span>
                  )}
                </Qator>
                <Qator nom="Byudjet reaktsiyasi">
                  <span className={`sd-pill ${a.signals?.budgetReaction ? 'neytral' : 'ogoh'}`}>
                    {a.signals?.budgetReaction ?? 'Muhokama qilinmadi'}
                  </span>
                </Qator>
                <Qator nom="E'tirozlar">
                  {a.signals?.objections?.length ? (
                    <span className="sd-pill-qator">
                      {a.signals.objections.map((o, i) => (
                        <span key={i} className="sd-pill xavf">
                          {o}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span className="sd-pill neytral">E'tiroz bo'lmadi</span>
                  )}
                </Qator>
                {a.deal?.amount ? (
                  <Qator nom="Bitim">
                    {a.deal.amount.toLocaleString('uz')} {a.deal.currency ?? ''}
                    {a.deal.stage && ` · ${a.deal.stage}`}
                  </Qator>
                ) : null}
                <Qator nom="Kelishuvlar: Mijoz">
                  <VadaRoyxat royxat={mijozVada} />
                </Qator>
                <Qator nom="Kelishuvlar: Menejer">
                  <VadaRoyxat royxat={menejerVada} />
                </Qator>
              </div>
            </section>

            <section className="card sd-karta sd-keyingi">
              <div className="sd-keyingi-bosh">
                <span className={`sd-pill ${keyingiHolat.klass}`}>{keyingiHolat.nom}</span>
              </div>
              <h2 className="sd-keyingi-matn">
                {keyingi
                  ? `${keyingi.byParty === 'manager' ? 'Menejer' : 'Mijoz'}: ${keyingi.what}`
                  : "Suhbat aniq keyingi qadamsiz tugagan — menejer mijoz bilan qayta bog'lanishi kerak."}
              </h2>
              {keyingi?.deadline && <p className="sd-bosh-matn">Muddat: {fmtSana(keyingi.deadline)}</p>}
            </section>

            <section className="card sd-karta" ref={mijozRef}>
              <h2 className="sd-blok-sarlavha">Mijoz ma'lumotlari</h2>
              {mijozBor ? (
                <div className="sd-qatorlar bir">
                  {mijozIsm && <Qator nom="Ism">{mijozIsm}</Qator>}
                  {mijozKomp && <Qator nom="Kompaniya">{mijozKomp}</Qator>}
                  {mijozLav && <Qator nom="Lavozim">{mijozLav}</Qator>}
                  {mijozTel && <Qator nom="Telefon">{mijozTel}</Qator>}
                  {qarorQiluvchi !== null && <Qator nom="Qaror qabul qiluvchi">{qarorQiluvchi ? 'Ha' : "Yo'q"}</Qator>}
                </div>
              ) : (
                <p className="sd-bosh-matn">Suhbatdan mijoz ismi, kompaniyasi yoki lavozimi aniqlanmadi.</p>
              )}
              {a.questionnaireAnswers && a.questionnaireAnswers.length > 0 && (
                <ul className="sd-savolnoma">
                  {a.questionnaireAnswers.map((qa, i) => (
                    <li key={i}>
                      <span>{savolMatni(qa.question)}</span>
                      <b>{qa.answer ?? '—'}</b>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card sd-karta">
              <h2 className="sd-blok-sarlavha">{ovozli ? "Qo'ng'iroq konteksti" : 'Suhbat konteksti'}</h2>
              <div className="sd-kontekst">
                <Qator nom={ovozli ? "Qo'ng'iroq ID" : 'Suhbat ID'}>
                  <span className="sd-id">{c.id}</span>
                </Qator>
                <Qator nom="Sana">{toliqSana(c.startedAt)}</Qator>
                <Qator nom="Davomiylik">{davomiylikMatn(davom)}</Qator>
                <Qator nom="Yo'nalish">{YONALISH_NOMI[c.direction] ?? '—'}</Qator>
                <Qator nom="Kanal">{KANAL_NOMI[c.channel] ?? c.channel}</Qator>
                <Qator nom="Til">{c.language ? c.language.toUpperCase() : '—'}</Qator>
                <Qator nom="Suhbat dinamikasi">
                  {nisbat ? `Menejer gapirdi: ${nisbat.menejer}% · Mijoz gapirdi: ${nisbat.mijoz}%` : '—'}
                </Qator>
                <Qator nom="Menejer">{c.managerName ?? '—'}</Qator>
                <Qator nom="Qo'ng'iroq turi">{a.callFamily ? oilaNomi[a.callFamily] ?? a.callFamily : '—'}</Qator>
                <Qator nom="Biznesga tegishliligi">{a.businessRelevance ? SOHA_NOMI[a.businessRelevance] ?? a.businessRelevance : '—'}</Qator>
                <Qator nom="Baholash rejimi">{a.scoringMode ? BAHOLASH_REJIMI[a.scoringMode] ?? a.scoringMode : '—'}</Qator>
                <Qator nom="Xizmat yo'nalishi">{a.serviceLine ?? '—'}</Qator>
                <Qator nom="Xavf belgisi">
                  {compliance ? <span className={`sd-pill ${a.compliance === 'ok' ? 'yaxshi' : a.compliance === 'warning' ? 'ogoh' : 'xavf'}`}>{compliance.nom}</span> : '—'}
                </Qator>
                <Qator nom="Asosiy kamchilik">{a.primaryGap ?? '—'}</Qator>
                {metrics && (
                  <>
                    <Qator nom="Birinchi javob">{fmtSoniya(metrics.firstResponseSeconds)}</Qator>
                    <Qator nom="Javobsiz murojaat">
                      <span style={metrics.unansweredTurns > 0 ? { color: 'var(--past-text)' } : undefined}>
                        {metrics.unansweredTurns} / {metrics.customerTurns}
                      </span>
                    </Qator>
                  </>
                )}
                <Qator nom="Ish vaqti">{c.isOffHours ? 'Ish vaqtidan tashqari' : 'Ish vaqtida'}</Qator>
                <Qator nom="Rollarni aniqlash">
                  {a.speakerAttributionMethod ? SPEAKER_USUL_NOMI[a.speakerAttributionMethod] ?? a.speakerAttributionMethod : '—'}
                </Qator>
              </div>
            </section>

            {d.previousConversations.length === 0 ? (
              <section className="card sd-karta sd-oldingi-bosh">
                <span className="sd-oldingi-ikon">
                  <PhoneOff />
                </span>
                <div>
                  <b>Bu mijoz bilan oldingi suhbatlar topilmadi</b>
                  <p>Oldingi suhbatlar bo'lsa, tahlil ularni kontekst sifatida hisobga oladi.</p>
                </div>
              </section>
            ) : (
              <section className="card sd-karta">
                <h2 className="sd-blok-sarlavha">Bu mijoz bilan oldingi suhbatlar</h2>
                {d.previousConversations.map((p) => (
                  <div className="tarix-satr" key={p.id}>
                    <span className={`ball ${ballKlass(p.overallScore === null ? null : Number(p.overallScore))}`} style={{ minWidth: 40, fontSize: 12 }}>
                      {p.overallScore === null ? '—' : `${Math.round(Number(p.overallScore))}%`}
                    </span>
                    <Link to={`/suhbatlar/${p.id}`} className="matn">
                      {p.summary ?? "Xulosa yo'q"}
                    </Link>
                    <span className="sana">{fmtSana(p.startedAt)}</span>
                  </div>
                ))}
              </section>
            )}

            {/* Rahbar izohlari (FR-123): AI mezonlar doirasida gapiradi, rahbar kontekst beradi */}
            {(izohQoldiraOladi || umumiyIzohlar.length > 0) && (
              <section className="card sd-karta">
                <h2 className="sd-blok-sarlavha">Rahbar izohi</h2>
                {umumiyIzohlar.length === 0 && <p className="sd-bosh-matn">Hali izoh yo'q. AI baholaydi, siz kontekst berasiz.</p>}
                {umumiyIzohlar.map((x) => (
                  <div className="izoh-blok" key={x.id}>
                    <div className="bosh">
                      <b>{x.authorName ?? 'Rahbar'}</b>
                      <span className="vaqt">{fmtSana(x.createdAt)}</span>
                      {x.seenAt === null && <span className="badge kul">o'qilmagan</span>}
                    </div>
                    {x.body}
                  </div>
                ))}
                {izohQoldiraOladi && (
                  <div style={{ marginTop: 10 }}>
                    <textarea
                      value={yangiIzoh}
                      onChange={(e) => setYangiIzoh(e.target.value)}
                      placeholder="Masalan: bu mijoz bilan o'tgan safar ham narx bosqichida to'xtab qolgansiz — keyingi safar qiymatni oldin ayting."
                      rows={3}
                      style={{ width: '100%' }}
                    />
                    <button className="btn kichik" style={{ marginTop: 6 }} disabled={band || yangiIzoh.trim().length < 2} onClick={() => void izohYubor()}>
                      {band ? 'Saqlanmoqda…' : 'Izoh qoldirish'}
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        ))}

      {/* ═══ MEZONLAR ═══ */}
      {tab === 'mezonlar' && (
        <section className="card sd-karta">
          {categoryRollup.length === 0 ? (
            <div className="hech-narsa">Bu suhbat mezonlar bo'yicha baholanmagan.</div>
          ) : (
            <>
              <p className="sd-bosh-matn" style={{ marginTop: 0 }}>
                Isbotga bosing — {ovozli ? 'transkriptdagi' : 'yozishmadagi'} aynan o'sha joy ochiladi.
              </p>
              {categoryRollup.map((cat) => (
                <div key={cat.code} className="sd-kategoriya">
                  <div className="mezon-satr" style={{ paddingTop: 0 }}>
                    <span className="kod">{cat.code}</span>
                    <span className="nom" style={{ fontWeight: 700 }}>
                      {d.categoryNames[cat.code] ?? cat.code}
                    </span>
                    <div className="chiziq">
                      <div style={{ width: `${cat.pct ?? 0}%`, background: ballRang(cat.pct) }} />
                    </div>
                    <span className="foiz">{cat.pct === null ? '—' : `${Math.round(cat.pct)}%`}</span>
                  </div>
                  {cat.items.map((s) => (
                    <div
                      className={`mezon-karta${mezonYoritish === s.criterionCode ? ' yoritilgan' : ''}`}
                      key={s.criterionCode}
                      ref={(el) => {
                        if (el) mezonRefs.current.set(s.criterionCode, el);
                        else mezonRefs.current.delete(s.criterionCode);
                      }}
                      style={{ paddingLeft: 34 }}
                    >
                      <div className="bosh">
                        <span className="kod" style={{ fontWeight: 900, color: 'var(--text-secondary)', fontSize: 12 }}>
                          {s.criterionCode}
                        </span>
                        <span className="nom">{s.criterionName}</span>
                        <span className={`ball ${s.score === null ? 'yoq' : s.score >= 2 ? 'yuqori' : s.score === 1 ? 'orta' : 'past'}`}>
                          {s.score === null ? 'aniqlanmadi' : `${s.score}/${s.maxScore}`}
                        </span>
                      </div>
                      {s.evidenceQuote && (
                        <div
                          className="isbot-blok"
                          role="button"
                          tabIndex={0}
                          onClick={() => jumpTo(s.evidenceSegmentId, s.evidenceStartSeconds)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              jumpTo(s.evidenceSegmentId, s.evidenceStartSeconds);
                            }
                          }}
                          title={ovozli ? "Transkriptda ko'rsatish" : "Yozishmada ko'rsatish"}
                        >
                          <span className="vaqt-belgi">
                            {s.evidenceStartSeconds !== null ? (
                              <>
                                <Clock /> {vaqt(s.evidenceStartSeconds)}
                              </>
                            ) : (
                              <Quote />
                            )}
                          </span>
                          "{s.evidenceQuote}"
                        </div>
                      )}

                      {/* Shu mezonga qaratilgan rahbar izohi (FR-123) */}
                      {d.comments
                        .filter((x) => x.criterionCode === s.criterionCode)
                        .map((x) => (
                          <div className="izoh-blok" key={x.id}>
                            <b>{x.authorName ?? 'Rahbar'}:</b> {x.body}
                          </div>
                        ))}

                      {/* E'tiroz holati va tugmasi (FR-124) */}
                      {(() => {
                        const etiroz = d.appeals.find((x) => x.criterionScoreId === s.id);
                        if (etiroz) {
                          return (
                            <div className={`etiroz-holat ${etiroz.status}`}>
                              {etiroz.status === 'open' && (
                                <>
                                  <Hourglass /> E'tiroz: "{etiroz.reason}"
                                  {etirozHalQilaOladi && (
                                    <EtirozHal
                                      appeal={etiroz}
                                      maxScore={s.maxScore}
                                      isbotsiz={s.evidenceQuote === null}
                                      businessId={business!.businessId}
                                      onTugadi={load}
                                    />
                                  )}
                                </>
                              )}
                              {etiroz.status === 'accepted' && (
                                <>
                                  <Check /> E'tiroz qabul qilindi — ball {etiroz.originalScore ?? '—'} <ArrowRight /> <b>{etiroz.newScore}</b>
                                  {etiroz.resolutionNote && <> · {etiroz.resolutionNote}</>}
                                </>
                              )}
                              {etiroz.status === 'rejected' && (
                                <>
                                  <X /> E'tiroz rad etildi: {etiroz.resolutionNote}
                                </>
                              )}
                            </div>
                          );
                        }
                        if (!etirozBildiraOladi) return null;
                        if (etirozOchiq === s.id) {
                          return (
                            <div className="etiroz-forma">
                              <textarea
                                value={etirozSabab}
                                onChange={(e) => setEtirozSabab(e.target.value)}
                                placeholder="Nega bu baho noto'g'ri deb hisoblaysiz? Yozishmadagi qaysi joyni AI o'tkazib yuborgan?"
                                rows={3}
                                autoFocus
                              />
                              <div className="yordam">Kamida 10 belgi. Rahbar buni ko'radi.</div>
                              <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                                <button className="btn kichik" disabled={band || etirozSabab.trim().length < 10} onClick={() => void etirozYubor(s.id)}>
                                  Yuborish
                                </button>
                                <button
                                  className="btn ikkinchi kichik"
                                  onClick={() => {
                                    setEtirozOchiq(null);
                                    setEtirozSabab('');
                                  }}
                                >
                                  Bekor
                                </button>
                              </div>
                            </div>
                          );
                        }
                        return (
                          <button
                            className="etiroz-tugma"
                            onClick={() => {
                              setEtirozOchiq(s.id);
                              setEtirozSabab('');
                            }}
                          >
                            Bu baho noto'g'ri deb hisoblayman
                          </button>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              ))}
            </>
          )}
        </section>
      )}

      {/* ═══ TRANSKRIPT ═══ */}
      {tab === 'transkript' && (
        <section className="card sd-karta sd-transkript">
          {d.segments.length === 0 ? (
            <div className="hech-narsa">{ovozli ? "Transkript hali tayyor emas." : "Yozishma bo'sh."}</div>
          ) : (
            <>
              {visibleSegments.map((s) => {
                const mezonlar = segmentMezonlari.get(s.id) ?? [];
                const isbotli = mezonlar.length > 0;
                return (
                  <div
                    key={s.id}
                    ref={(el) => {
                      // Unmount bo'lganda o'chiramiz: aks holda DOM'dan uzilgan
                      // eski element qolib, sakrash "muvaffaqiyatli" hisoblanadi.
                      if (el) segRefs.current.set(s.id, el);
                      else segRefs.current.delete(s.id);
                    }}
                    className={`xabar ${s.speaker === 'manager' ? 'menejer' : 'mijoz'}${highlight === s.id ? ' yoritilgan' : ''}${isbotli ? ' isbotli' : ''}`}
                    {...(isbotli
                      ? {
                          role: 'button',
                          tabIndex: 0,
                          title: `Isbot: ${mezonlar.map((x) => x.kod).join(', ')} — bahoni ko'rish`,
                          onClick: () => mezongaSakra(mezonlar[0]!.kod),
                          onKeyDown: (e: React.KeyboardEvent) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              mezongaSakra(mezonlar[0]!.kod);
                            }
                          },
                        }
                      : {})}
                  >
                    <div className="kim">{s.speaker === 'manager' ? 'Menejer' : 'Mijoz'}</div>
                    {s.text}
                    {isbotli && (
                      <div className="isbot-belgilar">
                        {mezonlar.map((x) => (
                          <span key={x.kod} className="isbot-kod">
                            {x.kod}
                          </span>
                        ))}
                        <span className="isbot-izoh">bahoga asos bo'ldi</span>
                      </div>
                    )}
                    <div className="vaqt">{vaqt(s.startSeconds)}</div>
                  </div>
                );
              })}
              {hiddenCount > 0 && (
                <button className="btn ikkinchi kichik" style={{ width: '100%' }} onClick={() => setShowFullTranscript(true)}>
                  Yana {hiddenCount} ta xabarni ko'rsatish
                </button>
              )}
            </>
          )}
        </section>
      )}

      {xato && <div className="xato-qator">{xato}</div>}
    </div>
  );
}

function VadaRoyxat({ royxat }: { royxat: Detail['commitments'] }) {
  if (royxat.length === 0) return <span className="sd-xira">Kelishuv yo'q</span>;
  return (
    <span className="sd-vadalar">
      {royxat.map((v) => {
        const st = VADA_HOLAT_NOMI[v.status] ?? { nom: v.status, klass: 'kul' };
        return (
          <span key={v.id} className="sd-vada">
            {v.what}
            <span className={`badge ${st.klass}`}>{st.nom}</span>
          </span>
        );
      })}
    </span>
  );
}
