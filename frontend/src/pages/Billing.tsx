import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, fmtPul, fmtSana, type BillingFull } from '../api';
import { useAuth } from '../auth';
import { useT } from '../i18n';

const HOLAT_NOMI: Record<string, { nom: string; klass: string; izoh: string }> = {
  trial: { nom: 'Sinov muddati', klass: 'sariq', izoh: 'Bepul foydalanish davri' },
  active: { nom: 'Faol', klass: 'ok', izoh: 'Obuna to\'langan, hammasi ishlaydi' },
  grace: { nom: 'Muhlat', klass: 'toq', izoh: 'To\'lov kechikdi, lekin hammasi hali ishlayapti' },
  degraded: {
    nom: 'To\'xtatilgan',
    klass: 'qizil',
    izoh: 'Yangi tahlil to\'xtatildi. Ma\'lumot yig\'ish davom etadi, eski natijalar ko\'rinadi.',
  },
  past_due: { nom: 'Muddati o\'tgan', klass: 'qizil', izoh: '' },
  cancelled: { nom: 'Bekor qilingan', klass: 'kul', izoh: '' },
};

const TRANZAKSIYA_NOMI: Record<string, string> = {
  topup: 'To\'ldirish',
  charge: 'Oylik to\'lov',
  refund: 'Qaytarish',
  bonus: 'Bonus',
  partner_commission: 'Hamkor komissiyasi',
};

/** TZ 3.10: obuna holati, balans, to'lov tarixi. Faqat egasi ko'radi. */
/** `ichki` — Sozlamalar ichida: sahifa sarlavhasisiz. */
export function Billing({ ichki = false }: { ichki?: boolean }) {
  const t = useT();
  const { business } = useAuth();
  const [data, setData] = useState<BillingFull | null>(null);
  const [amount, setAmount] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const base = business ? `/api/v1/businesses/${business.businessId}` : '';

  const load = () => {
    if (!base) return;
    void api.get<BillingFull>(`${base}/billing`).then(setData);
  };
  useEffect(load, [base]);

  async function topup(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!n || n <= 0) return;
    setBusy(true);
    setMsg('');
    try {
      await api.post(`${base}/billing/topup`, { amount: n, description: desc || undefined });
      setAmount('');
      setDesc('');
      setMsg(t("Balans to'ldirildi"));
      load();
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : t('Xato yuz berdi'));
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>;

  const sub = data.subscription;
  const info = sub ? HOLAT_NOMI[sub.status] ?? { nom: sub.status, klass: 'kul', izoh: '' } : null;

  return (
    <>
      {!ichki && (
        <div className="sahifa-bosh">
          <div>
            <h1>{t("To'lov va obuna")}</h1>
            <div className="izoh">{t('Seat asosida narxlash — sotuvchilar soniga qarab')}</div>
          </div>
        </div>
      )}

      {sub && info && (
        <div className="card" style={{ marginBottom: 14, borderLeft: `4px solid var(--${info.klass === 'ok' ? 'ok)' : info.klass === 'qizil' ? 'qizil)' : 'sariq)'}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <span className={`badge ${info.klass}`}>{t(info.nom)}</span>
            {sub.trialEndsAt && sub.status === 'trial' && (
              <span style={{ color: 'var(--kul-dark)' }}>
                {t('Sinov tugashi: {sana}', { sana: fmtSana(sub.trialEndsAt) })}
              </span>
            )}
            {sub.graceEndsAt && sub.status === 'grace' && (
              <span style={{ color: 'var(--kul-dark)' }}>
                {t('Muhlat tugashi: {sana}', { sana: fmtSana(sub.graceEndsAt) })}
              </span>
            )}
            {sub.currentPeriodEnd && sub.status === 'active' && (
              <span style={{ color: 'var(--kul-dark)' }}>
                {t('Keyingi yechish: {sana}', { sana: fmtSana(sub.currentPeriodEnd) })}
              </span>
            )}
          </div>
          {info.izoh && <div style={{ fontSize: 13, color: 'var(--kul-dark)' }}>{t(info.izoh)}</div>}
        </div>
      )}

      <div className="kpi-grid">
        <div className="card kpi">
          <div className="nom">{t('Balans')}</div>
          <div className="qiymat" style={{ fontSize: 22 }}>
            {fmtPul(sub?.balance ?? 0)}
          </div>
        </div>
        <div className="card kpi">
          <div className="nom">{t('Faol sotuvchilar')}</div>
          <div className="qiymat">{data.activeSeats}</div>
        </div>
        <div className="card kpi">
          <div className="nom">{t('Bitta seat / oy')}</div>
          <div className="qiymat" style={{ fontSize: 20 }}>
            {fmtPul(data.monthlySeatPriceUzs)}
          </div>
        </div>
        <div className="card kpi">
          <div className="nom">{t('Oylik xarajat')}</div>
          <div className="qiymat" style={{ fontSize: 20 }}>
            {fmtPul(data.estimatedMonthlyCostUzs)}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <h2 style={{ marginBottom: 10 }}>{t("Balansni to'ldirish")}</h2>
          <div style={{ fontSize: 12, color: 'var(--kul-dark)', marginBottom: 10 }}>
            {t("Hozircha qo'lda kiritiladi — bank o'tkazmasi yoki Payme/Click orqali to'lov qilib, summani shu yerga kiriting. Avtomatik to'lov keyinroq ulanadi.")}
          </div>
          <form onSubmit={(e) => void topup(e)}>
            <div className="maydon-blok">
              <label className="maydon">{t("Summa (so'm)")}</label>
              <input
                className="input"
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </div>
            <div className="maydon-blok">
              <label className="maydon">{t('Izoh')}</label>
              <input
                className="input"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder={t('Masalan: Payme #12345')}
              />
            </div>
            <button className="btn" disabled={busy}>
              {busy ? t('Kuting…') : t("To'ldirish")}
            </button>
            {msg && <div style={{ marginTop: 8, fontSize: 13 }}>{msg}</div>}
          </form>
        </div>

        <div className="card">
          <h2 style={{ marginBottom: 10 }}>{t('Tranzaksiyalar')}</h2>
          {data.transactions.length === 0 ? (
            <div className="hech-narsa">{t("Hali tranzaksiya yo'q")}</div>
          ) : (
            <table className="jadval">
              <thead>
                <tr>
                  <th>{t('Sana')}</th>
                  <th>{t('Turi')}</th>
                  <th>{t('Summa')}</th>
                  <th>{t('Qoldiq')}</th>
                </tr>
              </thead>
              <tbody>
                {data.transactions.map((tr) => (
                  <tr key={tr.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{fmtSana(tr.createdAt)}</td>
                    <td>{TRANZAKSIYA_NOMI[tr.type] ? t(TRANZAKSIYA_NOMI[tr.type]!) : tr.type}</td>
                    <td style={{ color: tr.type === 'charge' ? 'var(--qizil)' : 'var(--ok)' }}>
                      {tr.type === 'charge' ? '−' : '+'}
                      {fmtPul(tr.amount)}
                    </td>
                    <td>{fmtPul(tr.balanceAfter)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
