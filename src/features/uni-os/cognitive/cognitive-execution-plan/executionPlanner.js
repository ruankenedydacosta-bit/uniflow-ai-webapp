import { aggregateExecutionPlans } from './executionAggregator.js';
import {
  resolveCommunicationObjective,
  resolveEffectiveCapabilities,
  resolveEffectiveConfidence,
  resolveEffectiveReasoningDepth,
  resolveEffectiveRisk,
  resolveEffectiveStrategy,
  resolveFollowUpStrategy,
} from './executionPolicies.js';

export function buildCognitiveExecutionDraft(input = {}, options = {}) {
  const aggregated = aggregateExecutionPlans(input);
  const reasoningPlan = aggregated.reasoningPlan ?? {};
  const decisionPlan = aggregated.decisionPlan ?? {};
  const confidencePlan = aggregated.confidencePlan ?? {};
  const effectiveRisk = resolveEffectiveRisk(
    reasoningPlan, decisionPlan, aggregated.conflicts,
  );
  const effectiveStrategy = resolveEffectiveStrategy({
    missingPlans: aggregated.missingPlans,
    conflicts: aggregated.conflicts,
    effectiveRisk,
    decisionPlan,
    confidencePlan,
  });

  return {
    reasoningPlan,
    decisionPlan,
    confidencePlan,
    effectiveStrategy,
    effectiveCapabilities: resolveEffectiveCapabilities(reasoningPlan, decisionPlan),
    effectiveRisk,
    effectiveConfidence: resolveEffectiveConfidence(reasoningPlan, decisionPlan, confidencePlan),
    effectiveReasoningDepth: resolveEffectiveReasoningDepth(
      reasoningPlan.reasoningDepth, effectiveRisk,
    ),
    communicationObjective: resolveCommunicationObjective({ effectiveStrategy, decisionPlan }),
    followUpStrategy: resolveFollowUpStrategy({ effectiveStrategy, confidencePlan }),
    generatedAt: options.now,
    metadata: {
      missingPlans: aggregated.missingPlans,
      conflicts: aggregated.conflicts,
      sourceVersions: {
        reasoning: reasoningPlan.plannerVersion ?? null,
        decision: decisionPlan.engineVersion ?? null,
        confidence: confidencePlan.confidenceVersion ?? null,
      },
    },
  };
}
