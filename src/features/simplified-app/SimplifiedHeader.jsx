import { BellIcon, UniMark } from './SimplifiedIcons.jsx';
import styles from './simplifiedApp.module.css';

function SimplifiedHeader({
  unreadCount = 0,
  isNotificationsOpen = false,
  notificationButtonRef,
  onNotifications,
}) {
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <header className={styles.header}>
      <div className={styles.brandLockup} aria-label="UniFlow AI">
        <span className={styles.brandMark} aria-hidden="true"><UniMark /></span>
        <strong>UNIFLOW <span>AI</span></strong>
      </div>

      <button
        ref={notificationButtonRef}
        type="button"
        className={styles.notificationButton}
        aria-label={unreadCount > 0
          ? `Notificações, ${unreadCount} não lidas`
          : 'Notificações'}
        aria-expanded={isNotificationsOpen}
        aria-controls="simplified-notifications-panel"
        onClick={onNotifications}
      >
        <BellIcon />
        {unreadCount > 0 ? (
          <span className={styles.notificationCount} aria-hidden="true">{badgeLabel}</span>
        ) : null}
      </button>
    </header>
  );
}

export default SimplifiedHeader;
