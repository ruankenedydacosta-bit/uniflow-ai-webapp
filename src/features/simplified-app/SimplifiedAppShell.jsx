import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import Modal from '../../components/ui/Modal/Modal.jsx';
import NotificationsPanel from '../notifications/NotificationsPanel.jsx';
import { useNotifications } from '../notifications/useNotifications.js';
import SimplifiedBottomNavigation from './SimplifiedBottomNavigation.jsx';
import SimplifiedHeader from './SimplifiedHeader.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedApp.module.css';

function SimplifiedAppShell({ children }) {
  const location = useLocation();
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    isLoading,
    error,
    refresh,
    markAsRead,
    markAllAsRead,
  } = useNotifications();
  // ETAPA 4: Conta e suas rotas internas (/app/conta/...) também têm
  // cabeçalho próprio (título + voltar, ou título + Falar com a Uni na
  // principal) -- mesmo padrão já usado por Registros, nunca o cabeçalho
  // genérico (marca + sino) duplicado por cima.
  const hasPageHeader = location.pathname === SIMPLIFIED_ROUTES.RECORDS
    || location.pathname === SIMPLIFIED_ROUTES.ACCOUNT
    || location.pathname.startsWith(`${SIMPLIFIED_ROUTES.ACCOUNT}/`);

  return (
    <div className={styles.shell} data-simplified-app-shell>
      <div className={styles.shellSurface}>
        {hasPageHeader ? null : (
          <SimplifiedHeader
            unreadCount={unreadCount}
            onNotifications={() => setIsNotificationsOpen(true)}
          />
        )}
        <main className={styles.mainContent}>{children}</main>
        <SimplifiedBottomNavigation />
      </div>

      <Modal
        open={isNotificationsOpen}
        onClose={() => setIsNotificationsOpen(false)}
        title="Notificações"
        size="sm"
      >
        <NotificationsPanel
          notifications={notifications}
          isLoading={isLoading}
          error={error}
          unreadCount={unreadCount}
          onMarkAsRead={markAsRead}
          onMarkAllAsRead={markAllAsRead}
          onRetry={refresh}
          onNavigate={() => setIsNotificationsOpen(false)}
        />
      </Modal>
    </div>
  );
}

export default SimplifiedAppShell;
