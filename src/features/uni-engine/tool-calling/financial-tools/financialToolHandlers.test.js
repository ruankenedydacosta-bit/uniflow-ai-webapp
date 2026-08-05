// Uni Engine — Fase 20.2: Tool Calling — testes das ferramentas financeiras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/buildFinancialSnapshot.js';
import {
  buildFixtureAccounts,
  buildFixtureCategories,
  buildFixtureTransactions,
} from '../../financial-reasoning/testFixtures.js';
import {
  createFinancialReadToolsRegistry,
  createFinancialDataToolsContext,
  listFinancialToolDefinitions,
  FINANCIAL_READ_TOOL_NAMES,
} from '../financial-tools/index.js';

function buildSnapshot(overrides = {}) {
  return buildFinancialReasoningSnapshot({
    accounts: overrides.accounts ?? buildFixtureAccounts(),
    categories: overrides.categories ?? buildFixtureCategories(),
    transactions: overrides.transactions ?? buildFixtureTransactions(),
    goals: overrides.goals ?? [],
    referenceDate: overrides.referenceDate ?? '2026-08-15',
    workspaceBalance: overrides.workspaceBalance ?? null,
  });
}

function simpleSnapshot(overrides = {}) {
  return {
    version: '1.0',
    serializable: true,
    referenceDate: '2026-08-15',
    currentMonth: '2026-08',
    previousMonth: '2026-07',
    currency: 'BRL',
    hasData: overrides.hasData !== false,
    balance: { total: 0, byAccount: [] },
    income: { currentMonth: '2026-08', monthly: 0, previous: 0, delta: 0, average: 0 },
    expenses: { currentMonth: '2026-08', monthly: 0, previous: 0, delta: 0, average: 0, byCategory: [] },
    result: { monthly: 0, previous: 0, savingsRate: 0 },
    accounts: [],
    flow: { months: [], averageIncome: 0, averageExpense: 0, last: null, previous: null },
    goals: [],
    recurring: [],
    counts: { accounts: 0, transactions: 0, goals: 0, creditCards: 0, installments: 0, recurring: 0 },
  };
}

async function callTool(dispatcher, registry, name, args = {}, authorization) {
  return dispatcher.dispatchToolCall({
    toolCall: { id: `call-${name}`, name, arguments: args },
    registry,
    config: { toolCallingEnabled: true, toolCallingShadowMode: true, toolCallingTelemetryEnabled: false },
    authorization: authorization ?? { authorized: true, executionAllowed: true },
    turnId: 'turn-1',
  });
}

// ============================================================================
// REGISTRY
// ============================================================================

test('registry financeiro - seis ferramentas registradas ', () => {
  const registry = createFinancialReadToolsRegistry({ snapshot: buildSnapshot(), config: { enabled: true } });
  assert.equal(registry.size(), 6);
  for (const name of FINANCIAL_READ_TOOL_NAMES) {
    assert.equal(registry.has(name), true, `faltou ${name}`);
  }
});

test('registry financeiro - nomes únicos', () => {
  const registry = createFinancialReadToolsRegistry({ snapshot: buildSnapshot(), config: { enabled: true } });
  const names = registry.list();
  assert.equal(new Set(names).size, names.length);
  assert.equal(names.length, 6);
});

test('registry financeiro - writes=false em todas', () => {
  const registry = createFinancialReadToolsRegistry({ snapshot: buildSnapshot(), config: { enabled: true } });
  for (const name of registry.list()) {
    assert.equal(registry.get(name).writes, false, `${name}.writes`);
    assert.equal(registry.get(name).metadata.writes, false);
    assert.equal(registry.get(name).metadata.reads, true);
  }
});

test('registry financeiro - handlers não expostos em listagem pública', () => {
  const registry = createFinancialReadToolsRegistry({ snapshot: buildSnapshot(), config: { enabled: true } });
  const publicDefs = listFinancialToolDefinitions(registry);
  assert.equal(publicDefs.length, 6);
  for (const def of publicDefs) {
    assert.ok(!('handler' in def), 'handler não deve aparecer na listagem pública');
    assert.equal(typeof def.name, 'string');
  }
});

test('registry financeiro - isolado entre instâncias', () => {
  const registryA = createFinancialReadToolsRegistry({ snapshot: buildSnapshot(), config: { enabled: true } });
  const registryB = createFinancialReadToolsRegistry({ snapshot: buildSnapshot({ accounts: [] }), config: { enabled: true } });
  registryA.remove('get_financial_summary');
  assert.equal(registryA.has('get_financial_summary'), false);
  assert.equal(registryA.size(), 5);
  assert.equal(registryB.has('get_financial_summary'), true);
  assert.equal(registryB.size(), 6);
});

// ============================================================================
// GET_FINANCIAL_SUMMARY
// ============================================================================

test('get_financial_summary - resumo válido', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary');
  assert.equal(outcome.result.status, 'completed');
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.tool, 'get_financial_summary');
  assert.equal(response.data.period, '2026-08');
  assert.equal(response.data.balance, 13300);
  assert.equal(response.data.income, 6000);
  assert.equal(response.data.expenses, 1800);
  assert.equal(response.data.result, 4200);
  assert.equal(response.meta.source, 'snapshot');
});

test('get_financial_summary - snapshot vazio', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: simpleSnapshot({ hasData: false }), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary');
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.balance, null);
  assert.equal(response.data.hasData, false);
  assert.equal(response.data.income, 0);
});

test('get_financial_summary - saldo ausente', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: simpleSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary');
  const response = outcome.result.data;
  assert.equal(response.data.balance, null);
  assert.ok(!('accounts' in response.data));
});

test('get_financial_summary - período inválido', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary', { period: '2026-13' });
  assert.equal(outcome.result.status, 'completed');
  assert.equal(outcome.result.data.ok, false);
  assert.equal(outcome.result.data.error.code, 'INVALID_period');
});

test('get_financial_summary - resultado JSON-safe', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_financial_summary');
  assert.doesNotThrow(() => JSON.stringify(outcome.result.data));
});

// ============================================================================
// GET_EXPENSE_BREAKDOWN
// ============================================================================

test('get_expense_breakdown - agrupamento por categoria', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_expense_breakdown');
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.period, '2026-08');
  assert.equal(response.data.total, 1800);
  assert.equal(response.data.byCategory.length, 1);
  assert.equal(response.data.byCategory[0].name, 'Moradia');
  assert.equal(response.data.byCategory[0].spent, 1800);
});

test('get_expense_breakdown - categoria ausente', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_expense_breakdown', { category: 'Inexistente' });
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.byCategory.length, 0);
  assert.equal(response.data.total, 0);
});

test('get_expense_breakdown - sem despesas', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: simpleSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_expense_breakdown');
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.total, 0);
  assert.equal(response.data.byCategory.length, 0);
});

test('get_expense_breakdown - período inválido', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_expense_breakdown', { period: 'mês' });
  assert.equal(outcome.result.data.ok, false);
  assert.equal(outcome.result.data.error.code, 'INVALID_period');
});

test('get_expense_breakdown - não expõe IDs', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_expense_breakdown');
  const json = JSON.stringify(outcome.result.data);
  assert.ok(!json.includes('cat-'));
  assert.ok(!json.includes('tx-'));
  assert.ok(!json.includes('acc-'));
});

// ============================================================================
// COMPARE_FINANCIAL_PERIODS
// ============================================================================

test('compare_financial_periods - comparação válida', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'compare_financial_periods', { periodA: '2026-08', periodB: '2026-07' });
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.status, 'executed');
  assert.equal(typeof response.data.detail.deltas.expense, 'number');
  assert.equal(typeof response.data.detail.percentages.expense, 'number');
});

test('compare_financial_periods - período ausente', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'compare_financial_periods', { periodA: '2026-08' });
  assert.equal(outcome.result.data.ok, false);
  assert.equal(outcome.result.data.error.code, 'REQUIRED_periodB');
});

test('compare_financial_periods - períodos iguais', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'compare_financial_periods', { periodA: '2026-08', periodB: '2026-08' });
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.status, 'executed');
  assert.equal(response.data.detail.deltas.expense, 0);
  assert.equal(response.data.detail.deltas.income, 0);
});

test('compare_financial_periods - dados insuficientes', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'compare_financial_periods', { periodA: '2025-01', periodB: '2025-02' });
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.status, 'partial_data');
  assert.equal(response.data.detail, null);
});

test('compare_financial_periods - sem projeção inventada', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'compare_financial_periods', { periodA: '2026-08', periodB: '2026-07' });
  const json = JSON.stringify(outcome.result.data);
  assert.ok(!/projec|forecast|prediction/i.test(json));
});

// ============================================================================
// GET_GOAL_PROGRESS
// ============================================================================

const GOAL_FIXTURES = [
  { id: 'goal-1', name: 'Reserva', target_amount: 20000, current_amount: 10000, status: 'active', planned_monthly_amount: 1000, target_date: '2027-08-01' },
  { id: 'goal-2', name: 'Viagem', target_amount: 5000, current_amount: 5000, status: 'active', planned_monthly_amount: 500, target_date: '2027-01-01' },
];

test('get_goal_progress - metas válidas', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot({ goals: GOAL_FIXTURES }), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_goal_progress');
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.count, 2);
  const reserva = response.data.goals.find((g) => g.name === 'Reserva');
  assert.equal(reserva.progress, 50);
  const viagem = response.data.goals.find((g) => g.name === 'Viagem');
  assert.equal(viagem.progress, 100);
});

test('get_goal_progress - nenhuma meta', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot({ goals: [] }), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_goal_progress');
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.count, 0);
  assert.deepEqual(response.data.goals, []);
});

test('get_goal_progress - meta incompleta', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({
    snapshot: buildSnapshot({ goals: [{ id: 'goal-x', name: 'Incompleta', status: 'active' }] }),
    config: { enabled: true },
  });
  const outcome = await callTool(dispatcher, registry, 'get_goal_progress');
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  const goal = response.data.goals.find((g) => g.name === 'Incompleta');
  assert.equal(goal.progress, 0);
  assert.equal(goal.target, 0);
});

test('get_goal_progress - status desconhecido', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot({ goals: GOAL_FIXTURES }), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_goal_progress', { status: 'bogus' });
  assert.equal(outcome.result.data.ok, false);
  assert.equal(outcome.result.data.error.code, 'INVALID_status');
});

test('get_goal_progress - não altera meta', async () => {
  const snapshot = buildSnapshot({ goals: GOAL_FIXTURES });
  const before = JSON.stringify(snapshot.goals);
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot, config: { enabled: true } });
  await callTool(dispatcher, registry, 'get_goal_progress');
  assert.equal(JSON.stringify(snapshot.goals), before);
});

// ============================================================================
// GET_ACCOUNT_SUMMARY
// ============================================================================

test('get_account_summary - contas válidas', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_account_summary');
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.accounts.length, 4);
  assert.equal(response.data.totalBalance, 13300);
});

test('get_account_summary - nenhuma conta', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: simpleSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_account_summary');
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.accounts.length, 0);
  assert.equal(response.data.totalBalance, null);
});

test('get_account_summary - dados sensíveis removidos', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_account_summary');
  const json = JSON.stringify(outcome.result.data);
  assert.ok(!json.includes('credit_limit'));
  assert.ok(!json.includes('due_day'));
  assert.ok(!json.includes('closing_day'));
});

test('get_account_summary - identificadores internos removidos', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_account_summary');
  const json = JSON.stringify(outcome.result.data);
  assert.ok(!json.includes('acc-'));
  assert.ok(!('id' in outcome.result.data.data.accounts[0]));
});

test('get_account_summary - agregação correta', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_account_summary');
  const counts = outcome.result.data.data.counts.byType;
  assert.equal(counts.checking, 1);
  assert.equal(counts.savings, 1);
  assert.equal(counts.investment, 1);
  assert.equal(counts.credit_card, 1);
});

// ============================================================================
// GET_RECURRING_EXPENSES
// ============================================================================

test('get_recurring_expenses - recorrências válidas', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_recurring_expenses');
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.detected.length, 2);
  assert.equal(response.data.patternSufficient, true);
  assert.equal(response.data.detected[0].description, 'Aluguel');
});

test('get_recurring_expenses - nenhuma recorrência', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: simpleSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_recurring_expenses');
  const response = outcome.result.data;
  assert.equal(response.ok, true);
  assert.equal(response.data.detected.length, 0);
  assert.equal(response.data.patternSufficient, false);
});

test('get_recurring_expenses - padrão insuficiente', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: simpleSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_recurring_expenses');
  assert.equal(outcome.result.data.data.patternSufficient, false);
});

test('get_recurring_expenses - sem mutação', async () => {
  const snapshot = buildSnapshot();
  const before = JSON.stringify(snapshot.recurring);
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot, config: { enabled: true } });
  await callTool(dispatcher, registry, 'get_recurring_expenses');
  assert.equal(JSON.stringify(snapshot.recurring), before);
});

test('get_recurring_expenses - saída sanitizada', async () => {
  const { dispatcher, registry } = createFinancialDataToolsContext({ snapshot: buildSnapshot(), config: { enabled: true } });
  const outcome = await callTool(dispatcher, registry, 'get_recurring_expenses');
  const json = JSON.stringify(outcome.result.data);
  assert.ok(!json.includes('tx-'));
  assert.ok(!('id' in outcome.result.data.data.detected[0]));
  assert.ok(!json.includes('is_recurring'));
});