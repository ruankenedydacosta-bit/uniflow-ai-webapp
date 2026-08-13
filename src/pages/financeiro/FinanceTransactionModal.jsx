import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { cx } from '../../utils/cx';
import { formatCurrency } from '../../utils/formatters';
import styles from './FinanceTransactionModal.module.css';
import {
  CrudRow,
  FormMessage,
  SelectField,
} from './FinanceCrudPrimitives';
import { downloadTransactionsCsv } from './transactionExportUtils.js';
import { getFinanceErrorMessage } from './financeUiUtils';
import { resolveInstallmentScope } from './installmentUtils';
import { getFinancialPeriod } from './mobile/financeiroMobileData.js';
import {
  DEFAULT_TRANSACTION_FILTERS,
  applyTransactionFilters,
  derivePaymentMethodOptions,
  filterTransactionsByDateRange,
  hasActiveTransactionFilters,
} from './transactionFilterUtils.js';
import {
  buildInstallmentMutationPayloads,
  buildTransactionMutationPayload,
  createEmptyTransactionForm,
  createTransactionDuplicateForm,
  createTransactionEditForm,
  getSelectableTransactionAccounts,
  isInstallmentPurchase,
} from './transactionFormUtils';

const SORT_OPTIONS = [
  { value: 'recent', label: 'Mais recentes' },
  { value: 'oldest', label: 'Mais antigas' },
  { value: 'highest', label: 'Maior valor' },
  { value: 'lowest', label: 'Menor valor' },
];

const INSTALLMENT_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'installment', label: 'Parcelados' },
  { value: 'single', label: 'Não parcelados' },
];

const RECURRING_OPTIONS = [
  { value: 'all', label: 'Todos' },
  { value: 'recurring', label: 'Recorrentes' },
  { value: 'single', label: 'Não recorrentes' },
];

// Reaproveita getFinancialPeriod (mesma função usada pelo seletor de período
// mobile) só para calcular o intervalo do período atual em cada modo — o
// desktop não tem hoje um seletor de período com navegação (anterior/próximo)
// como o mobile, então aqui só é oferecido o período "atual" de cada modo.
const PERIOD_OPTIONS = [
  { value: 'all', label: 'Todos os períodos' },
  { value: 'Semana', label: 'Semana atual' },
  { value: 'Mês', label: 'Mês atual' },
  { value: 'Trimestre', label: 'Trimestre atual' },
  { value: 'Ano', label: 'Ano atual' },
];

function generateGroupId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback simples (ambiente sem crypto.randomUUID) — suficiente como
  // identificador de agrupamento no cliente, não é usado como segredo.
  return `grp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

// Mesmos rótulos honestos já usados no seletor "Tipo" deste formulário
// (linhas 343-346) -- reaproveitados no histórico para o indicador visual
// de receita/despesa/transferência/ajuste exigido pelo bloco "Lançamentos
// existentes".
const HISTORY_TYPE_LABELS = {
  income: 'Entrada',
  expense: 'Saída',
  transfer: 'Transferência',
  adjustment: 'Ajuste',
};

const MANAGE_BLOCKED_TITLE = 'Você não possui permissão para gerenciar lançamentos deste espaço.';
const DELETE_BLOCKED_TITLE = 'Você não possui permissão para excluir este lançamento.';

function DeleteConfirmationDialog({
  className,
  deleteScope,
  error,
  hasGroup,
  isLoading,
  onCancel,
  onConfirm,
  onDeleteScopeChange,
  open,
  overlayClassName,
  transaction,
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    dialogRef.current?.querySelector('button:not(:disabled)')?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape' && !isLoading) {
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), select:not(:disabled)') ?? [])];
      if (!focusable.length) return;
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
  }, [isLoading, onCancel, open]);

  if (!open || !transaction) return null;

  return createPortal(
    <div
      className={cx(styles.deleteConfirmOverlay, overlayClassName)}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && !isLoading) onCancel();
      }}
    >
      <div
        ref={dialogRef}
        className={cx(styles.deleteConfirmCard, className)}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className={styles.deleteConfirmIcon} aria-hidden="true">!</span>
        <div className={styles.deleteConfirmCopy}>
          <h2 id={titleId}>Excluir lançamento?</h2>
          <p id={descriptionId}>Essa ação não poderá ser desfeita.</p>
          {transaction.description ? <strong>{transaction.description}</strong> : null}
        </div>

        {hasGroup ? (
          <SelectField
            id="finance-transaction-confirm-delete-scope"
            label="Quais parcelas deseja excluir?"
            value={deleteScope}
            onChange={onDeleteScopeChange}
            disabled={isLoading}
          >
            <option value="only">Somente esta parcela</option>
            <option value="forward">Esta e as próximas</option>
            <option value="all">Todas do grupo</option>
          </SelectField>
        ) : null}

        <FormMessage>
          {getFinanceErrorMessage(
            error,
            'Não foi possível excluir o lançamento. Tente novamente.',
          )}
        </FormMessage>

        <div className={styles.deleteConfirmActions}>
          <Button
            variant="outline"
            onClick={onCancel}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button variant="danger" loading={isLoading} onClick={onConfirm}>
            Confirmar exclusão
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// `className`/`overlayClassName` (opcionais): mesmo padrão aditivo já usado
// em FinanceAccountModal.jsx -- permitem que o Registros simplificado force
// a identidade escura oficial sem afetar o uso padrão desta modal em
// FinanceiroPage.jsx (desktop), que continua reativo ao tema --uf-* do
// site quando as props não são passadas.
// CONTA-ZERO (Registros simplificado): `hideAccountFields` remove toda a UI
// de conta do formulário (Conta/Conta de destino, opção "Transferência" no
// Tipo, aviso "crie uma conta antes de...") -- usado só pelo fluxo pessoal
// simplificado, que nunca deveria falar em conta. `showExistingList=false`
// esconde o bloco "Lançamentos existentes" (lista + filtros + CSV de TODO o
// espaço) -- ele é redundante e desorientador quando esta modal abre só
// para editar UM lançamento a partir da lista da própria página (ver
// SimplifiedRecordsPage.jsx). Nenhum dos dois muda o comportamento default
// (FinanceiroPage.jsx / desktop continuam recebendo os dois blocos).
function FinanceTransactionModal({
  accountState,
  canDeleteTransaction = () => true,
  canManage = true,
  categoryState,
  className,
  overlayClassName,
  duplicateFromTransactionId,
  editingTransactionId,
  hideAccountFields = false,
  initialType = 'expense',
  onChanged,
  onClose,
  onDeleted,
  onEdited,
  open,
  showExistingList = true,
  transactionState,
}) {
  const [form, setForm] = useState(() => {
    if (editingTransactionId) {
      const transaction = transactionState.transactions.find((t) => t.id === editingTransactionId);
      if (transaction) return createTransactionEditForm(transaction);
    }
    if (duplicateFromTransactionId) {
      const transaction = transactionState.transactions.find((t) => t.id === duplicateFromTransactionId);
      if (transaction) return createTransactionDuplicateForm(transaction);
    }
    return createEmptyTransactionForm(initialType);
  });
  const [editingId, setEditingId] = useState(() => editingTransactionId ?? null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [pendingDeleteSnapshot, setPendingDeleteSnapshot] = useState(null);
  const [deleteScope, setDeleteScope] = useState('only');
  const [editScope, setEditScope] = useState('only');
  const [duplicateNotice, setDuplicateNotice] = useState(() => Boolean(duplicateFromTransactionId));
  const [batchError, setBatchError] = useState(null);
  const [listFilters, setListFilters] = useState(DEFAULT_TRANSACTION_FILTERS);
  const [listFiltersOpen, setListFiltersOpen] = useState(false);
  const [periodMode, setPeriodMode] = useState('all');
  const categoriesById = useMemo(
    () => new Map(categoryState.categories.map((category) => [category.id, category])),
    [categoryState.categories],
  );
  const accountsById = useMemo(
    () => new Map(accountState.accounts.map((account) => [account.id, account])),
    [accountState.accounts],
  );
  const paymentMethodOptions = useMemo(
    () => derivePaymentMethodOptions(transactionState.transactions),
    [transactionState.transactions],
  );
  const periodFilteredTransactions = useMemo(() => {
    if (periodMode === 'all') return transactionState.transactions;
    const period = getFinancialPeriod({ mode: periodMode, offset: 0 });
    return filterTransactionsByDateRange(transactionState.transactions, period);
  }, [periodMode, transactionState.transactions]);
  const listedTransactions = useMemo(
    () => applyTransactionFilters(periodFilteredTransactions, listFilters, { categoriesById, accountsById }),
    [periodFilteredTransactions, listFilters, categoriesById, accountsById],
  );
  const listHasActiveFilters = hasActiveTransactionFilters(listFilters) || periodMode !== 'all';

  function updateListFilter(patch) {
    setListFilters((current) => ({ ...current, ...patch }));
  }

  function clearListFilters() {
    setListFilters(DEFAULT_TRANSACTION_FILTERS);
    setPeriodMode('all');
  }

  function handleExportCsv() {
    downloadTransactionsCsv(listedTransactions, { categoriesById, accountsById });
  }

  const filteredCategories = useMemo(
    () =>
      categoryState.categories.filter((category) =>
        form.transaction_type === 'adjustment'
          ? category.category_type !== 'transfer'
          : category.category_type === form.transaction_type,
      ),
    [categoryState.categories, form.transaction_type],
  );
  const selectableAccounts = useMemo(
    () => getSelectableTransactionAccounts(accountState.accounts, editingId, form),
    [accountState.accounts, editingId, form],
  );

  const editingTransaction = editingId
    ? transactionState.transactions.find((t) => t.id === editingId)
    : null;
  const editingGroupId = editingTransaction?.metadata?.installment_group_id ?? null;
  const pendingDeleteTransaction = pendingDeleteId
    ? transactionState.transactions.find((transaction) => transaction.id === pendingDeleteId)
      ?? pendingDeleteSnapshot
    : null;
  const pendingDeleteHasGroup = Boolean(pendingDeleteTransaction?.metadata?.installment_group_id);
  const isDeleteConfirmOpen = Boolean(pendingDeleteId && pendingDeleteTransaction);

  function resetForm() {
    setForm(createEmptyTransactionForm(initialType));
    setEditingId(null);
    setPendingDeleteId(null);
    setPendingDeleteSnapshot(null);
    setDeleteScope('only');
    setEditScope('only');
    setDuplicateNotice(false);
    setBatchError(null);
  }

  function handleClose() {
    if (transactionState.isMutating) return;
    if (isDeleteConfirmOpen) {
      setPendingDeleteId(null);
      setPendingDeleteSnapshot(null);
      setDeleteScope('only');
      setBatchError(null);
      return;
    }
    transactionState.clearError();
    setBatchError(null);
    resetForm();
    onClose();
  }

  function handleRequestDelete(transactionId) {
    const transaction = transactionState.transactions.find((item) => item.id === transactionId);
    if (!transaction) return;
    transactionState.clearError();
    setBatchError(null);
    setDeleteScope('only');
    setPendingDeleteId(transactionId);
    setPendingDeleteSnapshot(transaction);
  }

  function handleCancelDelete() {
    if (transactionState.isMutating) return;
    transactionState.clearError();
    setBatchError(null);
    setDeleteScope('only');
    setPendingDeleteId(null);
    setPendingDeleteSnapshot(null);
  }

  function handleEdit(transaction) {
    if (transactionState.isMutating || !canManage) return;
    transactionState.clearError();
    setBatchError(null);
    setEditingId(transaction.id);
    setPendingDeleteId(null);
    setEditScope('only');
    setDuplicateNotice(false);
    setForm(createTransactionEditForm(transaction));
  }

  function handleDuplicate(transaction) {
    if (transactionState.isMutating || !canManage) return;
    transactionState.clearError();
    setBatchError(null);
    setEditingId(null);
    setPendingDeleteId(null);
    setDuplicateNotice(true);
    setForm(createTransactionDuplicateForm(transaction));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (transactionState.isMutating || !canManage) return;
    setBatchError(null);

    // Edição de uma transação que pertence a um grupo de parcelas: aplica as
    // mudanças (exceto data/número de parcela, que pertencem a cada linha)
    // ao escopo escolhido pelo usuário.
    if (editingId && editingGroupId) {
      const targetIds = resolveInstallmentScope(
        transactionState.transactions,
        editingTransaction,
        editScope,
      );
      const payload = buildTransactionMutationPayload(form);
      // Campos que são intrínsecos a cada parcela individual não devem ser
      // propagados ao editar "esta e as próximas"/"todas".
      delete payload.transaction_date;

      for (const id of targetIds) {
        const result = await transactionState.saveTransaction(payload, id);
        if (result.error) {
          setBatchError(result.error);
          return;
        }
      }
      await onChanged?.();
      if (onEdited) {
        await onEdited(editingTransaction);
        return;
      }
      resetForm();
      return;
    }

    // Criação de compra parcelada: gera N transações reais em sequência.
    if (!editingId && isInstallmentPurchase(form)) {
      let payloads;
      try {
        payloads = buildInstallmentMutationPayloads(form, {
          groupId: generateGroupId(),
          today: todayIso(),
        });
      } catch (buildError) {
        setBatchError({ code: 'INVALID_INSTALLMENTS', message: buildError.message });
        return;
      }

      for (const payload of payloads) {
        const result = await transactionState.saveTransaction(payload, null);
        if (result.error) {
          setBatchError(result.error);
          return;
        }
      }
      await onChanged?.();
      resetForm();
      return;
    }

    // Fluxo padrão: uma única transação (criação simples, edição simples ou
    // lançamento recorrente — a intenção de recorrência fica só na própria
    // transação, sem gerar ocorrências futuras automaticamente).
    const result = await transactionState.saveTransaction(
      buildTransactionMutationPayload(form),
      editingId,
    );

    if (!result.error) {
      await onChanged?.();
      if (editingId && onEdited) {
        await onEdited(editingTransaction);
        return;
      }
      resetForm();
    }
  }

  async function handleDelete(transactionId) {
    if (transactionState.isMutating) return;
    const transaction = transactionState.transactions.find((t) => t.id === transactionId);
    if (!transaction || !canDeleteTransaction(transaction)) return;
    const groupId = transaction?.metadata?.installment_group_id ?? null;
    const targetIds = groupId
      ? resolveInstallmentScope(transactionState.transactions, transaction, deleteScope)
      : [transactionId];

    for (const id of targetIds) {
      const result = await transactionState.removeTransaction(id);
      if (result.error) {
        setBatchError(result.error);
        return;
      }
    }
    await onChanged?.();
    setPendingDeleteId(null);
    setPendingDeleteSnapshot(null);
    if (onDeleted) {
      await onDeleted(transaction);
      return;
    }
    resetForm();
  }

  // CONTA-OPCIONAL: só transferência e ajuste exigem conta de origem
  // (destino é exigido separadamente, só para transferência). Com
  // hideAccountFields nenhuma conta é exigida -- transferência nem aparece
  // como opção de Tipo, e ajuste passou a funcionar sem conta (migration
  // 037/adjustment_target).
  const accountRequiredForSubmit = !hideAccountFields
    && (form.transaction_type === 'transfer' || form.transaction_type === 'adjustment');
  const canSubmit = Boolean(
    canManage &&
    !transactionState.isMutating &&
    (!accountRequiredForSubmit || form.account_id) &&
    Number(form.amount) > 0 &&
    form.transaction_date &&
    (form.transaction_type !== 'transfer' || form.destination_account_id),
  );

  return (
    <>
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!transactionState.isMutating && !isDeleteConfirmOpen}
      closeOnEsc={!transactionState.isMutating && !isDeleteConfirmOpen}
      title="Lançamentos"
      description="Registre entradas, saídas, transferências e ajustes deste espaço."
      size="xl"
      className={cx(styles.transactionDialog, className)}
      overlayClassName={overlayClassName}
      aria-hidden={isDeleteConfirmOpen}
      inert={isDeleteConfirmOpen}
      footer={
        <Button variant="ghost" onClick={handleClose} disabled={transactionState.isMutating}>
          Fechar
        </Button>
      }
    >
      <div className={styles.modalBody}>
        <form className="uf-flex uf-flex-column uf-gap-md" onSubmit={handleSubmit}>
          {duplicateNotice && !editingId ? (
            <FormMessage tone="info">
              Dados copiados de outro lançamento. Revise antes de salvar — a data foi ajustada para hoje.
            </FormMessage>
          ) : null}
          <section className={styles.formBlock} aria-label="Dados principais">
          <SelectField
            id="finance-transaction-type"
            label="Tipo"
            value={form.transaction_type}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                transaction_type: event.target.value,
                category_id: '',
                destination_account_id: '',
              }))
            }
          >
            <option value="income">Entrada</option>
            <option value="expense">Saída</option>
            {/* CONTA-ZERO: transferência exige 2 contas por definição --
                não faz sentido no fluxo pessoal simplificado, que não tem
                nenhuma UI de conta. */}
            {hideAccountFields ? null : <option value="transfer">Transferência</option>}
            <option value="adjustment">Ajuste</option>
          </SelectField>
          {/* CONTA-OPCIONAL: entrada/despesa não pedem mais conta -- meses de
              atrito real vinham exatamente daqui. Transferência continua
              exigindo (precisa saber DE QUAL conta o dinheiro sai) e ajuste
              de saldo também continua oferecendo o campo no formulário
              completo desktop (a conta ali é opcional na RPC, mas mantida
              aqui como fluxo já existente e não solicitado pelo pedido de
              remoção). Com hideAccountFields nenhum dos dois aparece. */}
          {!hideAccountFields && (form.transaction_type === 'transfer' || form.transaction_type === 'adjustment') ? (
            <SelectField
              id="finance-transaction-account"
              label={form.transaction_type === 'transfer' ? 'Conta de origem' : 'Conta'}
              value={form.account_id}
              onChange={(event) =>
                setForm((current) => ({ ...current, account_id: event.target.value }))
              }
              required
            >
              <option value="">Selecione uma conta</option>
              {selectableAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                  {account.is_active === false ? ' (arquivada)' : ''}
                </option>
              ))}
            </SelectField>
          ) : null}
          {!hideAccountFields && form.transaction_type === 'transfer' ? (
            <SelectField
              id="finance-transaction-destination"
              label="Conta de destino"
              value={form.destination_account_id}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  destination_account_id: event.target.value,
                }))
              }
              required
            >
              <option value="">Selecione a conta de destino</option>
              {selectableAccounts
                .filter((account) => account.id !== form.account_id)
                .map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
            </SelectField>
          ) : null}
          <SelectField
            id="finance-transaction-category"
            label="Categoria"
            value={form.category_id}
            onChange={(event) =>
              setForm((current) => ({ ...current, category_id: event.target.value }))
            }
          >
            <option value="">Sem categoria</option>
            {filteredCategories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
          <Input
            id="finance-transaction-amount"
            label="Valor"
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(event) =>
              setForm((current) => ({ ...current, amount: event.target.value }))
            }
            required
            fullWidth
          />
          <Input
            id="finance-transaction-date"
            label="Data"
            type="date"
            value={form.transaction_date}
            onChange={(event) =>
              setForm((current) => ({ ...current, transaction_date: event.target.value }))
            }
            required
            fullWidth
          />
          </section>

          <section className={styles.formBlock} aria-label="Informações opcionais">
          <Input
            id="finance-transaction-description"
            label="Descrição (opcional)"
            placeholder="Ex.: Mercado do mês, salário, transferência para reserva..."
            value={form.description}
            onChange={(event) =>
              setForm((current) => ({ ...current, description: event.target.value }))
            }
            fullWidth
          />

          {!editingId && form.transaction_type !== 'transfer' ? (
            <Input
              id="finance-transaction-installments"
              label="Número de parcelas"
              type="number"
              min="1"
              max="360"
              step="1"
              value={form.installment_count}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  installment_count: event.target.value,
                  is_recurring: Number(event.target.value) > 1 ? false : current.is_recurring,
                }))
              }
              fullWidth
            />
          ) : null}
          {!editingId && Number(form.installment_count) > 1 ? (
            <FormMessage tone="info">
              Serão criados {Number(form.installment_count)} lançamentos, um por mês a partir da
              data informada, com o valor total dividido entre as parcelas (a última parcela
              absorve o arredondamento em centavos).
            </FormMessage>
          ) : null}

          {!editingId && form.transaction_type !== 'transfer' && Number(form.installment_count) <= 1 ? (
            <label className="uf-flex uf-items-center uf-gap-sm uf-text-caption">
              <input
                type="checkbox"
                checked={form.is_recurring}
                onChange={(event) =>
                  setForm((current) => ({ ...current, is_recurring: event.target.checked }))
                }
              />
              <span className="uf-text-primary">Lançamento recorrente</span>
            </label>
          ) : null}
          {form.is_recurring ? (
            <div className="uf-flex uf-flex-column uf-gap-sm">
              <SelectField
                id="finance-transaction-recurrence-frequency"
                label="Frequência"
                value={form.recurrence_frequency}
                onChange={(event) =>
                  setForm((current) => ({ ...current, recurrence_frequency: event.target.value }))
                }
              >
                <option value="daily">Diária</option>
                <option value="weekly">Semanal</option>
                <option value="monthly">Mensal</option>
                <option value="yearly">Anual</option>
              </SelectField>
              <Input
                id="finance-transaction-recurrence-interval"
                label="Repetir a cada"
                type="number"
                min="1"
                step="1"
                value={form.recurrence_interval}
                onChange={(event) =>
                  setForm((current) => ({ ...current, recurrence_interval: event.target.value }))
                }
                fullWidth
              />
              <Input
                id="finance-transaction-recurrence-end-date"
                label="Repetir até (opcional)"
                type="date"
                value={form.recurrence_end_date}
                onChange={(event) =>
                  setForm((current) => ({ ...current, recurrence_end_date: event.target.value }))
                }
                fullWidth
              />
              <FormMessage tone="info">
                Este lançamento fica marcado como recorrente, mas nenhuma ocorrência futura é
                criada automaticamente nesta versão — a geração automática depende de um
                agendador (Edge Function) que ainda não existe.
              </FormMessage>
            </div>
          ) : null}

          {editingId && editingGroupId ? (
            <SelectField
              id="finance-transaction-edit-scope"
              label="Aplicar alteração a"
              value={editScope}
              onChange={(event) => setEditScope(event.target.value)}
            >
              <option value="only">Somente esta parcela</option>
              <option value="forward">Esta e as próximas parcelas</option>
              <option value="all">Todas as parcelas deste grupo</option>
            </SelectField>
          ) : null}

          {/* CONTA-OPCIONAL: só transferência/ajuste realmente dependem de
              conta -- entrada/despesa funcionam normalmente sem nenhuma.
              Nunca aparece com hideAccountFields (accountRequiredForSubmit
              já é sempre false nesse caso). */}
          {!accountState.activeAccounts.length && !editingId && accountRequiredForSubmit ? (
            <FormMessage tone="info">Crie uma conta antes de registrar uma transferência ou ajuste de saldo.</FormMessage>
          ) : null}
          <FormMessage>
            {getFinanceErrorMessage(
              batchError ?? transactionState.error,
              'Não foi possível concluir o lançamento. Revise os dados e tente novamente.',
            )}
          </FormMessage>
          </section>

          <section className={styles.formBlock} aria-label="Ação">
          <div className={styles.actionRow}>
            {editingId && editingTransaction && canDeleteTransaction(editingTransaction) ? (
              <Button
                className={styles.deleteButton}
                variant="danger"
                disabled={transactionState.isMutating}
                onClick={() => handleRequestDelete(editingId)}
              >
                Excluir
              </Button>
            ) : null}
            <div className={styles.primaryActions}>
              {editingId ? (
                <Button variant="outline" onClick={resetForm} disabled={transactionState.isMutating}>
                  Cancelar edição
                </Button>
              ) : null}
              <Button
                type="submit"
                loading={transactionState.isMutating}
                disabled={!canSubmit}
                title={!canManage ? MANAGE_BLOCKED_TITLE : undefined}
              >
                {editingId ? 'Salvar lançamento' : 'Criar lançamento'}
              </Button>
            </div>
          </div>
          </section>
        </form>

        {showExistingList ? (
        <div className={styles.formBlock} aria-label="Lançamentos existentes">
          <div className="uf-flex uf-items-center uf-gap-sm uf-flex-wrap">
            <Input
              id="finance-transaction-list-search"
              label="Buscar lançamentos"
              type="search"
              placeholder="Descrição, observação, categoria ou conta..."
              value={listFilters.search}
              onChange={(event) => updateListFilter({ search: event.target.value })}
              fullWidth
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setListFiltersOpen((value) => !value)}
              aria-expanded={listFiltersOpen}
              aria-controls="finance-transaction-list-filters-panel"
            >
              {listFiltersOpen ? 'Ocultar filtros' : 'Filtros'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleExportCsv}
              disabled={!listedTransactions.length}
            >
              Exportar CSV
            </Button>
          </div>

          {listFiltersOpen ? (
            <div
              id="finance-transaction-list-filters-panel"
              className={styles.filtersPanel}
            >
              <SelectField
                id="finance-transaction-list-sort"
                label="Ordenar por"
                value={listFilters.sortOrder}
                onChange={(event) => updateListFilter({ sortOrder: event.target.value })}
              >
                {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </SelectField>
              <SelectField
                id="finance-transaction-list-period"
                label="Período"
                value={periodMode}
                onChange={(event) => setPeriodMode(event.target.value)}
              >
                {PERIOD_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </SelectField>
              <SelectField
                id="finance-transaction-list-type"
                label="Tipo"
                value={listFilters.type}
                onChange={(event) => updateListFilter({ type: event.target.value })}
              >
                <option value="all">Todos</option>
                <option value="income">Entradas</option>
                <option value="expense">Saídas</option>
                <option value="transfer">Transferências</option>
                <option value="adjustment">Ajustes</option>
              </SelectField>
              <SelectField
                id="finance-transaction-list-account"
                label="Conta"
                value={listFilters.accountId}
                onChange={(event) => updateListFilter({ accountId: event.target.value })}
              >
                <option value="all">Todas as contas</option>
                {accountState.accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.name}</option>
                ))}
              </SelectField>
              <SelectField
                id="finance-transaction-list-category"
                label="Categoria"
                value={listFilters.categoryId}
                onChange={(event) => updateListFilter({ categoryId: event.target.value })}
              >
                <option value="all">Todas as categorias</option>
                {categoryState.categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </SelectField>
              <SelectField
                id="finance-transaction-list-payment-method"
                label="Forma de pagamento"
                value={listFilters.paymentMethod}
                onChange={(event) => updateListFilter({ paymentMethod: event.target.value })}
              >
                <option value="all">Todas</option>
                {paymentMethodOptions.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </SelectField>
              <SelectField
                id="finance-transaction-list-installment"
                label="Parcelados"
                value={listFilters.installment}
                onChange={(event) => updateListFilter({ installment: event.target.value })}
              >
                {INSTALLMENT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </SelectField>
              <SelectField
                id="finance-transaction-list-recurring"
                label="Recorrentes"
                value={listFilters.recurring}
                onChange={(event) => updateListFilter({ recurring: event.target.value })}
              >
                {RECURRING_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </SelectField>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearListFilters}
                disabled={!listHasActiveFilters}
              >
                Limpar filtros
              </Button>
            </div>
          ) : null}

          {!listedTransactions.length ? (
            <FormMessage tone="info">
              {listHasActiveFilters ? (
                <>
                  Nenhuma movimentação encontrada.{' '}
                  <button
                    type="button"
                    className={`uf-text-brand ${styles.inlineLinkButton}`}
                    onClick={clearListFilters}
                  >
                    Limpar filtros
                  </button>
                </>
              ) : (
                'Nenhum lançamento registrado.'
              )}
            </FormMessage>
          ) : null}

          {listedTransactions.map((transaction) => {
            const canDeleteThisTransaction = canDeleteTransaction(transaction);
            const isAdjustment = transaction.transaction_type === 'adjustment';
            const isPositiveAdjustment = isAdjustment && Number(transaction.adjustment_delta) > 0;
            const isIncome = transaction.transaction_type === 'income' || isPositiveAdjustment;
            const typeTone = isIncome ? 'income' : transaction.transaction_type === 'transfer' ? 'transfer' : 'expense';
            // CONTA-OPCIONAL: null aqui é um estado normal (entrada/despesa
            // sem conta), não um erro -- "Conta não disponível" soava como
            // uma falha de carregamento.
            const accountName = transaction.account_id
              ? accountsById.get(transaction.account_id)?.name ?? 'Conta não disponível'
              : null;
            const categoryName = categoriesById.get(transaction.category_id)?.name ?? null;
            const detailParts = [
              HISTORY_TYPE_LABELS[transaction.transaction_type] ?? transaction.transaction_type,
              formatCurrency(transaction.amount),
              transaction.transaction_date,
              accountName,
              categoryName,
            ].filter(Boolean);
            return (
              <CrudRow
                key={transaction.id}
                // Ajustes manuais de saldo ficam visualmente distintos de
                // receita/despesa: indicador dedicado (isAdjustment), nunca
                // confundido com uma cor fixa de "sempre vermelho".
                title={
                  <span className={styles.historyTitle}>
                    <span
                      className={`${styles.historyDot} ${styles[`historyDot_${isAdjustment ? 'adjustment' : typeTone}`]}`}
                      aria-hidden="true"
                    />
                    {transaction.installment_total > 1
                      ? `${transaction.description} (${transaction.installment_number}/${transaction.installment_total})`
                      : transaction.description}
                  </span>
                }
                detail={detailParts.join(' · ')}
              >
                <div className={styles.historyActions}>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={transactionState.isMutating || !canManage}
                    title={!canManage ? MANAGE_BLOCKED_TITLE : undefined}
                    onClick={() => handleEdit(transaction)}
                  >
                    Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={transactionState.isMutating || !canManage}
                    title={!canManage ? MANAGE_BLOCKED_TITLE : undefined}
                    onClick={() => handleDuplicate(transaction)}
                  >
                    Duplicar
                  </Button>
                  {canDeleteThisTransaction ? (
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={transactionState.isMutating}
                      onClick={() => handleRequestDelete(transaction.id)}
                    >
                      Excluir
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" disabled title={DELETE_BLOCKED_TITLE}>
                      Excluir
                    </Button>
                  )}
                </div>
              </CrudRow>
            );
          })}
        </div>
        ) : null}
      </div>
    </Modal>
    <DeleteConfirmationDialog
      open={isDeleteConfirmOpen}
      className={className}
      overlayClassName={overlayClassName}
      transaction={pendingDeleteTransaction}
      hasGroup={pendingDeleteHasGroup}
      deleteScope={deleteScope}
      error={batchError}
      isLoading={transactionState.isMutating}
      onCancel={handleCancelDelete}
      onConfirm={() => handleDelete(pendingDeleteId)}
      onDeleteScopeChange={(event) => setDeleteScope(event.target.value)}
    />
    </>
  );
}

export default FinanceTransactionModal;
