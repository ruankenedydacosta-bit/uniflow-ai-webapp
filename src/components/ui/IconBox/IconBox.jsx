import { cx } from '../../../utils/cx.js';
import styles from './IconBox.module.css';

// Caixa de 36px para o ícone de uma linha de lista (épico #91).
function IconBox({ className, children, ...props }) {
  return (
    <span className={cx(styles.box, className)} aria-hidden="true" {...props}>
      {children}
    </span>
  );
}

export default IconBox;
