import Button from '../../components/ui/Button/Button.jsx';
import { LockIcon } from '../simplified-app/SimplifiedIcons.jsx';
import { GA4_CONSENT_STATUS } from './ga4Contracts.js';
import { useAnalyticsConsent } from './useAnalyticsConsent.js';
import styles from './analyticsConsent.module.css';

function AnalyticsConsentBanner() {
  const { accept, deny, status } = useAnalyticsConsent();

  if (status !== GA4_CONSENT_STATUS.UNKNOWN) return null;

  return (
    <aside
      className={styles.bannerPosition}
      aria-labelledby="analytics-consent-title"
      aria-describedby="analytics-consent-description"
      data-analytics-consent-banner
    >
      <div className={styles.bannerCard}>
        <span className={styles.bannerIcon} aria-hidden="true">
          <LockIcon />
        </span>
        <div className={styles.bannerCopy}>
          <h2 id="analytics-consent-title">Privacidade e melhoria do app</h2>
          <p id="analytics-consent-description">
            A UniFlow usa dados de uso para entender quais telas e recursos funcionam melhor. Não
            enviamos ao Analytics seus dados financeiros, mensagens, áudios ou transcrições.
          </p>
        </div>
        <div className={styles.bannerActions}>
          <Button
            type="button"
            variant="primary"
            className={styles.allowButton}
            fullWidth
            onClick={accept}
          >
            Permitir
          </Button>
          <Button
            type="button"
            variant="outline"
            className={styles.denyButton}
            fullWidth
            onClick={deny}
          >
            Não permitir
          </Button>
        </div>
      </div>
    </aside>
  );
}

export default AnalyticsConsentBanner;
