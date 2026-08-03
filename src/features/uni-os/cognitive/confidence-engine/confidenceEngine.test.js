import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { UNI_OS_ENABLED } from '../../adapters/featureFlags.js';
import { createDecisionPlanSnapshot } from '../decision-engine/index.js';
import {
  CONFIDENCE_LEVELS,
  createConfidencePlan,
  createConfidencePlanSnapshot,
  resolveConfidenceLevel,
  runConfidenceEngineShadow,
  validateConfidencePlan,
} from './index.js';

const NOW = '2026-07-13T22:00:00.000Z';

function decisionPlan(overrides = {}) {
  return createDecisionPlanSnapshot({
    primaryDecision: 'RESPOND',
    decisionType: 'DIRECT_RESPONSE',
    decisionConfidence: 0.9,
    selectedStrategy: 'DIRECT',
    selectedReasoning: { intent: 'question', reasoningDepth: 'LOW' },
    selectedInsights: [],
    selectedGoals: [],
    selectedContext: { conversation: { intent: 'question' } },
    selectedMemory: [{ memoryId: 'memory-1' }],
    recommendedCapabilities: ['CONVERSATION'],
    executionIntent: 'NONE',
    confirmationRequired: false,
    riskAssessment: { level: 'LOW', blocking: false, reasons: [] },
    ambiguityAssessment: { level: 'NONE', detected: false, clarificationRequired: false },
    fallbackStrategy: 'SAFE_DEFAULT',
    explanationLevel: 'MINIMAL',
    communicationObjective: 'INFORM',
    plannerReference: { version: '1.0', generatedAt: NOW, intent: 'question' },
    generatedAt: NOW,
    ...overrides,
  });
}

test('schema expoe todos os niveis de confianca', () => {
  assert.deepEqual(CONFIDENCE_LEVELS, ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']);
});

const LEVEL_CASES = Object.freeze([
  [0.1, 'VERY_LOW'],
  [0.3, 'LOW'],
  [0.5, 'MEDIUM'],
  [0.7, 'HIGH'],
  [0.9, 'VERY_HIGH'],
]);

LEVEL_CASES.forEach(([score, expected]) => {
  test(`${expected} para score ${score}`, () => {
    assert.equal(resolveConfidenceLevel(score), expected);
    const plan = createConfidencePlan({ decisionPlan: decisionPlan({
      decisionConfidence: score,
    }) }, { now: NOW });
    assert.equal(plan.confidenceLevel, expected);
    assert.equal(plan.confidenceScore, score);
  });
});

test('avaliacao e deterministica para entrada e horario iguais', () => {
  const input = { decisionPlan: decisionPlan() };
  assert.deepEqual(
    createConfidencePlan(input, { now: NOW }),
    createConfidencePlan(input, { now: NOW }),
  );
});

test('conflito entre alta confianca e risco bloqueante e explicitado', () => {
  const plan = createConfidencePlan({ decisionPlan: decisionPlan({
    riskAssessment: { level: 'HIGH', blocking: true, reasons: ['RISK_HIGH'] },
  }) }, { now: NOW });
  assert.equal(plan.conflictingSignals.includes('HIGH_CONFIDENCE_BLOCKING_RISK'), true);
  assert.equal(plan.uncertaintySources.includes('CONFLICTING_SIGNALS'), true);
  assert.equal(plan.safeToRecommend, false);
});

test('ausencia de contexto reduz confianca e pede informacao', () => {
  const plan = createConfidencePlan({ decisionPlan: decisionPlan({
    selectedContext: {},
  }) }, { now: NOW });
  assert.equal(plan.missingInformation.includes('CONTEXT'), true);
  assert.equal(plan.uncertaintySources.includes('MISSING_CONTEXT'), true);
  assert.equal(plan.recommendedFollowUp, 'REQUEST_MISSING_INFORMATION');
  assert.equal(plan.safeToRecommend, false);
});

test('ausencia de memoria e registrada sem inventar memoria', () => {
  const plan = createConfidencePlan({ decisionPlan: decisionPlan({
    selectedMemory: [],
  }) }, { now: NOW });
  assert.equal(plan.missingInformation.includes('MEMORY'), true);
  assert.equal(plan.uncertaintySources.includes('MISSING_MEMORY'), true);
  assert.equal(plan.confidenceScore, 0.85);
});

test('missingInformation identifica todas as lacunas estruturais', () => {
  const plan = createConfidencePlan({ decisionPlan: decisionPlan({
    selectedContext: {},
    selectedMemory: [],
    selectedReasoning: {},
    plannerReference: {},
    recommendedCapabilities: [],
  }) }, { now: NOW });
  assert.deepEqual(plan.missingInformation, [
    'CONTEXT', 'MEMORY', 'REASONING', 'PLANNER_REFERENCE', 'CAPABILITIES',
  ]);
});

test('uncertaintySources agrega ambiguidade risco e baixa confianca', () => {
  const plan = createConfidencePlan({ decisionPlan: decisionPlan({
    decisionConfidence: 0.5,
    riskAssessment: { level: 'MEDIUM', blocking: false, reasons: ['RISK_MEDIUM'] },
    ambiguityAssessment: { level: 'MEDIUM', detected: true, clarificationRequired: true },
  }) }, { now: NOW });
  assert.equal(plan.uncertaintySources.includes('AMBIGUITY'), true);
  assert.equal(plan.uncertaintySources.includes('ELEVATED_RISK'), true);
  assert.equal(plan.uncertaintySources.includes('LOW_BASE_CONFIDENCE'), true);
});

test('requiresConfirmation preserva confirmacao e tambem protege baixa confianca', () => {
  const explicit = createConfidencePlan({ decisionPlan: decisionPlan({
    confirmationRequired: true,
  }) }, { now: NOW });
  const low = createConfidencePlan({ decisionPlan: decisionPlan({
    decisionConfidence: 0.5,
  }) }, { now: NOW });
  assert.equal(explicit.requiresConfirmation, true);
  assert.equal(explicit.recommendedFollowUp, 'REQUEST_CONFIRMATION');
  assert.equal(low.requiresConfirmation, true);
});

test('safeToRecommend exige confianca contexto e ausencia de bloqueios', () => {
  const safe = createConfidencePlan({ decisionPlan: decisionPlan() }, { now: NOW });
  const unsafe = createConfidencePlan({ decisionPlan: decisionPlan({
    ambiguityAssessment: { level: 'HIGH', detected: true, clarificationRequired: true },
  }) }, { now: NOW });
  assert.equal(safe.safeToRecommend, true);
  assert.equal(unsafe.safeToRecommend, false);
});

test('safeToExecute e executionAllowed permanecem false em todos os cenarios', () => {
  LEVEL_CASES.forEach(([score]) => {
    const plan = createConfidencePlan({ decisionPlan: decisionPlan({
      decisionConfidence: score,
    }) }, { now: NOW });
    assert.equal(plan.safeToExecute, false);
    assert.equal(plan.executionAllowed, false);
  });
});

test('objeto vazio produz plano conservador e completo', () => {
  const plan = createConfidencePlan({}, { now: NOW });
  assert.equal(plan.confidenceScore, 0);
  assert.equal(plan.confidenceLevel, 'VERY_LOW');
  assert.equal(plan.requiresConfirmation, true);
  assert.equal(plan.safeToRecommend, false);
  assert.equal(plan.safeToExecute, false);
  assert.equal(plan.missingInformation.includes('DECISION_PLAN'), true);
});

test('confidencePlan aplica deep freeze integral', () => {
  const plan = createConfidencePlan({ decisionPlan: decisionPlan() }, { now: NOW });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.confidenceReasons), true);
  assert.equal(Object.isFrozen(plan.missingInformation), true);
  assert.equal(Object.isFrozen(plan.uncertaintySources), true);
  assert.equal(Object.isFrozen(plan.metadata), true);
});

test('schema realiza clone defensivo antes do deep freeze', () => {
  const reasons = ['LOW_RISK'];
  const draft = { confidenceReasons: reasons, generatedAt: NOW };
  const plan = createConfidencePlanSnapshot(draft);
  reasons.push('NO_AMBIGUITY');
  assert.deepEqual(plan.confidenceReasons, ['LOW_RISK']);
  assert.equal(Object.isFrozen(reasons), false);
});

test('validator aprova contrato valido e rejeita mutabilidade', () => {
  const plan = createConfidencePlan({ decisionPlan: decisionPlan() }, { now: NOW });
  assert.deepEqual(validateConfidencePlan(plan), { valid: true, errors: [] });
  const mutable = { ...plan };
  assert.equal(validateConfidencePlan(mutable).errors.includes('MUTABLE_CONFIDENCE_PLAN'), true);
});

test('engine nao altera nem congela decisionPlan recebido', () => {
  const sourceDraft = {
    engineVersion: '1.0',
    executionAllowed: false,
    decisionConfidence: 0.9,
    selectedContext: { conversation: {} },
    selectedMemory: [{ memoryId: 'm1' }],
    selectedReasoning: { intent: 'question' },
    plannerReference: { version: '1.0' },
    recommendedCapabilities: ['CONVERSATION'],
    riskAssessment: { level: 'LOW', blocking: false },
    ambiguityAssessment: { level: 'NONE' },
  };
  const before = JSON.stringify(sourceDraft);
  createConfidencePlan({ decisionPlan: sourceDraft }, { now: NOW });
  assert.equal(JSON.stringify(sourceDraft), before);
  assert.equal(Object.isFrozen(sourceDraft), false);
  assert.equal(Object.isFrozen(sourceDraft.selectedMemory), false);
});

test('feature flag compartilhada permanece desligada', async () => {
  assert.equal(UNI_OS_ENABLED, false);
  assert.deepEqual(await runConfidenceEngineShadow(), {
    status: 'DISABLED', confidencePlan: null,
  });
});

test('modo sombra observa confidencePlan e descarta resultado', async () => {
  let observed;
  const result = await runConfidenceEngineShadow({ decisionPlan: decisionPlan() }, {
    enabled: true,
    observer: (plan) => { observed = plan; },
    engineOptions: { now: NOW },
  });
  assert.equal(observed.confidenceLevel, 'VERY_HIGH');
  assert.equal(observed.executionAllowed, false);
  assert.deepEqual(result, { status: 'OBSERVED', confidencePlan: null });
});

test('falha do observador e contida no modo sombra', async () => {
  const result = await runConfidenceEngineShadow({ decisionPlan: decisionPlan() }, {
    enabled: true,
    observer: () => { throw new Error('observer failure'); },
  });
  assert.deepEqual(result, { status: 'FAILED_SAFE', confidencePlan: null });
});

test('modulo nao contem HTTP SDK IA prompt ou persistencia', async () => {
  const files = [
    'confidenceEngine.js', 'confidenceEvaluator.js', 'confidenceLevels.js',
    'confidencePolicies.js', 'confidenceSchema.js', 'confidenceValidator.js',
  ];
  const sources = await Promise.all(
    files.map((file) => readFile(new URL(file, import.meta.url), 'utf8')),
  );
  const source = sources.join('\n');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|axios/i);
  assert.doesNotMatch(source, /openai|elevenlabs|claude|gemini/i);
  assert.doesNotMatch(source, /supabase|createPrompt|buildPrompt|invokeModel/i);
});
