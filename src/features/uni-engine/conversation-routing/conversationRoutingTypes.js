// Uni Engine — Conversation Routing (Parte 8, Bloco Único).
//
// Camada de ROTEAMENTO conversacional CONTROLADO em DEV. O pipeline legado
// consulta o Conversation Plan do MESMO turno para selecionar, de forma
// controlada, qual caminho conversacional JÁ AUTORIZADO deve prevalecer.
//
// O seletor NÃO cria texto, NÃO executa ações, NÃO escreve memória e NÃO
// substitui a máquina de estados legada (Pending Action). Ele apenas decide
// a rota entre alternativas JÁ produzidas pelo legado:
//   - ROUTE_ANSWER          → resposta permitida pela Application Layer
//                             (fallback para o texto legado);
//   - ROUTE_QUESTION        → pergunta controlada válida (template fechado);
//   - ROUTE_CLARIFICATION   → esclarecimento controlado válido (template
//                             fechado);
//   - ROUTE_CONFIRMATION    → confirmação legada existente (a Engine nunca
//                             cria nem pula confirmação);
//   - ROUTE_WAIT            → somente quando o fluxo legado JÁ aguarda;
//   - ROUTE_NONE            → somente quando o legado já decidiu não enviar
//                             mensagem;
//   - ROUTE_LEGACY_SECURITY_ERROR → erro/instrução de segurança obrigatório
//                             do legado (vence o Planner);
//   - ROUTE_LEGACY_FALLBACK → qualquer gate falhou → legado integral.
//
// Prioridade determinística fechada (policy): confirmação obrigatória do
// legado > erro/segurança obrigatório do legado > clarificação crítica válida
// > pergunta obrigatória válida > resposta autorizada > espera válida >
// nenhuma saída válida > fallback legado. O nextStep do Planner NUNCA
// contorna essa prioridade.
export const CONVERSATION_ROUTING_VERSION = '1.0';

// Rotas fechadas do seletor. Tudo o mais é rejeitado.
export const ROUTES = Object.freeze([
  'ROUTE_ANSWER',
  'ROUTE_QUESTION',
  'ROUTE_CLARIFICATION',
  'ROUTE_CONFIRMATION',
  'ROUTE_WAIT',
  'ROUTE_NONE',
  'ROUTE_LEGACY_SECURITY_ERROR',
  'ROUTE_LEGACY_FALLBACK',
]);

// Status do resultado do roteamento.
export const ROUTING_STATUSES = Object.freeze([
  'ROUTED',
  'LEGACY',
  'BLOCKED',
  'ERROR_SAFE',
  'UNKNOWN',
]);

// Fonte da rota escolhida (fechada). 'planner' quando o Conversation Planner
// orientou; 'legacy-priority' quando uma obrigação do legado venceu o plano;
// 'policy' quando nenhuma rota do plano é válida e o legado prevalece por
// política; 'fallback' quando um gate/erro obrigou o legado.
export const ROUTING_SOURCES = Object.freeze([
  'planner',
  'legacy-priority',
  'policy',
  'fallback',
]);

// Motivos de fallback/bloqueio (fechados; nenhum texto livre aqui).
export const ROUTING_FALLBACK_REASONS = Object.freeze([
  'ROUTING_DISABLED',
  'ENVIRONMENT_NOT_ALLOWED',
  'USER_NOT_AUTHORIZED',
  'INTEGRATION_DISABLED',
  'ACTIVATION_DISABLED',
  'APPLICATION_DISABLED',
  'PLANNER_INVALID',
  'PLANNER_STATUS_INVALID',
  'SAME_TURN_VIOLATED',
  'LOW_CONFIDENCE',
  'HIGH_RISK',
  'CIRCUIT_BREAKER_OPEN',
  'CAPABILITY_INCOMPATIBLE',
  'EXECUTION_READINESS_INCOMPATIBLE',
  'DOWNSTREAM_RESULT_INVALID',
  'ROUTE_UNKNOWN',
  'NO_VALID_ROUTE',
  'LEGACY_REQUIRED',
  'ERROR_SAFE',
  'UNKNOWN',
]);

// Diagnósticos estruturados do roteamento (vocabulário fechado).
export const ROUTING_DIAGNOSTIC_CODES = Object.freeze([
  'ROUTE_SELECTED',
  'LEGACY_CONFIRMATION_PRIORITY',
  'LEGACY_SECURITY_ERROR_PRIORITY',
  'PLANNER_ORIENTED_ROUTE',
  'LEGACY_ROUTE_SELECTED',
  'PLANNER_ROUTE_INVALID',
  'DOWNSTREAM_INVALID',
  'SAME_TURN_VIOLATED',
  'ROUTING_DISABLED',
  'GATE_FAILED',
  'CONFIRMATION_PRESERVED',
  'PENDING_ACTION_PRESERVED',
  'DUPLICATE_PREVENTED',
  'FALLBACK_USED',
  'ERROR_SAFE',
  'UNKNOWN',
]);

// Chaves de segurança do resultado. Sempre presentes e fechadas (nunca true).
export const ROUTING_SAFETY_KEYS = Object.freeze([
  'financialExecution',
  'memoryWrite',
  'learningApplied',
  'confirmationSkipped',
  'pendingActionModifiedUnsafely',
  'databaseCalled',
  'rpcCalled',
  'duplicateMessageCreated',
  'freeTextGenerated',
]);

export function isRoute(value) {
  return ROUTES.includes(value);
}

export function isRoutingStatus(value) {
  return ROUTING_STATUSES.includes(value);
}

export function isRoutingSource(value) {
  return ROUTING_SOURCES.includes(value);
}

export function isRoutingFallbackReason(value) {
  return ROUTING_FALLBACK_REASONS.includes(value);
}

export function isRoutingSafetyKey(value) {
  return ROUTING_SAFETY_KEYS.includes(value);
}
