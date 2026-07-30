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
  usePersonalPlanAccessGuard,
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
    workspace,
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
  // GUARD FIX: o marcador local (personalPlanStorage.js) NUNCA é mais usado
  // como autorização -- ele liberava /app/home para quem nunca teve
  // assinatura real, ou cujo status tinha mudado (cancelou, virou pending/
  // past_due/suspended) depois de marcado como concluído. Mantido só como
  // fallback para o modo demo (sem Supabase configurado, sem backend real
  // para consultar) -- comportamento de demo inalterado.
  const personalPlanCompleted = isPersonalPlanCompleted(presentationUserId);
  // BLOCO ASAAS CHECKOUT: a rota de retorno do Checkout de cartão
  // (/plano-pessoal/retorno) também precisa ficar isenta deste guard --
  // sem isso, o usuário seria redirecionado de volta para /plano-pessoal
  // ANTES de ver a confirmação, já que o acesso só libera depois que a
  // tela de retorno confirma o pagamento de verdade.
  const isPersonalPlanRoute = location.pathname === PERSONAL_PLAN_ROUTE
    || location.pathname === PERSONAL_PLAN_RETURN_ROUTE;

  // GUARD FIX: única fonte de verdade sobre acesso real é
  // billing-get-subscription (via usePersonalPlanAccessGuard) -- nunca o
  // cache local. Só roda com backend real configurado, sessão já resolvida,
  // apresentação concluída e usuário identificado. Revalida sempre que o
  // usuário sai da rota do Plano Pessoal/retorno do Checkout (único
  // momento em que o status pode ter mudado de verdade dentro da mesma
  // sessão).
  const personalPlanGuardEnabled = Boolean(
    isSupabaseConfigured && !isSessionLoading && presentationUserId && presentationCompleted,
  );
  const { status: personalPlanAccessStatus } = usePersonalPlanAccessGuard({
    workspaceId: workspace?.id,
    enabled: personalPlanGuardEnabled,
    revalidateWhenLeavingRoute: isPersonalPlanRoute,
  });
  // Enquanto o backend real está configurado, o cache local nunca decide --
  // só 'active' confirmado agora libera o app. Sem Supabase (modo demo),
  // preserva o comportamento antigo (só local, sem backend para consultar).
  const personalPlanUnlocked = isSupabaseConfigured
    ? personalPlanAccessStatus === 'active'
    : personalPlanCompleted;
  // 'idle' conta como loading: é o valor inicial no primeiro render depois
  // do guard ser habilitado, antes do efeito disparar a consulta real --
  // nunca decide/redireciona nesse instante (evita flicker).
  const personalPlanAccessLoading = personalPlanGuardEnabled
    && (personalPlanAccessStatus === 'loading' || personalPlanAccessStatus === 'idle');

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
        // GUARD FIX: nunca decide o destino pós-login com o cache local --
        // espera a consulta real de assinatura resolver antes de escolher
        // entre Plano Pessoal e o destino final (evita liberar a Home para
        // quem nunca assinou de verdade).
        if (presentationCompleted && personalPlanAccessLoading) {
          return <Loader fullScreen label="Verificando sua assinatura…" />;
        }
        return (
          <Navigate
            to={
              !presentationCompleted
                ? PRESENTATION_ROUTE
                : !personalPlanUnlocked
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

  // GUARD FIX: enquanto a consulta real de assinatura ainda não resolveu,
  // nunca decide (nem redireciona para /plano-pessoal, nem deixa passar) --
  // evita flicker e evita a janela em que um usuário sem assinatura real
  // conseguiria alcançar /app/home antes da consulta terminar.
  if (
    presentationUserId
    && presentationCompleted
    && !isPersonalPlanRoute
    && personalPlanAccessLoading
  ) {
    return <Loader fullScreen label="Verificando sua assinatura…" />;
  }

  if (
    presentationUserId
    && presentationCompleted
    && !personalPlanUnlocked
    && !isPersonalPlanRoute
  ) {
    return <Navigate to={PERSONAL_PLAN_ROUTE} replace />;
  }

  if (isPersonalPlanRoute && personalPlanUnlocked) {
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
