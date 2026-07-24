import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAccess } from '../../app/AccessContext.jsx';
import { useSession } from '../../app/SessionContext.jsx';
import { getWorkspaceTypeFromContext } from '../../app/workspaceSelection.js';
import AppShell from '../../components/layout/AppShell/index.js';
import Avatar from '../../components/ui/Avatar/index.js';
import MobileAppShell from './MobileAppShell.jsx';
import styles from './MobileAppShell.module.css';
import { useMobileViewport } from './useMobileViewport.js';

const WORKSPACE_LABELS = Object.freeze({
  personal: 'Espaço pessoal',
  business: 'Espaço empresarial',
});

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

  if (!isMobile) {
    return (
      <AppShell
        title={title}
        profileName={profileName}
        onSignOut={handleSignOut}
        isSigningOut={isSigningOut}
        signOutError={signOutError}
      >
        {children}
      </AppShell>
    );
  }

  const effectiveWorkspaceType = selectedWorkspaceType ?? workspace?.workspace_type ?? access.currentWorkspace;
  const workspaceLabel = WORKSPACE_LABELS[effectiveWorkspaceType] ?? 'Espaço atual';
  const activeContext = effectiveWorkspaceType === 'business' ? 'PJ' : 'PF';
  const selectedWorkspaceExists = availableWorkspaceTypes.includes(effectiveWorkspaceType);
  const workspaceMatchesSelection = workspace?.workspace_type === effectiveWorkspaceType;
  const shouldHidePreviousWorkspace = !selectedWorkspaceExists || !workspaceMatchesSelection;
  const missingProfileMessage = activeContext === 'PJ'
    ? 'Perfil PJ ainda não está criado'
    : 'Perfil PF ainda não está criado';

  const handleContextChange = (context) => {
    void switchWorkspace(getWorkspaceTypeFromContext(context));
  };

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
