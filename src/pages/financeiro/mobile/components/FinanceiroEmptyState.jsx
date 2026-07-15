function FinanceiroEmptyState({ onStart }) {
  return <section className="financeMobileEmpty"><span aria-hidden="true">R$</span><h2>Sua visão financeira começa aqui</h2><p>Adicione uma conta ou registre um lançamento para a Uni organizar sua leitura.</p><button type="button" onClick={onStart}>Começar agora</button></section>;
}

export default FinanceiroEmptyState;
