// Uni Engine — Fase 18: Contratos de Elegibilidade do Runtime Financeiro.
// Contratos para a elegibilidade do runtime financeiro para resposta visível.
import { isSerializableValue } from '../uniEngineContracts.js';

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

export const FINANCIAL_RESPONSE_REJECTION_REASONS = Object.freeze([
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

export const FINANCIAL_RESPONSE_DECISIONS = Object.freeze([
  'use_runtime',
  'use_legacy',
]);

export function isRejectionReason(value) {
  return FINANCIAL_RESPONSE_REJECTION_REASONS.includes(value);
}

export function isFinancialResponseDecision(value) {
  return FINANCIAL_RESPONSE_DECISIONS.includes(value);
}

export function createEmptyFinancialEligibilityResult({ turnId = null, messageId = null } = {}) {
  return deepFreeze({
    version: '1.0',
    turnId: typeof turnId === 'string' ? turnId : null,
    messageId: typeof messageId === 'string' ? messageId : null,
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

export function validateFinancialEligibilityInput(input) {
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['ELIGIBILITY_INPUT_INVALID'] };
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
  if (!isSerializableValue(input)) {
    errors.push('ELIGIBILITY_INPUT_NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}

export function validateFinancialEligibilityResult(result) {
  const safe = result && typeof result === 'object' ? result : null;
  if (!safe) return { valid: false, errors: ['ELIGIBILITY_RESULT_INVALID'] };
  const errors = [];
  if (typeof safe.eligible !== 'boolean') errors.push('ELIGIBLE_MISSING');
  if (!isFinancialResponseDecision(safe.decision)) errors.push('DECISION_INVALID');
  if (typeof safe.confidence !== 'number') errors.push('CONFIDENCE_MISSING');
  if (!Array.isArray(safe.reasonCodes)) errors.push('REASON_CODES_MISSING');
  if (!isSerializableValue(safe)) errors.push('NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}
