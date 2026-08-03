// Uni Engine — Capability Activation Readiness (Parte 4, Bloco 1).
//
// Camada estritamente observacional que determina, a partir das decisões de
// Activation JÁ produzidas, quais capabilities poderiam ser ativadas no
// futuro — sem nunca ativar nada. Consome o Observation Snapshot da Parte 2
// e o Decision Readiness da Parte 3; nunca executa capability, nunca altera
// a resposta e nunca persiste.
export {
  CAPABILITY_READINESS_VERSION,
  CAPABILITY_READINESS_MODES,
  CAPABILITY_STATUSES,
  CAPABILITY_BLOCK_REASONS,
  FORBIDDEN_CAPABILITIES,
  CAPABILITY_READINESS_DIAGNOSTIC_CODES,
  isCapabilityReadinessMode,
  isCapabilityStatus,
  isCapabilityBlockReason,
  isForbiddenCapability,
  isActivationCandidate,
} from './capabilityReadinessTypes.js';
export {
  CAPABILITY_READINESS_POLICY,
  CAPABILITY_DEPENDENCIES,
  clamp01,
  getCapabilityDependencies,
  capabilityPriorityIndex,
  selectNextRecommendedCapability,
  getKnownCapabilities,
} from './capabilityReadinessPolicy.js';
export {
  deepFreeze,
  createEmptyCapabilityReadinessSnapshot,
  createCapabilityReadinessSnapshot,
  validateCapabilityReadinessSnapshot,
  isCapabilityReadinessSnapshotSerializable,
} from './capabilityReadinessContracts.js';
export {
  buildCapabilityReadinessDiagnostics,
  createCapabilityReadinessDiagnostic,
} from './buildCapabilityReadinessDiagnostics.js';
export { buildCapabilityReadinessSnapshot } from './buildCapabilityReadinessSnapshot.js';
