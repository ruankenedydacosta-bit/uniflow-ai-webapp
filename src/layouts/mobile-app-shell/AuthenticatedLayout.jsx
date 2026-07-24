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
import WorkspaceContextNotice from '../../components/workspace/WorkspaceContextNotice.jsx';
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

  // notifications/support permanecem sem efeito nesta fase -- ignorados
  // explicitamente, sem lancar erro (fora do escopo da CFG2, que trata
  // somente do logout).
  function handleShellAction(action) {
    if (action === 'sign-out') {
      void handleSignOut();
    }
  }

  const profileName = profile?.full_name ?? 'UniFlow';
  const profileEmail = user?.email ?? '';

  // Hoisted (fora do bloco mobile) para que o desktop tambem tenha acesso ao
  // contexto ativo e ao MESMO fluxo real de troca de workspace (switchWorkspace
  // via useSession()) usado pelo seletor PF/PJ mobile -- o menu de conta do
  // Topbar ("Trocar espaço", UX3) reaproveita esta funcao, sem duplicar logica.
  const effectiveWorkspaceType = selectedWorkspaceType ?? workspace?.workspace_type ?? access.currentWorkspace;
  const activeContext = effectiveWorkspaceType === 'business' ? 'PJ' : 'PF';
  const workspaceLabel = getWorkspaceContextLabel(effectiveWorkspaceType);

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
  const showBlockedNotice = Boolean(blockedModuleId) && effectiveWorkspaceType === WORKSPACE_TYPES.PERSONAL;

  const clearBlockedNotice = () => {
    navigate(location.pathname, { replace: true, state: {} });
  };

  const handleGoToBusinessSpace = () => {
    clearBlockedNotice();
    void handleContextChange('PJ');
  };

  // Prioridade: aviso de bloqueio (acionavel) > explicacao de troca
  // (informativa) -- nunca os dois ao mesmo tempo, para nao poluir a tela.
  const contextNotice = showBlockedNotice ? (
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
        onSignOut={handleSignOut}
        isSigningOut={isSigningOut}
        signOutError={signOutError}
        contextNotice={contextNotice}
      >
        {children}
      </AppShell>
    );
  }

  const selectedWorkspaceExists = availableWorkspaceTypes.includes(effectiveWorkspaceType);
  const workspaceMatchesSelection = workspace?.workspace_type === effectiveWorkspaceType;
  const shouldHidePreviousWorkspace = !selectedWorkspaceExists || !workspaceMatchesSelection;
  const missingProfileMessage = activeContext === 'PJ'
    ? 'Perfil PJ ainda não está criado'
    : 'Perfil PF ainda não está criado';

  const handleCreateProfile = async () => {
    const result = await createWorkspaceProfile(effectiveWorkspaceType);
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
          ?? (!selectedWorkspaceExists ? missingProfileMessage : null),
        isContextLoading: isSwitchingWorkspace,
        // Corrige o clique morto do avatar mobile (achado P0 da UX1): nesta
        // fase apenas navega para Configuracoes, sem bottom sheet/pagina nova.
        onAvatarPress: () => navigate('/configuracoes'),
        onContextChange: handleContextChange,
      }}
    >
      {contextNotice}
      {shouldHidePreviousWorkspace ? (
        <section className={styles.workspaceContextState} role="status" aria-live="polite">
          <h2>{missingProfileMessage}</h2>
          <p>O contexto selecionado foi mantido. Seus dados do outro perfil não serão exibidos aqui.</p>
          {!selectedWorkspaceExists ? (
            <button
              type="button"
              className={styles.workspaceContextAction}
              disabled={isSwitchingWorkspace}
              onClick={() => void handleCreateProfile()}
            >
              {isSwitchingWorkspace ? 'Criando perfil...' : `Criar perfil ${activeContext}`}
            </button>
          ) : null}
        </section>
      ) : children}
    </MobileAppShell>
  );
}

export default AuthenticatedLayout;
