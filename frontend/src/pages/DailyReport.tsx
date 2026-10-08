import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  api,
  ballKlass,
  ballRang,
  fmtPul,
  fmtSoniya,
  type HisobotBolimlari,
  type HisobotKun,
  type HisobotKuni,
} from '../api';
import { useAuth } from '../auth';
import { BoshQator, GuruhUstunlar } from '../components/Charts';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KUNLIK HISOBOT — "kecha nima bo'ldi" ekrani
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Analitikadan farqi vaqt oynasida: analitika DAVRNI (hafta, oy) ko'radi va
 * tendensiya izlaydi, bu ekran esa BITTA KUNNI — rahbar ertalab ochib,
 * bugun kim bilan nima gaplashishni hal qiladi.
 *
 * ── Nega raqamlar saqlangan hisobotdan olinmaydi ────────────────────────────
 * Telegram hisoboti faqat bot ulangan va cron ishlagan kunlarda yoziladi.
 * Raqamlarni faqat shundan olsak, qolgan kunlar bo'sh ko'rinardi — holbuki
 * suhbatlar bor. Shuning uchun raqamlar har doim jonli hisoblanadi, AI matni
 * esa qo'shimcha sifatida chiqadi.
 *
 * ── Nega hisobot matni shablonli ────────────────────────────────────────────
 * Jumlalar backendda RAQAMLARDAN yasaladi. LLM ishlatilsa: har ochilishda
 * pul ketardi, matn har safar boshqacha bo'lardi (kecha bilan solishtirib
 * bo'lmasdi) va model raqamni noto'g'ri talqin qilishi mumkin edi.
 */

const HAFTA = ['Ya', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
const HAFTA_TOLIQ = [
  'Yakshanba', 'Dushanba', 'Seshanba', 'Chorshanba', 'Payshanba', 'Juma', 'Shanba',
];
const OYLAR = [
  'Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
  'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr',
];

/** `YYYY-MM-DD` — mahalliy vaqt bo'yicha (UTC siljishisiz). */
function isoKun(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

function kunQosh(sana: string, n: number): string {
  const d = new Date(`${sana}T12:00:00`);
  d.setDate(d.getDate() + n);
  return isoKun(d);
}

/** Tanlangan kun joylashgan haftaning dushanbasi. */
function haftaBoshi(sana: string): string {
  const d = new Date(`${sana}T12:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoKun(d);
}

/** "2 soat 3 daqiqa" — umumiy suhbat vaqti uchun. */
function fmtVaqt(sek: number): string {
  if (!sek) return '0 daqiqa';
  const soat = Math.floor(sek / 3600);
  const daq = Math.round((sek % 3600) / 60);
  if (soat === 0) return `${daq} daqiqa`;
  return daq === 0 ? `${soat} soat` : `${soat} soat ${daq} daqiqa`;
}

/** Bitta qator: "Nomi: qiymat". Hisobot matnining asosiy bloki. */
function Qator({
  nom,
  qiymat,
  rang,
}: {
  nom: string;
  qiymat: string | number;
  rang?: string;
}) {
  return (
    <div className="hisobot-qator">
      <span className="nom">{nom}:</span>
      <span className="qiymat" style={rang ? { color: rang } : undefined}>
        {qiymat}
      </span>
    </div>
  );
}

/**
 * Hisobotning bir kesimi — biznes uchun ham, menejer uchun ham bir xil.
 * Bitta komponent bo'lgani uchun ikkalasi hech qachon farq qilib qolmaydi.
 */
function Bolimlar({ b, kim }: { b: HisobotBolimlari; kim?: string }) {
  const a = b.activity;
  const q = b.quality;

  return (
    <>
      <div className="hisobot-bolim">
        <h3>Faollik</h3>
        <Qator nom="Jami suhbatlar" qiymat={a.conversations} />
        <Qator nom="Aloqa o'rnatilgan" qiymat={a.engaged} rang="var(--yuqori)" />
        <Qator
          nom="Aloqa o'rnatilmagan"
          qiymat={a.notEngaged}
          rang={a.notEngaged > 0 ? 'var(--orta)' : undefined}
        />
        <Qator
          nom="Aloqa darajasi"
          qiymat={a.engagementPct === null ? '—' : `${a.engagementPct}%`}
          rang={ballRang(a.engagementPct)}
        />
        <Qator nom="Umumiy suhbat vaqti" qiymat={fmtVaqt(a.talkSeconds)} />
      </div>

      <div className="hisobot-bolim">
        <h3>Suhbatlar sifati</h3>
        <Qator nom="Tahlil qilingan" qiymat={q.analyzed} />
        <Qator nom="Baholangan" qiymat={q.scored} rang="var(--yuqori)" />
        <Qator nom="Operatsion (sotuv emas)" qiymat={q.operational} />
        <Qator
          nom="Javobsiz qolgan"
          qiymat={q.unanswered}
          rang={q.unanswered > 0 ? 'var(--past)' : undefined}
        />
        {q.flagged > 0 && <Qator nom="Bayroqli" qiymat={q.flagged} rang="var(--past)" />}
        <Qator
          nom="O'rtacha ball"
          qiymat={q.avgScore === null ? '—' : `${q.avgScore}%`}
          rang={ballRang(q.avgScore)}
        />
        {q.medianFirstResponseSeconds !== null && (
          <Qator nom="Birinchi javob (median)" qiymat={fmtSoniya(q.medianFirstResponseSeconds)} />
        )}
      </div>

      <div className="hisobot-bolim">
        <h3>Vazifalar</h3>
        <Qator nom="Shu kuni yaratilgan" qiymat={b.tasks.yaratildi} />
        <Qator nom="Shu kuni bajarilgan" qiymat={b.tasks.bajarildi} rang="var(--yuqori)" />
        <Qator nom="Hozir ochiq" qiymat={b.tasks.ochiq} />
        <Qator
          nom="Muddati o'tgan"
          qiymat={b.tasks.kechikkan}
          rang={b.tasks.kechikkan > 0 ? 'var(--past)' : undefined}
        />
      </div>

      <div className="hisobot-bolim">
        <h3>Lidlar</h3>
        <Qator nom="Yangi lid" qiymat={b.leads.newLeads} />
        <Qator nom="Summa kelishilgan" qiymat={b.leads.withDeal} rang="var(--yuqori)" />
        <Qator nom="Aytilgan umumiy summa" qiymat={fmtPul(b.leads.dealSum)} />
      </div>

      {b.recommendations.length > 0 && (
        <div className="hisobot-bolim">
          <h3>{kim ? 'Ertangi kun uchun tavsiyalar' : 'Ertangi kun uchun tavsiyalar'}</h3>
          <ul className="tavsiya-royxat">
            {b.recommendations.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="hisobot-bolim">
        <h3>Xulosa</h3>
        <p className="xulosa-matn">{b.conclusion}</p>
      </div>
    </>
  );
}

export function DailyReport() {
  const { business } = useAuth();
  const bugun = isoKun(new Date());
  const [sana, setSana] = useState(bugun);
  const [kunlar, setKunlar] = useState<HisobotKun[]>([]);
  const [kun, setKun] = useState<HisobotKuni | null>(null);
  const [loading, setLoading] = useState(true);
  const [xato, setXato] = useState<string | null>(null);
  const [yoyilgan, setYoyilgan] = useState<string | null>(null);

  const bosh = haftaBoshi(sana);

  const yukla = useCallback(() => {
    if (!business) return;
    const base = `/api/v1/businesses/${business.businessId}/reports/daily`;
    setLoading(true);
    setXato(null);
    void Promise.all([
      api.get<{ days: HisobotKun[] }>(`${base}/calendar?from=${bosh}&to=${kunQosh(bosh, 6)}`),
      api.get<HisobotKuni>(`${base}/day?date=${sana}`),
    ])
      .then(([k, d]) => {
        setKunlar(k.days);
        setKun(d);
      })
      .catch((e) => setXato(e instanceof Error ? e.message : 'Yuklab bo\'lmadi'))
      .finally(() => setLoading(false));
  }, [business, bosh, sana]);

  useEffect(yukla, [yukla]);

  if (loading && !kun) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  const d = new Date(`${sana}T12:00:00`);
  const o = kun?.overall;
  const p = o?.previous;

  return (
    <>
      <div className="sahifa-bosh">
        <div>
          <h1>Kunlik hisobot</h1>
          <div className="izoh">Bir kunning to'liq kesimi</div>
        </div>
        <div className="tab-qator">
          <button
            className="tab"
            onClick={() => setSana(kunQosh(bosh, -7))}
            aria-label="Oldingi hafta"
          >
            ‹
          </button>
          <button className={`tab ${sana === bugun ? 'active' : ''}`} onClick={() => setSana(bugun)}>
            Bugun
          </button>
          <button
            className="tab"
            onClick={() => setSana(kunQosh(bosh, 7))}
            aria-label="Keyingi hafta"
            disabled={kunQosh(bosh, 7) > bugun}
          >
            ›
          </button>
        </div>
      </div>

      <div className="oy-nomi">
        {OYLAR[d.getMonth()]} {d.getFullYear()}
      </div>

      {/* ─── Hafta lentasi ─── */}
      <div className="kun-lenta">
        {kunlar.map((k) => {
          const kd = new Date(`${k.date}T12:00:00`);
          const kelajak = k.date > bugun;
          return (
            <button
              key={k.date}
              className={`kun-katak${k.date === sana ? ' tanlangan' : ''}${kelajak ? ' kelajak' : ''}`}
              onClick={() => !kelajak && setSana(k.date)}
              disabled={kelajak}
            >
              <span className="hafta">{HAFTA[kd.getDay()]}</span>
              <span className="raqam">{kd.getDate()}</span>
              {/* Nuqta ma'lumot BORLIGINI bildiradi, sifatni emas: bo'sh
                  kunni qizil qilsak, dam olish kuni "yomon" ko'rinardi. */}
              <span
                className="nuqta"
                style={{
                  background: kelajak
                    ? 'transparent'
                    : k.conversations === 0
                      ? 'var(--text-muted)'
                      : ballRang(k.avgScore),
                }}
                title={
                  kelajak
                    ? ''
                    : k.conversations === 0
                      ? 'Suhbat yo\'q'
                      : `${k.conversations} suhbat${k.avgScore !== null ? `, ${k.avgScore}%` : ''}`
                }
              />
            </button>
          );
        })}
      </div>
      <div className="lenta-afsona">
        <span className="band">
          <span className="nuqta" style={{ background: 'var(--yuqori)' }} /> Suhbat bor
        </span>
        <span className="band">
          <span className="nuqta" style={{ background: 'var(--text-muted)' }} /> Suhbat yo'q
        </span>
        <span className="band">Nuqta rangi — o'sha kungi o'rtacha ball</span>
      </div>

      {xato && <div className="xato-qator">{xato}</div>}
      {loading && <div className="ok-qator">Yangilanmoqda…</div>}

      <div className="kun-sarlavha">
        <b>
          {d.getDate()} {OYLAR[d.getMonth()]}, {HAFTA_TOLIQ[d.getDay()]}
        </b>
        {kun?.report ? (
          <span className="badge ok">Telegram hisoboti yuborilgan</span>
        ) : (
          <span className="badge kul">Telegramga yuborilmagan</span>
        )}
      </div>

      {o && o.activity.conversations === 0 ? (
        <div className="card">
          <div className="hech-narsa">
            Bu kuni suhbat bo'lmagan.
            <div style={{ fontSize: 13, marginTop: 6 }}>
              Dam olish kuni bo'lishi yoki Telegram integratsiyasi ishlamagan bo'lishi mumkin.
            </div>
          </div>
        </div>
      ) : (
        o && (
          <>
            {/* ─── Umumiy tahlil ─── */}
            <div className="card hisobot-karta">
              <div className="hisobot-bosh">
                <h2>{business?.name}: {sana} kunlik hisobot</h2>
                <p>{o.conclusion}</p>
              </div>

              <Bolimlar b={o} />

              {/* Kecha va bugun */}
              {p && (
                <div className="hisobot-bolim">
                  <h3>Oldingi ish kuni bilan solishtirish</h3>
                  <div className="yordam" style={{ marginBottom: 8 }}>
                    Taqqoslash {p.date} bilan — suhbat bo'lgan eng yaqin oldingi kun.
                  </div>
                  <GuruhUstunlar
                    qatorlar={[
                      { nom: 'Oldingi kun', rang: 'var(--ia)' },
                      { nom: 'Shu kun', rang: 'var(--yuqori)' },
                    ]}
                    data={[
                      {
                        label: 'Suhbatlar',
                        qiymatlar: [p.conversations, o.activity.conversations],
                      },
                      { label: 'Aloqa o\'rnatilgan', qiymatlar: [p.engaged, o.activity.engaged] },
                      { label: 'Baholangan', qiymatlar: [p.scored, o.quality.scored] },
                      {
                        label: 'Suhbat vaqti (daq)',
                        qiymatlar: [
                          Math.round(p.talkSeconds / 60),
                          Math.round(o.activity.talkSeconds / 60),
                        ],
                      },
                    ]}
                  />
                </div>
              )}

              {/* Anketa */}
              <div className="hisobot-bolim">
                <h3>Anketa savollari</h3>
                {o.questionnaire.length === 0 ? (
                  <div className="yordam">Bu kuni anketa javobi yig'ilmagan.</div>
                ) : (
                  o.questionnaire.map((s) => (
                    <Qator key={s.question} nom={s.question} qiymat={`${s.answers} javob`} />
                  ))
                )}
              </div>

              {/* Zaif mezonlar */}
              <div className="hisobot-bolim">
                <h3>Shu kunning zaif mezonlari</h3>
                {o.weakest.length === 0 ? (
                  <div className="yordam">Bu kuni mezon bahosi yo'q.</div>
                ) : (
                  o.weakest.map((w, i) => (
                    <div className="mezon-satr" key={`${w.code} ${w.name}`}>
                      <span className="kod">{w.code}</span>
                      <span className="nom">
                        {w.name}
                        <span style={{ color: 'var(--text-muted)' }}> · {w.count} ta baho</span>
                      </span>
                      <span className="chiziq">
                        <div
                          style={
                            {
                              width: `${(w.avgScore / 3) * 100}%`,
                              background: ballRang((w.avgScore / 3) * 100),
                              '--i': i,
                            } as React.CSSProperties
                          }
                        />
                      </span>
                      <span className="foiz" style={{ color: ballRang((w.avgScore / 3) * 100) }}>
                        {w.avgScore}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Telegramga yuborilgan matn */}
              {kun?.report?.content && (
                <div className="hisobot-bolim">
                  <h3>Telegramga yuborilgan matn</h3>
                  <div className="yordam" style={{ marginBottom: 6 }}>
                    {kun.report.triggeredBy === 'manual' ? 'Qo\'lda' : 'Avtomatik'} yuborilgan.
                  </div>
                  <pre className="hisobot-matn">{kun.report.content}</pre>
                </div>
              )}
            </div>

            {/* ─── Menejerlar tahlili ─── */}
            <div className="card" style={{ marginTop: 14 }}>
              <BoshQator
                nom="Menejerlar tahlili"
                ost="Har birining shu kungi to'liq hisoboti — ustiga bosib oching"
              />
              {kun!.bySeat.length === 0 ? (
                <div className="hech-narsa">Bu kuni sotuvchi faolligi yo'q</div>
              ) : (
                kun!.bySeat.map((m) => (
                  <div className="menejer-blok" key={m.seatId}>
                    <button
                      className={`menejer-bosh${yoyilgan === m.seatId ? ' ochiq' : ''}`}
                      aria-expanded={yoyilgan === m.seatId}
                      onClick={() => setYoyilgan(yoyilgan === m.seatId ? null : m.seatId)}
                    >
                      <span className="avatar">{m.displayName.slice(0, 1).toUpperCase()}</span>
                      <span className="ism">{m.displayName}</span>
                      <span className="raqamlar">
                        <span>{m.activity.conversations} suhbat</span>
                        {m.quality.unanswered > 0 && (
                          <span className="badge qizil">{m.quality.unanswered} javobsiz</span>
                        )}
                        {m.tasks.kechikkan > 0 && (
                          <span className="badge sariq">{m.tasks.kechikkan} kechikkan</span>
                        )}
                        <span className={`ball ${ballKlass(m.quality.avgScore)}`}>
                          {m.quality.avgScore === null ? '—' : `${m.quality.avgScore}%`}
                        </span>
                      </span>
                      <span className="strelka" aria-hidden="true">
                        ⌄
                      </span>
                    </button>

                    <div className={`menejer-ich${yoyilgan === m.seatId ? ' ochiq' : ''}`}>
                      <div className="menejer-royxat">
                        <div className="hisobot-bosh kichik">
                          <h2>
                            {m.displayName}: {sana} kunlik hisobot
                          </h2>
                          <p>{m.conclusion}</p>
                        </div>

                        <Bolimlar b={m} kim={m.displayName} />

                        {(m.strength || m.improvement) && (
                          <div className="hisobot-bolim">
                            <h3>Kouching</h3>
                            {m.strength && (
                              <div className="rubrika-blok intilish">
                                <span className="yorliq">Kuchli tomoni</span>
                                {m.strength}
                              </div>
                            )}
                            {m.improvement && (
                              <div className="rubrika-blok hozir">
                                <span className="yorliq">E'tibor kerak</span>
                                {m.improvement}
                              </div>
                            )}
                          </div>
                        )}

                        <Link to={`/sotuvchi/${m.seatId}`} className="btn ikkinchi kichik">
                          Menejer kabinetini ochish
                        </Link>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )
      )}
    </>
  );
}
