// Uni Engine — Conversation Planner (Parte 7, Bloco Único).
//
// Camada estritamente observacional que determina QUAL deve ser o próximo
// passo lógico da conversa — sem nunca gerar texto, sem nunca responder e
// sem nunca executar nada. O plano (NEXT_STEP_*) é apenas uma decisão
// observacional em memória, consumida futuramente pela camada de ativação.
//
// Este módulo NÃO re-executa nenhuma camada: consome SOMENTE os snapshots
// já existentes (Observation, Guidance, Decision, Capability Readiness,
// Execution Readiness e Application) e os agrega. NÃO altera resposta,
// NÃO altera Pending Action, NÃO escreve memória, NÃO acessa banco/RPC/TTS.
export const CONVERSATION_PLANNER_VERSION = '1.0';

export const CONVERSATION_PLANNER_MODES = Object.freeze(['observational']);

// Próximo passo lógico da conversa (vocabulário fechado — nunca executa).
export const NEXT_STEPS = Object.freeze([
  'NEXT_STEP_ANSWER',
  'NEXT_STEP_QUESTION',
  'NEXT_STEP_CLARIFICATION',
  'NEXT_STEP_CONFIRMATION',
  'NEXT_STEP_WAIT',
  'NEXT_STEP_NONE',
]);

// Status do plano no snapshot.
export const PLANNER_STATUSES = Object.freeze([
  'PLANNED',
  'EMPTY',
  'FALLBACK',
  'UNKNOWN',
]);

// Razões fechadas do próximo passo escolhido.
export const PLANNER_REASONS = Object.freeze([
  'CONFIRMATION_PENDING',
  'CLARIFICATION_REQUIRED',
  'MISSING_INFORMATION',
  'DECISION_RESPOND',
  'EXECUTION_BLOCKED',
  'CIRCUIT_BREAKER_OPEN',
  'DECISION_WAIT',
  'NO_SIGNAL',
  'NO_OBSERVATION',
  'INVALID_INPUT',
  'UNKNOWN',
]);

// Diagnósticos estruturados (vocabulário fechado — nunca texto livre).
export const PLANNER_DIAGNOSTIC_CODES = Object.freeze([
  'CONVERSATION_PLAN_COMPUTED',
  'NEXT_STEP_ANSWER_PLANNED',
  'NEXT_STEP_QUESTION_PLANNED',
  'NEXT_STEP_CLARIFICATION_PLANNED',
  'NEXT_STEP_CONFIRMATION_PLANNED',
  'NEXT_STEP_WAIT_PLANNED',
  'NO_NEXT_STEP_PLANNED',
  'NO_OBSERVATION_SNAPSHOT',
  'SHADOW_MODE',
  'LEGACY_PRESERVED',
  'NOTHING_APPLIED',
  'UNKNOWN',
]);

export function isConversationPlannerMode(value) {
  return CONVERSATION_PLANNER_MODES.includes(value);
}

export function isNextStep(value) {
  return NEXT_STEPS.includes(value);
}

export function isPlannerStatus(value) {
  return PLANNER_STATUSES.includes(value);
}

export function isPlannerReason(value) {
  return PLANNER_REASONS.includes(value);
}
