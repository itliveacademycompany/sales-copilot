import { useMemo, useState, type ReactNode } from 'react';
import type { ConversationDetail } from '../../api';
import { MalumotIkon } from '../bosh/Korsatkichlar';
import { avatarRang, boshHarf, oraliqda } from '../bosh/malumot';
import { Donut, GorizontalUstun, TaqsimotGrafik, UstunliGrafik, type Bolak } from './grafiklar';
import type { TabProps } from './Tablar';
import { savolMatni } from '../anketa/savolMatni';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MIJOZ TAHLILI — mijozlar kim, nima istaydi va nimaga to'xtab qoladi?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Hammasi tahlil tafsilotidan: bitim (deal), signallar (shoshilinchlik,
 * byudjet reaksiyasi, e'tirozlar), xizmat yo'nalishi, qo'ng'iroq turi va
 * so'rovnoma javoblari. So'rovnoma savoli turi playbook'dan olinadi; "matn"
 * deb e'lon qilingan, lekin amalda raqam yoki bir nechta variantdan biri
 * bo'lgan savollar javoblarning o'zidan aniqlanadi (masalan yosh "12").
 */

const SERIYA = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)', 'var(--s5)', 'var(--s6)'];
const BOSHQA_RANG = 'var(--text-muted)';
const SOHA: Record<string, string> = {
  sales: 'Sotuv',
  support: "Qo'llab-quvvatlash",
  internal: 'Ichki',
  spam: 'Spam',
  other: 'Boshqa',
};
const SHOSHILINCH: Record<string, string> = { high: 'Yuqori', medium: "O'rtacha", low: 'Past' };

const kalit = (t: string) => t.trim().replace(/[.!]+$/, '').replace(/\s+/g, ' ').toLowerCase();
const chiroyli = (t: string) => {
  const x = t.trim().replace(/[.]+$/, '');
  return x.charAt(0).toUpperCase() + x.slice(1);
};

/** Matnlarni sanab, eng ko'p uchraganidan boshlab qaytaradi. */
function sanab(matnlar: string[]): { nom: string; soni: number }[] {
  const m = new Map<string, { nom: string; soni: number }>();
  for (const t of matnlar) {
    if (!t?.trim()) continue;
    const k = kalit(t);
    const bor = m.get(k);
    if (bor) bor.soni++;
    else m.set(k, { nom: chiroyli(t), soni: 1 });
  }
  return [...m.values()].sort((a, b) => b.soni - a.soni);
}

/** Donut bo'laklari: eng kattalari o'z rangida, qolgani "Boshqa"ga yig'iladi (rang kamaymasin). */
function bolaklarga(royxat: { nom: string; soni: number }[], cheklov = 5): Bolak[] {
  const asosiy = royxat.slice(0, cheklov);
  const qolgan = royxat.slice(cheklov).reduce((s, x) => s + x.soni, 0);
  const b: Bolak[] = asosiy.map((x, i) => ({ kalit: x.nom, nom: x.nom, qiymat: x.soni, rang: SERIYA[i]! }));
  if (qolgan > 0) b.push({ kalit: '__boshqa', nom: 'Boshqalar', qiymat: qolgan, rang: BOSHQA_RANG });
  return b;
}

// ─── So'rovnoma ─────────────────────────────────────────────────────────────

type SavolTuri = 'haYoq' | 'raqam' | 'tanlov' | 'matn';
const HA = new Set(['ha', 'xa', 'yes', 'true', 'да', 'bor', 'tasdiqladi', 'rozi']);
const YOQ = new Set(["yo'q", 'yoq', 'yo‘q', 'no', 'false', 'нет', "yo'q.", 'rad etdi']);

function haYoq(javob: string): boolean | null {
  const k = kalit(javob).replace(/[,.].*$/, '');
  if (HA.has(k) || k.startsWith('ha ') || k.startsWith('ha,')) return true;
  if (YOQ.has(k) || k.startsWith("yo'q") || k.startsWith('yoq')) return false;
  return null;
}
function raqam(javob: string): number | null {
  if (javob.length > 24) return null;
  const m = javob.replace(',', '.').match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : null;
}

interface Savol {
  savol: string;
  turi: SavolTuri;
  javoblar: { seat: string; javob: string }[];
}

function savollarniYig(tafsilot: ConversationDetail[], eLon: { question: string; answerType: string }[]): Savol[] {
  const m = new Map<string, Savol>();
  for (const q of eLon) m.set(kalit(q.question), { savol: savolMatni(q.question), turi: q.answerType === 'boolean' ? 'haYoq' : q.answerType === 'number' ? 'raqam' : 'matn', javoblar: [] });
  for (const d of tafsilot)
    for (const qa of d.analysis?.questionnaireAnswers ?? []) {
      if (!qa.answer?.trim()) continue;
      const k = kalit(qa.question);
      const s = m.get(k) ?? { savol: savolMatni(qa.question), turi: 'matn' as SavolTuri, javoblar: [] };
      s.javoblar.push({ seat: d.conversation.seatId ?? '', javob: qa.answer.trim() });
      m.set(k, s);
    }
  // E'lon qilingan tur "matn" bo'lsa — javoblardan aniqlaymiz
  for (const s of m.values()) {
    if (s.turi !== 'matn' || s.javoblar.length === 0) continue;
    const n = s.javoblar.length;
    const hy = s.javoblar.filter((j) => haYoq(j.javob) !== null).length;
    const rq = s.javoblar.filter((j) => raqam(j.javob) !== null).length;
    const xil = new Set(s.javoblar.map((j) => kalit(j.javob))).size;
    if (hy / n >= 0.8) s.turi = 'haYoq';
    else if (rq / n >= 0.8) s.turi = 'raqam';
    else if (xil <= Math.max(6, n * 0.3)) s.turi = 'tanlov';
  }
  return [...m.values()];
}

// ─── Bo'lim ─────────────────────────────────────────────────────────────────

export function MijozTahlili({ data, davr, q }: TabProps) {
  const ism = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data.seats) m.set(s.id, s.displayName);
    for (const r of data.board) if (!m.has(r.seatId)) m.set(r.seatId, r.displayName);
    return m;
  }, [data.seats, data.board]);

  const tafsilot = useMemo(
    () =>
      oraliqda(data.suhbatlar, davr.from, davr.to)
        .filter((r) => r.status === 'done')
        .map((r) => q.tafsilot[r.id])
        .filter((d): d is ConversationDetail => !!d?.analysis),
    [data.suhbatlar, davr, q.tafsilot],
  );

  const h = useMemo(() => {
    const a = tafsilot.map((d) => d.analysis!);
    // Bitimlar — eng ko'p uchragan valyuta bo'yicha (turli valyutani qo'shib bo'lmaydi)
    const bitimlar = a.filter((x) => x.deal?.amount && x.deal.amount > 0).map((x) => ({ s: x.deal!.amount!, v: (x.deal!.currency ?? '').toUpperCase() || "so'm" }));
    const valyutalar = sanab(bitimlar.map((b) => b.v));
    const asosiyV = valyutalar[0]?.nom ?? '';
    const shu = bitimlar.filter((b) => kalit(b.v) === kalit(asosiyV));
    const jami = shu.reduce((s, b) => s + b.s, 0);

    const etirozlar = sanab(a.flatMap((x) => x.signals?.objections ?? [])).slice(0, 10);

    const shosh: Bolak[] = (['high', 'medium', 'low'] as const).map((k, i) => ({
      kalit: k,
      nom: SHOSHILINCH[k]!,
      qiymat: a.filter((x) => x.signals?.urgency === k).length,
      rang: SERIYA[i]!,
    }));
    const shoshYoq = a.filter((x) => !x.signals?.urgency).length;
    if (shoshYoq) shosh.push({ kalit: 'yoq', nom: 'Aniqlanmadi', qiymat: shoshYoq, rang: BOSHQA_RANG });

    const byudjet = sanab(a.map((x) => x.signals?.budgetReaction ?? 'Muhokama qilinmadi'));
    const xizmat = sanab(a.map((x) => x.serviceLine ?? '').filter(Boolean));
    const oila = (x: (typeof a)[number]) => (x.callFamily ? data.playbook?.classificationPolicy.callFamilies.find((f) => f.key === x.callFamily)?.name ?? x.callFamily : 'Aniqlanmagan');
    const baholangan = sanab(a.filter((x) => x.scoringMode === 'scored').map(oila));
    const baholanmagan = sanab(a.filter((x) => x.scoringMode !== 'scored').map(oila));

    // Xizmat yo'nalishi × suhbat sohasi
    const sohalar = (['sales', 'support', 'internal', 'spam', 'other'] as const).filter((s) => a.some((x) => x.businessRelevance === s));
    const xizmatUstun = xizmat.slice(0, 8).map((x) => ({
      nom: x.nom,
      qiymatlar: Object.fromEntries(sohalar.map((s) => [s, a.filter((y) => kalit(y.serviceLine ?? '') === kalit(x.nom) && y.businessRelevance === s).length])),
    }));

    const barchaSavollar = savollarniYig(tafsilot, data.playbook?.questionnaire.questions ?? []);
    const savollar = barchaSavollar.filter((s) => s.javoblar.length > 0);
    return { bitimSoni: shu.length, jami, asosiyV, boshqaValyuta: valyutalar.length > 1, etirozlar, shosh, byudjet, xizmat, baholangan, baholanmagan, sohalar, xizmatUstun, savollar, barchaSavollar };
  }, [tafsilot, data.playbook]);

  const yuklanmoqda = q.tafsilotKutilmoqda > 0;
  if (tafsilot.length === 0) {
    return (
      <div className="an-bolim">
        <div className="card hech-narsa">{yuklanmoqda ? 'Tahlil tafsilotlari yuklanmoqda…' : "Bu davrda tahlil qilingan suhbat yo'q."}</div>
      </div>
    );
  }

  const pul = (n: number) => `${Math.round(n).toLocaleString('uz').replace(/,/g, ' ')} ${h.asosiyV}`;
  const seatlar = [...new Set(tafsilot.map((d) => d.conversation.seatId ?? ''))].filter(Boolean);

  return (
    <div className="an-bolim">
      {yuklanmoqda && <div className="an-eslatma">Tahlil tafsilotlari yuklanmoqda — yana {q.tafsilotKutilmoqda} ta…</div>}

      <div className="mt-kpi">
        <Kpi qiymat={h.bitimSoni ? pul(h.jami) : '0'} nom="Jami bitim summasi" izoh={`Suhbatlarda aytilgan bitim summalari${h.boshqaValyuta ? ' (faqat eng ko\'p uchragan valyuta)' : ''}`} rang="yuqori" />
        <Kpi qiymat={String(h.bitimSoni)} nom="Bitimlar soni" izoh="Summasi aniqlangan bitimli suhbatlar" rang="ia" />
        <Kpi qiymat={h.bitimSoni ? pul(h.jami / h.bitimSoni) : '—'} nom="O'rtacha bitim" izoh="Jami summa / bitimlar soni" />
      </div>

      <section className="card an-karta">
        <div className="karta-bosh">
          <h2>
            Top e'tirozlar <MalumotIkon matn="Mijozlar suhbatda bildirgan e'tirozlar — necha suhbatda uchragani" />
          </h2>
        </div>
        {h.etirozlar.length === 0 ? <div className="jm-bosh">Bu davrda e'tiroz qayd etilmagan.</div> : <GorizontalUstun royxat={h.etirozlar} rang="var(--s2)" />}
      </section>

      <div className="mt-uchlik">
        <Karta sarlavha="Shoshilinchlik darajasi" izoh="Mijoz qaror qilishga qanchalik shoshayotgani (AI baholashi)">
          <Donut bolaklar={h.shosh} markazNom="Suhbat" ixcham chipLegenda />
        </Karta>
        <Karta sarlavha="Byudjet reaksiyasi" izoh="Narx yoki byudjet aytilganda mijoz qanday javob berdi">
          <Donut bolaklar={bolaklarga(h.byudjet)} markazNom="Suhbat" ixcham chipLegenda />
        </Karta>
        <Karta sarlavha="Xizmat yo'nalishlari taqsimoti" izoh="Suhbat qaysi xizmat haqida bo'lgani">
          {h.xizmat.length === 0 ? <BoshDonut matn="Xizmat yo'nalishi aniqlanmagan" izoh="Mezonlar → Xizmat yo'nalishlari bo'limida yo'nalishlarni kiriting — AI suhbatlarni ularga ajratadi" /> : <Donut bolaklar={bolaklarga(h.xizmat)} markazNom="Suhbat" ixcham chipLegenda />}
        </Karta>
        <Karta sarlavha="Baholanadigan turlar" izoh="Mezonlar bo'yicha baholangan suhbatlar qaysi qo'ng'iroq turiga tegishli">
          {h.baholangan.length === 0 ? <BoshDonut matn="Baholangan suhbat yo'q" /> : <Donut bolaklar={bolaklarga(h.baholangan)} markazNom="Baholangan" ixcham chipLegenda />}
        </Karta>
        <Karta sarlavha="Baholanmagan qo'ng'iroqlar" izoh="Tahlil qilingan, lekin mezonlar bo'yicha baholanmagan suhbatlar turi">
          {h.baholanmagan.length === 0 ? <BoshDonut matn="Hamma suhbat baholangan" izoh="Baholanmaydigan turdagi suhbat bu davrda bo'lmagan" yaxshi /> : <Donut bolaklar={bolaklarga(h.baholanmagan)} markazNom="Baholanmagan" ixcham chipLegenda />}
        </Karta>
      </div>

      <section className="card an-karta">
        <div className="karta-bosh">
          <h2>
            Xizmat yo'nalishi bo'yicha natijalar <MalumotIkon matn="Har xizmat yo'nalishida suhbatlar qaysi turga tegishli (AI tasnifi)" />
          </h2>
        </div>
        {h.xizmatUstun.length === 0 ? (
          <BoshGrafik matn="Xizmat yo'nalishi aniqlanmagan" izoh="Yo'nalishlar kiritilgach, har yo'nalishda suhbatlar qaysi turga tegishli ekani shu yerda ustunlarda ko'rinadi." />
        ) : (
          <UstunliGrafik
            ustunlar={h.xizmatUstun}
            seriyalar={h.sohalar.map((s, i) => ({ kalit: s, nom: SOHA[s]!, rang: SERIYA[i]! }))}
            balandlik={280}
            nom="Xizmat yo'nalishi bo'yicha natijalar"
            birlik=" ta"
          />
        )}
      </section>

      <h2 className="sn-bolim-sarlavha">
        So'rovnoma <MalumotIkon matn="Playbook so'rovnomasi savollariga AI suhbatdan topgan javoblar" />
      </h2>
      {h.barchaSavollar.length > 0 && <Matritsa savollar={h.barchaSavollar} seatlar={seatlar} ism={ism} tafsilot={tafsilot} />}
      {h.barchaSavollar.length === 0 && (
        <div className="card hech-narsa">So'rovnoma savollariga javob topilmadi. Savollarni Mezonlar bo'limidagi playbook'da qo'shish mumkin.</div>
      )}

      {/* Uchala tur har doim ko'rinadi — savol bo'lmasa, nima qilish kerakligi aytiladi */}
      <Karta sarlavha="Ha/Yo'q savollari" izoh="Javob berilgan suhbatlarda Ha va Yo'q ulushi. Chiziq ustiga olib boring — aniq son ko'rinadi">
        {h.savollar.some((s) => s.turi === 'haYoq') ? (
          <div className="mt-hayoq">
            {h.savollar
              .filter((s) => s.turi === 'haYoq')
              .map((s) => (
                <HaYoqQator key={s.savol} savol={s} />
              ))}
          </div>
        ) : (
          <BoshSavol tur="Ha/Yo'q" misol="«Mijoz bepul konsultatsiyaga rozi bo'ldimi?»" />
        )}
      </Karta>

      <Karta sarlavha="Raqamli savollar" izoh="Raqamli javoblar taqsimoti — har qiymat necha marta uchragani, o'rtacha qiymat belgisi bilan">
        {h.savollar.some((s) => s.turi === 'raqam') ? (
          <div className="mt-panjara">
            {h.savollar
              .filter((s) => s.turi === 'raqam')
              .map((s) => (
                <RaqamTaqsimoti key={s.savol} savol={s} />
              ))}
          </div>
        ) : (
          <BoshSavol tur="raqamli" misol="«O'quvchining yoshi nechada?»" />
        )}
      </Karta>

      <Karta sarlavha="Tanlash savollari" izoh="Bir nechta variantdan biri bilan javob beriladigan savollar">
        {h.savollar.some((s) => s.turi === 'tanlov') ? (
          <div className="mt-panjara">
            {h.savollar
              .filter((s) => s.turi === 'tanlov')
              .map((s) => (
                <div key={s.savol} className="mt-ichki">
                  <div className="mt-ichki-bosh">
                    <b>{s.savol}</b>
                    <small>{s.javoblar.length} javob</small>
                  </div>
                  <Donut bolaklar={bolaklarga(sanab(s.javoblar.map((j) => j.javob)))} markazNom="Javob" saralash ixcham chipLegenda />
                </div>
              ))}
          </div>
        ) : (
          <BoshSavol tur="tanlash" misol="«Kurs kim uchun: farzandi uchun yoki o'zi uchun?»" />
        )}
      </Karta>

      {h.savollar.some((s) => s.turi === 'matn') && (
        <Karta sarlavha="Ochiq savollar" izoh="Erkin matnli javoblar — eng ko'p uchraganlari">
          <div className="mt-panjara">
            {h.savollar
              .filter((s) => s.turi === 'matn')
              .map((s) => (
                <div key={s.savol} className="mt-ichki">
                  <div className="mt-ichki-bosh">
                    <b>{s.savol}</b>
                    <small>{s.javoblar.length} javob</small>
                  </div>
                  <ul className="jm-sanoq">
                    {sanab(s.javoblar.map((j) => j.javob))
                      .slice(0, 6)
                      .map((x) => (
                        <li key={x.nom}>
                          <span>{x.nom}</span>
                          <em className="yaxshi">{x.soni}x</em>
                        </li>
                      ))}
                  </ul>
                </div>
              ))}
          </div>
        </Karta>
      )}
    </div>
  );
}

// ─── Qismlar ────────────────────────────────────────────────────────────────

/** Ma'lumot yo'q donut — bo'sh halqa va izoh (karta balandligi saqlanadi). */
function BoshDonut({ matn, izoh, yaxshi = false }: { matn: string; izoh?: string; yaxshi?: boolean }) {
  return (
    <div className="mt-bosh-donut">
      <svg width="150" height="150" viewBox="0 0 150 150" aria-hidden="true">
        <circle cx="75" cy="75" r="55" fill="none" className={yaxshi ? 'yaxshi' : ''} strokeWidth="22" strokeDasharray={yaxshi ? undefined : '4 6'} />
      </svg>
      <b>{matn}</b>
      {izoh && <small>{izoh}</small>}
    </div>
  );
}

/** Ma'lumot yo'q ustunli grafik — xira ustunlar siluyeti va izoh. */
function BoshGrafik({ matn, izoh }: { matn: string; izoh: string }) {
  return (
    <div className="mt-bosh-grafik">
      <div className="mt-siluet" aria-hidden="true">
        {[62, 38, 24, 12, 8, 5].map((h, i) => (
          <span key={i} style={{ height: `${h}%` }} />
        ))}
      </div>
      <div className="mt-bosh-grafik-matn">
        <b>{matn}</b>
        <small>{izoh}</small>
      </div>
    </div>
  );
}

function Karta({ sarlavha, izoh, children }: { sarlavha: string; izoh: string; children: ReactNode }) {
  return (
    <section className="card an-karta">
      <div className="karta-bosh">
        <h2>
          {sarlavha} <MalumotIkon matn={izoh} />
        </h2>
      </div>
      {children}
    </section>
  );
}

function Kpi({ qiymat, nom, izoh, rang }: { qiymat: string; nom: string; izoh: string; rang?: 'yuqori' | 'ia' }) {
  return (
    <div className="an-kpi mt-kpi-karta">
      <b className={rang ?? ''}>{qiymat}</b>
      <span>
        {nom} <MalumotIkon matn={izoh} />
      </span>
    </div>
  );
}

function BoshSavol({ tur, misol }: { tur: string; misol: string }) {
  return (
    <div className="mt-bosh-savol">
      <b>Bu davrda {tur} savollarga javob topilmadi.</b>
      <span>
        Playbook so'rovnomasiga shunday savol qo'shing, masalan {misol} — AI har suhbatdan javobni o'zi topadi.
      </span>
    </div>
  );
}

function HaYoqQator({ savol }: { savol: Savol }) {
  const [faol, setFaol] = useState<{ tur: 'ha' | 'yoq'; x: number } | null>(null);
  const ha = savol.javoblar.filter((j) => haYoq(j.javob) === true).length;
  const yoq = savol.javoblar.filter((j) => haYoq(j.javob) === false).length;
  const jami = ha + yoq;
  const hf = jami ? Math.round((ha / jami) * 100) : 0;
  const harakat = (tur: 'ha' | 'yoq') => (e: React.MouseEvent<HTMLSpanElement>) => {
    const q = (e.currentTarget.parentElement!.parentElement as HTMLElement).getBoundingClientRect();
    setFaol({ tur, x: e.clientX - q.left });
  };
  return (
    <div className="mt-hayoq-qator">
      <div className="mt-hayoq-bosh">
        <b>{savol.savol}</b>
        <small>{jami} javob</small>
      </div>
      <div className="mt-hayoq-chiziq" role="img" aria-label={`Ha ${ha}, Yo'q ${yoq}`} onMouseLeave={() => setFaol(null)}>
        <div className="mt-hayoq-ichki">
        {ha > 0 && (
          <span className={`ha${faol?.tur === 'yoq' ? ' xira' : ''}`} style={{ flexGrow: ha }} onMouseMove={harakat('ha')}>
            {hf >= 8 && `Ha ${hf}%`}
          </span>
        )}
        {yoq > 0 && (
          <span className={`yoq${faol?.tur === 'ha' ? ' xira' : ''}`} style={{ flexGrow: yoq }} onMouseMove={harakat('yoq')}>
            {100 - hf >= 8 && `Yo'q ${100 - hf}%`}
          </span>
        )}
        </div>
        {faol && (
          <span className="mt-hayoq-maslahat" style={{ left: faol.x }} role="tooltip">
            {faol.tur === 'ha' ? `Ha: ${ha} (${hf}%)` : `Yo'q: ${yoq} (${100 - hf}%)`}
          </span>
        )}
      </div>
      <div className="mt-hayoq-past">
        <span>Ha: {ha}</span>
        <span>Yo'q: {yoq}</span>
      </div>
    </div>
  );
}

function RaqamTaqsimoti({ savol }: { savol: Savol }) {
  const sonlar = savol.javoblar.map((j) => raqam(j.javob)).filter((v): v is number => v !== null).sort((a, b) => a - b);
  const ortacha = sonlar.reduce((s, v) => s + v, 0) / Math.max(1, sonlar.length);
  const mediana = sonlar.length ? sonlar[Math.floor(sonlar.length / 2)]! : 0;
  const min = sonlar[0] ?? 0;
  const maxV = sonlar[sonlar.length - 1] ?? 0;
  // Uchragan qiymatlar va soni; kasr qiymatlar bir xonagacha yaxlitlanadi
  const sanoq = new Map<number, number>();
  for (const v of sonlar) {
    const k = Math.round(v * 10) / 10;
    sanoq.set(k, (sanoq.get(k) ?? 0) + 1);
  }
  const nuqtalar = [...sanoq.entries()].sort((a, b) => a[0] - b[0]).map(([qiymat, soni]) => ({ qiymat, soni }));
  return (
    <div className="mt-ichki">
      <div className="mt-ichki-bosh">
        <b>{savol.savol}</b>
        <small>{sonlar.length} javob</small>
      </div>
      <div className="mt-statlar">
        <span>
          O'rtacha <b>{Math.round(ortacha * 10) / 10}</b>
        </span>
        <span>
          Mediana <b>{mediana}</b>
        </span>
        <span>
          Oraliq <b>
            {min}–{maxV}
          </b>
        </span>
      </div>
      <TaqsimotGrafik nuqtalar={nuqtalar} ortacha={ortacha} nom={savol.savol} />
    </div>
  );
}

/** Qamrov darajasi — menejer suhbatlarining qanchasida savolga javob topilgan. */
function qamrovKlass(q: number, bor: boolean) {
  if (!bor) return 'yoq';
  if (q >= 0.6) return 'yaxshi';
  if (q >= 0.3) return 'orta';
  return 'past';
}

function Matritsa({
  savollar,
  seatlar,
  ism,
  tafsilot,
}: {
  savollar: Savol[];
  seatlar: string[];
  ism: Map<string, string>;
  tafsilot: ConversationDetail[];
}) {
  const ustunNom: Record<SavolTuri, string> = { haYoq: 'Ha soni', raqam: "O'rtacha", tanlov: 'Javoblar soni', matn: 'Javoblar soni' };
  return (
    <section className="card an-karta">
      <div className="karta-bosh">
        <h2>
          Menejer × savol issiqligi{' '}
          <MalumotIkon matn="Har menejer suhbatlarida savolga javob topilgan ulush (rang) va qiymat. Qizil — menejer bu savolni deyarli so'ramaydi" />
        </h2>
      </div>
      <div className="mt-matritsa-qobiq">
        <table className="mt-matritsa">
          <thead>
            <tr>
              <th>Menejer</th>
              {savollar.map((s) => (
                <th key={s.savol}>
                  {/* Uzun savol qisqartiriladi — to'liq matni ustiga kelganda chiqadi */}
                  <span className="mt-th" tabIndex={0} aria-label={s.savol}>
                    <span className="mt-savol">{s.savol}</span>
                    <small>({ustunNom[s.turi]})</small>
                    <span className="mt-maslahat pastga" role="tooltip">
                      {s.savol}
                    </span>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {seatlar.map((seat) => {
              const jami = tafsilot.filter((d) => d.conversation.seatId === seat).length;
              const nom = ism.get(seat) ?? 'Menejer';
              return (
                <tr key={seat}>
                  <td>
                    <span className="sn-ism">
                      <span className="sn-avatar katta" style={{ background: avatarRang(seat) }}>
                        {boshHarf(nom)}
                      </span>
                      <b>{nom}</b>
                    </span>
                  </td>
                  {savollar.map((s) => {
                    const bu = s.javoblar.filter((j) => j.seat === seat);
                    const qamrov = jami ? bu.length / jami : 0;
                    const qiymat =
                      bu.length === 0
                        ? '—'
                        : s.turi === 'haYoq'
                          ? String(bu.filter((j) => haYoq(j.javob) === true).length)
                          : s.turi === 'raqam'
                            ? String(Math.round((bu.map((j) => raqam(j.javob) ?? 0).reduce((a, b) => a + b, 0) / bu.length) * 10) / 10)
                            : String(bu.length);
                    return (
                      <td key={s.savol}>
                        <span className={`mt-katak2 ${qamrovKlass(qamrov, bu.length > 0)}`} tabIndex={0}>
                          {qiymat}
                          <span className="mt-maslahat" role="tooltip">
                            {bu.length} / {jami} suhbatda javob topilgan ({Math.round(qamrov * 100)}%)
                          </span>
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-shkala2">
        <span>Savolga javob topilgan suhbatlar:</span>
        <span>
          <i className="mt-katak2 yaxshi" /> 60% va ko'p
        </span>
        <span>
          <i className="mt-katak2 orta" /> 30–60%
        </span>
        <span>
          <i className="mt-katak2 past" /> 30% dan kam
        </span>
      </div>
    </section>
  );
}
