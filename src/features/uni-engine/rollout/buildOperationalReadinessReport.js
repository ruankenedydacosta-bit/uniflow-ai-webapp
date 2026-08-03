// Uni Engine — Controlled Rollout: prontidão operacional (Parte 10, Bloco Único).
//
// Relatório final que consolida todas as informações de prontidão do turno.
// Baseado em:
//   - rollout (stage, eligibility, visible influence);
//   - Cognitive Orchestrator (orquestração válida);
//   - Conversation Routing (rota permitida);
//   - Integridade e segurança.
//
// Apenas consolida, sem reexecutar nenhuma camada.
// Sempre em memória, redigido e serializável.
import { deepFreeze } from '../cognitive-orchestrator/cognitiveOrchestratorContracts.js';
import { isCognitiveOrchestratorEnabledByConfig, isEnvironmentAllowedByOrchestratorPolicy } from '../cognitive-orchestrator/cognitiveOrchestratorPolicy.js';
import { isRolloutEnabledByConfig, isEnvironmentAllowedByRolloutPolicy } from './rolloutPolicy.js';
import { buildCognitiveOrchestratorSnapshot } from '../cognitive-orchestrator/buildCognitiveOrchestratorSnapshot.js';
import { buildRolloutSnapshot } from './buildRolloutSnapshot.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function warn(isDev, message) {
  if (isDev && typeof console?.warn === 'function') {
    console.warn(`[uni-engine] operational-readiness ${message}`);
  }
}

export function buildOperationalReadinessReport(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const isDev = Boolean(safe.isDev);

  try {
    const config = safe.config ?? null;
    const environment = typeof safe.environment === 'string' ? safe.environment : null;
    const userAuthorized = Boolean(safe.userAuthorized);

    const rolloutEnabled = isRolloutEnabledByConfig(config);
    const rolloutEnvironmentAllowed = isEnvironmentAllowedByRolloutPolicy(environment);
    const rolloutEligible = rolloutEnabled && rolloutEnvironmentAllowed && userAuthorized;

    const orchestratorEnabled = isCognitiveOrchestratorEnabledByConfig(config);
    const orchestratorEnvironmentAllowed = isEnvironmentAllowedByOrchestratorPolicy(environment);
    const orchestratorUserAuthorized = userAuthorized;

    const orchestrationValid = rolloutEligible && orchestratorEnabled && orchestratorEnvironmentAllowed && orchestratorUserAuthorized;

    const rolloutSnapshot = buildRolloutSnapshot({
      config,
      environment,
      userAuthorized,
      requestedStage: safe.requestedStage ?? 'ROLLOUT_OFF',
      isDev,
    });

    const cognitiveOrchestratorSnapshot = orchestrationValid
      ? buildCognitiveOrchestratorSnapshot({
          config,
          environment,
          authorized: orchestratorUserAuthorized,
          isDev,
          observation: safe.observation ?? null,
          guidance: safe.guidance ?? null,
          decision: safe.decision ?? null,
          capabilityReadiness: safe.capabilityReadiness ?? null,
          executionReadiness: safe.executionReadiness ?? null,
          application: safe.application ?? null,
          conversationPlan: safe.conversationPlan ?? null,
          conversationRoute: safe.conversationRoute ?? null,
        })
      : null;

    const readyForInternalDev = rolloutSnapshot.effectiveStage === 'ROLLOUT_INTERNAL' && orchestrationValid && cognitiveOrchestratorSnapshot?.orchestratorStatus === 'ORCHESTRATED';
    const readyForProduction = rolloutSnapshot.effectiveStage === 'ROLLOUT_BLOCKED' && !orchestrationValid;

    const report = {
      version: '1.0',
      status: readyForInternalDev ? 'OPERATIONAL_INTERNAL' : readyForProduction ? 'OPERATIONAL_BLOCKED' : 'OPERATIONAL_SHADOW_ONLY',
      readyForInternalDev,
      readyForProduction,
      rolloutStage: rolloutSnapshot.effectiveStage,
      rolloutEnabled,
      rolloutEnvironmentAllowed,
      rolloutEligible,
      orchestratorEnabled,
      orchestratorEnvironmentAllowed,
      orchestratorUserAuthorized,
      orchestrationValid,
      cognitiveOrchestratorSnapshot,
      diagnostics: [...rolloutSnapshot.diagnostics, ...(cognitiveOrchestratorSnapshot?.diagnostics ?? [])],
      metadata: {
        ...rolloutSnapshot.metadata,
        stage: rolloutSnapshot.effectiveStage,
        environment,
        authorized: userAuthorized,
        orchestrationValid,
        cognitiveOrchestratorValid: Boolean(cognitiveOrchestratorSnapshot),
        readyForInternalDev,
        readyForProduction,
      },
      serializable: true,
    };

    return deepFreeze(report);
  } catch (error) {
    warn(isDev, `error: ${error?.code ?? 'OPERATIONAL_READINESS_INTERNAL_ERROR'} :: ${error?.message ?? ''}`);
    const report = {
      version: '1.0',
      status: 'OPERATIONAL_BLOCKED',
      readyForInternalDev: false,
      readyForProduction: true,
      rolloutStage: 'ROLLOUT_OFF',
      rolloutEnabled: false,
      rolloutEnvironmentAllowed: false,
      rolloutEligible: false,
      orchestratorEnabled: false,
      orchestratorEnvironmentAllowed: false,
      orchestratorUserAuthorized: false,
      orchestrationValid: false,
      cognitiveOrchestratorSnapshot: null,
      diagnostics: [{ code: 'OPERATIONAL_READINESS_INTERNAL_ERROR', severity: 'ERROR', reason: error.message, module: 'operational-readiness', observational: true, source: 'operational-readiness' }],
      metadata: { stage: 'ROLLOUT_OFF', environment: null, authorized: false, orchestrationValid: false, cognitiveOrchestratorValid: false, readyForInternalDev: false, readyForProduction: true },
      serializable: true,
    };
    return deepFreeze(report);
  }
}