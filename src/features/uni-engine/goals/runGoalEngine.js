// Goal Engine — orquestração (Fase 7, Shadow-only).
//
// Identifica, estrutura, avalia e acompanha objetivos financeiros em Shadow
// Mode. Garantias:
//   - nunca executa, persiste ou altera respostas (appliedToDecision = false,
//     appliedToResponse = false, executed = false);
//   - consome as Fases 1–6 SOMENTE em leitura;
//   - falha segura: qualquer erro interno retorna resultado vazio válido;
//   - nunca inventa renda, despesa, saldo, prazo ou valor-alvo;
//   - ausência de informação nunca vira zero.
import {
  createEmptyGoalEngineResult,
  createGoalDefinition,
  createGoalEngineResult,
  validateGoalEngineResult,
} from './goalContracts.js';
import { GOAL_POLICY } from './goalPolicy.js';
import { detectGoalIntent } from './detectGoalIntent.js';
import { extractGoalCandidate } from './extractGoalCandidate.js';
import { normalizeGoal } from './normalizeGoal.js';
import { classifyGoalType } from './classifyGoalType.js';
import { extractGoalTarget } from './extractGoalTarget.js';
import { estimateGoalHorizon } from './estimateGoalHorizon.js';
import { evaluateGoalCompleteness } from './evaluateGoalCompleteness.js';
import { evaluateGoalDependencies } from './evaluateGoalDependencies.js';
import { evaluateGoalFeasibility } from './evaluateGoalFeasibility.js';
import { estimateGoalProgress } from './estimateGoalProgress.js';
import { computeGoalConfidence } from './computeGoalConfidence.js';
import { computeGoalPriority } from './computeGoalPriority.js';
import { detectGoalConflict } from './detectGoalConflict.js';
import { detectGoalRisk } from './detectGoalRisk.js';
import { buildGoalDiagnostics } from './buildGoalDiagnostics.js';
import { buildGoalSuggestions } from './buildGoalSuggestions.js';
import { buildGoalTelemetry, emitGoalTelemetry } from './telemetry/goalTelemetry.js';

function nowMillis() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function emptyState() {
  return {
    completeness: { isComplete: false, score: 0, available: [], missing: [], missingCount: 0 },
    dependencyEvaluation: { dependencies: [], allSatisfied: false, satisfiedCount: 0, totalCount: 0 },
    conflicts: [],
    risks: [],
    feasibility: 'UNKNOWN',
    confidence: 0,
    priority: 'UNDETERMINED',
    progress: null,
    status: 'UNKNOWN',
  };
}

// Status do objetivo (determinístico, sempre com evidência):
//  - BLOCKED: inviável no momento ou com conflitos ativos;
//  - AT_RISK: risco de meta irrealista (evidência de desembolso único);
//  - ACHIEVED_INFERRED: somente com progresso 100% estimado por evidência;
//  - DRAFT: objetivo detectado com pouquíssima informação;
//  - NEEDS_INFORMATION: completo o suficiente, mas com lacunas;
//  - ACTIVE_SHADOW: pronto e confiável (sombreamento ativo);
//  - READY: pronto, confiança abaixo do limiar de ativação.
export function goalStatus({
  detected,
  ambiguous,
  completeness,
  conflicts,
  risks,
  feasibility,
  progress,
  confidence,
}) {
  if (!detected) return 'UNKNOWN';
  if (feasibility === 'CURRENTLY_INFEASIBLE') return 'BLOCKED';
  if (conflicts.length > 0) return 'BLOCKED';
  if (risks.some((risk) => risk?.type === 'UNREALISTIC_TARGET')) return 'AT_RISK';
  if (progress === 100) return 'ACHIEVED_INFERRED';
  if (!completeness?.isComplete) return 'DRAFT';
  if (ambiguous) return 'NEEDS_INFORMATION';
  if ((completeness?.missing?.length ?? 0) > 0) return 'NEEDS_INFORMATION';
  if (confidence >= GOAL_POLICY.minConfidenceForActive) return 'ACTIVE_SHADOW';
  return 'READY';
}

export function runGoalEngine(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const start = nowMillis();
  const featureFlags = safe.featureFlags && typeof safe.featureFlags === 'object' ? safe.featureFlags : {};
  const workspaceType = String(
    safe.userPreferences?.workspaceType
      ?? safe.session?.workspaceType
      ?? 'personal',
  );
  const referenceDate = safe.financialSnapshot?.referenceDate ?? null;
  const enabled = Boolean(featureFlags.goalsEnabled);
  const shadowMode = Boolean(featureFlags.goalsShadowMode);
  const telemetryEnabled = Boolean(featureFlags.goalsTelemetryEnabled);

  if (!enabled || !shadowMode) {
    const empty = createEmptyGoalEngineResult({ shadowMode: shadowMode || true });
    empty.latencyMs = Number((nowMillis() - start).toFixed(3));
    return empty;
  }

  const emptyFallback = () => {
    const result = createEmptyGoalEngineResult({ shadowMode: shadowMode || true });
    result.latencyMs = Number((nowMillis() - start).toFixed(3));
    return result;
  };

  try {
    const goalIntent = detectGoalIntent(safe);
    const candidate = extractGoalCandidate({
      goalIntent,
      normalizedMessage: safe.normalizedMessage,
    });
    const normalized = normalizeGoal({ candidate, workspaceType });
    const type = classifyGoalType({
      goalIntent,
      candidate,
      normalizedMessage: safe.normalizedMessage,
      workspaceType,
    });
    const target = extractGoalTarget({
      normalizedMessage: safe.normalizedMessage,
      referenceDate,
    });
    const horizon = estimateGoalHorizon({ goalIntent, target, referenceDate });

    const state = goalIntent.detected
      ? evaluateDetectedGoal({
          safe: { ...safe, goalType: type },
          goalIntent,
          target,
          horizon,
          workspaceType,
        })
      : emptyState();

    const { completeness, dependencyEvaluation, conflicts, risks } = state;
    const { feasibility, confidence, priority, progress, status } = state;

    const goal = createGoalDefinition({
      raw: candidate.rawText,
      normalized: normalized?.text ?? candidate.normalizedText,
      type,
      status,
      horizon,
      priority,
      confidence,
      feasibility,
      progress,
      target,
      currentState: { description: null },
      missingInformation: completeness.missing,
      dependencies: dependencyEvaluation.dependencies,
      conflicts,
      risks,
    });

    const { suggestions, recommendedNextStep } = buildGoalSuggestions({
      goalIntent,
      type,
      completeness,
      conflicts,
      risks,
      workspaceType,
    });

    const { diagnostics, evidenceSummary, sourceSummary } = buildGoalDiagnostics({
      goalIntent,
      type,
      completeness,
      conflicts,
      risks,
      dependencyEvaluation,
      progress,
      recommendedNextStep,
      workspaceType,
      status,
    });

    const result = createGoalEngineResult({
      enabled,
      shadowMode,
      goalDetected: Boolean(goalIntent.detected),
      goal,
      type,
      status,
      horizon,
      priority,
      confidence,
      feasibility,
      progress,
      target,
      currentState: { description: null },
      missingInformation: completeness.missing,
      dependencies: dependencyEvaluation.dependencies,
      conflicts,
      risks,
      diagnostics,
      suggestions,
      recommendedNextStep,
      evidenceSummary,
      sourceSummary,
      shadow: { shadowMode },
    });

    const validation = validateGoalEngineResult(result);
    if (!validation.valid) return emptyFallback();

    result.latencyMs = Number((nowMillis() - start).toFixed(3));

    if (telemetryEnabled) {
      result.telemetry = emitGoalTelemetry(buildGoalTelemetry({
        correlationId: safe.correlationId,
        engineVersion: safe.engineVersion,
        enabled,
        shadowMode,
        flagGoalsEnabled: enabled,
        flagGoalsShadow: shadowMode,
        flagGoalsTelemetry: telemetryEnabled,
        result,
      }), safe.telemetryAdapter);
    }

    return result;
  } catch {
    return emptyFallback();
  }
}

function evaluateDetectedGoal({ safe, goalIntent, target, horizon, workspaceType }) {
  const goal = createGoalDefinition({ type: safe.goalType ?? goalIntent.dominantType ?? 'UNKNOWN', target });

  const completeness = evaluateGoalCompleteness({
    goal,
    target,
    financialSnapshot: safe.financialSnapshot,
    persistentMemory: safe.persistentMemory,
    operationalMemory: safe.operationalMemory,
    cognitiveContext: safe.cognitiveContext,
    workspaceType,
  });

  const dependencyEvaluation = evaluateGoalDependencies({
    goal,
    completeness,
    financialSnapshot: safe.financialSnapshot,
    workspaceType,
  });

  const conflicts = detectGoalConflict({ goalIntent, completeness, workspaceType });

  const preliminaryFeasibility = evaluateGoalFeasibility({
    completeness,
    risks: [],
    depAllSatisfied: dependencyEvaluation.allSatisfied,
  });

  const risks = detectGoalRisk({
    goalIntent,
    completeness,
    feasibility: preliminaryFeasibility,
    financialSnapshot: safe.financialSnapshot,
    goal,
    conflicts,
  });

  const feasibility = evaluateGoalFeasibility({
    completeness,
    risks,
    depAllSatisfied: dependencyEvaluation.allSatisfied,
  });

  const confidence = computeGoalConfidence({
    goalIntent,
    completeness,
    workspaceType,
    conflictsCount: conflicts.length,
    type: safe.goalType,
  });

  const priority = computeGoalPriority({
    goalIntent,
    completeness,
    risks,
    conflictsCount: conflicts.length,
    depAllSatisfied: dependencyEvaluation.allSatisfied,
    workspaceType,
    goal: { ...goal, horizon },
    type: safe.goalType,
  });

  const progress = estimateGoalProgress({
    goal,
    financialSnapshot: safe.financialSnapshot,
    completeness,
    goalIntent,
  });

  const status = goalStatus({
    detected: true,
    ambiguous: Boolean(goalIntent.ambiguous),
    completeness,
    conflicts,
    risks,
    feasibility,
    progress,
    confidence,
    dependencyEvaluation,
  });

  return {
    completeness,
    dependencyEvaluation,
    conflicts,
    risks,
    feasibility,
    confidence,
    priority,
    progress,
    status,
  };
}
