import { LogOut } from 'lucide-react';
import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { SAHIFA } from './sahifalar';
import { Login } from './pages/Login';

export function App() {
  const { loading, user, business, logout } = useAuth();

  if (loading) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  /**
   * FR-06: parol tiklash havolasi auth tekshiruvidan OLDIN keladi.
   * Aks holda parolni unutgan odam kirish ekranidan nariga o'ta olmasdi —
   * havolani bosgan bo'lsa ham.
   */
  if (!user || !business) {
    return (
      <Suspense fallback={<div className="yuklanmoqda">Yuklanmoqda…</div>}>
      <Routes>
        <Route path="/parol-tiklash/:token" element={<SAHIFA.passwordReset />} />
        {/* FR-04: menejer aktivatsiyasi — hisob hali yo'q, shuning uchun bu yerda */}
        <Route path="/aktivatsiya/:token" element={<SAHIFA.aktivatsiya />} />
        {/* Birinchi navbatda — "Loyiha haqida" landing'i, undan "Kirish" → login.
            Boshqa har qanday manzil login'ni ochadi: kirgandan keyin odam
            o'sha sahifada qoladi. */}
        <Route path="/" element={<SAHIFA.loyiha />} />
        <Route path="*" element={<Login />} />
      </Routes>
      </Suspense>
    );
  }

  // FR-10/17: onboarding tugamagan bo'lsa, hamma yo'l shu sehrgarga olib
  // boradi — mahsulotni sozlamasdan turib bo'sh dashboard'ga tushish
  // chalkash tajriba bo'lardi.
  /**
   * Kirishdan keyin ochiladigan "Loyiha haqida" sahifasi — yon panelsiz,
   * o'z tepa paneli bilan. Onboarding tugamagan bo'lsa ham ko'rinadi:
   * aynan yangi mijoz uchun tanishuv eng kerakli.
   */
  const loyiha = (
    <Suspense fallback={<div className="yuklanmoqda">Yuklanmoqda…</div>}>
      <SAHIFA.loyiha />
    </Suspense>
  );

  if (business.onboardingStep !== 'done') {
    return (
      <Routes>
        <Route path="/loyiha" element={loyiha} />
        <Route
          path="*"
          element={
            <div className="main" style={{ marginLeft: 0, maxWidth: 900, margin: '0 auto', paddingTop: 40 }}>
              {/* Sehrgardan chiqish yo'li — aks holda boshqa akkauntga o'tib bo'lmaydi */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <span style={{ fontSize: 13, opacity: 0.7 }}>{user.email}</span>
                <button className="btn ikkinchi kichik" onClick={() => void logout()}>
                  <LogOut size={16} /> Chiqish
                </button>
              </div>
              <Suspense fallback={<div className="yuklanmoqda">Yuklanmoqda…</div>}>
                <SAHIFA.onboarding />
              </Suspense>
            </div>
          }
        />
      </Routes>
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
      {/* Kirgan odam (masalan rahbar) havolani ochsa ham sahifa ko'rinsin —
          aks holda u jimgina bosh sahifaga otilardi. Aktivatsiya sessiyani
          yangi menejernikiga almashtiradi. */}
      <Route path="/aktivatsiya/:token" element={<Suspense fallback={<div className="yuklanmoqda">Yuklanmoqda…</div>}><SAHIFA.aktivatsiya /></Suspense>} />
      <Route path="/loyiha" element={loyiha} />
      {/* Claude (MCP) ulanishiga ruxsat — kirmagan bo'lsa avval kirish ekrani chiqadi, URL saqlanadi */}
      <Route path="/mcp/ruxsat" element={<Suspense fallback={<div className="yuklanmoqda">Yuklanmoqda…</div>}><SAHIFA.mcpRuxsat /></Suspense>} />
      <Route element={<Layout />}>
        <Route path="/" element={rahbar ? <SAHIFA.dashboard /> : <SAHIFA.seatCabinet />} />
        <Route path="/sotuvchi/:seatId" element={<SAHIFA.seatCabinet />} />
        <Route path="/suhbatlar" element={<SAHIFA.conversations />} />
        <Route path="/suhbatlar/:id" element={<SAHIFA.conversationDetail />} />
        <Route path="/vazifalar" element={<SAHIFA.tasks />} />
        <Route path="/ogohlantirishlar" element={<SAHIFA.alerts />} />
        <Route path="/qongiroqlar" element={<SAHIFA.qongiroqlar />} />
        <Route path="/ai-chat" element={<SAHIFA.aiChat />} />
        <Route path="/lidlar" element={<SAHIFA.lidlar />} />
        <Route path="/lidlar/:id" element={<SAHIFA.lidTafsilot />} />
        {/* Jamoa analitikasi va hisobot — faqat rahbar (server ham tekshiradi) */}
        {rahbar && <Route path="/analitika" element={<SAHIFA.analitika />} />}
        {rahbar && <Route path="/kunlik-hisobot" element={<SAHIFA.kunlikHisobot />} />}
        <Route path="/playbook" element={<SAHIFA.playbook />} />
        <Route path="/billing" element={<SAHIFA.billing />} />
        <Route path="/sozlamalar" element={<SAHIFA.settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
