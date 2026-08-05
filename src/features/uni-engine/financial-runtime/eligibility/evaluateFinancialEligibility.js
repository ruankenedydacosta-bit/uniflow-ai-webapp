// Uni Engine — Fase 18: Avaliação de Elegibilidade.
// Determina se uma resposta visível do runtime financeiro pode ser aplicada.
// Reutiliza contratos, validação factual, confiança e determinismo.

import { isSerializableValue } from '../../uniEngineContracts.js';
import { validateFinancialFacts } from '../factual-validation/validateFinancialFacts.js';
import { calculateFinancialConfidence } from '../confidence/calculateFinancialConfidence.js';
import { evaluateFinancialRuntimeVisibleCanary } from '../canary/evaluateFinancialRuntimeVisibleCanary.js';
import { isIntentVisibleAllowed, isWriteIntent } from '../eligibility/visibleIntents.js';
import { RUNTIME_TEMPORAL_ENTITIES } from '../types/index.js';
import { createEmptyFinancialEligibilityResult, validateFinancialEligibilityResult } from './financialEligibilityContracts.js';

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

export function evaluateFinancialEligibility(input = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};
  const safeActiveEnvironment = typeof safeInput.activeEnvironment === 'string' ? safeInput.activeEnvironment.toLowerCase() : 'production';

  // Verificar environment de produção bloqueado (segurança)
  if (safeActiveEnvironment === 'production') {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['PRODUCTION_BLOCKED'],
    });
  }

  // Verificar validade da entrada
  const inputValidation = validateFinancialEligibilityInput(safeInput);
  if (!inputValidation.valid) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: inputValidation.errors,
    });
  }

  const {
    intent,
    temporal,
    executionResult,
    narrative,
    runtimeResult,
    config,
    userId,
    activeIdentity,
    pendingAction,
    canaryEnv,
    environment,
  } = safeInput;

  const safeIntent = intent && typeof intent === 'object' ? intent : null;
  const safeTemporal = temporal && typeof temporal === 'object' ? temporal : null;
  const safeExecution = executionResult && typeof executionResult === 'object' ? executionResult : null;
  const safeNarrative = narrative && typeof narrative === 'object' ? narrative : null;
  const safeRuntime = runtimeResult && typeof runtimeResult === 'object' ? runtimeResult : null;
  const safeConfig = config && typeof config === 'object' ? config : {};

  // Checklist determinístico de pré-avaliação

  // 1. Verificar config.financialRuntimeVisibleEnabled
  if (safeConfig.financialRuntimeVisibleEnabled !== true) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['FEATURE_DISABLED'],
    });
  }

  // 2. Verificar canary determinístico
  const canaryResult = evaluateFinancialRuntimeVisibleCanary(canaryEnv, userId, environment);
  if (!canaryResult.eligible) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: canaryResult.reasonCodes,
    });
  }

  // 3. Verificar intenção permitida (allowlist explícita)
  const intentType = safeIntent?.type;
  if (!intentType || !isIntentVisibleAllowed(intentType)) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['INTENT_NOT_ALLOWED'],
    });
  }

  // 4. Verificar intenção de escrita bloqueada
  if (isWriteIntent(intentType)) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['WRITE_INTENT_BLOCKED'],
    });
  }

  // 5. Verificar intenção suportada pelo runtime
  const intentSupported = !!safeRuntime?.supportedIntents?.includes(intentType);
  if (!intentSupported) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['INTENT_NOT_ALLOWED'],
    });
  }

  // 6. Verificar temporal resolvido
  const temporalResolved = !!safeTemporal?.resolved && safeTemporal?.entity && RUNTIME_TEMPORAL_ENTITIES.includes(safeTemporal.entity);
  if (!temporalResolved) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['TEMPORAL_UNRESOLVED'],
    });
  }

  // 7. Verificar dados disponíveis
  const dataAvailable = safeExecution?.results && Object.keys(safeExecution.results).length > 0;
  if (!dataAvailable) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['NO_FINANCIAL_DATA'],
    });
  }

  // 8. Validar query
  const queryValid = safeExecution?.queryValid === true;
  if (!queryValid) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['QUERY_INVALID'],
    });
  }

  // 9. Verificar execução bem-sucedida
  const executionSuccessful = safeRuntime?.status === 'completed';
  if (!executionSuccessful) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['EXECUTION_FAILED'],
    });
  }

  // 10. Validar fatos factual determinísticos
  const factualValidation = validateFinancialFacts({
    narrative: safeNarrative,
    executionResult: safeExecution,
    runtimeResult: safeRuntime,
  });
  if (!factualValidation.valid) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: factualValidation.reasonCodes,
    });
  }

  // 11. Calcular confiança determinística
  const confidence = calculateFinancialConfidence({
    eligibility: { eligible: true, intentSupported: true, temporalResolved: true, queryValid: true, executionSuccessful: true, dataAvailable: true, factsValidated: factualValidation.valid, narrativeValid: true, safetyApproved: true, confidence: 0 },
    factualValidation,
    runtimeResult: safeRuntime,
  });

  // 12. Verificar confiança mínima
  const minConfidence = safeConfig.financialRuntimeVisibleMinConfidence || 0.90;
  if (!confidence || confidence < minConfidence) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['CONFIDENCE_INSUFFICIENT'],
    });
  }

  // 13. Verificar identidade ativa
  const runtimeTurnId = safeRuntime?.turnId;
  const activeTurnId = activeIdentity?.turnId;
  if (runtimeTurnId && activeTurnId && runtimeTurnId !== activeTurnId) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['IDENTITY_CHANGED'],
    });
  }

  // 14. Verificar action pendente bloqueando
  if (pendingAction && pendingAction.status === 'active') {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['PENDING_ACTION_ACTIVE'],
    });
  }

  // 15. Verificar narrativa válida (sem debug, sem vazia)
  const narrativeText = safeNarrative?.text;
  if (!narrativeText || !narrativeText.trim()) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['NARRATIVE_EMPTY'],
    });
  }

  if (narrativeText.includes('[DEBUG]') || narrativeText.includes('[INTERNAL]')) {
    return deepFreeze({
      ...createEmptyFinancialEligibilityResult(safeInput),
      reasonCodes: ['NARRATIVE_INVALID'],
    });
  }

  // 16. Final: elegível
  return deepFreeze({
    version: '1.0',
    turnId: safeInput.turnId ?? null,
    messageId: safeInput.messageId ?? null,
    eligible: true,
    decision: 'use_runtime',
    confidence,
    reasonCodes: [],
    intentSupported: true,
    temporalResolved: true,
    queryValid: true,
    executionSuccessful: true,
    factsValidated: true,
    narrativeValid: true,
    dataAvailable: true,
    safetyApproved: true,
    fallbackRequired: false,
    influenceAllowed: true,
    serializable: true,
    discarded: false,
    canaryPassed: true,
    temporalEntity: safeTemporal?.entity ?? null,
    intentType: intentType ?? null,
  });
}

export function validateFinancialEligibilityInput(input) {
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['ELIGIBILITY_INPUT_INVALID'] };
  }
  const errors = [];

  // Campos obrigatórios para avaliação
  const required = [
    'intent', 'temporal', 'executionResult', 'narrative', 'runtimeResult',
    'config', 'userId', 'activeIdentity', 'pendingAction', 'canaryEnv', 'environment',
  ];
  for (const field of required) {
    if (!(field in input)) {
      errors.push(`${field.toUpperCase()}_MISSING`);
    }
  }

  // Validar campos presentes
  if (input.intent && typeof input.intent !== 'object') {
    errors.push('INTENT_MUST_BE_OBJECT');
  }
  if (input.temporal && typeof input.temporal !== 'object') {
    errors.push('TEMPORAL_MUST_BE_OBJECT');
  }
  if (input.executionResult && typeof input.executionResult !== 'object') {
    errors.push('EXECUTION_RESULT_MUST_BE_OBJECT');
  }
  if (input.narrative && typeof input.narrative !== 'object') {
    errors.push('NARRATIVE_MUST_BE_OBJECT');
  }
  if (input.runtimeResult && typeof input.runtimeResult !== 'object') {
    errors.push('RUNTIME_RESULT_MUST_BE_OBJECT');
  }
  if (input.config && typeof input.config !== 'object') {
    errors.push('CONFIG_MUST_BE_OBJECT');
  }
  if (input.canaryEnv && typeof input.canaryEnv !== 'object') {
    errors.push('CANARY_ENV_MUST_BE_OBJECT');
  }

  // Validar intent.type
  if (input.intent?.type && typeof input.intent.type !== 'string') {
    errors.push('INTENT_TYPE_MUST_BE_STRING');
  }

  // Validar temporal.resolved
  if (input.temporal?.resolved !== undefined && typeof input.temporal.resolved !== 'boolean') {
    errors.push('TEMPORAL_RESOLVED_MUST_BE_BOOLEAN');
  }

  // Validar userId
  if (input.userId !== undefined && typeof input.userId !== 'string') {
    errors.push('USER_ID_MUST_BE_STRING');
  }

  // Validar environment
  if (input.environment !== undefined && typeof input.environment !== 'string') {
    errors.push('ENVIRONMENT_MUST_BE_STRING');
  }

  return { valid: errors.length === 0, errors };
}
