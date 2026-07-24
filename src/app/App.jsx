import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Loader from '../components/ui/Loader';
import { AuthenticatedLayout } from '../layouts/mobile-app-shell';
import { AccessProvider, useAccess } from './AccessContext';
import { SessionProvider, useSession } from './SessionContext';
import { canAccessRoute, canAccessRouteInContext, getFallbackRoute } from './accessRules';
import { navigationItems } from './navigation';
import { appRoutes, publicRoutes } from './routes';

function AppContent() {
  const { access } = useAccess();
  const {
    error: sessionError,
    isLoading: isSessionLoading,
    isSupabaseConfigured,
    needsOnboarding,
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
      if (
        ['/', '/welcome', '/login'].includes(location.pathname)
        && session
        && !sessionError
      ) {
        return (
          <Navigate
            to={needsOnboarding ? '/onboarding' : '/dashboard'}
            replace
          />
        );
      }

      if (location.pathname === '/onboarding') {
        if (!session) {
          return <Navigate to="/login" replace />;
        }

        if (profile?.onboarding_completed && !sessionError) {
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

    if (profileMissing || needsOnboarding) {
      return <Navigate to="/onboarding" replace />;
    }
  }

  // Guard de CONTEXTO (PF/PJ), centralizado e independente de plano/modo:
  // usa o moduleId da rota + moduleAccess.js. Cobre acesso direto por URL
  // (ex.: PF abrindo /crm) mesmo que a rota não possua item de navegação.
  // UX5: o redirecionamento deixou de ser silencioso -- leva o moduleId
  // bloqueado via state de navegação (nunca na URL) para que
  // AuthenticatedLayout explique o que aconteceu, sem trocar de workspace
  // sozinho e sem enfraquecer a autorização (o guard em si é idêntico).
  if (activeRoute && !canAccessRouteInContext(activeRoute, access.currentWorkspace)) {
    return (
      <Navigate
        to={getFallbackRoute(access.currentWorkspace, navigationItems)}
        replace
        state={{ blockedModuleId: activeRoute.moduleId }}
      />
    );
  }

  // Gating ortogonal de plano/modo (mantém comportamento anterior p/ itens de nav).
  if (activeRoute && activeNavigationItem && !canAccessRoute(activeNavigationItem, access)) {
    return <Navigate to={getFallbackRoute(access.currentWorkspace, navigationItems)} replace />;
  }

  return (
    <AuthenticatedLayout
      title={activeRoute?.title ?? 'Dashboard'}
      mobileTitle={location.pathname === '/dashboard' ? 'Home' : activeRoute?.title}
      immersive={location.pathname === '/uni-ai'}
    >
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        {appRoutes.map((route) => (
          <Route key={route.path} path={route.path} element={route.element} />
        ))}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </AuthenticatedLayout>
  );
}

function App() {
  // Ordem OBRIGATÓRIA: SessionProvider por fora, AccessProvider por dentro.
  // O AccessContext agora DERIVA do SessionContext (useSession), então precisa estar
  // dentro dele. Fonte de verdade única: sessão → access (sem estado paralelo).
  return (
    <BrowserRouter>
      <SessionProvider>
        <AccessProvider>
          <AppContent />
        </AccessProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}

export default App;
