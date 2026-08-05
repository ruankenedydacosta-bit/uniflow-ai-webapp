// Uni Engine — Inteligência Financeira Conversacional (Fase 16). Bloco 3:
// Query Planner Financeiro.
//
// planFinancialQuery(intent, enrichedContext) cria um plano de execução
// para responder à intenção financeira. O plano define:
// - tipo de plano (single_metric, breakdown, comparison, etc.)
// - passos de execução ordenados
// - métricas necessárias
// - custo estimado
// - granularidade temporal
//
// Tudo serializável, shadow-only, sem execução real.

import { FINANCIAL_QUERY_PLAN_TYPES, isFinancialQueryPlanType } from '../types/index.js';
import { isSerializableValue } from '../../uniEngineContracts.js';

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map(deepFreeze));
  }
  const frozen = {};
  for (const key of Object.keys(value).sort()) {
    frozen[key] = deepFreeze(value[key]);
  }
  return Object.freeze(frozen);
}

const INTENT_TO_PLAN_TYPE = Object.freeze({
  balance_query: 'single_metric',
  income_query: 'single_metric',
  expense_query: 'single_metric',
  cash_flow_query: 'single_metric',
  savings_rate_query: 'single_metric',
  net_worth_query: 'single_metric',
  liquidity_query: 'single_metric',
  credit_query: 'single_metric',
  investment_query: 'single_metric',
  debt_query: 'single_metric',
  goal_query: 'single_metric',
  category_breakdown_query: 'breakdown',
  account_query: 'breakdown',
  transaction_search_query: 'search',
  recurring_query: 'breakdown',
  installment_query: 'breakdown',
  comparison_query: 'comparison',
  projection_query: 'projection',
  financial_health_query: 'health_check',
  budget_query: 'multi_metric',
});

const PLAN_STEPS_BY_TYPE = Object.freeze({
  single_metric: [
    { step: 'fetch_metric', metric: 'focus', description: 'Obter métrica principal' },
    { step: 'format_response', description: 'Format resposta direta' },
  ],
  breakdown: [
    { step: 'fetch_breakdown', metric: 'focus', description: 'Obter quebra por dimensão' },
    { step: 'sort_by_value', description: 'Ordenar por valor decrescente' },
    { step: 'limit_top', limit: 5, description: 'Limitar top 5' },
    { step: 'format_breakdown', description: 'Format quebra estruturada' },
  ],
  comparison: [
    { step: 'fetch_current_period', description: 'Obter período corrente' },
    { step: 'fetch_comparison_period', description: 'Obter período de comparação' },
    { step: 'calculate_delta', description: 'Calcular variação' },
    { step: 'calculate_percentage', description: 'Calcular percentual' },
    { step: 'format_comparison', description: 'Format comparação' },
  ],
  projection: [
    { step: 'fetch_historical', months: 6, description: 'Obter histórico 6 meses' },
    { step: 'calculate_trend', description: 'Calcular tendência linear' },
    { step: 'project_forward', months: 3, description: 'Projetar 3 meses' },
    { step: 'calculate_confidence', description: 'Calcular confiança' },
    { step: 'format_projection', description: 'Format projeção' },
  ],
  search: [
    { step: 'parse_search_criteria', description: 'Parse critérios de busca' },
    { step: 'filter_transactions', description: 'Filtrar transações' },
    { step: 'rank_results', description: 'Rankear resultados' },
    { step: 'format_search_results', description: 'Format resultados' },
  ],
  health_check: [
    { step: 'fetch_all_metrics', description: 'Obter todas métricas' },
    { step: 'run_diagnostics', description: 'Executar diagnósticos' },
    { step: 'calculate_health_score', description: 'Calcular score de saúde' },
    { step: 'identify_alerts', description: 'Identificar alertas' },
    { step: 'format_health_summary', description: 'Format resumo de saúde' },
  ],
  multi_metric: [
    { step: 'fetch_multiple_metrics', description: 'Obter múltiplas métricas' },
    { step: 'cross_reference', description: 'Cruzar referências' },
    { step: 'format_multi_metric', description: 'Format multi-métrica' },
  ],
  goal_tracking: [
    { step: 'fetch_goals', description: 'Obter metas' },
    { step: 'calculate_progress', description: 'Calcular progresso' },
    { step: 'project_completion', description: 'Projetar conclusão' },
    { step: 'format_goal_progress', description: 'Format progresso de metas' },
  ],
});

function estimateCost(planType, context) {
  const baseCost = {
    single_metric: 1,
    breakdown: 3,
    comparison: 4,
    projection: 5,
    search: 3,
    health_check: 8,
    multi_metric: 4,
    goal_tracking: 4,
  };
  const complexity = context?.metrics?.accountsCount > 10 ? 1.5 : 1;
  const historyFactor = context?.conversation?.turnCount > 5 ? 1.2 : 1;
  return Math.round((baseCost[planType] ?? 3) * complexity * historyFactor);
}

function determineGranularity(intent, temporal) {
  if (!temporal?.context?.resolved) return 'month';
  const { type } = temporal.context.resolved;
  if (['last_n_days', 'specific_date_range', 'since_date', 'until_date'].includes(type)) return 'day';
  if (['last_n_months', 'current_month', 'previous_month', 'specific_month', 'year_to_date'].includes(type)) return 'month';
  if (['fiscal_quarter'].includes(type)) return 'quarter';
  if (['fiscal_year'].includes(type)) return 'year';
  return 'month';
}

function extractRequiredMetrics(intentType, context) {
  const metricMap = {
    balance_query: ['totalBalance'],
    income_query: ['monthlyIncome'],
    expense_query: ['monthlyExpense'],
    cash_flow_query: ['monthlyResult'],
    savings_rate_query: ['savingsRate'],
    net_worth_query: ['netPatrimony'],
    liquidity_query: ['liquidBalance'],
    credit_query: ['creditUtilization'],
    investment_query: ['investmentBalance'],
    debt_query: ['netPatrimony', 'creditUtilization'],
    goal_query: ['goalsCount', 'activeGoalsCount', 'lateGoalsCount'],
    category_breakdown_query: ['monthlyExpense'],
    account_query: ['totalBalance'],
    transaction_search_query: [],
    recurring_query: ['recurringCount'],
    installment_query: ['installmentsCount'],
    comparison_query: ['monthlyIncome', 'monthlyExpense', 'monthlyResult'],
    projection_query: ['monthlyIncome', 'monthlyExpense', 'monthlyResult'],
    financial_health_query: ['totalBalance', 'monthlyIncome', 'monthlyExpense', 'monthlyResult', 'savingsRate', 'liquidBalance', 'netPatrimony', 'creditUtilization'],
    budget_query: ['monthlyIncome', 'monthlyExpense', 'monthlyResult', 'savingsRate', 'liquidBalance'],
  };
  return metricMap[intentType] ?? [];
}

export function planFinancialQuery(intent, enrichedContext) {
  if (!intent || typeof intent !== 'object' || !intent.type) {
    return deepFreeze({
      version: '1.0',
      type: 'single_metric',
      status: 'invalid_intent',
      steps: [],
      estimatedCost: 0,
      requiredMetrics: [],
      granularity: 'month',
      confidence: 0,
      serializable: true,
    });
  }

  if (!(intent.type in INTENT_TO_PLAN_TYPE)) {
    return deepFreeze({
      version: '1.0',
      type: 'single_metric',
      status: 'invalid_intent',
      steps: [],
      estimatedCost: 0,
      requiredMetrics: [],
      granularity: 'month',
      confidence: 0,
      serializable: true,
    });
  }

  const planType = INTENT_TO_PLAN_TYPE[intent.type];

  const steps = (PLAN_STEPS_BY_TYPE[planType] ?? []).map((step, index) => ({
    id: `step-${index + 1}`,
    ...step,
  }));

  const requiredMetrics = extractRequiredMetrics(intent.type, enrichedContext);
  const granularity = determineGranularity(intent, enrichedContext?.temporal);
  const estimatedCost = estimateCost(planType, enrichedContext);
  const confidence = Math.min(0.95, (intent.confidence ?? 0.5) * 0.9 + 0.1);

  const plan = {
    version: '1.0',
    type: planType,
    status: 'planned',
    intentType: intent.type,
    steps,
    estimatedCost,
    requiredMetrics,
    granularity,
    temporalPeriod: enrichedContext?.temporal?.context?.period ?? null,
    confidence,
    serializable: true,
  };

  if (!isSerializableValue(plan)) {
    return deepFreeze({
      version: '1.0',
      type: planType,
      status: 'not_serializable',
      steps: [],
      estimatedCost: 0,
      requiredMetrics: [],
      granularity: 'month',
      confidence: 0,
      serializable: true,
    });
  }

  return deepFreeze(plan);
}

export function getPlanSteps(planType) {
  return PLAN_STEPS_BY_TYPE[planType] ?? [];
}

export function getIntentPlanType(intentType) {
  return INTENT_TO_PLAN_TYPE[intentType] ?? 'single_metric';
}