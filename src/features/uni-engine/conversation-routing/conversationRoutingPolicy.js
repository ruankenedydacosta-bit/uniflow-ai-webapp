// Uni Engine — Conversation Routing (Parte 8, Bloco Único): políticas.
//
// Política pura do roteamento conversacional controlado. Define:
//   - a prioridade determinística FECHADA entre as rotas (quanto MENOR o
//     número, MAIOR a prioridade) — a confirmação obrigatória do legado tem
//     precedência máxima e o nextStep do Planner NUNCA a contorna;
//   - as capacidades exigidas por cada rota (rota solicitada permitida pela
//     policy);
//   - os gates de segurança reutilizados da Application/Integration
//     (ambiente, autorização, confiança, risco, circuit breaker).
//
// Nada aqui executa: apenas modela a decisão de rota do pipeline legado.
import { ROUTES } from './conversationRoutingTypes.js';

export const CONVERSATION_ROUTING_POLICY = Object.freeze({
  version: '1.0',

  // Flags (nascem seguras — nada liga sem flag explícita).
  enabledByDefault: false,

  // Dependências obrigatórias (mesma cascata da Parte 6).
  requireEngine: true,
  requireActivation: true,
  requireIntegration: true,
  requireApplication: true,

  // Ambientes permitidos por padrão (nunca produção sem flag explícita).
  allowedEnvironments: Object.freeze(['development']),
  allowProductionActivation: false,

  // Confiança e risco (mesmos padrões da Application).
  minimumConfidence: 0.7,
  maximumRisk: 'LOW',

  // A rota NEXT_STEP_NONE do Planner nasce com confiança 0 por design — a
  // rota NONE é isenta do gate de confiança (não emite nada).
  noneRouteExemptFromConfidence: true,

  // Capacidade exigida por cada rota orientada pelo Planner. ANSWER exige
  // apenas Style/Length (verificadas no resultado da Application); NONE,
  // WAIT e CONFIRMATION não dependem de capacidade de guidance.
  routeCapability: Object.freeze({
    ROUTE_ANSWER: null,
    ROUTE_QUESTION: 'QUESTION_GUIDANCE',
    ROUTE_CLARIFICATION: 'CLARIFICATION_GUIDANCE',
    ROUTE_CONFIRMATION: null,
    ROUTE_WAIT: null,
    ROUTE_NONE: null,
  }),

  // Rotas do Planner para as quais o gate de confiança mínima se aplica.
  confidenceGatedRoutes: Object.freeze([
    'ROUTE_ANSWER',
    'ROUTE_QUESTION',
    'ROUTE_CLARIFICATION',
    'ROUTE_CONFIRMATION',
    'ROUTE_WAIT',
  ]),

  // Rotas orientadas pelo Planner (aquelas que o nextStep pode solicitar).
  plannerRoutes: Object.freeze([
    'ROUTE_ANSWER',
    'ROUTE_QUESTION',
    'ROUTE_CLARIFICATION',
    'ROUTE_CONFIRMATION',
    'ROUTE_WAIT',
    'ROUTE_NONE',
  ]),

  // Limites estruturais.
  maxDiagnostics: 12,
});

// Prioridade determinística fechada entre as rotas. Segurança primeiro:
// confirmação obrigatória do legado > erro/segurança obrigatório do legado >
// clarificação crítica válida > pergunta obrigatória válida > resposta
// autorizada > espera válida > nenhuma saída válida > fallback legado.
export const ROUTE_PRIORITY = Object.freeze({
  ROUTE_CONFIRMATION: 1,
  ROUTE_LEGACY_SECURITY_ERROR: 2,
  ROUTE_CLARIFICATION: 3,
  ROUTE_QUESTION: 4,
  ROUTE_ANSWER: 5,
  ROUTE_WAIT: 6,
  ROUTE_NONE: 7,
  ROUTE_LEGACY_FALLBACK: 8,
});

export function getRoutePriority(route) {
  const priority = ROUTE_PRIORITY[route];
  return typeof priority === 'number' ? priority : Number.MAX_SAFE_INTEGER;
}

// Mapa fechado NEXT_STEP → rota solicitada. Qualquer outro valor é rejeitado.
const NEXT_STEP_TO_ROUTE = Object.freeze({
  NEXT_STEP_ANSWER: 'ROUTE_ANSWER',
  NEXT_STEP_QUESTION: 'ROUTE_QUESTION',
  NEXT_STEP_CLARIFICATION: 'ROUTE_CLARIFICATION',
  NEXT_STEP_CONFIRMATION: 'ROUTE_CONFIRMATION',
  NEXT_STEP_WAIT: 'ROUTE_WAIT',
  NEXT_STEP_NONE: 'ROUTE_NONE',
});

export function routeForNextStep(nextStep) {
  return NEXT_STEP_TO_ROUTE[nextStep] ?? null;
}

// O roteamento controlado só influencia a escolha com a flag explícita
// ligada E o motor + Activation + Integration + Application habilitadas.
// Variável ausente ou inválida NUNCA ativa.
export function isConversationRoutingEnabledByConfig(config) {
  const safe = config && typeof config === 'object' ? config : {};
  if (safe.conversationRoutingEnabled !== true) return false;
  if (CONVERSATION_ROUTING_POLICY.requireEngine && safe.enabled !== true) return false;
  if (CONVERSATION_ROUTING_POLICY.requireActivation && safe.activationEnabled !== true) return false;
  if (CONVERSATION_ROUTING_POLICY.requireIntegration && safe.integrationEnabled !== true) return false;
  if (CONVERSATION_ROUTING_POLICY.requireApplication && safe.applicationEnabled !== true) return false;
  return true;
}

export function isEnvironmentAllowedByRoutingPolicy(environment) {
  if (typeof environment !== 'string') return false;
  if (environment === 'production' && !CONVERSATION_ROUTING_POLICY.allowProductionActivation) {
    return false;
  }
  return CONVERSATION_ROUTING_POLICY.allowedEnvironments.includes(environment);
}

export function isConfidenceAllowedByRoutingPolicy(confidence) {
  const value = Number(confidence);
  if (!Number.isFinite(value)) return false;
  return value >= CONVERSATION_ROUTING_POLICY.minimumConfidence;
}

export function isRiskAllowedByRoutingPolicy(risk) {
  if (typeof risk !== 'string') return false;
  const rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
  const maxAllowed = rank[CONVERSATION_ROUTING_POLICY.maximumRisk] ?? 0;
  const actual = rank[risk] ?? 0;
  return actual <= maxAllowed;
}

// Rota solicitada permitida pela policy: precisa existir no vocabulário
// fechado e (quando orientada pelo Planner) estar entre as rotas planejáveis.
export function isRouteAllowedByRoutingPolicy(route) {
  if (!ROUTES.includes(route)) return false;
  return CONVERSATION_ROUTING_POLICY.plannerRoutes.includes(route)
    || route === 'ROUTE_LEGACY_SECURITY_ERROR'
    || route === 'ROUTE_LEGACY_FALLBACK';
}

export function isPlannerOrientedRoute(route) {
  return CONVERSATION_ROUTING_POLICY.plannerRoutes.includes(route);
}

export function isRouteConfidenceGated(route) {
  return CONVERSATION_ROUTING_POLICY.confidenceGatedRoutes.includes(route);
}

// Capacidade exigida pela rota (null quando a rota não depende de guidance).
export function getRouteCapability(route) {
  return CONVERSATION_ROUTING_POLICY.routeCapability[route] ?? null;
}
