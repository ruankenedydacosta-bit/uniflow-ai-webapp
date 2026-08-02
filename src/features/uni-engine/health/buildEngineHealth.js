// Health Check — diagnóstico geral da Uni Engine (Fase 10).
//
// runEngineHealthCheck({ config, result, telemetryErrors, isDev }) produz um
// contrato serializável com o status agregado e um check por módulo.
//
// Regras de status (ordem de prioridade):
//   1. motor desligado          → disabled;
//   2. falha de telemetria      → telemetry_error;
//   3. falha de contrato        → contract_error;
//   4. inconsistência flag/seção → inconsistent;
//   5. activation bloqueada     → activation_blocked;
//   6. fallback ativo           → fallback_active;
//   7. módulos com avisos       → degraded;
//   8. tudo consistente         → healthy.
//
// O check NUNCA executa nada, NUNCA registra dados sensíveis e NUNCA altera
// o pipeline: é leitura pura do config + resultado da última rodada Shadow.
import {
  UNI_ENGINE_MODULE_NAMES,
  UNI_ENGINE_REVISION,
  UNI_ENGINE_VERSION,
  isSerializableValue,
} from '../uniEngineContracts.js';
import {
  createHealthCheck,
  createModuleHealth,
  validateHealthCheck,
} from './healthContracts.js';
import { isValidHealthStatus } from './healthTypes.js';
import { validatePlanningResult } from '../planning/planningContracts.js';
import { validateGoalEngineResult } from '../goals/goalContracts.js';
import { validateReflectionResult } from '../reflection/reflectionContracts.js';
import { validateDecisionResult } from '../decision/decisionContracts.js';
import { validateActivationDecision } from '../activation/activationContracts.js';
import { isUniEngineShadowEnabled } from '../uniEngineConfig.js';

function nowMillis() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// Leitura pura da latência de cada seção (nunca executa os módulos).
function sectionLatencyMs(result, module) {
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
    case 'telemetry':
      return null;
    default:
      return null;
  }
}

function moduleErrorCode(result, module) {
  const safe = result && typeof result === 'object' ? result : {};
  switch (module) {
    case 'core':
      return safe.diagnostics?.errorCode ?? null;
    case 'memory':
      return safe.persistentMemory?.diagnostics?.errorCode ?? null;
    case 'decision':
      return safe.decisionLayer?.errorCode ?? null;
    case 'planning':
      return safe.planning?.errorCode ?? null;
    case 'goals':
      return safe.goals?.errorCode ?? null;
    case 'reflection':
      return safe.reflection?.errorCode ?? null;
    default:
      return null;
  }
}

function isFallbackActiveIn(result, module) {
  const safe = result && typeof result === 'object' ? result : {};
  switch (module) {
    case 'core':
      return Boolean(safe.diagnostics?.fallbackUsed) || Boolean(safe.fallbackUsed);
    case 'decision':
      return Boolean(safe.decisionLayer?.fallbackUsed);
    case 'planning':
      return Boolean(safe.planning?.fallbackUsed);
    case 'goals':
      return Boolean(safe.goals?.fallbackUsed);
    case 'reflection':
      return Boolean(safe.reflection?.fallbackUsed);
    case 'activation': {
      const decisions = Array.isArray(safe.activation?.decisions)
        ? safe.activation.decisions
        : [];
      return decisions.some((decision) => Boolean(decision?.fallbackUsed));
    }
    default:
      return false;
  }
}

function validateSectionContract(result, module) {
  const safe = result && typeof result === 'object' ? result : {};
  switch (module) {
    case 'decision':
      return safe.decisionLayer ? validateDecisionResult(safe.decisionLayer) : { valid: true, errors: [] };
    case 'planning':
      return safe.planning ? validatePlanningResult(safe.planning) : { valid: true, errors: [] };
    case 'goals':
      return safe.goals ? validateGoalEngineResult(safe.goals) : { valid: true, errors: [] };
    case 'reflection':
      return safe.reflection ? validateReflectionResult(safe.reflection) : { valid: true, errors: [] };
    case 'activation': {
      const decisions = Array.isArray(safe.activation?.decisions)
        ? safe.activation.decisions
        : [];
      for (const decision of decisions) {
        const validation = validateActivationDecision(decision);
        if (!validation.valid) {
          return { valid: false, errors: validation.errors.map((code) => `ACTIVATION_${code}`) };
        }
      }
      return { valid: true, errors: [] };
    }
    default:
      return { valid: true, errors: [] };
  }
}

function buildModuleChecks({ config, result, telemetryErrors }) {
  const checks = [];
  const engineEnabled = Boolean(config?.enabled);
  const shadowMode = Boolean(config?.shadowMode);
  const safeResult = result && typeof result === 'object' ? result : null;
  const telemetryErrorCount = Array.isArray(telemetryErrors) ? telemetryErrors.length : 0;

  const addCheck = (module, overrides) => {
    checks.push(createModuleHealth({
      module,
      enabled: Boolean(overrides.enabled),
      shadowMode: Boolean(overrides.shadowMode),
      status: isValidHealthStatus(overrides.status) ? overrides.status : 'degraded',
      latencyMs: overrides.latencyMs,
      errorCode: overrides.errorCode,
      detail: overrides.detail,
    }));
  };

  // Telemetria é verificada primeiro (afeta todo o motor).
  const telemetryEnabled = Boolean(config?.telemetryEnabled);
  addCheck('telemetry', {
    enabled: telemetryEnabled,
    shadowMode,
    status: telemetryEnabled && telemetryErrorCount > 0 ? 'telemetry_error' : 'healthy',
    latencyMs: null,
    errorCode: telemetryEnabled && telemetryErrorCount > 0 ? 'TELEMETRY_EMISSION_FAILED' : null,
    detail: telemetryEnabled && telemetryErrorCount > 0 ? `${telemetryErrorCount} emission failure(s)` : null,
  });

  // Core (Fases 1–2) — pipeline analítico principal.
  if (safeResult) {
    const coreError = moduleErrorCode(safeResult, 'core');
    const fallback = isFallbackActiveIn(safeResult, 'core');
    addCheck('core', {
      enabled: engineEnabled,
      shadowMode,
      status: coreError ? (fallback ? 'fallback_active' : 'degraded') : 'healthy',
      latencyMs: sectionLatencyMs(safeResult, 'core'),
      errorCode: coreError,
      detail: coreError ? 'ENGINE_SAFE_ERROR_PATH' : null,
    });
  } else {
    addCheck('core', {
      enabled: engineEnabled,
      shadowMode,
      status: 'degraded',
      latencyMs: null,
      errorCode: null,
      detail: 'RESULT_MISSING',
    });
  }

  // Memória (Fase 3).
  const memoryEnabled = Boolean(config?.memoryEnabled);
  const memorySection = safeResult?.persistentMemory ?? null;
  if (memoryEnabled) {
    const memoryError = moduleErrorCode(safeResult, 'memory');
    addCheck('memory', {
      enabled: true,
      shadowMode: Boolean(config?.memoryShadowMode),
      status: !memorySection
        ? 'inconsistent'
        : memoryError
          ? 'degraded'
          : 'healthy',
      latencyMs: sectionLatencyMs(safeResult, 'memory'),
      errorCode: memoryError,
      detail: !memorySection ? 'SECTION_MISSING' : memoryError ? 'MEMORY_SECTION_ERROR' : null,
    });
  } else {
    addCheck('memory', { enabled: false, shadowMode: false, status: 'disabled' });
  }

  // Modelo epistêmico (Fase 4).
  const epistemicEnabled = Boolean(config?.epistemicEnabled && config?.epistemicShadowMode);
  const epistemicSection = safeResult?.epistemicModel ?? null;
  if (epistemicEnabled) {
    addCheck('epistemic', {
      enabled: true,
      shadowMode: true,
      status: epistemicSection ? 'healthy' : 'inconsistent',
      latencyMs: sectionLatencyMs(safeResult, 'epistemic'),
      errorCode: null,
      detail: epistemicSection ? null : 'SECTION_MISSING',
    });
  } else {
    addCheck('epistemic', { enabled: false, shadowMode: false, status: 'disabled' });
  }

  // Decisão (Fase 5), Planning (Fase 6), Goals (Fase 7), Reflection (Fase 8):
  // mesmo padrão — flag ligada exige seção; falha vira fallback_active.
  const optionalModules = [
    { name: 'decision', enabled: Boolean(config?.decisionEnabled && config?.decisionShadowMode) },
    { name: 'planning', enabled: Boolean(config?.planningEnabled && config?.planningShadowMode) },
    { name: 'goals', enabled: Boolean(config?.goalsEnabled && config?.goalsShadowMode) },
    { name: 'reflection', enabled: Boolean(config?.reflectionEnabled && config?.reflectionShadowMode) },
  ];
  for (const module of optionalModules) {
    const sectionKey = {
      decision: 'decisionLayer',
      planning: 'planning',
      goals: 'goals',
      reflection: 'reflection',
    }[module.name];
    const section = safeResult?.[sectionKey] ?? null;
    if (!module.enabled) {
      addCheck(module.name, { enabled: false, shadowMode: false, status: 'disabled' });
      continue;
    }
    const contract = validateSectionContract(safeResult, module.name);
    const fallback = isFallbackActiveIn(safeResult, module.name);
    const errorCode = moduleErrorCode(safeResult, module.name);
    let status = 'healthy';
    let detail = null;
    if (!section) {
      status = 'inconsistent';
      detail = 'SECTION_MISSING';
    } else if (!contract.valid) {
      status = 'contract_error';
      detail = contract.errors[0] ?? 'CONTRACT_INVALID';
    } else if (fallback || errorCode) {
      status = 'fallback_active';
      detail = errorCode ?? 'FALLBACK_USED';
    }
    addCheck(module.name, {
      enabled: true,
      shadowMode: Boolean(module.name === 'decision' ? config?.decisionShadowMode : true),
      status,
      latencyMs: sectionLatencyMs(safeResult, module.name),
      errorCode,
      detail,
    });
  }

  // Activation (Fase 9) — bloqueio total é um estado válido e esperado,
  // mas uma activation ligada sem NENHUMA decisão saudável é um alerta.
  const activationEnabled = Boolean(config?.activationEnabled);
  const activationSection = safeResult?.activation ?? null;
  if (activationEnabled) {
    const decisions = Array.isArray(activationSection?.decisions) ? activationSection.decisions : [];
    const healthyDecisions = decisions.filter((decision) => {
      const status = decision?.activationStatus ?? 'UNKNOWN';
      return status === 'ACTIVE_TEST' || status === 'ACTIVE_ROLLOUT';
    });
    const shadowOnlyDecisions = decisions.filter((decision) => {
      const status = decision?.activationStatus ?? 'UNKNOWN';
      return status === 'SHADOW_ONLY' || status === 'ELIGIBLE';
    });
    let status = 'healthy';
    let detail = null;
    if (!activationSection) {
      status = 'inconsistent';
      detail = 'SECTION_MISSING';
    } else if (decisions.length === 0) {
      status = 'activation_blocked';
      detail = 'NO_CAPABILITIES_ENABLED';
    } else if (healthyDecisions.length === 0 && shadowOnlyDecisions.length === 0) {
      status = 'activation_blocked';
      detail = 'ALL_DECISIONS_BLOCKED';
    }
    addCheck('activation', {
      enabled: true,
      shadowMode: Boolean(config?.activationShadowMode),
      status,
      latencyMs: sectionLatencyMs(safeResult, 'activation'),
      errorCode: null,
      detail,
    });
  } else {
    addCheck('activation', { enabled: false, shadowMode: false, status: 'disabled' });
  }

  return checks;
}

export function runEngineHealthCheck(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const config = safe.config ?? null;
  const result = safe.result ?? null;
  const telemetryErrors = Array.isArray(safe.telemetryErrors) ? safe.telemetryErrors : [];
  const start = nowMillis();

  // O motor só roda quando enabled E shadowMode; espelha o gate real do
  // orquestrador (isUniEngineShadowEnabled) — senão o health divergiria
  // do comportamento observado.
  if (!config || !isUniEngineShadowEnabled(config)) {
    return createHealthCheck({
      engineVersion: UNI_ENGINE_VERSION,
      revision: UNI_ENGINE_REVISION,
      correlationId: typeof safe.correlationId === 'string' ? safe.correlationId : null,
      status: 'disabled',
      enabled: false,
      shadowMode: false,
      checks: UNI_ENGINE_MODULE_NAMES.map((module) => createModuleHealth({
        module,
        enabled: false,
        shadowMode: false,
        status: 'disabled',
        detail: 'ENGINE_DISABLED',
      })),
      errorCodes: [],
      latencyMs: Number((nowMillis() - start).toFixed(2)),
      checkedAt: new Date().toISOString(),
      telemetryErrors: telemetryErrors.length,
    });
  }

  const checks = buildModuleChecks({ config, result, telemetryErrors });
  const shadowMode = Boolean(config.shadowMode);

  // Prioridade explícita do status agregado (sem depender só de severidade).
  // fallback_ativo tem prioridade sobre inconsistência: quando o núcleo
  // caiu no caminho seguro, seções ausentes são esperadas, não um bug.
  const telemetryFailed = checks.some((check) => check.status === 'telemetry_error');
  const contractFailed = checks.some((check) => check.status === 'contract_error');
  const fallbackActive = checks.some((check) => check.status === 'fallback_active');
  const inconsistent = checks.some((check) => check.status === 'inconsistent');
  const activationBlocked = checks.some((check) => check.status === 'activation_blocked');
  const degraded = checks.some((check) => check.status === 'degraded');

  let status = 'healthy';
  if (telemetryFailed) status = 'telemetry_error';
  else if (contractFailed) status = 'contract_error';
  else if (fallbackActive) status = 'fallback_active';
  else if (inconsistent) status = 'inconsistent';
  else if (activationBlocked) status = 'activation_blocked';
  else if (degraded) status = 'degraded';

  const health = createHealthCheck({
    engineVersion: UNI_ENGINE_VERSION,
    revision: UNI_ENGINE_REVISION,
    correlationId: typeof safe.correlationId === 'string' ? safe.correlationId : null,
    status,
    enabled: true,
    shadowMode,
    checks,
    errorCodes: checks
      .map((check) => check.errorCode)
      .filter((code) => typeof code === 'string')
      .slice(0, 8),
    latencyMs: Number((nowMillis() - start).toFixed(2)),
    checkedAt: new Date().toISOString(),
    telemetryErrors: telemetryErrors.length,
  });

  // Garantia final: health check é sempre um contrato válido e serializável.
  const validation = validateHealthCheck(health);
  if (!validation.valid) {
    const fallback = createHealthCheck({
      engineVersion: UNI_ENGINE_VERSION,
      revision: UNI_ENGINE_REVISION,
      status: 'contract_error',
      enabled: true,
      shadowMode,
      checks: [],
      errorCodes: validation.errors,
      latencyMs: Number((nowMillis() - start).toFixed(2)),
      checkedAt: new Date().toISOString(),
    });
    return fallback;
  }
  return health;
}

export function validateEngineHealthCheck(check) {
  return validateHealthCheck(check);
}

export { isSerializableValue };
