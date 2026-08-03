// Uni Engine — Cognitive Orchestrator (Parte 9, Bloco Único).
//
// Snapshot consolidado estritamente observacional de todas as camadas cognitivas
// do turno. Garantias absolutas:
//   - legacyPreserved SEMPRE true e applied SEMPRE false;
//   - shadowMode true por padrão;
//   - SOMENTE em memória: serializável, congelado, determinístico,
//     sem funções, sem Map/Set, sem referências circulares;
//   - nenhum texto de resposta, ID, valor ou memória é embedado.
//
// Função principal: buildCognitiveOrchestratorSnapshot — orquestra camadas já
// produzidas (Observation, Guidance, Decision, Capability Readiness,
// Execution Readiness, Application, Conversation Planner, Conversation Routing)
// — não reexecuta nenhuma. Qualquer falha → vazio fail-safe (FALLBACK).
export {
  COGNITIVE_ORCHESTRATOR_VERSION,
  ORCHESTRATOR_STATUSES,
  ORCHESTRATOR_LAYERS,
  ORCHESTRATOR_DIAGNOSTIC_CODES,
  ORCHESTRATOR_METADATA_ALLOWED_KEYS,
  isOrchestratorStatus,
  isOrchestratorLayer,
  isOrchestratorDiagnosticCode,
  isOrchestratorMetadataKey,
} from './cognitiveOrchestratorTypes.js';
export { COGNITIVE_ORCHESTRATOR_POLICY, isCognitiveOrchestratorEnabledByConfig, isEnvironmentAllowedByOrchestratorPolicy } from './cognitiveOrchestratorPolicy.js';
export {
  createEmptyCognitiveOrchestratorSnapshot,
  createCognitiveOrchestratorSnapshot,
  validateCognitiveOrchestratorSnapshot,
  isCognitiveOrchestratorSnapshotSerializable,
  deepFreeze,
} from './cognitiveOrchestratorContracts.js';
export { buildCognitiveOrchestratorDiagnostics } from './buildCognitiveOrchestratorDiagnostics.js';
export { buildCognitiveOrchestratorSnapshot } from './buildCognitiveOrchestratorSnapshot.js';

