// Uni Engine — Controlled Rollout: política de rollout.
//
// Política fechada para activação gradual do Uni Engine, permitindo controle
// detalhado de quais capacidades podem ser aplicadas e quando.
import { ROLLOUT_VERSION, ROLLOUT_STAGES, isRolloutStage } from './rolloutTypes.js';

export const ROLLOUT_POLICY = Object.freeze({
  version: ROLLOUT_VERSION,
  enabledByDefault: false,
  requireEngine: true,
  requireActivation: true,
  requireIntegration: true,
  requireApplication: true,
  allowProductionActivation: false,
  requireStageExplicit: true,
  maxDiagnostics: 12,
  maxSources: 8,
});

export function isRolloutEnabledByConfig(config) {
  const safeConfig = config ?? {};
  if (safeConfig.rolloutEnabled !== true) return false;
  if (safeConfig.enabled !== true) return false;
  if (safeConfig.activationEnabled !== true) return false;
  if (safeConfig.integrationEnabled !== true) return false;
  if (safeConfig.applicationEnabled !== true) return false;
  return true;
}

export function isEnvironmentAllowedByRolloutPolicy(environment) {
  if (typeof environment !== 'string') return false;
  if (environment === 'production' && !ROLLOUT_POLICY.allowProductionActivation) {
    return false;
  }
  return ['development', 'staging', 'test'].includes(environment);
}

export function isStageAllowedByStage(stage) {
  if (!isRolloutStage(stage)) return false;
  switch (stage) {
    case 'ROLLOUT_OFF':
      return true;
    case 'ROLLOUT_SHADOW':
      return true;
    case 'ROLLOUT_INTERNAL':
      return true;
    case 'ROLLOUT_CANARY':
      return true;
    case 'ROLLOUT_BLOCKED':
      return true;
    default:
      return false;
  }
}

export function isRolloutStageEffective(current, request) {
  if (!isRolloutStage(request)) return false;
  const currentIdx = ROLLOUT_STAGES.indexOf(current);
  const requestIdx = ROLLOUT_STAGES.indexOf(request);
  if (currentIdx === -1 || requestIdx === -1) return false;
  return requestIdx >= currentIdx;
}

export function isRolloutStageAllowed(config, requestedStage, environment) {
  if (!isRolloutEnabledByConfig(config)) return false;
  if (!isEnvironmentAllowedByRolloutPolicy(environment)) return false;
  if (!isRolloutStage(requestedStage)) return false;
  if (!isStageAllowedByStage(requestedStage)) return false;
  if (environment === 'production' && requestedStage === 'ROLLOUT_INTERNAL') return false;
  if (environment === 'production' && requestedStage === 'ROLLOUT_CANARY') return false;
  if (environment === 'production' && requestedStage === 'ROLLOUT_SHADOW') return false;
  return true;
}