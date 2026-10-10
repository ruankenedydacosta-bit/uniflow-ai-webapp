import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../../utils/cx';
import styles from './Modal.module.css';

// X do Phosphor 2.1 (ph-x), inline para o componente base não depender de
// feature nem de biblioteca de ícones.
function CloseIcon() {
  return (
    <svg viewBox="0 0 256 256" aria-hidden="true" className={styles.closeIcon}>
      <path d="M205.66,194.34a8,8,0,0,1-11.32,11.32L128,139.31,61.66,205.66a8,8,0,0,1-11.32-11.32L116.69,128,50.34,61.66A8,8,0,0,1,61.66,50.34L128,116.69l66.34-66.35a8,8,0,0,1,11.32,11.32L139.31,128Z" />
    </svg>
  );
}

// Folha padrão (handoff 22): no celular todo Modal sobe de baixo, com alça,
// canto de 28px e linha violeta no topo (ver Modal.module.css). No desktop o
// diálogo continua centralizado. `hideCloseButton` tira o X; sem título,
// descrição nem X, o cabeçalho some e o conteúdo abre logo abaixo da alça.

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
  hideCloseButton = false,
  className,
  bodyClassName,
  headerClassName,
  overlayClassName,
  ...props
}) {
  const generatedId = useId();
  const dialogRef = useRef(null);
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

  // Ao abrir, o foco entra no diálogo, a não ser que um campo com autoFocus
  // já o tenha recebido. Sem isso, Tab e o leitor de tela continuam na página
  // atrás do fundo escurecido.
  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.contains(document.activeElement)) {
      dialog.focus({ preventScroll: true });
    }
  }, [open]);

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
        ref={dialogRef}
        tabIndex={-1}
        className={cx(styles.dialog, styles[size], className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        {...props}
      >
        {title || description || !hideCloseButton ? (
          <div className={cx(styles.header, headerClassName)}>
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

            {hideCloseButton ? null : (
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => onClose?.()}
                aria-label="Fechar"
              >
                <CloseIcon />
              </button>
            )}
          </div>
        ) : null}

        <div className={cx(styles.body, bodyClassName)}>{children}</div>

        {footer ? <div className={styles.footer}>{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

export default Modal;
