// Uni Engine — Guidance observacional (Parte 2, Bloco 2).
//
// Módulo observacional das quatro guidances da Uni Engine: calcula e
// consolida Question, Clarification, Style e Length em um snapshot SOMENTE
// em memória. Nunca aplica, nunca altera a resposta, nunca executa, nunca
// persiste e nunca registra dados sensíveis. Reutiliza o cálculo da Parte 1
// (apply*) com active:true — a camada de integração existente fica intacta.
export { GUIDANCE_VERSION } from './guidanceTypes.js';
export {
  computeQuestionGuidance,
} from './computeQuestionGuidance.js';
export {
  computeClarificationGuidance,
} from './computeClarificationGuidance.js';
export {
  computeStyleGuidance,
} from './computeStyleGuidance.js';
export {
  computeLengthGuidance,
} from './computeLengthGuidance.js';
export {
  buildGuidanceDiagnostics,
  createGuidanceDiagnostic,
} from './buildGuidanceDiagnostics.js';
export {
  createEmptyGuidanceSnapshot,
  createGuidanceSnapshot,
  validateGuidanceSnapshot,
  isGuidanceSnapshotSerializable,
} from './guidanceContracts.js';
export { buildGuidanceSnapshot } from './buildGuidanceSnapshot.js';
