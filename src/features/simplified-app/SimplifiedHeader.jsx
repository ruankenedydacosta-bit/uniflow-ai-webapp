import { BellIcon, UniMark } from './SimplifiedIcons.jsx';
import styles from './simplifiedApp.module.css';

/**
 * HEADER-SCROLL2: `hidden` reflete "efetivamente escondido" (progress
 * contínuo >= HEADER_EFFECTIVELY_HIDDEN_PROGRESS, ver
 * collapsibleHeaderScroll.js -- dono de TODA a lógica de scroll/fade)
 * -- este componente só reflete o estado, nunca decide sozinho quando
 * esconder. O visual (transform/opacity/mask) é sempre contínuo via CSS
 * (--header-progress), independente deste prop -- `hidden` só controla
 * interação: aria-hidden + tabIndex=-1 no sino, nunca captura toque
 * enquanto praticamente invisível.
 */
function SimplifiedHeader({
  unreadCount = 0,
  isNotificationsOpen = false,
  notificationButtonRef,
  onNotifications,
  hidden = false,
}) {
  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount);

  return (
    <header className={styles.header} data-hidden={hidden ? 'true' : 'false'} aria-hidden={hidden}>
      <div className={styles.brandLockup} aria-label="UniFlow AI">
        <span className={styles.brandMark} aria-hidden="true"><UniMark /></span>
        <strong>UNIFLOW <span>AI</span></strong>
      </div>

      {/* COMPACT-HEADER1: agrupa as ações da direita num container próprio
          -- um segundo ícone futuro ao lado do sino só precisa entrar
          aqui dentro, sem tocar no layout esquerda/direita já existente. */}
      <div className={styles.headerActions}>
        <button
          ref={notificationButtonRef}
          type="button"
          className={styles.notificationButton}
          aria-label={unreadCount > 0
            ? `Notificações, ${unreadCount} não lidas`
            : 'Notificações'}
          aria-expanded={isNotificationsOpen}
          aria-controls="simplified-notifications-panel"
          tabIndex={hidden ? -1 : undefined}
          onClick={onNotifications}
        >
          <BellIcon />
          {unreadCount > 0 ? (
            <span className={styles.notificationCount} aria-hidden="true">{badgeLabel}</span>
          ) : null}
        </button>
      </div>
    </header>
  );
}

export default SimplifiedHeader;
