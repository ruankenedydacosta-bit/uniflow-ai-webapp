// Testes do Executor Runtime (Fase 17, Bloco 3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeFinancialQuery, getAvailableExecutors } from '../executor/index.js';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/index.js';

function buildSnapshot() {
  return buildFinancialReasoningSnapshot({
    accounts: [
      { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 1500, active: true },
      { id: 'acc-2', name: 'Poupança', account_type: 'savings', current_balance: 5000, active: true },
      { id: 'acc-3', name: 'Cartão', account_type: 'credit_card', current_balance: -1200, credit_limit: 5000, active: true },
    ],
    categories: [
      { id: 'cat-1', name: 'Salário', transaction_type: 'income' },
      { id: 'cat-2', name: 'Alimentação', transaction_type: 'expense' },
      { id: 'cat-3', name: 'Moradia', transaction_type: 'expense' },
    ],
    transactions: [
      { id: 'tx-1', account_id: 'acc-1', transaction_type: 'income', amount: 5000, transaction_date: '2026-08-01', status: 'completed', category_id: 'cat-1', description: 'Salário' },
      { id: 'tx-2', account_id: 'acc-3', transaction_type: 'expense', amount: 1200, transaction_date: '2026-08-05', status: 'completed', category_id: 'cat-3', description: 'Aluguel' },
      { id: 'tx-3', account_id: 'acc-3', transaction_type: 'expense', amount: 500, transaction_date: '2026-08-10', status: 'completed', category_id: 'cat-2', description: 'Mercado' },
    ],
    // status: 'active' e target_amount/current_amount (não target/current) são
    // o contrato real de buildFinancialReasoningSnapshot (mesmo usado pela
    // feature de metas em produção, ver src/features/goals/goalCalc.js) --
    // a fixture anterior usava nomes de campo que a Fase 15 nunca leu, então
    // a meta era sempre descartada pelo filtro de status (goal ativo).
    goals: [
      { id: 'g1', name: 'Reserva', status: 'active', target_amount: 10000, current_amount: 5000, target_date: '2026-12-31', planned_monthly_amount: 1000 },
    ],
    referenceDate: '2026-08-15',
  });
}

function buildQueryPlan(type, filters = {}) {
  return {
    queries: [{ type, filters, config: {} }],
  };
}

test('executor: plano inválido retorna no_data', () => {
  const result = executeFinancialQuery({ queries: [] }, buildSnapshot());
  assert.equal(result.status, 'no_data');
});

test('executor: snapshot sem dados retorna no_data', () => {
  const result = executeFinancialQuery({ queries: [{ type: 'accounts', filters: {} }] }, { hasData: false });
  assert.equal(result.status, 'no_data');
});

test('executor: accounts retorna contas com saldos', () => {
  const plan = buildQueryPlan('accounts');
  const result = executeFinancialQuery(plan, buildSnapshot());
  assert.equal(result.status, 'executed');
  assert.ok(result.results.accounts);
  assert.ok(result.results.accounts.data.length >= 2);
  assert.ok(result.results.accounts.data.some(a => a.name === 'Conta'));
});

test('executor: transactions filtra por data e tipo', () => {
  const plan = buildQueryPlan('transactions', { dateFrom: '2026-08-01', type: 'expense' });
  const result = executeFinancialQuery(plan, buildSnapshot());
  assert.equal(result.status, 'executed');
  assert.ok(result.results.transactions);
  assert.ok(result.results.transactions.data.every(t => t.type === 'expense'));
});

test('executor: goals retorna metas com progresso', () => {
  const plan = buildQueryPlan('goals');
  const result = executeFinancialQuery(plan, buildSnapshot());
  assert.equal(result.status, 'executed');
  assert.ok(result.results.goals);
  assert.ok(result.results.goals.data.length > 0);
  assert.ok(result.results.goals.summary);
});

test('executor: categories retorna gastos por categoria', () => {
  const plan = buildQueryPlan('categories');
  const result = executeFinancialQuery(plan, buildSnapshot());
  assert.equal(result.status, 'executed');
  assert.ok(result.results.categories);
  assert.ok(result.results.categories.data.length > 0);
});

test('executor: cashflow retorna receita/despesa/resultado', () => {
  const plan = buildQueryPlan('cashflow');
  const result = executeFinancialQuery(plan, buildSnapshot());
  assert.equal(result.status, 'executed');
  assert.ok(result.results.cashflow);
  assert.ok(typeof result.results.cashflow.monthlyIncome === 'number');
  assert.ok(typeof result.results.cashflow.monthlyExpense === 'number');
});

test('executor: credit retorna uso de cartão', () => {
  const plan = buildQueryPlan('credit');
  const result = executeFinancialQuery(plan, buildSnapshot());
  assert.equal(result.status, 'executed');
  assert.ok(result.results.credit);
  assert.ok(result.results.credit.data.length > 0);
  assert.ok(typeof result.results.credit.totalUsage === 'number');
});

test('executor: investments retorna investimentos', () => {
  const plan = buildQueryPlan('investments');
  const result = executeFinancialQuery(plan, buildSnapshot());
  assert.equal(result.status, 'executed');
  assert.ok(result.results.investments);
});

test('executor: executionAllowed e influenceApplied sempre false', () => {
  const plan = buildQueryPlan('accounts');
  const result = executeFinancialQuery(plan, buildSnapshot());
  assert.equal(result.executionAllowed, false);
  assert.equal(result.influenceApplied, false);
});

test('executor: getAvailableExecutors retorna lista', () => {
  const executors = getAvailableExecutors();
  assert.ok(Array.isArray(executors));
  assert.ok(executors.includes('accounts'));
  assert.ok(executors.includes('transactions'));
});

test('executor: resultado é serializável', () => {
  const plan = buildQueryPlan('accounts');
  const result = executeFinancialQuery(plan, buildSnapshot());
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.deepEqual(JSON.parse(JSON.stringify(result)), result);
});