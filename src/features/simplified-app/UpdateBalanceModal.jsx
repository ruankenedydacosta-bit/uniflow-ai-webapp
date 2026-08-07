import { useRef, useState } from 'react';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import FinanceAccountModal from '../../pages/financeiro/FinanceAccountModal.jsx';
import { submitBalanceAdjustment } from '../../services/balanceAdjustmentService.js';
import { formatCurrency } from '../../utils/formatters.js';
import {
  centsToAmount,
  computeBalanceDelta,
  digitsToCents,
  formatCentsAsCurrencyInput,
  formatSignedCurrency,
  getActiveAccountsForAdjustment,
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
// Correção (Bloco Saldo + Cobrança): a conta do ajuste é SEMPRE uma escolha
// explícita do usuário -- nunca inferida silenciosamente. Com exatamente uma
// conta ativa, ela aparece pré-selecionada no <select> real (visível e
// editável); com várias, o campo nasce vazio e o usuário precisa escolher.
// "Criar conta" reaproveita o FinanceAccountModal já existente (nenhuma tela
// nova) num sub-fluxo empilhado, preservando valor e descrição já digitados.
//
// O componente é remontado pelo pai (key derivada de `open`, ver
// SimplifiedRecordsPage.jsx) a cada abertura -- por isso todo o estado abaixo
// nasce limpo via useState inicial, sem efeito de reset (evita cascading
// renders e gera um client_operation_id novo por abertura naturalmente).
function UpdateBalanceModal({ accountState, onChanged, onClose, open }) {
  const [step, setStep] = useState('form');
  const [cents, setCents] = useState(0);
  const [touched, setTouched] = useState(false);
  const [note, setNote] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [showCreateAccount, setShowCreateAccount] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [savedDelta, setSavedDelta] = useState(null);
  const operationIdRef = useRef(null);
  if (operationIdRef.current === null) {
    operationIdRef.current = generateOperationId();
  }

  const activeAccounts = getActiveAccountsForAdjustment(accountState?.activeAccounts ?? []);
  // Com exatamente 1 conta ativa, ela é tratada como selecionada por
  // DERIVAÇÃO durante a renderização (nunca um efeito, nunca persistido às
  // escondidas) -- continua visível/editável no <select> real. Assim que
  // existe uma 2a conta, essa derivação para de se aplicar automaticamente:
  // uma seleção prévia feita pelo usuário nunca é apagada, mas o campo nunca
  // fica silenciosamente preenchido para múltiplas contas.
  const effectiveSelectedId = selectedAccountId
    || (activeAccounts.length === 1 ? activeAccounts[0].id : '');
  const selectedAccount = activeAccounts.find((account) => account.id === effectiveSelectedId) ?? null;

  const newBalance = centsToAmount(cents);
  const currentBalance = Number(selectedAccount?.derived_balance ?? selectedAccount?.initial_balance ?? 0);
  const delta = computeBalanceDelta(currentBalance, newBalance);

  function handleClose() {
    if (isSubmitting) return;
    onClose?.();
  }

  function handleAmountChange(event) {
    setCents(digitsToCents(event.target.value));
    setTouched(true);
  }

  function handleAccountChange(event) {
    setSelectedAccountId(event.target.value);
  }

  function openCreateAccount() {
    accountState?.clearError?.();
    setShowCreateAccount(true);
  }

  function handleReviewSubmit(event) {
    event.preventDefault();
    if (!touched || !selectedAccount) return;
    setError(null);
    setStep('confirm');
  }

  async function handleConfirm() {
    if (isSubmitting || !selectedAccount) return;
    setIsSubmitting(true);
    setError(null);

    const result = await submitBalanceAdjustment({
      accountId: selectedAccount.id,
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
    <>
      <Modal
        open={Boolean(open) && !showCreateAccount}
        onClose={handleClose}
        closeOnOverlayClick={!isSubmitting}
        closeOnEsc={!isSubmitting}
        title="Atualizar saldo"
        description={step === 'form' ? 'Informe o saldo total atual das suas contas.' : undefined}
        size="sm"
        className={styles.balanceDialog}
        overlayClassName={styles.darkOverlay}
      >
        {activeAccounts.length === 0 ? (
          <div className={styles.emptyState} role="status">
            <p>Nenhuma conta disponível.</p>
            <Button type="button" onClick={openCreateAccount}>Criar conta</Button>
          </div>
        ) : step === 'form' ? (
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

            <div className={styles.accountField}>
              <div className={styles.accountLabelRow}>
                <span>Conta</span>
                <button type="button" className={styles.createAccountLink} onClick={openCreateAccount}>
                  Criar conta
                </button>
              </div>
              <select
                id="update-balance-account"
                className={styles.accountSelect}
                value={effectiveSelectedId}
                onChange={handleAccountChange}
                required
              >
                <option value="" disabled>Selecione uma conta</option>
                {activeAccounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </select>
            </div>

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
              <Button type="submit" disabled={!touched || !selectedAccount}>
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
              <div>
                <dt>Conta</dt>
                <dd>{selectedAccount?.name}</dd>
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
              {selectedAccount?.name}: {formatCurrency(newBalance)}
              {' '}({formatSignedCurrency(savedDelta, formatCurrency)})
            </p>
            <div className={styles.actions}>
              <Button type="button" onClick={onClose}>Concluir</Button>
            </div>
          </div>
        )}
      </Modal>

      <FinanceAccountModal
        accountState={accountState}
        autoCloseOnCreate
        open={Boolean(open) && showCreateAccount}
        onClose={() => setShowCreateAccount(false)}
        onChanged={onChanged}
        className={styles.accountDialogDark}
        overlayClassName={styles.darkOverlay}
      />
    </>
  );
}

export default UpdateBalanceModal;
