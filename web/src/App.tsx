import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/layout/AppShell';
import { OnboardingPage } from './pages/OnboardingPage';
import { DashboardPage } from './pages/DashboardPage';
import { LibraryPage } from './pages/LibraryPage';
import { DevicesPage } from './pages/DevicesPage';
import { useAppStore } from './store/useAppStore';

function App() {
  const onboardingComplete = useAppStore((s) => s.onboardingComplete);

  if (!onboardingComplete) {
    return (
      <Routes>
        <Route path="*" element={<OnboardingPage />} />
      </Routes>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/devices" element={<DevicesPage />} />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}

export default App;
