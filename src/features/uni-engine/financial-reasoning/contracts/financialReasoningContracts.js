// Uni Engine — Motor de Raciocínio Financeiro (Fase 15). Contratos.
//
// Garantias estruturais do motor: todo resultado é serializável (sem funções,
// Promises, Date, classes, Map/Set, elementos React, DOM ou referências
// circulares), congelado e com `influenceApplied` SEMPRE false. Vale também
// para o resultado vazio (falha segura) — o motor jamais lança.
import { FINANCIAL_REASONING_VERSION, FINANCIAL_REASONING_STAGES } from '../types/financialReasoningTypes.js';
import { isSerializableValue } from '../../uniEngineContracts.js';

const SAFETY_KEYS = Object.freeze([
  'influenceApplied',
  'executed',
  'persisted',
  'networkAccessed',
  'apiCalled',
  'financialMutation',
  'responseModified',
  'memoryWrite',
  'databaseCalled',
  'rpcCalled',
]);

export const FINANCIAL_REASONING_SAFETY_KEYS = SAFETY_KEYS;

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
  for (const key of SAFETY_KEYS) {
    safety[key] = false;
  }
  return Object.freeze(deepFreeze(safety));
}

export function createEmptyFinancialStageResults() {
  const stages = {};
  for (const stage of FINANCIAL_REASONING_STAGES) {
    stages[stage] = Object.freeze({
      present: false,
      executed: false,
      status: null,
      errorCode: null,
    });
  }
  return Object.freeze(stages);
}

export function createEmptyFinancialReasoningResult({ turnId = null, messageId = null } = {}) {
  return deepFreeze({
    version: FINANCIAL_REASONING_VERSION,
    turnId: typeof turnId === 'string' ? turnId : null,
    messageId: typeof messageId === 'string' ? messageId : null,
    mode: 'shadow',
    status: 'engine_disabled',
    shadowMode: true,
    influenceApplied: false,
    legacyPreserved: true,
    executed: false,
    persisted: false,
    stages: createEmptyFinancialStageResults(),
    snapshot: Object.freeze({ present: false }),
    diagnostics: Object.freeze([]),
    inferences: Object.freeze([]),
    plan: Object.freeze({
      present: false,
      objectives: [],
      nextActions: [],
      priorities: [],
      opportunities: [],
      risks: [],
    }),
    comparison: Object.freeze({
      present: false,
      status: 'comparison_deferred',
      divergences: [],
    }),
    telemetry: null,
    safety: buildEmptySafety(),
    latencyMs: null,
    serializable: true,
    discarded: true,
  });
}

export function isFinancialObjectSerializable(value) {
  return isSerializableValue(value);
}

export function validateFinancialSnapshot(snapshot) {
  const safe = snapshot && typeof snapshot === 'object' ? snapshot : null;
  if (!safe) return { valid: false, errors: ['SNAPSHOT_INVALID'] };
  const errors = [];
  if (safe.serializable !== true) errors.push('SNAPSHOT_MUST_BE_JSON_SAFE');
  if (!isSerializableValue(safe)) errors.push('NOT_SERIALIZABLE');
  if (typeof safe.totalBalance !== 'number') errors.push('BALANCE_MISSING');
  if (typeof safe.hasData !== 'boolean') errors.push('HAS_DATA_MISSING');
  return { valid: errors.length === 0, errors };
}

export function validateFinancialDiagnostics(diagnostics) {
  if (!Array.isArray(diagnostics)) return { valid: false, errors: ['DIAGNOSTICS_INVALID'] };
  const errors = [];
  for (const diagnostic of diagnostics) {
    if (!diagnostic || typeof diagnostic !== 'object') {
      errors.push('DIAGNOSTIC_ENTRY_INVALID');
      continue;
    }
    if (typeof diagnostic.id !== 'string') errors.push('DIAGNOSTIC_ID_MISSING');
    if (typeof diagnostic.type !== 'string') errors.push('DIAGNOSTIC_TYPE_MISSING');
    if (!Number.isFinite(diagnostic.confidence)) errors.push('DIAGNOSTIC_CONFIDENCE_MISSING');
    if (!Array.isArray(diagnostic.evidences)) errors.push('DIAGNOSTIC_EVIDENCES_MISSING');
  }
  if (!isSerializableValue(diagnostics)) errors.push('DIAGNOSTICS_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function validateFinancialInferences(inferences) {
  if (!Array.isArray(inferences)) return { valid: false, errors: ['INFERENCES_INVALID'] };
  const errors = [];
  for (const inference of inferences) {
    if (!inference || typeof inference !== 'object') {
      errors.push('INFERENCE_ENTRY_INVALID');
      continue;
    }
    if (typeof inference.type !== 'string') errors.push('INFERENCE_TYPE_MISSING');
    if (!Number.isFinite(inference.confidence)) errors.push('INFERENCE_CONFIDENCE_MISSING');
    if (inference.appliedToDecision !== false) errors.push('INFERENCE_MUST_NOT_APPLY');
  }
  if (!isSerializableValue(inferences)) errors.push('INFERENCES_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function validateFinancialReasoningResult(result) {
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