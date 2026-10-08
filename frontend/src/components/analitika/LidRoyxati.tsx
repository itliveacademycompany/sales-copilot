import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, CalendarDays, CircleDot, ExternalLink, Filter, Layers, UserRound } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { lidTuri, type ConversationDetail, type ConversationRow, type LidTuri } from '../../api';
import { oraliqda, type BoshMalumot, type Davr } from '../bosh/malumot';
import { FiltrTugma, SanaTanlagich, TanlovRoyxat, sanaMatn, type SanaTuri, type Tanlov } from '../qongiroq/Filtrlar';
import type { Qoshimcha } from './Tablar';

/**
 * Lid analitikasidan ochiladigan lidlar ro'yxati (drill-down).
 *
 * Lid = tahlil qilingan suhbat. CRM (voronka, AmoCRM havolasi) backendda
 * yo'q — o'rniga xizmat yo'nalishi va AI aniqlagan bitim bosqichi, oxirgi
 * ustunda esa suhbatning o'ziga havola. Qator bosilsa lid tafsilotlari.
 */

export type LidFiltr = 'hammasi' | 'hot' | 'cold' | 'warm' | 'faol';
const SIFAT: Record<LidTuri | 'yoq', { nom: string; klass: string }> = {
  hot: { nom: 'Issiq', klass: 'yuqori' },
  warm: { nom: 'Iliq', klass: 'orta' },
  cold: { nom: 'Sovuq', klass: 'past' },
  yoq: { nom: 'Baholanmagan', klass: 'neytral' },
};
const SAHIFA = 50;
type Ustun = 'lid' | 'qiymat' | 'menejer' | 'xizmat' | 'bosqich' | 'holat' | 'sana';

interface Lid {
  r: ConversationRow;
  d: ConversationDetail;
  nom: string;
  qiymat: number;
  valyuta: string;
  menejer: string;
  xizmat: string;
  bosqich: string;
  sifat: LidTuri | 'yoq';
  faol: boolean;
  sana: number;
}

const sanaMatnQisqa = (t: number) => {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

export function LidRoyxati({
  data,
  davr,
  q,
  boshFiltr,
  onOrqaga,
}: {
  data: BoshMalumot;
  davr: Davr;
  q: Qoshimcha;
  boshFiltr: LidFiltr;
  onOrqaga: () => void;
}) {
  const navigate = useNavigate();
  const [sifat, setSifat] = useState<string[]>(boshFiltr === 'hot' || boshFiltr === 'cold' || boshFiltr === 'warm' ? [boshFiltr] : boshFiltr === 'faol' ? ['faol'] : []);
  const [xizmat, setXizmat] = useState<string[]>([]);
  const [bosqich, setBosqich] = useState<string[]>([]);
  const [menejer, setMenejer] = useState<string[]>([]);
  const [sana, setSana] = useState<{ turi: SanaTuri; from: Date; to: Date } | null>(null);
  const [saralash, setSaralash] = useState<{ u: Ustun; yon: 1 | -1 }>({ u: 'sana', yon: -1 });
  const [sahifa, setSahifa] = useState(1);
  const tepa = useRef<HTMLDivElement>(null);

  const ism = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of data.seats) m.set(s.id, s.displayName);
    for (const r of data.board) if (!m.has(r.seatId)) m.set(r.seatId, r.displayName);
    return m;
  }, [data.seats, data.board]);

  const lidlar = useMemo<Lid[]>(
    () =>
      oraliqda(data.suhbatlar, davr.from, davr.to)
        .filter((r) => r.status === 'done' && q.tafsilot[r.id]?.analysis)
        .map((r) => {
          const d = q.tafsilot[r.id]!;
          const a = d.analysis!;
          const c = d.conversation;
          return {
            r,
            d,
            nom: a.clientExtracted?.name ?? d.contact?.name ?? (c.direction === 'outbound' ? c.phoneTo : c.phoneFrom) ?? `Suhbat #${r.id.slice(0, 8)}`,
            qiymat: a.deal?.amount ?? 0,
            valyuta: (a.deal?.currency ?? "so'm").toUpperCase() === "SO'M" ? "so'm" : (a.deal?.currency ?? "so'm"),
            menejer: r.seatId ? ism.get(r.seatId) ?? 'Menejer' : 'Biriktirilmagan',
            xizmat: a.serviceLine ?? '',
            bosqich: a.deal?.stage ?? '',
            sifat: lidTuri(a.leadQuality ?? r.leadQuality) ?? 'yoq',
            faol: d.commitments.some((k) => k.byParty === 'manager' && k.status === 'pending'),
            sana: new Date(r.startedAt).getTime(),
          };
        }),
    [data.suhbatlar, davr, q.tafsilot, ism],
  );

  const sifatlar = sifat.filter((s) => s !== 'faol');
  const faqatFaol = sifat.includes('faol');
  const royxat = useMemo(() => {
    const t = lidlar.filter(
      (l) =>
        (sifatlar.length === 0 || sifatlar.includes(l.sifat)) &&
        (!faqatFaol || l.faol) &&
        (xizmat.length === 0 || xizmat.includes(l.xizmat)) &&
        (bosqich.length === 0 || bosqich.includes(l.bosqich)) &&
        (menejer.length === 0 || menejer.includes(l.r.seatId ?? '')) &&
        (!sana || (l.sana >= sana.from.getTime() && l.sana < sana.to.getTime())),
    );
    const tartib: Record<string, number> = { hot: 0, warm: 1, cold: 2, yoq: 3 };
    const qiymat = (l: Lid): string | number =>
      saralash.u === 'lid' ? l.nom.toLowerCase()
      : saralash.u === 'qiymat' ? l.qiymat
      : saralash.u === 'menejer' ? l.menejer.toLowerCase()
      : saralash.u === 'xizmat' ? l.xizmat.toLowerCase()
      : saralash.u === 'bosqich' ? l.bosqich.toLowerCase()
      : saralash.u === 'holat' ? tartib[l.sifat]!
      : l.sana;
    return t.sort((a, b) => {
      const x = qiymat(a);
      const y = qiymat(b);
      return (x < y ? -1 : x > y ? 1 : 0) * saralash.yon;
    });
  }, [lidlar, sifatlar.join(), faqatFaol, xizmat, bosqich, menejer, sana, saralash]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => setSahifa(1), [sifat, xizmat, bosqich, menejer, sana, saralash]);
  const sahifalar = Math.max(1, Math.ceil(royxat.length / SAHIFA));
  const korinadi = royxat.slice((sahifa - 1) * SAHIFA, sahifa * SAHIFA);
  const otish = (n: number) => {
    setSahifa(n);
    tepa.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const sana_ = (f: (l: Lid) => boolean) => lidlar.filter(f).length;
  const unikal = (k: 'xizmat' | 'bosqich') => [...new Set(lidlar.map((l) => l[k]))].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  const sifatTanlov: Tanlov[] = (['hot', 'warm', 'cold', 'yoq'] as const).map((s) => ({ qiymat: s, nom: SIFAT[s].nom, soni: sana_((l) => l.sifat === s) }));
  const xizmatTanlov: Tanlov[] = unikal('xizmat').map((x) => ({ qiymat: x, nom: x || 'Aniqlanmagan', soni: sana_((l) => l.xizmat === x) }));
  const bosqichTanlov: Tanlov[] = unikal('bosqich').map((x) => ({ qiymat: x, nom: x || 'Aniqlanmagan', soni: sana_((l) => l.bosqich === x) }));
  const menejerTanlov: Tanlov[] = [...new Set(lidlar.map((l) => l.r.seatId ?? ''))].map((s) => ({
    qiymat: s,
    nom: s ? ism.get(s) ?? 'Menejer' : 'Biriktirilmagan',
    soni: sana_((l) => (l.r.seatId ?? '') === s),
  }));

  const sarlavha = (u: Ustun, nom: string, oxiri = false) => {
    const faol = saralash.u === u;
    const Ikon = !faol ? ArrowUpDown : saralash.yon === 1 ? ArrowUp : ArrowDown;
    return (
      <th aria-sort={faol ? (saralash.yon === 1 ? 'ascending' : 'descending') : 'none'} className={oxiri ? 'lr-oxiri' : ''}>
        <button type="button" className={`lr-sarlavha${faol ? ' faol' : ''}`} onClick={() => setSaralash({ u, yon: faol ? (saralash.yon === 1 ? -1 : 1) : u === 'sana' || u === 'qiymat' ? -1 : 1 })}>
          {nom} <Ikon />
        </button>
      </th>
    );
  };

  const birinchi = royxat.length ? (sahifa - 1) * SAHIFA + 1 : 0;
  const oxirgi = Math.min(sahifa * SAHIFA, royxat.length);

  return (
    <div className="lr" ref={tepa}>
      <button type="button" className="lr-orqaga" onClick={onOrqaga}>
        <ArrowLeft /> Orqaga
      </button>

      <div className="lr-filtrlar">
        <FiltrTugma ikon={<Filter />} nom="Holat" soni={sifat.length || undefined} faol={sifat.length > 0}>
          {() => (
            <TanlovRoyxat
              sarlavha="Holat"
              guruhlar={[
                { nom: 'Lid sifati', tanlovlar: sifatTanlov },
                { nom: 'Keyingi qadam', tanlovlar: [{ qiymat: 'faol', nom: 'Faol (kelishilgan qadam bor)', soni: sana_((l) => l.faol) }] },
              ]}
              tanlangan={sifat}
              onOzgar={setSifat}
            />
          )}
        </FiltrTugma>
        <FiltrTugma ikon={<Layers />} nom="Xizmat yo'nalishi" soni={xizmat.length || undefined} faol={xizmat.length > 0}>
          {() => <TanlovRoyxat sarlavha="Xizmat yo'nalishi" guruhlar={[{ tanlovlar: xizmatTanlov }]} tanlangan={xizmat} onOzgar={setXizmat} />}
        </FiltrTugma>
        <FiltrTugma ikon={<CircleDot />} nom="Bosqich" soni={bosqich.length || undefined} faol={bosqich.length > 0}>
          {() => <TanlovRoyxat sarlavha="Bitim bosqichi" guruhlar={[{ tanlovlar: bosqichTanlov }]} tanlangan={bosqich} onOzgar={setBosqich} />}
        </FiltrTugma>
        <FiltrTugma ikon={<UserRound />} nom="Menejer" soni={menejer.length || undefined} faol={menejer.length > 0}>
          {() => <TanlovRoyxat sarlavha="Menejer" guruhlar={[{ tanlovlar: menejerTanlov }]} tanlangan={menejer} onOzgar={setMenejer} />}
        </FiltrTugma>
        <FiltrTugma ikon={<CalendarDays />} nom="Sana" qiymat={sanaMatn(sana?.from ?? davr.from, sana?.to ?? davr.to)} faol={!!sana}>
          {(yop) => (
            <SanaTanlagich
              turi={sana?.turi ?? 'maxsus'}
              from={sana?.from ?? davr.from}
              to={sana?.to ?? davr.to}
              onTanla={(turi, from, to) => {
                setSana({ turi, from, to });
                yop();
              }}
            />
          )}
        </FiltrTugma>
        <span className="lr-jami">
          Jami <b>{royxat.length}</b>
        </span>
      </div>

      {q.tafsilotKutilmoqda > 0 && <div className="an-eslatma">Tahlil tafsilotlari yuklanmoqda — yana {q.tafsilotKutilmoqda} ta…</div>}

      <section className="card lr-karta">
        {royxat.length === 0 ? (
          <div className="vr-bosh-holat">
            <b>Filtrga mos lid yo'q</b>
            <span>Filtrlarni o'zgartiring yoki davrni kengaytiring.</span>
          </div>
        ) : (
          <div className="vr-jadval-qobiq">
            <table className="lr-jadval">
              <thead>
                <tr>
                  {sarlavha('lid', 'Lid')}
                  {sarlavha('qiymat', 'Lid qiymati')}
                  {sarlavha('menejer', 'Menejer')}
                  {sarlavha('xizmat', "Xizmat yo'nalishi")}
                  {sarlavha('bosqich', 'Bosqich')}
                  {sarlavha('holat', 'Holat')}
                  {sarlavha('sana', 'Sana')}
                  <th className="lr-oxiri">Suhbat</th>
                </tr>
              </thead>
              <tbody>
                {korinadi.map((l) => (
                  <tr
                    key={l.r.id}
                    tabIndex={0}
                    onClick={() => navigate(`/lidlar/${l.r.id}`)}
                    onKeyDown={(e) => e.key === 'Enter' && navigate(`/lidlar/${l.r.id}`)}
                    aria-label={`${l.nom} — lid tafsilotlari`}
                  >
                    <td className="lr-nom" title={l.nom}>
                      {l.nom}
                    </td>
                    <td className="lr-son">{l.qiymat ? `${Math.round(l.qiymat).toLocaleString('uz').replace(/,/g, ' ')} ${l.valyuta}` : `0 ${l.valyuta}`}</td>
                    <td className="lr-xira">{l.menejer}</td>
                    <td className="lr-xira">{l.xizmat || '—'}</td>
                    <td className="lr-bosqich" title={l.bosqich}>
                      {l.bosqich || <span className="lr-xira">—</span>}
                    </td>
                    <td>
                      <span className="lr-holatlar">
                        <span className={`lr-holat ${SIFAT[l.sifat].klass}`}>{SIFAT[l.sifat].nom}</span>
                        {l.faol && <span className="lr-holat faol">Faol</span>}
                      </span>
                    </td>
                    <td className="lr-xira lr-son">{sanaMatnQisqa(l.sana)}</td>
                    <td className="lr-oxiri">
                      <Link to={`/suhbatlar/${l.r.id}`} className="lr-havola" onClick={(e) => e.stopPropagation()}>
                        Suhbat <ExternalLink />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {royxat.length > 0 && (
          <div className="lr-past">
            <span>
              {birinchi} – {oxirgi} dan {royxat.length}
            </span>
            <div className="lr-sahifa">
              <button type="button" className="btn ikkinchi kichik" disabled={sahifa === 1} onClick={() => otish(sahifa - 1)}>
                Oldingi
              </button>
              <span>
                {sahifa} / {sahifalar}
              </span>
              <button type="button" className="btn ikkinchi kichik" disabled={sahifa === sahifalar} onClick={() => otish(sahifa + 1)}>
                Keyingi
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
