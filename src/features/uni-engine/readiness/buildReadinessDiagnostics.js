// Uni Engine — Decision Readiness: diagnósticos (Parte 3).
//
// Diagnóstico redigido da camada de readiness. Apenas códigos, severidades,
// razões curtas e agregados técnicos — nunca texto completo, IDs, contas,
// valores ou memória. Nunca exibido ao usuário e nunca persistido.
import { deepFreeze } from './readinessContracts.js';
import { READINESS_DIAGNOSTIC_CODES } from './readinessTypes.js';

const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR']);

const SAFE_METADATA_KEYS = Object.freeze([
  'source',
  'sources',
  'count',
  'capability',
  'capabilities',
  'status',
  'decisionType',
  'recommendedNextStep',
  'open',
  'shadowMode',
]);

function isValidCode(code) {
  return READINESS_DIAGNOSTIC_CODES.includes(code);
}

function isValidSeverity(severity) {
  return SEVERITIES.includes(severity);
}

function sanitizeMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const sanitized = {};
  for (const [key, item] of Object.entries(value)) {
    if (!SAFE_METADATA_KEYS.includes(key)) continue;
    if (item === null || item === undefined) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    } else if (Array.isArray(item)) {
      const list = item
        .filter((entry) => typeof entry === 'string' || typeof entry === 'number')
        .slice(0, 5);
      if (list.length > 0) sanitized[key] = list;
    }
  }
  return sanitized;
}

export function createReadinessDiagnostic(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const code = isValidCode(safe.code) ? safe.code : 'UNKNOWN';
  const severity = isValidSeverity(safe.severity) ? safe.severity : 'INFO';
  const capability = typeof safe.capability === 'string' ? safe.capability : null;
  const reason = typeof safe.reason === 'string' ? safe.reason : null;
  const source = typeof safe.source === 'string' ? safe.source : 'readiness';
  const metadata = sanitizeMetadata(safe.metadata);

  return deepFreeze({
    code,
    severity,
    module: 'readiness',
    capability,
    reason,
    source,
    observational: true,
    metadata,
  });
}

function deduplicate(list) {
  const seen = new Set();
  const result = [];
  for (const item of list) {
    const key = `${item.code}:${item.reason ?? ''}:${item.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= 12) break;
  }
  return result;
}

export function buildReadinessDiagnostics({
  decisionAvailable = false,
  recommendedCount = 0,
  eligibleCount = 0,
  blockedCount = 0,
  activationReadiness = null,
  circuitOpen = false,
  shadowMode = false,
  legacyPreserved = true,
  applied = false,
} = {}) {
  try {
    const diagnostics = [];

    diagnostics.push(createReadinessDiagnostic({
      code: 'READINESS_COMPUTED',
      severity: 'INFO',
      reason: 'readiness_built',
      source: 'readiness',
      metadata: { sources: ['observation'], count: 1 },
    }));

    if (decisionAvailable) {
      diagnostics.push(createReadinessDiagnostic({
        code: 'DECISION_AVAILABLE',
        severity: 'INFO',
        reason: 'decision_available',
        source: 'decision',
      }));
    } else {
      diagnostics.push(createReadinessDiagnostic({
        code: 'DECISION_UNAVAILABLE',
        severity: 'WARNING',
        reason: 'no_valid_decision',
        source: 'decision',
      }));
    }

    if (recommendedCount > 0) {
      diagnostics.push(createReadinessDiagnostic({
        code: 'RECOMMENDED_CAPABILITIES',
        severity: 'INFO',
        reason: 'capabilities_recommended',
        source: 'readiness',
        metadata: { count: recommendedCount },
      }));
    } else {
      diagnostics.push(createReadinessDiagnostic({
        code: 'NO_RECOMMENDED_CAPABILITIES',
        severity: 'WARNING',
        reason: 'no_capabilities_recommended',
        source: 'readiness',
      }));
    }

    if (eligibleCount > 0) {
      diagnostics.push(createReadinessDiagnostic({
        code: 'ELIGIBLE_CAPABILITIES',
        severity: 'INFO',
        reason: 'capabilities_eligible',
        source: 'activation',
        metadata: { count: eligibleCount },
      }));
    } else {
      diagnostics.push(createReadinessDiagnostic({
        code: 'NO_ELIGIBLE_CAPABILITIES',
        severity: 'WARNING',
        reason: 'no_capabilities_eligible',
        source: 'activation',
      }));
    }

    if (blockedCount > 0) {
      diagnostics.push(createReadinessDiagnostic({
        code: 'BLOCKED_CAPABILITIES',
        severity: 'WARNING',
        reason: 'capabilities_blocked',
        source: 'activation',
        metadata: { count: blockedCount },
      }));
    } else {
      diagnostics.push(createReadinessDiagnostic({
        code: 'NO_BLOCKED_CAPABILITIES',
        severity: 'INFO',
        reason: 'no_capabilities_blocked',
        source: 'activation',
      }));
    }

    const status = activationReadiness?.status ?? 'NOT_EVALUATED';
    const statusDiagnostics = {
      ACTIVE: ['ACTIVATION_READY', 'activation_ready', 'INFO'],
      READY: ['ACTIVATION_READY', 'activation_ready', 'INFO'],
      PARTIAL: ['ACTIVATION_PARTIAL', 'activation_partial', 'WARNING'],
      SHADOW_ONLY: ['ACTIVATION_SHADOW_ONLY', 'activation_shadow_only', 'INFO'],
      BLOCKED: ['ACTIVATION_BLOCKED', 'activation_blocked', 'WARNING'],
      NOT_EVALUATED: ['ACTIVATION_NOT_EVALUATED', 'activation_not_evaluated', 'WARNING'],
    };
    const [code, reason, severity] = statusDiagnostics[status] ?? statusDiagnostics.NOT_EVALUATED;
    diagnostics.push(createReadinessDiagnostic({
      code,
      severity,
      reason,
      source: 'activation',
      metadata: { status },
    }));

    if (circuitOpen) {
      diagnostics.push(createReadinessDiagnostic({
        code: 'CIRCUIT_OPEN',
        severity: 'WARNING',
        reason: 'circuit_open',
        source: 'activation',
        metadata: { open: true },
      }));
    } else {
      diagnostics.push(createReadinessDiagnostic({
        code: 'CIRCUIT_CLOSED',
        severity: 'INFO',
        reason: 'circuit_closed',
        source: 'activation',
        metadata: { open: false },
      }));
    }

    if (shadowMode) {
      diagnostics.push(createReadinessDiagnostic({
        code: 'SHADOW_MODE',
        severity: 'INFO',
        reason: 'shadow_mode_active',
        source: 'config',
        metadata: { shadowMode: true },
      }));
    }

    if (legacyPreserved) {
      diagnostics.push(createReadinessDiagnostic({
        code: 'LEGACY_PRESERVED',
        severity: 'INFO',
        reason: 'legacy_preserved',
        source: 'readiness',
      }));
    }

    if (!applied) {
      diagnostics.push(createReadinessDiagnostic({
        code: 'NOTHING_APPLIED',
        severity: 'INFO',
        reason: 'nothing_applied',
        source: 'readiness',
      }));
    }

    return deepFreeze(deduplicate(diagnostics));
  } catch {
    return deepFreeze([]);
  }
}
