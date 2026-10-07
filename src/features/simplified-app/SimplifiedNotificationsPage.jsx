import { useNavigate } from 'react-router-dom';
import IconBox from '../../components/ui/IconBox/index.js';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import { cx } from '../../utils/cx.js';
import { PUSH_STATUS, useWebPush } from '../mobile-push/useWebPush.js';
import {
  formatNotificationTime,
  groupNotificationsByDay,
} from '../notifications/notificationGroups.js';
import { isNotificationUnread, isSafeInternalUrl } from '../notifications/notificationFormatting.js';
import { useNotifications } from '../notifications/useNotifications.js';
import {
  PhCalendarCheckIcon,
  PhChatCircleTextIcon,
  PhFlagIcon,
  PhReceiptIcon,
  PhShieldCheckIcon,
  PhUsersThreeIcon,
} from './SimplifiedIcons.jsx';
import SimplifiedSubpageHeader from './SimplifiedSubpageHeader.jsx';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import groups from './simplifiedGroups.module.css';
import styles from './simplifiedNotifications.module.css';

// Ícone e cor por tipo de notificação (tela 13 do handoff): financeiro em
// azul, metas em verde, agenda em violeta; os demais em neutro.
const TYPE_PRESENTATION = Object.freeze({
  financeiro: Object.freeze({ Icon: PhReceiptIcon, tone: 'blue' }),
  metas: Object.freeze({ Icon: PhFlagIcon, tone: 'green' }),
  agenda: Object.freeze({ Icon: PhCalendarCheckIcon, tone: 'violet' }),
  crm: Object.freeze({ Icon: PhUsersThreeIcon, tone: 'neutral' }),
  sistema: Object.freeze({ Icon: PhShieldCheckIcon, tone: 'neutral' }),
  uni: Object.freeze({ Icon: PhChatCircleTextIcon, tone: 'violet' }),
});

function resolveTypePresentation(type) {
  return TYPE_PRESENTATION[type] ?? TYPE_PRESENTATION.sistema;
}

/**
 * Fase 3 do redesign (#90): página de notificações (tela 13), alcançada
 * pelo item Notificações do Mais. Usa a MESMA fonte do sino do header
 * (useNotifications: lista, contagem, marcar como lida) -- nunca um
 * segundo estado. Tocar num item marca como lido e segue para a rota
 * interna segura do aviso, como no painel. Dispensar continua no painel
 * do sino (gesto de arrastar), que o handoff não traz nesta tela.
 */
function SimplifiedNotificationsPage() {
  const navigate = useNavigate();
  const {
    notifications, unreadCount, isLoading, error, refresh, markAsRead, markAllAsRead,
  } = useNotifications();
  // NOTIF-UX3: mesmo aviso do painel do sino -- DEFAULT é o único estado em
  // que o toque resolve algo; denied/unsupported não têm ação útil aqui.
  const { status: pushStatus, enableNotifications: enablePushNotifications } = useWebPush();
  const showPushCta = pushStatus === PUSH_STATUS.DEFAULT;
  const isPushEnabling = pushStatus === PUSH_STATUS.ENABLING;
  const isPushEnabled = pushStatus === PUSH_STATUS.ENABLED;

  const dayGroups = groupNotificationsByDay(notifications);

  function handleActivate(notification) {
    if (isNotificationUnread(notification)) {
      markAsRead(notification.id);
    }
    // Bloqueia qualquer URL externa arbitrária -- só navega quando
    // action_url é uma rota interna segura (isSafeInternalUrl).
    if (isSafeInternalUrl(notification.action_url)) {
      navigate(notification.action_url);
    }
  }

  return (
    <div className={styles.page} data-simplified-notifications>
      <SimplifiedSubpageHeader
        title="Notificações"
        onBack={() => navigate(SIMPLIFIED_ROUTES.ACCOUNT)}
        backLabel="Voltar para Mais"
        action={unreadCount > 0 ? (
          <button
            type="button"
            className={styles.markAll}
            disabled={isLoading}
            onClick={() => markAllAsRead()}
          >
            Marcar todas como lidas
          </button>
        ) : null}
      />

      {isLoading && notifications.length === 0 ? (
        <p className={styles.state} role="status">Carregando notificações…</p>
      ) : error ? (
        <div className={styles.state} role="alert">
          <p>Não foi possível carregar suas notificações.</p>
          <OutlineButton variant="secondary" onClick={() => refresh()}>Tentar novamente</OutlineButton>
        </div>
      ) : notifications.length === 0 ? (
        <p className={styles.state} role="status">Nenhuma notificação por enquanto.</p>
      ) : (
        dayGroups.map((group) => (
          <section key={group.key} className={styles.dayGroup} aria-label={group.label}>
            <h2 className={groups.groupLabel}>{group.label}</h2>
            <ul className={styles.list}>
              {group.items.map((notification) => {
                const unread = isNotificationUnread(notification);
                const { Icon, tone } = resolveTypePresentation(notification.type);
                return (
                  <li key={notification.id}>
                    <button
                      type="button"
                      className={styles.item}
                      data-unread={unread ? 'true' : 'false'}
                      onClick={() => handleActivate(notification)}
                      aria-label={`${notification.title}${unread ? ' (não lida)' : ''}`}
                    >
                      <IconBox className={cx(styles.icon, unread && styles[`tone_${tone}`])}>
                        <Icon />
                      </IconBox>
                      <span className={styles.itemText}>
                        <span className={styles.itemTitle}>{notification.title}</span>
                        {notification.message ? (
                          <span className={styles.itemMessage}>{notification.message}</span>
                        ) : null}
                      </span>
                      <span className={styles.itemMeta}>
                        <span className={styles.itemTime}>{formatNotificationTime(notification.created_at)}</span>
                        {unread ? <span className={styles.unreadDot} aria-hidden="true" /> : null}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))
      )}

      {showPushCta ? (
        <div className={styles.pushCta}>
          <p>Receba lembretes mesmo com a UniFlow fechada.</p>
          <OutlineButton disabled={isPushEnabling} onClick={() => enablePushNotifications()}>
            {isPushEnabling ? 'Ativando…' : 'Ativar notificações'}
          </OutlineButton>
        </div>
      ) : null}

      {isPushEnabled ? null : (
        <p className={styles.note}>
          Por enquanto, as notificações aparecem só aqui no app. Elas não chegam por e-mail nem por push.
        </p>
      )}
    </div>
  );
}

export default SimplifiedNotificationsPage;
