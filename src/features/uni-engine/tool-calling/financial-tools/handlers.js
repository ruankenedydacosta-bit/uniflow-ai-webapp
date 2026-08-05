// Uni Engine — Fase 20.2: Tool Calling — handlers de leitura financeira.
//
// Seis ferramentas reais, seguras e SOMENTE de leitura. Consomem
// exclusivamente o snapshot canônico já construído no turno pelo motor
// financeiro (buildFinancialReasoningSnapshot da Fase 15) e funções
// canônicas de comparação da Fase 16 — nenhuma lógica de cálculo é
// duplicada aqui.
//
// Garantias:
//   - reads=true, writes=false em todas;
//   - nunca acessa Supabase/Asaas/auth/voz/rede;
//   - nunca dispara chamada LLM/OpenAI;
//   - nunca muta o snapshot (leitura pura, retorna cópias mínimas);
//   - nunca inventa dados ausentes (períodos não disponíveis → erro);
//   - nunca expõe IDs crus, payloads internos ou informações sensíveis;
//   - nunca lança exceção para o chat (erro padronizado).
import { compareFinancialPeriods } from '../../financial-conversational/period-comparison/index.js';
import { validateToolArguments } from './argsValidation.js';

const SUMMARY_SCHEMA = { period: 'period' };
const BREAKDOWN_SCHEMA = { period: 'period', category: 'category' };
const COMPARE_SCHEMA = { periodA: 'period', periodB: 'period', compare_type: 'string' };
const COMPARE_REQUIRED = ['periodA', 'periodB'];
const GOAL_SCHEMA = { status: 'status' };
const ACCOUNT_SCHEMA = { type: 'string' };
const RECURRING_SCHEMA = {};

const COMPARISON_TYPES = ['month_over_month', 'year_over_year', 'quarter_over_quarter'];

const SOURCE_META = Object.freeze({ source: 'snapshot' });

// Resposta de sucesso no formato canônico da Fase 20.2. O retorno do handler
// usa o envelope { data } reconhecido pelo executor da Fase 20, mantendo a
// resposta completa (`ok/tool/data/meta`) em ToolResult.data.
function toolOk(tool, data, meta) {
  return { data: { ok: true, tool, data, meta: { ...SOURCE_META, ...meta } } };
}

function toolError(tool, code) {
  return { data: { ok: false, tool, data: null, meta: { ...SOURCE_META }, error: { code, message: code } } };
}

function flowMonth(snapshot, periodKey) {
  const months = Array.isArray(snapshot?.flow?.months) ? snapshot.flow.months : [];
  return months.find((month) => month.month === periodKey) ?? null;
}

// 1. get_financial_summary — resumo do período: saldo, receitas, despesas,
// fluxo líquido. Nunca inventa dados ausentes (balance null sem contas).
export function buildGetFinancialSummaryHandler(snapshot) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return ({ arguments: args } = {}) => {
    const validation = validateToolArguments(args, SUMMARY_SCHEMA);
    if (!validation.ok) return toolError('get_financial_summary', validation.errors[0]);
    let income = 0;
    let expenses = 0;
    let result = 0;
    let period = safeSnapshot.currentMonth ?? null;
    if (validation.args.period && validation.args.period !== safeSnapshot.currentMonth) {
      const month = flowMonth(safeSnapshot, validation.args.period);
      if (!month) return toolError('get_financial_summary', 'PERIOD_NOT_AVAILABLE');
      income = month.income ?? 0;
      expenses = month.expense ?? 0;
      result = month.result ?? 0;
      period = month.month;
    } else {
      income = safeSnapshot.income?.monthly ?? 0;
      expenses = safeSnapshot.expenses?.monthly ?? 0;
      result = safeSnapshot.result?.monthly ?? 0;
    }
    const balance = safeSnapshot.counts?.accounts > 0 ? (safeSnapshot.balance?.total ?? 0) : null;
    const data = {
      period,
      currency: typeof safeSnapshot.currency === 'string' ? safeSnapshot.currency : 'BRL',
      balance,
      income,
      expenses,
      result,
      hasData: safeSnapshot.hasData === true,
    };
    return toolOk('get_financial_summary', data, { period });
  };
}

// 2. get_expense_breakdown — despesas por categoria do período. Para períodos
// não-correntes o snapshot canônico só expõe o agregado do fluxo (sem IDs).
export function buildGetExpenseBreakdownHandler(snapshot) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return ({ arguments: args } = {}) => {
    const validation = validateToolArguments(args, BREAKDOWN_SCHEMA);
    if (!validation.ok) return toolError('get_expense_breakdown', validation.errors[0]);
    const currentMonth = safeSnapshot.expenses?.currentMonth ?? safeSnapshot.currentMonth ?? null;
    let period = currentMonth;
    let total = safeSnapshot.expenses?.monthly ?? 0;
    let byCategory = [];
    let categoriesAvailable = true;
    if (validation.args.period && validation.args.period !== currentMonth) {
      const month = flowMonth(safeSnapshot, validation.args.period);
      if (!month) return toolError('get_expense_breakdown', 'PERIOD_NOT_AVAILABLE');
      period = month.month;
      total = month.expense ?? 0;
      byCategory = [];
      categoriesAvailable = false;
    } else {
      let entries = Array.isArray(safeSnapshot.expenses?.byCategory)
        ? safeSnapshot.expenses.byCategory.map((entry) => ({ name: entry.name, spent: entry.spent }))
        : [];
      if (validation.args.category) {
        entries = entries.filter((entry) => entry.name === validation.args.category);
        total = entries.reduce((sum, entry) => sum + (entry.spent ?? 0), 0);
      }
      byCategory = entries;
    }
    return toolOk('get_expense_breakdown', { period, total, byCategory, categoriesAvailable }, { period });
  };
}

// 3. compare_financial_periods — compara dois períodos do snapshot usando o
// comparador canônico da Fase 16 (sem duplicar cálculo, sem projeção).
export function buildCompareFinancialPeriodsHandler(snapshot) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return ({ arguments: args } = {}) => {
    const validation = validateToolArguments(args, COMPARE_SCHEMA, COMPARE_REQUIRED);
    if (!validation.ok) return toolError('compare_financial_periods', validation.errors[0]);
    const comparisonType = validation.args.compare_type ?? 'month_over_month';
    if (!COMPARISON_TYPES.includes(comparisonType)) {
      return toolError('compare_financial_periods', 'INVALID_compare_type');
    }
    const canonical = compareFinancialPeriods(safeSnapshot, validation.args.periodA, validation.args.periodB, comparisonType);
    const data = {
      status: canonical?.status ?? 'error_safe',
      comparisonType,
      periodA: validation.args.periodA,
      periodB: validation.args.periodB,
      detail: canonical?.status === 'executed'
        ? {
            deltas: canonical.deltas,
            percentages: canonical.percentages,
            interpretation: canonical.interpretation,
          }
        : null,
    };
    return toolOk('compare_financial_periods', data, {
      period: `${validation.args.periodA} vs ${validation.args.periodB}`,
    });
  };
}

// 4. get_goal_progress — progresso de metas existentes (leitura pura; sem
// mutação). Filtro opcional de status; status desconhecido é rejeitado.
export function buildGetGoalProgressHandler(snapshot) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return ({ arguments: args } = {}) => {
    const validation = validateToolArguments(args, GOAL_SCHEMA);
    if (!validation.ok) return toolError('get_goal_progress', validation.errors[0]);
    let goals = Array.isArray(safeSnapshot.goals)
      ? safeSnapshot.goals.map((goal) => ({
          name: goal.name ?? null,
          target: goal.target ?? 0,
          current: goal.current ?? 0,
          progress: goal.progress ?? 0,
          remaining: goal.remaining ?? 0,
          targetDate: goal.targetDate ?? null,
          rhythm: goal.rhythm ?? 'unknown',
          plannedMonthlyAmount: goal.plannedMonthlyAmount ?? 0,
        }))
      : [];
    if (validation.args.status && validation.args.status !== 'active') {
      goals = goals.filter((goal) => goal.rhythm === validation.args.status
        || (validation.args.status === 'complete' && goal.progress === 100));
    }
    return toolOk('get_goal_progress', { goals, count: goals.length }, {});
  };
}

// 5. get_account_summary — visão agregada das contas. Remove identificadores
// internos e dados sensíveis; agregação por tipo.
export function buildGetAccountSummaryHandler(snapshot) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return ({ arguments: args } = {}) => {
    const validation = validateToolArguments(args, ACCOUNT_SCHEMA);
    if (!validation.ok) return toolError('get_account_summary', validation.errors[0]);
    let accounts = [];
    if (safeSnapshot.counts?.accounts > 0) {
      accounts = Array.isArray(safeSnapshot.balance?.byAccount)
        ? safeSnapshot.balance.byAccount.map((account) => ({
            name: account.name ?? null,
            type: account.type ?? 'other',
            balance: account.balance ?? 0,
            liquid: account.liquid === true,
            investment: account.investment === true,
            creditCard: account.creditCard === true,
          }))
        : [];
      if (validation.args.type) {
        accounts = accounts.filter((account) => account.type === validation.args.type);
      }
    }
    const byType = {};
    for (const account of accounts) {
      byType[account.type] = (byType[account.type] ?? 0) + 1;
    }
    const data = {
      totalBalance: safeSnapshot.counts?.accounts > 0 ? (safeSnapshot.balance?.total ?? 0) : null,
      accounts,
      counts: { accounts: accounts.length, byType },
      currency: typeof safeSnapshot.currency === 'string' ? safeSnapshot.currency : 'BRL',
    };
    return toolOk('get_account_summary', data, {});
  };
}

// 6. get_recurring_expenses — despesas recorrentes detectadas (somente
// leitura). Sem criar, editar ou cancelar recorrência.
export function buildGetRecurringExpensesHandler(snapshot) {
  const safeSnapshot = snapshot && typeof snapshot === 'object' ? snapshot : {};
  return ({ arguments: args } = {}) => {
    const validation = validateToolArguments(args, RECURRING_SCHEMA);
    if (!validation.ok) return toolError('get_recurring_expenses', validation.errors[0]);
    const detected = Array.isArray(safeSnapshot.recurring)
      ? safeSnapshot.recurring.map((item) => ({
          description: item.description ?? null,
          amount: item.amount ?? 0,
          categoryName: item.categoryName ?? null,
          transactionType: item.transactionType ?? null,
        }))
      : [];
    const data = {
      detected,
      patternSufficient: detected.length > 0,
      period: safeSnapshot.expenses?.currentMonth ?? safeSnapshot.currentMonth ?? null,
    };
    return toolOk('get_recurring_expenses', data, {});
  };
}

// Build de todos os handlers (closure sobre o snapshot do turno).
export function buildFinancialToolHandlers(snapshot) {
  return {
    get_financial_summary: buildGetFinancialSummaryHandler(snapshot),
    get_expense_breakdown: buildGetExpenseBreakdownHandler(snapshot),
    compare_financial_periods: buildCompareFinancialPeriodsHandler(snapshot),
    get_goal_progress: buildGetGoalProgressHandler(snapshot),
    get_account_summary: buildGetAccountSummaryHandler(snapshot),
    get_recurring_expenses: buildGetRecurringExpensesHandler(snapshot),
  };
}

export { toolOk, toolError };