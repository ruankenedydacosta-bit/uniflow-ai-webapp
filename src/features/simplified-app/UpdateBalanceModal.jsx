import { useRef, useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { submitBalanceAdjustment } from '../../services/balanceAdjustmentService.js';
import { formatCurrency } from '../../utils/formatters.js';
import {
  centsToAmount,
  computeBalanceDelta,
  digitsToCents,
  formatCentsAsCurrencyInput,
  formatSignedCurrency,
} from './balanceAdjustmentFormUtils.js';
import styles from './UpdateBalanceModal.module.css';

const NOTE_MAX_LENGTH = 120;

function generateOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback simples (ambiente sem crypto.randomUUID) -- mesmo padrão já
  // usado em FinanceTransactionModal.jsx para client_operation_id.
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// BLOCO FINAL DO MVP (Saldo manual): "Atualizar saldo", acessível pelo card
// Saldo em Registros. Reaproveita a RPC atômica execute_confirmed_financial_action
// (transaction_type = 'adjustment') via balanceAdjustmentService.js -- nenhuma
// escrita direta em tabela, nenhum novo mecanismo de persistência.
//
// CONTA-OPCIONAL (fase 2): o ajuste deixou de exigir escolher uma conta --
// ajusta o SALDO TOTAL do workspace (workspaceBalance, derivado via
// get_derived_workspace_balance()), nunca o saldo de uma conta específica.
// O componente é remontado pelo pai (key derivada de `open`, ver
// SimplifiedRecordsPage.jsx) a cada abertura -- por isso todo o estado abaixo
// nasce limpo via useState inicial, sem efeito de reset (evita cascading
// renders e gera um client_operation_id novo por abertura naturalmente).
function UpdateBalanceModal({ workspaceBalance, onChanged, onClose, open }) {
  const [step, setStep] = useState('form');
  const [cents, setCents] = useState(0);
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [savedDelta, setSavedDelta] = useState(null);
  const operationIdRef = useRef(null);
  if (operationIdRef.current === null) {
    operationIdRef.current = generateOperationId();
  }

  const newBalance = centsToAmount(cents);
  const currentBalance = Number(workspaceBalance ?? 0);
  const delta = computeBalanceDelta(currentBalance, newBalance);

  function handleClose() {
    if (isSubmitting) return;
    onClose?.();
  }

  function handleAmountChange(event) {
    setCents(digitsToCents(event.target.value));
    setTouched(true);
  }

  function handleReviewSubmit(event) {
    event.preventDefault();
    if (!touched) return;
    setError(null);
    setStep('confirm');
  }

  async function handleConfirm() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    const result = await submitBalanceAdjustment({
      currentBalance,
      newBalance,
      note,
      clientOperationId: operationIdRef.current,
    });

    if (result.error) {
      setIsSubmitting(false);
      setError(result.error);
      return;
    }

    setSavedDelta(result.delta);
    setStep('success');
    setIsSubmitting(false);
    await onChanged?.();
  }

  return (
    <Modal
      open={Boolean(open)}
      onClose={handleClose}
      closeOnOverlayClick={!isSubmitting}
      closeOnEsc={!isSubmitting}
      title="Atualizar saldo"
      description={step === 'form' ? 'Informe o saldo total atual.' : undefined}
      size="sm"
      className={styles.balanceDialog}
      overlayClassName={styles.darkOverlay}
    >
      {step === 'form' ? (
        <form className={styles.form} onSubmit={handleReviewSubmit}>
          <label className={styles.amountField} htmlFor="update-balance-amount">
            <span>Saldo total</span>
            <input
              id="update-balance-amount"
              className={styles.amountInput}
              inputMode="numeric"
              autoComplete="off"
              value={touched ? formatCentsAsCurrencyInput(cents) : 'R$ 0,00'}
              onChange={handleAmountChange}
              placeholder="R$ 0,00"
              required
            />
          </label>

          <Input
            id="update-balance-description"
            label="Descrição (opcional)"
            placeholder="Ex.: Saldo inicial ou ajuste manual"
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            fullWidth
          />
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!touched}>
              Salvar saldo
            </Button>
          </div>
        </form>
      ) : step === 'confirm' ? (
        <div className={styles.confirmContent}>
          <dl className={styles.summaryList}>
            <div>
              <dt>Saldo atual</dt>
              <dd>{formatCurrency(currentBalance)}</dd>
            </div>
            <div>
              <dt>Novo saldo</dt>
              <dd>{formatCurrency(newBalance)}</dd>
            </div>
            <div className={styles.summaryDelta}>
              <dt>Ajuste registrado</dt>
              <dd className={delta >= 0 ? styles.positive : styles.negative}>
                {formatSignedCurrency(delta, formatCurrency)}
              </dd>
            </div>
            {note.trim() ? (
              <div>
                <dt>Descrição</dt>
                <dd>{note.trim()}</dd>
              </div>
            ) : null}
          </dl>

          {error ? (
            <p className={styles.errorMessage} role="alert">{error.message}</p>
          ) : null}

          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={() => setStep('form')} disabled={isSubmitting}>
              Voltar
            </Button>
            <Button type="button" onClick={handleConfirm} loading={isSubmitting}>
              Confirmar
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.successContent} role="status">
          <span className={styles.successIcon} aria-hidden="true">✓</span>
          <strong>Saldo atualizado</strong>
          <p>
            {formatCurrency(newBalance)}
            {' '}({formatSignedCurrency(savedDelta, formatCurrency)})
          </p>
          <div className={styles.actions}>
            <Button type="button" onClick={onClose}>Concluir</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default UpdateBalanceModal;
