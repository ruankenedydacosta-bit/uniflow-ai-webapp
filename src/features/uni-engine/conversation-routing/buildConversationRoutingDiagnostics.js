// Uni Engine — Conversation Routing (Parte 8, Bloco Único): diagnósticos.
//
// Diagnósticos estruturados do seletor de rota. Vocabulário FECHADO — nenhum
// texto livre, nenhum ID, nenhum valor de usuário. Sempre deduplicados por
// código, com severidade e motivos fechados.

const SEVERITIES = Object.freeze(['INFO', 'WARNING', 'ERROR']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createConversationRoutingDiagnostic({ code, reason = null, severity = 'INFO', capability = null } = {}) {
  const normalizedCode = typeof code === 'string' && code ? code : 'UNKNOWN';
  return Object.freeze({
    code: normalizedCode,
    severity: SEVERITIES.includes(severity) ? severity : 'INFO',
    module: 'conversation-routing',
    capability: typeof capability === 'string' && capability ? capability : null,
    reason: typeof reason === 'string' && reason ? reason : null,
    source: 'conversationRouting',
  });
}

// Constrói a lista de diagnósticos do resultado, deduplicada por código e
// respeitando o limite fechado da policy.
export function buildConversationRoutingDiagnostics({
  selectedRoute = null,
  routeSource = null,
  fallbackUsed = false,
  fallbackReason = null,
  confirmationPreserved = false,
  pendingActionPreserved = false,
} = {}) {
  const diagnostics = [];
  const seen = new Set();
  const push = (item) => {
    if (seen.has(item.code)) return;
    seen.add(item.code);
    diagnostics.push(item);
  };

  if (fallbackUsed) {
    push(createConversationRoutingDiagnostic({
      code: 'FALLBACK_USED',
      severity: 'INFO',
      reason: fallbackReason,
    }));
  } else if (selectedRoute && routeSource === 'legacy-priority') {
    if (selectedRoute === 'ROUTE_CONFIRMATION') {
      push(createConversationRoutingDiagnostic({
        code: 'LEGACY_CONFIRMATION_PRIORITY',
        reason: 'CONFIRMATION_PENDING',
      }));
    } else if (selectedRoute === 'ROUTE_LEGACY_SECURITY_ERROR') {
      push(createConversationRoutingDiagnostic({
        code: 'LEGACY_SECURITY_ERROR_PRIORITY',
        reason: 'LEGACY_REQUIRED',
      }));
    }
  } else if (selectedRoute && routeSource === 'planner') {
    push(createConversationRoutingDiagnostic({
      code: 'PLANNER_ORIENTED_ROUTE',
      reason: 'PLANNED',
    }));
  } else {
    push(createConversationRoutingDiagnostic({
      code: 'LEGACY_ROUTE_SELECTED',
      reason: 'NO_VALID_ROUTE',
    }));
  }

  if (confirmationPreserved) {
    push(createConversationRoutingDiagnostic({
      code: 'CONFIRMATION_PRESERVED',
      reason: 'LEGACY_CONFIRMATION_PRESENT',
    }));
  }
  if (pendingActionPreserved) {
    push(createConversationRoutingDiagnostic({
      code: 'PENDING_ACTION_PRESERVED',
      reason: 'PENDING_ACTION_PRESENT',
    }));
  }
  push(createConversationRoutingDiagnostic({
    code: 'DUPLICATE_PREVENTED',
    reason: 'SINGLE_ROUTE_PER_TURN',
  }));
  return Object.freeze(diagnostics);
}

// Verifica se um diagnóstico pertence ao módulo e possui código fechado
// (usado pela sanitização do contrato em casos futuros).
export function isConversationRoutingDiagnostic(value) {
  return isPlainObject(value)
    && value.module === 'conversation-routing'
    && typeof value.code === 'string';
}
