import Sidebar from '../Sidebar';
import Topbar from '../Topbar';
import styles from './AppShell.module.css';

function AppShell({ title = 'Dashboard', children }) {
  return (
    <div className={styles.shell}>
      <Sidebar />

      <div className={styles.workspace}>
        <Topbar title={title} />
        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}

export default AppShell;
