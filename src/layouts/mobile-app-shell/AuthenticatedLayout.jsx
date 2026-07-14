import { useAccess } from '../../app/AccessContext.jsx';
import { useSession } from '../../app/SessionContext.jsx';
import AppShell from '../../components/layout/AppShell/index.js';
import Avatar from '../../components/ui/Avatar/index.js';
import MobileAppShell from './MobileAppShell.jsx';
import { useMobileViewport } from './useMobileViewport.js';

const WORKSPACE_LABELS = Object.freeze({
  personal: 'Espaço pessoal',
  business: 'Espaço empresarial',
});

function AuthenticatedLayout({ title = 'Dashboard', mobileTitle, children }) {
  const isMobile = useMobileViewport();
  const { access } = useAccess();
  const { profile } = useSession();

  if (!isMobile) {
    return <AppShell title={title}>{children}</AppShell>;
  }

  const workspaceLabel = WORKSPACE_LABELS[access.currentWorkspace] ?? 'Espaço atual';
  const profileName = profile?.full_name ?? 'UniFlow';

  return (
    <MobileAppShell
      title={mobileTitle ?? title}
      headerProps={{
        subtitle: workspaceLabel,
        actions: <Avatar name={profileName} size="sm" />,
      }}
    >
      {children}
    </MobileAppShell>
  );
}

export default AuthenticatedLayout;
