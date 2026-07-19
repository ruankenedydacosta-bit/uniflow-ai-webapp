import { useMemo, useState } from 'react';
import TransactionRow from './TransactionRow';

const FILTER_OPTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'income', label: 'Entradas' },
  { value: 'expense', label: 'Saídas' },
  { value: 'transfer', label: 'Transferências' },
];

function RecentTransactionsList({ onDelete, onEdit, onNew, transactions }) {
  const [typeFilter, setTypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState('recent');

  const filteredTransactions = useMemo(() => {
    let result = transactions;

    if (typeFilter !== 'all') {
      result = result.filter((t) => t.transaction_type === typeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((t) => t.description.toLowerCase().includes(q));
    }

    result = [...result].sort((a, b) => {
      const dateA = a.transaction_date;
      const dateB = b.transaction_date;
      return sortOrder === 'recent'
        ? String(dateB).localeCompare(String(dateA))
        : String(dateA).localeCompare(String(dateB));
    });

    return result;
  }, [transactions, typeFilter, searchQuery, sortOrder]);

  const hasActiveFilters = typeFilter !== 'all' || searchQuery.trim() !== '';

  return (
    <section className="financeMobileCard" aria-labelledby="mobile-transactions-title">
      <header className="financeMobileSectionHeader">
        <h2 id="mobile-transactions-title">Lançamentos</h2>
        <button type="button" onClick={() => onNew()}>Novo</button>
      </header>

      <div className="financeMobileFilterChips" role="group" aria-label="Filtrar por tipo">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`financeMobileChip${typeFilter === opt.value ? ' active' : ''}`}
            onClick={() => setTypeFilter(opt.value)}
            aria-pressed={typeFilter === opt.value}
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
            placeholder="Buscar por descrição..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Buscar lançamentos"
          />
        </label>
        <button
          type="button"
          className={`financeMobileSortBtn${sortOrder === 'recent' ? '' : ' reversed'}`}
          onClick={() => setSortOrder((s) => (s === 'recent' ? 'oldest' : 'recent'))}
          aria-label={`Ordenar por ${sortOrder === 'recent' ? 'mais antigas' : 'mais recentes'}`}
        >
          {sortOrder === 'recent' ? '↓ Recentes' : '↑ Antigas'}
        </button>
      </div>

      {filteredTransactions.length ? (
        <ul className="financeMobileTransactions">
          {filteredTransactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              transaction={transaction}
              onDelete={onDelete}
              onEdit={onEdit}
            />
          ))}
        </ul>
      ) : (
        <p className={`financeMobileFilterEmpty${hasActiveFilters ? ' active' : ''}`}>
          {hasActiveFilters
            ? 'Nenhum lançamento encontrado com esses filtros.'
            : 'Nenhum lançamento confirmado neste período.'}
        </p>
      )}
    </section>
  );
}

export default RecentTransactionsList;
