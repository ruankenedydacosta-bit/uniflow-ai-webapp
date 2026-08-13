function AvailableBalanceCard({ comparison, expense, income }) {
  return (
    <section className="financeMobileBalance" aria-labelledby="mobile-balance-title">
      <span id="mobile-balance-title">Movimentações do período</span>
      <small>{comparison}</small>
      <div>
        <p><span>Entradas</span><strong className="financeMobileIncome">{income}</strong></p>
        <p><span>Saídas</span><strong className="financeMobileExpense">{expense}</strong></p>
      </div>
    </section>
  );
}

export default AvailableBalanceCard;
