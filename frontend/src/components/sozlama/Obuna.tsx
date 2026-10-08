import { CalendarDays, CalendarRange, CircleDollarSign, Info, MessageSquareWarning, Plus, ShieldAlert, ShieldCheck, UsersRound, Wallet } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiError, fmtPul, type BillingFull, type BillingStatus } from '../../api';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SOZLAMALAR → OBUNA (TZ 3.10)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Holat, balans, o'rinlar, oylik xarajat, davr va to'lov tarixi — hammasi
 * `/billing` va `/billing/status` dan. Qo'lda to'ldirish (bank o'tkazmasi
 * tasdiqlangach) saqlanib qoldi: real to'lov tizimi ulanguncha yagona yo'l.
 */

type Sub = NonNullable<BillingFull['subscription']> & { currentPeriodStart?: string | null };

const HOLAT: Record<BillingStatus['status'], { nom: string; ton: 'yaxshi' | 'orta' | 'xavf' | 'info' | 'neytral'; banner: string | null }> = {
  trial: { nom: 'Sinov davri', ton: 'info', banner: 'Sinov davri — barcha imkoniyatlar bepul ishlaydi.' },
  active: { nom: 'Faol', ton: 'yaxshi', banner: null },
  past_due: { nom: "To'lov kechikdi", ton: 'orta', banner: "To'lov muddati o'tdi. Xizmat to'xtamasligi uchun balansni to'ldiring." },
  grace: { nom: 'Imtiyozli davr', ton: 'orta', banner: "To'lov kechikdi — imtiyozli davr. Hammasi hali ishlayapti, lekin muddat tugagach yangi tahlil to'xtaydi." },
  degraded: { nom: 'Muzlatilgan', ton: 'xavf', banner: "Obuna muzlatilgan. Xizmatlarni davom ettirish uchun to'lov qiling." },
  cancelled: { nom: 'Bekor qilingan', ton: 'neytral', banner: 'Obuna bekor qilingan.' },
};

const TUR_NOMI: Record<string, string> = {
  topup: "To'ldirish",
  charge: "Oylik to'lov",
  refund: 'Qaytarish',
  bonus: 'Bonus',
  partner_commission: 'Hamkor komissiyasi',
};

const OYLAR = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const sana = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()}-${OYLAR[d.getMonth()]} ${d.getFullYear()}`;
};
const ishorali = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${fmtPul(Math.abs(n))}`;
const SAHIFA = 10;

export function Obuna({ businessId }: { businessId: string }) {
  const base = `/api/v1/businesses/${businessId}/billing`;
  const [data, setData] = useState<BillingFull | null>(null);
  const [holat, setHolat] = useState<BillingStatus | null>(null);
  const [xato, setXato] = useState(false);
  const [toldirish, setToldirish] = useState(false);
  const [korsat, setKorsat] = useState(SAHIFA);

  const yukla = useCallback(() => {
    void api
      .get<BillingFull>(base)
      .then(setData)
      .catch(() => setXato(true));
    void api
      .get<BillingStatus>(`${base}/status`)
      .then(setHolat)
      .catch(() => undefined);
  }, [base]);
  useEffect(yukla, [yukla]);

  if (xato) return <div className="card bn-bosh-holat">Obuna ma'lumotlarini yuklab bo'lmadi.</div>;
  if (!data) return <div className="card skelet" style={{ height: 420 }} aria-busy="true" />;

  const sub = data.subscription as Sub | null;
  const status = (holat?.status ?? sub?.status ?? null) as BillingStatus['status'] | null;
  const h = status ? HOLAT[status] : null;
  const kunlar = holat?.daysLeft ?? null;
  const tolovKuni = sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd).getDate() : null;
  const tranzaksiyalar = data.transactions;

  return (
    <>
      <section className="card sz-karta ob-karta">
        <div className="sz-karta-bosh">
          <div>
            <h2>Obuna</h2>
          </div>
          <div className="ob-bosh-amal">
            {h && <span className={`bzl-pill ${h.ton}`}>{h.nom}</span>}
            <button type="button" className={toldirish ? 'btn ikkinchi' : 'btn'} aria-expanded={toldirish} onClick={() => setToldirish((v) => !v)}>
              {toldirish ? (
                'Bekor qilish'
              ) : (
                <>
                  <Plus /> Balansni to'ldirish
                </>
              )}
            </button>
          </div>
        </div>

        {h?.banner && (
          <div className={`ob-banner ${h.ton}`} role={h.ton === 'xavf' ? 'alert' : 'status'}>
            {h.ton === 'xavf' || h.ton === 'orta' ? <ShieldAlert aria-hidden="true" /> : <ShieldCheck aria-hidden="true" />}
            <span>
              {h.banner}
              {status === 'trial' && kunlar !== null && ` ${kunlar} kun qoldi.`}
            </span>
          </div>
        )}

        {toldirish && (
          <Toldirish
            base={base}
            onToldi={() => {
              setToldirish(false);
              yukla();
            }}
          />
        )}

        <div className="ob-kpi">
          <Kpi ikon={<Wallet />} nom="Balans" qiymat={fmtPul(sub?.balance ?? 0)} />
          <Kpi ikon={<UsersRound />} nom="O'rinlar" qiymat={String(data.activeSeats)} izoh="Faol menejerlar soni" />
          <Kpi
            ikon={<CircleDollarSign />}
            nom="Oylik xarajat"
            qiymat={fmtPul(data.estimatedMonthlyCostUzs)}
            izoh={`${data.activeSeats} × ${fmtPul(data.monthlySeatPriceUzs)}`}
          />
          <Kpi
            ikon={<CalendarDays />}
            nom="Qolgan kunlar"
            qiymat={kunlar === null ? '—' : String(kunlar)}
            izoh={status === 'trial' ? 'Sinov tugashigacha' : status === 'grace' ? 'Imtiyozli davr tugashigacha' : kunlar === null ? undefined : 'Davr tugashigacha'}
          />
        </div>

        {(sub?.currentPeriodStart || sub?.currentPeriodEnd || sub?.trialEndsAt) && (
          <div className="ob-davr">
            <CalendarRange aria-hidden="true" />
            <div>
              <small>{status === 'trial' && !sub?.currentPeriodEnd ? 'Sinov davri' : 'Davr'}</small>
              <b>
                {status === 'trial' && !sub?.currentPeriodEnd
                  ? `${sana(sub?.trialEndsAt)} gacha`
                  : `${sana(sub?.currentPeriodStart)} — ${sana(sub?.currentPeriodEnd)}`}
              </b>
              {tolovKuni && <span>Har oyning {tolovKuni}-sanasida to'lov</span>}
            </div>
          </div>
        )}

        <div className="ob-yordam">
          <b>Qo'llab-quvvatlash</b>
          <Link to="/sozlamalar?b=muammo" className="ob-aloqa">
            <span className="ob-aloqa-ikon">
              <MessageSquareWarning />
            </span>
            <div>
              <small>To'lov yoki obuna bo'yicha savol</small>
              <b>Muammo haqida xabar berish</b>
            </div>
          </Link>
        </div>
      </section>

      <section className="card sz-karta ob-karta">
        <div className="sz-karta-bosh">
          <div>
            <h2>So'nggi tranzaksiyalar</h2>
          </div>
        </div>
        {tranzaksiyalar.length === 0 ? (
          <div className="bn-bosh-holat">Hali tranzaksiya yo'q.</div>
        ) : (
          <>
            <div className="ob-jadval-oram">
              <table className="ob-jadval">
                <thead>
                  <tr>
                    <th scope="col">Sana</th>
                    <th scope="col">Turi</th>
                    <th scope="col">Izoh</th>
                    <th scope="col" className="raqam">
                      Summa
                    </th>
                    <th scope="col" className="raqam">
                      Keyingi balans
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {tranzaksiyalar.slice(0, korsat).map((t) => {
                    // Ishora turdan emas, balans farqidan — har qanday tur uchun to'g'ri
                    const farq = Number(t.balanceAfter) - Number(t.balanceBefore);
                    return (
                      <tr key={t.id}>
                        <td className="ob-sana">{sana(t.createdAt)}</td>
                        <td>
                          <span className={`ob-tur ${farq > 0 ? 'kirim' : farq < 0 ? 'chiqim' : ''}`}>{TUR_NOMI[t.type] ?? t.type}</span>
                        </td>
                        <td className="ob-izoh">{t.description ?? '—'}</td>
                        <td className={`raqam ${farq > 0 ? 'kirim' : farq < 0 ? 'chiqim' : ''}`}>{ishorali(farq)}</td>
                        <td className="raqam">{fmtPul(t.balanceAfter)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {tranzaksiyalar.length > korsat && (
              <button type="button" className="btn ikkinchi ob-yana" onClick={() => setKorsat((n) => n + SAHIFA)}>
                Yana ko'rsatish ({tranzaksiyalar.length - korsat})
              </button>
            )}
          </>
        )}
      </section>
    </>
  );
}

function Kpi({ ikon, nom, qiymat, izoh }: { ikon: ReactNode; nom: string; qiymat: string; izoh?: string }) {
  return (
    <div className="ob-kpi-karta">
      <span className="ob-kpi-nom">
        {ikon} {nom}
      </span>
      <b>{qiymat}</b>
      {izoh && <small>{izoh}</small>}
    </div>
  );
}

function Toldirish({ base, onToldi }: { base: string; onToldi: () => void }) {
  const [summa, setSumma] = useState('');
  const [izoh, setIzoh] = useState('');
  const [band, setBand] = useState(false);
  const [xato, setXato] = useState<string | null>(null);

  const yubor = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(summa.replace(/\s/g, ''));
    if (!Number.isFinite(n) || n <= 0) return setXato("Summani to'g'ri kiriting");
    setBand(true);
    setXato(null);
    try {
      await api.post(`${base}/topup`, { amount: n, description: izoh.trim() || undefined });
      onToldi();
    } catch (err) {
      setXato(err instanceof ApiError ? err.message : "To'ldirilmadi — qayta urinib ko'ring");
      setBand(false);
    }
  };

  return (
    <form className="bzl-forma" onSubmit={(e) => void yubor(e)} noValidate>
      <b className="bzl-forma-sarlavha">Balansni to'ldirish</b>
      <div className="ob-izoh-qator">
        <Info aria-hidden="true" />
        <span>To'lov tizimi hali ulanmagan. Bank o'tkazmasi yoki Payme/Click orqali to'lov tasdiqlangach, summani shu yerga kiriting.</span>
      </div>
      <div className="bzl-forma-panjara">
        <div className="maydon-blok">
          <label htmlFor="ob-summa">Summa (so'm) *</label>
          <input id="ob-summa" inputMode="numeric" value={summa} onChange={(e) => setSumma(e.target.value.replace(/[^\d\s]/g, ''))} placeholder="1 000 000" autoFocus />
        </div>
        <div className="maydon-blok">
          <label htmlFor="ob-izoh">Izoh</label>
          <input id="ob-izoh" value={izoh} onChange={(e) => setIzoh(e.target.value)} placeholder="Masalan: Payme #12345" maxLength={200} />
        </div>
      </div>
      {xato && <div className="yordam bzl-xato">{xato}</div>}
      <div>
        <button type="submit" className="btn" disabled={band || !summa.trim()}>
          {band ? 'Kuting…' : "To'ldirish"}
        </button>
      </div>
    </form>
  );
}
