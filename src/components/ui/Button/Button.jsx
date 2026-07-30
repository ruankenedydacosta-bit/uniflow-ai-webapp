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
  href,
  ...props
}) {
  const isDisabled = disabled || loading;
  const classNames = cx(
    styles.button,
    styles[variant],
    styles[size],
    fullWidth && styles.fullWidth,
    loading && styles.loading,
    className
  );
  const content = (
    <>
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
    </>
  );

  // Quando `href` é passado, renderiza um link real (semântica de
  // navegação/abrir em nova aba) em vez de um <button> -- mesmas classes
  // visuais, sem duplicar estilos. Sem `href`, comportamento idêntico ao
  // de sempre.
  if (href) {
    return (
      <a href={href} className={classNames} aria-disabled={isDisabled} {...props}>
        {content}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classNames}
      disabled={isDisabled}
      aria-disabled={isDisabled}
      aria-busy={loading}
      {...props}
    >
      {content}
    </button>
  );
}

export default Button;