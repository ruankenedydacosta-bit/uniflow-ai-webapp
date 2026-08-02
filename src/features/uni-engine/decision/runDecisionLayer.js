// Orquestrador da Camada de Decisão Cognitiva (Fase 5 — Shadow Mode).
//
// runDecisionLayer(input) recebe o contexto completo da rodada e produz o
// DecisionResult — NUNCA executa. Fluxo:
//   Receber contexto
//   → Avaliar contexto (evaluateDecisionContext)
//   → Calcular confiança (computeDecisionConfidence)
//   → Calcular risco (detectDecisionRisk)
//   → Escolher decisão (chooseNextDecision)
//   → Produzir diagnóstico (diagnostics)
//   → Produzir recomendações (buildDecisionSuggestions)
//   → Produzir telemetria redigida (buildDecisionTelemetry)
//   → Retornar resultado
//
// Garantias absolutas:
//   - nunca chama executor, banco, voz ou RPC;
//   - `shadow.appliedToDecision` permanece SEMPRE falso;
//   - síncrono, puro, determinístico e serializável.
import {
  DECISION_LAYER_VERSION,
  createDecisionDependencies,
  createDecisionShadow,
  validateDecisionResult,
} from './decisionContracts.js';
import { isValidDecisionRisk, isValidDecisionType } from './decisionTypes.js';
import { evaluateDecisionContext } from './evaluateDecisionContext.js';
import { computeDecisionConfidence } from './computeDecisionConfidence.js';
import { detectDecisionRisk } from './detectDecisionRisk.js';
import { chooseNextDecision } from './chooseNextDecision.js';
import { buildDecisionReason } from './buildDecisionReason.js';
import { buildDecisionSuggestions } from './buildDecisionSuggestions.js';
import { buildDecisionTelemetry, emitDecisionTelemetry } from './telemetry/decisionTelemetry.js';

const ACTION_EXECUTOR = 'execute_confirmed_financial_action';
const QUERY_EXECUTOR = 'FinancialQueryEngine';
const RESPONSE_EXECUTOR = 'createAssistantResponse';

function nowMillis() {
  if (typeof performance?.now === 'function') return performance.now();
  return Date.now();
}

function recommendedExecutorOf({ intentType, cognitivePlan, decisionType }) {
  const actionIntents = [
    'register_income',
    'register_expense',
    'register_transfer',
    'set_balance',
    'ambiguous_balance_or_income',
    'create_goal',
  ];
  const queryIntents = ['check_balance', 'forecast', 'question'];
  if (actionIntents.includes(intentType)) return ACTION_EXECUTOR;
  if (queryIntents.includes(intentType)) return QUERY_EXECUTOR;
  if (['small_talk', 'unsupported', 'clarification'].includes(intentType)) return RESPONSE_EXECUTOR;
  if (decisionType === 'CANCEL' || decisionType === 'REJECT') return null;
  return cognitivePlan?.executorExpected ?? cognitivePlan?.theoreticalExecutor ?? null;
}

function recommendedQuestionOf(missingFields, decisionType) {
  if (decisionType !== 'ASK' && decisionType !== 'CONFIRM') return null;
  const first = Array.isArray(missingFields) ? missingFields[0] : null;
  if (first) return `ask:${first}`;
  if (decisionType === 'CONFIRM') return 'confirm:pending';
  return null;
}

function requiredSourcesOf({ decisionType, context }) {
  const sources = [];
  const evidence = context.evidence ?? {};
  if (evidence.snapshotAvailable === false && context.needSnapshot) sources.push('financial_snapshot');
  if (context.needDatabase) sources.push('database');
  if (context.needMemory || evidence.referenceAmbiguous) sources.push('persistent_memory');
  if (context.needHistory) sources.push('conversation_history');
  if (context.needUser || (context.missingFields?.length ?? 0) > 0) sources.push('user');
  if (evidence.epistemicRefreshRecommended && !sources.includes('financial_snapshot')) {
    sources.push('financial_snapshot');
  }
  if (evidence.epistemicAskRecommended && !sources.includes('user')) sources.push('user');
  if (context.needContext) sources.push('operational_memory');
  if (evidence.executorAvailable && ['ANSWER', 'CONFIRM'].includes(decisionType)) {
    sources.push('executor');
  }
  return sources;
}

export function runDecisionLayer(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const flags = safe.featureFlags && typeof safe.featureFlags === 'object' ? safe.featureFlags : {};
  const correlationId = safe.correlationId ?? null;
  const start = nowMillis();
  const sectionTimings = {};

  let context = null;
  let errorCode = null;

  try {
    const t0 = nowMillis();
    context = evaluateDecisionContext({
      intent: safe.intent ?? safe.conversationContext?.lastIntent ?? null,
      cognitivePlan: safe.cognitivePlan ?? null,
      epistemicModel: safe.epistemicModel ?? null,
      operationalMemory: safe.operationalMemory ?? null,
      persistentMemory: safe.persistentMemory ?? null,
      financialSnapshot: safe.financialSnapshot ?? null,
      pendingAction: safe.pendingAction ?? null,
      conversationContext: safe.conversationContext ?? null,
      expectedExecutor: safe.expectedExecutor ?? null,
      now: safe.timestamp ? Date.parse(safe.timestamp) || undefined : undefined,
    });
    sectionTimings.contextMs = Number((nowMillis() - t0).toFixed(3));

    const t1 = nowMillis();
    const confidenceResult = computeDecisionConfidence(context);
    sectionTimings.confidenceMs = Number((nowMillis() - t1).toFixed(3));

    const t2 = nowMillis();
    const riskResult = detectDecisionRisk(context);
    sectionTimings.riskMs = Number((nowMillis() - t2).toFixed(3));

    const t3 = nowMillis();
    const decisionType = chooseNextDecision({
      context,
      confidence: confidenceResult.confidence,
      risk: riskResult,
      messageType: safe.messageType ?? null,
      safetyBlocked: safe.safetyBlocked ?? false,
    });
    sectionTimings.decisionMs = Number((nowMillis() - t3).toFixed(3));

    const reason = buildDecisionReason({
      decisionType,
      context,
      confidence: confidenceResult.confidence,
      risk: riskResult,
    });

    const recommendationDetails = buildDecisionSuggestions({ decisionType, context });

    const result = {
      version: DECISION_LAYER_VERSION,
      correlationId,
      enabled: true,
      shadowMode: Boolean(flags.decisionShadowMode ?? true),
      fallbackUsed: false,
      fallbackReason: null,
      errorCode: null,
      decisionType,
      decision: {
        type: decisionType,
        confidence: confidenceResult.confidence,
        confidenceBand: confidenceResult.band,
        risk: riskResult.level,
      },
      confidence: confidenceResult.confidence,
      confidenceBand: confidenceResult.band,
      risk: riskResult.level,
      riskDetails: riskResult,
      reason,
      recommendedExecutor: recommendedExecutorOf({
        intentType: context.intent?.type ?? null,
        cognitivePlan: safe.cognitivePlan ?? null,
        decisionType,
      }),
      recommendedQuestion: recommendedQuestionOf(context.missingFields, decisionType),
      requiredInformation: context.missingFields,
      dependencies: context.dependencies,
      diagnostics: context.diagnostics,
      recommendations: recommendationDetails.map((entry) => entry.suggestion),
      recommendationDetails,
      missingInformation: context.missingFields,
      requiredSources: requiredSourcesOf({ decisionType, context }),
      contextEvaluation: {
        sufficiency: context.sufficiency,
        consistency: context.consistency,
        missingFields: context.missingFields,
        conflicts: context.conflicts,
        pending: context.pending,
        intent: context.intent,
        evidence: context.evidence,
      },
      shadow: createDecisionShadow({ shadowMode: Boolean(flags.decisionShadowMode ?? true) }),
      latency: {
        totalMs: 0,
        ...sectionTimings,
      },
      latencyMs: 0,
      telemetry: null,
    };

    result.latency.totalMs = Number((nowMillis() - start).toFixed(3));
    result.latencyMs = result.latency.totalMs;

    // Validação contratual defensiva (determinística — nunca deve falhar).
    const validation = validateDecisionResult(result);
    if (!validation.valid) {
      errorCode = `DECISION_VALIDATION_${validation.errors[0] ?? 'FAILED'}`;
      result.fallbackUsed = true;
      result.fallbackReason = 'DECISION_CONTRACT_INVALID';
      result.errorCode = errorCode;
      result.diagnostics = [...result.diagnostics, 'UNKNOWN'];
      // Sanitiza campos corrompidos pelo input para garantir um fallback
      // SEMPRE válido e serializável (nunca funções, objetos ou tipos errados).
      result.decisionType = isValidDecisionType(result.decisionType) ? result.decisionType : 'UNKNOWN';
      result.confidence = typeof result.confidence === 'number' && Number.isFinite(result.confidence)
        ? Math.min(1, Math.max(0, result.confidence))
        : 0;
      result.risk = isValidDecisionRisk(result.risk) ? result.risk : 'NONE';
      result.reason = Array.isArray(result.reason) ? result.reason.filter((line) => typeof line === 'string') : [];
      result.recommendedExecutor = typeof result.recommendedExecutor === 'string' ? result.recommendedExecutor : null;
      result.recommendedQuestion = typeof result.recommendedQuestion === 'string' ? result.recommendedQuestion : null;
      result.requiredInformation = Array.isArray(result.requiredInformation) ? result.requiredInformation.map(String) : [];
    }

    const t4 = nowMillis();

    // Telemetria redigida — somente agregados (nunca texto, valores ou IDs).
    if (flags.decisionTelemetryEnabled) {
      const telemetry = buildDecisionTelemetry({
        correlationId,
        engineVersion: safe.engineVersion ?? null,
        enabled: Boolean(flags.decisionEnabled),
        shadowMode: Boolean(flags.decisionShadowMode),
        flagDecisionEnabled: Boolean(flags.decisionEnabled),
        flagDecisionShadow: Boolean(flags.decisionShadowMode),
        flagDecisionTelemetry: Boolean(flags.decisionTelemetryEnabled),
        layer: result,
        latencyMs: result.latency.totalMs,
        errorCode,
      });
      result.telemetry = emitDecisionTelemetry(telemetry, safe.telemetryAdapter ?? null);
      sectionTimings.telemetryMs = Number((nowMillis() - t4).toFixed(3));
      result.latency = {
        ...result.latency,
        ...sectionTimings,
        totalMs: Number((nowMillis() - start).toFixed(3)),
      };
    }

    if (errorCode) result.errorCode = errorCode;
    return result;
  } catch (error) {
    const latencyMs = Number((nowMillis() - start).toFixed(3));
    return {
      version: DECISION_LAYER_VERSION,
      correlationId,
      enabled: true,
      shadowMode: Boolean(flags.decisionShadowMode ?? true),
      fallbackUsed: true,
      fallbackReason: 'DECISION_LAYER_ERROR',
      errorCode: error?.code ?? 'DECISION_LAYER_ERROR',
      decisionType: 'UNKNOWN',
      decision: {
        type: 'UNKNOWN',
        confidence: 0,
        confidenceBand: 'very_low',
        risk: 'NONE',
      },
      confidence: 0,
      confidenceBand: 'very_low',
      risk: 'NONE',
      riskDetails: { level: 'NONE', risks: [], reasons: [] },
      reason: ['Decisão = UNKNOWN', 'Erro interno = erro na camada de decisão'],
      recommendedExecutor: null,
      recommendedQuestion: null,
      requiredInformation: [],
      dependencies: createDecisionDependencies(),
      diagnostics: ['UNKNOWN'],
      recommendations: [],
      missingInformation: [],
      requiredSources: [],
      contextEvaluation: context ?? null,
      shadow: createDecisionShadow({ shadowMode: Boolean(flags.decisionShadowMode ?? true) }),
      latency: { totalMs: latencyMs, ...sectionTimings },
      latencyMs,
      telemetry: null,
    };
  }
}
