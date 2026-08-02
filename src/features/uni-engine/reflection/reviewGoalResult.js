// Revisão do Goal Engine (Fase 8).
//
// Avalia se o objetivo (Fase 7) foi detectado, tipado, dimensionado e
// avaliado corretamente. Produz diagnóstico — nunca persiste objetivos.
import { createReflectionReview } from './reflectionContracts.js';

export function reviewGoalResult(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const goals = safe.goals ?? null;

  const expected = ['objetivo detectado corretamente', 'tipo correto', 'horizonte correto', 'prioridade correta', 'viabilidade coerente'];
  const observed = [];
  const divergence = [];
  const blockers = [];
  const diagnostics = [];

  if (!goals) {
    return createReflectionReview({
      targetLayer: 'goals',
      status: 'NOT_APPLICABLE',
      confidence: 0,
      expected,
      observed: ['goal engine desligado'],
      divergence: [],
      blockers: ['GOALS_DISABLED'],
      diagnostics: ['SHADOW_ONLY'],
    });
  }

  const goalDetected = Boolean(goals.goalDetected);
  const type = goals.type ?? 'UNKNOWN';
  const status = goals.status ?? 'UNKNOWN';
  const horizon = goals.horizon ?? 'UNKNOWN';
  const priority = goals.priority ?? 'UNDETERMINED';
  const feasibility = goals.feasibility ?? 'UNKNOWN';
  const confidence = typeof goals.confidence === 'number' ? goals.confidence : 0;
  const conflicts = Array.isArray(goals.conflicts) ? goals.conflicts : [];

  observed.push(goalDetected ? `objetivo: ${type}` : 'objetivo não detectado');
  observed.push(`status: ${status}`);
  observed.push(`horizonte: ${horizon}`);
  observed.push(`prioridade: ${priority}`);
  observed.push(`viabilidade: ${feasibility}`);

  if (!goalDetected) {
    divergence.push('GOAL_NOT_DETECTED');
    diagnostics.push('GOAL_MISMATCH');
  }
  if (conflicts.length > 0) {
    divergence.push('GOAL_CONFLICTS');
    blockers.push('GOAL_CONFLICTS');
    diagnostics.push('GOAL_MISMATCH');
  }
  if (status === 'BLOCKED') {
    divergence.push('GOAL_BLOCKED');
    diagnostics.push('GOAL_MISMATCH');
  }
  if (feasibility === 'CURRENTLY_INFEASIBLE') {
    divergence.push('GOAL_INFEASIBLE');
    diagnostics.push('GOAL_MISMATCH');
  }

  const reviewStatus = blockers.length > 0
    ? 'BLOCKED'
    : divergence.length > 0
      ? 'DIVERGENT'
      : 'ALIGNED';

  return createReflectionReview({
    targetLayer: 'goals',
    status: reviewStatus,
    confidence: clampStatusConfidence(divergence.length, confidence),
    expected,
    observed,
    divergence,
    blockers,
    diagnostics,
  });
}

function clampStatusConfidence(divergences, base = 1) {
  const value = Math.max(0, Math.min(1, base - divergences * 0.2));
  return Math.round(value * 1000) / 1000;
}
