import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Modal from '../../components/ui/Modal/Modal.jsx';
import { useNotifications } from './useNotifications.js';
import NotificationsPanel from './NotificationsPanel.jsx';
import styles from './NotificationBell.module.css';

/**
 * Sino de notificações do Topbar desktop. Autocontido -- usa
 * useNotifications() diretamente (fonte única de lista/contagem
 * compartilhada com o painel mobile), sem props threading através de
 * AppShell/AuthenticatedLayout.
 */
function NotificationBell() {
  const [isOpen, setIsOpen] = useState(false);
  const navigate = useNavigate();
  const {
    notifications, unreadCount, isLoading, error, refresh, markAsRead, markAllAsRead,
  } = useNotifications();

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : 'Notificações'}
        aria-haspopup="dialog"
        onClick={() => setIsOpen(true)}
      >
        <span className={styles.bellIcon} aria-hidden="true" />
        {unreadCount > 0 ? (
          <span className={styles.badge} aria-hidden="true">{badgeLabel}</span>
        ) : null}
      </button>

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
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
          onNavigate={(url) => {
            setIsOpen(false);
            navigate(url);
          }}
        />
      </Modal>
    </>
  );
}

export default NotificationBell;
