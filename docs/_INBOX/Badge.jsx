import { forwardRef } from 'react';
import styles from './Badge.module.css';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Badge — rótulo compacto de status/categoria da UniFlow AI.
 * Componente puramente apresentacional (sem estados interativos).
 *
 * @see README.md
 */
const Badge = forwardRef(function Badge(
  {
    variant = 'primary',
    size = 'md',
    icon = null,
    dot = false,
    children,
    className,
    style,
    ...rest
  },
  ref
) {
  const rootClassName = cx(
    styles.badge,
    styles[`variant-${variant}`],
    styles[`size-${size}`],
    className
  );

  return (
    <span ref={ref} className={rootClassName} style={style} {...rest}>
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}
      {icon ? (
        <span className={styles.icon} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {children ? <span className={styles.label}>{children}</span> : null}
    </span>
  );
});

Badge.displayName = 'Badge';

export default Badge;
