// Uni Engine — Conversation Routing (Parte 8, Bloco Único).
//
// Camada de ROTEAMENTO conversacional CONTROLADO em DEV. O pipeline legado
// consulta o Conversation Plan do MESMO turno para selecionar, de forma
// controlada, qual caminho conversacional JÁ AUTORIZADO deve prevalecer —
// sem nunca criar texto, sem nunca executar, sem nunca substituir a máquina
// de estados legada (Pending Action) e sem nunca escrever memória. O
// resultado é uma única rota por turno; qualquer falha → rota legada integral.
export {
  CONVERSATION_ROUTING_VERSION,
  ROUTES,
  ROUTING_STATUSES,
  ROUTING_SOURCES,
  ROUTING_FALLBACK_REASONS,
  ROUTING_DIAGNOSTIC_CODES,
  ROUTING_SAFETY_KEYS,
  isRoute,
  isRoutingStatus,
  isRoutingSource,
  isRoutingFallbackReason,
  isRoutingSafetyKey,
} from './conversationRoutingTypes.js';
export {
  CONVERSATION_ROUTING_POLICY,
  ROUTE_PRIORITY,
  getRoutePriority,
  routeForNextStep,
  isConversationRoutingEnabledByConfig,
  isEnvironmentAllowedByRoutingPolicy,
  isConfidenceAllowedByRoutingPolicy,
  isRiskAllowedByRoutingPolicy,
  isRouteAllowedByRoutingPolicy,
  isPlannerOrientedRoute,
  isRouteConfidenceGated,
  getRouteCapability,
} from './conversationRoutingPolicy.js';
export {
  deepFreeze,
  createRoutingSafety,
  isRoutingSafetyIntegral,
  createEmptyConversationRoutingResult,
  createConversationRoutingResult,
  validateConversationRoutingResult,
  isConversationRoutingResultSerializable,
} from './conversationRoutingContracts.js';
export {
  createConversationRoutingDiagnostic,
  buildConversationRoutingDiagnostics,
  isConversationRoutingDiagnostic,
} from './buildConversationRoutingDiagnostics.js';
export { selectControlledConversationRoute } from './selectControlledConversationRoute.js';
