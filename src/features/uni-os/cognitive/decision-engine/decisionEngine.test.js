import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { planReasoning } from '../reasoning-planner/index.js';
import {
  DECISION_STRATEGIES,
  DECISION_TYPES,
  createDecisionPlan,
  createDecisionPlanSnapshot,
  runDecisionEngineShadow,
  validateDecisionPlan,
} from './index.js';

const NOW = '2026-07-13T20:00:00.000Z';

function compiledContext(intent = 'question', overrides = {}) {
  return {
    compiledContext: {
      conversation: {
        intent,
        confidence: 0.95,
        requiresConfirmation: false,
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

function decisionInput(intent = 'question', overrides = {}) {
  const context = compiledContext(intent, overrides);
  return {
    reasoningPlan: planReasoning(context, { now: NOW }),
    compiledContext: context,
  };
}

const DECISION_CASES = Object.freeze([
  ['question', {}, 'DIRECT_RESPONSE', 'DIRECT'],
  ['register_expense', {}, 'FINANCIAL_ACTION_CONFIRMATION', 'CONFIRM_FIRST'],
  ['forecast', {}, 'FINANCIAL_ANALYSIS', 'EVIDENCE_WEIGHTED'],
  ['create_goal', {}, 'GOAL_GUIDANCE', 'GOAL_ALIGNED'],
  ['configuration', {}, 'CONFIGURATION_CHANGE', 'PRESERVE_PREFERENCE'],
  ['emergency', {}, 'SAFETY_GUIDANCE', 'SAFETY_FIRST'],
  ['check_balance', { reflection: { ambiguityDetected: true } },
    'CLARIFICATION_REQUEST', 'CLARIFY_FIRST'],
]);

DECISION_CASES.forEach(([intent, overrides, type, strategy]) => {
  test(`${type} usa ${strategy}`, () => {
    const plan = createDecisionPlan(decisionInput(intent, overrides), { now: NOW });
    assert.equal(plan.decisionType, type);
    assert.equal(plan.selectedStrategy, strategy);
  });
});

test('todos os decisionType possuem politica deterministica', () => {
  assert.deepEqual(new Set(DECISION_CASES.map((item) => item[2])), new Set(DECISION_TYPES));
});

test('todas as decisionStrategies possuem caso coberto', () => {
  assert.deepEqual(new Set(DECISION_CASES.map((item) => item[3])), new Set(DECISION_STRATEGIES));
});

test('geracao e deterministica para entradas e horario iguais', () => {
  const input = decisionInput('forecast');
  assert.deepEqual(
    createDecisionPlan(input, { now: NOW }),
    createDecisionPlan(input, { now: NOW }),
  );
});

test('confidence respeita alvo do planner e penaliza ambiguidade', () => {
  const clear = createDecisionPlan(decisionInput('check_balance'), { now: NOW });
  const ambiguous = createDecisionPlan(decisionInput('check_balance', {
    reflection: { ambiguityDetected: true },
  }), { now: NOW });
  assert.equal(clear.decisionConfidence, 0.9);
  assert.equal(ambiguous.decisionConfidence, 0.75);
  assert.equal(ambiguous.decisionConfidence < clear.decisionConfidence, true);
});

test('riskAssessment preserva risco e bloqueia niveis altos', () => {
  const decision = createDecisionPlan(decisionInput('emergency'), { now: NOW });
  assert.deepEqual(decision.riskAssessment, {
    level: 'CRITICAL', blocking: true, reasons: ['RISK_CRITICAL'],
  });
  assert.equal(decision.executionAllowed, false);
});

test('ambiguityAssessment exige esclarecimento sem completar dados', () => {
  const decision = createDecisionPlan(decisionInput('forecast', {
    reflection: { ambiguityDetected: true, inconsistencies: ['MISSING_AMOUNT'] },
  }), { now: NOW });
  assert.deepEqual(decision.ambiguityAssessment, {
    level: 'HIGH', detected: true, clarificationRequired: true,
  });
  assert.equal(decision.primaryDecision, 'REQUEST_CLARIFICATION');
});

test('confirmationRequired protege toda acao financeira', () => {
  const decision = createDecisionPlan(decisionInput('register_transfer'), { now: NOW });
  assert.equal(decision.confirmationRequired, true);
  assert.equal(decision.executionIntent, 'AWAIT_CONFIRMATION');
  assert.equal(decision.executionAllowed, false);
});

test('fallbackStrategy cobre padrao confirmacao risco e ambiguidade', () => {
  assert.equal(
    createDecisionPlan(decisionInput('question'), { now: NOW }).fallbackStrategy,
    'SAFE_DEFAULT',
  );
  assert.equal(
    createDecisionPlan(decisionInput('register_income'), { now: NOW }).fallbackStrategy,
    'REQUIRE_CONFIRMATION',
  );
  assert.equal(
    createDecisionPlan(decisionInput('emergency'), { now: NOW }).fallbackStrategy,
    'DEFER_DECISION',
  );
  assert.equal(createDecisionPlan(decisionInput('forecast', {
    reflection: { ambiguityDetected: true },
  }), { now: NOW }).fallbackStrategy, 'REQUEST_CLARIFICATION');
});

test('seleciona somente secoes requeridas pelo reasoningPlan', () => {
  const input = decisionInput('forecast', {
    goals: [{ goalId: 'g1' }],
    memory: [{ memoryId: 'm1' }],
    context: [{ key: 'workspace.type', value: 'business' }],
    insights: [{ insightId: 'i1', type: 'SPENDING_PATTERN' }],
    security: { status: 'ALLOW' },
    permissions: { status: 'AUTHORIZED' },
  });
  const decision = createDecisionPlan(input, { now: NOW });
  assert.deepEqual(decision.selectedGoals, [{ goalId: 'g1' }]);
  assert.deepEqual(decision.selectedMemory, [{ memoryId: 'm1' }]);
  assert.deepEqual(decision.selectedInsights, [{ insightId: 'i1', type: 'SPENDING_PATTERN' }]);
  assert.equal(Object.hasOwn(decision.selectedContext, 'context'), true);
  assert.equal(Object.hasOwn(decision.selectedContext, 'security'), true);
});

test('recommendedCapabilities copia capacidades oficiais do planner', () => {
  const input = decisionInput('forecast');
  const decision = createDecisionPlan(input, { now: NOW });
  assert.deepEqual(decision.recommendedCapabilities, input.reasoningPlan.requiredCapabilities);
  assert.notEqual(decision.recommendedCapabilities, input.reasoningPlan.requiredCapabilities);
});

test('plannerReference guarda somente referencia minima', () => {
  const input = decisionInput('create_goal');
  const decision = createDecisionPlan(input, { now: NOW });
  assert.deepEqual(Object.keys(decision.plannerReference), ['version', 'generatedAt', 'intent']);
  assert.equal(decision.plannerReference.version, '1.0');
});

test('objetos vazios geram esclarecimento seguro', () => {
  const decision = createDecisionPlan({}, { now: NOW });
  assert.equal(decision.decisionType, 'CLARIFICATION_REQUEST');
  assert.equal(decision.decisionConfidence, 0);
  assert.equal(decision.confirmationRequired, true);
  assert.equal(decision.executionAllowed, false);
});

test('decisionPlan aplica deep freeze integral', () => {
  const decision = createDecisionPlan(decisionInput('forecast', {
    insights: [{ insightId: 'i1', type: 'GOAL_DELAY' }],
  }), { now: NOW });
  assert.equal(Object.isFrozen(decision), true);
  assert.equal(Object.isFrozen(decision.selectedReasoning), true);
  assert.equal(Object.isFrozen(decision.selectedInsights), true);
  assert.equal(Object.isFrozen(decision.riskAssessment), true);
  assert.equal(Object.isFrozen(decision.metadata), true);
});

test('schema faz clone defensivo antes do deep freeze', () => {
  const selectedInsights = [{ insightId: 'i1' }];
  const draft = { selectedInsights, generatedAt: NOW };
  const decision = createDecisionPlanSnapshot(draft);
  selectedInsights[0].insightId = 'changed';
  selectedInsights.push({ insightId: 'i2' });
  assert.deepEqual(decision.selectedInsights, [{ insightId: 'i1' }]);
  assert.equal(Object.isFrozen(selectedInsights), false);
  assert.equal(Object.isFrozen(selectedInsights[0]), false);
});

test('validator aprova contrato valido e rejeita mutabilidade', () => {
  const decision = createDecisionPlan(decisionInput('question'), { now: NOW });
  assert.deepEqual(validateDecisionPlan(decision), { valid: true, errors: [] });
  const mutable = { ...decision };
  assert.equal(validateDecisionPlan(mutable).errors.includes('MUTABLE_DECISION_PLAN'), true);
});

test('engine nao modifica nem congela qualquer entrada', () => {
  const context = compiledContext('forecast', { memory: [{ memoryId: 'm1' }] });
  const reasoningPlan = planReasoning(context, { now: NOW });
  const input = { reasoningPlan, compiledContext: context };
  const before = JSON.stringify(input);
  createDecisionPlan(input, { now: NOW });
  assert.equal(JSON.stringify(input), before);
  assert.equal(Object.isFrozen(context), false);
  assert.equal(Object.isFrozen(context.compiledContext.memory), false);
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runDecisionEngineShadow(), {
    status: 'DISABLED', decisionPlan: null,
  });
});

test('modo sombra observa decisionPlan e descarta resultado', async () => {
  let observed;
  const result = await runDecisionEngineShadow(decisionInput('forecast'), {
    enabled: true,
    observer: (decision) => { observed = decision; },
    engineOptions: { now: NOW },
  });
  assert.equal(observed.decisionType, 'FINANCIAL_ANALYSIS');
  assert.equal(observed.executionAllowed, false);
  assert.deepEqual(result, { status: 'OBSERVED', decisionPlan: null });
});

test('falha do observador e contida no modo sombra', async () => {
  const result = await runDecisionEngineShadow(decisionInput('question'), {
    enabled: true,
    observer: () => { throw new Error('observer failure'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', decisionPlan: null });
});

test('modulo nao contem HTTP SDK IA prompt ou persistencia', async () => {
  const files = [
    'decisionEngine.js', 'decisionEvaluator.js', 'decisionPolicies.js',
    'decisionStrategies.js', 'decisionSchema.js', 'decisionValidator.js',
  ];
  const sources = await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
  );
  const source = sources.join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|axios/i);
  assert.doesNotMatch(source, /openai|elevenlabs|claude|gemini/i);
  assert.doesNotMatch(source, /supabase|createPrompt|buildPrompt|invokeModel/i);
});
