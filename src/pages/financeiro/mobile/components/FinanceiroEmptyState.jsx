function FinanceiroEmptyState({ onStart }) {
  return (
    <section className="financeMobileEmpty">
      <span aria-hidden="true">1</span>
      <h2>Crie sua primeira conta</h2>
      <p>Esse é o primeiro passo para organizar saldos e lançamentos neste perfil.</p>
      <button type="button" onClick={onStart}>Criar primeira conta</button>
    </section>
  );
}

export default FinanceiroEmptyState;
