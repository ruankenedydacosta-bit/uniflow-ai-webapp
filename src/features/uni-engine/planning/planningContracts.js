import {
  findFunctionsInValue,
  isSerializableValue,
} from '../uniEngineContracts.js';
import {
  isValidGoalType,
  isValidPlanningComplexity,
  isValidPlanningDiagnostic,
  isValidPlanningRecommendation,
  isValidPlanningRisk,
  isValidPlanningStatus,
  isValidPlanningStepType,
} from './planningTypes.js';

export const PLANNING_ENGINE_VERSION = '1.0';

function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function createPlanningGoal(seed = {}) {
  const safe = object(seed) ? seed : {};
  return {
    detected: Boolean(safe.detected),
    type: isValidGoalType(safe.type) ? safe.type : 'UNKNOWN',
    subject: typeof safe.subject === 'string' ? safe.subject : null,
    targetAmount: finiteOrNull(safe.targetAmount),
    currency: safe.currency === 'BRL' ? 'BRL' : null,
    targetDate: typeof safe.targetDate === 'string' ? safe.targetDate : null,
    horizonMonths: Number.isInteger(safe.horizonMonths) && safe.horizonMonths > 0
      ? safe.horizonMonths
      : null,
    multiple: Boolean(safe.multiple),
    detectedGoalTypes: Array.isArray(safe.detectedGoalTypes)
      ? safe.detectedGoalTypes.filter(isValidGoalType)
      : [],
    sourceIntent: typeof safe.sourceIntent === 'string' ? safe.sourceIntent : null,
    constraints: Array.isArray(safe.constraints) ? safe.constraints.map(String) : [],
  };
}

export function createPlanningShadow(overrides = {}) {
  const safe = object(overrides) ? overrides : {};
  return {
    shadowMode: Boolean(safe.shadowMode ?? true),
    appliedToDecision: false,
    planExecuted: false,
    executorCalled: false,
    databaseCalled: false,
    memoryModified: false,
    voiceTouched: false,
    responseModified: false,
    pipelineAltered: false,
  };
}

export function createPlanningStep(seed = {}) {
  const safe = object(seed) ? seed : {};
  return {
    id: typeof safe.id === 'string' ? safe.id : null,
    type: isValidPlanningStepType(safe.type) ? safe.type : 'DEFINE_GOAL',
    order: Number.isInteger(safe.order) && safe.order > 0 ? safe.order : 1,
    status: ['READY', 'PENDING', 'BLOCKED'].includes(safe.status) ? safe.status : 'PENDING',
    dependsOn: Array.isArray(safe.dependsOn) ? safe.dependsOn.map(String) : [],
    metadata: object(safe.metadata) ? { ...safe.metadata } : {},
  };
}

export function createPlanningResult(seed = {}) {
  const safe = object(seed) ? seed : {};
  const confidence = finiteOrNull(safe.confidence);
  return {
    version: PLANNING_ENGINE_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: typeof safe.fallbackReason === 'string' ? safe.fallbackReason : null,
    errorCode: typeof safe.errorCode === 'string' ? safe.errorCode : null,
    goal: createPlanningGoal(safe.goal),
    goalType: isValidGoalType(safe.goalType) ? safe.goalType : 'UNKNOWN',
    status: isValidPlanningStatus(safe.status) ? safe.status : 'UNKNOWN',
    complexity: isValidPlanningComplexity(safe.complexity) ? safe.complexity : 'LOW',
    confidence: confidence == null ? 0 : Math.max(0, Math.min(1, confidence)),
    risk: isValidPlanningRisk(safe.risk) ? safe.risk : 'NONE',
    riskDetails: object(safe.riskDetails) ? { ...safe.riskDetails } : { reasons: [] },
    dependencies: Array.isArray(safe.dependencies) ? safe.dependencies.map((entry) => ({ ...entry })) : [],
    timeline: object(safe.timeline) ? { ...safe.timeline } : { startDate: null, targetDate: null, horizonMonths: null, milestones: [] },
    suggestedSteps: Array.isArray(safe.suggestedSteps) ? safe.suggestedSteps.map(createPlanningStep) : [],
    diagnostics: Array.isArray(safe.diagnostics) ? safe.diagnostics.filter(isValidPlanningDiagnostic) : [],
    recommendations: Array.isArray(safe.recommendations)
      ? safe.recommendations.filter(isValidPlanningRecommendation)
      : [],
    shadow: createPlanningShadow(safe.shadow),
    latency: object(safe.latency) ? { ...safe.latency } : { totalMs: 0 },
    latencyMs: finiteOrNull(safe.latencyMs) ?? finiteOrNull(safe.latency?.totalMs) ?? 0,
    telemetry: safe.telemetry ?? null,
  };
}

export function validatePlanningResult(result) {
  const errors = [];
  if (!object(result)) return { valid: false, errors: ['RESULT_NOT_OBJECT'] };
  if (!isValidGoalType(result.goalType)) errors.push('GOAL_TYPE_INVALID');
  if (!isValidPlanningStatus(result.status)) errors.push('STATUS_INVALID');
  if (!isValidPlanningComplexity(result.complexity)) errors.push('COMPLEXITY_INVALID');
  if (!isValidPlanningRisk(result.risk)) errors.push('RISK_INVALID');
  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) errors.push('CONFIDENCE_INVALID');
  if (!Array.isArray(result.dependencies)) errors.push('DEPENDENCIES_INVALID');
  if (!Array.isArray(result.suggestedSteps)) errors.push('STEPS_INVALID');
  if (!object(result.timeline)) errors.push('TIMELINE_INVALID');
  if (!object(result.shadow) || result.shadow.planExecuted !== false || result.shadow.appliedToDecision !== false) errors.push('SHADOW_INVALID');
  if (!object(result.latency) || typeof result.latency.totalMs !== 'number') errors.push('LATENCY_INVALID');
  if (typeof result.latencyMs !== 'number' || !Number.isFinite(result.latencyMs) || result.latencyMs < 0) errors.push('LATENCY_MS_INVALID');
  if (typeof result.fallbackUsed !== 'boolean') errors.push('FALLBACK_USED_INVALID');
  if (result.errorCode != null && typeof result.errorCode !== 'string') errors.push('ERROR_CODE_INVALID');
  if (!isSerializableValue(result) || findFunctionsInValue(result).length > 0) errors.push('NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function createEmptyPlanningResult(overrides = {}) {
  return createPlanningResult({
    enabled: false,
    shadowMode: overrides.shadowMode ?? true,
    goal: {},
    goalType: 'UNKNOWN',
    status: 'UNKNOWN',
    complexity: 'LOW',
    confidence: 0,
    risk: 'NONE',
    diagnostics: ['PLANNING_INTENT_NOT_DETECTED', 'SHADOW_ONLY'],
    recommendations: ['NO_ACTION'],
    shadow: { shadowMode: overrides.shadowMode ?? true },
    latency: { totalMs: 0 },
    latencyMs: 0,
    fallbackUsed: Boolean(overrides.fallbackUsed),
    fallbackReason: overrides.fallbackReason ?? null,
    errorCode: overrides.errorCode ?? null,
  });
}
