import { useEffect, useId, useRef } from 'react';
import styles from './OpenFinanceLearnMorePanel.module.css';

const FLOW_ITEMS = [
  { id: 'institutions', label: 'Instituições financeiras' },
  { id: 'authorization', label: 'Autorização segura' },
  { id: 'uniflow', label: 'UniFlow' },
  { id: 'organization', label: 'Organização automática' },
  { id: 'analysis', label: 'Análises da Uni' },
];

const EXPLANATION_ITEMS = [
  {
    title: 'Você autoriza',
    description: 'A conexão só acontece com a sua permissão.',
  },
  {
    title: 'As informações chegam',
    description: 'Saldos e movimentações poderão ser sincronizados automaticamente.',
  },
  {
    title: 'A UniFlow organiza',
    description: 'Contas, entradas, saídas e cartões ficam reunidos em um só lugar.',
  },
  {
    title: 'A Uni ajuda você',
    description: 'Com os dados organizados, a Uni poderá identificar padrões e orientar melhor.',
  },
];

export default function OpenFinanceLearnMorePanel({ theme = 'system', onClose }) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);
  const closeButtonRef = useRef(null);

  useEffect(() => {
    const opener = document.activeElement;
    closeButtonRef.current?.focus({ preventScroll: true });
    return () => opener?.focus?.({ preventScroll: true });
  }, []);

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = Array.from(dialogRef.current?.querySelectorAll('button:not([disabled])') ?? []);
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className={styles.overlay}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <section
        ref={dialogRef}
        className={styles.panel}
        data-theme={theme}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <div>
            <span className={styles.badge}>Em breve</span>
            <h2 id={titleId} className={styles.title}>Como vai funcionar</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeButton}
            aria-label="Fechar explicação"
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <p id={descriptionId} className={styles.subtitle}>
          Você autoriza a conexão e a UniFlow organiza as informações para você.
        </p>

        <ol className={styles.flow} aria-label="Fluxo futuro da conexão Open Finance">
          {FLOW_ITEMS.map((item, index) => (
            <li key={item.id} className={styles.flowItem}>
              <span className={styles.flowIcon} aria-hidden="true">
                <FlowIcon type={item.id} />
              </span>
              <span>{item.label}</span>
              {index < FLOW_ITEMS.length - 1 && <span className={styles.flowArrow} aria-hidden="true">↓</span>}
            </li>
          ))}
        </ol>

        <ol className={styles.explanations}>
          {EXPLANATION_ITEMS.map((item, index) => (
            <li key={item.title} className={styles.explanationItem}>
              <span className={styles.number} aria-hidden="true">{index + 1}</span>
              <div>
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className={styles.finalMessage}>Menos registros manuais. Mais clareza para decidir.</p>

        <button type="button" className={styles.confirmButton} onClick={onClose}>
          Entendi
        </button>
      </section>
    </div>
  );
}

function FlowIcon({ type }) {
  const paths = {
    institutions: 'M4 9h16M6 9v8m4-8v8m4-8v8m4-8v8M3 20h18M12 3 3 7h18l-9-4Z',
    authorization: 'M12 3 5 6v5c0 4.4 2.8 7.4 7 8 4.2-.6 7-3.6 7-8V6l-7-3Zm-3 9 2 2 4-4',
    uniflow: 'M6 5v8a6 6 0 0 0 12 0V5',
    organization: 'M4 4h6v6H4V4Zm10 0h6v6h-6V4ZM4 14h6v6H4v-6Zm10 0h6v6h-6v-6Z',
    analysis: 'm4 17 5-5 4 3 7-8M16 7h4v4',
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={paths[type]} />
    </svg>
  );
}
