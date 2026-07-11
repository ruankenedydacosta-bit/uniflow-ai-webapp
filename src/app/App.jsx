import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from '../components/layout/AppShell';
import Loader from '../components/ui/Loader';
import { AccessProvider, useAccess } from './AccessContext';
import { SessionProvider, useSession } from './SessionContext';
import { canAccessRoute, getFallbackRoute } from './accessRules';
import { navigationItems } from './navigation';
import { appRoutes, publicRoutes } from './routes';

function AppContent() {
  const { access } = useAccess();
  const {
    error: sessionError,
    isLoading: isSessionLoading,
    isSupabaseConfigured,
    profile,
    profileMissing,
    session,
  } = useSession();
  const location = useLocation();
  const activeRoute = appRoutes.find((route) => route.path === location.pathname);
  const activeNavigationItem = navigationItems.find((item) => item.path === location.pathname);
  const isPublicRoute = publicRoutes.some((route) => route.path === location.pathname);

  if (isSupabaseConfigured && isSessionLoading) {
    return <Loader fullScreen label="Carregando sua sessão" />;
  }

  if (isPublicRoute) {
    if (isSupabaseConfigured) {
      if (location.pathname === '/login' && session && profile && !sessionError) {
        return <Navigate to="/dashboard" replace />;
      }

      if (location.pathname === '/onboarding') {
        if (!session) {
          return <Navigate to="/login" replace />;
        }

        if (profile && !sessionError) {
          return <Navigate to="/dashboard" replace />;
        }
      }
    }

    return (
      <Routes>
        {publicRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    );
  }

  if (isSupabaseConfigured) {
    if (!session || sessionError) {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    if (profileMissing) {
      return <Navigate to="/onboarding" replace />;
    }
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
        <SessionProvider>
          <AppContent />
        </SessionProvider>
      </BrowserRouter>
    </AccessProvider>
  );
}

export default App;
