import { GOAL_POLICY, clamp01 } from './goalPolicy.js';

export function computeGoalConfidence(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const goalIntent = safe.goalIntent ?? {};
  const completeness = safe.completeness ?? {};
  const workspaceType = String(safe.workspaceType ?? 'personal');

  if (!goalIntent.detected) return 0;

  let confidence = 0;
  const defaults = GOAL_POLICY.confidenceDefaults;

  if (goalIntent.explicit) confidence += defaults.explicitGoal;
  else if (goalIntent.implicit) confidence += defaults.implicitGoal;
  if (goalIntent.ambiguous) confidence += defaults.ambiguousGoal;

  const available = completeness?.available ?? [];
  if (available.includes('target_amount')) confidence += defaults.withTargetAmount;
  if (available.includes('target_date')) confidence += defaults.withTargetDate;
  if (available.includes('financial_snapshot')) confidence += defaults.withSnapshot;
  if (available.includes('memory')) confidence += defaults.withMemory;

  const missing = completeness?.missing ?? [];
  if (missing.includes('target_amount')) confidence += defaults.missingAmount;
  if (missing.includes('target_date')) confidence += defaults.missingDate;

  if (goalIntent.matchedTypeCount > GOAL_POLICY.maxAmbiguousMatchesForDetection) confidence += defaults.multipleGoals;
  if (safe.conflictsCount > 0) confidence += defaults.conflictingGoals;
  if (workspaceType === 'business') confidence += defaults.businessWorkspace;
  if (safe.type === 'UNKNOWN' || safe.type == null) confidence += defaults.unknownType;

  return clamp01(confidence);
}