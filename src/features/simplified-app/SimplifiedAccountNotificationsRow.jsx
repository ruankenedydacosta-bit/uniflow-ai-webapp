import { useWebPush, PUSH_STATUS } from '../mobile-push/useWebPush.js';
import { BellIcon, ChevronRightIcon } from './SimplifiedIcons.jsx';
import styles from './simplifiedAccount.module.css';

/**
 * NOTIF-UX3: substitui o antigo card grande "Notificações no celular" por
 * uma linha compacta, no MESMO padrão visual de Agenda/Pagamento/Voz/
 * Suporte -- reaproveita useWebPush() (mesmo hook/estado/persistência de
 * sempre, nunca uma segunda arquitetura de subscription).
 *
 * Nenhum controle de teste ou de desligar a capacidade fica visível para
 * o usuário comum: revogar é responsabilidade do sistema operacional
 * (Android/iOS), não da UI da UniFlow -- se o usuário revogar por lá, o
 * self-healing do próprio useWebPush() (reconciliação no mount com a
 * subscription REAL do navegador) já detecta e volta para o estado inicial
 * sozinho, sem fingir que continua ativo.
 */
function SimplifiedAccountNotificationsRow() {
  const {
    capabilities, isPushConfigured, status, enableNotifications,
  } = useWebPush();

  const isEnabled = status === PUSH_STATUS.ENABLED;
  const isEnabling = status === PUSH_STATUS.ENABLING;
  const canEnable = capabilities.isSupported
    && isPushConfigured
    && !capabilities.needsAddToHomeScreen
    && status !== PUSH_STATUS.DENIED;

  const subtitle = isEnabled
    ? 'Ativadas neste dispositivo'
    : isEnabling
      ? 'Ativando…'
      : 'Ativar notificações';

  return (
    <button
      type="button"
      className={styles.menuRow}
      disabled={!isEnabled && (!canEnable || isEnabling)}
      onClick={() => {
        if (!isEnabled) enableNotifications();
      }}
    >
      <span className={`${styles.menuIcon} ${styles.toneBlue}`} aria-hidden="true">
        <BellIcon />
      </span>
      <span className={styles.menuText}>
        <strong>Notificações</strong>
        <small>{subtitle}</small>
      </span>
      <span
        className={`${styles.notificationStatusDot} ${isEnabled ? styles.notificationStatusDotOn : ''}`}
        aria-hidden="true"
      />
      {isEnabled ? null : <span className={styles.menuChevron} aria-hidden="true"><ChevronRightIcon /></span>}
    </button>
  );
}

export default SimplifiedAccountNotificationsRow;
