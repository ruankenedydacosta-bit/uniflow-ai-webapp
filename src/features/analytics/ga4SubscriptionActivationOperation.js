import { trackGa4SubscriptionActivated } from './ga4ProductEvents.js';

const SUBSCRIPTION_ACTIVATION_KEY = 'uniflow:ga4-subscription-activation:v1';
const ACTIVATION_STATES = Object.freeze({
  PENDING: 'pending',
  CONSUMED: 'consumed',
});

const result = (sent, reason) => Object.freeze({ sent, reason });

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.sessionStorage;
  } catch {
    return null;
  }
}

function writeState(state, storage) {
  const resolvedStorage = resolveStorage(storage);
  try {
    resolvedStorage?.setItem(SUBSCRIPTION_ACTIVATION_KEY, state);
    return resolvedStorage?.getItem(SUBSCRIPTION_ACTIVATION_KEY) === state;
  } catch {
    return false;
  }
}

export function readGa4SubscriptionActivationState(storage) {
  const resolvedStorage = resolveStorage(storage);
  try {
    const state = resolvedStorage?.getItem(SUBSCRIPTION_ACTIVATION_KEY);
    return Object.values(ACTIVATION_STATES).includes(state) ? state : null;
  } catch {
    return null;
  }
}

// Marcador estritamente categórico e efêmero. Ele não contém user/workspace,
// checkout, cobrança, valor ou qualquer outro dado pessoal/financeiro.
export function persistPendingGa4SubscriptionActivation(storage) {
  return writeState(ACTIVATION_STATES.PENDING, storage);
}

// Só remove uma tentativa ainda pendente. O tombstone "consumed" permanece
// até a aba terminar ou até um novo checkout de cartão sobrescrevê-lo.
export function clearPendingGa4SubscriptionActivation(storage) {
  const resolvedStorage = resolveStorage(storage);
  try {
    if (resolvedStorage?.getItem(SUBSCRIPTION_ACTIVATION_KEY) !== ACTIVATION_STATES.PENDING) {
      return false;
    }
    resolvedStorage.removeItem(SUBSCRIPTION_ACTIVATION_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Emite somente quando o backend confirma `active` e há uma das duas provas:
 * 1. esta montagem observou `pending -> active`; ou
 * 2. o checkout de cartão deixou um marcador `pending` antes do redirect.
 *
 * O estado é consumido antes do tracker síncrono, impedindo replay em reload,
 * polling repetido e remontagem por StrictMode. Se sessionStorage falhar, uma
 * transição presenciada ainda pode ser medida; a deduplicação por montagem
 * continua sendo responsabilidade do lifecycle injetado.
 */
export function trackConfirmedGa4SubscriptionActivation({
  previousStatus = null,
  currentStatus = null,
  storage,
  trackActivated = trackGa4SubscriptionActivated,
} = {}) {
  if (currentStatus !== 'active') return result(false, 'not_active');

  const state = readGa4SubscriptionActivationState(storage);
  if (state === ACTIVATION_STATES.CONSUMED) return result(false, 'duplicate');

  const witnessedTransition = previousStatus === 'pending';
  const resumedCardCheckout = state === ACTIVATION_STATES.PENDING;
  if (!witnessedTransition && !resumedCardCheckout) {
    return result(false, 'missing_transition');
  }

  // Best effort: a indisponibilidade de storage nunca bloqueia o produto nem
  // uma transição realmente presenciada nesta montagem.
  writeState(ACTIVATION_STATES.CONSUMED, storage);
  try {
    return trackActivated() ?? result(false, 'failed');
  } catch {
    return result(false, 'failed');
  }
}
