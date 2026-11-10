import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  ChevronDown,
  CircleCheck,
  Download,
  FileSpreadsheet,
  FileText,
  Filter,
  Flag,
  History,
  Search,
  SearchX,
  UserRound,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { crmdami } from '../components/IlovaAlmashtirgich';
import {
  api,
  ballKlass,
  fmtSana,
  lidTuri,
  type AlertRow,
  type BusinessProfile,
  type ConversationRow,
  type PlaybookBody,
  type SeatRow,
} from '../api';
import { useAuth } from '../auth';
import { useT } from '../i18n';
import { avatarRang, boshHarf, davomiylik, davomiylikMatn, qachon } from '../components/bosh/malumot';
import { TepaPanel } from '../components/bosh/TepaPanel';
import { csvYukla, xlsxYukla, type Katak } from '../components/qongiroq/eksport';
import {
  FiltrTugma,
  SANA_NOMLARI,
  SanaTanlagich,
  TanlovRoyxat,
  kunBoshi,
  sanaMatn,
  sanaOraliq,
  useTashqiBosish,
  type SanaTuri,
  type Tanlov,
} from '../components/qongiroq/Filtrlar';
import { SuhbatYuklash } from '../components/SuhbatYuklash';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QO'NG'IROQLAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Filtrlar URL'da saqlanadi (`?holat=done&sana=7kun`) — havolani ulashsa,
 * hamkasbi aynan shu ko'rinishni ochadi, sahifa yangilansa filtr yo'qolmaydi.
 *
 * Davr bo'yicha suhbatlar sahifalab yuklanadi va telefon kanali ajratiladi.
 * Suhbat turi, xizmat, telefon, mijoz ismi va davomiylik ro'yxat API'sining
 * o'zida keladi. Ilgari ular har qator uchun alohida detal so'rovi bilan
 * olinardi (N+1, 300 tagacha so'rov) — sahifa bir ochilishda rate-limitga
 * urilib, butun ofisda sayt bir daqiqa "Serverda xatolik" berardi.
 */

const SAHIFA = 25;
const TARIX_KALIT = 'sotuvai-qongiroq-tarix';

const HOLATLAR: { qiymat: string; nom: string; mos: (r: ConversationRow) => boolean }[] = [
  { qiymat: 'done', nom: 'Tahlil qilingan', mos: (r) => r.status === 'done' },
  {
    qiymat: 'jarayonda',
    nom: 'Tahlil qilinmoqda',
    mos: (r) => ['queued', 'transcribing', 'analyzing'].includes(r.status),
  },
  { qiymat: 'received', nom: 'Kutilmoqda', mos: (r) => r.status === 'received' },
  { qiymat: 'failed', nom: 'Xatolik', mos: (r) => r.status === 'failed' },
  { qiymat: 'filtered', nom: 'Filtrlangan', mos: (r) => r.status === 'filtered' },
  { qiymat: 'korik', nom: 'Ko\'rik kerak', mos: (r) => !!r.isFlagged },
];

const HOLAT_BELGI: Record<string, { nom: string; klass: string }> = {
  received: { nom: 'Kutilmoqda', klass: 'kul' },
  queued: { nom: 'Navbatda', klass: 'navy' },
  transcribing: { nom: 'Matnga aylanmoqda', klass: 'sariq' },
  analyzing: { nom: 'Tahlilda', klass: 'sariq' },
  done: { nom: 'Tahlil qilingan', klass: 'ok' },
  failed: { nom: 'Xatolik', klass: 'qizil' },
  filtered: { nom: 'Filtrlangan', klass: 'kul' },
};

const MAXSUS_BIZNES = 'maxsus:biznesga-oid-emas';
const MAXSUS_YAQIN = 'maxsus:yopilishga-yaqin';
const BIRIKTIRILMAGAN = 'biriktirilmagan';

type Saralash = { ustun: 'vaqt' | 'ball' | 'davom'; yon: 'kamayish' | 'osish' };

/** `GET …/calls` (backend `http/routes/suhbat-royxati.ts`) — davr bo'yicha filtr variantlari sonlari. */
interface CallsSonlar {
  holat: Record<string, number>;
  maxsus: Record<string, number>;
  oila: Record<string, number>;
  xizmat: Record<string, number>;
  menejer: Record<string, number>;
}

interface CallsJavob {
  /** Filtrga mos jami. */
  jami: number;
  /** Davrdagi jami (filtrlarsiz). */
  davrdaJami: number;
  sonlar: CallsSonlar;
  rows: ConversationRow[];
}

interface TarixBandi {
  id: string;
  nom: string;
  vaqt: string;
}

function tarixOqi(): TarixBandi[] {
  try {
    return JSON.parse(localStorage.getItem(TARIX_KALIT) ?? '[]') as TarixBandi[];
  } catch {
    return [];
  }
}

function royxat(p: URLSearchParams, kalit: string): string[] {
  return (p.get(kalit) ?? '').split(',').filter(Boolean);
}

function sanaInput(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function Qongiroqlar() {
  const { business, user } = useAuth();
  const navigate = useNavigate();
  const tr = useT();
  const [params, setParams] = useSearchParams();
  // CRM menyusidan ochilgan bo'lsa, qo'ng'iroq ham CRM ichida ochilsin —
  // aks holda /suhbatlar/:id foydalanuvchini Deal Mind menyusiga otib yuborardi.
  const suhbatYoli = crmdami(useLocation().pathname) ? '/crm/suhbatlar' : '/suhbatlar';

  // ─── Filtr holati (URL'dan) ───
  const qidiruv = params.get('q') ?? '';
  const holat = royxat(params, 'holat');
  const oila = royxat(params, 'oila');
  const xizmat = royxat(params, 'xizmat');
  const menejer = royxat(params, 'menejer');
  const sanaTuri = (params.get('sana') as SanaTuri | null) ?? '30kun';

  const { from, to } = useMemo(() => {
    if (sanaTuri === 'maxsus') {
      const f = params.get('from');
      const t = params.get('to');
      if (f && t) {
        const fd = kunBoshi(new Date(f));
        const td = new Date(kunBoshi(new Date(t)).getTime() + 86400_000);
        if (!Number.isNaN(fd.getTime()) && !Number.isNaN(td.getTime())) return { from: fd, to: td };
      }
      return sanaOraliq('30kun');
    }
    return sanaOraliq(sanaTuri in SANA_NOMLARI ? (sanaTuri as Exclude<SanaTuri, 'maxsus'>) : '30kun');
  }, [sanaTuri, params]);

  const yangila = useCallback(
    (ozgarish: Record<string, string | string[] | null>) => {
      setParams(
        (eski) => {
          const p = new URLSearchParams(eski);
          for (const [k, v] of Object.entries(ozgarish)) {
            const qiymat = Array.isArray(v) ? v.join(',') : v;
            if (qiymat) p.set(k, qiymat);
            else p.delete(k);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Qidiruv maydoni — URL'ga 250 ms kechikish bilan (har harfda tarix to'lmasin)
  const [qidiruvMatn, setQidiruvMatn] = useState(qidiruv);
  useEffect(() => {
    const t = setTimeout(() => {
      if (qidiruvMatn !== qidiruv) yangila({ q: qidiruvMatn.trim() || null });
    }, 250);
    return () => clearTimeout(t);
  }, [qidiruvMatn, qidiruv, yangila]);

  // ─── Ma'lumot ───
  /**
   * SERVER TOMONDA FILTR VA SAHIFALASH (`GET …/calls`).
   *
   * Ilgari 30 kunlik barcha qo'ng'iroqlar (1200+ qator, ~1.5 MB, har birida
   * xulosa matni) brauzerga yuklanib, filtr/qidiruv/saralash shu yerda
   * qilinardi; 20 000 dan oshgani jimgina kesilardi. Endi brauzer faqat
   * ko'rinadigan sahifani (25 ta) va filtr variantlari sonlarini oladi.
   * "Yana ko'rsatish" keyingi sahifani so'raydi.
   */
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [jami, setJami] = useState(0);
  const [davrdaJami, setDavrdaJami] = useState(0);
  const [sonlar, setSonlar] = useState<CallsSonlar | null>(null);
  const [loading, setLoading] = useState(true);
  const [yanaYuklanmoqda, setYanaYuklanmoqda] = useState(false);
  const [xato, setXato] = useState<string | null>(null);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [playbook, setPlaybook] = useState<PlaybookBody | null>(null);
  const [profilXizmat, setProfilXizmat] = useState<string[]>([]);
  const [ogohSoni, setOgohSoni] = useState(0);
  const [yangilash, setYangilash] = useState(0);
  const [saralash, setSaralash] = useState<Saralash>({ ustun: 'vaqt', yon: 'kamayish' });

  const biz = business ? `/api/v1/businesses/${business.businessId}` : '';
  const fromMs = from.getTime();
  const toMs = to.getTime();

  useEffect(() => {
    if (!business) return;
    void api.get<SeatRow[]>(`${biz}/seats`).then(setSeats).catch(() => undefined);
    void api.get<PlaybookBody>(`${biz}/playbook`).then(setPlaybook).catch(() => undefined);
    void api
      .get<{ profile: BusinessProfile }>(`${biz}/profile`)
      .then((r) => setProfilXizmat(r.profile.primaryOffers ?? []))
      .catch(() => undefined);
    if (business.permissions.includes('alert:read')) {
      void api
        .get<{ alerts: AlertRow[]; unseenCount: number }>(`${biz}/alerts?limit=1`)
        .then((r) => setOgohSoni(r.unseenCount))
        .catch(() => undefined);
    }
  }, [business, biz]);

  /** Joriy filtrlar → so'rov satri (sahifa va hajmsiz). */
  const filtrSatri = useMemo(() => {
    const p = new URLSearchParams({
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
      sort: saralash.ustun,
      dir: saralash.yon === 'kamayish' ? 'desc' : 'asc',
    });
    if (holat.length) p.set('holat', holat.join(','));
    if (oila.length) p.set('oila', oila.join(','));
    if (xizmat.length) p.set('xizmat', xizmat.join(','));
    if (menejer.length) p.set('menejer', menejer.join(','));
    if (qidiruv.trim()) p.set('q', qidiruv.trim());
    return p.toString();
    // `holat` va boshqalar har renderda yangi massiv — kalit sifatida params satri olinadi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromMs, toMs, saralash, params.toString()]);

  /** Eskirgan javob yangisini bosib ketmasin (tez filtr almashtirilganda). */
  const sorovRaqami = useRef(0);

  useEffect(() => {
    if (!business) return;
    const raqam = ++sorovRaqami.current;
    setLoading(true);
    setXato(null);
    void api
      .get<CallsJavob>(`${biz}/calls?${filtrSatri}&limit=${SAHIFA}&offset=0`)
      .then((r) => {
        if (raqam !== sorovRaqami.current) return;
        setRows(r.rows);
        setJami(r.jami);
        setDavrdaJami(r.davrdaJami);
        setSonlar(r.sonlar);
      })
      .catch(() => raqam === sorovRaqami.current && setXato(tr("Qo'ng'iroqlarni yuklab bo'lmadi. Qayta urinib ko'ring.")))
      .finally(() => raqam === sorovRaqami.current && setLoading(false));
  }, [business, biz, filtrSatri, yangilash, tr]);

  const yanaYukla = () => {
    if (yanaYuklanmoqda) return;
    const raqam = sorovRaqami.current;
    setYanaYuklanmoqda(true);
    void api
      .get<CallsJavob>(`${biz}/calls?${filtrSatri}&limit=${SAHIFA}&offset=${rows.length}`)
      .then((r) => {
        if (raqam !== sorovRaqami.current) return;
        setRows((eski) => [...eski, ...r.rows.filter((x) => !eski.some((e) => e.id === x.id))]);
        setJami(r.jami);
      })
      .catch(() => undefined)
      .finally(() => setYanaYuklanmoqda(false));
  };

  // ─── Nomlar ───
  const seatNom = useMemo(() => new Map(seats.map((s) => [s.id, s.displayName])), [seats]);
  const oilaNom = useMemo(
    () => new Map((playbook?.classificationPolicy.callFamilies ?? []).map((f) => [f.key, f.name])),
    [playbook],
  );

  const filtrBor =
    holat.length + oila.length + xizmat.length + menejer.length > 0 || !!qidiruv || sanaTuri !== '30kun';

  // ─── Tanlovlar (sonlar serverdan — davr bo'yicha, boshqa filtrlarsiz) ───
  const holatTanlov: Tanlov[] = HOLATLAR.map((h) => ({
    qiymat: h.qiymat,
    nom: tr(h.nom),
    soni: sonlar?.holat[h.qiymat] ?? 0,
  }));
  /**
   * Variantlar ikki manbadan: baholash mezonlarida e'lon qilinganlar VA
   * real tahlillarda uchraganlar (server sonlari kalitlari). Faqat sozlamaga
   * tayansak, mezonlarda kiritilmagan (lekin AI aniqlagan) qiymat bo'yicha
   * filtrlab bo'lmasdi.
   */
  const oilaKalitlar = [
    ...(playbook?.classificationPolicy.callFamilies ?? []).map((f) => f.key),
    ...Object.keys(sonlar?.oila ?? {}),
  ];
  const oilaTanlov: Tanlov[] = [...new Set(oilaKalitlar)].map((k) => ({
    qiymat: k,
    nom: oilaNom.get(k) ?? k,
    soni: sonlar?.oila[k] ?? 0,
  }));
  const maxsusTanlov: Tanlov[] = [
    { qiymat: MAXSUS_BIZNES, nom: tr('Biznesga oid emas'), soni: sonlar?.maxsus[MAXSUS_BIZNES] ?? 0 },
    { qiymat: MAXSUS_YAQIN, nom: tr('Yopilishga yaqin lidlar'), soni: sonlar?.maxsus[MAXSUS_YAQIN] ?? 0 },
  ];
  // Xizmat yo'nalishlari: mezonlar + biznes profilidagi xizmatlar + AI aniqlaganlari
  // (katta-kichik harf farqi bilan takrorlanmaydi, sonlar ham shunday qo'shiladi).
  const xizmatKalitlar = new Map<string, string>();
  for (const s of [
    ...(playbook?.classificationPolicy.serviceLines ?? []),
    ...profilXizmat,
    ...Object.keys(sonlar?.xizmat ?? {}),
  ]) {
    const t = s.trim();
    if (t && !xizmatKalitlar.has(t.toLowerCase())) xizmatKalitlar.set(t.toLowerCase(), t);
  }
  const xizmatSoni = (s: string) =>
    Object.entries(sonlar?.xizmat ?? {}).reduce((jam, [k, n]) => jam + (k.toLowerCase() === s.toLowerCase() ? n : 0), 0);
  const xizmatTanlov: Tanlov[] = [...xizmatKalitlar.values()].map((s) => ({ qiymat: s, nom: s, soni: xizmatSoni(s) }));
  const menejerTanlov: Tanlov[] = [
    ...seats.map((s) => ({ qiymat: s.id, nom: s.displayName, soni: sonlar?.menejer[s.id] ?? 0 })),
    { qiymat: BIRIKTIRILMAGAN, nom: tr('Biriktirilmagan'), soni: sonlar?.menejer[BIRIKTIRILMAGAN] ?? 0 },
  ];

  // ─── Yaqinda ochilganlar ───
  const [tarix, setTarix] = useState<TarixBandi[]>(tarixOqi);
  const och = (r: ConversationRow) => {
    const band: TarixBandi = { id: r.id, nom: r.summary ?? tr("Qo'ng'iroq"), vaqt: r.startedAt };
    const yangi = [band, ...tarix.filter((t) => t.id !== r.id)].slice(0, 8);
    setTarix(yangi);
    try {
      localStorage.setItem(TARIX_KALIT, JSON.stringify(yangi));
    } catch {
      /* xotira yopiq */
    }
    navigate(`${suhbatYoli}/${r.id}`);
  };

  // ─── Eksport ───
  /**
   * Eksport filtrga mos BARCHA qo'ng'iroqlarni serverdan bir martada oladi
   * (ekrandagi 25 tasini emas). Chegara — 5000 qator.
   */
  const [eksportBand, setEksportBand] = useState(false);
  const eksport = async (tur: 'xlsx' | 'csv') => {
    if (eksportBand) return;
    setEksportBand(true);
    let hammasi: ConversationRow[];
    try {
      hammasi = (await api.get<CallsJavob>(`${biz}/calls?${filtrSatri}&limit=5000&offset=0`)).rows;
    } catch {
      return;
    } finally {
      setEksportBand(false);
    }
    const sarlavha = [
      'Sana', 'Menejer', 'Mijoz telefoni', 'Holat', 'Ball (%)', 'Lid', 'Suhbat turi',
      'Xizmat', 'Davomiylik', 'Xulosa', 'Eng zaif joy', 'Havola',
    ].map((s) => tr(s));
    const qatorlar: Katak[][] = hammasi.map((r) => {
      const lid = lidTuri(r.leadQuality);
      return [
        fmtSana(r.startedAt),
        r.seatId ? seatNom.get(r.seatId) ?? '' : tr('Biriktirilmagan'),
        // Chiquvchida phoneFrom — menejer raqami bo'lishi mumkin; mijoz raqami yo'nalishga qarab
        (r.direction === 'outbound' ? r.phoneTo : r.phoneFrom) || r.phoneTo || r.phoneFrom || '',
        HOLAT_BELGI[r.status] ? tr(HOLAT_BELGI[r.status]!.nom) : r.status,
        r.overallScore === null ? null : Math.round(Number(r.overallScore) * 10) / 10,
        lid === 'hot' ? tr('Issiq') : lid === 'warm' ? tr('Iliq') : lid === 'cold' ? tr('Sovuq') : '',
        r.callFamily ? oilaNom.get(r.callFamily) ?? r.callFamily : '',
        r.serviceLine ?? '',
        davomiylikMatn(r.durationSeconds ?? davomiylik(r)),
        r.summary ?? '',
        r.primaryGap ?? '',
        `${window.location.origin}/suhbatlar/${r.id}`,
      ];
    });
    const nom = `qongiroqlar_${sanaInput(from)}_${sanaInput(new Date(to.getTime() - 1))}`;
    if (tur === 'csv') csvYukla(nom, sarlavha, qatorlar);
    else xlsxYukla(nom, sarlavha, qatorlar, [16, 20, 16, 16, 10, 9, 24, 18, 12, 60, 40, 44]);
  };

  if (!business) return null;

  const saralashTugma = (ustun: Saralash['ustun'], nom: string) => {
    const faol = saralash.ustun === ustun;
    return (
      <button
        type="button"
        className={`saralash-tugma${faol ? ' faol' : ''}`}
        onClick={() =>
          setSaralash({ ustun, yon: faol && saralash.yon === 'kamayish' ? 'osish' : 'kamayish' })
        }
        aria-label={tr("{nom} bo'yicha saralash", { nom })}
      >
        {nom}
        {faol ? saralash.yon === 'kamayish' ? <ArrowDown /> : <ArrowUp /> : <ArrowUpDown />}
      </button>
    );
  };

  return (
    <div className="qongiroq-sahifa">
      <TepaPanel
        biznesNomi={business.name}
        foydalanuvchi={user?.displayName ?? ''}
        ogohSoni={ogohSoni}
        ogohKoradi={business.permissions.includes('alert:read')}
        suhbatlar={rows}
      />

      <div className="qongiroq-bosh">
        <h1>
          {tr("Qo'ng'iroqlar")}{' '}
          <span
            className="malumot-ikon"
            title={tr(
              "Telefon suhbatlari: yozuv matnga aylantiriladi va baholash mezonlari bo'yicha isbot bilan baholanadi. Moi Zvonki ulangan bo'lsa yozuvlar avtomatik keladi; boshqa yozuvni qo'lda yuklash mumkin.",
            )}
          >
            <FileText />
          </span>
        </h1>
        {business.permissions.includes('playbook:write') && (
          <div className="qongiroq-yuklash">
            <SuhbatYuklash
              businessId={business.businessId}
              kanal="phone"
              tugmaMatni={tr("Qo'ng'iroq yuklash")}
              onYuklandi={(id) => {
                setYangilash((v) => v + 1);
                navigate(`${suhbatYoli}/${id}`);
              }}
            />
          </div>
        )}
      </div>

      {/* ─── Filtrlar qatori ─── */}
      <div className="filtr-qator">
        <div className="filtr-chap">
          <div className="filtr-qidiruv">
            <Search aria-hidden="true" />
            <input
              value={qidiruvMatn}
              onChange={(e) => setQidiruvMatn(e.target.value)}
              placeholder={tr("Mijoz, telefon, menejer yoki qo'ng'iroq mazmuni")}
              aria-label={tr("Qo'ng'iroqlarni qidirish")}
            />
            {qidiruvMatn && (
              <button type="button" onClick={() => setQidiruvMatn('')} aria-label={tr('Qidiruvni tozalash')}>
                <X />
              </button>
            )}
          </div>

          <FiltrTugma ikon={<Filter />} nom={tr('Holat')} soni={holat.length} faol={holat.length > 0}>
            {() => (
              <TanlovRoyxat
                sarlavha={tr('Holat')}
                guruhlar={[{ tanlovlar: holatTanlov }]}
                tanlangan={holat}
                onOzgar={(v) => yangila({ holat: v })}
              />
            )}
          </FiltrTugma>

          <FiltrTugma ikon={<CircleCheck />} nom={tr("Yo'nalish")} soni={oila.length} faol={oila.length > 0} kenglik={300}>
            {() => (
              <TanlovRoyxat
                sarlavha={tr("Yo'nalish")}
                guruhlar={[
                  { nom: tr("Qo'ng'iroq oilalari"), tanlovlar: oilaTanlov },
                  { nom: tr('Maxsus filtrlar'), tanlovlar: maxsusTanlov },
                ]}
                tanlangan={oila}
                onOzgar={(v) => yangila({ oila: v })}
              />
            )}
          </FiltrTugma>

          <FiltrTugma ikon={<CircleCheck />} nom={tr("Xizmat yo'nalishi")} soni={xizmat.length} faol={xizmat.length > 0}>
            {() => (
              <TanlovRoyxat
                sarlavha={tr("Xizmat yo'nalishi")}
                guruhlar={[{ tanlovlar: xizmatTanlov }]}
                tanlangan={xizmat}
                onOzgar={(v) => yangila({ xizmat: v })}
                bosh={
                  <>
                    {tr("Hali xizmat yo'nalishi kiritilmagan.")}
                    {business.permissions.includes('playbook:write') && (
                      <button type="button" className="btn kichik tanlov-qosh" onClick={() => navigate('/playbook')}>
                        + {tr("Yo'nalish qo'shish")}
                      </button>
                    )}
                  </>
                }
              />
            )}
          </FiltrTugma>

          <FiltrTugma ikon={<UserRound />} nom={tr('Menejer')} soni={menejer.length} faol={menejer.length > 0}>
            {() => (
              <TanlovRoyxat
                sarlavha={tr('Menejer')}
                guruhlar={[{ tanlovlar: menejerTanlov }]}
                tanlangan={menejer}
                onOzgar={(v) => yangila({ menejer: v })}
              />
            )}
          </FiltrTugma>

          <FiltrTugma
            ikon={<CalendarDays />}
            nom={tr('Sana')}
            qiymat={
              sanaTuri === 'maxsus'
                ? sanaMatn(from, to)
                : SANA_NOMLARI[sanaTuri]
                  ? tr(SANA_NOMLARI[sanaTuri])
                  : sanaMatn(from, to)
            }
            faol
          >
            {(yop) => (
              <SanaTanlagich
                turi={sanaTuri}
                from={from}
                to={to}
                onTanla={(t, f, tt) => {
                  if (t === 'maxsus') {
                    yangila({ sana: 'maxsus', from: sanaInput(f), to: sanaInput(new Date(tt.getTime() - 1)) });
                  } else {
                    yangila({ sana: t === '30kun' ? null : t, from: null, to: null });
                  }
                  yop();
                }}
              />
            )}
          </FiltrTugma>

          {filtrBor && (
            <button
              type="button"
              className="filtr-tozala"
              onClick={() => {
                setQidiruvMatn('');
                setParams(new URLSearchParams(), { replace: true });
              }}
            >
              {tr('Filtrlarni tozalash')}
            </button>
          )}
        </div>

        <div className="filtr-ong">
          <EksportMenyu soni={jami} onEksport={(t) => void eksport(t)} />
          <TarixMenyu
            tarix={tarix}
            onOch={(id) => navigate(`${suhbatYoli}/${id}`)}
            onTozala={() => {
              setTarix([]);
              try {
                localStorage.removeItem(TARIX_KALIT);
              } catch {
                /* e'tiborsiz */
              }
            }}
          />
        </div>
      </div>

      {/* ─── Natija ─── */}
      <div className="qongiroq-holat-qator" aria-live="polite">
        {!xato && sonlar && (
          <span>
            {tr("{n} ta qo'ng'iroq", { n: jami })}
            {jami !== davrdaJami && ` ${tr('(jami {n})', { n: davrdaJami })}`} · {sanaMatn(from, to)}
          </span>
        )}
      </div>

      <div className="card qongiroq-jadval-karta">
        {/* Filtr almashganda jadval o'rnida qoladi — har safar "Yuklanmoqda" bilan sakramasin */}
        {loading && rows.length === 0 ? (
          <div className="yuklanmoqda">{tr('Yuklanmoqda…')}</div>
        ) : xato ? (
          <div className="hech-narsa">
            {xato}
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setYangilash((v) => v + 1)}>
                {tr('Qayta urinish')}
              </button>
            </div>
          </div>
        ) : !loading && jami === 0 ? (
          <div className="hech-narsa">
            <div className="katta-ikon">{davrdaJami === 0 ? <Search /> : <SearchX />}</div>
            <b style={{ color: 'var(--text-primary)' }}>{tr("Ma'lumot topilmadi")}</b>
            <div style={{ maxWidth: 440, margin: '6px auto 0' }}>
              {davrdaJami === 0
                ? tr("Tanlangan davrda qo'ng'iroq yo'q. Davrni kengaytiring yoki qo'ng'iroq yozuvini yuklang.")
                : tr("Filtrlarga mos qo'ng'iroq yo'q. Filtrlarni yumshatib ko'ring.")}
            </div>
            {filtrBor && (
              <button
                className="btn ikkinchi"
                style={{ marginTop: 14 }}
                onClick={() => {
                  setQidiruvMatn('');
                  setParams(new URLSearchParams(), { replace: true });
                }}
              >
                {tr('Filtrlarni tozalash')}
              </button>
            )}
          </div>
        ) : (
          <>
            <table
              className="jadval qongiroq-jadval"
              aria-busy={loading}
              style={loading ? { opacity: 0.55, transition: 'opacity .15s' } : undefined}
            >
              <thead>
                <tr>
                  <th>{saralashTugma('vaqt', tr('Vaqt'))}</th>
                  <th>{tr('Menejer')}</th>
                  <th>{tr('Mijoz va mazmun')}</th>
                  <th>{saralashTugma('davom', tr('Davomiylik'))}</th>
                  <th>{tr('Holat')}</th>
                  <th>{saralashTugma('ball', tr('Ball'))}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const b = r.overallScore === null ? null : Number(r.overallScore);
                  const hb = HOLAT_BELGI[r.status];
                  const h = hb ? { nom: tr(hb.nom), klass: hb.klass } : { nom: r.status, klass: 'kul' };
                  const ism = r.seatId ? seatNom.get(r.seatId) ?? tr('Menejer') : tr('Biriktirilmagan');
                  const lid = lidTuri(r.leadQuality);
                  const turi = r.callFamily ? oilaNom.get(r.callFamily) ?? r.callFamily : null;
                  // `||` — bo'sh satr ism ham telefonga o'tsin
                  const mijoz = r.contactName || (r.direction === 'outbound' ? r.phoneTo : r.phoneFrom) || r.phoneTo || r.phoneFrom || null;
                  return (
                    <tr
                      key={r.id}
                      className="bosiladigan"
                      onClick={() => och(r)}
                      tabIndex={0}
                      onKeyDown={(e) => e.key === 'Enter' && och(r)}
                    >
                      <td className="q-vaqt">
                        <b>{fmtSana(r.startedAt)}</b>
                        <small>{qachon(r.startedAt)}</small>
                      </td>
                      <td>
                        <span className="q-menejer">
                          <span className="q-avatar" style={{ background: r.seatId ? avatarRang(ism) : 'var(--n-300)' }}>
                            {boshHarf(ism)}
                          </span>
                          {ism}
                        </span>
                      </td>
                      <td className="q-mazmun">
                        <span className="q-teglar">
                          {mijoz && <b>{mijoz}</b>}
                          {turi && <span className="teg kok">{turi}</span>}
                          {r.serviceLine && <span className="teg">{r.serviceLine}</span>}
                          {lid === 'hot' && <span className="teg yuqori">{tr('Issiq lid')}</span>}
                          {lid === 'warm' && <span className="teg orta">{tr('Iliq lid')}</span>}
                          {r.isFlagged && (
                            <span className="badge qizil">
                              <Flag /> {tr("ko'rik")}
                            </span>
                          )}
                        </span>
                        <span className="q-xulosa">
                          {r.summary ?? r.excludedReason ?? tr('Tahlil kutilmoqda')}
                        </span>
                      </td>
                      <td className="q-son">{davomiylikMatn(r.durationSeconds ?? davomiylik(r))}</td>
                      <td>
                        <span className={`badge ${h.klass}`}>{h.nom}</span>
                      </td>
                      <td>
                        <span className={`ball ${ballKlass(b)}`}>{b === null ? '—' : `${Math.round(b * 10) / 10}%`}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length < jami && (
              <div className="qongiroq-yana">
                <button className="btn ikkinchi" onClick={yanaYukla} disabled={yanaYuklanmoqda}>
                  {yanaYuklanmoqda
                    ? tr('Yuklanmoqda…')
                    : tr("Yana {n} ta ko'rsatish", { n: Math.min(SAHIFA, jami - rows.length) })}
                </button>
                <span>
                  {rows.length} / {jami}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ─── Eksport menyusi ────────────────────────────────────────────────────────

function EksportMenyu({ soni, onEksport }: { soni: number; onEksport: (t: 'xlsx' | 'csv') => void }) {
  const tr = useT();
  const [ochiq, setOchiq] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useTashqiBosish(ref, ochiq, () => setOchiq(false));
  return (
    <div className="filtr" ref={ref}>
      <button
        type="button"
        className="btn ikkinchi eksport-tugma"
        onClick={() => setOchiq((v) => !v)}
        aria-expanded={ochiq}
        aria-haspopup="menu"
        title={tr('{n} ta qatorni yuklab olish', { n: soni })}
      >
        <Download /> {tr('Eksport')} <ChevronDown className={`eksport-strelka${ochiq ? ' ochiq' : ''}`} />
      </button>
      {ochiq && (
        <div className="filtr-panel ong eksport-panel" role="menu">
          {/* Menyu ma'lumot yo'q paytda ham ochiladi — tugma "ishlamayapti"
              degan taassurot qoldirmasin; sababi pastda aniq yoziladi. */}
          <button
            type="button"
            role="menuitem"
            disabled={soni === 0}
            onClick={() => {
              onEksport('xlsx');
              setOchiq(false);
            }}
          >
            <FileSpreadsheet /> Excel <small>.xlsx</small>
          </button>
          <button
            type="button"
            role="menuitem"
            disabled={soni === 0}
            onClick={() => {
              onEksport('csv');
              setOchiq(false);
            }}
          >
            <FileText /> CSV <small>.csv</small>
          </button>
          <div className="eksport-izoh">
            {soni === 0
              ? tr("Eksport uchun qator yo'q — davr yoki filtrlarni o'zgartiring")
              : tr("{n} ta qator — joriy filtr bo'yicha", { n: soni })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Yaqinda ochilganlar ────────────────────────────────────────────────────

function TarixMenyu({
  tarix,
  onOch,
  onTozala,
}: {
  tarix: TarixBandi[];
  onOch: (id: string) => void;
  onTozala: () => void;
}) {
  const tr = useT();
  const [ochiq, setOchiq] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useTashqiBosish(ref, ochiq, () => setOchiq(false));
  return (
    <div className="filtr" ref={ref}>
      <button
        type="button"
        className="tarix-tugma"
        onClick={() => setOchiq((v) => !v)}
        aria-expanded={ochiq}
        aria-label={tr("Yaqinda ochilgan qo'ng'iroqlar")}
        title={tr('Yaqinda ochilganlar')}
      >
        <History />
      </button>
      {ochiq && (
        <div className="filtr-panel ong tarix-panel" role="dialog" aria-label={tr('Yaqinda ochilganlar')}>
          <div className="tanlov-bosh">
            <b>{tr('Yaqinda ochilganlar')}</b>
            {tarix.length > 0 && (
              <button type="button" className="tanlov-tozala" onClick={onTozala}>
                {tr('Tozalash')}
              </button>
            )}
          </div>
          {tarix.length === 0 ? (
            <div className="tanlov-bosh-matn">{tr("Hali hech qaysi qo'ng'iroq ochilmagan")}</div>
          ) : (
            tarix.map((t) => (
              <button
                type="button"
                key={t.id}
                className="tarix-band"
                onClick={() => {
                  setOchiq(false);
                  onOch(t.id);
                }}
              >
                <b>{t.nom}</b>
                <small>{fmtSana(t.vaqt)}</small>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
