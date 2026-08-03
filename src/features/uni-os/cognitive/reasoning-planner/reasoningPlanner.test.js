import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import {
  ANALYSIS_MODES,
  REASONING_DEPTHS,
  createReasoningPlanSnapshot,
  planReasoning,
  resolveAnalysisMode,
  runReasoningPlannerShadow,
  validateReasoningPlan,
} from './index.js';

const NOW = '2026-07-13T18:00:00.000Z';

function compiledContext(intent = 'question', overrides = {}) {
  return {
    compiledContext: {
      conversation: {
        intent,
        confidence: 0.95,
        requiresConfirmation: false,
        entities: {},
        ...(overrides.conversation ?? {}),
      },
      goals: overrides.goals ?? [],
      memory: overrides.memory ?? [],
      context: overrides.context ?? [],
      insights: overrides.insights ?? [],
      planning: overrides.planning ?? {},
      reflection: overrides.reflection ?? {},
      security: overrides.security ?? {},
      permissions: overrides.permissions ?? {},
    },
  };
}

test('geracao e deterministica para entrada e horario iguais', () => {
  const input = compiledContext('forecast');
  assert.deepEqual(planReasoning(input, { now: NOW }), planReasoning(input, { now: NOW }));
});

test('schema expoe todos os niveis de profundidade', () => {
  assert.deepEqual(REASONING_DEPTHS, ['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']);
});

test('LOW atende conversa casual', () => {
  assert.equal(planReasoning(compiledContext('question'), { now: NOW }).reasoningDepth, 'LOW');
});

test('MEDIUM atende acao financeira confirmavel', () => {
  const plan = planReasoning(compiledContext('register_expense', {
    conversation: { requiresConfirmation: true },
  }), { now: NOW });
  assert.equal(plan.reasoningDepth, 'MEDIUM');
});

test('HIGH atende analise financeira', () => {
  assert.equal(planReasoning(compiledContext('forecast'), { now: NOW }).reasoningDepth, 'HIGH');
});

test('VERY_HIGH atende emergencia', () => {
  assert.equal(planReasoning(compiledContext('emergency'), { now: NOW }).reasoningDepth, 'VERY_HIGH');
});

const ANALYSIS_CASES = Object.freeze({
  question: 'CASUAL',
  register_income: 'TRANSACTIONAL',
  check_balance: 'ANALYTICAL',
  create_goal: 'PLANNING',
  configuration: 'CONFIGURATION',
  emergency: 'SAFETY',
});

Object.entries(ANALYSIS_CASES).forEach(([intent, expected]) => {
  test(`analysisMode ${expected} para ${intent}`, () => {
    assert.equal(resolveAnalysisMode(intent), expected);
    assert.equal(planReasoning(compiledContext(intent), { now: NOW }).analysisMode, expected);
  });
});

test('todos os analysisMode oficiais possuem caso deterministico', () => {
  assert.deepEqual(new Set(Object.values(ANALYSIS_CASES)), new Set(ANALYSIS_MODES));
});

test('acao financeira exige confirmacao sem autorizar execucao', () => {
  const plan = planReasoning(compiledContext('register_transfer', {
    conversation: { requiresConfirmation: true },
  }), { now: NOW });
  assert.equal(plan.decisionStrategy, 'REQUIRE_CONFIRMATION');
  assert.equal(plan.responseStrategy, 'CONFIRMATION_REQUEST');
  assert.equal(plan.followUpRequired, true);
  assert.equal(plan.executionAllowed, false);
});

test('planejamento avalia opcoes e orienta por objetivo', () => {
  const plan = planReasoning(compiledContext('create_goal'), { now: NOW });
  assert.equal(plan.decisionStrategy, 'EVALUATE_OPTIONS');
  assert.equal(plan.responseStrategy, 'GUIDED_PLAN');
  assert.equal(plan.priorityFocus, 'GOAL_ALIGNMENT');
  assert.deepEqual(plan.requiredGoalSections, ['goals']);
});

test('ambiguidade prevalece e exige esclarecimento', () => {
  const plan = planReasoning(compiledContext('check_balance', {
    reflection: { ambiguityDetected: true },
  }), { now: NOW });
  assert.equal(plan.decisionStrategy, 'CLARIFY_FIRST');
  assert.equal(plan.responseStrategy, 'CLARIFYING_QUESTION');
  assert.equal(plan.followUpRequired, true);
});

test('emergencia usa estrategia de seguranca', () => {
  const plan = planReasoning(compiledContext('emergency'), { now: NOW });
  assert.equal(plan.decisionStrategy, 'SAFETY_FIRST');
  assert.equal(plan.responseStrategy, 'CAREFUL_GUIDANCE');
  assert.equal(plan.riskLevel, 'CRITICAL');
});

test('configuracao preserva preferencia', () => {
  const plan = planReasoning(compiledContext('configuration'), { now: NOW });
  assert.equal(plan.decisionStrategy, 'PRESERVE_PREFERENCE');
  assert.equal(plan.responseStrategy, 'CONFIGURATION_ACKNOWLEDGEMENT');
});

test('capabilities e secoes sao derivadas somente do contexto compilado', () => {
  const plan = planReasoning(compiledContext('forecast', {
    goals: [{ goalId: 'g1' }],
    memory: [{ memoryId: 'm1' }],
    context: [{ key: 'workspace.type', value: 'business' }],
    insights: [{ insightId: 'i1', type: 'SPENDING_PATTERN' }],
  }), { now: NOW });
  assert.deepEqual(plan.requiredCapabilities, [
    'FINANCIAL_REASONING', 'EXPLANATION', 'FORECAST', 'INSIGHT_ANALYSIS',
  ]);
  assert.deepEqual(plan.requiredMemorySections, ['memory']);
  assert.deepEqual(plan.requiredInsightSections, ['insights']);
  assert.deepEqual(plan.requiredGoalSections, ['goals']);
  assert.equal(plan.requiredContextSections.includes('context'), true);
});

test('objeto vazio produz plano completo e seguro', () => {
  const plan = planReasoning({}, { now: NOW });
  assert.equal(plan.intent, 'question');
  assert.equal(plan.analysisMode, 'CASUAL');
  assert.equal(plan.reasoningDepth, 'LOW');
  assert.equal(plan.riskLevel, 'LOW');
  assert.equal(plan.ambiguityLevel, 'NONE');
  assert.equal(plan.executionAllowed, false);
});

test('reasoningPlan aplica deep freeze em todos os objetos publicos', () => {
  const plan = planReasoning(compiledContext('forecast', {
    insights: [{ insightId: 'i1', type: 'GOAL_DELAY' }],
  }), { now: NOW });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.requiredCapabilities), true);
  assert.equal(Object.isFrozen(plan.requiredContextSections), true);
  assert.equal(Object.isFrozen(plan.metadata), true);
});

test('schema realiza clone defensivo antes de congelar', () => {
  const capabilities = ['CONVERSATION'];
  const draft = { requiredCapabilities: capabilities, generatedAt: NOW };
  const plan = createReasoningPlanSnapshot(draft);
  capabilities.push('FORECAST');
  draft.intent = 'forecast';
  assert.deepEqual(plan.requiredCapabilities, ['CONVERSATION']);
  assert.equal(plan.intent, 'question');
  assert.equal(Object.isFrozen(draft), false);
  assert.equal(Object.isFrozen(capabilities), false);
});

test('validator aprova contrato valido e rejeita mutabilidade', () => {
  const plan = planReasoning(compiledContext('question'), { now: NOW });
  assert.deepEqual(validateReasoningPlan(plan), { valid: true, errors: [] });
  const mutable = { ...plan };
  assert.equal(validateReasoningPlan(mutable).errors.includes('MUTABLE_REASONING_PLAN'), true);
});

test('planner nao altera nem congela contexto recebido', () => {
  const input = compiledContext('forecast', { memory: [{ memoryId: 'm1' }] });
  const before = JSON.stringify(input);
  planReasoning(input, { now: NOW });
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(input), false);
  assert.equal(Object.isFrozen(input.compiledContext.memory), false);
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runReasoningPlannerShadow(), {
    status: 'DISABLED', reasoningPlan: null,
  });
});

test('modo sombra observa reasoningPlan e descarta resultado', async () => {
  let observed;
  const result = await runReasoningPlannerShadow(compiledContext('forecast'), {
    enabled: true,
    observer: (plan) => { observed = plan; },
    plannerOptions: { now: NOW },
  });
  assert.equal(observed.analysisMode, 'ANALYTICAL');
  assert.equal(observed.executionAllowed, false);
  assert.deepEqual(result, { status: 'OBSERVED', reasoningPlan: null });
});

test('falha do observador fica contida no modo sombra', async () => {
  const result = await runReasoningPlannerShadow(compiledContext('question'), {
    enabled: true,
    observer: () => { throw new Error('observer failure'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', reasoningPlan: null });
});

test('modulo nao contem HTTP SDK modelos prompts ou persistencia', async () => {
  const files = [
    'reasoningPlanner.js', 'reasoningEngine.js', 'reasoningStrategies.js',
    'reasoningDepth.js', 'reasoningSchema.js', 'reasoningValidator.js',
  ];
  const sources = await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
  );
  const source = sources.join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|axios/i);
  assert.doesNotMatch(source, /openai|elevenlabs|claude|gemini/i);
  assert.doesNotMatch(source, /supabase|createPrompt|buildPrompt|invokeModel/i);
});
