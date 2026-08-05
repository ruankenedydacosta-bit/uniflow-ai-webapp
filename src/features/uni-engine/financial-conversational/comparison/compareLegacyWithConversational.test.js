// Testes do Comparador Legado × Engine (Fase 16, Bloco 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareLegacyWithConversational, getComparisonSummary } from '../comparison/index.js';

function buildConversationalResult(status, data) {
  return {
    status,
    intent: { type: 'balance_query' },
    temporalResolution: { resolved: { type: 'current_month' } },
    executionResult: { data, status: 'executed' },
  };
}

test('comparison: sem resposta legada retorna no_data', () => {
  const result = compareLegacyWithConversational(null, buildConversationalResult('completed', { primaryValue: 5000 }));
  assert.equal(result.status, 'no_data');
  assert.equal(result.legacyPresent, false);
});

test('comparison: sem resultado conversacional retorna conversational_missing', () => {
  const result = compareLegacyWithConversational('Seu saldo é R$ 5.000,00', null);
  assert.equal(result.status, 'conversational_missing');
  assert.equal(result.conversationalPresent, false);
});

test('comparison: métricas alinhadas retorna aligned', () => {
  const legacy = 'Seu saldo total é R$ 5.000,00';
  const conversational = buildConversationalResult('completed', { primaryValue: 5000, metric: 'totalBalance' });
  const result = compareLegacyWithConversational(legacy, conversational);
  assert.equal(result.status, 'aligned');
  assert.equal(result.metricDivergences.length, 0);
});

test('comparison: métricas divergentes retorna divergent', () => {
  const legacy = 'Seu saldo total é R$ 5.000,00';
  const conversational = buildConversationalResult('completed', { primaryValue: 6000, metric: 'totalBalance' }); // 20% diferença
  const result = compareLegacyWithConversational(legacy, conversational);
  assert.equal(result.status, 'divergent');
  assert.ok(result.metricDivergences.length > 0);
  assert.ok(result.metricDivergences[0].severity === 'high');
});

test('comparison: intenção divergente detectada', () => {
  const legacy = 'Você gastou R$ 800,00 este mês';
  const conversational = buildConversationalResult('completed', { primaryValue: 800, metric: 'monthlyExpense' });
  conversational.intent = { type: 'expense_query' };
  const result = compareLegacyWithConversational(legacy, conversational);
  // Legacy tem expense_query implícito, conversacional é balance_query
  assert.ok(!result.intentComparison.aligned);
});

test('comparison: getComparisonSummary retorna texto', () => {
  const aligned = { status: 'aligned', summary: { totalDivergences: 0, highSeverity: 0 } };
  assert.equal(getComparisonSummary(aligned), 'Legado e engine conversacional alinhados.');

  const minor = { status: 'minor_divergence', summary: { totalDivergences: 1, highSeverity: 0 } };
  assert.ok(getComparisonSummary(minor).includes('Pequenas divergências'));

  const divergent = { status: 'divergent', summary: { totalDivergences: 2, highSeverity: 1 } };
  assert.ok(getComparisonSummary(divergent).includes('Divergências significativas'));

  const noData = { status: 'no_data' };
  assert.equal(getComparisonSummary(noData), 'Resposta legada não disponível para comparação.');
});

test('comparison: resultado é serializável', () => {
  const legacy = 'Seu saldo é R$ 5.000,00';
  const conversational = buildConversationalResult('completed', { primaryValue: 5000 });
  const result = compareLegacyWithConversational(legacy, conversational);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});