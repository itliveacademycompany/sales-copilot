import { ChevronDown, ChevronLeft, ChevronRight, Download, Send } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, lidTuri, type ConversationDetail, type ConversationRow, type DailyReportRow, type TaskRow } from '../api';
import { useAuth } from '../auth';
import { oyNomi, tarjima, useT, useTil, type Til } from '../i18n';
import { GuruhliUstunGrafik } from '../components/analitika/grafiklar';
import { useAnalitikaQoshimcha } from '../components/analitika/qoshimcha';
import { MalumotIkon } from '../components/bosh/Korsatkichlar';
import { avatarRang, boshHarf, davomiylik, oldingiDavr, oraliqda, ortacha, useBoshMalumot, type BoshMalumot, type Davr } from '../components/bosh/malumot';
import { KunlikHisobot } from './Settings';
import { savolMatni } from '../components/anketa/savolMatni';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KUNLIK HISOBOT — kun, hafta yoki oy bo'yicha jamoa hisoboti
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Backend faqat Telegram'ga yuborilgan oxirgi hisobotlar matnini saqlaydi.
 * Shuning uchun hisobot istalgan davr uchun shu yerda mavjud ma'lumotdan
 * quriladi (suhbatlar, tahlillar, vazifalar, so'rovnoma). Shu kun uchun
 * Telegram hisoboti bo'lsa — uning asl matni ham ko'rsatiladi.
 */

type Tur = 'kun' | 'hafta' | 'oy';
const KUN = 86400_000;
const HAFTA_KUNI = ['Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh', 'Ya'];
const HAFTA_KUNI_TOLIQ = ['Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba', 'Yakshanba'];
const OYLAR = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const OY_QISQA = ['Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn', 'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek'];

const kunBoshi = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
/** Dushanba — hafta boshi */
const haftaBoshi = (d: Date) => {
  const k = kunBoshi(d);
  return new Date(k.getTime() - ((k.getDay() + 6) % 7) * KUN);
};
const oyBoshi = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const isoKun = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function haftaRaqami(d: Date) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const kun = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - kun + 3);
  const birinchi = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t.getTime() - birinchi.getTime()) / KUN - 3 + ((birinchi.getUTCDay() + 6) % 7)) / 7);
}
const dd = (d: Date) => tarjima('{kun} {oy}', { kun: d.getDate(), oy: tarjima(OY_QISQA[d.getMonth()]!.toLowerCase()) });
/** Sanadagi oy nomi: o'zbekchada bosh harfli, boshqa tillarda kelishikdagi shakl (17 октября). */
const sanaOyi = (m: number, til: Til) => (til === 'uz' ? OYLAR[m]! : oyNomi(m, true));

/** Tanlangan davrning [boshi, oxiri) chegaralari. */
function oraliq(tur: Tur, langar: Date): { from: Date; to: Date } {
  if (tur === 'kun') {
    const f = kunBoshi(langar);
    return { from: f, to: new Date(f.getTime() + KUN) };
  }
  if (tur === 'hafta') {
    const f = haftaBoshi(langar);
    return { from: f, to: new Date(f.getTime() + 7 * KUN) };
  }
  const f = oyBoshi(langar);
  return { from: f, to: new Date(f.getFullYear(), f.getMonth() + 1, 1) };
}

export function KunlikHisobotSahifa() {
  const { til, t: tr } = useTil();
  const { business } = useAuth();
  const [params, setParams] = useSearchParams();
  const tur = (['kun', 'hafta', 'oy'] as const).find((t) => t === params.get('tur')) ?? 'kun';
  const sanaParam = params.get('sana');
  const bugun = kunBoshi(new Date());
  const langar = useMemo(() => {
    const d = sanaParam ? new Date(`${sanaParam}T00:00:00`) : bugun;
    return Number.isNaN(d.getTime()) || d > bugun ? bugun : d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sanaParam]);

  const yangila = (o: Record<string, string | null>) =>
    setParams(
      (eski) => {
        const p = new URLSearchParams(eski);
        for (const [k, v] of Object.entries(o)) {
          if (v) p.set(k, v);
          else p.delete(k);
        }
        return p;
      },
      { replace: true },
    );

  const { from, to } = oraliq(tur, langar);
  const hozir = Date.now();
  const davr: Davr = useMemo(
    () => ({ turi: 'maxsus', from, to: new Date(Math.min(to.getTime(), hozir)) }),
    // Daqiqa sayin qayta yuklanmasin — faqat tanlov o'zgarganda
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tur, from.getTime()],
  );
  const { data, loading, xato } = useBoshMalumot(business, davr);
  const joriyRows = useMemo(() => (data ? oraliqda(data.suhbatlar, davr.from, davr.to) : null), [data, davr]);
  const q = useAnalitikaQoshimcha(business, davr, joriyRows);

  const [telegram, setTelegram] = useState<DailyReportRow[]>([]);
  useEffect(() => {
    if (!business) return;
    void api
      .get<{ reports: DailyReportRow[] }>(`/api/v1/businesses/${business.businessId}/reports/daily`)
      .then((r) => setTelegram(r.reports))
      .catch(() => undefined);
  }, [business?.businessId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!business) return null;
  const boshqaraOladi = business.permissions.includes('integration:manage');
  const tugamagan = hozir < to.getTime();
  const sarlavha =
    tur === 'kun'
      ? tr('{kun} {oy}, {hk}', { kun: langar.getDate(), oy: sanaOyi(langar.getMonth(), til), hk: tr(HAFTA_KUNI_TOLIQ[(langar.getDay() + 6) % 7]!) })
      : tur === 'hafta'
        ? `${tr('{n}-hafta', { n: haftaRaqami(from) })} · ${dd(from)} – ${dd(new Date(to.getTime() - KUN))}`
        : `${tr(OYLAR[from.getMonth()]!)} ${from.getFullYear()}`;
  const tgHisobot = tur === 'kun' ? telegram.find((r) => r.summaryDate === isoKun(langar)) : undefined;

  return (
    <div className="kh-sahifa">
      <nav className="sd-tablar kh-tablar" role="tablist" aria-label={tr('Hisobot davri')}>
        {(
          [
            ['kun', 'Kunlik'],
            ['hafta', 'Haftalik'],
            ['oy', 'Oylik'],
          ] as const
        ).map(([k, nom]) => (
          <button key={k} type="button" role="tab" aria-selected={tur === k} className={`sd-tab${tur === k ? ' faol' : ''}`} onClick={() => yangila({ tur: k === 'kun' ? null : k })}>
            {tr(nom)}
          </button>
        ))}
      </nav>

      <Polosa tur={tur} langar={langar} suhbatlar={data?.suhbatlar ?? []} onTanla={(d) => yangila({ sana: isoKun(d) === isoKun(bugun) ? null : isoKun(d) })} />

      <div className="kh-davr-bosh">
        <h2>{sarlavha}</h2>
        {tugamagan ? (
          <span className="kh-holat orta">{tur === 'kun' ? tr('Kun tugamagan') : tr('Davr tugamagan')}</span>
        ) : joriyRows && joriyRows.some((r) => r.status === 'done') ? (
          <span className="kh-holat yaxshi">{tr('Tahlil tayyor')}</span>
        ) : (
          <span className="kh-holat">{tr("Ma'lumot yo'q")}</span>
        )}
      </div>

      {xato ? (
        <div className="card hech-narsa">{xato}</div>
      ) : !data || !joriyRows ? (
        <div className="card skelet" style={{ height: 420 }} aria-busy="true" />
      ) : (
        <div className={loading ? 'an-yangilanmoqda' : ''}>
          <Hisobot data={data} davr={{ from, to }} tur={tur} q={q} biznes={business.name} sarlavha={sarlavha} tugamagan={tugamagan} />
        </div>
      )}

      {tgHisobot?.content && (
        <details className="card kh-yigma">
          <summary>
            <Send /> {tr("Telegram'ga yuborilgan hisobot")} <small>{new Date(tgHisobot.createdAt).toLocaleString('uz')}</small>
            <ChevronDown className="kh-yigma-strelka" />
          </summary>
          <pre className="kh-tg-matn">{tgHisobot.content}</pre>
        </details>
      )}

      {data && joriyRows && <MenejerlarTahlili data={data} rows={joriyRows} q={q} />}

      <details className="card kh-yigma">
        <summary>
          <Send /> {tr('Telegram orqali yuborish sozlamalari')}
          <ChevronDown className="kh-yigma-strelka" />
        </summary>
        <div className="kh-sozlama">
          <KunlikHisobot businessId={business.businessId} boshqaraOladi={boshqaraOladi} />
        </div>
      </details>
    </div>
  );
}

// ─── Kun / hafta / oy polosasi ──────────────────────────────────────────────

function Polosa({ tur, langar, suhbatlar, onTanla }: { tur: Tur; langar: Date; suhbatlar: ConversationRow[]; onTanla: (d: Date) => void }) {
  const t = useT();
  const [siljish, setSiljish] = useState(0);
  useEffect(() => setSiljish(0), [tur, langar.getTime()]);
  const bugun = kunBoshi(new Date());

  // Polosa elementlari: kun — tanlangan hafta, hafta — 6 hafta, oy — 6 oy
  const elementlar: { boshi: Date; oxiri: Date; ust: string; ost: string }[] = [];
  if (tur === 'kun') {
    const b = new Date(haftaBoshi(langar).getTime() + siljish * 7 * KUN);
    for (let i = 0; i < 7; i++) {
      const d = new Date(b.getTime() + i * KUN);
      elementlar.push({ boshi: d, oxiri: new Date(d.getTime() + KUN), ust: t(HAFTA_KUNI[i]!), ost: String(d.getDate()) });
    }
  } else if (tur === 'hafta') {
    const oxirgi = new Date(haftaBoshi(langar).getTime() + siljish * 6 * 7 * KUN);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(oxirgi.getTime() - i * 7 * KUN);
      elementlar.push({ boshi: d, oxiri: new Date(d.getTime() + 7 * KUN), ust: t('{n}-hafta', { n: haftaRaqami(d) }), ost: `${dd(d)} – ${dd(new Date(d.getTime() + 6 * KUN))}` });
    }
  } else {
    const ob = oyBoshi(langar);
    for (let i = 5; i >= 0; i--) {
      const d = new Date(ob.getFullYear(), ob.getMonth() - i + siljish * 6, 1);
      elementlar.push({ boshi: d, oxiri: new Date(d.getFullYear(), d.getMonth() + 1, 1), ust: t(OY_QISQA[d.getMonth()]!), ost: String(d.getFullYear()) });
    }
  }
  const tanlangan = oraliq(tur, langar).from.getTime();
  const tahlilBor = (a: Date, b: Date) => suhbatlar.some((r) => r.status === 'done' && +new Date(r.startedAt) >= a.getTime() && +new Date(r.startedAt) < b.getTime());
  // Sarlavhadagi oy — tanlangan kun polosada bo'lsa uning oyi, aks holda polosa o'rtasi
  const sarlavhaOy = elementlar.some((e) => e.boshi.getTime() === tanlangan) ? langar : elementlar[Math.floor(elementlar.length / 2)]!.boshi;
  const keyingiYoq = elementlar[elementlar.length - 1]!.oxiri.getTime() > bugun.getTime();

  return (
    <section className="kh-polosa-blok">
      <div className="kh-polosa-bosh">
        <h2>
          {tur === 'oy' ? `${elementlar[0]!.boshi.getFullYear()}` : `${t(OYLAR[sarlavhaOy.getMonth()]!)} ${sarlavhaOy.getFullYear()}`}{' '}
          <MalumotIkon matn={t("Davrni tanlang — hisobot shu davr bo'yicha quriladi")} />
        </h2>
        <div className="kh-nav">
          <button type="button" className="vr-amal" onClick={() => setSiljish((s) => s - 1)} aria-label={t('Oldingi')}>
            <ChevronLeft />
          </button>
          <button type="button" className="kh-bugun" onClick={() => onTanla(bugun)}>
            {t('Bugun')}
          </button>
          <button type="button" className="vr-amal" onClick={() => setSiljish((s) => s + 1)} disabled={keyingiYoq} aria-label={t('Keyingi')}>
            <ChevronRight />
          </button>
        </div>
      </div>
      <div className={`kh-polosa ${tur}`} role="listbox" aria-label={t('Davr')}>
        {elementlar.map((e) => {
          const kelajak = e.boshi.getTime() > bugun.getTime();
          const joriy = bugun.getTime() >= e.boshi.getTime() && bugun.getTime() < e.oxiri.getTime();
          const bor = tahlilBor(e.boshi, e.oxiri);
          const faol = e.boshi.getTime() === tanlangan;
          return (
            <button
              key={e.boshi.getTime()}
              type="button"
              role="option"
              aria-selected={faol}
              disabled={kelajak}
              className={`kh-kun${faol ? ' faol' : ''}`}
              onClick={() => onTanla(e.boshi)}
            >
              <span className="kh-kun-ust">{e.ust}</span>
              <b>{e.ost}</b>
              <i className={`kh-nuqta${joriy ? ' orta' : bor ? ' yaxshi' : ''}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>
      <div className="kh-legenda">
        <span>
          <i className="kh-nuqta yaxshi" /> {t('Tahlil mavjud')}
        </span>
        <span>
          <i className="kh-nuqta orta" /> {tur === 'kun' ? t('Kun tugamagan') : t('Davr tugamagan')}
        </span>
      </div>
    </section>
  );
}

// ─── Hisobot ────────────────────────────────────────────────────────────────

const OCHIQ = new Set(['pending', 'in_progress', 'blocked']);
const ichida = (iso: string | null, a: number, b: number) => !!iso && +new Date(iso) >= a && +new Date(iso) < b;
const foiz = (a: number, b: number) => (b ? (a / b) * 100 : 0);
const f1 = (n: number) => n.toFixed(1);

function Hisobot({
  data,
  davr,
  tur,
  q,
  biznes,
  sarlavha,
  tugamagan,
}: {
  data: BoshMalumot;
  davr: { from: Date; to: Date };
  tur: Tur;
  q: ReturnType<typeof useAnalitikaQoshimcha>;
  biznes: string;
  sarlavha: string;
  tugamagan: boolean;
}) {
  const t = useT();
  /** Davr turiga qarab uch xil to'liq gapdan birini tanlash (so'z qo'shimchasi tilga qarab farq qiladi). */
  const uch = <T,>(kun: T, hafta: T, oy: T) => (tur === 'kun' ? kun : tur === 'hafta' ? hafta : oy);
  const a = davr.from.getTime();
  const b = davr.to.getTime();
  const old = oldingiDavr(davr);
  const ism = new Map<string, string>();
  for (const s of data.seats) ism.set(s.id, s.displayName);
  for (const r of data.board) if (!ism.has(r.seatId)) ism.set(r.seatId, r.displayName);

  const davom = (r: ConversationRow) => q.tafsilot[r.id]?.conversation.durationSeconds ?? davomiylik(r) ?? 0;
  const hisob = (rows: ConversationRow[]) => {
    const ul = rows.filter((r) => r.status !== 'filtered');
    return { jami: rows.length, ulangan: ul.length, yoq: rows.length - ul.length, vaqt: Math.round(ul.reduce((s, r) => s + davom(r), 0) / 60) };
  };
  const rows = oraliqda(data.suhbatlar, davr.from, davr.to);
  const oldRows = oraliqda(data.suhbatlar, old.from, old.to);
  const j = hisob(rows);
  const o = hisob(oldRows);
  // "Bugun/Kecha" faqat bugungi kun uchun — o'tgan kun tanlansa "Shu kun/Oldingi kun"
  const bugunmi = tur === 'kun' && tugamagan;
  const oldinNom = t(tur === 'kun' ? (bugunmi ? 'Kecha' : 'Oldingi kun') : tur === 'hafta' ? "O'tgan hafta" : "O'tgan oy");
  const joriyNom = t(tur === 'kun' ? (bugunmi ? 'Bugun' : 'Shu kun') : tur === 'hafta' ? 'Shu hafta' : 'Shu oy');

  // Vazifalar
  const v: TaskRow[] = q.vazifalar ?? [];
  const yaratilgan = v.filter((x) => ichida(x.createdAt, a, b));
  const reja = v.filter((x) => ichida(x.dueAt, a, b) && x.status !== 'cancelled');
  const rejaBajarildi = reja.filter((x) => x.status === 'done').length;
  const yakunlangan = v.filter((x) => x.status === 'done' && ichida(x.completedAt, a, b)).length;
  const kechikkan = v.filter((x) => x.isOverdue).length;
  const seatVazifa = [...new Set(v.map((x) => x.seatId ?? ''))].filter(Boolean).map((s) => {
    const bu = v.filter((x) => x.seatId === s);
    const r = bu.filter((x) => ichida(x.dueAt, a, b) && x.status !== 'cancelled');
    return {
      nom: ism.get(s) ?? t('Menejer'),
      yaratgan: bu.filter((x) => ichida(x.createdAt, a, b)).length,
      bajargan: bu.filter((x) => ichida(x.createdAt, a, b) && x.status === 'done').length,
      reja: r.length,
      rejaBajar: r.filter((x) => x.status === 'done').length,
      kech: bu.filter((x) => x.isOverdue).length,
      yakun: bu.filter((x) => x.status === 'done' && ichida(x.completedAt, a, b)).length,
    };
  });

  // Sifat
  const done = rows.filter((r) => r.status === 'done');
  const baholangan = done.filter((r) => r.overallScore !== null);
  const operatsion = done.filter((r) => r.scoringMode && r.scoringMode !== 'scored').length;
  const ortBall = ortacha(baholangan.map((r) => Number(r.overallScore)));

  // Menejerlar
  const seatlar = [...new Set(rows.map((r) => r.seatId ?? ''))].filter(Boolean).map((s) => {
    const bu = rows.filter((r) => r.seatId === s);
    const h = hisob(bu);
    const bb = bu.filter((r) => r.overallScore !== null).map((r) => Number(r.overallScore));
    return { s, nom: ism.get(s) ?? t('Menejer'), ...h, ball: ortacha(bb) };
  });

  // Lidlar
  const det = done.map((r) => q.tafsilot[r.id]).filter((d): d is ConversationDetail => !!d?.analysis);
  const lid = (tur: string) => done.filter((r) => lidTuri(q.tafsilot[r.id]?.analysis?.leadQuality ?? r.leadQuality) === tur).length;
  const yangi = det.filter((d) => d.previousConversations.length === 0).length;
  const faol = det.filter((d) => d.commitments.some((k) => k.byParty === 'manager' && k.status === 'pending')).length;
  const bitim = det.reduce((s, d) => s + (d.analysis!.deal?.amount ?? 0), 0);
  const issiq = lid('hot');
  const lidBaholangan = issiq + lid('warm') + lid('cold');
  const javobsiz = det.filter((d) => d.analysis!.dynamics?.needsReply === true).length;

  // Anketa
  const savollar = (data.playbook?.questionnaire.questions ?? []).map((sv) => ({
    savol: savolMatni(sv.question),
    soni: det.filter((d) => d.analysis!.questionnaireAnswers?.some((x) => x.question.trim().toLowerCase() === sv.question.trim().toLowerCase() && x.answer?.trim())).length,
  }));

  // Tavsiyalar — topilgan raqamlardan
  const tavsiya: string[] = [];
  if (kechikkan > 0) tavsiya.push(t("Muddati o'tgan {n} ta vazifani zudlik bilan ko'rib chiqing va ustuvorlik bo'yicha mijozlar bilan bog'laning.", { n: kechikkan }));
  if (javobsiz > 0) tavsiya.push(t('{n} ta mijoz javob kutib qolgan — ertalab birinchi navbatda ularga yozing.', { n: javobsiz }));
  if (j.yoq > 0 && foiz(j.yoq, j.jami) >= 30)
    tavsiya.push(t("Suhbatlarning {n}% ida mijoz bilan bog'lanib bo'lmagan — qayta urinish vaqtini o'zgartirib ko'ring.", { n: Math.round(foiz(j.yoq, j.jami)) }));
  const zaif = [...seatlar].filter((x) => x.ball !== null).sort((x, y) => x.ball! - y.ball!)[0];
  if (zaif && zaif.ball! < 60) tavsiya.push(t("{nom} bilan suhbat sifati ({n}%) bo'yicha qisqa kouching o'tkazing.", { nom: zaif.nom, n: Math.round(zaif.ball!) }));
  const engKechikkan = [...seatVazifa].sort((x, y) => y.kech - x.kech)[0];
  if (engKechikkan && engKechikkan.kech > 0)
    tavsiya.push(t("{nom} bilan vazifalar rejasini bajarish bo'yicha gaplashing ({n} ta kechikkan).", { nom: engKechikkan.nom, n: engKechikkan.kech }));
  if (tavsiya.length === 0)
    tavsiya.push(
      j.jami === 0
        ? uch(
            t('Bu kunda suhbat qayd etilmagan — menejerlar faolligini tekshiring.'),
            t('Bu haftada suhbat qayd etilmagan — menejerlar faolligini tekshiring.'),
            t('Bu oyda suhbat qayd etilmagan — menejerlar faolligini tekshiring.'),
          )
        : t("Jiddiy muammo topilmadi — joriy sur'atni saqlang."),
    );

  const kq = { sarlavha, biznes, n: j.jami, ul: j.ulangan, kech: kechikkan, ball: ortBall === null ? 0 : Math.round(ortBall), issiq };
  const kirish =
    j.jami === 0
      ? kechikkan
        ? t("{sarlavha} holatiga ko'ra {biznes} bo'yicha suhbatlar qayd etilmadi, asosiy e'tibor {kech} ta kechikkan vazifaga qaratilishi kerak.", kq)
        : t("{sarlavha} holatiga ko'ra {biznes} bo'yicha suhbatlar qayd etilmadi.", kq)
      : ortBall !== null && issiq
        ? t("{sarlavha} davomida {n} ta suhbat bo'ldi: {ul} tasida mijoz bilan bog'lanildi, o'rtacha sifat {ball}%, {issiq} ta issiq lid.", kq)
        : ortBall !== null
          ? t("{sarlavha} davomida {n} ta suhbat bo'ldi: {ul} tasida mijoz bilan bog'lanildi, o'rtacha sifat {ball}%.", kq)
          : issiq
            ? t("{sarlavha} davomida {n} ta suhbat bo'ldi: {ul} tasida mijoz bilan bog'lanildi, {issiq} ta issiq lid.", kq)
            : t("{sarlavha} davomida {n} ta suhbat bo'ldi: {ul} tasida mijoz bilan bog'lanildi.", kq);
  const xulosa =
    j.jami === 0
      ? `${
          kechikkan
            ? uch(
                t("Bu kun davomida suhbat faolligi kuzatilmadi va vazifalar bo'yicha qarzdorlik saqlanib qolmoqda."),
                t("Bu hafta davomida suhbat faolligi kuzatilmadi va vazifalar bo'yicha qarzdorlik saqlanib qolmoqda."),
                t("Bu oy davomida suhbat faolligi kuzatilmadi va vazifalar bo'yicha qarzdorlik saqlanib qolmoqda."),
              )
            : uch(
                t('Bu kun davomida suhbat faolligi kuzatilmadi.'),
                t('Bu hafta davomida suhbat faolligi kuzatilmadi.'),
                t('Bu oy davomida suhbat faolligi kuzatilmadi.'),
              )
        } ${uch(
          t("Keyingi kunda asosiy e'tiborni mijozlar bilan aloqaga qaratish zarur."),
          t("Keyingi haftada asosiy e'tiborni mijozlar bilan aloqaga qaratish zarur."),
          t("Keyingi oyda asosiy e'tiborni mijozlar bilan aloqaga qaratish zarur."),
        )}`
      : t("{joriy} {n} ta suhbat ({oldin} {m} ta), bog'lanish darajasi {f}%.", {
          joriy: joriyNom,
          n: j.jami,
          oldin: oldinNom.toLowerCase(),
          m: o.jami,
          f: f1(foiz(j.ulangan, j.jami)),
        }) +
        (kechikkan ? ` ${t("{n} ta vazifa muddati o'tgan.", { n: kechikkan })}` : '') +
        (javobsiz ? ` ${t('{n} ta mijoz javob kutmoqda.', { n: javobsiz })}` : '');

  return (
    <section className="card an-karta kh-umumiy">
      <div className="karta-bosh">
        <h2>
          {t('Umumiy tahlil')} <MalumotIkon matn={t('Hisobot shu davrdagi suhbatlar, AI tahlillari va vazifalardan avtomatik tuziladi')} />
        </h2>
        <button type="button" className="btn ikkinchi" onClick={() => window.print()}>
          <Download /> {t('PDF yuklab olish')}
        </button>
      </div>

      <article className="kh-hisobot kh-chop">
        <h1 className="kh-h-sarlavha">
          {uch(
            t('{biznes}: {sarlavha} kunlik hisobot', { biznes, sarlavha }),
            t('{biznes}: {sarlavha} haftalik hisobot', { biznes, sarlavha }),
            t('{biznes}: {sarlavha} oylik hisobot', { biznes, sarlavha }),
          )}
        </h1>
        <p className="kh-h-kirish">
          {kirish}
          {tugamagan && (
            <em>
              {' '}
              {uch(
                t("(kun hali tugamagan — raqamlar o'zgarishi mumkin)"),
                t("(hafta hali tugamagan — raqamlar o'zgarishi mumkin)"),
                t("(oy hali tugamagan — raqamlar o'zgarishi mumkin)"),
              )}
            </em>
          )}
        </p>

        <Bolim nom={t('Suhbat faolligi')}>
          <Qator nom={t('Jami suhbatlar')} q={j.jami} />
          <Qator nom={t("Bog'langan suhbatlar")} q={j.ulangan} />
          <Qator nom={t('Mijozga yetib borilmagan')} q={j.yoq} />
          <Qator nom={t("Bog'lanish darajasi")} q={`${f1(foiz(j.ulangan, j.jami))}%`} />
          <Qator nom={t('Umumiy suhbat vaqti')} q={t('{n} daqiqa', { n: j.vaqt })} />
          <Qator nom={oldinNom} q={t("jami {n}, bog'langan {ul}, bog'lanish darajasi {f}%", { n: o.jami, ul: o.ulangan, f: f1(foiz(o.ulangan, o.jami)) })} />
          <div className="kh-grafik">
            <b>{t('Suhbatlar faolligi')}</b>
            <GuruhliUstunGrafik
              ustunlar={[
                { nom: t('Jami suhbatlar'), qiymatlar: { o: o.jami, j: j.jami } },
                { nom: t("Bog'langan"), qiymatlar: { o: o.ulangan, j: j.ulangan } },
                { nom: t("Bog'lana olmagan"), qiymatlar: { o: o.yoq, j: j.yoq } },
              ]}
              seriyalar={[
                { kalit: 'o', nom: oldinNom, rang: 'var(--s1)' },
                { kalit: 'j', nom: joriyNom, rang: 'var(--s3)' },
              ]}
              balandlik={220}
              nom={t('Suhbatlar faolligi')}
              birlik={t(' ta')}
            />
          </div>
        </Bolim>

        <Bolim nom={t('Vazifalar jarayoni')}>
          <Qator nom={uch(t('Shu kun yaratilgan vazifalar'), t('Shu hafta yaratilgan vazifalar'), t('Shu oy yaratilgan vazifalar'))} q={yaratilgan.length} />
          <Qator nom={t('Yaratilganlardan bajarilgani')} q={`${yaratilgan.filter((x) => x.status === 'done').length} / ${yaratilgan.length}`} />
          <Qator nom={t('Reja vazifalaridan bajarilgani')} q={`${rejaBajarildi} / ${reja.length}`} />
          <Qator nom={t('Reja vazifalaridan qolgani')} q={reja.length - rejaBajarildi} />
          <Qator nom={uch(t('Shu kun yakunlangan'), t('Shu hafta yakunlangan'), t('Shu oy yakunlangan'))} q={yakunlangan} />
          <Qator nom={t("Muddati o'tgan aktiv vazifalar")} q={kechikkan} xavf={kechikkan > 0} />
          {seatVazifa.length > 0 && (
            <>
              <b className="kh-ost-sarlavha">{t("Menejerlar bo'yicha")}</b>
              {seatVazifa.map((x) => (
                <Qator
                  key={x.nom}
                  nom={x.nom}
                  q={t('yaratilgan {yar}, ulardan bajarilgan {baj}, reja {rb} / {reja}, kechikkan {kech}, jami yakunlangan {yak}', {
                    yar: x.yaratgan,
                    baj: x.bajargan,
                    rb: x.rejaBajar,
                    reja: x.reja,
                    kech: x.kech,
                    yak: x.yakun,
                  })}
                />
              ))}
            </>
          )}
        </Bolim>

        <Bolim nom={t('Suhbatlar sifati')}>
          <Qator nom={t('Tahlil qilingan')} q={done.length} />
          <Qator nom={t('Baholangan')} q={`${baholangan.length} (${f1(foiz(baholangan.length, done.length))}%)`} />
          <Qator nom={t('Operatsion (baholanmaydigan)')} q={operatsion} />
          <Qator nom={t("Bog'lanilmagan holatlar")} q={j.yoq} />
          <Qator nom={t("O'rtacha ball")} q={ortBall === null ? '—' : f1(ortBall)} />
        </Bolim>

        <Bolim nom={t('Menejerlar faoliyati')}>
          {seatlar.length === 0 ? (
            <p className="kh-bosh">
              {uch(
                t('Bu kunda menejerlar suhbati qayd etilmagan.'),
                t('Bu haftada menejerlar suhbati qayd etilmagan.'),
                t('Bu oyda menejerlar suhbati qayd etilmagan.'),
              )}
            </p>
          ) : (
            seatlar.map((x) => (
              <Qator
                key={x.s}
                nom={x.nom}
                q={t("suhbatlar {n}; bog'langan {ul}; bog'lanish darajasi {f}%; suhbat vaqti {vaqt} daqiqa; o'rtacha ball {ball}", {
                  n: x.jami,
                  ul: x.ulangan,
                  f: f1(foiz(x.ulangan, x.jami)),
                  vaqt: x.vaqt,
                  ball: x.ball === null ? '—' : f1(x.ball),
                })}
              />
            ))
          )}
        </Bolim>

        <Bolim nom={t('Lidlar harakati')}>
          <Qator nom={t('Yangi lidlar')} q={yangi} />
          <Qator nom={t('Issiq lidlar')} q={issiq} />
          <Qator nom={t('Iliq lidlar')} q={lid('warm')} />
          <Qator nom={t('Sovuq lidlar')} q={lid('cold')} />
          <Qator nom={t('Faol lidlar (keyingi qadam kelishilgan)')} q={faol} />
          <Qator nom={t('Bitim summasi')} q={bitim ? Math.round(bitim).toLocaleString('uz').replace(/,/g, ' ') : 0} />
          <Qator nom={t('Issiq lid ulushi')} q={`${f1(foiz(issiq, lidBaholangan))}%`} />
        </Bolim>

        {savollar.length > 0 && (
          <Bolim nom={t('Anketa savollari')}>
            {savollar.map((s) => (
              <Qator key={s.savol} nom={s.savol} q={t('javoblar: {n}', { n: s.soni })} />
            ))}
          </Bolim>
        )}

        <Bolim nom={uch(t('Keyingi kun uchun tavsiyalar'), t('Keyingi hafta uchun tavsiyalar'), t('Keyingi oy uchun tavsiyalar'))}>
          <ul className="kh-tavsiyalar">
            {tavsiya.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </Bolim>

        <Bolim nom={t('Xulosa')}>
          <p className="kh-xulosa">{xulosa}</p>
        </Bolim>
      </article>
    </section>
  );
}

function Bolim({ nom, children }: { nom: string; children: React.ReactNode }) {
  return (
    <section className="kh-bolim">
      <h3>{nom}</h3>
      {children}
    </section>
  );
}

function Qator({ nom, q, xavf }: { nom: string; q: React.ReactNode; xavf?: boolean }) {
  return (
    <p className="kh-qator">
      <b>{nom}:</b> <span className={xavf ? 'xavf' : ''}>{q}</span>
    </p>
  );
}

// ─── Menejerlar tahlili (akkordeon) ─────────────────────────────────────────

function MenejerlarTahlili({ data, rows, q }: { data: BoshMalumot; rows: ConversationRow[]; q: ReturnType<typeof useAnalitikaQoshimcha> }) {
  const t = useT();
  const [ochiq, setOchiq] = useState<string | null>(null);
  return (
    <section className="card an-karta">
      <div className="karta-bosh">
        <h2>
          {t('Menejerlar tahlili')} <MalumotIkon matn={t("Har menejerning shu davrdagi ko'rsatkichlari va suhbatlari")} />
        </h2>
      </div>
      <div className="kh-akkordeon">
        {data.seats.map((s) => {
          const bu = rows.filter((r) => r.seatId === s.id);
          const done = bu.filter((r) => r.status === 'done');
          const ball = ortacha(done.filter((r) => r.overallScore !== null).map((r) => Number(r.overallScore)));
          const issiq = done.filter((r) => lidTuri(q.tafsilot[r.id]?.analysis?.leadQuality ?? r.leadQuality) === 'hot').length;
          const kech = (q.vazifalar ?? []).filter((x) => x.seatId === s.id && x.isOverdue).length;
          const ochiqV = (q.vazifalar ?? []).filter((x) => x.seatId === s.id && OCHIQ.has(x.status)).length;
          const bor = ochiq === s.id;
          return (
            <div key={s.id} className={`kh-akk${bor ? ' ochiq' : ''}`}>
              <button type="button" className="kh-akk-bosh" onClick={() => setOchiq(bor ? null : s.id)} aria-expanded={bor}>
                <span className="sn-avatar katta" style={{ background: avatarRang(s.id) }}>
                  {boshHarf(s.displayName)}
                </span>
                <b>{s.displayName}</b>
                <span className="kh-akk-qisqa">
                  {t('{n} suhbat', { n: bu.length })}
                  {ball !== null && ` · ${Math.round(ball)}%`}
                  {kech > 0 && <em> · {t('{n} kechikkan', { n: kech })}</em>}
                </span>
                <ChevronDown className="kh-akk-strelka" />
              </button>
              {bor && (
                <div className="kh-akk-ichi">
                  <div className="kh-mini">
                    <Mini nom={t('Suhbatlar')} q={bu.length} />
                    <Mini nom={t("Bog'langan")} q={bu.filter((r) => r.status !== 'filtered').length} />
                    <Mini nom={t("O'rtacha ball")} q={ball === null ? '—' : `${Math.round(ball)}%`} />
                    <Mini nom={t('Issiq lidlar')} q={issiq} />
                    <Mini nom={t('Ochiq vazifalar')} q={ochiqV} />
                    <Mini nom={t('Kechikkan')} q={kech} xavf={kech > 0} />
                  </div>
                  {done.length === 0 ? (
                    <p className="kh-bosh">{t("Bu davrda tahlil qilingan suhbat yo'q.")}</p>
                  ) : (
                    <ul className="kh-suhbatlar">
                      {done.slice(0, 6).map((r) => (
                        <li key={r.id}>
                          <Link to={`/lidlar/${r.id}`}>
                            <span>{r.summary ?? t('Suhbat #{id}', { id: r.id.slice(0, 8) })}</span>
                            {r.overallScore !== null && <b>{Math.round(Number(r.overallScore))}%</b>}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Mini({ nom, q, xavf }: { nom: string; q: React.ReactNode; xavf?: boolean }) {
  return (
    <div className="kh-mini-k">
      <span>{nom}</span>
      <b className={xavf ? 'xavf' : ''}>{q}</b>
    </div>
  );
}
