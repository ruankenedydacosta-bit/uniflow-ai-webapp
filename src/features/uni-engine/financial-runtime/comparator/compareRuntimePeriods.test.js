// Testes do Comparator Runtime (Fase 17, Bloco 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareRuntimePeriods, compareMultipleRuntimePeriods, getSupportedComparisonTypes, isValidComparisonType } from '../comparator/index.js';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/index.js';

function buildSnapshot() {
  return buildFinancialReasoningSnapshot({
    accounts: [
      { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 1500 },
    ],
    categories: [
      { id: 'cat-1', name: 'Salário', transaction_type: 'income' },
      { id: 'cat-2', name: 'Alimentação', transaction_type: 'expense' },
      { id: 'cat-3', name: 'Moradia', transaction_type: 'expense' },
    ],
    transactions: [
      { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 5000, transaction_date: '2026-07-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
      { id: 'tx-2', account_id: 'acc-1', transaction_type: 'expense', amount: 1500, transaction_date: '2026-07-15', status: 'completed', category_id: 'cat-3', description: 'Aluguel' },
      { id: 'tx-3', account_id: 'acc-1', transaction_type: 'income', amount: 6000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
      { id: 'tx-4', account_id: 'acc-1', transaction_type: 'expense', amount: 1800, transaction_date: '2026-08-15', status: 'completed', category_id: 'cat-2', description: 'Mercado' },
      // expenses.byCategory (Fase 15) só considera transações do mês CORRENTE
      // (2026-08) -- sem uma segunda categoria de despesa em agosto, havia
      // apenas 1 categoria com gasto no mês-alvo e category_vs_category
      // devolvia (corretamente) insufficient_data, não um bug de comparação.
      { id: 'tx-5', account_id: 'acc-1', transaction_type: 'expense', amount: 900, transaction_date: '2026-08-20', status: 'completed', category_id: 'cat-3', description: 'Aluguel' },
    ],
    referenceDate: '2026-08-15',
  });
}

test('comparator: month_over_month compara meses adjacentes', () => {
  const snapshot = buildSnapshot();
  const result = compareRuntimePeriods(snapshot, '2026-08', '2026-07', 'month_over_month');
  assert.equal(result.status, 'executed');
  assert.ok(result.deltas);
  assert.ok(result.percentages);
  assert.equal(result.periodA.label, '2026-08');
  assert.equal(result.periodB.label, '2026-07');
});

test('comparator: income_vs_expense compara receita vs despesa', () => {
  const snapshot = buildSnapshot();
  const result = compareRuntimePeriods(snapshot, '2026-08', null, 'income_vs_expense');
  assert.equal(result.status, 'executed');
  assert.ok(typeof result.income === 'number');
  assert.ok(typeof result.expense === 'number');
  assert.ok(typeof result.delta === 'number');
  assert.ok(typeof result.percentage === 'number');
});

test('comparator: category_vs_category compara top 2 categorias', () => {
  const snapshot = buildSnapshot();
  const result = compareRuntimePeriods(snapshot, '2026-08', null, 'category_vs_category');
  assert.equal(result.status, 'executed');
  assert.ok(result.categoryA);
  assert.ok(result.categoryB);
  assert.ok(typeof result.delta === 'number');
});

test('comparator: account_vs_account compara top 2 contas', () => {
  const snapshot = buildSnapshot();
  snapshot.balance.byAccount.push({ id: 'acc-2', name: 'Poupança', type: 'savings', balance: 5000 });
  const result = compareRuntimePeriods(snapshot, '2026-08', null, 'account_vs_account');
  assert.equal(result.status, 'executed');
  assert.ok(result.accountA);
  assert.ok(result.accountB);
});

test('comparator: tipo inválido retorna invalid_type', () => {
  const snapshot = buildSnapshot();
  const result = compareRuntimePeriods(snapshot, '2026-08', '2026-07', 'invalid_type');
  assert.equal(result.status, 'invalid_type');
});

test('comparator: sem dados retorna no_data', () => {
  const result = compareRuntimePeriods({ hasData: false }, '2026-08', '2026-07', 'month_over_month');
  assert.equal(result.status, 'no_data');
});

test('comparator: compareMultipleRuntimePeriods compara série', () => {
  const snapshot = buildSnapshot();
  const result = compareMultipleRuntimePeriods(snapshot, ['2026-06', '2026-07', '2026-08'], 'month_over_month');
  assert.ok(result.comparisons.length === 2);
});

test('comparator: getSupportedComparisonTypes retorna lista', () => {
  const types = getSupportedComparisonTypes();
  assert.ok(Array.isArray(types));
  assert.ok(types.includes('month_over_month'));
  assert.ok(types.includes('income_vs_expense'));
  assert.ok(types.includes('category_vs_category'));
});

test('comparator: isValidComparisonType valida corretamente', () => {
  assert.ok(isValidComparisonType('month_over_month'));
  assert.ok(isValidComparisonType('income_vs_expense'));
  assert.ok(!isValidComparisonType('invalid_type'));
});

test('comparator: resultado é serializável', () => {
  const snapshot = buildSnapshot();
  const result = compareRuntimePeriods(snapshot, '2026-08', '2026-07', 'month_over_month');
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});