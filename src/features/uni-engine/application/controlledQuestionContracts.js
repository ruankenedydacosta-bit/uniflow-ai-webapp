// Uni Engine — Controlled Question (Parte 6, Bloco Único): contratos.
//
// Resultado serializável e congelado da pergunta controlada. Campos fechados;
// qualquer campo fora da allowlist é descartado. O texto final vem SEMPRE de
// um template permitido (finalQuestion), nunca é montado livremente, e
// originalLegacyText identifica o turno (mesmo turno exigido).
import {
  CONTROLLED_QUESTION_VERSION,
  CONTROLLED_QUESTION_SAFETY_KEYS,
  CONTROLLED_QUESTION_CAPABILITIES,
  isControlledQuestionDecisionType,
  isControlledQuestionTemplateKey,
  isControlledQuestionReason,
  normalizeControlledQuestionReason,
} from './controlledQuestionTypes.js';

export const CONTROLLED_QUESTION_FIELDS = Object.freeze([
  'version',
  'enabled',
  'applied',
  'capability',
  'decisionType',
  'requestedField',
  'templateKey',
  'finalQuestion',
  'originalLegacyText',
  'fallbackUsed',
  'fallbackReason',
  'sameTurn',
  'pendingActionPreserved',
  'confirmationPreserved',
  'diagnostics',
  'safety',
  'latencyMs',
]);

export const CONTROLLED_QUESTION_DIAGNOSTICS_KEYS = Object.freeze([
  'code',
  'severity',
  'module',
  'capability',
  'reason',
  'source',
  'recoverable',
  'fallbackRecommended',
  'shadowOnly',
  'metadata',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isSerializableValue(value, seen = new Set()) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return value.every((item) => isSerializableValue(item, seen));
  }
  if (isPlainObject(value)) {
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.keys(value).every((key) => isSerializableValue(value[key], seen));
  }
  return false;
}

// Safety fechada: todos os campos presentes e false. Ausente, parcial ou com
// qualquer true → resultado rejeitado (a camada nunca pode alegar efeito).
export function createControlledQuestionSafety(overrides = {}) {
  const safe = isPlainObject(overrides) ? overrides : {};
  const safety = {};
  for (const key of CONTROLLED_QUESTION_SAFETY_KEYS) {
    safety[key] = safe[key] === true ? true : false;
  }
  return Object.freeze(safety);
}

export function isControlledQuestionSafetyIntegral(safety) {
  if (!isPlainObject(safety)) return false;
  for (const key of CONTROLLED_QUESTION_SAFETY_KEYS) {
    if (!Object.hasOwn(safety, key)) return false;
    if (safety[key] !== false) return false;
  }
  return true;
}

export function sanitizeControlledQuestionDiagnostics(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (!isPlainObject(item)) continue;
    const code = typeof item.code === 'string' ? item.code : 'UNKNOWN';
    if (seen.has(code)) continue;
    seen.add(code);
    const diagnostic = {};
    for (const key of CONTROLLED_QUESTION_DIAGNOSTICS_KEYS) {
      const value = item[key];
      if (key === 'metadata') {
        diagnostic.metadata = isPlainObject(value) ? Object.freeze({ ...value }) : Object.freeze({});
      } else if (typeof value === 'string') {
        diagnostic[key] = value;
      } else if (key === 'recoverable' || key === 'fallbackRecommended' || key === 'shadowOnly') {
        diagnostic[key] = value === true;
      } else {
        diagnostic[key] = null;
      }
    }
    result.push(Object.freeze(diagnostic));
  }
  return Object.freeze(result);
}

export function createControlledQuestionDiagnostic({ code, reason, capability = null, metadata = null } = {}) {
  return Object.freeze({
    code: typeof code === 'string' ? code : 'UNKNOWN',
    severity: 'INFO',
    module: 'application',
    capability: typeof capability === 'string' ? capability : null,
    reason: typeof reason === 'string' ? reason : null,
    source: 'controlledQuestion',
    recoverable: true,
    fallbackRecommended: false,
    shadowOnly: false,
    metadata: isPlainObject(metadata) ? Object.freeze({ ...metadata }) : Object.freeze({}),
  });
}

export function createControlledQuestionResult(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const capability = CONTROLLED_QUESTION_CAPABILITIES.includes(safe.capability)
    ? safe.capability
    : null;
  const decisionType = isControlledQuestionDecisionType(safe.decisionType)
    ? safe.decisionType
    : null;
  const templateKey = isControlledQuestionTemplateKey(safe.templateKey)
    ? safe.templateKey
    : null;
  const finalQuestion = typeof safe.finalQuestion === 'string' ? safe.finalQuestion : null;
  const originalLegacyText = typeof safe.originalLegacyText === 'string'
    ? safe.originalLegacyText
    : '';
  const applied = safe.applied === true;
  const fallbackUsed = safe.fallbackUsed === true;
  const diagnostics = sanitizeControlledQuestionDiagnostics(safe.diagnostics);
  const safety = createControlledQuestionSafety(safe.safety);

  const result = {
    version: CONTROLLED_QUESTION_VERSION,
    enabled: safe.enabled === true,
    applied,
    capability,
    decisionType,
    requestedField: typeof safe.requestedField === 'string' ? safe.requestedField : null,
    templateKey,
    finalQuestion,
    originalLegacyText,
    fallbackUsed,
    fallbackReason: normalizeControlledQuestionReason(safe.fallbackReason),
    sameTurn: safe.sameTurn === true,
    pendingActionPreserved: safe.pendingActionPreserved === true,
    confirmationPreserved: safe.confirmationPreserved === true,
    diagnostics,
    safety,
    latencyMs: typeof safe.latencyMs === 'number' && Number.isFinite(safe.latencyMs)
      ? Number(safe.latencyMs.toFixed(2))
      : 0,
  };
  return Object.freeze(result);
}

// Necessário para evitar dependência circular com controlledQuestionTypes.
export function isControlledQuestionResultSerializable(result) {
  if (!isPlainObject(result)) return false;
  return isSerializableValue(result);
}

export function validateControlledQuestionResult(result) {
  if (!isPlainObject(result)) return { valid: false, errors: ['NOT_OBJECT'] };
  const errors = [];
  if (typeof result.version !== 'string') errors.push('VERSION_INVALID');
  if (typeof result.enabled !== 'boolean') errors.push('ENABLED_INVALID');
  if (typeof result.applied !== 'boolean') errors.push('APPLIED_INVALID');
  if (result.capability !== null && !isControlledQuestionCapabilitySafe(result.capability)) {
    errors.push('CAPABILITY_INVALID');
  }
  if (result.decisionType !== null && !isControlledQuestionDecisionType(result.decisionType)) {
    errors.push('DECISION_TYPE_INVALID');
  }
  if (result.templateKey !== null && !isControlledQuestionTemplateKey(result.templateKey)) {
    errors.push('TEMPLATE_KEY_INVALID');
  }
  if (result.finalQuestion !== null && typeof result.finalQuestion !== 'string') {
    errors.push('FINAL_QUESTION_INVALID');
  }
  if (typeof result.originalLegacyText !== 'string') errors.push('ORIGINAL_LEGACY_TEXT_INVALID');
  if (typeof result.fallbackUsed !== 'boolean') errors.push('FALLBACK_USED_INVALID');
  if (!isControlledQuestionReason(result.fallbackReason)) errors.push('FALLBACK_REASON_INVALID');
  if (typeof result.sameTurn !== 'boolean') errors.push('SAME_TURN_INVALID');
  if (typeof result.pendingActionPreserved !== 'boolean') {
    errors.push('PENDING_ACTION_PRESERVED_INVALID');
  }
  if (typeof result.confirmationPreserved !== 'boolean') {
    errors.push('CONFIRMATION_PRESERVED_INVALID');
  }
  if (!Array.isArray(result.diagnostics)) errors.push('DIAGNOSTICS_NOT_ARRAY');
  if (!isControlledQuestionSafetyIntegral(result.safety)) {
    errors.push('SAFETY_NOT_INTEGRAL');
  }
  if (typeof result.latencyMs !== 'number' || !Number.isFinite(result.latencyMs)) {
    errors.push('LATENCY_INVALID');
  }
  if (!isControlledQuestionResultSerializable(result)) {
    errors.push('NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}

function isControlledQuestionCapabilitySafe(capability) {
  return CONTROLLED_QUESTION_CAPABILITIES.includes(capability);
}
