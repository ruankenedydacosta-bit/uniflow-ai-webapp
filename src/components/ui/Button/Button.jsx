import styles from './Button.module.css';
import { cx } from '../../../utils/cx';

function Button({
  children,
  variant = 'primary',
  size = 'md',
  type = 'button',
  fullWidth = false,
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  className,
  ...props
}) {
  const isDisabled = disabled || loading;

  return (
    <button
      type={type}
      className={cx(
        styles.button,
        styles[variant],
        styles[size],
        fullWidth && styles.fullWidth,
        loading && styles.loading,
        className
      )}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      {...props}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}

      {!loading && leftIcon && (
        <span className={styles.icon} aria-hidden="true">
          {leftIcon}
        </span>
      )}

      <span className={styles.content}>{children}</span>

      {!loading && rightIcon && (
        <span className={styles.icon} aria-hidden="true">
          {rightIcon}
        </span>
      )}
    </button>
  );
}

export default Button;