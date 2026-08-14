import Button from '../../components/ui/Button/Button.jsx';
import Modal from '../../components/ui/Modal/Modal.jsx';
import { GA4_CONSENT_STATUS } from './ga4Contracts.js';
import { useAnalyticsConsent } from './useAnalyticsConsent.js';
import styles from './analyticsConsent.module.css';

const STATUS_LABELS = Object.freeze({
  [GA4_CONSENT_STATUS.UNKNOWN]: 'Você ainda não escolheu uma preferência.',
  [GA4_CONSENT_STATUS.GRANTED]: 'Analytics está aceito neste dispositivo.',
  [GA4_CONSENT_STATUS.DENIED]: 'Analytics está recusado neste dispositivo.',
});

function AnalyticsConsentPreferencesModal({ open, onClose }) {
  const { accept, deny, persistence, status } = useAnalyticsConsent();

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Preferências de Analytics"
      description="Você pode mudar sua escolha a qualquer momento."
      size="sm"
    >
      <div className={styles.preferenceContent}>
        <p>
          O Analytics ajuda a entender o uso do app e melhorar a experiência. A UniFlow não envia
          dados financeiros, mensagens, áudio, Agenda ou informações pessoais ao Google Analytics.
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
            Aceitar Analytics
          </Button>
          <Button
            type="button"
            variant={status === GA4_CONSENT_STATUS.DENIED ? 'primary' : 'outline'}
            fullWidth
            aria-pressed={status === GA4_CONSENT_STATUS.DENIED}
            onClick={deny}
          >
            Recusar Analytics
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default AnalyticsConsentPreferencesModal;
