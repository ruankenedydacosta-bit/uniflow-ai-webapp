import { forwardRef } from 'react';
import { cx } from '../../../lib/cx';
import styles from './Button.module.css';

/**
 * Button — componente base de ação da UniFlow AI.
 *
 * Consome exclusivamente tokens de theme.css (via Button.module.css).
 * Nenhuma cor, espaçamento, radius, sombra ou duração é declarada aqui
 * fora de var(--uf-...).
 *
 * @see README.md para documentação completa de props, variants e estados.
 */
const Button = forwardRef(function Button(
  {
    variant = 'primary',
    size = 'md',
    type = 'button',
    loading = false,
    disabled = false,
    fullWidth = false,
    leftIcon = null,
    rightIcon = null,
    children,
    className,
    style,
    onClick,
    ...rest
  },
  ref
) {
  const isDisabled = disabled || loading;

  const rootClassName = cx(
    styles.button,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    fullWidth && styles.fullWidth,
    loading && styles.loading,
    className
  );

  function handleClick(event) {
    // Guarda extra: mesmo com `disabled` nativo, cobre o caso de
    // `loading=true` sem `disabled=true` explícito.
    if (isDisabled) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  }

  return (
    <button
      ref={ref}
      type={type}
      className={rootClassName}
      style={style}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
      onClick={handleClick}
      {...rest}
    >
      <span className={styles.content}>
        {leftIcon ? (
          <span className={cx(styles.icon, styles.iconLeft)} aria-hidden="true">
            {leftIcon}
          </span>
        ) : null}

        {children ? <span className={styles.label}>{children}</span> : null}

        {rightIcon ? (
          <span className={cx(styles.icon, styles.iconRight)} aria-hidden="true">
            {rightIcon}
          </span>
        ) : null}
      </span>

      {loading ? (
        <span className={styles.loader} role="status" aria-hidden="true">
          <span className={styles.loaderBar} />
        </span>
      ) : null}
    </button>
  );
});

Button.displayName = 'Button';

export default Button;
