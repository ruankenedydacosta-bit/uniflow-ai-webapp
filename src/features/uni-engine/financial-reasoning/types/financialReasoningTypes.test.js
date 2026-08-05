// Testes dos tipos do Motor de Raciocínio Financeiro (Fase 15).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  FINANCIAL_REASONING_VERSION,
  FINANCIAL_DIAGNOSTIC_TYPES,
  FINANCIAL_DIAGNOSTIC_PRIORITIES,
  FINANCIAL_INFERENCE_TYPES,
  FINANCIAL_PLANNER_OBJECTIVES,
  FINANCIAL_PLANNER_ACTIONS,
  FINANCIAL_COMPARISON_STATUSES,
  FINANCIAL_REASONING_STATUSES,
  FINANCIAL_REASONING_STAGES,
  isFinancialDiagnosticType,
  isFinancialDiagnosticPriority,
  isFinancialInferenceType,
  isFinancialPlannerObjective,
  isFinancialPlannerAction,
  isFinancialComparisonStatus,
  isFinancialReasoningStatus,
  isFinancialReasoningStage,
} from './financialReasoningTypes.js';

test('tipos: versão estável e constante', () => {
  assert.equal(FINANCIAL_REASONING_VERSION, '1.0');
});

test('tipos: catálogos são frozen e sem duplicatas', () => {
  for (const list of [
    FINANCIAL_DIAGNOSTIC_TYPES,
    FINANCIAL_DIAGNOSTIC_PRIORITIES,
    FINANCIAL_INFERENCE_TYPES,
    FINANCIAL_PLANNER_OBJECTIVES,
    FINANCIAL_PLANNER_ACTIONS,
    FINANCIAL_COMPARISON_STATUSES,
    FINANCIAL_REASONING_STATUSES,
    FINANCIAL_REASONING_STAGES,
  ]) {
    assert.ok(Object.isFrozen(list), 'catálogo deve ser congelado');
    assert.equal(new Set(list).size, list.length, 'catálogo sem duplicatas');
  }
});

test('tipos: todos os diagnósticos exigidos pela Fase 15 existem', () => {
  const expected = [
    'negative_balance',
    'income_decline',
    'expense_growth',
    'recurring_expenses',
    'abnormal_expenses',
    'cash_risk',
    'low_patrimony',
    'credit_dependence',
    'low_liquidity',
    'insufficient_reserve',
    'delayed_goal',
  ];
  for (const item of expected) {
    assert.ok(FINANCIAL_DIAGNOSTIC_TYPES.includes(item), `faltou ${item}`);
  }
});

test('tipos: todos os tipos de inferência exigidos existem', () => {
  const expected = [
    'saves',
    'spends_above_average',
    'maintains_pattern',
    'risk_increasing',
    'positive_trend',
    'negative_trend',
  ];
  for (const item of expected) {
    assert.ok(FINANCIAL_INFERENCE_TYPES.includes(item), `faltou ${item}`);
  }
});

test('tipos: a pipeline observacional tem a ordem fixa do Bloco 7', () => {
  assert.deepEqual(FINANCIAL_REASONING_STAGES, [
    'entry',
    'snapshot',
    'diagnostics',
    'inference',
    'planning',
    'comparison',
    'telemetry',
    'discarded',
  ]);
});

test('tipos: validadores booleanos distinguem membros de forasteiros', () => {
  assert.equal(isFinancialDiagnosticType('cash_risk'), true);
  assert.equal(isFinancialDiagnosticType('fake_risk'), false);
  assert.equal(isFinancialDiagnosticPriority('high'), true);
  assert.equal(isFinancialDiagnosticPriority('urgent'), false);
  assert.equal(isFinancialInferenceType('saves'), true);
  assert.equal(isFinancialInferenceType('spends'), false);
  assert.equal(isFinancialPlannerObjective('build_reserve'), true);
  assert.equal(isFinancialPlannerObjective('gold'), false);
  assert.equal(isFinancialPlannerAction('reserve_policy'), true);
  assert.equal(isFinancialPlannerAction('invest'), false);
  assert.equal(isFinancialComparisonStatus('divergent'), true);
  assert.equal(isFinancialComparisonStatus('merged'), false);
  assert.equal(isFinancialReasoningStatus('shadow_completed'), true);
  assert.equal(isFinancialReasoningStatus('killed'), false);
  assert.equal(isFinancialReasoningStage('telemetry'), true);
  assert.equal(isFinancialReasoningStage('execute'), false);
});