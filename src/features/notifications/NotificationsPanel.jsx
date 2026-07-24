import Button from '../../components/ui/Button';
import {
  formatNotificationDate,
  getNotificationTypeLabel,
  isNotificationUnread,
  isSafeInternalUrl,
} from './notificationFormatting.js';
import styles from './NotificationsPanel.module.css';

function NotificationsPanel({
  notifications = [],
  isLoading = false,
  error = null,
  unreadCount = 0,
  onMarkAsRead,
  onMarkAllAsRead,
  onRetry,
  onNavigate,
}) {
  function handleItemActivate(notification) {
    if (isNotificationUnread(notification)) {
      onMarkAsRead?.(notification.id);
    }

    // Bloqueia qualquer URL externa arbitraria -- so navega quando
    // action_url e uma rota interna segura (isSafeInternalUrl).
    if (isSafeInternalUrl(notification.action_url)) {
      onNavigate?.(notification.action_url);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <span className={styles.unreadSummary} role="status">
          {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Tudo em dia'}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={unreadCount === 0 || isLoading}
          onClick={() => onMarkAllAsRead?.()}
        >
          Marcar todas como lidas
        </Button>
      </div>

      {isLoading ? (
        <p className={styles.stateMessage} role="status">Carregando notificações…</p>
      ) : error ? (
        <div className={styles.stateMessage} role="alert">
          <p>Não foi possível carregar suas notificações.</p>
          <Button variant="outline" size="sm" onClick={() => onRetry?.()}>
            Tentar novamente
          </Button>
        </div>
      ) : notifications.length === 0 ? (
        <p className={styles.stateMessage} role="status">
          Nenhuma notificação por enquanto.
        </p>
      ) : (
        <ul className={styles.list} aria-label="Lista de notificações">
          {notifications.map((notification) => {
            const unread = isNotificationUnread(notification);
            return (
              <li key={notification.id}>
                <button
                  type="button"
                  className={`${styles.item} ${unread ? styles.itemUnread : ''}`}
                  onClick={() => handleItemActivate(notification)}
                  aria-label={`${notification.title}${unread ? ' (não lida)' : ''}`}
                >
                  <span className={styles.itemTop}>
                    <span className={styles.itemType}>{getNotificationTypeLabel(notification.type)}</span>
                    <span className={styles.itemDate}>{formatNotificationDate(notification.created_at)}</span>
                  </span>
                  <strong className={styles.itemTitle}>{notification.title}</strong>
                  {notification.message ? (
                    <span className={styles.itemMessage}>{notification.message}</span>
                  ) : null}
                  {unread ? <span className={styles.unreadDot} aria-hidden="true" /> : null}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default NotificationsPanel;
