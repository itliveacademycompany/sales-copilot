import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { ANALITIKA_BOLIMLAR } from '../analyticsSections';
import { api, type BillingStatus } from '../api';
import { SAHIFA } from '../sahifalar';
import { useAuth } from '../auth';
import { useT } from '../i18n';
import { Ikon, type IkonNomi } from '../icons';

/**
 * Obuna banneri.
 *
 * Matn `t` orqali o'tadi va son O'RINBOSAR bilan beriladi: rus va
 * ingliz tilida so'z tartibi boshqacha, `d + " kun qoldi"` shaklidagi
 * yig'ishni tarjima qilib bo'lmasdi.
 */
const BANNER: Record<string, { klass: string; kalit: string }> = {
  trial: { klass: 'sariq', kalit: 'Sinov muddati: {n} kun qoldi' },
  grace: {
    klass: 'toq',
    kalit: "To'lov kechikdi — {n} kundan keyin tahlil to'xtaydi",
  },
  degraded: {
    klass: 'qizil',
    kalit: "Obuna faol emas — yangi tahlil to'xtatilgan. Balansni to'ldiring.",
  },
};

/**
 * Asosiy sxema: navy yon panel + krem kontent maydoni.
 * Yon panelda yangi ogohlantirishlar soni va obuna banneri jonli ko'rinadi.
 */
export function Layout() {
  const { user, business, logout } = useAuth();
  const t = useT();
  const [unseen, setUnseen] = useState(0);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [menyu, setMenyu] = useState(false);
  /** `null` — foydalanuvchi tegmagan, joylashuvga qarab ochiladi. */
  const [qoldaOchiq, setQoldaOchiq] = useState<boolean | null>(null);
  const joylashuv = useLocation();

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

  /**
   * Yon panel havolasi.
   *
   * `onMouseEnter` / `onFocus` da sahifa bo'lagi FONDA yuklanadi.
   * Sabab: sahifalar talab bo'yicha yuklanadi (`App.tsx`), va tekkan
   * paytdan bosilgan paytgacha odatda 200-300 ms bo'ladi — bu bo'lakni
   * olishga yetadi, ya'ni o'tish bir zumda ko'rinadi.
   *
   * `once` bayrog'i yo'q: `oldindanYukla` ichida modul keshi bor,
   * takroriy chaqiruv yangi so'rov yubormaydi.
   */
  const item = (
    to: string,
    ikon: IkonNomi,
    nom: string,
    soni?: number,
    oldindan?: { oldindanYukla: () => void },
  ) => (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
      onClick={() => setMenyu(false)}
      onMouseEnter={() => oldindan?.oldindanYukla()}
      onFocus={() => oldindan?.oldindanYukla()}
    >
      <span className="ikon">
        <Ikon nom={ikon} />
      </span>
      {nom}
      {soni !== undefined && soni > 0 && <span className="soni">{soni}</span>}
    </NavLink>
  );

  /**
   * Analitika — ochiladigan guruh.
   *
   * Guruh ichida bo'lganda AVTOMATIK ochiladi (`analitikadaMi`), aks
   * holda foydalanuvchi bo'limga o'tgach, yon panel qaysi bo'lim
   * ochiqligini ko'rsatmay qolardi. Qo'lda yopish ham mumkin —
   * `qoldaOchiq` shuning uchun uchinchi holatga (`null`) ega.
   */
  const analitikadaMi = joylashuv.pathname.startsWith('/analitika');
  const analitikaOchiq = qoldaOchiq ?? analitikadaMi;

  /**
   * Sahifa almashganda qo'lda tanlov bekor qilinadi.
   *
   * Aks holda foydalanuvchi guruhni bir marta yopsa, keyin analitika
   * bo'limiga o'tganda ham yon panel yopiq qolardi — ya'ni qaysi bo'lim
   * ochiqligi ko'rinmasdi. Endi qo'lda yopish faqat keyingi o'tishgacha
   * amal qiladi.
   */
  useEffect(() => {
    setQoldaOchiq(null);
  }, [joylashuv.pathname]);

  const banner = billing ? BANNER[billing.status] : undefined;

  return (
    <div className="shell">
      {/* Mobil tepa bar — 860px dan pastda ko'rinadi (TZ 8.1 #4) */}
      <div className="topbar">
        <button
          className="menyu-tugma"
          aria-label={menyu ? t('Menyuni yopish') : t('Menyuni ochish')}
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
        <button className="fon-parda" aria-label={t('Menyuni yopish')} onClick={() => setMenyu(false)} />
      )}
      <aside className={`sidebar${menyu ? ' ochiq' : ''}`}>
        <div className="logo">
          Sotuv<em>AI</em>
        </div>
        <div className="biz">{business?.name}</div>
        {item(
          '/',
          rahbar ? 'dashboard' : 'shaxsiy',
          rahbar ? t('Dashboard') : t('Mening kabinetim'),
          undefined,
          rahbar ? SAHIFA.dashboard : SAHIFA.seatCabinet,
        )}
        {rahbar && (
          <div className={`nav-guruh${analitikaOchiq ? ' ochiq' : ''}`}>
            <button
              type="button"
              className={`nav-item guruh-bosh${analitikadaMi ? ' active' : ''}`}
              aria-expanded={analitikaOchiq}
              onClick={() => setQoldaOchiq(!analitikaOchiq)}
            >
              <span className="ikon">
                <Ikon nom="analitika" />
              </span>
              {t('Analitika')}
              <span className="strelka" aria-hidden="true">
                ⌄
              </span>
            </button>

            {/* Ichkarida BITTA o'ram bo'lishi shart: `grid-template-rows`
                0fr→1fr hiylasi faqat yagona bolaning balandligini
                yig'adi, bir nechta bola bo'lsa qolganlari avtomatik
                qatorga tushib, yopilmay qoladi. */}
            <div className="guruh-ich">
              <div className="guruh-royxat" role="group" aria-label={t("Analitika bo'limlari")}>
                {ANALITIKA_BOLIMLAR.map((b) => (
                  <NavLink
                    key={b.slug}
                    to={`/analitika/${b.slug}`}
                    className={({ isActive }) => `nav-ost${isActive ? ' active' : ''}`}
                    onClick={() => setMenyu(false)}
                    onMouseEnter={() => SAHIFA.analytics.oldindanYukla()}
                  >
                    <span className="belgi" aria-hidden="true" />
                    {t(b.nom)}
                  </NavLink>
                ))}
              </div>
            </div>
          </div>
        )}
        {rahbar &&
          item('/kunlik-hisobot', 'kalendar', t('Kunlik hisobot'), undefined, SAHIFA.dailyReport)}
        {rahbar && item('/lidlar', 'hujjat', t('Lid xulosalari'), undefined, SAHIFA.leads)}
        {item(
          '/suhbatlar',
          'suhbat',
          rahbar ? t('Suhbatlar') : t('Mening suhbatlarim'),
          undefined,
          SAHIFA.conversations,
        )}
        {item(
          '/vazifalar',
          'vazifa',
          rahbar ? t('Vazifalar') : t('Mening vazifalarim'),
          undefined,
          SAHIFA.tasks,
        )}
        {ogohKoradi &&
          item('/ogohlantirishlar', 'qongiroq', t('Ogohlantirishlar'), unseen, SAHIFA.alerts)}
        {playbookKoradi &&
          item('/playbook', 'yulduz', t('Baholash mezonlari'), undefined, SAHIFA.playbook)}
        {canBilling && item('/billing', 'karta', t("To'lov"), undefined, SAHIFA.billing)}
        {item('/sozlamalar', 'sozlama', t('Sozlamalar'), undefined, SAHIFA.settings)}
        <div className="foot">
          <div className="ism">{user?.displayName}</div>
          <div>{user?.email}</div>
          <button onClick={() => void logout()}>{t('Chiqish')}</button>
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
            {t(banner.kalit, { n: billing!.daysLeft ?? '?' })}{' '}
            {canBilling ? t('— boshqarish →') : ''}
          </NavLink>
        )}
        <Outlet />
      </main>
    </div>
  );
}
