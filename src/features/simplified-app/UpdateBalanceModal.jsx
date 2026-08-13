import { useRef, useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { submitBalanceAdjustment } from '../../services/balanceAdjustmentService.js';
import { formatCurrency } from '../../utils/formatters.js';
import {
  amountToCents,
  centsToAmount,
  computeBalanceDelta,
  digitsToCents,
  formatCentsAsCurrencyInput,
  formatSignedCurrency,
} from './balanceAdjustmentFormUtils.js';
import styles from './UpdateBalanceModal.module.css';

const NOTE_MAX_LENGTH = 120;

// BLOCO SALDO/RECEITA/DESPESA EDITAVEIS: os 3 cards do Resumo do mês usam o
// MESMO mecanismo (lançamento de ajuste que corrige o total sem apagar o
// histórico real, ver balanceAdjustmentService.js/adjustment_target) --
// só muda o texto mostrado por card. `target` decide qual.
const TARGET_COPY = Object.freeze({
  balance: Object.freeze({
    title: 'Atualizar saldo',
    formDescription: 'Informe o saldo total atual.',
    amountLabel: 'Saldo total',
    currentLabel: 'Saldo atual',
    newLabel: 'Novo saldo',
    submitLabel: 'Salvar saldo',
    successTitle: 'Saldo atualizado',
  }),
  income: Object.freeze({
    title: 'Atualizar entradas',
    formDescription: 'Informe o total de entradas deste mês.',
    amountLabel: 'Entradas do mês',
    currentLabel: 'Entradas atuais',
    newLabel: 'Novas entradas',
    submitLabel: 'Salvar entradas',
    successTitle: 'Entradas atualizadas',
  }),
  expense: Object.freeze({
    title: 'Atualizar saídas',
    formDescription: 'Informe o total de saídas deste mês.',
    amountLabel: 'Saídas do mês',
    currentLabel: 'Saídas atuais',
    newLabel: 'Novas saídas',
    submitLabel: 'Salvar saídas',
    successTitle: 'Saídas atualizadas',
  }),
});

function generateOperationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback simples (ambiente sem crypto.randomUUID) -- mesmo padrão já
  // usado em FinanceTransactionModal.jsx para client_operation_id.
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// BLOCO FINAL DO MVP (Saldo manual) + BLOCO SALDO/RECEITA/DESPESA EDITAVEIS:
// modal única reaproveitada pelos 3 cards do Resumo do mês. Reaproveita a
// RPC atômica execute_confirmed_financial_action (transaction_type =
// 'adjustment') via balanceAdjustmentService.js -- nenhuma escrita direta
// em tabela, nenhum novo mecanismo de persistência.
//
// CONTA-OPCIONAL (fase 2): o ajuste deixou de exigir escolher uma conta --
// ajusta o total do WORKSPACE (saldo) ou do MÊS (receita/despesa), nunca o
// saldo de uma conta específica. O componente é remontado pelo pai (key
// derivada de `open`+`target`, ver SimplifiedRecordsPage.jsx) a cada
// abertura -- por isso todo o estado abaixo nasce limpo via useState
// inicial, sem efeito de reset (evita cascading renders e gera um
// client_operation_id novo por abertura naturalmente).
function UpdateBalanceModal({ target = 'balance', currentValue, onChanged, onClose, open }) {
  const copy = TARGET_COPY[target] ?? TARGET_COPY.balance;
  const [step, setStep] = useState('form');
  // BLOCO SALDO/RECEITA/DESPESA EDITAVEIS (ajuste de UX): o campo nasce
  // preenchido com o valor atual do card, não com "R$ 0,00" -- o usuário
  // via um valor errado na tela mesmo já tendo um saldo salvo. "Zerar"
  // continua disponível para o caso comum de correção total.
  const [cents, setCents] = useState(() => amountToCents(currentValue));
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [savedDelta, setSavedDelta] = useState(null);
  const operationIdRef = useRef(null);
  if (operationIdRef.current === null) {
    operationIdRef.current = generateOperationId();
  }

  const newValue = centsToAmount(cents);
  const currentValueNumber = Number(currentValue ?? 0);
  const delta = computeBalanceDelta(currentValueNumber, newValue);
  // Só pode avançar se o valor realmente mudou -- a RPC rejeita ajuste com
  // delta zero, então nem faz sentido habilitar o botão sem uma mudança.
  const hasChange = delta !== 0;

  function handleClose() {
    if (isSubmitting) return;
    onClose?.();
  }

  function handleAmountChange(event) {
    setCents(digitsToCents(event.target.value));
  }

  // "Zerar": atalho para o caso comum de correção total (o card deveria
  // mostrar R$ 0,00) -- só preenche o valor, a confirmação continua
  // exigida no passo seguinte, igual a qualquer outro valor digitado.
  function handleZero() {
    setCents(0);
  }

  function handleReviewSubmit(event) {
    event.preventDefault();
    if (!hasChange) return;
    setError(null);
    setStep('confirm');
  }

  async function handleConfirm() {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);

    const result = await submitBalanceAdjustment({
      target,
      currentBalance: currentValueNumber,
      newBalance: newValue,
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
      title={copy.title}
      description={step === 'form' ? copy.formDescription : undefined}
      size="sm"
      className={styles.balanceDialog}
      overlayClassName={styles.darkOverlay}
    >
      {step === 'form' ? (
        <form className={styles.form} onSubmit={handleReviewSubmit}>
          <div className={styles.amountField}>
            <label htmlFor="update-balance-amount">
              <span>{copy.amountLabel}</span>
              <input
                id="update-balance-amount"
                className={styles.amountInput}
                inputMode="numeric"
                autoComplete="off"
                value={formatCentsAsCurrencyInput(cents)}
                onChange={handleAmountChange}
                placeholder="R$ 0,00"
                required
              />
            </label>
            <button type="button" className={styles.zeroButton} onClick={handleZero}>
              Zerar
            </button>
          </div>

          <Input
            id="update-balance-description"
            label="Descrição (opcional)"
            placeholder="Ex.: Correção manual"
            value={note}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(event) => setNote(event.target.value)}
            fullWidth
          />
          <div className={styles.actions}>
            <Button type="button" variant="ghost" onClick={handleClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!hasChange}>
              {copy.submitLabel}
            </Button>
          </div>
        </form>
      ) : step === 'confirm' ? (
        <div className={styles.confirmContent}>
          <dl className={styles.summaryList}>
            <div>
              <dt>{copy.currentLabel}</dt>
              <dd>{formatCurrency(currentValueNumber)}</dd>
            </div>
            <div>
              <dt>{copy.newLabel}</dt>
              <dd>{formatCurrency(newValue)}</dd>
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
          <strong>{copy.successTitle}</strong>
          <p>
            {formatCurrency(newValue)}
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
