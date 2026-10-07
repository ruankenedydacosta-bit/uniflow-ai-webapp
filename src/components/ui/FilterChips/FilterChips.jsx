import { cx } from '../../../utils/cx.js';
import styles from './FilterChips.module.css';

// Chips de filtro com seleção única (épico #91).
function FilterChips({ label, options, value, onChange, className }) {
  return (
    <div className={cx(styles.chips, className)} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={styles.chip}
          aria-pressed={option.value === value}
          onClick={() => onChange?.(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export default FilterChips;
