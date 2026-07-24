import Sidebar from '../Sidebar';
import Topbar from '../Topbar';
import styles from './AppShell.module.css';

function AppShell({
  title = 'Dashboard',
  profileName = 'UniFlow',
  profileEmail = '',
  activeContext,
  onToggleWorkspace = () => {},
  isSwitchingWorkspace = false,
  onSignOut,
  isSigningOut = false,
  signOutError = null,
  contextNotice = null,
  children,
}) {
  return (
    <div className={styles.shell}>
      <Sidebar />

      <div className={styles.workspace}>
        <Topbar
          title={title}
          profileName={profileName}
          profileEmail={profileEmail}
          activeContext={activeContext}
          onToggleWorkspace={onToggleWorkspace}
          isSwitchingWorkspace={isSwitchingWorkspace}
          onSignOut={onSignOut}
          isSigningOut={isSigningOut}
          signOutError={signOutError}
        />
        <main className={styles.main}>
          {contextNotice}
          {children}
        </main>
      </div>
    </div>
  );
}

export default AppShell;
