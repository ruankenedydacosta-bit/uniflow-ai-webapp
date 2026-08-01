export const PLANNING_POLICY = Object.freeze({
  limits: Object.freeze({
    maxGoals: 4,
    maxSteps: 10,
    maxDependencies: 12,
    maxDiagnostics: 16,
    maxRecommendations: 10,
    maxMilestones: 6,
  }),
  confidence: Object.freeze({
    base: 0.2,
    intentBonus: 0.2,
    typeBonus: 0.1,
    amountBonus: 0.15,
    timelineBonus: 0.1,
    snapshotBonus: 0.1,
    memoryBonus: 0.05,
    decisionBonus: 0.05,
    missingPenalty: 0.08,
    conflictPenalty: 0.2,
    multiplePenalty: 0.08,
  }),
  complexity: Object.freeze({
    mediumScore: 3,
    highScore: 6,
    veryHighScore: 9,
  }),
  riskOrder: Object.freeze(['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  defaultHorizonMonths: Object.freeze({
    SAVINGS: 12,
    DEBT: 12,
    INVESTMENT: 24,
    BUDGET: 1,
    BUSINESS: 12,
    FINANCIAL: 12,
    GENERAL: 6,
    UNKNOWN: null,
  }),
});

export function clampPlanningConfidence(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export function highestPlanningRisk(...risks) {
  return risks.reduce((highest, risk) => (
    PLANNING_POLICY.riskOrder.indexOf(risk) > PLANNING_POLICY.riskOrder.indexOf(highest)
      ? risk
      : highest
  ), 'NONE');
}
