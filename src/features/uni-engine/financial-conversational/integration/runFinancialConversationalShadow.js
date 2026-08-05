// Uni Engine — Inteligência Financeira Conversacional (Fase 16). Bloco 7:
// Integração Shadow.
//
// runFinancialConversationalShadow(...) orquestra toda a pipeline conversacional:
// intent detection → temporal resolution → context enrichment → query planning
// → shadow execution → period comparison → narrative generation → telemetry
//
// Conecta-se ao pipeline UniChat existente via runUniEngineGateway ou
// diretamente no UniChatPage. Tudo em Shadow Mode: influenceApplied=false,
// discarded=true, nunca altera resposta visível.

import { FINANCIAL_CONVERSATIONAL_VERSION, FINANCIAL_CONVERSATIONAL_STAGES, FINANCIAL_CONVERSATIONAL_STATUS, FINANCIAL_CONVERSATIONAL_SAFETY_KEYS } from '../types/index.js';
import { createEmptyFinancialConversationalResult, createEmptyFinancialConversationalStageResults } from '../contracts/index.js';
import { resolveTemporalReferences, extractTemporalEntities, buildTemporalContext } from '../temporal/index.js';
import { enrichFinancialContext, getContextualMetrics } from '../context/index.js';
import { planFinancialQuery } from '../query-planner/index.js';
import { executeFinancialQuery } from '../executor/index.js';
import { compareFinancialPeriods } from '../period-comparison/index.js';
import { generateFinancialNarrative } from '../narrator/index.js';
import { isSerializableValue } from '../../uniEngineContracts.js';
import { buildFinancialReasoningSnapshot } from '../../financial-reasoning/snapshot/index.js';

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

function nowMillis() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function nowIso() {
  return typeof Date === 'function' ? new Date().toISOString() : null;
}

function buildSafety() {
  const safety = {};
  for (const key of FINANCIAL_CONVERSATIONAL_SAFETY_KEYS) {
    safety[key] = false;
  }
  return Object.freeze(safety);
}

function markStage(stages, key, status = 'ok') {
  if (!stages || typeof stages[key] !== 'object') return;
  stages[key] = Object.freeze({ present: true, executed: true, status, errorCode: null });
}

function markStageError(stages, key, errorCode) {
  if (!stages || typeof stages[key] !== 'object') return;
  stages[key] = Object.freeze({ present: true, executed: false, status: 'error', errorCode });
}

function buildEmptyStages() {
  const frozen = createEmptyFinancialConversationalStageResults();
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
  stages,
  intent,
  temporalResolution,
  enrichedContext,
  queryPlan,
  executionResult,
  periodComparison,
  narrative,
  telemetry,
  latencyMs,
}) {
  return deepFreeze({
    version: FINANCIAL_CONVERSATIONAL_VERSION,
    turnId,
    messageId,
    mode: 'shadow',
    status,
    shadowMode: true,
    influenceApplied: false,
    legacyPreserved: true,
    executed: false,
    persisted: false,
    discarded: true,
    stages,
    intent,
    temporalResolution,
    enrichedContext,
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

function detectFinancialIntent(text) {
  const normalized = String(text ?? '').toLowerCase().trim();
  if (!normalized) return null;

  const intentPatterns = [
    { type: 'balance_query', patterns: [/saldo/, /quanto.*tenho/, /meu.*saldo/, /qual.*saldo/, /saldo.*atual/, /saldo.*conta/] },
    { type: 'income_query', patterns: [/quanto.*ganhei/, /receita.*m[eê]s/, /entrou.*m[eê]s/, /salario.*m[eê]s/, /renda.*m[eê]s/] },
    { type: 'expense_query', patterns: [/quanto.*gastei/, /despesa.*m[eê]s/, /gastei.*m[eê]s/, /sa[ií]da.*m[eê]s/] },
    { type: 'cash_flow_query', patterns: [/fluxo.*caixa/, /como.*est[aã]o.*financ/, /situa[cç][aã]o.*financ/, /balan[cç]o.*m[eê]s/] },
    { type: 'savings_rate_query', patterns: [/taxa.*poupan[cç]a/, /poupan[cç]a.*m[eê]s/, /quanto.*poupei/] },
    { type: 'net_worth_query', patterns: [/patrim[oô]nio.*l[ií]quido/, /quanto.*valho/, /ativos.*menos.*passivos/] },
    { type: 'liquidity_query', patterns: [/liquidez/, /dinheiro.*dispon[ií]vel/, /caixa.*livre/, /reserva.*emergencia/] },
    { type: 'credit_query', patterns: [/cart[aã]o.*deve/, /limite.*cart[aã]o/, /fatura.*cart[aã]o/, /divida.*cart[aã]o/] },
    { type: 'investment_query', patterns: [/investimento/, /aplica[cç][aã]o/, /fundos/, /renda.*fixa/, /a[cç][aã]o/] },
    { type: 'debt_query', patterns: [/quanto.*devo/, /dividas?/, /empr[eé]stimos?/, /financiamento/] },
    { type: 'goal_query', patterns: [/meta/, /objetivo/, /reserva.*meta/, /objetivo.*financeiro/] },
    { type: 'projection_query', patterns: [/proje[cç][aã]o/, /vou.*ficar/, /m[eê]s.*que.*vem/, /futuro/, /daqui.*meses/] },
    { type: 'comparison_query', patterns: [/comparado/, /m[eê]s.*passado/, /ano.*passado/, /aumento/, /caiu/, /subiu/, /variacao/] },
    { type: 'category_breakdown_query', patterns: [/em.*que.*gastei/, /categoria.*mais/, /onde.*mais.*gastei/, /maior.*gasto/, /breakdown/] },
    { type: 'account_query', patterns: [/saldo.*nubank/, /saldo.*conta/, /conta.*corrente/, /poupan[cç]a.*saldo/] },
    { type: 'transaction_search_query', patterns: [/onde.*gastei/, /transa[cç][aã]o.*de/, /gastei.*reais/, /comprei.*por/] },
    { type: 'financial_health_query', patterns: [/sa[uú]de.*financeira/, /como.*est[aã]o.*minhas.*financ/, /diagnostico.*financeiro/] },
    { type: 'recurring_query', patterns: [/recorrente/, /fixo.*m[eê]s/, /assinatura/, /mensalidade/] },
    { type: 'installment_query', patterns: [/parcela/, /parcelamento/, /quantas.*parcelas/] },
    { type: 'budget_query', patterns: [/or[cç]amento/, /tenho.*para/, /cabe.*no.*bolso/] },
  ];

  let bestMatch = null;
  let bestScore = 0;

  for (const intent of intentPatterns) {
    let score = 0;
    for (const pattern of intent.patterns) {
      if (pattern.test(normalized)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestMatch = intent.type;
    }
  }

  if (!bestMatch) return null;

  const confidence = Math.min(0.95, 0.4 + bestScore * 0.15);
  const resolvedEntities = extractTemporalEntities(normalized);

  return {
    type: bestMatch,
    confidence: roundMoney(confidence),
    resolvedEntities,
    originalText: text,
  };
}

function roundMoney(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * 100) / 100;
}

export function runFinancialConversationalShadow({
  config = null,
  turnId = null,
  messageId = null,
  userMessage = null,
  financialData = null,
  conversationHistory = [],
  userPreferences = {},
  workspaceType = 'personal',
  referenceDate = null,
  narrativeStyle = 'conversational',
  telemetryStore = null,
} = {}) {
  const started = nowMillis();
  const safeConfig = config && typeof config === 'object' ? config : {};
  const safeTurnId = typeof turnId === 'string' ? turnId : null;
  const safeMessageId = typeof messageId === 'string' ? messageId : null;
  const safeUserMessage = typeof userMessage === 'string' ? userMessage : null;
  const safeFinancialData = financialData && typeof financialData === 'object' ? financialData : null;
  const safeHistory = Array.isArray(conversationHistory) ? conversationHistory.slice(-10) : [];
  const safePrefs = userPreferences && typeof userPreferences === 'object' ? userPreferences : {};
  const safeStyle = ['concise', 'structured', 'detailed', 'conversational', 'executive'].includes(narrativeStyle)
    ? narrativeStyle : 'conversational';

  const buildEmpty = (status = 'disabled') => {
    const empty = createEmptyFinancialConversationalResult({ turnId: safeTurnId, messageId: safeMessageId });
    return deepFreeze({
      ...empty,
      status,
      stages: buildEmptyStages(),
      latencyMs: Number((nowMillis() - started).toFixed(2)),
      timestamp: nowIso(),
    });
  };

  try {
    // Verifica se motor financeiro conversacional está habilitado
    if (safeConfig.financialConversationalEnabled !== true) {
      return buildEmpty('disabled');
    }

    if (!safeUserMessage) {
      return buildEmpty('skipped');
    }

    const stages = buildEmptyStages();
    markStage(stages, 'intent_detection');

    // 1. Detecção de intenção financeira
    const intent = detectFinancialIntent(safeUserMessage);
    if (!intent) {
      return finalizeResult({
        status: 'intent_not_recognized',
        turnId: safeTurnId,
        messageId: safeMessageId,
        stages: markStage(stages, 'intent_detection', 'ok') || stages,
        intent: null,
        temporalResolution: null,
        enrichedContext: null,
        queryPlan: null,
        executionResult: null,
        periodComparison: null,
        narrative: null,
        telemetry: null,
        latencyMs: Number((nowMillis() - started).toFixed(2)),
      });
    }
    markStage(stages, 'intent_detection', 'ok');

    // 2. Verificar dados financeiros ANTES de resolução temporal
    // Construir snapshot se dados fornecidos
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
        status: 'no_financial_context',
        turnId: safeTurnId,
        messageId: safeMessageId,
        stages,
        intent,
        temporalResolution: null,
        enrichedContext: null,
        queryPlan: null,
        executionResult: null,
        periodComparison: null,
        narrative: null,
        telemetry: null,
        latencyMs: Number((nowMillis() - started).toFixed(2)),
      });
    }

    // 3. Resolução temporal - extrair entidades temporais da mensagem
    markStage(stages, 'temporal_resolution');
    const temporalEntities = extractTemporalEntities(safeUserMessage);
    let temporalResolution = { status: 'out_of_scope', confidence: 0, resolved: null, originalText: safeUserMessage };
    
    if (temporalEntities.length > 0) {
      // Tentar resolver a primeira entidade temporal encontrada
      const firstEntity = temporalEntities[0];
      temporalResolution = resolveTemporalReferences(firstEntity.text, referenceDate);
      
      // Se a primeira não resolver, tentar as outras
if (temporalResolution.status === 'ambiguous' || temporalResolution.status === 'invalid_format' || temporalResolution.status === 'out_of_scope') {
        for (let i = 1; i < temporalEntities.length; i++) {
          const attempt = resolveTemporalReferences(temporalEntities[i].text, referenceDate);
          if (attempt.status === 'resolved') {
            temporalResolution = attempt;
            break;
          }
        }
      }
    }
    
    if (temporalResolution.status === 'ambiguous' || temporalResolution.status === 'invalid_format' || temporalResolution.status === 'out_of_scope') {
      return finalizeResult({
        status: 'temporal_unresolved',
        turnId: safeTurnId,
        messageId: safeMessageId,
        stages,
        intent,
        temporalResolution,
        enrichedContext: null,
        queryPlan: null,
        executionResult: null,
        periodComparison: null,
        narrative: null,
        telemetry: null,
        latencyMs: Number((nowMillis() - started).toFixed(2)),
      });
    }
markStage(stages, 'temporal_resolution', 'ok');

    // 4. Enriquecimento de contexto
    markStage(stages, 'context_enrichment');
    const enrichedContext = enrichFinancialContext({
      snapshot,
      temporalResolution,
      intent,
      conversationHistory: safeHistory,
      userPreferences: safePrefs,
      workspaceType,
    });
    markStage(stages, 'context_enrichment', 'ok');

    // 5. Planejamento de consulta
    markStage(stages, 'query_planning');
    const queryPlan = planFinancialQuery(intent, enrichedContext);
    markStage(stages, 'query_planning', 'ok');

    // 6. Execução shadow
    markStage(stages, 'shadow_execution');
    const executionResult = executeFinancialQuery(queryPlan, snapshot, enrichedContext);
    markStage(stages, 'shadow_execution', 'ok');

    // 7. Comparação de períodos (se aplicável)
    let periodComparison = null;
    if (queryPlan.type === 'comparison' || queryPlan.type === 'projection') {
      markStage(stages, 'period_comparison');
      if (enrichedContext.temporal?.context?.periodKey && snapshot.flow?.months) {
        const currentMonth = snapshot.currentMonth;
        const comparisonMonth = enrichedContext.temporal.context.periodKey;
        if (currentMonth !== comparisonMonth) {
          periodComparison = compareFinancialPeriods(snapshot, currentMonth, comparisonMonth, 'month_over_month');
        }
      }
      markStage(stages, 'period_comparison', 'ok');
    }

    // 8. Geração de narrativa
    markStage(stages, 'narrative_generation');
    const narrative = generateFinancialNarrative(executionResult, queryPlan, enrichedContext, safeStyle);
    markStage(stages, 'narrative_generation', 'ok');

    // 9. Telemetria (placeholder - implementar se necessário)
    markStage(stages, 'telemetry');
    let telemetry = null;
    if (safeConfig.financialConversationalTelemetryEnabled === true && telemetryStore) {
      // TODO: implementar telemetria conversacional
    }
    markStage(stages, 'telemetry', 'ok');

    // 10. Finalizar
    markStage(stages, 'discarded');

    return finalizeResult({
      status: 'completed',
      turnId: safeTurnId,
      messageId: safeMessageId,
      stages,
      intent,
      temporalResolution,
      enrichedContext,
      queryPlan,
      executionResult,
      periodComparison,
      narrative,
      telemetry,
      latencyMs: Number((nowMillis() - started).toFixed(2)),
    });

  } catch (error) {
    const disposition = createEmptyFinancialConversationalResult({ turnId: safeTurnId, messageId: safeMessageId });
    return deepFreeze({
      ...disposition,
      status: 'fallback',
      stages: markStageError(buildEmptyStages(), 'unknown', 'INTERNAL_ERROR'),
      latencyMs: Number((nowMillis() - started).toFixed(2)),
      timestamp: nowIso(),
    });
  }
}

export function getFinancialConversationalCapabilities() {
  return {
    intents: [
      'balance_query', 'income_query', 'expense_query', 'cash_flow_query',
      'savings_rate_query', 'net_worth_query', 'liquidity_query', 'credit_query',
      'investment_query', 'debt_query', 'goal_query', 'projection_query',
      'comparison_query', 'category_breakdown_query', 'account_query',
      'transaction_search_query', 'financial_health_query', 'recurring_query',
      'installment_query', 'budget_query',
    ],
    temporalPatterns: [
      'este mês', 'mês passado', 'últimos N meses', 'últimos N dias',
      'ano atual', 'ano passado', 'desde DD/MM/AAAA', 'até DD/MM/AAAA',
      'janeiro 2026', 'março de 2025', 'DD/MM/AAAA a DD/MM/AAAA',
    ],
    narrativeStyles: ['concise', 'structured', 'detailed', 'conversational', 'executive'],
    planTypes: ['single_metric', 'breakdown', 'comparison', 'projection', 'search', 'health_check', 'multi_metric', 'goal_tracking'],
  };
}