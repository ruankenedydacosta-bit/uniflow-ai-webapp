// Uni Engine — Controlled Rollout: contratos (Parte 10, Bloco Único).
//
// Snapshot estritamente observacional para o rollout e prontidão operacional do Uni Engine.
// Garantias absolutas:
//   - serializable sempre true;
//   - nunca executa ações, nunca escreve memória, nunca altera diálogo;
//   - rollout OFF por padrão;
//   - nunca gera texto, nunca chama banco, RPC, TTS.
import { isSerializableValue } from '../uniEngineContracts.js';
import {
  ROLLOUT_VERSION,
  ROLLOUT_SAFETY_KEYS,
  OPERATIONAL_METADATA_ALLOWED_KEYS,
  isRolloutStage,
} from './rolloutTypes.js';
import { ROLLOUT_POLICY, isRolloutEnabledByConfig, isEnvironmentAllowedByRolloutPolicy, isRolloutStageEffective } from './rolloutPolicy.js';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function deepFreeze(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) deepFreeze(item);
    return Object.freeze(value);
  }
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}

function sanitizeMetadata(value) {
  if (!isPlainObject(value)) return {};
  const sanitized = {};
  for (const key of OPERATIONAL_METADATA_ALLOWED_KEYS) {
    const item = value[key];
    if (item === undefined || item === null) continue;
    if (typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean') {
      sanitized[key] = item;
    } else if (Array.isArray(item)) {
      const list = item.filter((entry) => typeof entry === 'string')
        .slice(0, ROLLOUT_POLICY.maxSources);
      if (list.length > 0) sanitized[key] = list;
    }
  }
  return sanitized;
}

export function createEmptyRolloutSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  return deepFreeze({
    version: ROLLOUT_VERSION,
    mode: 'observational',
    enabled: false,
    requestedStage: 'ROLLOUT_OFF',
    effectiveStage: 'ROLLOUT_OFF',
    eligible: false,
    visibleInfluenceAllowed: false,
    authorizedCapabilities: [],
    blockedCapabilities: [],
    sameTurn: Boolean(safe.sameTurn),
    environmentAllowed: Boolean(safe.environmentAllowed),
    userAuthorized: Boolean(safe.userAuthorized),
    orchestratorValid: false,
    readinessValid: false,
    circuitBreakerClosed: Boolean(safe.circuitBreakerClosed),
    fallbackUsed: false,
    fallbackReason: null,
    diagnostics: [],
    metadata: sanitizeMetadata(safe.metadata),
    safety: { financialExecution: false, memoryWrite: false, learningApplied: false, confirmationSkipped: false, pendingActionModifiedUnsafely: false, databaseCalled: false, rpcCalled: false, freeTextGenerated: false, productionEnabled: false, canaryEnabled: false },
    timestamps: { recordedAt: null, requestedAt: null, effectiveAt: null },
    serializable: true,
  });
}

export function createRolloutSnapshot(options = {}) {
  const safe = isPlainObject(options) ? options : {};
  const requestedStage = safe.requestedStage ?? 'ROLLOUT_OFF';
  const effectiveStage = isRolloutStage(safe.effectiveStage) ? safe.effectiveStage : 'ROLLOUT_OFF';
  const environmentAllowed = isEnvironmentAllowedByRolloutPolicy(safe.environment);
  const userAuthorized = Boolean(safe.userAuthorized);

  const rolloutEnabled = isRolloutEnabledByConfig(safe.config);
  const eligible = rolloutEnabled && environmentAllowed && userAuthorized;
  const visibleInfluenceAllowed = eligible && isRolloutStageEffective(effectiveStage, requestedStage);

  const authorized = isPlainObject(safe.config?.activationCapabilities) ? safe.config.activationCapabilities : {};
  const requested = isPlainObject(safe.requestedCapabilities) ? safe.requestedCapabilities : {};
  const authorizedList = Object.keys(authorized).filter((cap) => authorized[cap] === true);
  const requestedList = Object.keys(requested).filter((cap) => requested[cap] === true);
  const blockedList = authorizedList.filter((cap) => !requestedList.includes(cap));

  const diagnostics = [];
  if (!rolloutEnabled) {
    diagnostics.push({ code: 'ROLLOUT_DISABLED', severity: 'WARNING', reason: 'rollout feature flag desativada', layer: 'rollout' });
  }
  if (!environmentAllowed) {
    diagnostics.push({ code: 'ENVIRONMENT_NOT_ALLOWED', severity: 'WARNING', reason: 'ambiente não permitido', layer: 'rollout' });
  }
  if (!userAuthorized) {
    diagnostics.push({ code: 'USER_NOT_AUTHORIZED', severity: 'WARNING', reason: 'usuário não autorizado', layer: 'rollout' });
  }
  if (!eligible) {
    diagnostics.push({ code: 'INELIGIBLE', severity: 'WARNING', reason: 'gates não atendidas', layer: 'rollout' });
  }

  const snapshot = {
    version: ROLLOUT_VERSION,
    mode: 'observational',
    enabled: rolloutEnabled,
    requestedStage,
    effectiveStage,
    eligible,
    visibleInfluenceAllowed,
    authorizedCapabilities: authorizedList,
    blockedCapabilities: blockedList,
    sameTurn: Boolean(safe.sameTurn),
    environmentAllowed,
    userAuthorized,
    orchestratorValid: Boolean(safe.orchestratorValid),
    readinessValid: Boolean(safe.readinessValid),
    circuitBreakerClosed: Boolean(safe.circuitBreakerClosed),
    fallbackUsed: false,
    fallbackReason: null,
    diagnostics,
    metadata: sanitizeMetadata({ ...safe.metadata, stage: requestedStage, effectiveStage, environment: safe.environment, authorized: userAuthorized, eligible }),
    safety: { financialExecution: false, memoryWrite: false, learningApplied: false, confirmationSkipped: false, pendingActionModifiedUnsafely: false, databaseCalled: false, rpcCalled: false, freeTextGenerated: false, productionEnabled: false, canaryEnabled: false },
    timestamps: { recordedAt: safe.timestamp ?? null, requestedAt: null, effectiveAt: null },
    serializable: true,
  };
  return deepFreeze(snapshot);
}

export function validateRolloutSnapshot(snapshot) {
  if (!isPlainObject(snapshot)) {
    return { valid: false, errors: ['SNAPSHOT_NOT_OBJECT'] };
  }
  const errors = [];
  if (snapshot.version !== ROLLOUT_VERSION) errors.push('VERSION_INVALID');
  if (snapshot.mode !== 'observational') errors.push('MODE_NOT_OBSERVATIONAL');
  if (!isRolloutStage(snapshot.requestedStage)) errors.push('REQUESTED_STAGE_INVALID');
  if (!isRolloutStage(snapshot.effectiveStage)) errors.push('EFFECTIVE_STAGE_INVALID');
  if (!Array.isArray(snapshot.diagnostics)) errors.push('DIAGNOSTICS_NOT_ARRAY');
  if (!isPlainObject(snapshot.metadata)) errors.push('METADATA_INVALID');
  if (!isRolloutSafetyKeyKeys(snapshot.safety)) errors.push('SAFETY_INVALID');
  if (!isPlainObject(snapshot.timestamps)) errors.push('TIMESTAMPS_INVALID');
  if (snapshot.serializable !== true) errors.push('SERIALIZABLE_FALSE');
  if (!isSerializableValue(snapshot)) errors.push('SNAPSHOT_NOT_SERIALIZABLE');
  return { valid: errors.length === 0, errors };
}

function isRolloutSafetyKeyKeys(value) {
  if (!isPlainObject(value)) return false;
  for (const key of Object.keys(value)) {
    if (!ROLLOUT_SAFETY_KEYS.includes(key)) return false;
  }
  return true;
}

export function isRolloutSnapshotSerializable(snapshot) {
  return isPlainObject(snapshot) && isSerializableValue(snapshot);
}