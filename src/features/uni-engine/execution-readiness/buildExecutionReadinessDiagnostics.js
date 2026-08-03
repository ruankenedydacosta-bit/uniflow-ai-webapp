// Uni Engine — Execution Readiness: diagnósticos (Parte 4, Bloco 2).
//
// Diagnóstico redigido da camada de prontidão de execução. Apenas códigos,
// severidades e agregados técnicos — nunca texto, IDs, contas, valores ou
// memória. Nunca exibido ao usuário e nunca persistido.
import { deepFreeze } from './executionReadinessContracts.js';
import { EXECUTION_READINESS_DIAGNOSTIC_CODES } from './executionReadinessTypes.js';

const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR']);

const SAFE_METADATA_KEYS = Object.freeze([
  'source',
  'count',
  'capability',
  'status',
  'recommendation',
  'risk',
  'shadowMode',
]);

function isValidCode(code) {
  return EXECUTION_READINESS_DIAGNOSTIC_CODES.includes(code);
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

export function createExecutionReadinessDiagnostic(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const code = isValidCode(safe.code) ? safe.code : 'UNKNOWN';
  const severity = isValidSeverity(safe.severity) ? safe.severity : 'INFO';
  const capability = typeof safe.capability === 'string' ? safe.capability : null;
  const reason = typeof safe.reason === 'string' ? safe.reason : null;
  const source = typeof safe.source === 'string' ? safe.source : 'execution-readiness';
  const metadata = sanitizeMetadata(safe.metadata);

  return deepFreeze({
    code,
    severity,
    module: 'execution-readiness',
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

export function buildExecutionReadinessDiagnostics({
  executionAvailable = false,
  executionConfidence = 0,
  requiredCapabilitiesPresent = false,
  missingRequirements = false,
  highRisk = false,
  recommendation = 'OBSERVE_ONLY',
  shadowMode = false,
  legacyPreserved = true,
  applied = false,
} = {}) {
  try {
    const diagnostics = [];

    diagnostics.push(createExecutionReadinessDiagnostic({
      code: 'EXECUTION_READINESS_COMPUTED',
      severity: 'INFO',
      reason: 'execution_readiness_built',
      source: 'execution-readiness',
      metadata: { count: 1 },
    }));

    if (executionAvailable) {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'EXECUTION_AVAILABLE',
        severity: 'INFO',
        reason: 'execution_available',
        source: 'execution-readiness',
      }));
    } else {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'EXECUTION_UNAVAILABLE',
        severity: 'WARNING',
        reason: 'execution_unavailable',
        source: 'execution-readiness',
      }));
    }

    if (executionConfidence >= 0.7) {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'EXECUTION_CONFIDENCE_HIGH',
        severity: 'INFO',
        reason: 'execution_confidence_high',
        source: 'decision',
      }));
    } else {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'EXECUTION_CONFIDENCE_LOW',
        severity: 'WARNING',
        reason: 'execution_confidence_low',
        source: 'decision',
      }));
    }

    if (requiredCapabilitiesPresent) {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'REQUIRED_CAPABILITIES_PRESENT',
        severity: 'INFO',
        reason: 'required_capabilities_present',
        source: 'capability-readiness',
      }));
    } else {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'REQUIRED_CAPABILITIES_MISSING',
        severity: 'WARNING',
        reason: 'required_capabilities_missing',
        source: 'capability-readiness',
      }));
    }

    if (missingRequirements) {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'REQUIREMENTS_MISSING',
        severity: 'WARNING',
        reason: 'requirements_missing',
        source: 'decision',
      }));
    } else {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'REQUIREMENTS_COMPLETE',
        severity: 'INFO',
        reason: 'requirements_complete',
        source: 'decision',
      }));
    }

    if (highRisk) {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'RISK_UNACCEPTABLE',
        severity: 'ERROR',
        reason: 'risk_unacceptable',
        source: 'decision',
        metadata: { risk: 'HIGH' },
      }));
    } else {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'RISK_ACCEPTABLE',
        severity: 'INFO',
        reason: 'risk_acceptable',
        source: 'decision',
      }));
    }

    diagnostics.push(createExecutionReadinessDiagnostic({
      code: 'EXECUTION_RECOMMENDATION',
      severity: 'INFO',
      reason: 'execution_recommendation',
      source: 'execution-readiness',
      metadata: { recommendation },
    }));

    if (shadowMode) {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'SHADOW_MODE',
        severity: 'INFO',
        reason: 'shadow_mode_active',
        source: 'config',
        metadata: { shadowMode: true },
      }));
    }

    if (legacyPreserved) {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'LEGACY_PRESERVED',
        severity: 'INFO',
        reason: 'legacy_preserved',
        source: 'execution-readiness',
      }));
    }

    if (!applied) {
      diagnostics.push(createExecutionReadinessDiagnostic({
        code: 'NOTHING_APPLIED',
        severity: 'INFO',
        reason: 'nothing_applied',
        source: 'execution-readiness',
      }));
    }

    return deepFreeze(deduplicate(diagnostics));
  } catch {
    return deepFreeze([]);
  }
}
