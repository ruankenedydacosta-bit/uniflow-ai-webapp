import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import AccessModeSwitcher from '../components/dev/AccessModeSwitcher';
import { AccessProvider } from './AccessContext';
import { appRoutes } from './routes';

function AppContent() {
  const location = useLocation();
  const activeRoute = appRoutes.find((route) => route.path === location.pathname);

  return (
    <AppShell title={activeRoute?.title ?? 'Dashboard'}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {appRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AppShell>
  );
}

function App() {
  return (
    <AccessProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
      <AccessModeSwitcher />
    </AccessProvider>
  );
}

export default App;
