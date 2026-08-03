// Uni Engine — Controlled Question (Parte 6, Bloco Único: perguntas seguras
// pelo pipeline legado).
//
// Enum FECHADO da camada de pergunta controlada. A Uni Engine NUNCA escreve
// texto livre de pergunta: ela apenas indica se deve perguntar, a prioridade,
// a informação ausente/ambígua, o motivo, a confiança e o diagnóstico. A
// seleção da pergunta usa EXCLUSIVAMENTE templates fechados e explicitamente
// permitidos (QUESTION_TEMPLATES em controlledQuestionPolicy.js), sem valores,
// nomes de conta ou dados inventados.
export const CONTROLLED_QUESTION_VERSION = '1.0';

// Capacidades desta parte que podem produzir pergunta segura.
export const CONTROLLED_QUESTION_CAPABILITIES = Object.freeze([
  'QUESTION_GUIDANCE',
  'CLARIFICATION_GUIDANCE',
]);

// Tipos de decisão de saída (fechados).
export const CONTROLLED_QUESTION_DECISION_TYPES = Object.freeze([
  'question',
  'clarification',
]);

// Chaves de template fechadas. Um campo de informação ausente mapeia para a
// chave com o MESMO nome; uma ambiguidade mapeia para 'ambiguity_<campo>'.
export const CONTROLLED_QUESTION_TEMPLATE_KEYS = Object.freeze([
  'account',
  'category',
  'transactionType',
  'amount',
  'description',
  'ambiguity_account',
  'ambiguity_category',
  'ambiguity_intent',
]);

// Campos de informação ausente aceitos (allowlist fechada). Fora desta lista
// a pergunta NUNCA é emitida.
export const ALLOWED_REQUESTED_FIELDS = Object.freeze([
  'account',
  'category',
  'transactionType',
  'amount',
  'description',
]);

// Campos de ambiguidade aceitos (allowlist fechada).
export const ALLOWED_AMBIGUITY_FIELDS = Object.freeze([
  'account',
  'category',
  'intent',
]);

// Motivos de fallback/bloqueio (fechados).
export const CONTROLLED_QUESTION_REASONS = Object.freeze([
  'CONFIRMATION_PRECEDES',
  'CLARIFICATION_PRIORITY',
  'NO_DECISION',
  'NO_ASK',
  'NO_CLARIFY',
  'INVALID_DECISION',
  'ENVIRONMENT_NOT_ALLOWED',
  'USER_NOT_AUTHORIZED',
  'INTEGRATION_DISABLED',
  'ACTIVATION_DISABLED',
  'APPLICATION_DISABLED',
  'CONTROLLED_QUESTIONS_DISABLED',
  'CAPABILITY_DISABLED',
  'LOW_CONFIDENCE',
  'RISK_NOT_ALLOWED',
  'CIRCUIT_BREAKER_OPEN',
  'EXECUTION_NOT_READY',
  'STALE_TURN',
  'UNKNOWN_TEMPLATE',
  'FIELD_NOT_ALLOWED',
  'PENDING_ACTION_INCOMPATIBLE',
  'DUPLICATE_QUESTION',
  'INTERNAL_ERROR',
  'UNKNOWN',
]);

// Safety da pergunta controlada (fechado). Todo campo deve existir e ser
// false em qualquer resultado — a camada nunca executa, escreve, persiste,
// chama banco/RPC ou dispara TTS.
export const CONTROLLED_QUESTION_SAFETY_KEYS = Object.freeze([
  'financialExecution',
  'memoryWrite',
  'learningApplied',
  'confirmationSkipped',
  'pendingActionModifiedUnsafely',
  'databaseCalled',
  'rpcCalled',
  'duplicateMessageCreated',
]);

export function isControlledQuestionCapability(capability) {
  return CONTROLLED_QUESTION_CAPABILITIES.includes(capability);
}

export function isControlledQuestionDecisionType(decisionType) {
  return CONTROLLED_QUESTION_DECISION_TYPES.includes(decisionType);
}

export function isControlledQuestionTemplateKey(templateKey) {
  return CONTROLLED_QUESTION_TEMPLATE_KEYS.includes(templateKey);
}

export function isAllowedRequestedField(field) {
  return ALLOWED_REQUESTED_FIELDS.includes(field);
}

export function isAllowedAmbiguityField(field) {
  return ALLOWED_AMBIGUITY_FIELDS.includes(field);
}

export function isControlledQuestionReason(reason) {
  return CONTROLLED_QUESTION_REASONS.includes(reason);
}

export function normalizeControlledQuestionReason(reason) {
  if (typeof reason !== 'string' || !isControlledQuestionReason(reason)) {
    return 'UNKNOWN';
  }
  return reason;
}

export function isControlledQuestionSafetyKey(key) {
  return CONTROLLED_QUESTION_SAFETY_KEYS.includes(key);
}
