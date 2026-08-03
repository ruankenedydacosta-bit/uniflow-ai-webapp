import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  INSIGHT_PRIORITIES,
  INSIGHT_TYPES,
  createStructuredInsight,
  prioritizeInsights,
  processInsights,
  runInsightEngineShadow,
} from './index.js';

const NOW = '2026-07-13T12:00:00.000Z';

function goal(overrides = {}) {
  return {
    id: 'goal-1', type: 'Savings', status: 'ACTIVE', progress: 0.4,
    deadline: '2026-12-31', confidence: 0.9, ...overrides,
  };
}

function memory(overrides = {}) {
  return {
    memoryId: 'memory-1', type: 'spending_pattern', relevance: 'HIGH',
    score: 80, confidence: 0.9, reasons: [], ...overrides,
  };
}

function fullInput() {
  const goals = [
    goal({ id: 'delay', deadline: '2026-06-01' }),
    goal({ id: 'progress', progress: 0.9 }),
    goal({ id: 'investment', type: 'Investment', progress: 0.3 }),
    goal({ id: 'reserve', type: 'EmergencyFund', progress: 0.2 }),
    goal({ id: 'business', type: 'BusinessGrowth' }),
  ];
  return {
    parsedIntent: { intent: 'forecast' },
    contextSnapshot: {},
    goalSnapshot: { goals, primaryGoal: goals[4] },
    goalRankingSnapshot: { primaryGoal: { goalId: 'business' } },
    memoryRankingSnapshot: {
      rankedMemories: [
        memory({ memoryId: 'spending', reasons: ['CATEGORY_MATCH'] }),
        memory({ memoryId: 'income', type: 'recurring_income' }),
        memory({ memoryId: 'expense', type: 'recurring_expense' }),
      ],
      metadata: { conflictDetected: true, conflictMemoryIds: ['memory-conflict'] },
    },
    contextRankingSnapshot: {
      rankedContext: [{ key: 'workspace.type', value: 'personal' }],
      metadata: { changedKeys: ['conversation.channel'] },
    },
  };
}

test('schema expõe todos os tipos e prioridades oficiais', () => {
  assert.deepEqual(INSIGHT_TYPES, [
    'GOAL_PROGRESS', 'GOAL_DELAY', 'SPENDING_PATTERN', 'INCOME_PATTERN',
    'INVESTMENT_OPPORTUNITY', 'EMERGENCY_RESERVE', 'RECURRING_EXPENSE',
    'CATEGORY_CONCENTRATION', 'MEMORY_CONFLICT', 'CONTEXT_CHANGE', 'NO_INSIGHT',
  ]);
  assert.deepEqual(INSIGHT_PRIORITIES, ['LOW', 'NORMAL', 'HIGH', 'CRITICAL']);
});

test('detecta todos os tipos acionáveis com dados estruturados', () => {
  const snapshot = processInsights(fullInput(), { now: NOW });
  const types = new Set(snapshot.insights.map((insight) => insight.type));
  INSIGHT_TYPES.filter((type) => type !== 'NO_INSIGHT').forEach((type) => {
    assert.equal(types.has(type), true, `missing ${type}`);
  });
});

test('GOAL_PROGRESS detecta objetivo próximo da conclusão', () => {
  const snapshot = processInsights({ goalSnapshot: { goals: [goal({ progress: 0.9 })] } }, { now: NOW });
  assert.equal(snapshot.insights.some((item) => item.type === 'GOAL_PROGRESS'), true);
});

test('GOAL_DELAY detecta objetivo atrasado', () => {
  const snapshot = processInsights({ goalSnapshot: { goals: [goal({ deadline: '2026-06-01' })] } }, { now: NOW });
  assert.equal(snapshot.insights.some((item) => item.type === 'GOAL_DELAY'), true);
});

test('SPENDING_PATTERN usa somente memória ranqueada', () => {
  const snapshot = processInsights({ memoryRankingSnapshot: { rankedMemories: [memory()] } }, { now: NOW });
  assert.equal(snapshot.insights[0].type, 'SPENDING_PATTERN');
});

test('INCOME_PATTERN usa recorrência de receita estruturada', () => {
  const snapshot = processInsights({
    memoryRankingSnapshot: { rankedMemories: [memory({ type: 'recurring_income' })] },
  }, { now: NOW });
  assert.equal(snapshot.insights[0].type, 'INCOME_PATTERN');
});

test('INVESTMENT_OPPORTUNITY exige objetivo de investimento ativo', () => {
  const snapshot = processInsights({
    goalSnapshot: { goals: [goal({ type: 'Investment' })] },
  }, { now: NOW });
  assert.equal(snapshot.insights.some((item) => item.type === 'INVESTMENT_OPPORTUNITY'), true);
});

test('EMERGENCY_RESERVE exige reserva ativa abaixo de metade', () => {
  const snapshot = processInsights({
    goalSnapshot: { goals: [goal({ type: 'EmergencyFund', progress: 0.2 })] },
  }, { now: NOW });
  assert.equal(snapshot.insights.some((item) => item.type === 'EMERGENCY_RESERVE'), true);
});

test('RECURRING_EXPENSE usa recorrência de despesa estruturada', () => {
  const snapshot = processInsights({
    memoryRankingSnapshot: { rankedMemories: [memory({ type: 'recurring_expense' })] },
  }, { now: NOW });
  assert.equal(snapshot.insights[0].type, 'RECURRING_EXPENSE');
});

test('CATEGORY_CONCENTRATION exige sinal de categoria', () => {
  const snapshot = processInsights({
    memoryRankingSnapshot: { rankedMemories: [memory({ reasons: ['CATEGORY_MATCH'] })] },
  }, { now: NOW });
  assert.equal(snapshot.insights.some((item) => item.type === 'CATEGORY_CONCENTRATION'), true);
});

test('MEMORY_CONFLICT exige metadata explícita de conflito', () => {
  const snapshot = processInsights({
    memoryRankingSnapshot: { rankedMemories: [], metadata: { conflictDetected: true } },
  }, { now: NOW });
  assert.equal(snapshot.insights[0].type, 'MEMORY_CONFLICT');
});

test('CONTEXT_CHANGE detecta mudança estruturada', () => {
  const snapshot = processInsights({
    contextRankingSnapshot: { rankedContext: [], metadata: { changedKeys: ['conversation.channel'] } },
  }, { now: NOW });
  assert.equal(snapshot.insights[0].type, 'CONTEXT_CHANGE');
});

test('sem sinais retorna somente NO_INSIGHT', () => {
  const snapshot = processInsights({}, { now: NOW });
  assert.deepEqual(snapshot.insights.map((item) => item.type), ['NO_INSIGHT']);
  assert.equal(snapshot.primaryInsight.type, 'NO_INSIGHT');
  assert.equal(snapshot.primaryInsight.score, 0);
  assert.equal(snapshot.metadata.actionableCount, 0);
});

test('múltiplos insights são preservados e priorizados', () => {
  const snapshot = processInsights(fullInput(), { now: NOW });
  assert.equal(snapshot.insights.length > 5, true);
  assert.equal(snapshot.primaryInsight.score, Math.max(...snapshot.insights.map((item) => item.score)));
});

test('score combina base, confiança, severidade e intenção', () => {
  const insight = createStructuredInsight({
    type: 'RECURRING_EXPENSE', source: 'MEMORY', referenceId: 'm1',
    rule: 'RECURRING_EXPENSE_RELEVANT', confidence: 0.8, severity: 0.5,
    reasons: ['RECURRING_EXPENSE_RELEVANT'],
  }, { intent: 'register_expense' });
  assert.equal(insight.score, 72);
  assert.equal(insight.priority, 'HIGH');
  assert.equal(insight.reasons.includes('INTENT_COMPATIBLE'), true);
});

test('empates preservam a ordem original', () => {
  const first = createStructuredInsight({ type: 'INCOME_PATTERN', referenceId: 'first' });
  const second = createStructuredInsight({ type: 'INCOME_PATTERN', referenceId: 'second' });
  assert.deepEqual(prioritizeInsights([first, second]).map((item) => item.insightId), [
    first.insightId, second.insightId,
  ]);
});

test('campos comunicacionais são códigos e não linguagem natural', () => {
  const snapshot = processInsights(fullInput(), { now: NOW });
  snapshot.insights.forEach((insight) => {
    assert.match(insight.title, /^[A-Z][A-Z0-9_]*$/);
    assert.match(insight.description, /^[A-Z][A-Z0-9_]*$/);
    assert.match(insight.recommendedAction, /^[A-Z][A-Z0-9_]*$/);
  });
});

test('snapshot aplica deep freeze obrigatório', () => {
  const snapshot = processInsights(fullInput(), { now: NOW });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.insights), true);
  assert.equal(Object.isFrozen(snapshot.insights[0]), true);
  assert.equal(Object.isFrozen(snapshot.insights[0].trigger), true);
  assert.equal(Object.isFrozen(snapshot.insights[0].reasons), true);
});

test('engine não modifica qualquer snapshot recebido', () => {
  const source = fullInput();
  const before = JSON.stringify(source);
  processInsights(source, { now: NOW });
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(source), false);
});

test('metadata proíbe texto, notificação, persistência e execução', () => {
  const snapshot = processInsights(fullInput(), { now: NOW });
  assert.equal(snapshot.metadata.naturalLanguageGenerated, false);
  assert.equal(snapshot.metadata.userNotified, false);
  assert.equal(snapshot.metadata.persisted, false);
  assert.equal(snapshot.metadata.executionAllowed, false);
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runInsightEngineShadow(), { status: 'DISABLED', insights: null });
});

test('modo sombra observa snapshot e descarta resultado', async () => {
  let observed;
  const result = await runInsightEngineShadow(fullInput(), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
    engineOptions: { now: NOW },
  });
  assert.equal(observed.insights.length > 0, true);
  assert.deepEqual(result, { status: 'OBSERVED', insights: null });
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runInsightEngineShadow(fullInput(), {
    enabled: true,
    observer: () => { throw new Error('observer failure'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', insights: null });
});

test('entradas inválidas retornam NO_INSIGHT sem lançar erro', () => {
  const snapshot = processInsights({ goalSnapshot: { goals: 'invalid' } }, { now: NOW });
  assert.deepEqual(snapshot.insights.map((item) => item.type), ['NO_INSIGHT']);
});

test('módulo não chama APIs, Supabase ou modelos externos', async () => {
  const sources = await Promise.all([
    'insightEngine.js', 'insightDetector.js', 'insightPolicy.js',
    'insightPrioritizer.js', 'insightSchema.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const source = sources.join('\n');
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /supabase|openai|elevenlabs/i);
});
