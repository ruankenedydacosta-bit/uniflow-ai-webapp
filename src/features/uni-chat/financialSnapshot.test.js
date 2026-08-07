// Testes do FinancialSnapshot (Fase 2 das Consultas Financeiras Inteligentes).
//
// Cobre: resolução de nomes de conta/categoria, saldos por conta e total,
// filtros de status/tipo, últimas movimentações/receitas/despesas, gastos por
// categoria, isolamento por workspace (dados do banco) e datas de referência.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinancialSnapshot,
  monthKeyOf,
  normalizeFinancialText,
  roundMoney,
  queryTransactionsInRange,
  aggregateFinancialRange,
} from './financialSnapshot.js';

const REFERENCE_DATE = '2026-07-15';

const ACCOUNTS = [
  { id: 'acc-nubank', name: 'Nubank', current_balance: 500 },
  { id: 'acc-itau', name: 'Itaú', current_balance: 200 },
];

const CATEGORIES = [
  { id: 'cat-food', name: 'Alimentação' },
  { id: 'cat-transport', name: 'Transporte' },
];

const TRANSACTIONS = [
  { id: 't1', account_id: 'acc-nubank', category_id: 'cat-food', transaction_type: 'expense', amount: 120.5, description: 'Mercado', transaction_date: '2026-07-14', status: 'confirmed' },
  { id: 't2', account_id: 'acc-itau', category_id: 'cat-transport', transaction_type: 'expense', amount: 45, description: 'Uber', transaction_date: '2026-07-10', status: 'confirmed' },
  { id: 't3', account_id: 'acc-nubank', category_id: null, transaction_type: 'income', amount: 3000, description: 'Salário', transaction_date: '2026-07-05', status: 'confirmed' },
  { id: 't4', account_id: 'acc-itau', category_id: 'cat-food', transaction_type: 'expense', amount: 90, description: 'Restaurante', transaction_date: '2026-06-28', status: 'confirmed' },
  { id: 't5', account_id: 'acc-nubank', category_id: 'cat-food', transaction_type: 'expense', amount: 100, description: 'Cancelada', transaction_date: '2026-07-01', status: 'canceled' },
  { id: 't6', account_id: 'acc-nubank', category_id: null, transaction_type: 'transfer', amount: 50, description: 'Transferência', transaction_date: '2026-07-02', status: 'confirmed' },
  { id: 't7', account_id: 'acc-nubank', category_id: 'cat-food', transaction_type: 'expense', amount: 33.33, description: 'Ifood', transaction_date: '2026-07-16', status: 'confirmed' },
  { id: 't8', account_id: 'acc-itau', category_id: 'cat-transport', transaction_type: 'expense', amount: 60, description: 'Gasolina', transaction_date: '2026-07-12', status: 'confirmed' },
  { id: 't9', account_id: 'acc-nubank', category_id: 'cat-ghost', transaction_type: 'expense', amount: 25, description: 'Compra sem categoria', transaction_date: '2026-07-08', status: 'confirmed' },
];

const ACCOUNT_BALANCES = [
  { account_id: 'acc-nubank', derived_balance: 480.5 },
  { account_id: 'acc-itau', derived_balance: 260 },
];

function buildSnapshot(overrides = {}) {
  return buildFinancialSnapshot({
    accounts: ACCOUNTS,
    categories: CATEGORIES,
    transactions: TRANSACTIONS,
    workspaceBalance: null,
    accountBalances: ACCOUNT_BALANCES,
    referenceDate: REFERENCE_DATE,
    ...overrides,
  });
}

test('roundMoney normaliza para centavos e protege contra valores inválidos', () => {
  assert.equal(roundMoney(120.505), 120.51);
  assert.equal(roundMoney('50'), 50);
  assert.equal(roundMoney('abc'), 0);
  assert.equal(roundMoney(null), 0);
  assert.equal(roundMoney(undefined), 0);
});

test('monthKeyOf extrai YYYY-MM e normalizeFinancialText remove acentos', () => {
  assert.equal(monthKeyOf('2026-07-14'), '2026-07');
  assert.equal(monthKeyOf(null), null);
  assert.equal(normalizeFinancialText('Última Despesa Ção'), 'ultima despesa cao');
});

test('snapshot expõe contas e categorias resolvidas por id com nomes reais', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.accountsById.get('acc-nubank').name, 'Nubank');
  assert.equal(snapshot.categoriesById.get('cat-food').name, 'Alimentação');
  assert.equal(snapshot.accountsById.size, 2);
  assert.equal(snapshot.categoriesById.size, 2);
});

test('saldo por conta usa derived_balance (banco) com fallback para current_balance', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.accountBalancesById.get('acc-nubank'), 480.5);
  assert.equal(snapshot.accountBalancesById.get('acc-itau'), 260);

  const withoutDerived = buildSnapshot({ accountBalances: [] });
  assert.equal(withoutDerived.accountBalancesById.get('acc-nubank'), 500);
  assert.equal(withoutDerived.accountBalancesById.get('acc-itau'), 200);
});

test('saldo total: workspaceBalance tem prioridade; senão soma dos saldos por conta', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.totalBalance, 740.5);

  const withWorkspace = buildSnapshot({ workspaceBalance: 999.99 });
  assert.equal(withWorkspace.totalBalance, 999.99);
});

test('transações inválidas são descartadas: canceladas e tipos fora de income/expense', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.transactions.length, 7);
  assert.ok(!snapshot.transactions.some((tx) => tx.id === 't5'));
  assert.ok(!snapshot.transactions.some((tx) => tx.id === 't6'));
});

test('histórico é ordenado por data decrescente (com fallback determinístico)', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.transactions[0].id, 't7');
  assert.equal(snapshot.transactions[0].transaction_date, '2026-07-16');
});

test('última movimentação, receita e despesa são resolvidas do dado real', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.lastTransaction.id, 't7');
  assert.equal(snapshot.lastIncome.id, 't3');
  assert.equal(snapshot.lastExpense.id, 't7');
});

test('recentTransactions contém no máximo as 5 mais recentes', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.recentTransactions.length, 5);
  assert.deepEqual(
    snapshot.recentTransactions.map((tx) => tx.id),
    ['t7', 't1', 't8', 't2', 't9'],
  );
});

test('transações do mês corrente usam a data de referência, não o relógio', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.currentMonth, '2026-07');
  const ids = snapshot.currentMonthTransactions.map((tx) => tx.id).sort();
  assert.deepEqual(ids, ['t1', 't2', 't3', 't7', 't8', 't9']);
});

test('receitas, despesas e resultado do mês corrente são somados e arredondados', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.monthlyIncome, 3000);
  assert.equal(snapshot.monthlyExpense, 283.83);
  assert.equal(snapshot.monthlyResult, 2716.17);
});

test('gastos por categoria usam categoryName resolvido e agrupam o resto em Sem categoria', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.expensesByCategory.get('Alimentação'), 153.83);
  assert.equal(snapshot.expensesByCategory.get('Transporte'), 105);
  assert.equal(snapshot.expensesByCategory.get('Sem categoria'), 25);
});

test('hasData é false quando não existe nenhum dado financeiro', () => {
  assert.equal(buildFinancialSnapshot({ referenceDate: REFERENCE_DATE }).hasData, false);
  assert.equal(buildSnapshot().hasData, true);
});

test('snapshot é puro e determinístico: mesma entrada, mesma saída', () => {
  const first = buildSnapshot();
  const second = buildSnapshot();
  assert.deepEqual(first.transactions, second.transactions);
  assert.equal(first.totalBalance, second.totalBalance);
  assert.deepEqual(first.expensesByCategory, second.expensesByCategory);
});

// ── Sprint 4 (Bloco 4.2): agregados adicionais para as capacidades recém
// conectadas (income_by_account/category, expenses_by_account, top_expenses) ──

test('despesas por conta somam o mês corrente por conta real', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.expensesByAccount.get('Nubank'), 178.83);
  assert.equal(snapshot.expensesByAccount.get('Itaú'), 105);
});

test('receitas por conta e por categoria refletem o mês corrente', () => {
  const snapshot = buildSnapshot();
  assert.equal(snapshot.incomeByAccount.get('Nubank'), 3000);
  assert.equal(snapshot.incomeByCategory.get('Sem categoria'), 3000);
  assert.equal(snapshot.incomeByAccount.get('Itaú'), undefined);
});

test('maiores despesas do mês corrente vêm ordenadas por valor, nunca por data', () => {
  const snapshot = buildSnapshot();
  assert.deepEqual(
    snapshot.topExpensesCurrentMonth.map((tx) => tx.id),
    ['t1', 't8', 't2', 't7', 't9'],
  );
  assert.equal(snapshot.topExpensesCurrentMonth[0].amount, 120.5);
});

test('sem despesas no mês, topExpensesCurrentMonth vem vazio -- nunca inventa uma entrada', () => {
  const empty = buildFinancialSnapshot({ referenceDate: REFERENCE_DATE });
  assert.deepEqual(empty.topExpensesCurrentMonth, []);
  assert.equal(empty.incomeByAccount.size, 0);
  assert.equal(empty.expensesByAccount.size, 0);
});

// ── Sprint 4 (Bloco 4.5.1): API de agregação por intervalo arbitrário ──

test('queryTransactionsInRange filtra por data inclusive, sem depender do mês corrente', () => {
  const snapshot = buildSnapshot();
  const june = queryTransactionsInRange(snapshot, { start: '2026-06-01', end: '2026-06-30' });
  assert.deepEqual(june.map((t) => t.id), ['t4']);
});

test('queryTransactionsInRange filtra por conta/categoria/tipo simultaneamente', () => {
  const snapshot = buildSnapshot();
  const result = queryTransactionsInRange(snapshot, {
    start: '2026-07-01', end: '2026-07-31',
    accountIds: ['acc-nubank'], transactionTypes: ['expense'],
  });
  assert.deepEqual(result.map((t) => t.id).sort(), ['t1', 't7', 't9']);
});

test('queryTransactionsInRange respeita limit', () => {
  const snapshot = buildSnapshot();
  const result = queryTransactionsInRange(snapshot, { start: '2026-06-01', end: '2026-07-31', limit: 2 });
  assert.equal(result.length, 2);
});

test('queryTransactionsInRange sem snapshot/transactions válidos nunca lança, devolve vazio', () => {
  assert.deepEqual(queryTransactionsInRange(null), []);
  assert.deepEqual(queryTransactionsInRange({}), []);
});

test('aggregateFinancialRange agrega um intervalo de vários meses corretamente (nunca limitado ao mês atual)', () => {
  const snapshot = buildSnapshot();
  const range = { start: '2026-06-01', end: '2026-07-31' };
  const result = aggregateFinancialRange(snapshot, range);
  // junho: t4 (90 expense); julho: t1,t2,t7,t8,t9 (283.83) + t3 (3000 income)
  assert.equal(result.expense, 373.83);
  assert.equal(result.income, 3000);
  assert.equal(result.transactionCount, 7);
});

test('aggregateFinancialRange topExpenses ordena por valor dentro do intervalo pedido', () => {
  const snapshot = buildSnapshot();
  const result = aggregateFinancialRange(snapshot, { start: '2026-06-01', end: '2026-07-31' });
  assert.equal(result.topExpenses[0].id, 't1');
});

test('aggregateFinancialRange com intervalo sem nenhuma transação real devolve zeros/vazios, nunca inventa', () => {
  const snapshot = buildSnapshot();
  const result = aggregateFinancialRange(snapshot, { start: '2020-01-01', end: '2020-01-31' });
  assert.equal(result.income, 0);
  assert.equal(result.expense, 0);
  assert.deepEqual(result.topExpenses, []);
  assert.equal(result.transactionCount, 0);
});

test('aggregateFinancialRange nunca lança com range nulo/malformado', () => {
  const snapshot = buildSnapshot();
  assert.doesNotThrow(() => aggregateFinancialRange(snapshot, null));
  assert.doesNotThrow(() => aggregateFinancialRange(null, { start: '2026-01-01', end: '2026-01-31' }));
});
