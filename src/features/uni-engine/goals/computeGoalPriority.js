import { GOAL_POLICY } from './goalPolicy.js';

export function computeGoalPriority(input = {}) {
  const safe = input && typeof input === 'object' ? input : {};
  const goalIntent = safe.goalIntent ?? {};
  const completeness = safe.completeness ?? {};
  const risks = safe.risks ?? [];
  const goal = safe.goal ?? {};
  const workspaceType = String(safe.workspaceType ?? 'personal');

  if (!goalIntent.detected) return 'UNDETERMINED';

  let score = 0;
  const weights = GOAL_POLICY.priorityWeights;

  if (goalIntent.explicit) score += weights.explicitUserStatement;
  if (completeness?.available?.includes('target_amount')) score += weights.hasTargetAmount;
  if (completeness?.available?.includes('target_date')) score += weights.hasTargetDate;
  if (completeness?.available?.includes('horizon')) score += weights.hasHorizon;
  if (completeness?.available?.includes('financial_snapshot')) score += weights.hasFinancialSnapshot;
  if (completeness?.available?.includes('memory')) score += weights.hasMemory;
  if (safe.depAllSatisfied === false) score += weights.hasDependencies;
  if (safe.conflictsCount > 0) score += weights.hasConflicts;
  if (risks.filter((r) => r?.type && r.type !== 'NONE').length > 1) score += weights.hasHighRisks;

  const horizon = goal.horizon ?? null;
  if (horizon === 'IMMEDIATE' || horizon === 'SHORT_TERM') score += weights.shortTermHorizon;
  else if (horizon === 'MEDIUM_TERM') score += weights.mediumTermHorizon;

  if (workspaceType === 'personal') score += weights.personalWorkspace;

  // Tipo desconhecido: a prioridade nunca sobe acima de HIGH — sem saber o
  // que o usuário quer, urgência não pode ser presumida.
  if (safe.type === 'UNKNOWN' || safe.type == null) score = Math.min(score, 34);

  if (score >= 40) return 'CRITICAL';
  if (score >= 30) return 'HIGH';
  if (score >= 20) return 'MEDIUM';
  if (score >= 1) return 'LOW';
  return 'UNDETERMINED';
}