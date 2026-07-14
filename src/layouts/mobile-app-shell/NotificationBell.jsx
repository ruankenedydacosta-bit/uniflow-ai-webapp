import styles from './MobileContextHeader.module.css';
import { NOTIFICATION_STATES } from './mobileContextHeaderSchema.js';

function NotificationBell({ state = 'none', count = 0, onPress }) {
  const safeState = NOTIFICATION_STATES.includes(state) ? state : 'none';
  const badgeLabel = count > 9 ? '9+' : String(Math.max(0, count));
  const showsBadge = ['unread', 'important'].includes(safeState);

  return (
    <button
      type="button"
      className={`${styles.bellButton} ${styles[`bell${safeState.replace('-', '')}`]}`}
      aria-label="Abrir notificações"
      aria-busy={safeState === 'loading'}
      onClick={() => onPress?.()}
    >
      <span className={styles.bellIcon} aria-hidden="true" />
      {showsBadge ? (
        <span className={count > 0 ? styles.notificationCount : styles.notificationDot}>
          {count > 0 ? badgeLabel : null}
        </span>
      ) : null}
    </button>
  );
}

export default NotificationBell;
