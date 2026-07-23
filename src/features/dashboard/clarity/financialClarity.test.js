import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinancialClaritySnapshot } from './financialClarityEngine.js';

const period = {
  insight: 'Foram encontrados 3 lançamentos confirmados neste período.',
  categories: [{ label: 'Moradia', percent: 60 }],
  chart: {
    data: [
      { day: 1, receita: 0, despesa: 0 },
      { day: 20, receita: 2000, despesa: 2500 },
    ],
    comparisonMeta: { deltaPercent: 25 },
  },
};

const projections = {
  scenarioProjections: {
    likely: { hasData: true, projectedBalance: 1800 },
  },
};

test('snapshot usa saldo derivado recebido e limita a saída cognitiva', () => {
  const snapshot = buildFinancialClaritySnapshot({
    workspaceBalance: 1300,
    transactions: [
      { id: 'income', status: 'completed' },
      { id: 'expense', status: 'completed' },
      { id: 'pending', status: 'pending' },
    ],
    financialPeriod: period,
    projections,
  });

  assert.equal(snapshot.primarySummary.metrics[0].value, 'R$ 1.300,00');
  assert.equal(snapshot.metadata.completedTransactions, 2);
  assert.ok(snapshot.signals.length <= 3);
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.signals), true);
});

test('snapshot vazio não inventa valores nem conclusões', () => {
  const snapshot = buildFinancialClaritySnapshot({ workspaceBalance: null });

  assert.equal(snapshot.hasData, false);
  assert.equal(snapshot.primarySummary.status, 'Em construção');
  assert.match(snapshot.primarySummary.message, /não há histórico suficiente/i);
  assert.equal(snapshot.primarySummary.metrics[2].hasData, false);
  assert.equal(snapshot.metadata.source, 'workspace-real-data');
});

test('PF e PJ preservam o contexto no mesmo motor', () => {
  const personal = buildFinancialClaritySnapshot({ workspaceType: 'personal' });
  const business = buildFinancialClaritySnapshot({ workspaceType: 'business' });

  assert.equal(personal.workspaceType, 'personal');
  assert.equal(business.workspaceType, 'business');
  assert.match(personal.primarySummary.title, /pessoal/i);
  assert.match(business.primarySummary.title, /empresa/i);
});

test('sinais são determinísticos, prudentes e priorizados', () => {
  const input = {
    workspaceBalance: -200,
    transactions: [{ id: 'one', status: 'completed' }],
    goals: [{ id: 'goal', name: 'Reserva', status: 'active', current_amount: 900, target_amount: 1000 }],
    financialPeriod: period,
    projections,
  };
  const first = buildFinancialClaritySnapshot(input);
  const second = buildFinancialClaritySnapshot(input);

  assert.deepEqual(first, second);
  assert.equal(first.signals[0].id, 'negative-balance');
  assert.equal(first.nextAction.href, '/financeiro');
  assert.doesNotMatch(JSON.stringify(first), /garantido|certeza|deve investir/i);
});

test('próxima ação reutiliza a regra de onboarding quando não há alerta', () => {
  const snapshot = buildFinancialClaritySnapshot({
    onboardingData: { goal: 'reserva' },
    workspaceBalance: null,
  });

  assert.equal(snapshot.nextAction.href, '/objetivos');
  assert.match(snapshot.nextAction.title, /reserva/i);
});
