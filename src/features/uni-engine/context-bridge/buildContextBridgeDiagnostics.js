// Uni Engine — Context Bridge (Fase 11, Bloco 2): diagnostics.
//
// Diagnósticos determinísticos e fechados da ponte. Apenas códigos, severidade
// e razões curtas pré-definidas — nunca texto livre, nunca valores sensíveis.
import {
  CONTEXT_BRIDGE_POLICY,
} from './contextBridgePolicy.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function truncateReason(reason) {
  if (typeof reason !== 'string' || reason.trim() === '') return 'UNKNOWN';
  return reason.trim().slice(0, CONTEXT_BRIDGE_POLICY.maxReasonLength);
}

export function createContextBridgeDiagnostic({ code, severity, reason }) {
  return Object.freeze({
    code: typeof code === 'string' ? code : 'UNKNOWN',
    severity: severity === 'ERROR' ? 'ERROR' : 'INFO',
    reason: truncateReason(reason),
  });
}

export function isContextBridgeDiagnostic(value) {
  return isPlainObject(value)
    && typeof value.code === 'string'
    && (value.severity === 'INFO' || value.severity === 'ERROR')
    && typeof value.reason === 'string';
}

export function buildContextBridgeDiagnostics({
  influenceAllowed = false,
  allowedInfluences = [],
  blockedInfluences = [],
  fallbackReason = null,
  sameTurn = false,
  confirmationPreserved = false,
  pendingActionPreserved = false,
  enabled = false,
} = {}) {
  const diagnostics = [];
  const push = (code, severity, reason) => {
    if (diagnostics.length >= CONTEXT_BRIDGE_POLICY.maxDiagnostics) return;
    diagnostics.push(createContextBridgeDiagnostic({ code, severity, reason }));
  };

  if (enabled === true) {
    push('BRIDGE_ENABLED', 'INFO', 'bridge enabled');
  } else {
    push('BRIDGE_DISABLED', 'INFO', 'bridge disabled by default');
  }

  if (sameTurn === true) {
    push('SAME_TURN_ENFORCED', 'INFO', 'same turn enforced');
  } else if (fallbackReason === 'SAME_TURN_VIOLATED') {
    push('SAME_TURN_VIOLATED', 'ERROR', 'stale turn rejected');
  }

  if (influenceAllowed === true) {
    push('INFLUENCE_ALLOWED', 'INFO', 'influences authorized');
  } else if (fallbackReason === 'CONFIRMATION_MANDATORY') {
    push('CONFIRMATION_PRESERVED', 'INFO', 'mandatory confirmation wins');
  } else if (fallbackReason !== null) {
    push('INFLUENCE_BLOCKED_BY_POLICY', 'ERROR', truncateReason(fallbackReason));
  }

  for (const influence of allowedInfluences) {
    push('INFLUENCE_ALLOWED', 'INFO', `allowed ${truncateReason(influence)}`);
  }
  for (const influence of blockedInfluences) {
    push('CAPABILITY_DISABLED', 'INFO', `blocked ${truncateReason(influence)}`);
  }

  if (confirmationPreserved === true) {
    push('CONFIRMATION_PRESERVED', 'INFO', 'confirmation untouched');
  }
  if (pendingActionPreserved === true) {
    push('PENDING_ACTION_PRESERVED', 'INFO', 'pending action untouched');
  }
  push('LEGACY_PRESERVED', 'INFO', 'legacy preserved');

  return Object.freeze(diagnostics.slice(0, CONTEXT_BRIDGE_POLICY.maxDiagnostics));
}
