// Uni Engine — Cognitive Comparison (Fase 14, Bloco 3).
//
// Derivam rotas de comparação a partir de vocabulários JÁ EXISTENTES no
// projeto (Conversation Planner NEXT_STEP_* e rotas fechadas do Conversation
// Routing ROUTE_*). Nenhum contrato novo de rota é inventado.
import {
  ROUTES,
} from '../conversation-routing/conversationRoutingTypes.js';

// Mapa fechado NEXT_STEP_* → ROUTE_* (mesmo vocabulário do router).
const PLAN_NEXT_STEP_TO_ROUTE = Object.freeze({
  NEXT_STEP_ANSWER: 'ROUTE_ANSWER',
  NEXT_STEP_QUESTION: 'ROUTE_QUESTION',
  NEXT_STEP_CLARIFICATION: 'ROUTE_CLARIFICATION',
  NEXT_STEP_CONFIRMATION: 'ROUTE_CONFIRMATION',
  NEXT_STEP_WAIT: 'ROUTE_WAIT',
  NEXT_STEP_NONE: 'ROUTE_NONE',
});

// Rota interna da Engine derivada do plano conversacional do MESMO turno.
// Ausência de plano ou plano inválido caem em fallback seguro
// (ROUTE_LEGACY_FALLBACK) — a Engine nunca decide fora do vocabulário.
export function engineRouteFromPlan(planSnapshot) {
  const safe = planSnapshot && typeof planSnapshot === 'object' ? planSnapshot : null;
  const nextStep = typeof safe?.nextStep === 'string' ? safe.nextStep : null;
  if (nextStep && Object.prototype.hasOwnProperty.call(PLAN_NEXT_STEP_TO_ROUTE, nextStep)) {
    return PLAN_NEXT_STEP_TO_ROUTE[nextStep];
  }
  return 'ROUTE_LEGACY_FALLBACK';
}

// A rota derivada deve ser sempre uma rota fechada do contrato existente.
export function isValidEngineRoute(value) {
  return ROUTES.includes(value);
}