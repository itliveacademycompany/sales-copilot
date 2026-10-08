import { Gauge, Info, RefreshCw, ScanSearch, Sparkles, UsersRound } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BALL_CHEGARA, ballRang, type ConversationDetail, type ConversationRow, type Rubric } from '../../api';
import { MalumotIkon } from '../bosh/Korsatkichlar';
import { avatarRang, boshHarf, davomiylik, oraliqda, ortacha, type BoshMalumot } from '../bosh/malumot';
import { KopChiziqliGrafik } from './grafiklar';
import { bolakda, bolaklar } from './qoshimcha';
import type { TabProps } from './Tablar';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * JAMOA MALAKASINI OSHIRISH — hozir kim bilan, nima ustida ishlash kerak?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bu yerdagi "AI" matnlari alohida model chaqiruvi emas: har qo'ng'iroq
 * tahlilida AI yozgan kuchli tomonlar, yaxshilash nuqtalari, asosiy kamchilik
 * va tavsiya iboralari davr bo'yicha yig'iladi, mezon ballari va rubrikalari
 * bilan to'ldiriladi. Shuning uchun har jumla manbasiga qaytariladi va
 * o'ylab topilgan raqam yo'q.
 */

const ZAIF = BALL_CHEGARA.yaxshi; // 60% dan past — zaif
const KUCHLI = BALL_CHEGARA.yuqori; // 80% va undan yuqori — kuchli
const SERIYA = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)'];
/** Bir daqiqadan qisqa suhbat namuna bo'la olmaydi. */
const MIN_DAVOM = 60;

interface Tahlil {
  row: ConversationRow;
  d: ConversationDetail;
  ball: number | null;
  seat: string;
}

/** Bir xil fikr turli yozilishi mumkin — kichik harf, nuqtasiz, bo'shliqsiz kalit. */
const kalit = (t: string) => t.trim().replace(/[.!]+$/, '').replace(/\s+/g, ' ').toLowerCase();

function sanab(matnlar: string[]): { matn: string; soni: number }[] {
  const m = new Map<string, { matn: string; soni: number }>();
  for (const t of matnlar) {
    if (!t?.trim()) continue;
    const k = kalit(t);
    const bor = m.get(k);
    if (bor) bor.soni++;
    else m.set(k, { matn: t.trim().replace(/[.]+$/, ''), soni: 1 });
  }
  return [...m.values()].sort((a, b) => b.soni - a.soni);
}

const sana = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const vaqt = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

function rubrikaKerak(r: Rubric | null | undefined): string | null {
  return r?.['3'] ?? null;
}

// ─── Hisob ──────────────────────────────────────────────────────────────────

function useHisob(data: BoshMalumot, davr: TabProps['davr'], q: TabProps['q']) {
  return useMemo(() => {
    const ism: Record<string, string> = {};
    for (const s of data.seats) ism[s.id] = s.displayName;
    for (const r of data.board) ism[r.seatId] ??= r.displayName;

    const joriy = oraliqda(data.suhbatlar, davr.from, davr.to);
    const tahlilQilingan = joriy.filter((r) => r.status === 'done');
    const tahlillar: Tahlil[] = tahlilQilingan
      .map((row) => ({ row, d: q.tafsilot[row.id] }))
      .filter((x): x is { row: ConversationRow; d: ConversationDetail } => !!x.d?.analysis)
      .map(({ row, d }) => ({
        row,
        d,
        ball: d.analysis!.overallScore == null ? null : Number(d.analysis!.overallScore),
        seat: row.seatId ?? '',
      }));
    const baholangan = tahlillar.filter((t) => t.ball !== null);
    const jamoaOrt = ortacha(baholangan.map((t) => t.ball!));

    // Mezonlar: jamoa va har menejer bo'yicha foiz
    const rubrika = new Map<string, Rubric | null>();
    for (const m of data.playbook?.criteria.criteria ?? []) rubrika.set(m.code, m.rubric);
    const mezonFoiz = (ts: Tahlil[]) => {
      const m = new Map<string, { nom: string; f: number[] }>();
      for (const t of ts)
        for (const s of t.d.scores) {
          if (s.score === null || s.maxScore <= 0) continue;
          const x = m.get(s.criterionCode) ?? { nom: s.criterionName, f: [] };
          x.f.push((s.score / s.maxScore) * 100);
          m.set(s.criterionCode, x);
          if (!rubrika.has(s.criterionCode)) rubrika.set(s.criterionCode, s.rubricSnapshot ?? null);
        }
      return [...m.entries()]
        .map(([code, x]) => ({ code, nom: x.nom, foiz: ortacha(x.f)!, soni: x.f.length }))
        .sort((a, b) => a.foiz - b.foiz);
    };
    const jamoaMezon = mezonFoiz(baholangan);

    // Menejerlar
    const seatlar = [...new Set(baholangan.map((t) => t.seat).filter(Boolean))].map((seat) => {
      const ts = baholangan.filter((t) => t.seat === seat);
      const ort = ortacha(ts.map((t) => t.ball!))!;
      const mezon = mezonFoiz(ts);
      const zaif = mezon.filter((m) => m.foiz < ZAIF);
      const tavsiya = sanab(ts.flatMap((t) => t.d.analysis!.managerNote?.improvements ?? []));
      const songgiGap = [...ts]
        .sort((a, b) => +new Date(b.row.startedAt) - +new Date(a.row.startedAt))
        .find((t) => t.d.analysis!.primaryGap)?.d.analysis!.primaryGap;
      const engYomon = [...ts].sort((a, b) => a.ball! - b.ball!);
      // Ustuvorlik: jamoadan orqada qolish + zaif mezonlar soni
      const ustuvorlik = (jamoaOrt ?? ort) - ort + zaif.length * 5 + (ort < ZAIF ? 10 : 0);
      return { seat, nom: ism[seat] ?? 'Menejer', ort, soni: ts.length, mezon, zaif, tavsiya, songgiGap, engYomon, ustuvorlik };
    });
    const etiborKerak = seatlar
      .filter((s) => s.ort < ZAIF || s.zaif.length > 0)
      .sort((a, b) => b.ustuvorlik - a.ustuvorlik);

    // Takrorlanuvchi xatti-harakatlar
    const yaxshilash = sanab(
      tahlillar.flatMap((t) => [...(t.d.analysis!.managerNote?.improvements ?? []), t.d.analysis!.primaryGap ?? '']),
    );
    const kuchli = sanab(tahlillar.flatMap((t) => t.d.analysis!.managerNote?.strengths ?? []));
    const iboralar = sanab(tahlillar.flatMap((t) => (t.d.analysis!.managerNote?.betterPhrases ?? []).map((p) => p.suggestion)));

    // Ko'rib chiqiladigan qo'ng'iroqlar: AI belgilagan yoki zaif + aniq kamchiligi bor
    const korib = baholangan
      .filter((t) => t.row.isFlagged || (t.ball! < ZAIF && (t.d.analysis!.primaryGap || t.d.analysis!.flaggedReason)))
      .sort((a, b) => a.ball! - b.ball!);

    const uzun = (t: Tahlil) => {
      const s = t.d.conversation.durationSeconds ?? davomiylik(t.row);
      return s === null || s >= MIN_DAVOM;
    };
    const engZaif = baholangan.filter((t) => uzun(t) && t.ball! < 70).sort((a, b) => a.ball! - b.ball!);
    const engYaxshi = baholangan.filter((t) => uzun(t) && t.ball! >= 70).sort((a, b) => b.ball! - a.ball!);

    // Qayta aloqa
    const bajarilmaganVada = tahlillar.flatMap((t) =>
      t.d.commitments.filter((c) => c.byParty === 'manager' && c.status === 'missed').map((c) => ({ ...c, seat: t.seat })),
    );
    const kechikkan = (q.vazifalar ?? []).filter((v) => v.isOverdue);
    const javobsiz = data.kpi.current.unansweredSessions;

    const oxirgi = tahlillar.reduce<Date | null>((m, t) => {
      const d = new Date(t.row.endedAt ?? t.row.startedAt);
      return !m || d > m ? d : m;
    }, null);

    return {
      ism,
      tahlilQilingan: tahlilQilingan.length,
      tahlillar,
      baholangan,
      jamoaOrt,
      jamoaMezon,
      rubrika,
      seatlar,
      etiborKerak,
      yaxshilash,
      kuchli,
      iboralar,
      korib,
      engZaif,
      engYaxshi,
      bajarilmaganVada,
      kechikkan,
      javobsiz,
      oxirgi,
    };
  }, [data, davr, q.tafsilot, q.vazifalar]);
}

type Hisob = ReturnType<typeof useHisob>;

// ─── Bo'lim ─────────────────────────────────────────────────────────────────

export function JamoaMalakasi({ data, davr, q, qaytaYukla, yuklanmoqda }: TabProps) {
  const h = useHisob(data, davr, q);
  const kutilmoqda = q.tafsilotKutilmoqda > 0;

  const zaifMezon = h.jamoaMezon.filter((m) => m.foiz < ZAIF);
  const kuchliMezon = [...h.jamoaMezon].reverse().filter((m) => m.foiz >= KUCHLI);

  // Jamoa fokuslari: eng zaif mezonlar (rubrikadagi "kerak") + eng ko'p takrorlangan tavsiyalar
  const fokuslar = yagona([
    ...zaifMezon.slice(0, 2).map((m) => {
      const kerak = rubrikaKerak(h.rubrika.get(m.code));
      return `«${m.nom}» (${Math.round(m.foiz)}%)${kerak ? ` — ${kerak}` : ''}`;
    }),
    ...h.yaxshilash.slice(0, 3).map((x) => x.matn),
  ]).slice(0, 5);
  const kuchliTomonlar = yagona([
    ...h.kuchli.slice(0, 3).map((x) => x.matn),
    ...kuchliMezon.slice(0, 2).map((m) => `«${m.nom}» — jamoada ${Math.round(m.foiz)}% bajarilmoqda`),
  ]).slice(0, 5);

  const qaytaAloqa: string[] = [];
  if (h.bajarilmaganVada.length > 0) {
    const misol = h.bajarilmaganVada[0]!.what;
    qaytaAloqa.push(`Mijozga berilgan ${h.bajarilmaganVada.length} ta va'da bajarilmay qolgan — masalan: «${misol}».`);
  }
  if (h.kechikkan.length > 0) qaytaAloqa.push(`${h.kechikkan.length} ta vazifa muddati o'tgan — mijoz bilan aloqa uzilib qolishi mumkin.`);
  if (h.javobsiz > 0) qaytaAloqa.push(`${h.javobsiz} ta mijoz yozgan, lekin javob olmagan.`);

  const birinchi = h.etiborKerak[0];
  const engYaxshi = h.engYaxshi[0];
  const qadamlar: string[] = [];
  if (birinchi)
    qadamlar.push(
      `${birinchi.nom} bilan ${birinchi.zaif[0] ? `«${birinchi.zaif[0].nom}»` : 'eng zaif qo\'ng\'iroqlari'} bo'yicha 1:1 kouching — 2 ta zaif qo'ng'iroqni birga tinglang.`,
    );
  if (zaifMezon[0]) qadamlar.push(`Jamoa bilan «${zaifMezon[0].nom}» bo'yicha rolli o'yin o'tkazing.`);
  if (h.kechikkan.length > 0) qadamlar.push(`${h.kechikkan.length} ta kechikkan vazifani bugun yoping yoki muddatini yangilang.`);
  if (h.iboralar[0]) qadamlar.push(`Skriptga qo'shing: «${h.iboralar[0].matn}».`);
  if (engYaxshi) qadamlar.push(`${engYaxshi.d.conversation.managerName ?? h.ism[engYaxshi.seat] ?? 'Eng yaxshi'} qo'ng'irog'ini (${Math.round(engYaxshi.ball!)}%) jamoa yig'ilishida namuna sifatida tahlil qiling.`);

  const xulosa = xulosaMatni(h, zaifMezon, kuchliMezon);

  return (
    <div className="an-bolim">
      {/* ─── Sarlavha + AI xulosa ─── */}
      <section className="card an-karta jm-qahramon">
        <div className="jm-qahramon-ust">
          <div>
            <span className="jm-yorliq">
              <Sparkles /> AI malaka oshirish tavsiyalari
            </span>
            <h2 className="jm-katta-sarlavha">
              Hozir kimning malakasini oshirish kerak{' '}
              <MalumotIkon matn="Har qo'ng'iroq bo'yicha AI tahlillari (kuchli tomonlar, kamchiliklar, mezon ballari) tanlangan davr bo'yicha yig'iladi" />
            </h2>
            <p className="jm-tavsif">
              Bu sahifa qaysi menejer bilan birinchi navbatda ishlash kerakligini, qaysi muammo takrorlanayotganini va qaysi
              qo'ng'iroqlarni birga ko'rib chiqish kerakligini ko'rsatadi.
            </p>
          </div>
          <div className="jm-yangilash">
            <div className="jm-yangilash-quti">
              <span className="jm-yorliq-kichik">So'nggi AI tahlili</span>
              <b>{h.oxirgi ? vaqt(h.oxirgi) : '—'}</b>
              <small>{h.tahlillar.length} ta tahlil asosida</small>
            </div>
            {qaytaYukla && (
              <button type="button" className="btn jm-yangila-tugma" onClick={qaytaYukla} disabled={yuklanmoqda}>
                <RefreshCw className={yuklanmoqda ? 'aylanuvchi' : ''} /> {yuklanmoqda ? 'Yangilanmoqda…' : 'AI tavsiyasini yangilash'}
              </button>
            )}
          </div>
        </div>
        <div className="jm-xulosa">
          <span className="jm-yorliq-kichik">
            AI xulosa <MalumotIkon matn="Raqamlar va iboralar shu davrdagi AI tahlillaridan avtomatik yig'ilgan" />
          </span>
          <p>{xulosa}</p>
        </div>
        {kutilmoqda && <div className="an-eslatma">Tahlil tafsilotlari yuklanmoqda — yana {q.tafsilotKutilmoqda} ta…</div>}
      </section>

      {/* ─── Hozir ishlash kerak ─── */}
      <Blok rang="qizil" sarlavha="Hozir ishlash kerak" izoh="Jamoa o'rtachasidan eng ko'p orqada qolgan va zaif mezonlari bor menejerlar — ustuvorlik tartibida">
        {h.etiborKerak.length === 0 ? (
          <div className="jm-bosh">Hozir alohida e'tibor talab qiladigan menejer yo'q — barchasi {ZAIF}% dan yuqori.</div>
        ) : (
          <div className="jm-prioritetlar">
            {h.etiborKerak.slice(0, 3).map((s, i) => (
              <article key={s.seat} className="jm-prioritet">
                <div className="jm-prioritet-bosh">
                  <div>
                    <span className="jm-prioritet-raqam">{i + 1}-prioritet</span>
                    <h3>
                      {s.nom} <span className="jm-ort" style={{ color: ballRang(s.ort) }}>{Math.round(s.ort)}%</span>
                    </h3>
                  </div>
                  <Link to={`/sotuvchi/${s.seat}`} className="jm-tugma">
                    Menejerni ochish
                  </Link>
                </div>
                {s.zaif.length > 0 && <b className="jm-mavzu">{s.zaif.slice(0, 2).map((m) => m.nom).join(' va ')}</b>}
                <p className="jm-matn">
                  O'rtacha baho {Math.round(s.ort)}%{h.jamoaOrt !== null && ` (jamoada ${Math.round(h.jamoaOrt)}%)`}, {s.soni} ta
                  baholangan qo'ng'iroq.
                  {s.zaif[0] && ` Eng zaif: «${s.zaif[0].nom}» — ${Math.round(s.zaif[0].foiz)}%.`}
                  {s.tavsiya[0] && ` AI ko'p takrorlagan tavsiya: «${s.tavsiya[0].matn}».`}
                  {s.songgiGap && ` Oxirgi asosiy kamchilik: «${s.songgiGap}».`}
                </p>
                <div className="jm-chiplar">
                  {s.engYomon.slice(0, 2).map((t) => (
                    <Link key={t.row.id} to={`/suhbatlar/${t.row.id}`} className="jm-chip">
                      Ko'rib chiqish qo'ng'irog'ini ochish <em style={{ color: ballRang(t.ball) }}>{Math.round(t.ball!)}%</em>
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </Blok>

      <Blok rang="teal" sarlavha="Jamoa fokuslari" izoh="Jamoada eng zaif mezonlar (rubrikadagi to'g'ri bajarilish bilan) va AI eng ko'p takrorlagan tavsiyalar">
        <Royxat qatorlar={fokuslar} bosh="Jamoa uchun umumiy zaif nuqta topilmadi." />
      </Blok>

      <Blok rang="yashil" sarlavha="Kengaytirish kerak bo'lgan kuchli tomonlar" izoh="AI kuchli deb belgilagan xatti-harakatlar va jamoada 80% dan yuqori bajarilayotgan mezonlar">
        <Royxat qatorlar={kuchliTomonlar} bosh="Hali kuchli tomon sifatida belgilangan narsa yo'q." />
      </Blok>

      <div className="an-grid-2 jm-teng">
        <Blok rang="binafsha" sarlavha="Mijozga qayta aloqa muammolari" izoh="Bajarilmagan va'dalar, muddati o'tgan vazifalar va javobsiz mijozlar">
          <Royxat qatorlar={qaytaAloqa} bosh="Qayta aloqa bo'yicha muammo topilmadi." />
        </Blok>
        <Blok rang="oddiy" sarlavha="Keyingi qadamlar" izoh="Yuqoridagi topilmalardan kelib chiqadigan aniq harakatlar">
          <Royxat qatorlar={qadamlar} bosh="Hozircha qo'shimcha qadam kerak emas." />
        </Blok>
      </div>

      <Blok rang="teal" sarlavha="Ko'rib chiqiladigan qo'ng'iroqlar" izoh="AI ko'rikka belgilagan yoki 60% dan past baholangan va aniq kamchiligi yozilgan qo'ng'iroqlar">
        {h.korib.length === 0 ? (
          <div className="jm-bosh">Ko'rib chiqish talab qiladigan qo'ng'iroq yo'q.</div>
        ) : (
          <div className="jm-korib">
            {h.korib.slice(0, 5).map((t) => (
              <div key={t.row.id} className="jm-korib-qator">
                <div>
                  <b>
                    {t.d.conversation.managerName ?? h.ism[t.seat] ?? 'Menejer'}{' '}
                    <span className="jm-ort" style={{ color: ballRang(t.ball) }}>{Math.round(t.ball!)}%</span>
                  </b>
                  <p>{t.d.analysis!.primaryGap ?? t.d.analysis!.flaggedReason ?? t.row.summary ?? 'Ko\'rik talab qilinadi'}</p>
                </div>
                <Link to={`/suhbatlar/${t.row.id}`} className="jm-tugma">
                  Ko'rish
                </Link>
              </div>
            ))}
          </div>
        )}
      </Blok>

      {/* ─── Ko'rsatkichlar ─── */}
      <div className="an-kpi-grid">
        <Kpi ikon={<UsersRound />} rang="past" nom="Hozir e'tibor kerak menejerlar" izoh={`O'rtacha bahosi ${ZAIF}% dan past yoki zaif mezoni bor`} qiymat={h.etiborKerak.length} />
        <Kpi ikon={<Sparkles />} rang="info" nom="Hozir ko'rib chiqiladigan qo'ng'iroqlar" izoh="AI belgilagan yoki zaif va kamchiligi aniq qo'ng'iroqlar" qiymat={h.korib.length} />
        <Kpi ikon={<Gauge />} rang="orta" nom="Baholangan qo'ng'iroqlar" izoh="Umumiy ball qo'yilgan tahlillar" qiymat={h.baholangan.length} />
        <Kpi ikon={<ScanSearch />} rang="ia" nom="Tahlil qilingan" izoh="Davrda AI tahlilidan o'tgan barcha suhbatlar" qiymat={h.tahlilQilingan} />
      </div>

      <div className="an-grid-2 jm-teng">
        <section className="card an-karta">
          <div className="karta-bosh">
            <h2>
              Yaxshilash kerak <MalumotIkon matn="AI tahlillarida takrorlangan kamchilik va tavsiyalar — necha qo'ng'iroqda uchragani bilan" />
            </h2>
          </div>
          <p className="jm-izoh">Keyingi jamoaviy malaka oshirish uchrashuvining asosiga aylanishi kerak bo'lgan takrorlanayotgan zaif xatti-harakatlar.</p>
          <Sanoq royxat={h.yaxshilash.slice(0, 8)} turi="yomon" bosh="Takrorlanayotgan kamchilik yo'q" />
        </section>
        <section className="card an-karta">
          <div className="karta-bosh">
            <h2>
              Yaxshi bajarilgan narsalar <MalumotIkon matn="AI kuchli tomon deb belgilagan xatti-harakatlar — necha qo'ng'iroqda uchragani bilan" />
            </h2>
          </div>
          <p className="jm-izoh">Jamoa bo'ylab mustahkamlash kerak bo'lgan kuchli patternlar.</p>
          <Sanoq royxat={h.kuchli.slice(0, 8)} turi="yaxshi" bosh="Hali kuchli tomon belgilanmagan" />
        </section>
      </div>

      <div className="an-grid-2 jm-teng">
        <NamunaRoyxat
          sarlavha="Hozir ko'rib chiqish kerak"
          izoh="Darhol birga ko'rib chiqilishi kerak bo'lgan, davomiyligi bir daqiqadan uzun eng zaif baholangan qo'ng'iroqlar."
          royxat={h.engZaif.slice(0, 4)}
          ism={h.ism}
          eng="past"
          bosh="Zaif baholangan qo'ng'iroq yo'q"
        />
        <NamunaRoyxat
          sarlavha="Mustahkamlash uchun eng yaxshi namunalar"
          izoh="Jamoaviy malaka oshirishda misol sifatida ishlatish mumkin bo'lgan, davomiyligi bir daqiqadan uzun kuchli qo'ng'iroqlar."
          royxat={h.engYaxshi.slice(0, 4)}
          ism={h.ism}
          eng="yuqori"
          bosh="Hali 70% dan yuqori baholangan qo'ng'iroq yo'q"
        />
      </div>

      <JamoaTrendi h={h} davr={davr} data={data} />

      {q.etirozlar && q.etirozlar.length > 0 && (
        <section className="card an-karta">
          <div className="karta-bosh">
            <h2>
              E'tirozlar — AI aniqligi <MalumotIkon matn="Menejerlar AI bahosiga e'tiroz bildirgan mezonlar. Qabul qilingani ko'p mezon — AI shu joyda adashadi" />
            </h2>
          </div>
          <table className="jadval an-jadval">
            <thead>
              <tr>
                <th>Mezon</th>
                <th>Jami</th>
                <th>Qabul</th>
                <th>Rad</th>
                <th>Ochiq</th>
                <th>O'rt. tuzatish</th>
              </tr>
            </thead>
            <tbody>
              {q.etirozlar.map((e) => (
                <tr key={e.code}>
                  <td>
                    <b>{e.code}</b> {e.name}
                  </td>
                  <td className="an-son">{e.total}</td>
                  <td className="an-son">{e.accepted}</td>
                  <td className="an-son">{e.rejected}</td>
                  <td className="an-son">{e.open}</td>
                  <td className="an-son">{e.avgCorrection === null ? '—' : `${e.avgCorrection > 0 ? '+' : ''}${e.avgCorrection}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

function yagona(qatorlar: string[]): string[] {
  const korilgan = new Set<string>();
  return qatorlar.filter((q) => {
    const k = kalit(q);
    if (korilgan.has(k)) return false;
    korilgan.add(k);
    return true;
  });
}

function xulosaMatni(h: Hisob, zaif: Hisob['jamoaMezon'], kuchli: Hisob['jamoaMezon']): string {
  if (h.baholangan.length === 0) return "Bu davrda baholangan qo'ng'iroq yo'q — xulosa uchun kamida bitta tahlil kerak.";
  const q: string[] = [];
  q.push(
    `${h.baholangan.length} ta baholangan qo'ng'iroq bo'yicha jamoa o'rtachasi ${Math.round(h.jamoaOrt!)}%.`,
  );
  if (zaif.length > 0)
    q.push(
      `Eng ko'p ball «${zaif[0]!.nom}» bosqichida yo'qotilmoqda (${Math.round(zaif[0]!.foiz)}%)` +
        (zaif[1] ? `, keyin «${zaif[1].nom}» (${Math.round(zaif[1].foiz)}%).` : '.'),
    );
  else q.push(`Barcha mezonlar ${ZAIF}% dan yuqori bajarilmoqda.`);
  if (h.yaxshilash[0]) q.push(`AI eng ko'p takrorlagan kamchilik: «${h.yaxshilash[0].matn}».`);
  if (h.kuchli[0]) q.push(`Kuchli tomon: «${h.kuchli[0].matn}».`);
  else if (kuchli[0]) q.push(`Kuchli tomon: «${kuchli[0].nom}» (${Math.round(kuchli[0].foiz)}%).`);
  if (h.etiborKerak.length > 0)
    q.push(`Hozir ${h.etiborKerak.length} menejerga e'tibor kerak: ${h.etiborKerak.slice(0, 3).map((s) => s.nom).join(', ')}.`);
  if (h.bajarilmaganVada.length > 0) q.push(`${h.bajarilmaganVada.length} ta va'da bajarilmay qolgan — qayta aloqani kuchaytirish zarur.`);
  return q.join(' ');
}

// ─── Kichik qismlar ─────────────────────────────────────────────────────────

function Blok({ rang, sarlavha, izoh, children }: { rang: string; sarlavha: string; izoh: string; children: ReactNode }) {
  return (
    <section className={`card an-karta jm-blok ${rang}`}>
      <div className="karta-bosh">
        <h2>
          {sarlavha} <MalumotIkon matn={izoh} />
        </h2>
      </div>
      {children}
    </section>
  );
}

function Royxat({ qatorlar, bosh }: { qatorlar: string[]; bosh: string }) {
  if (qatorlar.length === 0) return <div className="jm-bosh">{bosh}</div>;
  return (
    <ul className="jm-royxat">
      {qatorlar.map((q) => (
        <li key={q}>{q}</li>
      ))}
    </ul>
  );
}

function Kpi({ ikon, rang, nom, izoh, qiymat }: { ikon: ReactNode; rang: string; nom: string; izoh: string; qiymat: number }) {
  return (
    <div className="an-kpi jm-kpi">
      <span className={`jm-kpi-ikon ${rang}`} aria-hidden="true">
        {ikon}
      </span>
      <div className="an-kpi-nom">
        {nom} <MalumotIkon matn={izoh} />
      </div>
      <div className="an-kpi-qiymat">{qiymat}</div>
    </div>
  );
}

function Sanoq({ royxat, turi, bosh }: { royxat: { matn: string; soni: number }[]; turi: 'yaxshi' | 'yomon'; bosh: string }) {
  if (royxat.length === 0) return <div className="jm-bosh">{bosh}</div>;
  return (
    <ul className="jm-sanoq">
      {royxat.map((x) => (
        <li key={x.matn}>
          <span>{x.matn}</span>
          <em className={turi}>{x.soni}x</em>
        </li>
      ))}
    </ul>
  );
}

function NamunaRoyxat({
  sarlavha,
  izoh,
  royxat,
  ism,
  eng,
  bosh,
}: {
  sarlavha: string;
  izoh: string;
  royxat: Tahlil[];
  ism: Record<string, string>;
  eng: 'past' | 'yuqori';
  bosh: string;
}) {
  return (
    <section className="card an-karta jm-namunalar">
      <div className="karta-bosh">
        <h2>
          {sarlavha} <MalumotIkon matn={izoh} />
        </h2>
      </div>
      <p className="jm-izoh">{izoh}</p>
      {royxat.length === 0 ? (
        <div className="jm-bosh">{bosh}</div>
      ) : (
        <div className="jm-namuna-royxat">
          {royxat.map((t) => {
            const nom = t.d.conversation.managerName ?? ism[t.seat] ?? 'Menejer';
            // Iqtibos: eng past (yoki eng yuqori) baholangan mezon isboti
            const ballar = t.d.scores.filter((s) => s.score !== null && s.evidenceQuote);
            const isbot = ballar.sort((a, b) => (eng === 'past' ? a.score! - b.score! : b.score! - a.score!))[0];
            return (
              <article key={t.row.id} className="jm-namuna">
                <div className="jm-namuna-bosh">
                  <span className="sn-ism">
                    <span className="sn-avatar katta" style={{ background: avatarRang(t.seat || nom) }}>
                      {boshHarf(nom)}
                    </span>
                    <b>{nom}</b>
                  </span>
                  <span className="jm-ball">
                    <span className="jm-ball-chiziq">
                      <span style={{ width: `${t.ball}%`, background: ballRang(t.ball) }} />
                    </span>
                    <b style={{ color: ballRang(t.ball) }}>{Math.round(t.ball! * 10) / 10}%</b>
                  </span>
                </div>
                <p className="jm-namuna-matn">{t.row.summary ?? t.d.analysis!.summary ?? 'Xulosa yo\'q'}</p>
                {isbot && (
                  <blockquote className="jm-iqtibos" title={isbot.criterionName}>
                    {isbot.evidenceQuote}
                  </blockquote>
                )}
                <div className="jm-namuna-past">
                  <span>{sana(t.row.startedAt)}</span>
                  <Link to={`/suhbatlar/${t.row.id}`} className="jm-tugma">
                    Ko'rish
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function JamoaTrendi({ h, davr, data }: { h: Hisob; davr: TabProps['davr']; data: BoshMalumot }) {
  const { royxat } = bolaklar(davr);
  // Rang menejerga bog'liq, tartibga emas: seats ro'yxatidagi o'rni bo'yicha
  const tartib = data.seats.map((s) => s.id);
  const seatlar = [...h.seatlar]
    .sort((a, b) => b.soni - a.soni)
    .slice(0, SERIYA.length)
    .sort((a, b) => tartib.indexOf(a.seat) - tartib.indexOf(b.seat));
  const seriyalar = seatlar.map((s, i) => {
    const ts = h.baholangan.filter((t) => t.seat === s.seat);
    const bolakBo = royxat.map((b) => {
      const ichida = new Set(bolakda(ts.map((t) => t.row), b).map((r) => r.id));
      return ts.filter((t) => ichida.has(t.row.id));
    });
    return {
      kalit: s.seat,
      nom: s.nom,
      rang: SERIYA[i]!,
      qiymatlar: bolakBo.map((bu) => ortacha(bu.map((t) => t.ball!))),
      izohlar: bolakBo.map((bu) => (bu.length ? `${bu.length} ta qo'ng'iroq` : null)),
    };
  });

  return (
    <section className="card an-karta">
      <div className="karta-bosh">
        <h2>
          Jamoa rivoji trendi <MalumotIkon matn="Har menejerning baholangan qo'ng'iroqlari o'rtacha bahosi. Qo'ng'iroq bo'lmagan kunda chiziq uziladi" />
        </h2>
      </div>
      <p className="jm-izoh">Tanlangan davr bo'yicha baholangan qo'ng'iroqlar sifati trendi. Jamoa to'g'ri tomonga ketyaptimi, shuni ko'ring.</p>
      {seriyalar.length === 0 ? (
        <div className="jm-bosh">
          <Info /> Bu davrda baholangan qo'ng'iroq yo'q
        </div>
      ) : (
        <KopChiziqliGrafik belgilar={royxat.map((b) => b.nom)} seriyalar={seriyalar} birlik="%" yMax={100} nom="Jamoa rivoji trendi" />
      )}
    </section>
  );
}
