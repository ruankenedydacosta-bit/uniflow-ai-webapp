// Uni Engine — Runtime Conversacional Financeiro (Fase 17). Bloco 7:
// Shadow Runtime.
//
// runFinancialRuntimeShadow(...) orquestra toda a pipeline do runtime:
// intent → temporal → query planning → execution → comparison → narrative → telemetry
//
// Conecta-se ao snapshot financeiro da Fase 15 e usa todos os módulos
// das Fases 15-16. Tudo em Shadow Mode: influenceApplied=false,
// executionAllowed=false, discarded=true, nunca altera resposta visível.

import { FINANCIAL_RUNTIME_VERSION, RUNTIME_STAGES, RUNTIME_STATUS, RUNTIME_SAFETY_KEYS } from '../types/index.js';
import { createEmptyRuntimeResult, createEmptyRuntimeStageResults } from '../contracts/index.js';
import { resolveFinancialIntent } from '../intent/index.js';
import { resolveRuntimeTemporal } from '../temporal/index.js';
import { planFinancialQuery } from '../query/index.js';
import { executeFinancialQuery } from '../executor/index.js';
import { compareRuntimePeriods } from '../comparator/index.js';
import { generateRuntimeNarrative } from '../narrator/index.js';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/index.js';
import { isSerializableValue } from '../../uniEngineContracts.js';
import { deepFreeze, roundMoney } from '../utils/shared.js';

// BLOCO F: distingue "o usuário não mencionou nenhum período" (não bloqueia
// -- consultas de estado atual como saldo/patrimônio/cartão não exigem
// período) de "o usuário mencionou um período, mas ele não pôde ser
// resolvido" (ambíguo -- deve bloquear com temporal_unresolved). Sem essa
// distinção, "qual meu saldo" (sem nenhuma palavra temporal) e "saldo em
// algum dia" (menciona "dia" mas de forma ambígua) eram tratados de forma
// idêntica, e uma pergunta simples sem período nunca alcançava a checagem
// de dados financeiros.
const TEMPORAL_ATTEMPT_PATTERN = /\b(hoje|ontem|dias?|semanas?|m[eê]s(?:es)?|anos?|janeiro|fevereiro|mar[cç]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro|passad[oa]|\d{1,2}[/-]\d{1,2}|20\d{2})\b/i;

function looksLikeTemporalAttempt(text) {
  return TEMPORAL_ATTEMPT_PATTERN.test(String(text ?? ''));
}

function nowMillis() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function nowIso() {
  return typeof Date === 'function' ? new Date().toISOString() : null;
}

function buildSafety() {
  const safety = {};
  for (const key of RUNTIME_SAFETY_KEYS) {
    safety[key] = false;
  }
  return Object.freeze(safety);
}

function markStage(stages, key, status = 'ok') {
  if (!stages || typeof stages[key] !== 'object') return;
  stages[key] = Object.freeze({ present: true, executed: true, status, errorCode: null });
}

function buildEmptyStages() {
  const frozen = createEmptyRuntimeStageResults();
  const mutable = {};
  for (const key of Object.keys(frozen)) {
    mutable[key] = { ...frozen[key] };
  }
  return mutable;
}

function finalizeResult({
  status,
  turnId,
  messageId,
  workspaceId,
  conversationId,
  stages,
  intent,
  temporal,
  queryPlan,
  executionResult,
  periodComparison,
  narrative,
  telemetry,
  latencyMs,
}) {
  return deepFreeze({
    version: FINANCIAL_RUNTIME_VERSION,
    turnId,
    messageId,
    // FASE 19.1: identidade de produção do resultado -- campos próprios,
    // nunca aninhados dentro de turnId. Usados exclusivamente pelos gates de
    // isolamento da Fase 19 (workspace/conversation), nunca pelo próprio
    // runtime financeiro.
    workspaceId,
    conversationId,
    mode: 'shadow',
    status,
    shadowMode: true,
    influenceApplied: false,
    executionAllowed: false,
    legacyPreserved: true,
    executed: false,
    persisted: false,
    discarded: true,
    stages,
    intent,
    temporal,
    queryPlan,
    executionResult,
    periodComparison,
    narrative,
    telemetry,
    safety: buildSafety(),
    latencyMs,
    timestamp: nowIso(),
    serializable: true,
  });
}

export function runFinancialRuntimeShadow({
  config = null,
  turnId = null,
  messageId = null,
  workspaceId = null,
  conversationId = null,
  userMessage = null,
  financialData = null,
  referenceDate = null,
  narrativeStyle = 'conversational',
} = {}) {
  const started = nowMillis();
  const safeConfig = config && typeof config === 'object' ? config : {};
  const safeTurnId = typeof turnId === 'string' ? turnId : null;
  const safeMessageId = typeof messageId === 'string' ? messageId : null;
  const safeWorkspaceId = typeof workspaceId === 'string' ? workspaceId : null;
  const safeConversationId = typeof conversationId === 'string' ? conversationId : null;
  const safeUserMessage = typeof userMessage === 'string' ? userMessage : null;
  const safeFinancialData = financialData && typeof financialData === 'object' ? financialData : null;
  const safeStyle = ['concise', 'structured', 'detailed', 'conversational', 'executive'].includes(narrativeStyle)
    ? narrativeStyle : 'conversational';

  const buildEmpty = (status = 'disabled') => {
    const empty = createEmptyRuntimeResult({
      turnId: safeTurnId, messageId: safeMessageId, workspaceId: safeWorkspaceId, conversationId: safeConversationId,
    });
    return deepFreeze({
      ...empty,
      status,
      stages: buildEmptyStages(),
      latencyMs: Number((nowMillis() - started).toFixed(2)),
      timestamp: nowIso(),
    });
  };

  try {
    // Verifica se runtime financeiro está habilitado
    if (safeConfig.financialRuntimeEnabled !== true) {
      return buildEmpty('disabled');
    }

    if (!safeUserMessage) {
      return buildEmpty('skipped');
    }

    const stages = buildEmptyStages();
    markStage(stages, 'intent_resolution');

    // 1. Resolução de intenção financeira
    const intent = resolveFinancialIntent(safeUserMessage);
    if (!intent || intent.type === 'unknown') {
      return finalizeResult({
        status: 'intent_not_recognized',
        turnId: safeTurnId,
        messageId: safeMessageId,
        workspaceId: safeWorkspaceId,
        conversationId: safeConversationId,
        stages: markStage(stages, 'intent_resolution', 'ok') || stages,
        intent: null,
        temporal: null,
        queryPlan: null,
        executionResult: null,
        periodComparison: null,
        narrative: null,
        telemetry: null,
        latencyMs: Number((nowMillis() - started).toFixed(2)),
      });
    }
    markStage(stages, 'intent_resolution', 'ok');

    // 2. Resolução temporal
    markStage(stages, 'temporal_resolution');
    const temporal = resolveRuntimeTemporal(safeUserMessage, referenceDate);
    if ((!temporal || !temporal.entity) && looksLikeTemporalAttempt(safeUserMessage)) {
      return finalizeResult({
        status: 'temporal_unresolved',
        turnId: safeTurnId,
        messageId: safeMessageId,
        workspaceId: safeWorkspaceId,
        conversationId: safeConversationId,
        stages,
        intent,
        temporal: null,
        queryPlan: null,
        executionResult: null,
        periodComparison: null,
        narrative: null,
        telemetry: null,
        latencyMs: Number((nowMillis() - started).toFixed(2)),
      });
    }
    markStage(stages, 'temporal_resolution', 'ok');

    // 3. Construir snapshot financeiro se não fornecido
    let snapshot = safeFinancialData;
    if (!snapshot && safeFinancialData?.accounts) {
      snapshot = buildFinancialReasoningSnapshot({
        accounts: safeFinancialData.accounts,
        categories: safeFinancialData.categories ?? [],
        transactions: safeFinancialData.transactions ?? [],
        goals: safeFinancialData.goals ?? [],
        workspaceBalance: safeFinancialData.workspaceBalance ?? null,
        accountBalances: safeFinancialData.accountBalances ?? null,
        referenceDate: referenceDate ?? new Date().toISOString().slice(0, 10),
      });
    }

    if (!snapshot || snapshot.hasData !== true) {
      return finalizeResult({
        status: 'no_financial_data',
        turnId: safeTurnId,
        messageId: safeMessageId,
        workspaceId: safeWorkspaceId,
        conversationId: safeConversationId,
        stages,
        intent,
        temporal,
        queryPlan: null,
        executionResult: null,
        periodComparison: null,
        narrative: null,
        telemetry: null,
        latencyMs: Number((nowMillis() - started).toFixed(2)),
      });
    }

    // 4. Planejamento de consulta
    markStage(stages, 'query_planning');
    const queryPlan = planFinancialQuery(intent, temporal, snapshot);
    markStage(stages, 'query_planning', 'ok');

    // 5. Execução shadow
    markStage(stages, 'shadow_execution');
    const executionResult = executeFinancialQuery(queryPlan, snapshot);
    markStage(stages, 'shadow_execution', 'ok');

    // 6. Comparação de períodos (se aplicável)
    let periodComparison = null;
    if (queryPlan.queries.some(q => ['cashflow', 'categories', 'accounts'].includes(q.type))) {
      markStage(stages, 'period_comparison');
      const currentMonth = snapshot.currentMonth;
      const previousMonth = snapshot.previousMonth;
      if (currentMonth && previousMonth) {
        periodComparison = compareRuntimePeriods(snapshot, currentMonth, previousMonth, 'month_over_month');
      }
      // Adicionar comparação income vs expense
      const incomeVsExpense = compareRuntimePeriods(snapshot, currentMonth, null, 'income_vs_expense');
      if (incomeVsExpense.status === 'executed') {
        // Mesclar comparações
        if (periodComparison) {
          periodComparison = deepFreeze({
            ...periodComparison,
            incomeVsExpense,
          });
        } else {
          periodComparison = incomeVsExpense;
        }
      }
      markStage(stages, 'period_comparison', 'ok');
    }

    // 7. Geração de narrativa
    markStage(stages, 'narrative_generation');
    const narrative = generateRuntimeNarrative(executionResult, periodComparison, intent, temporal, safeStyle);
    markStage(stages, 'narrative_generation', 'ok');

    // 8. Telemetria (placeholder)
    markStage(stages, 'telemetry');
    let telemetry = null;
    if (safeConfig.financialRuntimeTelemetryEnabled === true) {
      // TODO: implementar telemetria do runtime
    }
    markStage(stages, 'telemetry', 'ok');

    // 9. Finalizar
    markStage(stages, 'discarded');

    return finalizeResult({
      status: 'completed',
      turnId: safeTurnId,
      messageId: safeMessageId,
        workspaceId: safeWorkspaceId,
        conversationId: safeConversationId,
      stages,
      intent,
      temporal,
      queryPlan,
      executionResult,
      periodComparison,
      narrative,
      telemetry,
      latencyMs: Number((nowMillis() - started).toFixed(2)),
    });

  } catch (error) {
    const disposition = createEmptyRuntimeResult({ turnId: safeTurnId, messageId: safeMessageId });
    return deepFreeze({
      ...disposition,
      status: 'error_safe',
      stages: buildEmptyStages(),
      latencyMs: Number((nowMillis() - started).toFixed(2)),
      timestamp: nowIso(),
    });
  }
}

export function getFinancialRuntimeCapabilities() {
  return {
    intents: [
      'balance_query', 'income_query', 'expense_query', 'savings_query',
      'net_worth_query', 'cashflow_query', 'category_breakdown_query',
      'account_query', 'period_comparison_query', 'projection_query',
      'goals_query', 'credit_query', 'investments_query',
      'recurring_query', 'installments_query',
    ],
    temporalEntities: [
      'today', 'yesterday', 'this_week', 'last_week',
      'this_month', 'last_month', 'specific_month', 'specific_year',
      'last_n_months', 'last_n_days', 'this_year', 'last_year',
      'specific_date', 'date_range',
    ],
    queryTypes: [
      'transactions', 'accounts', 'goals', 'categories',
      'cashflow', 'assets', 'credit', 'investments',
      'recurring', 'installments',
    ],
    comparisonTypes: [
      'month_over_month', 'year_over_year', 'quarter_over_quarter',
      'period_over_period', 'income_vs_expense', 'category_vs_category',
      'account_vs_account', 'projected_vs_actual',
    ],
    narrativeStyles: ['concise', 'structured', 'detailed', 'conversational', 'executive'],
  };
}