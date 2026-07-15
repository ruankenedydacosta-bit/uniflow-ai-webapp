function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

const shared = {
  accounts: [
    { id: 'nubank', name: 'Nubank', type: 'Conta digital', balance: 'R$ 4.280,40', color: 'violet' },
    { id: 'itau', name: 'Itaú', type: 'Conta corrente', balance: 'R$ 2.140,10', color: 'orange' },
    { id: 'wallet', name: 'Carteira', type: 'Dinheiro', balance: 'R$ 450,00', color: 'green' },
  ],
  cards: [
    { id: 'nu-card', name: 'Nubank', ending: '•• 4242', invoice: 'R$ 1.286,30', limit: 'R$ 4.713,70', due: '18 jul', color: 'violet' },
    { id: 'itau-card', name: 'Itaú Click', ending: '•• 1098', invoice: 'R$ 640,00', limit: 'R$ 3.360,00', due: '22 jul', color: 'orange' },
  ],
  transactions: [
    { id: 'market', description: 'Mercado Central', category: 'Alimentação', date: 'Hoje', amount: '- R$ 186,40', tone: 'expense', icon: 'M' },
    { id: 'salary', description: 'Salário', category: 'Receitas', date: '12 jul', amount: '+ R$ 6.800,00', tone: 'income', icon: 'R' },
    { id: 'energy', description: 'Energia', category: 'Casa', date: '10 jul', amount: '- R$ 214,70', tone: 'expense', icon: 'C' },
  ],
  categories: [
    { id: 'home', label: 'Casa', value: 'R$ 1.420', percent: 76, color: 'cyan' },
    { id: 'food', label: 'Alimentação', value: 'R$ 940', percent: 51, color: 'violet' },
    { id: 'transport', label: 'Transporte', value: 'R$ 510', percent: 28, color: 'green' },
  ],
};

export const financeiroMobileMock = deepFreeze({
  periods: [
    {
      id: 'may-2026', label: 'Maio 2026', mode: 'Mês', insight: 'Você fechou maio com margem positiva e gastos concentrados em casa.', balance: 'R$ 5.980,20', balanceLabel: 'Disponível no período', comparison: '+ 8% vs. abril', income: 'R$ 7.420', expense: 'R$ 4.180', chart: { labels: ['1', '6', '12', '18', '24', '31'], income: [18, 32, 48, 62, 78, 92], expense: [12, 24, 36, 51, 65, 72] }, forecast: { title: 'Maio terminou dentro da rota', description: 'Sua reserva recebeu mais recursos do que no mês anterior.', status: 'Concluído' }, ...shared,
    },
    {
      id: 'jun-2026', label: 'Junho 2026', mode: 'Mês', insight: 'Junho manteve sua rota estável, com uma pequena redução nas despesas variáveis.', balance: 'R$ 6.420,50', balanceLabel: 'Disponível no período', comparison: '+ 7% vs. maio', income: 'R$ 7.860', expense: 'R$ 4.020', chart: { labels: ['1', '6', '12', '18', '24', '30'], income: [20, 35, 49, 64, 81, 96], expense: [15, 29, 35, 46, 57, 68] }, forecast: { title: 'Rota estável para o próximo mês', description: 'Mantendo este ritmo, você preserva sua margem sem cortar o essencial.', status: 'No caminho' }, ...shared,
    },
    {
      id: 'jul-2026', label: 'Julho 2026', mode: 'Mês', insight: 'Até agora, suas receitas cobrem as despesas com uma margem confortável.', balance: 'R$ 6.870,50', balanceLabel: 'Saldo disponível', comparison: '+ 6% vs. junho', income: 'R$ 6.800', expense: 'R$ 3.240', chart: { labels: ['1', '4', '7', '10', '13', '16'], income: [16, 31, 49, 65, 82, 96], expense: [10, 21, 34, 45, 56, 63] }, forecast: { title: 'Você deve encerrar julho no azul', description: 'A projeção indica espaço para avançar sua meta sem apertar o dia a dia.', status: 'Previsão positiva' }, ...shared,
    },
  ],
});
