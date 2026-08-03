// src/features/uni-engine/gateway/gatewayContracts.js
//
// Contrato do resultado do gateway. O contrato garante que o gateway:
// - gateway não altera resposta e gateway não cria pergunta;
// - gateway não modifica Pending Action e gateway não modifica confirmacão;
// - gateway não executa financeiro, gateway não escreve memória e gateway não aplica aprendizado;
// - gateway não chama banco, gateway não chama RPC e gateway não dispara TTS; gateway não persiste;
// - resultado determinístico, resultado serializável e resultado imutável
//   (Object.freeze + validação de serialização).
import { findFunctionsInValue } from '../uniEngineContracts.js';
import { isSerializableValue } from '../uniEngineContracts.js';

export const GATEWAY_CONTRACT_VERSION = '1.0.0';

// Contrato de segurança do gateway: safety.responseModified=false e
// safety.financialExecution=false; todas as flags de efeito colateral
// começam em false e só a camada executora autorizada poderia alterá-las.
export const EMPTY_SAFETY = Object.freeze({
  responseModified: false,
  financialExecution: false,
  memoryWrite: false,
  learningApplied: false,
  pendingActionModified: false,
  confirmationModified: false,
  databaseCalled: false,
  rpcCalled: false,
  ttsTriggered: false,
  persistenceWritten: false,
});

export function createEmptyGatewayResult() {
  return Object.freeze({
    version: GATEWAY_CONTRACT_VERSION,
    enabled: true,
    accepted: false,
    sameTurn: false,
    source: null,
    turnId: null,
    normalizedInput: null,
    engineContext: null,
    integrationResult: null,
    cognitiveSnapshot: null,
    rolloutSnapshot: null,
    operationalReadiness: null,
    fallbackUsed: false,
    fallbackReason: null,
    diagnostics: null,
    safety: EMPTY_SAFETY,
    latencyMs: 0,
    legacyPreserved: true,
    serializable: false,
  });
}

export function createGatewayResult(data = {}) {
  const base = createEmptyGatewayResult();
  const result = {
    ...base,
    version: GATEWAY_CONTRACT_VERSION,
    turnId: data.turnId ?? base.turnId,
    source: data.source ?? base.source,
    accepted: data.accepted ?? base.accepted,
    sameTurn: data.sameTurn ?? base.sameTurn,
    normalizedInput: data.normalizedInput ?? base.normalizedInput,
    engineContext: data.engineContext ?? base.engineContext,
    integrationResult: data.integrationResult ?? base.integrationResult,
    cognitiveSnapshot: data.cognitiveSnapshot ?? base.cognitiveSnapshot,
    rolloutSnapshot: data.rolloutSnapshot ?? base.rolloutSnapshot,
    operationalReadiness: data.operationalReadiness ?? base.operationalReadiness,
    fallbackUsed: data.fallbackUsed ?? base.fallbackUsed,
    fallbackReason: data.fallbackReason ?? base.fallbackReason,
    diagnostics: data.diagnostics ?? base.diagnostics,
    safety: data.safety ?? base.safety,
    latencyMs: typeof data.latencyMs === 'number' ? data.latencyMs : base.latencyMs,
    legacyPreserved: data.legacyPreserved ?? base.legacyPreserved,
    serializable: data.serializable ?? base.serializable,
  };
  return Object.freeze(result);
}

export function validateGatewayResult(result) {
  const errors = [];

  if (!result || typeof result !== 'object') {
    errors.push('RESULT_NOT_OBJECT');
    return { valid: false, errors };
  }

  if (!result.version || result.version !== GATEWAY_CONTRACT_VERSION) {
    errors.push('INVALID_VERSION');
  }

  if (typeof result.enabled !== 'boolean') {
    errors.push('INVALID_ENABLED');
  }

  if (typeof result.accepted !== 'boolean') {
    errors.push('INVALID_ACCEPTED');
  }

  if (!result.source || !['text', 'voice'].includes(result.source)) {
    errors.push('INVALID_SOURCE');
  }

  if (!result.turnId) {
    errors.push('INVALID_TURN_ID');
  }

  if (!isSerializableValue(result.normalizedInput)) {
    errors.push('NON_SERIALIZABLE_INPUT');
  }

  if (result.safety) {
    const safety = result.safety;
    if (typeof safety.responseModified !== 'boolean' ||
        typeof safety.financialExecution !== 'boolean' ||
        typeof safety.memoryWrite !== 'boolean' ||
        typeof safety.learningApplied !== 'boolean' ||
        typeof safety.pendingActionModified !== 'boolean' ||
        typeof safety.confirmationModified !== 'boolean' ||
        typeof safety.databaseCalled !== 'boolean' ||
        typeof safety.rpcCalled !== 'boolean' ||
        typeof safety.ttsTriggered !== 'boolean' ||
        typeof safety.persistenceWritten !== 'boolean') {
      errors.push('INVALID_SAFETY');
    }
  }

  const functions = findFunctionsInValue(result);
  if (functions.length > 0) {
    errors.push('CONTAINS_FUNCTIONS');
  }

  return { valid: errors.length === 0, errors };
}
