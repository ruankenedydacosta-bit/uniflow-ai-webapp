import { useState } from 'react';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import { PUSH_STATUS, useWebPush } from '../mobile-push/useWebPush.js';
import { isNotificationUnread, isSafeInternalUrl } from '../notifications/notificationFormatting.js';
import { NotificationList } from '../notifications/NotificationsPanel.jsx';
import SimplifiedSubpageHeader from './SimplifiedSubpageHeader.jsx';
import { useSimplifiedNotifications } from './simplifiedNotificationsContext.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import { useNavegar } from './movimentoDeTelaContext.js';
import styles from './simplifiedNotifications.module.css';

/**
 * Fase 3 do redesign (#90): página de notificações (tela 13), alcançada
 * pelo item Notificações do Mais. Lê o MESMO estado do sino do header,
 * publicado pelo SimplifiedAppShell por contexto (uma única instância de
 * useNotifications): marcar como lida aqui atualiza o sino na hora e a
 * lista não é buscada duas vezes. Tocar num item marca como lido e segue para a rota
 * interna segura do aviso, como no painel. A lista é a mesma do painel
 * (NotificationList, tela 13 v2): arrastar dispensa no toque, e o X aparece
 * no hover com mouse.
 */
function SimplifiedNotificationsPage() {
  const navigate = useNavegar();
  const {
    notifications, unreadCount, isLoading, error, refresh, markAsRead, markAllAsRead, dismissNotification,
  } = useSimplifiedNotifications();
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  // NOTIF-UX3: mesmo aviso do painel do sino -- DEFAULT é o único estado em
  // que o toque resolve algo; denied/unsupported não têm ação útil aqui.
  const { status: pushStatus, enableNotifications: enablePushNotifications } = useWebPush();
  const showPushCta = pushStatus === PUSH_STATUS.DEFAULT;
  const isPushEnabling = pushStatus === PUSH_STATUS.ENABLING;
  const isPushEnabled = pushStatus === PUSH_STATUS.ENABLED;
  // A nota do handoff só vale quando não há como ativar o push por aqui
  // (negado, sem suporte ou sem configuração) e ele não está ativo.
  const showNoPushNote = !showPushCta && !isPushEnabling && !isPushEnabled;

  async function handleMarkAllAsRead() {
    if (isMarkingAll) return;
    setIsMarkingAll(true);
    try {
      await markAllAsRead();
    } finally {
      setIsMarkingAll(false);
    }
  }

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
            disabled={isMarkingAll}
            onClick={handleMarkAllAsRead}
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
        <NotificationList
          notifications={notifications}
          onActivate={handleActivate}
          onDismiss={dismissNotification}
          headingLevel={2}
        />
      )}

      {showPushCta ? (
        <div className={styles.pushCta}>
          <p>Receba lembretes mesmo com a UniFlow fechada.</p>
          <OutlineButton disabled={isPushEnabling} onClick={() => enablePushNotifications()}>
            {isPushEnabling ? 'Ativando…' : 'Ativar notificações'}
          </OutlineButton>
        </div>
      ) : null}

      {showNoPushNote ? (
        <p className={styles.note}>
          Por enquanto, as notificações aparecem só aqui no app. Elas não chegam por e-mail nem por push.
        </p>
      ) : null}
    </div>
  );
}

export default SimplifiedNotificationsPage;
