// Testes do Financial Diagnostics (Fase 15, Bloco 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialDiagnostics } from './buildFinancialDiagnostics.js';
import { buildFinancialReasoningSnapshot } from '../snapshot/buildFinancialSnapshot.js';
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

test('diagnostics: sem dados retorna lista vazia', () => {
  assert.deepEqual(buildFinancialDiagnostics(null), []);
  const empty = buildFinancialReasoningSnapshot({});
  assert.deepEqual(buildFinancialDiagnostics(empty), []);
});

test('diagnostics: saldo negativo gera diagnóstico de alta prioridade', () => {
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ workspaceBalance: -500 }));
  const negative = diagnostics.find((item) => item.type === 'negative_balance');
  assert.ok(negative, 'esperado negative_balance');
  assert.equal(negative.priority, 'high');
  assert.equal(negative.confidence, 0.95);
  assert.equal(negative.id, 'diag-negative_balance');
  assert.ok(negative.evidences.length > 0);
  assert.ok(typeof negative.explanation === 'string');
});

test('diagnostics: queda de receita quando mês corrente < 80% do anterior', () => {
  const transactions = [
    ...buildFixtureTransactions(),
    { id: 'tx-6', account_id: 'acc-1', transaction_type: 'income', amount: 8000, transaction_date: '2026-07-10', status: 'completed', category_id: 'cat-1', description: 'Salário anterior' },
  ];
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ transactions }));
  const decline = diagnostics.find((item) => item.type === 'income_decline');
  assert.ok(decline, 'esperado income_decline');
  assert.equal(decline.evidences[0].key, 'income_current');
});

test('diagnostics: crescimento de despesa acima de 20% da média', () => {
  const transactions = [
    { id: 'tx-a', account_id: 'acc-4', transaction_type: 'expense', amount: 300, transaction_date: '2026-07-05', status: 'completed', category_id: 'cat-3', description: 'X' },
    { id: 'tx-b', account_id: 'acc-4', transaction_type: 'expense', amount: 300, transaction_date: '2026-07-06', status: 'completed', category_id: 'cat-3', description: 'Y' },
    { id: 'tx-c', account_id: 'acc-4', transaction_type: 'expense', amount: 2400, transaction_date: '2026-08-06', status: 'completed', category_id: 'cat-3', description: 'Pico' },
  ];
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ transactions }));
  const growth = diagnostics.find((item) => item.type === 'expense_growth');
  assert.ok(growth, 'esperado expense_growth');
});

test('diagnostics: despesas recorrentes com 3+ lançamentos recorrentes', () => {
  const transactions = [
    ...buildFixtureTransactions(),
    { id: 'tx-7', account_id: 'acc-4', transaction_type: 'expense', amount: 100, transaction_date: '2026-08-04', status: 'completed', category_id: 'cat-3', description: 'Netflix', is_recurring: true },
    { id: 'tx-8', account_id: 'acc-4', transaction_type: 'expense', amount: 50, transaction_date: '2026-08-05', status: 'completed', category_id: 'cat-3', description: 'Spotify', is_recurring: true },
  ];
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ transactions }));
  const recurring = diagnostics.find((item) => item.type === 'recurring_expenses');
  assert.ok(recurring, 'esperado recurring_expenses');
  assert.equal(recurring.priority, 'info');
});

test('diagnostics: despesa anormal acima de 50% da receita do mês', () => {
  const transactions = [
    ...buildFixtureTransactions(),
    { id: 'tx-9', account_id: 'acc-4', transaction_type: 'expense', amount: 3500, transaction_date: '2026-08-06', status: 'completed', category_id: 'cat-3', description: 'Compra grande' },
  ];
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ transactions }));
  const abnormal = diagnostics.find((item) => item.type === 'abnormal_expenses');
  assert.ok(abnormal, 'esperado abnormal_expenses');
});

test('diagnostics: risco de caixa quando liquidez não cobre despesa do mês', () => {
  const transactions = [
    { id: 'tx-x', account_id: 'acc-4', transaction_type: 'expense', amount: 9000, transaction_date: '2026-08-02', status: 'completed', category_id: 'cat-2', description: 'Grande' },
  ];
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ transactions }));
  const cashRisk = diagnostics.find((item) => item.type === 'cash_risk');
  assert.ok(cashRisk, 'esperado cash_risk');
});

test('diagnostics: baixo patrimônio quando patrimônio líquido não é positivo', () => {
  const accounts = [
    { id: 'acc-4', name: 'Cartão', account_type: 'credit_card', current_balance: -2000, credit_limit: 5000 },
  ];
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ accounts, transactions: [] }));
  const low = diagnostics.find((item) => item.type === 'low_patrimony');
  assert.ok(low, 'esperado low_patrimony');
});

test('diagnostics: dependência de crédito acima de 50% do limite', () => {
  const accounts = [
    { id: 'acc-4', name: 'Cartão', account_type: 'credit_card', current_balance: -4500, credit_limit: 5000 },
  ];
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ accounts, transactions: [] }));
  const credit = diagnostics.find((item) => item.type === 'credit_dependence');
  assert.ok(credit, 'esperado credit_dependence');
  assert.equal(credit.priority, 'high');
});

test('diagnostics: baixa liquidez cobre menos de dois meses de despesa média', () => {
  const accounts = [
    { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 1000 },
  ];
  const transactions = [
    { id: 'tx-a', account_id: 'acc-1', transaction_type: 'expense', amount: 3000, transaction_date: '2026-07-05', status: 'completed', category_id: 'cat-3', description: 'X' },
    { id: 'tx-b', account_id: 'acc-1', transaction_type: 'expense', amount: 3000, transaction_date: '2026-08-06', status: 'completed', category_id: 'cat-3', description: 'Y' },
  ];
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ accounts, transactions }));
  const liquidity = diagnostics.find((item) => item.type === 'low_liquidity');
  assert.ok(liquidity, 'esperado low_liquidity');
});

test('diagnostics: reserva insuficiente abaixo da meta derivada', () => {
  const accounts = [
    { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 100 },
  ];
  const transactions = [
    { id: 'tx-a', account_id: 'acc-1', transaction_type: 'expense', amount: 2000, transaction_date: '2026-07-05', status: 'completed', category_id: 'cat-3', description: 'X' },
    { id: 'tx-b', account_id: 'acc-1', transaction_type: 'expense', amount: 2000, transaction_date: '2026-08-06', status: 'completed', category_id: 'cat-3', description: 'Y' },
  ];
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ accounts, transactions }));
  const reserve = diagnostics.find((item) => item.type === 'insufficient_reserve');
  assert.ok(reserve, 'esperado insufficient_reserve');
});

test('diagnostics: meta atrasada detectada', () => {
  const goals = [
    { id: 'goal-1', name: 'Viagem', target_amount: 10000, current_amount: 1000, start_date: '2025-01-01', target_date: '2025-06-01', status: 'active', planned_monthly_amount: 1000 },
  ];
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ goals }));
  const delayed = diagnostics.find((item) => item.type === 'delayed_goal');
  assert.ok(delayed, 'esperado delayed_goal');
  assert.equal(delayed.priority, 'medium');
});

test('diagnostics: resultado ordenado por prioridade (high → info)', () => {
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ workspaceBalance: -500 }));
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  for (let index = 1; index < diagnostics.length; index += 1) {
    assert.ok(
      order[diagnostics[index - 1].priority] <= order[diagnostics[index].priority],
      'lista deve estar ordenada por prioridade',
    );
  }
});

test('diagnostics: estrutura serializável e JSON-safe', () => {
  const diagnostics = buildFinancialDiagnostics(snapshotFor({ workspaceBalance: -500 }));
  assert.doesNotThrow(() => JSON.stringify(diagnostics));
  const restored = JSON.parse(JSON.stringify(diagnostics));
  assert.deepEqual(restored, diagnostics);
});