import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import { Layout } from './components/Layout';
import { Alerts } from './pages/Alerts';
import { Billing } from './pages/Billing';
import { ConversationDetail } from './pages/ConversationDetail';
import { Conversations } from './pages/Conversations';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { Onboarding } from './pages/Onboarding';
import { PasswordReset } from './pages/PasswordReset';
import { PlaybookEditor } from './pages/PlaybookEditor';
import { SeatCabinet } from './pages/SeatCabinet';
import { Settings } from './pages/Settings';
import { Tasks } from './pages/Tasks';

export function App() {
  const { loading, user, business } = useAuth();

  if (loading) return <div className="yuklanmoqda">Yuklanmoqda…</div>;

  /**
   * FR-06: parol tiklash havolasi auth tekshiruvidan OLDIN keladi.
   * Aks holda parolni unutgan odam kirish ekranidan nariga o'ta olmasdi —
   * havolani bosgan bo'lsa ham.
   */
  if (!user || !business) {
    return (
      <Routes>
        <Route path="/parol-tiklash/:token" element={<PasswordReset />} />
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  // FR-10/17: onboarding tugamagan bo'lsa, hamma yo'l shu sehrgarga olib
  // boradi — mahsulotni sozlamasdan turib bo'sh dashboard'ga tushish
  // chalkash tajriba bo'lardi.
  if (business.onboardingStep !== 'done') {
    return (
      <div className="main" style={{ marginLeft: 0, maxWidth: 900, margin: '0 auto', paddingTop: 40 }}>
        <Onboarding />
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
        <Route path="/" element={rahbar ? <Dashboard /> : <SeatCabinet />} />
        <Route path="/sotuvchi/:seatId" element={<SeatCabinet />} />
        <Route path="/suhbatlar" element={<Conversations />} />
        <Route path="/suhbatlar/:id" element={<ConversationDetail />} />
        <Route path="/vazifalar" element={<Tasks />} />
        <Route path="/ogohlantirishlar" element={<Alerts />} />
        <Route path="/playbook" element={<PlaybookEditor />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/sozlamalar" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
