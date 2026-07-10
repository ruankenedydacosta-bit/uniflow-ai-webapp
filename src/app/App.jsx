import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import { AccessProvider, useAccess } from './AccessContext';
import { canAccessRoute, getFallbackRoute } from './accessRules';
import { navigationItems } from './navigation';
import { appRoutes, publicRoutes } from './routes';

function AppContent() {
  const { access } = useAccess();
  const location = useLocation();
  const activeRoute = appRoutes.find((route) => route.path === location.pathname);
  const activeNavigationItem = navigationItems.find((item) => item.path === location.pathname);
  const isPublicRoute = publicRoutes.some((route) => route.path === location.pathname);

  if (isPublicRoute) {
    return (
      <Routes>
        {publicRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    );
  }

  if (activeRoute && !canAccessRoute(activeNavigationItem, access)) {
    return <Navigate to={getFallbackRoute()} replace />;
  }

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
    </AccessProvider>
  );
}

export default App;
