// Uni Engine — Observação da conversa (Parte 2, Bloco 3).
//
// Diagnóstico redigido da camada observacional. Apenas códigos, severidades,
// razões curtas e agregados técnicos — nunca texto completo, IDs, contas,
// categorias, valores ou memória. Nunca exibido ao usuário e nunca
// persistido.
import { deepFreeze } from './observationContracts.js';

const DIAGNOSTIC_CODES = Object.freeze([
  'OBSERVATION_COMPUTED',
  'INTEGRATION_EMPTY',
  'INTEGRATION_DISABLED',
  'INTEGRATION_FALLBACK',
  'INTEGRATION_APPLIED',
  'INTEGRATION_SHADOW',
  'GUIDANCE_EMPTY',
  'GUIDANCE_COMPUTED',
  'ACTIVATION_EMPTY',
  'ACTIVATION_ACTIVE',
  'ACTIVATION_SHADOW',
  'ACTIVATION_BLOCKED',
  'SHADOW_MODE',
  'LEGACY_PRESERVED',
  'UNKNOWN',
]);

const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR']);

const SAFE_METADATA_KEYS = Object.freeze([
  'source',
  'sources',
  'count',
  'status',
  'fallbackReason',
  'capability',
  'capabilities',
  'active',
  'applied',
  'blocked',
  'shadowMode',
  'integrationStatus',
  'diagnosticsCount',
]);

function isValidCode(code) {
  return DIAGNOSTIC_CODES.includes(code);
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

export function createObservationDiagnostic(input) {
  const safe = input && typeof input === 'object' ? input : {};
  const code = isValidCode(safe.code) ? safe.code : 'UNKNOWN';
  const severity = isValidSeverity(safe.severity) ? safe.severity : 'INFO';
  const capability = typeof safe.capability === 'string' ? safe.capability : null;
  const reason = typeof safe.reason === 'string' ? safe.reason : null;
  const source = typeof safe.source === 'string' ? safe.source : 'observation';
  const metadata = sanitizeMetadata(safe.metadata);

  return deepFreeze({
    code,
    severity,
    module: 'observation',
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

export function buildObservationDiagnostics({
  integrationSnapshot = null,
  guidanceSnapshot = null,
  activationSnapshot = null,
  shadowMode = false,
  legacyPreserved = true,
} = {}) {
  try {
    const diagnostics = [];

    const sources = [];
    if (integrationSnapshot) sources.push('integration');
    if (guidanceSnapshot) sources.push('guidance');
    if (activationSnapshot) sources.push('activation');

    diagnostics.push(createObservationDiagnostic({
      code: 'OBSERVATION_COMPUTED',
      severity: 'INFO',
      reason: 'snapshot_built',
      source: 'observation',
      metadata: { sources, count: sources.length },
    }));

    if (integrationSnapshot) {
      const status = integrationSnapshot.status ?? 'UNKNOWN';
      if (!integrationSnapshot.enabled || status === 'DISABLED') {
        diagnostics.push(createObservationDiagnostic({
          code: 'INTEGRATION_DISABLED',
          severity: 'WARNING',
          reason: 'integration_disabled',
          source: 'integration',
          metadata: { status, integrationStatus: status },
        }));
      } else if (integrationSnapshot.fallbackUsed) {
        diagnostics.push(createObservationDiagnostic({
          code: 'INTEGRATION_FALLBACK',
          severity: 'WARNING',
          reason: integrationSnapshot.fallbackReason ?? 'fallback_used',
          source: 'integration',
          metadata: { fallbackReason: integrationSnapshot.fallbackReason ?? 'fallback_used', integrationStatus: status },
        }));
      } else if (integrationSnapshot.applied) {
        diagnostics.push(createObservationDiagnostic({
          code: 'INTEGRATION_APPLIED',
          severity: 'INFO',
          reason: 'guidance_applied',
          source: 'integration',
          metadata: {
            applied: integrationSnapshot.capabilitiesApplied ?? [],
            count: (integrationSnapshot.capabilitiesApplied ?? []).length,
            integrationStatus: status,
          },
        }));
      } else {
        diagnostics.push(createObservationDiagnostic({
          code: 'INTEGRATION_SHADOW',
          severity: 'INFO',
          reason: 'shadow_only',
          source: 'integration',
          metadata: { shadowMode: integrationSnapshot.shadowMode === true, integrationStatus: status },
        }));
      }
    } else {
      diagnostics.push(createObservationDiagnostic({
        code: 'INTEGRATION_EMPTY',
        severity: 'WARNING',
        reason: 'integration_snapshot_missing',
        source: 'observation',
      }));
    }

    if (guidanceSnapshot) {
      const computed = guidanceSnapshot.capabilitiesComputed ?? [];
      if (computed.length === 0) {
        diagnostics.push(createObservationDiagnostic({
          code: 'GUIDANCE_EMPTY',
          severity: 'WARNING',
          reason: 'no_guidance_computed',
          source: 'guidance',
        }));
      } else {
        diagnostics.push(createObservationDiagnostic({
          code: 'GUIDANCE_COMPUTED',
          severity: 'INFO',
          reason: 'guidances_computed',
          source: 'guidance',
          metadata: { capabilities: computed, count: computed.length },
        }));
      }
    } else {
      diagnostics.push(createObservationDiagnostic({
        code: 'GUIDANCE_EMPTY',
        severity: 'WARNING',
        reason: 'guidance_snapshot_missing',
        source: 'observation',
      }));
    }

    if (activationSnapshot) {
      const decisionsCount = activationSnapshot.decisionsCount ?? 0;
      if (decisionsCount === 0) {
        diagnostics.push(createObservationDiagnostic({
          code: 'ACTIVATION_EMPTY',
          severity: 'WARNING',
          reason: 'no_activation_decisions',
          source: 'activation',
        }));
      } else if ((activationSnapshot.activeCount ?? 0) > 0) {
        diagnostics.push(createObservationDiagnostic({
          code: 'ACTIVATION_ACTIVE',
          severity: 'INFO',
          reason: 'capabilities_active',
          source: 'activation',
          metadata: { active: activationSnapshot.activeCount },
        }));
      } else if ((activationSnapshot.shadowCount ?? 0) > 0) {
        diagnostics.push(createObservationDiagnostic({
          code: 'ACTIVATION_SHADOW',
          severity: 'INFO',
          reason: 'shadow_only',
          source: 'activation',
          metadata: { shadowMode: true },
        }));
      } else {
        diagnostics.push(createObservationDiagnostic({
          code: 'ACTIVATION_BLOCKED',
          severity: 'WARNING',
          reason: 'activation_blocked',
          source: 'activation',
          metadata: { blocked: activationSnapshot.blockedCount ?? 0 },
        }));
      }
    } else {
      diagnostics.push(createObservationDiagnostic({
        code: 'ACTIVATION_EMPTY',
        severity: 'WARNING',
        reason: 'activation_snapshot_missing',
        source: 'observation',
      }));
    }

    if (shadowMode) {
      diagnostics.push(createObservationDiagnostic({
        code: 'SHADOW_MODE',
        severity: 'INFO',
        reason: 'shadow_mode_active',
        source: 'config',
        metadata: { shadowMode: true },
      }));
    }

    if (legacyPreserved) {
      diagnostics.push(createObservationDiagnostic({
        code: 'LEGACY_PRESERVED',
        severity: 'INFO',
        reason: 'legacy_preserved',
        source: 'observation',
      }));
    }

    return deepFreeze(deduplicate(diagnostics));
  } catch {
    return deepFreeze([]);
  }
}
