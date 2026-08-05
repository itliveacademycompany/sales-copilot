import { useEffect, useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api, type BillingStatus } from '../api';
import { useAuth } from '../auth';

const BANNER: Record<string, { klass: string; matn: (d: number | null) => string }> = {
  trial: { klass: 'sariq', matn: (d) => `Sinov muddati: ${d ?? '?'} kun qoldi` },
  grace: { klass: 'toq', matn: (d) => `To'lov kechikdi — ${d ?? '?'} kundan keyin tahlil to'xtaydi` },
  degraded: {
    klass: 'qizil',
    matn: () => 'Obuna faol emas — yangi tahlil to\'xtatilgan. Balansni to\'ldiring.',
  },
};

/**
 * Asosiy sxema: navy yon panel + krem kontent maydoni.
 * Yon panelda yangi ogohlantirishlar soni va obuna banneri jonli ko'rinadi.
 */
export function Layout() {
  const { user, business, logout } = useAuth();
  const [unseen, setUnseen] = useState(0);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [menyu, setMenyu] = useState(false);

  useEffect(() => {
    // Sotuvchida `alert:read` yo'q — har daqiqada 403 so'rov yubormaymiz.
    if (!business?.permissions.includes('alert:read')) return;
    let dead = false;
    const load = () =>
      api
        .get<{ unseenCount: number }>(`/api/v1/businesses/${business.businessId}/alerts?limit=1`)
        .then((r) => {
          if (!dead) setUnseen(r.unseenCount);
        })
        .catch(() => undefined);
    void load();
    const t = setInterval(load, 60_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [business]);

  useEffect(() => {
    if (!business) return;
    void api
      .get<BillingStatus>(`/api/v1/businesses/${business.businessId}/billing/status`)
      .then(setBilling)
      .catch(() => undefined);
  }, [business]);

  const canBilling = business?.permissions.includes('subscription:manage') ?? false;
  /**
   * Sotuvchi (FR-112) va rahbar bir xil yon panelni ko'rmasligi kerak:
   * sotuvchida baholash mezonlarini tahrirlash ham, jamoa dashboard'i ham
   * yo'q. Haqiqiy chegara serverda — bu faqat foydasiz havolalarni
   * yashiradi.
   */
  const rahbar = business?.permissions.includes('analytics:read:all') ?? false;
  const ogohKoradi = business?.permissions.includes('alert:read') ?? false;
  const playbookKoradi = business?.permissions.includes('playbook:read') ?? false;

  const item = (to: string, ikon: string, nom: string, soni?: number) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      onClick={() => setMenyu(false)}
    >
      <span className="ikon">{ikon}</span>
      {nom}
      {soni !== undefined && soni > 0 && <span className="soni">{soni}</span>}
    </NavLink>
  );

  const banner = billing ? BANNER[billing.status] : undefined;

  return (
    <div className="shell">
      {/* Mobil tepa bar — 860px dan pastda ko'rinadi (TZ 8.1 #4) */}
      <div className="topbar">
        <button
          className="menyu-tugma"
          aria-label={menyu ? 'Menyuni yopish' : 'Menyuni ochish'}
          aria-expanded={menyu}
          onClick={() => setMenyu((v) => !v)}
        >
          {menyu ? '✕' : '☰'}
        </button>
        <div className="logo">
          Sotuv<em>AI</em>
        </div>
      </div>
      {menyu && (
        <button className="fon-parda" aria-label="Menyuni yopish" onClick={() => setMenyu(false)} />
      )}
      <aside className={`sidebar${menyu ? ' ochiq' : ''}`}>
        <div className="logo">
          Sotuv<em>AI</em>
        </div>
        <div className="biz">{business?.name}</div>
        {item('/', rahbar ? '▦' : '👤', rahbar ? 'Dashboard' : 'Mening kabinetim')}
        {item('/suhbatlar', '💬', rahbar ? 'Suhbatlar' : 'Mening suhbatlarim')}
        {item('/vazifalar', '☑', rahbar ? 'Vazifalar' : 'Mening vazifalarim')}
        {ogohKoradi && item('/ogohlantirishlar', '⚑', 'Ogohlantirishlar', unseen)}
        {playbookKoradi && item('/playbook', '📋', 'Baholash mezonlari')}
        {canBilling && item('/billing', '💳', 'To\'lov')}
        {item('/sozlamalar', '⚙', 'Sozlamalar')}
        <div className="foot">
          <div className="ism">{user?.displayName}</div>
          <div>{user?.email}</div>
          <button onClick={() => void logout()}>Chiqish</button>
        </div>
      </aside>
      <main className="main">
        {banner && (
          <NavLink
            to="/billing"
            className={`badge ${banner.klass}`}
            style={{
              display: 'block',
              marginBottom: 16,
              padding: '9px 14px',
              fontSize: 13,
              borderRadius: 8,
            }}
          >
            {banner.matn(billing!.daysLeft)} {canBilling ? '— boshqarish →' : ''}
          </NavLink>
        )}
        <Outlet />
      </main>
    </div>
  );
}
