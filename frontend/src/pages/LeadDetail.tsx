import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  api,
  ballKlass,
  ballRang,
  fmtPul,
  fmtSana,
  fmtSoniya,
  type LidTafsilot,
} from '../api';
import { useAuth } from '../auth';
import { BoshQator } from '../components/Charts';
import { HOLAT_NOMI, HOLAT_SINF } from './Leads';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID TAFSILOTI — "bu mijoz nega qo'lda qolmadi"
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Bu yerda hech narsa qaytadan o'ylab topilmaydi: har bir suhbat allaqachon
 * baholangan va uning e'tirozlari, zaif joylari, kouching izohlari
 * saqlangan. Sahifa ularni LID bo'yicha birlashtiradi — ya'ni yangi
 * ma'lumot emas, mavjudini to'g'ri ko'rsatish.
 */

const TREND_NOMI: Record<string, string> = {
  osish: "O'sish",
  pasayish: 'Pasayish',
  barqaror: 'Barqaror',
};
const TREND_RANG: Record<string, string> = {
  osish: 'var(--yuqori)',
  pasayish: 'var(--past)',
  barqaror: 'var(--text-secondary)',
};
const SHOSHILINCH: Record<string, string> = {
  high: 'Yuqori',
  medium: "O'rtacha",
  low: 'Past',
};

/** Signal kartasi — bitta o'lchov, katta raqam. */
function Signal({ ikon, nom, qiymat, rang }: { ikon: string; nom: string; qiymat: string; rang?: string }) {
  return (
    <div className="signal-karta">
      <span className="ikon" aria-hidden="true">
        {ikon}
      </span>
      <div>
        <div className="nom">{nom}</div>
        <div className="qiymat" style={rang ? { color: rang } : undefined}>
          {qiymat}
        </div>
      </div>
    </div>
  );
}

/** BANT bandi — dalil bo'lmasa "aniqlanmadi" deb ochiq yoziladi. */
function Bant({ ikon, nom, qiymat }: { ikon: string; nom: string; qiymat: string | null }) {
  return (
    <div className={`bant-katak${qiymat ? '' : ' yoq'}`}>
      <span className="ikon" aria-hidden="true">
        {ikon}
      </span>
      <div>
        <div className="nom">{nom}</div>
        <div className="qiymat">
          {qiymat ?? <span style={{ color: 'var(--text-muted)' }}>aniqlanmadi</span>}
        </div>
      </div>
    </div>
  );
}

export function LeadDetail() {
  const { contactId } = useParams();
  const { business } = useAuth();
  const [d, setD] = useState<LidTafsilot | null>(null);
  const [loading, setLoading] = useState(true);
  const [xato, setXato] = useState<string | null>(null);

  const yukla = useCallback(() => {
    if (!business || !contactId) return;
    setLoading(true);
    setXato(null);
    void api
      .get<LidTafsilot>(`/api/v1/businesses/${business.businessId}/leads/${contactId}`)
      .then(setD)
      .catch((e) => setXato(e instanceof Error ? e.message : 'Yuklab bo\'lmadi'))
      .finally(() => setLoading(false));
  }, [business, contactId]);

  useEffect(yukla, [yukla]);

  if (loading && !d) return <div className="yuklanmoqda">Yuklanmoqda…</div>;
  if (xato) return <div className="xato-qator">{xato}</div>;
  if (!d) return null;

  const l = d.lead;
  const s = d.signals;

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <Link to="/lidlar" className="orqaga">
            ‹ Lid xulosalari
          </Link>
          <h1>
            {l.name ?? 'Ismi yo\'q'}{' '}
            <span className={`badge ${HOLAT_SINF[l.holat]}`}>{HOLAT_NOMI[l.holat]}</span>
          </h1>
          <div className="izoh">
            {l.seatName ?? 'biriktirilmagan'} · {l.conversations} ta suhbat ·{' '}
            {Math.round(l.daysSince)} kun oldin oxirgi aloqa
          </div>
        </div>
      </div>

      {/* ─── Biznes xulosa + keyingi qadam ─── */}
      <div className="xulosa-grid">
        <div className="card xulosa-karta">
          <div className="belgi">
            <span className="badge kul">Biznes xulosa</span>
            <span className={`badge ${HOLAT_SINF[l.holat]}`}>{HOLAT_NOMI[l.holat]}</span>
          </div>
          <h2>{d.summary.sarlavha}</h2>
          <p>{d.summary.matn}</p>
          <div className="chip-qator">
            {l.serviceLine && <span className="chip">Yo'nalish: {l.serviceLine}</span>}
            {d.reasons.primaryGap && <span className="chip">Zaif joy: {d.reasons.primaryGap}</span>}
            {l.leadQuality && <span className="chip">Lid sifati: {l.leadQuality}</span>}
            {l.dealAmount !== null && (
              <span className="chip yashil">
                Summa: {fmtPul(l.dealAmount, l.dealCurrency ?? 'UZS')}
              </span>
            )}
          </div>
        </div>

        <div className="card qadam-karta">
          <div className="bosh">
            <span className="ikon" aria-hidden="true">
              →
            </span>
            <span>Keyingi eng yaxshi qadam</span>
          </div>
          <p>{d.nextStep.matn}</p>
          <div className="muddat">
            Muddat: <b>{d.nextStep.muddat}</b>
          </div>
          <div className="imkoniyat">
            Qaytish imkoniyati:{' '}
            <b style={{ color: ballRang(l.winBack) }}>{l.winBack}/100</b> · {l.reconnectWindow}
          </div>
        </div>
      </div>

      {/* ─── Operatsion signallar ─── */}
      <div className="signal-grid">
        <Signal
          ikon="⏱"
          nom="Javob tezligi (median)"
          qiymat={fmtSoniya(s.medianFirstResponseSeconds)}
        />
        <Signal
          ikon="🔄"
          nom="O'rtacha follow-up"
          qiymat={s.avgFollowUpDays === null ? '—' : `${s.avgFollowUpDays} kun`}
        />
        <Signal
          ikon="⚡"
          nom="Ball tendensiyasi"
          qiymat={s.trend ? TREND_NOMI[s.trend]! : '—'}
          rang={s.trend ? TREND_RANG[s.trend] : undefined}
        />
        <Signal ikon="💬" nom="Umumiy suhbat vaqti" qiymat={fmtSoniya(s.totalTalkSeconds)} />
      </div>

      <div className="grid-2">
        {/* ─── Chap ustun ─── */}
        <div>
          <div className="card" style={{ marginBottom: 14 }}>
            <BoshQator nom="Lid tafsilotlari" />
            <div className="tafsilot-royxat">
              <div>
                <span className="nom">Holat</span>
                <span className={`badge ${HOLAT_SINF[l.holat]}`}>{HOLAT_NOMI[l.holat]}</span>
              </div>
              <div>
                <span className="nom">Lid qiymati</span>
                <b>{l.dealAmount === null ? '—' : fmtPul(l.dealAmount, l.dealCurrency ?? 'UZS')}</b>
              </div>
              <div>
                <span className="nom">Kontakt</span>
                <b>{l.name ?? '—'}</b>
              </div>
              <div>
                <span className="nom">Kompaniya</span>
                <b>{l.company ?? '—'}</b>
              </div>
              <div>
                <span className="nom">Telefon</span>
                <b>{l.phone ?? '—'}</b>
              </div>
              <div>
                <span className="nom">Menejer</span>
                {l.seatId ? (
                  <Link to={`/sotuvchi/${l.seatId}`} className="havola">
                    {l.seatName}
                  </Link>
                ) : (
                  <b>—</b>
                )}
              </div>
              <div>
                <span className="nom">Murojaat turi</span>
                <b>{l.callFamily ?? '—'}</b>
              </div>
              <div>
                <span className="nom">Birinchi aloqa</span>
                <b>{fmtSana(l.firstSeenAt)}</b>
              </div>
              <div>
                <span className="nom">Oxirgi aloqa</span>
                <b>{fmtSana(l.lastAt)}</b>
              </div>
              <div>
                <span className="nom">O'rtacha ball</span>
                <span className={`ball ${ballKlass(l.avgScore)}`}>
                  {l.avgScore === null ? '—' : `${l.avgScore}%`}
                </span>
              </div>
            </div>
          </div>

          {/* ─── Natija sabablari ─── */}
          <div className="card" style={{ marginBottom: 14 }}>
            <BoshQator
              nom="Natija sabablari"
              ost="Suhbatlardan olingan e'tirozlar va zaif mezonlar"
            />
            {d.reasons.objections.length === 0 && d.reasons.weakCriteria.length === 0 ? (
              <div className="hech-narsa">Aniq e'tiroz yoki zaif mezon qayd etilmagan</div>
            ) : (
              <>
                {d.reasons.objections.map((o, i) => (
                  <div className="sabab-blok" key={o}>
                    <span className={`badge ${i === 0 ? 'qizil' : 'kul'}`}>
                      {i === 0 ? 'Asosiy' : `${i + 1}-sabab`}
                    </span>
                    <div className="matn">{o}</div>
                  </div>
                ))}
                {d.reasons.weakCriteria.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="yordam" style={{ marginBottom: 6 }}>
                      Zaif chiqqan mezonlar — aynan shu bosqichlarda yiqilgan:
                    </div>
                    {d.reasons.weakCriteria.map((m, i) => (
                      <div className="mezon-satr" key={`${m.code} ${m.name}`}>
                        <span className="kod">{m.code}</span>
                        <span className="nom">
                          {m.name}
                          <span style={{ color: 'var(--text-muted)' }}> · {m.count} ta baho</span>
                        </span>
                        <span className="chiziq">
                          <div
                            style={
                              {
                                width: `${(m.avgScore / m.maxScore) * 100}%`,
                                background: ballRang((m.avgScore / m.maxScore) * 100),
                                '--i': i,
                              } as React.CSSProperties
                            }
                          />
                        </span>
                        <span
                          className="foiz"
                          style={{ color: ballRang((m.avgScore / m.maxScore) * 100) }}
                        >
                          {m.avgScore}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* ─── Jamoa harakati ─── */}
          {(d.coaching.improvements.length > 0 || d.coaching.betterPhrases.length > 0) && (
            <div className="card" style={{ marginBottom: 14 }}>
              <BoshQator nom="Jamoa harakati" ost="Shu liddagi suhbatlardan chiqqan tavsiyalar" />
              {d.coaching.improvements.length > 0 && (
                <ol className="harakat-royxat">
                  {d.coaching.improvements.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ol>
              )}
              {d.coaching.betterPhrases.map((p, i) => (
                <div className="iqtibos-blok" key={i}>
                  <span className="yorliq">
                    {p.context ? p.context : 'Shunday deyish mumkin edi'}
                  </span>
                  {p.suggestion}
                </div>
              ))}
            </div>
          )}

          {d.coaching.strengths.length > 0 && (
            <div className="card" style={{ marginBottom: 14 }}>
              <BoshQator nom="Kuchli tomonlar" ost="Nima yaxshi ishlagan — takrorlash kerak" />
              <ul className="harakat-royxat kuch">
                {d.coaching.strengths.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}

          {/* ─── Kvalifikatsiya ─── */}
          <div className="card">
            <BoshQator
              nom="Kvalifikatsiya"
              /*
                Dalil bo'lmagan band "aniqlanmadi" deb qoladi. Taxminni
                shu yerda fakt sifatida ko'rsatish butun ekranning
                ma'nosini buzardi — rahbar mavjud bo'lmagan ma'lumotga
                tayanib qaror qilardi.
              */
              ost="Faqat suhbatda aytilgan narsa — taxmin yo'q"
            />
            <div className="bant-grid">
              <Bant ikon="💰" nom="Byudjet" qiymat={d.qualification.budget} />
              <Bant ikon="👤" nom="Qaror qiluvchi" qiymat={d.qualification.authority} />
              <Bant ikon="🎯" nom="Ehtiyoj" qiymat={d.qualification.need} />
              <Bant
                ikon="⏳"
                nom="Shoshilinchlik"
                qiymat={
                  d.qualification.timing
                    ? (SHOSHILINCH[d.qualification.timing] ?? d.qualification.timing)
                    : null
                }
              />
            </div>
          </div>
        </div>

        {/* ─── O'ng ustun: xronologiya ─── */}
        <div>
          <div className="card">
            <BoshQator
              nom="Suhbatlar tarixi"
              ost={`${d.timeline.length} ta suhbat — eng eskisidan boshlab`}
            />
            {d.commitments.length > 0 && (
              <div className="vada-panel">
                <div className="yordam" style={{ marginBottom: 6 }}>
                  Va'dalar:
                </div>
                {d.commitments.map((v, i) => (
                  <div className="vada-satr" key={i}>
                    <span
                      className={`badge ${
                        v.status === 'done' ? 'ok' : v.status === 'missed' ? 'qizil' : 'sariq'
                      }`}
                    >
                      {v.party === 'manager' ? 'Menejer' : 'Mijoz'}
                    </span>
                    <span className="matn">{v.what}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="xronologiya">
              {d.timeline.map((t) => (
                <div className="voqea" key={t.conversationId}>
                  <div className="chiziq" aria-hidden="true">
                    <span className="nuqta" style={{ background: ballRang(t.overallScore) }} />
                  </div>
                  <div className="mazmun">
                    <div className="bosh">
                      <b>{fmtSana(t.startedAt)}</b>
                      <span className="teglar">
                        <span className="badge kul">{t.turns} navbat</span>
                        {t.overallScore !== null && (
                          <span className={`ball ${ballKlass(t.overallScore)}`}>
                            {Math.round(t.overallScore)}%
                          </span>
                        )}
                      </span>
                    </div>
                    {t.seatName && <div className="menejer">{t.seatName}</div>}
                    {t.summary && <div className="matn">{t.summary}</div>}
                    {t.objections.length > 0 && (
                      <div className="chip-qator">
                        {t.objections.map((o) => (
                          <span className="chip qizil" key={o}>
                            {o}
                          </span>
                        ))}
                      </div>
                    )}
                    {t.primaryGap && <div className="gap">Zaif joy: {t.primaryGap}</div>}
                    {t.dealAmount !== null && (
                      <div className="summa">Summa: {fmtPul(t.dealAmount)}</div>
                    )}
                    <Link to={`/suhbatlar/${t.conversationId}`} className="btn ikkinchi kichik">
                      Suhbatni ochish
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
