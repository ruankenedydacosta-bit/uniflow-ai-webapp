import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './MonthPickerModal.module.css';

const MONTH_LABELS = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
  'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

// BLOCO REGISTROS iOS: substitui inteiramente o input nativo de mês (Safari
// iOS não abre o seletor de forma confiável e o visual do componente
// nativo nunca combina com a identidade da UniFlow). O usuário
// escolhe só ano + mês -- nunca dia. Preserva EXATAMENTE a regra já
// existente de bloqueio de mês futuro (antes era o atributo `max` do input
// nativo; agora é a mesma comparação (ano, mês) feita aqui).
function isMonthDisabled(year, monthIndex, today) {
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth();
  return year > todayYear || (year === todayYear && monthIndex > todayMonth);
}

function MonthPickerModal({ open, initialDate, onApply, onClose }) {
  const titleId = useId();
  const dialogRef = useRef(null);
  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(() => initialDate.getFullYear());
  const [selectedYear, setSelectedYear] = useState(() => initialDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(() => initialDate.getMonth());

  // Reabrir sempre parte do mês atualmente aplicado -- nunca preserva uma
  // seleção pendente descartada de uma abertura anterior (mesmo padrão de
  // "nasce limpo" já usado em UpdateBalanceModal.jsx). Ajustado durante a
  // renderização (não em efeito) seguindo o padrão oficial do React para
  // resetar estado quando uma "key" muda: https://react.dev/learn/you-might-not-need-an-effect
  const [wasOpen, setWasOpen] = useState(open);
  if (open && !wasOpen) {
    setWasOpen(true);
    setViewYear(initialDate.getFullYear());
    setSelectedYear(initialDate.getFullYear());
    setSelectedMonth(initialDate.getMonth());
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === 'Escape') onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 0);
    return () => window.clearTimeout(focusTimer);
  }, [open]);

  if (!open) return null;

  function handleOverlayClick(event) {
    if (event.target === event.currentTarget) onClose();
  }

  function selectThisMonth() {
    setViewYear(today.getFullYear());
    setSelectedYear(today.getFullYear());
    setSelectedMonth(today.getMonth());
  }

  function handleApply() {
    onApply(new Date(selectedYear, selectedMonth, 1));
  }

  return createPortal(
    <div className={styles.overlay} onClick={handleOverlayClick}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <h2 id={titleId}>Selecionar período</h2>
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Fechar">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <div className={styles.yearRow}>
          <button
            type="button"
            className={styles.yearNav}
            onClick={() => setViewYear((year) => year - 1)}
            aria-label="Ano anterior"
          >
            ‹
          </button>
          <strong className={styles.yearLabel}>{viewYear}</strong>
          <button
            type="button"
            className={styles.yearNav}
            onClick={() => setViewYear((year) => year + 1)}
            aria-label="Próximo ano"
          >
            ›
          </button>
        </div>

        <div className={styles.monthGrid}>
          {MONTH_LABELS.map((label, index) => {
            const disabled = isMonthDisabled(viewYear, index, today);
            const isSelected = viewYear === selectedYear && index === selectedMonth;
            return (
              <button
                key={label}
                type="button"
                className={`${styles.monthCell} ${isSelected ? styles.monthCellSelected : ''}`}
                disabled={disabled}
                aria-pressed={isSelected}
                onClick={() => {
                  setSelectedYear(viewYear);
                  setSelectedMonth(index);
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.thisMonthButton} onClick={selectThisMonth}>
            Este mês
          </button>
          <div className={styles.actionsRight}>
            <button type="button" className={styles.cancelButton} onClick={onClose}>
              Cancelar
            </button>
            <button type="button" className={styles.applyButton} onClick={handleApply}>
              Aplicar
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default MonthPickerModal;
