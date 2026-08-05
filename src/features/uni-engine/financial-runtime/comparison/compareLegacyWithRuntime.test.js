// Testes do Comparador Legado × Runtime (Fase 17, Bloco 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareLegacyWithRuntime, getComparisonSummary } from '../comparison/index.js';

// runtimeResult.executionResult é sempre o retorno REAL de executeFinancialQuery
// (ver runFinancialRuntimeShadow.js) -- {status, results: {accounts, cashflow,
// categories, goals, credit}}, nunca um {data: {...}} genérico. A fixture
// anterior inventava um formato que extractMetricsFromRuntime nunca lê
// (result.executionResult.results), por isso toda métrica do runtime saía
// vazia e a comparação nunca alinhava, mesmo quando os valores batiam.
function buildRuntimeResult(status, { primaryValue, metric }) {
  const results = metric === 'totalBalance'
    ? { accounts: { data: [{ id: 'acc-1', name: 'Conta', balance: primaryValue }] } }
    : metric === 'monthlyExpense'
      ? { cashflow: { monthlyIncome: 0, monthlyExpense: primaryValue, monthlyResult: -primaryValue } }
      : {};
  return {
    status,
    intent: { type: 'balance_query' },
    temporal: { entity: 'this_month' },
    executionResult: { status: 'executed', results },
  };
}

test('comparison: sem resposta legada retorna no_data', () => {
  const result = compareLegacyWithRuntime(null, buildRuntimeResult('completed', { primaryValue: 5000 }));
  assert.equal(result.status, 'no_data');
  assert.equal(result.legacyPresent, false);
});

test('comparison: sem resultado runtime retorna runtime_missing', () => {
  const result = compareLegacyWithRuntime('Seu saldo é R$ 5.000,00', null);
  assert.equal(result.status, 'runtime_missing');
  assert.equal(result.runtimePresent, false);
});

test('comparison: métricas alinhadas retorna aligned', () => {
  const legacy = 'Seu saldo total é R$ 5.000,00';
  const runtime = buildRuntimeResult('completed', { primaryValue: 5000, metric: 'totalBalance' });
  const result = compareLegacyWithRuntime(legacy, runtime);
  assert.equal(result.status, 'aligned');
  assert.equal(result.metricDivergences.length, 0);
});

test('comparison: métricas divergentes retorna divergent', () => {
  const legacy = 'Seu saldo total é R$ 5.000,00';
  const runtime = buildRuntimeResult('completed', { primaryValue: 6000, metric: 'totalBalance' });
  const result = compareLegacyWithRuntime(legacy, runtime);
  assert.equal(result.status, 'divergent');
  assert.ok(result.metricDivergences.length > 0);
  assert.ok(result.metricDivergences[0].severity === 'high');
});

test('comparison: intenção divergente detectada', () => {
  const legacy = 'Você gastou R$ 800,00 este mês';
  const runtime = buildRuntimeResult('completed', { primaryValue: 800, metric: 'monthlyExpense' });
  runtime.intent = { type: 'expense_query' };
  const result = compareLegacyWithRuntime(legacy, runtime);
  assert.ok(!result.intentComparison.aligned);
});

test('comparison: getComparisonSummary retorna texto', () => {
  const aligned = { status: 'aligned', summary: { totalDivergences: 0, highSeverity: 0 } };
  assert.equal(getComparisonSummary(aligned), 'Legado e runtime financeiro alinhados.');

  const minor = { status: 'minor_divergence', summary: { totalDivergences: 1, highSeverity: 0 } };
  assert.ok(getComparisonSummary(minor).includes('Pequenas divergências'));

  const divergent = { status: 'divergent', summary: { totalDivergences: 2, highSeverity: 1 } };
  assert.ok(getComparisonSummary(divergent).includes('Divergências significativas'));

  const noData = { status: 'no_data' };
  assert.equal(getComparisonSummary(noData), 'Resposta legada não disponível para comparação.');
});

test('comparison: resultado é serializável', () => {
  const legacy = 'Seu saldo é R$ 5.000,00';
  const runtime = buildRuntimeResult('completed', { primaryValue: 5000 });
  const result = compareLegacyWithRuntime(legacy, runtime);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});