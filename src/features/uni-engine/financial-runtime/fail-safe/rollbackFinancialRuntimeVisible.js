// Uni Engine — Fase 18: Fail-safe e Rollback.
// Fail-safe determinístico e rollback de última instância para o runtime financeiro visível.
// Implementa comportamento seguro quando a aplicação normal falha ou parâmetros inválidos.

import { isSerializableValue } from '../uniEngineContracts.js';

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

export const ROLLBACK_REASONS = Object.freeze([
  'CANARY_FAILURE',
  'CONFIG_VALIDATION_FAILED',
  'INTENT_NOT_ALLOWED',
  'TEMPORAL_UNRESOLVED',
  'NO_FINANCIAL_DATA',
  'QUERY_INVALID',
  'EXECUTION_FAILED',
  'FACTS_INVALID',
  'CONFIDENCE_INSUFFICIENT',
  'IDENTITY_CHANGED',
  'FLAG_DISABLED',
  'PENDING_ACTION_ACTIVE',
  'NARRATIVE_INVALID',
  'SAFETY_REJECTED',
  'CANARY_FAILED',
  'FAIL_SAFE_TRIGGERED',
]);

export function isRollbackReason(value) {
  return ROLLBACK_REASONS.includes(value);
}

export function evaluateFinancialRuntimeVisibleRollback(
  eligibilityResult,
  factualValidationResult,
  narrativeText,
  activeIdentity,
  pendingAction,
  config,
  runtimeEnabled,
  canaryResult,
) {
  const safeEligibility = eligibilityResult && typeof eligibilityResult === 'object' ? eligibilityResult : null;
  const safeFactual = factualValidationResult && typeof factualValidationResult === 'object' ? factualValidationResult : null;
  const safeConfig = config && typeof config === 'object' ? config : {};

  // 1. Canary failure força rollback
  if (!canaryResult?.eligible) {
    return deepFreeze({
      shouldRollback: true,
      reasonCodes: canaryResult?.reasonCodes || ['CANARY_FAILURE'],
      rollbackMode: 'canary',
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  // 2. Feature flag desativada força rollback
  if (safeConfig.financialRuntimeVisibleEnabled !== true) {
    return deepFreeze({
      shouldRollback: true,
      reasonCodes: ['FLAG_DISABLED'],
      rollbackMode: 'feature_flag',
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  // 3. Produção bloqueia tudo (nunca executa runtime)
  const activeEnvironment = typeof safeConfig.activeEnvironment === 'string' ? safeConfig.activeEnvironment.toLowerCase() : 'production';
  if (activeEnvironment === 'production') {
    return deepFreeze({
      shouldRollback: true,
      reasonCodes: ['PRODUCTION_BLOCKED'],
      rollbackMode: 'environment',
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  // 4. Qualidade falha segura - a narrativa não pode estar vazia
  if (!narrativeText || !narrativeText.trim()) {
    return deepFreeze({
      shouldRollback: true,
      reasonCodes: ['NARRATIVE_EMPTY'],
      rollbackMode: 'validation',
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  // 5. A narrativa não pode conter debug/internal
  if (narrativeText.includes('[DEBUG]') || narrativeText.includes('[INTERNAL]')) {
    return deepFreeze({
      shouldRollback: true,
      reasonCodes: ['NARRATIVE_INVALID'],
      rollbackMode: 'validation',
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  // 6. Identidade ativa mudou
  const runtimeTurnId = safeEligibility?.turnId;
  const activeTurnId = activeIdentity?.turnId;
  if (runtimeTurnId && activeTurnId && runtimeTurnId !== activeTurnId) {
    return deepFreeze({
      shouldRollback: true,
      reasonCodes: ['IDENTITY_CHANGED'],
      rollbackMode: 'identity',
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  // 7. Pending Action ativa bloqueia
  if (pendingAction && pendingAction.status === 'active') {
    return deepFreeze({
      shouldRollback: true,
      reasonCodes: ['PENDING_ACTION_ACTIVE'],
      rollbackMode: 'safety',
      confidence: 0,
      timestamp: Date.now(),
    });
  }

  // 8. A confiança é insuficiente
  const minConfidence = safeConfig.financialRuntimeVisibleMinConfidence || 0.90;
  if (!safeEligibility?.confidence || safeEligibility.confidence < minConfidence) {
    return deepFreeze({
      shouldRollback: true,
      reasonCodes: ['CONFIDENCE_INSUFFICIENT'],
      rollbackMode: 'confidence',
      confidence: safeEligibility?.confidence || 0,
      timestamp: Date.now(),
    });
  }

  // 9. Validação factual falhou
  if (!safeFactual?.valid) {
    return deepFreeze({
      shouldRollback: true,
      reasonCodes: safeFactual?.reasonCodes || ['FACTS_INVALID'],
      rollbackMode: 'validation',
      confidence: safeEligibility?.confidence || 0,
      timestamp: Date.now(),
    });
  }

  // 10. Tudo passou - sem rollback necessário
  return deepFreeze({
    shouldRollback: false,
    reasonCodes: [],
    rollbackMode: 'none',
    confidence: safeEligibility?.confidence || 0,
    timestamp: Date.now(),
  });
}
