// Uni Engine — Cognitive Orchestrator: tipos (Parte 9, Bloco Único).
//
// Snapshot consolidado estritamente observacional de todas as camadas
// cognitivas do turno. Garantias absolutas:
//   - legacyPreserved SEMPRE true e applied SEMPRE false;
//   - shadowMode true por padrão;
//   - SOMENTE em memória: serializável, congelado, determinístico,
//     sem funções, sem Map/Set, sem referências circulares;
//   - nenhum texto de resposta, ID, valor ou memória é embedado.
export const COGNITIVE_ORCHESTRATOR_VERSION = '1.0';

export const ORCHESTRATOR_STATUSES = Object.freeze([
  'ORCHESTRATED',
  'PARTIAL',
  'EMPTY',
  'FALLBACK',
]);

export const ORCHESTRATOR_LAYERS = Object.freeze([
  'observation',
  'guidance',
  'decision',
  'capabilityReadiness',
  'executionReadiness',
  'application',
  'conversationPlan',
  'conversationRoute',
]);

export const ORCHESTRATOR_DIAGNOSTIC_CODES = Object.freeze([
  'ORCHESTRATOR_ORCHESTRATED',
  'ORCHESTRATOR_PARTIAL',
  'ORCHESTRATOR_EMPTY',
  'ORCHESTRATOR_FALLBACK',
  'OBSERVATION_MISSING',
  'OBSERVATION_INVALID',
  'GUIDANCE_MISSING',
  'GUIDANCE_INVALID',
  'DECISION_MISSING',
  'DECISION_INVALID',
  'CAPABILITY_READINESS_MISSING',
  'CAPABILITY_READINESS_INVALID',
  'EXECUTION_READINESS_MISSING',
  'EXECUTION_READINESS_INVALID',
  'APPLICATION_MISSING',
  'APPLICATION_INVALID',
  'CONVERSATION_PLAN_MISSING',
  'CONVERSATION_PLAN_INVALID',
  'CONVERSATION_ROUTE_MISSING',
  'CONVERSATION_ROUTE_INVALID',
  'SAME_TURN_VIOLATED',
  'SHADOW_MODE',
  'LEGACY_PRESERVED',
]);

export const ORCHESTRATOR_METADATA_ALLOWED_KEYS = Object.freeze([
  'sources',
  'layerCount',
  'validLayerCount',
  'missingLayerCount',
  'environment',
  'status',
]);

export function isOrchestratorStatus(value) {
  return ORCHESTRATOR_STATUSES.includes(value);
}

export function isOrchestratorLayer(value) {
  return ORCHESTRATOR_LAYERS.includes(value);
}

export function isOrchestratorDiagnosticCode(value) {
  return ORCHESTRATOR_DIAGNOSTIC_CODES.includes(value);
}

export function isOrchestratorMetadataKey(value) {
  return ORCHESTRATOR_METADATA_ALLOWED_KEYS.includes(value);
}