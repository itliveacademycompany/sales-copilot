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
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  api,
  ballKlass,
  fmtSana,
  lidTuri,
  type AlertRow,
  type BusinessProfile,
  type ConversationDetail,
  type ConversationRow,
  type PlaybookBody,
  type SeatRow,
} from '../api';
import { useAuth } from '../auth';
import { avatarRang, boshHarf, davomiylik, davomiylikMatn, qachon, suhbatlarniYukla } from '../components/bosh/malumot';
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
import { tafsilotOl } from '../components/tafsilotKesh';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QO'NG'IROQLAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Filtrlar URL'da saqlanadi (`?holat=done&sana=7kun`) — havolani ulashsa,
 * hamkasbi aynan shu ko'rinishni ochadi, sahifa yangilansa filtr yo'qolmaydi.
 *
 * Ro'yxat API'si kanal, suhbat turi va xizmat bo'yicha filtrlamaydi, telefon
 * raqamini ham bermaydi. Shuning uchun: davr bo'yicha suhbatlar sahifalab
 * yuklanadi, telefon kanali ajratiladi, so'ng har qo'ng'iroq tafsiloti
 * cheklangan parallellikda yuklanib keshlanadi. Tafsilot kelmaguncha unga
 * bog'liq filtrlar shu qatorni ko'rsatmaydi — bu holat ekranda yoziladi.
 */

const SAHIFA = 25;
const TAFSILOT_CHEGARA = 300;
const PARALLEL = 6;
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
  const [params, setParams] = useSearchParams();

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
  const [rows, setRows] = useState<ConversationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [xato, setXato] = useState<string | null>(null);
  const [seats, setSeats] = useState<SeatRow[]>([]);
  const [playbook, setPlaybook] = useState<PlaybookBody | null>(null);
  const [profilXizmat, setProfilXizmat] = useState<string[]>([]);
  const [ogohSoni, setOgohSoni] = useState(0);
  const [tafsilot, setTafsilot] = useState<Record<string, ConversationDetail>>({});
  const [yangilash, setYangilash] = useState(0);

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

  useEffect(() => {
    if (!business) return;
    let bekor = false;
    setLoading(true);
    setXato(null);
    void suhbatlarniYukla(biz, new Date(fromMs), 20)
      .then((hammasi) => {
        if (bekor) return;
        setRows(
          hammasi.filter((r) => {
            const t = new Date(r.startedAt).getTime();
            return r.channel === 'phone' && t >= fromMs && t < toMs;
          }),
        );
      })
      .catch(() => !bekor && setXato('Qo\'ng\'iroqlarni yuklab bo\'lmadi. Qayta urinib ko\'ring.'))
      .finally(() => !bekor && setLoading(false));
    return () => {
      bekor = true;
    };
  }, [business, biz, fromMs, toMs, yangilash]);

  // Tafsilotlar — cheklangan parallellik, keshlanadi
  const tafsilotRef = useRef(tafsilot);
  tafsilotRef.current = tafsilot;
  useEffect(() => {
    if (!business || rows.length === 0) return;
    let bekor = false;
    const navbat = rows
      .slice(0, TAFSILOT_CHEGARA)
      .map((r) => r.id)
      .filter((id) => !tafsilotRef.current[id]);
    const ishchi = async () => {
      while (!bekor && navbat.length > 0) {
        const id = navbat.shift()!;
        const d = await tafsilotOl(biz, id).catch(() => null);
        if (d && !bekor) setTafsilot((v) => ({ ...v, [id]: d }));
      }
    };
    void Promise.all(Array.from({ length: PARALLEL }, ishchi));
    return () => {
      bekor = true;
    };
  }, [business, biz, rows]);

  // ─── Filtrlash ───
  const seatNom = useMemo(() => new Map(seats.map((s) => [s.id, s.displayName])), [seats]);
  const oilaNom = useMemo(
    () => new Map((playbook?.classificationPolicy.callFamilies ?? []).map((f) => [f.key, f.name])),
    [playbook],
  );

  const mosHolat = (r: ConversationRow) =>
    holat.length === 0 || HOLATLAR.some((h) => holat.includes(h.qiymat) && h.mos(r));
  const mosOila = (r: ConversationRow) => {
    if (oila.length === 0) return true;
    const a = tafsilot[r.id]?.analysis;
    return oila.some((o) => {
      if (o === MAXSUS_YAQIN) return lidTuri(r.leadQuality) === 'hot';
      if (o === MAXSUS_BIZNES) return !!a?.businessRelevance && a.businessRelevance !== 'sales';
      return a?.callFamily === o;
    });
  };
  const mosXizmat = (r: ConversationRow) => {
    if (xizmat.length === 0) return true;
    const s = tafsilot[r.id]?.analysis?.serviceLine?.toLowerCase();
    return !!s && xizmat.some((x) => x.toLowerCase() === s);
  };
  const mosMenejer = (r: ConversationRow) =>
    menejer.length === 0 || menejer.includes(r.seatId ?? BIRIKTIRILMAGAN);
  const mosQidiruv = (r: ConversationRow) => {
    const q = qidiruv.trim().toLowerCase();
    if (!q) return true;
    const t = tafsilot[r.id];
    const qismlar = [
      r.summary,
      r.primaryGap,
      r.seatId ? seatNom.get(r.seatId) : null,
      t?.conversation.phoneFrom,
      t?.conversation.phoneTo,
      t?.contact?.name,
      t?.analysis?.callFamily ? oilaNom.get(t.analysis.callFamily) : null,
    ];
    return qismlar.some((s) => s?.toLowerCase().includes(q));
  };

  const [saralash, setSaralash] = useState<Saralash>({ ustun: 'vaqt', yon: 'kamayish' });
  const filtrlangan = useMemo(() => {
    const r = rows.filter((x) => mosHolat(x) && mosOila(x) && mosXizmat(x) && mosMenejer(x) && mosQidiruv(x));
    const qiymat = (x: ConversationRow): number => {
      if (saralash.ustun === 'ball') return x.overallScore === null ? -1 : Number(x.overallScore);
      if (saralash.ustun === 'davom') return tafsilot[x.id]?.conversation.durationSeconds ?? davomiylik(x) ?? -1;
      return new Date(x.startedAt).getTime();
    };
    return r.sort((a, b) => (saralash.yon === 'kamayish' ? qiymat(b) - qiymat(a) : qiymat(a) - qiymat(b)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, tafsilot, params, saralash, seatNom, oilaNom]);

  const [korsatish, setKorsatish] = useState(SAHIFA);
  useEffect(() => setKorsatish(SAHIFA), [params]);

  const tafsilotKutilmoqda =
    (oila.length > 0 || xizmat.length > 0 || qidiruv) &&
    rows.slice(0, TAFSILOT_CHEGARA).some((r) => !tafsilot[r.id]);
  const filtrBor =
    holat.length + oila.length + xizmat.length + menejer.length > 0 || !!qidiruv || sanaTuri !== '30kun';

  // ─── Tanlovlar (sonlar bilan) ───
  const sanoq = (f: (r: ConversationRow) => boolean) => rows.filter(f).length;
  const holatTanlov: Tanlov[] = HOLATLAR.map((h) => ({ qiymat: h.qiymat, nom: h.nom, soni: sanoq(h.mos) }));
  /**
   * Variantlar ikki manbadan: baholash mezonlarida e'lon qilinganlar VA
   * real tahlillarda uchraganlar. Faqat sozlamaga tayansak, mezonlarda
   * kiritilmagan (lekin AI aniqlagan) qiymat bo'yicha filtrlab bo'lmasdi
   * va ro'yxat bo'sh qolib "ishlamayapti" taassurotini berardi.
   */
  const uchragan = (olish: (d: ConversationDetail) => string | null | undefined) =>
    [...new Set(Object.values(tafsilot).map(olish).filter((v): v is string => !!v))];
  const oilaKalitlar = [
    ...(playbook?.classificationPolicy.callFamilies ?? []).map((f) => f.key),
    ...uchragan((d) => d.analysis?.callFamily),
  ];
  const oilaTanlov: Tanlov[] = [...new Set(oilaKalitlar)].map((k) => ({
    qiymat: k,
    nom: oilaNom.get(k) ?? k,
    soni: sanoq((r) => tafsilot[r.id]?.analysis?.callFamily === k),
  }));
  const maxsusTanlov: Tanlov[] = [
    {
      qiymat: MAXSUS_BIZNES,
      nom: 'Biznesga oid emas',
      soni: sanoq((r) => {
        const b = tafsilot[r.id]?.analysis?.businessRelevance;
        return !!b && b !== 'sales';
      }),
    },
    { qiymat: MAXSUS_YAQIN, nom: 'Yopilishga yaqin lidlar', soni: sanoq((r) => lidTuri(r.leadQuality) === 'hot') },
  ];
  // Xizmat yo'nalishlari: mezonlar + biznes profilidagi xizmatlar + AI aniqlaganlari
  // (katta-kichik harf farqi bilan takrorlanmaydi).
  const xizmatKalitlar = new Map<string, string>();
  for (const s of [
    ...(playbook?.classificationPolicy.serviceLines ?? []),
    ...profilXizmat,
    ...uchragan((d) => d.analysis?.serviceLine),
  ]) {
    const t = s.trim();
    if (t && !xizmatKalitlar.has(t.toLowerCase())) xizmatKalitlar.set(t.toLowerCase(), t);
  }
  const xizmatTanlov: Tanlov[] = [...xizmatKalitlar.values()].map((s) => ({
    qiymat: s,
    nom: s,
    soni: sanoq((r) => tafsilot[r.id]?.analysis?.serviceLine?.toLowerCase() === s.toLowerCase()),
  }));
  const menejerTanlov: Tanlov[] = [
    ...seats.map((s) => ({ qiymat: s.id, nom: s.displayName, soni: sanoq((r) => r.seatId === s.id) })),
    { qiymat: BIRIKTIRILMAGAN, nom: 'Biriktirilmagan', soni: sanoq((r) => !r.seatId) },
  ];

  // ─── Yaqinda ochilganlar ───
  const [tarix, setTarix] = useState<TarixBandi[]>(tarixOqi);
  const och = (r: ConversationRow) => {
    const band: TarixBandi = { id: r.id, nom: r.summary ?? 'Qo\'ng\'iroq', vaqt: r.startedAt };
    const yangi = [band, ...tarix.filter((t) => t.id !== r.id)].slice(0, 8);
    setTarix(yangi);
    try {
      localStorage.setItem(TARIX_KALIT, JSON.stringify(yangi));
    } catch {
      /* xotira yopiq */
    }
    navigate(`/suhbatlar/${r.id}`);
  };

  // ─── Eksport ───
  const eksport = (tur: 'xlsx' | 'csv') => {
    const sarlavha = [
      'Sana', 'Menejer', 'Mijoz telefoni', 'Holat', 'Ball (%)', 'Lid', 'Suhbat turi',
      'Xizmat', 'Davomiylik', 'Xulosa', 'Eng zaif joy', 'Havola',
    ];
    const qatorlar: Katak[][] = filtrlangan.map((r) => {
      const t = tafsilot[r.id];
      const lid = lidTuri(r.leadQuality);
      return [
        fmtSana(r.startedAt),
        r.seatId ? seatNom.get(r.seatId) ?? '' : 'Biriktirilmagan',
        t?.conversation.phoneFrom ?? t?.conversation.phoneTo ?? '',
        HOLAT_BELGI[r.status]?.nom ?? r.status,
        r.overallScore === null ? null : Math.round(Number(r.overallScore) * 10) / 10,
        lid === 'hot' ? 'Issiq' : lid === 'warm' ? 'Iliq' : lid === 'cold' ? 'Sovuq' : '',
        t?.analysis?.callFamily ? oilaNom.get(t.analysis.callFamily) ?? t.analysis.callFamily : '',
        t?.analysis?.serviceLine ?? '',
        davomiylikMatn(t?.conversation.durationSeconds ?? davomiylik(r)),
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
        aria-label={`${nom} bo'yicha saralash`}
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
          Qo'ng'iroqlar{' '}
          <span
            className="malumot-ikon"
            title="Telefon suhbatlari: yozuv matnga aylantiriladi va baholash mezonlari bo'yicha isbot bilan baholanadi. Telefoniya avtomatik ulanishi keyingi bosqichda — hozircha yozuv qo'lda yuklanadi."
          >
            <FileText />
          </span>
        </h1>
        {business.permissions.includes('playbook:write') && (
          <div className="qongiroq-yuklash">
            <SuhbatYuklash
              businessId={business.businessId}
              kanal="phone"
              tugmaMatni="Qo'ng'iroq yuklash"
              onYuklandi={(id) => {
                setYangilash((v) => v + 1);
                navigate(`/suhbatlar/${id}`);
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
              placeholder="Mijoz, telefon, menejer yoki qo'ng'iroq mazmuni"
              aria-label="Qo'ng'iroqlarni qidirish"
            />
            {qidiruvMatn && (
              <button type="button" onClick={() => setQidiruvMatn('')} aria-label="Qidiruvni tozalash">
                <X />
              </button>
            )}
          </div>

          <FiltrTugma ikon={<Filter />} nom="Holat" soni={holat.length} faol={holat.length > 0}>
            {() => (
              <TanlovRoyxat
                sarlavha="Holat"
                guruhlar={[{ tanlovlar: holatTanlov }]}
                tanlangan={holat}
                onOzgar={(v) => yangila({ holat: v })}
              />
            )}
          </FiltrTugma>

          <FiltrTugma ikon={<CircleCheck />} nom="Yo'nalish" soni={oila.length} faol={oila.length > 0} kenglik={300}>
            {() => (
              <TanlovRoyxat
                sarlavha="Yo'nalish"
                guruhlar={[
                  { nom: 'Qo\'ng\'iroq oilalari', tanlovlar: oilaTanlov },
                  { nom: 'Maxsus filtrlar', tanlovlar: maxsusTanlov },
                ]}
                tanlangan={oila}
                onOzgar={(v) => yangila({ oila: v })}
              />
            )}
          </FiltrTugma>

          <FiltrTugma ikon={<CircleCheck />} nom="Xizmat yo'nalishi" soni={xizmat.length} faol={xizmat.length > 0}>
            {() => (
              <TanlovRoyxat
                sarlavha="Xizmat yo'nalishi"
                guruhlar={[{ tanlovlar: xizmatTanlov }]}
                tanlangan={xizmat}
                onOzgar={(v) => yangila({ xizmat: v })}
                bosh={
                  <>
                    Hali xizmat yo'nalishi kiritilmagan.
                    {business.permissions.includes('playbook:write') && (
                      <button type="button" className="btn kichik tanlov-qosh" onClick={() => navigate('/playbook')}>
                        + Yo'nalish qo'shish
                      </button>
                    )}
                  </>
                }
              />
            )}
          </FiltrTugma>

          <FiltrTugma ikon={<UserRound />} nom="Menejer" soni={menejer.length} faol={menejer.length > 0}>
            {() => (
              <TanlovRoyxat
                sarlavha="Menejer"
                guruhlar={[{ tanlovlar: menejerTanlov }]}
                tanlangan={menejer}
                onOzgar={(v) => yangila({ menejer: v })}
              />
            )}
          </FiltrTugma>

          <FiltrTugma
            ikon={<CalendarDays />}
            nom="Sana"
            qiymat={sanaTuri === 'maxsus' ? sanaMatn(from, to) : SANA_NOMLARI[sanaTuri] ?? sanaMatn(from, to)}
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
              Filtrlarni tozalash
            </button>
          )}
        </div>

        <div className="filtr-ong">
          <EksportMenyu soni={filtrlangan.length} onEksport={eksport} />
          <TarixMenyu
            tarix={tarix}
            onOch={(id) => navigate(`/suhbatlar/${id}`)}
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
        {!loading && !xato && (
          <span>
            {filtrlangan.length} ta qo'ng'iroq
            {filtrlangan.length !== rows.length && ` (jami ${rows.length})`} · {sanaMatn(from, to)}
          </span>
        )}
        {tafsilotKutilmoqda && <span className="qongiroq-yuklanmoqda">Tafsilotlar yuklanmoqda — natija to'ldirilmoqda…</span>}
      </div>

      <div className="card qongiroq-jadval-karta">
        {loading ? (
          <div className="yuklanmoqda">Yuklanmoqda…</div>
        ) : xato ? (
          <div className="hech-narsa">
            {xato}
            <div style={{ marginTop: 12 }}>
              <button className="btn" onClick={() => setYangilash((v) => v + 1)}>
                Qayta urinish
              </button>
            </div>
          </div>
        ) : filtrlangan.length === 0 ? (
          <div className="hech-narsa">
            <div className="katta-ikon">{rows.length === 0 ? <Search /> : <SearchX />}</div>
            <b style={{ color: 'var(--text-primary)' }}>Ma'lumot topilmadi</b>
            <div style={{ maxWidth: 440, margin: '6px auto 0' }}>
              {rows.length === 0
                ? 'Tanlangan davrda qo\'ng\'iroq yo\'q. Davrni kengaytiring yoki qo\'ng\'iroq yozuvini yuklang.'
                : 'Filtrlarga mos qo\'ng\'iroq yo\'q. Filtrlarni yumshatib ko\'ring.'}
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
                Filtrlarni tozalash
              </button>
            )}
          </div>
        ) : (
          <>
            <table className="jadval qongiroq-jadval">
              <thead>
                <tr>
                  <th>{saralashTugma('vaqt', 'Vaqt')}</th>
                  <th>Menejer</th>
                  <th>Mijoz va mazmun</th>
                  <th>{saralashTugma('davom', 'Davomiylik')}</th>
                  <th>Holat</th>
                  <th>{saralashTugma('ball', 'Ball')}</th>
                </tr>
              </thead>
              <tbody>
                {filtrlangan.slice(0, korsatish).map((r) => {
                  const t = tafsilot[r.id];
                  const b = r.overallScore === null ? null : Number(r.overallScore);
                  const h = HOLAT_BELGI[r.status] ?? { nom: r.status, klass: 'kul' };
                  const ism = r.seatId ? seatNom.get(r.seatId) ?? 'Menejer' : 'Biriktirilmagan';
                  const lid = lidTuri(r.leadQuality);
                  const turi = t?.analysis?.callFamily ? oilaNom.get(t.analysis.callFamily) ?? t.analysis.callFamily : null;
                  const mijoz = t?.contact?.name ?? t?.conversation.phoneFrom ?? t?.conversation.phoneTo ?? null;
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
                          {t?.analysis?.serviceLine && <span className="teg">{t.analysis.serviceLine}</span>}
                          {lid === 'hot' && <span className="teg yuqori">Issiq lid</span>}
                          {lid === 'warm' && <span className="teg orta">Iliq lid</span>}
                          {r.isFlagged && (
                            <span className="badge qizil">
                              <Flag /> ko'rik
                            </span>
                          )}
                        </span>
                        <span className="q-xulosa">
                          {r.summary ?? r.excludedReason ?? 'Tahlil kutilmoqda'}
                        </span>
                      </td>
                      <td className="q-son">{davomiylikMatn(t?.conversation.durationSeconds ?? davomiylik(r))}</td>
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
            {filtrlangan.length > korsatish && (
              <div className="qongiroq-yana">
                <button className="btn ikkinchi" onClick={() => setKorsatish((v) => v + SAHIFA)}>
                  Yana {Math.min(SAHIFA, filtrlangan.length - korsatish)} ta ko'rsatish
                </button>
                <span>
                  {korsatish} / {filtrlangan.length}
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
        title={`${soni} ta qatorni yuklab olish`}
      >
        <Download /> Eksport <ChevronDown className={`eksport-strelka${ochiq ? ' ochiq' : ''}`} />
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
              ? 'Eksport uchun qator yo\'q — davr yoki filtrlarni o\'zgartiring'
              : `${soni} ta qator — joriy filtr bo'yicha`}
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
        aria-label="Yaqinda ochilgan qo'ng'iroqlar"
        title="Yaqinda ochilganlar"
      >
        <History />
      </button>
      {ochiq && (
        <div className="filtr-panel ong tarix-panel" role="dialog" aria-label="Yaqinda ochilganlar">
          <div className="tanlov-bosh">
            <b>Yaqinda ochilganlar</b>
            {tarix.length > 0 && (
              <button type="button" className="tanlov-tozala" onClick={onTozala}>
                Tozalash
              </button>
            )}
          </div>
          {tarix.length === 0 ? (
            <div className="tanlov-bosh-matn">Hali hech qaysi qo'ng'iroq ochilmagan</div>
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
