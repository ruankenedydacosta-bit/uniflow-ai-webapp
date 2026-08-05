// Uni Engine — Fase 19: Rollout Control — testes para financialRolloutComparison.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinancialRolloutComparison,
  validateFinancialRolloutComparison,
} from './financialRolloutComparison.js';

const createEntry = (overrides = {}) => ({
  selectedSource: 'legacy',
  confidence: 0.9,
  executionTimeMs: 10,
  reasonCodes: [],
  ...overrides,
});

test('comparison - buildFinancialRolloutComparison retorna estrutura completa', () => {
  const control = [createEntry({ selectedSource: 'legacy' }), createEntry({ selectedSource: 'financial_runtime', confidence: 0.95 })];
  const canary = [createEntry({ selectedSource: 'financial_runtime', confidence: 0.92 }), createEntry({ selectedSource: 'financial_runtime', confidence: 0.88 })];

  const result = buildFinancialRolloutComparison({ controlEntries: control, canaryEntries: canary });

  assert.ok(typeof result === 'object');
  assert.ok(typeof result.timestamp === 'number');
  assert.ok(typeof result.totalEntries === 'number');
  assert.equal(result.totalEntries, 4);
  assert.ok(result.control);
  assert.ok(result.canary);
  assert.ok(typeof result.divergenceCount === 'number');
  assert.ok(typeof result.agreementPercentage === 'number');
  assert.ok(typeof result.blockedReasons === 'object');
});

test('comparison - control metrics calculados corretamente', () => {
  const control = [
    createEntry({ selectedSource: 'legacy', confidence: 0.9, executionTimeMs: 10 }),
    createEntry({ selectedSource: 'legacy', confidence: 0.85, executionTimeMs: 15 }),
    createEntry({ selectedSource: 'financial_runtime', confidence: 0.95, executionTimeMs: 20 }),
  ];
  const canary = [];

  const result = buildFinancialRolloutComparison({ controlEntries: control, canaryEntries: canary });

  assert.equal(result.control.total, 3);
  assert.equal(result.control.selectedLegacy, 2);
  assert.equal(result.control.selectedRuntime, 1);
  assert.equal(result.control.averageConfidence, (0.9 + 0.85 + 0.95) / 3);
  assert.equal(result.control.averageExecutionTime, (10 + 15 + 20) / 3);
});

test('comparison - canary metrics calculados corretamente', () => {
  const control = [];
  const canary = [
    createEntry({ selectedSource: 'financial_runtime', confidence: 0.92, executionTimeMs: 12 }),
    createEntry({ selectedSource: 'financial_runtime', confidence: 0.88, executionTimeMs: 18 }),
    createEntry({ selectedSource: 'legacy', confidence: 0.9, executionTimeMs: 8 }),
  ];

  const result = buildFinancialRolloutComparison({ controlEntries: control, canaryEntries: canary });

  assert.equal(result.canary.total, 3);
  assert.equal(result.canary.selectedRuntime, 2);
  assert.equal(result.canary.selectedLegacy, 1);
  assert.equal(result.canary.averageConfidence, (0.92 + 0.88 + 0.9) / 3);
  assert.equal(result.canary.averageExecutionTime, (12 + 18 + 8) / 3);
});

test('comparison - divergenceCount = selectedRuntime total', () => {
  const control = [createEntry({ selectedSource: 'legacy' }), createEntry({ selectedSource: 'financial_runtime' })];
  const canary = [createEntry({ selectedSource: 'financial_runtime' }), createEntry({ selectedSource: 'legacy' })];

  const result = buildFinancialRolloutComparison({ controlEntries: control, canaryEntries: canary });

  assert.equal(result.divergenceCount, 2);
});

test('comparison - agreementPercentage calculado corretamente', () => {
  const control = [createEntry({ selectedSource: 'legacy' }), createEntry({ selectedSource: 'legacy' })];
  const canary = [createEntry({ selectedSource: 'legacy' }), createEntry({ selectedSource: 'legacy' })];

  const result = buildFinancialRolloutComparison({ controlEntries: control, canaryEntries: canary });

  assert.equal(result.agreementPercentage, 100);
});

test('comparison - agreementPercentage 0 quando só runtime selecionado', () => {
  const control = [createEntry({ selectedSource: 'financial_runtime' }), createEntry({ selectedSource: 'financial_runtime' })];
  const canary = [createEntry({ selectedSource: 'financial_runtime' }), createEntry({ selectedSource: 'financial_runtime' })];

  const result = buildFinancialRolloutComparison({ controlEntries: control, canaryEntries: canary });

  assert.equal(result.agreementPercentage, 0);
});

test('comparison - agreementPercentage parcial', () => {
  const control = [createEntry({ selectedSource: 'legacy' }), createEntry({ selectedSource: 'financial_runtime' })];
  const canary = [createEntry({ selectedSource: 'legacy' }), createEntry({ selectedSource: 'legacy' })];

  const result = buildFinancialRolloutComparison({ controlEntries: control, canaryEntries: canary });

  assert.ok(result.agreementPercentage > 0 && result.agreementPercentage < 100);
});

test('comparison - blockedReasons agrega reasonCodes de ambas cohortes', () => {
  const control = [
    createEntry({ reasonCodes: ['BLOCKED_CONFIDENCE', 'BLOCKED_IDENTITY'] }),
    createEntry({ reasonCodes: ['BLOCKED_CONFIDENCE'] }),
  ];
  const canary = [
    createEntry({ reasonCodes: ['CANARY_INELIGIBLE', 'BLOCKED_CONFIDENCE'] }),
  ];

  const result = buildFinancialRolloutComparison({ controlEntries: control, canaryEntries: canary });

  assert.equal(result.blockedReasons['BLOCKED_CONFIDENCE'], 3);
  assert.equal(result.blockedReasons['BLOCKED_IDENTITY'], 1);
  assert.equal(result.blockedReasons['CANARY_INELIGIBLE'], 1);
});

test('comparison - arrays vazios retornam métricas zeradas', () => {
  const result = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });

  assert.equal(result.totalEntries, 0);
  assert.equal(result.control.total, 0);
  assert.equal(result.canary.total, 0);
  assert.equal(result.divergenceCount, 0);
  assert.equal(result.agreementPercentage, 0);
  assert.deepEqual(result.blockedReasons, {});
});

test('comparison - entradas sem confidence/executionTime usam 0 na média', () => {
  const control = [{ selectedSource: 'legacy', reasonCodes: [] }];
  const canary = [{ selectedSource: 'legacy', reasonCodes: [] }];

  const result = buildFinancialRolloutComparison({ controlEntries: control, canaryEntries: canary });

  assert.equal(result.control.averageConfidence, 0);
  assert.equal(result.control.averageExecutionTime, 0);
  assert.equal(result.canary.averageConfidence, 0);
  assert.equal(result.canary.averageExecutionTime, 0);
});

test('comparison - identity opcional não afeta métricas', () => {
  const control = [createEntry({ userId: 'user-1' })];
  const canary = [createEntry({ userId: 'user-2' })];

  const result = buildFinancialRolloutComparison({ controlEntries: control, canaryEntries: canary, identity: { userId: 'test' } });

  assert.equal(result.control.total, 1);
  assert.equal(result.canary.total, 1);
});

test('compare - validateFinancialRolloutComparison aceita comparação válida', () => {
  const comparison = buildFinancialRolloutComparison({
    controlEntries: [createEntry()],
    canaryEntries: [createEntry()],
  });

  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('compare - validateFinancialRolloutComparison rejeita null/undefined', () => {
  let result = validateFinancialRolloutComparison(null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('COMPARISON_INVALID'));

  result = validateFinancialRolloutComparison(undefined);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('COMPARISON_INVALID'));
});

test('compare - validateFinancialRolloutComparison rejeita timestamp inválido', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.timestamp = 'invalid';
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('TIMESTAMP_INVALID'));
});

test('compare - validateFinancialRolloutComparison rejeita totalEntries inválido', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.totalEntries = 'not a number';
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('TOTAL_ENTRIES_INVALID'));
});

test('compare - validateFinancialRolloutComparison rejeita control inválido', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.control = null;
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CONTROL_METRICS_INVALID'));
});

test('compare - validateFinancialRolloutComparison rejeita canary inválido', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.canary = 'not an object';
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('CANARY_METRICS_INVALID'));
});

test('compare - validateFinancialRolloutComparison valida campos obrigatórios de control', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.control = { total: 1 }; // faltando selectedRuntime, selectedLegacy, averageConfidence, averageExecutionTime
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('control_')));
});

test('compare - validateFinancialRolloutComparison valida campos obrigatórios de canary', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.canary = { total: 1 }; // faltando campos
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('canary_')));
});

test('compare - validateFinancialRolloutComparison rejeita divergenceCount inválido', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.divergenceCount = 'invalid';
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('DIVERGENCE_COUNT_INVALID'));
});

test('compare - validateFinancialRolloutComparison rejeita agreementPercentage inválido', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.agreementPercentage = 'invalid';
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('AGREEMENT_PERCENTAGE_INVALID'));
});

test('compare - validateFinancialRolloutComparison rejeita agreementPercentage fora de range', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.agreementPercentage = 150;
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('AGREEMENT_PERCENTAGE_OUT_OF_RANGE'));
});

test('compare - validateFinancialRolloutComparison rejeita agreementPercentage negativo', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.agreementPercentage = -10;
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('AGREEMENT_PERCENTAGE_OUT_OF_RANGE'));
});

test('compare - validateFinancialRolloutComparison valida blockedReasons objeto', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.blockedReasons = 'not an object';
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('BLOCKED_REASONS_INVALID'));
});

test('compare - validateFinancialRolloutComparison valida entradas blockedReasons', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.blockedReasons = { 'INVALID_CODE': 'not a number' };
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('BLOCKED_REASON_INVALID'));
});

test('compare - validateFinancialRolloutComparison aceita blockedReasons válido', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.blockedReasons = { 'BLOCKED_CONFIDENCE': 5, 'CANARY_INELIGIBLE': 3 };
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, true);
});

test('compare - validateFinancialRolloutComparison valida averageConfidence range 0-1', () => {
  const comparison = buildFinancialRolloutComparison({ controlEntries: [], canaryEntries: [] });
  comparison.control = { total: 1, selectedRuntime: 0, selectedLegacy: 1, averageConfidence: 1.5, averageExecutionTime: 10 };
  comparison.canary = { total: 1, selectedRuntime: 0, selectedLegacy: 1, averageConfidence: 0.5, averageExecutionTime: 10 };
  const result = validateFinancialRolloutComparison(comparison);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes('control_AVERAGE_CONFIDENCE_OUT_OF_RANGE')));
});