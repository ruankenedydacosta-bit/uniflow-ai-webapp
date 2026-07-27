import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import styles from './UniInstantResultCard.module.css';

export default function UniInstantResultCard({
  state,
  transcript,
  message,
  confirmationRequired = false,
  onClose,
  onConfirm,
  onCorrect,
  onOpenConversation,
  returnFocusRef,
}) {
  const cardRef = useRef(null);
  const critical = state === 'confirmation' && confirmationRequired;
  useEffect(() => {
    const card = cardRef.current;
    const returnFocusElement = returnFocusRef?.current;
    if (!card) return undefined;
    const selector = 'button, [href], [tabindex]:not([tabindex="-1"])';
    card.querySelector(selector)?.focus();

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        if (!critical) {
          event.preventDefault();
          onClose();
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...card.querySelectorAll(selector)];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusElement?.focus();
    };
  }, [critical, onClose, returnFocusRef]);

  return createPortal(
    <div className={styles.layer} data-uni-instant-card>
      <div
        className={styles.backdrop}
        aria-hidden="true"
        onClick={critical ? undefined : onClose}
      />
      <section
        ref={cardRef}
        className={styles.card}
        role="dialog"
        aria-modal="true"
        aria-label={critical ? 'Confirmar ação financeira' : 'Resposta da Uni'}
      >
        {state === 'transcribing' ? (
          <>
            <p className={styles.eyebrow}>Entendi isso:</p>
            <p className={styles.transcript}>“{transcript}”</p>
          </>
        ) : null}

        {state === 'processing' ? (
          <div className={styles.processing} role="status">
            <span className={styles.processingDot} aria-hidden="true" />
            <p>Organizando…</p>
          </div>
        ) : null}

        {state === 'confirmation' ? (
          <>
            <p className={styles.eyebrow}>Confirme antes de continuar</p>
            <p className={styles.message}>{message}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryAction} onClick={onConfirm}>Confirmar</button>
              <button type="button" className={styles.secondaryAction} onClick={onCorrect}>Corrigir</button>
              <button type="button" className={styles.secondaryAction} onClick={onClose}>Cancelar</button>
            </div>
          </>
        ) : null}

        {state === 'response' ? (
          <>
            <p className={styles.eyebrow}>Resposta da Uni</p>
            <p className={styles.message}>{message}</p>
            <div className={styles.actions}>
              <button type="button" className={styles.primaryAction} onClick={onOpenConversation}>
                Abrir conversa
              </button>
              <button type="button" className={styles.secondaryAction} onClick={onClose}>Fechar</button>
            </div>
          </>
        ) : null}

      </section>
    </div>,
    document.body,
  );
}
