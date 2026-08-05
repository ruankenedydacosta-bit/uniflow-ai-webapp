// Uni Engine — Fase 19: Rollout Control — telemetria técnica sanitizada em memória com ring buffer limitado.

const MAX_RING_BUFFER_SIZE = 100;
const MAX_PRODUCTION_RING_BUFFER_SIZE = 32;

let telemetryStore = {
  ringBuffer: [],
  isProduction: false,
};

function getCurrentSize() {
  return telemetryStore.ringBuffer.length;
}

function getMaxSize() {
  return telemetryStore.isProduction ? MAX_PRODUCTION_RING_BUFFER_SIZE : MAX_RING_BUFFER_SIZE;
}

function createTelemetryEntry(identity, decision, config, durationMs, environment = 'development') {
  const timestamp = Date.now();
  const entry = {
    timestamp,
    relativeTimestamp: timestamp - (telemetryStore.ringBuffer[telemetryStore.ringBuffer.length - 1]?.timestamp || timestamp),
    turnId: identity?.turnId || null,
    messageId: identity?.messageId || null,
    workspaceId: identity?.workspaceId || null,
    cohort: decision.cohort || 'control',
    selectedSource: decision.selectedSource,
    influenceApplied: decision.influenceApplied,
    fallbackUsed: decision.fallbackUsed,
    rolloutEligible: decision.rolloutEligible,
    canaryAssigned: decision.canaryAssigned,
    confidence: decision.confidence,
    reasonCodes: decision.reasonCodes || [],
    rolloutEnabled: config.enabled,
    visibleEnabled: config.visibleEnabled,
    productionEnabled: config.productionEnabled,
    canaryEnabled: config.canaryEnabled,
    emergencyRollback: config.emergencyRollback,
    environment,
    telemetryEnabled: config.telemetryEnabled,
    executionTimeMs: durationMs,
  };
  return entry;
}

function addToRingBuffer(entry) {
  const currentSize = getCurrentSize();
  const maxSize = getMaxSize();
  if (currentSize >= maxSize) {
    telemetryStore.ringBuffer.shift();
  }
  telemetryStore.ringBuffer.push(entry);
}

function isTelemetryEnabled(config) {
  return Boolean(config?.telemetryEnabled);
}

export function recordFinancialRolloutTelemetry(identity, decision, config, durationMs, environment = 'development') {
  if (!isTelemetryEnabled(config)) return;
  const entry = createTelemetryEntry(identity, decision, config, durationMs, environment);
  addToRingBuffer(entry);
}

export function getFinancialRolloutTelemetrySnapshot() {
  return [...telemetryStore.ringBuffer];
}

export function resetFinancialRolloutTelemetry() {
  telemetryStore = {
    ringBuffer: [],
    isProduction: false,
  };
}

export function enableProductionTelemetry() {
  telemetryStore.isProduction = true;
}

export function validateFinancialRolloutTelemetryEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    return { valid: false, errors: ['TELEMETRY_ENTRY_INVALID'] };
  }
  const errors = [];
  if (typeof entry.timestamp !== 'number' || !Number.isFinite(entry.timestamp)) {
    errors.push('TIMESTAMP_INVALID');
  }
  if (typeof entry.relativeTimestamp !== 'number' || !Number.isFinite(entry.relativeTimestamp)) {
    errors.push('RELATIVE_TIMESTAMP_INVALID');
  }
  if (entry.turnId !== undefined && typeof entry.turnId !== 'string') errors.push('TURN_ID_INVALID');
  if (entry.messageId !== undefined && typeof entry.messageId !== 'string') errors.push('MESSAGE_ID_INVALID');
  if (entry.workspaceId !== undefined && typeof entry.workspaceId !== 'string') errors.push('WORKSPACE_ID_INVALID');
  if (!['control', 'canary', 'shadow'].includes(entry.cohort)) errors.push('COHORT_INVALID');
  if (!['legacy', 'financial_runtime'].includes(entry.selectedSource)) errors.push('SELECTED_SOURCE_INVALID');
  if (typeof entry.influenceApplied !== 'boolean') errors.push('INFLUENCE_APPLIED_INVALID');
  if (typeof entry.fallbackUsed !== 'boolean') errors.push('FALLBACK_USED_INVALID');
  if (typeof entry.rolloutEligible !== 'boolean') errors.push('ROLLOUT_ELIGIBLE_INVALID');
  if (typeof entry.canaryAssigned !== 'boolean') errors.push('CANARY_ASSIGNED_INVALID');
  if (typeof entry.confidence !== 'number' || !Number.isFinite(entry.confidence)) {
    errors.push('CONFIDENCE_INVALID');
  }
  if (entry.confidence < 0 || entry.confidence > 1) errors.push('CONFIDENCE_OUT_OF_RANGE');
  if (!Array.isArray(entry.reasonCodes)) errors.push('REASON_CODES_INVALID');
  if (typeof entry.environment !== 'string') errors.push('ENVIRONMENT_INVALID');
  if (typeof entry.executionTimeMs !== 'number' || !Number.isFinite(entry.executionTimeMs)) {
    errors.push('EXECUTION_TIME_INVALID');
  }
  return { valid: errors.length === 0, errors };
}

export function calculateComparisonMetrics(controlEntries, canaryEntries) {
  const metrics = {
    control: {
      total: controlEntries.length,
      selectedRuntime: 0,
      selectedLegacy: 0,
      averageConfidence: 0,
      averageExecutionTime: 0,
    },
    canary: {
      total: canaryEntries.length,
      selectedRuntime: 0,
      selectedLegacy: 0,
      averageConfidence: 0,
      averageExecutionTime: 0,
    },
    divergenceCount: 0,
    agreementPercentage: 0,
    blockedBy: {},
  };

  const processEntries = (entries, bucket) => {
    if (entries.length === 0) return null;
    const runtimeCount = entries.filter(e => e.selectedSource === 'financial_runtime').length;
    const legacyCount = entries.filter(e => e.selectedSource === 'legacy').length;
    const avgConfidence = entries.reduce((sum, e) => sum + e.confidence, 0) / entries.length;
    const avgExecutionTime = entries.reduce((sum, e) => sum + e.executionTimeMs, 0) / entries.length;
    return { runtimeCount, legacyCount, avgConfidence, avgExecutionTime };
  };

  const controlMetrics = processEntries(controlEntries, 'control') || { runtimeCount: 0, legacyCount: 0, avgConfidence: 0, avgExecutionTime: 0 };
  const canaryMetrics = processEntries(canaryEntries, 'canary') || { runtimeCount: 0, legacyCount: 0, avgConfidence: 0, avgExecutionTime: 0 };

  metrics.control.selectedRuntime = controlMetrics.runtimeCount;
  metrics.control.selectedLegacy = controlMetrics.legacyCount;
  metrics.control.averageConfidence = controlMetrics.avgConfidence;
  metrics.control.averageExecutionTime = controlMetrics.avgExecutionTime;

  metrics.canary.selectedRuntime = canaryMetrics.runtimeCount;
  metrics.canary.selectedLegacy = canaryMetrics.legacyCount;
  metrics.canary.averageConfidence = canaryMetrics.avgConfidence;
  metrics.canary.averageExecutionTime = canaryMetrics.avgExecutionTime;

  const totalRuntime = metrics.control.selectedRuntime + metrics.canary.selectedRuntime;
  const totalSelected = metrics.control.selectedLegacy + metrics.canary.selectedLegacy;
  metrics.divergenceCount = totalRuntime;
  metrics.agreementPercentage = totalSelected > 0 ? (totalRuntime / (totalRuntime + totalSelected)) * 100 : 0;

  for (const entry of [...controlEntries, ...canaryEntries]) {
    if (entry?.reasonCodes && Array.isArray(entry.reasonCodes)) {
      for (const code of entry.reasonCodes) {
        metrics.blockedBy[code] = (metrics.blockedBy[code] || 0) + 1;
      }
    }
  }

  return metrics;
}

// A comparação control x canary agregada (buildFinancialRolloutComparison)
// é canônica em ../comparison/financialRolloutComparison.js -- este módulo é
// responsável somente por telemetria (armazenamento em memória e agregação
// bruta via calculateComparisonMetrics acima), não pela montagem final do
// relatório de comparação.
