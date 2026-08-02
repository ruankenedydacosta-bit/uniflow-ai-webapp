// Testes da Fase 10 — Normalização e consolidação de contratos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import {
  UNI_ENGINE_VERSION,
  UNI_ENGINE_REVISION,
  UNI_ENGINE_MODULE_NAMES,
} from '../uniEngineContracts.js';
import {
  createPlanningResult,
  createEmptyPlanningResult,
  validatePlanningResult,
  PLANNING_ENGINE_VERSION,
} from '../planning/planningContracts.js';
import {
  createGoalEngineResult,
  createEmptyGoalEngineResult,
  validateGoalEngineResult,
  GOAL_ENGINE_VERSION,
} from '../goals/goalContracts.js';
import {
  createReflectionResult,
  createEmptyReflectionResult,
  validateReflectionResult,
  REFLECTION_VERSION,
} from '../reflection/reflectionContracts.js';
import {
  createDecisionResult,
  createEmptyDecisionResult,
  validateDecisionResult,
  DECISION_LAYER_VERSION,
} from '../decision/decisionContracts.js';
import { runPlanningEngine } from '../planning/runPlanningEngine.js';
import { runGoalEngine } from '../goals/runGoalEngine.js';
import { runReflectionEngine } from '../reflection/runReflectionEngine.js';
import { runDecisionLayer } from '../decision/runDecisionLayer.js';
import { phase10CoreConfig, phase10FullConfig, phase10Input } from './shared.js';

function throwingProxy() {
  return new Proxy({}, {
    get() {
      throw new Error('boom');
    },
  });
}

// -----------------------------------------------
// Constantes e revisões
// -----------------------------------------------
test('revisão 10.0 sem alterar a versão funcional 2.0', () => {
  assert.equal(UNI_ENGINE_VERSION, '2.0');
  assert.equal(UNI_ENGINE_REVISION, '10.0');
  assert.deepEqual(UNI_ENGINE_MODULE_NAMES, [
    'core', 'memory', 'epistemic', 'decision', 'planning', 'goals', 'reflection', 'activation', 'telemetry',
  ]);
});

// -----------------------------------------------
// Planning contracts
// -----------------------------------------------
test('createPlanningResult preenche envelope padronizado', () => {
  const result = createPlanningResult({});
  assert.equal(result.version, PLANNING_ENGINE_VERSION);
  assert.equal(result.enabled, false);
  assert.equal(result.shadowMode, false);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.fallbackReason, null);
  assert.equal(result.errorCode, null);
  assert.equal(typeof result.latencyMs, 'number');
});

test('validatePlanningResult aceita resultado completo', () => {
  const result = createPlanningResult({ enabled: true, shadowMode: true, confidence: 0.8, status: 'READY' });
  const validation = validatePlanningResult(result);
  assert.equal(validation.valid, true);
});

test('validatePlanningResult rejeita envelopes inválidos', () => {
  const result = createPlanningResult({});
  result.fallbackUsed = 'yes';
  assert.ok(validatePlanningResult(result).errors.includes('FALLBACK_USED_INVALID'));
  const result2 = createPlanningResult({});
  result2.latencyMs = -1;
  assert.ok(validatePlanningResult(result2).errors.includes('LATENCY_MS_INVALID'));
});

test('createEmptyPlanningResult é um fallback válido com flags', () => {
  const empty = createEmptyPlanningResult({ fallbackUsed: true, fallbackReason: 'PLANNING_VALIDATION_FAILED', errorCode: 'X' });
  const validation = validatePlanningResult(empty);
  assert.equal(validation.valid, true);
  assert.equal(empty.fallbackUsed, true);
  assert.equal(empty.fallbackReason, 'PLANNING_VALIDATION_FAILED');
  assert.equal(empty.errorCode, 'X');
});

// -----------------------------------------------
// Goals contracts
// -----------------------------------------------
test('createGoalEngineResult preenche envelope padronizado', () => {
  const result = createGoalEngineResult({});
  assert.equal(result.version, GOAL_ENGINE_VERSION);
  assert.equal(result.enabled, false);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.fallbackReason, null);
  assert.equal(result.errorCode, null);
  assert.equal(typeof result.latencyMs, 'number');
});

test('validateGoalEngineResult aceita resultado completo', () => {
  const result = createGoalEngineResult({ enabled: true, shadowMode: true, confidence: 0.7 });
  const validation = validateGoalEngineResult(result);
  assert.equal(validation.valid, true);
});

test('validateGoalEngineResult rejeita errorCode não-string', () => {
  const result = createGoalEngineResult({});
  result.errorCode = 42;
  assert.ok(validateGoalEngineResult(result).errors.includes('ERROR_CODE_INVALID'));
});

test('createEmptyGoalEngineResult é um fallback válido', () => {
  const empty = createEmptyGoalEngineResult({ fallbackUsed: true, fallbackReason: 'GOAL_ENGINE_INTERNAL_ERROR', errorCode: 'GOAL_ENGINE_INTERNAL_ERROR' });
  assert.equal(validateGoalEngineResult(empty).valid, true);
  assert.equal(empty.fallbackUsed, true);
  assert.equal(empty.errorCode, 'GOAL_ENGINE_INTERNAL_ERROR');
});

// -----------------------------------------------
// Reflection contracts
// -----------------------------------------------
test('createReflectionResult preenche envelope padronizado', () => {
  const result = createReflectionResult({});
  assert.equal(result.version, REFLECTION_VERSION);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.fallbackReason, null);
  assert.equal(result.errorCode, null);
});

test('validateReflectionResult aceita resultado completo', () => {
  const result = createReflectionResult({ enabled: true, shadowMode: true });
  assert.equal(validateReflectionResult(result).valid, true);
});

test('validateReflectionResult rejeita fallbackUsed inválido', () => {
  const result = createReflectionResult({});
  result.fallbackUsed = 'x';
  assert.ok(validateReflectionResult(result).errors.includes('FALLBACK_USED_INVALID'));
});

test('createEmptyReflectionResult é um fallback válido', () => {
  const empty = createEmptyReflectionResult({ fallbackUsed: true, fallbackReason: 'REFLECTION_INTERNAL_ERROR', errorCode: 'REFLECTION_INTERNAL_ERROR' });
  assert.equal(validateReflectionResult(empty).valid, true);
  assert.equal(empty.fallbackReason, 'REFLECTION_INTERNAL_ERROR');
});

// -----------------------------------------------
// Decision contracts
// -----------------------------------------------
test('createDecisionResult preenche envelope padronizado', () => {
  const result = createDecisionResult({});
  assert.equal(result.version, DECISION_LAYER_VERSION);
  assert.equal(result.enabled, false);
  assert.equal(result.shadowMode, false);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.fallbackReason, null);
  assert.equal(result.errorCode, null);
  assert.equal(result.latencyMs, 0);
});

test('createDecisionResult deriva latencyMs de latency.totalMs', () => {
  const result = createDecisionResult({ latency: { totalMs: 7.5 } });
  assert.equal(result.latencyMs, 7.5);
});

test('validateDecisionResult aceita resultado completo', () => {
  const result = createDecisionResult({
    enabled: true,
    shadowMode: true,
    decisionType: 'ASK',
    confidence: 0.5,
    risk: 'MEDIUM',
    latency: { totalMs: 3 },
    recommendations: ['ASK_ACCOUNT'],
  });
  assert.equal(validateDecisionResult(result).valid, true);
});

test('validateDecisionResult rejeita recomendações não-string e latência', () => {
  const result = createDecisionResult({});
  result.recommendations = [{ suggestion: 'x' }];
  assert.ok(validateDecisionResult(result).errors.includes('RECOMMENDATIONS_INVALID'));
  const result2 = createDecisionResult({});
  result2.latencyMs = 'fast';
  assert.ok(validateDecisionResult(result2).errors.includes('LATENCY_MS_INVALID'));
});

test('validateDecisionResult bloqueia aplicação de decisão', () => {
  const result = createDecisionResult({});
  result.shadow.appliedToDecision = true;
  assert.ok(validateDecisionResult(result).errors.includes('SHADOW_APPLIED_BLOCKED'));
  const result2 = createDecisionResult({});
  result2.shadow.executorCalled = true;
  assert.ok(validateDecisionResult(result2).errors.includes('SHADOW_EXECUTOR_BLOCKED'));
});

test('createEmptyDecisionResult é um fallback válido', () => {
  const empty = createEmptyDecisionResult({ fallbackUsed: true, fallbackReason: 'DECISION_LAYER_ERROR', errorCode: 'DECISION_LAYER_ERROR' });
  assert.equal(validateDecisionResult(empty).valid, true);
  assert.equal(empty.decisionType, 'UNKNOWN');
  assert.equal(empty.shadow.appliedToDecision, false);
});

// -----------------------------------------------
// Envelopes padronizados nas saídas reais do motor
// -----------------------------------------------
test('todas as seções do motor completo validam seus contratos', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(result.enabled, true);
  assert.equal(validateDecisionResult(result.decisionLayer).valid, true);
  assert.equal(validatePlanningResult(result.planning).valid, true);
  assert.equal(validateGoalEngineResult(result.goals).valid, true);
  assert.equal(validateReflectionResult(result.reflection).valid, true);
});

test('planning no motor real: fallbackUsed false e latencyMs consistente', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const planning = result.planning;
  assert.equal(planning.fallbackUsed, false);
  assert.equal(planning.fallbackReason, null);
  assert.equal(planning.errorCode, null);
  assert.equal(planning.enabled, true);
  assert.equal(planning.shadowMode, true);
  assert.ok(planning.latencyMs > 0);
  assert.equal(planning.latencyMs, planning.latency.totalMs);
});

test('goals no motor real: fallbackUsed false e latencyMs consistente', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(result.goals.fallbackUsed, false);
  assert.equal(result.goals.enabled, true);
  assert.ok(result.goals.latencyMs > 0);
  assert.equal(typeof result.goals.latencyMs, 'number');
});

test('reflection no motor real: fallbackUsed false', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(result.reflection.fallbackUsed, false);
  assert.equal(result.reflection.fallbackReason, null);
});

test('decision no motor real: fallbackUsed false e latencyMs == latency.totalMs', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const decision = result.decisionLayer;
  assert.equal(decision.fallbackUsed, false);
  assert.equal(decision.fallbackReason, null);
  assert.equal(decision.errorCode, null);
  assert.equal(decision.enabled, true);
  assert.equal(decision.shadowMode, true);
  assert.equal(decision.latencyMs, decision.latency.totalMs);
  assert.ok(decision.latencyMs > 0);
});

test('recommendations da decision são strings e recommendationDetails é objeto', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  const decision = result.decisionLayer;
  assert.ok(Array.isArray(decision.recommendations));
  assert.ok(decision.recommendations.every((entry) => typeof entry === 'string'));
  assert.ok(Array.isArray(decision.recommendationDetails));
  assert.ok(decision.recommendationDetails.every((entry) => entry && typeof entry === 'object'));
  assert.equal(decision.recommendations.length, decision.recommendationDetails.length);
});

test('epistemicModel expõe latencyMs quando ativo', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.ok(result.epistemicModel.latencyMs > 0);
});

test('resultado top-level do motor expõe revision e fallbackUsed', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(result.revision, UNI_ENGINE_REVISION);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.fallbackReason, null);
});

// -----------------------------------------------
// Caminhos de fallback dos motores
// -----------------------------------------------
test('erro interno do planning → fallback PLANNING_INTERNAL_ERROR válido', () => {
  const result = runPlanningEngine({ normalizedMessage: throwingProxy(), featureFlags: {} });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'PLANNING_INTERNAL_ERROR');
  assert.equal(result.errorCode, 'PLANNING_INTERNAL_ERROR');
  assert.equal(validatePlanningResult(result).valid, true);
});

test('erro interno do goals → fallback GOAL_ENGINE_INTERNAL_ERROR válido', () => {
  const result = runGoalEngine({ financialSnapshot: throwingProxy(), featureFlags: { goalsEnabled: true, goalsShadowMode: true } });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'GOAL_ENGINE_INTERNAL_ERROR');
  assert.equal(result.errorCode, 'GOAL_ENGINE_INTERNAL_ERROR');
  assert.equal(validateGoalEngineResult(result).valid, true);
});

test('erro interno do reflection → fallback REFLECTION_INTERNAL_ERROR válido', () => {
  const result = runReflectionEngine({ epistemicModel: throwingProxy(), featureFlags: {} });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'REFLECTION_INTERNAL_ERROR');
  assert.equal(result.errorCode, 'REFLECTION_INTERNAL_ERROR');
  assert.equal(validateReflectionResult(result).valid, true);
});

test('erro interno da decision → fallback DECISION_LAYER_ERROR válido', () => {
  const result = runDecisionLayer({ intent: throwingProxy(), featureFlags: {} });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'DECISION_LAYER_ERROR');
  assert.equal(result.errorCode, 'DECISION_LAYER_ERROR');
  assert.equal(validateDecisionResult(result).valid, true);
  assert.equal(result.shadow.appliedToDecision, false);
});

test('falha de validação da decision → fallback DECISION_CONTRACT_INVALID', () => {
  const result = runDecisionLayer({ intent: { primaryIntent: {} }, classification: { ambiguities: [{}] }, conversationContext: { history: null }, cognitivePlan: { executorExpected: {} } });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'DECISION_CONTRACT_INVALID');
  assert.ok(String(result.errorCode).startsWith('DECISION_VALIDATION_'));
  assert.equal(validateDecisionResult(result).valid, true);
});

test('fallbacks preservam o shadow intocado e o pipeline nunca é alterado', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(null, { config });
  assert.equal(result.fallbackUsed, true);
  assert.ok(typeof result.fallbackReason === 'string');
  assert.equal(result.enabled, true);
  assert.equal(result.skipped, false);
  assert.equal(result.diagnostics.errorCode, 'INPUT_NOT_OBJECT');
  assert.equal(result.engineVersion, UNI_ENGINE_VERSION);
  assert.equal(result.revision, UNI_ENGINE_REVISION);
});
