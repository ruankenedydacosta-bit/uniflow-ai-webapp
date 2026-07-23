import styles from './OpenFinanceConnectionAnimation.module.css';

const ICONS = {
  bank: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2 2 8h20L12 2Z" fill="currentColor" />
      <rect x="4" y="10" width="2.4" height="9" fill="currentColor" />
      <rect x="10.8" y="10" width="2.4" height="9" fill="currentColor" />
      <rect x="17.6" y="10" width="2.4" height="9" fill="currentColor" />
      <rect x="2" y="20" width="20" height="2" fill="currentColor" />
    </svg>
  ),
  wallet: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="6" width="20" height="14" rx="3" fill="currentColor" opacity="0.9" />
      <circle cx="17" cy="13" r="2" fill="var(--uf-bg)" />
    </svg>
  ),
};

/**
 * FinancialInstitutionNode
 * Purely illustrative "institution" chip — a generic label + icon.
 * Never renders a real bank name, trademark, or logo asset.
 */
export default function FinancialInstitutionNode({ institution }) {
  return (
    <div className={styles.institutionCard}>
      <span className={styles.institutionIcon}>{ICONS[institution.kind] ?? ICONS.bank}</span>
      <span className={styles.institutionLabel}>{institution.label}</span>
    </div>
  );
}
