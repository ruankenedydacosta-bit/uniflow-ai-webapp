import { forwardRef, useCallback } from 'react';
import styles from './Card.module.css';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Card — container de superfície da UniFlow AI.
 *
 * Componente composto: use Card.Header / Card.Body / Card.Footer para
 * estruturar conteúdo. O Card raiz é apenas o "frame" visual (sem
 * padding próprio) — ver "Decisões arquiteturais" no README.
 *
 * @see README.md
 */
const Card = forwardRef(function Card(
  {
    variant = 'surface',
    clickable = false,
    loading = false,
    fullWidth = false,
    className,
    style,
    children,
    onClick,
    ...rest
  },
  ref
) {
  const isClickable = (clickable || Boolean(onClick)) && !loading;

  const rootClassName = cx(
    styles.card,
    styles[`variant-${variant}`],
    loading && styles.loading,
    isClickable && cx(styles.clickable, 'uf-hover-smooth', 'uf-hover-lift', 'uf-cursor-pointer'),
    variant === 'glass' && 'uf-glass',
    fullWidth && 'uf-w-full',
    className
  );

  const handleKeyDown = useCallback(
    (event) => {
      if (!isClickable) return;
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick?.(event);
      }
    },
    [isClickable, onClick]
  );

  const interactiveProps = isClickable
    ? {
        role: 'button',
        tabIndex: 0,
        onClick,
        onKeyDown: handleKeyDown,
      }
    : {};

  return (
    <div
      ref={ref}
      className={rootClassName}
      style={style}
      aria-busy={loading || undefined}
      {...interactiveProps}
      {...rest}
    >
      <div className={cx(styles.content, loading && styles.contentHidden)}>{children}</div>

      {loading ? (
        <div className={styles.skeletonOverlay} aria-hidden="true">
          <span className="uf-skeleton" style={{ width: '40%', height: 16 }} />
          <span className="uf-skeleton" style={{ width: '90%', height: 12 }} />
          <span className="uf-skeleton" style={{ width: '70%', height: 12 }} />
        </div>
      ) : null}
    </div>
  );
});
Card.displayName = 'Card';

const CardHeader = forwardRef(function CardHeader({ className, children, ...rest }, ref) {
  return (
    <div ref={ref} className={cx(styles.header, 'uf-border-b', className)} {...rest}>
      {children}
    </div>
  );
});
CardHeader.displayName = 'Card.Header';

const CardBody = forwardRef(function CardBody({ className, children, ...rest }, ref) {
  return (
    <div ref={ref} className={cx(styles.body, className)} {...rest}>
      {children}
    </div>
  );
});
CardBody.displayName = 'Card.Body';

const CardFooter = forwardRef(function CardFooter({ className, children, ...rest }, ref) {
  return (
    <div ref={ref} className={cx(styles.footer, 'uf-border-t', className)} {...rest}>
      {children}
    </div>
  );
});
CardFooter.displayName = 'Card.Footer';

Card.Header = CardHeader;
Card.Body = CardBody;
Card.Footer = CardFooter;

export default Card;
export { CardHeader, CardBody, CardFooter };
