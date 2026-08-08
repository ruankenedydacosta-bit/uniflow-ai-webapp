// Uni Engine — Fase 18: Implementação Canary Determínstica.
// Canary determinístico para aprovação de Feature Flags na Fase 18.
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreeze));
  }
  const frozen = {};
  for (const key of Object.keys(value).sort()) {
    frozen[key] = deepFreeze(value[key]);
  }
  return Object.freeze(frozen);
}

export const CANARY_FAILURE_REASONS = Object.freeze([
  'CANARY_ENVIRONMENT_BLOCKED',
  'CANARY_USER_NOT_IN_ALLOWLIST',
  'CANARY_INTEGRITY_CHECK_FAILED',
  'CANARY_ROLLOUT_QUOTA_EXCEEDED',
  'CANARY_FEATURE_FLAGS_INCONSISTENT',
]);

export function isCanaryFailureReason(value) {
  return CANARY_FAILURE_REASONS.includes(value);
}

export function evaluateFinancialRuntimeVisibleCanary(env = {}, userId = null, activeEnvironment = 'production') {
  const safeEnv = env && typeof env === 'object' ? env : {};
  const safeUserId = typeof userId === 'string' ? userId : null;
  const safeActiveEnvironment = typeof activeEnvironment === 'string' ? activeEnvironment.toLowerCase() : 'production';

  // Regra de segurança: canary só pode rodar em desenvolvimento ou staging por padrão
  if (safeActiveEnvironment === 'production') {
    return deepFreeze({
      eligible: false,
      decision: 'use_legacy',
      reasonCodes: ['CANARY_ENVIRONMENT_BLOCKED'],
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  // Regra de segurança: sem userId permitido
  if (!safeUserId) {
    return deepFreeze({
      eligible: false,
      decision: 'use_legacy',
      reasonCodes: ['CANARY_USER_NOT_IN_ALLOWLIST'],
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  const canaryEnabled = safeEnv.VITE_UNI_FINANCIAL_RUNTIME_VISIBLE_CANARY_ENABLED === 'true';
  if (!canaryEnabled) {
    return deepFreeze({
      eligible: false,
      decision: 'use_legacy',
      reasonCodes: ['CANARY_FEATURE_FLAGS_INCONSISTENT'],
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  // Regras determinísticas de aprovação do canary
  const allowedUserIds = (safeEnv.VITE_UNI_FINANCIAL_RUNTIME_VISIBLE_CANARY_USERS || '')
    .split(',')
    .map(id => id.trim())
    .filter(Boolean);

  if (allowedUserIds.length > 0 && !allowedUserIds.includes(safeUserId)) {
    return deepFreeze({
      eligible: false,
      decision: 'use_legacy',
      reasonCodes: ['CANARY_USER_NOT_IN_ALLOWLIST'],
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  // Verificação de integridade da feature flag
  const runtimeEnabled = safeEnv.VITE_UNI_FINANCIAL_RUNTIME_VISIBLE_ENABLED === 'true';
  const minConfidence = safeEnv.VITE_UNI_FINANCIAL_RUNTIME_VISIBLE_MIN_CONFIDENCE;
  const isValidConfig = runtimeEnabled && minConfidence && !isNaN(parseFloat(minConfidence));

  if (!isValidConfig) {
    return deepFreeze({
      eligible: false,
      decision: 'use_legacy',
      reasonCodes: ['CANARY_FEATURE_FLAGS_INCONSISTENT'],
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  // Todas as verificações passaram - canary aprovado
  return deepFreeze({
    eligible: true,
    decision: 'use_runtime',
    reasonCodes: [],
    confidence: 1.0,
    timestamp: Date.now(),
  });
}
