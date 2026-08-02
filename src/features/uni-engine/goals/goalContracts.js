import {
  findFunctionsInValue,
  isSerializableValue,
} from '../uniEngineContracts.js';
import {
  isValidGoalType,
  isValidGoalStatus,
  isValidGoalHorizon,
  isValidGoalPriority,
  isValidGoalFeasibility,
  isValidGoalConflictType,
  isValidGoalRiskType,
  isValidGoalDiagnostic,
  isValidGoalSuggestion,
  isValidGoalNextStep,
  describeGoalConfidence,
  describeGoalProgress,
} from './goalTypes.js';

export const GOAL_ENGINE_VERSION = '1.0';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function clamp01(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : 0;
}

// -----------------------------------------------
// GoalDefinition — estrutura de um objetivo
// -----------------------------------------------
export function createGoalDefinition(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  return {
    raw: typeof safe.raw === 'string' ? safe.raw : null,
    normalized: typeof safe.normalized === 'string' ? safe.normalized : null,
    type: isValidGoalType(safe.type) ? safe.type : 'UNKNOWN',
    status: isValidGoalStatus(safe.status) ? safe.status : 'DETECTED',
    horizon: isValidGoalHorizon(safe.horizon) ? safe.horizon : 'UNKNOWN',
    priority: isValidGoalPriority(safe.priority) ? safe.priority : 'UNDETERMINED',
    confidence: clamp01(safe.confidence),
    confidenceBand: describeGoalConfidence(safe.confidence),
    feasibility: isValidGoalFeasibility(safe.feasibility) ? safe.feasibility : 'UNKNOWN',
    progress: typeof safe.progress === 'number' && Number.isFinite(safe.progress)
      ? Math.max(0, Math.min(100, safe.progress))
      : null,
    progressBand: typeof safe.progress === 'number'
      ? describeGoalProgress(safe.progress)
      : null,
    target: isPlainObject(safe.target)
      ? {
          amount: finiteOrNull(safe.target.amount),
          currency: safe.target?.currency ?? null,
          date: typeof safe.target?.date === 'string' ? safe.target.date : null,
          horizonMonths: finiteOrNull(safe.target?.horizonMonths),
          description: typeof safe.target?.description === 'string' ? safe.target.description : null,
        }
      : { amount: null, currency: null, date: null, horizonMonths: null, description: null },
    currentState: isPlainObject(safe.currentState)
      ? {
            description: typeof safe.currentState?.description === 'string'
              ? safe.currentState.description
              : null,
          }
      : { description: null },
    missingInformation: Array.isArray(safe.missingInformation) ? safe.missingInformation.map(String) : [],
    dependencies: Array.isArray(safe.dependencies) ? safe.dependencies.map((e) => (isPlainObject(e) ? { ...e } : {})) : [],
    conflicts: Array.isArray(safe.conflicts)
      ? safe.conflicts.filter((c) => isValidGoalConflictType(c?.type ? c.type : c))
      : [],
    risks: Array.isArray(safe.risks)
      ? safe.risks.filter((r) => isValidGoalRiskType(r?.type ? r.type : r))
      : [],
    diagnostics: Array.isArray(safe.diagnostics)
      ? safe.diagnostics.filter(isValidGoalDiagnostic)
      : [],
    suggestions: Array.isArray(safe.suggestions)
      ? safe.suggestions.filter(isValidGoalSuggestion)
      : [],
    recommendedNextStep: isValidGoalNextStep(safe.recommendedNextStep) ? safe.recommendedNextStep : 'NO_ACTION',
    evidenceSummary: isPlainObject(safe.evidenceSummary) ? { ...safe.evidenceSummary } : {},
    sourceSummary: isPlainObject(safe.sourceSummary) ? { ...safe.sourceSummary } : {},
  };
}

// -----------------------------------------------
// GoalConflict — conflito entre objetivos
// -----------------------------------------------
export function createGoalConflict(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  return {
    type: isValidGoalConflictType(safe.type) ? safe.type : 'NONE',
    description: typeof safe.description === 'string' ? safe.description : null,
    goals: Array.isArray(safe.goals) ? safe.goals.map(String) : [],
  };
}

// -----------------------------------------------
// GoalRisk — risco de um objetivo
// -----------------------------------------------
export function createGoalRisk(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  return {
    type: isValidGoalRiskType(safe.type) ? safe.type : 'NONE',
    description: typeof safe.description === 'string' ? safe.description : null,
  };
}

// -----------------------------------------------
// GoalCandidate — candidato a objetivo detectado
// -----------------------------------------------
export function createGoalCandidate(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  return {
    rawText: typeof safe.rawText === 'string' ? safe.rawText : null,
    normalizedText: typeof safe.normalizedText === 'string' ? safe.normalizedText : null,
    detectionSource: typeof safe.detectionSource === 'string' ? safe.detectionSource : null,
    score: finiteOrNull(safe.score) ?? 0,
    matchedKeywords: Array.isArray(safe.matchedKeywords) ? safe.matchedKeywords.map(String) : [],
    ambiguous: Boolean(safe.ambiguous),
  };
}

// -----------------------------------------------
// GoalEngineResult — contrato de saída do engine
// -----------------------------------------------
export function createGoalEngineResult(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  return {
    version: GOAL_ENGINE_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    goalDetected: Boolean(safe.goalDetected),
    goal: createGoalDefinition(safe.goal),
    type: isValidGoalType(safe.type) ? safe.type : 'UNKNOWN',
    status: isValidGoalStatus(safe.status) ? safe.status : 'UNKNOWN',
    horizon: isValidGoalHorizon(safe.horizon) ? safe.horizon : 'UNKNOWN',
    priority: isValidGoalPriority(safe.priority) ? safe.priority : 'UNDETERMINED',
    confidence: clamp01(safe.confidence),
    confidenceBand: describeGoalConfidence(safe.confidence),
    feasibility: isValidGoalFeasibility(safe.feasibility) ? safe.feasibility : 'UNKNOWN',
    progress: typeof safe.progress === 'number' && Number.isFinite(safe.progress)
      ? Math.max(0, Math.min(100, safe.progress))
      : null,
    progressBand: typeof safe.progress === 'number'
      ? describeGoalProgress(safe.progress)
      : null,
    target: isPlainObject(safe.target) ? {
      amount: finiteOrNull(safe.target?.amount),
      currency: safe.target?.currency ?? null,
      date: typeof safe.target?.date === 'string' ? safe.target.date : null,
      horizonMonths: finiteOrNull(safe.target?.horizonMonths),
      description: typeof safe.target?.description === 'string' ? safe.target.description : null,
    } : { amount: null, currency: null, date: null, horizonMonths: null, description: null },
    currentState: isPlainObject(safe.currentState)
      ? { description: typeof safe.currentState?.description === 'string' ? safe.currentState.description : null }
      : { description: null },
    missingInformation: Array.isArray(safe.missingInformation) ? safe.missingInformation.map(String) : [],
    dependencies: Array.isArray(safe.dependencies) ? safe.dependencies.map((entry) => ({ ...entry })) : [],
    conflicts: Array.isArray(safe.conflicts)
      ? safe.conflicts.filter((c) => isPlainObject(c) && isValidGoalConflictType(c.type))
      : [],
    risks: Array.isArray(safe.risks)
      ? safe.risks.filter((r) => isPlainObject(r) && isValidGoalRiskType(r.type))
      : [],
    diagnostics: Array.isArray(safe.diagnostics)
      ? safe.diagnostics.filter(isValidGoalDiagnostic)
      : [],
    suggestions: Array.isArray(safe.suggestions)
      ? safe.suggestions.filter(isValidGoalSuggestion)
      : [],
    recommendedNextStep: isValidGoalNextStep(safe.recommendedNextStep) ? safe.recommendedNextStep : 'NO_ACTION',
    evidenceSummary: isPlainObject(safe.evidenceSummary) ? { ...safe.evidenceSummary } : {},
    sourceSummary: isPlainObject(safe.sourceSummary) ? { ...safe.sourceSummary } : {},
    shadow: createGoalShadow(safe.shadow),
    latencyMs: finiteOrNull(safe.latencyMs) ?? 0,
  };
}

// -----------------------------------------------
// GoalShadow
// -----------------------------------------------
export function createGoalShadow(overrides = {}) {
  const safe = isPlainObject(overrides) ? overrides : {};
  return {
    shadowMode: Boolean(safe.shadowMode ?? true),
    appliedToDecision: false,
    appliedToResponse: false,
    executed: false,
    voiceTouched: false,
    databaseCalled: false,
    memoryModified: false,
    planningModified: false,
    pipelineAltered: false,
  };
}

// -----------------------------------------------
// Validação
// -----------------------------------------------
export function validateGoalEngineResult(result) {
  const errors = [];
  if (!isPlainObject(result)) return { valid: false, errors: ['RESULT_NOT_OBJECT'] };
  if (typeof result.version !== 'string') errors.push('VERSION_INVALID');
  if (!isValidGoalType(result.type)) errors.push('TYPE_INVALID');
  if (!isValidGoalStatus(result.status)) errors.push('STATUS_INVALID');
  if (!isValidGoalHorizon(result.horizon)) errors.push('HORIZON_INVALID');
  if (!isValidGoalPriority(result.priority)) errors.push('PRIORITY_INVALID');
  if (typeof result.confidence !== 'number' || !Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) errors.push('CONFIDENCE_INVALID');
  if (!isValidGoalFeasibility(result.feasibility)) errors.push('FEASIBILITY_INVALID');
  if (result.progress != null && (result.progress < 0 || result.progress > 100)) errors.push('PROGRESS_INVALID');
  if (!isPlainObject(result.goal)) errors.push('GOAL_INVALID');
  if (!isPlainObject(result.shadow) || result.shadow.appliedToDecision !== false || result.shadow.appliedToResponse !== false || result.shadow.executed !== false) errors.push('SHADOW_INVALID');
  if (!isSerializableValue(result) || findFunctionsInValue(result).length > 0) errors.push('NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function createEmptyGoalEngineResult(overrides = {}) {
  const safe = isPlainObject(overrides) ? overrides : {};
  return createGoalEngineResult({
    enabled: false,
    shadowMode: safe.shadowMode ?? true,
    goalDetected: false,
    goal: {},
    type: 'UNKNOWN',
    status: 'UNKNOWN',
    horizon: 'UNKNOWN',
    priority: 'UNDETERMINED',
    confidence: 0,
    feasibility: 'UNKNOWN',
    progress: null,
    diagnostics: ['GOAL_NOT_DETECTED', 'SHADOW_ONLY'],
    suggestions: ['NO_ACTION'],
    recommendedNextStep: 'NO_ACTION',
    shadow: { shadowMode: safe.shadowMode ?? true },
    latencyMs: 0,
  });
}