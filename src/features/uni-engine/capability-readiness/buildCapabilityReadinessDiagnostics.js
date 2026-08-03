// Uni Engine — Capability Activation Readiness: diagnósticos (Parte 4, Bloco 1).
//
// Diagnóstico redigido da camada de prontidão de ativação. Apenas códigos,
// severidades e agregados técnicos — nunca texto, IDs, contas, valores ou
// memória. Nunca exibido ao usuário e nunca persistido.
import { deepFreeze } from './capabilityReadinessContracts.js';
import { CAPABILITY_READINESS_DIAGNOSTIC_CODES } from './capabilityReadinessTypes.js';

const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR']);

const SAFE_METADATA_KEYS = Object.freeze([
  'source',
  'count',
  'capability',
  'status',
  'shadowMode',
]);

function isValidCode(code) {
  return CAPABILITY_READINESS_DIAGNOSTIC_CODES.includes(code);
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
    }
  }
  return sanitized;
}

export function createCapabilityReadinessDiagnostic(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const code = isValidCode(safe.code) ? safe.code : 'UNKNOWN';
  const severity = isValidSeverity(safe.severity) ? safe.severity : 'INFO';
  const capability = typeof safe.capability === 'string' ? safe.capability : null;
  const reason = typeof safe.reason === 'string' ? safe.reason : null;
  const source = typeof safe.source === 'string' ? safe.source : 'capability-readiness';
  const metadata = sanitizeMetadata(safe.metadata);

  return deepFreeze({
    code,
    severity,
    module: 'capability-readiness',
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

export function buildCapabilityReadinessDiagnostics({
  eligibleCount = 0,
  blockedCount = 0,
  missingDependencyCount = 0,
  nextRecommendedCapability = null,
  shadowMode = false,
  legacyPreserved = true,
  applied = false,
} = {}) {
  try {
    const diagnostics = [];

    diagnostics.push(createCapabilityReadinessDiagnostic({
      code: 'CAPABILITY_READINESS_COMPUTED',
      severity: 'INFO',
      reason: 'capability_readiness_built',
      source: 'capability-readiness',
      metadata: { count: 1 },
    }));

    if (eligibleCount > 0) {
      diagnostics.push(createCapabilityReadinessDiagnostic({
        code: 'CAPABILITIES_ELIGIBLE',
        severity: 'INFO',
        reason: 'capabilities_eligible',
        source: 'activation',
        metadata: { count: eligibleCount },
      }));
    } else {
      diagnostics.push(createCapabilityReadinessDiagnostic({
        code: 'NO_ELIGIBLE_CAPABILITIES',
        severity: 'WARNING',
        reason: 'no_capabilities_eligible',
        source: 'activation',
      }));
    }

    if (blockedCount > 0) {
      diagnostics.push(createCapabilityReadinessDiagnostic({
        code: 'CAPABILITIES_BLOCKED',
        severity: 'WARNING',
        reason: 'capabilities_blocked',
        source: 'activation',
        metadata: { count: blockedCount },
      }));
    } else {
      diagnostics.push(createCapabilityReadinessDiagnostic({
        code: 'NO_BLOCKED_CAPABILITIES',
        severity: 'INFO',
        reason: 'no_capabilities_blocked',
        source: 'activation',
      }));
    }

    if (missingDependencyCount > 0) {
      diagnostics.push(createCapabilityReadinessDiagnostic({
        code: 'DEPENDENCIES_MISSING',
        severity: 'WARNING',
        reason: 'dependencies_missing',
        source: 'capability-readiness',
        metadata: { count: missingDependencyCount },
      }));
    } else {
      diagnostics.push(createCapabilityReadinessDiagnostic({
        code: 'NO_MISSING_DEPENDENCIES',
        severity: 'INFO',
        reason: 'no_missing_dependencies',
        source: 'capability-readiness',
      }));
    }

    if (nextRecommendedCapability) {
      diagnostics.push(createCapabilityReadinessDiagnostic({
        code: 'NEXT_CAPABILITY_RECOMMENDED',
        severity: 'INFO',
        reason: 'next_capability_recommended',
        source: 'capability-readiness',
        metadata: { capability: nextRecommendedCapability },
      }));
    } else {
      diagnostics.push(createCapabilityReadinessDiagnostic({
        code: 'NO_NEXT_CAPABILITY_RECOMMENDED',
        severity: 'INFO',
        reason: 'no_next_capability_recommended',
        source: 'capability-readiness',
      }));
    }

    if (shadowMode) {
      diagnostics.push(createCapabilityReadinessDiagnostic({
        code: 'SHADOW_MODE',
        severity: 'INFO',
        reason: 'shadow_mode_active',
        source: 'config',
        metadata: { shadowMode: true },
      }));
    }

    if (legacyPreserved) {
      diagnostics.push(createCapabilityReadinessDiagnostic({
        code: 'LEGACY_PRESERVED',
        severity: 'INFO',
        reason: 'legacy_preserved',
        source: 'capability-readiness',
      }));
    }

    if (!applied) {
      diagnostics.push(createCapabilityReadinessDiagnostic({
        code: 'NOTHING_APPLIED',
        severity: 'INFO',
        reason: 'nothing_applied',
        source: 'capability-readiness',
      }));
    }

    return deepFreeze(deduplicate(diagnostics));
  } catch {
    return deepFreeze([]);
  }
}
