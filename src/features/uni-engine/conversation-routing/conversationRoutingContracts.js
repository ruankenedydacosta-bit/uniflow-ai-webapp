// Uni Engine — Conversation Routing (Parte 8, Bloco Único): contratos.
//
// Resultado serializável e imutável do seletor de rota. Garantias absolutas:
//   - legacyPreserved SEMPRE true (o pipeline legado continua soberano);
//   - o roteamento NUNCA cria texto livre, NUNCA executa, NUNCA escreve
//     memória, NUNCA toca banco/RPC/TTS e NUNCA modifica Pending Action ou
//     confirmação (safety fechada, todos os campos false);
//   - uma única rota por turno (duplicatePrevented true);
//   - qualquer falha → fallback legado integral (fallbackUsed true).
import {
  CONVERSATION_ROUTING_VERSION,
  isRoute,
  isRoutingSource,
  isRoutingFallbackReason,
  isRoutingSafetyKey,
  ROUTING_SAFETY_KEYS,
} from './conversationRoutingTypes.js';
import { CONVERSATION_ROUTING_POLICY } from './conversationRoutingPolicy.js';

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

// Congela em profundidade. Reentrante e idempotente.
export function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

// Safety fechada: todos os campos presentes e false. Ausente, parcial ou com
// qualquer true → resultado rejeitado (o roteamento nunca pode alegar efeito).
export function createRoutingSafety(overrides = {}) {
  const safe = isPlainObject(overrides) ? overrides : {};
  const safety = {};
  for (const key of ROUTING_SAFETY_KEYS) {
    safety[key] = safe[key] === true ? true : false;
  }
  return Object.freeze(safety);
}

export function isRoutingSafetyIntegral(safety) {
  if (!isPlainObject(safety)) return false;
  for (const key of ROUTING_SAFETY_KEYS) {
    if (!Object.hasOwn(safety, key)) return false;
    if (safety[key] !== false) return false;
  }
  return true;
}

function sanitizeDiagnostics(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  const result = [];
  for (const item of list) {
    if (typeof item !== 'string' || seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= CONVERSATION_ROUTING_POLICY.maxDiagnostics) break;
  }
  return result;
}

function normalizeFallbackReason(value) {
  return isRoutingFallbackReason(value) ? value : 'UNKNOWN';
}

function normalizeSource(value) {
  return isRoutingSource(value) ? value : 'fallback';
}

function round2(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Number(value.toFixed(2));
}

// Resultado VAZIO e seguro: rota legada integral, nada aplicado, nada
// alterado. Usado por qualquer falha (gate, erro interno ou flag desligada).
export function createEmptyConversationRoutingResult(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  return deepFreeze({
    version: CONVERSATION_ROUTING_VERSION,
    enabled: Boolean(safe.enabled),
    applied: false,
    selectedRoute: 'ROUTE_LEGACY_FALLBACK',
    requestedNextStep: null,
    routeSource: 'fallback',
    sameTurn: safe.sameTurn === true,
    legacyPreserved: true,
    fallbackUsed: true,
    fallbackReason: normalizeFallbackReason(safe.fallbackReason),
    confirmationPreserved: safe.confirmationPreserved === true,
    pendingActionPreserved: safe.pendingActionPreserved === true,
    duplicatePrevented: true,
    diagnostics: sanitizeDiagnostics(safe.diagnostics),
    safety: createRoutingSafety({}),
    latencyMs: round2(safe.latencyMs),
  });
}

export function createConversationRoutingResult(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const selectedRoute = isRoute(safe.selectedRoute) ? safe.selectedRoute : 'ROUTE_LEGACY_FALLBACK';
  const requestedNextStep =
    typeof safe.requestedNextStep === 'string' ? safe.requestedNextStep : null;
  const fallbackUsed = selectedRoute === 'ROUTE_LEGACY_FALLBACK';
  const fallbackReason = isRoutingFallbackReason(safe.fallbackReason)
    ? safe.fallbackReason
    : null;

  const result = {
    version: CONVERSATION_ROUTING_VERSION,
    enabled: Boolean(safe.enabled),
    applied: fallbackUsed ? false : Boolean(safe.applied),
    selectedRoute,
    requestedNextStep,
    routeSource: normalizeSource(safe.routeSource),
    sameTurn: safe.sameTurn === true,
    legacyPreserved: true,
    fallbackUsed,
    fallbackReason: fallbackUsed
      ? normalizeFallbackReason(safe.fallbackReason)
      : fallbackReason,
    confirmationPreserved: safe.confirmationPreserved === true,
    pendingActionPreserved: safe.pendingActionPreserved === true,
    duplicatePrevented: true,
    diagnostics: sanitizeDiagnostics(safe.diagnostics),
    safety: createRoutingSafety(safe.safety),
    latencyMs: round2(safe.latencyMs),
  };
  return deepFreeze(result);
}

export function validateConversationRoutingResult(result) {
  if (!isPlainObject(result)) {
    return { valid: false, errors: ['RESULT_NOT_OBJECT'] };
  }
  const errors = [];
  if (result.version !== CONVERSATION_ROUTING_VERSION) errors.push('VERSION_INVALID');
  if (typeof result.enabled !== 'boolean') errors.push('ENABLED_INVALID');
  if (typeof result.applied !== 'boolean') errors.push('APPLIED_INVALID');
  if (!isRoute(result.selectedRoute)) errors.push('SELECTED_ROUTE_INVALID');
  if (result.requestedNextStep !== null && typeof result.requestedNextStep !== 'string') {
    errors.push('REQUESTED_NEXT_STEP_INVALID');
  }
  if (!isRoutingSource(result.routeSource)) errors.push('ROUTE_SOURCE_INVALID');
  if (typeof result.sameTurn !== 'boolean') errors.push('SAME_TURN_INVALID');
  if (result.legacyPreserved !== true) errors.push('LEGACY_PRESERVED_FALSE');
  if (typeof result.fallbackUsed !== 'boolean') errors.push('FALLBACK_USED_INVALID');
  if (result.fallbackUsed) {
    if (!isRoutingFallbackReason(result.fallbackReason)) errors.push('FALLBACK_REASON_INVALID');
  } else if (result.fallbackReason !== null) {
    if (!isRoutingFallbackReason(result.fallbackReason)) errors.push('FALLBACK_REASON_INVALID');
  }
  if (typeof result.confirmationPreserved !== 'boolean') {
    errors.push('CONFIRMATION_PRESERVED_INVALID');
  }
  if (typeof result.pendingActionPreserved !== 'boolean') {
    errors.push('PENDING_ACTION_PRESERVED_INVALID');
  }
  if (result.duplicatePrevented !== true) errors.push('DUPLICATE_NOT_PREVENTED');
  if (!Array.isArray(result.diagnostics)) errors.push('DIAGNOSTICS_NOT_ARRAY');
  if (!isRoutingSafetyIntegral(result.safety)) errors.push('SAFETY_NOT_INTEGRAL');
  if (typeof result.latencyMs !== 'number' || !Number.isFinite(result.latencyMs)) {
    errors.push('LATENCY_INVALID');
  }
  const safetyKeys = Object.keys(result.safety);
  if (safetyKeys.some((key) => !isRoutingSafetyKey(key))) {
    errors.push('SAFETY_KEY_INVALID');
  }
  if (!isSerializableValue(result)) errors.push('RESULT_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

export function isConversationRoutingResultSerializable(result) {
  return isPlainObject(result) && isSerializableValue(result);
}
