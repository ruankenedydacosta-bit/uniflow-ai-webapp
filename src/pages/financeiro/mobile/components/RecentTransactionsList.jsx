import { useMemo, useState } from 'react';
import {
  DEFAULT_TRANSACTION_FILTERS,
  applyTransactionFilters,
  derivePaymentMethodOptions,
  hasActiveTransactionFilters,
} from '../../transactionFilterUtils.js';
import TransactionRow from './TransactionRow';

const TYPE_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'income', label: 'Entradas' },
  { value: 'expense', label: 'Saídas' },
  { value: 'transfer', label: 'Transferências' },
];

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

function RecentTransactionsList({
  accounts = [],
  categories = [],
  onDelete,
  onDuplicate,
  onEdit,
  onNew,
  transactions,
}) {
  const [filters, setFilters] = useState(DEFAULT_TRANSACTION_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const categoriesById = useMemo(() => new Map(categories.map((category) => [category.id, category])), [categories]);
  const accountsById = useMemo(() => new Map(accounts.map((account) => [account.id, account])), [accounts]);
  const paymentMethodOptions = useMemo(() => derivePaymentMethodOptions(transactions), [transactions]);

  const filteredTransactions = useMemo(
    () => applyTransactionFilters(transactions, filters, { categoriesById, accountsById }),
    [transactions, filters, categoriesById, accountsById],
  );

  const activeFilters = hasActiveTransactionFilters(filters);

  function updateFilter(patch) {
    setFilters((current) => ({ ...current, ...patch }));
  }

  function clearFilters() {
    setFilters(DEFAULT_TRANSACTION_FILTERS);
  }

  return (
    <section className="financeMobileCard" aria-labelledby="mobile-transactions-title">
      <header className="financeMobileSectionHeader">
        <h2 id="mobile-transactions-title">Lançamentos</h2>
        <button type="button" onClick={() => onNew()}>Novo</button>
      </header>

      <div className="financeMobileFilterChips" role="group" aria-label="Filtrar por tipo">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`financeMobileChip${filters.type === opt.value ? ' active' : ''}`}
            onClick={() => updateFilter({ type: opt.value })}
            aria-pressed={filters.type === opt.value}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="financeMobileTransactionToolbar">
        <label className="financeMobileSearch">
          <span className="financeMobileSearchIcon" aria-hidden="true">🔍</span>
          <input
            type="search"
            placeholder="Buscar por descrição, observação, categoria ou conta..."
            value={filters.search}
            onChange={(e) => updateFilter({ search: e.target.value })}
            aria-label="Buscar lançamentos"
          />
        </label>
        <button
          type="button"
          className="financeMobileSortBtn"
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
          aria-controls="mobile-transactions-filters-panel"
        >
          {filtersOpen ? '▲ Filtros' : '▼ Filtros'}
        </button>
      </div>

      {filtersOpen ? (
        <div id="mobile-transactions-filters-panel" className="financeMobileFiltersPanel">
          <label className="financeMobileFilterField">
            <span>Ordenar por</span>
            <select value={filters.sortOrder} onChange={(e) => updateFilter({ sortOrder: e.target.value })}>
              {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>

          <label className="financeMobileFilterField">
            <span>Conta</span>
            <select value={filters.accountId} onChange={(e) => updateFilter({ accountId: e.target.value })}>
              <option value="all">Todas as contas</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>

          <label className="financeMobileFilterField">
            <span>Categoria</span>
            <select value={filters.categoryId} onChange={(e) => updateFilter({ categoryId: e.target.value })}>
              <option value="all">Todas as categorias</option>
              {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
          </label>

          <label className="financeMobileFilterField">
            <span>Forma de pagamento</span>
            <select value={filters.paymentMethod} onChange={(e) => updateFilter({ paymentMethod: e.target.value })}>
              <option value="all">Todas</option>
              {paymentMethodOptions.map((method) => <option key={method} value={method}>{method}</option>)}
            </select>
          </label>

          <label className="financeMobileFilterField">
            <span>Parcelados</span>
            <select value={filters.installment} onChange={(e) => updateFilter({ installment: e.target.value })}>
              {INSTALLMENT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>

          <label className="financeMobileFilterField">
            <span>Recorrentes</span>
            <select value={filters.recurring} onChange={(e) => updateFilter({ recurring: e.target.value })}>
              {RECURRING_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </label>

          <button
            type="button"
            className="financeMobileClearFiltersBtn"
            onClick={clearFilters}
            disabled={!activeFilters}
          >
            Limpar filtros
          </button>
        </div>
      ) : null}

      {filteredTransactions.length ? (
        <ul className="financeMobileTransactions">
          {filteredTransactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              onDelete={onDelete}
              onDuplicate={onDuplicate}
              onEdit={onEdit}
            />
          ))}
        </ul>
      ) : activeFilters ? (
        <div className="financeMobileFilterEmpty active">
          <p>Nenhuma movimentação encontrada.</p>
          <button type="button" className="financeMobileClearFiltersBtn" onClick={clearFilters}>
            Limpar filtros
          </button>
        </div>
      ) : (
        <p className="financeMobileFilterEmpty">Nenhum lançamento confirmado neste período.</p>
      )}
    </section>
  );
}

export default RecentTransactionsList;
