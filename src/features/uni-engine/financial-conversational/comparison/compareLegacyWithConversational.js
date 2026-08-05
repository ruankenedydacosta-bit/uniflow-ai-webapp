// Uni Engine — Inteligência Financeira Conversacional (Fase 16). Bloco 8:
// Comparador Legado × Engine (Conversacional).
//
// compareLegacyWithConversational(legacyResponse, conversationalResult) compara
// a resposta do pipeline legado com o resultado da engine conversacional.
//
// Produz diagnóstico puramente observacional: nunca altera resposta, nunca
// aplica rota, nunca executa, nunca persiste. Objeto totalmente serializável.

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

function extractMetricsFromConversational(result) {
  if (!result?.executionResult?.data) return {};
  const data = result.executionResult.data;
  const metrics = {};

  if (data.primaryValue !== undefined) metrics.balance = data.primaryValue;
  if (data.temporalValue !== undefined) metrics.previousBalance = data.temporalValue;
  if (data.items?.length > 0) {
    metrics.breakdownTotal = data.total;
    metrics.topItem = data.items[0]?.value;
  }
  if (data.deltas) {
    metrics.incomeDelta = data.deltas.income;
    metrics.expenseDelta = data.deltas.expense;
    metrics.resultDelta = data.deltas.result;
  }
  if (data.healthScore !== undefined) metrics.healthScore = data.healthScore;
  if (data.metrics) {
    Object.assign(metrics, data.metrics);
  }
  if (data.projections?.length > 0) {
    metrics.projectedResult = data.projections[0]?.result;
  }

  return metrics;
}

function compareMetrics(legacy, conversational) {
  const divergences = [];
  const allKeys = new Set([...Object.keys(legacy), ...Object.keys(conversational)]);

  for (const key of allKeys) {
    const l = legacy[key];
    const c = conversational[key];
    if (l !== undefined && c !== undefined) {
      const diff = roundMoney(c - l);
      const pct = l !== 0 ? roundMoney((diff / l) * 100) : null;
      if (Math.abs(diff) > 0.01 || (pct !== null && Math.abs(pct) > 1)) {
        divergences.push({
          metric: key,
          legacy: l,
          conversational: c,
          difference: diff,
          percentDifference: pct,
          severity: Math.abs(pct ?? 0) > 10 ? 'high' : Math.abs(pct ?? 0) > 5 ? 'medium' : 'low',
        });
      }
    } else if (l !== undefined && c === undefined) {
      divergences.push({
        metric: key,
        legacy: l,
        conversational: null,
        difference: null,
        percentDifference: null,
        severity: 'medium',
        note: 'Métrica presente no legado, ausente na engine',
      });
    } else if (l === undefined && c !== undefined) {
      divergences.push({
        metric: key,
        legacy: null,
        conversational: c,
        difference: null,
        percentDifference: null,
        severity: 'low',
        note: 'Métrica presente na engine, ausente no legado',
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
  if (/fluxo|situa[cç][aã]o|balan[cç]o/.test(lower)) return 'cash_flow_query';
  if (/meta|objetivo/.test(lower)) return 'goal_query';
  if (/proje[cç][aã]o|futuro|m[eê]s que vem/.test(lower)) return 'projection_query';
  if (/comparado|m[eê]s passado|variacao/.test(lower)) return 'comparison_query';
  if (/categoria|onde mais|maior gasto/.test(lower)) return 'category_breakdown_query';
  if (/cart[aã]o|fatura|limite/.test(lower)) return 'credit_query';
  if (/investimento|aplica[cç][aã]o/.test(lower)) return 'investment_query';
  if (/divida|devo|empr[eé]stimo/.test(lower)) return 'debt_query';
  if (/sa[uú]de|diagnostico/.test(lower)) return 'financial_health_query';
  return 'unknown';
}

function compareIntents(legacyText, conversationalIntent) {
  const legacyIntent = extractIntentFromLegacy(legacyText);
  if (!legacyIntent || legacyIntent === 'unknown') {
    return { aligned: false, legacy: legacyIntent, conversational: conversationalIntent?.type ?? null };
  }
  return {
    aligned: legacyIntent === conversationalIntent?.type,
    legacy: legacyIntent,
    conversational: conversationalIntent?.type ?? null,
  };
}

function compareTemporal(legacyText, conversationalTemporal) {
  const legacyTemporal = extractTemporalEntities(legacyText);
  const hasLegacyTemporal = legacyTemporal.length > 0;
  const hasConversationalTemporal = conversationalTemporal?.resolved !== null;

  return {
    legacyDetected: hasLegacyTemporal,
    conversationalDetected: hasConversationalTemporal,
    aligned: hasLegacyTemporal === hasConversationalTemporal,
    legacyEntities: legacyTemporal,
    conversationalEntity: conversationalTemporal?.resolved?.type ?? null,
  };
}

function extractTemporalEntities(text) {
  if (!text) return [];
  const patterns = [
    /este m[eê]s/, /m[eê]s passado/, /[uú]ltimos \d+ meses/, /[uú]ltimos \d+ dias/,
    /este ano/, /ano passado/, /janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro/,
    /\d{1,2}\/\d{1,2}\/\d{4}/,
  ];
  return patterns.filter(p => p.test(text.toLowerCase())).map(p => p.source);
}

function buildComparisonDiagnostics(legacyResponse, conversationalResult) {
  const legacyMetrics = extractMetricsFromLegacy(legacyResponse);
  const conversationalMetrics = extractMetricsFromConversational(conversationalResult);
  const metricDivergences = compareMetrics(legacyMetrics, conversationalMetrics);

  const intentComparison = compareIntents(legacyResponse, conversationalResult?.intent);
  const temporalComparison = compareTemporal(legacyResponse, conversationalResult?.temporalResolution);

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
      conversational: intentComparison.conversational,
    });
  }
  if (!temporalComparison.aligned) {
    diagnostics.push({
      type: 'temporal_divergence',
      legacy: temporalComparison.legacyDetected,
      conversational: temporalComparison.conversationalDetected,
    });
  }

  return {
    metricDivergences,
    intentComparison,
    temporalComparison,
    diagnostics,
  };
}

export function compareLegacyWithConversational(legacyResponse, conversationalResult) {
  if (!legacyResponse || typeof legacyResponse !== 'string') {
    return deepFreeze({
      version: '1.0',
      status: 'no_data',
      legacyPresent: false,
      conversationalPresent: false,
      metricDivergences: [],
      intentComparison: { aligned: false },
      temporalComparison: { aligned: false },
      diagnostics: [],
      serializable: true,
    });
  }

  if (!conversationalResult || typeof conversationalResult !== 'object') {
    return deepFreeze({
      version: '1.0',
      status: 'conversational_missing',
      legacyPresent: true,
      conversationalPresent: false,
      metricDivergences: [],
      intentComparison: { aligned: false },
      temporalComparison: { aligned: false },
      diagnostics: [],
      serializable: true,
    });
  }

  const comparison = buildComparisonDiagnostics(legacyResponse, conversationalResult);
  const status = determineComparisonStatus(comparison.metricDivergences);

  const result = deepFreeze({
    version: '1.0',
    status,
    legacyPresent: true,
    conversationalPresent: true,
    legacyResponseLength: legacyResponse.length,
    conversationalStatus: conversationalResult.status,
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
  if (status === 'aligned') return 'Legado e engine conversacional alinhados.';
  if (status === 'minor_divergence') return `Pequenas divergências: ${summary.totalDivergences} métrica(s) diferente(s).`;
  if (status === 'divergent') return `Divergências significativas: ${summary.highSeverity} métrica(s) com diferença >10%.`;
  if (status === 'no_data') return 'Resposta legada não disponível para comparação.';
  if (status === 'conversational_missing') return 'Resultado da engine conversacional não disponível.';
  return 'Status de comparação desconhecido.';
}