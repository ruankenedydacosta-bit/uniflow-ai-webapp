// Uni Engine — Observação da conversa (Parte 2, Blocos 3 e 4).
//
// Módulo que consolida os snapshots da integração (Parte 1), do guidance
// (Bloco 2) e da Activation (Fase 9) em UM único estado TÉCNICO da conversa.
// O snapshot é SOMENTE em memória: serializável, congelado, redigido e
// determinístico — nunca altera a resposta, nunca aplica guidance, nunca
// executa e nunca persiste.
export {
  OBSERVATION_VERSION,
  createObservationSnapshot,
  createEmptyObservationSnapshot,
  isObservationSnapshotSerializable,
  sanitizeIntegrationSnapshot,
  sanitizeGuidanceSnapshot,
  sanitizeActivationSnapshot,
} from './observationContracts.js';
export {
  validateObservationSnapshot,
  validateObservationInput,
  isSafeEmbeddableSnapshot,
} from './observationValidators.js';
export {
  buildObservationDiagnostics,
  createObservationDiagnostic,
} from './observationDiagnostics.js';
export { buildObservationSnapshot } from './buildObservationSnapshot.js';
