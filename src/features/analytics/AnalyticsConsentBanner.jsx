import IconBox from '../../components/ui/IconBox/IconBox.jsx';
import OutlineButton from '../../components/ui/OutlineButton/OutlineButton.jsx';
import { PhLockSimpleIcon } from '../simplified-app/SimplifiedIcons.jsx';
import { GA4_CONSENT_STATUS } from './ga4Contracts.js';
import { useAnalyticsConsent } from './useAnalyticsConsent.js';
import styles from './analyticsConsent.module.css';

// Tela 22i: card fixo acima da barra inferior, sem escurecer a tela. Fica
// até a pessoa escolher; não tem X nem fechamento implícito.
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
        <div className={styles.bannerBody}>
          <IconBox tone="violet"><PhLockSimpleIcon /></IconBox>
          <div className={styles.bannerCopy}>
            <h2 id="analytics-consent-title">Privacidade e melhoria do app</h2>
            <p id="analytics-consent-description">
              A UniFlow usa dados de uso para saber quais telas funcionam melhor. Seus dados
              financeiros, mensagens, áudios e transcrições não são enviados.
            </p>
          </div>
        </div>
        <div className={styles.bannerActions}>
          <OutlineButton onClick={accept}>
            Permitir
          </OutlineButton>
          <OutlineButton variant="secondary" onClick={deny}>
            Não permitir
          </OutlineButton>
        </div>
      </div>
    </aside>
  );
}

export default AnalyticsConsentBanner;
