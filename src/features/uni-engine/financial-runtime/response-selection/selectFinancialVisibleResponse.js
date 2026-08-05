// Uni Engine — Fase 18: Seletor Centralizado de Resposta Visível.
// Seletor centralizado para resposta visível do runtime financeiro.
// Implementa lógica determinística para decidir entre resposta de runtime ou legado.
// Reutiliza contratos, validação, confiança e fail-safe.

import { isSerializableValue } from '../../uniEngineContracts.js';
import { isConfidenceSufficient } from '../confidence/index.js';
import { isRuntimeResponseRejectionReason } from '../contracts/financialRuntimeContracts.js';

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

export function selectFinancialVisibleResponse({
  legacyText,
  runtimeResult,
  eligibility,
  factualValidation,
  confidence,
  config,
  activeIdentity,
  pendingAction,
  narrative,
} = {}) {
  const safeLegacyText = typeof legacyText === 'string' ? legacyText : '';
  const safeRuntime = runtimeResult && typeof runtimeResult === 'object' ? runtimeResult : null;
  const safeEligibility = eligibility && typeof eligibility === 'object' ? eligibility : null;
  const safeFactual = factualValidation && typeof factualValidation === 'object' ? factualValidation : null;
  const safeConfidence = typeof confidence === 'number' ? confidence : 0;
  const safeConfig = config && typeof config === 'object' ? config : {};
  const safeActiveIdentity = activeIdentity && typeof activeIdentity === 'object' ? activeIdentity : null;
  const safePendingAction = pendingAction && typeof pendingAction === 'object' ? pendingAction : null;
  const safeNarrative = narrative && typeof narrative === 'object' ? narrative : null;

  // Se não há texto legítimo legado, retorna vazio
  if (!safeLegacyText) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: '',
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['LEGACY_TEXT_EMPTY'],
      confidence: 0,
    });
  }

  // Verificações de segurança obrigatórias

  // 1. Feature flag do runtime visível desativada
  if (safeConfig.financialRuntimeVisibleEnabled !== true) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['FEATURE_DISABLED'],
      confidence: 0,
    });
  }

  // 2. A produção nunca executa runtime visível (segurança)
  const activeEnvironment = typeof safeConfig.activeEnvironment === 'string' ? safeConfig.activeEnvironment.toLowerCase() : 'production';
  if (activeEnvironment === 'production') {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['PRODUCTION_BLOCKED'],
      confidence: 0,
    });
  }

  // 3. Canary failure bloqueia runtime visível
  const canaryResult = safeConfig.canaryResult || {};
  if (!canaryResult.eligible) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: canaryResult.reasonCodes || ['CANARY_FAILED'],
      confidence: 0,
    });
  }

  // 4. Intentão não permitida (não allowlistada)
  const intentType = safeEligibility?.intentType ?? null;
  if (!intentType || !safeEligibility?.intentSupported) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['INTENT_NOT_ALLOWED'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  // 5. Intentão de escrita bloqueada (nunca permite)
  const writeIntents = [
    'register_income',
    'register_expense',
    'register_transfer',
    'set_balance',
    'create_goal',
    'update_goal',
    'delete_goal',
    'create_account',
    'update_account',
    'delete_account',
    'create_category',
    'update_category',
    'delete_category',
    'create_transaction',
    'update_transaction',
    'delete_transaction',
    'process_payment',
    'confirm_payment',
    'cancel_payment',
  ];
  if (writeIntents.includes(intentType)) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['WRITE_INTENT_BLOCKED'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  // 6. Temporal não resolvido
  if (!safeEligibility?.temporalResolved) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['TEMPORAL_UNRESOLVED'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  // 7. Sem dados financeiros disponíveis
  if (!safeEligibility?.dataAvailable) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['NO_FINANCIAL_DATA'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  // 8. Query inválida
  if (!safeEligibility?.queryValid) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['QUERY_INVALID'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  // 9. Execução não bem-sucedida
  if (!safeEligibility?.executionSuccessful) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['EXECUTION_FAILED'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  // 10. Validação factual falhou
  if (!safeFactual?.valid) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: safeFactual?.reasonCodes || ['FACTS_INVALID'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  // 11. Confiança insuficiente
  const minConfidence = safeConfig.financialRuntimeVisibleMinConfidence || 0.90;
  if (!safeEligibility?.confidence || safeEligibility.confidence < minConfidence) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['CONFIDENCE_INSUFFICIENT'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  // 12. Identidade ativa mudou
  const runtimeTurnId = safeRuntime?.turnId;
  const activeTurnId = safeActiveIdentity?.turnId;
  if (runtimeTurnId && activeTurnId && runtimeTurnId !== activeTurnId) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['IDENTITY_CHANGED'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  // 13. Pending Action ativa bloqueia
  if (safePendingAction && safePendingAction.status === 'active') {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['PENDING_ACTION_ACTIVE'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  // 14. Narrativa inválida (vazia ou com debug/internal)
  const narrativeText = safeNarrative?.text;
  if (!narrativeText || !narrativeText.trim()) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['NARRATIVE_EMPTY'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  if (narrativeText.includes('[DEBUG]') || narrativeText.includes('[INTERNAL]')) {
    return deepFreeze({
      selectedSource: 'legacy',
      selectedText: safeLegacyText,
      influenceApplied: false,
      fallbackUsed: true,
      reasonCodes: ['NARRATIVE_INVALID'],
      confidence: safeEligibility?.confidence || 0,
    });
  }

  // 15. Tudo passou - usar resposta do runtime
  const selectedText = narrativeText;

  return deepFreeze({
    selectedSource: 'financial_runtime',
    selectedText,
    influenceApplied: true,
    fallbackUsed: false,
    reasonCodes: [],
    confidence: safeEligibility?.confidence || 0,
  });
}
