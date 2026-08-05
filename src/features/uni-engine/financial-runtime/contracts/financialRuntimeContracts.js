// Uni Engine — Fase 18: Contratos do Runtime Financeiro.
// Contratos para o runtime financeiro para resposta visível.
import { isSerializableValue } from '../../uniEngineContracts.js';
import { RUNTIME_STAGES } from '../types/index.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreeze));
  }
  const frozen = {};
  for (const key of Object.keys(value).sort()) {
    frozen[key] = deepFreeze(value[key]);
  }
  return Object.freeze(frozen);
}

function createEmptyStage() {
  return { present: false, executed: false, status: 'pending', errorCode: null };
}

export function createEmptyRuntimeStageResults() {
  const stages = {};
  for (const stage of RUNTIME_STAGES) {
    stages[stage] = { present: false, executed: false, status: 'pending', errorCode: null };
  }
  return Object.freeze(stages);
}

// FASE 19.1: workspaceId/conversationId viajam como campos PRÓPRIOS, no
// mesmo nível de turnId/messageId -- nunca aninhados dentro de turnId (que
// é, e continua sendo, uma string simples). São a identidade de PRODUÇÃO do
// resultado (com qual workspace/conversa este resultado foi calculado),
// usada pelos gates de isolamento da Fase 19 para detectar resultado stale,
// de outro workspace ou de outra conversa -- sem inventar propriedade
// alguma dentro de turnId.
export function createEmptyRuntimeResult({
  turnId = null, messageId = null, workspaceId = null, conversationId = null,
} = {}) {
  const safeTurnId = typeof turnId === 'string' ? turnId : null;
  const safeMessageId = typeof messageId === 'string' ? messageId : null;
  const safeWorkspaceId = typeof workspaceId === 'string' ? workspaceId : null;
  const safeConversationId = typeof conversationId === 'string' ? conversationId : null;
  const stages = {};
  for (const stage of RUNTIME_STAGES) {
    stages[stage] = { present: false, executed: false, status: 'pending', errorCode: null };
  }
  return Object.freeze({
    version: '1.0',
    turnId: safeTurnId,
    messageId: safeMessageId,
    workspaceId: safeWorkspaceId,
    conversationId: safeConversationId,
    mode: 'shadow',
    status: 'initialized',
    shadowMode: true,
    influenceApplied: false,
    executionAllowed: false,
    legacyPreserved: true,
    executed: false,
    persisted: false,
    discarded: true,
    stages: Object.freeze(Object.fromEntries(RUNTIME_STAGES.map(s => [s, { present: false, executed: false, status: 'pending', errorCode: null }]))),
    intent: null,
    temporal: null,
    queryPlan: null,
    executionResult: null,
    periodComparison: null,
    narrative: null,
    telemetry: null,
    safety: {},
    latencyMs: 0,
    timestamp: new Date().toISOString(),
    serializable: true,
  });
}

export const FINANCIAL_RUNTIME_RESPONSE_REJECTION_REASONS = Object.freeze([
  'FEATURE_DISABLED',
  'PRODUCTION_BLOCKED',
  'CANARY_NOT_ELIGIBLE',
  'INTENT_NOT_ALLOWED',
  'TEMPORAL_UNRESOLVED',
  'NO_FINANCIAL_DATA',
  'QUERY_INVALID',
  'EXECUTION_FAILED',
  'FACTS_INVALID',
  'CONFIDENCE_INSUFFICIENT',
  'IDENTITY_CHANGED',
  'FLAG_DISABLED',
  'ENVIRONMENT_BLOCKED',
  'PENDING_ACTION_ACTIVE',
  'NARRATIVE_INVALID',
  'SAFETY_REJECTED',
  'CANARY_FAILED',
]);

export const FINANCIAL_RUNTIME_RESPONSE_DECISIONS = Object.freeze([
  'use_runtime',
  'use_legacy',
]);

export function isRuntimeResponseRejectionReason(value) {
  return FINANCIAL_RUNTIME_RESPONSE_REJECTION_REASONS.includes(value);
}

export function isFinancialRuntimeResponseDecision(value) {
  return FINANCIAL_RUNTIME_RESPONSE_DECISIONS.includes(value);
}

export function createEmptyFinancialRuntimeResponse({ turnId = null, messageId = null } = {}) {
  const safeTurnId = typeof turnId === 'string' ? turnId : null;
  const safeMessageId = typeof messageId === 'string' ? messageId : null;
  return Object.freeze({
    version: '1.0',
    turnId: safeTurnId,
    messageId: safeMessageId,
    eligible: false,
    decision: 'use_legacy',
    confidence: 0,
    reasonCodes: [],
    intentSupported: false,
    temporalResolved: false,
    queryValid: false,
    executionSuccessful: false,
    factsValidated: false,
    narrativeValid: false,
    dataAvailable: false,
    safetyApproved: false,
    fallbackRequired: true,
    influenceAllowed: false,
    serializable: true,
    discarded: true,
  });
}

export function validateFinancialRuntimeResponseInput(input) {
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['RESPONSE_INPUT_INVALID'] };
  }
  const errors = [];
  const required = [
    'intentSupported',
    'temporalResolved',
    'queryValid',
    'executionSuccessful',
    'factsValidated',
    'narrativeValid',
    'dataAvailable',
    'safetyApproved',
  ];
  for (const field of required) {
    if (typeof input[field] !== 'boolean') {
      errors.push(`${field.toUpperCase()}_MISSING_OR_NOT_BOOLEAN`);
    }
  }
  if (typeof input.confidence !== 'number' || !Number.isFinite(input.confidence)) {
    errors.push('CONFIDENCE_MISSING_OR_INVALID');
  }
  if (input.confidence < 0 || input.confidence > 1) {
    errors.push('CONFIDENCE_OUT_OF_RANGE');
  }
  return { valid: errors.length === 0, errors };
}

export function isRuntimeObjectSerializable(value) {
  try {
    JSON.stringify(value);
    return true;
  } catch {
    return false;
  }
}

export function validateRuntimeIntent(intent) {
  if (!intent || typeof intent !== 'object') return { valid: false, errors: ['INTENT_INVALID'] };
  const errors = [];
  if (!intent.type || typeof intent.type !== 'string') errors.push('INTENT_TYPE_MISSING');
  if (intent.confidence !== undefined && (typeof intent.confidence !== 'number' || intent.confidence < 0 || intent.confidence > 1)) {
    errors.push('INTENT_CONFIDENCE_INVALID');
  }
  return { valid: errors.length === 0, errors };
}

export function validateRuntimeTemporal(temporal) {
  if (!temporal || typeof temporal !== 'object') return { valid: false, errors: ['TEMPORAL_INVALID'] };
  const errors = [];
  if (!temporal.entity || typeof temporal.entity !== 'string') errors.push('TEMPORAL_ENTITY_MISSING');
  return { valid: errors.length === 0, errors };
}

export function validateRuntimeQueryPlan(queryPlan) {
  if (!queryPlan || typeof queryPlan !== 'object') return { valid: false, errors: ['QUERY_PLAN_INVALID'] };
  const errors = [];
  if (!queryPlan.queries || !Array.isArray(queryPlan.queries)) errors.push('QUERIES_MISSING');
  return { valid: errors.length === 0, errors };
}

export function validateRuntimeExecutionResult(executionResult) {
  if (!executionResult || typeof executionResult !== 'object') return { valid: false, errors: ['EXECUTION_RESULT_INVALID'] };
  const errors = [];
  if (!executionResult.status || typeof executionResult.status !== 'string') errors.push('EXECUTION_STATUS_MISSING');
  return { valid: errors.length === 0, errors };
}

export function validateRuntimePeriodComparison(periodComparison) {
  if (!periodComparison || typeof periodComparison !== 'object') return { valid: false, errors: ['PERIOD_COMPARISON_INVALID'] };
  const errors = [];
  if (!periodComparison.status || typeof periodComparison.status !== 'string') errors.push('COMPARISON_STATUS_MISSING');
  return { valid: errors.length === 0, errors };
}

export function validateRuntimeNarrative(narrative) {
  if (!narrative || typeof narrative !== 'object') return { valid: false, errors: ['NARRATIVE_INVALID'] };
  const errors = [];
  if (!narrative.text || typeof narrative.text !== 'string') errors.push('NARRATIVE_TEXT_MISSING');
  return { valid: errors.length === 0, errors };
}

export function validateRuntimeResult(result) {
  if (!result || typeof result !== 'object') return { valid: false, errors: ['RUNTIME_RESULT_INVALID'] };
  const errors = [];
  if (!result.version || typeof result.version !== 'string') errors.push('VERSION_MISSING');
  if (!result.status || typeof result.status !== 'string') errors.push('STATUS_MISSING');
  return { valid: errors.length === 0, errors };
}