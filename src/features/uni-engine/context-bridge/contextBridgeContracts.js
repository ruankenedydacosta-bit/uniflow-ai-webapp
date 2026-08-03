// Uni Engine — Context Bridge (Fase 11, Bloco 2): contratos.
//
// Contrato do resultado da ponte. Garantias absolutas:
//   - ponte nunca altera resposta, nunca executa, nunca persiste;
//   - safety SEMPRE integralmente false (nenhum efeito colateral);
//   - resultado determinístico, serializável e imutável
//     (deepFreeze + validação de serialização).
import {
  CONTEXT_BRIDGE_VERSION,
  CONTEXT_BRIDGE_SAFETY_KEYS,
  isContextBridgeStatus,
  isContextBridgeFallbackReason,
} from './contextBridgeTypes.js';
import { isSerializableValue } from '../uniEngineContracts.js';

export function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }
  return value;
}

// Segurança da ponte: todas as flags de efeito colateral começam em false e
// a ponte jamais as altera (não existe executor nesta camada).
export function createBridgeSafety() {
  return Object.freeze({
    responseModified: false,
    financialExecution: false,
    memoryWrite: false,
    learningApplied: false,
    confirmationSkipped: false,
    pendingActionModified: false,
    databaseCalled: false,
    rpcCalled: false,
    ttsTriggered: false,
    persistenceWritten: false,
  });
}

export function createEmptyBridgeContext(data = {}) {
  const safe = data && typeof data === 'object' ? data : {};
  return Object.freeze({
    version: CONTEXT_BRIDGE_VERSION,
    enabled: Boolean(safe.enabled),
    sameTurn: Boolean(safe.sameTurn),
    influenceAllowed: false,
    allowedInfluences: Object.freeze([]),
    blockedInfluences: Object.freeze([]),
    responseStyle: null,
    responseLengthBand: null,
    questionDecision: null,
    clarificationDecision: null,
    selectedRoute: null,
    fallbackUsed: true,
    fallbackReason: safe.fallbackReason ?? 'GATEWAY_ABSENT',
    legacyPreserved: true,
    pendingActionPreserved: Boolean(safe.pendingActionPreserved),
    confirmationPreserved: Boolean(safe.confirmationPreserved),
    diagnostics: Object.freeze([]),
    safety: createBridgeSafety(),
    serializable: false,
  });
}

export function createBridgeContext(data = {}) {
  const safe = data && typeof data === 'object' ? data : {};
  const base = createEmptyBridgeContext(safe);
  const result = {
    ...base,
    version: CONTEXT_BRIDGE_VERSION,
    enabled: Boolean(safe.enabled),
    sameTurn: Boolean(safe.sameTurn),
    influenceAllowed: Boolean(safe.influenceAllowed),
    allowedInfluences: Object.freeze([...(safe.allowedInfluences ?? [])]),
    blockedInfluences: Object.freeze([...(safe.blockedInfluences ?? [])]),
    responseStyle: safe.responseStyle ?? null,
    responseLengthBand: safe.responseLengthBand ?? null,
    questionDecision: safe.questionDecision ?? null,
    clarificationDecision: safe.clarificationDecision ?? null,
    selectedRoute: safe.selectedRoute ?? null,
    fallbackUsed: safe.fallbackUsed ?? false,
    fallbackReason: safe.fallbackReason ?? null,
    legacyPreserved: safe.legacyPreserved ?? true,
    pendingActionPreserved: Boolean(safe.pendingActionPreserved),
    confirmationPreserved: Boolean(safe.confirmationPreserved),
    diagnostics: Object.freeze([...(safe.diagnostics ?? [])]),
    safety: createBridgeSafety(),
    serializable: Boolean(safe.serializable),
  };
  return deepFreeze(result);
}

export function validateBridgeContext(result) {
  const errors = [];
  if (!result || typeof result !== 'object' || Array.isArray(result)) {
    errors.push('RESULT_NOT_OBJECT');
    return { valid: false, errors };
  }
  if (result.version !== CONTEXT_BRIDGE_VERSION) errors.push('INVALID_VERSION');
  if (typeof result.enabled !== 'boolean') errors.push('INVALID_ENABLED');
  if (typeof result.sameTurn !== 'boolean') errors.push('INVALID_SAME_TURN');
  if (typeof result.influenceAllowed !== 'boolean') errors.push('INVALID_INFLUENCE_ALLOWED');
  if (!Array.isArray(result.allowedInfluences)) errors.push('INVALID_ALLOWED_INFLUENCES');
  if (!Array.isArray(result.blockedInfluences)) errors.push('INVALID_BLOCKED_INFLUENCES');
  if (!isContextBridgeStatus(result.influenceAllowed ? 'ALLOWED' : 'BLOCKED')) {
    errors.push('INVALID_STATUS');
  }
  if (result.fallbackReason !== null && !isContextBridgeFallbackReason(result.fallbackReason)) {
    errors.push('INVALID_FALLBACK_REASON');
  }
  if (typeof result.legacyPreserved !== 'boolean') errors.push('INVALID_LEGACY_PRESERVED');
  if (typeof result.pendingActionPreserved !== 'boolean') {
    errors.push('INVALID_PENDING_ACTION_PRESERVED');
  }
  if (typeof result.confirmationPreserved !== 'boolean') {
    errors.push('INVALID_CONFIRMATION_PRESERVED');
  }
  if (!result.safety || typeof result.safety !== 'object') {
    errors.push('INVALID_SAFETY');
  } else {
    for (const key of CONTEXT_BRIDGE_SAFETY_KEYS) {
      if (typeof result.safety[key] !== 'boolean') errors.push(`INVALID_SAFETY_${key}`);
      if (result.safety[key] !== false) errors.push(`SAFETY_FLAG_NOT_FALSE_${key}`);
    }
  }
  if (typeof result.serializable !== 'boolean') errors.push('INVALID_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function isBridgeContextSerializable(result) {
  try {
    const roundTrip = JSON.parse(JSON.stringify(result));
    return isSerializableValue(roundTrip);
  } catch {
    return false;
  }
}

export function isBridgeSafetyIntegral(safety) {
  if (!safety || typeof safety !== 'object') return false;
  return CONTEXT_BRIDGE_SAFETY_KEYS.every((key) => safety[key] === false);
}
