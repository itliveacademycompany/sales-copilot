import {
  Bell,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChartNoAxesColumnIncreasing,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  ContactRound,
  FileText,
  ListChecks,
  PlugZap,
  LayoutGrid,
  LogOut,
  Menu,
  MessagesSquare,
  MonitorPlay,
  Phone,
  Settings as SozlamaIkon,
  Sparkles,
  X,
} from 'lucide-react';
import { useEffect, useState, type ReactNode, Suspense } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { crmdami, useIlovaYoliniEsla, useIlovaYollari } from './IlovaAlmashtirgich';
import { useMenyuVoronkalari, type MenyuVoronka } from '../crm/voronkalar';
import '../crm/crm-mavzu.css';
import { MANZIL_SAHIFA } from '../sahifalar';
import { XatoChegarasi } from './XatoChegarasi';
import { api, type BillingStatus } from '../api';
import { useAuth } from '../auth';
import { useT } from '../i18n';

const MENYU_KALIT = 'sotuvai-menyu';

/** Matn — lug'at kaliti (`lugat/umumiy.ts`); `{kun}` o'rniga qolgan kunlar soni qo'yiladi. */
const BANNER: Record<string, { klass: string; matn: string }> = {
  grace: { klass: 'toq', matn: "To'lov kechikdi — {kun} kundan keyin tahlil to'xtaydi" },
  degraded: {
    klass: 'qizil',
    matn: "Obuna faol emas — yangi tahlil to'xtatilgan. Balansni to'ldiring.",
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
  const crmUlaydi = business?.permissions.includes('integration:manage') ?? false;
  const crmSozlaydi = business?.permissions.includes('business:write') ?? false;
  /** Ichki CRM: rahbar — hammasi, sotuvchi — o'z bitimlari (server ham shunday tekshiradi). */
  const crmIlova = Boolean(
    business &&
      (business.permissions.includes('analytics:read:all') ||
        business.permissions.includes('task:read:all') ||
        business.seatId),
  );
  const loc = useLocation();
  const crmda = crmIlova && crmdami(loc.pathname);

  /** Metasell'dagidek har voronka menyuda alohida bo'lim — ro'yxatni CrmIlova beradi. */
  const voronkalar = useMenyuVoronkalari();
  const joriyVoronka = new URLSearchParams(loc.search).get('v');
  const ilovaYollari = useIlovaYollari();
  useIlovaYoliniEsla();

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
      // Sichqoncha tekkan paytdan bosishgacha ~100-300 ms o'tadi — sahifa bo'lagi shu orada yuklanadi.
      onMouseEnter={() => MANZIL_SAHIFA[to]?.oldindanYukla()}
      onFocus={() => MANZIL_SAHIFA[to]?.oldindanYukla()}
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

  /**
   * Voronka bandi: hammasi bitta `/crm/bitimlar` sahifasi, farqi `?v=` da —
   * shuning uchun faollik NavLink bilan emas, manzildagi voronka ID bilan
   * aniqlanadi (`v` yo'q bo'lsa — asosiy voronka).
   */
  const voronkaItem = (v: MenyuVoronka) => {
    const faol = loc.pathname === '/crm/bitimlar' && (joriyVoronka ? joriyVoronka === v.id : v.isMain);
    return (
      <Link
        key={v.id}
        to={`/crm/bitimlar?v=${v.id}`}
        className={`nav-item${faol ? ' active' : ''}`}
        aria-current={faol ? 'page' : undefined}
        onClick={() => setMenyu(false)}
        title={keng ? undefined : v.name}
      >
        <span className="ikon">
          <BriefcaseBusiness />
        </span>
        <span className="nom">{v.name}</span>
      </Link>
    );
  };

  const banner = billing ? BANNER[billing.status] : undefined;

  /**
   * Logo ham almashtirgich: SotuvAI da bosilsa CRM ga o'tadi, CRM da bosilsa
   * SotuvAI ga qaytadi (har ilovaning oxirgi ochilgan sahifasiga).
   */
  const logoIchi = (
    <>
      <span className="logo-belgi" aria-hidden="true">
        <Sparkles />
      </span>
      <span className="logo-matn">
        Sotuv<em>AI</em>
      </span>
    </>
  );
  const logoNomi = crmda ? t('SotuvAI ga qaytish') : t("CRM ga o'tish");
  const logo = crmIlova ? (
    <Link
      to={crmda ? ilovaYollari.sotuvYol : ilovaYollari.crmYol}
      className="logo logo-almash"
      aria-label={logoNomi}
      title={logoNomi}
      onClick={() => setMenyu(false)}
    >
      {logoIchi}
    </Link>
  ) : (
    <div className="logo">{logoIchi}</div>
  );

  return (
    <div className={`shell${keng ? '' : ' tor'}${crmda ? ' crm-rejim' : ''}`}>
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
        {logo}
      </div>
      {menyu && (
        <button className="fon-parda" aria-label={t('Menyuni yopish')} onClick={() => setMenyu(false)} />
      )}
      <aside className={`sidebar${menyu ? ' ochiq' : ''}${keng ? ' keng' : ''}`}>
        {logo}
        <div className="biz">{business?.name}</div>

        <div className="menyu-sarlavha">{t('Menyu')}</div>
        <nav className="nav-royxat" aria-label={t('Asosiy menyu')}>
          {crmda ? (
            <>
              {/* CRM ilovasi menyusi (Metasell tartibi) — logo bilan SotuvAI ga almashadi */}
              {item('/crm/ish-stoli', <LayoutGrid />, 'Asosiy')}
              {voronkalar.length > 0
                ? voronkalar.map((v) => voronkaItem(v))
                : item('/crm/bitimlar', <BriefcaseBusiness />, 'Lidlar')}
              {item('/crm/vazifalar', <ListChecks />, 'Vazifalar')}
              {item('/crm/ai-chat', <MessagesSquare />, 'AI Chat')}
              {item('/crm/kontaktlar', <ContactRound />, 'Kontaktlar')}
              {item('/crm/kompaniyalar', <Building2 />, 'Kompaniyalar')}
              {item('/crm/qongiroqlar', <Phone />, "Qo'ng'iroqlar")}
              {rahbar && item('/crm/analitika', <ChartNoAxesColumnIncreasing />, 'Analitika')}
              {rahbar && item('/crm/hisobotlar', <CalendarDays />, 'Hisobotlar')}
              {item('/crm/lid-xulosalari', <FileText />, 'Lid xulosalari')}
              {ogohKoradi && item('/crm/ogohlantirishlar', <Bell />, 'Ogohlantirishlar', unseen)}
              {crmUlaydi && item('/crm/integratsiya', <PlugZap />, 'Integratsiya')}
            </>
          ) : (
            <>
              {item('/', <LayoutGrid />, 'Bosh sahifa')}
              {item('/qongiroqlar', <Phone />, 'Qo\'ng\'iroqlar')}
              {item('/ai-chat', <MessagesSquare />, 'AI Chat')}
              {rahbar && item('/analitika', <ChartNoAxesColumnIncreasing />, 'Analitika')}
              {rahbar && item('/kunlik-hisobot', <CalendarDays />, 'Kunlik hisobot')}
              {item('/lidlar', <FileText />, 'Lid xulosalari')}
              {/* Tashqi CRM (amoCRM, Bitrix24) ulash endi CRM ilovasida — /crm/integratsiya */}
              {!crmIlova && crmUlaydi && item('/crm/integratsiya', <PlugZap />, 'CRM')}
              {ogohKoradi && item('/ogohlantirishlar', <Bell />, 'Ogohlantirishlar', unseen)}
              {item('/qollanma', <MonitorPlay />, "Qo'llanma")}
            </>
          )}
          {/* Suhbatlar, Vazifalar, Mezonlar, To'lov menyudan olib tashlandi —
              sahifalar manzili saqlanadi (boshqa bo'limlardagi havolalar ishlaydi) */}
        </nav>

        <div className="nav-pastki">
          {crmda
            ? crmSozlaydi && item('/crm/sozlamalar', <SozlamaIkon />, 'CRM sozlamalari')
            : item('/sozlamalar', <SozlamaIkon />, 'Sozlamalar')}
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
                aria-label={t('Chiqish')}
                title={`${t('Chiqish')} (${user?.displayName ?? ''})`}
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
            {t(banner.matn, { kun: billing!.daysLeft ?? '?' })}{' '}
            {canBilling && (
              <>
                — {t('boshqarish')} <ChevronRight />
              </>
            )}
          </NavLink>
        )}
        {/* Sahifadagi xato menyuni o'chirib yubormasin; boshqa bo'limga o'tilsa chegara tiklanadi */}
        <XatoChegarasi kalit={loc.pathname}>
          <Suspense fallback={<div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>}>
            <Outlet />
          </Suspense>
        </XatoChegarasi>
      </main>
    </div>
  );
}
