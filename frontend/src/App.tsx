import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ANALITIKA_BOSH } from './analyticsSections';
import { SOZLAMA_BOSH } from './settingsSections';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { useT } from './i18n';
import { Login } from './pages/Login';
import { SAHIFA } from './sahifalar';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MARSHRUTLAR — sahifalar TALAB BO'YICHA yuklanadi
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * NEGA BO'LINGAN
 * ──────────────
 * Ilgari hamma sahifa statik import qilinardi va natijada BITTA 516 KB lik
 * fayl chiqardi. Ya'ni kirish ekranini ochgan odam ham Analitika (2400
 * qator), Sozlamalar (3000 qator) va grafik kutubxonasini yuklab olardi —
 * u yerlarga hech qachon bormasa ham.
 *
 * Loyihada faqat uchta tashqi kutubxona bor (react, react-dom,
 * react-router), demak hajmning katta qismi — bizning kodimiz. Shuning
 * uchun eng samarali yechim aynan marshrut bo'yicha bo'lish.
 *
 * NIMA ENG BOSHIDA QOLADI
 * ───────────────────────
 * `Login` va `Layout` — ular birinchi ekranda darhol kerak. Ularni ham
 * kechiktirsak, foydalanuvchi bo'sh ekranga qarab turardi.
 *
 * SEKINLASHIB QOLMAYDIMI
 * ──────────────────────
 * Yo'q: `oldindanYukla` sichqoncha havolaga tekkanda bo'lakni fonda
 * yuklaydi. Bosishgacha odatda 200-300 ms bo'ladi va bu ko'p hollarda
 * yuklashga yetadi — ya'ni o'tish bir zumda ko'rinadi.
 */

/**
 * Bo'lak yuklanayotgandagi ekran.
 *
 * Ataylab juda oddiy: bu holat odatda 50-150 ms davom etadi va bu vaqtda
 * skelet chizish faqat miltillash hosil qilardi.
 */
function Kutish() {
  const t = useT();
  return <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>;
}

export function App() {
  const { loading, user, business } = useAuth();
  const t = useT();

  if (loading) return <div className="yuklanmoqda">{t('Yuklanmoqda…')}</div>;

  /**
   * FR-06: parol tiklash havolasi auth tekshiruvidan OLDIN keladi.
   * Aks holda parolni unutgan odam kirish ekranidan nariga o'ta olmasdi —
   * havolani bosgan bo'lsa ham.
   */
  if (!user || !business) {
    return (
      <Suspense fallback={<Kutish />}>
        <Routes>
          <Route path="/parol-tiklash/:token" element={<SAHIFA.passwordReset />} />
          <Route path="*" element={<Login />} />
        </Routes>
      </Suspense>
    );
  }

  // FR-10/17: onboarding tugamagan bo'lsa, hamma yo'l shu sehrgarga olib
  // boradi — mahsulotni sozlamasdan turib bo'sh dashboard'ga tushish
  // chalkash tajriba bo'lardi.
  if (business.onboardingStep !== 'done') {
    return (
      <div className="main" style={{ marginLeft: 0, maxWidth: 900, margin: '0 auto', paddingTop: 40 }}>
        <Suspense fallback={<Kutish />}>
          <SAHIFA.onboarding />
        </Suspense>
      </div>
    );
  }

  /**
   * FR-112: sotuvchi uchun bosh sahifa — jamoa dashboard'i emas, o'z
   * kabineti. Rahbar dashboard'i unga baribir 403 qaytarardi, ya'ni
   * "bo'sh ekran" o'rniga foydali ekran ko'rsatiladi.
   */
  const rahbar = business.permissions.includes('analytics:read:all');

  return (
    <Routes>
      <Route element={<Layout />}>
        {/*
          `Suspense` marshrutlarning ICHIDA, `Layout` ning ostida:
          shunda sahifa bo'lagi yuklanayotganda yon panel joyida qoladi
          va ekran to'liq oqarib ketmaydi.
        */}
        <Route
          path="/"
          element={
            <Suspense fallback={<Kutish />}>
              {rahbar ? <SAHIFA.dashboard /> : <SAHIFA.seatCabinet />}
            </Suspense>
          }
        />
        {/* Analitika faqat rahbarga: backend baribir 403 qaytaradi,
            shuning uchun sotuvchi bosh sahifaga qaytariladi.

            Bo'lim URL'ning bir qismi (`/analitika/sifat`) — yon panel
            havolalari, brauzer tarixi va havola ulashish shu tufayli
            ishlaydi. Bo'limsiz kelinsa, birinchisiga yo'naltiriladi. */}
        <Route
          path="/analitika"
          element={rahbar ? <Navigate to={`/analitika/${ANALITIKA_BOSH}`} replace /> : <Navigate to="/" replace />}
        />
        <Route
          path="/analitika/:bolim"
          element={
            rahbar ? (
              <Suspense fallback={<Kutish />}>
                <SAHIFA.analytics />
              </Suspense>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        {/* Kunlik hisobot ham analitika huquqini talab qiladi. */}
        <Route
          path="/kunlik-hisobot"
          element={
            rahbar ? (
              <Suspense fallback={<Kutish />}>
                <SAHIFA.dailyReport />
              </Suspense>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        {/* Lid xulosalari — analitika huquqi talab qilinadi. */}
        <Route
          path="/lidlar"
          element={
            rahbar ? (
              <Suspense fallback={<Kutish />}>
                <SAHIFA.leads />
              </Suspense>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/lidlar/:contactId"
          element={
            rahbar ? (
              <Suspense fallback={<Kutish />}>
                <SAHIFA.leadDetail />
              </Suspense>
            ) : (
              <Navigate to="/" replace />
            )
          }
        />
        <Route
          path="/sotuvchi/:seatId"
          element={
            <Suspense fallback={<Kutish />}>
              <SAHIFA.seatCabinet />
            </Suspense>
          }
        />
        <Route
          path="/suhbatlar"
          element={
            <Suspense fallback={<Kutish />}>
              <SAHIFA.conversations />
            </Suspense>
          }
        />
        <Route
          path="/suhbatlar/:id"
          element={
            <Suspense fallback={<Kutish />}>
              <SAHIFA.conversationDetail />
            </Suspense>
          }
        />
        <Route
          path="/vazifalar"
          element={
            <Suspense fallback={<Kutish />}>
              <SAHIFA.tasks />
            </Suspense>
          }
        />
        <Route
          path="/ogohlantirishlar"
          element={
            <Suspense fallback={<Kutish />}>
              <SAHIFA.alerts />
            </Suspense>
          }
        />
        <Route
          path="/playbook"
          element={
            <Suspense fallback={<Kutish />}>
              <SAHIFA.playbook />
            </Suspense>
          }
        />
        <Route
          path="/billing"
          element={
            <Suspense fallback={<Kutish />}>
              <SAHIFA.billing />
            </Suspense>
          }
        />
        {/* Sozlamalar bo'limi manzilda — havola ulashish va orqaga
            qaytish shu tufayli ishlaydi. */}
        <Route path="/sozlamalar" element={<Navigate to={`/sozlamalar/${SOZLAMA_BOSH}`} replace />} />
        <Route
          path="/sozlamalar/:bolim"
          element={
            <Suspense fallback={<Kutish />}>
              <SAHIFA.settings />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
