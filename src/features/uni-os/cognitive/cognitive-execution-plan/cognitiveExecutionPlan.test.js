import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { createConfidencePlan } from '../confidence-engine/index.js';
import { createDecisionPlan } from '../decision-engine/index.js';
import { planReasoning } from '../reasoning-planner/index.js';
import {
  createCognitiveExecutionPlan,
  createCognitiveExecutionPlanSnapshot,
  runCognitiveExecutionPlanShadow,
  validateCognitiveExecutionPlan,
} from './index.js';

const NOW = '2026-07-14T00:00:00.000Z';

function compiledContext(intent = 'forecast', overrides = {}) {
  return {
    compiledContext: {
      conversation: { intent, confidence: 0.95, requiresConfirmation: false,
        ...(overrides.conversation ?? {}) },
      goals: overrides.goals ?? [{ goalId: 'goal-1' }],
      memory: overrides.memory ?? [{ memoryId: 'memory-1' }],
      context: overrides.context ?? [{ key: 'workspace.type', value: 'personal' }],
      insights: overrides.insights ?? [{ insightId: 'insight-1', type: 'GOAL_PROGRESS' }],
      planning: {},
      reflection: overrides.reflection ?? {},
      security: overrides.security ?? { status: 'ALLOW' },
      permissions: overrides.permissions ?? { status: 'AUTHORIZED' },
    },
  };
}

function completePlans(intent = 'forecast', overrides = {}) {
  const context = compiledContext(intent, overrides);
  const reasoningPlan = planReasoning(context, { now: NOW });
  const decisionPlan = createDecisionPlan({ reasoningPlan, compiledContext: context }, { now: NOW });
  const confidencePlan = createConfidencePlan({ decisionPlan }, { now: NOW });
  return { reasoningPlan, decisionPlan, confidencePlan };
}

test('agrega integralmente reasoning decision e confidence plans', () => {
  const plans = completePlans();
  const cep = createCognitiveExecutionPlan(plans, { now: NOW });
  assert.deepEqual(cep.reasoningPlan, plans.reasoningPlan);
  assert.deepEqual(cep.decisionPlan, plans.decisionPlan);
  assert.deepEqual(cep.confidencePlan, plans.confidencePlan);
  assert.notEqual(cep.reasoningPlan, plans.reasoningPlan);
  assert.notEqual(cep.decisionPlan, plans.decisionPlan);
  assert.notEqual(cep.confidencePlan, plans.confidencePlan);
});

test('agregacao completa calcula valores efetivos conservadores', () => {
  const cep = createCognitiveExecutionPlan(completePlans(), { now: NOW });
  assert.equal(cep.effectiveStrategy, 'RECOMMEND_ONLY');
  assert.equal(cep.effectiveConfidence, 0.9);
  assert.equal(cep.effectiveRisk, 'LOW');
  assert.equal(cep.effectiveReasoningDepth, 'HIGH');
  assert.equal(cep.communicationObjective, 'EXPLAIN');
  assert.equal(cep.followUpStrategy, 'NONE');
  assert.deepEqual(cep.metadata.missingPlans, []);
  assert.deepEqual(cep.metadata.conflicts, []);
});

test('effectiveCapabilities preserva somente capacidades acordadas', () => {
  const plans = completePlans();
  const cep = createCognitiveExecutionPlan(plans, { now: NOW });
  assert.deepEqual(cep.effectiveCapabilities, plans.reasoningPlan.requiredCapabilities);
  assert.notEqual(cep.effectiveCapabilities, plans.reasoningPlan.requiredCapabilities);
});

test('ausencia de todos os planos produz fallback seguro', () => {
  const cep = createCognitiveExecutionPlan({}, { now: NOW });
  assert.deepEqual(cep.reasoningPlan, {});
  assert.deepEqual(cep.decisionPlan, {});
  assert.deepEqual(cep.confidencePlan, {});
  assert.equal(cep.effectiveStrategy, 'SAFE_FALLBACK');
  assert.equal(cep.effectiveConfidence, 0);
  assert.equal(cep.effectiveRisk, 'HIGH');
  assert.equal(cep.followUpStrategy, 'REQUEST_MISSING_PLANS');
  assert.deepEqual(cep.metadata.missingPlans, [
    'reasoningPlan', 'decisionPlan', 'confidencePlan',
  ]);
});

test('ausencia parcial exige esclarecimento', () => {
  const plans = completePlans();
  const cep = createCognitiveExecutionPlan({
    reasoningPlan: plans.reasoningPlan,
    decisionPlan: plans.decisionPlan,
  }, { now: NOW });
  assert.equal(cep.effectiveStrategy, 'REQUEST_CLARIFICATION');
  assert.equal(cep.communicationObjective, 'CLARIFY');
  assert.deepEqual(cep.metadata.missingPlans, ['confidencePlan']);
});

test('conflito de versao entre planner e decisao e detectado', () => {
  const plans = completePlans();
  const conflictingReasoning = { ...plans.reasoningPlan, plannerVersion: '2.0' };
  const cep = createCognitiveExecutionPlan({
    ...plans,
    reasoningPlan: conflictingReasoning,
  }, { now: NOW });
  assert.equal(cep.metadata.conflicts.includes('PLANNER_VERSION_MISMATCH'), true);
  assert.equal(cep.effectiveStrategy, 'RESOLVE_CONFLICTS');
  assert.equal(cep.communicationObjective, 'CLARIFY');
  assert.equal(cep.effectiveRisk, 'HIGH');
});

test('conflitos reportados pelo Confidence Engine sao consolidados', () => {
  const plans = completePlans('emergency');
  const cep = createCognitiveExecutionPlan(plans, { now: NOW });
  assert.equal(cep.metadata.conflicts.includes('CONFIDENCE_CONFLICTS_PRESENT'), true);
  assert.equal(cep.effectiveStrategy, 'RESOLVE_CONFLICTS');
});

test('effectiveStrategy exige confirmacao para acao financeira', () => {
  const cep = createCognitiveExecutionPlan(completePlans('register_expense', {
    conversation: { requiresConfirmation: true },
  }), { now: NOW });
  assert.equal(cep.effectiveStrategy, 'REQUIRE_CONFIRMATION');
  assert.equal(cep.communicationObjective, 'CONFIRM');
  assert.equal(cep.followUpStrategy, 'REQUEST_CONFIRMATION');
});

test('effectiveConfidence usa o menor score valido', () => {
  const plans = completePlans();
  const confidencePlan = {
    ...plans.confidencePlan,
    confidenceScore: 0.62,
  };
  const cep = createCognitiveExecutionPlan({ ...plans, confidencePlan }, { now: NOW });
  assert.equal(cep.effectiveConfidence, 0.62);
});

test('effectiveRisk preserva o maior risco e eleva profundidade', () => {
  const plans = completePlans('emergency');
  const cep = createCognitiveExecutionPlan(plans, { now: NOW });
  assert.equal(cep.effectiveRisk, 'CRITICAL');
  assert.equal(cep.effectiveReasoningDepth, 'VERY_HIGH');
});

test('communicationObjective usa decisao quando nao ha bloqueio', () => {
  const cep = createCognitiveExecutionPlan(completePlans(), { now: NOW });
  assert.equal(cep.decisionPlan.communicationObjective, 'EXPLAIN');
  assert.equal(cep.communicationObjective, 'EXPLAIN');
});

test('plannerVersion e referencias de origem sao explicitas', () => {
  const cep = createCognitiveExecutionPlan(completePlans(), { now: NOW });
  assert.equal(cep.plannerVersion, '1.0');
  assert.deepEqual(cep.metadata.sourceVersions, {
    reasoning: '1.0', decision: '1.0', confidence: '1.0',
  });
});

test('CEP aplica deep freeze em todos os planos e metadados', () => {
  const cep = createCognitiveExecutionPlan(completePlans(), { now: NOW });
  assert.equal(Object.isFrozen(cep), true);
  assert.equal(Object.isFrozen(cep.reasoningPlan), true);
  assert.equal(Object.isFrozen(cep.decisionPlan), true);
  assert.equal(Object.isFrozen(cep.confidencePlan), true);
  assert.equal(Object.isFrozen(cep.effectiveCapabilities), true);
  assert.equal(Object.isFrozen(cep.metadata), true);
  assert.equal(Object.isFrozen(cep.metadata.sourceVersions), true);
});

test('schema realiza clone defensivo antes do deep freeze', () => {
  const reasoningPlan = { nested: { value: 'original' } };
  const draft = { reasoningPlan, generatedAt: NOW };
  const cep = createCognitiveExecutionPlanSnapshot(draft);
  reasoningPlan.nested.value = 'changed';
  assert.equal(cep.reasoningPlan.nested.value, 'original');
  assert.equal(Object.isFrozen(reasoningPlan), false);
  assert.equal(Object.isFrozen(reasoningPlan.nested), false);
});

test('validator aprova contrato valido e rejeita mutabilidade', () => {
  const cep = createCognitiveExecutionPlan(completePlans(), { now: NOW });
  assert.deepEqual(validateCognitiveExecutionPlan(cep), { valid: true, errors: [] });
  const mutable = { ...cep };
  assert.equal(
    validateCognitiveExecutionPlan(mutable).errors.includes('MUTABLE_COGNITIVE_EXECUTION_PLAN'),
    true,
  );
});

test('agregador nao modifica nem congela planos recebidos', () => {
  const plans = completePlans();
  const wrapper = { ...plans };
  const before = JSON.stringify(wrapper);
  createCognitiveExecutionPlan(wrapper, { now: NOW });
  assert.equal(JSON.stringify(wrapper), before);
  assert.equal(Object.isFrozen(wrapper), false);
});

test('executionAllowed permanece false em todos os cenarios', () => {
  [completePlans(), {}, completePlans('register_expense')].forEach((input) => {
    assert.equal(createCognitiveExecutionPlan(input, { now: NOW }).executionAllowed, false);
  });
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runCognitiveExecutionPlanShadow(), {
    status: 'DISABLED', cognitiveExecutionPlan: null,
  });
});

test('modo sombra observa CEP e descarta resultado', async () => {
  let observed;
  const result = await runCognitiveExecutionPlanShadow(completePlans(), {
    enabled: true,
    observer: (plan) => { observed = plan; },
    plannerOptions: { now: NOW },
  });
  assert.equal(observed.effectiveStrategy, 'RECOMMEND_ONLY');
  assert.equal(observed.executionAllowed, false);
  assert.deepEqual(result, { status: 'OBSERVED', cognitiveExecutionPlan: null });
});

test('falha do observador e contida no modo sombra', async () => {
  const result = await runCognitiveExecutionPlanShadow(completePlans(), {
    enabled: true,
    observer: () => { throw new Error('observer failure'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', cognitiveExecutionPlan: null });
});

test('modulo nao contem HTTP SDK IA prompt ou persistencia', async () => {
  const files = [
    'cognitiveExecutionPlan.js', 'executionPlanner.js', 'executionAggregator.js',
    'executionPolicies.js', 'executionSchema.js', 'executionValidator.js',
  ];
  const sources = await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
  );
  const source = sources.join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|axios/i);
  assert.doesNotMatch(source, /openai|elevenlabs|claude|gemini/i);
  assert.doesNotMatch(source, /supabase|createPrompt|buildPrompt|invokeModel/i);
});
