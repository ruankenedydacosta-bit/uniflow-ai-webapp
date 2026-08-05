// Uni Engine — Runtime Conversacional Financeiro (Fase 17). Bloco 3:
 // Executor Runtime.
 //
 // executeFinancialQuery(queryPlan, snapshot) executa as consultas planejadas
 // sobre o snapshot financeiro em modo Shadow: APENAS LEITURA.
 //
 // Garantias:
 //   - NUNCA escreve, NUNCA persiste, NUNCA muta
 //   - executionAllowed: false
 //   - influenceApplied: false
 //   - Falha segura: retorna resultado vazio válido
 //
 // Usa o snapshot da Fase 15 (buildFinancialReasoningSnapshot) como fonte.

import { isSerializableValue } from '../../uniEngineContracts.js';
import { deepFreeze, roundMoney } from '../utils/shared.js';

function safeGet(obj, path, defaultValue = null) {
  if (!obj || typeof obj !== 'object') return defaultValue;
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (current === null || current === undefined) return defaultValue;
    current = current[key];
  }
  return current !== undefined && current !== null ? current : defaultValue;
}

function filterTransactions(transactions, filters) {
  if (!Array.isArray(transactions)) return [];

  return transactions.filter(tx => {
    if (filters.dateFrom && tx.transaction_date < filters.dateFrom) return false;
    if (filters.dateTo && tx.transaction_date > filters.dateTo) return false;
    if (filters.type && tx.transaction_type !== filters.type) return false;
    if (filters.category && tx.category_id !== filters.category) return false;
    if (filters.account && tx.account_id !== filters.account) return false;
    if (filters.amount && roundMoney(tx.amount) !== roundMoney(filters.amount)) return false;
    if (filters.description && tx.description && !tx.description.toLowerCase().includes(filters.description.toLowerCase())) return false;
    return true;
  });
}

function sortTransactions(transactions, sortBy = 'date') {
  const sorted = [...transactions];
  if (sortBy === 'date') {
    sorted.sort((a, b) => (b.transaction_date || '').localeCompare(a.transaction_date || ''));
  } else if (sortBy === 'amount') {
    sorted.sort((a, b) => roundMoney(b.amount) - roundMoney(a.amount));
  }
  return sorted;
}

function executeTransactionsQuery(query, snapshot) {
  const transactions = snapshot.latestEvents ?? [];
  const filtered = filterTransactions(transactions, query.filters);
  const sorted = sortTransactions(filtered, query.config?.sort?.[0]);
  const limited = sorted.slice(0, query.config?.limit ?? 50);

  return {
    type: 'transactions',
    data: limited.map(tx => ({
      id: tx.id,
      date: tx.date,
      type: tx.type,
      amount: roundMoney(tx.amount),
      description: tx.description,
      category: tx.categoryName,
      account: tx.accountName,
    })),
    total: filtered.length,
    returned: limited.length,
    filters: query.filters,
  };
}

function executeAccountsQuery(query, snapshot) {
  const accounts = snapshot.accounts ?? [];
  const filtered = accounts.filter(acc => {
    if (query.filters.type && acc.type !== query.filters.type) return false;
    if (query.filters.active !== undefined && acc.active !== query.filters.active) return false;
    if (query.filters.account && acc.name !== query.filters.account) return false;
    return true;
  });

  return {
    type: 'accounts',
    data: filtered.map(acc => ({
      id: acc.id,
      name: acc.name,
      type: acc.type,
      balance: roundMoney(acc.balance),
      active: acc.active,
      liquid: acc.liquid,
      investment: acc.investment,
      creditCard: acc.creditCard,
      creditLimit: roundMoney(acc.creditLimit),
      dueDay: acc.dueDay,
      closingDay: acc.closingDay,
    })),
    total: filtered.length,
    filters: query.filters,
  };
}

function executeGoalsQuery(query, snapshot) {
  const goals = snapshot.goals ?? [];
  const filtered = goals.filter(g => {
    if (query.filters.status && g.rhythm !== query.filters.status) return false;
    if (query.filters.rhythm && g.rhythm !== query.filters.rhythm) return false;
    return true;
  });

  return {
    type: 'goals',
    data: filtered.map(g => ({
      id: g.id,
      name: g.name,
      target: roundMoney(g.target),
      current: roundMoney(g.current),
      progress: g.progress,
      remaining: roundMoney(g.remaining),
      rhythm: g.rhythm,
      targetDate: g.targetDate,
      plannedMonthlyAmount: roundMoney(g.plannedMonthlyAmount),
    })),
    total: filtered.length,
    summary: {
      total: filtered.length,
      onTrack: filtered.filter(g => g.rhythm === 'on_track').length,
      late: filtered.filter(g => g.rhythm === 'late').length,
      completed: filtered.filter(g => g.rhythm === 'complete').length,
    },
    filters: query.filters,
  };
}

function executeCategoriesQuery(query, snapshot) {
  const expenses = snapshot.expenses?.byCategory ?? [];
  const filtered = expenses.filter(c => {
    if (query.filters.type && c.type !== query.filters.type) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (query.config?.sortBy === 'spent') return b.spent - a.spent;
    return a.name.localeCompare(b.name);
  });

  return {
    type: 'categories',
    data: sorted.map(c => ({
      id: c.id,
      name: c.name,
      spent: roundMoney(c.spent),
    })),
    total: sorted.length,
    filters: query.filters,
  };
}

function executeCashflowQuery(query, snapshot) {
  const flow = snapshot.flow?.months ?? [];
  const periods = query.config?.periods ?? ['current'];

  const periodData = {};
  for (const period of periods) {
    let monthKey = null;
    if (period === 'current') monthKey = snapshot.currentMonth;
    else if (period === 'previous') monthKey = snapshot.previousMonth;
    else if (period === 'ytd') {
      // Year to date - últimos 12 meses
      const ytdMonths = flow.slice(-12);
      const income = roundMoney(ytdMonths.reduce((sum, m) => sum + m.income, 0));
      const expense = roundMoney(ytdMonths.reduce((sum, m) => sum + m.expense, 0));
      periodData[period] = { income, expense, result: roundMoney(income - expense) };
      continue;
    }

    if (monthKey) {
      const monthData = flow.find(m => m.month === monthKey);
      if (monthData) {
        periodData[period] = {
          income: monthData.income,
          expense: monthData.expense,
          result: monthData.result,
        };
      }
    }
  }

  return {
    type: 'cashflow',
    data: periodData,
    currentMonth: snapshot.currentMonth,
    previousMonth: snapshot.previousMonth,
    monthlyIncome: snapshot.income?.monthly ?? 0,
    monthlyExpense: snapshot.expenses?.monthly ?? 0,
    monthlyResult: snapshot.result?.monthly ?? 0,
    savingsRate: snapshot.result?.savingsRate ?? 0,
  };
}

function executeAssetsQuery(query, snapshot) {
  const investments = snapshot.investments ?? [];
  const filtered = investments.filter(inv => {
    if (query.filters.type && inv.type !== query.filters.type) return false;
    return true;
  });

  return {
    type: 'assets',
    data: filtered.map(inv => ({
      id: inv.id,
      name: inv.name,
      balance: roundMoney(inv.balance),
    })),
    totalBalance: roundMoney(filtered.reduce((sum, inv) => sum + roundMoney(inv.balance), 0)),
    filters: query.filters,
  };
}

function executeCreditQuery(query, snapshot) {
  const creditCards = snapshot.creditCards ?? [];
  const filtered = creditCards.filter(card => {
    if (query.filters.active !== undefined && card.active !== query.filters.active) return false;
    return true;
  });

  return {
    type: 'credit',
    data: filtered.map(card => ({
      id: card.id,
      name: card.name,
      usage: roundMoney(card.usage),
      limit: roundMoney(card.limit),
      available: roundMoney(card.available),
      utilization: roundMoney(card.utilization),
      dueDay: card.dueDay,
      closingDay: card.closingDay,
    })),
    totalUsage: roundMoney(filtered.reduce((sum, c) => sum + roundMoney(c.usage), 0)),
    totalLimit: roundMoney(filtered.reduce((sum, c) => sum + roundMoney(c.limit), 0)),
    totalAvailable: roundMoney(filtered.reduce((sum, c) => sum + roundMoney(c.available), 0)),
    avgUtilization: filtered.length > 0
      ? roundMoney(filtered.reduce((sum, c) => sum + roundMoney(c.utilization), 0) / filtered.length)
      : 0,
    filters: query.filters,
  };
}

function executeInvestmentsQuery(query, snapshot) {
  const investments = snapshot.investments ?? [];
  const filtered = investments.filter(inv => {
    if (query.filters.type && inv.type !== query.filters.type) return false;
    return true;
  });

  return {
    type: 'investments',
    data: filtered.map(inv => ({
      id: inv.id,
      name: inv.name,
      balance: roundMoney(inv.balance),
    })),
    totalBalance: roundMoney(filtered.reduce((sum, inv) => sum + roundMoney(inv.balance), 0)),
    filters: query.filters,
  };
}

function executeRecurringQuery(query, snapshot) {
  const recurring = snapshot.recurring ?? [];
  const filtered = recurring.filter(r => {
    if (query.filters.type && r.transactionType !== query.filters.type) return false;
    if (query.filters.active !== undefined && r.active !== query.filters.active) return false;
    return true;
  });

  return {
    type: 'recurring',
    data: filtered.map(r => ({
      id: r.id,
      description: r.description,
      amount: roundMoney(r.amount),
      type: r.transactionType,
      category: r.categoryName,
    })),
    total: filtered.length,
    totalAmount: roundMoney(filtered.reduce((sum, r) => sum + roundMoney(r.amount), 0)),
    filters: query.filters,
  };
}

function executeInstallmentsQuery(query, snapshot) {
  const installments = snapshot.installments ?? [];
  const filtered = installments.filter(i => {
    if (query.filters.active !== undefined && i.active !== query.filters.active) return false;
    return true;
  });

  return {
    type: 'installments',
    data: filtered.map(i => ({
      id: i.groupId,
      name: i.name,
      totalInstallments: i.installments,
      paid: i.paid,
      remaining: i.remaining,
      monthlyAmount: roundMoney(i.monthlyAmount),
      remainingAmount: roundMoney(i.remainingAmount),
      category: i.categoryName,
      account: i.accountName,
    })),
    total: filtered.length,
    totalRemaining: roundMoney(filtered.reduce((sum, i) => sum + roundMoney(i.remainingAmount), 0)),
    filters: query.filters,
  };
}

const EXECUTORS = Object.freeze({
  transactions: executeTransactionsQuery,
  accounts: executeAccountsQuery,
  goals: executeGoalsQuery,
  categories: executeCategoriesQuery,
  cashflow: executeCashflowQuery,
  assets: executeAssetsQuery,
  credit: executeCreditQuery,
  investments: executeInvestmentsQuery,
  recurring: executeRecurringQuery,
  installments: executeInstallmentsQuery,
});

export function executeFinancialQuery(queryPlan, snapshot) {
  // hasData === false é o sinal explícito da Fase 15 (buildFinancialReasoningSnapshot)
  // de que o workspace não tem dados financeiros -- sem essa checagem, cada
  // executor individual recebia undefined nos seus campos e devolvia listas
  // vazias "válidas" (ex.: accounts: []), fazendo o status parecer 'executed'
  // mesmo sem nenhum dado real por trás.
  if (!queryPlan || !Array.isArray(queryPlan.queries) || !snapshot || snapshot.hasData === false) {
    return deepFreeze({
      version: '1.0',
      status: 'no_data',
      results: {},
      executionAllowed: false,
      influenceApplied: false,
      serializable: true,
    });
  }

  const results = {};

  try {
    for (const query of queryPlan.queries) {
      const executor = EXECUTORS[query.type];
      if (executor) {
        results[query.type] = executor(query, snapshot);
      }
    }
  } catch {
    // Falha segura - retorna resultados parciais
  }

  return deepFreeze({
    version: '1.0',
    status: Object.keys(results).length > 0 ? 'executed' : 'no_data',
    results,
    executionAllowed: false,
    influenceApplied: false,
    serializable: true,
  });
}

export function getAvailableExecutors() {
  return Object.keys(EXECUTORS);
}