// Observability — snapshot consolidado (Fase 10).
//
// buildObservabilitySnapshot({ config, result, health, telemetryErrors })
// lê SOMENTE o config e o resultado da última rodada Shadow (nunca executa
// os módulos) e produz um snapshot serializável sem dados sensíveis:
// versões, módulos ativos/desativados, latência por módulo, fallback,
// activation, shadow, reflection, goals, planning, confidence, risk,
// circuit breaker e health.
import {
  UNI_ENGINE_MODULE_NAMES,
  UNI_ENGINE_REVISION,
  UNI_ENGINE_VERSION,
} from '../uniEngineContracts.js';
import {
  createObservabilitySnapshot,
  createModuleObservability,
  validateObservabilitySnapshot,
  redactObservabilitySnapshot,
} from './observabilityContracts.js';
import {
  observabilityConfidenceBand,
  observabilityRiskBand,
} from './observabilityTypes.js';
import { runEngineHealthCheck } from '../health/buildEngineHealth.js';
import { getCircuitBreakerStatus } from '../activation/circuitBreaker.js';
import { UNI_ENGINE_MODULE_LATENCY_KEYS } from './latencySources.js';

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? Number(value.toFixed(3)) : null;
}

function safeSection(result, key) {
  const safe = result && typeof result === 'object' ? result : {};
  const section = safe[key];
  return section && typeof section === 'object' ? section : null;
}

function moduleStatusOf(health, module) {
  const check = Array.isArray(health?.checks)
    ? health.checks.find((entry) => entry?.module === module)
    : null;
  if (!check) return 'unknown';
  if (check.enabled === false) return 'disabled';
  if (check.status === 'disabled') return 'disabled';
  if (check.status === 'healthy' || check.status === 'degraded') return 'active';
  if (check.status === 'inconsistent') return 'inconsistent';
  if (check.status === 'contract_error' || check.status === 'telemetry_error') return 'error';
  if (check.status === 'fallback_active') return 'error';
  if (check.status === 'activation_blocked') return 'error';
  return 'unknown';
}

function latencyOf(result, module) {
  const safe = result && typeof result === 'object' ? result : {};
  switch (module) {
    case 'core':
      return finiteOrNull(safe.diagnostics?.latencyMs);
    case 'memory':
      return finiteOrNull(safe.persistentMemory?.diagnostics?.latencyMs);
    case 'epistemic':
      return finiteOrNull(safe.epistemicModel?.latencyMs);
    case 'decision':
      return finiteOrNull(safe.decisionLayer?.latencyMs)
        ?? finiteOrNull(safe.decisionLayer?.latency?.totalMs);
    case 'planning':
      return finiteOrNull(safe.planning?.latencyMs)
        ?? finiteOrNull(safe.planning?.latency?.totalMs);
    case 'goals':
      return finiteOrNull(safe.goals?.latencyMs);
    case 'reflection':
      return finiteOrNull(safe.reflection?.latencyMs);
    case 'activation': {
      const decisions = Array.isArray(safe.activation?.decisions)
        ? safe.activation.decisions
        : [];
      const latencies = decisions
        .map((decision) => finiteOrNull(decision?.latencyMs))
        .filter((value) => value !== null);
      return latencies.length > 0 ? Math.max(...latencies) : null;
    }
    default:
      return null;
  }
}

function collectFallbackReasons(result) {
  const safe = result && typeof result === 'object' ? result : {};
  const reasons = [];
  if (safe.fallbackUsed || safe.diagnostics?.fallbackUsed) reasons.push('CORE_FALLBACK');
  if (safe.decisionLayer?.fallbackUsed) reasons.push('DECISION_FALLBACK');
  if (safe.planning?.fallbackUsed) reasons.push('PLANNING_FALLBACK');
  if (safe.goals?.fallbackUsed) reasons.push('GOALS_FALLBACK');
  if (safe.reflection?.fallbackUsed) reasons.push('REFLECTION_FALLBACK');
  // Activation em shadow NUNCA é fallback: decisões SHADOW_ONLY/ELIGIBLE
  // são o comportamento esperado da Fase 9. Apenas erro interno (ERROR_SAFE)
  // indica um caminho inesperado que merece sinalização.
  const activationDecisions = Array.isArray(safe.activation?.decisions)
    ? safe.activation.decisions
    : [];
  if (activationDecisions.some((decision) => decision?.activationStatus === 'ERROR_SAFE')) {
    reasons.push('ACTIVATION_FALLBACK');
  }
  return reasons;
}

export function buildObservabilitySnapshot(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const config = safe.config ?? null;
  const result = safe.result ?? null;
  const telemetryErrors = Array.isArray(safe.telemetryErrors) ? safe.telemetryErrors : [];
  const correlationId = typeof safe.correlationId === 'string' ? safe.correlationId : null;

  const health = safe.health ?? runEngineHealthCheck({
    config,
    result,
    telemetryErrors,
    correlationId,
  });

  if (!config?.enabled) {
    const empty = createObservabilitySnapshot({
      engineVersion: UNI_ENGINE_VERSION,
      revision: UNI_ENGINE_REVISION,
      correlationId,
      timestamp: new Date().toISOString(),
      totalLatencyMs: 0,
      health: 'disabled',
      modules: [],
      activeModules: [],
      disabledModules: [...UNI_ENGINE_MODULE_NAMES],
      errorModules: [],
      latencyByModule: {},
      flags: {},
      confidence: { band: null, source: null },
      risk: { band: null, source: null },
      shadow: { active: false },
      fallback: { active: false, reasons: [] },
      activation: {},
      reflection: {},
      goals: {},
      planning: {},
      circuitBreaker: { open: false, openedCapabilities: [] },
      telemetry: { enabled: false, errorCount: 0 },
    });
    return redactObservabilitySnapshot(empty);
  }

  const modules = [];
  const latencyByModule = {};
  for (const module of UNI_ENGINE_MODULE_NAMES) {
    const status = moduleStatusOf(health, module);
    const check = Array.isArray(health?.checks)
      ? health.checks.find((entry) => entry?.module === module)
      : null;
    const latencyMs = latencyOf(result, module);
    if (latencyMs !== null) latencyByModule[module] = latencyMs;
    modules.push(createModuleObservability({
      module,
      enabled: Boolean(check?.enabled ?? false),
      shadowMode: Boolean(check?.shadowMode ?? false),
      status,
      latencyMs,
      errorCode: check?.errorCode ?? null,
    }));
  }

  const activeModules = modules
    .filter((entry) => entry.status === 'active')
    .map((entry) => entry.module);
  const disabledModules = modules
    .filter((entry) => entry.status === 'disabled')
    .map((entry) => entry.module);
  const errorModules = modules
    .filter((entry) => entry.status === 'error')
    .map((entry) => entry.module);

  const classification = result?.classification ?? null;
  const decisionLayer = safeSection(result, 'decisionLayer');
  const planning = safeSection(result, 'planning');
  const goals = safeSection(result, 'goals');
  const reflection = safeSection(result, 'reflection');
  const activation = safeSection(result, 'activation');

  const confidenceSource = decisionLayer?.confidence != null
    ? 'decision'
    : result?.epistemicState?.confidence != null
      ? 'epistemic_state'
      : classification?.confidence != null
        ? 'classification'
        : null;
  const confidenceValue = decisionLayer?.confidence
    ?? result?.epistemicState?.confidence
    ?? classification?.confidence
    ?? null;
  const riskValue = decisionLayer?.risk ?? planning?.risk ?? null;

  const activationDecisions = Array.isArray(activation?.decisions)
    ? activation.decisions
    : [];
  const activationCounts = activationDecisions.reduce((acc, decision) => {
    const status = decision?.activationStatus ?? 'UNKNOWN';
    if (status === 'ACTIVE_TEST' || status === 'ACTIVE_ROLLOUT') acc.active += 1;
    else if (status === 'SHADOW_ONLY' || status === 'ELIGIBLE') acc.shadow += 1;
    else if (status === 'ERROR_SAFE') acc.error += 1;
    else acc.blocked += 1;
    return acc;
  }, { active: 0, shadow: 0, blocked: 0, error: 0 });

  // Circuit breaker — estado em memória, sem identidades.
  const openedCapabilities = [];
  for (const capability of ['METADATA_ONLY', 'DIAGNOSTICS_ONLY', 'QUESTION_GUIDANCE', 'CLARIFICATION_GUIDANCE', 'RESPONSE_STYLE_GUIDANCE', 'RESPONSE_LENGTH_GUIDANCE', 'CATEGORY_SUGGESTION', 'ACCOUNT_SUGGESTION', 'GOAL_SUGGESTION', 'PLANNING_SUGGESTION', 'RISK_WARNING', 'CONFIDENCE_DISCLOSURE', 'MEMORY_READ_GUIDANCE', 'EPISTEMIC_CAUTION', 'DECISION_RECOMMENDATION']) {
    const status = getCircuitBreakerStatus(capability);
    if (status.open) openedCapabilities.push(capability);
  }

  const fallbackReasons = collectFallbackReasons(result);

  const snapshot = createObservabilitySnapshot({
    engineVersion: UNI_ENGINE_VERSION,
    revision: UNI_ENGINE_REVISION,
    correlationId,
    timestamp: new Date().toISOString(),
    totalLatencyMs: finiteOrNull(result?.diagnostics?.latencyMs),
    health: health.status,
    modules,
    activeModules,
    disabledModules,
    errorModules,
    latencyByModule,
    flags: {
      enabled: Boolean(config.enabled),
      shadowMode: Boolean(config.shadowMode),
      telemetryEnabled: Boolean(config.telemetryEnabled),
      memoryEnabled: Boolean(config.memoryEnabled),
      epistemicEnabled: Boolean(config.epistemicEnabled),
      decisionEnabled: Boolean(config.decisionEnabled),
      planningEnabled: Boolean(config.planningEnabled),
      goalsEnabled: Boolean(config.goalsEnabled),
      reflectionEnabled: Boolean(config.reflectionEnabled),
      activationEnabled: Boolean(config.activationEnabled),
      learningCandidatesEnabled: Boolean(config.learningCandidatesEnabled),
    },
    confidence: {
      band: observabilityConfidenceBand(confidenceValue),
      source: confidenceSource,
    },
    risk: {
      band: observabilityRiskBand(riskValue),
      source: riskValue !== null ? (decisionLayer ? 'decision' : 'planning') : null,
    },
    shadow: {
      active: Boolean(config.shadowMode),
      coreAppliedToDecision: Boolean(result?.epistemicModel?.appliedToDecision)
        || Boolean(result?.persistentMemory?.appliedToDecision)
        || Boolean(result?.decisionLayer?.shadow?.appliedToDecision),
    },
    fallback: {
      active: fallbackReasons.length > 0,
      reasons: fallbackReasons,
    },
    activation: {
      enabled: Boolean(config.activationEnabled),
      shadowMode: Boolean(config.activationShadowMode),
      decisionsCount: activationDecisions.length,
      activeCount: activationCounts.active,
      shadowCount: activationCounts.shadow,
      blockedCount: activationCounts.blocked,
      errorCount: activationCounts.error,
    },
    reflection: reflection
      ? {
          enabled: Boolean(reflection.enabled),
          triggered: Boolean(reflection.reflectionTriggered),
          candidateCount: Array.isArray(reflection.learningCandidates)
            ? reflection.learningCandidates.length
            : 0,
          conflictCount: Array.isArray(reflection.conflicts) ? reflection.conflicts.length : 0,
          signalCount: Array.isArray(reflection.signals) ? reflection.signals.length : 0,
          fallback: Boolean(reflection.fallbackUsed),
        }
      : {},
    goals: goals
      ? {
          enabled: Boolean(goals.enabled),
          detected: Boolean(goals.goalDetected),
          status: goals.status ?? 'UNKNOWN',
          confidenceBand: observabilityConfidenceBand(goals.confidence),
          riskBand: Array.isArray(goals.risks) && goals.risks.length > 0 ? 'warning' : null,
          fallback: Boolean(goals.fallbackUsed),
        }
      : {},
    planning: planning
      ? {
          enabled: Boolean(planning.enabled),
          status: planning.status ?? 'UNKNOWN',
          complexity: planning.complexity ?? 'LOW',
          confidenceBand: observabilityConfidenceBand(planning.confidence),
          riskBand: planning.risk ?? null,
          stepCount: Array.isArray(planning.suggestedSteps) ? planning.suggestedSteps.length : 0,
          fallback: Boolean(planning.fallbackUsed),
        }
      : {},
    circuitBreaker: {
      open: openedCapabilities.length > 0,
      openedCapabilities,
    },
    telemetry: {
      enabled: Boolean(config.telemetryEnabled),
      errorCount: telemetryErrors.length,
    },
  });

  return redactObservabilitySnapshot(snapshot);
}

export function summarizeObservability(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return {
      healthy: false,
      enabled: false,
      activeModules: [],
      disabledModules: [],
      totalLatencyMs: null,
    };
  }
  return {
    healthy: snapshot.health === 'healthy',
    enabled: snapshot.activeModules.includes('core'),
    activeModules: [...snapshot.activeModules],
    disabledModules: [...snapshot.disabledModules],
    totalLatencyMs: snapshot.totalLatencyMs ?? null,
  };
}

export function validateObservabilitySnapshotOutput(snapshot) {
  return validateObservabilitySnapshot(snapshot);
}

export { UNI_ENGINE_MODULE_LATENCY_KEYS };
