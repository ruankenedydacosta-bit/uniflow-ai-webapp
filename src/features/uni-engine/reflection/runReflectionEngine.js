// Reflection & Learning Engine — orquestração (Fase 8, Shadow-only).
//
// Revisa uma interação concluída ou parcialmente concluída, comparando o que
// o pipeline entendeu com o que aconteceu depois. Produz sinais, revisões
// das Fases 1–7, candidatos de aprendizado (somente quando habilitado),
// conflitos, riscos, diagnósticos e telemetria redigida.
//
// Garantias absolutas:
//   - nunca aplica candidato (`shadow.applied/persisted/changedBehavior`);
//   - nunca altera resposta, execução, voz, memória, UI ou banco;
//   - falha interna retorna resultado vazio VÁLIDO (fallback seguro);
//   - síncrono, puro, determinístico e serializável.
import { REFLECTION_POLICY } from './reflectionPolicy.js';
import {
  createEmptyReflectionResult,
  createReflectionResult,
  validateReflectionResult,
} from './reflectionContracts.js';
import { classifyInteractionOutcome } from './classifyInteractionOutcome.js';
import { detectUserCorrection } from './detectUserCorrection.js';
import { detectReflectionSignals } from './detectReflectionSignals.js';
import { reviewEpistemicState } from './reviewEpistemicState.js';
import { reviewDecisionLayer } from './reviewDecisionLayer.js';
import { reviewPlanningResult } from './reviewPlanningResult.js';
import { reviewGoalResult } from './reviewGoalResult.js';
import { reviewMemoryUsage } from './reviewMemoryUsage.js';
import { generateLearningCandidates } from './generateLearningCandidates.js';
import { deduplicateLearningCandidates } from './deduplicateLearningCandidates.js';
import { detectLearningConflict } from './detectLearningConflict.js';
import { evaluateLearningCandidate } from './evaluateLearningCandidate.js';
import { buildReflectionSummary } from './buildReflectionSummary.js';
import { buildReflectionDiagnostics } from './buildReflectionDiagnostics.js';
import {
  buildLearningSuggestions,
  recommendNextStep,
} from './buildLearningSuggestions.js';
import {
  buildReflectionTelemetry,
  emitReflectionTelemetry,
} from './telemetry/reflectionTelemetry.js';
import { describeConfidence } from './reflectionPolicy.js';

function nowMillis() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function countRepetitions(messageText, history) {
  if (typeof messageText !== 'string' || !messageText.trim()) return 0;
  const messages = Array.isArray(history) ? history : [];
  const limit = REFLECTION_POLICY.maxHistoryForRepetition;
  const window = messages.slice(-limit);
  const normalized = messageText.trim().toLowerCase();
  let count = 0;
  for (const entry of window) {
    const entryText = entry?.text ?? null;
    if (typeof entryText === 'string' && entryText.trim().toLowerCase() === normalized) {
      count += 1;
    }
  }
  return count;
}

function buildEmptyResult({ shadowMode, errorCode, latencyMs }) {
  const result = createEmptyReflectionResult({ shadowMode });
  return {
    ...result,
    fallbackUsed: errorCode !== null,
    fallbackReason: errorCode !== null ? 'REFLECTION_INTERNAL_ERROR' : null,
    errorCode,
    diagnostics: errorCode ? ['SHADOW_ONLY', 'FALLBACK_USED'] : result.diagnostics,
    latencyMs,
    telemetry: {
      enabled: true,
      shadowMode,
      triggered: false,
      outcome: 'UNKNOWN',
      signalCount: 0,
      signalTypes: [],
      reviewCount: 0,
      candidateCount: 0,
      candidateTypes: [],
      confidenceBand: null,
      priorityBand: null,
      riskBand: null,
      conflictCount: 0,
      fallback: true,
      errorCode: errorCode ?? null,
      latencyMs: typeof latencyMs === 'number' ? Number(latencyMs.toFixed(2)) : null,
    },
  };
}

export function runReflectionEngine(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const start = nowMillis();

  try {
    // ---- Feature flags (leitura dentro do guard para nunca escapar) --------
    const featureFlags = safe.featureFlags ?? {};
    const shadowMode = Boolean(featureFlags.reflectionShadowMode);
    const candidatesEnabled = Boolean(featureFlags.learningCandidatesEnabled);
    const telemetryEnabled = Boolean(featureFlags.reflectionTelemetryEnabled);
    // ---- Detecção de correção e repetição --------------------------------
    const messageText = typeof safe.messageText === 'string' ? safe.messageText : '';
    const userCorrection = detectUserCorrection(messageText);
    const repetitionCount = countRepetitions(messageText, safe.history);

    // ---- Classificação do resultado --------------------------------------
    const pipeline = safe.pipeline ?? {};
    const outcome = classifyInteractionOutcome({
      systemError: Boolean(safe.systemError),
      providerError: Boolean(safe.providerError),
      providerUnavailable: Boolean(safe.providerUnavailable),
      timeout: Boolean(safe.timeout),
      userCancelled: Boolean(userCorrection.isCancellation),
      userCorrected: Boolean(userCorrection.isCorrection),
      userRejected: Boolean(userCorrection.isSimpleNegation),
      responseEmitted: Boolean(pipeline.responseEmitted ?? safe.responseEmitted),
      actionConfirmed: Boolean(pipeline.actionConfirmed ?? safe.actionConfirmed),
      actionExecuted: Boolean(pipeline.actionExecuted ?? safe.actionExecuted),
      actionCancelled: Boolean(pipeline.actionCancelled ?? safe.actionCancelled),
      successExplicit: Boolean(pipeline.successExplicit ?? safe.successExplicit),
      pendingAdvanced: Boolean(pipeline.pendingAdvanced ?? safe.pendingAdvanced),
      pendingStillActive: Boolean(pipeline.pendingStillActive ?? safe.pendingStillActive),
      ambiguous: Boolean(pipeline.ambiguous ?? safe.ambiguous),
      userRepeated: repetitionCount >= REFLECTION_POLICY.repetitionThreshold,
      topicChanged: Boolean(pipeline.topicChanged ?? safe.topicChanged),
    });

    // ---- Sinais de reflexão -----------------------------------------------
    const signals = detectReflectionSignals({
      classification: safe.classification ?? null,
      comparison: safe.comparison ?? null,
      divergenceDiagnostics: safe.divergenceDiagnostics ?? null,
      epistemicModel: safe.epistemicModel ?? null,
      decisionLayer: safe.decisionLayer ?? null,
      planning: safe.planning ?? null,
      goals: safe.goals ?? null,
      persistentMemory: safe.persistentMemory ?? null,
      operationalMemory: safe.operationalMemory ?? null,
      userCorrection,
      outcome,
      repetitionCount,
      providerFailed: Boolean(safe.providerError),
      voiceFailed: Boolean(safe.voiceFailed),
    });

    // ---- Revisões das Fases 1–7 -------------------------------------------
    const reviews = [
      reviewEpistemicState({
        epistemicModel: safe.epistemicModel ?? null,
        epistemicState: safe.epistemicState ?? null,
      }),
      reviewDecisionLayer({
        decisionLayer: safe.decisionLayer ?? null,
        comparison: safe.comparison ?? null,
        userCorrection,
      }),
      reviewPlanningResult({
        planning: safe.planning ?? null,
      }),
      reviewGoalResult({
        goals: safe.goals ?? null,
      }),
      reviewMemoryUsage({
        persistentMemory: safe.persistentMemory ?? null,
        userCorrection,
      }),
    ].slice(0, REFLECTION_POLICY.maxReviews);

    // ---- Candidatos de aprendizado ----------------------------------------
    let candidates = [];
    let conflicts = [];
    let blockedReasons = [];
    if (candidatesEnabled) {
      const generated = generateLearningCandidates({
        messageText,
        signals,
        outcome,
        userCorrection,
        repetitionCount,
        providerFailed: Boolean(safe.providerError),
        now: safe.now ?? Date.now(),
      });
      candidates = generated.candidates ?? [];
      blockedReasons = generated.blockedReasons ?? [];

      // Deduplicação + avaliação + conflitos.
      const deduplicated = deduplicateLearningCandidates({
        candidates,
        windowMs: REFLECTION_POLICY.expiration.DEFAULT_MS,
      });
      candidates = deduplicated.deduplicated
        .map((candidate) => evaluateLearningCandidate({
          candidate,
          now: safe.now ?? Date.now(),
          existingCandidates: candidates,
        }))
        .filter(Boolean)
        .slice(0, REFLECTION_POLICY.maxCandidates);
      conflicts = detectLearningConflict({ candidates });
    }

    // ---- Sumários, diagnósticos e sugestões --------------------------------
    const summary = buildReflectionSummary({ signals, reviews, candidates });
    const diagnostics = buildReflectionDiagnostics({
      reflectionTriggered: true,
      outcomeClassified: true,
      correctionDetected: userCorrection.isCorrection ? true : false,
      signalsLimited: signals.length >= REFLECTION_POLICY.maxSignals,
      candidatesLimited: candidates.length >= REFLECTION_POLICY.maxCandidates,
      providerFailureIgnored: Boolean(safe.providerError),
      sensitiveBlocked: blockedReasons.includes('SENSITIVE_CONTENT_BLOCKED'),
      successfulPattern: signals.some((signal) => signal?.type === 'SUCCESSFUL_PATTERN'),
    });
    const suggestions = buildLearningSuggestions({ candidates, conflicts, outcome });
    const recommendedNextStep = recommendNextStep({ candidates, conflicts, outcome });

    const latencyMs = nowMillis() - start;

    // ---- Telemetria redigida ------------------------------------------------
    let telemetry = null;
    if (telemetryEnabled) {
      telemetry = buildReflectionTelemetry({
        correlationId: safe.correlationId ?? null,
        engineVersion: safe.engineVersion ?? null,
        enabled: true,
        shadowMode,
        reflectionTriggered: true,
        outcome,
        signals,
        reviews,
        candidates,
        conflicts,
        confidenceBand: describeConfidence(summary.confidenceSummary.average),
        priorityBand: Object.entries(summary.prioritySummary)
          .filter(([, count]) => count > 0)
          .map(([priority]) => priority)
          .join(',') || null,
        riskBand: candidates.reduce((max, candidate) => {
          const rank = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 };
          return rank[candidate?.risk] > rank[max] ? candidate.risk : max;
        }, 'NONE'),
        fallback: false,
        errorCode: null,
        latencyMs,
      });
      emitReflectionTelemetry(telemetry, safe.telemetryAdapter ?? null);
    }

    return createReflectionResult({
      enabled: true,
      shadowMode,
      fallbackUsed: false,
      fallbackReason: null,
      errorCode: null,
      reflectionTriggered: true,
      outcome,
      signals,
      reviews,
      learningCandidates: candidates,
      conflicts,
      risks: candidates.flatMap((candidate) => candidate?.restrictions ?? []),
      diagnostics,
      suggestions,
      recommendedNextStep,
      evidenceSummary: summary.evidenceSummary,
      confidenceSummary: summary.confidenceSummary,
      prioritySummary: summary.prioritySummary,
      shadow: { shadowMode },
      latencyMs,
      telemetry,
    });
  } catch (error) {
    const latencyMs = nowMillis() - start;
    let shadowMode = true;
    try {
      shadowMode = Boolean(safe?.featureFlags?.reflectionShadowMode);
    } catch {
      // Flags ilegíveis: mantém o modo shadow (garantia mais segura).
    }
    const result = buildEmptyResult({
      shadowMode,
      errorCode: error?.code ?? 'REFLECTION_INTERNAL_ERROR',
      latencyMs,
    });
    if (safe.isDev && typeof console?.warn === 'function') {
      console.warn(`[uni-engine] reflection error: ${error?.code ?? 'REFLECTION_INTERNAL_ERROR'}`);
    }
    return result;
  }
}

export function validateReflectionEngineOutput(result) {
  const validation = validateReflectionResult(result);
  return {
    valid: validation.valid,
    errors: validation.errors,
  };
}
