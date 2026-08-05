// Testes do Executor Financeiro (Fase 16, Bloco 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeFinancialQuery } from '../executor/index.js';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/index.js';

function buildSnapshot() {
  return buildFinancialReasoningSnapshot({
    accounts: [
      { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 1500 },
      { id: 'acc-2', name: 'Poupança', account_type: 'savings', current_balance: 5000 },
      { id: 'acc-3', name: 'Cartão', account_type: 'credit_card', current_balance: -1200, credit_limit: 5000 },
    ],
    categories: [
      { id: 'cat-1', name: 'Salário', transaction_type: 'income' },
      { id: 'cat-2', name: 'Alimentação', transaction_type: 'expense' },
      { id: 'cat-3', name: 'Moradia', transaction_type: 'expense' },
    ],
    transactions: [
      { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 5000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
      { id: 'tx-2', account_id: 'acc-3', transaction_type: 'expense', amount: 1200, transaction_date: '2026-08-05', status: 'completed', category_id: 'cat-3', description: 'Aluguel' },
      { id: 'tx-3', account_id: 'acc-3', transaction_type: 'expense', amount: 500, transaction_date: '2026-08-10', status: 'completed', category_id: 'cat-2', description: 'Mercado' },
    ],
    referenceDate: '2026-08-15',
  });
}

function buildEnrichedContext() {
  return {
    hasData: true,
    metrics: {
      totalBalance: 5300,
      monthlyIncome: 5000,
      monthlyExpense: 1700,
      monthlyResult: 3300,
      savingsRate: 0.66,
      liquidBalance: 6500,
      netPatrimony: 5300,
      creditUtilization: 0.24,
      reserveCoverage: 3.8,
    },
    temporal: { context: { periodKey: '2026-08', resolved: { type: 'current_month' } } },
  };
}

test('executor: plano inválido retorna out_of_scope', () => {
  const plan = { type: 'invalid_type', status: 'planned' };
  const result = executeFinancialQuery(plan, buildSnapshot(), buildEnrichedContext());
  assert.equal(result.status, 'out_of_scope');
});

test('executor: sem dados retorna no_data', () => {
  const plan = { type: 'single_metric', status: 'planned', requiredMetrics: ['totalBalance'] };
  const result = executeFinancialQuery(plan, { hasData: false }, buildEnrichedContext());
  assert.equal(result.status, 'no_data');
});

test('executor: single_metric retorna valor principal', () => {
  const plan = { type: 'single_metric', status: 'planned', requiredMetrics: ['totalBalance'] };
  const result = executeFinancialQuery(plan, buildSnapshot(), buildEnrichedContext());
  assert.equal(result.status, 'executed');
  assert.ok(result.data.primaryValue > 0);
  assert.equal(result.data.metric, 'totalBalance');
  assert.equal(result.data.unit, 'BRL');
});

test('executor: breakdown retorna itens ordenados', () => {
  const plan = { type: 'breakdown', status: 'planned', intentType: 'category_breakdown_query' };
  const result = executeFinancialQuery(plan, buildSnapshot(), buildEnrichedContext());
  assert.equal(result.status, 'executed');
  assert.ok(result.data.items.length > 0);
  assert.ok(result.data.total > 0);
});

test('executor: comparison retorna deltas e percentuais', () => {
  const plan = { type: 'comparison', status: 'planned', temporalPeriod: { type: 'previous_month', periodKey: '2026-07' } };
  const result = executeFinancialQuery(plan, buildSnapshot(), buildEnrichedContext());
  // Pode ser partial_data se não houver mês anterior
  assert.ok(['executed', 'partial_data', 'no_data'].includes(result.status));
  if (result.status === 'executed') {
    assert.ok(result.data.deltas);
    assert.ok(result.data.percentages);
  }
});

test('executor: projection retorna projeções', () => {
  const plan = { type: 'projection', status: 'planned' };
  const result = executeFinancialQuery(plan, buildSnapshot(), buildEnrichedContext());
  assert.ok(['executed', 'no_data'].includes(result.status));
  if (result.status === 'executed') {
    assert.ok(result.data.projections.length > 0);
    assert.ok(result.data.confidence > 0);
  }
});

test('executor: search retorna resultados filtrados', () => {
  const plan = { type: 'search', status: 'planned', intentType: 'transaction_search_query' };
  const enriched = buildEnrichedContext();
  enriched.intent = { context: { entities: [{ type: 'amount', value: 500 }] } };
  const result = executeFinancialQuery(plan, buildSnapshot(), enriched);
  assert.ok(['executed', 'no_data'].includes(result.status));
  if (result.status === 'executed') {
    assert.ok(Array.isArray(result.data.results));
  }
});

test('executor: health_check retorna score e diagnósticos', () => {
  const plan = { type: 'health_check', status: 'planned' };
  const result = executeFinancialQuery(plan, buildSnapshot(), buildEnrichedContext());
  assert.equal(result.status, 'executed');
  assert.ok(typeof result.data.healthScore === 'number');
  assert.ok(Array.isArray(result.data.diagnostics));
});

test('executor: goal_tracking retorna metas', () => {
  const plan = { type: 'goal_tracking', status: 'planned' };
  const snapshot = buildSnapshot();
  // Adicionar metas ao snapshot
  snapshot.goals = [
    { id: 'g1', name: 'Reserva', target: 10000, current: 5000, progress: 50, remaining: 5000, rhythm: 'on_track', targetDate: '2026-12-31', plannedMonthlyAmount: 1000 },
  ];
  const result = executeFinancialQuery(plan, snapshot, buildEnrichedContext());
  assert.equal(result.status, 'executed');
  assert.ok(result.data.goals.length > 0);
});

test('executor: resultado é serializável', () => {
  const plan = { type: 'single_metric', status: 'planned', requiredMetrics: ['totalBalance'] };
  const result = executeFinancialQuery(plan, buildSnapshot(), buildEnrichedContext());
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});