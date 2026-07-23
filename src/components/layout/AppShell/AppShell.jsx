import Sidebar from '../Sidebar';
import Topbar from '../Topbar';
import styles from './AppShell.module.css';

function AppShell({ title = 'Dashboard', onSignOut, isSigningOut = false, signOutError = null, children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />

      <div className={styles.workspace}>
        <Topbar title={title} onSignOut={onSignOut} isSigningOut={isSigningOut} signOutError={signOutError} />
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
