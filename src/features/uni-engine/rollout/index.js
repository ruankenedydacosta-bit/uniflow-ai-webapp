// Uni Engine — Controlled Rollout: exports (Parte 10, Bloco Único).
//
// Exporta tipos, policy, contratos, builders e testes para o rollout de rollout operacional.
export {
  ROLLOUT_VERSION,
  ROLLOUT_STAGES,
  OPERATIONAL_STATUSES,
  ROLLOUT_SAFETY_KEYS,
  OPERATIONAL_METADATA_ALLOWED_KEYS,
  isRolloutStage,
  isOperationalStatus,
  isRolloutSafetyKey,
  isOperationalMetadataKey,
} from './rolloutTypes.js';
export { ROLLOUT_POLICY, isRolloutEnabledByConfig, isEnvironmentAllowedByRolloutPolicy } from './rolloutPolicy.js';
export {
  createEmptyRolloutSnapshot,
  createRolloutSnapshot,
  validateRolloutSnapshot,
  isRolloutSnapshotSerializable,
  deepFreeze,
} from './rolloutContracts.js';
export { buildRolloutDiagnostics } from './buildRolloutDiagnostics.js';
export { buildRolloutSnapshot } from './buildRolloutSnapshot.js';
export { buildOperationalReadinessReport } from './buildOperationalReadinessReport.js';
export { evaluateRolloutEligibility } from './evaluateRolloutEligibility.js';