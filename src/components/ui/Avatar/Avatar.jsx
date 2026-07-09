import { forwardRef } from 'react';
import { cx } from '../../../utils/cx';
import styles from './Avatar.module.css';

function getInitials(name) {
  if (!name) return '';

  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('');
}

const Avatar = forwardRef(function Avatar(
  {
    src,
    alt,
    name,
    initials,
    size = 'md',
    variant = 'circle',
    status,
    className,
    ...props
  },
  ref
) {
  const fallbackInitials = initials || getInitials(name) || 'UF';
  const accessibleLabel = alt || name || fallbackInitials;

  return (
    <span
      ref={ref}
      className={cx(styles.avatar, styles[size], styles[variant], className)}
      role={src ? undefined : 'img'}
      aria-label={src ? undefined : accessibleLabel}
      {...props}
    >
      {src ? (
        <img className={styles.image} src={src} alt={accessibleLabel} />
      ) : (
        <span className={styles.initials} aria-hidden="true">
          {fallbackInitials}
        </span>
      )}

      {status ? (
        <span
          className={cx(styles.status, styles[status])}
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
});

export default Avatar;
