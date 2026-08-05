// Uni Engine — Motor de Raciocínio Financeiro (Fase 15). Bloco 2: Snapshot.
//
 // buildFinancialReasoningSnapshot(...) consolida TODO o estado financeiro
 // observável do turno em uma única estrutura serializável (JSON-safe): sem
 // funções, sem Date, sem classes, sem Map/Set e sem referências circulares.
 //
 // Reutiliza os mesmos insumos do snapshot legado da Uni
 // (src/features/uni-chat/financialSnapshot.js) e adiciona domínios
 // derivados: investimentos, parcelamentos, cartões, reservas, fluxo mensal,
 // metas, patrimônio, últimos eventos e alertas internos brutos.
 //
 // O snapshot é 100% descartável: nunca executa, nunca escreve, nunca chama
 // serviços e nunca influencia a resposta visível.
 // Funções utilitárias para metas (inline para evitar dependência inexistente).
 function getGoalStatus(goal) {
   return goal?.status ?? 'UNKNOWN';
 }

 function calcProgress(current, target) {
   const cur = Number(current) || 0;
   const tgt = Number(target) || 0;
   if (tgt <= 0) return 0;
   const pct = (cur / tgt) * 100;
   return Math.min(Math.max(Math.round(pct), 0), 100);
 }

 function calcRemaining(current, target) {
   const cur = Number(current) || 0;
   const tgt = Number(target) || 0;
   return Math.max(tgt - cur, 0);
 }

function calcRhythmStatus(goal) {
    const status = getGoalStatus(goal);
    const normalizedStatus = String(status).toLowerCase();
    if (normalizedStatus !== 'active_shadow' && normalizedStatus !== 'active') return 'unknown';
    const current = Number(goal?.current_amount) || 0;
    const target = Number(goal?.target_amount) || 0;
    const monthly = Number(goal?.planned_monthly_amount) || 0;
    if (target <= 0) return 'unknown';
    if (current >= target) return 'complete';
    if (monthly <= 0) return 'insufficient_data';
    const remaining = target - current;
    const monthsNeeded = remaining / monthly;
    const targetDate = goal?.target_date ? new Date(goal.target_date) : null;
    const now = new Date();
    if (targetDate && !isNaN(targetDate.getTime())) {
      const monthsUntilTarget = (targetDate.getFullYear() - now.getFullYear()) * 12 + (targetDate.getMonth() - now.getMonth());
      if (monthsUntilTarget <= 0) return 'late';
      return monthsNeeded <= monthsUntilTarget ? 'on_track' : 'late';
    }
    return monthsNeeded <= 6 ? 'on_track' : 'late';
  }

export const FINANCIAL_REASONING_SNAPSHOT_VERSION = '1.0';
export const FINANCIAL_REASONING_DEFAULT_RESERVE_MONTHS = 3;
export const FINANCIAL_REASONING_FLOW_MONTHS = 6;
export const FINANCIAL_REASONING_MAX_LATEST_EVENTS = 6;

// Tipos de conta com liquidez imediata (caixa e equivalentes).
const LIQUID_ACCOUNT_TYPES = new Set([
  'checking',
  'savings',
  'cash',
  'digital_wallet',
]);

const VALID_TRANSACTION_TYPES = new Set(['income', 'expense']);

export function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

function monthKeyOf(dateStr) {
  if (typeof dateStr !== 'string') return null;
  const match = /^(\d{4})-(\d{2})/.exec(dateStr);
  if (!match) return null;
  return `${match[1]}-${match[2]}`;
}

function monthToTotal(monthKey) {
  const parts = monthKey.split('-');
  return Number(parts[0]) * 12 + Number(parts[1]) - 1;
}

function totalToMonth(total) {
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function addMonths(monthKey, delta) {
  return totalToMonth(monthToTotal(monthKey) + delta);
}

function shiftMonthKey(monthKey) {
  return addMonths(monthKey, -1);
}

function getToday(referenceDate) {
  if (typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}/.test(referenceDate)) {
    return referenceDate.slice(0, 10);
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function isInMonth(tx, monthKey) {
  return monthKeyOf(tx.transaction_date) === monthKey;
}

function sortTransactionsDesc(transactions) {
  return [...transactions].sort(
    (a, b) =>
      (b.transaction_date || '').localeCompare(a.transaction_date || '')
      || (b.created_at || '').localeCompare(a.created_at || '')
      || String(b.id || '').localeCompare(String(a.id || '')),
  );
}

function sumByType(transactions, transactionType) {
  return transactions
    .filter((tx) => tx.transaction_type === transactionType)
    .reduce((sum, tx) => sum + roundMoney(tx.amount), 0);
}

function normalizeCategoryName(category, categoriesById) {
  if (!category) return 'Sem categoria';
  const resolved = category.name;
  return typeof resolved === 'string' && resolved.trim() ? resolved.trim() : 'Sem categoria';
}

export function buildFinancialReasoningSnapshot({
  accounts = [],
  categories = [],
  transactions = [],
  goals = [],
  workspaceBalance = null,
  accountBalances = null,
  referenceDate = null,
  reserveMonths = FINANCIAL_REASONING_DEFAULT_RESERVE_MONTHS,
} = {}) {
  const safeAccounts = Array.isArray(accounts) ? accounts : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeTransactions = Array.isArray(transactions) ? transactions : [];
  const safeGoals = Array.isArray(goals) ? goals : [];

  const today = getToday(referenceDate);
  const currentMonth = monthKeyOf(today) ?? today.slice(0, 7);
  const previousMonth = shiftMonthKey(currentMonth);
  const categoriesById = new Map(safeCategories.map((category) => [category.id, category]));
  const accountsById = new Map(safeAccounts.map((account) => [account.id, account]));

  // Saldo derivado por conta: usa accountBalances quando existir, senão o
  // campo legado current_balance.
  const derivedByAccount = new Map();
  for (const balance of Array.isArray(accountBalances) ? accountBalances : []) {
    if (balance && balance.account_id) {
      derivedByAccount.set(balance.account_id, roundMoney(balance.derived_balance));
    }
  }
  const balancesById = new Map();
  for (const account of safeAccounts) {
    const derived = derivedByAccount.get(account.id);
    balancesById.set(
      account.id,
      derived != null ? derived : roundMoney(account.current_balance),
    );
  }

  const totalBalance = workspaceBalance != null
    ? roundMoney(workspaceBalance)
    : roundMoney([...balancesById.values()].reduce((sum, value) => sum + value, 0));

  const validTransactions = sortTransactionsDesc(
    safeTransactions.filter(
      (tx) =>
        VALID_TRANSACTION_TYPES.has(tx.transaction_type)
        && roundMoney(tx.amount) > 0
        && tx.status !== 'canceled',
    ),
  );

  const currentMonthTransactions = validTransactions.filter((tx) =>
    isInMonth(tx, currentMonth),
  );
  const previousMonthTransactions = validTransactions.filter((tx) =>
    isInMonth(tx, previousMonth),
  );

  const monthlyIncome = roundMoney(sumByType(currentMonthTransactions, 'income'));
  const monthlyExpense = roundMoney(sumByType(currentMonthTransactions, 'expense'));
  const monthlyResult = roundMoney(monthlyIncome - monthlyExpense);
  const previousIncome = roundMoney(sumByType(previousMonthTransactions, 'income'));
  const previousExpense = roundMoney(sumByType(previousMonthTransactions, 'expense'));
  const previousResult = roundMoney(previousIncome - previousExpense);

  // Série de fluxo dos últimos N meses (janela fechada, ordem cronológica).
  const flows = [];
  const flowCount = Math.max(1, Math.min(12, Math.round(Number(FINANCIAL_REASONING_FLOW_MONTHS) || 6)));
  for (let index = flowCount - 1; index >= 0; index -= 1) {
    const month = addMonths(currentMonth, -index);
    const monthTransactions = validTransactions.filter((tx) => isInMonth(tx, month));
    const income = roundMoney(sumByType(monthTransactions, 'income'));
    const expense = roundMoney(sumByType(monthTransactions, 'expense'));
    flows.push({
      month,
      income,
      expense,
      result: roundMoney(income - expense),
      transactionCount: monthTransactions.length,
    });
  }

  const monthsWithExpense = flows.filter((flow) => flow.transactionCount > 0);
  const avgMonthlyExpense = monthsWithExpense.length > 0
    ? roundMoney(monthsWithExpense.reduce((sum, flow) => sum + flow.expense, 0) / monthsWithExpense.length)
    : 0;
  const avgMonthlyIncome = monthsWithExpense.length > 0
    ? roundMoney(monthsWithExpense.reduce((sum, flow) => sum + flow.income, 0) / monthsWithExpense.length)
    : 0;
  const savingsRate = monthlyIncome > 0 ? roundMoney(monthlyResult / monthlyIncome) : 0;

  // Contas normalizadas.
  const accountsNormalized = safeAccounts.map((account) => {
    const type = typeof account.account_type === 'string' ? account.account_type : 'other';
    return {
      id: account.id ?? null,
      name: typeof account.name === 'string' ? account.name : null,
      type,
      balance: balancesById.get(account.id) ?? 0,
      active: account.is_active !== false,
      creditLimit: roundMoney(account.credit_limit),
      dueDay: typeof account.due_day === 'number' ? account.due_day : null,
      closingDay: typeof account.closing_day === 'number' ? account.closing_day : null,
      liquid: LIQUID_ACCOUNT_TYPES.has(type),
      investment: type === 'investment',
      creditCard: type === 'credit_card',
    };
  });

  const liquidAccounts = accountsNormalized.filter((account) => account.liquid);
  const investmentAccounts = accountsNormalized.filter((account) => account.investment);
  const creditCards = accountsNormalized.filter((account) => account.creditCard);

  // Cartões de crédito: saldo = uso atual (negativo = dívida), limite.
  const creditCardsNormalized = creditCards.map((card) => {
    const usage = Math.abs(Math.min(card.balance, 0));
    const limit = Math.max(card.creditLimit, 0);
    return {
      id: card.id,
      name: card.name,
      usage: roundMoney(usage),
      limit,
      available: roundMoney(Math.max(limit - usage, 0)),
      utilization: limit > 0 ? roundMoney(usage / limit) : 0,
      dueDay: card.dueDay,
      closingDay: card.closingDay,
    };
  });

  // Parcelamentos ativos (installment_total > 1), agrupados por grupo.
  const installmentGroups = new Map();
  for (const tx of validTransactions) {
    const total = Number(tx.installment_total);
    if (!Number.isInteger(total) || total <= 1) continue;
    const groupId = tx.metadata?.installment_group_id ?? `standalone:${tx.id}`;
    if (!installmentGroups.has(groupId)) {
      installmentGroups.set(groupId, {
        groupId,
        name: tx.description ?? 'Parcelamento',
        installments: total,
        paid: 0,
        paidAmount: 0,
        remainingAmount: 0,
        monthlyAmount: roundMoney(tx.amount),
        categoryId: tx.category_id ?? null,
        categoryName: normalizeCategoryName(categoriesById.get(tx.category_id), categoriesById),
        accountId: tx.account_id ?? null,
        accountName: accountsById.get(tx.account_id)?.name ?? null,
        status: tx.status ?? 'completed',
      });
    }
    const group = installmentGroups.get(groupId);
    group.paid += 1;
    group.paidAmount = roundMoney(group.paidAmount + roundMoney(tx.amount));
    group.remainingAmount = roundMoney(group.monthlyAmount * (total - group.paid));
  }
  const installments = [...installmentGroups.values()].map((group) => ({
    ...group,
    remaining: Math.max(group.installments - group.paid, 0),
  }));

  const recurring = validTransactions
    .filter((tx) => tx.is_recurring === true)
    .map((tx) => ({
      id: tx.id,
      description: tx.description ?? null,
      amount: roundMoney(tx.amount),
      transactionType: tx.transaction_type,
      categoryName: normalizeCategoryName(categoriesById.get(tx.category_id), categoriesById),
    }));

  // Reservas: alvo derivado (despesa média × meses) e reserva corrente
  // (caixa líquido). É estimativa interna — nunca afirma um valor real.
  const reserveTargetMonths = Math.max(1, Math.round(Number(reserveMonths) || FINANCIAL_REASONING_DEFAULT_RESERVE_MONTHS));
  const reserveTarget = roundMoney(avgMonthlyExpense * reserveTargetMonths);
  const currentReserve = roundMoney(liquidAccounts.reduce((sum, account) => sum + Math.max(account.balance, 0), 0));
  const reserveShortfall = roundMoney(Math.max(reserveTarget - currentReserve, 0));

  // Metas: reaproveita o cálculo de ritmo já existente do domínio.
  const goalsNormalized = safeGoals
    .filter((goal) => getGoalStatus(goal) === 'active')
    .map((goal) => ({
      id: goal.id ?? null,
      name: typeof goal.name === 'string' ? goal.name : null,
      target: roundMoney(goal.target_amount),
      current: roundMoney(goal.current_amount),
      progress: calcProgress(goal.current_amount, goal.target_amount),
      remaining: roundMoney(calcRemaining(goal.current_amount, goal.target_amount)),
      targetDate: typeof goal.target_date === 'string' ? goal.target_date.slice(0, 10) : null,
      rhythm: calcRhythmStatus(goal),
      plannedMonthlyAmount: roundMoney(goal.planned_monthly_amount),
    }));

  // Patrimônio (estimativa interna, sem custódia de valor real).
  const assetAccounts = accountsNormalized.filter(
    (account) => !account.creditCard && account.balance > 0,
  );
  const debtAccounts = accountsNormalized.filter(
    (account) => account.creditCard && account.balance < 0,
  );
  const assets = roundMoney(assetAccounts.reduce((sum, account) => sum + account.balance, 0));
  const debts = roundMoney(Math.abs(debtAccounts.reduce((sum, account) => sum + account.balance, 0)));
  const investmentBalance = roundMoney(investmentAccounts.reduce((sum, account) => sum + Math.max(account.balance, 0), 0));
  const liquidBalance = roundMoney(liquidAccounts.reduce((sum, account) => sum + Math.max(account.balance, 0), 0));

  // Últimos eventos (janela curta, sem payloads brutos).
  const latestEvents = validTransactions.slice(0, FINANCIAL_REASONING_MAX_LATEST_EVENTS).map((tx) => ({
    id: tx.id,
    date: tx.transaction_date,
    type: tx.transaction_type,
    amount: roundMoney(tx.amount),
    description: tx.description ?? null,
    categoryName: normalizeCategoryName(categoriesById.get(tx.category_id), categoriesById),
    accountName: accountsById.get(tx.account_id)?.name ?? null,
  }));

  // Alertas internos brutos — fatos, não decisões.
  const internalAlerts = [];
  if (safeAccounts.length === 0) internalAlerts.push({ key: 'no_accounts', level: 'info' });
  if (validTransactions.length === 0) internalAlerts.push({ key: 'no_transactions', level: 'info' });
  if (totalBalance < 0) internalAlerts.push({ key: 'total_balance_negative', level: 'high' });
  if (creditCardsNormalized.some((card) => card.usage > 0)) {
    internalAlerts.push({ key: 'credit_debt_present', level: 'medium' });
  }
  if (goalsNormalized.some((goal) => goal.rhythm === 'late')) {
    internalAlerts.push({ key: 'goal_late', level: 'medium' });
  }

  const hasData = validTransactions.length > 0
    || (workspaceBalance != null && roundMoney(workspaceBalance) !== 0)
    || [...balancesById.values()].some((value) => value !== 0)
    || safeGoals.length > 0;

  return {
    version: FINANCIAL_REASONING_SNAPSHOT_VERSION,
    serializable: true,
    referenceDate: today,
    currentMonth,
    previousMonth,
    currency: 'BRL',
    hasData,
    balance: {
      total: totalBalance,
      byAccount: accountsNormalized.map((account) => ({
        id: account.id,
        name: account.name,
        type: account.type,
        balance: account.balance,
        liquid: account.liquid,
        investment: account.investment,
        creditCard: account.creditCard,
      })),
    },
    income: {
      currentMonth,
      monthly: monthlyIncome,
      previous: previousIncome,
      delta: roundMoney(monthlyIncome - previousIncome),
      average: avgMonthlyIncome,
    },
    expenses: {
      currentMonth,
      monthly: monthlyExpense,
      previous: previousExpense,
      delta: roundMoney(monthlyExpense - previousExpense),
      average: avgMonthlyExpense,
      byCategory: safeCategories
        .map((category) => {
          const spent = roundMoney(
            currentMonthTransactions
              .filter((tx) => tx.transaction_type === 'expense' && tx.category_id === category.id)
              .reduce((sum, tx) => sum + roundMoney(tx.amount), 0),
          );
          return { id: category.id, name: category.name, spent };
        })
        .filter((entry) => entry.spent > 0)
        .sort((a, b) => b.spent - a.spent),
    },
    result: {
      monthly: monthlyResult,
      previous: previousResult,
      savingsRate,
    },
    accounts: accountsNormalized,
    categories: safeCategories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.transaction_type ?? null,
      isSystem: category.is_system === true,
    })),
    investments: investmentAccounts.map((account) => ({
      id: account.id,
      name: account.name,
      balance: Math.max(account.balance, 0),
    })),
    creditCards: creditCardsNormalized,
    installments,
    recurring,
    reserve: {
      targetMonths: reserveTargetMonths,
      target: reserveTarget,
      current: currentReserve,
      shortfall: reserveShortfall,
      sufficient: reserveShortfall <= 0,
    },
    flow: {
      months: flows,
      averageIncome: avgMonthlyIncome,
      averageExpense: avgMonthlyExpense,
      last: flows[flows.length - 1] ?? null,
      previous: flows[flows.length - 2] ?? null,
    },
    goals: goalsNormalized,
    patrimony: {
      assets,
      debts,
      net: roundMoney(assets - debts),
      liquid: liquidBalance,
      investments: investmentBalance,
    },
    latestEvents,
    internalAlerts,
    counts: {
      accounts: safeAccounts.length,
      transactions: validTransactions.length,
      goals: goalsNormalized.length,
      creditCards: creditCardsNormalized.length,
      installments: installments.length,
      recurring: recurring.length,
    },
  };
}