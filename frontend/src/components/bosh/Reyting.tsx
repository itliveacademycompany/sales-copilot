import { Award, ChevronRight, Flame, Trophy } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { fmtSoniya } from '../../api';
import { useT } from '../../i18n';
import { MalumotIkon } from './Korsatkichlar';
import {
  avatarRang,
  boshHarf,
  davomiylik,
  davomiylikMatn,
  foiz,
  lidHisobi,
  oraliqda,
  ortacha,
  otganOy,
  type BoshMalumot,
  type Davr,
} from './malumot';

type Rejim = 'sifat' | 'natija';

/**
 * Menejerlar reytingi. "Natija" rejimi issiq lidlar bo'yicha — backend
 * yopilgan bitimlarni bermaydi, shuning uchun bitim soni o'ylab
 * topilmaydi; sotuvga eng yaqin haqiqiy ko'rsatkich ishlatiladi.
 */
export function Reyting({ data, davr }: { data: BoshMalumot; davr: Davr }) {
  const t = useT();
  const [rejim, setRejim] = useState<Rejim>('sifat');
  const joriy = oraliqda(data.suhbatlar, davr.from, davr.to).filter((r) => r.status === 'done');

  const kartalar = data.board.map((r) => {
    const uniki = joriy.filter((c) => c.seatId === r.seatId);
    const lid = lidHisobi(uniki);
    return {
      ...r,
      issiq: lid.hot,
      ulush: foiz(lid.hot, uniki.length),
      davom: ortacha(uniki.map(davomiylik).filter((v): v is number => v !== null)),
      javobsiz: data.javobsizSeat[r.seatId] ?? null,
    };
  });
  kartalar.sort((a, b) =>
    rejim === 'sifat' ? (b.avgScore ?? -1) - (a.avgScore ?? -1) : b.issiq - a.issiq || (b.avgScore ?? 0) - (a.avgScore ?? 0),
  );
  const maxIssiq = Math.max(1, ...kartalar.map((k) => k.issiq));
  const jamiIssiq = kartalar.reduce((s, k) => s + k.issiq, 0);

  // ─── O'tgan oy mukofotlari ───
  const oy = otganOy();
  const oyRows = oraliqda(data.suhbatlar, oy.from, oy.to).filter((r) => r.status === 'done');
  const nomlar = new Map([
    ...data.seats.map((s) => [s.id, s.displayName] as const),
    ...data.boardOtganOy.map((r) => [r.seatId, r.displayName] as const),
  ]);
  const sifatlilar = data.boardOtganOy.filter((r) => r.avgScore !== null);
  const yetarli = sifatlilar.filter((r) => r.analyzed >= 3);
  const engSifatli = (yetarli.length ? yetarli : sifatlilar).sort((a, b) => (b.avgScore ?? 0) - (a.avgScore ?? 0))[0];
  const issiqSeat = new Map<string, number>();
  for (const r of oyRows) {
    if (r.seatId && lidHisobi([r]).hot) issiqSeat.set(r.seatId, (issiqSeat.get(r.seatId) ?? 0) + 1);
  }
  const engSotuvchi = [...issiqSeat.entries()].sort((a, b) => b[1] - a[1])[0];

  return (
    <section className="reyting-bolim" aria-labelledby="reyting-sarlavha">
      <div className="reyting-grid">
        <div className="reyting-chap">
          <h2 id="reyting-sarlavha">
            {t('Menejerlar reytingi')} <MalumotIkon matn={t("Tanlangan davr bo'yicha. Ma'lumot har yuklashda yangilanadi.")} />
          </h2>
          <p>
            {rejim === 'sifat'
              ? t("Suhbat sifati — baholash mezonlari bo'yicha o'rtacha ball.")
              : t("Natija — AI issiq deb baholagan lidlar soni bo'yicha.")}
          </p>
          <div className="tab-qator" role="tablist" aria-label={t('Reyting turi')}>
            <button role="tab" aria-selected={rejim === 'sifat'} className={`tab${rejim === 'sifat' ? ' active' : ''}`} onClick={() => setRejim('sifat')}>
              {t('Sifat')}
            </button>
            <button role="tab" aria-selected={rejim === 'natija'} className={`tab${rejim === 'natija' ? ' active' : ''}`} onClick={() => setRejim('natija')}>
              {t('Natija')}
            </button>
          </div>
          <div className="reyting-jami">
            <span>{rejim === 'sifat' ? t("Jamoa o'rtachasi") : t('Jami issiq lidlar')}</span>
            <b>
              <span className="reyting-jami-ikon" aria-hidden="true">
                {rejim === 'sifat' ? <Award /> : <Flame />}
              </span>
              {rejim === 'sifat'
                ? data.kpi.current.avgScore === null
                  ? '—'
                  : `${data.kpi.current.avgScore}%`
                : jamiIssiq}
            </b>
          </div>
          <Link to="/analitika" className="havola">
            {t("Ko'rish")} <ChevronRight />
          </Link>
        </div>

        <div className="reyting-kartalar">
          {kartalar.length === 0 ? (
            <div className="card hech-narsa">{t("Bu davrda menejerlar faoliyati yo'q")}</div>
          ) : (
            kartalar.map((k, i) => (
              <article className="card menejer-karta" key={k.seatId}>
                <header>
                  <span className="mk-avatar" style={{ background: avatarRang(k.displayName) }} aria-hidden="true">
                    {boshHarf(k.displayName)}
                  </span>
                  <span className="mk-nom">
                    <Link to={`/sotuvchi/${k.seatId}`}>
                      <b>{k.displayName}</b>
                    </Link>
                    <small>
                      {t('Menejer')}
                      {i < 3 && (
                        <span className={`mk-orin o${i + 1}`} title={t("{n}-o'rin", { n: i + 1 })}>
                          <Trophy /> {i + 1}
                        </span>
                      )}
                    </small>
                  </span>
                </header>

                <div className="mk-statlar">
                  <div>
                    <span>{t('Issiq lidlar')}</span>
                    <b>{k.issiq}</b>
                  </div>
                  <div>
                    <span>{t('Issiq ulushi')}</span>
                    <b>{k.ulush === null ? '—' : `${k.ulush.toFixed(1)}%`}</b>
                  </div>
                  <div>
                    <span>{t('Baholangan')}</span>
                    <b>{k.analyzed}</b>
                  </div>
                </div>

                <div className="mk-blok">
                  <div className="mk-blok-bosh">
                    <span>
                      {t('Suhbat sifati')} <MalumotIkon matn={t("Baholash mezonlari bo'yicha o'rtacha ball")} />
                    </span>
                    <span className="mk-chip">{k.avgScore === null ? '—' : `${k.avgScore}%`}</span>
                  </div>
                  <div className="mk-chiziq">
                    <div style={{ width: `${k.avgScore ?? 0}%` }} className="sifat-rang" />
                  </div>
                </div>

                {rejim === 'natija' ? (
                  <div className="mk-blok">
                    <div className="mk-blok-bosh">
                      <span>{t('Issiq lidlar')}</span>
                      <span className="mk-chip">{k.issiq}</span>
                    </div>
                    <div className="mk-chiziq">
                      <div style={{ width: `${(k.issiq / maxIssiq) * 100}%` }} className="natija-rang" />
                    </div>
                  </div>
                ) : (
                  <div className="mk-blok">
                    <div className="mk-blok-bosh">
                      <span>
                        {t('Javobsiz mijozlar')} <MalumotIkon matn={t('Mijoz yozgan, lekin javob olmagan sessiyalar')} />
                      </span>
                      <span className={`mk-chip${k.javobsiz ? ' xavf' : ''}`}>{k.javobsiz ?? '—'}</span>
                    </div>
                    <div className="mk-chiziq">
                      <div
                        style={{ width: `${k.analyzed > 0 && k.javobsiz ? (k.javobsiz / k.analyzed) * 100 : 0}%` }}
                        className="xavf-rang"
                      />
                    </div>
                  </div>
                )}

                <footer>
                  <span>{t('Javob tezligi')}</span>
                  <b>{fmtSoniya(k.medianFirstResponseSeconds)}</b>
                </footer>
                <footer>
                  <span>{t("O'rt. davomiylik")}</span>
                  <b>{davomiylikMatn(k.davom)}</b>
                </footer>
              </article>
            ))
          )}
        </div>
      </div>

      <div className="mukofotlar">
        <div className="card mukofot sifatli">
          <span className="mukofot-ikon" aria-hidden="true">
            <Award />
          </span>
          <div>
            <small>{t("O'tgan oyning ({oy}) eng sifatli suhbatdoshi", { oy: oy.nom })}</small>
            {engSifatli ? (
              <>
                <b>{engSifatli.displayName}</b>
                <span className="mukofot-chiplar">
                  <span className="mk-chip">{engSifatli.avgScore}%</span>
                  <span className="mk-chip kichik">{t('{n} suhbat', { n: engSifatli.analyzed })}</span>
                </span>
              </>
            ) : (
              <b className="bosh-matn">{t("O'tgan oyda baholangan suhbat yo'q")}</b>
            )}
          </div>
        </div>
        <div className="card mukofot sotuvchi">
          <span className="mukofot-ikon" aria-hidden="true">
            <Trophy />
          </span>
          <div>
            <small>{t("O'tgan oyning ({oy}) eng ko'p issiq lid olgan sotuvchisi", { oy: oy.nom })}</small>
            {engSotuvchi ? (
              <>
                <b>{nomlar.get(engSotuvchi[0]) ?? t('Sotuvchi')}</b>
                <span className="mukofot-chiplar">
                  <span className="mk-chip">{t('{n} issiq lid', { n: engSotuvchi[1] })}</span>
                </span>
              </>
            ) : (
              <b className="bosh-matn">{t("O'tgan oyda issiq lid yo'q")}</b>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
