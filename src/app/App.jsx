import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Loader from '../components/ui/Loader';
import { AuthenticatedLayout } from '../layouts/mobile-app-shell';
import { AccessProvider, useAccess } from './AccessContext';
import { SessionProvider, useSession } from './SessionContext';
import { canAccessRoute, canAccessRouteInContext, getFallbackRoute } from './accessRules';
import { navigationItems } from './navigation';
import { appRoutes, publicRoutes } from './routes';
import { getSafeAuthReturnPath } from './authReturnPath.js';
import {
  PRESENTATION_NEXT_ROUTE,
  PRESENTATION_REPLAY_STATE,
  PRESENTATION_ROUTE,
  isPresentationCompleted,
  resolvePresentationUserId,
} from '../features/presentation';
import {
  PERSONAL_PLAN_RETURN_ROUTE,
  PERSONAL_PLAN_ROUTE,
  isPersonalPlanCompleted,
} from '../features/personal-plan';
import {
  SIMPLIFIED_ROUTES,
  SimplifiedAuthenticatedLayout,
} from '../features/simplified-app';

function AppContent() {
  const { access } = useAccess();
  const {
    error: sessionError,
    isLoading: isSessionLoading,
    isSupabaseConfigured,
    profile,
    session,
  } = useSession();
  const location = useLocation();
  const activeRoute = appRoutes.find((route) => route.path === location.pathname);
  const activeNavigationItem = navigationItems.find((item) => item.path === location.pathname);
  const isPublicRoute = publicRoutes.some((route) => route.path === location.pathname);
  const requestedReturnPath = getSafeAuthReturnPath(location.state?.from);
  const presentationUserId = resolvePresentationUserId(session, isSupabaseConfigured);
  const presentationCompleted = isPresentationCompleted(presentationUserId);
  const isPresentationRoute = location.pathname === PRESENTATION_ROUTE;
  const isPresentationReplay = Boolean(location.state?.[PRESENTATION_REPLAY_STATE]);
  // BUGFIX (redirecionamento pós-login): mesmo padrão de conclusão
  // persistida por usuário do presentationStorage.js, aplicado ao Plano
  // Pessoal -- garante que exista uma resolução única pós-auth (apresentação
  // -> plano pessoal -> Home simplificada), nunca o shell legado por padrão.
  const personalPlanCompleted = isPersonalPlanCompleted(presentationUserId);
  // BLOCO ASAAS CHECKOUT: a rota de retorno do Checkout de cartão
  // (/plano-pessoal/retorno) também precisa ficar isenta deste guard --
  // sem isso, o usuário seria redirecionado de volta para /plano-pessoal
  // ANTES de ver a confirmação, já que personalPlanCompleted só vira true
  // depois que a tela de retorno confirma o pagamento.
  const isPersonalPlanRoute = location.pathname === PERSONAL_PLAN_ROUTE
    || location.pathname === PERSONAL_PLAN_RETURN_ROUTE;

  if (isSupabaseConfigured && isSessionLoading) {
    // AUTH4: label especifico enquanto o retorno do OAuth (Google) esta
    // sendo processado -- mesmo guard de loading da AUTH2, sem duplicar
    // logica, so uma mensagem mais precisa nesta rota especifica.
    return (
      <Loader
        fullScreen
        label={location.pathname === '/auth/callback' ? 'Concluindo acesso…' : 'Carregando sua sessão'}
      />
    );
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
            to={
              !presentationCompleted
                ? PRESENTATION_ROUTE
                : !personalPlanCompleted
                  ? PERSONAL_PLAN_ROUTE
                  : requestedReturnPath
            }
            replace
          />
        );
      }

            if (location.pathname === '/onboarding') {
        return <Navigate to={session ? PRESENTATION_ROUTE : '/login'} replace />;
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
      // BUGFIX (redirecionamento pós-login): rota desconhecida/inexistente
      // acessada sem sessão não pode usar o shell legado como "from" --
      // volta para a Home simplificada após o login, nunca para /dashboard.
      const from = activeRoute
        ? `${location.pathname}${location.search}`
        : SIMPLIFIED_ROUTES.HOME;
      return <Navigate to="/login" replace state={{ from }} />;
    }
  }

  if (
    presentationUserId
    && !presentationCompleted
    && !isPresentationRoute
  ) {
    return <Navigate to={PRESENTATION_ROUTE} replace />;
  }

  if (isPresentationRoute && presentationCompleted && !isPresentationReplay) {
    return <Navigate to={PRESENTATION_NEXT_ROUTE} replace />;
  }

  if (
    presentationUserId
    && presentationCompleted
    && !personalPlanCompleted
    && !isPersonalPlanRoute
  ) {
    return <Navigate to={PERSONAL_PLAN_ROUTE} replace />;
  }

  if (isPersonalPlanRoute && personalPlanCompleted) {
    return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;
  }

  if (activeRoute?.standalone) {
    return (
      <Routes>
        <Route path={activeRoute.path} element={activeRoute.element} />
        <Route path="*" element={<Navigate to={PRESENTATION_NEXT_ROUTE} replace />} />
      </Routes>
    );
  }

  if (activeRoute?.simplified) {
    return (
      <SimplifiedAuthenticatedLayout>
        <Routes>
          {appRoutes.filter((route) => route.simplified).map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
          <Route path="*" element={<Navigate to={SIMPLIFIED_ROUTES.HOME} replace />} />
        </Routes>
      </SimplifiedAuthenticatedLayout>
    );
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
