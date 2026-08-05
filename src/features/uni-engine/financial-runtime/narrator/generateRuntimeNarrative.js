// Uni Engine — Runtime Conversacional Financeiro (Fase 17). Bloco 6:
 // Narrativa Financeira.
 //
 // Gera narrativas em linguagem natural a partir dos resultados da execução
 // e comparação. Usa o generateFinancialNarrative da Fase 16 como base
 // e adapta para o contexto do runtime.
 //
 // Estilos suportados:
 //   concise        - Resposta direta, uma frase
 //   structured     - Tópicos organizados
 //   detailed       - Explicação completa
 //   conversational - Tom natural, conversa
 //   executive      - Resumo executivo

 import { generateFinancialNarrative } from '../../financial-conversational/narrator/index.js';
 import { deepFreeze, roundMoney } from '../utils/shared.js';

function formatBRL(value) {
  const num = roundMoney(value);
  const sign = num < 0 ? '-' : '';
  const abs = Math.abs(num);
  return `${sign}R$ ${abs.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatPct(value) {
  const num = roundMoney(value);
  const sign = num > 0 ? '+' : '';
  return `${sign}${num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function buildRuntimePlan(intentType, comparisonType, executionPlanType) {
  if (comparisonType && ['comparison', 'income_vs_expense', 'category_vs_category', 'account_vs_account'].includes(comparisonType)) {
    return { type: 'comparison', comparisonType };
  }

  // O formato real do resultado (executionPlanType, calculado em
  // buildRuntimeExecutionResult a partir do primeiro dado que efetivamente
  // voltou da execução) é sempre a fonte de verdade -- reflete o "data" que
  // o narrador vai realmente ler. intentType só serve de fallback quando não
  // há nenhum resultado de execução ainda (ex.: chamadas diretas a este
  // helper fora do pipeline do shadow runtime).
  if (executionPlanType) return { type: executionPlanType };

  const planMap = {
    balance_query: 'single_metric',
    income_query: 'single_metric',
    expense_query: 'single_metric',
    savings_query: 'single_metric',
    net_worth_query: 'single_metric',
    cashflow_query: 'single_metric',
    category_breakdown_query: 'breakdown',
    account_query: 'breakdown',
    period_comparison_query: 'comparison',
    projection_query: 'projection',
    goals_query: 'goal_tracking',
    credit_query: 'single_metric',
    investments_query: 'single_metric',
    recurring_query: 'breakdown',
    installments_query: 'breakdown',
  };

  return { type: planMap[intentType] ?? 'single_metric' };
}

function buildRuntimeExecutionResult(executionResult, comparisonResult) {
  // Combinar resultado de execução com comparação para o narrador
  if (!executionResult || !executionResult.results) {
    return { status: 'no_data', planType: 'single_metric', data: null };
  }

  // Pegar o primeiro resultado disponível como primário
  const primaryType = Object.keys(executionResult.results)[0];
  const primaryData = executionResult.results[primaryType];

  let planType = 'single_metric';
  let data = {};

  switch (primaryType) {
    case 'transactions':
      planType = 'search';
      data = { results: primaryData.data, criteria: primaryData.filters };
      break;
    case 'accounts':
      planType = 'breakdown';
      // O narrador da Fase 16 lê item.value para qualquer breakdown -- os
      // itens do executor usam nomes de campo específicos por domínio
      // (balance/spent/amount/remainingAmount). Sem essa normalização, o
      // narrador lia undefined e produzia texto como "R$ 0,00" sem sentido.
      data = {
        breakdownType: 'account',
        items: (primaryData.data ?? []).map((item) => ({ ...item, value: item.balance })),
        total: primaryData.total,
      };
      break;
    case 'goals':
      planType = 'goal_tracking';
      data = { goals: primaryData.data, summary: primaryData.summary };
      break;
    case 'categories':
      planType = 'breakdown';
      data = {
        breakdownType: 'category',
        items: (primaryData.data ?? []).map((item) => ({ ...item, value: item.spent })),
        total: primaryData.total,
      };
      break;
    case 'cashflow':
      planType = 'single_metric';
      data = {
        primaryValue: primaryData.monthlyResult,
        temporalValue: primaryData.previousMonth ? primaryData.monthlyResult : null,
        metric: 'monthlyResult',
        label: 'resultado do mês',
      };
      break;
    case 'credit':
      planType = 'single_metric';
      data = {
        primaryValue: primaryData.totalUsage,
        metric: 'creditUtilization',
        label: 'uso de crédito',
      };
      break;
    case 'investments':
    case 'assets':
      planType = 'single_metric';
      data = {
        primaryValue: primaryData.totalBalance,
        metric: 'investmentBalance',
        label: 'investimentos',
      };
      break;
    case 'recurring':
      planType = 'breakdown';
      // Itens de recorrência usam "description", não "name" -- o narrador
      // de breakdown sempre lê item.name.
      data = {
        breakdownType: 'recurring',
        items: (primaryData.data ?? []).map((item) => ({ ...item, name: item.description, value: item.amount })),
        total: primaryData.total,
      };
      break;
    case 'installments':
      planType = 'breakdown';
      data = {
        breakdownType: 'installments',
        items: (primaryData.data ?? []).map((item) => ({ ...item, value: item.remainingAmount })),
        total: primaryData.total,
      };
      break;
    default:
      planType = 'single_metric';
      data = { primaryValue: 0, metric: 'unknown', label: 'valor' };
  }

  // Adicionar dados de comparação se houver
  if (comparisonResult && comparisonResult.status === 'executed') {
    data.comparison = comparisonResult;
  }

  return {
    status: executionResult.status,
    planType,
    data,
  };
}

export function generateRuntimeNarrative(executionResult, comparisonResult, intent, temporal, style = 'conversational') {
  const execForNarrator = buildRuntimeExecutionResult(executionResult, comparisonResult);
  // BLOCO F/E: o tipo de plano tem que refletir o formato REAL de `data`
  // (decidido em buildRuntimeExecutionResult, a partir do primeiro resultado
  // que de fato voltou da execução) -- não uma suposição feita só a partir
  // do tipo de intenção. balance_query, por exemplo, consulta ['accounts',
  // 'cashflow']; quando 'accounts' vem primeiro, o resultado tem o formato
  // breakdown (items/total), não single_metric (primaryValue/metric/label).
  // Usar buildRuntimePlan(intent.type) sozinho produzia um planType
  // dessincronizado do dado real, e o narrador da Fase 16 lia campos
  // inexistentes -- daí textos como "Seu undefined é R$ 0,00.".
  const plan = buildRuntimePlan(intent?.type, comparisonResult?.type, execForNarrator.planType);
  const enrichedContext = {
    hasData: executionResult?.status === 'executed',
    metrics: {},
    temporal: temporal ? { context: { periodKey: temporal.period, resolved: temporal } } : null,
  };

  // Usar o narrador da Fase 16
  const narrative = generateFinancialNarrative(execForNarrator, plan, enrichedContext, style);

  // Enriquecer com contexto do runtime
  const runtimeInsights = [];

  // Adicionar insight temporal se houver
  if (temporal?.entity) {
    const periodLabels = {
      today: 'hoje',
      yesterday: 'ontem',
      this_week: 'esta semana',
      last_week: 'semana passada',
      this_month: 'este mês',
      last_month: 'mês passado',
      specific_month: `o mês de ${temporal.month}/${temporal.year}`,
      specific_year: `o ano de ${temporal.year}`,
      last_n_months: `os últimos ${temporal.n} meses`,
      last_n_days: `os últimos ${temporal.n} dias`,
      this_year: 'este ano',
      last_year: 'ano passado',
      specific_date: `o dia ${temporal.date}`,
      date_range: `o período de ${temporal.start} a ${temporal.end}`,
    };
    const label = periodLabels[temporal.entity] || temporal.entity;
    runtimeInsights.push({
      type: 'contextual_insight',
      priority: 'low',
      text: `Período: ${label}.`,
      source: 'temporal',
    });
  }

  // Adicionar insight de intenção
  const intentLabels = {
    balance_query: 'consulta de saldo',
    income_query: 'consulta de receitas',
    expense_query: 'consulta de despesas',
    savings_query: 'consulta de poupança',
    net_worth_query: 'consulta de patrimônio',
    cashflow_query: 'consulta de fluxo de caixa',
    category_breakdown_query: 'breakdown por categoria',
    account_query: 'consulta de conta',
    period_comparison_query: 'comparação de períodos',
    projection_query: 'projeção financeira',
    goals_query: 'consulta de metas',
    credit_query: 'consulta de crédito',
    investments_query: 'consulta de investimentos',
    recurring_query: 'consulta de recorrentes',
    installments_query: 'consulta de parcelamentos',
  };
  runtimeInsights.push({
    type: 'contextual_insight',
    priority: 'low',
    text: `Tipo: ${intentLabels[intent?.type] || 'consulta financeira'}.`,
    source: 'intent',
  });

  // Combinar insights do narrador com insights do runtime
  const combinedInsights = [
    ...(narrative.insights || []),
    ...runtimeInsights,
  ];

  // Reconstruir texto combinando
  const combinedText = [
    narrative.text,
    ...runtimeInsights.map(i => i.text),
  ].filter(Boolean).join(' ');

  return deepFreeze({
    version: '1.0',
    type: narrative.type,
    style: narrative.style,
    text: combinedText,
    insights: combinedInsights,
    primaryPriority: narrative.primaryPriority,
    confidence: narrative.confidence,
    planType: plan.type,
    executionStatus: executionResult?.status,
    // comparisonType só existe quando há de fato uma comparação -- uma chave
    // presente com valor undefined desaparece no round-trip JSON (a chave de
    // saída do JSON.parse(JSON.stringify(...)) some), quebrando a garantia de
    // serializável (o objeto deixa de ser igual à sua própria versão
    // serializada). Omitir a chave por completo é o estado correto.
    ...(comparisonResult?.type ? { comparisonType: comparisonResult.type } : {}),
    serializable: true,
  });
}

export function getAvailableNarrativeStyles() {
  return ['concise', 'structured', 'detailed', 'conversational', 'executive'];
}