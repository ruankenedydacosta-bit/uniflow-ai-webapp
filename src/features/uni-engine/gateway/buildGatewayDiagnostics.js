// src/features/uni-engine/gateway/buildGatewayDiagnostics.js
//
// Diagnóstico redigido do gateway: stack trace não aparece, segredo não
// aparece e token não aparece no diagnóstico — apenas códigos, versões e
// tempos de processamento são registrados.
import { GATEWAY_VERSION } from './gatewayTypes.js';
import { createCorrelationId } from '../uniEngineContracts.js';
import { getUniEngineVersion } from '../uniEngineConfig.js';

export function buildGatewayDiagnostics(result) {
  const diagnostics = {
    gatewayVersion: GATEWAY_VERSION,
    engineVersion: getUniEngineVersion(),
    gatewayStartedAt: new Date().toISOString(),
    engineStartedAt: new Date().toISOString(),
    inputValidated: !!result?.normalizedInput,
    contextBuilt: !!result?.engineContext,
    engineUsed: result?.engineUsed || false,
    integrationApplied: result?.integrationResult?.applied || false,
    rolloutApplied: result?.rolloutSnapshot?.rolloutApplied || false,
    orchestratorApplied: result?.cognitiveSnapshot?.orchestratorStatus === 'ORCHESTRATED',
    sameTurnEnforced: result?.sameTurn || false,
    legacyPreserved: result?.legacyPreserved || false,
    fallbackUsed: result?.fallbackUsed || false,
    fallbackReason: result?.fallbackReason || null,
    errorCode: result?.fallbackReason || null,
    errorMessage: null,
    latencyMs: result?.latencyMs || 0,
    serializationChecked: result?.serializable || false,
    functionsRemoved: result?.diagnostics?.functionsRemoved || false,
    circularityResolved: result?.diagnostics?.circularityResolved || false,
    historyLimited: result?.diagnostics?.historyLimited || false,
    objectsSanitized: result?.diagnostics?.objectsSanitized || false,
    processingTimestamps: {
      normalizedAt: new Date().toISOString(),
      contextBuiltAt: new Date().toISOString(),
      engineExecutedAt: new Date().toISOString(),
      finalizedAt: new Date().toISOString(),
    },
    correlationId: result?.turnId || createCorrelationId(),
  };

  return diagnostics;
}
