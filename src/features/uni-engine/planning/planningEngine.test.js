import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { normalizeUserMessage } from '../normalizeUserMessage.js';
import { runPlanningEngine } from './runPlanningEngine.js';

function input(text, overrides = {}) {
  return {
    normalizedMessage: normalizeUserMessage(text),
    classification: { primaryIntent: 'create_goal', safetyBlocked: false },
    cognitivePlan: { decision: 'confirm', missingFields: [] },
    conversationContext: { turnCount: 2 },
    decisionLayer: { decisionType: 'ASK', confidence: 0.7 },
    epistemicModel: { conflicts: [], staleItems: [] },
    persistentMemory: { retrieved: [] },
    financialSnapshot: { hasData: true, accounts: [], categories: [] },
    session: { workspaceId: 'workspace-1', workspaceType: 'personal' },
    userPreferences: { workspaceType: 'personal' },
    timestamp: '2026-08-01T00:00:00.000Z',
    featureFlags: { planningEnabled: true, planningShadowMode: true, planningTelemetryEnabled: false },
    ...overrides,
  };
}

const scenarios = [
  ['economia pronta', 'Quero juntar R$ 10.000 em 12 meses', 'SAVINGS', 'READY'],
  ['economia parcial', 'Quero economizar dinheiro', 'SAVINGS', 'PARTIAL'],
  ['dívida parcial', 'Quero quitar R$ 5000 em 1 ano', 'DEBT', 'PARTIAL'],
  ['investimento parcial', 'Quero investir R$ 1000 em 2 anos', 'INVESTMENT', 'PARTIAL'],
  ['orçamento pronto', 'Quero criar um orçamento', 'BUDGET', 'READY'],
  ['business bloqueado no PF', 'Quero planejar o capital de giro da empresa', 'BUSINESS', 'PARTIAL'],
  ['geral parcial', 'Quero planejar uma meta', 'GENERAL', 'PARTIAL'],
  ['sem plano', 'Olá, tudo bem?', 'FINANCIAL', 'PARTIAL'],
];

for (const [name, text, goalType, status] of scenarios) {
  test(`engine: ${name}`, () => {
    const result = runPlanningEngine(input(text, name === 'sem plano' ? { classification: { primaryIntent: null } } : {}));
    if (name === 'sem plano') {
      assert.equal(result.goalType, 'UNKNOWN');
      assert.equal(result.status, 'UNKNOWN');
    } else {
      assert.equal(result.goalType, goalType);
      assert.equal(result.status, status);
    }
  });
}

test('engine bloqueia conflito epistêmico', () => {
  const result = runPlanningEngine(input('Quero juntar R$ 1000 em 6 meses', { epistemicModel: { conflicts: [{ type: 'value_conflict' }] } }));
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.risk, 'HIGH');
});

test('engine espera pending em execução', () => {
  const result = runPlanningEngine(input('Quero criar um orçamento', { pendingAction: { status: 'executing' } }));
  assert.equal(result.status, 'WAITING');
});

test('engine mantém todas as garantias shadow', () => {
  const shadow = runPlanningEngine(input('Quero juntar R$ 1000 em 6 meses')).shadow;
  for (const key of ['appliedToDecision', 'planExecuted', 'executorCalled', 'databaseCalled', 'memoryModified', 'voiceTouched', 'responseModified', 'pipelineAltered']) {
    assert.equal(shadow[key], false);
  }
});

test('engine não modifica snapshots de entrada', () => {
  const source = input('Quero juntar R$ 1000 em 6 meses');
  const before = JSON.stringify(source);
  runPlanningEngine(source);
  assert.equal(JSON.stringify(source), before);
});

test('engine é determinístico exceto latência', () => {
  const source = input('Quero juntar R$ 1000 em 6 meses');
  const first = runPlanningEngine(source);
  const second = runPlanningEngine(source);
  first.latency = null;
  second.latency = null;
  assert.deepEqual(first, second);
});

test('engine trata entrada vazia', () => {
  const result = runPlanningEngine();
  assert.equal(result.status, 'UNKNOWN');
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('engine limita passos e dependências', () => {
  const result = runPlanningEngine(input('Quero economizar, investir e quitar dívidas em 36 meses'));
  assert.ok(result.suggestedSteps.length <= 10);
  assert.ok(result.dependencies.length <= 12);
});

test('engine suporta múltiplos objetivos', () => {
  const result = runPlanningEngine(input('Quero economizar e investir em 12 meses'));
  assert.equal(result.goal.multiple, true);
  assert.ok(result.recommendations.includes('REVIEW_MULTIPLE_GOALS'));
});

test('engine serializa resultado completo', () => {
  assert.doesNotThrow(() => JSON.stringify(runPlanningEngine(input('Quero juntar R$ 1000 em 6 meses'))));
});

test('performance comum: mediana abaixo de 10ms', () => {
  const source = input('Quero juntar R$ 1000 em 6 meses');
  for (let i = 0; i < 20; i += 1) runPlanningEngine(source);
  const timings = [];
  for (let i = 0; i < 100; i += 1) {
    const start = performance.now();
    runPlanningEngine(source);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  assert.ok(timings[49] < 10);
});

test('performance p95 abaixo de 20ms', () => {
  const source = input('Quero economizar e investir R$ 10000 em 36 meses', {
    persistentMemory: { retrieved: Array.from({ length: 500 }, (_, index) => ({ id: index })) },
  });
  for (let i = 0; i < 20; i += 1) runPlanningEngine(source);
  const timings = [];
  for (let i = 0; i < 100; i += 1) {
    const start = performance.now();
    runPlanningEngine(source);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  assert.ok(timings[94] < 20);
});
