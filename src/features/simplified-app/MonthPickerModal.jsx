import { useMemo, useState } from 'react';
import Modal from '../../components/ui/Modal';
import OutlineButton from '../../components/ui/OutlineButton';
import { PhCaretLeftIcon, PhCaretRightIcon } from './SimplifiedIcons.jsx';
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

// Tela 22d: usa o Modal compartilhado, que no celular vira a folha padrão e
// cuida de Escape, toque fora, X, portal e trava de rolagem.
function MonthPickerModal({ open, initialDate, onApply, onClose }) {
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

  function selectThisMonth() {
    setViewYear(today.getFullYear());
    setSelectedYear(today.getFullYear());
    setSelectedMonth(today.getMonth());
  }

  function handleApply() {
    onApply(new Date(selectedYear, selectedMonth, 1));
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Selecionar mês"
      size="sm"
      className={styles.dialog}
    >
      <div className={styles.content}>
        <div className={styles.yearRow}>
          <button
            type="button"
            className={styles.yearNav}
            onClick={() => setViewYear((year) => year - 1)}
            aria-label="Ano anterior"
          >
            <PhCaretLeftIcon />
          </button>
          <strong className={styles.yearLabel}>{viewYear}</strong>
          <button
            type="button"
            className={styles.yearNav}
            onClick={() => setViewYear((year) => year + 1)}
            aria-label="Próximo ano"
          >
            <PhCaretRightIcon />
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
                className={styles.monthCell}
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
          <OutlineButton variant="ghost" className={styles.thisMonthButton} onClick={selectThisMonth}>
            Este mês
          </OutlineButton>
          <OutlineButton onClick={handleApply}>
            Aplicar
          </OutlineButton>
          <OutlineButton variant="ghost" onClick={onClose}>
            Cancelar
          </OutlineButton>
        </div>
      </div>
    </Modal>
  );
}

export default MonthPickerModal;
