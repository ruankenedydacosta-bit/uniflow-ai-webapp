import Badge from '../../components/ui/Badge/Badge.jsx';
import Button from '../../components/ui/Button/Button.jsx';
import { PUSH_STATUS, useWebPush } from './useWebPush.js';
import styles from './SimplifiedPushNotificationsCard.module.css';

// PUSH1 (ajuste de UX): mesma logica de useWebPush.js de sempre -- so a
// apresentacao muda para o vocabulario visual real do app (Conta,
// simplifiedAccount.module.css), no lugar da tela /configuracoes que nunca
// e alcancavel pela navegacao real (App.jsx redireciona qualquer rota nao
// simplificada para /app/home). Depois de ativado uma vez, o usuario nunca
// precisa voltar aqui -- push funciona em background normalmente; esta
// tela so serve para ativar/ver status/testar/desativar.
function SimplifiedPushNotificationsCard() {
  const {
    capabilities, isPushConfigured, status, error, lastTestResult,
    enableNotifications, disableNotifications, sendTest,
  } = useWebPush();

  const isEnabled = status === PUSH_STATUS.ENABLED;
  const isBusy = status === PUSH_STATUS.ENABLING
    || status === PUSH_STATUS.DISABLING
    || status === PUSH_STATUS.SENDING_TEST
    || status === PUSH_STATUS.CHECKING;

  return (
    <section className={styles.card} aria-label="Notificações no celular">
      <div className={styles.header}>
        <div>
          <h2>Notificações no celular</h2>
          <p>Receba lembretes importantes da Uni mesmo com o app fechado.</p>
        </div>
        <Badge variant={isEnabled ? 'success' : 'secondary'} size="sm" dot>
          {isEnabled ? 'Ativadas' : 'Desativadas'}
        </Badge>
      </div>

      {capabilities.needsAddToHomeScreen ? (
        <p className={styles.hint}>
          Para receber notificações no iPhone, adicione a UniFlow à Tela de Início.
        </p>
      ) : !capabilities.isSupported ? (
        <p className={styles.hint}>Este navegador não tem suporte a notificações push.</p>
      ) : !isPushConfigured ? (
        <p className={styles.hint}>Notificações push ainda não estão configuradas neste ambiente.</p>
      ) : status === PUSH_STATUS.DENIED ? (
        <p className={styles.hint}>
          As notificações foram bloqueadas nas configurações do navegador/sistema. Permita notificações
          para a UniFlow para ativar por aqui novamente.
        </p>
      ) : status === PUSH_STATUS.CHECKING ? (
        <p className={styles.hint}>Verificando…</p>
      ) : isEnabled ? (
        <p className={styles.hint}>Ativadas neste dispositivo.</p>
      ) : null}

      {error ? <p className={styles.error} role="alert">Não foi possível concluir. Tente novamente.</p> : null}
      {lastTestResult && !lastTestResult.error ? (
        <p className={styles.success} role="status">Notificação de teste enviada.</p>
      ) : null}

      <div className={styles.actions}>
        {isEnabled ? (
          <>
            <Button variant="outline" size="sm" disabled={isBusy} onClick={() => sendTest()}>
              {status === PUSH_STATUS.SENDING_TEST ? 'Enviando…' : 'Enviar notificação de teste'}
            </Button>
            <Button variant="ghost" size="sm" disabled={isBusy} onClick={() => disableNotifications()}>
              {status === PUSH_STATUS.DISABLING ? 'Desativando…' : 'Desativar notificações'}
            </Button>
          </>
        ) : (
          <Button
            variant="primary"
            size="sm"
            disabled={
              isBusy
              || !capabilities.isSupported
              || !isPushConfigured
              || status === PUSH_STATUS.DENIED
              || capabilities.needsAddToHomeScreen
            }
            onClick={() => enableNotifications()}
          >
            {status === PUSH_STATUS.ENABLING ? 'Ativando…' : 'Ativar notificações'}
          </Button>
        )}
      </div>
    </section>
  );
}

export default SimplifiedPushNotificationsCard;
