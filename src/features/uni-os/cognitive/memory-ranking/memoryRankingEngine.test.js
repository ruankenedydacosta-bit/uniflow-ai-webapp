import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  MEMORY_RELEVANCE,
  createMemoryRankingSnapshot,
  processMemoryRanking,
  runMemoryRankingShadow,
  scoreMemoryRelevance,
} from './index.js';

const NOW = '2026-07-13T12:00:00.000Z';
const WORKSPACE_ID = 'workspace-a';

function memory(overrides = {}) {
  return {
    id: 'memory-1',
    workspace_id: WORKSPACE_ID,
    memory_type: 'category_preference',
    memory_value: { category_name: 'Alimentação' },
    source: 'explicit_user',
    status: 'confirmed',
    confidence: 0.9,
    last_observed_at: '2026-07-10T12:00:00.000Z',
    expires_at: null,
    ...overrides,
  };
}

function input(memories, overrides = {}) {
  return {
    parsedIntent: { intent: 'question', entities: { categories: [] } },
    contextSnapshot: { workspace: { id: WORKSPACE_ID } },
    memorySnapshot: { memories },
    goalSnapshot: { goals: [], primaryGoal: null },
    goalRankingSnapshot: { rankedGoals: [], primaryGoal: null },
    ...overrides,
  };
}

test('schema expõe contrato e relevâncias oficiais', () => {
  const ranking = {
    memoryId: 'memory-1', type: 'category_preference', relevance: 'HIGH',
    score: 70, confidence: 0.9, reasons: [],
  };
  const snapshot = createMemoryRankingSnapshot({ rankedMemories: [ranking], primaryMemory: ranking });
  assert.deepEqual(MEMORY_RELEVANCE, ['LOW', 'MEDIUM', 'HIGH']);
  assert.equal(snapshot.primaryMemory.memoryId, 'memory-1');
});

test('ordena memórias pelo maior score', () => {
  const snapshot = processMemoryRanking(input([
    memory({ id: 'conversation', memory_type: 'conversation_preference' }),
    memory({ id: 'expense', memory_type: 'recurring_expense', source: 'transaction_pattern' }),
  ], { parsedIntent: { intent: 'register_expense', entities: { categories: [] } } }), { now: NOW });
  assert.deepEqual(snapshot.rankedMemories.map((item) => item.memoryId), ['expense', 'conversation']);
  assert.equal(snapshot.primaryMemory.memoryId, 'expense');
});

test('score combina intenção, confiança, recência, origem e workspace', () => {
  const ranking = scoreMemoryRelevance({
    id: 'memory-1',
    type: 'recurring_expense',
    source: 'explicit_user',
    confidence: 0.9,
    observedAt: '2026-07-10T12:00:00.000Z',
    value: {},
  }, { parsedIntent: { intent: 'register_expense', entities: { categories: [] } } }, { now: NOW });
  assert.equal(ranking.score, 71);
  assert.deepEqual(ranking.reasons, [
    'WORKSPACE_MATCH', 'INTENT_MATCH', 'RECENT_MEMORY', 'CONFIDENCE_WEIGHT', 'EXPLICIT_SOURCE',
  ]);
});

test('categoria equivalente aumenta a relevância', () => {
  const snapshot = processMemoryRanking(input([memory()], {
    parsedIntent: {
      intent: 'register_expense',
      entities: { categories: [{ normalized: 'alimentacao', display: 'Alimentação' }] },
    },
  }), { now: NOW });
  assert.equal(snapshot.rankedMemories[0].reasons.includes('CATEGORY_MATCH'), true);
});

test('empates preservam a ordem original', () => {
  const snapshot = processMemoryRanking(input([
    memory({ id: 'first' }),
    memory({ id: 'second' }),
  ]), { now: NOW });
  assert.deepEqual(snapshot.rankedMemories.map((item) => item.memoryId), ['first', 'second']);
});

test('confiança desempata scores iguais sem alterar confiança original', () => {
  const snapshot = processMemoryRanking(input([
    memory({ id: 'older-high', confidence: 1, last_observed_at: '2026-06-20T12:00:00.000Z' }),
    memory({ id: 'recent-low', confidence: 0.6, last_observed_at: '2026-07-10T12:00:00.000Z' }),
  ]), { now: NOW });
  assert.deepEqual(snapshot.rankedMemories.map((item) => item.memoryId), ['older-high', 'recent-low']);
  assert.equal(snapshot.rankedMemories[0].confidence, 1);
});

test('memórias de outro workspace nunca participam', () => {
  const snapshot = processMemoryRanking(input([
    memory({ id: 'allowed' }),
    memory({ id: 'blocked', workspace_id: 'workspace-b' }),
  ]), { now: NOW });
  assert.deepEqual(snapshot.rankedMemories.map((item) => item.memoryId), ['allowed']);
  assert.equal(snapshot.metadata.eligibleMemoryCount, 1);
});

test('memória sem workspace fora de projeção confiável é inválida', () => {
  const snapshot = processMemoryRanking(input([memory({ workspace_id: null })]), { now: NOW });
  assert.deepEqual(snapshot.rankedMemories, []);
});

test('projeção do Memory Adapter preserva isolamento previamente aplicado', () => {
  const snapshot = processMemoryRanking({
    contextSnapshot: { workspace: { id: WORKSPACE_ID } },
    memorySnapshot: {
      explicit: { items: [{ id: 'projected', type: 'category_preference', source: 'explicit_user', confirmed: true }] },
      conversation: { items: [] },
      metadata: { version: '1.0' },
    },
  }, { now: NOW });
  assert.deepEqual(snapshot.rankedMemories.map((item) => item.memoryId), ['projected']);
});

test('memórias expiradas nunca são ranqueadas', () => {
  const snapshot = processMemoryRanking(input([
    memory({ id: 'expired-date', expires_at: '2026-07-12T12:00:00.000Z' }),
    memory({ id: 'expired-status', status: 'expired' }),
  ]), { now: NOW });
  assert.deepEqual(snapshot.rankedMemories, []);
});

test('memórias inválidas nunca são ranqueadas', () => {
  const snapshot = processMemoryRanking(input([
    memory({ id: null }),
    memory({ id: 'invalid-type', memory_type: 'unknown' }),
    memory({ id: 'invalid-date', expires_at: 'not-a-date' }),
    memory({ id: 'rejected', status: 'rejected' }),
    memory({ id: 'invalid-source', source: 'unknown' }),
    memory({ id: 'invalid-value', memory_value: null }),
  ]), { now: NOW });
  assert.deepEqual(snapshot.rankedMemories, []);
});

test('origem explícita recebe motivo e peso próprios', () => {
  const snapshot = processMemoryRanking(input([memory()]), { now: NOW });
  assert.equal(snapshot.rankedMemories[0].reasons.includes('EXPLICIT_SOURCE'), true);
  assert.equal(snapshot.rankedMemories[0].confidence, 0.9);
});

test('objetivo ativo relacionado aumenta relevância', () => {
  const goalMemory = memory({
    memory_type: 'financial_goal_context',
    memory_value: { goal_id: 'goal-1' },
  });
  const snapshot = processMemoryRanking(input([goalMemory], {
    goalSnapshot: { goals: [{ id: 'goal-1', status: 'ACTIVE' }], primaryGoal: { id: 'goal-1' } },
    goalRankingSnapshot: { primaryGoal: { goalId: 'goal-1' } },
  }), { now: NOW });
  assert.equal(snapshot.rankedMemories[0].reasons.includes('ACTIVE_GOAL_MATCH'), true);
});

test('objetivos não relacionados não adicionam compatibilidade', () => {
  const goalMemory = memory({
    memory_type: 'financial_goal_context',
    memory_value: { goal_id: 'goal-2' },
  });
  const snapshot = processMemoryRanking(input([goalMemory], {
    goalSnapshot: { goals: [{ id: 'goal-1', status: 'ACTIVE' }] },
  }), { now: NOW });
  assert.equal(snapshot.rankedMemories[0].reasons.includes('ACTIVE_GOAL_MATCH'), false);
});

test('memória abaixo do limiar não é selecionada, mas não é removida da fonte', () => {
  const memories = [memory({
    source: 'transaction_pattern',
    confidence: 0,
    last_observed_at: '2025-01-01T00:00:00.000Z',
  })];
  const snapshot = processMemoryRanking(input(memories), { now: NOW });
  assert.deepEqual(snapshot.rankedMemories, []);
  assert.equal(memories.length, 1);
});

test('snapshot aplica deep freeze obrigatório', () => {
  const snapshot = processMemoryRanking(input([memory()]), { now: NOW });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.rankedMemories), true);
  assert.equal(Object.isFrozen(snapshot.rankedMemories[0]), true);
  assert.equal(Object.isFrozen(snapshot.rankedMemories[0].reasons), true);
  assert.equal(Object.isFrozen(snapshot.metadata), true);
});

test('engine não altera qualquer snapshot ou score original', () => {
  const source = input([memory({ score: 999 })]);
  const before = JSON.stringify(source);
  processMemoryRanking(source, { now: NOW });
  assert.equal(JSON.stringify(source), before);
  assert.equal(source.memorySnapshot.memories[0].score, 999);
  assert.equal(Object.isFrozen(source), false);
});

test('metadados proíbem criação, mutação, persistência e execução', () => {
  const snapshot = processMemoryRanking(input([memory()]), { now: NOW });
  assert.equal(snapshot.metadata.createdMemories, false);
  assert.equal(snapshot.metadata.mutatedMemories, false);
  assert.equal(snapshot.metadata.persisted, false);
  assert.equal(snapshot.metadata.executionAllowed, false);
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runMemoryRankingShadow(), { status: 'DISABLED', ranking: null });
});

test('modo sombra observa o snapshot e descarta o resultado', async () => {
  let observed;
  const result = await runMemoryRankingShadow(input([memory()]), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
    engineOptions: { now: NOW },
  });
  assert.equal(observed.rankedMemories.length, 1);
  assert.deepEqual(result, { status: 'OBSERVED', ranking: null });
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runMemoryRankingShadow(input([memory()]), {
    enabled: true,
    observer: () => { throw new Error('observer failure'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', ranking: null });
});

test('entradas vazias ou inválidas retornam snapshot seguro', () => {
  assert.deepEqual(processMemoryRanking().rankedMemories, []);
  assert.deepEqual(processMemoryRanking({ memorySnapshot: { memories: 'invalid' } }).rankedMemories, []);
});

test('módulo não chama APIs, Supabase ou modelos externos', async () => {
  const sources = await Promise.all([
    'memoryRankingEngine.js', 'memoryRankingPolicy.js', 'memoryRankingSchema.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const source = sources.join('\n');
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /supabase|openai|elevenlabs/i);
});
