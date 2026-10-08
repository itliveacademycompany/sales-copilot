import { Check, ChevronDown, ShieldCheck, TriangleAlert, UserRound, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BALL_CHEGARA,
  ballKlass,
  ballRang,
  type ConversationDetail,
  type CriterionScoreRow,
  type PlaybookBody,
  type Rubric,
} from '../../api';
import { MalumotIkon } from '../bosh/Korsatkichlar';
import { avatarRang, boshHarf, oraliqda, ortacha, type BoshMalumot } from '../bosh/malumot';
import { FiltrTugma, TanlovRoyxat, type Tanlov } from '../qongiroq/Filtrlar';
import type { TabProps } from './Tablar';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIFAT NAZORATI — suhbatlar qayerda ball yo'qotyapti?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Har qo'ng'iroq turi o'z baholash tizimi bo'yicha o'qiladi. Tizim playbook'dan
 * kelib chiqadi: mezonning `appliesTo.callFamilies` bo'sh bo'lsa — u umumiy,
 * aks holda faqat ko'rsatilgan turlarga tegishli. Maxsus mezoni yo'q turlar
 * umumiy tizim bilan baholanadi.
 *
 * "Hozir / Kerak" matnlari o'ylab topilmaydi — mezon rubrikasidan olinadi:
 * hozir = zaif baholarda eng ko'p qo'yilgan ball izohi, kerak = eng yuqori ball
 * izohi. Hisob tafsiloti yuklangan tahlillar bo'yicha (ro'yxat API'sida ball
 * yo'q).
 */

/** Mezon o'rtachasi shundan past bo'lsa — zaif bajarilmoqda. */
const ZAIF_FOIZ = BALL_CHEGARA.yaxshi;
/** Gaplashish muvozanati zonasi: menejer vaqtning shu qismida gapiradi. */
const ZONA = { min: 35, max: 55 } as const;
const KORINADI = 4;

interface Mezon {
  code: string;
  name: string;
  categoryCode: string | null;
  rubric: Rubric | null;
}

interface Tizim {
  kalit: string;
  nom: string;
  umumiy: boolean;
  /** Shu tizim bilan baholanadigan qo'ng'iroq turlari (kalitlar). */
  oilalar: string[];
  mezonlar: Mezon[];
}

const UMUMIY = '__umumiy';

/** Playbook'dan baholash tizimlarini yig'adi. */
function tizimlarniYasash(pb: PlaybookBody | null, zaxira: Mezon[]) {
  if (!pb) {
    return {
      royxat: [{ kalit: UMUMIY, nom: 'Umumiy baholash tizimi', umumiy: true, oilalar: [], mezonlar: zaxira }] as Tizim[],
      baholanmaydi: [] as string[],
      oilaNomi: {} as Record<string, string>,
    };
  }
  const faol = pb.criteria.criteria.filter((m) => m.isActive).sort((a, b) => a.order - b.order);
  const mezon = (m: (typeof faol)[number]): Mezon => ({ code: m.code, name: m.name, categoryCode: m.categoryCode, rubric: m.rubric });
  const umumiyMezon = faol.filter((m) => m.appliesTo.callFamilies.length === 0).map(mezon);
  const oilalar = pb.classificationPolicy.callFamilies;
  const oilaNomi = Object.fromEntries(oilalar.map((o) => [o.key, o.name]));

  const umumiy: Tizim = { kalit: UMUMIY, nom: 'Umumiy baholash tizimi', umumiy: true, oilalar: [], mezonlar: umumiyMezon };
  const maxsus: Tizim[] = [];
  for (const o of oilalar.filter((o) => o.scored)) {
    const xos = faol.filter((m) => m.appliesTo.callFamilies.includes(o.key));
    if (xos.length === 0) umumiy.oilalar.push(o.key);
    else
      maxsus.push({
        kalit: o.key,
        nom: o.name,
        umumiy: false,
        oilalar: [o.key],
        mezonlar: faol.filter((m) => m.appliesTo.callFamilies.length === 0 || m.appliesTo.callFamilies.includes(o.key)).map(mezon),
      });
  }
  return {
    royxat: [...maxsus, ...(umumiyMezon.length > 0 ? [umumiy] : [])],
    baholanmaydi: oilalar.filter((o) => !o.scored).map((o) => o.name),
    oilaNomi,
  };
}

const ulush = (s: CriterionScoreRow) => (s.score === null || s.maxScore <= 0 ? null : (s.score / s.maxScore) * 100);
/** Backend bilan bir xil: 3 ballik shkalada ≤1 — zaif. */
const zaifmi = (s: CriterionScoreRow) => s.score !== null && s.score <= s.maxScore / 3;
const sozlar = (t: string) => t.split(/\s+/).filter(Boolean).length;

interface MezonHisob {
  mezon: Mezon;
  foiz: number | null;
  baholangan: number;
  zaifSuhbat: number;
  hozir: string | null;
  kerak: string | null;
  engZaif: { seatId: string; foiz: number }[];
}

function tizimHisobi(tizim: Tizim, tafsilot: ConversationDetail[], pb: PlaybookBody | null) {
  const ballar = tafsilot.flatMap((d) => d.scores.map((s) => ({ s, seatId: d.conversation.seatId ?? '' })));
  const mezonlar: MezonHisob[] = tizim.mezonlar.map((m) => {
    const bu = ballar.filter((b) => b.s.criterionCode === m.code && b.s.score !== null);
    const zaif = bu.filter((b) => zaifmi(b.s));
    // Zaif baholarda eng ko'p qo'yilgan ball — "hozir" shu ball izohi
    const sanoq = new Map<number, number>();
    for (const b of zaif) sanoq.set(b.s.score!, (sanoq.get(b.s.score!) ?? 0) + 1);
    const odatiy = [...sanoq.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
    const rubric = m.rubric ?? bu.find((b) => b.s.rubricSnapshot)?.s.rubricSnapshot ?? null;
    const max = bu[0]?.s.maxScore ?? 3;
    const seatlar = new Map<string, number[]>();
    for (const b of bu) {
      if (!b.seatId) continue;
      seatlar.set(b.seatId, [...(seatlar.get(b.seatId) ?? []), ulush(b.s)!]);
    }
    const engZaif = [...seatlar.entries()]
      .map(([seatId, f]) => ({ seatId, foiz: ortacha(f)! }))
      .filter((x) => x.foiz < ZAIF_FOIZ)
      .sort((a, b) => a.foiz - b.foiz)
      .slice(0, 2);
    return {
      mezon: m,
      foiz: ortacha(bu.map((b) => ulush(b.s)!)),
      baholangan: bu.length,
      zaifSuhbat: new Set(zaif.map((b) => b.s.id)).size,
      hozir: odatiy !== undefined && rubric ? (rubric[String(odatiy) as keyof Rubric] ?? null) : null,
      kerak: rubric ? (rubric[String(max) as keyof Rubric] ?? rubric['3']) : null,
      engZaif,
    };
  });

  // Bosqichlar = playbook kategoriyalari; vazn bo'yicha kenglik
  const kategoriyalar = (pb?.criteria.categories ?? []).slice().sort((a, b) => a.order - b.order);
  const bosqichlar = kategoriyalar
    .filter((k) => tizim.mezonlar.some((m) => m.categoryCode === k.code))
    .map((k) => {
      const bu = ballar.filter(
        (b) => b.s.categoryCode === k.code && b.s.score !== null && tizim.mezonlar.some((m) => m.code === b.s.criterionCode),
      );
      return { kod: k.code, nom: k.name, vazn: k.weightPct, foiz: ortacha(bu.map((b) => ulush(b.s)!)) };
    });

  const baholi = bosqichlar.filter((b) => b.foiz !== null);
  const vaznJami = baholi.reduce((s, b) => s + b.vazn, 0);
  const umumiyFoiz =
    vaznJami > 0
      ? baholi.reduce((s, b) => s + b.foiz! * b.vazn, 0) / vaznJami
      : ortacha(mezonlar.filter((m) => m.foiz !== null).map((m) => m.foiz!));
  // Eng ko'p yo'qotish — vazni hisobga olingan: og'ir bosqichdagi 10% kamchilik yengilidagidan qimmat
  const engYoqotish = [...baholi].sort((a, b) => b.vazn * (100 - b.foiz!) - a.vazn * (100 - a.foiz!))[0] ?? null;
  const zaiflar = mezonlar
    .filter((m) => m.foiz !== null && m.foiz < ZAIF_FOIZ)
    .sort((a, b) => b.zaifSuhbat - a.zaifSuhbat || a.foiz! - b.foiz!);

  return { mezonlar, bosqichlar, umumiyFoiz, engYoqotish, zaiflar, suhbat: tafsilot.length };
}

// ─── Bo'lim ─────────────────────────────────────────────────────────────────

export function SifatNazorati({ data, davr, q }: TabProps) {
  const [menejer, setMenejer] = useState<string[]>([]);
  const [tanlangan, setTanlangan] = useState<string | null>(null);

  const ism = useMemo(() => seatIsmlari(data), [data]);

  // Davrdagi, tafsiloti yuklangan tahlillar
  const barcha = useMemo(
    () =>
      oraliqda(data.suhbatlar, davr.from, davr.to)
        .filter((r) => r.status === 'done')
        .map((r) => q.tafsilot[r.id])
        .filter((d): d is ConversationDetail => !!d && !!d.analysis),
    [data.suhbatlar, davr, q.tafsilot],
  );
  const tafsilot = menejer.length === 0 ? barcha : barcha.filter((d) => menejer.includes(d.conversation.seatId ?? ''));

  const zaxira: Mezon[] = data.criteria.map((c) => ({ code: c.code, name: c.name, categoryCode: c.categoryCode, rubric: null }));
  const { royxat: tizimlar, baholanmaydi, oilaNomi } = tizimlarniYasash(data.playbook, zaxira);
  const tizimiga = (d: ConversationDetail) => {
    const f = d.analysis?.callFamily;
    return tizimlar.find((t) => !t.umumiy && f && t.oilalar.includes(f))?.kalit ?? UMUMIY;
  };
  const hisoblar = tizimlar.map((t) => ({
    tizim: t,
    h: tizimHisobi(
      t,
      tafsilot.filter((d) => tizimiga(d) === t.kalit),
      data.playbook,
    ),
  }));
  // Yuqorida — eng ko'p yo'qotish bor tur
  hisoblar.sort((a, b) => (a.h.umumiyFoiz ?? 101) - (b.h.umumiyFoiz ?? 101));
  const faol = hisoblar.find((x) => x.tizim.kalit === tanlangan) ?? hisoblar[0];

  const menejerTanlov: Tanlov[] = Object.entries(ism)
    .map(([id, nom]) => ({ qiymat: id, nom, soni: barcha.filter((d) => d.conversation.seatId === id).length }))
    .filter((t) => t.soni > 0);

  const yuklanmoqda = q.tafsilotKutilmoqda > 0;

  return (
    <div className="an-bolim">
      <section className="card an-karta sn-karta">
        <div className="sn-bosh">
          <div>
            <h2>
              Qo'ng'iroq turlari bo'yicha muammolar{' '}
              <MalumotIkon matn="Mezon ballari tahlil tafsilotlaridan hisoblanadi. Zaif — o'rtacha natija 60% dan past." />
            </h2>
            <p className="sn-izoh">Har bir qo'ng'iroq turi o'z baholash tizimi bo'yicha o'qiladi. Yuqorida — eng ko'p yo'qotish bor turi.</p>
          </div>
          <FiltrTugma
            ikon={<UserRound />}
            nom={menejer.length === 0 ? 'Barcha menejerlar' : menejer.length === 1 ? ism[menejer[0]!] ?? 'Menejer' : 'Menejerlar'}
            soni={menejer.length > 1 ? menejer.length : undefined}
            faol={menejer.length > 0}
            ong
          >
            {() => (
              <TanlovRoyxat
                sarlavha="Menejer"
                guruhlar={[{ tanlovlar: menejerTanlov }]}
                tanlangan={menejer}
                onOzgar={setMenejer}
                bosh="Bu davrda baholangan menejer yo'q"
              />
            )}
          </FiltrTugma>
        </div>

        {tafsilot.length === 0 ? (
          <div className="hech-narsa an-bosh-holat">
            {yuklanmoqda ? 'Tahlil tafsilotlari yuklanmoqda…' : "Bu davrda baholangan qo'ng'iroq yo'q"}
          </div>
        ) : (
          <div className="sn-ish">
            <aside className="sn-tizimlar">
              <div className="sn-tizim-royxat">
                {hisoblar.map(({ tizim, h }) => (
                  <button
                    key={tizim.kalit}
                    type="button"
                    className={`sn-tizim${faol?.tizim.kalit === tizim.kalit ? ' faol' : ''}`}
                    onClick={() => setTanlangan(tizim.kalit)}
                    aria-pressed={faol?.tizim.kalit === tizim.kalit}
                  >
                    <span className="sn-tizim-qator">
                      <b>{tizim.nom}</b>
                      <span>{h.umumiyFoiz === null ? '—' : `${Math.round(h.umumiyFoiz)}%`}</span>
                    </span>
                    <span className="sn-chiziq">
                      <span style={{ width: `${h.umumiyFoiz ?? 0}%`, background: ballRang(h.umumiyFoiz) }} />
                    </span>
                    <small className={h.zaiflar.length > 0 ? 'zaif' : ''}>
                      {h.zaiflar.length} / {h.mezonlar.length} zaif · {h.suhbat} ta qo'ng'iroq
                    </small>
                  </button>
                ))}
              </div>
              {hisoblar.some((x) => x.tizim.umumiy) && (
                <div className="sn-qoshimcha">
                  <span>Umumiy tizim bilan baholanadi</span>
                  <p>
                    {hisoblar.find((x) => x.tizim.umumiy)!.tizim.oilalar.map((k) => oilaNomi[k] ?? k).join(', ') ||
                      "Barcha qo'ng'iroq turlari"}
                  </p>
                </div>
              )}
              {baholanmaydi.length > 0 && (
                <div className="sn-qoshimcha">
                  <span>Baholanmaydi</span>
                  <p>{baholanmaydi.join(', ')}</p>
                </div>
              )}
            </aside>
            {faol && <TizimPaneli tizim={faol.tizim} h={faol.h} ism={ism} />}
          </div>
        )}
        {yuklanmoqda && tafsilot.length > 0 && (
          <div className="an-eslatma">Tahlil tafsilotlari yuklanmoqda — yana {q.tafsilotKutilmoqda} ta…</div>
        )}
      </section>

      <MenejerMatritsa tafsilot={tafsilot} ism={ism} oilaNomi={oilaNomi} />
      <TaqiqlanganXatolar tafsilot={tafsilot} ism={ism} pb={data.playbook} />

      <h2 className="sn-bolim-sarlavha">
        Baholangan qo'ng'iroqlardagi ovoz <MalumotIkon matn="Menejer va mijoz qancha gapirgani — yozilgan so'zlar soni bo'yicha" />
      </h2>
      <GaplashishNisbati tafsilot={tafsilot} ism={ism} />
    </div>
  );
}

function seatIsmlari(data: BoshMalumot): Record<string, string> {
  const m: Record<string, string> = {};
  for (const s of data.seats) m[s.id] = s.displayName;
  for (const r of data.board) m[r.seatId] ??= r.displayName;
  return m;
}

// ─── Tanlangan tizim paneli ─────────────────────────────────────────────────

function TizimPaneli({ tizim, h, ism }: { tizim: Tizim; h: ReturnType<typeof tizimHisobi>; ism: Record<string, string> }) {
  const [hammasi, setHammasi] = useState(false);
  const [mezonlar, setMezonlar] = useState(false);
  const korinadi = hammasi ? h.zaiflar : h.zaiflar.slice(0, KORINADI);

  return (
    <div className="sn-panel">
      <div className="sn-panel-bosh">
        <h3>
          {tizim.nom} <span className="sn-belgi">{tizim.umumiy ? 'umumiy' : 'maxsus'}</span>
        </h3>
        <b className="sn-katta" style={{ color: ballRang(h.umumiyFoiz) }}>
          {h.umumiyFoiz === null ? '—' : `${Math.round(h.umumiyFoiz)}%`}
        </b>
      </div>

      {h.bosqichlar.length > 0 && (
        <>
          <div className="sn-bosqich-chiziq" role="img" aria-label="Bosqichlar bo'yicha natija">
            {h.bosqichlar.map((b) => (
              <span
                key={b.kod}
                style={{ flexGrow: b.vazn, background: b.foiz === null ? 'var(--bg-sunken)' : ballRang(b.foiz) }}
                title={`${b.nom}: ${b.foiz === null ? 'baholanmagan' : `${Math.round(b.foiz)}%`} · vazni ${b.vazn}%`}
              />
            ))}
          </div>
          <ul className="sn-bosqich-legenda">
            {h.bosqichlar.map((b) => (
              <li key={b.kod}>
                <i style={{ background: b.foiz === null ? 'var(--text-muted)' : ballRang(b.foiz) }} />
                {b.nom} <b>{b.foiz === null ? '—' : `${Math.round(b.foiz)}%`}</b>
              </li>
            ))}
          </ul>
        </>
      )}

      <p className="sn-xulosa">
        {h.mezonlar.length} mezondan {h.zaiflar.length} tasi zaif bajarilmoqda.
        {h.engYoqotish && h.engYoqotish.foiz! < 100 && <> Eng ko'p yo'qotish «{h.engYoqotish.nom}» bosqichida.</>}
        {tizim.umumiy && " O'z tizimi yo'q barcha qo'ng'iroq turlariga qo'llaniladi."}
      </p>

      {h.zaiflar.length === 0 ? (
        <div className="sn-yaxshi">
          <ShieldCheck /> Zaif mezon yo'q — barcha mezonlar {ZAIF_FOIZ}% dan yuqori bajarilmoqda.
        </div>
      ) : (
        <ol className="sn-muammolar">
          {korinadi.map((m, i) => (
            <li key={m.mezon.code} className="sn-muammo">
              <div className="sn-muammo-bosh">
                <span className={`sn-raqam${i < 2 ? ' xavf' : ''}`}>{i + 1}</span>
                <b>{m.mezon.name}</b>
                <span className="sn-muammo-foiz" style={{ color: ballRang(m.foiz) }}>
                  {Math.round(m.foiz!)}%
                </span>
                <small>{m.zaifSuhbat} ta qo'ng'iroqda zaif</small>
              </div>
              {m.hozir && (
                <p className="sn-hk hozir">
                  <span className="sn-hk-ikon">
                    <X />
                  </span>
                  <b>Hozir</b>
                  <span className="sn-tire">—</span>
                  {m.hozir}
                </p>
              )}
              {m.kerak && (
                <p className="sn-hk kerak">
                  <span className="sn-hk-ikon">
                    <Check />
                  </span>
                  <b>Kerak</b>
                  <span className="sn-tire">—</span>
                  {m.kerak}
                </p>
              )}
              {m.engZaif.length > 0 && (
                <div className="sn-eng-zaif">
                  Eng zaif:
                  {m.engZaif.map((z) => (
                    <span key={z.seatId} className="sn-chip">
                      {ism[z.seatId] ?? 'Menejer'} <em>{Math.round(z.foiz)}%</em>
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="sn-panel-past">
        {h.zaiflar.length > KORINADI && (
          <button type="button" className="sn-havola" onClick={() => setHammasi((v) => !v)}>
            {hammasi ? 'Kamroq ko\'rsatish' : `Yana ${h.zaiflar.length - KORINADI} ta muammo`}
          </button>
        )}
        <button type="button" className="sn-havola ikkinchi" onClick={() => setMezonlar((v) => !v)} aria-expanded={mezonlar}>
          Barcha mezonlar ({h.mezonlar.length}) <ChevronDown className={mezonlar ? 'ochiq' : ''} />
        </button>
      </div>

      {mezonlar && (
        <div className="sn-mezonlar">
          {h.mezonlar.map((m) => (
            <div className="mezon-satr" key={m.mezon.code}>
              <span className="kod">{m.mezon.code}</span>
              <span className="nom">
                {m.mezon.name}
                <span className="mezon-ost">
                  {m.baholangan} baho{m.zaifSuhbat > 0 && ` · ${m.zaifSuhbat} zaif`}
                </span>
              </span>
              <div className="chiziq">
                <div style={{ width: `${m.foiz ?? 0}%`, background: ballRang(m.foiz) }} />
              </div>
              <span className="foiz">{m.foiz === null ? '—' : `${Math.round(m.foiz)}%`}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Menejerlar × qo'ng'iroq turlari ────────────────────────────────────────

function MenejerMatritsa({
  tafsilot,
  ism,
  oilaNomi,
}: {
  tafsilot: ConversationDetail[];
  ism: Record<string, string>;
  oilaNomi: Record<string, string>;
}) {
  const [ochiq, setOchiq] = useState(false);
  const turlar = [...new Set(tafsilot.map((d) => d.analysis?.callFamily ?? ''))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : 0));
  const seatlar = [...new Set(tafsilot.map((d) => d.conversation.seatId ?? ''))];
  const katak = (seat: string, tur: string | null) => {
    const bu = tafsilot.filter(
      (d) => (d.conversation.seatId ?? '') === seat && (tur === null || (d.analysis?.callFamily ?? '') === tur),
    );
    const b = bu.map((d) => (d.analysis?.overallScore == null ? null : Number(d.analysis.overallScore))).filter((v): v is number => v !== null);
    return { soni: bu.length, ball: ortacha(b) };
  };

  return (
    <section className="card an-karta sn-matritsa">
      <button type="button" className="sn-yigma" onClick={() => setOchiq((v) => !v)} aria-expanded={ochiq}>
        <h2>
          Menejerlar × qo'ng'iroq turlari <MalumotIkon matn="Har menejerning har qo'ng'iroq turidagi o'rtacha bahosi va qo'ng'iroqlar soni" />
        </h2>
        <span className="sn-havola">
          {ochiq ? 'Yashirish' : "Ko'rsatish"} <ChevronDown className={ochiq ? 'ochiq' : ''} />
        </span>
      </button>
      {ochiq &&
        (seatlar.length === 0 ? (
          <div className="hech-narsa an-bosh-holat">Ma'lumot yo'q</div>
        ) : (
          <div className="sn-jadval-qobiq">
            <table className="sn-jadval">
              <thead>
                <tr>
                  <th>Menejer</th>
                  {turlar.map((t) => (
                    <th key={t}>{t ? oilaNomi[t] ?? t : 'Aniqlanmagan'}</th>
                  ))}
                  <th>Jami</th>
                </tr>
              </thead>
              <tbody>
                {seatlar.map((s) => (
                  <tr key={s}>
                    <td>
                      <span className="sn-ism">
                        <span className="sn-avatar" style={{ background: avatarRang(s || '-') }}>
                          {boshHarf(ism[s] ?? '?')}
                        </span>
                        {s ? ism[s] ?? 'Menejer' : 'Biriktirilmagan'}
                      </span>
                    </td>
                    {[...turlar, null].map((t) => {
                      const k = katak(s, t);
                      return (
                        <td key={t ?? '__jami'} className={t === null ? 'jami' : ''}>
                          {k.soni === 0 ? (
                            <span className="sn-bosh-katak">—</span>
                          ) : (
                            <span className="sn-katak">
                              <span className={`ball ${ballKlass(k.ball)}`}>{k.ball === null ? '—' : `${Math.round(k.ball)}%`}</span>
                              <small>{k.soni} ta</small>
                            </span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
    </section>
  );
}

// ─── Taqiqlangan xatolar ────────────────────────────────────────────────────

function TaqiqlanganXatolar({
  tafsilot,
  ism,
  pb,
}: {
  tafsilot: ConversationDetail[];
  ism: Record<string, string>;
  pb: PlaybookBody | null;
}) {
  const buzilish = tafsilot.filter((d) => d.analysis?.compliance === 'violation');
  const ogoh = tafsilot.filter((d) => d.analysis?.compliance === 'warning').length;
  const seatbo = new Map<string, number>();
  for (const d of buzilish) seatbo.set(d.conversation.seatId ?? '', (seatbo.get(d.conversation.seatId ?? '') ?? 0) + 1);
  const qoidalar = (pb?.classificationPolicy.redFlags ?? []).filter((f) => f.severity === 'critical').map((f) => f.description);
  const izoh =
    'AI qoidabuzarlik deb belgilagan qo\'ng\'iroqlar' + (qoidalar.length ? `. Taqiqlangan: ${qoidalar.join('; ')}` : '');

  return (
    <div className={`sn-taqiq${buzilish.length > 0 ? ' bor' : ''}`} role={buzilish.length > 0 ? 'alert' : undefined}>
      {buzilish.length > 0 ? <TriangleAlert className="sn-taqiq-ikon" /> : <ShieldCheck className="sn-taqiq-ikon" />}
      <b>
        Taqiqlangan xatolar <MalumotIkon matn={izoh} />
      </b>
      <span className="sn-taqiq-matn">
        {buzilish.length > 0
          ? `${tafsilot.length} ta qo'ng'iroqdan ${buzilish.length} tasida`
          : `${tafsilot.length} ta qo'ng'iroqda topilmadi`}
        {ogoh > 0 && ` · ${ogoh} ta ogohlantirish`}
      </span>
      {[...seatbo.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([s, n]) => (
          <Link key={s} className="sn-chip" to={`/qongiroqlar${s ? `?menejer=${s}` : ''}`}>
            {s ? ism[s] ?? 'Menejer' : 'Biriktirilmagan'} <em>{n}</em>
          </Link>
        ))}
    </div>
  );
}

// ─── Gaplashish nisbatlari ──────────────────────────────────────────────────

function GaplashishNisbati({ tafsilot, ism }: { tafsilot: ConversationDetail[]; ism: Record<string, string> }) {
  const qatorlar = useMemo(() => {
    const m = new Map<string, { menejer: number; mijoz: number; suhbat: number }>();
    for (const d of tafsilot) {
      const seat = d.conversation.seatId;
      if (!seat) continue;
      let men = 0;
      let mij = 0;
      for (const s of d.segments) {
        if (s.speaker === 'manager') men += sozlar(s.text);
        else if (s.speaker === 'client') mij += sozlar(s.text);
      }
      if (men + mij === 0) continue;
      const x = m.get(seat) ?? { menejer: 0, mijoz: 0, suhbat: 0 };
      m.set(seat, { menejer: x.menejer + men, mijoz: x.mijoz + mij, suhbat: x.suhbat + 1 });
    }
    return [...m.entries()]
      .map(([seat, x]) => {
        const f = (x.menejer / (x.menejer + x.mijoz)) * 100;
        return { seat, menejer: Math.round(f), mijoz: 100 - Math.round(f), suhbat: x.suhbat };
      })
      .sort((a, b) => Math.abs(b.menejer - 45) - Math.abs(a.menejer - 45));
  }, [tafsilot]);
  const tashqari = qatorlar.filter((q) => q.menejer < ZONA.min || q.menejer > ZONA.max).length;

  return (
    <section className="card an-karta">
      <div className="karta-bosh">
        <h2>
          Gaplashish nisbatlari{' '}
          <MalumotIkon matn="Menejer ko'p gapirsa — mijozni eshitmaydi; kam gapirsa — suhbatni boshqarmaydi" />
        </h2>
      </div>
      {qatorlar.length === 0 ? (
        <div className="hech-narsa an-bosh-holat">Matni bor baholangan qo'ng'iroq yo'q</div>
      ) : (
        <>
          <p className="sn-izoh">
            Muvozanat zonasidan tashqarida: <b>{tashqari}</b>. Muvozanat zonasi — menejer vaqtning {ZONA.min}–{ZONA.max}% ini
            gapiradi.
          </p>
          <ul className="sn-ovoz">
            {qatorlar.map((q) => {
              const holat = q.menejer > ZONA.max ? 'kop' : q.menejer < ZONA.min ? 'kam' : 'ok';
              return (
                <li key={q.seat}>
                  <div className="sn-ovoz-kim">
                    <span className="sn-ism">
                      <span className="sn-avatar katta" style={{ background: avatarRang(q.seat) }}>
                        {boshHarf(ism[q.seat])}
                      </span>
                      <span>
                        <b>{ism[q.seat] ?? 'Menejer'}</b>
                        <small className={`sn-ovoz-holat ${holat}`}>
                          {holat === 'kop' ? "menejer juda ko'p gapiradi" : holat === 'kam' ? 'menejer juda kam gapiradi' : 'muvozanatda'}
                        </small>
                      </span>
                    </span>
                  </div>
                  <div className="sn-ovoz-olchov">
                    <div
                      className="sn-ovoz-chiziq"
                      role="img"
                      aria-label={`Menejer ${q.menejer}%, mijoz ${q.mijoz}%`}
                      title={`${q.suhbat} ta qo'ng'iroq bo'yicha`}
                    >
                      <span className="sn-zona" style={{ left: `${ZONA.min}%`, width: `${ZONA.max - ZONA.min}%` }} />
                      <span className={`sn-ovoz-tola ${holat}`} style={{ width: `${q.menejer}%` }} />
                    </div>
                    <div className="sn-ovoz-yorliq">
                      <span>Menejer gapirish {q.menejer}%</span>
                      <span>Mijoz gapirish {q.mijoz}%</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
