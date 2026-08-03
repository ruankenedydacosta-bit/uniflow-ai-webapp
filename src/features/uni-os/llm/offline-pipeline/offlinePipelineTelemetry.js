export const OFFLINE_PIPELINE_MODULE_ORDER = Object.freeze([
  'MODEL_ROUTER',
  'CONVERSATION_WINDOW',
  'TOKEN_BUDGET',
  'PROMPT_BUILDER',
  'PROMPT_VALIDATOR',
  'LLM_ADAPTER_MOCK',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function createOfflinePipelineTelemetry({
  startedAt = 0,
  finishedAt = 0,
  executedModules = [],
  validationStatus = 'UNKNOWN',
  mockExecuted = false,
} = {}) {
  const duration = Number.isFinite(startedAt) && Number.isFinite(finishedAt)
    ? Math.max(0, finishedAt - startedAt)
    : 0;
  return deepFreeze({
    executionTimeMs: Number(duration.toFixed(3)),
    executedModules: Array.isArray(executedModules) ? [...executedModules] : [],
    modulesExecuted: Array.isArray(executedModules) ? executedModules.length : 0,
    validationStatus,
    mockExecuted: mockExecuted === true,
  });
}

export function logOfflinePipelineStarted(logger) {
  logger.info?.('[UNI OS] Offline Pipeline Started', { shadowMode: true });
}

export function logOfflinePipelineFinished(logger, telemetry) {
  logger.info?.('[UNI OS] Offline Pipeline Finished', {
    executionTimeMs: telemetry.executionTimeMs,
    executedModules: telemetry.executedModules,
    validationStatus: telemetry.validationStatus,
    mockExecuted: telemetry.mockExecuted,
  });
}
