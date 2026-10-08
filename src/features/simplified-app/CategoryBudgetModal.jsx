import { useState } from 'react';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import {
  amountToCents,
  centsToAmount,
  digitsToCents,
  formatCentsAsCurrencyInput,
} from './balanceAdjustmentFormUtils.js';
import styles from './UpdateBalanceModal.module.css';

// Teto mensal de uma categoria (#121). Mesmo visual e mesmo campo de valor
// do "Atualizar saldo". O pai remonta o modal a cada abertura (key), então o
// estado nasce limpo com o teto atual.
function CategoryBudgetModal({ open, categoryName, currentLimit, onSave, onRemove, onClose }) {
  const [cents, setCents] = useState(() => amountToCents(currentLimit ?? 0));
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const isBusy = pending !== null;
  const amount = centsToAmount(cents);

  function handleClose() {
    if (isBusy) return;
    onClose?.();
  }

  async function run(action, task) {
    if (isBusy) return;
    setPending(action);
    setError(null);
    const result = await task();
    setPending(null);
    if (result?.error) {
      setError(result.error.message || 'Não foi possível salvar o teto. Tente de novo.');
      return;
    }
    if (result) onClose?.();
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (amount <= 0) return;
    void run('save', () => onSave(amount));
  }

  return (
    <Modal
      open={Boolean(open)}
      onClose={handleClose}
      closeOnOverlayClick={!isBusy}
      closeOnEsc={!isBusy}
      title={`Orçamento de ${categoryName}`}
      description={`Defina quanto você quer gastar com ${categoryName} por mês. Sem teto, a Uni usa a média dos últimos 3 meses, quando houver histórico.`}
      size="sm"
      className={styles.balanceDialog}
      overlayClassName={styles.darkOverlay}
    >
      <form className={styles.form} onSubmit={handleSubmit}>
        <div className={styles.amountField}>
          <label htmlFor="category-budget-amount">
            <span>Teto mensal</span>
            <input
              id="category-budget-amount"
              className={styles.amountInput}
              inputMode="numeric"
              autoComplete="off"
              value={formatCentsAsCurrencyInput(cents)}
              onChange={(event) => setCents(digitsToCents(event.target.value))}
              placeholder="R$ 0,00"
              required
            />
          </label>
        </div>

        {error ? <p className={styles.errorMessage} role="alert">{error}</p> : null}

        <div className={styles.actions}>
          {currentLimit ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => void run('remove', onRemove)}
              loading={pending === 'remove'}
              disabled={isBusy}
            >
              Remover teto
            </Button>
          ) : (
            <Button type="button" variant="ghost" onClick={handleClose} disabled={isBusy}>
              Cancelar
            </Button>
          )}
          <Button type="submit" disabled={amount <= 0 || isBusy} loading={pending === 'save'}>
            Salvar teto
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default CategoryBudgetModal;
