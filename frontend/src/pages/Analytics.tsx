import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ANALITIKA_BOLIMLAR, bolimTopildi, type BolimSlug } from '../analyticsSections';
import {
  api,
  ballKlass,
  ballMatnRang,
  ballRang,
  fmtKun,
  fmtPul,
  fmtSana,
  fmtSoniya,
  type AnalyticsActivity,
  type AnalyticsClients,
  type AnalyticsCoaching,
  type AnalyticsCustomer,
  type AnalyticsFunnel,
  type AnketaSavol,
  type AnalyticsLeads,
  type AnalyticsMix,
  type AnalyticsOverview,
  type AnalyticsQuality,
  type AnalyticsTasks,
  type AnalyticsTeam,
  type AnalyticsVoice,
  type CoachingCall,
  type CriterionDetail,
  type SeatMatrix,
  type TaskSource,
} from '../api';
import { useAuth } from '../auth';
import {
  BoshQator,
  Chiziqlar,
  Doira,
  Gauge,
  GuruhUstunlar,
  Kombo,
  KopChiziq,
  Metrika,
  Ustunlar,
  YigmaUstunlar,
  ZoomTrend,
} from '../components/Charts';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ANALITIKA — "nega shunday?" ekrani
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Dashboard'dan farqi vazifasida: Dashboard 30 soniyada HOLATNI aytadi,
 * bu yerda esa SABAB qidiriladi. Shu sababli bo'limlar savolga qarab
 * ajratilgan, jadval turiga qarab emas:
 *
 *   Umumiy    — davr qanday o'tdi va oldingi davrga nisbatan qanday?
 *   Sifat     — qaysi bosqichda yiqilyapmiz?
 *   Jamoa     — kimga nimani o'rgatish kerak?
 *   Lidlar    — mijozlar nimadan qo'rqadi?
 *   Vazifalar — tahlil harakatga aylandimi?
 *   Faoliyat  — qachon va qancha ishlanyapti?
 *   Mijozlar  — kim qaytib kelyapti?
 *
 * ── Nol va "aniqlanmadi" farqi ──────────────────────────────────────────────
 * Backend `null` qaytarsa, u yerda "—" chiziladi, 0 EMAS. Rahbar uchun bu
 * farq hal qiluvchi: "0 ta bitim" — yomon natija, "aniqlanmadi" esa
 * o'lchov yo'qligi. Ikkinchisini nol deb ko'rsatish — mavjud bo'lmagan
 * ishonch bilan noto'g'ri qaror qildirish.
 */

/* Bo'limlar ro'yxati `analyticsSections.ts` da — yon panel ham shu
   manbadan o'qiydi, shuning uchun ikkalasi hech qachon ajralib qolmaydi. */

const TAYYOR = [
  { key: 'bugun', nom: 'Bugun', kun: 1 },
  { key: '3kun', nom: '3 kun', kun: 3 },
  { key: 'hafta', nom: 'Hafta', kun: 7 },
  { key: 'oy', nom: 'Oy', kun: 30 },
  { key: 'chorak', nom: '3 oy', kun: 90 },
] as const;

const HAFTA_KUNI = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];

/**
 * "Ish vaqti 9:00–18:00 · Du, Se, Ch, Pa, Ju, Sh" — sozlamadan.
 *
 * Ilgari bu matn kodda qat'iy yozilgan edi. Endi jadval o'zgarsa,
 * izoh ham o'zgaradi va raqam bilan hech qachon zid bo'lmaydi.
 */
function ishVaqtiMatn(w: { startHour: number; endHour: number; days: number[] }): string {
  const kunlar = w.days
    .slice()
    .sort((a, b) => a - b)
    .map((d) => HAFTA_KUNI[d - 1])
    .join(', ');
  const s = String(w.startHour).padStart(2, '0');
  const e = String(w.endHour).padStart(2, '0');
  return `Ish vaqti ${s}:00–${e}:00 · ${kunlar} (Sozlamalar → Ish jadvali)`;
}

/** `YYYY-MM-DD` — `<input type="date">` uchun. */
function isoKun(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Foizli o'zgarish. Oldingi davr nol bo'lsa foiz ma'nosiz — null. */
function ozgarish(hozir: number | null, oldin: number | null): number | null {
  if (hozir === null || oldin === null || oldin === 0) return null;
  return ((hozir - oldin) / oldin) * 100;
}

function son(v: number | null | undefined, qoshimcha = ''): string {
  return v === null || v === undefined ? '—' : `${v}${qoshimcha}`;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MA'LUMOT YUKLASH — FAQAT ochilgan bo'lim uchun
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MUAMMO
 * ──────
 * Ilgari sahifa ochilganda 12 ta endpoint bir yo'la so'ralardi — qaysi
 * bo'lim ochiq bo'lishidan qat'i nazar. "Umumiy ko'rinish" ga ikkita
 * so'rov yetadi, qolgan o'ntasi ekranga umuman chiqmasdi.
 *
 * Undan ham yomoni: `taskManba` (faqat Vazifalar bo'limiga tegishli) yoki
 * `qaytaOyna` (faqat Faoliyat) o'zgarsa, O'N IKKALASI qayta so'ralardi.
 * Ya'ni bitta ochiladigan ro'yxatni almashtirish 12 ta so'rov yuborardi.
 *
 * Brauzer bitta domenga bir vaqtda ~6 ta ulanish ochadi, shuning uchun
 * ortiqcha so'rovlar navbatga tushib, KERAKLI so'rovlarni ham
 * kechiktirardi (o'lchandi: birinchisi 28 ms, oxirgisi 150 ms).
 *
 * YECHIM
 * ──────
 * Har bo'lim o'ziga kerakli manbani e'lon qiladi va faqat o'shalar
 * yuklanadi. Yuklangan ma'lumot saqlanadi — bo'limlar orasida u yoq-bu
 * yoq yurish qayta so'rov tug'dirmaydi.
 *
 * Har manbaning O'Z kaliti bor va u faqat o'ziga tegishli parametrlarni
 * o'z ichiga oladi. Shu tufayli `taskManba` o'zgarsa faqat `tasks`
 * qayta so'raladi.
 */

/** Analitika ma'lumot manbalari. */
type Manba =
  | 'overview'
  | 'mix'
  | 'quality'
  | 'voice'
  | 'team'
  | 'coaching'
  | 'leads'
  | 'funnel'
  | 'tasks'
  | 'activity'
  | 'clients'
  | 'customer';

/**
 * Qaysi bo'lim nimaga muhtoj.
 *
 * Bu ro'yxat komponentlar bilan bir xil bo'lishi shart: bo'limga yangi
 * blok qo'shilsa, uning manbasi ham shu yerga qo'shiladi. Aks holda blok
 * abadiy "Yuklanmoqda" da qolardi — xato darhol ko'rinadi, jimgina
 * o'tib ketmaydi.
 */
const BOLIM_MANBALARI: Record<BolimSlug, Manba[]> = {
  umumiy: ['overview', 'mix'],
  sifat: ['quality', 'voice'],
  jamoa: ['team', 'coaching'],
  vazifalar: ['tasks'],
  // `Mijozlar` bloki `mix` va `leads` ni ham chizadi — ular ham shu
  // ro'yxatda bo'lishi shart, aks holda blok bo'sh chiqardi.
  mijozlar: ['clients', 'customer', 'mix', 'leads'],
  faoliyat: ['activity'],
  lidlar: ['leads', 'funnel'],
};

interface Manbalar {
  overview: { current: AnalyticsOverview; previous: AnalyticsOverview } | null;
  mix: AnalyticsMix | null;
  quality: AnalyticsQuality | null;
  voice: AnalyticsVoice | null;
  team: AnalyticsTeam | null;
  coaching: AnalyticsCoaching | null;
  leads: AnalyticsLeads | null;
  funnel: AnalyticsFunnel | null;
  tasks: AnalyticsTasks | null;
  activity: AnalyticsActivity | null;
  clients: AnalyticsClients | null;
  customer: AnalyticsCustomer | null;
}

const BOSH_MANBALAR: Manbalar = {
  overview: null,
  mix: null,
  quality: null,
  voice: null,
  team: null,
  coaching: null,
  leads: null,
  funnel: null,
  tasks: null,
  activity: null,
  clients: null,
  customer: null,
};

export function Analytics() {
  const { business } = useAuth();
  /**
   * Bo'lim URL'da (`/analitika/sifat`), React holatida emas.
   *
   * Sabab: yon paneldagi havolalar shu bo'limga to'g'ridan-to'g'ri olib
   * borishi, brauzerning "orqaga" tugmasi ishlashi va havolani ulashib
   * bo'lishi kerak. Holatda saqlansa, uchalasi ham yo'qolardi.
   */
  const { bolim: bolimParam } = useParams();
  const navigate = useNavigate();
  const bolim = bolimTopildi(bolimParam);

  /**
   * Noma'lum bo'lim kelsa manzil kanonik ko'rinishga tuzatiladi.
   *
   * Faqat kontentni almashtirish yetarli emas edi: URL noto'g'ri qolib,
   * yon panelda hech bir bo'lim yoritilmasdi — foydalanuvchi qayerda
   * turganini ko'rmasdi. `replace` — noto'g'ri manzil tarixda qolmasin.
   */
  useEffect(() => {
    if (bolimParam !== bolim) navigate(`/analitika/${bolim}`, { replace: true });
  }, [bolimParam, bolim, navigate]);
  const [tayyor, setTayyor] = useState<string>('hafta');
  const [from, setFrom] = useState(() => isoKun(new Date(Date.now() - 7 * 86400_000)));
  const [to, setTo] = useState(() => isoKun(new Date()));
  const [taskManba, setTaskManba] = useState<TaskSource>('all');
  const [qaytaOyna, setQaytaOyna] = useState(30);

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * MA'LUMOT YUKLASH — FAQAT ochilgan bo'lim uchun
   * ═══════════════════════════════════════════════════════════════════════
   *
   * MUAMMO
   * ──────
   * Ilgari sahifa ochilganda 12 ta endpoint bir yo'la so'ralardi — qaysi
   * bo'lim ochiq bo'lishidan qat'i nazar. "Umumiy ko'rinish" ga ikkita
   * so'rov yetadi, qolganlari ekranga umuman chiqmasdi.
   *
   * Undan ham yomoni: `taskManba` (faqat Vazifalar bo'limiga tegishli)
   * yoki `qaytaOyna` (faqat Faoliyat) o'zgarsa, O'N IKKALASI qayta
   * so'ralardi — bitta ochiladigan ro'yxatni almashtirish 12 ta so'rov
   * yuborardi.
   *
   * Brauzer bitta domenga bir vaqtda ~6 ta ulanish ochadi, shuning uchun
   * ortiqcha so'rovlar navbatga tushib KERAKLI so'rovlarni ham
   * kechiktirardi (o'lchandi: birinchisi 28 ms, oxirgisi 150 ms).
   *
   * YECHIM
   * ──────
   * Har manbaning O'Z kaliti bor va u faqat o'ziga tegishli
   * parametrlardan tuziladi. Kalit o'zgarmasa — qayta so'ralmaydi.
   * Bo'limlar orasida yurish ham qayta so'rov tug'dirmaydi.
   */
  const [manbalar, setManbalar] = useState<Manbalar>(BOSH_MANBALAR);
  const [loading, setLoading] = useState(true);
  const [xato, setXato] = useState<string | null>(null);
  /** Yuklangan manbalarning kalitlari — takroriy so'rovni to'sadi. */
  const kalitlar = useRef<Partial<Record<Manba, string>>>({});

  const yukla = useCallback(() => {
    if (!business) return;
    const base = `/api/v1/businesses/${business.businessId}/analytics`;
    // `to` — tanlangan kunning OXIRI: aks holda bugungi kun tanlansa,
    // bugun bo'lgan suhbatlar oraliqdan tushib qolardi.
    const q =
      `?from=${encodeURIComponent(new Date(`${from}T00:00:00`).toISOString())}` +
      `&to=${encodeURIComponent(new Date(`${to}T23:59:59`).toISOString())}`;

    /**
     * Manbaning manzili.
     *
     * `tasks` va `activity` o'z parametrlarini qo'shadi — shu tufayli
     * ularning kaliti boshqalarnikidan mustaqil o'zgaradi.
     */
    const manzil = (m: Manba): string => {
      if (m === 'tasks') return `${base}/tasks${q}&source=${taskManba}`;
      if (m === 'activity') return `${base}/activity${q}&callbackMinutes=${qaytaOyna}`;
      return `${base}/${m}${q}`;
    };

    const kerak = (BOLIM_MANBALARI[bolim] ?? []).filter(
      (m) => kalitlar.current[m] !== manzil(m),
    );
    if (kerak.length === 0) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setXato(null);
    void Promise.all(kerak.map((m) => api.get<unknown>(manzil(m))))
      .then((javoblar) => {
        setManbalar((oldin) => {
          const yangi = { ...oldin } as Record<string, unknown>;
          kerak.forEach((m, i) => {
            yangi[m] = javoblar[i];
            kalitlar.current[m] = manzil(m);
          });
          return yangi as unknown as Manbalar;
        });
      })
      .catch((e) => setXato(e instanceof Error ? e.message : 'Yuklab bo\'lmadi'))
      .finally(() => setLoading(false));
  }, [business, from, to, taskManba, qaytaOyna, bolim]);

  useEffect(yukla, [yukla]);

  const {
    overview,
    mix,
    quality,
    voice,
    team,
    coaching,
    leads,
    funnel,
    tasks,
    activity,
    clients,
    customer,
  } = manbalar;

  function tayyorTanla(key: string, kun: number) {
    setTayyor(key);
    setTo(isoKun(new Date()));
    setFrom(isoKun(new Date(Date.now() - kun * 86400_000)));
  }

  if (loading && !overview) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>Analitika</h1>
          <div className="izoh">Raqamlar ortidagi sabab</div>
        </div>
      </div>

      {/* ─── Davr tanlash ─── */}
      <div className="sana-oraliq">
        <div className="tab-qator">
          {TAYYOR.map((d) => (
            <button
              key={d.key}
              className={`tab ${tayyor === d.key ? 'active' : ''}`}
              onClick={() => tayyorTanla(d.key, d.kun)}
            >
              {d.nom}
            </button>
          ))}
        </div>
        <input
          type="date"
          value={from}
          max={to}
          aria-label="Boshlanish sanasi"
          onChange={(e) => {
            setFrom(e.target.value);
            setTayyor('maxsus');
          }}
        />
        <span style={{ color: 'var(--text-secondary)' }}>—</span>
        <input
          type="date"
          value={to}
          min={from}
          aria-label="Tugash sanasi"
          onChange={(e) => {
            setTo(e.target.value);
            setTayyor('maxsus');
          }}
        />
      </div>

      {/* Yuqoridagi tablar yon panel bilan bir xil manbadan — ikkalasi
          bir xil bo'limlarni, bir xil tartibda ko'rsatadi. */}
      <div className="tab-qator" style={{ marginBottom: 14 }}>
        {ANALITIKA_BOLIMLAR.map((b) => (
          <button
            key={b.slug}
            className={`tab ${bolim === b.slug ? 'active' : ''}`}
            onClick={() => navigate(`/analitika/${b.slug}`)}
          >
            {b.nom}
          </button>
        ))}
      </div>

      {xato && <div className="xato-qator">{xato}</div>}
      {loading && <div className="ok-qator">Yangilanmoqda…</div>}

      {bolim === 'umumiy' && overview && mix && <Umumiy o={overview} mix={mix} />}
      {bolim === 'sifat' && quality && <Sifat q={quality} ovoz={voice} />}
      {bolim === 'jamoa' && team && <Jamoa t={team} k={coaching} />}
      {bolim === 'lidlar' && leads && <Lidlar l={leads} v={funnel} />}
      {bolim === 'vazifalar' && tasks && (
        <Vazifalar v={tasks} manba={taskManba} manbaOzgardi={setTaskManba} />
      )}
      {bolim === 'faoliyat' && activity && (
        <Faoliyat f={activity} oynaOzgardi={setQaytaOyna} />
      )}
      {bolim === 'mijozlar' && clients && (
        <Mijozlar c={clients} m={customer} mix={mix} leads={leads} />
      )}
    </>
  );
}

/* ═══════════════════════════ UMUMIY KO'RINISH ═══════════════════════════ */

function Umumiy({
  o,
  mix,
}: {
  o: { current: AnalyticsOverview; previous: AnalyticsOverview };
  mix: AnalyticsMix;
}) {
  const c = o.current;
  const p = o.previous;

  return (
    <>
      <div className="metrika-grid">
        <Metrika
          nom="Suhbatlar"
          qiymat={String(c.conversations)}
          ost="% oldingi davrga"
          delta={ozgarish(c.conversations, p.conversations)}
        />
        <Metrika
          nom="Baholangan"
          qiymat={String(c.scored)}
          ost={`${c.analyzed} tahlil qilingan`}
        />
        <Metrika
          nom="Suhbat sifati"
          qiymat={c.avgScore === null ? '—' : `${c.avgScore}%`}
          rang={ballRang(c.avgScore)}
          ost="% oldingi davrga"
          delta={ozgarish(c.avgScore, p.avgScore)}
        />
        <Metrika
          nom="Sifatli lid"
          qiymat={c.leadConversionPct === null ? '—' : `${c.leadConversionPct}%`}
          ost={
            c.leadKnown === 0
              ? 'lid sifati aniqlanmagan'
              : `${c.warmLeads}/${c.leadKnown} issiq va iliq`
          }
        />
        <Metrika
          nom="Vazifa bajarilishi"
          qiymat={c.taskCompletionPct === null ? '—' : `${c.taskCompletionPct}%`}
          rang={c.tasksOverdue > 0 ? 'var(--past)' : undefined}
          ost={c.tasksOverdue > 0 ? `${c.tasksOverdue} ta muddati o'tgan` : `${c.tasks} ta vazifa`}
        />
        <Metrika
          nom="Bayroqli suhbat"
          qiymat={String(c.flagged)}
          rang={c.flagged > 0 ? 'var(--past)' : undefined}
          ost="qo'lda ko'rish kerak"
        />
      </div>

      {/*
        Bitim summasi ALOHIDA blokda va qamrov ochiq yozilgan. Sabab: u
        faqat model aniq raqam eshitgan suhbatlardan yig'iladi, ya'ni
        "haqiqiy tushum" emas. Qamrovni yashirsak, rahbar buni jami savdo
        deb o'qiydi va noto'g'ri xulosa chiqaradi.
      */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Suhbatda tilga olingan bitimlar"
          ost={`${c.conversations} ta suhbatdan ${c.dealKnown} tasida summa aytilgan — bu buxgalteriya tushumi emas`}
        />
        <div className="metrika-grid" style={{ marginBottom: 0 }}>
          <Metrika nom="Jami aytilgan summa" qiymat={fmtPul(c.dealSum)} />
          <Metrika nom="O'rtacha summa" qiymat={fmtPul(c.avgDeal)} />
          <Metrika
            nom="Qamrov"
            qiymat={
              c.conversations === 0
                ? '—'
                : `${Math.round((c.dealKnown / c.conversations) * 100)}%`
            }
            ost={`${c.dealKnown} ta suhbat`}
          />
          <Metrika nom="AI xarajati" qiymat={c.aiCostUsd === null ? '—' : `$${c.aiCostUsd}`} />
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <BoshQator
            nom="Qo'ng'iroqlar nimadan iborat"
            ost="Ish vaqtining qanchasi haqiqiy sotuvga ketyapti"
          />
          <Doira data={mix.businessRelevance} />
        </div>
        <div className="card">
          <BoshQator nom="Murojaat turlari" ost="Rang — o'rtacha ball" />
          <Chiziqlar data={mix.callFamily} rangBall />
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <BoshQator nom="Xizmat yo'nalishlari" />
          <Chiziqlar data={mix.serviceLine} rangBall />
        </div>
        <div className="card">
          <BoshQator nom="Kanallar" />
          <Chiziqlar data={mix.channel} rangBall />
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════ SIFAT NAZORATI ═══════════════════════════ */

/** Baholangan mezonlarni eng zaifdan tartiblaydi (shovqinni chetlab). */
function engZaiflar(criteria: CriterionDetail[], nechta: number): CriterionDetail[] {
  return criteria
    // Bir-ikkita baho tasodifiy bo'lishi mumkin — "eng zaif joy" deb
    // ko'rsatish uchun kamida 3 ta baho kerak. Aks holda bitta yomon
    // suhbat butun mezonni "asosiy muammo" qilib qo'yardi.
    .filter((c) => c.scored >= 3 && c.avgPct !== null)
    .sort((a, b) => (a.avgPct ?? 100) - (b.avgPct ?? 100))
    .slice(0, nechta);
}

/** Rubrika juftligi — "hozir shunday" va "shunga intilish kerak". */
function RubrikaJuft({ c }: { c: CriterionDetail }) {
  // Ikkalasi ham bo'lmasa blok chizilmaydi: bo'sh ramka ma'lumot emas.
  if (!c.typicalText && !c.targetText) return null;
  return (
    <>
      {c.typicalText && (
        <div className="rubrika-blok hozir">
          <span className="yorliq">Hozir ko'proq uchraydi</span>
          {c.typicalText}
        </div>
      )}
      {c.targetText && c.typicalLevel !== c.targetLevel && (
        <div className="rubrika-blok intilish">
          <span className="yorliq">Intilish kerak</span>
          {c.targetText}
        </div>
      )}
    </>
  );
}

function Sifat({ q, ovoz }: { q: AnalyticsQuality; ovoz: AnalyticsVoice | null }) {
  const muammolar = engZaiflar(q.criteria, 6);

  return (
    <>
      {/* ─── 1. Asosiy sifat muammolari ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Asosiy sifat muammolari"
          ost="Eng zaif mezonlardan boshlang — kouchingni aynan shu yerdan boshlash kerak"
        />
        {muammolar.length === 0 ? (
          <div className="hech-narsa">
            Bu davrda yetarli baho yo'q — mezon "asosiy muammo" deb belgilanishi uchun
            kamida 3 marta baholangan bo'lishi kerak.
          </div>
        ) : (
          <div className="muammo-grid">
            {muammolar.map((c, i) => (
              <div
                className="muammo-karta jonli-kirish"
                key={`${c.code} ${c.name}`}
                style={{ '--i': i } as React.CSSProperties}
              >
                <div className="bosh">
                  <span className="kod">{c.code}</span>
                  <span className="foiz" style={{ color: ballRang(c.avgPct) }}>
                    {c.avgPct === null ? '—' : `${c.avgPct}%`}
                  </span>
                </div>
                <div className="nom">{c.name}</div>
                {c.description && <div className="tavsif">{c.description}</div>}
                <RubrikaJuft c={c} />
                <div className="past-qator">
                  <span>Zaif holatlar</span>
                  <span className="yol">
                    <div
                      style={{
                        width: `${c.scored > 0 ? (c.weakCount / c.scored) * 100 : 0}%`,
                        background: 'var(--past)',
                      }}
                    />
                  </span>
                  <b>{c.weakCount}</b>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── 2. Mezonlar bajarilishi ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Mezonlar bajarilishi"
          ost="Playbookdagi barcha mezonlar — kod tartibida"
        />
        {q.criteria.length === 0 ? (
          <div className="hech-narsa">Bu davrda baholangan suhbat yo'q</div>
        ) : (
          [...q.criteria]
            // Kod bir xil bo'lsa nom bo'yicha — tartib barqaror bo'lishi
            // uchun (bitta kod ostida ikkita ta'rif bo'lishi mumkin).
            .sort((a, b) => a.code.localeCompare(b.code) || a.name.localeCompare(b.name))
            .map((c, i) => (
              <div className="mezon-toliq" key={`${c.code} ${c.name}`}>
                <div className="qator">
                  <span className="kod">{c.code}</span>
                  <span className="nom">{c.name}</span>
                  {c.weakCount > 0 && <span className="zaif-belgi">{c.weakCount} zaif</span>}
                  <span className="foiz" style={{ color: ballRang(c.avgPct) }}>
                    {c.avgPct === null ? '—' : `${c.avgPct}%`}
                  </span>
                </div>
                {c.description && <div className="tavsif">{c.description}</div>}
                <div className="yol jonli-chiziq">
                  <div
                    style={
                      {
                        width: `${c.avgPct ?? 0}%`,
                        background: ballRang(c.avgPct),
                        '--i': i,
                      } as React.CSSProperties
                    }
                  />
                </div>
                {c.unknownCount > 0 && (
                  <div className="tavsif" style={{ marginTop: 4, marginBottom: 0 }}>
                    {c.scored} ta baholandi · {c.unknownCount} ta aniqlanmadi (isbot topilmadi —
                    bu past ball emas)
                  </div>
                )}
              </div>
            ))
        )}
      </div>

      {/* ─── 3. Menejer-mezon xaritasi ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="karta-bosh">
          <div>
            <h2>Menejer-mezon xaritasi</h2>
            <div className="diag-ost">Kimga aynan qaysi mezonni o'rgatish kerakligi</div>
          </div>
          <div className="xarita-afsona">
            <span className="band">
              <span className="nuqta" style={{ background: 'var(--past)' }} /> 0–40%
            </span>
            <span className="band">
              <span className="nuqta" style={{ background: 'var(--orta)' }} /> 40–60%
            </span>
            <span className="band">
              <span className="nuqta" style={{ background: 'var(--info)' }} /> 60–80%
            </span>
            <span className="band">
              <span className="nuqta" style={{ background: 'var(--yuqori)' }} /> 80–100%
            </span>
          </div>
        </div>
        <Xarita m={q.seatMatrix} />
      </div>

      {/* ─── 4. Ovoz: gaplashish nisbati va qizil bayroqlar ─── */}
      {ovoz && <Ovoz v={ovoz} />}

      {/* ─── 5. Kategoriya kesimi va taqsimot ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Kategoriyalar bo'yicha"
          ost="Eng pastdan boshlab — bu jamoaning umumiy zaif bo'g'ini"
        />
        {q.categories.length === 0 ? (
          <div className="hech-narsa">Bu davrda baholangan suhbat yo'q</div>
        ) : (
          q.categories.map((k, i) => (
            <div className="mezon-satr" key={k.categoryCode}>
              <span className="kod">{k.categoryCode}</span>
              <span className="nom">
                {k.scored} ta baholandi
                {k.unknownCount > 0 && (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {' '}
                    · {k.unknownCount} ta aniqlanmadi
                  </span>
                )}
                {k.weakCount > 0 && (
                  <span className="badge qizil" style={{ marginLeft: 6 }}>
                    {k.weakCount} ta zaif
                  </span>
                )}
              </span>
              <span className="chiziq">
                <div
                  style={
                    {
                      width: `${k.avgPct ?? 0}%`,
                      background: ballRang(k.avgPct),
                      '--i': i,
                    } as React.CSSProperties
                  }
                />
              </span>
              <span className="foiz" style={{ color: ballRang(k.avgPct) }}>
                {k.avgPct === null ? '—' : `${k.avgPct}%`}
              </span>
            </div>
          ))
        )}
      </div>

      <div className="grid-2">
        <div className="card">
          <BoshQator
            nom="Ball taqsimoti"
            ost="O'rtacha yashiradigan narsa: 60% — hamma o'rtachami yoki yarmi a'lo, yarmi yomonmi?"
          />
          <Ustunlar
            data={q.distribution.map((d) => ({
              label: d.label,
              count: d.count,
              // Chelak markazini ball deb olamiz — rang shkalasi bilan mos.
              avgScore: (d.bucket - 1) * 20 + 10,
            }))}
          />
        </div>
        <div className="card">
          <BoshQator nom="Eng ko'p takrorlangan zaif joy" ost="Kouching mavzusi shu yerdan" />
          <Chiziqlar data={q.topGaps} />
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <BoshQator nom="Muvofiqlik" ost="Skript va qoidalarga rioya" />
        <Doira data={q.compliance} />
      </div>
    </>
  );
}

/** Menejer × mezon issiqlik xaritasi + "o'rtacha" qatori. */
function Xarita({ m }: { m: SeatMatrix }) {
  if (m.seats.length === 0 || m.criteria.length === 0) {
    return <div className="hech-narsa">Bu davrda sotuvchi bo'yicha baho yo'q</div>;
  }

  const katak = (pct: number | null, scored: number, i: number, nom: string) =>
    pct === null ? (
      <td
        className="katak-yoq"
        style={{ '--i': i } as React.CSSProperties}
        title={`${nom} — bu davrda baholanmagan`}
      >
        —
      </td>
    ) : (
      <td
        className="katak-ball"
        style={
          {
            background: ballRang(pct),
            color: ballMatnRang(pct),
            '--i': i,
          } as React.CSSProperties
        }
        title={`${nom} — ${scored} ta baho`}
      >
        {Math.round(pct)}%
      </td>
    );

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="matritsa">
        <thead>
          <tr>
            <th className="chap">Menejer</th>
            {m.criteria.map((k) => (
              <th key={`${k.code} ${k.name}`} title={k.name}>
                {k.code}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {m.seats.map((s) => (
            <tr key={s.seatId}>
              <td className="chap">
                <Link to={`/sotuvchi/${s.seatId}`} className="havola">
                  {s.displayName}
                </Link>
              </td>
              {/*
                Kechikish USTUN indeksidan olinadi, katakning umumiy
                tartibidan emas: shunda xarita chapdan o'ngga "supurib"
                ochiladi va oxirgi katak ham yarim soniyada joyida
                bo'ladi. Qator×ustun bo'yicha hisoblansa, pastki
                qatorlar bir necha soniya kech chiqardi.
              */}
              {s.cells.map((c, ci) => (
                <React.Fragment key={`${c.code} ${c.name}`}>
                  {katak(c.avgPct, c.scored, ci, `${c.code} — ${c.name}`)}
                </React.Fragment>
              ))}
            </tr>
          ))}
          <tr>
            <td className="chap">
              <b>O'rtacha</b>
            </td>
            {m.average.map((a, i) => (
              <React.Fragment key={`${a.code} ${a.name}`}>
                {katak(a.avgPct, 0, i, `${a.code} — ${a.name}`)}
              </React.Fragment>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/**
 * Gaplashish nisbati va qizil bayroqlar.
 *
 * Nisbat nima uchun muhim: menejer 80% gapirsa, u taqdimot qilyapti,
 * mijozni TINGLAMAYAPTI — bu odatda zaif ehtiyoj aniqlashning eng aniq
 * belgisi. Shuning uchun bu blok mezon ballaridan alohida turadi.
 */
function Ovoz({ v }: { v: AnalyticsVoice }) {
  const usul = v.talkRatio[0]?.method;

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <BoshQator
        nom="Baholangan qo'ng'iroqlardagi ovoz"
        ost={
          usul === 'duration'
            ? 'Gapirish vaqti bo\'yicha — audio yozuvdan olingan'
            : /*
                 Ochiq yozilishi shart: matnli yozishmada "gapirish vaqti"
                 degan o'lchov yo'q, shuning uchun yozilgan matn hajmi
                 olinadi. Buni vaqt deb ko'rsatish noto'g'ri bo'lardi.
               */
              'Yozilgan matn hajmi bo\'yicha — yozishmada gapirish vaqti o\'lchanmaydi'
        }
      />

      {v.talkRatio.length === 0 ? (
        <div className="hech-narsa">Bu davrda baholangan suhbat yo'q</div>
      ) : (
        v.talkRatio.map((r, i) => (
          <div className="nisbat-blok jonli-kirish" key={r.seatId} style={{ '--i': i } as React.CSSProperties}>
            <div className="bosh">
              <span className="ism">
                {r.displayName}{' '}
                <span style={{ color: 'var(--text-secondary)', fontWeight: 400, fontSize: 12 }}>
                  · {r.conversations} ta suhbat
                </span>
              </span>
              <span className="teglar">
                <span className="teg-menejer">Menejer {son(r.managerPct, '%')}</span>
                <span className="teg-mijoz">Mijoz {son(r.clientPct, '%')}</span>
              </span>
            </div>
            <div className="nisbat-yol">
              <div className="menejer" style={{ width: `${r.managerPct ?? 0}%` }} />
              <div className="mijoz" style={{ width: `${r.clientPct ?? 0}%` }} />
            </div>
          </div>
        ))
      )}

      <div style={{ marginTop: 16 }}>
        <BoshQator nom="Qizil bayroq holati" ost="Isbot bilan tasdiqlangan jiddiy buzilishlar" />
        {v.redFlags.length === 0 ? (
          <div className="hech-narsa">Bu davrda baholangan suhbat yo'q</div>
        ) : (
          v.redFlags.map((r) => (
            <div className="nisbat-blok" key={r.seatId}>
              <div className="bosh">
                <span className="ism">{r.displayName}</span>
                <span className={`badge ${r.flags > 0 ? 'qizil' : 'ok'}`}>
                  {r.flags > 0 ? `${r.flags} ta bayroq` : 'Hammasi joyida'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                {r.conversations} ta baholangan qo'ng'iroqda{' '}
                {r.flags > 0 ? `${r.flags} ta qizil bayroq aniqlandi` : 'qizil bayroq aniqlanmadi'}
              </div>
            </div>
          ))
        )}
        {v.flagKinds.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <Chiziqlar data={v.flagKinds} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════ JAMOA MALAKASI ═══════════════════════════ */

/** Bitta kouching qo'ng'irog'i kartochkasi — ko'rib chiqish yoki namuna. */
function KouchKarta({ c, namuna }: { c: CoachingCall; namuna: boolean }) {
  const matn = namuna ? (c.strength ?? c.summary) : (c.improvement ?? c.primaryGap ?? c.summary);
  return (
    <div className="kouch-karta">
      <div className="bosh">
        <span className="ism">{c.seatName ?? 'Noma\'lum'}</span>
        <span className="ball-teg" style={{ color: ballRang(c.overallScore) }}>
          <span className="mini-yol">
            <div
              style={{ width: `${c.overallScore}%`, background: ballRang(c.overallScore) }}
            />
          </span>
          {Math.round(c.overallScore * 10) / 10}%
        </span>
      </div>
      {matn && <div className="matn">{matn}</div>}
      {/*
        Taklif qilingan ibora — bu menejer AYTGAN gap emas, balki AI
        tavsiya qilgan variant. Yorliq shuni ochiq aytadi, aks holda
        rahbar uni transkriptdan olingan iqtibos deb o'qib qolardi.
      */}
      {!namuna && c.suggestion && (
        <div className="iqtibos">
          <span className="yorliq">Shunday deyish mumkin edi</span>
          {c.suggestion}
        </div>
      )}
      <div className="past-qator">
        <span>{fmtSana(c.startedAt)}</span>
        <Link to={`/suhbatlar/${c.conversationId}`} className="btn ikkinchi kichik">
          Ko'rish
        </Link>
      </div>
    </div>
  );
}

function Jamoa({ t, k }: { t: AnalyticsTeam; k: AnalyticsCoaching | null }) {
  const katak = (seatId: string, kat: string) =>
    t.cells.find((c) => c.seatId === seatId && c.categoryCode === kat);

  return (
    <>
      {k && <Kouching k={k} />}

      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Kim nimada kuchli"
          ost="Reyting kimni maqtashni aytadi, bu jadval esa kimga NIMANI o'rgatishni"
        />
        {t.seats.length === 0 ? (
          <div className="hech-narsa">Bu davrda sotuvchi faolligi yo'q</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="matritsa">
              <thead>
                <tr>
                  <th className="chap">Sotuvchi</th>
                  <th>Suhbat</th>
                  <th>Umumiy</th>
                  {t.categories.map((k) => (
                    <th key={k}>{k}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {t.seats.map((s) => (
                  <tr key={s.seatId}>
                    <td className="chap">
                      <Link to={`/sotuvchi/${s.seatId}`} className="havola">
                        {s.displayName}
                      </Link>
                      {s.flagged > 0 && (
                        <span className="badge qizil" style={{ marginLeft: 6 }}>
                          ⚑ {s.flagged}
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>{s.conversations}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={`ball ${ballKlass(s.avgScore)}`}>
                        {s.avgScore === null ? '—' : `${s.avgScore}%`}
                      </span>
                    </td>
                    {t.categories.map((k) => {
                      const c = katak(s.seatId, k);
                      // Baholanmagan katak bo'sh ko'rsatiladi — nol emas.
                      // Rangli nol "bu odam bu bo'limda yomon" degan
                      // yolg'on signal berardi.
                      if (!c || c.avgPct === null) {
                        return (
                          <td className="katak-yoq" key={k} title="Bu davrda baholanmagan">
                            —
                          </td>
                        );
                      }
                      return (
                        <td
                          className="katak-ball"
                          key={k}
                          style={{
                            background: ballRang(c.avgPct),
                            color: ballMatnRang(c.avgPct),
                          }}
                          title={`${c.scored} ta baho${
                            c.unknownCount > 0 ? `, ${c.unknownCount} ta aniqlanmadi` : ''
                          }`}
                        >
                          {Math.round(c.avgPct)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}

/**
 * Kouching bloki — "kim bilan, nima ustida ishlash kerak".
 *
 * Tartib ataylab: avval KIM (prioritet), keyin NIMA (takrorlanadigan
 * muammolar), keyin QAYSI QO'NG'IROQNI birga eshitish, oxirida
 * jamoa qayoqqa ketayotgani. Bu — kouching uchrashuvining tabiiy
 * ketma-ketligi.
 */
function Kouching({ k }: { k: AnalyticsCoaching }) {
  return (
    <>
      <div className="metrika-grid">
        <Metrika
          nom="E'tibor kerak menejerlar"
          qiymat={String(k.kpi.seatsNeedingAttention)}
          rang={k.kpi.seatsNeedingAttention > 0 ? 'var(--past)' : undefined}
          ost={`${k.kpi.seats} ta faol sotuvchidan`}
        />
        <Metrika
          nom="Ko'rib chiqish kerak"
          qiymat={String(k.kpi.callsToReview)}
          ost="60% dan past baholangan"
        />
        <Metrika nom="Baholangan qo'ng'iroqlar" qiymat={String(k.kpi.scoredCalls)} />
        <Metrika
          nom="Takrorlanadigan muammo"
          qiymat={String(k.improve.length)}
          ost="turdagi zaif mezon"
        />
      </div>

      {/* ─── Kim bilan birinchi ishlash kerak ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Hozir ishlash kerak"
          ost="Eng past balldan boshlab — kamida 2 ta baholangan qo'ng'irog'i borlar"
        />
        {k.priorities.length === 0 ? (
          <div className="hech-narsa">
            Bu davrda yetarli baho yo'q — prioritet uchun sotuvchida kamida 2 ta baholangan
            qo'ng'iroq bo'lishi kerak.
          </div>
        ) : (
          k.priorities.slice(0, 4).map((p, i) => (
            <div
              className="prioritet-karta jonli-kirish"
              key={p.seatId}
              style={
                {
                  '--i': i,
                  borderLeftColor: ballRang(p.avgScore),
                } as React.CSSProperties
              }
            >
              <div className="bosh">
                <div style={{ minWidth: 0 }}>
                  <div className="raqam">{i + 1}-prioritet</div>
                  <div className="ism">{p.displayName}</div>
                  {p.focus && (
                    <div className="fokus">
                      Fokus: {p.focus.name}
                      {p.secondFocus && <> · {p.secondFocus.name}</>}
                    </div>
                  )}
                </div>
                <Link to={`/sotuvchi/${p.seatId}`} className="btn ikkinchi kichik">
                  Menejerni ochish
                </Link>
              </div>

              <div className="izoh">
                {p.scoredCalls} ta baholangan qo'ng'iroq, o'rtacha{' '}
                <b style={{ color: ballRang(p.avgScore) }}>
                  {p.avgScore === null ? '—' : `${p.avgScore}%`}
                </b>
                {p.weakCount > 0 && <> · {p.weakCount} ta zaif baho</>}
                {p.focus && (
                  <>
                    . Eng zaif joyi — <b>{p.focus.name}</b> ({p.focus.avgPct}%
                    {p.focus.weak > 0 && `, ${p.focus.weak} marta zaif`}).
                  </>
                )}
              </div>

              {p.reviewCalls.length > 0 && (
                <div className="havolalar">
                  {p.reviewCalls.map((c) => (
                    <Link
                      key={c.conversationId}
                      to={`/suhbatlar/${c.conversationId}`}
                      className="qongiroq-chip"
                    >
                      Qo'ng'iroqni ochish · {Math.round(c.overallScore)}%
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ─── Nima ustida ishlash kerak ─── */}
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <BoshQator
            nom="Yaxshilash kerak"
            ost="Eng ko'p zaif baho olgan mezonlar — kouching mavzusi shu"
          />
          {k.improve.length === 0 ? (
            <div className="hech-narsa">Zaif baho qayd etilmagan</div>
          ) : (
            k.improve.map((r) => (
              <div className="sanoq-satr" key={`${r.code} ${r.name}`}>
                <span className="nom">
                  <b style={{ color: 'var(--text-secondary)', marginRight: 6 }}>{r.code}</b>
                  {r.name}
                </span>
                <span className="son yomon">{r.count}x</span>
              </div>
            ))
          )}
        </div>
        <div className="card">
          <BoshQator
            nom="Yaxshi bajarilgan narsalar"
            ost="To'liq ball olgan mezonlar — mustahkamlash kerak bo'lgan kuch"
          />
          {k.strong.length === 0 ? (
            <div className="hech-narsa">To'liq ball qayd etilmagan</div>
          ) : (
            k.strong.map((r) => (
              <div className="sanoq-satr" key={`${r.code} ${r.name}`}>
                <span className="nom">
                  <b style={{ color: 'var(--text-secondary)', marginRight: 6 }}>{r.code}</b>
                  {r.name}
                </span>
                <span className="son yaxshi">{r.count}x</span>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── Qaysi qo'ng'iroqni birga eshitish kerak ─── */}
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <BoshQator
            nom="Hozir ko'rib chiqish kerak"
            ost="Eng past baholangan, mazmunli suhbatlar (4 tadan ko'p navbat)"
          />
          {k.reviewCalls.length === 0 ? (
            <div className="hech-narsa">Bu davrda baholangan suhbat yo'q</div>
          ) : (
            k.reviewCalls.map((c) => (
              <KouchKarta key={c.conversationId} c={c} namuna={false} />
            ))
          )}
        </div>
        <div className="card">
          <BoshQator
            nom="Mustahkamlash uchun namunalar"
            ost="Eng yuqori baholangan suhbatlar — jamoaga ko'rsatish uchun"
          />
          {k.bestCalls.length === 0 ? (
            <div className="hech-narsa">Bu davrda baholangan suhbat yo'q</div>
          ) : (
            k.bestCalls.map((c) => <KouchKarta key={c.conversationId} c={c} namuna />)
          )}
        </div>
      </div>

      {/* ─── Jamoa qayoqqa ketyapti ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Jamoa rivoji trendi"
          ost="Har sotuvchining kunlik o'rtacha balli — uzilish o'sha kuni suhbat bo'lmaganini bildiradi"
        />
        <KopChiziq
          qatorlar={k.trend.map((s) => ({
            id: s.seatId,
            nom: s.displayName,
            nuqtalar: s.points.map((p) => ({ x: fmtKun(p.day), y: p.avgScore })),
          }))}
        />
      </div>
    </>
  );
}

/* ═══════════════════════════ LID ANALITIKASI ═══════════════════════════ */

const HOLAT_NOM: Record<string, string> = {
  bitimli: 'Summa kelishilgan',
  faol: 'Faol',
  sovimoqda: 'Sovimoqda',
  sovigan: 'Sovib qolgan',
};
const HOLAT_RANG: Record<string, string> = {
  bitimli: 'var(--yuqori)',
  faol: 'var(--ia)',
  sovimoqda: 'var(--orta)',
  sovigan: 'var(--past)',
};

function Lidlar({ l, v }: { l: AnalyticsLeads; v: AnalyticsFunnel | null }) {
  // Model o'zicha yorliq o'ylab topgan bo'lsa — buni yashirmaymiz.
  const notanish = l.leadQuality.find((x) => x.key === 'unknown');

  return (
    <>
      {v && (
        <>
          {/*
            Holat ta'rifi eng tepada ochiq yozilgan: bu CRM natijasi emas,
            faollik bo'yicha xulosa. Buni yashirsak, rahbar "sovib qolgan"
            ni "yo'qotilgan bitim" deb o'qib qolardi.
          */}
          <div className="etiroz-holat open" style={{ marginBottom: 14 }}>
            ℹ️ Lid holati <b>faollik</b> bo'yicha aniqlanadi, CRM natijasi bo'yicha emas:
            oxirgi aloqadan {v.thresholds.activeDays} kungacha — faol,{' '}
            {v.thresholds.lostDays} kundan ko'p — sovib qolgan. «Summa kelishilgan» esa
            suhbatda aniq raqam aytilgan lidlar.
          </div>

          <div className="metrika-grid">
            <Metrika nom="Jami lid" qiymat={String(v.lifecycle.total)} ost="davrda aloqa bo'lgan kontakt" />
            <Metrika
              nom="Summa kelishilgan"
              qiymat={String(v.lifecycle.withDeal)}
              rang="var(--yuqori)"
            />
            <Metrika nom="Faol" qiymat={String(v.lifecycle.active)} rang="var(--ia)" />
            <Metrika
              nom="Sovimoqda"
              qiymat={String(v.lifecycle.cooling)}
              rang={v.lifecycle.cooling > 0 ? 'var(--orta)' : undefined}
            />
            <Metrika
              nom="Sovib qolgan"
              qiymat={String(v.lifecycle.cold)}
              rang={v.lifecycle.cold > 0 ? 'var(--past)' : undefined}
            />
            <Metrika
              nom="O'rtacha lid sifati"
              qiymat={v.quality.avgScore === null ? '—' : `${v.quality.avgScore}%`}
              rang={ballRang(v.quality.avgScore)}
              ost={`${v.quality.scored} ta baholangan`}
            />
          </div>

          <div className="grid-2" style={{ marginBottom: 14 }}>
            <div className="card">
              <BoshQator nom="Lid holati" ost="Oxirgi aloqadan qancha vaqt o'tgani bo'yicha" />
              <Doira
                data={[
                  { key: 'Summa kelishilgan', count: v.lifecycle.withDeal },
                  { key: 'Faol', count: v.lifecycle.active },
                  { key: 'Sovimoqda', count: v.lifecycle.cooling },
                  { key: 'Sovib qolgan', count: v.lifecycle.cold },
                ].filter((x) => x.count > 0)}
              />
            </div>
            <div className="card">
              <BoshQator
                nom="Lid sifati taqsimoti"
                ost="Suhbat balli bo'yicha: past &lt;40, o'rtacha 40–59, yaxshi ≥60"
              />
              {v.quality.scored === 0 ? (
                <div className="hech-narsa">Baholangan lid yo'q</div>
              ) : (
                <Chiziqlar
                  data={[
                    { key: 'Yaxshi lidlar', count: v.quality.high, avgScore: 80 },
                    { key: 'O\'rtacha lidlar', count: v.quality.mid, avgScore: 50 },
                    { key: 'Past sifatli lidlar', count: v.quality.low, avgScore: 20 },
                  ]}
                  rangBall
                />
              )}
            </div>
          </div>

          <div className="grid-2" style={{ marginBottom: 14 }}>
            <div className="card">
              <BoshQator
                nom="Nima uchun lidlar sovib qolyapti"
                ost="Sovib qolgan lidlardagi e'tirozlar — faol lidlarniki hisobga olinmaydi"
              />
              {v.lossReasons.length === 0 ? (
                <div className="hech-narsa">
                  Sovib qolgan lid yo'q — barcha kontaktlar bilan aloqa yaqinda bo'lgan.
                </div>
              ) : (
                v.lossReasons.map((r, i) => (
                  <div className="sanoq-satr" key={r.key} style={{ '--i': i } as React.CSSProperties}>
                    <span className="nom" title={r.example ?? undefined}>
                      {r.key}
                    </span>
                    <span className="son yomon">{r.count}</span>
                  </div>
                ))
              )}
            </div>
            <div className="card">
              <BoshQator
                nom="Qaysi bosqichda yo'qotyapmiz"
                ost="Sovib qolgan lidlarda eng ko'p zaif baho olgan kategoriya"
              />
              {v.lossStages.length === 0 ? (
                <div className="hech-narsa">Sovib qolgan lidlarda zaif baho qayd etilmagan</div>
              ) : (
                v.lossStages.map((r) => (
                  <div className="sanoq-satr" key={r.key}>
                    <span className="nom">
                      <b style={{ color: 'var(--text-secondary)', marginRight: 6 }}>{r.key}</b>
                      {r.example}
                    </span>
                    <span className="son yomon">{r.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <BoshQator
              nom="Qayta bog'lanish mumkin bo'lgan lidlar"
              ost="Sovib qolgan, lekin summa kelishilmagan kontaktlar — eng yuqori balldan boshlab"
            />
            {v.reconnect.length === 0 ? (
              <div className="hech-narsa">
                Qayta bog'lanish kerak bo'lgan lid yo'q — barcha kontaktlar bilan aloqa yaqinda
                bo'lgan.
              </div>
            ) : (
              v.reconnect.map((r, i) => (
                <div
                  className="lid-karta jonli-kirish"
                  key={r.contactId}
                  style={
                    {
                      '--i': i,
                      borderLeftColor: HOLAT_RANG[r.holat],
                    } as React.CSSProperties
                  }
                >
                  <div className="bosh">
                    <span className="ism">
                      {r.name ?? <span style={{ color: 'var(--text-muted)' }}>Ismi yo'q</span>}
                      {r.seatName && (
                        <span className="menejer"> · {r.seatName}</span>
                      )}
                    </span>
                    <span className="ong">
                      <span className="badge kul">{HOLAT_NOM[r.holat]}</span>
                      <span className={`ball ${ballKlass(r.overallScore)}`}>
                        {r.overallScore === null ? '—' : `${Math.round(r.overallScore)}%`}
                      </span>
                    </span>
                  </div>
                  <div className="muddat">
                    {Math.round(r.daysSince)} kun aloqa yo'q · {r.conversations} ta suhbat ·
                    oxirgisi {fmtSana(r.lastAt)}
                  </div>
                  {r.summary && <div className="matn">{r.summary}</div>}
                  {r.primaryGap && (
                    <div className="taklif">
                      <b>Nima yetmagan:</b> {r.primaryGap}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}

      <div className="metrika-grid">
        <Metrika
          nom="Summa aytilgan"
          qiymat={String(l.deals.known)}
          ost="ta suhbatda raqam eshitildi"
        />
        <Metrika nom="Jami summa" qiymat={fmtPul(l.deals.total, l.deals.currency ?? 'UZS')} />
        <Metrika nom="O'rtacha" qiymat={fmtPul(l.deals.avg, l.deals.currency ?? 'UZS')} />
        <Metrika nom="Eng katta" qiymat={fmtPul(l.deals.max, l.deals.currency ?? 'UZS')} />
      </div>

      {notanish && (
        <div className="etiroz-holat open" style={{ marginBottom: 14 }}>
          ⚠ {notanish.count} ta suhbatda model lid sifatini tanish bo'lmagan so'z bilan yozgan
          {notanish.rawLabels && notanish.rawLabels.length > 0
            ? `: ${notanish.rawLabels.join(', ')}`
            : ''}
          . Playbookda lid sifati lug'ati belgilanmagani uchun model har safar o'zicha nom
          qo'yyapti — bu raqamlarni beqaror qiladi.
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <BoshQator nom="Lid sifati" ost="Rang — o'sha guruhning o'rtacha suhbat balli" />
          <Doira data={l.leadQuality} />
        </div>
        <div className="card">
          <BoshQator nom="Shoshilinchlik" />
          <Doira data={l.urgency} />
        </div>
      </div>

      <div className="grid-2" style={{ marginTop: 14 }}>
        <div className="card">
          <BoshQator
            nom="Eng ko'p uchragan e'tirozlar"
            ost="Mijozlar aynan nimadan qo'rqadi — skript shu yerdan tuziladi"
          />
          <Chiziqlar data={l.objections} />
        </div>
        <div className="card">
          <BoshQator nom="Qaror qabul qiluvchi" ost="Gaplashgan odam pul yechimini beradimi" />
          <Doira
            data={[
              { key: 'ha', count: l.decisionMaker.yes },
              { key: 'yo\'q', count: l.decisionMaker.no },
              { key: 'aniqlanmadi', count: l.decisionMaker.unknown },
            ].filter((d) => d.count > 0)}
          />
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════ VAZIFALAR ═══════════════════════════ */

const MANBA_NOM: Record<string, string> = {
  playbook_analysis: 'Baholangan suhbatdan',
  other_analysis: 'Baholanmagan suhbatdan',
  manual: 'Qo\'lda qo\'shilgan',
};

const MANBA_TANLOV: { key: TaskSource; nom: string }[] = [
  { key: 'all', nom: 'Barchasi' },
  { key: 'playbook_analysis', nom: 'Baholangan suhbatdan' },
  { key: 'other_analysis', nom: 'Baholanmagan suhbatdan' },
  { key: 'manual', nom: 'Qo\'lda qo\'shilgan' },
];

/** "2 kun", "5 soat" — bajarilish vaqti uchun. */
function fmtDavomiylik(s: number | null): string {
  if (s === null) return '—';
  const kun = s / 86400;
  if (kun >= 1) return `${Math.round(kun * 10) / 10} kun`;
  const soat = s / 3600;
  if (soat >= 1) return `${Math.round(soat)} soat`;
  return `${Math.max(1, Math.round(s / 60))} daq`;
}

function Vazifalar({
  v,
  manba,
  manbaOzgardi,
}: {
  v: AnalyticsTasks;
  manba: TaskSource;
  manbaOzgardi: (m: TaskSource) => void;
}) {
  const p = v.periodStats;
  const holat =
    p.completionPct === null
      ? 'Ma\'lumot yetarli emas'
      : p.completionPct >= 90
        ? 'Vazifalar ortda qolmayapti'
        : p.completionPct >= 60
          ? 'Bir oz ortda qolish bor'
          : 'Vazifalar jiddiy to\'planyapti';

  return (
    <>
      {/* ─── Manba filtri ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="manba-qator">
          <div style={{ minWidth: 0 }}>
            <b>Vazifalar manbasi</b>
            <div className="yordam" style={{ marginTop: 2 }}>
              Manbani tanlang — quyidagi barcha raqamlar shu tanlovga qarab hisoblanadi.
            </div>
          </div>
          <select
            value={manba}
            aria-label="Vazifalar manbasi"
            onChange={(e) => manbaOzgardi(e.target.value as TaskSource)}
          >
            {MANBA_TANLOV.map((m) => (
              <option key={m.key} value={m.key}>
                {m.nom}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ─── Umumiy holat ─── */}
      <div className="card holat-karta" style={{ marginBottom: 14 }}>
        <Gauge foiz={p.completionPct} ost="Davr bajarilishi" />
        <div className="holat-matn">
          <div className="sarlavha" style={{ color: ballRang(p.completionPct) }}>
            {holat}
          </div>
          <div className="izoh">
            Tanlangan davrda <b>{p.created}</b> ta vazifa yaratildi, <b>{p.completed}</b> tasi
            bajarildi.
            {/*
              Foiz 100 dan oshishi mumkin: bajarilganlar orasida oldingi
              davrda yaratilganlari ham bo'ladi. Buni xato deb o'ylamasligi
              uchun ochiq yozamiz.
            */}
            {p.completionPct !== null && p.completionPct > 100 && (
              <> Foiz 100 dan yuqori — eski davrdan qolgan vazifalar ham yopilgan.</>
            )}
          </div>
        </div>
        {v.now.overdue > 0 && (
          <span className="badge qizil kechikkan-teg">Hozir {v.now.overdue} ta kechikkan</span>
        )}
      </div>

      {/* ─── Hozir va davr bo'yicha — ATAYLAB ajratilgan ─── */}
      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div>
          <div className="blok-sarlavha">
            Hozir <span>ayni damda</span>
          </div>
          <div className="metrika-grid" style={{ marginBottom: 0 }}>
            <Metrika nom="Ochiq" qiymat={String(v.now.open)} ost="bajarilmagan" />
            <Metrika
              nom="Muddati o'tgan"
              qiymat={String(v.now.overdue)}
              rang={v.now.overdue > 0 ? 'var(--past)' : undefined}
              ost="muddat o'tib ketgan"
            />
            <Metrika nom="Bugun uchun" qiymat={String(v.now.dueToday)} ost="bugun muddati" />
          </div>
        </div>
        <div>
          <div className="blok-sarlavha">
            Davr bo'yicha <span>tanlangan oraliq</span>
          </div>
          <div className="metrika-grid" style={{ marginBottom: 0 }}>
            <Metrika nom="Yaratildi" qiymat={String(p.created)} />
            <Metrika
              nom="Bajarildi"
              qiymat={String(p.completed)}
              rang="var(--yuqori)"
              ost="davr ichida yopilgan"
            />
            <Metrika
              nom="O'rtacha bajarish"
              qiymat={fmtDavomiylik(p.avgCompletionSeconds)}
              ost="yaratilgandan yopilgangacha"
            />
          </div>
        </div>
      </div>

      {/* ─── Manba kesimi ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Vazifalar manbasi bo'yicha"
          ost="Qaysi manbadan kelgan vazifalar haqiqatan bajarilyapti"
        />
        {v.bySource.length === 0 ? (
          <div className="hech-narsa">Vazifa yo'q</div>
        ) : (
          <div className="metrika-grid" style={{ marginBottom: 0 }}>
            {v.bySource.map((s) => (
              <div className="katak" key={s.key}>
                <div className="nom">{MANBA_NOM[s.key] ?? s.key}</div>
                <div className="manba-uch">
                  <span>
                    <b>{s.open}</b>
                    <i>ochiq</i>
                  </span>
                  <span>
                    <b>{s.created}</b>
                    <i>yaratildi</i>
                  </span>
                  <span style={{ color: 'var(--yuqori)' }}>
                    <b>{s.completed}</b>
                    <i>bajarildi</i>
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── Kunlik yaratildi/bajarildi ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Vazifalar yaratilishi va bajarilishi"
          ost="Agar «Bajarildi» «Yaratildi»dan ortda qolsa, vazifalar to'planadi"
        />
        <GuruhUstunlar
          qatorlar={[
            { nom: 'Yaratildi', rang: 'var(--ia)' },
            { nom: 'Bajarildi', rang: 'var(--yuqori)' },
          ]}
          data={v.daily.map((d) => ({
            label: fmtKun(d.day),
            qiymatlar: [d.created, d.completed],
          }))}
        />
      </div>

      {/* ─── Menejerlar ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Menejerlar bo'yicha vazifalar"
          ost="Kim qancha vazifa olib boryapti va kim ortda qolyapti — eng ko'p kechikkani yuqorida"
        />
        {v.bySeat.length === 0 ? (
          <div className="hech-narsa">Bu davrda vazifa yo'q</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="jadval">
              <thead>
                <tr>
                  <th>Menejer</th>
                  <th>Ochiq</th>
                  <th>Muddati o'tgan</th>
                  <th>Davrda bajarildi</th>
                  <th>Davr bajarilishi</th>
                </tr>
              </thead>
              <tbody>
                {v.bySeat.map((r) => (
                  <tr key={r.seatId}>
                    <td>
                      <Link to={`/sotuvchi/${r.seatId}`} className="havola">
                        {r.displayName}
                      </Link>
                    </td>
                    <td>{r.open}</td>
                    <td>
                      {r.overdue > 0 ? (
                        <span className="badge qizil">{r.overdue}</span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>0</span>
                      )}
                    </td>
                    <td style={{ color: 'var(--yuqori)', fontWeight: 700 }}>{r.completed}</td>
                    <td>
                      <div className="jadval-chiziq">
                        <span className="yol jonli-chiziq">
                          <div
                            style={{
                              width: `${Math.min(r.completionPct ?? 0, 100)}%`,
                              background: ballRang(r.completionPct),
                            }}
                          />
                        </span>
                        <b className={`ball ${ballKlass(r.completionPct)}`}>
                          {r.completionPct === null ? '—' : `${Math.round(r.completionPct)}%`}
                        </b>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid-2" style={{ marginBottom: 14 }}>
        <div className="card">
          <BoshQator nom="Holat bo'yicha" ost="Davrda yaratilganlar" />
          <Doira data={v.byStatus} />
        </div>
        <div className="card">
          <BoshQator
            nom="Bosqichlar bo'yicha ochiq vazifalar"
            ost="Kechikkanlari qizil rangda"
          />
          {v.byStage.length === 0 ? (
            <div className="hech-narsa">Bosqich ma'lumoti yo'q (CRM ulanmagan)</div>
          ) : (
            v.byStage.map((s, i) => (
              <div className="chiziq-satr" key={s.key}>
                <span className="nom" title={s.key}>
                  {s.key}
                </span>
                <div className="yol jonli-chiziq">
                  <div
                    style={
                      {
                        width: `${(s.open / Math.max(...v.byStage.map((x) => x.open), 1)) * 100}%`,
                        background: s.overdue > 0 ? 'var(--past)' : 'var(--ia)',
                        '--i': i,
                      } as React.CSSProperties
                    }
                  />
                </div>
                <span className="son">
                  {s.open}
                  {s.overdue > 0 && (
                    <span style={{ color: 'var(--past)' }}> / {s.overdue}</span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <BoshQator nom="Va'dalar" ost="Suhbatda berilgan so'z — kim berdi va bajarildimi" />
        {v.commitments.length === 0 ? (
          <div className="hech-narsa">Bu davrda va'da qayd etilmagan</div>
        ) : (
          <Chiziqlar
            data={v.commitments.map((k) => ({
              key: `${k.party === 'manager' ? 'Menejer' : 'Mijoz'} — ${k.status}`,
              count: k.count,
            }))}
          />
        )}
      </div>
    </>
  );
}

/* ═══════════════════════════ FAOLIYAT ═══════════════════════════ */

function Faoliyat({
  f,
  oynaOzgardi,
}: {
  f: AnalyticsActivity;
  oynaOzgardi: (m: number) => void;
}) {
  const qaytaJami = f.noCallback.reduce((s, r) => s + r.total, 0);
  const qaytaIsh = f.noCallback.reduce((s, r) => s + r.inHours, 0);
  const qaytaTash = f.noCallback.reduce((s, r) => s + r.outHours, 0);
  const lidJami = f.newLeads.reduce((s, r) => s + r.leads, 0);
  const lidJavob = f.newLeads.reduce((s, r) => s + r.responded, 0);
  const lid1h = f.newLeads.reduce((s, r) => s + r.under1h, 0);
  const lid4h = f.newLeads.reduce((s, r) => s + r.under4h, 0);
  const lid24h = f.newLeads.reduce((s, r) => s + r.under24h, 0);
  const lid24p = f.newLeads.reduce((s, r) => s + r.over24h, 0);

  // Soatlar 0..23 to'liq chiziladi: bo'sh soat ham ma'lumot ("bu vaqtda
  // umuman ishlanmaydi"), uni ro'yxatdan tushirib qoldirsak, grafik
  // "kun 10 da boshlanadi" degan noto'g'ri taassurot berardi.
  const soatlar = Array.from({ length: 24 }, (_, h) => {
    const bor = f.byHour.find((x) => x.hour === h);
    return {
      label: String(h).padStart(2, '0'),
      count: bor?.count ?? 0,
      avgScore: bor?.avgScore ?? null,
    };
  });

  const kunlar = HAFTA_KUNI.map((nom, i) => {
    const bor = f.byWeekday.find((x) => x.weekday === i + 1);
    return { label: nom, count: bor?.count ?? 0, avgScore: bor?.avgScore ?? null };
  });

  return (
    <>
      <div className="metrika-grid">
        <Metrika nom="Jami suhbat" qiymat={String(f.totals.conversations)} />
        <Metrika
          nom="Eng yaxshi javob soati"
          qiymat={f.bestHour ? `${String(f.bestHour.hour).padStart(2, '0')}:00` : '—'}
          rang={f.bestHour ? 'var(--yuqori)' : undefined}
          ost={f.bestHour ? `${f.bestHour.pct}% javob berilgan` : 'ma\'lumot yetarli emas'}
        />
        <Metrika nom="Tahlil qilingan" qiymat={String(f.totals.analyzed)} />
        <Metrika
          nom="Baholangan"
          qiymat={String(f.totals.scored)}
          rang="var(--yuqori)"
        />
        <Metrika
          nom="Javobsiz sessiya"
          qiymat={String(f.totals.unanswered)}
          rang={f.totals.unanswered > 0 ? 'var(--past)' : undefined}
          ost="mijoz yozdi, javob kelmadi"
        />
        <Metrika
          nom="Birinchi javob (median)"
          qiymat={fmtSoniya(f.medianFirstResponseSeconds)}
          ost="mijoz qancha kutdi"
        />
        <Metrika
          nom="O'rtacha davomiylik"
          qiymat={fmtSoniya(f.duration.avgSeconds)}
          ost={f.duration.known === 0 ? 'davomiylik yozilmagan' : `${f.duration.known} ta suhbat`}
        />
      </div>

      {/* ─── Soatlar bo'yicha javob berilgani ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Mijoz javobi soatlar bo'yicha"
          ost={`Yashil — javob berilgan, qizil — javobsiz qolgan · ${f.timezone}`}
        />
        <YigmaUstunlar
          qatorlar={[
            { nom: 'Javob berildi', rang: 'var(--yuqori)' },
            { nom: 'Javobsiz', rang: 'var(--past)' },
          ]}
          data={f.byHour
            .filter((h) => h.answered + h.unanswered > 0)
            .map((h) => ({
              label: `${String(h.hour).padStart(2, '0')}:00`,
              qiymatlar: [h.answered, h.unanswered],
            }))}
        />
      </div>

      {/* ─── Yaqinlashtiriladigan faollik trendi ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Faollik tendensiyasi"
          ost="Sichqoncha g'ildiragi bilan yaqinlashtiring, ushlab suring"
        />
        <ZoomTrend
          qatorlar={[
            { nom: 'Suhbatlar', rang: 'var(--ia)' },
            { nom: 'Javobsiz', rang: 'var(--past)' },
          ]}
          nuqtalar={f.daily.map((d) => ({
            label: fmtKun(d.day),
            qiymatlar: [d.total, d.unanswered],
          }))}
        />
      </div>

      {/* ─── Birinchi javob tezligi ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Birinchi javob tezligi"
          ost="Mijoz yozgandan keyin qancha kutgan — 1 soatdan keyin u odatda boshqa joyga murojaat qiladi"
        />
        <div className="metrika-grid" style={{ marginBottom: 0 }}>
          <Metrika
            nom="15 daqiqagacha"
            qiymat={String(f.responseSpeed.under15m)}
            rang="var(--yuqori)"
          />
          <Metrika nom="15 daq – 1 soat" qiymat={String(f.responseSpeed.under1h)} />
          <Metrika
            nom="1 – 4 soat"
            qiymat={String(f.responseSpeed.under4h)}
            rang={f.responseSpeed.under4h > 0 ? 'var(--orta)' : undefined}
          />
          <Metrika
            nom="4 soatdan ko'p"
            qiymat={String(f.responseSpeed.over4h)}
            rang={f.responseSpeed.over4h > 0 ? 'var(--past)' : undefined}
          />
          <Metrika
            nom="Aniqlanmadi"
            qiymat={String(f.responseSpeed.unknown)}
            ost="javob vaqti o'lchanmagan"
          />
        </div>
      </div>

      {/* ─── Menejerlar faolligi ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Menejerlar faolligi"
          /*
            "Ulangan" — telefoniyadagi "go'shak ko'tarildi" ning yozishmadagi
            ekvivalenti: mijoz ham, menejer ham gapirgan suhbat. Ta'rifni
            ochiq yozmasak, rahbar uni qo'ng'iroq ulanishi deb o'qib qolardi.
          */
          ost="«Ulangan» — ikkala tomon ham gapirgan suhbat; «operatsion» — sotuvga oid bo'lmagan"
        />
        {f.bySeat.length === 0 ? (
          <div className="hech-narsa">Bu davrda faollik yo'q</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="jadval">
              <thead>
                <tr>
                  <th>Menejer</th>
                  <th>AI holati</th>
                  <th>Jami</th>
                  <th>Ulangan</th>
                  <th>Tahlil qilingan</th>
                  <th>Baholangan</th>
                  <th>Operatsion</th>
                  <th>Ulanmagan</th>
                  <th>%</th>
                </tr>
              </thead>
              <tbody>
                {f.bySeat.map((r) => (
                  <tr key={r.seatId}>
                    <td>
                      <Link to={`/sotuvchi/${r.seatId}`} className="havola">
                        {r.displayName}
                      </Link>
                    </td>
                    <td>
                      <span className={`badge ${r.aiLinked ? 'ok' : 'kul'}`}>
                        {r.aiLinked ? 'AI ulangan' : 'tahlil yo\'q'}
                      </span>
                    </td>
                    <td>{r.total}</td>
                    <td style={{ color: 'var(--yuqori)', fontWeight: 700 }}>{r.engaged}</td>
                    <td style={{ color: 'var(--info)' }}>{r.analyzed}</td>
                    <td style={{ color: 'var(--yuqori)', fontWeight: 700 }}>{r.scored}</td>
                    <td>{r.operational}</td>
                    <td>
                      {r.notEngaged > 0 ? (
                        <span style={{ color: 'var(--orta)', fontWeight: 700 }}>
                          {r.notEngaged}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>0</span>
                      )}
                    </td>
                    <td>
                      <span className={`ball ${ballKlass(r.engagedPct)}`}>
                        {r.engagedPct === null ? '—' : `${Math.round(r.engagedPct)}%`}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Ulanmagan suhbatlar ─── */}
      {f.bySeat.some((r) => r.notEngaged > 0) && (
        <div className="card" style={{ marginBottom: 14 }}>
          <BoshQator
            nom="Ulanmagan suhbatlar"
            ost="Bir tomon yozgan, ikkinchisi javob bermagan — urinish bo'lgan, aloqa bo'lmagan"
          />
          <Chiziqlar
            data={f.bySeat
              .filter((r) => r.notEngaged > 0)
              .map((r) => ({ key: r.displayName, count: r.notEngaged }))}
          />
        </div>
      )}

      {/* ─── Javobsiz va qayta aloqasiz ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="karta-bosh">
          <div>
            <h2>Javobsiz va qayta aloqasiz</h2>
            <div className="diag-ost">
              Mijoz yozgan, menejer javob bermagan VA tanlangan muddat ichida o'zi ham
              bog'lanmagan holatlar.
            </div>
          </div>
          <div className="tab-qator">
            {[30, 60, 180].map((m) => (
              <button
                key={m}
                className={`tab ${f.callbackMinutes === m ? 'active' : ''}`}
                onClick={() => oynaOzgardi(m)}
              >
                {m < 60 ? `${m} daqiqa` : `${m / 60} soat`}
              </button>
            ))}
          </div>
        </div>

        {f.noCallback.length === 0 ? (
          <div className="hech-narsa">
            Bu davrda javobsiz qolib, qayta ham bog'lanilmagan holat yo'q.
          </div>
        ) : (
          <>
            <div className="metrika-grid">
              <Metrika
                nom="Javobsiz va aloqasiz"
                qiymat={String(qaytaJami)}
                rang={qaytaJami > 0 ? 'var(--past)' : undefined}
              />
              <Metrika
                nom="Ish vaqtida"
                qiymat={`${qaytaIsh} (${qaytaJami > 0 ? Math.round((qaytaIsh / qaytaJami) * 100) : 0}%)`}
                rang={qaytaIsh > 0 ? 'var(--past)' : undefined}
                ost="bu — boshqaruv muammosi"
              />
              <Metrika
                nom="Ish tashqarisida"
                qiymat={`${qaytaTash} (${qaytaJami > 0 ? Math.round((qaytaTash / qaytaJami) * 100) : 0}%)`}
                ost="9:00–18:00 dan tashqarida"
              />
            </div>
            {f.noCallback.map((r, i) => (
              <div
                className="nisbat-blok jonli-kirish"
                key={r.seatId ?? r.displayName}
                style={{ '--i': i } as React.CSSProperties}
              >
                <div className="bosh">
                  <span className="ism">{r.displayName}</span>
                  <span className="teglar">
                    <span className="teg-menejer">Ish vaqtida {r.inHours}</span>
                    <span className="teg-mijoz">Tashqarisida {r.outHours}</span>
                  </span>
                </div>
                <div className="nisbat-yol">
                  <div
                    style={{ width: `${(r.inHours / r.total) * 100}%`, background: 'var(--past)' }}
                  />
                  <div
                    style={{
                      width: `${(r.outHours / r.total) * 100}%`,
                      background: 'var(--text-muted)',
                    }}
                  />
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ─── Yangi lidga birinchi javob tezligi ─── */}
      <div className="card" style={{ marginBottom: 14 }}>
        <BoshQator
          nom="Yangi lidga birinchi javob tezligi"
          ost="Shu davrda birinchi marta yozgan kontaktlar — ular qancha kutgan"
        />
        {f.newLeads.length === 0 ? (
          <div className="hech-narsa">Bu davrda yangi kontakt yo'q</div>
        ) : (
          <>
            <div className="metrika-grid">
              <Metrika nom="Jami yangi lid" qiymat={String(lidJami)} />
              <Metrika
                nom="Javob berilgan"
                qiymat={`${lidJavob} (${lidJami > 0 ? Math.round((lidJavob / lidJami) * 100) : 0}%)`}
                rang="var(--yuqori)"
              />
              <Metrika
                nom="Javobsiz qolgan"
                qiymat={String(lidJami - lidJavob)}
                rang={lidJami - lidJavob > 0 ? 'var(--past)' : undefined}
              />
              <Metrika nom="1 soatgacha" qiymat={String(lid1h)} rang="var(--yuqori)" />
              <Metrika nom="1–4 soat" qiymat={String(lid4h)} />
              <Metrika
                nom="4–24 soat"
                qiymat={String(lid24h)}
                rang={lid24h > 0 ? 'var(--orta)' : undefined}
              />
              <Metrika
                nom="24 soatdan ko'p"
                qiymat={String(lid24p)}
                rang={lid24p > 0 ? 'var(--past)' : undefined}
              />
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="jadval">
                <thead>
                  <tr>
                    <th>Menejer</th>
                    <th>Lidlar</th>
                    <th>Javob berilgan</th>
                    <th>Median javob</th>
                    <th>1 soatgacha</th>
                  </tr>
                </thead>
                <tbody>
                  {f.newLeads.map((r) => {
                    const foiz = r.leads > 0 ? Math.round((r.responded / r.leads) * 100) : null;
                    return (
                      <tr key={r.seatId ?? r.displayName}>
                        <td>
                          {r.seatId ? (
                            <Link to={`/sotuvchi/${r.seatId}`} className="havola">
                              {r.displayName}
                            </Link>
                          ) : (
                            r.displayName
                          )}
                        </td>
                        <td>{r.leads}</td>
                        <td>
                          <span className={`ball ${ballKlass(foiz)}`}>
                            {r.responded} {foiz !== null && `(${foiz}%)`}
                          </span>
                        </td>
                        <td>{fmtSoniya(r.medianSeconds)}</td>
                        <td style={{ color: 'var(--yuqori)', fontWeight: 700 }}>{r.under1h}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ─── Javobsiz: ish vaqtida yoki tashqarisida ─── */}
      {f.unansweredBySeat.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <BoshQator
            nom="Javobsiz qolgan sessiyalar"
            /* Oraliq «Sozlamalar → Ish jadvali» dan olinadi va shu
               yerda ochiq yoziladi — rahbar raqam qaysi jadval bo'yicha
               hisoblanganini bilishi kerak. */
            ost={ishVaqtiMatn(f.workHours)}
          />
          {f.unansweredBySeat.map((r, i) => {
            const jami = r.inHours + r.outHours;
            return (
              <div className="nisbat-blok jonli-kirish" key={r.seatId} style={{ '--i': i } as React.CSSProperties}>
                <div className="bosh">
                  <span className="ism">{r.displayName}</span>
                  <span className="teglar">
                    <span className="teg-menejer">Ish vaqtida {r.inHours}</span>
                    <span className="teg-mijoz">Tashqarisida {r.outHours}</span>
                  </span>
                </div>
                <div className="nisbat-yol">
                  <div
                    style={{ width: `${(r.inHours / jami) * 100}%`, background: 'var(--past)' }}
                  />
                  <div
                    style={{
                      width: `${(r.outHours / jami) * 100}%`,
                      background: 'var(--text-muted)',
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid-2">
        <div className="card">
          <BoshQator
            nom="Kun davomida"
            ost={`Balandlik — suhbat soni, rang — o'rtacha ball · ${f.timezone}`}
          />
          <Ustunlar data={soatlar} />
        </div>
        <div className="card">
          <BoshQator nom="Hafta kunlari bo'yicha" ost="Rang — o'rtacha ball" />
          <Ustunlar data={kunlar} />
        </div>
      </div>
    </>
  );
}

/* ═══════════════════════════ MIJOZLAR ═══════════════════════════ */

/** Bitta anketa savolining javoblari — turiga qarab boshqacha chiziladi. */
function AnketaBlok({ s }: { s: AnketaSavol }) {
  const hayoq = s.yes + s.no;
  // Tur "boolean" bo'lmasa ham, javoblar amalda ha/yo'q bo'lsa shunday
  // ko'rsatamiz: playbook turi eskirgan bo'lishi mumkin, javoblarning
  // O'ZI esa ishonchliroq dalil.
  const bolean = s.answerType === 'boolean' || (hayoq > 0 && hayoq === s.total);
  const raqamli = !bolean && s.answerType === 'number' && s.numbers.length > 0;

  return (
    <div className="savol-blok">
      <div className="savol">
        <span>{s.question}</span>
        <span className="javob-soni">{s.total} javob</span>
      </div>

      {bolean && hayoq > 0 ? (
        <>
          <div className="hayoq-yol">
            <div className="ha" style={{ width: `${(s.yes / hayoq) * 100}%` }}>
              {s.yes / hayoq > 0.12 && `Ha ${Math.round((s.yes / hayoq) * 100)}%`}
            </div>
            <div className="yoq" style={{ width: `${(s.no / hayoq) * 100}%` }}>
              {s.no / hayoq > 0.12 && `Yo'q ${Math.round((s.no / hayoq) * 100)}%`}
            </div>
          </div>
          <div className="hayoq-oyoq">
            <span>Ha: {s.yes}</span>
            <span>Yo'q: {s.no}</span>
          </div>
        </>
      ) : raqamli ? (
        <>
          <div className="yordam" style={{ marginBottom: 4 }}>
            O'rtacha: <b>{s.numericAvg}</b>
          </div>
          <Ustunlar
            data={s.numbers.map((n) => ({
              label: String(n.value),
              count: n.count,
              avgScore: null,
            }))}
            birlik="javob"
          />
        </>
      ) : (
        <div style={{ marginTop: 6 }}>
          <Chiziqlar data={s.answers.map((a) => ({ key: a.value, count: a.count }))} />
          {s.answers.length < s.total && s.numericAvg !== null && (
            <div className="yordam">Javoblardagi sonlar bo'yicha o'rtacha: {s.numericAvg}</div>
          )}
        </div>
      )}
    </div>
  );
}

function Mijozlar({
  c,
  m,
  mix,
  leads,
}: {
  c: AnalyticsClients;
  m: AnalyticsCustomer | null;
  mix: AnalyticsMix | null;
  leads: AnalyticsLeads | null;
}) {
  const qamrov =
    c.totalConversations > 0
      ? Math.round((c.linkedConversations / c.totalConversations) * 100)
      : null;

  // Xizmat yo'nalishi × biznesga tegishlilik — yig'ma ustunlar uchun.
  const yonalishlar = [...new Set((m?.serviceMix ?? []).map((x) => x.line))];
  const turlar = [...new Set((m?.serviceMix ?? []).map((x) => x.relevance))];
  const TUR_RANG: Record<string, string> = {
    sales: 'var(--yuqori)',
    support: 'var(--ia)',
    internal: 'var(--orta)',
    spam: 'var(--past)',
    other: 'var(--text-muted)',
  };

  return (
    <>
      {m && (
        <>
          {/* ─── Bitimlar ─── */}
          <div className="metrika-grid">
            <Metrika
              nom="Jami bitim summasi"
              qiymat={fmtPul(m.deals.total, m.deals.currency ?? 'UZS')}
              rang="var(--yuqori)"
            />
            <Metrika
              nom="Summa aytilgan suhbat"
              qiymat={String(m.deals.known)}
              ost={`${m.deals.analyzed} ta tahlildan`}
            />
            <Metrika
              nom="O'rtacha bitim"
              qiymat={fmtPul(m.deals.avg, m.deals.currency ?? 'UZS')}
            />
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <BoshQator
              nom="Bitim tendensiyasi"
              ost="Ustun — summa aytilgan suhbatlar soni, chiziq — o'sha kungi umumiy summa"
            />
            <Kombo
              data={m.dealDaily.map((d) => ({
                label: fmtKun(d.day),
                ustun: d.count,
                chiziq: d.sum,
              }))}
              ustunNom="Bitimlar soni"
              chiziqNom="Summa"
              chiziqFmt={(v) => (v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : String(Math.round(v)))}
            />
          </div>

          {/* ─── E'tiroz va byudjet ─── */}
          <div className="grid-2" style={{ marginBottom: 14 }}>
            <div className="card">
              <BoshQator
                nom="Top e'tirozlar"
                ost="Mijozlar eng ko'p nimadan qaytadi — skript shu yerdan tuziladi"
              />
              <Chiziqlar data={leads?.objections ?? []} />
            </div>
            <div className="card">
              <BoshQator
                nom="Byudjet reaktsiyasi"
                /*
                  Bu blok ATAYLAB ro'yxat, doiraviy diagramma emas: model
                  javobni erkin matnda yozadi ("Qimmatroq ekan"), uni 4-5
                  ta chiroyli toifaga bo'lish uchun kalit-so'z qoidalari
                  kerak bo'lardi — ya'ni o'ylab topilgan klassifikatsiya.
                */
                ost="Model yozgan javoblar — o'zgartirilmagan holda"
              />
              {m.budgetReaction.length === 0 ? (
                <div className="hech-narsa">Byudjet haqida gap qayd etilmagan</div>
              ) : (
                <Chiziqlar data={m.budgetReaction} />
              )}
            </div>
          </div>

          {/* ─── Taqsimotlar ─── */}
          <div className="grid-2" style={{ marginBottom: 14 }}>
            <div className="card">
              <BoshQator nom="Shoshilinchlik darajasi" ost="Mijoz qanchalik tez qaror qilmoqchi" />
              <Doira data={leads?.urgency ?? []} />
            </div>
            <div className="card">
              <BoshQator nom="Xizmat yo'nalishlari" ost="Qaysi mahsulot ko'proq so'ralyapti" />
              <Doira data={mix?.serviceLine ?? []} />
            </div>
          </div>

          <div className="card" style={{ marginBottom: 14 }}>
            <BoshQator
              nom="Xizmat yo'nalishi bo'yicha natijalar"
              ost="Har yo'nalishda suhbatlar qanday turlarga bo'linadi"
            />
            <YigmaUstunlar
              qatorlar={turlar.map((t) => ({
                nom: t,
                rang: TUR_RANG[t] ?? 'var(--data)',
              }))}
              data={yonalishlar.map((l) => ({
                label: l,
                qiymatlar: turlar.map(
                  (t) => m.serviceMix.find((x) => x.line === l && x.relevance === t)?.count ?? 0,
                ),
              }))}
            />
          </div>

          {/* ─── Anketa ─── */}
          <div className="card" style={{ marginBottom: 14 }}>
            <BoshQator
              nom="So'rovnoma"
              ost="Suhbatlardan yig'ilgan tuzilgan ma'lumot — savol turi playbookdan olinadi"
            />
            {m.questionnaire.questions.length === 0 ? (
              <div className="hech-narsa">
                Bu davrda anketa javobi yig'ilmagan. Savollarni «Baholash mezonlari» bo'limida
                qo'shishingiz mumkin.
              </div>
            ) : (
              m.questionnaire.questions.map((s) => <AnketaBlok key={s.question} s={s} />)
            )}
          </div>

          {m.questionnaire.matrix.seats.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <BoshQator
                nom="Menejer × savol"
                ost="Kim qaysi savolni so'rashni unutyapti — bo'sh katak savol berilmaganini bildiradi"
              />
              <div style={{ overflowX: 'auto' }}>
                <table className="matritsa">
                  <thead>
                    <tr>
                      <th className="chap">Menejer</th>
                      {m.questionnaire.matrix.questions.map((q) => (
                        <th key={q} title={q}>
                          {q.length > 22 ? `${q.slice(0, 22)}…` : q}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {m.questionnaire.matrix.seats.map((s) => (
                      <tr key={s}>
                        <td className="chap">{s}</td>
                        {m.questionnaire.matrix.questions.map((q, i) => {
                          const hit = m.questionnaire.matrix.cells.find(
                            (x) => x.seat === s && x.question === q,
                          );
                          return hit ? (
                            <td
                              className="katak-ball"
                              key={q}
                              style={
                                {
                                  background: 'var(--yuqori)',
                                  color: 'var(--ball-ust-yuqori)',
                                  '--i': i,
                                } as React.CSSProperties
                              }
                            >
                              {hit.count}
                            </td>
                          ) : (
                            <td
                              className="katak-yoq"
                              key={q}
                              style={{ '--i': i } as React.CSSProperties}
                              title="Bu savol javobi yig'ilmagan"
                            >
                              —
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      <div className="metrika-grid">
        <Metrika nom="Yangi mijoz" qiymat={String(c.newClients)} ost="birinchi marta murojaat" />
        <Metrika
          nom="Qaytgan mijoz"
          qiymat={String(c.returningClients)}
          ost="ilgari ham murojaat qilgan"
        />
        <Metrika
          nom="Kontaktga bog'langan"
          qiymat={son(qamrov, '%')}
          ost={`${c.linkedConversations}/${c.totalConversations} suhbat`}
        />
      </div>

      {/*
        Qamrov past bo'lsa buni ochiq aytish shart: quyidagi mijoz
        kesimlari faqat bog'langan suhbatlarni ko'radi, ya'ni "yangi
        mijozlar soni" haqiqiy sonning bir qismi bo'lishi mumkin.
      */}
      {qamrov !== null && qamrov < 80 && (
        <div className="etiroz-holat open" style={{ marginBottom: 14 }}>
          ⚠ Suhbatlarning faqat {qamrov}% i kontaktga bog'langan. Quyidagi mijoz raqamlari
          shu qismni qamrab oladi — qolgan suhbatlarda kontakt aniqlanmagan.
        </div>
      )}

      <div className="card">
        <BoshQator nom="Eng faol mijozlar" ost="Shu davrda eng ko'p murojaat qilganlar" />
        {c.top.length === 0 ? (
          <div className="hech-narsa">Bu davrda kontaktga bog'langan suhbat yo'q</div>
        ) : (
          <table className="jadval">
            <thead>
              <tr>
                <th>Mijoz</th>
                <th>Suhbat</th>
                <th>O'rtacha ball</th>
                <th>Oxirgi murojaat</th>
              </tr>
            </thead>
            <tbody>
              {c.top.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.name ?? <span style={{ color: 'var(--text-muted)' }}>Ismi yo'q</span>}
                    {m.company && (
                      <span style={{ color: 'var(--text-secondary)' }}> · {m.company}</span>
                    )}
                    {m.isDecisionMaker && (
                      <span className="badge navy" style={{ marginLeft: 6 }}>
                        qaror qiluvchi
                      </span>
                    )}
                  </td>
                  <td>{m.conversations}</td>
                  <td>
                    <span className={`ball ${ballKlass(m.avgScore)}`}>
                      {m.avgScore === null ? '—' : `${m.avgScore}%`}
                    </span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{fmtSana(m.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
