// Testes do Financial Comparator (Fase 15, Bloco 6).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareFinancialPipelines } from './buildFinancialComparison.js';
import { buildFinancialReasoningSnapshot } from '../snapshot/buildFinancialSnapshot.js';
import { buildFinancialDiagnostics } from '../diagnostics/buildFinancialDiagnostics.js';

function fixtureSnapshot(overrides = {}) {
  return buildFinancialReasoningSnapshot({
    accounts: [
      { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 1500 },
      { id: 'acc-2', name: 'Poupança', account_type: 'savings', current_balance: 5000 },
      { id: 'acc-4', name: 'Cartão', account_type: 'credit_card', current_balance: -1200, credit_limit: 5000 },
    ],
    categories: [
      { id: 'cat-2', name: 'Moradia', transaction_type: 'expense' },
    ],
    transactions: [
      { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 6000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-2', description: 'Salário' },
      { id: 'tx-2', account_id: 'acc-4', transaction_type: 'expense', amount: 900, transaction_date: '2026-08-02', status: 'completed', category_id: 'cat-2', description: 'Aluguel' },
    ],
    workspaceBalance: 5300,
    referenceDate: '2026-08-15',
    ...overrides,
  });
}

test('comparison: sem dados do motor retorna no_data', () => {
  const result = compareFinancialPipelines({ legacy: null, engineSnapshot: null });
  assert.equal(result.status, 'no_data');
  assert.equal(result.influenceApplied, undefined);
  assert.equal(result.summary.legacyPreserved, true);
  assert.equal(result.summary.influenceApplied, false);
});

test('comparator: alinhado quando legado e motor concordam', () => {
  const snapshot = fixtureSnapshot();
  const legacy = {
    totalBalance: 5300,
    monthlyIncome: 6000,
    monthlyExpense: 900,
    riskSignaled: false,
    creditSignaled: false,
    goalSignaled: false,
  };
  const result = compareFinancialPipelines({ legacy, engineSnapshot: snapshot });
  assert.equal(result.status, 'aligned');
  assert.equal(result.agreement, 1);
  assert.deepEqual(result.divergences, []);
  assert.equal(result.summary.legacyPreserved, true);
  assert.equal(result.summary.influenceApplied, false);
});

test('comparator: divergência quando números não batem', () => {
  const snapshot = fixtureSnapshot();
  const legacy = { totalBalance: 9999, monthlyIncome: 6000, monthlyExpense: 900 };
  const result = compareSnapshot(snapshot, legacy);
  assert.equal(result.status, 'divergent');
  assert.ok(result.divergences.some((item) => item.type === 'financial_figure_mismatch'));
  assert.equal(result.summary.legacyPreserved, true);
  assert.equal(result.summary.influenceApplied, false);
});

test('comparator: caixa negativo sem sinalização gera divergência', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: [{ id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: -800 }],
    transactions: [{ id: 'tx-1', account_id: 'acc-1', transaction_type: 'expense', amount: 500, transaction_date: '2026-08-02', status: 'completed', category_id: 'cat-2', description: 'X' }],
    referenceDate: '2026-08-15',
  });
  const diagnostics = buildFinancialDiagnostics(snapshot);
  const legacy = { totalBalance: -800, monthlyIncome: 0, monthlyExpense: 500, riskSignaled: false };
  const result = compareSnapshot(snapshot, legacy, diagnostics);
  assert.equal(result.status, 'divergent');
  assert.ok(result.divergences.some((item) => item.type === 'negative_cash_unsignaled'));
});

test('comparator: nunca substitui decisões', () => {
  const snapshot = fixtureSnapshot();
  const result = compareSnapshot(snapshot);
  assert.equal(result.summary.influenceApplied, false);
  assert.equal(result.summary.legacyPreserved, true);
});

test('comparator: estrutura serializável e JSON-safe', () => {
  const snapshot = fixtureSnapshot();
  const result = compareSnapshot(snapshot);
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});

function compareSnapshot(snapshot, legacy = null, diagnostics = null) {
  return compareFinancialPipelines({
    legacy,
    engineSnapshot: snapshot,
    engineDiagnostics: diagnostics ?? buildFinancialDiagnostics(snapshot),
  });
}