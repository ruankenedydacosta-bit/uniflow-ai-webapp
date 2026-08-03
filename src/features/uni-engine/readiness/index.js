// Uni Engine — Decision Readiness (Parte 3).
//
// Camada estritamente observacional que consome o Observation Snapshot da
// Parte 2 e responde tecnicamente se o sistema ESTARIA pronto para uma
// aplicação futura — sem nunca aplicar nada. Reutiliza os resultados da
// Decision Layer, da Activation Engine e do registro de capacidades; nunca
// re-executa gates, nunca altera a resposta e nunca persiste.
export {
  READINESS_VERSION,
  READINESS_MODES,
  OBSERVATIONAL_CAPABILITIES,
  FORBIDDEN_CAPABILITIES,
  READINESS_NEXT_STEPS,
  ACTIVATION_READINESS_STATUSES,
  READINESS_BLOCK_REASONS,
  READINESS_DIAGNOSTIC_CODES,
  isReadinessMode,
  isObservationalCapability,
  isForbiddenCapability,
  isReadinessNextStep,
  isActivationReadinessStatus,
  isReadinessBlockReason,
  isValidReadinessCapability,
} from './readinessTypes.js';
export {
  READINESS_POLICY,
  clamp01,
  mapDecisionToNextStep,
  deriveActivationReadiness,
  isActivationStatusFutureApplicable,
} from './readinessPolicy.js';
export {
  deepFreeze,
  createEmptyReadinessSnapshot,
  createReadinessSnapshot,
  validateReadinessSnapshot,
  isReadinessSnapshotSerializable,
} from './readinessContracts.js';
export {
  buildReadinessDiagnostics,
  createReadinessDiagnostic,
} from './buildReadinessDiagnostics.js';
export { buildDecisionReadinessSnapshot } from './buildDecisionReadinessSnapshot.js';
