// Recomendações de Decisão (Fase 5 — Shadow Mode).
//
// buildDecisionSuggestions() produz a lista estruturada de recomendações da
// rodada (ASK_ACCOUNT, ASK_CATEGORY, CONSULT_MEMORY, etc.). São APENAS
// estruturadas — nunca utilizadas automaticamente.
import { DECISION_POLICY } from './decisionPolicy.js';
import { isValidDecisionSuggestion } from './decisionTypes.js';

const FIELD_TO_SUGGESTION = Object.freeze({
  account: 'ASK_ACCOUNT',
  destinationAccount: 'ASK_DESTINATION_ACCOUNT',
  sourceAccount: 'ASK_DESTINATION_ACCOUNT',
  category: 'ASK_CATEGORY',
  amount: 'ASK_AMOUNT',
  date: 'ASK_DATE',
  description: 'ASK_DESCRIPTION',
  confirmation: 'ASK_CONFIRMATION',
  goal: 'ASK_DESCRIPTION',
  transaction: 'ASK_DESCRIPTION',
});

export function buildDecisionSuggestions({ decisionType, context = {} } = {}) {
  const suggestions = [];
  const push = (value, detail = null) => {
    if (!isValidDecisionSuggestion(value)) return;
    if (suggestions.some((entry) => entry.suggestion === value)) return;
    if (suggestions.length >= DECISION_POLICY.limits.maxRecommendations) return;
    suggestions.push({
      suggestion: value,
      detail: detail ?? suggestionDetail(value),
    });
  };

  const missingFields = Array.isArray(context.missingFields) ? context.missingFields : [];
  const evidence = context.evidence ?? {};

  // Perguntar informação faltante.
  for (const field of missingFields) {
    const suggestion = FIELD_TO_SUGGESTION[field];
    if (suggestion) push(suggestion, field);
  }

  // Consultar banco / snapshot / memória.
  if (context.needDatabase && !evidence.snapshotAvailable) push('CONSULT_DATABASE');
  if (context.needSnapshot) push('REFRESH_SNAPSHOT');
  if (context.needMemory && evidence.referenceAmbiguous) push('CONSULT_MEMORY');

  // Confirmação.
  if (evidence.pendingReady || evidence.requiresConfirmation) {
    push('ASK_CONFIRMATION', 'pending_ready');
  }
  if (context.consistency === 'CONFLICTING' || evidence.balanceConflict) {
    push('ASK_CONFIRMATION', 'conflicting_balance');
  }
  if (evidence.memoryConflict) {
    push('IGNORE_MEMORY');
  }

  // Contexto / aguardar.
  if (decisionType === 'WAIT') push('WAIT_FOR_USER');
  if (decisionType === 'DEFER') push('WAIT_FOR_USER');
  if (context.sufficiency === 'SUFFICIENT' && decisionType === 'ANSWER') {
    push('USE_CONTEXT');
  }
  if (decisionType === 'CANCEL' || (evidence.pendingActive && decisionType !== 'ANSWER')) {
    push('CANCEL_PENDING');
  }
  if (decisionType === 'REJECT' || decisionType === 'UNKNOWN') {
    push('REJECT_ACTION');
  }

  return suggestions;
}

function suggestionDetail(suggestion) {
  const details = {
    ASK_ACCOUNT: 'perguntar conta',
    ASK_DESTINATION_ACCOUNT: 'perguntar conta destino',
    ASK_CATEGORY: 'perguntar categoria',
    ASK_AMOUNT: 'perguntar valor',
    ASK_DATE: 'perguntar data',
    ASK_DESCRIPTION: 'perguntar descrição',
    ASK_CONFIRMATION: 'solicitar confirmação',
    CONSULT_MEMORY: 'consultar memória',
    CONSULT_DATABASE: 'consultar banco',
    USE_CONTEXT: 'reutilizar contexto',
    WAIT_FOR_USER: 'aguardar usuário',
    IGNORE_MEMORY: 'ignorar memória',
    REFRESH_SNAPSHOT: 'atualizar snapshot',
    CANCEL_PENDING: 'cancelar pendência',
    REJECT_ACTION: 'rejeitar ação',
    UNKNOWN: 'recomendação desconhecida',
  };
  return details[suggestion] ?? 'recomendação estruturada';
}
