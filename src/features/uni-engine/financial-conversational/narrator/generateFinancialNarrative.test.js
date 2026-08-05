// Testes do Narrador Financeiro (Fase 16, Bloco 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateFinancialNarrative, getAvailableStyles, getAvailableNarrativeTypes } from '../narrator/index.js';
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
      { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 5000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
      { id: 'tx-2', account_id: 'acc-1', transaction_type: 'expense', amount: 800, transaction_date: '2026-08-05', status: 'completed', category_id: 'cat-2', description: 'Mercado' },
    ],
    referenceDate: '2026-08-15',
  });
}

function buildEnrichedContext() {
  return {
    hasData: true,
    metrics: {
      totalBalance: 5000,
      monthlyIncome: 5000,
      monthlyExpense: 800,
      monthlyResult: 4200,
      savingsRate: 0.84,
      liquidBalance: 1500,
      netPatrimony: 5000,
      creditUtilization: 0,
      reserveCoverage: 1.8,
    },
    temporal: { context: { periodKey: '2026-08', resolved: { type: 'current_month' } } },
  };
}

function buildExecutionResult(type, data) {
  return { status: 'executed', planType: type, data };
}

test('narrator: single_metric gera resposta direta', () => {
  const plan = { type: 'single_metric' };
  const execution = buildExecutionResult('single_metric', { primaryValue: 5000, metric: 'totalBalance', label: 'saldo total' });
  const narrative = generateFinancialNarrative(execution, plan, buildEnrichedContext(), 'conversational');
  assert.ok(narrative.text.includes('5.000,00') || narrative.text.includes('5000'));
  assert.equal(narrative.type, 'direct_answer');
});

test('narrator: breakdown gera narrativa com top item', () => {
  const plan = { type: 'breakdown' };
  const execution = buildExecutionResult('breakdown', { breakdownType: 'category', items: [{ name: 'Alimentação', value: 800 }], total: 800 });
  const narrative = generateFinancialNarrative(execution, plan, buildEnrichedContext(), 'conversational');
  assert.ok(narrative.text.includes('Alimentação'));
});

test('narrator: comparison gera narrativa comparativa', () => {
  const plan = { type: 'comparison' };
  const execution = buildExecutionResult('comparison', {
    deltas: { income: 1000, expense: 300, result: 700 },
    percentages: { income: 20, expense: 20, result: 20 },
    currentPeriod: { month: '2026-08' },
    comparisonPeriod: { month: '2026-07' },
  });
  const narrative = generateFinancialNarrative(execution, plan, buildEnrichedContext(), 'conversational');
  assert.ok(narrative.text.includes('subiu') || narrative.text.includes('caiu') || narrative.text.includes('vari'));
});

test('narrator: health_check gera resumo de saúde', () => {
  const plan = { type: 'health_check' };
  const execution = buildExecutionResult('health_check', { healthScore: 85, diagnostics: [] });
  const narrative = generateFinancialNarrative(execution, plan, buildEnrichedContext(), 'conversational');
  assert.ok(narrative.text.includes('85') || narrative.text.includes('saúde'));
});

test('narrator: goal_tracking gera progresso de metas', () => {
  const plan = { type: 'goal_tracking' };
  const execution = buildExecutionResult('goal_tracking', { 
    summary: { total: 1, onTrack: 1, late: 0, completed: 0 }, 
    goals: [{ name: 'Reserva', progress: 50, rhythm: 'on_track' }] 
  });
  const narrative = generateFinancialNarrative(execution, plan, buildEnrichedContext(), 'conversational');
  assert.ok(narrative.text.includes('meta'));
});

test('narrator: projection inclui disclaimer', () => {
  const plan = { type: 'projection' };
  const execution = buildExecutionResult('projection', { projections: [{ month: '2026-09', income: 5000, expense: 800, result: 4200 }], confidence: 0.7 });
  const narrative = generateFinancialNarrative(execution, plan, buildEnrichedContext(), 'conversational');
  assert.ok(narrative.insights.some(i => i.type === 'disclaimer'));
});

test('narrator: estilos diferentes produzem textos diferentes', () => {
  const plan = { type: 'single_metric' };
  const execution = buildExecutionResult('single_metric', { primaryValue: 5000, metric: 'totalBalance', label: 'saldo total' });
  const concise = generateFinancialNarrative(execution, plan, buildEnrichedContext(), 'concise');
  const detailed = generateFinancialNarrative(execution, plan, buildEnrichedContext(), 'detailed');
  // Concise deve ser mais curto
  assert.ok(concise.text.length <= detailed.text.length);
});

test('narrator: getAvailableStyles retorna estilos', () => {
  const styles = getAvailableStyles();
  assert.ok(styles.includes('concise'));
  assert.ok(styles.includes('conversational'));
  assert.ok(styles.includes('executive'));
});

test('narrator: getAvailableNarrativeTypes retorna tipos', () => {
  const types = getAvailableNarrativeTypes();
  assert.ok(types.includes('direct_answer'));
  assert.ok(types.includes('comparison_narrative'));
  assert.ok(types.includes('alert_narrative'));
});

test('narrator: resultado é serializável', () => {
  const plan = { type: 'single_metric' };
  const execution = buildExecutionResult('single_metric', { primaryValue: 5000, metric: 'totalBalance', label: 'saldo total' });
  const narrative = generateFinancialNarrative(execution, plan, buildEnrichedContext(), 'conversational');
  assert.doesNotThrow(() => JSON.stringify(narrative));
  assert.deepEqual(JSON.parse(JSON.stringify(narrative)), narrative);
});