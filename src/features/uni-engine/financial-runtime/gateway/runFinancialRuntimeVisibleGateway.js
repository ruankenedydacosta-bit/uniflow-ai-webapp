// Uni Engine — Fase 18: Gateway de Integração do Runtime Financeiro Visível.
// Adapter de borda do gateway para resposta visível controlada do runtime financeiro.
// Escolhe entre resposta do runtime financeiro ou resposta legada com base em gates de segurança.
// Reutiliza o pipeline do gateway Uni Engine e executa o novo seletor financeiro da Fase 18.

import { selectFinancialVisibleResponse } from '../response-selection/index.js';

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

// ETAPA 3 (consolidação Fase 19): esta função era chamada 11 vezes neste
// arquivo sem nunca ter sido definida ou importada -- ReferenceError
// reproduzível em QUALQUER chamada de runFinancialRuntimeVisibleGateway(),
// incluindo o caso mais trivial ({} ou legacyText vazio). O caminho legado
// sempre venceu por padrão (fail-safe correto), então nunca foi exercitado
// em produção -- mas o arquivo está morto/não importado por nada, sem
// teste, então o bug nunca apareceu. Formato: sempre falha-segura para o
// texto legado, nunca "eligible".
function createEmptyFinancialRuntimeResponse(input) {
  const legacyText = typeof input?.legacyText === 'string' ? input.legacyText : '';
  return {
    version: '1.0',
    eligible: false,
    decision: 'use_legacy',
    confidence: 0,
    reasonCodes: [],
    selectedSource: 'legacy',
    selectedText: legacyText,
    influenceApplied: false,
    fallbackUsed: true,
    serializable: true,
  };
}

export function runFinancialRuntimeVisibleGateway(input = {}) {
  const safeInput = input && typeof input === 'object' ? input : {};

  // Verificar se há um cenário seguro e determinístico: sem gateway, sem legacy,
  // sem execução financeira direta, sem alterações em confirmações/pending actions.

  // 1. Verificar se há resposta legada válida
  const legacyText = typeof safeInput.legacyText === 'string' ? safeInput.legacyText : '';
  if (!legacyText) {
    return deepFreeze({
      ...createEmptyFinancialRuntimeResponse(safeInput),
      reasonCodes: ['LEGACY_TEXT_EMPTY'],
    });
  }

  // 2. Verificar se o runtime financeiro está habilitado (config.financialRuntimeVisibleEnabled)
  const config = safeInput.config && typeof safeInput.config === 'object' ? safeInput.config : {};
  if (config.financialRuntimeVisibleEnabled !== true) {
    return deepFreeze({
      ...createEmptyFinancialRuntimeResponse(safeInput),
      reasonCodes: ['FEATURE_DISABLED'],
    });
  }

  // 3. Verificar se há resultado de runtime calculado (executado em shadow mode)
  const runtimeResult = safeInput.runtimeResult && typeof safeInput.runtimeResult === 'object' ? safeInput.runtimeResult : null;
  if (!runtimeResult) {
    return deepFreeze({
      ...createEmptyFinancialRuntimeResponse(safeInput),
      reasonCodes: ['NO_RUNTIME_RESULT'],
    });
  }

  // 4. Validar identidade ativa (match turnId)
  const turnId = typeof safeInput.turnId === 'string' ? safeInput.turnId : null;
  const activeIdentity = safeInput.activeIdentity && typeof safeInput.activeIdentity === 'object' ? safeInput.activeIdentity : null;
  const runtimeTurnId = runtimeResult.turnId;
  const activeTurnId = activeIdentity?.turnId;
  if (runtimeTurnId && activeTurnId && runtimeTurnId !== activeTurnId) {
    return deepFreeze({
      ...createEmptyFinancialRuntimeResponse(safeInput),
      reasonCodes: ['IDENTITY_CHANGED'],
    });
  }

  // 5. Verificar narrativa (não vazia, sem debug/internal)
  const narrative = safeInput.narrative && typeof safeInput.narrative === 'object' ? safeInput.narrative : null;
  const narrativeText = narrative?.text;
  if (!narrativeText || !narrativeText.trim()) {
    return deepFreeze({
      ...createEmptyFinancialRuntimeResponse(safeInput),
      reasonCodes: ['NARRATIVE_EMPTY'],
    });
  }
  if (narrativeText.includes('[DEBUG]') || narrativeText.includes('[INTERNAL]')) {
    return deepFreeze({
      ...createEmptyFinancialRuntimeResponse(safeInput),
      reasonCodes: ['NARRATIVE_INVALID'],
    });
  }

  // 6. Validar elegibilidade para resposta visível do runtime
  const eligibility = safeInput.eligibility && typeof safeInput.eligibility === 'object' ? safeInput.eligibility : null;
  if (!eligibility || !eligibility.eligible) {
    return deepFreeze({
      ...createEmptyFinancialRuntimeResponse(safeInput),
      reasonCodes: eligibility?.reasonCodes || ['NOT_ELIGIBLE'],
    });
  }

  // 7. Validar validação factual (se fornecida)
  const factualValidation = safeInput.factualValidation && typeof safeInput.factualValidation === 'object' ? safeInput.factualValidation : null;
  if (factualValidation && !factualValidation.valid) {
    return deepFreeze({
      ...createEmptyFinancialRuntimeResponse(safeInput),
      reasonCodes: factualValidation.reasonCodes || ['FACTS_INVALID'],
    });
  }

  // 8. Validar confiança (se fornecida)
  const confidence = safeInput.confidence;
  const minConfidence = config.financialRuntimeVisibleMinConfidence || 0.90;
  if (confidence && (typeof confidence !== 'number' || confidence < minConfidence)) {
    return deepFreeze({
      ...createEmptyFinancialRuntimeResponse(safeInput),
      reasonCodes: ['CONFIDENCE_INSUFFICIENT'],
    });
  }

  // 9. Verificar action pendente bloqueando
  const pendingAction = safeInput.pendingAction && typeof safeInput.pendingAction === 'object' ? safeInput.pendingAction : null;
  if (pendingAction && pendingAction.status === 'active') {
    return deepFreeze({
      ...createEmptyFinancialRuntimeResponse(safeInput),
      reasonCodes: ['PENDING_ACTION_ACTIVE'],
    });
  }

  // 10. 400 caracteres: configurar contexto para seletor centralizado
  const selectionContext = {
    legacyText,
    runtimeResult,
    eligibility,
    factualValidation,
    confidence,
    config,
    activeIdentity,
    pendingAction,
    narrative,
    turnId,
    messageId: safeInput.messageId,
    conversationId: safeInput.conversationId,
    workspaceId: safeInput.workspaceId,
  };

  // 11. Executar o seletor centralizado de resposta visível
  const selectionResult = selectFinancialVisibleResponse(selectionContext);

  // 12. Retornar resultado da seleção
  return deepFreeze({
    ...createEmptyFinancialRuntimeResponse(safeInput),
    eligible: selectionResult.selectedSource === 'financial_runtime',
    decision: selectionResult.selectedSource === 'financial_runtime' ? 'use_runtime' : 'use_legacy',
    confidence: selectionResult.confidence,
    reasonCodes: selectionResult.reasonCodes,
    selectedSource: selectionResult.selectedSource,
    selectedText: selectionResult.selectedText,
    influenceApplied: selectionResult.influenceApplied,
    fallbackUsed: selectionResult.fallbackUsed,
  });
}
