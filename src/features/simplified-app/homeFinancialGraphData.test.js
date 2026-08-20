import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCategoryBreakdown, buildHomeFinancialGraphData } from './homeFinancialGraphData.js';

const NOW = new Date(2026, 6, 16, 12); // 16/07/2026

const CATEGORIES = [
  { id: 'cat-food', name: 'Alimentação' },
  { id: 'cat-transport', name: 'Transporte' },
  { id: 'cat-salary', name: 'Salário' },
];

function tx({
  id, type, amount, categoryId = null, date = '2026-07-10', status = 'completed',
}) {
  return {
    id,
    transaction_type: type,
    amount,
    category_id: categoryId,
    transaction_date: date,
    status,
  };
}

// ============================================================================
// buildCategoryBreakdown -- REGRA DE ZERO + separação Entrada/Saída.
// ============================================================================

test('categorias com valor > 0 aparecem, ordenadas do maior para o menor', () => {
  const transactions = [
    tx({ id: 1, type: 'expense', amount: 430, categoryId: 'cat-food' }),
    tx({ id: 2, type: 'expense', amount: 180, categoryId: 'cat-transport' }),
  ];
  const result = buildCategoryBreakdown(transactions, CATEGORIES, 'expense');
  assert.deepEqual(result.map((c) => c.name), ['Alimentação', 'Transporte']);
  assert.equal(result[0].value, 430);
});

test('REGRA DE ZERO: categoria sem nenhum lançamento nunca aparece na lista', () => {
  const transactions = [tx({ id: 1, type: 'expense', amount: 430, categoryId: 'cat-food' })];
  const result = buildCategoryBreakdown(transactions, CATEGORIES, 'expense');
  assert.equal(result.some((c) => c.name === 'Transporte'), false);
  assert.equal(result.length, 1);
});

test('REGRA DE ZERO: lançamento de valor zero nunca faz uma categoria aparecer', () => {
  const transactions = [tx({ id: 1, type: 'expense', amount: 0, categoryId: 'cat-food' })];
  const result = buildCategoryBreakdown(transactions, CATEGORIES, 'expense');
  assert.equal(result.length, 0);
});

test('Entrada e Saída nunca se misturam na mesma agregação -- tipos totalmente separados', () => {
  const transactions = [
    tx({ id: 1, type: 'expense', amount: 430, categoryId: 'cat-food' }),
    tx({ id: 2, type: 'income', amount: 3000, categoryId: 'cat-salary' }),
  ];
  const expenseResult = buildCategoryBreakdown(transactions, CATEGORIES, 'expense');
  const incomeResult = buildCategoryBreakdown(transactions, CATEGORIES, 'income');
  assert.deepEqual(expenseResult.map((c) => c.name), ['Alimentação']);
  assert.deepEqual(incomeResult.map((c) => c.name), ['Salário']);
});

test('categoria ausente/removida cai em "Sem categoria", nunca quebra', () => {
  const transactions = [tx({ id: 1, type: 'expense', amount: 100, categoryId: 'cat-deleted' })];
  const result = buildCategoryBreakdown(transactions, CATEGORIES, 'expense');
  assert.equal(result[0].name, 'Sem categoria');
});

test('formattedValue usa moeda brasileira', () => {
  const transactions = [tx({ id: 1, type: 'expense', amount: 430, categoryId: 'cat-food' })];
  const result = buildCategoryBreakdown(transactions, CATEGORIES, 'expense');
  assert.match(result[0].formattedValue, /R\$\s*430/);
});

// ============================================================================
// buildHomeFinancialGraphData -- fonte única, nunca saldo, período do mês.
// ============================================================================

test('agrega entradas e saídas do período (mês atual), nunca saldo', () => {
  const transactions = [
    tx({ id: 1, type: 'income', amount: 3000, categoryId: 'cat-salary', date: '2026-07-05' }),
    tx({ id: 2, type: 'expense', amount: 430, categoryId: 'cat-food', date: '2026-07-10' }),
  ];
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.equal(result.income, 3000);
  assert.equal(result.expense, 430);
  assert.equal(result.hasMovements, true);
  assert.equal('balance' in result, false, 'o resultado nunca pode conter um campo de saldo');
  assert.equal('workspaceBalance' in result, false);
});

test('só considera transações status=completed dentro do período do mês corrente', () => {
  const transactions = [
    tx({
      id: 1, type: 'expense', amount: 999, categoryId: 'cat-food', date: '2026-07-10', status: 'pending',
    }),
    tx({ id: 2, type: 'expense', amount: 50, categoryId: 'cat-food', date: '2026-06-10' }),
  ];
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.equal(result.expense, 0);
  assert.equal(result.hasMovements, false);
});

test('sem transações no período: hasMovements=false e nenhum valor inventado', () => {
  const result = buildHomeFinancialGraphData({ transactions: [], categories: CATEGORIES, now: NOW });
  assert.equal(result.hasMovements, false);
  assert.equal(result.income, 0);
  assert.equal(result.expense, 0);
  assert.deepEqual(result.categories.expense, []);
  assert.deepEqual(result.categories.income, []);
});

test('categories separa expense/income prontos para o toggle [Saídas][Entradas]', () => {
  const transactions = [
    tx({ id: 1, type: 'income', amount: 3000, categoryId: 'cat-salary', date: '2026-07-05' }),
    tx({ id: 2, type: 'expense', amount: 430, categoryId: 'cat-food', date: '2026-07-10' }),
  ];
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.deepEqual(result.categories.expense.map((c) => c.name), ['Alimentação']);
  assert.deepEqual(result.categories.income.map((c) => c.name), ['Salário']);
});

test('chart.data vem da mesma série acumulada usada pelo módulo Financeiro (buildCumulativeSeries)', () => {
  const transactions = [tx({ id: 1, type: 'income', amount: 500, categoryId: 'cat-salary', date: '2026-07-10' })];
  const result = buildHomeFinancialGraphData({ transactions, categories: CATEGORIES, now: NOW });
  assert.ok(Array.isArray(result.chart.data));
  assert.ok(result.chart.data.length > 0);
  assert.equal(typeof result.chart.todayDay, 'number');
});
