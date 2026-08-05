// Testes do Financial Inference (Fase 15, Bloco 4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialInference } from './buildFinancialInference.js';
import { buildFinancialReasoningSnapshot } from '../snapshot/buildFinancialSnapshot.js';
import { buildFinancialDiagnostics } from '../diagnostics/buildFinancialDiagnostics.js';
import {
  buildFixtureAccounts,
  buildFixtureCategories,
  buildFixtureTransactions,
} from '../testFixtures.js';

function snapshotFor(overrides = {}) {
  return buildFinancialReasoningSnapshot({
    accounts: buildFixtureAccounts(),
    categories: buildFixtureCategories(),
    transactions: buildFixtureTransactions(),
    ...overrides,
    referenceDate: overrides.referenceDate ?? '2026-08-15',
  });
}

test('inference: sem dados retorna lista vazia', () => {
  assert.deepEqual(buildFinancialInference({ snapshot: null }), []);
  const empty = buildFinancialReasoningSnapshot({});
  assert.deepEqual(buildFinancialInference({ snapshot: empty }), []);
});

test('inference: usuário economiza com taxa de poupança relevante', () => {
  const transactions = [
    { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 8000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
    { id: 'tx-2', account_id: 'acc-4', transaction_type: 'expense', amount: 2000, transaction_date: '2026-08-02', status: 'completed', category_id: 'cat-2', description: 'Despesas' },
  ];
  const inferences = buildFinancialInference({ snapshot: snapshotFor({ transactions }) });
  const saves = inferences.find((item) => item.type === 'saves');
  assert.ok(saves, 'esperado saves');
  assert.ok(saves.confidence >= 0.8);
  assert.equal(saves.asserts, false);
  assert.equal(saves.appliedToDecision, false);
  assert.ok(saves.reasoning.includes('poupança'));
});

test('inference: gasta acima da média com relação superior a 1.15', () => {
  const transactions = [
    { id: 'tx-a', account_id: 'acc-4', transaction_type: 'expense', amount: 500, transaction_date: '2026-07-05', status: 'completed', category_id: 'cat-3', description: 'X' },
    { id: 'tx-b', account_id: 'acc-4', transaction_type: 'expense', amount: 3000, transaction_date: '2026-08-06', status: 'completed', category_id: 'cat-3', description: 'Y' },
  ];
  const inferences = buildFinancialInference({ snapshot: snapshotFor({ transactions }) });
  const above = inferences.find((item) => item.type === 'spends_above_average');
  assert.ok(above, 'esperado spends_above_average');
  assert.ok(above.confidence > 0.5);
});

test('inference: mantém padrão sem desvios', () => {
  const transactions = [
    { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 6000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
    { id: 'tx-2', account_id: 'acc-4', transaction_type: 'expense', amount: 5200, transaction_date: '2026-08-02', status: 'completed', category_id: 'cat-2', description: 'Despesas' },
  ];
  const inferences = buildFinancialInference({ snapshot: snapshotFor({ transactions }) });
  const stable = inferences.find((item) => item.type === 'maintains_pattern');
  assert.ok(stable, 'esperado maintains_pattern');
  assert.equal(stable.confidence, 0.6);
});

test('inference: risco crescente quando diagnóstico de caixa presente', () => {
  const transactions = [
    { id: 'tx-x', account_id: 'acc-4', transaction_type: 'expense', amount: 9000, transaction_date: '2026-08-02', status: 'completed', category_id: 'cat-2', description: 'Grande' },
  ];
  const snapshot = snapshotFor({ transactions });
  const diagnostics = buildFinancialDiagnostics(snapshot);
  const inferences = buildFinancialInference({ snapshot, diagnostics });
  const risk = inferences.find((item) => item.type === 'risk_increasing');
  assert.ok(risk, 'esperado risk_increasing');
  assert.equal(risk.appliedToDecision, false);
});

test('inference: tendência positiva com receita subindo e despesa estável', () => {
  const transactions = [
    { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 6000, transaction_date: '2026-07-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
    { id: 'tx-2', account_id: 'acc-1', transaction_type: 'income', amount: 8000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
    { id: 'tx-3', account_id: 'acc-4', transaction_type: 'expense', amount: 2000, transaction_date: '2026-07-05', status: 'completed', category_id: 'cat-2', description: 'Despesas' },
    { id: 'tx-4', account_id: 'acc-4', transaction_type: 'expense', amount: 2000, transaction_date: '2026-08-05', status: 'completed', category_id: 'cat-2', description: 'Despesas' },
  ];
  const inferences = buildFinancialInference({ snapshot: snapshotFor({ transactions }) });
  const positive = inferences.find((item) => item.type === 'positive_trend');
  assert.ok(positive, 'esperado positive_trend');
});

test('inference: tendência negativa com receita em queda', () => {
  const transactions = [
    { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 8000, transaction_date: '2026-07-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
    { id: 'tx-2', account_id: 'acc-1', transaction_type: 'income', amount: 3000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
  ];
  const inferences = buildFinancialInference({ snapshot: snapshotFor({ transactions }) });
  const negative = inferences.find((item) => item.type === 'negative_trend');
  assert.ok(negative, 'esperado negative_trend');
  assert.equal(negative.asserts, false);
});

test('inference: nenhuma inferência afirma nada (asserts sempre false)', () => {
  const inferences = buildFinancialInference({ snapshot: snapshotFor({}) });
  for (const item of inferences) {
    assert.equal(item.asserts, false, 'nunca afirma');
    assert.equal(item.appliedToDecision, false, 'nunca aplica');
    assert.ok(Array.isArray(item.evidences));
    assert.ok(typeof item.reasoning === 'string');
    assert.ok(item.confidence >= 0 && item.confidence <= 1);
  }
});

test('inference: estrutura serializável e JSON-safe', () => {
  const inferences = buildFinancialInference({ snapshot: snapshotFor({}) });
  assert.doesNotThrow(() => JSON.stringify(inferences));
  assert.deepEqual(JSON.parse(JSON.stringify(inferences)), inferences);
});