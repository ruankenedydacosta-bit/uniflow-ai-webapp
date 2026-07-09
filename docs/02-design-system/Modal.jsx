import { forwardRef, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './Modal.module.css';
import { EXIT_DURATION_MS, FOCUSABLE_SELECTOR } from './constants';

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

/**
 * Modal — diálogo modal da UniFlow AI (overlay + portal + focus trap).
 *
 * Controlado externamente via `open`/`onClose`. Mantém-se montado
 * durante a animação de saída (uf-animate-fade-out/scale-out) antes de
 * remover do DOM.
 *
 * @see README.md
 */
const Modal = forwardRef(function Modal(
  {
    open,
    onClose,
    size = 'md',
    closeOnOverlayClick = true,
    closeOnEsc = true,
    hideCloseButton = false,
    initialFocusRef,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy,
    children,
    className,
    style,
    ...rest
  },
  ref
) {
  const dialogRef = useRef(null);
  const previousActiveElement = useRef(null);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);

  // Monta/agenda desmontagem preservando a animação de saída.
  useEffect(() => {
    if (open) {
      setMounted(true);
      setClosing(false);
      return undefined;
    }
    if (mounted) {
      setClosing(true);
      const timeout = setTimeout(() => {
        setMounted(false);
        setClosing(false);
      }, EXIT_DURATION_MS);
      return () => clearTimeout(timeout);
    }
    return undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Scroll lock enquanto montado.
  useEffect(() => {
    if (!mounted) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [mounted]);

  // Foco inicial + restauração do foco anterior ao desmontar.
  useLayoutEffect(() => {
    if (!mounted) return undefined;
    previousActiveElement.current = document.activeElement;

    const target = initialFocusRef?.current || dialogRef.current;
    target?.focus();

    return () => {
      previousActiveElement.current?.focus?.();
    };
  }, [mounted, initialFocusRef]);

  // ESC + focus trap (Tab/Shift+Tab presos ao conteúdo do diálogo).
  useEffect(() => {
    if (!mounted) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape' && closeOnEsc) {
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR);
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mounted, closeOnEsc, onClose]);

  const handleOverlayClick = useCallback(() => {
    if (closeOnOverlayClick) onClose?.();
  }, [closeOnOverlayClick, onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className={cx(
          'uf-fixed',
          'uf-inset-0',
          'uf-z-modal-backdrop',
          'uf-glass-strong',
          closing ? 'uf-animate-fade-out' : 'uf-animate-fade-in'
        )}
        onClick={handleOverlayClick}
        aria-hidden="true"
      />

      <div className={cx('uf-fixed', 'uf-inset-0', 'uf-z-modal', styles.centerLayer)}>
        <div
          ref={(node) => {
            dialogRef.current = node;
            if (typeof ref === 'function') ref(node);
            else if (ref) ref.current = node;
          }}
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          tabIndex={-1}
          className={cx(
            styles.dialog,
            styles[`size-${size}`],
            closing ? 'uf-animate-scale-out' : 'uf-animate-scale-in',
            className
          )}
          style={style}
          {...rest}
        >
          {!hideCloseButton ? (
            <button
              type="button"
              className={styles.closeButton}
              onClick={() => onClose?.()}
              aria-label="Fechar"
            >
              <CloseGlyph />
            </button>
          ) : null}

          {children}
        </div>
      </div>
    </>,
    document.body
  );
});
Modal.displayName = 'Modal';

function CloseGlyph() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

const ModalHeader = forwardRef(function ModalHeader({ className, children, ...rest }, ref) {
  return (
    <div ref={ref} className={cx(styles.header, 'uf-border-b', className)} {...rest}>
      {children}
    </div>
  );
});
ModalHeader.displayName = 'Modal.Header';

const ModalBody = forwardRef(function ModalBody({ className, children, ...rest }, ref) {
  return (
    <div ref={ref} className={cx(styles.body, className)} {...rest}>
      {children}
    </div>
  );
});
ModalBody.displayName = 'Modal.Body';

const ModalFooter = forwardRef(function ModalFooter({ className, children, ...rest }, ref) {
  return (
    <div ref={ref} className={cx(styles.footer, 'uf-border-t', className)} {...rest}>
      {children}
    </div>
  );
});
ModalFooter.displayName = 'Modal.Footer';

Modal.Header = ModalHeader;
Modal.Body = ModalBody;
Modal.Footer = ModalFooter;

export default Modal;
export { ModalHeader, ModalBody, ModalFooter };
