import { cx } from '../../../utils/cx.js';
import styles from './ProgressBar.module.css';

// Barra fina de progresso (épico #91). `tone="green"` é o das metas; o
// padrão vai do azul ao violeta.
function ProgressBar({ value = 0, tone = 'violet', label, className }) {
  const percent = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div
      className={cx(styles.track, className)}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
    >
      <span className={cx(styles.fill, styles[tone])} style={{ width: `${percent}%` }} />
    </div>
  );
}

export default ProgressBar;
