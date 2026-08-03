// Uni Engine — Controlled Rollout: evaluate eligibility (Parte 10, Bloco Único).
//
// Determina se o turno atual pode ser influenciado pelo Uni Engine com base em:
//   - estado de rollout (stage);
//   - eligibility (usuario autorizado, ambiente, config ativada);
//   - validação de camada cognitiva;
//   - status de prontidão.
//
// Apenas valida, não executa. Segurança absoluta: nenhum texto, nenhuma ação,
// nenhuma persistência. TODO resultado autorizado é puro, determinístico,
// somente em memória.
import {
  isRolloutEnabledByConfig,
  isEnvironmentAllowedByRolloutPolicy,
  isRolloutStageAllowed,
} from './rolloutPolicy.js';
import { buildRolloutSnapshot } from './buildRolloutSnapshot.js';
import { buildOperationalReadinessReport } from './buildOperationalReadinessReport.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function warn(isDev, message) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] rollout-evaluate ${message}`);
  }
}

function isRolloutStageEffective(current, request) {
  if (!isRolloutStage(request)) return false;
  const order = ROLLOUT_STAGES.indexOf;
  const currentIdx = order(current);
  const requestIdx = order(request);
  if (currentIdx === -1 || requestIdx === -1) return false;
  return requestIdx >= currentIdx;
}

export function evaluateRolloutEligibility(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const isDev = Boolean(safe.isDev);

  try {
    const config = safe.config ?? null;
    const environment = typeof safe.environment === 'string' ? safe.environment : null;
    const userAuthorized = Boolean(safe.userAuthorized);

    const requestedStage = typeof safe.requestedStage === 'string' ? safe.requestedStage : 'ROLLOUT_OFF';
    const sameTurn = Boolean(safe.sameTurn);

    const rolloutEnabled = isRolloutEnabledByConfig(config);
    const environmentAllowed = isEnvironmentAllowedByRolloutPolicy(environment);

    if (!rolloutEnabled || !environmentAllowed) {
      const effectiveStage = rolloutEnabled ? 'ROLLOUT_SHADOW' : 'ROLLOUT_OFF';
      const snapshot = buildRolloutSnapshot({
        config,
        environment,
        userAuthorized,
        requestedStage: effectiveStage,
        isDev,
      });
      const report = buildOperationalReadinessReport({
        config,
        environment,
        userAuthorized,
        requestedStage: effectiveStage,
        isDev,
        sameTurn,
        circuitBreakerClosed: false,
        observation: null,
        guidance: null,
        decision: null,
        capabilityReadiness: null,
        executionReadiness: null,
        application: null,
        conversationPlan: null,
        conversationRoute: null,
      });
      return { eligible: false, visibleInfluenceAllowed: false, rolloutSnapshot: snapshot, readinessReport: report };
    }

    if (!isRolloutStageAllowed(config, requestedStage, environment)) {
      const snapshot = buildRolloutSnapshot({
        config,
        environment,
        userAuthorized,
        requestedStage: 'ROLLOUT_OFF',
        isDev,
      });
      const report = buildOperationalReadinessReport({
        config,
        environment,
        userAuthorized,
        requestedStage: 'ROLLOUT_OFF',
        isDev,
        sameTurn,
        circuitBreakerClosed: false,
        observation: null,
        guidance: null,
        decision: null,
        capabilityReadiness: null,
        executionReadiness: null,
        application: null,
        conversationPlan: null,
        conversationRoute: null,
      });
      return { eligible: false, visibleInfluenceAllowed: false, rolloutSnapshot: snapshot, readinessReport: report };
    }

    const effectiveStage = requestedStage;
    const eligible = userAuthorized;
    const visibleInfluenceAllowed = eligible && isRolloutStageEffective(effectiveStage, requestedStage);

    const snapshot = buildRolloutSnapshot({
      config,
      environment,
      userAuthorized,
      requestedStage: effectiveStage,
      isDev,
    });

    const report = buildOperationalReadinessReport({
      config,
      environment,
      userAuthorized,
      requestedStage: effectiveStage,
      isDev,
      sameTurn,
      circuitBreakerClosed: safe.circuitBreakerClosed ?? false,
      observation: safe.observation ?? null,
      guidance: safe.guidance ?? null,
      decision: safe.decision ?? null,
      capabilityReadiness: safe.capabilityReadiness ?? null,
      executionReadiness: safe.executionReadiness ?? null,
      application: safe.application ?? null,
      conversationPlan: safe.conversationPlan ?? null,
      conversationRoute: safe.conversationRoute ?? null,
    });

    return { eligible, visibleInfluenceAllowed, rolloutSnapshot: snapshot, readinessReport: report };
  } catch (error) {
    warn(isDev, `error: ${error?.code ?? 'ROLLOUT_ELIGIBILITY_INTERNAL_ERROR'} :: ${error?.message ?? ''}`);
    const snapshot = buildRolloutSnapshot({
      config: null,
      environment: null,
      userAuthorized: false,
      requestedStage: 'ROLLOUT_OFF',
      isDev,
    });
    const report = buildOperationalReadinessReport({
      config: null,
      environment: null,
      userAuthorized: false,
      requestedStage: 'ROLLOUT_OFF',
      isDev,
      sameTurn,
      circuitBreakerClosed: false,
      observation: null,
      guidance: null,
      decision: null,
      capabilityReadiness: null,
      executionReadiness: null,
      application: null,
      conversationPlan: null,
      conversationRoute: null,
    });
    return { eligible: false, visibleInfluenceAllowed: false, rolloutSnapshot: snapshot, readinessReport: report };
  }
}