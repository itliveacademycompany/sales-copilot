import { CircleCheck, Sparkles, TriangleAlert, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type KeyboardEvent as RKeyboardEvent } from 'react';
import { api, ApiError, type PlaybookBody, type PlaybookVersion } from '../../api';
import { useAuth } from '../../auth';
import { kontekstniAjrat, kontekstniYig } from '../xizmat/kontekstBlok';
import { bahoniAjrat, bahoniYig, blokniAjrat, blokniYig, blokYasa } from './blok';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → AI KO'RSATMALARI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Har maydon playbookdagi o'z joyiga saqlanadi. AI faqat uch maydonni
 * o'qigani uchun (biznes konteksti, ma'lumot ajratish, baholash) qolganlari
 * saqlashda shu uch maydondagi avtomatik blokka ham yig'iladi (blok.ts).
 */

type Kalit =
  | 'atamalar'
  | 'transkripsiya'
  | 'biznes'
  | 'ajratish'
  | 'vazifa'
  | 'qoida'
  | 'coaching'
  | 'baholash'
  | 'sifatliLid'
  | 'lidKontekst'
  | 'lidYoqotilgan'
  | 'lidTavsiya';

type Qiymatlar = Record<Exclude<Kalit, 'atamalar'>, string> & { atamalar: string[] };

interface Maydon {
  k: Kalit;
  savol: string;
  misol: string;
  maks: number;
}

const BOSQICHLAR: { nom: string; maydonlar: Maydon[] }[] = [
  {
    nom: '1-bosqich: Transkripsiya sifati',
    maydonlar: [
      { k: 'atamalar', savol: 'Qaysi atamalarni aynan shu ko\'rinishda yozsin?', misol: 'Masalan: mahsulot nomlari, brendlar, qisqartmalar', maks: 80 },
      { k: 'transkripsiya', savol: 'Transkripsiyada nimalarni hisobga olsin?', misol: "Masalan: xizmat nomlarini aralashtirmang; aytilgan yo'nalishni aynan saqlang.", maks: 1000 },
    ],
  },
  {
    nom: "2-bosqich: Anketa va ma'lumot ajratish",
    maydonlar: [
      { k: 'biznes', savol: 'Kompaniyangiz haqida nimalarni bilishi kerak?', misol: "Masalan: nima sotasiz, kimga, qanday sharoitda; asosiy maqsad nima.", maks: 3000 },
      { k: 'ajratish', savol: "Qo'ng'iroqdan aynan nimalarni ajratib olsin?", misol: "Masalan: yashash manzili, kurs kim uchun, yoshi; faqat aniq aytilganini yozsin.", maks: 2000 },
      {
        k: 'vazifa',
        savol: 'AI vazifalarni qanday yaratishi kerak?',
        misol: "Ixtiyoriy. Masalan: faqat mijoz bilan kelishilgan keyingi qadamlar uchun vazifa yaratsin. Standart qoidalar uchun bo'sh qoldiring.",
        maks: 2000,
      },
    ],
  },
  {
    nom: '3-bosqich: Baholash va coaching',
    maydonlar: [
      { k: 'qoida', savol: 'Qaysi holatlarni qoida buzilgan deb hisoblansin?', misol: "Masalan: qo'pollik, narxni qiymatsiz aytish, taqiqlangan iboralar.", maks: 2000 },
      { k: 'coaching', savol: 'Menejerga qanday tavsiyalar bersin?', misol: 'Masalan: yaxshi va zaif suhbat belgilari, nimaga urg\'u berish kerak.', maks: 2000 },
      { k: 'baholash', savol: "Baholashda nimaga ko'proq e'tibor bersin?", misol: "Masalan: qaysi oilalarni bahodan chiqarish, aralash xizmatda qanday baholash.", maks: 3000 },
      { k: 'sifatliLid', savol: "Bu biznes uchun sifatli lid qanday bo'ladi?", misol: 'Masalan: mos mijoz, aniq ehtiyoj, byudjet, qaror beruvchi, tezlik; va sifatsiz lid belgilarini yozing…', maks: 1000 },
    ],
  },
];

const LID: Maydon[] = [
  { k: 'lidKontekst', savol: 'Lidlar qaysi biznes kontekstida baholansin?', misol: 'Mahsulot, xizmat, auditoriya va savdo sikli haqida qisqacha yozing…', maks: 1000 },
  { k: 'lidYoqotilgan', savol: "Yo'qotilgan lidni qanday tahlil qilsin?", misol: "Masalan: narx, vaqt, qayta aloqa, raqobatchi yoki ehtiyoj mosligi bo'yicha nimalarga qarasin…", maks: 1000 },
  { k: 'lidTavsiya', savol: "Menejer uchun qaysi tavsiyalarni ajratib ko'rsatsin?", misol: "Masalan: keyingi safar nimani boshqacha qilish va qaysi ko'nikmalarni kuchaytirish kerakligini yozing…", maks: 1000 },
];

const KARTA1: Kalit[] = BOSQICHLAR.flatMap((b) => b.maydonlar.map((m) => m.k));
const KARTA2: Kalit[] = LID.map((m) => m.k);
const AJRATISH_MAKS = 2000;
const BAHOLASH_MAKS = 3000;
const KONTEKST_MAKS = 3000;

type LidKorsatma = { sifatliLid?: string; kontekst?: string; yoqotilgan?: string; tavsiyalar?: string };

/** Playbookdan forma qiymatlari (bloklarsiz). */
function oqi(p: PlaybookBody): Qiymatlar {
  const pn = p.promptNotes;
  const lq = ((p.leadQuality ?? {}) as { korsatmalar?: LidKorsatma }).korsatmalar ?? {};
  return {
    atamalar: pn.stage1.vocabulary ?? [],
    transkripsiya: pn.stage1.contextHint ?? '',
    biznes: kontekstniAjrat(pn.stage2.businessContext ?? '')[0],
    ajratish: blokniAjrat(pn.stage2.extractionHints ?? '')[0],
    vazifa: pn.stage2.taskGuidance ?? '',
    qoida: pn.stage3.complianceNotes ?? '',
    coaching: pn.stage3.coachingNotes ?? '',
    baholash: bahoniAjrat(pn.stage3.scoringGuidance ?? '')[0],
    sifatliLid: lq.sifatliLid ?? '',
    lidKontekst: lq.kontekst ?? '',
    lidYoqotilgan: lq.yoqotilgan ?? '',
    lidTavsiya: lq.tavsiyalar ?? '',
  };
}

/** Forma qiymatlaridan playbook (native maydonlar + AI o'qiydigan bloklar). */
function yoz(p: PlaybookBody, q: Qiymatlar): PlaybookBody {
  const xizmatBlok = kontekstniAjrat(p.promptNotes.stage2.businessContext ?? '')[1];
  const blok2 = blokYasa([
    ['Atamalarni aynan shu yozilishda saqla', q.atamalar.join(', ')],
    ['Transkripsiya bo\'yicha', q.transkripsiya],
    ['Vazifa yaratish qoidalari', q.vazifa],
  ]);
  const blok3 = blokYasa([
    ['Qoida buzilishi deb hisoblanadigan holatlar', q.qoida],
    ['Menejerga tavsiya berishda', q.coaching],
    ['Sifatli lid belgilari', q.sifatliLid],
    ['Lidni baholash konteksti', q.lidKontekst],
    ["Yo'qotilgan lid tahlili", q.lidYoqotilgan],
    ['Menejer uchun ajratib ko\'rsatiladigan tavsiyalar', q.lidTavsiya],
  ]);
  return {
    ...p,
    promptNotes: {
      stage1: { vocabulary: q.atamalar, contextHint: q.transkripsiya.trim() },
      stage2: {
        businessContext: kontekstniYig(q.biznes, xizmatBlok),
        extractionHints: blokniYig(q.ajratish, blok2),
        taskGuidance: q.vazifa.trim(),
      },
      stage3: {
        // Lid sifati bosqichlari bloki (boshqa bo'lim boshqaradi) o'zgarmaydi
        scoringGuidance: bahoniYig(q.baholash, blok3, bahoniAjrat(p.promptNotes.stage3.scoringGuidance ?? '')[2]),
        coachingNotes: q.coaching.trim(),
        complianceNotes: q.qoida.trim(),
      },
    },
    leadQuality: {
      ...(p.leadQuality ?? {}),
      korsatmalar: { sifatliLid: q.sifatliLid.trim(), kontekst: q.lidKontekst.trim(), yoqotilgan: q.lidYoqotilgan.trim(), tavsiyalar: q.lidTavsiya.trim() },
    },
  };
}

const toldirilgan = (q: Qiymatlar, k: Kalit) => (k === 'atamalar' ? q.atamalar.length > 0 : q[k].trim().length > 0);
const tozaBody = (p: PlaybookBody): PlaybookBody => ({
  criteria: p.criteria,
  questionnaire: p.questionnaire,
  classificationPolicy: p.classificationPolicy,
  promptNotes: p.promptNotes,
  leadQuality: p.leadQuality ?? {},
});
const sanaVaqt = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const n = (x: number) => String(x).padStart(2, '0');
  return `${d.getFullYear()}.${n(d.getMonth() + 1)}.${n(d.getDate())}, ${n(d.getHours())}:${n(d.getMinutes())}`;
};

export function AiKorsatmalari() {
  const { business } = useAuth();
  const base = business ? `/api/v1/businesses/${business.businessId}` : '';
  const yozaOladi = business?.permissions.includes('playbook:write') ?? false;

  const [pb, setPb] = useState<PlaybookBody | null>(null);
  const [asl, setAsl] = useState<Qiymatlar | null>(null);
  const [q, setQ] = useState<Qiymatlar | null>(null);
  const [versiya, setVersiya] = useState<PlaybookVersion | null>(null);
  const [yoq, setYoq] = useState(false);
  const [band, setBand] = useState<1 | 2 | null>(null);
  const [xabar, setXabar] = useState<{ karta: 1 | 2; ton: 'ok' | 'xato'; matn: string } | null>(null);

  const yukla = useCallback(
    async (saqlanmagan?: Partial<Qiymatlar>) => {
      if (!base) return;
      try {
        const [p, vs] = await Promise.all([api.get<PlaybookBody>(`${base}/playbook`), api.get<PlaybookVersion[]>(`${base}/playbook/versions`).catch(() => [])]);
        const t = tozaBody(p);
        const v = oqi(t);
        setPb(t);
        setAsl(v);
        // Boshqa kartadagi saqlanmagan o'zgarishlar yo'qolmasin
        setQ({ ...v, ...saqlanmagan });
        setVersiya(vs.find((x) => x.isActive) ?? null);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setYoq(true);
      }
    },
    [base],
  );
  useEffect(() => void yukla(), [yukla]);

  const ozgargan = (kalitlar: Kalit[]) => !!q && !!asl && kalitlar.some((k) => JSON.stringify(q[k]) !== JSON.stringify(asl[k]));
  const ikkalasi = ozgargan([...KARTA1, ...KARTA2]);
  useEffect(() => {
    if (!ikkalasi) return;
    const f = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [ikkalasi]);

  /** Saqlangandan keyin AI o'qiydigan maydonlar hajmi (limitdan oshmasin). */
  const hajm = useMemo(() => {
    if (!pb || !q) return null;
    const y = yoz(pb, q).promptNotes;
    return { kontekst: y.stage2.businessContext.length, ajratish: y.stage2.extractionHints.length, baholash: y.stage3.scoringGuidance.length };
  }, [pb, q]);

  if (yoq)
    return (
      <section className="card bm-karta bm-bosh-holat">
        <Sparkles />
        <b>Playbook hali yaratilmagan</b>
        <span>AI ko'rsatmalari playbook bilan birga onboarding jarayonida yaratiladi.</span>
      </section>
    );
  if (!pb || !q || !asl || !hajm) return <div className="card skelet" style={{ height: 520 }} aria-busy="true" />;

  const hajmXato = (karta: 1 | 2) => {
    const x: string[] = [];
    if (karta === 1 && hajm.kontekst > KONTEKST_MAKS) x.push(`Kompaniya haqidagi matn (xizmat yo'nalishlari bilan) ${hajm.kontekst}/${KONTEKST_MAKS}`);
    if (karta === 1 && hajm.ajratish > AJRATISH_MAKS) x.push(`2-bosqich ko'rsatmalari jami ${hajm.ajratish}/${AJRATISH_MAKS}`);
    if (hajm.baholash > BAHOLASH_MAKS) x.push(`Baholash va lid ko'rsatmalari jami ${hajm.baholash}/${BAHOLASH_MAKS}`);
    return x;
  };

  async function saqla(karta: 1 | 2) {
    if (!pb || !q || !asl) return;
    const kalitlar = karta === 1 ? KARTA1 : KARTA2;
    const boshqa = karta === 1 ? KARTA2 : KARTA1;
    // Faqat shu kartaning maydonlari saqlanadi; boshqasi — serverdagi holatida
    const birlashgan = { ...asl } as Qiymatlar;
    for (const k of kalitlar) (birlashgan as Record<string, unknown>)[k] = q[k];
    const saqlanmagan = Object.fromEntries(boshqa.map((k) => [k, q[k]])) as Partial<Qiymatlar>;
    setBand(karta);
    try {
      const body = tozaBody(yoz(pb, birlashgan));
      const v = await api.post<{ valid: boolean; errors?: Record<string, string[]> }>(`${base}/playbook/validate`, body);
      if (!v.valid) {
        setXabar({ karta, ton: 'xato', matn: Object.values(v.errors ?? {}).flat()[0] ?? 'Server tekshiruvi xato topdi' });
        return;
      }
      await api.post(`${base}/playbook`, { ...body, changeNote: karta === 1 ? "Qo'ng'iroq tahlili ko'rsatmalari yangilandi" : 'Lid analitikasi ko\'rsatmalari yangilandi' });
      await yukla(saqlanmagan);
      setXabar({ karta, ton: 'ok', matn: 'Saqlandi — yangi versiya faollashtirildi' });
      setTimeout(() => setXabar((x) => (x?.karta === karta && x.ton === 'ok' ? null : x)), 3500);
    } catch (e) {
      setXabar({ karta, ton: 'xato', matn: e instanceof ApiError ? e.message : "Saqlanmadi — qayta urinib ko'ring" });
    } finally {
      setBand(null);
    }
  }

  const ozgar = (k: Kalit, v: string | string[]) => setQ((x) => (x ? { ...x, [k]: v } : x));
  const soni = (ks: Kalit[]) => ks.filter((k) => toldirilgan(q, k)).length;

  const qator = (m: Maydon) => (
    <div key={m.k} className="ak-qator">
      <label htmlFor={`ak-${m.k}`} className={`ak-savol${toldirilgan(q, m.k) ? ' toliq' : ''}`}>
        {m.savol}
      </label>
      <div className="ak-maydon">
        {m.k === 'atamalar' ? (
          <Atamalar id={`ak-${m.k}`} qiymat={q.atamalar} onOzgar={(v) => ozgar('atamalar', v)} misol={m.misol} disabled={!yozaOladi} />
        ) : (
          <>
            <textarea
              id={`ak-${m.k}`}
              value={q[m.k]}
              onChange={(e) => ozgar(m.k, e.target.value)}
              placeholder={m.misol}
              maxLength={m.maks}
              disabled={!yozaOladi}
              rows={3}
            />
            {q[m.k].length > m.maks * 0.8 && (
              <small className="ak-hisob">
                {q[m.k].length}/{m.maks}
              </small>
            )}
          </>
        )}
      </div>
    </div>
  );

  const past = (karta: 1 | 2) => {
    const xatolar = hajmXato(karta);
    const oz = ozgargan(karta === 1 ? KARTA1 : KARTA2);
    return (
      <div className="ak-past">
        {xabar?.karta === karta && (
          <span className={`ak-xabar ${xabar.ton}`} role={xabar.ton === 'xato' ? 'alert' : 'status'}>
            {xabar.ton === 'ok' ? <CircleCheck /> : <TriangleAlert />} {xabar.matn}
          </span>
        )}
        {xatolar.length > 0 && (
          <span className="ak-xabar xato" role="alert">
            <TriangleAlert /> Juda uzun: {xatolar.join('; ')}
          </span>
        )}
        {oz && !xabar && xatolar.length === 0 && <span className="kr-holat">Saqlanmagan o'zgarishlar bor</span>}
        {yozaOladi && (
          <>
            {oz && (
              <button
                type="button"
                className="btn ikkinchi"
                disabled={band !== null}
                onClick={() => setQ((x) => (x ? ({ ...x, ...Object.fromEntries((karta === 1 ? KARTA1 : KARTA2).map((k) => [k, asl[k]])) } as Qiymatlar) : x))}
              >
                Bekor qilish
              </button>
            )}
            <button type="button" className="btn" disabled={!oz || band !== null || xatolar.length > 0} onClick={() => void saqla(karta)}>
              {band === karta ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="as">
      <section className="card as-karta">
        <h2 className="as-sarlavha">AI ko'rsatmalari</h2>
        <div className="as-meta">
          {versiya && <span className="bm-versiya">Versiya {versiya.version}</span>}
          <span>Yangilangan: {sanaVaqt(versiya?.activatedAt ?? versiya?.createdAt)}</span>
        </div>
        <div className="as-diqqat">
          <TriangleAlert aria-hidden="true" />
          <span>
            Bu sozlamalar AI qo'ng'iroqlar va lidlarni qanday tahlil qilishiga ta'sir qiladi. Har bir saqlash yangi playbook versiyasini yaratadi —
            eski baholar o'zgarmaydi.
          </span>
        </div>
      </section>

      <p className="ak-izoh">AI tahlil qilishda qo'shimcha kontekst sifatida ishlatadigan matnlar.</p>

      <section className="card ak-tashqi">
        <div className="ak-karta">
          <header className="ak-bosh">
            <div>
              <h3>Qo'ng'iroq tahlili ko'rsatmalari</h3>
              <p>Bu maydonlar AI'ga ko'rinadi va transkripsiya, anketa, vazifa yaratish hamda baholash natijasiga ta'sir qiladi.</p>
            </div>
            <span className="ak-pill">
              {soni(KARTA1)}/{KARTA1.length} to'ldirilgan
            </span>
          </header>
          {BOSQICHLAR.map((b) => (
            <div key={b.nom} className="ak-bosqich">
              <div className="ak-bosqich-nom">
                <b>{b.nom}</b>
                <span />
                <small>
                  {soni(b.maydonlar.map((m) => m.k))}/{b.maydonlar.length}
                </small>
              </div>
              {b.maydonlar.map(qator)}
            </div>
          ))}
          {past(1)}
        </div>
      </section>

      <section className="card ak-tashqi">
        <div className="ak-karta">
          <header className="ak-bosh">
            <div>
              <h3>Lid analitikasi</h3>
              <p>Bu maydonlar AI'ga ko'rinadi va lid yo'qotilish sabablari hamda tavsiyalarni qanday yozishini boshqaradi.</p>
            </div>
            <span className="ak-pill">
              {soni(KARTA2)}/{KARTA2.length} to'ldirilgan
            </span>
          </header>
          <div className="ak-bosqich">{LID.map(qator)}</div>
          {past(2)}
        </div>
      </section>
    </div>
  );
}

function Atamalar({ id, qiymat, onOzgar, misol, disabled }: { id: string; qiymat: string[]; onOzgar: (v: string[]) => void; misol: string; disabled: boolean }) {
  const [matn, setMatn] = useState('');
  const qosh = (s: string) => {
    const yangi = s
      .split(',')
      .map((x) => x.trim().slice(0, 80))
      .filter((x) => x && !qiymat.some((y) => y.toLowerCase() === x.toLowerCase()));
    if (yangi.length) onOzgar([...qiymat, ...new Set(yangi)]);
    setMatn('');
  };
  return (
    <div className="ak-atamalar">
      {qiymat.map((t) => (
        <span key={t} className="as-variant">
          {t}
          {!disabled && (
            <button type="button" aria-label={`${t} — olib tashlash`} onClick={() => onOzgar(qiymat.filter((x) => x !== t))}>
              <X />
            </button>
          )}
        </span>
      ))}
      {!disabled && (
        <input
          id={id}
          value={matn}
          onChange={(e) => (e.target.value.includes(',') ? qosh(e.target.value) : setMatn(e.target.value))}
          onKeyDown={(e: RKeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              qosh(matn);
            } else if (e.key === 'Backspace' && !matn && qiymat.length) onOzgar(qiymat.slice(0, -1));
          }}
          onBlur={() => matn.trim() && qosh(matn)}
          onPaste={(e) => {
            const t = e.clipboardData.getData('text');
            if (t.includes(',') || t.includes('\n')) {
              e.preventDefault();
              qosh(t.replace(/\n/g, ','));
            }
          }}
          placeholder={qiymat.length ? 'Yana atama… (Enter yoki vergul)' : misol}
          maxLength={80}
        />
      )}
    </div>
  );
}
