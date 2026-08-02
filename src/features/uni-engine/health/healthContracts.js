// Health Check — contratos puros (Fase 10).
//
// Formas de dados serializáveis e determinísticas do diagnóstico de saúde.
// Nenhum contrato contém funções, clientes, textos, IDs ou dados sensíveis.
import {
  isSerializableValue,
  findFunctionsInValue,
  UNI_ENGINE_MODULE_NAMES,
} from '../uniEngineContracts.js';
import {
  HEALTH_STATUSES,
  isValidHealthStatus,
  resolveAggregateHealth,
} from './healthTypes.js';

export const HEALTH_CHECK_VERSION = '1.0';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function createModuleHealth(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  return {
    module: UNI_ENGINE_MODULE_NAMES.includes(safe.module) ? safe.module : 'unknown',
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    status: isValidHealthStatus(safe.status) ? safe.status : 'degraded',
    latencyMs:
      typeof safe.latencyMs === 'number' && Number.isFinite(safe.latencyMs)
        ? Number(safe.latencyMs.toFixed(2))
        : null,
    errorCode: typeof safe.errorCode === 'string' ? safe.errorCode : null,
    detail: typeof safe.detail === 'string' ? safe.detail : null,
  };
}

export function createHealthCheck(seed = {}) {
  const safe = isPlainObject(seed) ? seed : {};
  const checks = Array.isArray(safe.checks)
    ? safe.checks.map((check) => createModuleHealth(check)).slice(0, 16)
    : [];
  const status = isValidHealthStatus(safe.status)
    ? safe.status
    : resolveAggregateHealth(checks);
  return {
    version: HEALTH_CHECK_VERSION,
    engineVersion: typeof safe.engineVersion === 'string' ? safe.engineVersion : null,
    revision: typeof safe.revision === 'string' ? safe.revision : null,
    correlationId: typeof safe.correlationId === 'string' ? safe.correlationId : null,
    status,
    enabled: Boolean(safe.enabled),
    shadowMode: Boolean(safe.shadowMode),
    checks,
    errorCodes: Array.isArray(safe.errorCodes)
      ? safe.errorCodes.filter((code) => typeof code === 'string').slice(0, 16)
      : [],
    latencyMs:
      typeof safe.latencyMs === 'number' && Number.isFinite(safe.latencyMs)
        ? Number(safe.latencyMs.toFixed(2))
        : null,
    checkedAt: typeof safe.checkedAt === 'string' ? safe.checkedAt : null,
    telemetryErrors: Array.isArray(safe.telemetryErrors)
      ? safe.telemetryErrors.length
      : typeof safe.telemetryErrors === 'number' && Number.isInteger(safe.telemetryErrors) && safe.telemetryErrors >= 0
        ? safe.telemetryErrors
        : 0,
    diagnostics: {
      checksFailed: checks.filter((check) => isHealthFailureOf(check)).length,
      fallbackActive: checks.some((check) => check.status === 'fallback_active'),
      activationBlocked: checks.some((check) => check.status === 'activation_blocked'),
      inconsistentCount: checks.filter((check) => check.status === 'inconsistent').length,
      errorCount: checks.filter((check) => check.status === 'contract_error').length,
      telemetryErrors: Array.isArray(safe.telemetryErrors)
        ? safe.telemetryErrors.length
        : typeof safe.telemetryErrors === 'number' && Number.isInteger(safe.telemetryErrors) && safe.telemetryErrors >= 0
          ? safe.telemetryErrors
          : 0,
    },
  };
}

function isHealthFailureOf(check) {
  const status = check?.status;
  return status !== 'healthy' && status !== 'degraded' && status !== 'disabled';
}

export function validateHealthCheck(check) {
  const errors = [];
  if (!isPlainObject(check)) return { valid: false, errors: ['HEALTH_NOT_OBJECT'] };
  if (!isValidHealthStatus(check.status)) errors.push('HEALTH_STATUS_INVALID');
  if (typeof check.enabled !== 'boolean') errors.push('ENABLED_INVALID');
  if (typeof check.shadowMode !== 'boolean') errors.push('SHADOW_MODE_INVALID');
  if (!Array.isArray(check.checks)) errors.push('CHECKS_INVALID');
  if (check.latencyMs != null && (typeof check.latencyMs !== 'number' || !Number.isFinite(check.latencyMs) || check.latencyMs < 0)) {
    errors.push('LATENCY_MS_INVALID');
  }
  if (!isSerializableValue(check) || findFunctionsInValue(check).length > 0) {
    errors.push('NOT_SERIALIZABLE');
  }
  return { valid: errors.length === 0, errors };
}

export function createEmptyHealthCheck(overrides = {}) {
  const safe = isPlainObject(overrides) ? overrides : {};
  return createHealthCheck({
    engineVersion: safe.engineVersion ?? null,
    revision: safe.revision ?? null,
    correlationId: safe.correlationId ?? null,
    status: HEALTH_STATUSES.includes(safe.status) ? safe.status : 'disabled',
    enabled: false,
    shadowMode: false,
    checks: [],
    errorCodes: [],
    latencyMs: 0,
    checkedAt: safe.checkedAt ?? null,
    telemetryErrors: 0,
  });
}

export {
  HEALTH_STATUSES,
  isValidHealthStatus,
  resolveAggregateHealth,
};
