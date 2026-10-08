import { ChartNoAxesColumnIncreasing } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ConversationRow } from '../../api';
import { Farq } from './Korsatkichlar';
import { avatarRang, ball, boshHarf, oraliqda, ortacha, type BoshMalumot, type Davr } from './malumot';

/**
 * MENEJERLAR · KUNLAR — issiqlik xaritasi.
 *
 * Har katak: shu menejerning shu kundagi baholangan suhbatlari o'rtacha
 * bali. 3 tadan kam suhbat bo'lsa katak xira — kichik tanlovdan xulosa
 * qilmaslik uchun ogohlantirish. 35 kundan uzun davr haftalarga bo'linadi,
 * aks holda katak juda tor bo'lib o'qib bo'lmaydi.
 */

const KUN = 86400_000;
type Saralash = 'past' | 'pasaygan' | 'hajm';

interface Ustun {
  from: number;
  to: number;
  nom: string;
}

function ustunlar(davr: Davr): Ustun[] {
  const bosh = new Date(davr.from);
  bosh.setHours(0, 0, 0, 0);
  const kunlar = Math.max(1, Math.ceil((davr.to.getTime() - bosh.getTime()) / KUN));
  const qadam = kunlar > 35 ? 7 : 1;
  const natija: Ustun[] = [];
  for (let t = bosh.getTime(); t < davr.to.getTime(); t += qadam * KUN) {
    const d = new Date(t);
    natija.push({ from: t, to: t + qadam * KUN, nom: `${d.getDate()}/${d.getMonth() + 1}` });
  }
  return natija;
}

function daraja(v: number): number {
  if (v < 40) return 1;
  if (v < 55) return 2;
  if (v < 70) return 3;
  if (v < 85) return 4;
  return 5;
}

function kataklar(rows: ConversationRow[], cols: Ustun[]) {
  return cols.map((u) => {
    const ichida = rows.filter((r) => {
      const t = new Date(r.startedAt).getTime();
      return t >= u.from && t < u.to;
    });
    const ballar = ichida.map(ball).filter((v): v is number => v !== null);
    return { soni: ballar.length, ort: ortacha(ballar) };
  });
}

export function Issiqlik({ data, davr }: { data: BoshMalumot; davr: Davr }) {
  const [saralash, setSaralash] = useState<Saralash>('past');
  const cols = useMemo(() => ustunlar(davr), [davr]);
  const joriy = useMemo(
    () => oraliqda(data.suhbatlar, davr.from, davr.to).filter((r) => r.status === 'done'),
    [data.suhbatlar, davr],
  );

  const oldin = new Map(data.boardOldin.map((r) => [r.seatId, r.avgScore]));
  const qatorlar = data.board.map((r) => ({
    ...r,
    kataklar: kataklar(
      joriy.filter((c) => c.seatId === r.seatId),
      cols,
    ),
    farq:
      r.avgScore !== null && oldin.get(r.seatId) !== undefined && oldin.get(r.seatId) !== null
        ? r.avgScore - (oldin.get(r.seatId) as number)
        : null,
  }));

  qatorlar.sort((a, b) => {
    if (saralash === 'hajm') return b.analyzed - a.analyzed;
    if (saralash === 'pasaygan') return (a.farq ?? 0) - (b.farq ?? 0);
    return (a.avgScore ?? 101) - (b.avgScore ?? 101);
  });

  const jamoa = kataklar(joriy, cols);
  const c = data.kpi.current;
  const p = data.kpi.previous;
  const belgiOraliq = Math.max(1, Math.ceil(cols.length / 11));

  const katakJsx = (k: { soni: number; ort: number | null }, i: number, kim: string) =>
    k.ort === null ? (
      <span key={i} className="iss-katak bosh" title={`${cols[i]!.nom} · suhbat yo'q`}>
        –
      </span>
    ) : (
      <span
        key={i}
        className={`iss-katak d${daraja(k.ort)}${k.soni < 3 ? ' kam' : ''}`}
        title={`${kim} · ${cols[i]!.nom}: ${Math.round(k.ort)}% (${k.soni} ta suhbat)`}
      />
    );

  return (
    <section className="card issiqlik" aria-labelledby="iss-sarlavha">
      <div className="karta-bosh">
        <h2 id="iss-sarlavha" className="kichik-sarlavha">Menejerlar · kunlar</h2>
        <div className="iss-saralash" role="group" aria-label="Saralash">
          <span>Saralash</span>
          {(
            [
              ['past', 'Past'],
              ['pasaygan', 'Pasaygan'],
              ['hajm', 'Hajm'],
            ] as const
          ).map(([k, nom]) => (
            <button
              key={k}
              type="button"
              className={`chip-tugma${saralash === k ? ' faol' : ''}`}
              aria-pressed={saralash === k}
              onClick={() => setSaralash(k)}
            >
              {nom}
            </button>
          ))}
        </div>
      </div>

      {data.board.length === 0 ? (
        <div className="hech-narsa">Bu davrda baholangan suhbat yo'q</div>
      ) : (
        <div className="iss-aylana">
          <div className="iss-jadval" style={{ ['--ustun' as string]: cols.length }}>
            <div className="iss-qator iss-bosh">
              <span />
              <div className="iss-kataklar">
                {cols.map((u, i) => (
                  <span key={u.from} className="iss-sana">
                    {i % belgiOraliq === 0 ? u.nom : ''}
                  </span>
                ))}
              </div>
              <span className="iss-davr">Davr</span>
            </div>

            <div className="iss-qator iss-jamoa">
              <span className="iss-kim">
                <span className="iss-avatar jamoa" aria-hidden="true">
                  <ChartNoAxesColumnIncreasing />
                </span>
                <b>Butun jamoa</b>
              </span>
              <div className="iss-kataklar">{jamoa.map((k, i) => katakJsx(k, i, 'Butun jamoa'))}</div>
              <span className="iss-davr">
                <b>{c.avgScore === null ? '—' : `${c.avgScore}%`}</b>
                <Farq d={c.avgScore !== null && p.avgScore !== null ? c.avgScore - p.avgScore : null} birlik="%" />
              </span>
            </div>

            {qatorlar.map((r) => (
              <div className="iss-qator" key={r.seatId}>
                <span className="iss-kim">
                  <span className="iss-avatar" style={{ background: avatarRang(r.displayName) }} aria-hidden="true">
                    {boshHarf(r.displayName)}
                  </span>
                  <span>
                    <Link to={`/sotuvchi/${r.seatId}`}>
                      <b>{r.displayName}</b>
                    </Link>
                    <small>
                      {r.analyzed} suhbat
                      {data.javobsizSeat[r.seatId] !== undefined && ` · ${data.javobsizSeat[r.seatId]} javobsiz`}
                    </small>
                  </span>
                </span>
                <div className="iss-kataklar">{r.kataklar.map((k, i) => katakJsx(k, i, r.displayName))}</div>
                <span className="iss-davr">
                  <b>{r.avgScore === null ? '—' : `${r.avgScore}%`}</b>
                  <Farq d={r.farq} birlik="%" />
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="iss-izoh">
        <span>Past</span>
        {[1, 2, 3, 4, 5].map((d) => (
          <span key={d} className={`iss-katak kichik d${d}`} aria-hidden="true" />
        ))}
        <span>Yuqori</span>
        <span className="iss-izoh-ajrat">
          <span className="iss-katak kichik bosh">–</span> Suhbat bo'lmagan
        </span>
        <span className="iss-izoh-ajrat">
          <span className="iss-katak kichik d4 kam" aria-hidden="true" /> 3 tadan kam suhbat
        </span>
      </div>
    </section>
  );
}
