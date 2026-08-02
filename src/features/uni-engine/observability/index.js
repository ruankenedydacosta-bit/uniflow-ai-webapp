// Observability da Uni Engine (Fase 10).
export {
  OBSERVABILITY_SNAPSHOT_VERSION,
  OBSERVABILITY_MODULE_STATUSES,
  OBSERVABILITY_ALLOWED_FIELDS,
  isValidObservabilityModuleStatus,
  observabilityConfidenceBand,
  observabilityRiskBand,
} from './observabilityTypes.js';
export {
  createModuleObservability,
  createObservabilitySnapshot,
  validateObservabilitySnapshot,
  createEmptyObservabilitySnapshot,
  redactObservabilitySnapshot,
} from './observabilityContracts.js';
export {
  buildObservabilitySnapshot,
  summarizeObservability,
  validateObservabilitySnapshotOutput,
} from './buildObservabilitySnapshot.js';
export { UNI_ENGINE_MODULE_LATENCY_KEYS } from './latencySources.js';
