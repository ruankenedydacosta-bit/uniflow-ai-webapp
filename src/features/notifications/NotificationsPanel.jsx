import { useRef, useState } from 'react';
import IconBox from '../../components/ui/IconBox/index.js';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import {
  PhCalendarCheckIcon,
  PhChatCircleTextIcon,
  PhCheckIcon,
  PhEyeSlashIcon,
  PhFlagIcon,
  PhReceiptIcon,
  PhShieldCheckIcon,
  PhUsersThreeIcon,
  PhXIcon,
} from '../simplified-app/SimplifiedIcons.jsx';
import { groupNotificationsByDay } from './notificationGroups.js';
import {
  formatNotificationDate,
  getNotificationMessage,
  isNotificationUnread,
  isSafeInternalUrl,
} from './notificationFormatting.js';
import styles from './NotificationsPanel.module.css';

// Tela 13 v2: o ícone diz o tipo (calendário para Agenda, recibo para conta,
// bandeira para Metas), então a linha não repete o nome do tipo. A cor do
// tipo só aparece na não lida; a lida fica neutra.
const TYPE_PRESENTATION = Object.freeze({
  financeiro: Object.freeze({ Icon: PhReceiptIcon, tone: 'blue' }),
  metas: Object.freeze({ Icon: PhFlagIcon, tone: 'green' }),
  agenda: Object.freeze({ Icon: PhCalendarCheckIcon, tone: 'violet' }),
  crm: Object.freeze({ Icon: PhUsersThreeIcon, tone: null }),
  sistema: Object.freeze({ Icon: PhShieldCheckIcon, tone: null }),
  uni: Object.freeze({ Icon: PhChatCircleTextIcon, tone: 'violet' }),
});

function resolveTypePresentation(type) {
  return TYPE_PRESENTATION[type] ?? TYPE_PRESENTATION.sistema;
}

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
  const message = getNotificationMessage(notification);
  const { Icon, tone } = resolveTypePresentation(notification.type);
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
  const isDragging = dragX !== 0;

  return (
    <li
      className={styles.itemWrapper}
      data-dragging={isDragging ? 'true' : undefined}
      style={{ opacity: isDismissing ? 0 : 1 }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {/* Fundo revelado pelo arrastar, do lado que a linha deixa livre. */}
      {isDragging ? (
        <span className={styles.swipeHint} data-side={dragX < 0 ? 'end' : 'start'} aria-hidden="true">
          <PhEyeSlashIcon />
          Dispensar
        </span>
      ) : null}
      <div
        className={styles.itemRow}
        data-notification-row
        style={{
          transform: isDragging ? `translateX(${dragX}px)` : undefined,
          transition: isDismissing ? 'transform 180ms ease' : isDragging ? 'none' : 'transform 180ms ease',
        }}
      >
        <button
          type="button"
          className={styles.item}
          data-unread={unread ? 'true' : 'false'}
          style={{ opacity }}
          onClick={() => onActivate(notification)}
        >
          <IconBox tone={unread && tone ? tone : undefined} className={unread ? undefined : styles.iconRead}>
            <Icon />
          </IconBox>
          <span className={styles.itemText}>
            <span className={styles.itemTitle}>
              {notification.title}
              {unread ? <span className={styles.srOnly}> (não lida)</span> : null}
            </span>
            {message ? (
              <span className={styles.itemMessage}>{message}</span>
            ) : null}
          </span>
          <span className={styles.itemMeta}>
            <span className={styles.itemTime}>{formatNotificationDate(notification.created_at)}</span>
            {unread ? <span className={styles.unreadDot} aria-hidden="true" /> : null}
          </span>
        </button>
        {/* Dispensa só a notificação -- nunca o compromisso/registro de
            origem (ver notificationsService.js/dismissNotification e a
            migration NOTIF2, que cuida do caso inverso: excluir o
            compromisso remove a notificação automaticamente via cascade).
            Com mouse, aparece no lugar da hora ao passar o mouse ou focar
            pelo teclado; no toque não há X, o gesto é arrastar. */}
        <button
          type="button"
          className={styles.itemDismiss}
          onClick={(event) => {
            event.stopPropagation();
            commitDismiss();
          }}
          aria-label={`Dispensar notificação: ${notification.title}`}
        >
          <PhXIcon />
        </button>
      </div>
    </li>
  );
}

/**
 * Lista agrupada por dia (Hoje, Ontem, Anteriores). Usada pelo painel do
 * sino e pela página de notificações do Mais.
 */
export function NotificationList({ notifications, onActivate, onDismiss }) {
  const dayGroups = groupNotificationsByDay(notifications);

  return (
    <div className={styles.groups}>
      {dayGroups.map((group) => (
        <section key={group.key} className={styles.dayGroup} aria-label={group.label}>
          <h3 className={styles.groupLabel}>{group.label}</h3>
          <ul className={styles.list}>
            {group.items.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onActivate={onActivate}
                onDismiss={(id) => onDismiss?.(id)}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function NotificationsPanel({
  notifications = [],
  isLoading = false,
  error = null,
  unreadCount = 0,
  title,
  titleId,
  onClose,
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
        {title ? <h2 id={titleId} className={styles.title}>{title}</h2> : null}
        {/* O sino já mostra a contagem; aqui ela fica só para o leitor de tela. */}
        <span className={styles.srOnly} role="status">
          {unreadCount > 0 ? `${unreadCount} não lida${unreadCount > 1 ? 's' : ''}` : 'Tudo em dia'}
        </span>
        <span className={styles.headerActions}>
          {unreadCount > 0 ? (
            <button
              type="button"
              className={styles.markAll}
              disabled={isLoading}
              onClick={() => onMarkAllAsRead?.()}
            >
              Marcar todas como lidas
            </button>
          ) : null}
          {onClose ? (
            <button
              type="button"
              className={styles.close}
              onClick={() => onClose()}
              aria-label="Fechar notificações"
            >
              <PhXIcon />
            </button>
          ) : null}
        </span>
      </div>

      {isLoading ? (
        <p className={styles.stateMessage} role="status">Carregando notificações…</p>
      ) : error ? (
        <div className={styles.stateMessage} role="alert">
          <p>Não foi possível carregar suas notificações.</p>
          <OutlineButton variant="secondary" onClick={() => onRetry?.()}>
            Tentar novamente
          </OutlineButton>
        </div>
      ) : notifications.length === 0 ? (
        <div className={styles.emptyState} role="status">
          <IconBox tone="green" className={styles.emptyIcon}><PhCheckIcon /></IconBox>
          <span>Nenhuma notificação por enquanto.</span>
        </div>
      ) : (
        <NotificationList
          notifications={notifications}
          onActivate={handleItemActivate}
          onDismiss={onDismiss}
        />
      )}
    </div>
  );
}

export default NotificationsPanel;
