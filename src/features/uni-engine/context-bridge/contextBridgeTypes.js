// Uni Engine — Context Bridge (Fase 11, Bloco 2): tipos.
//
// O Context Bridge NÃO é uma nova camada cognitiva: é apenas um adaptador
// que transforma snapshots JÁ produzidos no MESMO turno (Gateway, Integration,
// Cognitive Orchestrator, Rollout, Readiness, resposta legada, Pending Action
// e confirmação) em um contexto mínimo, serializável e imutável para o ponto
// único de construção da resposta. Nunca reexecuta camada alguma, nunca gera
// texto, nunca executa, nunca persiste.
//
// Influências permitidas (somente estas, e sempre sobre alternativas que já
// existem): estilo da resposta, comprimento da resposta, pergunta controlada
// (template fechado), esclarecimento controlado (template fechado) e rota
// conversacional sobre alternativas legadas. Tudo o mais permanece bloqueado.
export const CONTEXT_BRIDGE_VERSION = '1.0';

// Estados do resultado da ponte. 'ALLOWED' quando os gates passaram e existe
// pelo menos uma influência autorizada; 'OFF' quando a ponte está desligada
// (flag explícita ausente); 'BLOCKED' quando um gate de segurança falhou;
// 'FALLBACK' quando não há contexto utilizável; 'ERROR_SAFE' em erro interno.
export const CONTEXT_BRIDGE_STATUSES = Object.freeze([
  'ALLOWED',
  'OFF',
  'BLOCKED',
  'FALLBACK',
  'ERROR_SAFE',
]);

// ÚNICAS influências que a ponte pode autorizar. Cada uma delas orienta um
// componente JÁ implementado e permitido — nunca cria conteúdo livre.
export const ALLOWED_CONTEXT_INFLUENCES = Object.freeze([
  'RESPONSE_STYLE_GUIDANCE',
  'RESPONSE_LENGTH_GUIDANCE',
  'QUESTION_GUIDANCE',
  'CLARIFICATION_GUIDANCE',
  'CONVERSATION_ROUTING',
]);

// Influências expressamente proibidas de serem autorizadas pela ponte.
export const BLOCKED_CONTEXT_INFLUENCES = Object.freeze([
  'FINANCIAL_EXECUTION',
  'MEMORY_WRITE',
  'LEARNING_APPLICATION',
  'RESPONSE_CONTENT_INFLUENCE',
]);

export const CONTEXT_BRIDGE_INFLUENCES = Object.freeze([
  ...ALLOWED_CONTEXT_INFLUENCES,
  ...BLOCKED_CONTEXT_INFLUENCES,
]);

// Motivos de recusa/fallback da ponte. Fechados; nenhum texto livre aqui.
// A ordem da lista espelha a ordem dos gates em buildEngineResponseContext.
export const CONTEXT_BRIDGE_FALLBACK_REASONS = Object.freeze([
  'BRIDGE_DISABLED',
  'GATEWAY_ABSENT',
  'SAME_TURN_VIOLATED',
  'ROLLOUT_OFF',
  'ROLLOUT_SHADOW',
  'ROLLOUT_CANARY',
  'ROLLOUT_BLOCKED',
  'ENVIRONMENT_NOT_ALLOWED',
  'USER_NOT_AUTHORIZED',
  'ORCHESTRATOR_INVALID',
  'READINESS_INVALID',
  'DOWNSTREAM_RESULT_INVALID',
  'CIRCUIT_BREAKER_OPEN',
  'LOW_CONFIDENCE',
  'HIGH_RISK',
  'CONFIRMATION_MANDATORY',
  'NO_ALLOWED_INFLUENCE',
  'ERROR_SAFE',
]);

// Códigos de diagnóstico da ponte. Fechados.
export const CONTEXT_BRIDGE_DIAGNOSTIC_CODES = Object.freeze([
  'BRIDGE_ENABLED',
  'BRIDGE_DISABLED',
  'INFLUENCE_ALLOWED',
  'INFLUENCE_BLOCKED_BY_POLICY',
  'INFLUENCE_UNKNOWN',
  'CAPABILITY_DISABLED',
  'SAME_TURN_ENFORCED',
  'SAME_TURN_VIOLATED',
  'CONFIRMATION_PRESERVED',
  'PENDING_ACTION_PRESERVED',
  'LEGACY_PRESERVED',
  'BRIDGE_ERROR_SAFE',
]);

// Chaves de segurança do resultado da ponte. Sempre presentes e fechadas.
export const CONTEXT_BRIDGE_SAFETY_KEYS = Object.freeze([
  'responseModified',
  'financialExecution',
  'memoryWrite',
  'learningApplied',
  'confirmationSkipped',
  'pendingActionModified',
  'databaseCalled',
  'rpcCalled',
  'ttsTriggered',
  'persistenceWritten',
]);

export function isContextBridgeStatus(value) {
  return CONTEXT_BRIDGE_STATUSES.includes(value);
}

export function isContextBridgeInfluence(value) {
  return CONTEXT_BRIDGE_INFLUENCES.includes(value);
}

export function isAllowedContextInfluence(value) {
  return ALLOWED_CONTEXT_INFLUENCES.includes(value);
}

export function isBlockedContextInfluence(value) {
  return BLOCKED_CONTEXT_INFLUENCES.includes(value);
}

export function isContextBridgeFallbackReason(value) {
  return CONTEXT_BRIDGE_FALLBACK_REASONS.includes(value);
}

export function isContextBridgeDiagnosticCode(value) {
  return CONTEXT_BRIDGE_DIAGNOSTIC_CODES.includes(value);
}

export function isContextBridgeSafetyKey(value) {
  return CONTEXT_BRIDGE_SAFETY_KEYS.includes(value);
}
