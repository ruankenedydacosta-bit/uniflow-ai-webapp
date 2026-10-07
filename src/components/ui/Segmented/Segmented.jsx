import { cx } from '../../../utils/cx.js';
import styles from './Segmented.module.css';

// Controle segmentado com seleção única (épico #91).
function Segmented({ label, options, value, onChange, className }) {
  return (
    <div className={cx(styles.track, className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.option}
          aria-pressed={option.value === value}
          onClick={() => onChange?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default Segmented;
