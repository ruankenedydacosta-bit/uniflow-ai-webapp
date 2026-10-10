import { cx } from '../../../utils/cx.js';
import styles from './IconBox.module.css';

// Caixa do ícone de uma linha de lista (épico #91): 36px por padrão, 32px
// nas opções de seleção e 44px nos avisos de confirmação (handoff 21 e 22).
// `tone` pinta o ícone com a cor de texto da marca (blue, violet ou green).
function IconBox({ size = 36, tone, className, children, ...props }) {
  return (
    <span
      className={cx(styles.box, size === 32 && styles.small, size === 44 && styles.large, tone && styles[tone], className)}
      aria-hidden="true"
      {...props}
    >
      {children}
    </span>
  );
}

export default IconBox;
