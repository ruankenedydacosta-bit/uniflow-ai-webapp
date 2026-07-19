import styles from '../authMobile.module.css';

function AuthLegalNotice({ checked, error, disabled, onChange, onLegalClick }) {
  return (
    <div className={styles.legalField}>
      <div className={styles.legalLabel}>
        <label className={styles.checkboxHitArea} htmlFor="auth-accepted-terms">
          <input
            id="auth-accepted-terms"
            type="checkbox"
            checked={checked}
            disabled={disabled}
            onChange={(event) => onChange(event.target.checked)}
          />
        </label>
        <span>
          <label htmlFor="auth-accepted-terms">Li e aceito os </label>
          <button type="button" className={styles.inlineLink} onClick={onLegalClick}>
            Termos de Uso
          </button>{' '}
          e a{' '}
          <button type="button" className={styles.inlineLink} onClick={onLegalClick}>
            Política de Privacidade
          </button>.
        </span>
      </div>
      {error ? <p className={styles.fieldError}>{error}</p> : null}
    </div>
  );
}

export default AuthLegalNotice;
