// Testes do Financial Planner interno (Fase 15, Bloco 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFinancialPlanner } from './buildFinancialPlanner.js';
import { buildFinancialReasoningSnapshot } from '../snapshot/buildFinancialSnapshot.js';
import { buildFinancialDiagnostics } from '../diagnostics/buildFinancialDiagnostics.js';
import { buildFinancialInference } from '../inference/buildFinancialInference.js';
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

test('planner: vazio sem dados', () => {
  const plan = buildFinancialPlanner({});
  assert.equal(plan.visible, false);
  assert.equal(plan.executed, false);
  assert.deepEqual(plan.objectives, []);
  assert.deepEqual(plan.nextActions, []);
});

test('planner: reserva insuficiente gera objetivo build_reserve', () => {
  const accounts = [
    { id: 'acc-1', name: 'Conta', account_type: 'checking', current_balance: 100 },
  ];
  const transactions = [
    { id: 'tx-a', account_id: 'acc-1', transaction_type: 'expense', amount: 2000, transaction_date: '2026-07-05', status: 'completed', category_id: 'cat-3', description: 'X' },
    { id: 'tx-b', account_id: 'acc-1', transaction_type: 'expense', amount: 2000, transaction_date: '2026-08-06', status: 'completed', category_id: 'cat-3', description: 'Y' },
  ];
  const snapshot = snapshotFor({ accounts, transactions });
  const diagnostics = buildFinancialDiagnostics(snapshot);
  const plan = buildFinancialPlanner({ snapshot, diagnostics });
  assert.ok(plan.objectives.some((objective) => objective.type === 'build_reserve'));
  assert.equal(plan.visible, false);
  assert.equal(plan.executed, false);
});

test('planner: queda de receita gera objetivo diversify_income', () => {
  const transactions = [
    ...buildFixtureTransactions(),
    { id: 'tx-6', account_id: 'acc-1', transaction_type: 'income', amount: 8000, transaction_date: '2026-07-10', status: 'completed', category_id: 'cat-1', description: 'Salário anterior' },
  ];
  const snapshot = snapshotFor({ transactions });
  const diagnostics = buildFinancialDiagnostics(snapshot);
  const plan = buildFinancialPlanner({ snapshot, diagnostics });
  assert.ok(plan.objectives.some((objective) => objective.type === 'diversify_income'));
});

test('planner: meta atrasada gera objetivo catch_up_goal', () => {
  const goals = [
    { id: 'goal-1', name: 'Viagem', target_amount: 10000, current_amount: 1000, start_date: '2025-01-01', target_date: '2025-06-01', status: 'active', planned_monthly_amount: 1000 },
  ];
  const snapshot = snapshotFor({ goals });
  const diagnostics = buildFinancialDiagnostics(snapshot);
  const plan = buildFinancialPlanner({ snapshot, diagnostics });
  assert.ok(plan.objectives.some((objective) => objective.type === 'catch_up_goal'));
  const action = plan.nextActions.find((item) => item.objective === 'catch_up_goal');
  assert.ok(action, 'esperado nextAction de goal_review');
  assert.equal(action.visible, false);
  assert.equal(action.executed, false);
});

test('planner: riscos listados a partir de diagnósticos high/medium', () => {
  const snapshot = snapshotFor({ workspaceBalance: -500 });
  const diagnostics = buildFinancialDiagnostics(snapshot);
  const plan = buildFinancialPlanner({ snapshot, diagnostics });
  assert.ok(plan.risks.length >= 1);
  assert.ok(plan.risks.every((risk) => risk.priority === 'high' || risk.priority === 'medium'));
});

test('planner: oportunidades derivadas de sinais positivos', () => {
  const snapshot = snapshotFor({});
  const diagnostics = buildFinancialDiagnostics(snapshot);
  const inferences = buildFinancialInference({ snapshot, diagnostics });
  const plan = buildFinancialPlanner({ snapshot, diagnostics, inferences });
  assert.ok(Array.isArray(plan.opportunities));
  assert.ok(plan.opportunities.some((item) => item.type === 'credit_headroom'));
});

test('planner: prioridades ordenadas por urgência', () => {
  const snapshot = snapshotFor({ workspaceBalance: -500 });
  const diagnostics = buildFinancialDiagnostics(snapshot);
  const plan = buildFinancialPlanner({ snapshot, diagnostics });
  const order = { high: 0, medium: 1, low: 2, info: 3 };
  for (let index = 1; index < plan.priorities.length; index += 1) {
    assert.ok(
      order[plan.priorities[index - 1].urgency] <= order[plan.priorities[index].urgency],
    );
  }
});

test('planner: estrutura serializável e JSON-safe', () => {
  const snapshot = snapshotFor({});
  const diagnostics = buildFinancialDiagnostics(snapshot);
  const plan = buildFinancialPlanner({ snapshot, diagnostics });
  assert.doesNotThrow(() => JSON.stringify(plan));
  assert.deepEqual(JSON.parse(JSON.stringify(plan)), plan);
});