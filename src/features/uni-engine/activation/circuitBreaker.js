// Activation Engine — circuit breaker local (Fase 9).
//
// Estado SOMENTE em memória. Bloqueia temporariamente uma capacidade após
// sequência de erros ou divergências altas. Nunca bloqueia o pipeline
// legado. Reset seguro por reload (estado é descartável).
import { ACTIVATION_POLICY } from './activationPolicy.js';
import { isValidActivationCapability } from './activationTypes.js';

const state = new Map();

function normalizeCapability(capability) {
  return isValidActivationCapability(capability) ? capability : 'UNKNOWN';
}

function getEntry(capability) {
  const key = normalizeCapability(capability);
  if (!state.has(key)) {
    state.set(key, {
      failures: 0,
      divergences: 0,
      successes: 0,
      openedAt: null,
    });
  }
  return state.get(key);
}

function shouldOpen(entry) {
  const { circuitBreaker } = ACTIVATION_POLICY;
  return entry.failures >= circuitBreaker.failureThreshold
    || entry.divergences >= circuitBreaker.divergenceThreshold;
}

export function isCircuitOpen(capability) {
  const entry = getEntry(capability);
  if (!entry.openedAt) return false;
  const elapsed = Date.now() - entry.openedAt;
  return elapsed < ACTIVATION_POLICY.circuitBreaker.openWindowMs;
}

export function recordCircuitFailure(capability) {
  const entry = getEntry(capability);
  entry.failures += 1;
  if (shouldOpen(entry) && !entry.openedAt) {
    entry.openedAt = Date.now();
  }
  return { open: isCircuitOpen(capability), failures: entry.failures };
}

export function recordCircuitDivergence(capability) {
  const entry = getEntry(capability);
  entry.divergences += 1;
  if (shouldOpen(entry) && !entry.openedAt) {
    entry.openedAt = Date.now();
  }
  return { open: isCircuitOpen(capability), divergences: entry.divergences };
}

export function recordCircuitSuccess(capability) {
  const entry = getEntry(capability);
  entry.successes += 1;
  if (entry.successes >= 2 && entry.openedAt) {
    entry.openedAt = null;
    entry.failures = 0;
    entry.divergences = 0;
  }
  return { open: isCircuitOpen(capability) };
}

export function resetCircuitBreaker() {
  state.clear();
  return { reset: true };
}

export function getCircuitBreakerStatus(capability) {
  const entry = getEntry(capability);
  return {
    capability: normalizeCapability(capability),
    open: isCircuitOpen(capability),
    failures: entry.failures,
    divergences: entry.divergences,
    successes: entry.successes,
  };
}

export function getCircuitBreakerStateSize() {
  return state.size;
}
