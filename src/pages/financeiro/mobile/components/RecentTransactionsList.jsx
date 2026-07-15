import TransactionRow from './TransactionRow';

function RecentTransactionsList({ onNew, transactions }) {
  return <section className="financeMobileCard" aria-labelledby="mobile-transactions-title"><header className="financeMobileSectionHeader"><h2 id="mobile-transactions-title">Lançamentos recentes</h2><button type="button" onClick={onNew}>Ver todos</button></header><ul className="financeMobileTransactions">{transactions.map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} />)}</ul></section>;
}

export default RecentTransactionsList;
