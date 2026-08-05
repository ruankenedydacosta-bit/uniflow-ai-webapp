// Fixtures compartilhadas dos testes do Motor de Raciocínio Financeiro.
// Apenas dados sintéticos e determinísticos (nunca dados reais).
export function buildFixtureAccounts() {
  return [
    { id: 'acc-1', name: 'Conta corrente', account_type: 'checking', current_balance: 1500 },
    { id: 'acc-2', name: 'Poupança', account_type: 'savings', current_balance: 5000 },
    { id: 'acc-3', name: 'Investimentos', account_type: 'investment', current_balance: 8000 },
    { id: 'acc-4', name: 'Cartão', account_type: 'credit_card', current_balance: -1200, credit_limit: 5000, due_day: 10, closing_day: 3 },
  ];
}

export function buildFixtureCategories() {
  return [
    { id: 'cat-1', name: 'Salário', transaction_type: 'income', is_system: true },
    { id: 'cat-2', name: 'Moradia', transaction_type: 'expense', is_system: true },
    { id: 'cat-3', name: 'Alimentação', transaction_type: 'expense', is_system: true },
  ];
}

export function buildFixtureTransactions() {
  return [
    { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 6000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
    { id: 'tx-2', account_id: 'acc-4', transaction_type: 'expense', amount: 900, transaction_date: '2026-08-02', status: 'completed', category_id: 'cat-2', description: 'Aluguel', is_recurring: true, installment_number: 1, installment_total: 6, metadata: { installment_group_id: 'g-1' } },
    { id: 'tx-3', account_id: 'acc-4', transaction_type: 'expense', amount: 900, transaction_date: '2026-08-02', status: 'completed', category_id: 'cat-2', description: 'Aluguel', is_recurring: true, installment_number: 2, installment_total: 6, metadata: { installment_group_id: 'g-1' } },
    { id: 'tx-4', account_id: 'acc-4', transaction_type: 'expense', amount: 200, transaction_date: '2026-07-15', status: 'completed', category_id: 'cat-3', description: 'Mercado' },
    { id: 'tx-5', account_id: 'acc-4', transaction_type: 'expense', amount: 150, transaction_date: '2026-07-20', status: 'canceled', category_id: 'cat-3', description: 'Cancelada' },
  ];
}