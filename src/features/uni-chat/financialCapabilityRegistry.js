// Sprint 4 (Blocos 4.2.3 + 4.5) — Registro central de capacidades
// financeiras, agora com suporte temporal COMPLETO (Ciclo 3).
//
// Fonte de verdade única de "o que a Uni sabe fazer hoje" — consumida pelo
// orquestrador semântico (financialSemanticOrchestrator.js) e usada para
// montar o catálogo enviado à LLM (nunca anunciar capacidade inexistente).
//
// Cada capacidade é ou (a) delegada ao motor determinístico já existente
// (financialQueryEngine.js, via a mesma ponte de texto canônico que
// semanticFinancialQuery.js já usa — Sprint 3), ou (b) um handler PURO que
// lê diretamente do snapshot via a API de intervalo (Bloco 4.5.1,
// aggregateFinancialRange/queryTransactionsInRange em financialSnapshot.js)
// — nenhum cálculo é duplicado aqui, e nenhuma capacidade fica mais presa
// ao mês corrente: qualquer período que resolveTemporalRange já reconhece
// (hoje, ontem, semana, mês, últimos N dias, intervalo entre datas, mês
// nomeado, semestre, ano) agora funciona.
import { resolveTemporalRange } from '../uni-intents/index.js';
import { roundMoney, aggregateFinancialRange, queryTransactionsInRange } from './financialSnapshot.js';

export const CAPABILITY_OPERATION = Object.freeze({
  READ: 'read',
  WRITE: 'write',
});

export const PERIOD_SUPPORT = Object.freeze({
  ANY: 'any',
  NONE: 'none',
});

// Constrói o intervalo [start, end] do mês corrente do snapshot -- usado
// como default quando nenhum período é mencionado (mesmo comportamento já
// estabelecido no resto do pipeline: ausência de período = mês atual).
function currentMonthRange(snapshot) {
  const monthKey = snapshot?.currentMonth;
  if (!monthKey) return null;
  const [year, month] = monthKey.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${monthKey}-01`,
    end: `${monthKey}-${String(lastDay).padStart(2, '0')}`,
    label: 'este mês',
  };
}

// Resolve QUALQUER expressão de período reconhecida por resolveTemporalRange
// (Bloco 4.5.2) -- nunca cai silenciosamente no mês atual quando o usuário
// pediu algo diferente e isso não foi reconhecido; nesse caso devolve null
// e o chamador decide pedir esclarecimento (nunca inventa um intervalo).
function resolvePeriodRange(snapshot, period) {
  if (!period) return currentMonthRange(snapshot);
  const range = resolveTemporalRange(period, snapshot?.referenceDate ?? null);
  if (range.status !== 'resolved') return null;
  return { start: range.start, end: range.end, label: range.label };
}

function periodNotRecognizedResult(capabilityId) {
  return {
    ok: false,
    reason: 'period_not_recognized',
    text: 'Não entendi exatamente esse período. Pode dizer de outro jeito, tipo "este mês" ou "últimos 30 dias"?',
    data: null,
    capabilityId,
  };
}

// Bloco 4.7 (matriz de naturalidade): "R$ 3000,00" (sem separador de
// milhar) fazia extractMentionedCurrencyValues (o guardrail de
// composeNaturalFinancialResponse.js) truncar o número em 3 dígitos
// ("R$ 300") e rejeitar respostas corretas como se tivessem valor
// inventado -- Intl.NumberFormat com separador de milhar (mesmo padrão já
// usado por fmtCurrency em financialQueryEngine.js) resolve na origem.
function formatCurrency(value) {
  const formatted = new Intl.NumberFormat('pt-BR', {
    style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(roundMoney(value));
  return `R$ ${formatted}`;
}

// Resolve o id de uma conta/categoria REAL pelo nome já validado (o
// orquestrador só passa aqui um nome que já bateu contra
// findAccountsByPhrase/findCategoriesByPhrase, ou o texto cru quando não
// encontrou nada -- neste caso o id nunca é encontrado e o filtro
// simplesmente não bate com nenhuma transação, resposta honesta "não
// encontrei").
function findIdByName(mapById, name) {
  if (!name || !mapById) return null;
  const normalized = String(name).trim().toLowerCase();
  for (const [id, entry] of mapById.entries()) {
    if (String(entry?.name ?? '').trim().toLowerCase() === normalized) return id;
  }
  return null;
}

// ── Handlers (Sprint 4) — operam sobre a API de intervalo do snapshot ────

function handleTotalBalance(snapshot) {
  return {
    ok: true,
    data: { totalBalance: snapshot.totalBalance, hasData: snapshot.hasData },
    text: snapshot.hasData
      ? `Seu saldo total é ${formatCurrency(snapshot.totalBalance)}.`
      : 'Ainda não encontrei dados financeiros para calcular seu saldo.',
  };
}

function handleFinancialSummary(snapshot, { period } = {}) {
  const range = resolvePeriodRange(snapshot, period);
  if (!range) return periodNotRecognizedResult('financial_summary');
  const agg = aggregateFinancialRange(snapshot, range);
  return {
    ok: true,
    data: {
      period: range,
      income: agg.income,
      expenses: agg.expense,
      result: agg.result,
      totalBalance: snapshot.totalBalance,
      transactionCount: agg.transactionCount,
    },
    text: `Em ${range.label}: receitas de ${formatCurrency(agg.income)}, despesas de ${formatCurrency(agg.expense)}, resultado de ${formatCurrency(agg.result)}.`,
  };
}

function handleTotalIncome(snapshot, { period } = {}) {
  const range = resolvePeriodRange(snapshot, period);
  if (!range) return periodNotRecognizedResult('total_income');
  const agg = aggregateFinancialRange(snapshot, range);
  return {
    ok: true,
    data: { period: range, income: agg.income },
    text: `Você recebeu ${formatCurrency(agg.income)} em ${range.label}.`,
  };
}

function handleIncomeByAccount(snapshot, { period, account } = {}) {
  const range = resolvePeriodRange(snapshot, period);
  if (!range) return periodNotRecognizedResult('income_by_account');
  const agg = aggregateFinancialRange(snapshot, range);
  if (account) {
    const value = agg.incomeByAccount.get(account);
    if (value == null) {
      return { ok: true, data: { period: range, account, income: 0 }, text: `Não encontrei receitas na conta ${account} em ${range.label}.` };
    }
    return { ok: true, data: { period: range, account, income: value }, text: `Você recebeu ${formatCurrency(value)} na conta ${account} em ${range.label}.` };
  }
  const entries = [...agg.incomeByAccount.entries()];
  if (entries.length === 0) {
    return { ok: true, data: { period: range, entries: [] }, text: `Não encontrei receitas em ${range.label}.` };
  }
  const text = entries.map(([name, value]) => `${name}: ${formatCurrency(value)}`).join(', ');
  return { ok: true, data: { period: range, entries }, text: `Receitas por conta em ${range.label}: ${text}.` };
}

function handleIncomeByCategory(snapshot, { period, category } = {}) {
  const range = resolvePeriodRange(snapshot, period);
  if (!range) return periodNotRecognizedResult('income_by_category');
  const agg = aggregateFinancialRange(snapshot, range);
  if (category) {
    const value = agg.incomeByCategory.get(category);
    if (value == null) {
      return { ok: true, data: { period: range, category, income: 0 }, text: `Não encontrei receitas em ${category} em ${range.label}.` };
    }
    return { ok: true, data: { period: range, category, income: value }, text: `Você recebeu ${formatCurrency(value)} em ${category} em ${range.label}.` };
  }
  const entries = [...agg.incomeByCategory.entries()];
  if (entries.length === 0) {
    return { ok: true, data: { period: range, entries: [] }, text: `Não encontrei receitas em ${range.label}.` };
  }
  const text = entries.map(([name, value]) => `${name}: ${formatCurrency(value)}`).join(', ');
  return { ok: true, data: { period: range, entries }, text: `Receitas por categoria em ${range.label}: ${text}.` };
}

function handleTopExpenses(snapshot, { period, limit, account, category } = {}) {
  const range = resolvePeriodRange(snapshot, period);
  if (!range) return periodNotRecognizedResult('top_expenses');
  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 20 ? limit : 5;

  const accountId = account ? findIdByName(snapshot.accountsById, account) : null;
  const categoryId = category ? findIdByName(snapshot.categoriesById, category) : null;
  const filtered = queryTransactionsInRange(snapshot, {
    start: range.start,
    end: range.end,
    accountIds: accountId ? [accountId] : (account ? ['__no_match__'] : null),
    categoryIds: categoryId ? [categoryId] : (category ? ['__no_match__'] : null),
    transactionTypes: ['expense'],
  }).slice().sort((a, b) => roundMoney(b.amount) - roundMoney(a.amount));

  const top = filtered.slice(0, safeLimit);
  if (top.length === 0) {
    return { ok: true, data: { period: range, items: [] }, text: `Não encontrei despesas em ${range.label}.` };
  }
  const text = top
    .map((tx) => `${tx.description || 'despesa'}: ${formatCurrency(tx.amount)}`)
    .join('; ');
  return { ok: true, data: { period: range, items: top }, text: `Suas maiores despesas em ${range.label}: ${text}.` };
}

function handleRecentTransactions(snapshot, { limit, period, account, category, transactionType } = {}) {
  const safeLimit = Number.isInteger(limit) && limit > 0 && limit <= 20 ? limit : 5;
  const accountId = account ? findIdByName(snapshot.accountsById, account) : null;
  const categoryId = category ? findIdByName(snapshot.categoriesById, category) : null;
  const types = transactionType ? [transactionType] : null;

  let items;
  let rangeLabel = null;
  if (period) {
    const range = resolvePeriodRange(snapshot, period);
    if (!range) return periodNotRecognizedResult('recent_transactions');
    rangeLabel = range.label;
    items = queryTransactionsInRange(snapshot, {
      start: range.start,
      end: range.end,
      accountIds: accountId ? [accountId] : (account ? ['__no_match__'] : null),
      categoryIds: categoryId ? [categoryId] : (category ? ['__no_match__'] : null),
      transactionTypes: types,
      limit: safeLimit,
    });
  } else if (account || category || transactionType) {
    items = queryTransactionsInRange(snapshot, {
      accountIds: accountId ? [accountId] : (account ? ['__no_match__'] : null),
      categoryIds: categoryId ? [categoryId] : (category ? ['__no_match__'] : null),
      transactionTypes: types,
      limit: safeLimit,
    });
  } else {
    items = snapshot.recentTransactions.slice(0, safeLimit);
  }

  if (items.length === 0) {
    return { ok: true, data: { items: [] }, text: rangeLabel ? `Não encontrei movimentações em ${rangeLabel}.` : 'Não encontrei movimentações recentes.' };
  }
  const text = items
    .map((tx) => `${tx.description || 'movimentação'}: ${formatCurrency(tx.amount)} (${tx.transaction_date})`)
    .join('; ');
  return { ok: true, data: { items }, text: `Suas movimentações ${rangeLabel ? `em ${rangeLabel}` : 'mais recentes'}: ${text}.` };
}

// ── Registro central ───────────────────────────────────────────────────

export const FINANCIAL_CAPABILITY_REGISTRY = Object.freeze([
  {
    id: 'total_balance',
    operation: CAPABILITY_OPERATION.READ,
    aliases: ['saldo total', 'quanto eu tenho', 'saldo geral'],
    requiredEntities: [],
    optionalEntities: [],
    periodSupport: PERIOD_SUPPORT.NONE,
    supportsAccount: false,
    supportsCategory: false,
    handler: handleTotalBalance,
    tool: 'get_account_summary',
    requiresConfirmation: false,
    testedBehaviorally: true,
    priority: 'high',
    llmDescription: 'Saldo total somando todas as contas ativas (não depende de período).',
  },
  {
    id: 'financial_summary',
    operation: CAPABILITY_OPERATION.READ,
    aliases: ['resumo financeiro', 'como estão minhas finanças', 'raio-x financeiro'],
    requiredEntities: [],
    optionalEntities: ['period'],
    periodSupport: PERIOD_SUPPORT.ANY,
    supportsAccount: false,
    supportsCategory: false,
    handler: handleFinancialSummary,
    tool: 'get_financial_summary',
    requiresConfirmation: false,
    testedBehaviorally: true,
    priority: 'high',
    llmDescription: 'Resumo do período pedido (qualquer período reconhecido): receitas, despesas e resultado.',
  },
  {
    id: 'total_income',
    operation: CAPABILITY_OPERATION.READ,
    aliases: ['quanto entrou', 'total de receitas', 'quanto recebi'],
    requiredEntities: [],
    optionalEntities: ['period'],
    periodSupport: PERIOD_SUPPORT.ANY,
    supportsAccount: false,
    supportsCategory: false,
    handler: handleTotalIncome,
    tool: null,
    requiresConfirmation: false,
    testedBehaviorally: true,
    priority: 'medium',
    llmDescription: 'Total de receitas do período pedido (qualquer período reconhecido).',
  },
  {
    id: 'income_by_account',
    operation: CAPABILITY_OPERATION.READ,
    aliases: ['receitas por conta', 'quanto recebi na conta'],
    requiredEntities: [],
    optionalEntities: ['period', 'account'],
    periodSupport: PERIOD_SUPPORT.ANY,
    supportsAccount: true,
    supportsCategory: false,
    handler: handleIncomeByAccount,
    tool: null,
    requiresConfirmation: false,
    testedBehaviorally: true,
    priority: 'medium',
    llmDescription: 'Receitas do período pedido agrupadas por conta, ou de uma conta específica.',
  },
  {
    id: 'income_by_category',
    operation: CAPABILITY_OPERATION.READ,
    aliases: ['receitas por categoria'],
    requiredEntities: [],
    optionalEntities: ['period', 'category'],
    periodSupport: PERIOD_SUPPORT.ANY,
    supportsAccount: false,
    supportsCategory: true,
    handler: handleIncomeByCategory,
    tool: null,
    requiresConfirmation: false,
    testedBehaviorally: true,
    priority: 'medium',
    llmDescription: 'Receitas do período pedido agrupadas por categoria, ou de uma categoria específica.',
  },
  {
    id: 'top_expenses',
    operation: CAPABILITY_OPERATION.READ,
    aliases: ['maiores despesas', 'onde eu mais gasto', 'maior gasto'],
    requiredEntities: [],
    optionalEntities: ['period', 'limit', 'account', 'category'],
    periodSupport: PERIOD_SUPPORT.ANY,
    supportsAccount: true,
    supportsCategory: true,
    handler: handleTopExpenses,
    tool: null,
    requiresConfirmation: false,
    testedBehaviorally: true,
    priority: 'high',
    llmDescription: 'As maiores despesas do período pedido, ordenadas por valor -- opcionalmente filtradas por conta/categoria.',
  },
  {
    id: 'recent_transactions',
    operation: CAPABILITY_OPERATION.READ,
    aliases: ['últimas transações', 'últimos gastos', 'movimentações recentes'],
    requiredEntities: [],
    optionalEntities: ['limit', 'period', 'account', 'category', 'transactionType'],
    periodSupport: PERIOD_SUPPORT.ANY,
    supportsAccount: true,
    supportsCategory: true,
    handler: handleRecentTransactions,
    tool: null,
    requiresConfirmation: false,
    testedBehaviorally: true,
    priority: 'high',
    llmDescription: 'As movimentações mais recentes (até 20), opcionalmente filtradas por período/conta/categoria/tipo.',
  },
]);

const REGISTRY_BY_ID = new Map(FINANCIAL_CAPABILITY_REGISTRY.map((c) => [c.id, c]));

export function getCapability(id) {
  return REGISTRY_BY_ID.get(id) ?? null;
}

export function listAvailableCapabilities() {
  return FINANCIAL_CAPABILITY_REGISTRY.map(({ id, aliases, operation, llmDescription, requiredEntities, optionalEntities }) => ({
    id,
    aliases,
    operation,
    description: llmDescription,
    requiredEntities,
    optionalEntities,
  }));
}

// Executa uma capacidade pelo id, sempre contra o snapshot real -- nunca
// lança, nunca inventa. Retorna null se a capacidade não existe (o
// chamador decide como responder honestamente -- "unsupported").
export function executeCapability(id, snapshot, params = {}) {
  const capability = getCapability(id);
  if (!capability || !snapshot) return null;
  try {
    return { capabilityId: id, ...capability.handler(snapshot, params) };
  } catch {
    return { capabilityId: id, ok: false, reason: 'handler_error', text: null, data: null };
  }
}
