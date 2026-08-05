// Uni Engine — Inteligência Financeira Conversacional (Fase 16). Bloco 2:
// Contexto Conversacional Financeiro.
//
// enrichFinancialContext(snapshot, temporalResolution, intent, conversationHistory)
// combina o snapshot financeiro da Fase 15 com contexto conversacional:
// - resolução temporal (Bloco 1)
// - intenção detectada
// - histórico de conversa recente
// - preferências do usuário
//
// Resultado: contexto enriquecido, serializável, shadow-only.

import { FINANCIAL_CONVERSATIONAL_SAFETY_KEYS } from '../types/index.js';
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

function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function buildSafety() {
  const safety = {};
  for (const key of FINANCIAL_CONVERSATIONAL_SAFETY_KEYS) {
    safety[key] = false;
  }
  return Object.freeze(safety);
}

export function enrichFinancialContext({
  snapshot = null,
  temporalResolution = null,
  intent = null,
  conversationHistory = [],
  userPreferences = {},
  workspaceType = 'personal',
} = {}) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : null;
  const safeTemporal = temporalResolution && typeof temporalResolution === 'object' ? temporalResolution : null;
  const safeIntent = intent && typeof intent === 'object' ? intent : null;
  const safeHistory = Array.isArray(conversationHistory) ? conversationHistory.slice(-10) : [];
  const safePrefs = userPreferences && typeof userPreferences === 'object' ? userPreferences : {};

  if (!safeSnapshot || safeSnapshot.hasData !== true) {
    return deepFreeze({
      version: '1.0',
      serializable: true,
      hasData: false,
      snapshot: { present: false },
      temporal: safeTemporal ? { ...safeTemporal, context: null } : null,
      intent: safeIntent ? { ...safeIntent, context: null } : null,
      conversation: { history: [], turnCount: 0 },
      preferences: safePrefs,
      workspaceType,
      metrics: {},
      safety: buildSafety(),
    });
  }

  const snap = safeSnapshot?.snapshot ?? safeSnapshot;

  const metrics = {
    totalBalance: roundMoney(snap.balance?.total ?? 0),
    monthlyIncome: roundMoney(snap.income?.monthly ?? 0),
    monthlyExpense: roundMoney(snap.expenses?.monthly ?? 0),
    monthlyResult: roundMoney(snap.result?.monthly ?? 0),
    savingsRate: Number(snap.result?.savingsRate ?? 0),
    liquidBalance: roundMoney(snap.patrimony?.liquid ?? 0),
    netPatrimony: roundMoney(snap.patrimony?.net ?? 0),
    creditUtilization: snap.creditCards?.length > 0
      ? roundMoney(snap.creditCards.reduce((max, c) => Math.max(max, c.utilization ?? 0), 0))
      : 0,
    reserveCoverage: snap.reserve?.target > 0
      ? roundMoney(snap.reserve.current / snap.reserve.target)
      : 0,
    goalsCount: snap.goals?.length ?? 0,
    activeGoalsCount: snap.goals?.filter(g => g.rhythm === 'on_track').length ?? 0,
    lateGoalsCount: snap.goals?.filter(g => g.rhythm === 'late').length ?? 0,
    accountsCount: snap.accounts?.length ?? 0,
    liquidAccountsCount: snap.accounts?.filter(a => a.liquid).length ?? 0,
    investmentBalance: roundMoney(snap.patrimony?.investments ?? 0),
    installmentsCount: snap.installments?.length ?? 0,
    recurringCount: snap.recurring?.length ?? 0,
  };

  let temporalContext = null;
  if (safeTemporal?.resolved) {
    const { resolved } = safeTemporal;
    const periodKey = resolved.type === 'current_month' ? snap.currentMonth
      : resolved.type === 'previous_month' ? snap.previousMonth
      : resolved.periodKey ?? null;

    const periodMetrics = {};
    if (periodKey && snap.flow?.months) {
      const monthFlow = snap.flow.months.find(m => m.month === periodKey);
      if (monthFlow) {
        periodMetrics.income = monthFlow.income;
        periodMetrics.expense = monthFlow.expense;
        periodMetrics.result = monthFlow.result;
      }
    }

    temporalContext = {
      period: resolved,
      periodKey,
      periodLabel: resolved.periodLabel ?? resolved.type,
      metrics: periodMetrics,
      isCurrentPeriod: resolved.type === 'current_month',
      isPreviousPeriod: resolved.type === 'previous_month',
      isHistorical: resolved.type !== 'current_month' && resolved.type !== 'previous_month',
    };
  }

  let intentContext = null;
  if (safeIntent?.type) {
    intentContext = {
      type: safeIntent.type,
      confidence: safeIntent.confidence,
      entities: safeIntent.resolvedEntities ?? [],
      requiresTemporal: ['balance_query', 'income_query', 'expense_query', 'cash_flow_query', 'comparison_query', 'projection_query'].includes(safeIntent.type),
      requiresBreakdown: ['category_breakdown_query', 'account_query', 'transaction_search_query'].includes(safeIntent.type),
      requiresComparison: ['comparison_query', 'projection_query'].includes(safeIntent.type),
      isHealthCheck: ['financial_health_query'].includes(safeIntent.type),
    };
  }

  const recentTopics = safeHistory
    .filter(h => h.intent)
    .map(h => h.intent.type)
    .filter(Boolean);

  const conversationContext = {
    history: safeHistory.map(h => ({
      intent: h.intent?.type ?? null,
      temporal: h.temporal?.resolved?.type ?? null,
      timestamp: h.timestamp ?? null,
    })),
    turnCount: safeHistory.length,
    recentTopics: [...new Set(recentTopics)].slice(-5),
    hasFinancialContext: safeHistory.some(h => h.intent && isFinancialConversationalIntent(h.intent.type)),
    lastFinancialTurn: safeHistory
      .filter(h => h.intent && isFinancialConversationalIntent(h.intent.type))
      .pop() ?? null,
  };

  function isFinancialConversationalIntent(type) {
    const financialIntents = [
      'balance_query', 'income_query', 'expense_query', 'cash_flow_query',
      'goal_query', 'projection_query', 'comparison_query', 'category_breakdown_query',
      'account_query', 'transaction_search_query', 'financial_health_query',
      'investment_query', 'credit_query', 'recurring_query', 'installment_query',
      'budget_query', 'savings_rate_query', 'net_worth_query', 'liquidity_query', 'debt_query'
    ];
    return financialIntents.includes(type);
  }

  const enriched = {
    version: '1.0',
    serializable: true,
    hasData: true,
    snapshot: {
      present: true,
      version: snap.version,
      referenceDate: snap.referenceDate,
      currentMonth: snap.currentMonth,
      previousMonth: snap.previousMonth,
      currency: snap.currency,
    },
    temporal: temporalContext ? { ...safeTemporal, context: temporalContext } : safeTemporal,
    intent: intentContext ? { ...safeIntent, context: intentContext } : safeIntent,
    conversation: conversationContext,
    preferences: safePrefs,
    workspaceType,
    metrics,
    safety: buildSafety(),
  };

  if (!isSerializableValue(enriched)) {
    return deepFreeze({
      version: '1.0',
      serializable: true,
      hasData: false,
      snapshot: { present: false },
      error: 'enrichment_not_serializable',
      safety: buildSafety(),
    });
  }

  return deepFreeze(enriched);
}

export function getContextualMetrics(enrichedContext, intentType) {
  const { metrics, temporal } = enrichedContext;
  if (!metrics || enrichedContext.hasData !== true) return null;

  const base = { ...metrics };

  if (temporal?.context?.metrics) {
    base.periodIncome = temporal.context.metrics.income;
    base.periodExpense = temporal.context.metrics.expense;
    base.periodResult = temporal.context.metrics.result;
  }

  switch (intentType) {
    case 'balance_query':
      return { ...base, focus: 'totalBalance', label: 'Saldo total' };
    case 'income_query':
      return { ...base, focus: 'monthlyIncome', label: 'Receita do período' };
    case 'expense_query':
      return { ...base, focus: 'monthlyExpense', label: 'Despesa do período' };
    case 'cash_flow_query':
      return { ...base, focus: 'monthlyResult', label: 'Fluxo de caixa' };
    case 'savings_rate_query':
      return { ...base, focus: 'savingsRate', label: 'Taxa de poupança' };
    case 'net_worth_query':
      return { ...base, focus: 'netPatrimony', label: 'Patrimônio líquido' };
    case 'liquidity_query':
      return { ...base, focus: 'liquidBalance', label: 'Liquidez imediata' };
    case 'credit_query':
      return { ...base, focus: 'creditUtilization', label: 'Uso de crédito' };
    case 'investment_query':
      return { ...base, focus: 'investmentBalance', label: 'Investimentos' };
    case 'debt_query':
      return { ...base, focus: 'netPatrimony', label: 'Endividamento líquido' };
    case 'goal_query':
      return { ...base, focus: 'goalsCount', label: 'Metas ativas' };
    default:
      return base;
  }
}