// Uni Engine — Application (Parte 5, Bloco 3: diagnóstico redigido).
//
// Diagnóstico para auditoria interna: apenas capacidades, bloqueios, status e
// agregados. Nunca texto completo, IDs, contas, categorias, valores ou
// memória. Nunca exibido ao usuário.
import { APPLICATION_POLICY } from './applicationPolicy.js';

const DIAGNOSTIC_CODES = Object.freeze([
  'APPLICATION_DISABLED',
  'ACTIVATION_DISABLED',
  'INTEGRATION_DISABLED',
  'CAPABILITY_NOT_ALLOWED',
  'CAPABILITY_BLOCKED',
  'CAPABILITY_NOT_ACTIVE',
  'ENVIRONMENT_BLOCKED',
  'USER_NOT_AUTHORIZED',
  'CIRCUIT_BREAKER_OPEN',
  'LOW_CONFIDENCE',
  'HIGH_RISK',
  'INVALID_LEGACY_TEXT',
  'INVALID_GUIDANCE',
  'CONTRACT_ERROR',
  'APPLY_ERROR',
  'STYLE_APPLIED',
  'LENGTH_APPLIED',
  'QUESTION_APPLIED',
  'QUESTION_SKIPPED',
  'QUESTION_ASKED',
  'QUESTION_NOT_ASKED',
  'CLARIFICATION_APPLIED',
  'CLARIFICATION_SKIPPED',
  'CLARIFICATION_NEEDED',
  'CLARIFICATION_NOT_NEEDED',
  'FALLBACK_USED',
  'UNKNOWN',
]);

const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR', 'CRITICAL']);

const SAFE_METADATA_KEYS = Object.freeze([
  'capability',
  'capabilities',
  'count',
  'requested',
  'active',
  'applied',
  'blocked',
  'fallbackReason',
  'status',
  'enabled',
  'styleKey',
  'lengthBand',
  'shouldAsk',
  'questionPriority',
  'missingInformationCount',
  'confidence',
  'questionReason',
  'shouldClarify',
  'clarificationPriority',
  'ambiguousFieldsCount',
  'clarificationReason',
]);

function isValidDiagnosticCode(code) {
  return DIAGNOSTIC_CODES.includes(code);
}

function isValidSeverity(severity) {
  return SEVERITIES.includes(severity);
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object') return {};
  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_METADATA_KEYS.includes(key)) continue;
    const type = typeof item;
    if (type === 'string' || type === 'number' || type === 'boolean') {
      sanitized[key] = item;
    } else if (Array.isArray(item)) {
      sanitized[key] = item
        .filter((entry) => typeof entry === 'string' || typeof entry === 'number')
        .slice(0, 5);
    }
  }
  return sanitized;
}

function deduplicateDiagnostics(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const key = `${item.code}:${item.capability ?? ''}:${item.reason ?? ''}:${item.severity}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function limitDiagnostics(list) {
  return list.slice(0, APPLICATION_POLICY.maxDiagnostics ?? 12);
}

function createDiagnostic(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const code = isValidDiagnosticCode(safe.code) ? safe.code : 'UNKNOWN';
  const severity = isValidSeverity(safe.severity) ? safe.severity : 'INFO';
  const module = typeof safe.module === 'string' ? safe.module : 'application';
  const capability = typeof safe.capability === 'string' ? safe.capability : null;
  const reason = typeof safe.reason === 'string' ? safe.reason : null;
  const source = typeof safe.source === 'string' ? safe.source : 'evaluation';
  const recoverable = safe.recoverable !== false;
  const fallbackRecommended = safe.fallbackRecommended === true;
  const shadowOnly = safe.shadowOnly === true;
  const metadata = sanitizeMetadata(safe.metadata);

  return Object.freeze({
    code,
    severity,
    module,
    capability,
    reason,
    source,
    recoverable,
    fallbackRecommended,
    shadowOnly,
    metadata,
  });
}

export function isSafeApplicationDiagnostic(value) {
  if (!value || typeof value !== 'object') return false;
  return (
    isValidDiagnosticCode(value.code) &&
    isValidSeverity(value.severity) &&
    (value.capability === null || typeof value.capability === 'string') &&
    (value.reason === null || typeof value.reason === 'string') &&
    typeof value.recoverable === 'boolean' &&
    typeof value.fallbackRecommended === 'boolean' &&
    typeof value.shadowOnly === 'boolean' &&
    value.metadata && typeof value.metadata === 'object'
  );
}

export function normalizeApplicationDiagnostic(input) {
  return createDiagnostic(input);
}

export function createApplicationDiagnostic(input) {
  return createDiagnostic(input);
}

export function buildApplicationDiagnostics({
  enabled = true,
  activationEnabled = true,
  integrationEnabled = true,
  environment = null,
  userAuthorized = true,
  circuitBreakerOpen = false,
  confidence = null,
  risk = null,
  fallbackUsed = false,
  fallbackReason = null,
  appliedCapabilities = [],
  blockedCapabilities = [],
  applyError = false,
  questionDecision = null,
  clarificationDecision = null,
} = {}) {
  try {
    const diagnostics = [];

    if (!enabled) {
      diagnostics.push(createDiagnostic({
        code: 'APPLICATION_DISABLED',
        severity: 'INFO',
        module: 'application',
        capability: null,
        reason: 'application_flag_false',
        source: 'config',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { enabled: false },
      }));
    }

    if (!activationEnabled) {
      diagnostics.push(createDiagnostic({
        code: 'ACTIVATION_DISABLED',
        severity: 'WARNING',
        module: 'activation',
        capability: null,
        reason: 'activation_flag_false',
        source: 'config',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { enabled: false },
      }));
    }

    if (!integrationEnabled) {
      diagnostics.push(createDiagnostic({
        code: 'INTEGRATION_DISABLED',
        severity: 'WARNING',
        module: 'integration',
        capability: null,
        reason: 'integration_flag_false',
        source: 'config',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { enabled: false },
      }));
    }

    if (environment && environment === 'production') {
      diagnostics.push(createDiagnostic({
        code: 'ENVIRONMENT_BLOCKED',
        severity: 'ERROR',
        module: 'application',
        capability: null,
        reason: 'production_not_allowed',
        source: 'policy',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { environment, allowProduction: APPLICATION_POLICY.allowProductionActivation },
      }));
    }

    if (!userAuthorized) {
      diagnostics.push(createDiagnostic({
        code: 'USER_NOT_AUTHORIZED',
        severity: 'WARNING',
        module: 'activation',
        capability: null,
        reason: 'user_not_in_cohort',
        source: 'policy',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: {},
      }));
    }

    if (circuitBreakerOpen) {
      diagnostics.push(createDiagnostic({
        code: 'CIRCUIT_BREAKER_OPEN',
        severity: 'ERROR',
        module: 'application',
        capability: null,
        reason: 'circuit_breaker_open',
        source: 'circuit_breaker',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: {},
      }));
    }

    if (confidence !== null && typeof confidence === 'number' && confidence < APPLICATION_POLICY.minimumConfidence) {
      diagnostics.push(createDiagnostic({
        code: 'LOW_CONFIDENCE',
        severity: 'WARNING',
        module: 'application',
        capability: null,
        reason: `confidence_below_${APPLICATION_POLICY.minimumConfidence}`,
        source: 'policy',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { confidence: Number(confidence.toFixed(2)), minimum: APPLICATION_POLICY.minimumConfidence },
      }));
    }

    if (risk && typeof risk === 'string') {
      const rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
      const maxAllowed = rank[APPLICATION_POLICY.maximumRisk] ?? 0;
      const actual = rank[risk] ?? 0;
      if (actual > maxAllowed) {
        diagnostics.push(createDiagnostic({
          code: 'HIGH_RISK',
          severity: 'ERROR',
          module: 'application',
          capability: null,
          reason: `risk_${risk}_exceeds_${APPLICATION_POLICY.maximumRisk}`,
          source: 'policy',
          fallbackRecommended: true,
          shadowOnly: false,
          metadata: { risk, maximumAllowed: APPLICATION_POLICY.maximumRisk },
        }));
      }
    }

    if (applyError) {
      diagnostics.push(createDiagnostic({
        code: 'APPLY_ERROR',
        severity: 'ERROR',
        module: 'application',
        capability: null,
        reason: 'apply_step_error',
        source: 'application',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { applied: false },
      }));
    }

    for (const capability of appliedCapabilities) {
      const isStyle = capability === 'RESPONSE_STYLE_GUIDANCE';
      diagnostics.push(createDiagnostic({
        code: isStyle ? 'STYLE_APPLIED' : 'LENGTH_APPLIED',
        severity: 'INFO',
        module: 'application',
        capability,
        reason: isStyle ? 'style_applied' : 'length_applied',
        source: 'application',
        fallbackRecommended: false,
        shadowOnly: false,
        metadata: { applied: true, capability },
      }));
    }

    if (questionDecision) {
      const safeQuestion = questionDecision && typeof questionDecision === 'object' ? questionDecision : {};
      const shouldAsk = safeQuestion.shouldAsk === true;
      const missingInformationCount = Array.isArray(safeQuestion.missingInformation)
        ? safeQuestion.missingInformation.length
        : 0;
      diagnostics.push(createDiagnostic({
        code: shouldAsk ? 'QUESTION_ASKED' : 'QUESTION_NOT_ASKED',
        severity: shouldAsk ? 'INFO' : 'INFO',
        module: 'application',
        capability: 'QUESTION_GUIDANCE',
        reason: shouldAsk ? 'question_should_ask' : 'question_not_asked',
        source: 'application',
        fallbackRecommended: false,
        shadowOnly: false,
        metadata: {
          shouldAsk,
          questionPriority: safeQuestion.questionPriority ?? 'LOW',
          missingInformationCount,
          confidence: safeQuestion.confidence,
          questionReason: safeQuestion.questionReason ?? 'UNKNOWN',
        },
      }));
    }

    if (clarificationDecision) {
      const safeClarification = clarificationDecision && typeof clarificationDecision === 'object' ? clarificationDecision : {};
      const shouldClarify = safeClarification.shouldClarify === true;
      const ambiguousFieldsCount = Array.isArray(safeClarification.ambiguousFields)
        ? safeClarification.ambiguousFields.length
        : 0;
      diagnostics.push(createDiagnostic({
        code: shouldClarify ? 'CLARIFICATION_NEEDED' : 'CLARIFICATION_NOT_NEEDED',
        severity: 'INFO',
        module: 'application',
        capability: 'CLARIFICATION_GUIDANCE',
        reason: shouldClarify ? 'clarification_should_clarify' : 'clarification_not_needed',
        source: 'application',
        fallbackRecommended: false,
        shadowOnly: false,
        metadata: {
          shouldClarify,
          clarificationPriority: safeClarification.clarificationPriority ?? 'LOW',
          ambiguousFieldsCount,
          confidence: safeClarification.confidence,
          clarificationReason: safeClarification.clarificationReason ?? 'UNKNOWN',
        },
      }));
    }

    for (const [capability, reason] of Object.entries(blockedCapabilities ?? {})) {
      if (!reason) continue;
      let code = 'CAPABILITY_NOT_ACTIVE';
      if (reason === 'CAPABILITY_NOT_ALLOWED') code = 'CAPABILITY_NOT_ALLOWED';
      else if (reason === 'CAPABILITY_BLOCKED') code = 'CAPABILITY_BLOCKED';

      diagnostics.push(createDiagnostic({
        code,
        severity: code === 'CAPABILITY_BLOCKED' ? 'ERROR' : 'WARNING',
        module: 'application',
        capability,
        reason,
        source: 'policy',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { blocked: true, capability },
      }));
    }

    if (fallbackUsed) {
      const reason = fallbackReason && isValidDiagnosticCode(fallbackReason) ? fallbackReason : 'UNKNOWN';
      diagnostics.push(createDiagnostic({
        code: 'FALLBACK_USED',
        severity: 'WARNING',
        module: 'application',
        capability: null,
        reason,
        source: 'fallback',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { fallbackReason: reason },
      }));
    }

    if (diagnostics.length === 0) {
      diagnostics.push(createDiagnostic({
        code: 'UNKNOWN',
        severity: 'INFO',
        module: 'application',
        capability: null,
        reason: 'no_influence',
        source: 'evaluation',
        fallbackRecommended: false,
        shadowOnly: true,
        metadata: {},
      }));
    }

    const deduped = deduplicateDiagnostics(diagnostics);
    const limited = limitDiagnostics(deduped);
    return Object.freeze(limited);
  } catch {
    return Object.freeze([]);
  }
}

export function deduplicateApplicationDiagnostics(list) {
  return deduplicateDiagnostics(list);
}

export function limitApplicationDiagnostics(list) {
  return limitDiagnostics(list);
}
