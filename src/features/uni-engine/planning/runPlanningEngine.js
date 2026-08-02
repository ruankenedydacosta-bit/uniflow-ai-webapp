import { buildPlanningDiagnostics } from './buildPlanningDiagnostics.js';
import { buildPlanningSteps } from './buildPlanningSteps.js';
import { buildPlanningSuggestions } from './buildPlanningSuggestions.js';
import { buildPlanningTimeline } from './buildPlanningTimeline.js';
import { computePlanningConfidence } from './computePlanningConfidence.js';
import { detectPlanningIntent } from './detectPlanningIntent.js';
import { detectPlanningRisk } from './detectPlanningRisk.js';
import { estimatePlanningComplexity } from './estimatePlanningComplexity.js';
import { evaluatePlanningDependencies } from './evaluatePlanningDependencies.js';
import { extractPlanningGoal } from './extractPlanningGoal.js';
import {
  createEmptyPlanningResult,
  createPlanningResult,
  validatePlanningResult,
} from './planningContracts.js';
import { buildPlanningTelemetry, emitPlanningTelemetry } from './planningTelemetry.js';

function nowMillis() {
  return typeof performance?.now === 'function' ? performance.now() : Date.now();
}

function planningStatus({ detected, missing, risk, pendingAction }) {
  if (!detected) return 'UNKNOWN';
  if (risk === 'CRITICAL' || missing.some((entry) => entry.type === 'CONFLICT_RESOLUTION')) return 'BLOCKED';
  if (pendingAction?.status === 'executing') return 'WAITING';
  if (missing.length > 0) return 'PARTIAL';
  return 'READY';
}

export function runPlanningEngine(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const start = nowMillis();
  try {
    const planningIntent = detectPlanningIntent(safe);
    const goal = extractPlanningGoal({ ...safe, planningIntent });
    const dependencyEvaluation = evaluatePlanningDependencies({ ...safe, goal });
    const complexityResult = estimatePlanningComplexity({
      goal,
      dependencies: dependencyEvaluation.dependencies,
      hasConflicts: (safe.epistemicModel?.conflicts?.length ?? 0) > 0,
    });
    const confidenceResult = computePlanningConfidence({ ...safe, goal, dependencyEvaluation });
    const provisionalRisk = detectPlanningRisk({
      ...safe,
      goal,
      dependencyEvaluation,
      complexity: complexityResult.complexity,
      safetyBlocked: Boolean(safe.classification?.safetyBlocked),
    });
    const status = planningStatus({
      detected: planningIntent.detected,
      missing: dependencyEvaluation.missing,
      risk: provisionalRisk.level,
      pendingAction: safe.pendingAction,
    });
    const timeline = buildPlanningTimeline({ goal, timestamp: safe.timestamp });
    const suggestedSteps = buildPlanningSteps({ goal, dependencies: dependencyEvaluation.dependencies });
    const diagnostics = buildPlanningDiagnostics({
      ...safe,
      goal,
      dependencyEvaluation,
      status,
    });
    const recommendations = buildPlanningSuggestions({ goal, dependencyEvaluation, status });
    const result = createPlanningResult({
      enabled: Boolean(safe.featureFlags?.planningEnabled),
      shadowMode: Boolean(safe.featureFlags?.planningShadowMode ?? true),
      fallbackUsed: false,
      fallbackReason: null,
      errorCode: null,
      goal,
      goalType: goal.type,
      status,
      complexity: complexityResult.complexity,
      confidence: confidenceResult.confidence,
      risk: provisionalRisk.level,
      riskDetails: provisionalRisk,
      dependencies: dependencyEvaluation.dependencies,
      timeline,
      suggestedSteps,
      diagnostics,
      recommendations,
      shadow: { shadowMode: safe.featureFlags?.planningShadowMode ?? true },
      latency: { totalMs: Number((nowMillis() - start).toFixed(3)) },
    });
    const validation = validatePlanningResult(result);
    if (!validation.valid) {
      return createEmptyPlanningResult({
        shadowMode: safe.featureFlags?.planningShadowMode ?? true,
        fallbackUsed: true,
        fallbackReason: 'PLANNING_VALIDATION_FAILED',
        errorCode: validation.errors[0] ?? 'PLANNING_VALIDATION_FAILED',
      });
    }
    if (safe.featureFlags?.planningTelemetryEnabled) {
      result.telemetry = emitPlanningTelemetry(buildPlanningTelemetry({
        correlationId: safe.correlationId,
        engineVersion: safe.engineVersion,
        enabled: safe.featureFlags?.planningEnabled,
        shadowMode: safe.featureFlags?.planningShadowMode,
        flagPlanningEnabled: safe.featureFlags?.planningEnabled,
        flagPlanningShadow: safe.featureFlags?.planningShadowMode,
        flagPlanningTelemetry: safe.featureFlags?.planningTelemetryEnabled,
        planning: result,
      }), safe.telemetryAdapter);
    }
    return result;
  } catch {
    const result = createEmptyPlanningResult({
      shadowMode: safe.featureFlags?.planningShadowMode ?? true,
      fallbackUsed: true,
      fallbackReason: 'PLANNING_INTERNAL_ERROR',
      errorCode: 'PLANNING_INTERNAL_ERROR',
    });
    result.latency.totalMs = Number((nowMillis() - start).toFixed(3));
    return result;
  }
}

export { planningStatus };
