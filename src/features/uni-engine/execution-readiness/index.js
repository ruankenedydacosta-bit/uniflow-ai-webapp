// Uni Engine — Execution Readiness (Parte 4, Bloco 2).
//
// Camada estritamente observacional que avalia se uma FUTURA execução seria
// segura — sem nunca executar nada. Consome o Observation Snapshot (Parte 2),
// o Decision Readiness (Parte 3) e o Capability Readiness (Parte 4, Bloco 1).
export {
  EXECUTION_READINESS_VERSION,
  EXECUTION_READINESS_MODES,
  EXECUTION_CAPABILITY,
  EXECUTION_BLOCK_REASONS,
  EXECUTION_RISKS,
  EXECUTION_RECOMMENDATIONS,
  EXECUTION_READINESS_DIAGNOSTIC_CODES,
  isExecutionReadinessMode,
  isExecutionBlockReason,
  isExecutionRisk,
  isExecutionRecommendation,
  isExecutionCapabilityAllowed,
} from './executionReadinessTypes.js';
export {
  EXECUTION_READINESS_POLICY,
  EXECUTION_REQUIRED_CAPABILITIES,
  clamp01,
  getRequiredCapabilities,
  riskIndex,
  deriveExecutionRecommendation,
} from './executionReadinessPolicy.js';
export {
  deepFreeze,
  createEmptyExecutionReadinessSnapshot,
  createExecutionReadinessSnapshot,
  validateExecutionReadinessSnapshot,
  isExecutionReadinessSnapshotSerializable,
} from './executionReadinessContracts.js';
export {
  buildExecutionReadinessDiagnostics,
  createExecutionReadinessDiagnostic,
} from './buildExecutionReadinessDiagnostics.js';
export { buildExecutionReadinessSnapshot } from './buildExecutionReadinessSnapshot.js';
