// Uni Engine — Application (Parte 5, Bloco 3: contratos puros).
//
// Resultado serializável da aplicação controlada. Garantias:
//   - nenhuma função, nenhum cliente externo, nenhuma referência circular;
//   - factualContentPreserved = true por padrão (o texto legado continua a
//     fonte final da resposta e da execução);
//   - execução financeira, escrita de memória, aprendizado e modificação de
//     Pending Actions NUNCA são propriedade desta camada;
//   - questionDecision (Bloco 2) contém APENAS a decisão observacional da
//     capacidade QUESTION_GUIDANCE: shouldAsk, questionPriority,
//     missingInformation, confidence, questionReason e diagnostics — nunca
//     texto de pergunta, nunca alteração da resposta;
//   - clarificationDecision (Bloco 3) contém APENAS a decisão observacional
//     da capacidade CLARIFICATION_GUIDANCE: shouldClarify,
//     clarificationPriority, ambiguousFields, clarificationReason, confidence
//     e diagnostics — nunca texto de pergunta, nunca alteração da resposta;
//   - nenhum dado sensível na telemetria; texto legado NUNCA sai no resultado
//     final (apenas o texto realmente aplicado, via aplicação controlada).
import { isSerializableValue } from '../uniEngineContracts.js';
import {
  APPLICATION_VERSION,
  isApplicationStatus,
  isApplicationFallbackReason,
  isApplicationCapability,
  isApplicationSafetyKey,
  normalizeApplicationStatus,
  normalizeApplicationFallbackReason,
  isQuestionPriority,
  isQuestionReason,
  normalizeQuestionPriority,
  normalizeQuestionReason,
  isClarificationPriority,
  isClarificationReason,
  normalizeClarificationPriority,
  normalizeClarificationReason,
} from './applicationTypes.js';
import {
  isSafeApplicationDiagnostic,
  normalizeApplicationDiagnostic,
} from './buildApplicationDiagnostics.js';
import { APPLICATION_POLICY } from './applicationPolicy.js';

export function createEmptyApplicationResult(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  return {
    version: APPLICATION_VERSION,
    enabled: Boolean(safe.enabled),
    applied: false,
    appliedCapabilities: [],
    blockedCapabilities: [],
    originalText: typeof safe.originalText === 'string' ? safe.originalText : null,
    finalText: typeof safe.finalText === 'string' ? safe.finalText : null,
    factualContentPreserved: true,
    styleApplied: false,
    lengthApplied: false,
    fallbackUsed: true,
    fallbackReason: normalizeApplicationFallbackReason(safe.fallbackReason),
    status: normalizeApplicationStatus(safe.status ?? 'fallback'),
    diagnostics: [],
    shadowComparison: null,
    safety: createApplicationSafety({}),
    questionDecision: null,
    clarificationDecision: null,
    latencyMs:
      typeof safe.latencyMs === 'number' && safe.latencyMs >= 0
        ? Number(safe.latencyMs.toFixed(2))
        : null,
  };
}

export function createApplicationResult(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const appliedCapabilities = sanitizeCapabilityList(safe.appliedCapabilities);
  const blockedCapabilities = sanitizeCapabilityList(safe.blockedCapabilities);
  const diagnostics = sanitizeDiagnostics(safe.diagnostics);
  const originalText = typeof safe.originalText === 'string' ? safe.originalText : null;
  const finalText = typeof safe.finalText === 'string' ? safe.finalText : null;
  const shadowComparison = isPlainObject(safe.shadowComparison)
    ? sanitizeShadowComparison(safe.shadowComparison)
    : null;
  const safety = createApplicationSafety(safe);
  const questionDecision = sanitizeQuestionDecision(safe.questionDecision);
  const clarificationDecision = sanitizeClarificationDecision(safe.clarificationDecision);

  const result = {
    version: APPLICATION_VERSION,
    enabled: Boolean(safe.enabled),
    applied: Boolean(
      safe.applied
      && (appliedCapabilities.length > 0
        || questionDecision !== null
        || clarificationDecision !== null),
    ),
    appliedCapabilities,
    blockedCapabilities,
    originalText,
    finalText,
    factualContentPreserved: safety.factualContentPreserved !== false,
    styleApplied: Boolean(safe.styleApplied && appliedCapabilities.includes('RESPONSE_STYLE_GUIDANCE')),
    lengthApplied: Boolean(safe.lengthApplied && appliedCapabilities.includes('RESPONSE_LENGTH_GUIDANCE')),
    fallbackUsed: Boolean(safe.fallbackUsed),
    fallbackReason: normalizeApplicationFallbackReason(safe.fallbackReason),
    status: normalizeApplicationStatus(safe.status),
    diagnostics,
    shadowComparison,
    safety,
    questionDecision,
    clarificationDecision,
    latencyMs:
      typeof safe.latencyMs === 'number' && safe.latencyMs >= 0
        ? Number(safe.latencyMs.toFixed(2))
        : null,
  };

  return result;
}

export function normalizeApplicationResult(input) {
  if (!isPlainObject(input)) return createEmptyApplicationResult({});
  return createApplicationResult(input);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeShadowComparison(value) {
  const result = {};
  for (const field of ['originalTextLength', 'finalTextLength', 'lengthDelta', 'divergenceCount']) {
    const item = value[field];
    if (typeof item === 'number' && Number.isFinite(item)) {
      result[field] = item;
    }
  }
  return Object.keys(result).length > 0 ? result : null;
}

export function validateApplicationResult(result) {
  if (!isPlainObject(result)) {
    return { valid: false, errors: ['RESULT_NOT_OBJECT'] };
  }
  const errors = [];
  if (typeof result.version !== 'string' || !result.version) {
    errors.push('VERSION_INVALID');
  }
  if (!isApplicationStatus(result.status)) {
    errors.push('STATUS_INVALID');
  }
  if (result.factualContentPreserved !== true) {
    errors.push('FACTUAL_CONTENT_NOT_PRESERVED');
  }
  if (result.fallbackUsed && !isApplicationFallbackReason(result.fallbackReason)) {
    errors.push('FALLBACK_REASON_INVALID');
  }
  if (result.applied && result.appliedCapabilities.length === 0 && result.questionDecision === null && result.clarificationDecision === null) {
    errors.push('APPLIED_WITHOUT_CAPABILITIES');
  }
  if (!Array.isArray(result.appliedCapabilities)) {
    errors.push('APPLIED_CAPABILITIES_NOT_ARRAY');
  }
  if (!Array.isArray(result.blockedCapabilities)) {
    errors.push('BLOCKED_CAPABILITIES_NOT_ARRAY');
  }
  if (!Array.isArray(result.diagnostics)) {
    errors.push('DIAGNOSTICS_NOT_ARRAY');
  }
  if (result.appliedCapabilities.some((c) => !isApplicationCapability(c))) {
    errors.push('CAPABILITY_INVALID');
  }
  if (result.styleApplied && !result.appliedCapabilities.includes('RESPONSE_STYLE_GUIDANCE')) {
    errors.push('STYLE_APPLIED_WITHOUT_CAPABILITY');
  }
  if (result.lengthApplied && !result.appliedCapabilities.includes('RESPONSE_LENGTH_GUIDANCE')) {
    errors.push('LENGTH_APPLIED_WITHOUT_CAPABILITY');
  }
  if (result.finalText !== null && typeof result.finalText !== 'string') {
    errors.push('FINAL_TEXT_INVALID');
  }
  if (result.originalText !== null && typeof result.originalText !== 'string') {
    errors.push('ORIGINAL_TEXT_INVALID');
  }
  if (result.safety && !isPlainObject(result.safety)) {
    errors.push('SAFETY_INVALID');
  }
  if (result.safety && Object.keys(result.safety).length === 0) {
    errors.push('SAFETY_EMPTY');
  }
  if (
    result.safety
    && Object.keys(result.safety).some((key) => !isApplicationSafetyKey(key))
  ) {
    errors.push('SAFETY_KEY_INVALID');
  }
  if (result.latencyMs !== null && (typeof result.latencyMs !== 'number' || !Number.isFinite(result.latencyMs) || result.latencyMs < 0)) {
    errors.push('LATENCY_INVALID');
  }
  const questionValidation = validateQuestionDecision(result.questionDecision);
  if (!questionValidation.valid) {
    errors.push(...questionValidation.errors);
  }
  const clarificationValidation = validateClarificationDecision(result.clarificationDecision);
  if (!clarificationValidation.valid) {
    errors.push(...clarificationValidation.errors);
  }
  if (!isSerializableApplicationResult(result)) {
    errors.push('RESULT_NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}

export function sanitizeCapabilityList(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (typeof item === 'string' && isApplicationCapability(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
      if (result.length >= APPLICATION_POLICY.maxAppliedCapabilities) break;
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
    } else if (isSafeApplicationDiagnostic(item)) {
      result.push(normalizeApplicationDiagnostic(item));
    }
    if (result.length >= APPLICATION_POLICY.maxDiagnostics) break;
  }
  return result;
}

// Decision de pergunta (QUESTION_GUIDANCE, Bloco 2). Objeto serializável,
// congelado, sem texto de pergunta, sem IDs, sem valores. Campos permitidos:
// shouldAsk, questionPriority, missingInformation, confidence, questionReason,
// diagnostics. Qualquer campo fora desta allowlist é descartado.
export const QUESTION_DECISION_FIELDS = Object.freeze([
  'shouldAsk',
  'questionPriority',
  'missingInformation',
  'confidence',
  'questionReason',
  'diagnostics',
]);

function sanitizeMissingInformation(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (typeof item === 'string' && item.trim() && !seen.has(item)) {
      seen.add(item);
      result.push(item.trim());
      if (result.length >= APPLICATION_POLICY.maxMissingInformation) break;
    }
  }
  return result;
}

export function sanitizeQuestionDecision(value) {
  if (!isPlainObject(value)) return null;
  const safe = value;
  const shouldAsk = safe.shouldAsk === true;
  const missingInformation = sanitizeMissingInformation(safe.missingInformation);
  const confidence =
    typeof safe.confidence === 'number' && Number.isFinite(safe.confidence)
      ? Number(Math.min(Math.max(safe.confidence, 0), 1).toFixed(2))
      : null;
  const diagnostics = Array.isArray(safe.diagnostics)
    ? safe.diagnostics
      .filter((item) => typeof item === 'string' && item.trim())
      .slice(0, APPLICATION_POLICY.maxQuestionDiagnostics)
    : [];
  return Object.freeze({
    shouldAsk,
    questionPriority: normalizeQuestionPriority(safe.questionPriority),
    missingInformation,
    confidence,
    questionReason: normalizeQuestionReason(safe.questionReason),
    diagnostics,
  });
}

export function createQuestionDecision(options = {}) {
  return sanitizeQuestionDecision(options);
}

export function isQuestionDecisionSerializable(value) {
  if (!isPlainObject(value)) return false;
  return isSerializableValue(value);
}

export function validateQuestionDecision(decision) {
  if (decision === null || decision === undefined) {
    return { valid: true, errors: [] };
  }
  if (!isPlainObject(decision)) {
    return { valid: false, errors: ['QUESTION_DECISION_NOT_OBJECT'] };
  }
  const errors = [];
  if (typeof decision.shouldAsk !== 'boolean') {
    errors.push('QUESTION_SHOULD_ASK_INVALID');
  }
  if (!isQuestionPriority(decision.questionPriority)) {
    errors.push('QUESTION_PRIORITY_INVALID');
  }
  if (!Array.isArray(decision.missingInformation)) {
    errors.push('QUESTION_MISSING_INFORMATION_NOT_ARRAY');
  }
  if (
    decision.missingInformation.some((item) => typeof item !== 'string')
  ) {
    errors.push('QUESTION_MISSING_INFORMATION_INVALID');
  }
  if (
    decision.confidence !== null
    && (typeof decision.confidence !== 'number' || !Number.isFinite(decision.confidence))
  ) {
    errors.push('QUESTION_CONFIDENCE_INVALID');
  }
  if (!isQuestionReason(decision.questionReason)) {
    errors.push('QUESTION_REASON_INVALID');
  }
  if (!Array.isArray(decision.diagnostics)) {
    errors.push('QUESTION_DIAGNOSTICS_NOT_ARRAY');
  }
  if (decision.diagnostics.some((item) => typeof item !== 'string')) {
    errors.push('QUESTION_DIAGNOSTICS_INVALID');
  }
  if (!isQuestionDecisionSerializable(decision)) {
    errors.push('QUESTION_DECISION_NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}

// Decisão de esclarecimento (CLARIFICATION_GUIDANCE, Bloco 3). Objeto
// serializável, congelado, sem texto de pergunta, sem IDs, sem valores.
// Campos permitidos: shouldClarify, clarificationPriority, ambiguousFields,
// clarificationReason, confidence, diagnostics. Qualquer campo fora desta
// allowlist é descartado. A Uni NUNCA gera texto de esclarecimento — apenas
// sinaliza que o pipeline legado pode precisar esclarecer.
export const CLARIFICATION_DECISION_FIELDS = Object.freeze([
  'shouldClarify',
  'clarificationPriority',
  'ambiguousFields',
  'clarificationReason',
  'confidence',
  'diagnostics',
]);

function sanitizeAmbiguousFields(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (typeof item === 'string' && item.trim() && !seen.has(item)) {
      seen.add(item);
      result.push(item.trim());
      if (result.length >= APPLICATION_POLICY.maxAmbiguousFields) break;
    }
  }
  return result;
}

export function sanitizeClarificationDecision(value) {
  if (!isPlainObject(value)) return null;
  const safe = value;
  const shouldClarify = safe.shouldClarify === true;
  const ambiguousFields = sanitizeAmbiguousFields(safe.ambiguousFields);
  const confidence =
    typeof safe.confidence === 'number' && Number.isFinite(safe.confidence)
      ? Number(Math.min(Math.max(safe.confidence, 0), 1).toFixed(2))
      : null;
  const diagnostics = Array.isArray(safe.diagnostics)
    ? safe.diagnostics
      .filter((item) => typeof item === 'string' && item.trim())
      .slice(0, APPLICATION_POLICY.maxClarificationDiagnostics)
    : [];
  return Object.freeze({
    shouldClarify,
    clarificationPriority: normalizeClarificationPriority(safe.clarificationPriority),
    ambiguousFields,
    clarificationReason: normalizeClarificationReason(safe.clarificationReason),
    confidence,
    diagnostics,
  });
}

export function createClarificationDecision(options = {}) {
  return sanitizeClarificationDecision(options);
}

export function isClarificationDecisionSerializable(value) {
  if (!isPlainObject(value)) return false;
  return isSerializableValue(value);
}

export function validateClarificationDecision(decision) {
  if (decision === null || decision === undefined) {
    return { valid: true, errors: [] };
  }
  if (!isPlainObject(decision)) {
    return { valid: false, errors: ['CLARIFICATION_DECISION_NOT_OBJECT'] };
  }
  const errors = [];
  if (typeof decision.shouldClarify !== 'boolean') {
    errors.push('CLARIFICATION_SHOULD_CLARIFY_INVALID');
  }
  if (!isClarificationPriority(decision.clarificationPriority)) {
    errors.push('CLARIFICATION_PRIORITY_INVALID');
  }
  if (!Array.isArray(decision.ambiguousFields)) {
    errors.push('CLARIFICATION_AMBIGUOUS_FIELDS_NOT_ARRAY');
  }
  if (
    decision.ambiguousFields.some((item) => typeof item !== 'string')
  ) {
    errors.push('CLARIFICATION_AMBIGUOUS_FIELDS_INVALID');
  }
  if (
    decision.confidence !== null
    && (typeof decision.confidence !== 'number' || !Number.isFinite(decision.confidence))
  ) {
    errors.push('CLARIFICATION_CONFIDENCE_INVALID');
  }
  if (!isClarificationReason(decision.clarificationReason)) {
    errors.push('CLARIFICATION_REASON_INVALID');
  }
  if (!Array.isArray(decision.diagnostics)) {
    errors.push('CLARIFICATION_DIAGNOSTICS_NOT_ARRAY');
  }
  if (decision.diagnostics.some((item) => typeof item !== 'string')) {
    errors.push('CLARIFICATION_DIAGNOSTICS_INVALID');
  }
  if (!isClarificationDecisionSerializable(decision)) {
    errors.push('CLARIFICATION_DECISION_NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}

export function createApplicationSafety(safe) {
  const input = safe && typeof safe === 'object' ? safe : {};
  return {
    factualContentPreserved: input.factualContentPreserved !== false,
    financialExecution: false,
    memoryWrite: false,
    learningApplied: false,
    confirmationSkipped: false,
    pendingActionModified: false,
    databaseCalled: false,
    ttsTriggeredByApplication: false,
  };
}

export function isSerializableApplicationResult(value) {
  if (!isPlainObject(value)) return false;
  return isSerializableValue(value);
}
