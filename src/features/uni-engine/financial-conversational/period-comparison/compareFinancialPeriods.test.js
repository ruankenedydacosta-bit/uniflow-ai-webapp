// Testes do Comparador de Períodos (Fase 16, Bloco 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareFinancialPeriods, compareMultiplePeriods } from '../period-comparison/index.js';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/index.js';

function buildSnapshot() {
  return buildFinancialReasoningSnapshot({
    accounts: [
      { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 1500 },
    ],
    categories: [
      { id: 'cat-1', name: 'Salário', transaction_type: 'income' },
      { id: 'cat-2', name: 'Alimentação', transaction_type: 'expense' },
    ],
    transactions: [
      { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 5000, transaction_date: '2026-07-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
      { id: 'tx-2', account_id: 'acc-1', transaction_type: 'expense', amount: 1500, transaction_date: '2026-07-15', status: 'completed', category_id: 'cat-2', description: 'Mercado' },
      { id: 'tx-3', account_id: 'acc-1', transaction_type: 'income', amount: 6000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
      { id: 'tx-4', account_id: 'acc-1', transaction_type: 'expense', amount: 1800, transaction_date: '2026-08-15', status: 'completed', category_id: 'cat-2', description: 'Mercado' },
    ],
    referenceDate: '2026-08-15',
  });
}

test('period: month_over_month compara meses adjacentes', () => {
  const snapshot = buildSnapshot();
  const result = compareFinancialPeriods(snapshot, '2026-08', '2026-07', 'month_over_month');
  assert.equal(result.status, 'executed');
  assert.ok(result.deltas);
  assert.ok(result.percentages);
  assert.equal(result.periodA.label, '2026-08');
  assert.equal(result.periodB.label, '2026-07');
});

test('period: year_over_year compara mesmo mês anos diferentes', () => {
  const snapshot = buildSnapshot();
  // Adicionar dados de 2025
  snapshot.flow.months.push(
    { month: '2025-08', income: 4000, expense: 1200, result: 2800, transactionCount: 2 },
  );
  const result = compareFinancialPeriods(snapshot, '2026-08', '2025-08', 'year_over_year');
  assert.equal(result.status, 'executed');
  assert.ok(result.deltas);
});

test('period: trend_analysis retorna tendências', () => {
  const snapshot = buildSnapshot();
  const result = compareFinancialPeriods(snapshot, '2026-08', null, 'trend_analysis');
  assert.equal(result.status, 'executed');
  assert.ok(result.trends.income);
  assert.ok(result.trends.expense);
  assert.ok(result.trends.result);
});

test('period: sem dados retorna no_data', () => {
  const result = compareFinancialPeriods({ hasData: false }, '2026-08', '2026-07', 'month_over_month');
  assert.equal(result.status, 'no_data');
});

test('period: tipo inválido retorna invalid_comparison_type', () => {
  const snapshot = buildSnapshot();
  const result = compareFinancialPeriods(snapshot, '2026-08', '2026-07', 'invalid_type');
  assert.equal(result.status, 'invalid_comparison_type');
});

test('period: partial_data quando mês não existe', () => {
  const snapshot = buildSnapshot();
  const result = compareFinancialPeriods(snapshot, '2026-09', '2026-07', 'month_over_month');
  assert.equal(result.status, 'partial_data');
});

test('period: compareMultiplePeriods compara série', () => {
  const snapshot = buildSnapshot();
  const result = compareMultiplePeriods(snapshot, ['2026-06', '2026-07', '2026-08'], 'month_over_month');
  assert.ok(result.comparisons.length === 2);
});

test('period: resultado é serializável', () => {
  const snapshot = buildSnapshot();
  const result = compareFinancialPeriods(snapshot, '2026-08', '2026-07', 'month_over_month');
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});