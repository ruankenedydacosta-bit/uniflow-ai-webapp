// Health Check da Uni Engine (Fase 10).
export {
  HEALTH_STATUSES,
  HEALTH_CHECK_SEVERITIES,
  isValidHealthStatus,
  isHealthFailure,
  resolveAggregateHealth,
} from './healthTypes.js';
export {
  HEALTH_CHECK_VERSION,
  createModuleHealth,
  createHealthCheck,
  validateHealthCheck,
  createEmptyHealthCheck,
} from './healthContracts.js';
export {
  runEngineHealthCheck,
  validateEngineHealthCheck,
} from './buildEngineHealth.js';
