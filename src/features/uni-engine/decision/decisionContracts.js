// Contratos da Camada de Decisão Cognitiva (Fase 5 — Shadow Mode).
//
// DecisionResult é o contrato principal: serializável, sem funções, sem
// objetos React, sem Date. Nenhum campo pode conter Promise, Map, Set ou
// referência viva — tudo JSON-safe.
//
// Regra absoluta: `shadow.appliedToDecision` permanece SEMPRE falso nesta
// fase. A camada recomenda; nunca executa.
import {
  findFunctionsInValue,
  isSerializableValue,
} from '../uniEngineContracts.js';
import {
  DECISION_DEPENDENCY_KEYS,
  isValidDecisionDiagnostic,
  isValidDecisionRisk,
  isValidDecisionSuggestion,
  isValidDecisionType,
} from './decisionTypes.js';

export const DECISION_LAYER_VERSION = '1.0';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// -----------------------------------------------
// Dependências (booleans fechados)
// -----------------------------------------------
export function createDecisionDependencies(overrides = {}) {
  const safe = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    requiresMemory: Boolean(safe.requiresMemory),
    requiresDatabase: Boolean(safe.requiresDatabase),
    requiresConfirmation: Boolean(safe.requiresConfirmation),
    requiresConversation: Boolean(safe.requiresConversation),
    requiresSnapshot: Boolean(safe.requiresSnapshot),
    requiresHistory: Boolean(safe.requiresHistory),
    requiresExecutor: Boolean(safe.requiresExecutor),
    requiresUser: Boolean(safe.requiresUser),
  };
}

export function validateDecisionDependencies(dependencies) {
  const errors = [];
  if (!isPlainObject(dependencies)) {
    return { valid: false, errors: ['DEPENDENCIES_NOT_OBJECT'] };
  }
  for (const key of DECISION_DEPENDENCY_KEYS) {
    if (dependencies[key] != null && typeof dependencies[key] !== 'boolean') {
      errors.push(`DEPENDENCY_${key.toUpperCase()}_INVALID`);
    }
  }
  return { valid: errors.length === 0, errors };
}

// -----------------------------------------------
// Shadow (garantias da Fase 5)
// -----------------------------------------------
export function createDecisionShadow(overrides = {}) {
  const safe = overrides && typeof overrides === 'object' ? overrides : {};
  return {
    appliedToDecision: false,
    shadowMode: Boolean(safe.shadowMode ?? true),
    executorCalled: false,
    databaseCalled: false,
    memoryModified: false,
    responseModified: false,
    voiceTouched: false,
    pipelineAltered: false,
  };
}

// -----------------------------------------------
// DecisionResult — contrato principal
// -----------------------------------------------
export function createDecisionResult(seed = {}) {
  const safe = seed && typeof seed === 'object' ? seed : {};
  return {
    version: DECISION_LAYER_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: typeof safe.fallbackReason === 'string' ? safe.fallbackReason : null,
    errorCode: typeof safe.errorCode === 'string' ? safe.errorCode : null,
    decisionType: isValidDecisionType(safe.decisionType) ? safe.decisionType : 'UNKNOWN',
    confidence: typeof safe.confidence === 'number' ? Number(safe.confidence) : 0,
    risk: isValidDecisionRisk(safe.risk) ? safe.risk : 'NONE',
    reason: Array.isArray(safe.reason) ? safe.reason.map(String) : [],
    recommendedExecutor: safe.recommendedExecutor ?? null,
    recommendedQuestion: safe.recommendedQuestion ?? null,
    requiredInformation: Array.isArray(safe.requiredInformation)
      ? safe.requiredInformation.map(String)
      : [],
    dependencies: createDecisionDependencies(safe.dependencies),
    diagnostics: Array.isArray(safe.diagnostics)
      ? safe.diagnostics.filter(isValidDecisionDiagnostic)
      : [],
    recommendations: Array.isArray(safe.recommendations)
      ? safe.recommendations.filter(isValidDecisionSuggestion)
      : [],
    shadow: createDecisionShadow(safe.shadow),
    latency: isPlainObject(safe.latency) ? { ...safe.latency } : {},
    latencyMs: typeof safe.latencyMs === 'number'
      ? Number(safe.latencyMs)
      : typeof safe.latency?.totalMs === 'number'
        ? Number(safe.latency.totalMs)
        : 0,
  };
}

export function validateDecisionResult(result) {
  const errors = [];
  if (!isPlainObject(result)) {
    return { valid: false, errors: ['DECISION_RESULT_NOT_OBJECT'] };
  }
  if (!isValidDecisionType(result.decisionType)) {
    errors.push('DECISION_TYPE_INVALID');
  }
  if (
    typeof result.confidence !== 'number'
    || !Number.isFinite(result.confidence)
    || result.confidence < 0
    || result.confidence > 1
  ) {
    errors.push('CONFIDENCE_INVALID');
  }
  if (!isValidDecisionRisk(result.risk)) {
    errors.push('RISK_INVALID');
  }
  if (!Array.isArray(result.reason) || result.reason.some((line) => typeof line !== 'string')) {
    errors.push('REASON_INVALID');
  }
  if (result.recommendedExecutor != null && typeof result.recommendedExecutor !== 'string') {
    errors.push('RECOMMENDED_EXECUTOR_INVALID');
  }
  if (result.recommendedQuestion != null && typeof result.recommendedQuestion !== 'string') {
    errors.push('RECOMMENDED_QUESTION_INVALID');
  }
  if (!Array.isArray(result.requiredInformation)) {
    errors.push('REQUIRED_INFORMATION_INVALID');
  }
  const dependenciesValidation = validateDecisionDependencies(result.dependencies);
  if (!dependenciesValidation.valid) {
    errors.push('DEPENDENCIES_INVALID');
  }
  if (!Array.isArray(result.diagnostics) || result.diagnostics.some((entry) => !isValidDecisionDiagnostic(entry))) {
    errors.push('DIAGNOSTICS_INVALID');
  }
  if (!Array.isArray(result.recommendations) || result.recommendations.some((entry) => !isValidDecisionSuggestion(entry))) {
    errors.push('RECOMMENDATIONS_INVALID');
  }
  if (!isPlainObject(result.shadow)) {
    errors.push('SHADOW_INVALID');
  } else if (result.shadow.appliedToDecision !== false) {
    // Regra absoluta da Fase 5: nenhuma decisão é aplicada.
    errors.push('SHADOW_APPLIED_BLOCKED');
  }
  if (result.shadow?.executorCalled !== false) {
    errors.push('SHADOW_EXECUTOR_BLOCKED');
  }
  if (typeof result.enabled !== 'boolean') errors.push('ENABLED_INVALID');
  if (typeof result.shadowMode !== 'boolean') errors.push('SHADOW_MODE_INVALID');
  if (typeof result.fallbackUsed !== 'boolean') errors.push('FALLBACK_USED_INVALID');
  if (result.fallbackReason != null && typeof result.fallbackReason !== 'string') errors.push('FALLBACK_REASON_INVALID');
  if (result.errorCode != null && typeof result.errorCode !== 'string') errors.push('ERROR_CODE_INVALID');
  if (!isSerializableValue(result)) {
    errors.push('RESULT_NOT_SERIALIZABLE');
  }
  if (findFunctionsInValue(result).length > 0) {
    errors.push('RESULT_CONTAINS_FUNCTIONS');
  }
  if (!isPlainObject(result.latency) || typeof result.latency.totalMs !== 'number') {
    errors.push('LATENCY_INVALID');
  }
  if (typeof result.latencyMs !== 'number' || !Number.isFinite(result.latencyMs) || result.latencyMs < 0) {
    errors.push('LATENCY_MS_INVALID');
  }
  return { valid: errors.length === 0, errors };
}

// Resultado vazio e seguro (caminhos de erro/skip do orquestrador).
export function createEmptyDecisionResult(overrides = {}) {
  const safe = overrides && typeof overrides === 'object' ? overrides : {};
  return createDecisionResult({
    enabled: false,
    shadowMode: Boolean(safe.shadowMode ?? true),
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: safe.fallbackReason ?? null,
    errorCode: safe.errorCode ?? null,
    decisionType: 'UNKNOWN',
    confidence: 0,
    risk: 'NONE',
    reason: [],
    diagnostics: [],
    recommendations: [],
    dependencies: createDecisionDependencies(),
    shadow: createDecisionShadow({ shadowMode: Boolean(safe.shadowMode ?? true) }),
    latency: { totalMs: 0 },
  });
}

// -----------------------------------------------
// Contexto de decisão (saída de evaluateDecisionContext)
// -----------------------------------------------
export function createDecisionContext(seed = {}) {
  const safe = seed && typeof seed === 'object' ? seed : {};
  return {
    sufficiency: safe.sufficiency ?? 'UNKNOWN',
    consistency: safe.consistency ?? 'UNKNOWN',
    missingFields: Array.isArray(safe.missingFields) ? safe.missingFields.map(String) : [],
    conflicts: Array.isArray(safe.conflicts) ? safe.conflicts : [],
    pending: isPlainObject(safe.pending) ? { ...safe.pending } : null,
    intent: isPlainObject(safe.intent) ? { ...safe.intent } : null,
    dependencies: createDecisionDependencies(safe.dependencies),
    evidence: isPlainObject(safe.evidence) ? { ...safe.evidence } : {},
    needDatabase: Boolean(safe.needDatabase),
    needMemory: Boolean(safe.needMemory),
    needConfirmation: Boolean(safe.needConfirmation),
    needUser: Boolean(safe.needUser),
    needSnapshot: Boolean(safe.needSnapshot),
    needHistory: Boolean(safe.needHistory),
    needContext: Boolean(safe.needContext),
    diagnostics: Array.isArray(safe.diagnostics) ? safe.diagnostics.map(String) : [],
  };
}
