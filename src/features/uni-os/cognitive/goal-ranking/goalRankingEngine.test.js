import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  GOAL_RELEVANCE,
  createGoalRankingSnapshot,
  processGoalRanking,
  rankGoals,
  runGoalRankingShadow,
  scoreGoalRelevance,
} from './index.js';

const NOW = '2026-07-12T12:00:00.000Z';

function goal(overrides = {}) {
  return {
    id: 'goal-1',
    type: 'Savings',
    title: 'Reserva',
    priority: 'NORMAL',
    progress: 0.4,
    status: 'ACTIVE',
    targetValue: 10000,
    currentValue: 4000,
    deadline: '2026-12-31',
    confidence: 1,
    ...overrides,
  };
}

function input(goals, overrides = {}) {
  return {
    parsedIntent: { intent: 'question', entities: { categories: [], workspaces: [] } },
    contextSnapshot: {},
    memorySnapshot: {},
    goalSnapshot: { goals },
    ...overrides,
  };
}

test('schema expõe contrato e relevâncias oficiais', () => {
  const ranking = { goalId: 'goal-1', relevance: 'HIGH', priority: 'HIGH', score: 70, reasons: [] };
  const snapshot = createGoalRankingSnapshot({ rankedGoals: [ranking], primaryGoal: ranking });
  assert.deepEqual(GOAL_RELEVANCE, ['LOW', 'MEDIUM', 'HIGH']);
  assert.equal(snapshot.rankedGoals[0].goalId, 'goal-1');
  assert.equal(snapshot.primaryGoal.goalId, 'goal-1');
});

test('ordena objetivos pelo score mais alto', () => {
  const snapshot = processGoalRanking(input([
    goal({ id: 'savings', type: 'Savings', priority: 'LOW' }),
    goal({ id: 'income', type: 'IncomeGrowth', priority: 'HIGH' }),
  ], { parsedIntent: { intent: 'register_income', entities: { categories: [] } } }), { now: NOW });
  assert.deepEqual(snapshot.rankedGoals.map((item) => item.goalId), ['income', 'savings']);
  assert.equal(snapshot.primaryGoal.goalId, 'income');
});

test('score combina intenção, prioridade e estado ativo deterministicamente', () => {
  const ranking = scoreGoalRelevance(
    goal({ type: 'IncomeGrowth', priority: 'HIGH' }),
    { parsedIntent: { intent: 'register_income', entities: { categories: [] } } },
    { now: NOW },
  );
  assert.equal(ranking.score, 52);
  assert.deepEqual(ranking.reasons, ['ACTIVE_GOAL', 'PRIORITY_WEIGHT', 'INTENT_MATCH']);
});

test('categoria estruturada aumenta compatibilidade sem ler texto original', () => {
  const ranking = scoreGoalRelevance(goal({ type: 'DebtReduction', title: 'Quitar cartão' }), {
    parsedIntent: {
      intent: 'register_expense',
      entities: { categories: [{ normalized: 'divida', display: 'Dívida' }] },
    },
  }, { now: NOW });
  assert.equal(ranking.reasons.includes('CATEGORY_MATCH'), true);
  assert.equal(ranking.relevance, 'HIGH');
});

test('contexto empresarial favorece BusinessGrowth', () => {
  const ranking = scoreGoalRelevance(goal({ type: 'BusinessGrowth' }), {
    parsedIntent: { intent: 'question', entities: { categories: [] } },
    contextSnapshot: { workspace: { type: 'business' } },
  }, { now: NOW });
  assert.equal(ranking.reasons.includes('CONTEXT_MATCH'), true);
});

test('prazo próximo participa do score', () => {
  const ranking = scoreGoalRelevance(goal({ deadline: '2026-07-20' }), {}, { now: NOW });
  assert.equal(ranking.reasons.includes('DEADLINE_PROXIMITY'), true);
  assert.equal(ranking.score, 28);
});

test('memória apenas corrobora objetivo existente pelo ID', () => {
  const ranking = scoreGoalRelevance(goal(), {
    memorySnapshot: { financial: { goals: [{ id: 'goal-1' }] } },
  }, { now: NOW });
  assert.equal(ranking.reasons.includes('MEMORY_CORROBORATED'), true);
});

test('empates preservam ordem original', () => {
  const ranked = rankGoals([
    goal({ id: 'first', deadline: null }),
    goal({ id: 'second', deadline: null }),
  ], {}, { now: NOW });
  assert.deepEqual(ranked.map((item) => item.goalId), ['first', 'second']);
});

test('empate de score usa prioridade original sem alterá-la', () => {
  const ranked = rankGoals([
    goal({ id: 'low-overdue', priority: 'LOW', deadline: '2026-07-01' }),
    goal({ id: 'normal-near', priority: 'NORMAL', deadline: '2026-07-20' }),
  ], {}, { now: NOW });
  assert.deepEqual(ranked.map((item) => item.goalId), ['normal-near', 'low-overdue']);
  assert.equal(ranked[1].priority, 'LOW');
});

test('objetivos vazios geram snapshot seguro', () => {
  const snapshot = processGoalRanking();
  assert.deepEqual(snapshot.rankedGoals, []);
  assert.equal(snapshot.primaryGoal, null);
});

test('múltiplos objetivos permanecem na saída', () => {
  const goals = [goal({ id: 'one' }), goal({ id: 'two' }), goal({ id: 'three' })];
  const snapshot = processGoalRanking(input(goals), { now: NOW });
  assert.equal(snapshot.rankedGoals.length, goals.length);
  assert.equal(snapshot.metadata.sourceGoalCount, goals.length);
});

test('snapshot aplica deep freeze', () => {
  const snapshot = processGoalRanking(input([goal()]), { now: NOW });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.rankedGoals), true);
  assert.equal(Object.isFrozen(snapshot.rankedGoals[0]), true);
  assert.equal(Object.isFrozen(snapshot.rankedGoals[0].reasons), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
});

test('engine não altera snapshots nem prioridade original', () => {
  const source = input([goal({ priority: 'CRITICAL' })]);
  const before = JSON.stringify(source);
  processGoalRanking(source, { now: NOW });
  assert.equal(JSON.stringify(source), before);
  assert.equal(source.goalSnapshot.goals[0].priority, 'CRITICAL');
  assert.equal(Object.isFrozen(source), false);
});

test('metadados proíbem criação, mutação e execução', () => {
  const snapshot = processGoalRanking(input([goal()]), { now: NOW });
  assert.equal(snapshot.metadata.generatedGoals, false);
  assert.equal(snapshot.metadata.mutatedGoals, false);
  assert.equal(snapshot.metadata.executionAllowed, false);
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runGoalRankingShadow(), { status: 'DISABLED', ranking: null });
});

test('modo sombra observa snapshot e descarta resultado', async () => {
  let observed;
  const result = await runGoalRankingShadow(input([goal()]), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
    engineOptions: { now: NOW },
  });
  assert.equal(observed.rankedGoals.length, 1);
  assert.deepEqual(result, { status: 'OBSERVED', ranking: null });
});

test('falha do observer é controlada', async () => {
  const result = await runGoalRankingShadow(input([goal()]), {
    enabled: true,
    observer: () => { throw new Error('observer failure'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', ranking: null });
});

test('entradas inválidas não lançam erro', () => {
  const snapshot = processGoalRanking({ goalSnapshot: { goals: 'invalid' } });
  assert.deepEqual(snapshot.rankedGoals, []);
  assert.equal(snapshot.primaryGoal, null);
});

test('módulo não chama APIs, Supabase ou modelos externos', async () => {
  const sources = await Promise.all([
    'goalRankingEngine.js',
    'goalRankingPolicy.js',
    'goalRankingSchema.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const source = sources.join('\n');
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /supabase|openai|elevenlabs/i);
});
