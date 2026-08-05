// Uni Engine — Runtime Conversacional Financeiro (Fase 17). Bloco 2:
 // Query Runtime.
 //
 // planFinancialQuery(intent, temporal, snapshot) transforma a intenção
 // resolvida em um plano de consultas reais sobre os dados financeiros.
 //
 // Suporta:
 //   transactions  - transações filtradas
 //   accounts      - saldos por conta
 //   goals         - progresso de metas
 //   categories    - gastos por categoria
 //   cashflow      - receitas/despesas/resultado
 //   assets        - ativos/investimentos
 //   credit        - cartões/limites
 //   investments   - investimentos
 //   recurring     - recorrentes
 //   installments  - parcelamentos
 //
 // Determinístico, apenas monta o plano, NÃO executa.

 import { RUNTIME_QUERY_TYPES, isRuntimeQueryType } from '../types/index.js';
 import { deepFreeze } from '../utils/shared.js';

 const INTENT_TO_QUERIES = Object.freeze({
  balance_query: ['accounts', 'cashflow'],
  income_query: ['cashflow', 'transactions'],
  expense_query: ['cashflow', 'transactions', 'categories'],
  savings_query: ['cashflow', 'goals'],
  net_worth_query: ['assets', 'credit', 'accounts'],
  cashflow_query: ['cashflow', 'transactions'],
  category_breakdown_query: ['categories', 'transactions'],
  account_query: ['accounts', 'transactions'],
  period_comparison_query: ['cashflow', 'transactions'],
  projection_query: ['cashflow', 'transactions'],
  goals_query: ['goals', 'cashflow'],
  credit_query: ['credit', 'accounts'],
  investments_query: ['investments', 'assets'],
  recurring_query: ['recurring', 'transactions'],
  installments_query: ['installments', 'transactions'],
});

const QUERY_CONFIG = Object.freeze({
  transactions: {
    filters: ['dateRange', 'type', 'category', 'account', 'amount', 'description'],
    sort: ['date', 'amount'],
    limit: 50,
  },
  accounts: {
    filters: ['type', 'active'],
    includeBalance: true,
    includeCreditLimit: true,
  },
  goals: {
    filters: ['status', 'rhythm'],
    includeProgress: true,
    includeProjection: true,
  },
  categories: {
    filters: ['type', 'system'],
    includeSpent: true,
    sortBy: 'spent',
  },
  cashflow: {
    periods: ['current', 'previous', 'ytd', 'last12months'],
    includeIncome: true,
    includeExpense: true,
    includeResult: true,
  },
  assets: {
    filters: ['type'],
    includeInvestments: true,
  },
  credit: {
    filters: ['active'],
    includeUtilization: true,
    includeAvailable: true,
  },
  investments: {
    filters: ['type'],
    includeBalance: true,
  },
  recurring: {
    filters: ['type', 'active'],
    includeNextDate: true,
  },
  installments: {
    filters: ['active'],
    includeRemaining: true,
    includeMonthlyAmount: true,
  },
});

function buildTemporalFilters(temporal) {
  if (!temporal) return {};

  const filters = {};
  const { entity, period, month, year, n } = temporal;

  switch (entity) {
    case 'today':
      filters.dateFrom = filters.dateTo = new Date().toISOString().slice(0, 10);
      break;
    case 'yesterday':
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      filters.dateFrom = filters.dateTo = yesterday.toISOString().slice(0, 10);
      break;
    case 'this_week':
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay());
      filters.dateFrom = weekStart.toISOString().slice(0, 10);
      filters.dateTo = now.toISOString().slice(0, 10);
      break;
    case 'last_week':
      const lastWeekEnd = new Date();
      lastWeekEnd.setDate(lastWeekEnd.getDate() - lastWeekEnd.getDay() - 1);
      const lastWeekStart = new Date(lastWeekEnd);
      lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
      filters.dateFrom = lastWeekStart.toISOString().slice(0, 10);
      filters.dateTo = lastWeekEnd.toISOString().slice(0, 10);
      break;
    case 'this_month':
      const thisMonth = new Date();
      filters.dateFrom = `${thisMonth.getFullYear()}-${String(thisMonth.getMonth() + 1).padStart(2, '0')}-01`;
      const nextMonth = new Date(thisMonth.getFullYear(), thisMonth.getMonth() + 1, 0);
      filters.dateTo = nextMonth.toISOString().slice(0, 10);
      break;
    case 'last_month':
      const lastMonth = new Date();
      lastMonth.setMonth(lastMonth.getMonth() - 1);
      filters.dateFrom = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}-01`;
      const endLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);
      filters.dateTo = endLastMonth.toISOString().slice(0, 10);
      break;
    case 'specific_month':
      if (month && year) {
        filters.dateFrom = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0);
        filters.dateTo = `${year}-${String(month).padStart(2, '0')}-${endDate.getDate()}`;
      }
      break;
    case 'specific_year':
      if (year) {
        filters.dateFrom = `${year}-01-01`;
        filters.dateTo = `${year}-12-31`;
      }
      break;
    case 'last_n_months':
      const nMonthsAgo = new Date();
      nMonthsAgo.setMonth(nMonthsAgo.getMonth() - (n || 3));
      filters.dateFrom = nMonthsAgo.toISOString().slice(0, 10);
      filters.dateTo = new Date().toISOString().slice(0, 10);
      break;
    case 'last_n_days':
      const nDaysAgo = new Date();
      nDaysAgo.setDate(nDaysAgo.getDate() - (n || 7));
      filters.dateFrom = nDaysAgo.toISOString().slice(0, 10);
      filters.dateTo = new Date().toISOString().slice(0, 10);
      break;
    case 'this_year':
      const thisYear = new Date().getFullYear();
      filters.dateFrom = `${thisYear}-01-01`;
      filters.dateTo = new Date().toISOString().slice(0, 10);
      break;
    case 'last_year':
      const lastYear = new Date().getFullYear() - 1;
      filters.dateFrom = `${lastYear}-01-01`;
      filters.dateTo = `${lastYear}-12-31`;
      break;
    case 'specific_date':
      if (temporal.date) {
        filters.dateFrom = filters.dateTo = temporal.date;
      }
      break;
    case 'date_range':
      if (temporal.dateFrom && temporal.dateTo) {
        filters.dateFrom = temporal.dateFrom;
        filters.dateTo = temporal.dateTo;
      }
      break;
  }

  return filters;
}

export function planFinancialQuery(intent, temporal, snapshot) {
  if (!intent || !intent.type) {
    return deepFreeze({
      version: '1.0',
      intentType: null,
      queries: [],
      temporalFilters: {},
      estimatedCost: 0,
      serializable: true,
    });
  }

  // Intenção reconhecida como 'unknown' (ou qualquer tipo sem mapeamento
  // conhecido) não deve gerar um plano de consulta "melhor esforço" -- adivinhar
  // dados para uma pergunta que não foi entendida viola a exigência de nunca
  // inventar contexto. Só getIntentQueryTypes() (helper de inspeção, não de
  // execução) mantém o fallback informativo para 'cashflow'.
  if (!(intent.type in INTENT_TO_QUERIES)) {
    return deepFreeze({
      version: '1.0',
      intentType: intent.type,
      queries: [],
      temporalFilters: buildTemporalFilters(temporal),
      estimatedCost: 0,
      serializable: true,
    });
  }

  const queryTypes = INTENT_TO_QUERIES[intent.type];
  const queries = queryTypes
    .filter(isRuntimeQueryType)
    .map(type => ({
      type,
      config: QUERY_CONFIG[type] ?? {},
      filters: buildTemporalFilters(temporal),
    }));

  // Adicionar filtro de conta se entidade de conta presente
  const accountEntity = intent.entities?.find(e => e.type === 'account');
  if (accountEntity) {
    for (const query of queries) {
      query.filters.account = accountEntity.value;
    }
  }

  // Adicionar filtro de categoria se breakdown
  if (intent.type === 'category_breakdown_query') {
    for (const query of queries) {
      if (query.type === 'categories') {
        query.config.includeSpent = true;
        query.config.sortBy = 'spent';
      }
    }
  }

  // Estimar custo
  const estimatedCost = queries.reduce((sum, q) => sum + (q.config?.filters?.length ?? 1) * 2, queries.length);

  return deepFreeze({
    version: '1.0',
    intentType: intent.type,
    queries,
    temporalFilters: buildTemporalFilters(temporal),
    estimatedCost,
    serializable: true,
  });
}

export function getQueryConfig(queryType) {
  return QUERY_CONFIG[queryType] ?? {};
}

export function getIntentQueryTypes(intentType) {
  return INTENT_TO_QUERIES[intentType] ?? ['cashflow'];
}

export function buildTemporalFiltersForRuntime(temporal) {
  return buildTemporalFilters(temporal);
}