import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { createModelRoutingSchema } from '../../llm/model-router/index.js';
import { buildStructuredPrompt } from '../../llm/prompt-builder/index.js';
import { validatePrompt } from '../../llm/prompt-validator/index.js';
import { createTokenBudgetSchema } from '../../llm/token-budget/index.js';
import {
  DEFAULT_ORCHESTRATOR_MODULES,
  ORCHESTRATOR_STEP_IDS,
  processCognitiveContext,
  runCognitiveOrchestratorShadow,
  validateCognitiveOrchestration,
} from './index.js';

const NOW = '2026-07-14T12:00:00.000Z';
const BUDGET_SECTIONS = [
  'messages', 'goals', 'memory', 'context',
  'insights', 'reflection', 'security', 'permissions',
];

function routingResult() {
  return createModelRoutingSchema({
    requestedCapability: 'GENERAL_REASONING',
    resolvedCapability: 'GENERAL_REASONING',
    candidateProviders: [{ providerId: 'OPENAI', score: 100 }],
    selectedProvider: 'OPENAI',
    fallbackProviders: ['CLAUDE'],
    routingPolicy: 'DEFAULT',
    decisionReason: 'ROUTING_POLICY_APPLIED',
    estimatedCost: 'MEDIUM',
    estimatedLatency: 'NORMAL',
    requiresStructuredContext: true,
    confidence: 1,
  });
}

function tokenBudget() {
  const sections = Object.fromEntries(BUDGET_SECTIONS.map((section) => [section, 256]));
  return createTokenBudgetSchema({
    totalBudget: 2048,
    sections,
    sectionDemand: sections,
    policy: 'BALANCED',
    estimator: 'DETERMINISTIC_STRUCTURE_RATIO_V1',
  });
}

function conversationWindow() {
  return Object.freeze({
    conversationWindow: Object.freeze({
      messages: Object.freeze([]),
      goals: Object.freeze([]),
      memory: Object.freeze([]),
      context: Object.freeze([]),
      insights: Object.freeze([]),
      reflection: Object.freeze({}),
      security: Object.freeze({}),
      permissions: Object.freeze({}),
      metadata: Object.freeze({ version: '1.0', policy: 'NORMAL' }),
    }),
    metadata: Object.freeze({ version: '1.0' }),
  });
}

function completeInput() {
  const base = {
    compiledContext: {
      conversation: { intent: 'question', confidence: 0.95, requiresConfirmation: false },
      goals: [], memory: [], context: [], insights: [],
      reflection: {}, security: { status: 'ALLOW' },
      permissions: { status: 'AUTHORIZED' },
    },
    conversationWindow: conversationWindow(),
    tokenBudget: tokenBudget(),
    routingResult: routingResult(),
  };
  const structuredPrompt = buildStructuredPrompt({
    ...base,
    compiledContext: { compiledContext: base.compiledContext },
  });
  return {
    ...base,
    validationReport: validatePrompt({
      structuredPrompt,
      routingResult: base.routingResult,
      tokenBudget: base.tokenBudget,
    }),
  };
}

function run(input = completeInput(), options = {}) {
  return processCognitiveContext(input, {
    now: NOW,
    clock: (() => {
      const values = [10, 15];
      return () => values.shift() ?? 15;
    })(),
    ...options,
  });
}

test('executa o pipeline completo na ordem obrigatoria', () => {
  const result = run();
  assert.equal(result.status, 'COMPLETED');
  assert.deepEqual(result.trace.map((item) => item.step), ORCHESTRATOR_STEP_IDS);
  assert.equal(result.metrics.modulesExecuted, 6);
  assert.equal(result.snapshots.compiledPrompt.compiledPrompt.policy, 'STANDARD');
});

test('mantem invariantes de execucao e descarte', () => {
  const result = run();
  assert.equal(result.executionAllowed, false);
  assert.equal(result.safeToExecute, false);
  assert.equal(result.discarded, true);
  assert.equal(result.metadata.responseDelivered, false);
  assert.equal(result.metadata.modelInvoked, false);
});

for (const [label, key, step] of [
  ['Planner', 'reasoning', 'REASONING_PLANNER'],
  ['Decision', 'decision', 'DECISION_ENGINE'],
  ['Confidence', 'confidence', 'CONFIDENCE_ENGINE'],
  ['CEP', 'cep', 'COGNITIVE_EXECUTION_PLAN'],
]) {
  test(`${label} ausente produz erro estruturado`, () => {
    const result = run(completeInput(), { modules: { [key]: null } });
    assert.equal(result.status, 'FAILED');
    assert.equal(result.error.code, 'MODULE_UNAVAILABLE');
    assert.equal(result.error.step, step);
  });
}

test('snapshot invalido interrompe o pipeline', () => {
  const result = run(completeInput(), {
    modules: {
      reasoning: {
        execute: () => ({}),
        validate: DEFAULT_ORCHESTRATOR_MODULES.reasoning.validate,
      },
    },
  });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.error.code, 'SNAPSHOT_INVALID');
  assert.equal(result.error.step, 'REASONING_PLANNER');
  assert.equal(result.error.details.length > 0, true);
});

test('falha interna e propagada sem detalhes privados', () => {
  const result = run(completeInput(), {
    modules: {
      decision: {
        execute: () => { throw new Error('private context'); },
        validate: DEFAULT_ORCHESTRATOR_MODULES.decision.validate,
      },
    },
  });
  assert.equal(result.error.code, 'MODULE_FAILURE');
  assert.equal(result.error.step, 'DECISION_ENGINE');
  assert.deepEqual(result.trace.map((item) => item.step), ['REASONING_PLANNER']);
  assert.equal(Boolean(result.snapshots.reasoningPlan), true);
  assert.equal(result.snapshots.decisionPlan, undefined);
  assert.equal(JSON.stringify(result).includes('private context'), false);
});

test('compiler bloqueado permanece falha segura', () => {
  const input = completeInput();
  const result = run({ ...input, validationReport: undefined });
  assert.equal(result.status, 'FAILED');
  assert.equal(result.error.code, 'PROMPT_COMPILATION_BLOCKED');
  assert.equal(result.error.step, 'PROMPT_COMPILER');
});

test('resultado e todos os snapshots sao profundamente imutaveis', () => {
  const result = run();
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.snapshots), true);
  assert.equal(Object.isFrozen(result.snapshots.reasoningPlan), true);
  assert.equal(Object.isFrozen(result.snapshots.compiledPrompt), true);
  assert.deepEqual(validateCognitiveOrchestration(result), { valid: true, errors: [] });
});

test('clone defensivo nao congela nem modifica a entrada', () => {
  const input = completeInput();
  const before = JSON.stringify(input);
  run(input);
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(input), false);
  input.compiledContext.conversation.intent = 'changed';
  assert.equal(input.compiledContext.conversation.intent, 'changed');
});

test('metricas sao locais e deterministicas com clock injetado', () => {
  const result = run();
  assert.equal(result.metrics.durationMs, 5);
  assert.equal(result.metrics.modulesExpected, 6);
  assert.equal(result.metrics.validationErrors, 0);
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runCognitiveOrchestratorShadow(completeInput()), {
    status: 'DISABLED', orchestration: null,
  });
});

test('modo sombra observa e descarta o resultado completo', async () => {
  let observed;
  const result = await runCognitiveOrchestratorShadow(completeInput(), {
    enabled: true,
    observer: (snapshot) => { observed = snapshot; },
    orchestratorOptions: { now: NOW, clock: () => 10 },
  });
  assert.equal(observed.status, 'COMPLETED');
  assert.equal(observed.executionAllowed, false);
  assert.deepEqual(result, { status: 'OBSERVED', orchestration: null });
});

test('falha de observer nao vaza nem entrega resultado', async () => {
  const result = await runCognitiveOrchestratorShadow(completeInput(), {
    enabled: true,
    observer: () => { throw new Error('observer detail'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', orchestration: null });
});

test('arquivos executaveis nao contem rede SDK modelo ou persistencia', async () => {
  const files = [
    'cognitiveOrchestrator.js', 'orchestratorPipeline.js', 'orchestratorPolicies.js',
    'orchestratorSchema.js', 'orchestratorValidator.js',
  ];
  const sources = await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
  );
  const source = sources.join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|WebSocket|axios|supabase/i);
  assert.doesNotMatch(source, /openai|anthropic|elevenlabs|invokeModel|service_role/i);
});
