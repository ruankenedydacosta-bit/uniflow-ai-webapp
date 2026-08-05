// Uni Engine — Inteligência Financeira Conversacional (Fase 16). Contratos.
//
// Garantias estruturais da camada conversacional: todo resultado é
// serializável (sem funções, Promises, Date, classes, Map/Set, elementos
// React, DOM ou referências circulares), congelado e com `influenceApplied`
// SEMPRE false. O motor jamais lança — falha segura retorna resultado vazio
// válido com status apropriado.
import { FINANCIAL_CONVERSATIONAL_VERSION, FINANCIAL_CONVERSATIONAL_STAGES, FINANCIAL_CONVERSATIONAL_SAFETY_KEYS } from '../types/index.js';
import { isSerializableValue } from '../../uniEngineContracts.js';

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

function buildEmptySafety() {
  const safety = {};
  for (const key of FINANCIAL_CONVERSATIONAL_SAFETY_KEYS) {
    safety[key] = false;
  }
  return Object.freeze(deepFreeze(safety));
}

export function createEmptyFinancialConversationalStageResults() {
  const stages = {};
  for (const stage of FINANCIAL_CONVERSATIONAL_STAGES) {
    stages[stage] = Object.freeze({
      present: false,
      executed: false,
      status: null,
      errorCode: null,
    });
  }
  return Object.freeze(stages);
}

export function createEmptyFinancialConversationalResult({ turnId = null, messageId = null } = {}) {
  return deepFreeze({
    version: FINANCIAL_CONVERSATIONAL_VERSION,
    turnId: typeof turnId === 'string' ? turnId : null,
    messageId: typeof messageId === 'string' ? messageId : null,
    mode: 'shadow',
    status: 'disabled',
    shadowMode: true,
    influenceApplied: false,
    legacyPreserved: true,
    executed: false,
    persisted: false,
    stages: createEmptyFinancialConversationalStageResults(),
    intent: null,
    temporalResolution: null,
    enrichedContext: null,
    queryPlan: null,
    executionResult: null,
    periodComparison: null,
    narrative: null,
    telemetry: null,
    safety: buildEmptySafety(),
    latencyMs: null,
    serializable: true,
    discarded: true,
  });
}

export function isFinancialConversationalObjectSerializable(value) {
  return isSerializableValue(value);
}

export function validateFinancialConversationalIntent(intent) {
  if (!intent || typeof intent !== 'object') {
    return { valid: false, errors: ['INTENT_INVALID'] };
  }
  const errors = [];
  if (typeof intent.type !== 'string') errors.push('INTENT_TYPE_MISSING');
  if (!Number.isFinite(intent.confidence)) errors.push('INTENT_CONFIDENCE_MISSING');
  if (intent.resolvedEntities && !Array.isArray(intent.resolvedEntities)) errors.push('INTENT_ENTITIES_INVALID');
  if (!isSerializableValue(intent)) errors.push('INTENT_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function validateFinancialTemporalResolution(resolution) {
  if (!resolution || typeof resolution !== 'object') {
    return { valid: false, errors: ['TEMPORAL_RESOLUTION_INVALID'] };
  }
  const errors = [];
  if (typeof resolution.status !== 'string') errors.push('TEMPORAL_STATUS_MISSING');
  if (!Number.isFinite(resolution.confidence)) errors.push('TEMPORAL_CONFIDENCE_MISSING');
  if (resolution.resolved && typeof resolution.resolved !== 'object') errors.push('TEMPORAL_RESOLVED_INVALID');
  if (!isSerializableValue(resolution)) errors.push('TEMPORAL_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function validateFinancialQueryPlan(plan) {
  if (!plan || typeof plan !== 'object') {
    return { valid: false, errors: ['QUERY_PLAN_INVALID'] };
  }
  const errors = [];
  if (typeof plan.type !== 'string') errors.push('PLAN_TYPE_MISSING');
  if (!Array.isArray(plan.steps)) errors.push('PLAN_STEPS_MISSING');
  if (!Number.isFinite(plan.estimatedCost)) errors.push('PLAN_COST_MISSING');
  if (!isSerializableValue(plan)) errors.push('PLAN_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function validateFinancialExecutionResult(result) {
  if (!result || typeof result !== 'object') {
    return { valid: false, errors: ['EXECUTION_RESULT_INVALID'] };
  }
  const errors = [];
  if (typeof result.status !== 'string') errors.push('EXECUTION_STATUS_MISSING');
  if (result.data !== undefined && result.data !== null && typeof result.data !== 'object') errors.push('EXECUTION_DATA_INVALID');
  if (!isSerializableValue(result)) errors.push('EXECUTION_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function validateFinancialPeriodComparison(comparison) {
  if (!comparison || typeof comparison !== 'object') {
    return { valid: false, errors: ['PERIOD_COMPARISON_INVALID'] };
  }
  const errors = [];
  if (typeof comparison.type !== 'string') errors.push('COMPARISON_TYPE_MISSING');
  if (!isSerializableValue(comparison)) errors.push('COMPARISON_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function validateFinancialNarrative(narrative) {
  if (!narrative || typeof narrative !== 'object') {
    return { valid: false, errors: ['NARRATIVE_INVALID'] };
  }
  const errors = [];
  if (typeof narrative.type !== 'string') errors.push('NARRATIVE_TYPE_MISSING');
  if (typeof narrative.text !== 'string') errors.push('NARRATIVE_TEXT_MISSING');
  if (!Array.isArray(narrative.insights)) errors.push('NARRATIVE_INSIGHTS_MISSING');
  if (!Number.isFinite(narrative.confidence)) errors.push('NARRATIVE_CONFIDENCE_MISSING');
  if (!isSerializableValue(narrative)) errors.push('NARRATIVE_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function validateFinancialConversationalResult(result) {
  const safe = result && typeof result === 'object' ? result : null;
  if (!safe) return { valid: false, errors: ['RESULT_INVALID'] };
  const errors = [];
  if (safe.influenceApplied !== false) errors.push('INFLUENCE_MUST_BE_FALSE');
  if (safe.discarded !== true) errors.push('MUST_BE_DISCARDED');
  if (safe.serializable !== true) errors.push('MUST_BE_SERIALIZABLE');
  if (safe.mode !== 'shadow') errors.push('MODE_MUST_BE_SHADOW');
  if (!isSerializableValue(safe)) errors.push('NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export const FINANCIAL_CONVERSATIONAL_SAFETY_KEYS_EXPORT = FINANCIAL_CONVERSATIONAL_SAFETY_KEYS;