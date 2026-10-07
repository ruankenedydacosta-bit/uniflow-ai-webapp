import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppBootScreen from './AppBootScreen.jsx';
import AnalyticsConsentBanner from '../features/analytics/AnalyticsConsentBanner.jsx';
import Ga4RouteTracker from '../features/analytics/ga4RouteTracker.jsx';
import { AccessProvider } from './AccessContext';
import { SessionProvider, useSession } from './SessionContext';
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
  resolvePersonalWorkspaceId,
  usePersonalPlanAccessGuard,
} from '../features/personal-plan';
import {
  SIMPLIFIED_ROUTES,
  SimplifiedAuthenticatedLayout,
} from '../features/simplified-app';

function AppContent() {
  const {
    availableWorkspaces,
    error: sessionError,
    isLoading: isSessionLoading,
    isSupabaseConfigured,
    session,
    workspace,
  } = useSession();
  const location = useLocation();
  const activeRoute = appRoutes.find((route) => route.path === location.pathname);
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

  // GUARD FIX (troca de dispositivo/sessão restaurada): única fonte de
  // verdade sobre acesso real é billing-get-subscription (via
  // usePersonalPlanAccessGuard) -- nunca o cache local, e nunca depende de
  // presentationCompleted (flag local, por navegador) ter sido concluída
  // antes. Um bug real em produção: um assinante com pagamento confirmado,
  // ao restaurar a sessão num navegador/dispositivo novo (cache limpo,
  // reinstalação), tinha presentationCompleted=false localmente -- e como
  // este guard só rodava DEPOIS da apresentação, a assinatura nunca era
  // consultada a tempo, e o app o mandava de volta para /plano-pessoal
  // (chegando a tentar cobrar de novo). Agora a consulta roda assim que a
  // sessão está resolvida, independente da apresentação.
  const personalPlanGuardEnabled = Boolean(
    isSupabaseConfigured && !isSessionLoading && presentationUserId,
  );
  // GUARD FIX: a assinatura está sempre vinculada ao workspace do tipo
  // "personal" -- nunca ao workspace "atual/ativo" (workspace.id), que pode
  // divergir dele. Usar workspace.id aqui podia consultar a assinatura de
  // um workspace errado e bloquear um assinante ativo.
  const personalWorkspaceId = resolvePersonalWorkspaceId(availableWorkspaces, workspace);
  const { status: personalPlanAccessStatus } = usePersonalPlanAccessGuard({
    workspaceId: personalWorkspaceId,
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
      <AppBootScreen
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
        // espera a consulta real de assinatura resolver antes de decidir
        // qualquer coisa. Ordem: 1) assinatura ativa? vai direto (Caso 2 --
        // nunca depende de apresentação já ter sido vista neste navegador);
        // 2) apresentação nunca concluída aqui? apresentação (Caso 1); 3)
        // caso contrário, Plano Pessoal (Caso 3). Backend sempre decide.
        if (personalPlanAccessLoading) {
          return <AppBootScreen label="Verificando sua assinatura…" />;
        }
        return (
          <Navigate
            to={
              personalPlanUnlocked
                ? requestedReturnPath
                : !presentationCompleted
                  ? PRESENTATION_ROUTE
                  : PERSONAL_PLAN_ROUTE
            }
            replace
          />
        );
      }
    }

    return (
      <>
        <Ga4RouteTracker />
        <Routes>
          {publicRoutes.map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </>
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

  // GUARD FIX (troca de dispositivo/sessão restaurada): a consulta de
  // assinatura roda assim que a sessão é conhecida -- NUNCA espera
  // presentationCompleted (flag local, por navegador). Enquanto ela não
  // resolveu, nunca decide (nem manda para apresentação, nem para Plano
  // Pessoal, nem deixa passar) -- evita a janela em que um assinante ativo
  // seria mandado para /apresentacao ou /plano-pessoal antes da consulta
  // real terminar.
  if (
    presentationUserId
    && !isPersonalPlanRoute
    && !isPresentationRoute
    && personalPlanAccessLoading
  ) {
    return <AppBootScreen label="Verificando sua assinatura…" />;
  }

  // Caso 2 (assinatura ativa -> nunca reapresentado nem cobrado de novo,
  // mesmo num navegador/dispositivo onde a apresentação nunca rodou --
  // cache limpo, troca de aparelho, nova instalação): o `&&
  // !personalPlanUnlocked` nos Casos 1 e 3 abaixo já garante que um
  // assinante ativo nunca é desviado para /apresentacao nem /plano-pessoal
  // -- ele cai direto no render normal da rota que pediu (standalone/
  // simplificada) ou no fallback final (Home), sem nenhum redirect extra
  // aqui que sobrescreveria uma rota simplificada legítima (ex.:
  // /app/registros, /app/conta) que ele esteja tentando abrir.

  // Caso 1 (usuário novo/sem assinatura e sem apresentação vista aqui).
  if (
    presentationUserId
    && !presentationCompleted
    && !personalPlanUnlocked
    && !isPresentationRoute
  ) {
    return <Navigate to={PRESENTATION_ROUTE} replace />;
  }

  if (isPresentationRoute && presentationCompleted && !isPresentationReplay) {
    return <Navigate to={personalPlanUnlocked ? SIMPLIFIED_ROUTES.HOME : PERSONAL_PLAN_ROUTE} replace />;
  }

  // Caso 3 (usuário existente, apresentação já vista aqui, sem assinatura
  // ativa) -- Plano Pessoal. Consulta de assinatura sempre no backend
  // (personalPlanUnlocked), jamais no marcador local.
  if (
    presentationUserId
    && !personalPlanUnlocked
    && !isPersonalPlanRoute
    && !isPresentationRoute
  ) {
    return <Navigate to={PERSONAL_PLAN_ROUTE} replace />;
  }

  if (isPersonalPlanRoute && personalPlanUnlocked) {
    return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;
  }

  if (activeRoute?.standalone) {
    return (
      <>
        <Ga4RouteTracker />
        <Routes>
          <Route path={activeRoute.path} element={activeRoute.element} />
          <Route path="*" element={<Navigate to={PRESENTATION_NEXT_ROUTE} replace />} />
        </Routes>
      </>
    );
  }

  if (activeRoute?.simplified) {
    return (
      <SimplifiedAuthenticatedLayout>
        <Ga4RouteTracker />
        <Routes>
          {appRoutes.filter((route) => route.simplified).map((route) => (
            <Route key={route.path} path={route.path} element={route.element} />
          ))}
          <Route path="*" element={<Navigate to={SIMPLIFIED_ROUTES.HOME} replace />} />
        </Routes>
      </SimplifiedAuthenticatedLayout>
    );
  }

  // MVP FECHAMENTO: nenhuma rota legada (dashboard, financeiro, CRM,
  // clientes, projetos, agenda, relatórios, configurações, seletor PF/PJ,
  // navegação Home/Financeiro/Uni/Agenda/Mais antiga) pode renderizar --
  // nem mesmo para quem já pagou. Elas continuam registradas em
  // appRoutes/routes.jsx e o AuthenticatedLayout legado continua existindo
  // no código só para preservação futura (nunca deletados), mas a única
  // experiência autorizada depois de presentationCompleted +
  // personalPlanUnlocked é a simplificada (activeRoute?.simplified, guard
  // acima) ou standalone (apresentação/Plano Pessoal, guard acima). Toda
  // rota legada e toda rota desconhecida caem aqui e voltam para a Home
  // simplificada -- nunca para /dashboard.
  return <Navigate to={SIMPLIFIED_ROUTES.HOME} replace />;
}

function App() {
  // Ordem OBRIGATÓRIA: SessionProvider por fora, AccessProvider por dentro.
  // O AccessContext agora DERIVA do SessionContext (useSession), então precisa estar
  // dentro dele. Fonte de verdade única: sessão → access (sem estado paralelo).
  return (
    <BrowserRouter>
      <AnalyticsConsentBanner />
      <SessionProvider>
        <AccessProvider>
          <AppContent />
        </AccessProvider>
      </SessionProvider>
    </BrowserRouter>
  );
}

export default App;
