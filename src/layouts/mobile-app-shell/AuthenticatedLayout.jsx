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

function AuthenticatedLayout({ title = 'Dashboard', mobileTitle, children }) {
  const isMobile = useMobileViewport();
  const { access } = useAccess();
  const {
    availableWorkspaceTypes,
    isSwitchingWorkspace,
    profile,
    selectedWorkspaceType,
    switchWorkspace,
    workspace,
    workspaceSwitchError,
  } = useSession();

  if (!isMobile) {
    return <AppShell title={title}>{children}</AppShell>;
  }

  const effectiveWorkspaceType = selectedWorkspaceType ?? workspace?.workspace_type ?? access.currentWorkspace;
  const workspaceLabel = WORKSPACE_LABELS[effectiveWorkspaceType] ?? 'Espaço atual';
  const profileName = profile?.full_name ?? 'UniFlow';
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

  return (
    <MobileAppShell
      title={mobileTitle ?? title}
      headerProps={{
        subtitle: workspaceLabel,
        actions: <Avatar name={profileName} size="sm" />,
        activeContext,
        contextError: Boolean(workspaceSwitchError),
        contextLocked: false,
        contextMessage: workspaceSwitchError?.message
          ?? (!selectedWorkspaceExists ? missingProfileMessage : null),
        isContextLoading: isSwitchingWorkspace,
        onContextChange: handleContextChange,
      }}
    >
      {shouldHidePreviousWorkspace ? (
        <section className={styles.workspaceContextState} role="status" aria-live="polite">
          <h2>{missingProfileMessage}</h2>
          <p>O contexto selecionado foi mantido. Seus dados do outro perfil não serão exibidos aqui.</p>
        </section>
      ) : children}
    </MobileAppShell>
  );
}

export default AuthenticatedLayout;
