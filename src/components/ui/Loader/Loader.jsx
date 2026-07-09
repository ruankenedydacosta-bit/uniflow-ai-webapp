import { cx } from '../../../utils/cx';
import styles from './Loader.module.css';

function Loader({
  size = 'md',
  variant = 'primary',
  label,
  fullScreen = false,
  className,
  ...props
}) {
  return (
    <div
      className={cx(
        styles.loader,
        styles[size],
        styles[variant],
        fullScreen && styles.fullScreen,
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={label || 'Carregando'}
      {...props}
    >
      <span className={styles.spinner} aria-hidden="true" />
      {label ? <span className={styles.label}>{label}</span> : null}
    </div>
  );
}

export default Loader;
