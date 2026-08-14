import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
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
          A UniFlow usa dados de uso para entender quais telas e recursos funcionam melhor. Não
          enviamos ao Analytics seus dados financeiros, mensagens, áudios ou transcrições.
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
          <Button
            type="button"
            variant={status === GA4_CONSENT_STATUS.GRANTED ? 'primary' : 'outline'}
            fullWidth
            aria-pressed={status === GA4_CONSENT_STATUS.GRANTED}
            onClick={accept}
          >
            Permitir
          </Button>
          <Button
            type="button"
            variant={status === GA4_CONSENT_STATUS.DENIED ? 'primary' : 'outline'}
            fullWidth
            aria-pressed={status === GA4_CONSENT_STATUS.DENIED}
            onClick={deny}
          >
            Não permitir
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default AnalyticsConsentPreferencesModal;
