import styles from './OpenFinanceConnectionAnimation.module.css';

/**
 * SecureConnectionCore
 * Central glowing UniFlow hub. Shows a shield (authorization) or a "U" mark
 * (general hub state), with an optional consent confirmation pill.
 * Never renders a password field, credential input, or bank-supplied form.
 */
export default function SecureConnectionCore({ mode = 'hub', showConsent = false, pulse = true }) {
  return (
    <div className={styles.coreWrap}>
      <div className={styles.coreRing} data-pulse={pulse} />
      <div className={styles.coreOrb} role="img" aria-label="Núcleo seguro UniFlow">
        {mode === 'shield' ? (
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M12 2 4 5v6c0 5 3.4 8.4 8 9 4.6-0.6 8-4 8-9V5l-8-3Z"
              fill="currentColor"
              opacity="0.95"
            />
            <path
              d="m9 12 2 2 4-4.4"
              stroke="var(--uf-bg)"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M5 4v9a7 7 0 0 0 14 0V4"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              fill="none"
            />
          </svg>
        )}
      </div>
      {showConsent && (
        <span className={styles.consentPill}>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="m5 13 4 4 10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Você autorizou a conexão
        </span>
      )}
    </div>
  );
}
