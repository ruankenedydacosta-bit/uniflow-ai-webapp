// API pública do Reflection & Learning Engine (Fase 8 — Shadow-only).
//
// A reflexão apenas observa, revisa e gera candidatos em Shadow Mode —
// nada aqui aplica, persiste ou altera comportamento.
export * from './reflectionTypes.js';
export * from './reflectionContracts.js';
export * from './reflectionPolicy.js';
export * from './classifyInteractionOutcome.js';
export * from './detectUserCorrection.js';
export * from './detectReflectionSignals.js';
export * from './reviewEpistemicState.js';
export * from './reviewDecisionLayer.js';
export * from './reviewPlanningResult.js';
export * from './reviewGoalResult.js';
export * from './reviewMemoryUsage.js';
export * from './generateLearningCandidates.js';
export * from './computeLearningConfidence.js';
export * from './computeLearningPriority.js';
export * from './detectLearningRisk.js';
export * from './detectLearningConflict.js';
export * from './deduplicateLearningCandidates.js';
export * from './evaluateLearningCandidate.js';
export * from './buildReflectionSummary.js';
export * from './buildReflectionDiagnostics.js';
export * from './buildLearningSuggestions.js';
export * from './runReflectionEngine.js';
export * from './telemetry/reflectionTelemetry.js';
export * from './telemetry/redactReflectionTelemetry.js';
