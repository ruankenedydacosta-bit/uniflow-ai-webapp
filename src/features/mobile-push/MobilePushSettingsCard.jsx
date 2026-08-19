import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import { PUSH_STATUS, useWebPush } from './useWebPush.js';
import styles from './MobilePushSettingsCard.module.css';

// PUSH1: unico ponto de UI desta fase -- so ativa/desativa a capacidade do
// dispositivo e dispara a notificacao de teste. Nenhum agendamento,
// nenhuma pergunta da Uni, nenhum botao 30min/1h -- isso e integracao
// futura da Agenda.
function MobilePushSettingsCard() {
  const {
    capabilities, isPushConfigured, status, error, lastTestResult,
    enableNotifications, disableNotifications, sendTest,
  } = useWebPush();

  const isBusy = status === PUSH_STATUS.ENABLING
    || status === PUSH_STATUS.DISABLING
    || status === PUSH_STATUS.SENDING_TEST
    || status === PUSH_STATUS.CHECKING;

  return (
    <Card variant="outline" padding="lg" className={styles.card}>
      <div className={styles.header}>
        <div>
          <h3>Notificações no celular</h3>
          <p>Receba lembretes importantes da Uni mesmo com o app fechado.</p>
        </div>
        {status === PUSH_STATUS.ENABLED ? (
          <Badge variant="success" size="sm" dot>Ativadas</Badge>
        ) : null}
      </div>

      {capabilities.needsAddToHomeScreen ? (
        <p className={styles.hint}>
          No iPhone, adicione a UniFlow à Tela de Início (compartilhar → "Adicionar à Tela de Início")
          para poder ativar notificações.
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
      ) : null}

      {error ? <p className={styles.error} role="alert">Não foi possível concluir. Tente novamente.</p> : null}

      {lastTestResult && !lastTestResult.error ? (
        <p className={styles.success} role="status">Notificação de teste enviada.</p>
      ) : null}

      <div className={styles.actions}>
        {status === PUSH_STATUS.ENABLED ? (
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
            disabled={isBusy || !capabilities.isSupported || !isPushConfigured || status === PUSH_STATUS.DENIED}
            onClick={() => enableNotifications()}
          >
            {status === PUSH_STATUS.ENABLING ? 'Ativando…' : 'Ativar notificações'}
          </Button>
        )}
      </div>
    </Card>
  );
}

export default MobilePushSettingsCard;
