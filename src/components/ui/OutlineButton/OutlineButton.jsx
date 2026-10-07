import { cx } from '../../../utils/cx.js';
import styles from './OutlineButton.module.css';

// Botão contornado do redesign (épico #91). A marca é linha, nunca
// preenchimento: primary e confirm só pintam a borda e o texto.
function OutlineButton({
  variant = 'primary',
  type = 'button',
  className,
  children,
  ...props
}) {
  return (
    <button type={type} className={cx(styles.button, styles[variant], className)} {...props}>
      {children}
    </button>
  );
}

export default OutlineButton;
