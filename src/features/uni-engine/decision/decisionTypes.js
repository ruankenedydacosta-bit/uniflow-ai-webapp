// Tipos fechados da Camada de Decisão Cognitiva (Fase 5 — Shadow Mode).
//
// Enums fechados e validados — nenhum valor fora destas listas é aceito
// pelos contratos da camada de decisão. A camada NUNCA executa nenhuma
// decisão: ela apenas recomenda a melhor decisão possível em Shadow Mode
// (appliedToDecision permanece SEMPRE falso).
//
// Princípio: nenhum conceito das Fases 1–4 é duplicado aqui — enums da
// Fase 1 (UNI_ENGINE_PLAN_DECISIONS) continuam intactos; esta camada
// estende o vocabulário com o vocabulário de decisão explícito da Fase 5.

// -----------------------------------------------
// Tipos de decisão (seção: DecisionType)
// -----------------------------------------------
export const DECISION_TYPES = Object.freeze([
  'ANSWER',
  'ASK',
  'CONFIRM',
  'WAIT',
  'CONSULT_MEMORY',
  'CONSULT_DATABASE',
  'REJECT',
  'CANCEL',
  'DEFER',
  'UNKNOWN',
]);

// -----------------------------------------------
// Riscos de decisão (seção: DecisionRisk)
// -----------------------------------------------
export const DECISION_RISKS = Object.freeze([
  'NONE',
  'LOW',
  'MEDIUM',
  'HIGH',
  'CRITICAL',
]);

// -----------------------------------------------
// Razões de decisão (seção: DecisionReason)
// -----------------------------------------------
export const DECISION_REASONS = Object.freeze([
  'HIGH_CONFIDENCE',
  'LOW_CONFIDENCE',
  'INSUFFICIENT_CONTEXT',
  'MEMORY_CONFLICT',
  'STALE_DATA',
  'MISSING_ACCOUNT',
  'MISSING_CATEGORY',
  'MISSING_AMOUNT',
  'MISSING_CONFIRMATION',
  'PENDING_ACTION',
  'EPISODIC_REFERENCE',
  'DATABASE_REQUIRED',
  'MEMORY_REQUIRED',
  'USER_CONFIRMATION_REQUIRED',
  'UNKNOWN',
]);

// -----------------------------------------------
// Suficiência de contexto (seção: Context Sufficiency)
// -----------------------------------------------
export const DECISION_CONTEXT_SUFFICIENCY = Object.freeze([
  'SUFFICIENT',
  'PARTIAL',
  'INSUFFICIENT',
  'UNKNOWN',
]);

// -----------------------------------------------
// Consistência de decisão (seção: Consistency)
// -----------------------------------------------
export const DECISION_CONSISTENCY_STATES = Object.freeze([
  'CONSISTENT',
  'PARTIAL',
  'CONFLICTING',
  'UNKNOWN',
]);

// -----------------------------------------------
// Diagnósticos estruturados (nunca texto livre)
// -----------------------------------------------
export const DECISION_DIAGNOSTICS = Object.freeze([
  'CONTEXT_SUFFICIENT',
  'MEMORY_CONSISTENT',
  'SNAPSHOT_OUTDATED',
  'DATABASE_REQUIRED',
  'USER_CONFIRMATION_REQUIRED',
  'EXECUTOR_UNAVAILABLE',
  'PENDING_ACTION_ACTIVE',
  'CONVERSATION_SWITCHED',
  'MULTIPLE_ACCOUNTS',
  'CATEGORY_INFERRED',
  'AMBIGUOUS_AMOUNT',
  'MEMORY_CONFLICT',
  'INTENT_CONFIRMED',
  'INTENT_AMBIGUOUS',
  'CONTEXT_INSUFFICIENT',
  'SNAPSHOT_MISSING',
  'MEMORY_MISSING',
  'REFERENCE_AMBIGUOUS',
  'HISTORY_EMPTY',
  'PENDING_READY',
  'PENDING_EXECUTING',
  'BALANCE_CONFLICT',
  'STALE_INFORMATION',
  'UNKNOWN',
]);

// -----------------------------------------------
// Recomendações estruturadas (nunca executadas)
// -----------------------------------------------
export const DECISION_SUGGESTIONS = Object.freeze([
  'ASK_ACCOUNT',
  'ASK_CATEGORY',
  'ASK_AMOUNT',
  'ASK_DATE',
  'ASK_CONFIRMATION',
  'CONSULT_MEMORY',
  'CONSULT_DATABASE',
  'USE_CONTEXT',
  'WAIT_FOR_USER',
  'IGNORE_MEMORY',
  'REFRESH_SNAPSHOT',
  'CANCEL_PENDING',
  'ASK_DESTINATION_ACCOUNT',
  'ASK_DESCRIPTION',
  'REJECT_ACTION',
  'UNKNOWN',
]);

// -----------------------------------------------
// Faixas de confiança de decisão (0..1)
// -----------------------------------------------
export const DECISION_CONFIDENCE_BANDS = Object.freeze([
  { label: 'very_low', min: 0.0, max: 0.24 },
  { label: 'low', min: 0.25, max: 0.49 },
  { label: 'medium', min: 0.5, max: 0.69 },
  { label: 'high', min: 0.7, max: 0.89 },
  { label: 'very_high', min: 0.9, max: 1.0 },
]);

// -----------------------------------------------
// Tipos de risco (seção: detectDecisionRisk)
// -----------------------------------------------
export const DECISION_RISK_TYPES = Object.freeze([
  'wrong_action_execution',
  'wrong_category',
  'wrong_account',
  'conflicting_balance',
  'insufficient_context',
  'stale_information',
  'ambiguous_reference',
  'inconsistent_memory',
  'divergent_database',
  'incorrect_executor',
  'interpretation_risk',
  'context_risk',
]);

// -----------------------------------------------
// Chaves de dependência de decisão
// -----------------------------------------------
export const DECISION_DEPENDENCY_KEYS = Object.freeze([
  'requiresMemory',
  'requiresDatabase',
  'requiresConfirmation',
  'requiresConversation',
  'requiresSnapshot',
  'requiresHistory',
  'requiresExecutor',
  'requiresUser',
]);

// -----------------------------------------------
// Validadores
// -----------------------------------------------
function isValid(value, list) {
  return Array.isArray(list) && list.includes(value);
}

export function isValidDecisionType(value) {
  return isValid(value, DECISION_TYPES);
}

export function isValidDecisionRisk(value) {
  return isValid(value, DECISION_RISKS);
}

export function isValidDecisionReason(value) {
  return isValid(value, DECISION_REASONS);
}

export function isValidDecisionContextSufficiency(value) {
  return isValid(value, DECISION_CONTEXT_SUFFICIENCY);
}

export function isValidDecisionConsistency(value) {
  return isValid(value, DECISION_CONSISTENCY_STATES);
}

export function isValidDecisionDiagnostic(value) {
  return isValid(value, DECISION_DIAGNOSTICS);
}

export function isValidDecisionSuggestion(value) {
  return isValid(value, DECISION_SUGGESTIONS);
}

export function isValidDecisionRiskType(value) {
  return isValid(value, DECISION_RISK_TYPES);
}

// Faixa conceitual de uma confiança de decisão (0..1).
export function describeDecisionConfidence(confidence) {
  const value = Number(confidence) || 0;
  for (const band of DECISION_CONFIDENCE_BANDS) {
    if (value >= band.min && value <= band.max) return band.label;
  }
  return 'very_low';
}
