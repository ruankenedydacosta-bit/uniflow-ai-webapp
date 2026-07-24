import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAccess } from '../../app/AccessContext.jsx';
import { useSession } from '../../app/SessionContext.jsx';
import { navigationItems } from '../../app/navigation.js';
import { WORKSPACE_TYPES } from '../../app/access.js';
import { getWorkspaceContextLabel, getWorkspaceTypeFromContext } from '../../app/workspaceSelection.js';
import {
  readWorkspaceContextHintSeen,
  writeWorkspaceContextHintSeen,
} from '../../app/workspaceContextHintStorage.js';
import AppShell from '../../components/layout/AppShell/index.js';
import Avatar from '../../components/ui/Avatar/index.js';
import Modal from '../../components/ui/Modal/Modal.jsx';
import WorkspaceContextNotice from '../../components/workspace/WorkspaceContextNotice.jsx';
import NotificationsPanel from '../../features/notifications/NotificationsPanel.jsx';
import { useNotifications } from '../../features/notifications/useNotifications.js';
import MobileAppShell from './MobileAppShell.jsx';
import styles from './MobileAppShell.module.css';
import { useMobileViewport } from './useMobileViewport.js';

// UX5: textos curtos exibidos uma única vez por espaço (nunca repetidos à
// exaustão) na primeira troca real de contexto -- explicam por que módulos
// somem/aparecem, sem jamais sugerir que dados foram apagados ou misturados
// (eles continuam separados, só a visibilidade muda conforme o espaço).
const WORKSPACE_SWITCH_EXPLANATIONS = Object.freeze({
  [WORKSPACE_TYPES.PERSONAL]:
    'Você está no Espaço Pessoal. CRM, Clientes e Projetos ficam disponíveis no Espaço Empresa — seus dados de cada espaço continuam separados, nenhum foi apagado.',
  [WORKSPACE_TYPES.BUSINESS]:
    'Espaço Empresa ativado. Seus módulos de gestão (CRM, Clientes, Projetos) estão disponíveis novamente.',
});

function getModuleLabel(moduleId) {
  return navigationItems.find((item) => item.moduleId === moduleId)?.label ?? 'Este módulo';
}

// UX5: switchWorkspace re-sincroniza a sessão internamente (synchronizeSession
// já existente desde antes desta fase) sempre que o workspace de destino é
// diferente do atual, o que ativa por um instante o guard global de
// `isSessionLoading` em App.jsx -- ele desmonta AuthenticatedLayout inteiro
// enquanto a sessão recarrega. Um `setSwitchNotice` chamado DEPOIS do
// `await switchWorkspace(...)` pode rodar na instância ANTIGA, já
// desmontada (vira no-op silencioso). Por isso a intenção "mostrar esta
// explicação" fica registrada aqui fora, numa variável de módulo efêmera
// (dura só a aba, nunca persistida) -- a instância NOVA, ao remontar, lê e
// consome o valor no estado inicial do useState abaixo.
let pendingWorkspaceSwitchNotice = null;

function AuthenticatedLayout({ title = 'Dashboard', mobileTitle, immersive = false, children }) {
  const isMobile = useMobileViewport();
  const navigate = useNavigate();
  const { access } = useAccess();
  const {
    availableWorkspaceTypes,
    createWorkspaceProfile,
    isSwitchingWorkspace,
    profile,
    selectedWorkspaceType,
    signOut,
    switchWorkspace,
    user,
    workspace,
    workspaceSwitchError,
  } = useSession();

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState(null);
  // NOTIF1: painel de notificacoes mobile (Modal reaproveitado, mesmo
  // componente do sino desktop) -- aberto pelo sino do header ou pelo item
  // "Notificacoes" do menu Mais, ambos chamando o mesmo handler.
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    isLoading: isNotificationsLoading,
    error: notificationsError,
    refresh: refreshNotifications,
    markAsRead: markNotificationAsRead,
    markAllAsRead: markAllNotificationsAsRead,
  } = useNotifications();
  // Trava sincrona contra chamadas concorrentes de signOut (duplo toque no
  // mobile antes do menu fechar, ou duplo clique no botao desktop) --
  // mesmo padrao de mutationRef ja usado em useClients.js/useAgenda.js/
  // useTransactions.js, aqui centralizado neste unico handler compartilhado
  // por mobile e desktop.
  const signOutRef = useRef(false);

  const handleSignOut = async () => {
    if (signOutRef.current) return;

    signOutRef.current = true;
    setIsSigningOut(true);
    setSignOutError(null);

    try {
      const result = await signOut();
      if (result?.error) {
        setSignOutError(result.error);
      }
    } catch {
      setSignOutError({
        code: 'SIGN_OUT_UNEXPECTED_ERROR',
        message: 'Não foi possível sair da conta. Tente novamente.',
      });
    } finally {
      signOutRef.current = false;
      setIsSigningOut(false);
    }
    // Sem navegacao manual: signOut() bem-sucedido zera a sessao no
    // SessionContext, e o guard de autenticacao existente em App.jsx
    // (`if (!session || sessionError) return <Navigate to="/login" .../>`)
    // ja redireciona automaticamente -- nenhuma race condition introduzida.
  };

  // support permanece sem efeito nesta fase -- ignorado explicitamente, sem
  // lancar erro (fora do escopo da NOTIF1).
  function handleShellAction(action) {
    if (action === 'sign-out') {
      void handleSignOut();
      return;
    }
    if (action === 'open-notifications') {
      setIsNotificationsOpen(true);
    }
  }

  const profileName = profile?.full_name ?? 'UniFlow';
  const profileEmail = user?.email ?? '';

  // Hoisted (fora do bloco mobile) para que o desktop tambem tenha acesso ao
  // contexto ativo e ao MESMO fluxo real de troca de workspace (switchWorkspace
  // via useSession()) usado pelo seletor PF/PJ mobile -- o menu de conta do
  // Topbar ("Trocar espaço", UX3) reaproveita esta funcao, sem duplicar logica.
  //
  // AUTH3: fonte ÚNICA do contexto ATIVO exibido em toda a UI -- SEMPRE o
  // workspace CONFIRMADO pelo backend (igual ao que a Sidebar já usa via
  // access.currentWorkspace), NUNCA `selectedWorkspaceType` (seleção
  // otimista). Antes desta fase, `effectiveWorkspaceType` priorizava a
  // seleção otimista, então uma troca que falhasse no meio (ex.: queda de
  // conexão) deixava o menu de conta mostrando o destino pretendido como se
  // já fosse o contexto ativo, enquanto a Sidebar continuava no workspace
  // real -- dois contextos diferentes visíveis ao mesmo tempo.
  // `selectedWorkspaceType` continua existindo (ver pendingWorkspaceType
  // abaixo e shouldHidePreviousWorkspace mais adiante), mas nunca mais
  // decide o que é exibido como contexto ativo.
  const confirmedWorkspaceType = workspace?.workspace_type ?? access.currentWorkspace;
  const activeContext = confirmedWorkspaceType === 'business' ? 'PJ' : 'PF';
  const workspaceLabel = getWorkspaceContextLabel(confirmedWorkspaceType);

  // Indicador transitório explícito (nunca substitui o contexto confirmado
  // acima): só existe enquanto uma troca real está em andamento E o destino
  // pretendido difere do confirmado. Vira texto informativo simples, nunca
  // fonte de autorização/exibição de módulos.
  const pendingWorkspaceType = isSwitchingWorkspace
    && selectedWorkspaceType
    && selectedWorkspaceType !== confirmedWorkspaceType
    ? selectedWorkspaceType
    : null;
  const switchingNotice = pendingWorkspaceType
    ? `Alterando para ${getWorkspaceContextLabel(pendingWorkspaceType)}…`
    : null;

  // UX5 -- aviso 1: explicacao curta na troca de espaço (uma vez por espaço,
  // nunca repetida a exaustao). Disparada dentro do proprio handler de troca
  // (evento real do usuario), nunca em useEffect -- evita o padrao proibido
  // de setState sincrono dentro de efeito. Estado inicial consome a
  // variavel de modulo (ver comentario acima de pendingWorkspaceSwitchNotice)
  // para sobreviver ao possivel desmonte/remonte causado pelo proprio
  // switchWorkspace.
  const [switchNotice, setSwitchNotice] = useState(() => pendingWorkspaceSwitchNotice);

  // Consome a variavel de modulo uma unica vez, depois do commit -- nao e
  // setState (react-hooks/set-state-in-effect nao se aplica a variavel de
  // modulo), apenas limpa o "recado" para que uma remontagem futura não
  // relacionada a uma troca real não reexiba um aviso antigo.
  useEffect(() => {
    pendingWorkspaceSwitchNotice = null;
  }, []);

  const handleContextChange = async (context) => {
    // AUTH3: defesa extra na UI (além do mutex em switchWorkspace) -- evita
    // até mesmo iniciar uma segunda chamada enquanto uma troca já está em
    // andamento (duplo clique/toque antes do primeiro terminar).
    if (isSwitchingWorkspace) return;

    const nextWorkspaceType = getWorkspaceTypeFromContext(context);
    const result = await switchWorkspace(nextWorkspaceType);
    if (result?.error) return;

    if (readWorkspaceContextHintSeen(nextWorkspaceType)) {
      setSwitchNotice(null);
      return;
    }

    writeWorkspaceContextHintSeen(nextWorkspaceType);
    const notice = WORKSPACE_SWITCH_EXPLANATIONS[nextWorkspaceType];
    pendingWorkspaceSwitchNotice = notice;
    setSwitchNotice(notice);
  };

  const handleToggleWorkspace = () => {
    void handleContextChange(activeContext === 'PJ' ? 'PF' : 'PJ');
  };

  // UX5 -- aviso 2: rota empresarial bloqueada em PF (redirecionamento deixou
  // de ser silencioso, App.jsx anexa o moduleId via state de navegacao).
  // A "verdade" de que o aviso deve sumir mora no PRÓPRIO location.state,
  // nunca em estado local do componente -- um estado local (ex.: uma chave
  // "dispensada") seria perdido no mesmo desmonte/remonte que
  // switchWorkspace pode causar (ver pendingWorkspaceSwitchNotice acima),
  // fazendo o aviso resssurgir sozinho depois de já resolvido. Dispensar ou
  // agir sempre navega substituindo o state por vazio -- fonte única,
  // imune a remontagem.
  const location = useLocation();
  const blockedModuleId = location.state?.blockedModuleId ?? null;
  const canGoToBusinessSpace = availableWorkspaceTypes.includes(WORKSPACE_TYPES.BUSINESS);
  const showBlockedNotice = Boolean(blockedModuleId) && confirmedWorkspaceType === WORKSPACE_TYPES.PERSONAL;

  const clearBlockedNotice = () => {
    navigate(location.pathname, { replace: true, state: {} });
  };

  const handleGoToBusinessSpace = () => {
    clearBlockedNotice();
    void handleContextChange('PJ');
  };

  // AUTH3 -- aviso de FALHA na troca (desktop): o mobile já mostra
  // workspaceSwitchError via headerProps.contextMessage; o desktop não tinha
  // nenhum lugar equivalente (lacuna encontrada na validação manual desta
  // fase, corrigida aqui). WORKSPACE_NOT_FOUND fica de fora -- esse caso tem
  // tratamento próprio (tela "perfil ausente", mobile) e não é uma falha de
  // rede. Dispensado por identidade do objeto de erro (não por string): uma
  // NOVA tentativa sempre gera um objeto novo, reabrindo o aviso se falhar
  // de novo, mas mantendo fechado se for a mesma falha já vista.
  const [dismissedSwitchError, setDismissedSwitchError] = useState(null);
  const showSwitchErrorNotice = Boolean(workspaceSwitchError)
    && workspaceSwitchError.code !== 'WORKSPACE_NOT_FOUND'
    && workspaceSwitchError !== dismissedSwitchError;

  // Prioridade: indicador transitório "Alterando…" (reflete uma operação em
  // andamento agora mesmo) > aviso de FALHA na troca (AUTH3) > aviso de
  // bloqueio (acionável, UX5) > explicação de troca (informativa, UX5) --
  // nunca mais de um ao mesmo tempo, para não poluir a tela.
  const contextNotice = switchingNotice ? (
    <WorkspaceContextNotice message={switchingNotice} />
  ) : showSwitchErrorNotice ? (
    <WorkspaceContextNotice
      message={workspaceSwitchError.message}
      onDismiss={() => setDismissedSwitchError(workspaceSwitchError)}
    />
  ) : showBlockedNotice ? (
    <WorkspaceContextNotice
      message={`${getModuleLabel(blockedModuleId)} está disponível no Espaço Empresa. Você continua no Espaço Pessoal.`}
      actionLabel={canGoToBusinessSpace ? 'Ir para Espaço Empresa' : undefined}
      onAction={canGoToBusinessSpace ? handleGoToBusinessSpace : undefined}
      onDismiss={clearBlockedNotice}
    />
  ) : switchNotice ? (
    <WorkspaceContextNotice message={switchNotice} onDismiss={() => setSwitchNotice(null)} />
  ) : null;

  if (!isMobile) {
    return (
      <AppShell
        title={title}
        profileName={profileName}
        profileEmail={profileEmail}
        activeContext={activeContext}
        onToggleWorkspace={handleToggleWorkspace}
        isSwitchingWorkspace={isSwitchingWorkspace}
        onSignOut={handleSignOut}
        isSigningOut={isSigningOut}
        signOutError={signOutError}
        contextNotice={contextNotice}
      >
        {children}
      </AppShell>
    );
  }

  // AUTH3: gatilho preciso via o código de erro real de switchWorkspace, em
  // vez de comparar `selectedWorkspaceType` (intenção) com o workspace
  // confirmado -- essa comparação sozinha ficaria momentaneamente "true"
  // (falso positivo) durante QUALQUER troca válida em andamento (entre o
  // reflexo otimista e a confirmação), mostrando por engano a tela de
  // "perfil ausente" no meio de uma troca normal.
  const missingWorkspaceType = workspaceSwitchError?.code === 'WORKSPACE_NOT_FOUND'
    ? selectedWorkspaceType
    : null;
  const shouldHidePreviousWorkspace = Boolean(missingWorkspaceType);
  const missingProfileMessage = missingWorkspaceType === WORKSPACE_TYPES.BUSINESS
    ? 'Perfil PJ ainda não está criado'
    : 'Perfil PF ainda não está criado';

  const handleCreateProfile = async () => {
    const result = await createWorkspaceProfile(missingWorkspaceType ?? confirmedWorkspaceType);
    if (!result.error) navigate('/financeiro', { replace: true });
  };

  return (
    <MobileAppShell
      title={mobileTitle ?? title}
      immersive={immersive}
      onAction={handleShellAction}
      headerProps={{
        subtitle: workspaceLabel,
        actions: <Avatar name={profileName} size="sm" />,
        activeContext,
        contextError: Boolean(workspaceSwitchError),
        contextLocked: false,
        contextMessage: workspaceSwitchError?.message
          ?? (missingWorkspaceType ? missingProfileMessage : null),
        isContextLoading: isSwitchingWorkspace,
        notificationCount: unreadCount,
        // Corrige o clique morto do avatar mobile (achado P0 da UX1): nesta
        // fase apenas navega para Configuracoes, sem bottom sheet/pagina nova.
        onAvatarPress: () => navigate('/configuracoes'),
        onBellPress: () => setIsNotificationsOpen(true),
        onContextChange: handleContextChange,
      }}
    >
      <Modal
        open={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        title="Notificações"
        size="sm"
      >
        <NotificationsPanel
          notifications={notifications}
          isLoading={isNotificationsLoading}
          error={notificationsError}
          unreadCount={unreadCount}
          onMarkAsRead={markNotificationAsRead}
          onMarkAllAsRead={markAllNotificationsAsRead}
          onRetry={refreshNotifications}
          onNavigate={(url) => {
            setIsNotificationsOpen(false);
            navigate(url);
          }}
        />
      </Modal>
      {contextNotice}
      {shouldHidePreviousWorkspace ? (
        <section className={styles.workspaceContextState} role="status" aria-live="polite">
          <h2>{missingProfileMessage}</h2>
          <p>O contexto selecionado foi mantido. Seus dados do outro perfil não serão exibidos aqui.</p>
          <button
            type="button"
            className={styles.workspaceContextAction}
            disabled={isSwitchingWorkspace}
            onClick={() => void handleCreateProfile()}
          >
            {isSwitchingWorkspace ? 'Criando perfil...' : `Criar perfil ${missingWorkspaceType === WORKSPACE_TYPES.BUSINESS ? 'PJ' : 'PF'}`}
          </button>
        </section>
      ) : children}
    </MobileAppShell>
  );
}

export default AuthenticatedLayout;
