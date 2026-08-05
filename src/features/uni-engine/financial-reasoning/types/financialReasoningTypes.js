// Uni Engine — Motor de Raciocínio Financeiro (Fase 15). Tipos.
//
// Catálogo fechado de constantes semânticas do motor financeiro em Shadow
// Mode. Nenhuma decisão financeira sai daqui: tudo é descartável, em memória,
// serializável e sem efeito. Os catálogos abaixo definem apenas rótulos
// internos usados por diagnóstico, inferência, planejamento e telemetria.
export const FINANCIAL_REASONING_VERSION = '1.0';

// Tipos de diagnóstico interno aceitos pelo motor.
export const FINANCIAL_DIAGNOSTIC_TYPES = Object.freeze([
  'negative_balance',
  'income_decline',
  'expense_growth',
  'recurring_expenses',
  'abnormal_expenses',
  'cash_risk',
  'low_patrimony',
  'credit_dependence',
  'low_liquidity',
  'insufficient_reserve',
  'delayed_goal',
]);

export const FINANCIAL_DIAGNOSTIC_PRIORITIES = Object.freeze([
  'high',
  'medium',
  'low',
  'info',
]);

// Tipos de inferência interna. Sempre descritivas — o motor nunca afirma.
export const FINANCIAL_INFERENCE_TYPES = Object.freeze([
  'saves',
  'spends_above_average',
  'maintains_pattern',
  'risk_increasing',
  'positive_trend',
  'negative_trend',
]);

// Objetivos candidatos do planejador (apenas calculados, nunca exibidos).
export const FINANCIAL_PLANNER_OBJECTIVES = Object.freeze([
  'build_reserve',
  'increase_savings',
  'diversify_income',
  'reduce_expenses',
  'protect_cash',
  'catch_up_goal',
  'reduce_credit_dependence',
]);

// Próximas ações possíveis do planejador interno.
export const FINANCIAL_PLANNER_ACTIONS = Object.freeze([
  'reserve_policy',
  'expense_review',
  'income_restore',
  'goal_review',
  'credit_review',
  'liquidity_review',
  'patrimony_review',
]);

// Status do comparador legado × motor financeiro.
export const FINANCIAL_COMPARISON_STATUSES = Object.freeze([
  'aligned',
  'divergent',
  'no_data',
  'comparison_deferred',
]);

// Status finais do Shadow Runtime.
export const FINANCIAL_REASONING_STATUSES = Object.freeze([
  'engine_disabled',
  'shadow_skipped',
  'no_financial_data',
  'shadow_completed',
  'shadow_fallback',
]);

// Estágios da pipeline observacional (ordem fixa do Bloco 7).
export const FINANCIAL_REASONING_STAGES = Object.freeze([
  'entry',
  'snapshot',
  'diagnostics',
  'inference',
  'planning',
  'comparison',
  'telemetry',
  'discarded',
]);

export function isFinancialDiagnosticType(value) {
  return FINANCIAL_DIAGNOSTIC_TYPES.includes(value);
}

export function isFinancialDiagnosticPriority(value) {
  return FINANCIAL_DIAGNOSTIC_PRIORITIES.includes(value);
}

export function isFinancialInferenceType(value) {
  return FINANCIAL_INFERENCE_TYPES.includes(value);
}

export function isFinancialPlannerObjective(value) {
  return FINANCIAL_PLANNER_OBJECTIVES.includes(value);
}

export function isFinancialPlannerAction(value) {
  return FINANCIAL_PLANNER_ACTIONS.includes(value);
}

export function isFinancialComparisonStatus(value) {
  return FINANCIAL_COMPARISON_STATUSES.includes(value);
}

export function isFinancialReasoningStatus(value) {
  return FINANCIAL_REASONING_STATUSES.includes(value);
}

export function isFinancialReasoningStage(value) {
  return FINANCIAL_REASONING_STAGES.includes(value);
}