import { useEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../../utils/cx';
import styles from './Modal.module.css';

function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeOnOverlayClick = true,
  closeOnEsc = true,
  className,
  overlayClassName,
  ...props
}) {
  const generatedId = useId();
  const titleId = title ? `${generatedId}-title` : undefined;
  const descriptionId = description ? `${generatedId}-description` : undefined;

  useEffect(() => {
    if (!open || !closeOnEsc) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        onClose?.();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, closeOnEsc, onClose]);

  useEffect(() => {
    if (!open) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  function handleOverlayClick(event) {
    if (closeOnOverlayClick && event.target === event.currentTarget) {
      onClose?.();
    }
  }

  return createPortal(
    <div className={cx(styles.overlay, overlayClassName)} onClick={handleOverlayClick}>
      <div
        className={cx(styles.dialog, styles[size], className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        {...props}
      >
        <div className={styles.header}>
          <div className={styles.heading}>
            {title ? (
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
            ) : null}

            {description ? (
              <p id={descriptionId} className={styles.description}>
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            className={styles.closeButton}
            onClick={() => onClose?.()}
            aria-label="Fechar modal"
          >
            <span aria-hidden="true">x</span>
          </button>
        </div>

        <div className={styles.body}>{children}</div>

        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
