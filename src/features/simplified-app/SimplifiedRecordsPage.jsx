import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import FilterChips from '../../components/ui/FilterChips/index.js';
import IconBox from '../../components/ui/IconBox/index.js';
import OutlineButton from '../../components/ui/OutlineButton/index.js';
import CategoryCreateModal from '../categories/components/CategoryCreateModal.jsx';
import { CategoryIcon, PlusIcon } from '../categories/categoryIcons.jsx';
import { useAccounts, useCategories, useFinancialBalances, useTransactions, useWorkspaceRole } from '../../hooks/index.js';
import FinanceTransactionModal from '../../pages/financeiro/FinanceTransactionModal.jsx';
import { FINANCIAL_DATA_CHANGED_EVENT, notifyFinancialDataChanged } from '../../services/financialDataEvents.js';
import { formatCurrency } from '../../utils/formatters.js';
import MonthPickerModal from './MonthPickerModal.jsx';
import SimplifiedRecordsMonthChart from './SimplifiedRecordsMonthChart.jsx';
import UpdateBalanceModal from './UpdateBalanceModal.jsx';
import {
  PhCaretLeftIcon,
  PhCaretRightIcon,
  PhMicrophoneIcon,
  PhPlusIcon,
  UniMark,
} from './SimplifiedIcons.jsx';
import {
  buildCategorySummaries,
  filterRecordTransactions,
  formatRelativeTransactionDate,
  getMonthRange,
  summarizeMonth,
} from './simplifiedRecordsData.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedRecords.module.css';

const PAGE_SIZE = 20;
const CATEGORY_PREVIEW_SIZE = 8;
const TRANSACTION_SUCCESS_NOTICE_MS = 2000;
const EMPTY_RECORDS = Object.freeze([]);

const TYPE_FILTER_OPTIONS = Object.freeze([
  { value: 'all', label: 'Todas' },
  { value: 'income', label: 'Entradas' },
  { value: 'expense', label: 'Saídas' },
  { value: 'transfer', label: 'Transferências' },
]);

// Cabeçalho da tela (handoff 04): símbolo de 26px e título 17/500, como o
// header padrão do shell. "Falar com a Uni" continua levando à conversa.
function RecordsHeader({ onTalkToUni }) {
  return (
    <header className={styles.recordsHeader}>
      <div className={styles.recordsTitle}>
        <span className={styles.recordsMark} aria-hidden="true"><UniMark /></span>
        <h1>Financeiro</h1>
      </div>
      <OutlineButton variant="ghost" className={styles.talkButton} onClick={onTalkToUni}>
        <span className={styles.talkIcon} aria-hidden="true"><PhMicrophoneIcon /></span>
        Falar com a Uni
      </OutlineButton>
    </header>
  );
}

function RecordsTabs({ activeTab, onChange }) {
  return (
    <div className={styles.viewTabs} role="tablist" aria-label="Visualização dos registros">
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'summary'}
        className={activeTab === 'summary' ? styles.activeTab : ''}
        onClick={() => onChange('summary')}
      >
        Resumo
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'history'}
        className={activeTab === 'history' ? styles.activeTab : ''}
        onClick={() => onChange('history')}
      >
        Histórico
      </button>
    </div>
  );
}

/** "Outubro de 2026", como no handoff. */
function formatMonthLabel(date) {
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date);
  const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return `${capitalized} de ${date.getFullYear()}`;
}

function shiftMonth(date, delta) {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

// BLOCO REGISTROS iOS: substitui inteiramente o input nativo de mês (Safari
// iOS não abre o seletor de forma confiável) por um modal próprio
// (MonthPickerModal) com a identidade visual da UniFlow. No redesign (#89)
// as setas trocam o mês direto e o toque no nome do mês abre o seletor.
function MonthSelector({ month, onChange }) {
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className={styles.periodNav}>
      <button
        type="button"
        className={styles.periodArrow}
        onClick={() => onChange(shiftMonth(month.date, -1))}
        aria-label="Mês anterior"
      >
        <PhCaretLeftIcon />
      </button>
      <button type="button" className={styles.monthSelector} onClick={() => setPickerOpen(true)}>
        <span>{formatMonthLabel(month.date)}</span>
        <span className={styles.srOnly}>Selecionar mês</span>
      </button>
      <button
        type="button"
        className={styles.periodArrow}
        onClick={() => onChange(shiftMonth(month.date, 1))}
        aria-label="Próximo mês"
      >
        <PhCaretRightIcon />
      </button>
      <MonthPickerModal
        open={pickerOpen}
        initialDate={month.date}
        onApply={(nextDate) => {
          onChange(nextDate);
          setPickerOpen(false);
        }}
        onClose={() => setPickerOpen(false)}
      />
    </div>
  );
}

// Card do mês (handoff 04): Entradas, Saídas e o atalho da Agenda, mais o
// gráfico acumulado. Não existe card público de Saldo.
function MonthlySummary({ onCardClick, summary, transactions, monthRange }) {
  const cards = [
    { id: 'income', label: 'Entradas', value: summary.income, action: 'atualizar as entradas' },
    { id: 'expense', label: 'Saídas', value: summary.expense, action: 'atualizar as saídas' },
    { id: 'agenda', label: 'Agenda', detail: 'Ver compromissos', action: 'abrir a Agenda' },
  ];

  return (
    <section className={styles.monthCard} aria-label="Resumo do mês">
      <div className={styles.summaryCards}>
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            className={`${styles.summaryCard} ${styles[card.id]}`}
            onClick={() => onCardClick(card.id)}
            aria-label={card.id === 'agenda'
              ? `${card.label}: ${card.detail}. Toque para ${card.action}.`
              : `${card.label}: ${formatCurrency(card.value)}. Toque para ${card.action}.`}
          >
            <span aria-hidden="true">{card.label}</span>
            <strong aria-hidden="true">
              {card.id === 'agenda' ? card.detail : formatCurrency(card.value)}
            </strong>
          </button>
        ))}
      </div>
      <SimplifiedRecordsMonthChart transactions={transactions} monthRange={monthRange} />
    </section>
  );
}

function CategoryGrid({
  canCreate,
  categories,
  createTitle,
  expanded,
  onCreate,
  onExpand,
  onSelect,
}) {
  const collapsedCategoryCount = Math.max(0, CATEGORY_PREVIEW_SIZE - 1);
  const visible = expanded ? categories : categories.slice(0, collapsedCategoryCount);

  return (
    <section className={styles.recordsSection} aria-labelledby="records-categories-title">
      <div className={styles.sectionHeading}>
        <h2 id="records-categories-title">Categorias</h2>
        {categories.length > collapsedCategoryCount ? (
          <button type="button" onClick={onExpand}>
            {expanded ? 'Ver menos' : 'Ver todas'}
          </button>
        ) : null}
      </div>
      {visible.length ? (
        <div className={styles.categoryGrid}>
          {visible.map((category) => (
            <button
              key={category.id}
              type="button"
              className={styles.categoryCard}
              onClick={() => onSelect(category.id)}
              aria-label={`${category.name}: ${formatCurrency(category.amount)}, ${category.count} registros`}
            >
              <IconBox className={styles.categoryIcon}>
                <CategoryIcon category={category} />
              </IconBox>
              <strong>{category.name}</strong>
              <b>{formatCurrency(category.amount)}</b>
              <small>{category.count} {category.count === 1 ? 'registro' : 'registros'}</small>
            </button>
          ))}
          <button
            type="button"
            className={`${styles.categoryCard} ${styles.createCategoryCard}`}
            onClick={onCreate}
            disabled={!canCreate}
            title={createTitle}
          >
            <IconBox className={styles.categoryIcon}><PlusIcon /></IconBox>
            <strong>Criar categoria</strong>
            <small>Nome, tipo e ícone</small>
          </button>
        </div>
      ) : (
        <div className={styles.inlineEmpty}>
          <span>Nenhuma categoria disponível neste espaço.</span>
          <OutlineButton variant="secondary" onClick={onCreate} disabled={!canCreate} title={createTitle}>
            <PlusIcon /> Criar categoria
          </OutlineButton>
        </div>
      )}
    </section>
  );
}

// Botão flutuante do handoff: registra uma movimentação de qualquer aba.
function NewRecordAction({ disabled, onClick }) {
  return (
    <button
      type="button"
      className={styles.newRecordAction}
      onClick={onClick}
      disabled={disabled}
      aria-label="Registrar movimentação"
      title={disabled ? 'Aguarde o carregamento das permissões ou cadastre uma conta.' : undefined}
    >
      <PhPlusIcon />
    </button>
  );
}

function HistoryFilters({
  categories,
  filters,
  onChange,
  onClear,
}) {
  const hasFilters = Object.entries(filters).some(([key, value]) => (
    key === 'sort' ? value !== 'recent' : value !== 'all' && value !== ''
  ));

  return (
    <div className={styles.historyFilters} aria-label="Filtros do histórico">
      <label className={styles.searchField}>
        <span className={styles.srOnly}>Buscar por descrição</span>
        <input
          type="search"
          value={filters.query}
          placeholder="Buscar por descrição"
          onChange={(event) => onChange('query', event.target.value)}
        />
      </label>
      <FilterChips
        label="Tipo"
        options={TYPE_FILTER_OPTIONS}
        value={filters.type}
        onChange={(value) => onChange('type', value)}
      />
      <div className={styles.historySelects}>
        <label>
          <span>Categoria</span>
          <select value={filters.categoryId} onChange={(event) => onChange('categoryId', event.target.value)}>
            <option value="all">Todas</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>{category.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Ordenar</span>
          <select value={filters.sort} onChange={(event) => onChange('sort', event.target.value)}>
            <option value="recent">Mais recentes</option>
            <option value="oldest">Mais antigas</option>
          </select>
        </label>
      </div>
      {hasFilters ? (
        <OutlineButton variant="ghost" className={styles.clearFilters} onClick={onClear}>
          Limpar filtros
        </OutlineButton>
      ) : null}
    </div>
  );
}

// BLOCO EXCLUIR FACILITADO: três formas independentes de chegar em
// Editar/Excluir sem precisar entrar no lançamento primeiro -- ícone sempre
// visível (quem não conhece gestos), segurar ~0,5s (mesma ação, sem
// arrastar) e arrastar pra esquerda (gesto comum em listas). As três
// revelam o MESMO par de botões (openRowId identifica qual linha está
// revelada) -- só muda como o usuário chega lá. Toque simples continua
// abrindo o formulário completo (onEdit), como sempre.
const LONG_PRESS_MS = 500;
const SWIPE_REVEAL_PX = 136;
const SWIPE_ACTIVATE_PX = 40;
const DIRECTION_LOCK_PX = 8;

function TransactionRow({
  canDelete,
  categoryPresentation,
  isConfirmingDelete,
  isOpen,
  onCancelDelete,
  onClose,
  onConfirmDelete,
  onEdit,
  onOpen,
  onRequestDelete,
  transaction,
}) {
  const [dragX, setDragX] = useState(0);
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  const dragStateRef = useRef(null);
  const longPressTimerRef = useRef(null);

  // O painel de ações pode ser fechado de fora (outra linha abriu, edição
  // cancelada etc.) -- sem isso, dragX ficava travado no último valor do
  // gesto e a linha continuava aparecendo deslocada mesmo com isOpen=false.
  // Ajuste durante o render (não em efeito) -- mesmo padrão recomendado
  // pelo React para "resetar estado quando uma prop muda", evita o
  // cascading render de um setState dentro de useEffect.
  if (isOpen !== prevIsOpen) {
    setPrevIsOpen(isOpen);
    setDragX(isOpen ? -SWIPE_REVEAL_PX : 0);
  }

  const isIncome = transaction.transaction_type === 'income';
  const isTransfer = transaction.transaction_type === 'transfer';
  // BLOCO FINAL DO MVP (Saldo manual): "adjustment" pode ser positivo ou
  // negativo -- ao contrário de income/expense, o sinal correto vem de
  // adjustment_delta, nunca do tipo sozinho.
  const isPositiveAdjustment = transaction.transaction_type === 'adjustment'
    && Number(transaction.adjustment_delta) > 0;

  function clearLongPressTimer() {
    if (longPressTimerRef.current) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  function handlePointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    dragStateRef.current = { x: event.clientX, y: event.clientY, locked: null };
    // Já aberta: não dispara long-press de novo (não há nada a "abrir"),
    // só o arrastar-de-volta cuida de fechar.
    if (isOpen) return;
    clearLongPressTimer();
    longPressTimerRef.current = window.setTimeout(() => {
      longPressTimerRef.current = null;
      dragStateRef.current = null;
      setDragX(0);
      onOpen();
    }, LONG_PRESS_MS);
  }

  function handlePointerMove(event) {
    const drag = dragStateRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;

    if (!drag.locked) {
      if (Math.abs(dx) < DIRECTION_LOCK_PX && Math.abs(dy) < DIRECTION_LOCK_PX) return;
      // Movimento vertical: é rolagem normal da página, nunca arrastar --
      // solta o gesto por completo (nunca disputa o scroll com o navegador).
      drag.locked = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (drag.locked === 'y') {
        clearLongPressTimer();
        dragStateRef.current = null;
        return;
      }
    }
    if (drag.locked !== 'x') return;

    clearLongPressTimer();
    event.preventDefault();
    // Parte do ponto já revelado (-SWIPE_REVEAL_PX) quando a linha já está
    // aberta -- é isso que permite arrastar de volta pra direita e fechar.
    const baseX = isOpen ? -SWIPE_REVEAL_PX : 0;
    setDragX(Math.max(-SWIPE_REVEAL_PX, Math.min(0, baseX + dx)));
  }

  function handlePointerUp() {
    clearLongPressTimer();
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (!drag) return; // já virou toque simples (onClick do botão cuida) ou já abriu por long-press.
    if (drag.locked !== 'x') return;

    if (isOpen) {
      // Arrastou de volta o suficiente pra direita: fecha. Senão, permanece
      // aberta (o painel nunca fica "meio revelado" parado).
      if (dragX >= -SWIPE_REVEAL_PX + SWIPE_ACTIVATE_PX) {
        setDragX(0);
        onClose();
      } else {
        setDragX(-SWIPE_REVEAL_PX);
      }
    } else if (dragX <= -SWIPE_ACTIVATE_PX) {
      setDragX(-SWIPE_REVEAL_PX);
      onOpen();
    } else {
      setDragX(0);
    }
  }

  function handlePointerCancel() {
    clearLongPressTimer();
    dragStateRef.current = null;
    setDragX(isOpen ? -SWIPE_REVEAL_PX : 0);
  }


  return (
    <div className={styles.transactionRowWrapper}>
      {isOpen ? (
        <div className={styles.transactionRowActions}>
          {isConfirmingDelete ? (
            <>
              <button type="button" className={styles.rowActionNeutral} onClick={onCancelDelete}>
                Cancelar
              </button>
              <button type="button" className={styles.rowActionDanger} onClick={onConfirmDelete}>
                Confirmar
              </button>
            </>
          ) : (
            <>
              <button type="button" className={styles.rowActionNeutral} onClick={() => onEdit(transaction)}>
                Editar
              </button>
              <button
                type="button"
                className={styles.rowActionDanger}
                onClick={onRequestDelete}
                disabled={!canDelete}
                title={!canDelete ? 'Você não possui permissão para excluir este lançamento.' : undefined}
              >
                Excluir
              </button>
            </>
          )}
        </div>
      ) : null}
      <button
        type="button"
        className={styles.transactionRow}
        style={dragX ? { transform: `translateX(${dragX}px)` } : undefined}
        onClick={() => { if (isOpen) { onClose(); } else { onEdit(transaction); } }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        aria-label={`${transaction.description}, ${formatCurrency(transaction.amount)}. Toque para editar, segure ou arraste para mais opções.`}
      >
        <IconBox className={`${styles.transactionIcon} ${isIncome || isPositiveAdjustment ? styles.transactionIconIncome : ''}`}>
          <CategoryIcon category={{
            name: categoryPresentation?.name,
            category_type: isTransfer ? 'transfer' : transaction.transaction_type,
            icon: categoryPresentation?.icon,
          }} />
        </IconBox>
        <span className={styles.transactionMain}>
          <strong>{transaction.description || categoryPresentation?.name || 'Outros'}</strong>
          <small>
            {`${formatRelativeTransactionDate(transaction.transaction_date)} · ${categoryPresentation?.name ?? 'Outros'}`}
          </small>
        </span>
        <b className={isIncome || isPositiveAdjustment ? styles.positiveAmount : isTransfer ? styles.transferAmount : styles.negativeAmount}>
          {isIncome || isPositiveAdjustment ? '+' : isTransfer ? '' : '-'} {formatCurrency(transaction.amount)}
        </b>
        <button
          type="button"
          className={styles.rowMenuIcon}
          aria-label="Mais opções"
          onClick={(event) => {
            event.stopPropagation();
            if (isOpen) { onClose(); } else { onOpen(); }
          }}
        >
          ⋮
        </button>
      </button>
    </div>
  );
}

function TransactionList({
  canDeleteTransaction = () => true,
  categories,
  emptyMessage,
  onDelete,
  onEdit,
  onShowAll,
  showAllAction,
  transactions,
  visibleCount,
}) {
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const visible = transactions.slice(0, visibleCount);
  const [openRowId, setOpenRowId] = useState(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  function closeRow() {
    setOpenRowId(null);
    setConfirmDeleteId(null);
  }

  function handleRequestDelete(transaction) {
    // Lançamento parcelado exige escolher o escopo (só esta / esta e as
    // próximas / todas) -- essa decisão só existe no formulário completo
    // (FinanceTransactionModal), nunca aqui. A exclusão rápida só cobre o
    // caso simples (lançamento avulso).
    if (transaction.metadata?.installment_group_id) {
      closeRow();
      onEdit(transaction);
      return;
    }
    setConfirmDeleteId(transaction.id);
  }

  async function handleConfirmDelete(transaction) {
    await onDelete(transaction);
    closeRow();
  }

  return (
    <section className={styles.recordsSection} aria-labelledby="recent-transactions-title">
      <div className={styles.sectionHeading}>
        <h2 id="recent-transactions-title">
          {showAllAction ? 'Transações recentes' : 'Histórico'}
        </h2>
        {showAllAction && transactions.length ? (
          <button type="button" onClick={onShowAll}>Ver todas</button>
        ) : null}
      </div>
      {visible.length ? (
        <div className={styles.transactionList}>
          {visible.map((transaction) => {
            const isTransfer = transaction.transaction_type === 'transfer';
            const category = categoryMap.get(transaction.category_id);
            const categoryPresentation = buildCategorySummaries(
              category ? [category] : [],
              category ? [transaction] : [],
            )[0];

            return (
              <TransactionRow
                key={transaction.id}
                canDelete={canDeleteTransaction(transaction)}
                categoryPresentation={
                  categoryPresentation
                    ? { ...categoryPresentation, name: category?.name ?? (isTransfer ? 'Transferência' : 'Outros') }
                    : { name: isTransfer ? 'Transferência' : 'Outros' }
                }
                isConfirmingDelete={confirmDeleteId === transaction.id}
                isOpen={openRowId === transaction.id}
                onCancelDelete={() => setConfirmDeleteId(null)}
                onClose={closeRow}
                onConfirmDelete={() => handleConfirmDelete(transaction)}
                onEdit={(item) => { closeRow(); onEdit(item); }}
                onOpen={() => setOpenRowId(transaction.id)}
                onRequestDelete={() => handleRequestDelete(transaction)}
                transaction={transaction}
              />
            );
          })}
        </div>
      ) : (
        <div className={styles.inlineEmpty}>{emptyMessage}</div>
      )}
    </section>
  );
}

const EMPTY_FILTERS = Object.freeze({
  query: '',
  type: 'all',
  categoryId: 'all',
  sort: 'recent',
});

function SimplifiedRecordsPage() {
  const navigate = useNavigate();
  const { user, workspace } = useSession();
  const [activeTab, setActiveTab] = useState('summary');
  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [transactionDialog, setTransactionDialog] = useState(null);
  const [categoryCreateOpen, setCategoryCreateOpen] = useState(false);
  const [transactionSuccessNotice, setTransactionSuccessNotice] = useState(null);
  const transactionNoticeTimerRef = useRef(null);
  // Somente Entradas/Saídas abrem o ajuste financeiro. O terceiro card
  // reutiliza a Agenda já existente, sem duplicar calendário ou dados.
  const [summaryModalTarget, setSummaryModalTarget] = useState(null);
  const [isOnline, setIsOnline] = useState(() => (
    typeof navigator === 'undefined' ? true : navigator.onLine
  ));
  const month = useMemo(() => getMonthRange(selectedMonth), [selectedMonth]);
  const accountState = useAccounts({
    workspaceId: workspace?.id,
    fallbackAccounts: EMPTY_RECORDS,
    fallbackAccountTypes: EMPTY_RECORDS,
  });
  // SUPORTE1/Registros: a experiencia simplificada e exclusivamente Pessoal
  // (nao ha variante Business/Enterprise dela) -- o contexto de categoria e
  // sempre 'personal', nunca herdado de access.currentWorkspace (que reflete
  // o ultimo workspace ativo da conta e pode ser 'business' para contas que
  // ja usaram o app legado). Forcar 'personal' aqui e o que garante que
  // categorias empresariais (Comissao, Contratos, Fornecedores, Impostos,
  // Folha, Equipamentos) nunca apareçam nesta tela.
  const categoryState = useCategories({
    workspaceId: workspace?.id,
    context: 'personal',
  });
  const transactionState = useTransactions({
    workspaceId: workspace?.id,
    dateFrom: month.dateFrom,
    dateTo: month.dateTo,
    status: 'completed',
  });
  const balanceState = useFinancialBalances({ workspaceId: workspace?.id });
  const workspaceRole = useWorkspaceRole({
    workspaceId: workspace?.id,
    ownerUserId: workspace?.owner_user_id,
    userId: user?.id,
  });

  const refresh = useCallback(() => {
    notifyFinancialDataChanged('simplified-records');
    return Promise.all([
      accountState.refresh(),
      categoryState.refresh(),
      transactionState.refresh(),
      balanceState.refresh(),
    ]);
  }, [accountState, balanceState, categoryState, transactionState]);

  useEffect(() => {
    const handleDataChanged = (event) => {
      if (event.detail?.source === 'simplified-records') return;
      void Promise.all([
        accountState.refresh(),
        categoryState.refresh(),
        transactionState.refresh(),
        balanceState.refresh(),
      ]);
    };
    window.addEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
    return () => window.removeEventListener(FINANCIAL_DATA_CHANGED_EVENT, handleDataChanged);
  }, [accountState, balanceState, categoryState, transactionState]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => () => {
    if (transactionNoticeTimerRef.current) window.clearTimeout(transactionNoticeTimerRef.current);
  }, []);

  const summary = useMemo(
    () => summarizeMonth(transactionState.transactions, balanceState.workspaceBalance),
    [balanceState.workspaceBalance, transactionState.transactions],
  );
  const categorySummaries = useMemo(
    () => buildCategorySummaries(categoryState.categories, transactionState.transactions),
    [categoryState.categories, transactionState.transactions],
  );
  const filteredTransactions = useMemo(
    () => filterRecordTransactions(transactionState.transactions, filters),
    [filters, transactionState.transactions],
  );
  const accountsWithDerivedBalance = useMemo(() => {
    const balanceMap = new Map(
      balanceState.accountBalances.map((balance) => [balance.account_id, balance.derived_balance]),
    );
    return accountState.accounts.map((account) => ({
      ...account,
      derived_balance: Number(balanceMap.get(account.id) ?? account.initial_balance ?? 0),
    }));
  }, [accountState.accounts, balanceState.accountBalances]);
  const displayAccountState = useMemo(() => ({
    ...accountState,
    accounts: accountsWithDerivedBalance,
    activeAccounts: accountsWithDerivedBalance.filter((account) => account.is_active !== false),
  }), [accountState, accountsWithDerivedBalance]);

  const error = accountState.error
    ?? categoryState.error
    ?? transactionState.error
    ?? balanceState.error
    ?? workspaceRole.error;
  const isLoading = accountState.isLoading
    || categoryState.isLoading
    || transactionState.isLoading
    || balanceState.isLoading
    || workspaceRole.isLoading;
  const canManage = workspaceRole.canUpdate === true
    && !workspaceRole.isLoading
    && !transactionState.isMutating;
  const canCreateCategory = workspaceRole.canUpdate === true
    && !workspaceRole.isLoading
    && !categoryState.isMutating;
  const canDeleteTransaction = (transaction) => (
    workspaceRole.canDelete === true || transaction?.created_by === user?.id
  );

  // BLOCO EXCLUIR FACILITADO: exclusão direta na lista "Transações recentes"
  // (segurar, arrastar ou o ícone sempre visível -- ver TransactionRow),
  // sem precisar abrir o formulário completo primeiro. Só cobre o caso
  // simples (lançamento avulso, sem parcelamento) -- um lançamento com
  // parcelas exige escolher o escopo (só esta / esta e as próximas / todas),
  // que continua vivendo exclusivamente no formulário completo
  // (FinanceTransactionModal, já reaproveitado via onEditFull abaixo).
  async function handleQuickDelete(transaction) {
    if (transactionState.isMutating || !canDeleteTransaction(transaction)) return;
    const result = await transactionState.removeTransaction(transaction.id);
    if (!result.error) await refresh();
  }

  function completeTransactionMutation(message) {
    setTransactionDialog(null);
    setActiveTab('history');
    setVisibleCount(PAGE_SIZE);
    setTransactionSuccessNotice(message);
    if (transactionNoticeTimerRef.current) window.clearTimeout(transactionNoticeTimerRef.current);
    transactionNoticeTimerRef.current = window.setTimeout(() => {
      transactionNoticeTimerRef.current = null;
      setTransactionSuccessNotice(null);
    }, TRANSACTION_SUCCESS_NOTICE_MS);
  }

  function showCategorySuccessNotice() {
    setTransactionSuccessNotice('Categoria criada com sucesso.');
    if (transactionNoticeTimerRef.current) window.clearTimeout(transactionNoticeTimerRef.current);
    transactionNoticeTimerRef.current = window.setTimeout(() => {
      transactionNoticeTimerRef.current = null;
      setTransactionSuccessNotice(null);
    }, TRANSACTION_SUCCESS_NOTICE_MS);
  }

  function handleTransactionDeleted() {
    completeTransactionMutation('Lançamento excluído com sucesso.');
  }

  function handleTransactionEdited() {
    completeTransactionMutation('Lançamento editado com sucesso.');
  }

  function selectCategory(categoryId) {
    setFilters({ ...EMPTY_FILTERS, categoryId });
    setVisibleCount(PAGE_SIZE);
    setActiveTab('history');
  }

  function getCreateCategoryTitle() {
    if (!workspace?.id) return 'Selecione um espaço de trabalho.';
    if (workspaceRole.isLoading) return 'Carregando permissões...';
    if (workspaceRole.canUpdate !== true) {
      return 'Você não tem permissão para criar categorias neste workspace.';
    }
    if (categoryState.isMutating) return 'Aguarde a operação atual terminar.';
    return 'Criar uma nova categoria.';
  }

  function openCategoryCreate() {
    if (!canCreateCategory) return;
    categoryState.clearError?.();
    setCategoryCreateOpen(true);
  }

  async function handleCreateCategory(values) {
    if (!canCreateCategory) return;
    const result = await categoryState.saveCategory(values);
    if (!result.error) {
      await refresh();
      setShowAllCategories(true);
      setCategoryCreateOpen(false);
      showCategorySuccessNotice();
    }
  }

  // CONTA-OPCIONAL: receita/despesa não exigem mais nenhuma conta cadastrada
  // -- só bloqueia por permissão, nunca por "ainda não tem conta".
  function openNewTransaction() {
    if (!canManage) return;
    setTransactionDialog({ type: 'expense', transactionId: null });
  }

  function openSummaryCard(target) {
    if (target === 'agenda') {
      navigate(SIMPLIFIED_ROUTES.AGENDA);
      return;
    }
    if (!canManage) return;
    setSummaryModalTarget(target);
  }

  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
    setVisibleCount(PAGE_SIZE);
  }

  function changeMonth(nextMonth) {
    setSelectedMonth(nextMonth);
    setVisibleCount(PAGE_SIZE);
  }

  const recentTransactions = filterRecordTransactions(
    transactionState.transactions,
    EMPTY_FILTERS,
  );

  return (
    <>
      {transactionSuccessNotice ? (
        <div className={styles.transactionSuccessToast} role="status" aria-live="polite">
          <span aria-hidden="true">✓</span>
          {transactionSuccessNotice}
        </div>
      ) : null}
      <div className={styles.recordsPage} data-simplified-records>
        <RecordsHeader onTalkToUni={() => navigate(SIMPLIFIED_ROUTES.UNI)} />

        <div className={styles.periodBlock}>
          <RecordsTabs activeTab={activeTab} onChange={setActiveTab} />
          <MonthSelector month={month} onChange={changeMonth} />
        </div>

        <section className={styles.monthSection} aria-labelledby="month-summary-title">
          <h2 id="month-summary-title" className={styles.srOnly}>Resumo do mês</h2>

          {!isOnline ? (
            <div className={styles.stateCard} role="status">
              Você está offline. Mostrando os últimos dados disponíveis.
            </div>
          ) : null}

          {isLoading ? (
            <div className={styles.loadingState} aria-busy="true" aria-label="Carregando registros">
              {Array.from({ length: 3 }, (_, index) => <span key={index} />)}
            </div>
          ) : error ? (
            <div className={styles.stateCard} role="alert">
              <strong>Não foi possível carregar seus registros.</strong>
              <span>Tente novamente em instantes.</span>
              <button type="button" onClick={() => void refresh()}>Tentar novamente</button>
            </div>
          ) : (
            <>
              {activeTab === 'summary' ? (
                <>
                  <MonthlySummary
                    summary={summary}
                    onCardClick={openSummaryCard}
                    transactions={transactionState.transactions}
                    monthRange={month}
                  />
                  <TransactionList
                    categories={categoryState.categories}
                    emptyMessage="Ainda não há registros neste mês."
                    onEdit={(transaction) => setTransactionDialog({
                      type: transaction.transaction_type,
                      transactionId: transaction.id,
                    })}
                    onDelete={handleQuickDelete}
                    canDeleteTransaction={canDeleteTransaction}
                    onShowAll={() => setActiveTab('history')}
                    showAllAction
                    transactions={recentTransactions}
                    visibleCount={4}
                  />
                  <CategoryGrid
                    canCreate={canCreateCategory}
                    categories={categorySummaries}
                    createTitle={getCreateCategoryTitle()}
                    expanded={showAllCategories}
                    onCreate={openCategoryCreate}
                    onExpand={() => setShowAllCategories((current) => !current)}
                    onSelect={selectCategory}
                  />
                </>
              ) : (
                <>
                  <HistoryFilters
                    categories={categoryState.categories}
                    filters={filters}
                    onChange={updateFilter}
                    onClear={() => {
                      setFilters(EMPTY_FILTERS);
                      setVisibleCount(PAGE_SIZE);
                    }}
                  />
                  <TransactionList
                    categories={categoryState.categories}
                    emptyMessage={transactionState.transactions.length
                      ? 'Nenhum registro corresponde aos filtros.'
                      : 'Ainda não há registros neste mês.'}
                    onEdit={(transaction) => setTransactionDialog({
                      type: transaction.transaction_type,
                      transactionId: transaction.id,
                    })}
                    onDelete={handleQuickDelete}
                    canDeleteTransaction={canDeleteTransaction}
                    showAllAction={false}
                    transactions={filteredTransactions}
                    visibleCount={visibleCount}
                  />
                  {filteredTransactions.length > visibleCount ? (
                    <OutlineButton
                      variant="secondary"
                      className={styles.loadMore}
                      onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                    >
                      Carregar mais
                    </OutlineButton>
                  ) : null}
                </>
              )}
            </>
          )}
        </section>

        <NewRecordAction
          disabled={!canManage}
          onClick={openNewTransaction}
        />
      </div>

      <FinanceTransactionModal
        key={`simplified-record-${transactionDialog?.type ?? 'closed'}-${transactionDialog?.transactionId ?? 'new'}`}
        open={Boolean(transactionDialog)}
        onClose={() => setTransactionDialog(null)}
        onChanged={refresh}
        onDeleted={handleTransactionDeleted}
        onEdited={handleTransactionEdited}
        initialType={transactionDialog?.type ?? 'expense'}
        editingTransactionId={transactionDialog?.transactionId ?? null}
        canManage={canManage}
        canDeleteTransaction={canDeleteTransaction}
        hideAccountFields
        showExistingList={false}
        presentation="sheet"
        accountState={displayAccountState}
        categoryState={categoryState}
        transactionState={transactionState}
        className={styles.transactionDialogDark}
        overlayClassName={styles.darkOverlay}
      />

      <CategoryCreateModal
        open={categoryCreateOpen}
        onClose={() => {
          categoryState.clearError?.();
          setCategoryCreateOpen(false);
        }}
        defaultType="expense"
        categories={categoryState.categories}
        onCreate={handleCreateCategory}
        isMutating={categoryState.isMutating}
        serverError={categoryCreateOpen && categoryState.error ? categoryState.error.message : ''}
        className={styles.transactionDialogDark}
        overlayClassName={styles.darkOverlay}
      />

      <UpdateBalanceModal
        key={summaryModalTarget ?? 'summary-modal-closed'}
        target={summaryModalTarget ?? 'income'}
        open={Boolean(summaryModalTarget)}
        onClose={() => setSummaryModalTarget(null)}
        onChanged={refresh}
        currentValue={
          summaryModalTarget === 'income'
            ? summary.income
            : summary.expense
        }
      />
    </>
  );
}

export default SimplifiedRecordsPage;
