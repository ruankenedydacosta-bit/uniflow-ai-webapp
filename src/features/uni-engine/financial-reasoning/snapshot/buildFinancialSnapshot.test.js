// Testes do Financial Snapshot serializável (Fase 15, Bloco 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFinancialReasoningSnapshot,
  roundMoney,
  FINANCIAL_REASONING_SNAPSHOT_VERSION,
} from './buildFinancialSnapshot.js';

function buildAccounts() {
  return [
    { id: 'acc-1', name: 'Conta corrente', account_type: 'checking', current_balance: 1500 },
    { id: 'acc-2', name: 'Poupança', account_type: 'savings', current_balance: 5000 },
    { id: 'acc-3', name: 'Investimentos', account_type: 'investment', current_balance: 8000 },
    { id: 'acc-4', name: 'Cartão', account_type: 'credit_card', current_balance: -1200, credit_limit: 5000, due_day: 10, closing_day: 3 },
  ];
}

function buildCategories() {
  return [
    { id: 'cat-1', name: 'Salário', transaction_type: 'income', is_system: true },
    { id: 'cat-2', name: 'Moradia', transaction_type: 'expense', is_system: true },
    { id: 'cat-3', name: 'Alimentação', transaction_type: 'expense', is_system: true },
  ];
}

function buildTransactions() {
  return [
    { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 6000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
    { id: 'tx-2', account_id: 'acc-4', transaction_type: 'expense', amount: 900, transaction_date: '2026-08-02', status: 'completed', category_id: 'cat-2', description: 'Aluguel', is_recurring: true, installment_number: 1, installment_total: 6, metadata: { installment_group_id: 'g-1' } },
    { id: 'tx-3', account_id: 'acc-4', transaction_type: 'expense', amount: 900, transaction_date: '2026-08-02', status: 'completed', category_id: 'cat-2', description: 'Aluguel', is_recurring: true, installment_number: 2, installment_total: 6, metadata: { installment_group_id: 'g-1' } },
    { id: 'tx-4', account_id: 'acc-4', transaction_type: 'expense', amount: 200, transaction_date: '2026-07-15', status: 'completed', category_id: 'cat-3', description: 'Mercado' },
    { id: 'tx-5', account_id: 'acc-4', transaction_type: 'expense', amount: 150, transaction_date: '2026-07-20', status: 'canceled', category_id: 'cat-3', description: 'Cancelada' },
  ];
}

test('snapshot: saldo total respeita workspaceBalance quando presente', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    transactions: buildTransactions(),
    workspaceBalance: 13000,
  });
  assert.equal(snapshot.balance.total, 13000);
});

test('snapshot: saldo total é derivado das contas sem workspaceBalance', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    transactions: buildTransactions(),
    workspaceBalance: null,
  });
  assert.equal(snapshot.balance.total, 13300);
});

test('snapshot: receitas e despesas do mês corrente com meses vizinhos', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    categories: buildCategories(),
    transactions: buildTransactions(),
    workspaceBalance: null,
    referenceDate: '2026-08-15',
  });
  assert.equal(snapshot.currentMonth, '2026-08');
  assert.equal(snapshot.previousMonth, '2026-07');
  assert.equal(snapshot.income.monthly, 6000);
  assert.equal(snapshot.expenses.monthly, 1800);
  assert.equal(snapshot.income.previous, 0);
  assert.equal(snapshot.expenses.previous, 200);
  assert.equal(snapshot.result.monthly, 4200);
  assert.equal(snapshot.result.savingsRate, 0.7);
});

test('snapshot: transações canceladas são ignoradas', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    categories: buildCategories(),
    transactions: buildTransactions(),
    referenceDate: '2026-08-15',
  });
  assert.equal(snapshot.expenses.previous, 200);
  assert.equal(snapshot.counts.transactions, 4);
});

test('snapshot: patrimônio, liquidez e cartões derivados corretamente', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    categories: buildCategories(),
    transactions: buildTransactions(),
    referenceDate: '2026-08-15',
  });
  assert.equal(snapshot.patrimony.liquid, 6500);
  assert.equal(snapshot.patrimony.investments, 8000);
  assert.equal(snapshot.patrimony.debts, 1200);
  assert.equal(snapshot.patrimony.assets, 14500);
  assert.equal(snapshot.patrimony.net, 13300);
  assert.equal(snapshot.creditCards.length, 1);
  assert.equal(snapshot.creditCards[0].usage, 1200);
  assert.equal(snapshot.creditCards[0].utilization, 0.24);
  assert.equal(snapshot.creditCards[0].available, 3800);
  assert.equal(snapshot.creditCards[0].dueDay, 10);
});

test('snapshot: investimentos listados separadamente', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    categories: buildCategories(),
    transactions: buildTransactions(),
    referenceDate: '2026-08-15',
  });
  assert.equal(snapshot.investments.length, 1);
  assert.equal(snapshot.investments[0].name, 'Investimentos');
  assert.equal(snapshot.investments[0].balance, 8000);
});

test('snapshot: parcelamentos agrupados por grupo com resto', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    categories: buildCategories(),
    transactions: buildTransactions(),
    referenceDate: '2026-08-15',
  });
  assert.equal(snapshot.installments.length, 1);
  assert.equal(snapshot.installments[0].installments, 6);
  assert.equal(snapshot.installments[0].paid, 2);
  assert.equal(snapshot.installments[0].remaining, 4);
  assert.equal(snapshot.installments[0].monthlyAmount, 900);
  assert.equal(snapshot.installments[0].categoryName, 'Moradia');
});

test('snapshot: recorrentes detectados e últimos eventos ordenados', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    categories: buildCategories(),
    transactions: buildTransactions(),
    referenceDate: '2026-08-15',
  });
  assert.equal(snapshot.recurring.length, 2);
  assert.equal(snapshot.latestEvents.length, 4);
  assert.equal(snapshot.latestEvents[0].id, 'tx-3');
});

test('snapshot: reserva derivada da despesa média e cobertura de metas', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    categories: buildCategories(),
    transactions: buildTransactions(),
    goals: [
      { id: 'goal-1', name: 'Reserva', target_amount: 10000, current_amount: 6500, start_date: '2026-01-01', target_date: '2026-12-31', status: 'active', planned_monthly_amount: 500 },
    ],
    referenceDate: '2026-08-15',
  });
  assert.equal(snapshot.goals.length, 1);
  assert.equal(snapshot.goals[0].progress, 65);
  assert.equal(snapshot.reserve.targetMonths, 3);
  assert.equal(snapshot.reserve.target, 3000);
  assert.equal(snapshot.reserve.current, 6500);
  assert.equal(snapshot.reserve.sufficient, true);
});

test('snapshot: fluxo mensal tem janela de 6 meses e termina no mês corrente', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    categories: buildCategories(),
    transactions: buildTransactions(),
    referenceDate: '2026-08-15',
  });
  assert.equal(snapshot.flow.months.length, 6);
  assert.equal(snapshot.flow.months[5].month, '2026-08');
  assert.equal(snapshot.flow.months[5].income, 6000);
  assert.equal(snapshot.flow.months[4].month, '2026-07');
});

test('snapshot: estrutura 100% JSON-safe (sem funções, Date, Map ou classe)', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    categories: buildCategories(),
    transactions: buildTransactions(),
    goals: [{ id: 'g', name: 'Meta', target_amount: 100, current_amount: 50, status: 'active' }],
    referenceDate: '2026-08-15',
  });
  const json = JSON.stringify(snapshot);
  const restored = JSON.parse(json);
  assert.deepEqual(restored, snapshot);
  assert.equal(snapshot.serializable, true);
  assert.equal(snapshot.currency, 'BRL');
  const walk = (value) => {
    if (value && typeof value === 'object') {
      if (Array.isArray(value)) {
        for (const entry of value) walk(entry);
      } else {
        assert.equal(value.constructor, Object, 'apenas plain objects');
        assert.equal(Object.getPrototypeOf(value), Object.prototype, 'prototype padrão');
        for (const entry of Object.values(value)) walk(entry);
      }
    }
  };
  walk(snapshot);
});

test('snapshot: edge case — dados vazios resultam em hasData false', () => {
  const snapshot = buildFinancialReasoningSnapshot({});
  assert.equal(snapshot.hasData, false);
  assert.equal(snapshot.balance.total, 0);
  assert.equal(snapshot.counts.transactions, 0);
  assert.deepEqual(snapshot.diagnostics, undefined);
});

test('snapshot: alertas internos marcam fatos observados', () => {
  const snapshot = buildFinancialReasoningSnapshot({
    accounts: buildAccounts(),
    categories: buildCategories(),
    transactions: buildTransactions(),
    referenceDate: '2026-08-15',
  });
  const keys = snapshot.internalAlerts.map((alert) => alert.key);
  assert.ok(keys.includes('credit_debt_present'));
  const empty = buildFinancialReasoningSnapshot({});
  assert.ok(empty.internalAlerts.map((alert) => alert.key).includes('no_accounts'));
});

test('snapshot: roundMoney sanitiza valores inválidos', () => {
  assert.equal(roundMoney('abc'), 0);
  assert.equal(roundMoney(NaN), 0);
  assert.equal(roundMoney(Infinity), 0);
  assert.equal(roundMoney(10.999), 11);
  assert.equal(roundMoney('12.345'), 12.35);
});

test('snapshot: versão estável exportada', () => {
  assert.equal(FINANCIAL_REASONING_SNAPSHOT_VERSION, '1.0');
});