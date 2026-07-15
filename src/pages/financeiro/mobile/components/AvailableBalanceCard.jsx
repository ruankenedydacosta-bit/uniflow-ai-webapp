function AvailableBalanceCard({ balance, comparison, expense, income }) {
  return (
    <section className="financeMobileBalance" aria-labelledby="mobile-balance-title">
      <span id="mobile-balance-title">Saldo disponível</span>
      <strong>{balance}</strong>
      <small>{comparison}</small>
      <div>
        <p><span>Receitas</span><strong className="financeMobileIncome">{income}</strong></p>
        <p><span>Despesas</span><strong className="financeMobileExpense">{expense}</strong></p>
      </div>
    </section>
  );
}

export default AvailableBalanceCard;
