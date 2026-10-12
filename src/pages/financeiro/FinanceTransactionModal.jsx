import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useSession } from '../../app/SessionContext.jsx';
import Button from '../../components/ui/Button';
import Field from '../../components/ui/Field';
import IconBox from '../../components/ui/IconBox';
import { createDownloadReadyNotification } from '../../features/notifications/notificationsService.js';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import OutlineButton from '../../components/ui/OutlineButton';
import Segmented from '../../components/ui/Segmented/index.js';
import Toggle from '../../components/ui/Toggle/index.js';
import { UniRingOrb } from '../../components/ui/UniRingOrb/index.js';
import { PhCaretDownIcon, PhCheckIcon, PhTrashIcon } from '../../features/simplified-app/SimplifiedIcons.jsx';
import { celebrarSalvar, fecharFolha } from '../../features/simplified-app/movimentoDeSalvar.js';
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
  localDateKey,
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
  return localDateKey();
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

// Folha de "Nova movimentação" (handoff 05, #89): o botão principal diz o
// que vai salvar, conforme o segmento escolhido.
const SHEET_SUBMIT_LABELS = {
  expense: 'Salvar saída',
  income: 'Salvar entrada',
  transfer: 'Salvar transferência',
  adjustment: 'Salvar ajuste',
};

// Aviso da data futura (handoff 24d): o lançamento vira previsto e só entra
// no saldo quando a pessoa confirma.
const PLANNED_EFFECT = {
  income: 'A data é depois de hoje. O valor entra no saldo quando você confirmar o recebimento.',
  expense: 'A data é depois de hoje. O valor sai do saldo quando você confirmar o pagamento.',
  transfer: 'A data é depois de hoje. As contas mudam de saldo quando você confirmar a transferência.',
};

const MANAGE_BLOCKED_TITLE = 'Você não possui permissão para gerenciar lançamentos deste espaço.';
const DELETE_BLOCKED_TITLE = 'Você não possui permissão para excluir este lançamento.';

// Confirmação de exclusão no molde da tela 22g: Modal compartilhado sem
// cabeçalho (folha no celular), lixeira, pergunta e "Excluir
// definitivamente" contornado acima de Cancelar. Enquanto ela está aberta o
// Modal da movimentação fica inert e com Esc desligado, então Esc fecha só a
// confirmação. Como antes, o foco abre em Cancelar e o Tab fica preso aqui
// dentro.
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
  const contentRef = useRef(null);

  // Roda depois do efeito do Modal (o filho), que põe o foco no diálogo.
  useEffect(() => {
    if (open) contentRef.current?.querySelector('[data-delete-cancel]')?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key !== 'Tab') return;
      const focusable = [...(contentRef.current?.querySelectorAll('button:not(:disabled), select:not(:disabled)') ?? [])];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!contentRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  function handleCancel() {
    if (isLoading) return;
    onCancel();
  }

  if (!open || !transaction) return null;

  return (
    <Modal
      open
      onClose={handleCancel}
      closeOnOverlayClick={!isLoading}
      closeOnEsc={!isLoading}
      hideCloseButton
      role="alertdialog"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      size="sm"
      className={cx(styles.deleteConfirmDialog, className)}
      overlayClassName={cx(styles.deleteConfirmOverlay, overlayClassName)}
    >
      <div ref={contentRef} className={styles.deleteConfirmContent}>
        <div className={styles.deleteConfirmMessage}>
          <IconBox size={44}><PhTrashIcon /></IconBox>
          <div className={styles.deleteConfirmCopy}>
            <h2 id={titleId}>
              {transaction.description ? `Excluir “${transaction.description}”?` : 'Excluir movimentação?'}
            </h2>
            <p id={descriptionId}>A movimentação sai dos seus registros. Não é possível desfazer.</p>
          </div>
        </div>

        {hasGroup ? (
          <Field label="Quais parcelas você quer excluir?" trailing={<PhCaretDownIcon />}>
            <select
              id="finance-transaction-confirm-delete-scope"
              value={deleteScope}
              onChange={onDeleteScopeChange}
              disabled={isLoading}
            >
              <option value="only">Somente esta parcela</option>
              <option value="forward">Esta e as próximas</option>
              <option value="all">Todas do grupo</option>
            </select>
          </Field>
        ) : null}

        {error ? (
          <p className={styles.deleteConfirmError} role="alert">
            {getFinanceErrorMessage(
              error,
              'Não foi possível excluir a movimentação. Tente novamente.',
            )}
          </p>
        ) : null}

        <div className={styles.deleteConfirmActions}>
          <OutlineButton
            variant="secondary"
            className={styles.deleteConfirmButton}
            loading={isLoading}
            onClick={onConfirm}
          >
            Excluir definitivamente
          </OutlineButton>
          <OutlineButton variant="ghost" onClick={handleCancel} disabled={isLoading} data-delete-cancel>
            Cancelar
          </OutlineButton>
        </div>
      </div>
    </Modal>
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
// `presentation="sheet"` (handoff 05, #89): o diálogo vira uma folha que
// sobe sobre a tela, o Tipo vira um segmented, o botão principal diz
// "Salvar saída/entrada/transferência" e o rodapé "Fechar" dá lugar a
// "Cancelar" na própria linha de ação. O default 'dialog' é o desktop.
// Na folha, `onCreated` recebe a movimentação nova depois que o botão
// comemora e a folha desce; quem abriu fecha o Modal nela, como em
// `onEdited`. Sem `onCreated`, a folha continua aberta e limpa.
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
  onCreated,
  onDeleted,
  onEdited,
  open,
  presentation = 'dialog',
  showExistingList = true,
  transactionState,
}) {
  const { user, workspace } = useSession();
  const isSheet = presentation === 'sheet';
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
  // Data depois de hoje salva como previsto (handoff 24d).
  const isPlanned = form.transaction_type !== 'adjustment'
    && form.status !== 'canceled'
    && form.status !== 'failed'
    && String(form.transaction_date) > localDateKey();
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const [pendingDeleteSnapshot, setPendingDeleteSnapshot] = useState(null);
  const [deleteScope, setDeleteScope] = useState('only');
  const [editScope, setEditScope] = useState('only');
  const [duplicateNotice, setDuplicateNotice] = useState(() => Boolean(duplicateFromTransactionId));
  const [batchError, setBatchError] = useState(null);
  const [listFilters, setListFilters] = useState(DEFAULT_TRANSACTION_FILTERS);
  const [listFiltersOpen, setListFiltersOpen] = useState(false);
  const [periodMode, setPeriodMode] = useState('all');
  // Salvou e a folha está comemorando e descendo: nada mais é aceito.
  const [concluindo, setConcluindo] = useState(false);
  const saveButtonRef = useRef(null);
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

  // DOWNLOAD-FEEDBACK1: geração do CSV é síncrona (nenhum estado de
  // "preparando" existe aqui) -- um toque duplo rapidíssimo dispararia
  // dois downloads reais e, sem esta trava, duas notificações para UMA
  // única intenção do usuário. Trava por tempo (não por ref booleana):
  // a função inteira roda e termina no mesmo tick, então uma flag
  // liga/desliga não protegeria contra um segundo clique real logo em
  // seguida.
  const lastCsvExportAtRef = useRef(0);
  const CSV_EXPORT_COOLDOWN_MS = 800;

  function handleExportCsv() {
    const now = Date.now();
    if (now - lastCsvExportAtRef.current < CSV_EXPORT_COOLDOWN_MS) return;
    lastCsvExportAtRef.current = now;

    const filename = downloadTransactionsCsv(listedTransactions, { categoriesById, accountsById });
    // DOWNLOAD-FEEDBACK1: só depois do download já ter sido DISPARADO
    // (linha acima) -- nunca antes. Nunca derruba o download em si:
    // createDownloadReadyNotification nunca lança por contrato.
    if (user?.id) {
      void createDownloadReadyNotification(user.id, {
        workspaceId: workspace?.id,
        filename,
        fileType: 'csv',
      });
    }
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
    if (concluindo) return;
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
    if (concluindo) return;
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
      delete payload.metadata;

      for (const id of targetIds) {
        const result = await transactionState.saveTransaction(payload, id);
        if (result.error) {
          setBatchError(result.error);
          return;
        }
      }
      await concludeSave(onEdited && (() => onEdited(editingTransaction)));
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

      let firstInstallment = null;
      for (const payload of payloads) {
        const result = await transactionState.saveTransaction(payload, null);
        if (result.error) {
          setBatchError(result.error);
          return;
        }
        firstInstallment ??= result.data;
      }
      await concludeSave(onCreated && (() => onCreated(firstInstallment)));
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
      const onDone = editingId
        ? onEdited && (() => onEdited(editingTransaction))
        : onCreated && (() => onCreated(result.data));
      await concludeSave(onDone);
    }
  }

  // Depois de salvar. Na folha, com quem receba o resultado, o botão
  // comemora e a folha desce antes (#145); a recarga dos dados corre junto
  // com a comemoração. Sem quem receba, o formulário só é limpo.
  async function concludeSave(onDone) {
    if (!onDone) {
      await onChanged?.();
      resetForm();
      return;
    }
    if (!isSheet) {
      await onChanged?.();
      await onDone();
      return;
    }
    setConcluindo(true);
    try {
      const reload = onChanged?.();
      await celebrarSalvar(saveButtonRef.current);
      try {
        await reload;
      } catch {
        // O salvamento já deu certo: a folha fecha mesmo se a recarga
        // falhar, e a lista se acerta na próxima recarga.
      }
      await fecharFolha(saveButtonRef.current?.closest('[role="dialog"]'));
      await onDone();
    } finally {
      setConcluindo(false);
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
    {/* A confirmação vem antes do Modal da movimentação de propósito. Os
        dois travam a rolagem da página e cada um devolve o valor que achou
        ao abrir. Quando a exclusão fecha os dois no mesmo commit, o React
        desmonta na ordem da árvore. Nesta ordem a confirmação devolve
        primeiro e o Modal da movimentação, por último, libera a rolagem. */}
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
    <Modal
      open={open}
      onClose={handleClose}
      closeOnOverlayClick={!transactionState.isMutating && !isDeleteConfirmOpen}
      closeOnEsc={!transactionState.isMutating && !isDeleteConfirmOpen}
      title={isSheet ? (editingId ? 'Editar movimentação' : 'Nova movimentação') : 'Lançamentos'}
      description={isSheet ? undefined : 'Registre entradas, saídas, transferências e ajustes deste espaço.'}
      size="xl"
      className={cx(styles.transactionDialog, className)}
      overlayClassName={cx(overlayClassName, isSheet && styles.sheetOverlay)}
      data-presentation={presentation}
      aria-hidden={isDeleteConfirmOpen}
      inert={isDeleteConfirmOpen}
      footer={isSheet ? null : (
        <Button variant="ghost" onClick={handleClose} disabled={transactionState.isMutating}>
          Fechar
        </Button>
      )}
    >
      <div className={styles.modalBody}>
        <form className="uf-flex uf-flex-column uf-gap-md" onSubmit={handleSubmit}>
          {duplicateNotice && !editingId ? (
            <FormMessage tone="info">
              Dados copiados de outro lançamento. Revise antes de salvar — a data foi ajustada para hoje.
            </FormMessage>
          ) : null}
          <section className={styles.formBlock} aria-label="Dados principais">
          {isSheet ? (
            <div id="finance-transaction-type">
              <Segmented
                label="Tipo"
                value={form.transaction_type}
                onChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    transaction_type: value,
                    category_id: '',
                    destination_account_id: '',
                  }))
                }
                options={[
                  { value: 'expense', label: 'Saída' },
                  { value: 'income', label: 'Entrada' },
                  ...(hideAccountFields ? [] : [{ value: 'transfer', label: 'Transferência' }]),
                  { value: 'adjustment', label: 'Ajuste' },
                ]}
              />
            </div>
          ) : (
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
          )}
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
          {isPlanned ? (
            <>
              <div className={styles.plannedNotice} role="status">
                <strong>Fica como previsto</strong>
                <span>{PLANNED_EFFECT[form.transaction_type] ?? PLANNED_EFFECT.expense}</span>
              </div>
              <div className={styles.autoConfirmRow}>
                <div className={styles.autoConfirmText}>
                  <span>Confirmar automaticamente na data</span>
                  <small>Use para débito automático.</small>
                </div>
                <Toggle
                  label="Confirmar automaticamente na data"
                  checked={Boolean(form.auto_confirm)}
                  onChange={(checked) => setForm((current) => ({ ...current, auto_confirm: checked }))}
                />
              </div>
            </>
          ) : null}
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

          {isSheet ? (
            <div className={styles.sheetHint}>
              <UniRingOrb size={22} />
              <p>Você também pode tocar na Uni e falar a movimentação.</p>
            </div>
          ) : null}

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
              {editingId && !isSheet ? (
                <Button variant="outline" onClick={resetForm} disabled={transactionState.isMutating}>
                  Cancelar edição
                </Button>
              ) : null}
              <Button
                type="submit"
                loading={transactionState.isMutating}
                disabled={!canSubmit}
                ref={saveButtonRef}
                title={!canManage ? MANAGE_BLOCKED_TITLE : undefined}
              >
                {isSheet ? (
                  <>
                    <span className={styles.saveLabel} data-salvar-rotulo>
                      {isPlanned ? 'Salvar como previsto' : SHEET_SUBMIT_LABELS[form.transaction_type] ?? 'Salvar movimentação'}
                    </span>
                    <span className={styles.saveCheck} data-salvar-check aria-hidden="true">
                      <PhCheckIcon />
                    </span>
                  </>
                ) : editingId ? 'Salvar lançamento' : 'Criar lançamento'}
              </Button>
              {isSheet ? (
                <Button variant="ghost" onClick={handleClose} disabled={transactionState.isMutating}>
                  Cancelar
                </Button>
              ) : null}
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
    </>
  );
}

export default FinanceTransactionModal;
