import uniflowLogo from '../../assets/branding/auth/logo_uniflowai.png';
import smartechLogo from '../../assets/branding/auth/smartech_logo_transparente.png';
import styles from './PersonalPlan.module.css';

function PartnershipIcon() {
  return (
    <svg viewBox="0 0 72 52" aria-hidden="true">
      <path d="m8 23 12-11 12 5 7-4 25 21-10 10-9-6-7 6-9-7-6 5L8 29Z" />
      <path d="m21 13 10 10 9-9M23 42l6-8m9 10 6-8m-15 1 6-8m11 10 5-7" />
    </svg>
  );
}

function PlanBrandHeader() {
  return (
    <header className={styles.brandSection} aria-label="UniFlow AI e SmartTech">
      <p className={styles.partnershipEyebrow}>
        <span aria-hidden="true" />
        Parceria que conecta tecnologia e inteligência
        <span aria-hidden="true" />
      </p>

      <div className={styles.brandRow}>
        <div className={styles.brandFrame}>
          <img src={uniflowLogo} alt="UniFlow AI" className={styles.uniflowLogo} />
        </div>
        <span className={styles.brandDivider} aria-hidden="true" />
        <span className={styles.partnershipIcon}><PartnershipIcon /></span>
        <span className={styles.brandDivider} aria-hidden="true" />
        <div className={styles.brandFrame}>
          <img
            src={smartechLogo}
            alt="SmartTech — Technology Monitoring"
            className={styles.smartechLogo}
          />
        </div>
      </div>
    </header>
  );
}

export default PlanBrandHeader;

