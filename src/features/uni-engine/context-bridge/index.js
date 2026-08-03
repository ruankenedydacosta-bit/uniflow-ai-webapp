// Uni Engine — Context Bridge (Fase 11, Bloco 2).
//
// Adaptador puro que transforma snapshots JÁ produzidos no MESMO turno em um
// contexto mínimo, serializável e imutável para o único ponto de construção
// da resposta. Não é uma nova camada cognitiva: nunca reexecuta camada
// alguma, nunca gera texto factual e nenhuma execução acontece nesta camada.
export {
  CONTEXT_BRIDGE_VERSION,
  CONTEXT_BRIDGE_STATUSES,
  ALLOWED_CONTEXT_INFLUENCES,
  BLOCKED_CONTEXT_INFLUENCES,
  CONTEXT_BRIDGE_INFLUENCES,
  CONTEXT_BRIDGE_FALLBACK_REASONS,
  CONTEXT_BRIDGE_DIAGNOSTIC_CODES,
  CONTEXT_BRIDGE_SAFETY_KEYS,
  isContextBridgeStatus,
  isContextBridgeInfluence,
  isAllowedContextInfluence,
  isBlockedContextInfluence,
  isContextBridgeFallbackReason,
  isContextBridgeDiagnosticCode,
  isContextBridgeSafetyKey,
} from './contextBridgeTypes.js';
export {
  CONTEXT_BRIDGE_POLICY,
  isBridgeEnabledByPolicy,
  isEnvironmentAllowedByBridgePolicy,
  isUserAuthorizedByBridgePolicy,
  isRolloutInternalAuthorizedByBridgePolicy,
  rolloutStageOf,
  isOrchestratorValidByBridgePolicy,
  isReadinessValidByBridgePolicy,
  isConfidenceAllowedByBridgePolicy,
  isRiskAllowedByBridgePolicy,
  isCapabilityEnabledByBridgePolicy,
  isInfluenceAllowedByBridgePolicy,
  isInfluenceBlockedByBridgePolicy,
} from './contextBridgePolicy.js';
export {
  deepFreeze,
  createBridgeSafety,
  createEmptyBridgeContext,
  createBridgeContext,
  validateBridgeContext,
  isBridgeContextSerializable,
  isBridgeSafetyIntegral,
} from './contextBridgeContracts.js';
export {
  createContextBridgeDiagnostic,
  isContextBridgeDiagnostic,
  buildContextBridgeDiagnostics,
} from './buildContextBridgeDiagnostics.js';
export {
  selectSafeEngineInfluence,
} from './selectSafeEngineInfluence.js';
export {
  buildEngineResponseContext,
} from './buildEngineResponseContext.js';