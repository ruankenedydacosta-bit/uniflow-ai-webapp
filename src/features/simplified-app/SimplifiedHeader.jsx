import { BellIcon, UniMark } from './SimplifiedIcons.jsx';
import styles from './simplifiedApp.module.css';

function SimplifiedHeader({ unreadCount = 0, onNotifications }) {
  return (
    <header className={styles.header}>
      <div className={styles.brandLockup} aria-label="UniFlow AI">
        <span className={styles.brandMark} aria-hidden="true"><UniMark /></span>
        <strong>UNIFLOW <span>AI</span></strong>
      </div>

      <button
        type="button"
        className={styles.notificationButton}
        aria-label={unreadCount > 0
          ? `Notificações, ${unreadCount} não lidas`
          : 'Notificações'}
        aria-haspopup="dialog"
        onClick={onNotifications}
      >
        <BellIcon />
        {unreadCount > 0 ? <span className={styles.notificationDot} aria-hidden="true" /> : null}
      </button>
    </header>
  );
}

export default SimplifiedHeader;
