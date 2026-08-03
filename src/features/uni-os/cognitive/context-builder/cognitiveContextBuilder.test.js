import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  buildCognitiveContext,
  compressCognitiveCollections,
  runCognitiveContextBuilderShadow,
  sanitizeStructuredValue,
} from './index.js';

const NOW = '2026-07-13T12:00:00.000Z';

function goal(overrides = {}) {
  return {
    goalId: 'goal-1', relevance: 'HIGH', priority: 'HIGH', score: 80, reasons: [], ...overrides,
  };
}

function memory(overrides = {}) {
  return {
    memoryId: 'memory-1', type: 'recurring_expense', relevance: 'HIGH',
    score: 75, confidence: 0.9, reasons: [], ...overrides,
  };
}

function contextItem(overrides = {}) {
  return {
    key: 'workspace.type', value: 'business', relevance: 'HIGH', score: 70, reasons: [], ...overrides,
  };
}

function insight(overrides = {}) {
  return {
    insightId: 'insight:recurring', type: 'RECURRING_EXPENSE', priority: 'HIGH',
    confidence: 0.9, score: 80, reasons: [], ...overrides,
  };
}

function fullInput() {
  return {
    parsedIntent: {
      source: 'text', language: 'pt-BR', intent: 'register_expense', confidence: 0.9,
      entities: { categories: [{ normalized: 'mercado' }] },
      requiresConfirmation: true, actionType: 'expense', metadata: { ready: true },
    },
    goalRanking: { rankedGoals: [goal()] },
    memoryRanking: { rankedMemories: [memory()] },
    contextRanking: { rankedContext: [contextItem()] },
    insights: { insights: [insight()] },
    planning: { planId: 'plan-1', steps: [{ type: 'ask_confirmation' }], executionAllowed: false },
    reflection: { overallRisk: 'LOW', recommendations: ['ASK_CONFIRMATION'] },
    security: { status: 'ALLOW_WITH_CONFIRMATION', executionAllowed: false },
    permissions: { status: 'AUTHORIZED_WITH_CONFIRMATION', scopes: ['READ_CONTEXT'] },
  };
}

test('compila todas as seções do contexto cognitivo', () => {
  const snapshot = buildCognitiveContext(fullInput(), { now: NOW });
  assert.deepEqual(Object.keys(snapshot.compiledContext), [
    'conversation', 'goals', 'memory', 'context', 'insights',
    'planning', 'reflection', 'security', 'permissions',
  ]);
  assert.equal(snapshot.compiledContext.goals.length, 1);
  assert.equal(snapshot.compiledContext.memory.length, 1);
  assert.equal(snapshot.compiledContext.insights.length, 1);
});

test('conversation preserva somente intenção estruturada', () => {
  const snapshot = buildCognitiveContext(fullInput(), { now: NOW });
  assert.equal(snapshot.compiledContext.conversation.intent, 'register_expense');
  assert.equal(snapshot.compiledContext.conversation.entities.categories[0].normalized, 'mercado');
  assert.equal(snapshot.compiledContext.conversation.requiresConfirmation, true);
});

test('planning reflection security e permissions são compilados sem alteração', () => {
  const source = fullInput();
  const snapshot = buildCognitiveContext(source, { now: NOW });
  assert.deepEqual(snapshot.compiledContext.planning, source.planning);
  assert.deepEqual(snapshot.compiledContext.reflection, source.reflection);
  assert.deepEqual(snapshot.compiledContext.security, source.security);
  assert.deepEqual(snapshot.compiledContext.permissions, source.permissions);
});

test('compressor remove objetivos duplicados e preserva maior score', () => {
  const compressed = compressCognitiveCollections({
    goals: [goal({ score: 40 }), goal({ score: 90 })],
  }, { now: NOW });
  assert.equal(compressed.collections.goals.length, 1);
  assert.equal(compressed.collections.goals[0].score, 90);
  assert.equal(compressed.statistics.duplicatesRemoved, 1);
});

test('compressor remove memórias duplicadas', () => {
  const compressed = compressCognitiveCollections({
    memory: [memory(), memory({ score: 70 })],
  }, { now: NOW });
  assert.equal(compressed.collections.memory.length, 1);
  assert.equal(compressed.statistics.duplicatesRemoved, 1);
});

test('compressor remove contexto duplicado', () => {
  const compressed = compressCognitiveCollections({
    context: [contextItem(), contextItem({ score: 60 })],
  }, { now: NOW });
  assert.equal(compressed.collections.context.length, 1);
});

test('compressor remove insights duplicados', () => {
  const compressed = compressCognitiveCollections({
    insights: [insight(), insight({ score: 70 })],
  }, { now: NOW });
  assert.equal(compressed.collections.insights.length, 1);
});

test('filtros removem objetivos inválidos ou irrelevantes', () => {
  const compressed = compressCognitiveCollections({
    goals: [goal({ goalId: null }), goal({ score: 0 }), goal()],
  }, { now: NOW });
  assert.deepEqual(compressed.collections.goals.map((item) => item.goalId), ['goal-1']);
});

test('filtros removem memórias inelegíveis', () => {
  const compressed = compressCognitiveCollections({
    memory: [memory({ eligible: false }), memory({ score: 10 }), memory()],
  }, { now: NOW });
  assert.deepEqual(compressed.collections.memory.map((item) => item.memoryId), ['memory-1']);
});

test('filtros removem memórias expiradas', () => {
  const compressed = compressCognitiveCollections({
    memory: [memory({ memoryId: 'expired', expiresAt: '2026-07-12T12:00:00.000Z' }), memory()],
  }, { now: NOW });
  assert.deepEqual(compressed.collections.memory.map((item) => item.memoryId), ['memory-1']);
});

test('filtros removem contextos expirados', () => {
  const compressed = compressCognitiveCollections({
    context: [contextItem({ key: 'expired', expiresAt: '2026-07-12T12:00:00.000Z' }), contextItem()],
  }, { now: NOW });
  assert.deepEqual(compressed.collections.context.map((item) => item.key), ['workspace.type']);
});

test('NO_INSIGHT é removido quando existe insight acionável', () => {
  const compressed = compressCognitiveCollections({
    insights: [
      insight({ insightId: 'no', type: 'NO_INSIGHT', score: 0 }),
      insight(),
    ],
  }, { now: NOW });
  assert.deepEqual(compressed.collections.insights.map((item) => item.type), ['RECURRING_EXPENSE']);
});

test('NO_INSIGHT é preservado quando é o único insight válido', () => {
  const compressed = compressCognitiveCollections({
    insights: [insight({ insightId: 'no', type: 'NO_INSIGHT', score: 0 })],
  }, { now: NOW });
  assert.deepEqual(compressed.collections.insights.map((item) => item.type), ['NO_INSIGHT']);
});

test('estatísticas registram entradas, saídas, duplicidades e filtros', () => {
  const snapshot = buildCognitiveContext({
    goalRanking: { rankedGoals: [goal(), goal(), goal({ goalId: null })] },
  }, { now: NOW });
  assert.deepEqual(snapshot.statistics, {
    inputItems: 3, outputItems: 1, duplicatesRemoved: 1, filteredItems: 1,
  });
});

test('objetos vazios produzem contrato completo e seguro', () => {
  const snapshot = buildCognitiveContext({}, { now: NOW });
  assert.deepEqual(snapshot.compiledContext.goals, []);
  assert.deepEqual(snapshot.compiledContext.memory, []);
  assert.deepEqual(snapshot.compiledContext.planning, {});
  assert.equal(snapshot.statistics.outputItems, 0);
});

test('sanitização remove prompts, tokens e texto bruto em qualquer seção', () => {
  const dirty = {
    prompt: 'never', accessToken: 'never', nested: { originalText: 'never', safe: 'ok' },
  };
  assert.deepEqual(sanitizeStructuredValue(dirty), { nested: { safe: 'ok' } });
  const snapshot = buildCognitiveContext({ planning: dirty }, { now: NOW });
  assert.doesNotMatch(
    JSON.stringify(snapshot.compiledContext.planning),
    /never|prompt|accessToken|originalText/,
  );
  assert.equal(snapshot.metadata.promptGenerated, false);
});

test('snapshot aplica deep freeze obrigatório', () => {
  const snapshot = buildCognitiveContext(fullInput(), { now: NOW });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.compiledContext), true);
  assert.equal(Object.isFrozen(snapshot.compiledContext.goals), true);
  assert.equal(Object.isFrozen(snapshot.compiledContext.goals[0]), true);
  assert.equal(Object.isFrozen(snapshot.statistics), true);
});

test('builder não altera nem congela snapshots recebidos', () => {
  const source = fullInput();
  const before = JSON.stringify(source);
  buildCognitiveContext(source, { now: NOW });
  assert.equal(JSON.stringify(source), before);
  assert.equal(Object.isFrozen(source), false);
  assert.equal(Object.isFrozen(source.goalRanking.rankedGoals), false);
});

test('metadata proíbe prompt, modelo, texto, persistência e execução', () => {
  const snapshot = buildCognitiveContext(fullInput(), { now: NOW });
  assert.equal(snapshot.metadata.promptGenerated, false);
  assert.equal(snapshot.metadata.modelInvoked, false);
  assert.equal(snapshot.metadata.naturalLanguageGenerated, false);
  assert.equal(snapshot.metadata.persisted, false);
  assert.equal(snapshot.metadata.executionAllowed, false);
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runCognitiveContextBuilderShadow(), {
    status: 'DISABLED', compiledContext: null,
  });
});

test('modo sombra observa snapshot e descarta resultado', async () => {
  let observed;
  const result = await runCognitiveContextBuilderShadow(fullInput(), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
    builderOptions: { now: NOW },
  });
  assert.equal(observed.compiledContext.goals.length, 1);
  assert.deepEqual(result, { status: 'OBSERVED', compiledContext: null });
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runCognitiveContextBuilderShadow(fullInput(), {
    enabled: true,
    observer: () => { throw new Error('observer failure'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', compiledContext: null });
});

test('módulo não chama APIs nem modelos e não cria prompts', async () => {
  const sources = await Promise.all([
    'cognitiveContextBuilder.js', 'contextCompiler.js', 'contextFilter.js',
    'contextCompressor.js', 'contextBuilderSchema.js',
  ].map((file) => readFile(new URL(file, import.meta.url), 'utf8')));
  const source = sources.join('\n');
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /createClient|invokeModel|callModel/i);
  assert.doesNotMatch(source, /openai|claude|gemini/i);
});
