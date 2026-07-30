import uniflowLogo from '../../assets/branding/auth/logo_uniflowai.png';
import smartechLogo from '../../assets/branding/auth/smartech_logo_transparente.png';
import styles from './Presentation.module.css';

function PartnershipSymbol() {
  return (
    <svg viewBox="0 0 64 44" aria-hidden="true">
      <path d="m9 20 10-9 10 4 6-3 20 18-8 8-7-5-6 5-8-6-5 4L9 25Z" />
      <path d="m20 12 8 8 8-7M21 36l5-6m8 8 5-6m-13 0 5-6m9 7 4-5" />
    </svg>
  );
}

function BrandPartnershipHeader() {
  return (
    <header className={styles.brandHeader} aria-label="UniFlow AI em parceria com SmartTech">
      <div className={styles.brandLogoFrame}>
        <img
          src={uniflowLogo}
          alt="UniFlow AI"
          className={styles.uniflowLogo}
        />
      </div>
      <span className={styles.brandDivider} aria-hidden="true" />
      <span className={styles.partnershipSymbol}><PartnershipSymbol /></span>
      <span className={styles.brandDivider} aria-hidden="true" />
      <div className={styles.brandLogoFrame}>
        <img
          src={smartechLogo}
          alt="SmartTech — Technology Monitoring"
          className={styles.smartechLogo}
        />
      </div>
    </header>
  );
}

export default BrandPartnershipHeader;

