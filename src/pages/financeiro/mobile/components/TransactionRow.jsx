function TransactionRow({ transaction }) {
  return <li className="financeMobileTransaction"><span aria-hidden="true">{transaction.icon}</span><div><strong>{transaction.description}</strong><small>{transaction.category} · {transaction.date}</small></div><b className={`financeMobile-${transaction.tone}`}>{transaction.amount}</b></li>;
}

export default TransactionRow;
