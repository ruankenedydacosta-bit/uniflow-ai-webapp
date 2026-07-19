function FinanceiroErrorState({ message, onRetry }) {
  return (
    <section className="financeMobileEmpty" role="alert">
      <h2>Não foi possível carregar o Financeiro</h2>
      <p>{message || 'Confira sua conexão e tente novamente.'}</p>
      <button type="button" onClick={onRetry}>Tentar novamente</button>
    </section>
  );
}

export default FinanceiroErrorState;
