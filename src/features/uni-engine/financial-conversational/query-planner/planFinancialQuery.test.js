// Testes do Query Planner Financeiro (Fase 16, Bloco 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFinancialQuery, getPlanSteps, getIntentPlanType } from '../query-planner/index.js';

function buildEnrichedContext() {
  return {
    hasData: true,
    metrics: {
      totalBalance: 5000,
      monthlyIncome: 6000,
      monthlyExpense: 3000,
      monthlyResult: 3000,
      savingsRate: 0.5,
      liquidBalance: 6500,
      netPatrimony: 11500,
      creditUtilization: 0.2,
      reserveCoverage: 2.0,
    },
    temporal: { context: { periodKey: '2026-08', resolved: { type: 'current_month' } } },
    conversation: { turnCount: 1, hasFinancialContext: true },
  };
}

test('planner: intenção desconhecida retorna plano inválido', () => {
  const intent = { type: 'unknown_intent', confidence: 0.5 };
  const plan = planFinancialQuery(intent, buildEnrichedContext());
  assert.equal(plan.status, 'invalid_intent');
});

test('planner: balance_query gera plano single_metric', () => {
  const intent = { type: 'balance_query', confidence: 0.9 };
  const plan = planFinancialQuery(intent, buildEnrichedContext());
  assert.equal(plan.type, 'single_metric');
  assert.equal(plan.status, 'planned');
  assert.ok(plan.steps.length > 0);
  assert.ok(plan.requiredMetrics.includes('totalBalance'));
});

test('planner: expense_query gera plano single_metric', () => {
  const intent = { type: 'expense_query', confidence: 0.9 };
  const plan = planFinancialQuery(intent, buildEnrichedContext());
  assert.equal(plan.type, 'single_metric');
  assert.ok(plan.requiredMetrics.includes('monthlyExpense'));
});

test('planner: category_breakdown_query gera plano breakdown', () => {
  const intent = { type: 'category_breakdown_query', confidence: 0.8 };
  const plan = planFinancialQuery(intent, buildEnrichedContext());
  assert.equal(plan.type, 'breakdown');
  assert.ok(plan.steps.some(s => s.step === 'fetch_breakdown'));
});

test('planner: comparison_query gera plano comparison', () => {
  const intent = { type: 'comparison_query', confidence: 0.8 };
  const plan = planFinancialQuery(intent, buildEnrichedContext());
  assert.equal(plan.type, 'comparison');
  assert.ok(plan.steps.some(s => s.step === 'fetch_current_period'));
  assert.ok(plan.steps.some(s => s.step === 'calculate_delta'));
});

test('planner: projection_query gera plano projection', () => {
  const intent = { type: 'projection_query', confidence: 0.8 };
  const plan = planFinancialQuery(intent, buildEnrichedContext());
  assert.equal(plan.type, 'projection');
  assert.ok(plan.steps.some(s => s.step === 'calculate_trend'));
});

test('planner: financial_health_query gera plano health_check', () => {
  const intent = { type: 'financial_health_query', confidence: 0.8 };
  const plan = planFinancialQuery(intent, buildEnrichedContext());
  assert.equal(plan.type, 'health_check');
  assert.ok(plan.steps.some(s => s.step === 'run_diagnostics'));
});

test('planner: getIntentPlanType retorna tipo correto', () => {
  assert.equal(getIntentPlanType('balance_query'), 'single_metric');
  assert.equal(getIntentPlanType('comparison_query'), 'comparison');
  assert.equal(getIntentPlanType('projection_query'), 'projection');
});

test('planner: getPlanSteps retorna passos', () => {
  const steps = getPlanSteps('single_metric');
  assert.ok(steps.length > 0);
  assert.ok(steps.some(s => s.step === 'fetch_metric'));
});

test('planner: plano é serializável', () => {
  const intent = { type: 'balance_query', confidence: 0.9 };
  const plan = planFinancialQuery(intent, buildEnrichedContext());
  assert.doesNotThrow(() => JSON.stringify(plan));
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan);
});