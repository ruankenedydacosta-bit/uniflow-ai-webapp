import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSession } from '../../app/SessionContext.jsx';
import { useAccounts, useCategories, useFinancialBalances, useTransactions, useWorkspaceRole } from '../../hooks/index.js';
import FinanceTransactionModal from '../../pages/financeiro/FinanceTransactionModal.jsx';
import { FINANCIAL_DATA_CHANGED_EVENT, notifyFinancialDataChanged } from '../../services/financialDataEvents.js';
import { formatCurrency } from '../../utils/formatters.js';
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CalendarIcon,
  ListIcon,
  MicIcon,
  PieChartIcon,
  UniMark,
  WalletIcon,
} from './SimplifiedIcons.jsx';
import {
  buildCategorySummaries,
  dateFromMonthInput,
  filterRecordTransactions,
  formatRelativeTransactionDate,
  getMonthRange,
  summarizeMonth,
} from './simplifiedRecordsData.js';
import { ACCOUNT_SUBROUTES, ACCOUNT_SUBROUTE_IDS } from './simplifiedAccountRoutes.js';
import { SIMPLIFIED_ROUTES } from './simplifiedRoutes.js';
import styles from './simplifiedRecords.module.css';

const PAGE_SIZE = 20;
const CATEGORY_PREVIEW_SIZE = 8;
const EMPTY_RECORDS = Object.freeze([]);

function RecordsIcon({ name }) {
  const paths = {
    account: <><rect x="5" y="8" width="22" height="17" rx="3" /><path d="M5 13h22M10 20h5" /></>,
    custom: <><circle cx="16" cy="16" r="10" /><path d="M11 16h10M16 11v10" /></>,
    education: <><path d="m4 12 12-6 12 6-12 6Z" /><path d="M8 15v7c5 3 11 3 16 0v-7" /></>,
    food: <><path d="M9 4v9M6 4v5c0 3 6 3 6 0V4M9 13v15" /><path d="M21 4c-4 5-3 11 1 12v12" /></>,
    health: <><path d="M5 17h6l2-6 5 12 3-6h6" /><path d="M16 28C4 21 3 10 9 6c4-2 7 1 7 1s3-3 7-1c7 4 5 15-7 22Z" /></>,
    home: <><path d="m4 15 12-10 12 10v13h-8v-8h-8v8H4Z" /></>,
    leisure: <><circle cx="16" cy="16" r="11" /><path d="M11 14h.1M21 14h.1M11 20c3 3 7 3 10 0" /></>,
    other: <><circle cx="9" cy="16" r="2" /><circle cx="16" cy="16" r="2" /><circle cx="23" cy="16" r="2" /></>,
    subscription: <><rect x="4" y="7" width="24" height="18" rx="3" /><path d="M4 13h24M9 20h5" /></>,
    transport: <><path d="M7 12h18l2 7v7H5v-7Z" /><path d="m9 12 2-5h10l2 5" /><circle cx="9" cy="23" r="2" /><circle cx="23" cy="23" r="2" /></>,
  };

  return (
    <svg viewBox="0 0 32 32" aria-hidden="true">
      {paths[name] ?? paths.custom}
    </svg>
  );
}

function RecordsHeader({ onTalkToUni }) {
  return (
    <header className={styles.recordsHeader}>
      <div className={styles.recordsTitle}>
        <span className={styles.recordsMark}><UniMark /></span>
        <h1>Registros</h1>
      </div>
      <button className={styles.talkButton} type="button" onClick={onTalkToUni}>
        <span className={styles.talkIcon} aria-hidden="true"><MicIcon /></span>
        Falar com a Uni
      </button>
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
        <span aria-hidden="true"><PieChartIcon /></span>
        Resumo
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeTab === 'history'}
        className={activeTab === 'history' ? styles.activeTab : ''}
        onClick={() => onChange('history')}
      >
        <span aria-hidden="true"><ListIcon /></span>
        Histórico
      </button>
    </div>
  );
}

function formatMonthLabel(date) {
  const monthName = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(date);
  const capitalized = monthName.charAt(0).toUpperCase() + monthName.slice(1);
  return `${capitalized}/${date.getFullYear()}`;
}

function MonthSelector({ month, onChange }) {
  const inputRef = useRef(null);

  function openPicker() {
    if (typeof inputRef.current?.showPicker === 'function') {
      inputRef.current.showPicker();
    } else {
      inputRef.current?.focus();
    }
  }

  return (
    <button type="button" className={styles.monthSelector} onClick={openPicker}>
      <span className={styles.monthIcon} aria-hidden="true"><CalendarIcon /></span>
      <span>{formatMonthLabel(month.date)}</span>
      <span className={styles.srOnly}>Selecionar mês</span>
      <input
        ref={inputRef}
        className={styles.monthNativeInput}
        type="month"
        tabIndex={-1}
        aria-hidden="true"
        value={month.inputValue}
        max={getMonthRange(new Date()).inputValue}
        onChange={(event) => onChange(dateFromMonthInput(event.target.value))}
      />
    </button>
  );
}

function MonthlySummary({ summary }) {
  const cards = [
    { id: 'income', label: 'Receitas', value: summary.income, Icon: ArrowDownIcon },
    { id: 'expense', label: 'Despesas', value: summary.expense, Icon: ArrowUpIcon },
    { id: 'balance', label: 'Saldo', value: summary.balance, Icon: WalletIcon },
  ];

  return (
    <div className={styles.summaryCards}>
      {cards.map((card) => (
        <article key={card.id} className={`${styles.summaryCard} ${styles[card.id]}`}>
          <div>
            <span className={styles.summaryIcon} aria-hidden="true"><card.Icon /></span>
            <h3>{card.label}</h3>
          </div>
          <strong aria-label={`${card.label}: ${formatCurrency(card.value)}`}>
            {formatCurrency(card.value)}
          </strong>
        </article>
      ))}
    </div>
  );
}

function CategoryGrid({ categories, expanded, onExpand, onSelect }) {
  const visible = expanded ? categories : categories.slice(0, CATEGORY_PREVIEW_SIZE);

  return (
    <section className={styles.recordsSection} aria-labelledby="records-categories-title">
      <div className={styles.sectionHeading}>
        <h2 id="records-categories-title">Categorias</h2>
        {categories.length > CATEGORY_PREVIEW_SIZE ? (
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
              className={`${styles.categoryCard} ${styles[`tone${category.tone}`]}`}
              onClick={() => onSelect(category.id)}
              aria-label={`${category.name}: ${formatCurrency(category.amount)}, ${category.count} registros`}
            >
              <span className={styles.categoryIcon}><RecordsIcon name={category.icon} /></span>
              <strong>{category.name}</strong>
              <b>{formatCurrency(category.amount)}</b>
              <small>{category.count} {category.count === 1 ? 'registro' : 'registros'}</small>
            </button>
          ))}
        </div>
      ) : (
        <div className={styles.inlineEmpty}>Nenhuma categoria disponível neste espaço.</div>
      )}
    </section>
  );
}

function NewRecordAction({ disabled, onClick }) {
  return (
    <button
      type="button"
      className={styles.newRecordAction}
      onClick={onClick}
      disabled={disabled}
      title={disabled ? 'Aguarde o carregamento das permissões ou cadastre uma conta.' : undefined}
    >
      <span className={styles.newRecordIcon} aria-hidden="true">+</span>
      <span>
        <strong>Novo registro</strong>
        <small>Adicionar receita ou despesa</small>
      </span>
      <b aria-hidden="true">›</b>
    </button>
  );
}

function HistoryFilters({
  accounts,
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
      <label>
        <span>Tipo</span>
        <select value={filters.type} onChange={(event) => onChange('type', event.target.value)}>
          <option value="all">Todas</option>
          <option value="income">Receitas</option>
          <option value="expense">Despesas</option>
          <option value="transfer">Transferências</option>
        </select>
      </label>
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
        <span>Conta</span>
        <select value={filters.accountId} onChange={(event) => onChange('accountId', event.target.value)}>
          <option value="all">Todas</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>{account.name}</option>
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
      {hasFilters ? (
        <button className={styles.clearFilters} type="button" onClick={onClear}>
          Limpar filtros
        </button>
      ) : null}
    </div>
  );
}

function TransactionList({
  accounts,
  categories,
  emptyMessage,
  onEdit,
  onShowAll,
  showAllAction,
  transactions,
  visibleCount,
}) {
  const accountMap = new Map(accounts.map((account) => [account.id, account]));
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const visible = transactions.slice(0, visibleCount);

  return (
    <section className={styles.recordsSection} aria-labelledby="recent-transactions-title">
      <div className={styles.sectionHeading}>
        <h2 id="recent-transactions-title">
          {showAllAction ? 'Últimos lançamentos' : 'Histórico'}
        </h2>
        {showAllAction && transactions.length ? (
          <button type="button" onClick={onShowAll}>Ver todas</button>
        ) : null}
      </div>
      {visible.length ? (
        <div className={styles.transactionList}>
          {visible.map((transaction) => {
            const isIncome = transaction.transaction_type === 'income';
            const isTransfer = transaction.transaction_type === 'transfer';
            const category = categoryMap.get(transaction.category_id);
            const categoryKey = category?.name ?? (isTransfer ? 'Transferência' : 'Outros');
            const categoryPresentation = buildCategorySummaries(
              category ? [category] : [],
              category ? [transaction] : [],
            )[0];

            return (
              <button
                key={transaction.id}
                type="button"
                className={styles.transactionRow}
                onClick={() => onEdit(transaction)}
                aria-label={`Editar ${transaction.description}, ${formatCurrency(transaction.amount)}`}
              >
                <span className={`${styles.transactionIcon} ${styles[`tone${categoryPresentation?.tone ?? 'gray'}`]}`}>
                  <RecordsIcon name={categoryPresentation?.icon ?? (isTransfer ? 'account' : 'other')} />
                </span>
                <span className={styles.transactionMain}>
                  <strong>{transaction.description || categoryKey}</strong>
                  <small>
                    {formatRelativeTransactionDate(transaction.transaction_date)}
                    {' • '}
                    {accountMap.get(transaction.account_id)?.name ?? 'Conta não disponível'}
                  </small>
                </span>
                <b className={isIncome ? styles.positiveAmount : isTransfer ? styles.transferAmount : styles.negativeAmount}>
                  {isIncome ? '+' : isTransfer ? '' : '-'} {formatCurrency(transaction.amount)}
                </b>
                <span className={styles.chevron} aria-hidden="true">›</span>
              </button>
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
  accountId: 'all',
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
  const canDeleteTransaction = (transaction) => (
    workspaceRole.canDelete === true || transaction?.created_by === user?.id
  );

  function selectCategory(categoryId) {
    setFilters({ ...EMPTY_FILTERS, categoryId });
    setVisibleCount(PAGE_SIZE);
    setActiveTab('history');
  }

  function openNewTransaction() {
    if (!canManage || !accountState.activeAccounts.length) return;
    setTransactionDialog({ type: 'expense', transactionId: null });
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
      <div className={styles.recordsPage} data-simplified-records>
        <RecordsHeader onTalkToUni={() => navigate(SIMPLIFIED_ROUTES.UNI)} />
        <RecordsTabs activeTab={activeTab} onChange={setActiveTab} />

        <section className={styles.monthSection} aria-labelledby="month-summary-title">
          <div className={styles.sectionHeading}>
            <h2 id="month-summary-title">Resumo do mês</h2>
            <MonthSelector month={month} onChange={changeMonth} />
          </div>

          {!isOnline ? (
            <div className={styles.stateCard} role="status">
              Você está offline. Mostrando os últimos dados disponíveis.
            </div>
          ) : null}

          {isLoading ? (
            <div className={styles.loadingState} aria-busy="true" aria-label="Carregando registros">
              {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
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
                  <MonthlySummary summary={summary} />
                  <CategoryGrid
                    categories={categorySummaries}
                    expanded={showAllCategories}
                    onExpand={() => setShowAllCategories((current) => !current)}
                    onSelect={selectCategory}
                  />
                  <NewRecordAction
                    disabled={!canManage || !accountState.activeAccounts.length}
                    onClick={openNewTransaction}
                  />
                  {!accountState.activeAccounts.length ? (
                    <div className={styles.accountNotice}>
                      Para adicionar seu primeiro registro, crie uma conta no Financeiro.
                      <button
                        type="button"
                        onClick={() => navigate(ACCOUNT_SUBROUTES[ACCOUNT_SUBROUTE_IDS.MY_ACCOUNTS].path)}
                      >
                        Gerenciar contas
                      </button>
                    </div>
                  ) : null}
                  <TransactionList
                    accounts={accountState.accounts}
                    categories={categoryState.categories}
                    emptyMessage="Ainda não há registros neste mês."
                    onEdit={(transaction) => setTransactionDialog({
                      type: transaction.transaction_type,
                      transactionId: transaction.id,
                    })}
                    onShowAll={() => setActiveTab('history')}
                    showAllAction
                    transactions={recentTransactions}
                    visibleCount={4}
                  />
                </>
              ) : (
                <>
                  <HistoryFilters
                    accounts={accountState.accounts}
                    categories={categoryState.categories}
                    filters={filters}
                    onChange={updateFilter}
                    onClear={() => {
                      setFilters(EMPTY_FILTERS);
                      setVisibleCount(PAGE_SIZE);
                    }}
                  />
                  <TransactionList
                    accounts={accountState.accounts}
                    categories={categoryState.categories}
                    emptyMessage={transactionState.transactions.length
                      ? 'Nenhum registro corresponde aos filtros.'
                      : 'Ainda não há registros neste mês.'}
                    onEdit={(transaction) => setTransactionDialog({
                      type: transaction.transaction_type,
                      transactionId: transaction.id,
                    })}
                    showAllAction={false}
                    transactions={filteredTransactions}
                    visibleCount={visibleCount}
                  />
                  {filteredTransactions.length > visibleCount ? (
                    <button
                      className={styles.loadMore}
                      type="button"
                      onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
                    >
                      Carregar mais
                    </button>
                  ) : null}
                  {!transactionState.transactions.length ? (
                    <NewRecordAction
                      disabled={!canManage || !accountState.activeAccounts.length}
                      onClick={openNewTransaction}
                    />
                  ) : null}
                </>
              )}
            </>
          )}
        </section>
      </div>

      <FinanceTransactionModal
        key={`simplified-record-${transactionDialog?.type ?? 'closed'}-${transactionDialog?.transactionId ?? 'new'}`}
        open={Boolean(transactionDialog)}
        onClose={() => setTransactionDialog(null)}
        onChanged={refresh}
        initialType={transactionDialog?.type ?? 'expense'}
        editingTransactionId={transactionDialog?.transactionId ?? null}
        canManage={canManage}
        canDeleteTransaction={canDeleteTransaction}
        accountState={displayAccountState}
        categoryState={categoryState}
        transactionState={transactionState}
      />
    </>
  );
}

export default SimplifiedRecordsPage;
