import {
  Bell,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  FileText,
  LayoutGrid,
  LogOut,
  Menu,
  MessagesSquare,
  Phone,
  Settings as SozlamaIkon,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { api, type BillingStatus } from '../api';
import { useAuth } from '../auth';
import { useT } from '../i18n';

const MENYU_KALIT = 'sotuvai-menyu';

const BANNER: Record<string, { klass: string; matn: (d: number | null) => string }> = {
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

  /**
   * Menyu ikki ko'rinishda: tor (ikon tepada, nom pastda) va keng.
   * Tanlov brauzerda eslab qolinadi. Mobil ekranda panel har doim keng
   * (off-canvas) — bu CSS'da hal qilinadi.
   */
  const [keng, setKeng] = useState(() => {
    try {
      return localStorage.getItem(MENYU_KALIT) === 'keng';
    } catch {
      return false;
    }
  });
  // Sozlamalar → Ko'rinish'dan o'zgartirilsa ham darhol qo'llansin
  useEffect(() => {
    const tingla = (e: Event) => setKeng((e as CustomEvent<boolean>).detail);
    window.addEventListener('sotuvai-menyu', tingla);
    return () => window.removeEventListener('sotuvai-menyu', tingla);
  }, []);
  const kengniAlmashtir = () => {
    setKeng((v) => {
      try {
        localStorage.setItem(MENYU_KALIT, v ? 'tor' : 'keng');
      } catch {
        /* xotira yopiq bo'lsa ham menyu ishlaydi */
      }
      return !v;
    });
  };

  const t = useT();
  const item = (to: string, ikon: ReactNode, uzNom: string, soni?: number) => {
    const nom = t(uzNom);
    return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      onClick={() => setMenyu(false)}
      title={keng ? undefined : nom}
    >
      <span className="ikon">
        {ikon}
        {soni !== undefined && soni > 0 && <span className="soni">{soni}</span>}
      </span>
      <span className="nom">{nom}</span>
    </NavLink>
    );
  };

  const banner = billing ? BANNER[billing.status] : undefined;

  return (
    <div className={`shell${keng ? '' : ' tor'}`}>
      {/* Mobil tepa bar — 860px dan pastda ko'rinadi (TZ 8.1 #4) */}
      <div className="topbar">
        <button
          className="menyu-tugma"
          aria-label={menyu ? t('Menyuni yopish') : t('Menyuni ochish')}
          aria-expanded={menyu}
          onClick={() => setMenyu((v) => !v)}
        >
          {menyu ? <X /> : <Menu />}
        </button>
        <div className="logo">
          <span className="logo-belgi" aria-hidden="true">
            <Sparkles />
          </span>
          <span className="logo-matn">
            Sotuv<em>AI</em>
          </span>
        </div>
      </div>
      {menyu && (
        <button className="fon-parda" aria-label="Menyuni yopish" onClick={() => setMenyu(false)} />
      )}
      <aside className={`sidebar${menyu ? ' ochiq' : ''}${keng ? ' keng' : ''}`}>
        <div className="logo">
          <span className="logo-belgi" aria-hidden="true">
            <Sparkles />
          </span>
          <span className="logo-matn">
            Sotuv<em>AI</em>
          </span>
        </div>
        <div className="biz">{business?.name}</div>

        <div className="menyu-sarlavha">{t('Menyu')}</div>
        <nav className="nav-royxat" aria-label={t('Asosiy menyu')}>
          {item('/', <LayoutGrid />, 'Bosh sahifa')}
          {item('/qongiroqlar', <Phone />, 'Qo\'ng\'iroqlar')}
          {item('/ai-chat', <MessagesSquare />, 'AI Chat')}
          {rahbar && item('/analitika', <ChartNoAxesColumnIncreasing />, 'Analitika')}
          {rahbar && item('/kunlik-hisobot', <CalendarDays />, 'Kunlik hisobot')}
          {item('/lidlar', <FileText />, 'Lid xulosalari')}
          {ogohKoradi && item('/ogohlantirishlar', <Bell />, 'Ogohlantirishlar', unseen)}
          {/* Suhbatlar, Vazifalar, Mezonlar, To'lov menyudan olib tashlandi —
              sahifalar manzili saqlanadi (boshqa bo'limlardagi havolalar ishlaydi) */}
        </nav>

        <div className="nav-pastki">
          {item('/sozlamalar', <SozlamaIkon />, 'Sozlamalar')}
          <div className="foot">
            <div className="ism">{user?.displayName}</div>
            <div>{user?.email}</div>
            <button onClick={() => void logout()}>
              <LogOut /> {t('Chiqish')}
            </button>
          </div>
          <div className="pastki-qator">
            {/* Tor menyuda foydalanuvchi bloki yashirin — chiqish shu yerda */}
            {!keng && (
              <button
                className="kengaytir chiqish-tor"
                onClick={() => void logout()}
                aria-label="Chiqish"
                title={`Chiqish (${user?.displayName ?? ''})`}
              >
                <LogOut />
              </button>
            )}
            <button
              className="kengaytir"
              onClick={kengniAlmashtir}
              aria-label={keng ? t('Menyuni toraytirish') : t('Menyuni kengaytirish')}
              aria-expanded={keng}
              title={keng ? t('Toraytirish') : t('Kengaytirish')}
            >
              {keng ? <ChevronsLeft /> : <ChevronsRight />}
            </button>
          </div>
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
            {banner.matn(billing!.daysLeft)}{' '}
            {canBilling && (
              <>
                — boshqarish <ChevronRight />
              </>
            )}
          </NavLink>
        )}
        <Outlet />
      </main>
    </div>
  );
}
