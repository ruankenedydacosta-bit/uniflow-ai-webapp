export const TELEMETRY_FOUNDATION_VERSION = '1.0.0';

export const TELEMETRY_KINDS = Object.freeze({
  EVENT: 'event',
  ERROR: 'error',
  METRIC: 'metric',
});

export const TELEMETRY_EVENT_NAMES = Object.freeze([
  'activation.evaluated',
  'auth.lifecycle',
  'edge_function.lifecycle',
  'financial_runtime.evaluated',
  'planning.completed',
  'tts.lifecycle',
  'tts.playback_lifecycle',
  'tool_calling.evaluated',
  'uni_engine.shadow_module_evaluated',
  'uni_engine.shadow_started',
  'uni_engine.shadow_validation',
  'uni_engine.shadow_completed',
  'voice.lifecycle',
]);

export const TELEMETRY_ERROR_NAMES = Object.freeze([
  'auth.failure',
  'bootstrap.failure',
  'edge_function.failure',
  'financial_runtime.failure',
  'supabase.failure',
  'telemetry.adapter_failure',
  'uni_engine.failure',
  'uni_orchestration.failure',
  'tts.failure',
  'voice.failure',
]);

export const TELEMETRY_METRIC_NAMES = Object.freeze([
  'auth.latency_ms',
  'bootstrap.latency_ms',
  'edge_function.latency_ms',
  'financial_runtime.latency_ms',
  'uni_engine.latency_ms',
  'voice.latency_ms',
]);

export const TELEMETRY_IDENTITY_SCOPES = Object.freeze([
  'user',
  'workspace',
  'conversation',
  'message',
  'turn',
  'request',
]);

export const TELEMETRY_ALLOWED_DATA_FIELDS = Object.freeze({
  [TELEMETRY_KINDS.EVENT]: Object.freeze([
    'status',
    'source',
    'provider',
    'capability',
    'intent',
    'decision',
    'reasonCode',
    'errorCode',
    'stage',
    'format',
    'enabled',
    'shadowMode',
    'executionAllowed',
    'writes',
    'fallbackUsed',
    'deduplicated',
    'recoverable',
    'count',
    'stepCount',
    'dependencyCount',
    'durationMs',
    'latencyMs',
    'confidenceBand',
    'riskBand',
    'event',
    'runtimeBuildId',
    'cacheHit',
  ]),
  [TELEMETRY_KINDS.ERROR]: Object.freeze([
    'errorCode',
    'stage',
    'source',
    'provider',
    'recoverable',
    'fallbackUsed',
  ]),
  [TELEMETRY_KINDS.METRIC]: Object.freeze([
    'value',
    'unit',
    'source',
    'status',
  ]),
});

export function isTelemetryKind(value) {
  return Object.values(TELEMETRY_KINDS).includes(value);
}

export function isTelemetryNameAllowed(kind, name) {
  if (kind === TELEMETRY_KINDS.EVENT) return TELEMETRY_EVENT_NAMES.includes(name);
  if (kind === TELEMETRY_KINDS.ERROR) return TELEMETRY_ERROR_NAMES.includes(name);
  if (kind === TELEMETRY_KINDS.METRIC) return TELEMETRY_METRIC_NAMES.includes(name);
  return false;
}

export function deepFreezeTelemetry(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreezeTelemetry(child);
  return Object.freeze(value);
}
