// Testes do orquestrador do Goal Engine (Fase 7).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { normalizeUserMessage } from '../normalizeUserMessage.js';
import { runGoalEngine } from './runGoalEngine.js';
import {
  findFunctionsInValue,
  isSerializableValue,
} from '../uniEngineContracts.js';

function input(text, overrides = {}) {
  return {
    normalizedMessage: normalizeUserMessage(text),
    classification: { primaryIntent: 'create_goal', safetyBlocked: false },
    cognitivePlan: { decision: 'confirm' },
    cognitiveContext: { turnCount: 2 },
    decisionLayer: { decisionType: 'ASK', confidence: 0.7 },
    epistemicModel: { conflicts: [] },
    persistentMemory: { retrieved: [{ id: 'm1', subjectKey: 'goal', value: 'meta de poupança' }] },
    operationalMemory: null,
    financialSnapshot: {
      hasData: true,
      totalBalance: 740.5,
      referenceDate: '2026-07-30',
      accounts: [{ id: 'a1', name: 'Nubank', current_balance: 740.5 }],
    },
    session: { workspaceId: 'workspace-1', workspaceType: 'personal' },
    userPreferences: { workspaceType: 'personal' },
    timestamp: '2026-08-01T00:00:00.000Z',
    featureFlags: { goalsEnabled: true, goalsShadowMode: true, goalsTelemetryEnabled: false },
    ...overrides,
  };
}

const scenarios = [
  ['economia completa', 'Quero juntar R$ 10.000 em 12 meses', 'SAVINGS', 'NEEDS_INFORMATION'],
  ['reserva de emergência', 'preciso de uma reserva de emergência', 'EMERGENCY_FUND', 'DRAFT'],
  ['compra de bem', 'quero comprar um carro de 50 mil', 'PURCHASE', 'AT_RISK'],
  ['investimento', 'quero investir 20 mil em 3 anos', 'INVESTMENT', 'NEEDS_INFORMATION'],
  ['orçamento', 'quero criar um planejamento mensal', 'BUDGET', 'DRAFT'],
  ['fluxo de caixa', 'quero organizar o fluxo de caixa da minha empresa', 'CASH_FLOW', 'DRAFT'],
  ['sem objetivo', 'Olá, tudo bem?', 'UNKNOWN', 'UNKNOWN'],
];

for (const [name, text, type, status] of scenarios) {
  test(`engine: ${name}`, () => {
    const result = runGoalEngine(input(text));
    assert.equal(result.type, type);
    assert.equal(result.status, status);
    assert.equal(validateContract(result), true);
  });
}

function validateContract(result) {
  if (typeof result.type !== 'string') return false;
  if (typeof result.status !== 'string') return false;
  if (typeof result.horizon !== 'string') return false;
  if (typeof result.priority !== 'string') return false;
  if (typeof result.confidence !== 'number') return false;
  if (typeof result.feasibility !== 'string') return false;
  if (result.progress != null && typeof result.progress !== 'number') return false;
  if (!Array.isArray(result.missingInformation)) return false;
  if (!Array.isArray(result.dependencies)) return false;
  if (!Array.isArray(result.conflicts)) return false;
  if (!Array.isArray(result.risks)) return false;
  if (!Array.isArray(result.diagnostics)) return false;
  if (!Array.isArray(result.suggestions)) return false;
  if (typeof result.recommendedNextStep !== 'string') return false;
  if (!result.goal || typeof result.goal !== 'object') return false;
  if (!result.shadow || result.shadow.appliedToDecision !== false) return false;
  return true;
}

test('engine: objetivo explícito completo mantém alvo e evidências', () => {
  const result = runGoalEngine(input('Quero juntar R$ 10.000 em 12 meses'));
  assert.equal(result.goalDetected, true);
  assert.equal(result.goal.normalized, 'quero juntar r$ 10.000 em 12 meses');
  assert.equal(result.target.amount, 10000);
  assert.equal(result.target.currency, 'BRL');
  assert.equal(result.target.horizonMonths, 12);
  assert.equal(result.horizon, 'MEDIUM_TERM');
  assert.ok(result.missingInformation.includes('target_date'));
  assert.equal(result.progress, 7);
  assert.equal(result.sourceSummary.source, 'explicit_user_statement');
  assert.ok(result.evidenceSummary.targetAmount);
  assert.equal(result.recommendedNextStep, 'REQUEST_TARGET_DETAILS');
});

test('engine: entradas vazia e inválida nunca lançam exceção', () => {
  const empty = runGoalEngine();
  assert.equal(empty.enabled, false);
  const off = runGoalEngine(input('Quero juntar 10 mil', {
    featureFlags: { goalsEnabled: false, goalsShadowMode: true, goalsTelemetryEnabled: false },
  }));
  assert.equal(off.enabled, false);
  assert.equal(off.goalDetected, false);
  assert.equal(off.type, 'UNKNOWN');
  assert.doesNotThrow(() => JSON.stringify(off));
});

test('engine: flags desligadas por padrão retornam resultado vazio', () => {
  const result = runGoalEngine(input('Quero juntar 10 mil', {
    featureFlags: {},
  }));
  assert.equal(result.enabled, false);
  assert.equal(result.shadowMode, true);
  assert.deepEqual(result.diagnostics, ['GOAL_NOT_DETECTED', 'SHADOW_ONLY']);
});

test('engine: Shadow Mode — nenhuma aplicação, execução ou persistência', () => {
  const result = runGoalEngine(input('Quero juntar R$ 10.000 em 12 meses'));
  const shadow = result.shadow;
  assert.equal(shadow.shadowMode, true);
  assert.equal(shadow.appliedToDecision, false);
  assert.equal(shadow.appliedToResponse, false);
  assert.equal(shadow.executed, false);
  assert.equal(shadow.voiceTouched, false);
  assert.equal(shadow.databaseCalled, false);
  assert.equal(shadow.memoryModified, false);
  assert.equal(shadow.planningModified, false);
  assert.equal(shadow.pipelineAltered, false);
});

test('engine: nunca modifica os snapshots de entrada', () => {
  const source = input('Quero juntar R$ 10.000 em 12 meses');
  const before = JSON.stringify(source);
  runGoalEngine(source);
  assert.equal(JSON.stringify(source), before);
});

test('engine: é determinístico exceto latência', () => {
  const source = input('Quero juntar R$ 10.000 em 12 meses');
  const first = runGoalEngine(source);
  const second = runGoalEngine(source);
  first.latencyMs = null;
  second.latencyMs = null;
  assert.deepEqual(first, second);
});

test('engine: saída é 100% serializável e sem funções', () => {
  const result = runGoalEngine(input('Quero juntar R$ 10.000 em 12 meses'));
  assert.deepEqual(findFunctionsInValue(result), []);
  assert.equal(isSerializableValue(result), true);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('engine: falha segura — erro interno retorna resultado vazio válido', () => {
  const boom = new Proxy({}, {
    get() {
      throw new Error('boom');
    },
  });
  const result = runGoalEngine(input('Quero juntar 10 mil', {
    normalizedMessage: boom,
    featureFlags: { goalsEnabled: true, goalsShadowMode: true, goalsTelemetryEnabled: false },
  }));
  assert.equal(result.enabled, false, 'falha interna retorna resultado vazio');
  assert.equal(result.goalDetected, false);
  assert.equal(result.type, 'UNKNOWN');
  assert.equal(validateContract(result), true);
});

test('engine: separação pessoal × empresarial é mantida no resultado', () => {
  const personal = runGoalEngine(input('quero poupar pra minha empresa'));
  assert.ok(personal.conflicts.some((c) => c.type === 'PERSONAL_VS_BUSINESS'));
  assert.equal(personal.status, 'BLOCKED');
  const business = runGoalEngine(input('quero organizar o fluxo de caixa da minha empresa', {
    userPreferences: { workspaceType: 'business' },
    session: { workspaceId: 'workspace-2', workspaceType: 'business' },
  }));
  assert.equal(
    business.conflicts.filter((c) => c.type === 'PERSONAL_VS_BUSINESS').length,
    0,
    'negócio puro não conflita com pessoal',
  );
});

test('engine: sem evidência não declara alcançado nem abandonado', () => {
  const result = runGoalEngine(input('quero guardar dinheiro'));
  assert.notEqual(result.status, 'ACHIEVED_INFERRED');
  assert.notEqual(result.status, 'ABANDONED_INFERRED');
  assert.equal(result.progress, null);
});

test('engine: saldo inicial nunca é tratado como receita ou progresso sem memória', () => {
  const noMemory = runGoalEngine(input('Quero juntar R$ 10.000 em 12 meses', {
    persistentMemory: null,
    operationalMemory: null,
  }));
  assert.equal(noMemory.progress, null, 'saldo sozinho não estima progresso');
});

test('engine: performance — mediana abaixo de 10ms e p95 abaixo de 20ms', () => {
  const source = input('Quero juntar R$ 10.000 em 12 meses');
  for (let i = 0; i < 20; i += 1) runGoalEngine(source);
  const timings = [];
  for (let i = 0; i < 100; i += 1) {
    const start = performance.now();
    runGoalEngine(source);
    timings.push(performance.now() - start);
  }
  timings.sort((a, b) => a - b);
  assert.ok(timings[49] < 10, `mediana: ${timings[49].toFixed(2)}ms`);
  assert.ok(timings[94] < 20, `p95: ${timings[94].toFixed(2)}ms`);
});
