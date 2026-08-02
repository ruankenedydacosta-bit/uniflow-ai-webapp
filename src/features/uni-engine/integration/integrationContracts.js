// Integration — contratos puros (Parte 1: integração segura e controlada).
//
// Resultado serializável da integração. Garantias:
//   - nenhuma função, nenhum cliente externo, nenhuma referência circular;
//   - legacyPreserved = true por padrão (o pipeline legado continua a fonte
//     final da resposta e da execução);
//   - execução financeira NUNCA é propriedade desta camada;
//   - nenhum dado sensível na telemetria.
import { isSerializableValue } from '../uniEngineContracts.js';
import {
  INTEGRATION_VERSION,
  isAuthorizedIntegrationCapability,
  isIntegrationFallbackReason,
  isIntegrationQuestionKey,
  isIntegrationClarificationKey,
  isIntegrationStyleKey,
  isIntegrationLengthBand,
  isIntegrationStatus,
  isIntegrationResponseType,
  normalizeIntegrationStatus,
  normalizeIntegrationFallbackReason,
} from './integrationTypes.js';
import {
  isSafeIntegrationDiagnostic,
  normalizeIntegrationDiagnostic,
} from './buildIntegrationDiagnostics.js';
import { INTEGRATION_POLICY } from './integrationPolicy.js';

export function createEmptyIntegrationResult(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  return {
    version: INTEGRATION_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: safe.shadowMode !== false,
    status: normalizeIntegrationStatus(safe.status ?? 'disabled'),
    applied: false,
    capabilitiesRequested: [],
    capabilitiesApplied: [],
    legacyPreserved: true,
    legacyResult: sanitizeLegacyResult(safe.legacyResult),
    finalText: typeof safe.finalText === 'string' ? safe.finalText : null,
    questionGuidance: null,
    clarificationGuidance: null,
    styleGuidance: null,
    lengthGuidance: null,
    metadata: {},
    diagnostics: [],
    fallbackUsed: true,
    fallbackReason: normalizeIntegrationFallbackReason(safe.fallbackReason),
    shadowComparison: null,
    telemetry: null,
    latencyMs: typeof safe.latencyMs === 'number' && safe.latencyMs >= 0 ? safe.latencyMs : null,
    safety: createIntegrationSafety({}),
  };
}

export function createIntegrationResult(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const requested = sanitizeCapabilityList(safe.capabilitiesRequested);
  const applied = sanitizeCapabilityList(safe.capabilitiesApplied);
  const diagnostics = sanitizeDiagnostics(safe.diagnostics);
  const metadata = sanitizeMetadata(safe.metadata);
  const legacyResult = sanitizeLegacyResult(safe.legacyResult);
  const finalText = typeof safe.finalText === 'string' ? safe.finalText : null;
  const shadowComparison = isPlainObject(safe.shadowComparison)
    ? sanitizeShadowComparison(safe.shadowComparison)
    : null;
  const telemetry = isPlainObject(safe.telemetry) ? sanitizeTelemetry(safe.telemetry) : null;

  const result = {
    version: INTEGRATION_VERSION,
    enabled: Boolean(safe.enabled),
    shadowMode: safe.shadowMode !== false,
    status: normalizeIntegrationStatus(safe.status ?? 'disabled'),
    applied: Boolean(safe.applied && applied.length > 0),
    capabilitiesRequested: requested,
    capabilitiesApplied: applied,
    legacyPreserved: true,
    legacyResult,
    finalText,
    questionGuidance: safe.questionGuidance === null ? null : sanitizeGuidance(safe.questionGuidance),
    clarificationGuidance: safe.clarificationGuidance === null ? null : sanitizeGuidance(safe.clarificationGuidance),
    styleGuidance: safe.styleGuidance === null ? null : sanitizeGuidance(safe.styleGuidance),
    lengthGuidance: safe.lengthGuidance === null ? null : sanitizeGuidance(safe.lengthGuidance),
    metadata,
    diagnostics,
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: normalizeIntegrationFallbackReason(safe.fallbackReason),
    shadowComparison,
    telemetry,
    latencyMs:
      typeof safe.latencyMs === 'number' && safe.latencyMs >= 0
        ? Number(safe.latencyMs.toFixed(2))
        : null,
    safety: createIntegrationSafety(safe),
  };

  return result;
}

export function normalizeIntegrationResult(input) {
  if (!isPlainObject(input)) return createEmptyIntegrationResult({});
  return createIntegrationResult(input);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeGuidance(value) {
  if (!isPlainObject(value)) return null;
  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    if (item === undefined || item === null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    } else if (Array.isArray(item)) {
      sanitized[key] = item
        .filter((entry) => typeof entry === 'string')
        .slice(0, INTEGRATION_POLICY.maxFieldsStillMissing);
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeShadowComparison(value) {
  const result = {};
  for (const field of ['mode', 'divergenceCount', 'decisionCount']) {
    const item = value[field];
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      result[field] = item;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

function sanitizeTelemetry(value) {
  if (!isPlainObject(value)) return null;
  const sanitized = {};
  const allowedKeys = [
    'enabled',
    'shadowMode',
    'status',
    'applied',
    'capabilitiesRequested',
    'capabilitiesApplied',
    'responseType',
    'legacyPreserved',
    'fallbackUsed',
    'fallbackReason',
    'questionApplied',
    'clarificationApplied',
    'styleApplied',
    'lengthApplied',
    'styleKey',
    'lengthBand',
    'latencyMs',
  ];
  for (const key of allowedKeys) {
    const item = value[key];
    if (item === undefined || item === null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    } else if (Array.isArray(item)) {
      sanitized[key] = item
        .filter((entry) => typeof entry === 'string')
        .slice(0, INTEGRATION_POLICY.maxCapabilitiesPerRun);
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export function validateIntegrationResult(result) {
  if (!isPlainObject(result)) {
    return { valid: false, errors: ['RESULT_NOT_OBJECT'] };
  }
  const errors = [];
  if (typeof result.version !== 'string' || !result.version) {
    errors.push('VERSION_INVALID');
  }
  if (!isIntegrationStatus(result.status)) {
    errors.push('STATUS_INVALID');
  }
  if (result.legacyPreserved !== true) {
    errors.push('LEGACY_PRESERVED_FALSE');
  }
  if (result.fallbackUsed && !isIntegrationFallbackReason(result.fallbackReason)) {
    errors.push('FALLBACK_REASON_INVALID');
  }
  if (result.applied && result.capabilitiesApplied.length === 0) {
    errors.push('APPLIED_WITHOUT_CAPABILITIES');
  }
  if (!Array.isArray(result.capabilitiesRequested)) {
    errors.push('CAPABILITIES_REQUESTED_NOT_ARRAY');
  }
  if (!Array.isArray(result.capabilitiesApplied)) {
    errors.push('CAPABILITIES_APPLIED_NOT_ARRAY');
  }
  if (!Array.isArray(result.diagnostics)) {
    errors.push('DIAGNOSTICS_NOT_ARRAY');
  }
  if (result.questionGuidance !== null && result.questionGuidance.applied === true) {
    const key = result.questionGuidance.questionKey;
    if (key !== null && !isIntegrationQuestionKey(key)) {
      errors.push('QUESTION_KEY_INVALID');
    }
  }
  if (result.clarificationGuidance !== null && result.clarificationGuidance.applied === true) {
    const key = result.clarificationGuidance.clarificationKey;
    if (key !== null && !isIntegrationClarificationKey(key)) {
      errors.push('CLARIFICATION_KEY_INVALID');
    }
  }
  if (result.styleGuidance !== null && result.styleGuidance.applied === true) {
    const key = result.styleGuidance.styleKey;
    if (key !== null && !isIntegrationStyleKey(key)) {
      errors.push('STYLE_KEY_INVALID');
    }
  }
  if (result.lengthGuidance !== null && result.lengthGuidance.applied === true) {
    const band = result.lengthGuidance.lengthBand;
    if (band !== null && !isIntegrationLengthBand(band)) {
      errors.push('LENGTH_BAND_INVALID');
    }
  }
  if (result.finalText !== null && typeof result.finalText !== 'string') {
    errors.push('FINAL_TEXT_INVALID');
  }
  if (result.latencyMs !== null && (typeof result.latencyMs !== 'number' || !Number.isFinite(result.latencyMs) || result.latencyMs < 0)) {
    errors.push('LATENCY_INVALID');
  }
  if (!isSerializableIntegrationResult(result)) {
    errors.push('RESULT_NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}

export function assertIntegrationResponseType(value, fallback = 'generic') {
  return isIntegrationResponseType(value) ? value : fallback;
}

export function sanitizeIntegrationValue(value) {
  if (value === null || value === undefined) return null;
  const type = typeof value;
  if (type === 'string' || type === 'number' || type === 'boolean') return value;
  if (type === 'function' || type === 'symbol' || type === 'bigint') return null;
  if (Array.isArray(value)) {
    return value.map(sanitizeIntegrationValue).filter((v) => v !== null);
  }
  if (type === 'object') {
    if (value instanceof Map || value instanceof Set) return null;
    const sanitized = {};
    for (const [key, item] of Object.entries(value)) {
      const sanitizedItem = sanitizeIntegrationValue(item);
      if (sanitizedItem !== null) {
        sanitized[key] = sanitizedItem;
      }
    }
    return Object.keys(sanitized).length > 0 ? sanitized : null;
  }
  return null;
}

export function sanitizeCapabilityList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (typeof item === 'string' && isAuthorizedIntegrationCapability(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
      if (result.length >= INTEGRATION_POLICY.maxCapabilitiesPerRun) break;
    }
  }
  return result;
}

export function sanitizeDiagnostics(list) {
  if (!Array.isArray(list)) return [];
  const result = [];
  for (const item of list) {
    if (typeof item === 'string') {
      result.push(item);
    } else if (isSafeIntegrationDiagnostic(item)) {
      result.push(normalizeIntegrationDiagnostic(item));
    }
    if (result.length >= INTEGRATION_POLICY.maxDiagnostics) break;
  }
  return result;
}

export function sanitizeMetadata(value) {
  if (!isPlainObject(value)) return {};
  const sanitized = {};
  let count = 0;
  for (const [key, item] of Object.entries(value)) {
    if (count >= INTEGRATION_POLICY.maximumTelemetryItems) break;
    if (item === undefined || item === null) continue;
    const type = typeof item;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      sanitized[key] = item;
      count++;
    } else if (Array.isArray(item)) {
      sanitized[key] = item
        .filter((entry) => typeof entry === 'string')
        .slice(0, 5);
      count++;
    }
  }
  return sanitized;
}

export function sanitizeLegacyResult(value) {
  if (!isPlainObject(value)) return null;
  const allowedKeys = ['text', 'responseType', 'issueField', 'transactionType', 'conversationStyle', 'status', 'hasConfirmationCard', 'protectedType'];
  const sanitized = {};
  for (const key of allowedKeys) {
    const item = value[key];
    if (item === undefined || item === null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

export function createIntegrationSafety() {
  return {
    legacyPreserved: true,
    financialExecution: false,
    memoryWrite: false,
    learningApplied: false,
    responseContentReplaced: false,
    confirmationSkipped: false,
    pendingActionModified: false,
    ttsTriggered: false,
    databaseCalled: false,
  };
}

export function isSerializableIntegrationResult(value) {
  if (!isPlainObject(value)) return false;
  return isSerializableValue(value);
}