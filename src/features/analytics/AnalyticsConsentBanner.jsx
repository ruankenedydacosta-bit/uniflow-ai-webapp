import Button from '../../components/ui/Button/Button.jsx';
import { GA4_CONSENT_STATUS } from './ga4Contracts.js';
import { useAnalyticsConsent } from './useAnalyticsConsent.js';
import styles from './analyticsConsent.module.css';

function AnalyticsConsentBanner() {
  const { accept, deny, status } = useAnalyticsConsent();

  if (status !== GA4_CONSENT_STATUS.UNKNOWN) return null;

  return (
    <aside
      className={styles.bannerPosition}
      aria-label="Preferência de Analytics"
      data-analytics-consent-banner
    >
      <div className={styles.bannerCard}>
        <div className={styles.bannerCopy}>
          <strong>Ajude a melhorar a UniFlow</strong>
          <p>
            Podemos usar Analytics para entender como o app é utilizado e melhorar sua experiência?
            Não enviamos seus dados financeiros, mensagens ou informações pessoais.
          </p>
        </div>
        <div className={styles.bannerActions}>
          <Button type="button" variant="outline" onClick={accept}>
            Aceitar Analytics
          </Button>
          <Button type="button" variant="outline" onClick={deny}>
            Recusar Analytics
          </Button>
        </div>
      </div>
    </aside>
  );
}

export default AnalyticsConsentBanner;
