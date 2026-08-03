// Uni Engine — Controlled Rollout: builder principal (Parte 10, Bloco Único).
//
// Constrói o snapshot de rollout a partir do estado já produzido.
// NÃO reexecuta nenhuma camada. NÃO toma decisões. NÃO altera resposta.
// Somente valida gates, seleciona stage e entrega o estado de rollout.
// Qualquer falha → rollout OFF (blocked).
import { isRolloutEnabledByConfig, isEnvironmentAllowedByRolloutPolicy, isRolloutStageAllowed } from './rolloutPolicy.js';
import { createEmptyRolloutSnapshot, createRolloutSnapshot, validateRolloutSnapshot, deepFreeze } from './rolloutContracts.js';
import { buildRolloutDiagnostics } from './buildRolloutDiagnostics.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function warn(isDev, message) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] rollout ${message}`);
  }
}

export function buildRolloutSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const isDev = Boolean(safe.isDev);

  try {
    const config = safe.config ?? null;
    const environment = typeof safe.environment === 'string' ? safe.environment : null;
    const userAuthorized = Boolean(safe.userAuthorized);

    const rolloutEnabled = isRolloutEnabledByConfig(config);
    const environmentAllowed = isEnvironmentAllowedByRolloutPolicy(environment);

    if (!rolloutEnabled || !environmentAllowed) {
      const effectiveStage = rolloutEnabled ? 'ROLLOUT_SHADOW' : 'ROLLOUT_OFF';
      const diagnostics = buildRolloutDiagnostics({
        requestedStage: 'ROLLOUT_OFF',
        effectiveStage,
        rolloutEnabled,
        environmentAllowed,
        userAuthorized,
        eligible: false,
        visibleInfluenceAllowed: false,
      });
      const snapshot = createEmptyRolloutSnapshot({
        requestedStage: 'ROLLOUT_OFF',
        effectiveStage,
        environmentAllowed,
        userAuthorized,
        rolloutEnabled,
        sameTurn: false,
        circuitBreakerClosed: false,
      });
      return deepFreeze({
        ...snapshot,
        diagnostics,
        metadata: { ...snapshot.metadata, stage: effectiveStage, environment, authorized: userAuthorized },
      });
    }

    const requestedStage = safe.requestedStage ?? 'ROLLOUT_OFF';
    if (!isRolloutStageAllowed(config, requestedStage, environment)) {
      const fallback = 'ROLLOUT_OFF';
      const diagnostics = buildRolloutDiagnostics({
        requestedStage: fallback,
        effectiveStage: fallback,
        rolloutEnabled,
        environmentAllowed,
        userAuthorized,
        eligible: false,
        visibleInfluenceAllowed: false,
      });
      const snapshot = createEmptyRolloutSnapshot({
        requestedStage: fallback,
        effectiveStage: fallback,
        environmentAllowed,
        userAuthorized,
        rolloutEnabled,
        sameTurn: false,
        circuitBreakerClosed: false,
      });
      return deepFreeze({
        ...snapshot,
        diagnostics,
        metadata: { ...snapshot.metadata, stage: fallback, environment, authorized: userAuthorized },
      });
    }

    const stage = requestedStage;
    const eligible = userAuthorized;
    const visibleInfluenceAllowed = eligible && ['ROLLOUT_SHADOW', 'ROLLOUT_INTERNAL', 'ROLLOUT_CANARY'].includes(stage);

    const diagnostics = buildRolloutDiagnostics({
      requestedStage: stage,
      effectiveStage: stage,
      rolloutEnabled,
      environmentAllowed,
      userAuthorized,
      eligible,
      visibleInfluenceAllowed,
    });

    const snapshot = createRolloutSnapshot({
      requestedStage: stage,
      effectiveStage: stage,
      environment,
      userAuthorized,
      config,
      sameTurn: false,
      circuitBreakerClosed: false,
    });

    const validation = validateRolloutSnapshot(snapshot);
    if (!validation.valid) {
      warn(isDev, `contract invalid: ${validation.errors.join(',')}`);
      const fallback = createEmptyRolloutSnapshot({ requestedStage: 'ROLLOUT_OFF', effectiveStage: 'ROLLOUT_OFF', environmentAllowed, userAuthorized, rolloutEnabled, sameTurn: false, circuitBreakerClosed: false });
      return deepFreeze({
        ...fallback,
        diagnostics: buildRolloutDiagnostics({ requestedStage: 'ROLLOUT_OFF', effectiveStage: 'ROLLOUT_OFF', rolloutEnabled, environmentAllowed, userAuthorized, eligible: false, visibleInfluenceAllowed: false }),
        metadata: { ...fallback.metadata, stage: 'ROLLOUT_OFF', environment, authorized: userAuthorized },
      });
    }

    return deepFreeze({
      ...snapshot,
      diagnostics,
      metadata: {
        ...snapshot.metadata,
        stage,
        environment,
        authorized: userAuthorized,
      },
    });
  } catch (error) {
    warn(isDev, `error: ${error?.code ?? 'ROLLOUT_INTERNAL_ERROR'} :: ${error?.message ?? ''}`);
    const fallback = createEmptyRolloutSnapshot({ requestedStage: 'ROLLOUT_OFF', effectiveStage: 'ROLLOUT_OFF', environmentAllowed: false, userAuthorized: false, rolloutEnabled: false, sameTurn: false, circuitBreakerClosed: false });
    return deepFreeze({
      ...fallback,
      metadata: { ...fallback.metadata, stage: 'ROLLOUT_OFF' },
    });
  }
}