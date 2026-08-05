// Uni Engine — Runtime Conversacional Financeiro (Fase 17). Bloco 8:
 // Comparador Legado × Runtime.
 //
 // compareLegacyWithRuntime(legacyResponse, runtimeResult) compara
 // a resposta do pipeline legado com o resultado do runtime financeiro.
 //
 // Produz diagnóstico puramente observacional: nunca altera resposta, nunca
 // aplica rota, nunca executa, nunca persiste. Objeto totalmente serializável.

 import { isSerializableValue } from '../../uniEngineContracts.js';
 import { resolveFinancialIntent } from '../intent/index.js';
 import { deepFreeze, roundMoney } from '../utils/shared.js';

function extractMetricsFromLegacy(text) {
  if (!text || typeof text !== 'string') return {};
  const metrics = {};

  const balanceMatch = text.match(/(?:saldo|total)[^\d]*([\d.,]+)/i);
  if (balanceMatch) metrics.balance = roundMoney(balanceMatch[1].replace('.', '').replace(',', '.'));

  const incomeMatch = text.match(/(?:receita|ganhei|entrou)[^\d]*([\d.,]+)/i);
  if (incomeMatch) metrics.income = roundMoney(incomeMatch[1].replace('.', '').replace(',', '.'));

  const expenseMatch = text.match(/(?:gastei|despesa|sa[ií]da)[^\d]*([\d.,]+)/i);
  if (expenseMatch) metrics.expense = roundMoney(expenseMatch[1].replace('.', '').replace(',', '.'));

  const resultMatch = text.match(/(?:resultado|sobrou|saldo.*m[eê]s)[^\d]*([\d.,]+)/i);
  if (resultMatch) metrics.result = roundMoney(resultMatch[1].replace('.', '').replace(',', '.'));

  return metrics;
}

function extractMetricsFromRuntime(result) {
  if (!result?.executionResult?.results) return {};
  const metrics = {};

  const results = result.executionResult.results;

  if (results.cashflow) {
    metrics.balance = results.cashflow.monthlyResult ?? 0;
    metrics.income = results.cashflow.monthlyIncome ?? 0;
    metrics.expense = results.cashflow.monthlyExpense ?? 0;
    metrics.result = results.cashflow.monthlyResult ?? 0;
  }

  if (results.accounts?.data?.length > 0) {
    const totalBalance = results.accounts.data.reduce((sum, a) => sum + roundMoney(a.balance), 0);
    metrics.balance = metrics.balance ?? totalBalance;
  }

  if (results.categories?.data?.length > 0) {
    metrics.categoryBreakdown = results.categories.data.map(c => ({
      name: c.name,
      spent: roundMoney(c.spent),
    }));
    metrics.topCategory = results.categories.data[0]?.name;
    metrics.topCategorySpent = roundMoney(results.categories.data[0]?.spent ?? 0);
  }

  if (results.goals?.data?.length > 0) {
    metrics.goals = results.goals.data.map(g => ({
      name: g.name,
      progress: g.progress,
      rhythm: g.rhythm,
    }));
  }

  if (results.credit?.data?.length > 0) {
    metrics.creditUsage = results.credit.totalUsage;
    metrics.creditLimit = results.credit.totalLimit;
    metrics.creditUtilization = results.credit.avgUtilization;
  }

  return metrics;
}

function compareMetrics(legacy, runtime) {
  const divergences = [];
  const allKeys = new Set([...Object.keys(legacy), ...Object.keys(runtime)]);

  for (const key of allKeys) {
    const l = legacy[key];
    const r = runtime[key];
    if (l !== undefined && r !== undefined) {
      const diff = roundMoney(r - l);
      const pct = l !== 0 ? roundMoney((diff / l) * 100) : null;
      if (Math.abs(diff) > 0.01 || (pct !== null && Math.abs(pct) > 1)) {
        divergences.push({
          metric: key,
          legacy: l,
          runtime: r,
          difference: diff,
          percentDifference: pct,
          severity: Math.abs(pct ?? 0) > 10 ? 'high' : Math.abs(pct ?? 0) > 5 ? 'medium' : 'low',
        });
      }
    } else if (l !== undefined && r === undefined) {
      divergences.push({
        metric: key,
        legacy: l,
        runtime: null,
        difference: null,
        percentDifference: null,
        severity: 'medium',
        note: 'Métrica presente no legado, ausente no runtime',
      });
    } else if (l === undefined && r !== undefined) {
      divergences.push({
        metric: key,
        legacy: null,
        runtime: r,
        difference: null,
        percentDifference: null,
        severity: 'low',
        note: 'Métrica presente no runtime, ausente no legado',
      });
    }
  }

  return divergences;
}

function determineComparisonStatus(divergences) {
  if (divergences.length === 0) return 'aligned';
  const highSeverity = divergences.some(d => d.severity === 'high');
  return highSeverity ? 'divergent' : 'minor_divergence';
}

function extractIntentFromLegacy(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  if (/saldo/.test(lower)) return 'balance_query';
  if (/receita|ganhei|entrou/.test(lower)) return 'income_query';
  if (/gastei|despesa|sa[ií]da/.test(lower)) return 'expense_query';
  if (/fluxo|situa[cç][aã]o|balan[cç]o/.test(lower)) return 'cashflow_query';
  if (/meta|objetivo/.test(lower)) return 'goals_query';
  if (/proje[cç][aã]o|futuro|m[eê]s que vem/.test(lower)) return 'projection_query';
  if (/comparado|m[eê]s passado|variacao/.test(lower)) return 'period_comparison_query';
  if (/categoria|onde mais|maior gasto/.test(lower)) return 'category_breakdown_query';
  if (/cart[aã]o|fatura|limite/.test(lower)) return 'credit_query';
  if (/investimento|aplica[cç][aã]o/.test(lower)) return 'investment_query';
  if (/divida|devo|empr[eé]stimo/.test(lower)) return 'debt_query';
  if (/sa[uú]de|diagnostico/.test(lower)) return 'financial_health_query';
  return 'unknown';
}

function compareIntents(legacyText, runtimeIntent) {
  const legacyIntent = extractIntentFromLegacy(legacyText);
  if (!legacyIntent || legacyIntent === 'unknown') {
    return { aligned: false, legacy: legacyIntent, runtime: runtimeIntent?.type ?? null };
  }
  return {
    aligned: legacyIntent === runtimeIntent?.type,
    legacy: legacyIntent,
    runtime: runtimeIntent?.type ?? null,
  };
}

function extractTemporalFromLegacy(text) {
  if (!text) return [];
  const patterns = [
    /este m[eê]s/, /m[eê]s passado/, /semana passada/, /esta semana/,
    /janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/,
    /\d{1,2}\/\d{1,2}\/\d{4}/,
    /[uú]ltimos \d+ (meses?|dias?)/,
    /este ano|ano passado/,
  ];
  return patterns.filter(p => p.test(text.toLowerCase())).map(p => p.source);
}

function compareTemporal(legacyText, runtimeTemporal) {
  const legacyTemporal = extractTemporalFromLegacy(legacyText);
  const hasLegacyTemporal = legacyTemporal.length > 0;
  const hasRuntimeTemporal = runtimeTemporal?.entity !== null;

  return {
    legacyDetected: hasLegacyTemporal,
    runtimeDetected: hasRuntimeTemporal,
    aligned: hasLegacyTemporal === hasRuntimeTemporal,
    legacyEntities: legacyTemporal,
    runtimeEntity: runtimeTemporal?.entity ?? null,
  };
}

function buildComparisonDiagnostics(legacyResponse, runtimeResult) {
  const legacyMetrics = extractMetricsFromLegacy(legacyResponse);
  const runtimeMetrics = extractMetricsFromRuntime(runtimeResult);
  const metricDivergences = compareMetrics(legacyMetrics, runtimeMetrics);

  const intentComparison = compareIntents(legacyResponse, runtimeResult?.intent);
  const temporalComparison = compareTemporal(legacyResponse, runtimeResult?.temporal);

  const status = determineComparisonStatus(metricDivergences);

  const diagnostics = [];
  if (metricDivergences.length > 0) {
    diagnostics.push({
      type: 'metric_divergence',
      count: metricDivergences.length,
      highSeverityCount: metricDivergences.filter(d => d.severity === 'high').length,
      details: metricDivergences,
    });
  }
  if (!intentComparison.aligned) {
    diagnostics.push({
      type: 'intent_divergence',
      legacy: intentComparison.legacy,
      runtime: intentComparison.runtime,
    });
  }
  if (!temporalComparison.aligned) {
    diagnostics.push({
      type: 'temporal_divergence',
      legacy: temporalComparison.legacyDetected,
      runtime: temporalComparison.runtimeDetected,
    });
  }

  return {
    metricDivergences,
    intentComparison,
    temporalComparison,
    diagnostics,
  };
}

export function compareLegacyWithRuntime(legacyResponse, runtimeResult) {
  if (!legacyResponse || typeof legacyResponse !== 'string') {
    return deepFreeze({
      version: '1.0',
      status: 'no_data',
      legacyPresent: false,
      runtimePresent: false,
      metricDivergences: [],
      intentComparison: { aligned: false },
      temporalComparison: { aligned: false },
      diagnostics: [],
      serializable: true,
    });
  }

  if (!runtimeResult || typeof runtimeResult !== 'object') {
    return deepFreeze({
      version: '1.0',
      status: 'runtime_missing',
      legacyPresent: true,
      runtimePresent: false,
      metricDivergences: [],
      intentComparison: { aligned: false },
      temporalComparison: { aligned: false },
      diagnostics: [],
      serializable: true,
    });
  }

  const comparison = buildComparisonDiagnostics(legacyResponse, runtimeResult);
  const status = determineComparisonStatus(comparison.metricDivergences);

  const result = deepFreeze({
    version: '1.0',
    status,
    legacyPresent: true,
    runtimePresent: true,
    legacyResponseLength: legacyResponse.length,
    runtimeStatus: runtimeResult.status,
    metricDivergences: comparison.metricDivergences,
    intentComparison: comparison.intentComparison,
    temporalComparison: comparison.temporalComparison,
    diagnostics: comparison.diagnostics,
    summary: {
      totalDivergences: comparison.metricDivergences.length,
      highSeverity: comparison.metricDivergences.filter(d => d.severity === 'high').length,
      intentAligned: comparison.intentComparison.aligned,
      temporalAligned: comparison.temporalComparison.aligned,
    },
    serializable: true,
  });

  if (!isSerializableValue(result)) {
    return deepFreeze({
      version: '1.0',
      status: 'error_safe',
      error: 'result_not_serializable',
      serializable: true,
    });
  }

  return result;
}

export function getComparisonSummary(comparisonResult) {
  if (!comparisonResult) return 'Sem comparação disponível.';

  const { status, summary } = comparisonResult;
  if (status === 'aligned') return 'Legado e runtime financeiro alinhados.';
  if (status === 'minor_divergence') return `Pequenas divergências: ${summary.totalDivergences} métrica(s) diferente(s).`;
  if (status === 'divergent') return `Divergências significativas: ${summary.highSeverity} métrica(s) com diferença >10%.`;
  if (status === 'no_data') return 'Resposta legada não disponível para comparação.';
  if (status === 'runtime_missing') return 'Resultado do runtime financeiro não disponível.';
  return 'Status de comparação desconhecido.';
}