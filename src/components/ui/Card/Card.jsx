import { cx } from '../../../utils/cx';
import styles from './Card.module.css';

function Card({
  as: Component = 'section',
  children,
  className,
  variant = 'default',
  padding = 'md',
  interactive = false,
  onClick,
  onKeyDown,
  role,
  tabIndex,
  ...props
}) {
  const isInteractive = Boolean(interactive);

  function handleKeyDown(event) {
    onKeyDown?.(event);

    if (event.defaultPrevented || !isInteractive || !onClick) return;

    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onClick(event);
    }
  }

  return (
    <Component
      className={cx(
        styles.card,
        styles[variant],
        styles[padding],
        isInteractive && styles.interactive,
        className
      )}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      role={isInteractive ? (role ?? 'button') : role}
      tabIndex={isInteractive ? (tabIndex ?? 0) : tabIndex}
      {...props}
    >
      {children}
    </Component>
  );
}

export default Card;
