import Modal from '../../components/ui/Modal/Modal.jsx';
import OutlineButton from '../../components/ui/OutlineButton/OutlineButton.jsx';
import { GA4_CONSENT_STATUS } from './ga4Contracts.js';
import { useAnalyticsConsent } from './useAnalyticsConsent.js';
import styles from './analyticsConsent.module.css';

const STATUS_LABELS = Object.freeze({
  [GA4_CONSENT_STATUS.UNKNOWN]: 'Você ainda não escolheu uma preferência.',
  [GA4_CONSENT_STATUS.GRANTED]: 'O uso de dados para melhoria está permitido neste dispositivo.',
  [GA4_CONSENT_STATUS.DENIED]: 'O uso de dados para melhoria não está permitido neste dispositivo.',
});

function AnalyticsConsentPreferencesModal({ open, onClose }) {
  const { accept, deny, persistence, status } = useAnalyticsConsent();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Privacidade e melhoria do app"
      description="Você pode mudar sua escolha a qualquer momento."
      size="sm"
    >
      <div className={styles.preferenceContent}>
        <p>
          A UniFlow usa dados de uso para saber quais telas funcionam melhor. Seus dados
          financeiros, mensagens, áudios e transcrições não são enviados.
        </p>
        <p className={styles.currentStatus} role="status">
          {STATUS_LABELS[status]}
        </p>
        {persistence === 'session_only' || persistence === 'unavailable' ? (
          <p className={styles.storageWarning} role="alert">
            Não foi possível salvar a escolha neste dispositivo. Ela valerá somente nesta sessão.
          </p>
        ) : null}
        <div className={styles.preferenceActions}>
          <OutlineButton
            variant={status === GA4_CONSENT_STATUS.GRANTED ? 'primary' : 'secondary'}
            aria-pressed={status === GA4_CONSENT_STATUS.GRANTED}
            onClick={accept}
          >
            Permitir
          </OutlineButton>
          <OutlineButton
            variant={status === GA4_CONSENT_STATUS.DENIED ? 'primary' : 'secondary'}
            aria-pressed={status === GA4_CONSENT_STATUS.DENIED}
            onClick={deny}
          >
            Não permitir
          </OutlineButton>
        </div>
      </div>
    </Modal>
  );
}

export default AnalyticsConsentPreferencesModal;
