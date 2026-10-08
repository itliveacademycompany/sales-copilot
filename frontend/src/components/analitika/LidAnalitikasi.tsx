import { ArrowRight, BarChart3, ChevronRight, Clock3, Filter, Flame, RefreshCw, Snowflake, Star, UsersRound, Wallet, Zap } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, lidTuri, type BusinessProfile, type ConversationDetail, type LidTuri } from '../../api';
import { useAuth } from '../../auth';
import { Farq, MalumotIkon } from '../bosh/Korsatkichlar';
import { oldingiDavr, oraliqda } from '../bosh/malumot';
import { LidRoyxati, type LidFiltr } from './LidRoyxati';
import { Ochiluvchi } from './Ochiluvchi';
import type { TabProps } from './Tablar';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID ANALITIKASI — qancha lid bor, qanchasi sifatli va kimga qayta qo'ng'iroq?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Lid = tahlil qilingan suhbat. CRM voronkasi (yutildi/yo'qotildi) backendda
 * yo'q, shuning uchun natija AI lid bahosidan olinadi: issiq — yopilishga
 * yaqin, sovuq — hozircha tayyor emas. "Faqat yangi" — shu mijoz bilan
 * birinchi qayd etilgan suhbat.
 *
 * Qayta bog'lanish ro'yxati — menejer suhbatda bergan va hali bajarilmagan
 * va'dalar (keyingi qadam), lid sifati bo'yicha tartiblangan.
 */

const CHEGARA = { past: 40, yaxshi: 60 } as const;
const IMKONIYAT: Record<LidTuri, { nom: string; klass: string }> = {
  hot: { nom: 'Yuqori', klass: 'yuqori' },
  warm: { nom: "O'rtacha", klass: 'orta' },
  cold: { nom: 'Past', klass: 'past' },
};
const SHOSHILINCH: Record<string, string> = { high: 'shoshilinch', medium: "o'rtacha shoshilinch", low: 'shoshilmaydi' };
const KUN = 86400_000;
const kichik = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

const dd = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const toliq = (iso: string) => {
  const d = new Date(iso);
  return `${dd(iso)}.${d.getFullYear()}`;
};

export function LidAnalitikasi({ data, davr, q }: TabProps) {
  const [rejim, setRejim] = useState<'holat' | 'yangi'>('holat');
  const [xizmat, setXizmat] = useState('');
  const [menejer, setMenejer] = useState('');
  const [hammasi, setHammasi] = useState(false);
  // Lidlar ro'yxati (drill-down) holati URL'da — brauzerning "orqaga" tugmasi ham ishlaydi
  const [params, setParams] = useSearchParams();
  const lrParam = params.get('lr') as LidFiltr | null;
  const lrOch = (f: LidFiltr) =>
    setParams((eski) => {
      const p = new URLSearchParams(eski);
      p.set('lr', f);
      return p;
    });
  const lrYop = () =>
    setParams((eski) => {
      const p = new URLSearchParams(eski);
      p.delete('lr');
      return p;
    });
  const [profilXizmat, setProfilXizmat] = useState<string[]>([]);
  const { business } = useAuth();

  useEffect(() => {
    if (!business) return;
    void api
      .get<{ profile: BusinessProfile }>(`/api/v1/businesses/${business.businessId}/profile`)
      .then((r) => setProfilXizmat(r.profile.primaryOffers ?? []))
      .catch(() => undefined);
  }, [business?.businessId]);

  const ism = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data.seats) m.set(s.id, s.displayName);
    for (const r of data.board) if (!m.has(r.seatId)) m.set(r.seatId, r.displayName);
    return m;
  }, [data.seats, data.board]);

  const barcha = useMemo(
    () =>
      oraliqda(data.suhbatlar, davr.from, davr.to)
        .filter((r) => r.status === 'done')
        .map((r) => ({ r, d: q.tafsilot[r.id] }))
        .filter((x): x is { r: (typeof x)['r']; d: ConversationDetail } => !!x.d?.analysis),
    [data.suhbatlar, davr, q.tafsilot],
  );
  // Xizmat yo'nalishlari: playbook + biznes profilidagi xizmatlar + AI aniqlaganlari.
  // Faqat tahlillardan olinsa, hali aniqlanmagan yo'nalishlar ro'yxatda ko'rinmasdi.
  const xizmatlar = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of [
      ...(data.playbook?.classificationPolicy.serviceLines ?? []),
      ...profilXizmat,
      ...barcha.map((x) => x.d.analysis!.serviceLine ?? ''),
    ]) {
      const t = s.trim();
      if (t && !m.has(kichik(t))) m.set(kichik(t), t);
    }
    return [...m.values()];
  }, [data.playbook, profilXizmat, barcha]);

  const lidlar = barcha.filter(
    (x) =>
      (rejim === 'holat' || x.d.previousConversations.length === 0) &&
      (!xizmat || kichik(x.d.analysis!.serviceLine) === kichik(xizmat)) &&
      (!menejer || (x.r.seatId ?? '') === menejer),
  );

  // ─── Ko'rsatkichlar ───
  const tur = (x: (typeof lidlar)[number]) => lidTuri(x.d.analysis!.leadQuality ?? x.r.leadQuality);
  const issiq = lidlar.filter((x) => tur(x) === 'hot').length;
  const sovuq = lidlar.filter((x) => tur(x) === 'cold').length;
  const ochiqVada = (x: (typeof lidlar)[number]) => x.d.commitments.some((c) => c.byParty === 'manager' && c.status === 'pending');
  const faol = lidlar.filter(ochiqVada).length;
  const baholangan = lidlar.filter((x) => tur(x) !== null).length;
  const bitimlar = lidlar.filter((x) => (x.d.analysis!.deal?.amount ?? 0) > 0);
  const summa = bitimlar.reduce((s, x) => s + (x.d.analysis!.deal!.amount ?? 0), 0);
  const valyuta = bitimlar[0]?.d.analysis!.deal!.currency ?? "so'm";
  // Tsikl — mijoz bilan birinchi suhbatdan shu suhbatgacha (qaytgan mijozlar)
  const tsikllar = lidlar
    .filter((x) => x.d.previousConversations.length > 0)
    .map((x) => {
      const birinchi = Math.min(...x.d.previousConversations.map((p) => +new Date(p.startedAt)));
      return (+new Date(x.r.startedAt) - birinchi) / KUN;
    })
    .filter((v) => v >= 0);
  const tsikl = tsikllar.length ? tsikllar.reduce((a, b) => a + b, 0) / tsikllar.length : null;
  const ballar = lidlar.map((x) => (x.d.analysis!.overallScore == null ? null : Number(x.d.analysis!.overallScore))).filter((v): v is number => v !== null);
  const sifat = ballar.length ? ballar.reduce((a, b) => a + b, 0) / ballar.length : null;

  // O'tgan davrga nisbatan (faqat "Holat" — yangilik uchun tafsilot kerak)
  const oldin = oldingiDavr(davr);
  const oldinSoni = oraliqda(data.suhbatlar, oldin.from, oldin.to).filter(
    (r) => r.status === 'done' && (!menejer || (r.seatId ?? '') === menejer),
  ).length;
  const farq = rejim === 'holat' && !xizmat && oldinSoni > 0 ? ((lidlar.length - oldinSoni) / oldinSoni) * 100 : null;

  // ─── Sifat taqsimoti ───
  const past = ballar.filter((v) => v < CHEGARA.past).length;
  const orta = ballar.filter((v) => v >= CHEGARA.past && v < CHEGARA.yaxshi).length;
  const yaxshi = ballar.filter((v) => v >= CHEGARA.yaxshi).length;
  const jamiB = ballar.length;
  const pf = (n: number) => (jamiB ? Math.round((n / jamiB) * 100) : 0);
  const javobKutyapti = lidlar.filter((x) => x.d.analysis!.dynamics?.needsReply === true).length;
  const pastJavobsiz = lidlar.filter(
    (x) => x.d.analysis!.overallScore != null && Number(x.d.analysis!.overallScore) < CHEGARA.past && x.d.analysis!.dynamics?.needsReply === true,
  ).length;

  // ─── Qayta bog'lanish ───
  const tartibT: Record<string, number> = { hot: 0, warm: 1, cold: 2 };
  const qayta = lidlar
    .filter((x) => tur(x) !== 'cold')
    .flatMap((x) => {
      const vadalar = x.d.commitments.filter((c) => c.byParty === 'manager' && c.status !== 'done');
      if (vadalar.length === 0 && x.d.analysis!.dynamics?.needsReply !== true) return [];
      const v = vadalar[0];
      return [{ x, v }];
    })
    .sort((a, b) => (tartibT[tur(a.x) ?? 'cold'] ?? 3) - (tartibT[tur(b.x) ?? 'cold'] ?? 3) || +new Date(b.x.r.startedAt) - +new Date(a.x.r.startedAt));
  const yuqoriImk = qayta.filter((y) => tur(y.x) === 'hot').length;
  const korinadi = hammasi ? qayta : qayta.slice(0, 8);

  const filtrlangan = !!(xizmat || menejer || rejim === 'yangi');

  if (lrParam) {
    return (
      <div className="an-bolim">
        <LidRoyxati key={lrParam} data={data} davr={davr} q={q} boshFiltr={lrParam} onOrqaga={lrYop} />
      </div>
    );
  }

  return (
    <div className="an-bolim">
      {q.tafsilotKutilmoqda > 0 && <div className="an-eslatma">Tahlil tafsilotlari yuklanmoqda — yana {q.tafsilotKutilmoqda} ta…</div>}

      {/* ─── Filtrlar ─── */}
      <div className="la-filtrlar">
        <div className="tab-qator" role="tablist" aria-label="Lidlar">
          <button type="button" role="tab" aria-selected={rejim === 'holat'} className={`tab${rejim === 'holat' ? ' active' : ''}`} onClick={() => setRejim('holat')}>
            Holat <MalumotIkon matn="Davrdagi barcha lidlar" />
          </button>
          <button type="button" role="tab" aria-selected={rejim === 'yangi'} className={`tab${rejim === 'yangi' ? ' active' : ''}`} onClick={() => setRejim('yangi')}>
            Faqat yangi <MalumotIkon matn="Shu mijoz bilan birinchi qayd etilgan suhbat" />
          </button>
        </div>
        <div className="la-filtrlar-ong">
          <Filter className={`la-filtr-ikon${filtrlangan ? ' faol' : ''}`} aria-hidden="true" />
          <Ochiluvchi
            belgi="Xizmat yo'nalishi"
            qiymat={xizmat}
            onOzgar={setXizmat}
            variantlar={xizmatlar.map((x) => ({ qiymat: x, nom: x, soni: barcha.filter((y) => kichik(y.d.analysis!.serviceLine) === kichik(x)).length }))}
            kenglik={290}
            boshMatn={
              <>
                Xizmat yo'nalishlari hali kiritilmagan. <Link to="/playbook">Mezonlar → Xizmat yo'nalishlari</Link> bo'limida qo'shing.
              </>
            }
          />
          <Ochiluvchi
            belgi="Menejer"
            qiymat={menejer}
            onOzgar={setMenejer}
            variantlar={[...new Set(barcha.map((x) => x.r.seatId).filter((s): s is string => !!s))].map((s) => ({
              qiymat: s,
              nom: ism.get(s) ?? 'Menejer',
              soni: barcha.filter((x) => x.r.seatId === s).length,
            }))}
            kenglik={250}
          />
        </div>
      </div>

      {/* ─── Ko'rsatkichlar ─── */}
      <div className="la-kpi">
        <Kpi ikon={<UsersRound />} qiymat={lidlar.length} nom={rejim === 'yangi' ? 'Jami yangi lidlar' : 'Jami lidlar'} izoh="Tahlil qilingan suhbatlar (tanlangan filtr bo'yicha)" farq={farq} onOch={() => lrOch('hammasi')} />
        <Kpi ikon={<Flame />} qiymat={issiq} nom="Issiq lidlar" izoh="AI yopilishga yaqin deb baholagan lidlar" rang="yaxshi" onOch={() => lrOch('hot')} />
        <Kpi ikon={<Snowflake />} qiymat={sovuq} nom="Sovuq lidlar" izoh="Hozircha sotib olishga tayyor emas" rang="past" onOch={() => lrOch('cold')} />
        <Kpi ikon={<Zap />} qiymat={faol} nom="Faol" izoh="Menejer keyingi qadamni kelishgan va u hali bajarilmagan" rang="ia" onOch={() => lrOch('faol')} />
        <Kpi ikon={<BarChart3 />} qiymat={baholangan ? `${((issiq / baholangan) * 100).toFixed(2)}%` : '—'} nom="Issiq lid ulushi" izoh="Lid sifati baholanganlar ichida issiqlar ulushi" />
        <Kpi ikon={<Wallet />} qiymat={bitimlar.length ? `${Math.round(summa).toLocaleString('uz').replace(/,/g, ' ')} ${valyuta}` : '0'} nom="Bitim summasi" izoh="Suhbatlarda aytilgan bitim summalari" rang="yaxshi" />
        <Kpi ikon={<Clock3 />} qiymat={tsikl === null ? '—' : `${Math.round(tsikl)} kun`} nom="O'rtacha tsikl" izoh="Qaytgan mijozlar: birinchi suhbatdan shu suhbatgacha o'tgan kunlar" />
        <Kpi ikon={<Star />} qiymat={sifat === null ? '—' : `${Math.round(sifat)}%`} nom="Lid sifati" izoh="Lidlar bilan suhbatlarning o'rtacha bahosi" rang={sifat === null ? undefined : sifat >= CHEGARA.yaxshi ? 'yaxshi' : sifat >= CHEGARA.past ? 'orta' : 'past'} />
      </div>

      {/* ─── Sifat taqsimoti ─── */}
      <section className="card an-karta la-sifat">
        <div className="la-sifat-bosh">
          <div>
            <h2>
              <span className="la-ikon sariq">
                <Star />
              </span>
              Lid sifati taqsimoti <MalumotIkon matn="Lid bilan suhbatning umumiy bahosi bo'yicha taqsimot" />
            </h2>
            <p className="vt-izoh">
              {jamiB} ta lid sifat taqsimotiga kirdi: {past} tasi past sifatli ({pf(past)}%)
              {pastJavobsiz > 0 && `, shu jumladan ${pastJavobsiz} tasi javob kutib qolgan`}.
            </p>
          </div>
          <div className="la-ortacha">
            <span>O'rtacha</span>
            <b className={sifat === null ? '' : sifat >= CHEGARA.yaxshi ? 'yaxshi' : sifat >= CHEGARA.past ? 'orta' : 'past'}>{sifat === null ? '—' : `${Math.round(sifat)}%`}</b>
          </div>
        </div>
        {jamiB === 0 ? (
          <div className="jm-bosh">Bu davrda baholangan lid yo'q.</div>
        ) : (
          <>
            <div className="la-polosa" role="img" aria-label={`Past ${past}, o'rtacha ${orta}, yaxshi ${yaxshi}`}>
              {past > 0 && <span className="past" style={{ flexGrow: past }} title={`Past: ${past}`} />}
              {orta > 0 && <span className="orta" style={{ flexGrow: orta }} title={`O'rtacha: ${orta}`} />}
              {yaxshi > 0 && <span className="yaxshi" style={{ flexGrow: yaxshi }} title={`Yaxshi: ${yaxshi}`} />}
            </div>
            <div className="la-uchlik">
              <div>
                <span>Past sifatli lidlar</span>
                <b className="past">
                  {past} <small>{pf(past)}%</small>
                </b>
              </div>
              <div>
                <span>O'rtacha lidlar</span>
                <b className="orta">
                  {orta} <small>{pf(orta)}%</small>
                </b>
              </div>
              <div>
                <span>Yaxshi lidlar</span>
                <b className="yaxshi">
                  {yaxshi} <small>{pf(yaxshi)}%</small>
                </b>
              </div>
            </div>
          </>
        )}
        <div className="la-kichiklar">
          <Kichik nom="Taqsimotdagi lidlar" izoh="Umumiy bahosi bor lidlar" qiymat={jamiB} />
          <Kichik nom="AI lid bahosi berilgan" izoh="Issiq / iliq / sovuq deb baholangan lidlar" qiymat={baholangan} />
          <Kichik nom="Javob kutayotgan" izoh="Suhbat mijoz xabari bilan tugagan" qiymat={javobKutyapti} rang="past" />
          <Kichik nom="Taqsimotga kirmagan" izoh="Umumiy bahosi yo'q (baholanmagan tur yoki ishonch past)" qiymat={lidlar.length - jamiB} />
        </div>
        <small className="la-chegara">
          Sifat chegaralari: past &lt;{CHEGARA.past}, o'rtacha {CHEGARA.past}–{CHEGARA.yaxshi - 1}, yaxshi ≥{CHEGARA.yaxshi}.
        </small>
      </section>

      {/* ─── Qayta bog'lanish ─── */}
      <section className="la-qayta">
        <div className="la-qayta-bosh">
          <h2 className="sn-bolim-sarlavha">
            <span className="la-ikon yashil">
              <RefreshCw />
            </span>
            Qayta bog'lanish mumkin bo'lgan lidlar{' '}
            <MalumotIkon matn="Issiq va iliq lidlar: menejer kelishgan, lekin hali bajarilmagan keyingi qadam bor yoki mijoz javob kutib qolgan" />
          </h2>
        </div>
        <div className="la-qayta-ost">
          <span>
            {qayta.length} ta lid bilan qayta bog'lanish mumkin, {yuqoriImk} tasi yuqori imkoniyatli
          </span>
          {qayta.length > 8 && (
            <button type="button" className="sn-havola" onClick={() => setHammasi((v) => !v)}>
              {hammasi ? 'Kamroq ko\'rsatish' : 'Barchasini ko\'rish'} <ArrowRight />
            </button>
          )}
        </div>
        {qayta.length === 0 ? (
          <div className="card hech-narsa">Hozircha qayta bog'lanish kerak bo'lgan lid yo'q.</div>
        ) : (
          <div className="la-royxat">
            {korinadi.map(({ x, v }) => {
              const t = tur(x) ?? 'warm';
              const a = x.d.analysis!;
              const nom = a.clientExtracted?.name ?? x.d.contact?.name ?? x.d.conversation.phoneFrom ?? `Suhbat #${x.r.id.slice(0, 8)}`;
              const kunlar = v?.deadline ? Math.max(0, Math.round((+new Date(v.deadline) - +new Date(x.r.startedAt)) / KUN)) : null;
              return (
                <Link key={x.r.id + (v?.id ?? '')} to={`/suhbatlar/${x.r.id}`} className={`la-lid ${IMKONIYAT[t].klass}`}>
                  <div className="la-lid-bosh">
                    <b>{nom}</b>
                    <span className={`la-imk ${IMKONIYAT[t].klass}`}>{IMKONIYAT[t].nom}</span>
                    {a.signals?.urgency && <span className="la-kayfiyat">{SHOSHILINCH[a.signals.urgency]}</span>}
                    {v?.status === 'missed' && <span className="la-belgi xavf">muddati o'tgan</span>}
                    {!v && <span className="la-belgi">javob kutmoqda</span>}
                    <span className="la-lid-ong">
                      {x.r.seatId ? ism.get(x.r.seatId) ?? 'Menejer' : 'Biriktirilmagan'} <span>{toliq(x.r.startedAt)}</span>
                    </span>
                  </div>
                  <div className="la-lid-matn">
                    <span className="la-muddat">
                      {v?.deadline ? `Muddat: ${dd(x.r.startedAt)} – ${dd(v.deadline)} (${kunlar} kun)` : 'Muddat belgilanmagan'}
                    </span>
                    <span>{v?.what ?? a.primaryGap ?? a.summary ?? 'Mijoz javob kutib qolgan — qayta yozing.'}</span>
                    <ChevronRight className="la-lid-strelka" aria-hidden="true" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Kpi({
  ikon,
  qiymat,
  nom,
  izoh,
  rang,
  farq,
  onOch,
}: {
  ikon: ReactNode;
  qiymat: ReactNode;
  nom: string;
  izoh: string;
  rang?: 'yaxshi' | 'past' | 'ia' | 'orta';
  farq?: number | null;
  /** Bosilganda shu bo'yicha lidlar ro'yxati ochiladi. */
  onOch?: () => void;
}) {
  return (
    <div className="la-kpi-karta">
      <span className="la-kpi-ikon" aria-hidden="true">
        {ikon}
      </span>
      <div className="la-kpi-ichi">
        <b className={`fa-r-${rang ?? 'yoq'}`}>{qiymat}</b>
        <small>
          {nom} <MalumotIkon matn={izoh} />
        </small>
      </div>
      {farq !== undefined && farq !== null && (
        <span className="la-farq">
          <Farq d={farq} birlik="%" aniqlik={0} />
        </span>
      )}
      {onOch && (
        <button type="button" className="vt-ochish la-kpi-strelka" onClick={onOch} aria-label={`${nom} — lidlar ro'yxati`}>
          <ChevronRight />
        </button>
      )}
    </div>
  );
}

function Kichik({ nom, izoh, qiymat, rang }: { nom: string; izoh: string; qiymat: number; rang?: 'past' }) {
  return (
    <div className="la-kichik">
      <span>
        {nom} <MalumotIkon matn={izoh} />
      </span>
      <b className={rang ? `fa-r-${rang}` : ''}>{qiymat}</b>
    </div>
  );
}
