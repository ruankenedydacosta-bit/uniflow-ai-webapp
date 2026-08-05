// Uni Engine — Fase 18: Telemetria Sanitizada.
// Telemetria sanitizada e em memória para o runtime financeiro visível.
// Corresponde ao padrão de telemetria técnica do Uni Engine, sem persistência externa,
// com redações seguras e buffer limitado.

// Versão da telemetria (Fase 18)
export const FINANCIAL_RUNTIME_TELEMETRY_VERSION = '18.0';

// Campos permitidos para telemetria (evitar vazamento de dados sensíveis)
export const FINANCIAL_RUNTIME_TELEMETRY_ALLOWED_FIELDS = Object.freeze([
  // Identificação técnica
  'turnId', 'messageId', 'correlationId', 'timestamp', 'environment',
  // Análise de intenção e temporal
  'intent', 'temporalEntity', 'hasData', 'temporalResolved',
  // Resultados do runtime
  'confidence', 'narrativeType', 'executionStatus', 'comparisonType',
  // Métricas de verificação
  'eligibilityCheck', 'factualValidationScore', 'responseSelected',
  // Diagnósticos e saúde
  'hasData', 'pipelineStage', 'validationErrors', 'rejectionReasons',
  // Canary e feature flags
  'canaryEligible', 'canaryDecision', 'featureFlagEnabled',
  // Metadados
  'durationMs', 'version', 'telemetryVersion',
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreeze));
  }
  const frozen = {};
  for (const key of Object.keys(value).sort()) {
    frozen[key] = deepFreeze(value[key]);
  }
  return Object.freeze(frozen);
}

function isString(value) { return typeof value === 'string'; }
function isNumber(value) { return typeof value === 'number' && Number.isFinite(value); }
function isBoolean(value) { return typeof value === 'boolean'; }
function isObject(value) { return value && typeof value === 'object' && !Array.isArray(value); }

export function buildFinancialRuntimeTelemetryEntry(payload = {}) {
  const safePayload = payload && typeof payload === 'object' ? payload : {};

  // Redigir quaisquer dados potencialmente sensíveis
  const redactedPayload = {
    turnId: isString(safePayload.turnId) ? safePayload.turnId : null,
    messageId: isString(safePayload.messageId) ? safePayload.messageId : null,
    correlationId: isString(safePayload.correlationId) ? safePayload.correlationId : null,
    timestamp: isNumber(safePayload.timestamp) ? safePayload.timestamp : Date.now(),
    environment: isString(safePayload.environment) ? safePayload.environment : 'unknown',
    intent: isString(safePayload.intent) ? safePayload.intent : null,
    temporalEntity: isString(safePayload.temporalEntity) ? safePayload.temporalEntity : null,
    hasData: isBoolean(safePayload.hasData) ? safePayload.hasData : false,
    temporalResolved: isBoolean(safePayload.temporalResolved) ? safePayload.temporalResolved : false,
    confidence: isNumber(safePayload.confidence) ? safePayload.confidence : 0,
    narrativeType: isString(safePayload.narrativeType) ? safePayload.narrativeType : null,
    executionStatus: isString(safePayload.executionStatus) ? safePayload.executionStatus : null,
    comparisonType: isString(safePayload.comparisonType) ? safePayload.comparisonType : null,
    eligibilityCheck: isObject(safePayload.eligibilityCheck) ? deepFreeze(safePayload.eligibilityCheck) : null,
    factualValidationScore: isNumber(safePayload.factualValidationScore) ? safePayload.factualValidationScore : 0,
    responseSelected: isString(safePayload.responseSelected) ? safePayload.responseSelected : null,
    pipelineStage: isString(safePayload.pipelineStage) ? safePayload.pipelineStage : null,
    validationErrors: Array.isArray(safePayload.validationErrors) ? safePayload.validationErrors : [],
    rejectionReasons: Array.isArray(safePayload.rejectionReasons) ? safePayload.rejectionReasons : [],
    canaryEligible: isBoolean(safePayload.canaryEligible) ? safePayload.canaryEligible : false,
    canaryDecision: isString(safePayload.canaryDecision) ? safePayload.canaryDecision : null,
    featureFlagEnabled: isBoolean(safePayload.featureFlagEnabled) ? safePayload.featureFlagEnabled : false,
    durationMs: isNumber(safePayload.durationMs) ? safePayload.durationMs : 0,
    version: isString(safePayload.version) ? safePayload.version : '18.0',
    telemetryVersion: isString(safePayload.telemetryVersion) ? safePayload.telemetryVersion : FINANCIAL_RUNTIME_TELEMETRY_VERSION,
  };

  return deepFreeze(redactedPayload);
}

export function createFinancialRuntimeTelemetryStore() {
  const store = [];

  function recordEntry(payload = {}) {
    const entry = buildFinancialRuntimeTelemetryEntry(payload);
    store.push(entry);

    // Buffer limitado: manter apenas as últimas 100 entradas
    if (store.length > 100) {
      store.splice(0, store.length - 100);
    }
  }

  function getSnapshot() {
    return [...store];
  }

  function reset() {
    store.splice(0, store.length);
  }

  return {
    recordEntry,
    getSnapshot,
    reset,
  };
}

export function redactSensitiveValue(value) {
  if (!value || typeof value !== 'object') return value;
  const redacted = { ...value };

  // Redigir quaisquer dados potencialmente sensíveis
  const sensitiveKeys = ['token', 'key', 'secret', 'password', 'authorization', 'credit_card', 'cvv', 'ssn', 'social_security'];
  for (const key of Object.keys(redacted)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some(s => lowerKey.includes(s))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof redacted[key] === 'object') {
      redacted[key] = redactSensitiveValue(redacted[key]);
    }
  }

  return redacted;
}
