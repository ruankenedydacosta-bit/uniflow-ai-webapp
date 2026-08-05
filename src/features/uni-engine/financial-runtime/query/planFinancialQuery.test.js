// Testes do Query Runtime (Fase 17, Bloco 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planFinancialQuery, getQueryConfig, getIntentQueryTypes } from '../query/index.js';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/index.js';

function buildSnapshot() {
  return buildFinancialReasoningSnapshot({
    accounts: [
      { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 1500 },
      { id: 'acc-2', name: 'Poupança', account_type: 'savings', current_balance: 5000 },
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

test('query: intent desconhecido retorna plano vazio', () => {
  const intent = { type: 'unknown', confidence: 0.3 };
  const plan = planFinancialQuery(intent, null, buildSnapshot());
  assert.equal(plan.queries.length, 0);
  assert.equal(plan.intentType, 'unknown');
});

test('query: balance_query retorna accounts e cashflow', () => {
  const intent = { type: 'balance_query', confidence: 0.9 };
  const plan = planFinancialQuery(intent, null, buildSnapshot());
  assert.ok(plan.queries.some(q => q.type === 'accounts'));
  assert.ok(plan.queries.some(q => q.type === 'cashflow'));
});

test('query: expense_query retorna cashflow, transactions e categories', () => {
  const intent = { type: 'expense_query', confidence: 0.9 };
  const plan = planFinancialQuery(intent, null, buildSnapshot());
  assert.ok(plan.queries.some(q => q.type === 'cashflow'));
  assert.ok(plan.queries.some(q => q.type === 'transactions'));
  assert.ok(plan.queries.some(q => q.type === 'categories'));
});

test('query: category_breakdown_query retorna categories', () => {
  const intent = { type: 'category_breakdown_query', confidence: 0.8 };
  const plan = planFinancialQuery(intent, null, buildSnapshot());
  assert.ok(plan.queries.some(q => q.type === 'categories'));
  const catQuery = plan.queries.find(q => q.type === 'categories');
  assert.ok(catQuery.config.includeSpent);
});

test('query: temporal adiciona filtros de data', () => {
  const intent = { type: 'expense_query', confidence: 0.9 };
  const temporal = { entity: 'this_month', period: 'this_month', start: '2026-08-01', end: '2026-08-31' };
  const plan = planFinancialQuery(intent, temporal, buildSnapshot());
  assert.ok(plan.temporalFilters.dateFrom);
  assert.ok(plan.temporalFilters.dateTo);
});

test('query: entidade de conta adiciona filtro de conta', () => {
  const intent = { type: 'balance_query', confidence: 0.9, entities: [{ type: 'account', value: 'Nubank' }] };
  const plan = planFinancialQuery(intent, null, buildSnapshot());
  for (const query of plan.queries) {
    assert.equal(query.filters.account, 'Nubank');
  }
});

test('query: getIntentQueryTypes retorna tipos corretos', () => {
  assert.deepEqual(getIntentQueryTypes('balance_query'), ['accounts', 'cashflow']);
  assert.deepEqual(getIntentQueryTypes('expense_query'), ['cashflow', 'transactions', 'categories']);
  assert.deepEqual(getIntentQueryTypes('unknown'), ['cashflow']);
});

test('query: getQueryConfig retorna configuração', () => {
  const config = getQueryConfig('accounts');
  assert.ok(config.filters);
  assert.ok(config.includeBalance);
});

test('query: plano é serializável', () => {
  const intent = { type: 'balance_query', confidence: 0.9 };
  const plan = planFinancialQuery(intent, null, buildSnapshot());
  assert.doesNotThrow(() => JSON.stringify(plan));
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan);
});