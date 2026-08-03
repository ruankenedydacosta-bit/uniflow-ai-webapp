// src/features/uni-engine/gateway/buildGatewayContext.js
//
// Constrói o contexto seguro de execução do gateway: contexto serializável
// (isSerializableValue) com snapshot financeiro já sanitizado e histórico
// já limitado na normalização, além do snapshot de segurança com todas as
// flags de efeito colateral em false.
import { GATEWAY_POLICY } from './gatewayPolicy.js';
import { isSerializableValue } from '../uniEngineContracts.js';

function safeObject(value) {
  return value && typeof value === 'object' ? value : {};
}

function buildSecuritySnapshot() {
  return {
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
  };
}

export function buildGatewayContext(normalizedInput) {
  if (!normalizedInput) {
    return { valid: false, error: 'NULL_INPUT', context: null };
  }

  const context = {
    turnId: normalizedInput.turnId,
    source: normalizedInput.source,
    normalizedText: normalizedInput.text,
    normalizedTranscript: normalizedInput.transcript,
    userId: normalizedInput.userId,
    workspaceId: normalizedInput.workspaceId,
    conversationId: normalizedInput.conversationId,
    financialSnapshot: normalizedInput.financialSnapshot,
    conversationHistory: normalizedInput.conversationHistory,
    userPreferences: normalizedInput.userPreferences,
    config: safeObject(normalizedInput.config),
    environment: normalizedInput.environment,
    security: buildSecuritySnapshot(),
    diagnostics: {
      functionsRemoved: false,
      sanitizationApplied: !!normalizedInput.financialSnapshot,
      historyLimited: normalizedInput.conversationHistory?.length > GATEWAY_POLICY.MAX_HISTORY_LENGTH,
      objectsSanitized: false,
      circularityResolved: false,
    },
  };

  if (!isSerializableValue(context)) {
    return { valid: false, error: 'NON_SERIALIZABLE_CONTEXT', context: null };
  }

  return { valid: true, context, error: null };
}
