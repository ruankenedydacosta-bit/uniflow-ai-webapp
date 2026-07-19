import { AUTH_MODES } from '../authMobileSchema.js';
import styles from '../authMobile.module.css';

function AuthModeSwitch({ mode, onChange }) {
  return (
    <div className={styles.modeSwitch} role="tablist" aria-label="Escolha entrar ou criar conta">
      <button
        type="button"
        role="tab"
        aria-selected={mode === AUTH_MODES.SIGN_IN}
        className={mode === AUTH_MODES.SIGN_IN ? styles.modeActive : styles.modeButton}
        onClick={() => onChange(AUTH_MODES.SIGN_IN)}
      >
        Entrar
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === AUTH_MODES.SIGN_UP}
        className={mode === AUTH_MODES.SIGN_UP ? styles.modeActive : styles.modeButton}
        onClick={() => onChange(AUTH_MODES.SIGN_UP)}
      >
        Criar conta
      </button>
    </div>
  );
}

export default AuthModeSwitch;
