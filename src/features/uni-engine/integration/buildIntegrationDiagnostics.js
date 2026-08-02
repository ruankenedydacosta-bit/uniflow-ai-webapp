// Integration — diagnóstico (Parte 1).
//
// Diagnóstico redigido para auditoria interna: apenas capacidades, bloqueios,
// status e agregados. Nunca texto completo, IDs, contas, categorias, valores
// ou memória. Nunca exibido ao usuário.
import { INTEGRATION_POLICY } from './integrationPolicy.js';

const DIAGNOSTIC_CODES = Object.freeze([
  'INTEGRATION_DISABLED',
  'ACTIVATION_DISABLED',
  'ACTIVATION_INVALID',
  'CAPABILITY_NOT_REQUESTED',
  'CAPABILITY_NOT_ALLOWED',
  'CAPABILITY_BLOCKED',
  'CAPABILITY_NOT_ACTIVE',
  'CONTRACT_INVALID',
  'LEGACY_RESULT_INVALID',
  'LOW_CONFIDENCE',
  'HIGH_RISK',
  'INSUFFICIENT_DATA',
  'CIRCUIT_BREAKER_OPEN',
  'ENVIRONMENT_BLOCKED',
  'ADAPTER_ERROR',
  'FALLBACK_USED',
  'SHADOW_ONLY',
  'INTEGRATION_APPLIED',
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
  'shadowMode',
  'protectedType',
  'responseType',
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
  return list.slice(0, INTEGRATION_POLICY.maxDiagnostics ?? INTEGRATION_POLICY.maximumDiagnosticsItems ?? 12);
}

function createDiagnostic(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const code = isValidDiagnosticCode(safe.code) ? safe.code : 'UNKNOWN';
  const severity = isValidSeverity(safe.severity) ? safe.severity : 'INFO';
  const module = typeof safe.module === 'string' ? safe.module : 'integration';
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

export function isSafeIntegrationDiagnostic(value) {
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

export function normalizeIntegrationDiagnostic(input) {
  return createDiagnostic(input);
}

export function createIntegrationDiagnostic(input) {
  return createDiagnostic(input);
}

export function buildIntegrationDiagnostics({
  evaluation = null,
  appliedCapabilities = [],
  blockedBy = {},
  fallbackUsed = false,
  fallbackReason = null,
  protectedResponses = [],
  integrationEnabled = true,
  activationEnabled = true,
  confidence = null,
  risk = null,
  dataSufficient = true,
  circuitBreakerOpen = false,
  environment = null,
  adapterError = false,
} = {}) {
  try {
    const diagnostics = [];
    const evalSafe = evaluation && typeof evaluation === 'object' ? evaluation : null;

    // Integration disabled
    if (!integrationEnabled) {
      diagnostics.push(createDiagnostic({
        code: 'INTEGRATION_DISABLED',
        severity: 'INFO',
        module: 'integration',
        capability: null,
        reason: 'integration_flag_false',
        source: 'config',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { status: 'disabled' },
      }));
    }

    // Activation disabled
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
        metadata: { status: 'disabled' },
      }));
    }

    // Activation invalid (no decisions)
    if (evalSafe && evalSafe.requested.length === 0) {
      diagnostics.push(createDiagnostic({
        code: 'ACTIVATION_INVALID',
        severity: 'WARNING',
        module: 'activation',
        capability: null,
        reason: evalSafe.byCapability ? 'no_decisions' : 'no_decisions',
        source: 'evaluation',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { requested: 0 },
      }));
    }

    // Shadow only mode
    if (evalSafe && evalSafe.shadowMode === true) {
      diagnostics.push(createDiagnostic({
        code: 'SHADOW_ONLY',
        severity: 'INFO',
        module: 'integration',
        capability: null,
        reason: 'shadow_mode_active',
        source: 'config',
        fallbackRecommended: false,
        shadowOnly: true,
        metadata: { shadowMode: true },
      }));
    }

    // Fallback used
    if (fallbackUsed) {
      const reason = fallbackReason && isValidDiagnosticCode(fallbackReason) ? fallbackReason : 'UNKNOWN';
      diagnostics.push(createDiagnostic({
        code: 'FALLBACK_USED',
        severity: 'WARNING',
        module: 'integration',
        capability: null,
        reason,
        source: 'fallback',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { fallbackReason: reason },
      }));
    }

    // Low confidence
    if (confidence !== null && typeof confidence === 'number' && confidence < INTEGRATION_POLICY.minimumConfidence) {
      diagnostics.push(createDiagnostic({
        code: 'LOW_CONFIDENCE',
        severity: 'WARNING',
        module: 'integration',
        capability: null,
        reason: `confidence_below_${INTEGRATION_POLICY.minimumConfidence}`,
        source: 'policy',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { confidence: Number(confidence.toFixed(2)), minimum: INTEGRATION_POLICY.minimumConfidence },
      }));
    }

    // High risk
    if (risk && typeof risk === 'string') {
      const rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
      const maxAllowed = rank[INTEGRATION_POLICY.maximumRisk] ?? 0;
      const actual = rank[risk] ?? 0;
      if (actual > maxAllowed) {
        diagnostics.push(createDiagnostic({
          code: 'HIGH_RISK',
          severity: 'ERROR',
          module: 'integration',
          capability: null,
          reason: `risk_${risk}_exceeds_${INTEGRATION_POLICY.maximumRisk}`,
          source: 'policy',
          fallbackRecommended: true,
          shadowOnly: false,
          metadata: { risk, maximumAllowed: INTEGRATION_POLICY.maximumRisk },
        }));
      }
    }

    // Insufficient data
    if (!dataSufficient) {
      diagnostics.push(createDiagnostic({
        code: 'INSUFFICIENT_DATA',
        severity: 'WARNING',
        module: 'integration',
        capability: null,
        reason: 'data_sufficient_false',
        source: 'policy',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { dataSufficient: false },
      }));
    }

    // Circuit breaker open
    if (circuitBreakerOpen) {
      diagnostics.push(createDiagnostic({
        code: 'CIRCUIT_BREAKER_OPEN',
        severity: 'ERROR',
        module: 'integration',
        capability: null,
        reason: 'circuit_breaker_open',
        source: 'circuit_breaker',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { circuitBreakerOpen: true },
      }));
    }

    // Environment blocked
    if (environment && environment === 'production' && !INTEGRATION_POLICY.allowProductionActivation) {
      diagnostics.push(createDiagnostic({
        code: 'ENVIRONMENT_BLOCKED',
        severity: 'ERROR',
        module: 'integration',
        capability: null,
        reason: 'production_not_allowed',
        source: 'policy',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { environment, allowProduction: INTEGRATION_POLICY.allowProductionActivation },
      }));
    }

    // Adapter error
    if (adapterError) {
      diagnostics.push(createDiagnostic({
        code: 'ADAPTER_ERROR',
        severity: 'ERROR',
        module: 'integration',
        capability: null,
        reason: 'legacy_adapter_invalid',
        source: 'adapter',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { adapterError: true },
      }));
    }

    // Requested capabilities
    if (evalSafe && evalSafe.requested.length > 0) {
      diagnostics.push(createDiagnostic({
        code: 'INTEGRATION_APPLIED',
        severity: 'INFO',
        module: 'integration',
        capability: null,
        reason: 'capabilities_requested',
        source: 'evaluation',
        fallbackRecommended: false,
        shadowOnly: evalSafe.shadowMode === true,
        metadata: { requested: evalSafe.requested, count: evalSafe.requested.length },
      }));
    }

    // Active capabilities
    if (evalSafe && evalSafe.active.length > 0) {
      diagnostics.push(createDiagnostic({
        code: 'INTEGRATION_APPLIED',
        severity: 'INFO',
        module: 'integration',
        capability: null,
        reason: 'capabilities_active',
        source: 'evaluation',
        fallbackRecommended: false,
        shadowOnly: evalSafe.shadowMode === true,
        metadata: { active: evalSafe.active, count: evalSafe.active.length },
      }));
    }

    // Applied capabilities
    if (appliedCapabilities.length > 0) {
      diagnostics.push(createDiagnostic({
        code: 'INTEGRATION_APPLIED',
        severity: 'INFO',
        module: 'integration',
        capability: null,
        reason: 'capabilities_applied',
        source: 'application',
        fallbackRecommended: false,
        shadowOnly: false,
        metadata: { applied: appliedCapabilities, count: appliedCapabilities.length },
      }));
    }

    // Blocked capabilities
    for (const [capability, reason] of Object.entries(blockedBy ?? {})) {
      if (!reason) continue;
      let code = 'CAPABILITY_NOT_ACTIVE';
      if (reason === 'CAPABILITY_NOT_ALLOWED') code = 'CAPABILITY_NOT_ALLOWED';
      else if (reason === 'CAPABILITY_BLOCKED') code = 'CAPABILITY_BLOCKED';
      else if (reason === 'CAPABILITY_NOT_REQUESTED') code = 'CAPABILITY_NOT_REQUESTED';
      else if (reason.includes('CONFIDENCE')) code = 'LOW_CONFIDENCE';
      else if (reason.includes('RISK')) code = 'HIGH_RISK';
      else if (reason.includes('DATA') || reason.includes('CONTEXT')) code = 'INSUFFICIENT_DATA';
      else if (reason.includes('CIRCUIT')) code = 'CIRCUIT_BREAKER_OPEN';
      else if (reason.includes('ENVIRONMENT')) code = 'ENVIRONMENT_BLOCKED';
      else if (reason.includes('POLICY')) code = 'CAPABILITY_NOT_ALLOWED';

      diagnostics.push(createDiagnostic({
        code,
        severity: ['CAPABILITY_BLOCKED', 'HIGH_RISK', 'CIRCUIT_BREAKER_OPEN', 'ENVIRONMENT_BLOCKED'].includes(code) ? 'ERROR' : 'WARNING',
        module: 'integration',
        capability,
        reason,
        source: 'evaluation',
        fallbackRecommended: true,
        shadowOnly: false,
        metadata: { capability, blockedBy: reason },
      }));
    }

    // Protected responses
    if (protectedResponses.length > 0) {
      diagnostics.push(createDiagnostic({
        code: 'INTEGRATION_APPLIED',
        severity: 'INFO',
        module: 'integration',
        capability: null,
        reason: 'protected_response_types',
        source: 'legacy',
        fallbackRecommended: false,
        shadowOnly: false,
        metadata: { protected: protectedResponses },
      }));
    }

    // No influence
    if (diagnostics.length === 0) {
      diagnostics.push(createDiagnostic({
        code: 'UNKNOWN',
        severity: 'INFO',
        module: 'integration',
        capability: null,
        reason: 'no_influence',
        source: 'evaluation',
        fallbackRecommended: false,
        shadowOnly: true,
        metadata: {},
      }));
    }

    // Deduplicate, limit, freeze
    const deduped = deduplicateDiagnostics(diagnostics);
    const limited = limitDiagnostics(deduped);
    return Object.freeze(limited);
  } catch {
    // Safe fallback on any internal error
    return Object.freeze([]);
  }
}

export function deduplicateIntegrationDiagnostics(list) {
  return deduplicateDiagnostics(list);
}

export function limitIntegrationDiagnostics(list) {
  return limitDiagnostics(list);
}