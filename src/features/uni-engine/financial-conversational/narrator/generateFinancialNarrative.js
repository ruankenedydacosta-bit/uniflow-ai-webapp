// Uni Engine — Inteligência Financeira Conversacional (Fase 16). Bloco 6:
// Narrador Financeiro.
//
// generateFinancialNarrative(executionResult, plan, enrichedContext, style) gera
// narrativas em linguagem natural a partir dos resultados da execução shadow.
//
// Tipos de narrativa:
// - direct_answer: resposta direta à pergunta
// - contextual_insight: insight contextual não perguntado
// - comparison_narrative: narrativa de comparação
// - trend_narrative: narrativa de tendência
// - alert_narrative: alerta financeiro
// - goal_progress_narrative: progresso de meta
// - projection_narrative: narrativa de projeção
// - health_summary: resumo de saúde financeira
// - disclaimer: aviso de limitação
//
// Estilos: concise, structured, detailed, conversational, executive
// Tudo shadow-only, serializável, sem efeitos.

import { FINANCIAL_NARRATIVE_TYPES, FINANCIAL_NARRATIVE_STYLES, NARRATIVE_INSIGHT_PRIORITIES, isFinancialNarrativeType, isFinancialNarrativeStyle, isNarrativeInsightPriority } from '../types/index.js';
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

function formatMonth(monthKey) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(year, month - 1);
  return date.toLocaleString('pt-BR', { month: 'long', year: 'numeric' });
}

function getMetricLabel(metric) {
  const labels = {
    totalBalance: 'saldo total',
    monthlyIncome: 'receita do mês',
    monthlyExpense: 'despesa do mês',
    monthlyResult: 'resultado do mês',
    savingsRate: 'taxa de poupança',
    liquidBalance: 'liquidez imediata',
    netPatrimony: 'patrimônio líquido',
    creditUtilization: 'uso de limite de crédito',
    investmentBalance: 'saldo em investimentos',
    reserveCoverage: 'cobertura de reserva',
    goalsCount: 'metas ativas',
  };
  return labels[metric] ?? metric;
}

function buildInsights(executionResult, plan, enrichedContext) {
  const insights = [];

  if (executionResult.status === 'no_data') {
    insights.push({
      type: 'info',
      priority: 'info',
      text: 'Não há dados financeiros suficientes para responder.',
      source: 'execution',
    });
    return insights;
  }

  const data = executionResult.data;
  if (!data) return insights;

  // Insights baseados no tipo de plano
  switch (plan.type) {
    case 'single_metric': {
      const { primaryValue, temporalValue, label, metric } = data;
      if (primaryValue !== null) {
        insights.push({
          type: 'direct_answer',
          priority: 'high',
          text: `Seu ${label} é ${formatBRL(primaryValue)}.`,
          value: primaryValue,
          metric,
          source: 'execution',
        });
      }
      if (temporalValue !== null && temporalValue !== primaryValue) {
        const diff = roundMoney(primaryValue - temporalValue);
        const pct = temporalValue !== 0 ? roundMoney((diff / temporalValue) * 100) : null;
        insights.push({
          type: 'comparison_narrative',
          priority: 'medium',
          text: `Comparado ao período anterior (${formatBRL(temporalValue)}), houve variação de ${formatBRL(diff)}${pct !== null ? ` (${formatPct(pct)})` : ''}.`,
          source: 'temporal',
        });
      }
      break;
    }

    case 'breakdown': {
      const { breakdownType, items, total } = data;
      if (items.length > 0) {
        const top = items[0];
        insights.push({
          type: 'direct_answer',
          priority: 'high',
          text: `Seu maior ${breakdownType === 'category' ? 'gasto' : breakdownType === 'account' ? 'saldo' : 'recorrente'} é ${top.name}: ${formatBRL(top.value)}.`,
          value: top.value,
          source: 'execution',
        });
        if (items.length > 1) {
          const second = items[1];
          insights.push({
            type: 'contextual_insight',
            priority: 'medium',
            text: `Em segundo lugar, ${second.name}: ${formatBRL(second.value)}.`,
            source: 'execution',
          });
        }
        if (total > 0) {
          insights.push({
            type: 'contextual_insight',
            priority: 'low',
            text: `Total: ${formatBRL(total)} em ${items.length} ${breakdownType === 'category' ? 'categorias' : breakdownType === 'account' ? 'contas' : 'recorrentes'}.`,
            source: 'execution',
          });
        }
      }
      break;
    }

    case 'comparison': {
      const { deltas, percentages, currentPeriod, comparisonPeriod } = data;
      if (deltas && percentages) {
        const parts = [];
        if (percentages.income !== null) {
          parts.push(`receita ${percentages.income > 0 ? 'subiu' : 'caiu'} ${formatPct(Math.abs(percentages.income))}`);
        }
        if (percentages.expense !== null) {
          parts.push(`despesa ${percentages.expense > 0 ? 'subiu' : 'caiu'} ${formatPct(Math.abs(percentages.expense))}`);
        }
        if (percentages.result !== null) {
          parts.push(`resultado ${percentages.result > 0 ? 'melhorou' : 'piorou'} ${formatPct(Math.abs(percentages.result))}`);
        }
        insights.push({
          type: 'comparison_narrative',
          priority: 'high',
          text: `De ${formatMonth(comparisonPeriod.month)} para ${formatMonth(currentPeriod.month)}: ${parts.join(', ')}.`,
          source: 'comparison',
        });
      }
      break;
    }

    case 'projection': {
      const { projections, trends, confidence } = data;
      if (projections?.length > 0) {
        const next = projections[0];
        insights.push({
          type: 'projection_narrative',
          priority: 'medium',
          text: `Projeção para ${formatMonth(next.month)}: receita ${formatBRL(next.income)}, despesa ${formatBRL(next.expense)}, resultado ${formatBRL(next.result)}.`,
          source: 'projection',
        });
        if (trends?.result?.direction) {
          insights.push({
            type: 'trend_narrative',
            priority: 'medium',
            text: `Tendência de resultado: ${trends.result.direction === 'increasing' ? 'crescente' : trends.result.direction === 'decreasing' ? 'decrescente' : 'estável'} (${formatPct(trends.result.slope * 100)} ao mês).`,
            source: 'projection',
          });
        }
        insights.push({
          type: 'disclaimer',
          priority: 'info',
          text: `Projeção baseada em tendência linear (confiança ~${Math.round(confidence * 100)}%). Não é garantia de resultado futuro.`,
          source: 'projection',
        });
      }
      break;
    }

    case 'search': {
      const { results, criteria } = data;
      if (results.length > 0) {
        insights.push({
          type: 'direct_answer',
          priority: 'high',
          text: `Encontrei ${results.length} transação${results.length > 1 ? 'ões' : ''} correspondente${results.length > 1 ? 's' : ''}.`,
          source: 'execution',
        });
        const first = results[0];
        insights.push({
          type: 'contextual_insight',
          priority: 'medium',
          text: `Exemplo: ${first.description} — ${formatBRL(first.amount)} (${first.category}, ${first.account}) em ${first.date}.`,
          source: 'execution',
        });
      } else {
        insights.push({
          type: 'direct_answer',
          priority: 'high',
          text: 'Nenhuma transação encontrada com esses critérios.',
          source: 'execution',
        });
      }
      break;
    }

    case 'health_check': {
      const { healthScore, diagnostics, metrics: dataMetrics } = data;
      const metrics = dataMetrics ?? enrichedContext?.metrics;
      let healthLabel = 'excelente';
      if (healthScore < 40) healthLabel = 'crítico';
      else if (healthScore < 60) healthLabel = 'atenção';
      else if (healthScore < 80) healthLabel = 'bom';

      insights.push({
        type: 'health_summary',
        priority: healthScore < 60 ? 'critical' : healthScore < 80 ? 'high' : 'medium',
        text: `Saúde financeira: ${healthLabel} (score ${healthScore}/100).`,
        value: healthScore,
        source: 'health_check',
      });

      const criticalDiagnostics = diagnostics.filter(d => d.severity === 'critical' || d.severity === 'high');
      for (const diag of criticalDiagnostics.slice(0, 3)) {
        const msg = getDiagnosticMessage(diag);
        if (msg) {
          insights.push({
            type: 'alert_narrative',
            priority: diag.severity === 'critical' ? 'critical' : 'high',
            text: msg,
            source: 'diagnostics',
          });
        }
      }

      if (metrics.savingsRate > 0) {
        insights.push({
          type: 'contextual_insight',
          priority: 'low',
          text: `Taxa de poupança: ${formatPct(metrics.savingsRate * 100)}.`,
          source: 'metrics',
        });
      }
      break;
    }

    case 'goal_tracking': {
      const { goals, summary } = data;
      if (goals.length > 0) {
        insights.push({
          type: 'goal_progress_narrative',
          priority: 'high',
          text: `Você tem ${summary.total} meta${summary.total > 1 ? 's' : ''} ativa${summary.total > 1 ? 's' : ''}: ${summary.onTrack} no ritmo, ${summary.late} atrasada${summary.late > 1 ? 's' : ''}, ${summary.completed} concluída${summary.completed > 1 ? 's' : ''}.`,
          source: 'goals',
        });

        const lateGoals = goals.filter(g => g.rhythm === 'late');
        for (const goal of lateGoals.slice(0, 2)) {
          insights.push({
            type: 'alert_narrative',
            priority: 'high',
            text: `Meta "${goal.name}" está atrasada: ${formatPct(goal.progress)} concluída (faltam ${formatBRL(goal.remaining)}).`,
            source: 'goals',
          });
        }

        const onTrack = goals.filter(g => g.rhythm === 'on_track');
        for (const goal of onTrack.slice(0, 2)) {
          insights.push({
            type: 'goal_progress_narrative',
            priority: 'medium',
            text: `Meta "${goal.name}" no ritmo: ${formatPct(goal.progress)} (${formatBRL(goal.monthlyContribution)}/mês).`,
            source: 'goals',
          });
        }
      }
      break;
    }

    case 'multi_metric': {
      const { metrics } = data;
      insights.push({
        type: 'health_summary',
        priority: 'medium',
        text: `Resumo: saldo ${formatBRL(metrics.totalBalance)}, receita ${formatBRL(metrics.monthlyIncome)}, despesa ${formatBRL(metrics.monthlyExpense)}, resultado ${formatBRL(metrics.monthlyResult)}.`,
        source: 'metrics',
      });
      if (metrics.savingsRate > 0) {
        insights.push({
          type: 'contextual_insight',
          priority: 'low',
          text: `Poupança ${formatPct(metrics.savingsRate * 100)}, liquidez ${formatBRL(metrics.liquidBalance)}, crédito ${formatPct(metrics.creditUtilization * 100)}.`,
          source: 'metrics',
        });
      }
      break;
    }
  }

  // Adicionar disclaimer padrão se não houver
  if (!insights.some(i => i.type === 'disclaimer')) {
    insights.push({
      type: 'disclaimer',
      priority: 'info',
      text: 'Análise baseada em dados do snapshot atual. Valores podem variar.',
      source: 'system',
    });
  }

  return insights;
}

function getDiagnosticMessage(diag) {
  const messages = {
    negative_balance: `Saldo negativo: ${formatBRL(diag.value)}.`,
    cash_risk: `Caixa insuficiente para cobrir despesas do mês (disponível: ${formatBRL(diag.value)}).`,
    credit_dependence: `Uso de crédito alto: ${formatPct(diag.value * 100)} do limite.`,
    low_savings_rate: `Taxa de poupança baixa: ${formatPct(diag.value * 100)}.`,
    insufficient_reserve: `Reserva abaixo da meta: cobertura de ${formatPct(diag.value * 100)}.`,
    delayed_goals: `${diag.value} meta${diag.value > 1 ? 's' : ''} com progresso atrasado.`,
  };
  return messages[diag.type] ?? null;
}

function selectInsightsByStyle(insights, style) {
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
  const sorted = [...insights].sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  switch (style) {
    case 'concise':
      return sorted.slice(0, 1);
    case 'structured':
      return sorted.slice(0, 3);
    case 'detailed':
      return sorted;
    case 'conversational':
      return sorted.slice(0, 4);
    case 'executive':
      return sorted.filter(i => ['critical', 'high', 'medium'].includes(i.priority)).slice(0, 3);
    default:
      return sorted.slice(0, 3);
  }
}

function buildNarrativeText(insights, style) {
  if (insights.length === 0) return 'Não há informações disponíveis.';

  const connectors = {
    concise: ' ',
    structured: '\n• ',
    detailed: '\n\n',
    conversational: ' ',
    executive: '\n• ',
  };

  const connector = connectors[style] ?? ' ';
  const prefix = style === 'structured' || style === 'executive' ? '• ' : '';

  return insights.map((insight, i) => {
    const text = insight.text;
    if (style === 'conversational' && i > 0) {
      const starters = ['Além disso, ', 'Também notei que ', 'Vale mencionar: '];
      return starters[i % starters.length] + text.toLowerCase();
    }
    return prefix + text;
  }).join(connector);
}

export function generateFinancialNarrative(executionResult, plan, enrichedContext, style = 'conversational') {
  const safeStyle = isFinancialNarrativeStyle(style) ? style : 'conversational';

  const insights = buildInsights(executionResult, plan, enrichedContext);
  const selectedInsights = selectInsightsByStyle(insights, safeStyle);
  const text = buildNarrativeText(selectedInsights, safeStyle);

  const primaryType = selectedInsights[0]?.type ?? 'direct_answer';
  const primaryPriority = selectedInsights[0]?.priority ?? 'medium';
  const confidence = executionResult.status === 'executed' ? 0.85 : 0.5;

  const narrative = deepFreeze({
    version: '1.0',
    type: isFinancialNarrativeType(primaryType) ? primaryType : 'direct_answer',
    style: safeStyle,
    text,
    insights: selectedInsights,
    primaryPriority: isNarrativeInsightPriority(primaryPriority) ? primaryPriority : 'medium',
    confidence: roundMoney(confidence),
    planType: plan?.type ?? 'unknown',
    executionStatus: executionResult?.status ?? 'unknown',
    serializable: true,
  });

  if (!isSerializableValue(narrative)) {
    return deepFreeze({
      version: '1.0',
      type: 'direct_answer',
      style: safeStyle,
      text: 'Erro ao gerar narrativa.',
      insights: [],
      primaryPriority: 'medium',
      confidence: 0,
      serializable: true,
    });
  }

  return narrative;
}

export function getAvailableStyles() {
  return Object.freeze([...FINANCIAL_NARRATIVE_STYLES]);
}

export function getAvailableNarrativeTypes() {
  return Object.freeze([...FINANCIAL_NARRATIVE_TYPES]);
}