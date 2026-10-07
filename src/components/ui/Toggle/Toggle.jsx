import { cx } from '../../../utils/cx.js';
import styles from './Toggle.module.css';

// Interruptor liga/desliga (épico #91). Sem rótulo visível, `label` vira o
// nome acessível.
function Toggle({ checked = false, onChange, label, disabled = false, className, ...props }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={cx(styles.toggle, className)}
      onClick={() => onChange?.(!checked)}
      {...props}
    >
      <span className={styles.thumb} aria-hidden="true" />
    </button>
  );
}

export default Toggle;
