// Observability — contratos puros (Fase 10).
//
// Snapshot observável serializável e sem dados sensíveis: versões, módulos,
// latências, flags, bandas de confiança/risco, fallback, activation, shadow,
// reflection, goals, planning, circuit breaker e health.
import {
  isSerializableValue,
  findFunctionsInValue,
  UNI_ENGINE_MODULE_NAMES,
} from '../uniEngineContracts.js';
import { isValidHealthStatus } from '../health/healthTypes.js';
import {
  OBSERVABILITY_SNAPSHOT_VERSION,
  OBSERVABILITY_ALLOWED_FIELDS,
  isValidObservabilityModuleStatus,
} from './observabilityTypes.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(3))
    : null;
}

export function createModuleObservability(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  return {
    module: UNI_ENGINE_MODULE_NAMES.includes(safe.module) ? safe.module : 'unknown',
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    status: isValidObservabilityModuleStatus(safe.status) ? safe.status : 'unknown',
    latencyMs: finiteOrNull(safe.latencyMs),
    errorCode: typeof safe.errorCode === 'string' ? safe.errorCode : null,
  };
}

export function createObservabilitySnapshot(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  const modules = Array.isArray(safe.modules)
    ? safe.modules.map((entry) => createModuleObservability(entry)).slice(0, 16)
    : [];
  return {
    version: OBSERVABILITY_SNAPSHOT_VERSION,
    engineVersion: typeof safe.engineVersion === 'string' ? safe.engineVersion : null,
    revision: typeof safe.revision === 'string' ? safe.revision : null,
    correlationId: typeof safe.correlationId === 'string' ? safe.correlationId : null,
    timestamp: typeof safe.timestamp === 'string' ? safe.timestamp : null,
    totalLatencyMs: finiteOrNull(safe.totalLatencyMs),
    health: isValidHealthStatus(safe.health) ? safe.health : 'degraded',
    modules,
    activeModules: Array.isArray(safe.activeModules)
      ? safe.activeModules.filter((module) => UNI_ENGINE_MODULE_NAMES.includes(module))
      : [],
    disabledModules: Array.isArray(safe.disabledModules)
      ? safe.disabledModules.filter((module) => UNI_ENGINE_MODULE_NAMES.includes(module))
      : [],
    errorModules: Array.isArray(safe.errorModules)
      ? safe.errorModules.filter((module) => UNI_ENGINE_MODULE_NAMES.includes(module))
      : [],
    latencyByModule: isPlainObject(safe.latencyByModule) ? safe.latencyByModule : {},
    flags: isPlainObject(safe.flags) ? { ...safe.flags } : {},
    confidence: isPlainObject(safe.confidence)
      ? {
          band: typeof safe.confidence.band === 'string' ? safe.confidence.band : null,
          source: typeof safe.confidence.source === 'string' ? safe.confidence.source : null,
        }
      : { band: null, source: null },
    risk: isPlainObject(safe.risk)
      ? {
          band: typeof safe.risk.band === 'string' ? safe.risk.band : null,
          source: typeof safe.risk.source === 'string' ? safe.risk.source : null,
        }
      : { band: null, source: null },
    shadow: isPlainObject(safe.shadow) ? { ...safe.shadow } : {},
    fallback: isPlainObject(safe.fallback)
      ? {
          active: Boolean(safe.fallback.active),
          reasons: Array.isArray(safe.fallback.reasons)
            ? safe.fallback.reasons.filter((reason) => typeof reason === 'string').slice(0, 8)
            : [],
        }
      : { active: false, reasons: [] },
    activation: isPlainObject(safe.activation)
      ? {
          enabled: Boolean(safe.activation.enabled),
          shadowMode: Boolean(safe.activation.shadowMode),
          decisionsCount: Number.isInteger(safe.activation.decisionsCount)
            ? safe.activation.decisionsCount
            : 0,
          activeCount: Number.isInteger(safe.activation.activeCount)
            ? safe.activation.activeCount
            : 0,
          shadowCount: Number.isInteger(safe.activation.shadowCount)
            ? safe.activation.shadowCount
            : 0,
          blockedCount: Number.isInteger(safe.activation.blockedCount)
            ? safe.activation.blockedCount
            : 0,
          errorCount: Number.isInteger(safe.activation.errorCount)
            ? safe.activation.errorCount
            : 0,
        }
      : { enabled: false, shadowMode: false, decisionsCount: 0, activeCount: 0, shadowCount: 0, blockedCount: 0, errorCount: 0 },
    reflection: isPlainObject(safe.reflection)
      ? {
          enabled: Boolean(safe.reflection.enabled),
          triggered: Boolean(safe.reflection.triggered),
          candidateCount: Number.isInteger(safe.reflection.candidateCount)
            ? safe.reflection.candidateCount
            : 0,
          conflictCount: Number.isInteger(safe.reflection.conflictCount)
            ? safe.reflection.conflictCount
            : 0,
          signalCount: Number.isInteger(safe.reflection.signalCount)
            ? safe.reflection.signalCount
            : 0,
          fallback: Boolean(safe.reflection.fallback),
        }
      : { enabled: false, triggered: false, candidateCount: 0, conflictCount: 0, signalCount: 0, fallback: false },
    goals: isPlainObject(safe.goals)
      ? {
          enabled: Boolean(safe.goals.enabled),
          detected: Boolean(safe.goals.detected),
          status: typeof safe.goals.status === 'string' ? safe.goals.status : 'UNKNOWN',
          confidenceBand: typeof safe.goals.confidenceBand === 'string' ? safe.goals.confidenceBand : null,
          riskBand: typeof safe.goals.riskBand === 'string' ? safe.goals.riskBand : null,
          fallback: Boolean(safe.goals.fallback),
        }
      : { enabled: false, detected: false, status: 'UNKNOWN', confidenceBand: null, riskBand: null, fallback: false },
    planning: isPlainObject(safe.planning)
      ? {
          enabled: Boolean(safe.planning.enabled),
          status: typeof safe.planning.status === 'string' ? safe.planning.status : 'UNKNOWN',
          complexity: typeof safe.planning.complexity === 'string' ? safe.planning.complexity : 'LOW',
          confidenceBand: typeof safe.planning.confidenceBand === 'string' ? safe.planning.confidenceBand : null,
          riskBand: typeof safe.planning.riskBand === 'string' ? safe.planning.riskBand : null,
          stepCount: Number.isInteger(safe.planning.stepCount) ? safe.planning.stepCount : 0,
          fallback: Boolean(safe.planning.fallback),
        }
      : { enabled: false, status: 'UNKNOWN', complexity: 'LOW', confidenceBand: null, riskBand: null, stepCount: 0, fallback: false },
    circuitBreaker: isPlainObject(safe.circuitBreaker)
      ? {
          open: Boolean(safe.circuitBreaker.open),
          openedCapabilities: Array.isArray(safe.circuitBreaker.openedCapabilities)
            ? safe.circuitBreaker.openedCapabilities.slice(0, 8)
            : [],
        }
      : { open: false, openedCapabilities: [] },
    telemetry: isPlainObject(safe.telemetry)
      ? {
          enabled: Boolean(safe.telemetry.enabled),
          errorCount: Number.isInteger(safe.telemetry.errorCount)
            ? safe.telemetry.errorCount
            : 0,
        }
      : { enabled: false, errorCount: 0 },
  };
}

export function validateObservabilitySnapshot(snapshot) {
  const errors = [];
  if (!isPlainObject(snapshot)) return { valid: false, errors: ['SNAPSHOT_NOT_OBJECT'] };
  if (typeof snapshot.version !== 'string') errors.push('VERSION_INVALID');
  if (!isValidHealthStatus(snapshot.health)) errors.push('HEALTH_INVALID');
  if (!Array.isArray(snapshot.modules)) errors.push('MODULES_INVALID');
  if (snapshot.modules.some((entry) => !isValidObservabilityModuleStatus(entry?.status))) {
    errors.push('MODULE_STATUS_INVALID');
  }
  if (snapshot.totalLatencyMs != null
    && (typeof snapshot.totalLatencyMs !== 'number' || snapshot.totalLatencyMs < 0)) {
    errors.push('TOTAL_LATENCY_INVALID');
  }
  if (snapshot.modules.some((entry) => entry?.latencyMs != null && (typeof entry.latencyMs !== 'number' || entry.latencyMs < 0))) {
    errors.push('MODULE_LATENCY_INVALID');
  }
  if (!isSerializableValue(snapshot) || findFunctionsInValue(snapshot).length > 0) {
    errors.push('NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}

export function createEmptyObservabilitySnapshot(overrides = {}) {
  const safe = isPlainObject(overrides) ? overrides : {};
  return createObservabilitySnapshot({
    engineVersion: safe.engineVersion ?? null,
    revision: safe.revision ?? null,
    correlationId: safe.correlationId ?? null,
    timestamp: safe.timestamp ?? null,
    totalLatencyMs: 0,
    health: 'disabled',
    modules: [],
    activeModules: [],
    disabledModules: [],
    errorModules: [],
    latencyByModule: {},
    flags: {},
    confidence: { band: null, source: null },
    risk: { band: null, source: null },
    shadow: {},
    fallback: { active: false, reasons: [] },
    activation: {},
    reflection: {},
    goals: {},
    planning: {},
    circuitBreaker: { open: false, openedCapabilities: [] },
    telemetry: { enabled: false, errorCount: 0 },
  });
}

export function redactObservabilitySnapshot(snapshot) {
  if (!isPlainObject(snapshot)) return {};
  const json = JSON.parse(JSON.stringify(snapshot));
  // O snapshot já é estrutural por contrato; a redação é uma garantia
  // final: remove qualquer campo fora da allowlist em profundidade 1.
  const allowed = new Set(OBSERVABILITY_ALLOWED_FIELDS);
  const result = {};
  for (const key of Object.keys(json)) {
    if (!allowed.has(key)) continue;
    const value = json[key];
    result[key] = value === null
      ? null
      : ['string', 'number', 'boolean'].includes(typeof value)
        ? value
        : JSON.parse(JSON.stringify(value));
  }
  return result;
}
