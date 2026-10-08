import { Clock3 } from 'lucide-react';
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ConversationDetail, ConversationRow } from '../../api';
import { MalumotIkon } from '../bosh/Korsatkichlar';
import { davomiylik, davomiylikMatn, oraliqda } from '../bosh/malumot';
import { GorizontalUstun, KopChiziqliGrafik } from './grafiklar';
import { bolakda, bolaklar } from './qoshimcha';
import type { TabProps } from './Tablar';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FAOLIYAT TAHLILI — jamoa qachon, qancha va qanchalik tez ishlayapti?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ta'riflar (hammasi mavjud ma'lumotdan):
 *   • Ulangan — mijoz bilan haqiqiy muloqot bo'lgan suhbat (filtrlanmagan).
 *   • Bog'lana olmagan — filtrlangan: bo'sh, juda qisqa yoki mijoz javob
 *     bermagan (prefiltr sababi suhbat kartasida yoziladi).
 *   • Yo'nalish, ish vaqti, mijoz (kontakt) — tahlil tafsilotidan; shuning
 *     uchun bu bo'limlar faqat tafsiloti yuklangan tahlillar bo'yicha.
 *   • Javobsiz — suhbat mijoz xabari bilan tugagan (AI: needsReply).
 *   • Yangi lid — shu kontakt bilan birinchi qayd etilgan suhbat.
 */

const ulangan = (r: ConversationRow) => r.status !== 'filtered';
const SOAT = 3600;

function sekundMatn(s: number | null): string {
  if (s === null) return '—';
  if (s < 60) return `${Math.round(s)} son`;
  if (s < SOAT) return `${Math.round(s / 60)} daq`;
  return `${Math.round((s / SOAT) * 10) / 10} soat`;
}
function mediana(v: number[]): number | null {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b);
  const o = Math.floor(s.length / 2);
  return s.length % 2 ? s[o]! : (s[o - 1]! + s[o]!) / 2;
}
const tezRang = (s: number | null) => (s === null ? '' : s <= SOAT ? 'yaxshi' : s <= 4 * SOAT ? 'orta' : 'past');

export function FaoliyatTahlili({ data, davr, q }: TabProps) {
  const [menejer, setMenejer] = useState('');
  // null — avtomatik: yo'nalish bo'lsa kiruvchi/chiquvchi, aks holda bog'lanish
  const [trendTanlov, setTrendTuri] = useState<'yonalish' | 'boglanish' | null>(null);
  const [oyna, setOyna] = useState(30);

  const ism = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data.seats) m.set(s.id, s.displayName);
    for (const r of data.board) if (!m.has(r.seatId)) m.set(r.seatId, r.displayName);
    return m;
  }, [data.seats, data.board]);

  const joriy = useMemo(() => oraliqda(data.suhbatlar, davr.from, davr.to), [data.suhbatlar, davr]);
  const tafsilot = useMemo(
    () => joriy.map((r) => q.tafsilot[r.id]).filter((d): d is ConversationDetail => !!d),
    [joriy, q.tafsilot],
  );
  const davom = (r: ConversationRow) => q.tafsilot[r.id]?.conversation.durationSeconds ?? davomiylik(r);

  // ─── Ko'rsatkichlar ───
  const ul = joriy.filter(ulangan);
  const boglanmagan = joriy.length - ul.length;
  const tahlil = joriy.filter((r) => r.status === 'done');
  const baholangan = tahlil.filter((r) => r.overallScore !== null);
  const ortDavom = (() => {
    const v = ul.map(davom).filter((x): x is number => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  })();

  // ─── Soatlar ───
  const soatQator = menejer ? joriy.filter((r) => (r.seatId ?? '') === menejer) : joriy;
  const soatlar = Array.from({ length: 24 }, (_, s) => {
    const bu = soatQator.filter((r) => new Date(r.startedAt).getHours() === s);
    const u = bu.filter(ulangan).length;
    return { soat: s, ulangan: u, yoq: bu.length - u, jami: bu.length };
  }).filter((x) => x.jami > 0);
  const engYaxshi = [...soatlar]
    .filter((x) => x.jami >= Math.min(3, Math.max(...soatlar.map((y) => y.jami), 0)))
    .sort((a, b) => b.ulangan / b.jami - a.ulangan / a.jami || b.jami - a.jami)[0];

  // ─── Tendensiya ───
  const { royxat } = bolaklar(davr);
  const yonalishBor = tafsilot.some((d) => d.conversation.direction === 'inbound' || d.conversation.direction === 'outbound');
  const trendTuri = trendTanlov ?? (yonalishBor ? 'yonalish' : 'boglanish');
  const yon = (r: ConversationRow) => q.tafsilot[r.id]?.conversation.direction;
  const trendSeriya =
    trendTuri === 'yonalish'
      ? [
          { kalit: 'in', nom: 'Kiruvchi', rang: 'var(--s1)', f: (r: ConversationRow) => yon(r) === 'inbound' },
          { kalit: 'out', nom: 'Chiquvchi', rang: 'var(--s5)', f: (r: ConversationRow) => yon(r) === 'outbound' },
        ]
      : [
          { kalit: 'ul', nom: 'Ulangan', rang: 'var(--s3)', f: ulangan },
          { kalit: 'yoq', nom: "Bog'lana olmagan", rang: 'var(--s2)', f: (r: ConversationRow) => !ulangan(r) },
        ];


  // ─── Menejerlar ───
  const menejerlar = [...new Set(joriy.map((r) => r.seatId ?? ''))]
    .map((s) => {
      const bu = joriy.filter((r) => (r.seatId ?? '') === s);
      const u = bu.filter(ulangan);
      const t = bu.filter((r) => r.status === 'done');
      const b = t.filter((r) => r.overallScore !== null);
      const vaqt = u.map(davom).filter((x): x is number => x !== null).reduce((a, x) => a + x, 0);
      const seat = data.seats.find((x) => x.id === s);
      return {
        s,
        nom: s ? ism.get(s) ?? 'Menejer' : 'Biriktirilmagan',
        faol: seat?.isActive ?? !!s,
        jami: bu.length,
        ulangan: u.length,
        vaqt,
        tahlil: t.length,
        baholangan: b.length,
        operatsion: t.length - b.length,
        yoq: bu.length - u.length,
      };
    })
    .sort((a, b) => b.jami - a.jami);

  // ─── Javobsiz va qayta bog'lanilmagan ───
  const javobsiz = useMemo(() => {
    const tartib = [...tafsilot].sort((a, b) => +new Date(a.conversation.startedAt) - +new Date(b.conversation.startedAt));
    return tartib
      .filter((d) => d.analysis?.dynamics?.needsReply === true)
      .filter((d) => {
        // Oyna ichida shu kontakt bilan keyingi suhbat bo'lsa — qayta bog'lanilgan
        const oxiri = new Date(d.conversation.endedAt ?? d.conversation.startedAt).getTime();
        const kid = d.contact?.id;
        if (!kid) return true;
        return !tartib.some(
          (x) => x !== d && x.contact?.id === kid && +new Date(x.conversation.startedAt) > oxiri && +new Date(x.conversation.startedAt) <= oxiri + oyna * 60_000,
        );
      });
  }, [tafsilot, oyna]);
  const ishVaqtida = javobsiz.filter((d) => !d.conversation.isOffHours).length;
  const javobsizSeat = [...new Set(javobsiz.map((d) => d.conversation.seatId ?? ''))]
    .map((s) => {
      const bu = javobsiz.filter((d) => (d.conversation.seatId ?? '') === s);
      return { s, nom: s ? ism.get(s) ?? 'Menejer' : 'Biriktirilmagan', jami: bu.length, ish: bu.filter((d) => !d.conversation.isOffHours).length };
    })
    .sort((a, b) => b.jami - a.jami);
  const javobsizMax = Math.max(1, ...javobsizSeat.map((x) => x.jami));

  // ─── Yangi lidga birinchi javob ───
  const yangi = tafsilot.filter((d) => d.analysis && d.previousConversations.length === 0);
  const javobVaqti = (d: ConversationDetail) => d.analysis?.dynamics?.replyMetrics?.firstResponseSeconds ?? null;
  const javobli = yangi.filter((d) => javobVaqti(d) !== null);
  const vaqtlar = javobli.map((d) => javobVaqti(d)!);
  const oraliqlar = [
    { nom: '0–1 soat', f: (s: number) => s <= SOAT, rang: 'yaxshi' },
    { nom: '1–4 soat', f: (s: number) => s > SOAT && s <= 4 * SOAT, rang: 'ia' },
    { nom: '4–24 soat', f: (s: number) => s > 4 * SOAT && s <= 24 * SOAT, rang: 'orta' },
    { nom: '24+ soat', f: (s: number) => s > 24 * SOAT, rang: 'past' },
  ];
  const yangiSeat = [...new Set(yangi.map((d) => d.conversation.seatId ?? ''))]
    .map((s) => {
      const bu = yangi.filter((d) => (d.conversation.seatId ?? '') === s);
      const j = bu.filter((d) => javobVaqti(d) !== null);
      const v = j.map((d) => javobVaqti(d)!);
      return {
        s,
        nom: s ? ism.get(s) ?? 'Menejer' : 'Biriktirilmagan',
        lid: bu.length,
        javob: j.length,
        med: mediana(v),
        tez: v.filter((x) => x <= SOAT).length,
      };
    })
    .sort((a, b) => b.lid - a.lid);

  const foiz = (a: number, b: number) => (b ? Math.round((a / b) * 1000) / 10 : 0);
  const faolSeat = new Set(joriy.map((r) => r.seatId).filter(Boolean));

  return (
    <div className="an-bolim">
      {q.tafsilotKutilmoqda > 0 && <div className="an-eslatma">Tahlil tafsilotlari yuklanmoqda — yana {q.tafsilotKutilmoqda} ta…</div>}

      <div className="fa-kpi">
        <Kpi qiymat={joriy.length} nom="Jami suhbatlar" izoh="Davrdagi barcha suhbat va qo'ng'iroqlar" />
        <Kpi qiymat={engYaxshi ? `${String(engYaxshi.soat).padStart(2, '0')}:00` : '—'} nom="Eng yaxshi javob soati" izoh="Mijoz bilan bog'lanish ulushi eng yuqori bo'lgan soat" rang="yaxshi" />
        <Kpi qiymat={ul.length} nom="Ulangan" izoh="Mijoz bilan haqiqiy muloqot bo'lgan suhbatlar" rang="yaxshi" />
        <Kpi qiymat={boglanmagan} nom="Bog'lana olmagan" izoh="Bo'sh, juda qisqa yoki mijoz javob bermagan (filtrlangan)" rang="past" />
        <Kpi qiymat={tahlil.length} nom="Tahlil qilingan" izoh="AI tahlilidan o'tgan suhbatlar" rang="ia" />
        <Kpi qiymat={baholangan.length} nom="Baholangan" izoh="Mezonlar bo'yicha ball qo'yilgan suhbatlar" rang="yaxshi" />
        <Kpi qiymat={davomiylikMatn(ortDavom)} nom="O'rtacha davomiylik" izoh="Ulangan suhbatlarning o'rtacha davomiyligi" />
      </div>

      {/* ─── Soatlar bo'yicha ─── */}
      <section className="card an-karta">
        <div className="karta-bosh">
          <h2>
            <span className="fa-sarlavha-ikon">
              <Clock3 />
            </span>
            Mijoz javobi soatlar bo'yicha <MalumotIkon matn="Har soatda boshlangan suhbatlar: mijoz bilan bog'lanilgani va bog'lanib bo'lmagani. Pastdagi foiz — ulangan ulush" />
          </h2>
          <select className="input fa-select" value={menejer} onChange={(e) => setMenejer(e.target.value)} aria-label="Menejer">
            <option value="">Hammasi</option>
            {menejerlar
              .filter((m) => m.s)
              .map((m) => (
                <option key={m.s} value={m.s}>
                  {m.nom}
                </option>
              ))}
          </select>
        </div>
        {soatlar.length === 0 ? (
          <div className="jm-bosh">Bu davrda suhbat yo'q.</div>
        ) : (
          <SoatUstunlari soatlar={soatlar} eng={engYaxshi?.soat ?? null} />
        )}
      </section>

      {/* ─── Tendensiya ─── */}
      <section className="card an-karta">
        <div className="karta-bosh">
          <h2>
            Faollik tendensiyasi <MalumotIkon matn="Kunlar (yoki haftalar) bo'yicha suhbatlar soni" />
          </h2>
          <div className="tab-qator" role="tablist">
            <button type="button" role="tab" aria-selected={trendTuri === 'yonalish'} className={`tab${trendTuri === 'yonalish' ? ' active' : ''}`} onClick={() => setTrendTuri('yonalish')}>
              Kiruvchi va Chiquvchi
            </button>
            <button type="button" role="tab" aria-selected={trendTuri === 'boglanish'} className={`tab${trendTuri === 'boglanish' ? ' active' : ''}`} onClick={() => setTrendTuri('boglanish')}>
              Bog'lanish
            </button>
          </div>
        </div>
        {trendTuri === 'yonalish' && !yonalishBor ? (
          <div className="jm-bosh">
            Yo'nalish (kiruvchi/chiquvchi) faqat qo'ng'iroqlarda aniqlanadi — bu davrdagi suhbatlarda yo'nalish yo'q. «Bog'lanish» ko'rinishini tanlang.
          </div>
        ) : (
          <>
            {trendTuri === 'yonalish' && <p className="vt-izoh vt-izoh-past">Yo'nalish tahlil tafsilotidan olinadi — tafsiloti yuklangan suhbatlar bo'yicha.</p>}
            <KopChiziqliGrafik
              belgilar={royxat.map((b) => b.nom)}
              seriyalar={trendSeriya.map((s) => ({
                kalit: s.kalit,
                nom: s.nom,
                rang: s.rang,
                qiymatlar: royxat.map((b) => bolakda(joriy, b).filter(s.f).length),
              }))}
              balandlik={260}
              nom="Faollik tendensiyasi"
              maydon
            />
          </>
        )}
      </section>

      {/* ─── Qamrov ─── */}
      <section className="card an-karta fa-qamrov">
        <div>
          <h2>
            Menejerlar va AI qamrovi <MalumotIkon matn="Ro'yxatdagi menejerlar va ulardan qaysilari davrda suhbat olib borgani" />
          </h2>
          <p className="vt-izoh">
            Bu yerda barcha menejerlar ko'rinadi. AI tahlili suhbati bor menejerlar uchun to'ladi; suhbati bo'lmaganlar ro'yxatda qoladi, lekin
            tahlilda chiziqcha bilan ko'rsatiladi.
          </p>
        </div>
        <div className="fa-qamrov-kartalar">
          <Kichik qiymat={data.seats.length} nom="Menejerlar" izoh="Biznesdagi barcha menejer o'rinlari" />
          <Kichik qiymat={data.seats.filter((s) => faolSeat.has(s.id)).length} nom="AI bilan qamralgan" izoh="Davrda kamida bitta suhbati bor menejerlar" rang="yaxshi" />
          <Kichik qiymat={data.seats.filter((s) => !faolSeat.has(s.id)).length} nom="Suhbatsiz" izoh="Davrda suhbati bo'lmagan menejerlar" rang="orta" />
          <Kichik qiymat={joriy.filter((r) => !r.seatId).length} nom="Menejersiz suhbatlar" izoh="Hech bir menejerga biriktirilmagan suhbatlar" rang="ia" />
        </div>
      </section>

      {/* ─── Menejerlar faolligi ─── */}
      <section className="card an-karta">
        <div className="karta-bosh">
          <h2>
            Menejerlar faolligi <MalumotIkon matn="Operatsion — tahlil qilingan, lekin mezonlar bo'yicha baholanmagan suhbatlar (masalan, mavjud mijoz bilan xizmat suhbati)" />
          </h2>
        </div>
        {menejerlar.length === 0 ? (
          <div className="jm-bosh">Bu davrda suhbat yo'q.</div>
        ) : (
          <div className="sn-jadval-qobiq">
            <table className="vt-jadval fa-jadval">
              <thead>
                <tr>
                  <th>Menejer</th>
                  <th>Jami</th>
                  <th>Ulangan</th>
                  <th>Jami suhbat vaqti</th>
                  <th>Tahlil qilingan</th>
                  <th>Baholangan</th>
                  <th>Operatsion</th>
                  <th>Ulanmagan</th>
                </tr>
              </thead>
              <tbody>
                {menejerlar.map((m) => (
                  <tr key={m.s || '—'}>
                    <td>
                      <b>{m.nom}</b>
                      {m.s && <span className={`fa-belgi ${m.faol ? 'faol' : ''}`}>{m.faol ? 'AI ulangan' : 'Nofaol'}</span>}
                    </td>
                    <td className="an-son">{m.jami}</td>
                    <td className="an-son fa-yashil">{m.ulangan}</td>
                    <td>{m.vaqt ? davomiylikMatn(m.vaqt) : '—'}</td>
                    <td className="an-son fa-kok">{m.tahlil}</td>
                    <td className="an-son fa-yashil">{m.baholangan}</td>
                    <td className="an-son">{m.operatsion}</td>
                    <td className="an-son fa-sariq">{m.yoq}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card an-karta">
        <div className="karta-bosh">
          <h2>
            Bog'lana olmagan <MalumotIkon matn="Har menejerda mijoz bilan muloqot bo'lmagan (filtrlangan) suhbatlar" />
          </h2>
        </div>
        {boglanmagan === 0 ? (
          <div className="jm-bosh">Bog'lana olmagan suhbat yo'q.</div>
        ) : (
          <GorizontalUstun royxat={menejerlar.filter((m) => m.yoq > 0).map((m) => ({ nom: m.nom, soni: m.yoq }))} rang="var(--s2)" />
        )}
      </section>

      {/* ─── Javobsiz ─── */}
      <section className="fa-blok">
        <div className="fa-blok-bosh">
          <div>
            <h2 className="sn-bolim-sarlavha">
              Javob berilmagan va qayta bog'lanilmagan murojaatlar{' '}
              <MalumotIkon matn="Suhbat mijoz xabari bilan tugagan (javob kutib qolgan) va tanlangan muddat ichida shu mijoz bilan yangi suhbat bo'lmagan" />
            </h2>
            <p className="vt-izoh">
              Murojaat tanlangan muddat tugagandan keyingina hisoblanadi; agar shu vaqt ichida o'sha mijoz bilan qayta suhbat bo'lsa, hisoblanmaydi.
              Tahlil tafsilotlari bo'yicha.
            </p>
          </div>
          <div className="fa-oyna">
            <span>Qayta bog'lanish muddati</span>
            <div className="tab-qator">
              {[
                [30, '30 daqiqa'],
                [60, '1 soat'],
                [180, '3 soat'],
              ].map(([m, nom]) => (
                <button key={m} type="button" className={`tab${oyna === m ? ' active' : ''}`} onClick={() => setOyna(m as number)}>
                  {nom}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="fa-uchlik">
          <Kpi qiymat={javobsiz.length} nom="Javobsiz va qayta bog'lanilmagan" izoh="Jami" rang="past" />
          <Kpi qiymat={ishVaqtida} nom={`Ish vaqtida (${Math.round(foiz(ishVaqtida, javobsiz.length))}%)`} izoh="Ish vaqtida kelgan, lekin javobsiz qolgan" rang="past" />
          <Kpi qiymat={javobsiz.length - ishVaqtida} nom={`Ish tashqarisida (${Math.round(foiz(javobsiz.length - ishVaqtida, javobsiz.length))}%)`} izoh="Ish vaqtidan tashqari kelgan murojaatlar" />
        </div>
        {javobsizSeat.length > 0 && (
          <div className="card an-karta fa-javobsiz">
            {javobsizSeat.map((x) => (
              <div key={x.s || '—'} className="fa-javobsiz-qator">
                <div className="mt-hayoq-bosh">
                  <b>{x.nom}</b>
                  <small>
                    <em>{x.jami}</em> (ish vaqtida: {x.ish} | ish tashqarisida: {x.jami - x.ish})
                  </small>
                </div>
                <div className="fa-javobsiz-chiziq" style={{ width: `${(x.jami / javobsizMax) * 100}%` }}>
                  {x.ish > 0 && <span className="ish" style={{ flexGrow: x.ish }} />}
                  {x.jami - x.ish > 0 && <span className="tashqari" style={{ flexGrow: x.jami - x.ish }} />}
                </div>
              </div>
            ))}
            <div className="g-legenda g-legenda-doira g-legenda-chap">
              <span>
                <i style={{ background: 'var(--past)' }} /> Ish vaqtida
              </span>
              <span>
                <i style={{ background: 'var(--text-muted)' }} /> Ish tashqarisida
              </span>
            </div>
          </div>
        )}
      </section>

      {/* ─── Yangi lid ─── */}
      <section className="fa-blok">
        <h2 className="sn-bolim-sarlavha">
          Yangi lidga birinchi javob tezligi{' '}
          <MalumotIkon matn="Yangi lid — shu mijoz bilan birinchi qayd etilgan suhbat. Tezlik — mijozning birinchi xabaridan menejer javobigacha" />
        </h2>
        <div className="fa-tortlik">
          <Kpi qiymat={yangi.length} nom="Jami yangi lidlar" izoh="Tahlil qilingan, avval suhbati bo'lmagan mijozlar" />
          <Kpi qiymat={`${javobli.length} (${foiz(javobli.length, yangi.length)}%)`} nom="Javob berilgan" izoh="Menejer javob bergan yangi lidlar" rang="yaxshi" />
          <Kpi qiymat={yangi.length - javobli.length} nom="Javob berilmagan" izoh="Menejer javobi qayd etilmagan" rang="past" />
          <Kpi qiymat={sekundMatn(mediana(vaqtlar))} nom="Median javob tezligi" izoh="Yarmi shundan tezroq javob olgan" rang="orta" />
          {oraliqlar.map((o) => (
            <Kpi key={o.nom} qiymat={vaqtlar.filter(o.f).length} nom={o.nom} izoh={`Birinchi javob ${o.nom} ichida`} rang={o.rang as 'yaxshi'} />
          ))}
        </div>
        {yangiSeat.length > 0 && (
          <div className="card fa-lid-jadval">
            <table className="vt-jadval">
              <thead>
                <tr>
                  <th>Menejer</th>
                  <th>Lidlar</th>
                  <th>Javob berilgan</th>
                  <th>Median javob tezligi</th>
                  <th>0–1 soat</th>
                </tr>
              </thead>
              <tbody>
                {yangiSeat.map((x) => {
                  const f = foiz(x.javob, x.lid);
                  return (
                    <tr key={x.s || '—'}>
                      <td>
                        <b>{x.nom}</b>
                      </td>
                      <td className="an-son">{x.lid}</td>
                      <td>
                        <span className={`fa-pill ${f >= 70 ? 'yaxshi' : f >= 40 ? 'orta' : 'past'}`}>
                          {x.javob} ({f}%)
                        </span>
                      </td>
                      <td className={`fa-tez ${tezRang(x.med)}`}>{sekundMatn(x.med)}</td>
                      <td>
                        <b>{x.tez}</b> <small className="fa-xira">({foiz(x.tez, x.javob)}%)</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ─── Qismlar ────────────────────────────────────────────────────────────────

function Kpi({ qiymat, nom, izoh, rang }: { qiymat: ReactNode; nom: string; izoh: string; rang?: 'yaxshi' | 'past' | 'ia' | 'orta' }) {
  return (
    <div className="vt-son">
      <span className="vt-son-ichi">
        <b className={`fa-r-${rang ?? 'yoq'}`}>{qiymat}</b>
        <small>
          {nom} <MalumotIkon matn={izoh} />
        </small>
      </span>
    </div>
  );
}

function Kichik({ qiymat, nom, izoh, rang }: { qiymat: number; nom: string; izoh: string; rang?: 'yaxshi' | 'orta' | 'ia' }) {
  return (
    <div className={`fa-kichik ${rang ?? ''}`}>
      <b>{qiymat}</b>
      <small>
        {nom} <MalumotIkon matn={izoh} />
      </small>
    </div>
  );
}

/** Soat bo'yicha ustma-ust ustunlar: ulangan (pastda) + bog'lana olmagan, ostida ulangan foizi. */
function SoatUstunlari({ soatlar, eng }: { soatlar: { soat: number; ulangan: number; yoq: number; jami: number }[]; eng: number | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [kenglik, setKenglik] = useState(0);
  const [faol, setFaol] = useState<number | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const yangila = () => setKenglik(el.clientWidth);
    yangila();
    const k = new ResizeObserver(yangila);
    k.observe(el);
    return () => k.disconnect();
  }, []);
  const CHAP = 44;
  const BAL = 300;
  const TEPA = 12;
  const PAST = 48;
  const w = Math.max(0, kenglik - CHAP - 8);
  const h = BAL - TEPA - PAST;
  const engKatta = Math.max(1, ...soatlar.map((s) => s.jami));
  const qadamY = [1, 2, 5, 10, 20, 25, 50, 100, 125, 250, 500, 1000].find((q) => engKatta / q <= 4) ?? Math.ceil(engKatta / 4);
  const max = Math.ceil((engKatta * 1.05) / qadamY) * qadamY;
  const n = soatlar.length;
  const qadam = n ? w / n : 0;
  const en = Math.max(6, Math.min(64, qadam * 0.42));
  const y = (v: number) => TEPA + h - (v / max) * h;
  const chiziqlar = Array.from({ length: Math.round(max / qadamY) + 1 }, (_, i) => i * qadamY);
  const fs = faol !== null ? soatlar[faol] : null;

  return (
    <div className="g-qobiq" ref={ref}>
      {kenglik > 0 && (
        <svg width={kenglik} height={BAL} role="img" aria-label="Mijoz javobi soatlar bo'yicha" onMouseLeave={() => setFaol(null)}>
          {chiziqlar.map((v) => (
            <g key={v}>
              <line className="g-tor" x1={CHAP} x2={CHAP + w} y1={y(v)} y2={y(v)} />
              <text className="g-yorliq" x={CHAP - 8} y={y(v) + 4} textAnchor="end">
                {v}
              </text>
            </g>
          ))}
          {soatlar.map((s, i) => {
            const cx = CHAP + qadam * i + qadam / 2;
            const x0 = cx - en / 2;
            const hu = (s.ulangan / max) * h;
            const hy = (s.yoq / max) * h;
            const ust = TEPA + h - hu - hy;
            const r = Math.min(5, en / 2);
            const f = Math.round((s.ulangan / s.jami) * 100);
            return (
              <g key={s.soat}>
                <rect x={CHAP + qadam * i} y={TEPA} width={qadam} height={h} fill="transparent" onMouseEnter={() => setFaol(i)} />
                {faol === i && <rect className="g-hover-fon" x={CHAP + qadam * i + 2} y={TEPA} width={qadam - 4} height={h} rx={6} />}
                {/* Butun ustun yumaloq uchli; ichida ulangan qism pastda */}
                <path
                  d={`M${x0},${TEPA + h} V${ust + r} Q${x0},${ust} ${x0 + r},${ust} H${x0 + en - r} Q${x0 + en},${ust} ${x0 + en},${ust + r} V${TEPA + h} Z`}
                  className="fa-ustun-yoq"
                  pointerEvents="none"
                />
                {hu > 0 && (
                  <rect x={x0} y={TEPA + h - hu} width={en} height={Math.max(0, hu - (hy > 0 ? 0 : 0))} className="fa-ustun-ul" pointerEvents="none" rx={hy > 0 ? 0 : r} />
                )}
                {hu > 0 && hy > 0 && <line x1={x0} x2={x0 + en} y1={TEPA + h - hu} y2={TEPA + h - hu} className="fa-ustun-ajrat" />}
                <text className="g-yorliq" x={cx} y={TEPA + h + 18} textAnchor="middle">
                  {String(s.soat).padStart(2, '0')}:00
                </text>
                <text className={`fa-foiz${s.soat === eng ? ' eng' : ''}`} x={cx} y={TEPA + h + 36} textAnchor="middle">
                  {f}%
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {fs && faol !== null && (
        <div
          className="g-maslahat"
          role="tooltip"
          style={{ left: Math.min(Math.max(90, CHAP + qadam * faol + qadam / 2), kenglik - 90), top: y(fs.jami) }}
        >
          <b>{String(fs.soat).padStart(2, '0')}:00 — {fs.jami} ta</b>
          <span>
            <i className="g-belgi" style={{ background: 'var(--s3)' }} /> Ulangan: {fs.ulangan}
          </span>
          <span>
            <i className="g-belgi" style={{ background: 'var(--text-muted)' }} /> Bog'lana olmagan: {fs.yoq}
          </span>
        </div>
      )}
      <div className="g-legenda g-legenda-doira g-legenda-chap" style={{ marginTop: 6 }}>
        <span>
          <i style={{ background: 'var(--s3)' }} /> Mijoz bilan bog'lanildi
        </span>
        <span>
          <i style={{ background: 'var(--text-muted)' }} /> Bog'lana olmadi
        </span>
      </div>
    </div>
  );
}
