import { cx } from '../../../utils/cx.js';
import styles from './OutlineButton.module.css';

// Botão contornado do redesign (épico #91). A marca é linha, nunca
// preenchimento: primary e confirm só pintam a borda e o texto. `loading`
// trava o botão e troca o ícone por um giro, sem mudar o texto.
function OutlineButton({
  variant = 'primary',
  type = 'button',
  loading = false,
  disabled = false,
  className,
  children,
  ...props
}) {
  return (
    <button
      type={type}
      className={cx(styles.button, styles[variant], className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}

export default OutlineButton;
