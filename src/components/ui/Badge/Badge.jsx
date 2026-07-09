import { cx } from '../../../utils/cx';
import styles from './Badge.module.css';

function Badge({
  as: Component = 'span',
  children,
  className,
  variant = 'default',
  size = 'md',
  dot = false,
  leftIcon,
  rightIcon,
  ...props
}) {
  return (
    <Component
      className={cx(styles.badge, styles[variant], styles[size], className)}
      {...props}
    >
      {dot ? <span className={styles.dot} aria-hidden="true" /> : null}

      {leftIcon ? (
        <span className={styles.icon} aria-hidden="true">
          {leftIcon}
        </span>
      ) : null}

      {children ? <span className={styles.label}>{children}</span> : null}

      {rightIcon ? (
        <span className={styles.icon} aria-hidden="true">
          {rightIcon}
        </span>
      ) : null}
    </Component>
  );
}

export default Badge;
