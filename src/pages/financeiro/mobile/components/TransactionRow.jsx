function TransactionRow({ onDelete, onEdit, transaction }) {
  return (
    <li className="financeMobileTransaction">
      <button
        type="button"
        className="financeMobileTransactionInfo"
        onClick={() => onEdit?.(transaction)}
        aria-label={`Editar ${transaction.description}`}
      >
        <span className={`financeMobileTransactionIcon ${transaction.tone}`} aria-hidden="true">
          {transaction.icon}
        </span>
        <div>
          <strong>{transaction.description}</strong>
          <small>{transaction.category} &middot; {transaction.date}</small>
        </div>
      </button>
      <div className="financeMobileTransactionRight">
        <b className={`financeMobile-${transaction.tone}`}>{transaction.amount}</b>
        <button
          type="button"
          className="financeMobileDeleteBtn"
          onClick={() => {
            if (window.confirm(`Excluir "${transaction.description}"?`)) {
              onDelete?.(transaction.id);
            }
          }}
          aria-label="Excluir lançamento"
        >
          &times;
        </button>
      </div>
    </li>
  );
}

export default TransactionRow;
