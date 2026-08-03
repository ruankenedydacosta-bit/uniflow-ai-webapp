function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.values(value).forEach(deepFreeze);
  return Object.freeze(value);
}

export function createRuntimeTelemetry({
  startedAt = 0,
  finishedAt = 0,
  adaptersExecuted = [],
  validationErrors = [],
} = {}) {
  const duration = Number.isFinite(startedAt) && Number.isFinite(finishedAt)
    ? Math.max(0, finishedAt - startedAt)
    : 0;
  return deepFreeze({
    pipelineDurationMs: Number(duration.toFixed(3)),
    adaptersExecuted: Array.isArray(adaptersExecuted) ? [...adaptersExecuted] : [],
    validationErrors: Array.isArray(validationErrors) ? [...validationErrors] : [],
    shadowExecutions: 1,
  });
}

export function logPipelineStarted(logger) {
  logger.info?.('[UNI OS] Pipeline Started', { shadowMode: true });
}

export function logPipelineFinished(logger, telemetry, validationResult) {
  logger.info?.('[UNI OS] Pipeline Finished', {
    executionTimeMs: telemetry.pipelineDurationMs,
    executedAdapters: telemetry.adaptersExecuted,
    validationResult,
  });
}
