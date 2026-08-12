import { useRef, useState } from 'react';
import Button from '../../components/ui/Button';
import {
  formatNotificationDate,
  getNotificationTypeLabel,
  isNotificationUnread,
  isSafeInternalUrl,
} from './notificationFormatting.js';
import styles from './NotificationsPanel.module.css';

// NOTIF2: dispensar uma notificação (nunca o compromisso/registro de
// origem) -- arrastar pra qualquer lado até o fim some com fade gradiente,
// igual ao gesto nativo de notificação de celular. DISMISS_MAX_PX é o
// ponto em que a opacidade chega a zero e o gesto confirma a exclusão;
// abaixo de DISMISS_ACTIVATE_PX a linha volta pro lugar.
const DISMISS_ACTIVATE_PX = 88;
const DISMISS_MAX_PX = 160;
const DIRECTION_LOCK_PX = 8;

function NotificationItem({ notification, onActivate, onDismiss }) {
  const unread = isNotificationUnread(notification);
  const [dragX, setDragX] = useState(0);
  const [isDismissing, setIsDismissing] = useState(false);
  const dragStateRef = useRef(null);

  function handlePointerDown(event) {
    if (isDismissing) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragStateRef.current = { x: event.clientX, y: event.clientY, locked: null };
  }

  function handlePointerMove(event) {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;

    if (!drag.locked) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
      // Movimento vertical: é rolagem da lista, nunca arrastar -- solta o
      // gesto por completo (nunca disputa o scroll).
      drag.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (drag.locked === 'y') {
        dragStateRef.current = null;
        return;
      }
    }
    if (drag.locked !== 'x') return;

    event.preventDefault();
    setDragX(Math.max(-DISMISS_MAX_PX, Math.min(DISMISS_MAX_PX, dx)));
  }

  function commitDismiss() {
    setIsDismissing(true);
    setDragX((current) => (current >= 0 ? DISMISS_MAX_PX : -DISMISS_MAX_PX));
    window.setTimeout(() => onDismiss(notification.id), 180);
  }

  function handlePointerUp() {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (!drag || drag.locked !== 'x') return;

    if (Math.abs(dragX) >= DISMISS_ACTIVATE_PX) {
      commitDismiss();
    } else {
      setDragX(0);
    }
  }

  function handlePointerCancel() {
    dragStateRef.current = null;
    if (!isDismissing) setDragX(0);
  }

  const opacity = isDismissing ? 0 : 1 - Math.min(1, Math.abs(dragX) / DISMISS_MAX_PX);

  return (
    <li
      className={styles.itemWrapper}
      style={{
        transform: dragX ? `translateX(${dragX}px)` : undefined,
        opacity,
        transition: isDismissing ? 'transform 180ms ease, opacity 180ms ease' : dragX ? 'none' : 'transform 180ms ease',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      <button
        type="button"
        className={`${styles.item} ${unread ? styles.itemUnread : ''}`}
        onClick={() => onActivate(notification)}
        aria-label={`${notification.title}${unread ? ' (não lida)' : ''}`}
      >
        <span className={styles.itemTop}>
          <span className={styles.itemStatus}>
            {unread ? <span className={styles.unreadDot} aria-hidden="true" /> : null}
            <span className={styles.itemType}>{getNotificationTypeLabel(notification.type)}</span>
          </span>
          <span className={styles.itemDate}>{formatNotificationDate(notification.created_at)}</span>
        </span>
        <strong className={styles.itemTitle}>{notification.title}</strong>
        {notification.message ? (
          <span className={styles.itemMessage}>{notification.message}</span>
        ) : null}
      </button>
      {/* Dispensa só a notificação -- nunca o compromisso/registro de
          origem (ver notificationsService.js/deleteNotification e a
          migration NOTIF2, que cuida do caso inverso: excluir o
          compromisso remove a notificação automaticamente via cascade).
          Ocupa sozinho o lugar onde antes havia o ícone de tipo (removido
          -- o tipo já é indicado por texto em .itemType, o quadrado
          duplicava a informação e brigava visualmente com o X). */}
      <button
        type="button"
        className={styles.itemDismiss}
        onClick={(event) => {
          event.stopPropagation();
          commitDismiss();
        }}
        aria-label={`Dispensar notificação: ${notification.title}`}
      >
        ×
      </button>
    </li>
  );
}

function NotificationsPanel({
  notifications = [],
  isLoading = false,
  error = null,
  unreadCount = 0,
  onMarkAsRead,
  onMarkAllAsRead,
  onRetry,
  onNavigate,
  onDismiss,
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
        {unreadCount > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            disabled={isLoading}
            onClick={() => onMarkAllAsRead?.()}
          >
            Marcar todas como lidas
          </Button>
        ) : null}
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
        <div className={styles.stateMessage} role="status">
          <span className={styles.emptyIcon} aria-hidden="true">✓</span>
          <strong>Nenhuma notificação por enquanto.</strong>
          <span>Toda informação importante sobre sua conta aparecerá aqui.</span>
        </div>
      ) : (
        <ul className={styles.list} aria-label="Lista de notificações">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onActivate={handleItemActivate}
              onDismiss={(id) => onDismiss?.(id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default NotificationsPanel;
