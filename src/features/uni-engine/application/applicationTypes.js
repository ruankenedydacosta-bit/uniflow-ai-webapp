// Uni Engine — Application (Parte 5, Bloco 3: primeira ativação controlada).
//
// Enum FECHADO da camada de aplicação. RESPONSE_STYLE_GUIDANCE e
// RESPONSE_LENGTH_GUIDANCE podem ser APLICADAS (texto realmente ajustado).
// QUESTION_GUIDANCE (Bloco 2) e CLARIFICATION_GUIDANCE (Bloco 3) produzem
// APENAS DECISÕES observacionais (questionDecision / clarificationDecision):
// a Uni NUNCA gera automaticamente pergunta ou esclarecimento — ela apenas
// sinaliza que o pipeline legado pode precisar esclarecer. Nunca texto, nunca
// alteração da resposta. Tudo exclusivamente em ambiente development, com
// Integration e Activation habilitadas e usuário autorizado. Nada de texto
// livre, IDs ou valores em enums: estados, motivos de fallback e flags são
// fechados. Tudo o mais permanece observacional/bloqueado.
export const APPLICATION_VERSION = '1.0';

// Modo ÚNICO autorizado: a aplicação é sempre CONTROLADA. Não existe modo
// irrestrito nesta parte — qualquer tentativa fora deste enum é rejeitada.
export const APPLICATION_MODES = Object.freeze(['controlled']);

// ÚNICAS capacidades autorizadas pela política de aplicação na Parte 5.
// STYLE e LENGTH aplicam texto; QUESTION e CLARIFICATION produzem decisões
// observacionais sem texto. Qualquer outra (DECISION_RECOMMENDATION, etc.) é
// bloqueada pela política, independentemente da Activation.
export const ALLOWED_APPLICATION_CAPABILITIES = Object.freeze([
  'RESPONSE_STYLE_GUIDANCE',
  'RESPONSE_LENGTH_GUIDANCE',
  'QUESTION_GUIDANCE',
  'CLARIFICATION_GUIDANCE',
]);

// Capacidades expressamente proibidas de serem aplicadas nesta parte.
export const BLOCKED_APPLICATION_CAPABILITIES = Object.freeze([
  'RESPONSE_CONTENT_INFLUENCE',
  'MEMORY_WRITE',
  'FINANCIAL_EXECUTION',
  'LEARNING_APPLICATION',
]);

export const APPLICATION_CAPABILITIES = Object.freeze([
  ...ALLOWED_APPLICATION_CAPABILITIES,
  ...BLOCKED_APPLICATION_CAPABILITIES,
]);

// Estados do resultado da aplicação. 'NOT_APPLIED' cobre o caso em que a
// capacidade está habilitada mas a aplicação não ocorreu por insuficiência de
// dados ou preferência persistida; 'FALLBACK' quando um gate ou erro obriga a
// devolver o texto legado; 'BLOCKED' quando um gate de segurança foi acionado.
export const APPLICATION_STATUSES = Object.freeze([
  'APPLIED',
  'NOT_APPLIED',
  'FALLBACK',
  'BLOCKED',
  'ERROR_SAFE',
]);

// Motivos de fallback da aplicação. Fechados; nenhum texto livre aqui.
export const APPLICATION_FALLBACK_REASONS = Object.freeze([
  'APPLICATION_DISABLED',
  'ENVIRONMENT_NOT_ALLOWED',
  'USER_NOT_AUTHORIZED',
  'ACTIVATION_DISABLED',
  'CAPABILITY_DISABLED',
  'CAPABILITY_NOT_ALLOWED',
  'CAPABILITY_BLOCKED',
  'INVALID_LEGACY_TEXT',
  'INVALID_GUIDANCE',
  'LOW_CONFIDENCE',
  'HIGH_RISK',
  'CIRCUIT_BREAKER_OPEN',
  'CONTRACT_ERROR',
  'APPLY_ERROR',
  'UNKNOWN',
]);

// Prioridades da decisão de pergunta (QUESTION_GUIDANCE, Bloco 2). Fechadas;
// nunca texto livre. A prioridade reflete o quanto a pergunta é necessária
// para o pipeline legado decidir se exibe ou não.
export const QUESTION_PRIORITIES = Object.freeze([
  'LOW',
  'MEDIUM',
  'HIGH',
]);

// Motivos da decisão de pergunta. Fechados; nunca texto livre. Espelham os
// motivos da Integration (applyQuestionGuidance) + motivos de decisão da
// camada de aplicação. Nenhum texto de pergunta entra aqui.
export const QUESTION_REASONS = Object.freeze([
  'NO_MISSING_FIELD',
  'MISSING_FIELD_DETECTED',
  'NO_SAFE_TARGET',
  'NOT_A_CLARIFICATION',
  'PROTECTED_RESPONSE',
  'TEXT_OUTSIDE_ALLOWLIST',
  'CAPABILITY_NOT_ACTIVE',
  'UNKNOWN',
]);

// Prioridades da decisão de esclarecimento (CLARIFICATION_GUIDANCE, Bloco 3).
// Fechadas; nunca texto livre. A prioridade reflete o quanto a clarificação
// é necessária para o pipeline legado decidir se exibe ou não.
export const CLARIFICATION_PRIORITIES = Object.freeze([
  'LOW',
  'MEDIUM',
  'HIGH',
]);

// Motivos da decisão de esclarecimento. Fechados; nunca texto livre. Espelham
// os motivos da Integration (applyClarificationGuidance) + motivos de decisão
// da camada de aplicação. Nenhum texto de pergunta entra aqui.
export const CLARIFICATION_REASONS = Object.freeze([
  'NO_AMBIGUITY',
  'AMBIGUITY_DETECTED',
  'NO_SAFE_TARGET',
  'NOT_A_CLARIFICATION',
  'PROTECTED_RESPONSE',
  'TEXT_OUTSIDE_ALLOWLIST',
  'CAPABILITY_NOT_ACTIVE',
  'UNKNOWN',
]);

// Chaves de segurança do resultado da aplicação. Sempre presentes e fechadas.
export const APPLICATION_SAFETY_KEYS = Object.freeze([
  'factualContentPreserved',
  'financialExecution',
  'memoryWrite',
  'learningApplied',
  'confirmationSkipped',
  'pendingActionModified',
  'databaseCalled',
  'ttsTriggeredByApplication',
]);

// Validate: status
export function isApplicationStatus(value) {
  return APPLICATION_STATUSES.includes(value);
}

export function isApplicationMode(value) {
  return APPLICATION_MODES.includes(value);
}

export function isApplicationCapability(value) {
  return APPLICATION_CAPABILITIES.includes(value);
}

export function isAllowedApplicationCapability(value) {
  return ALLOWED_APPLICATION_CAPABILITIES.includes(value);
}

export function isBlockedApplicationCapability(value) {
  return BLOCKED_APPLICATION_CAPABILITIES.includes(value);
}

export function isApplicationFallbackReason(value) {
  return APPLICATION_FALLBACK_REASONS.includes(value);
}

export function isApplicationSafetyKey(value) {
  return APPLICATION_SAFETY_KEYS.includes(value);
}

export function isQuestionPriority(value) {
  return QUESTION_PRIORITIES.includes(value);
}

export function isQuestionReason(value) {
  return QUESTION_REASONS.includes(value);
}

export function isClarificationPriority(value) {
  return CLARIFICATION_PRIORITIES.includes(value);
}

export function isClarificationReason(value) {
  return CLARIFICATION_REASONS.includes(value);
}

// Normalizers
export function normalizeApplicationStatus(value) {
  if (typeof value !== 'string') return 'NOT_APPLIED';
  const upper = value.toUpperCase();
  if (APPLICATION_STATUSES.includes(upper)) return upper;
  if (upper === 'APPLIED' || value === 'applied') return 'APPLIED';
  return 'NOT_APPLIED';
}

export function normalizeApplicationMode(value) {
  if (value !== 'controlled') return 'controlled';
  return 'controlled';
}

export function normalizeApplicationCapability(value) {
  if (typeof value !== 'string') return 'UNKNOWN';
  if (APPLICATION_CAPABILITIES.includes(value)) return value;
  const upper = value.toUpperCase();
  if (APPLICATION_CAPABILITIES.includes(upper)) return upper;
  return 'UNKNOWN';
}

export function normalizeApplicationFallbackReason(value) {
  if (typeof value !== 'string') return 'UNKNOWN';
  if (APPLICATION_FALLBACK_REASONS.includes(value)) return value;
  const upper = value.toUpperCase();
  if (APPLICATION_FALLBACK_REASONS.includes(upper)) return upper;
  return 'UNKNOWN';
}

export function normalizeQuestionPriority(value) {
  if (typeof value !== 'string') return 'LOW';
  if (QUESTION_PRIORITIES.includes(value)) return value;
  const upper = value.toUpperCase();
  if (QUESTION_PRIORITIES.includes(upper)) return upper;
  return 'LOW';
}

export function normalizeQuestionReason(value) {
  if (typeof value !== 'string') return 'UNKNOWN';
  if (QUESTION_REASONS.includes(value)) return value;
  const upper = value.toUpperCase();
  if (QUESTION_REASONS.includes(upper)) return upper;
  return 'UNKNOWN';
}

export function normalizeClarificationPriority(value) {
  if (typeof value !== 'string') return 'LOW';
  if (CLARIFICATION_PRIORITIES.includes(value)) return value;
  const upper = value.toUpperCase();
  if (CLARIFICATION_PRIORITIES.includes(upper)) return upper;
  return 'LOW';
}

export function normalizeClarificationReason(value) {
  if (typeof value !== 'string') return 'UNKNOWN';
  if (CLARIFICATION_REASONS.includes(value)) return value;
  const upper = value.toUpperCase();
  if (CLARIFICATION_REASONS.includes(upper)) return upper;
  return 'UNKNOWN';
}
