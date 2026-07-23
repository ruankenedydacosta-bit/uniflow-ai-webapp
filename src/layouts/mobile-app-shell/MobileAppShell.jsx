import { useNavigate } from 'react-router-dom';
import BottomNavigation from './BottomNavigation.jsx';
import MobileHeader from './MobileHeader.jsx';
import MoreMenu from './MoreMenu.jsx';
import { ShellProvider, useMobileShell } from './ShellContext.jsx';
import styles from './MobileAppShell.module.css';

function MobileAppShellContent({ children, sidebar, headerProps = {}, immersive = false, onAction, onNavigate }) {
  const navigate = useNavigate();
  const { title, isMoreMenuOpen, openMoreMenu, closeMoreMenu } = useMobileShell();

  const handleNavigate = (item) => {
    onNavigate?.(item);
    if (item.path) navigate(item.path);
  };

  return (
    <div className={styles.shell} data-mobile-app-shell>
      {sidebar ? <aside className={styles.desktopSidebar}>{sidebar}</aside> : null}
      <div className={styles.workspace}>
        {immersive ? null : <MobileHeader title={title} {...headerProps} />}
        <main className={immersive ? `${styles.content} ${styles.contentImmersive}` : styles.content}>
          {children}
        </main>
        <BottomNavigation onNavigate={onNavigate} onOpenMore={openMoreMenu} />
      </div>
      <MoreMenu
        isOpen={isMoreMenuOpen}
        onClose={closeMoreMenu}
        onNavigate={handleNavigate}
        onAction={onAction}
      />
    </div>
  );
}

function MobileAppShell({ children, title, sidebar, headerProps, immersive = false, onAction, onNavigate }) {
  return (
    <ShellProvider initialTitle={title}>
      <MobileAppShellContent
        sidebar={sidebar}
        headerProps={headerProps}
        immersive={immersive}
        onAction={onAction}
        onNavigate={onNavigate}
      >
        {children}
      </MobileAppShellContent>
    </ShellProvider>
  );
}

export default MobileAppShell;
