// Revisão do Planning Engine (Fase 8).
//
// Avalia se o plano (Fase 6) tinha dados suficientes, dependências corretas,
// timeline possível, etapas coerentes e risco não subestimado. Produz
// diagnóstico — nunca modifica o Planning Engine.
import { createReflectionReview } from './reflectionContracts.js';

export function reviewPlanningResult(options = {}) {
  const safe = options && typeof options === 'object' ? options : {};
  const planning = safe.planning ?? null;

  const expected = ['dados suficientes', 'dependências corretas', 'timeline possível', 'etapas coerentes', 'risco estimado'];
  const observed = [];
  const divergence = [];
  const blockers = [];
  const diagnostics = [];

  if (!planning) {
    return createReflectionReview({
      targetLayer: 'planning',
      status: 'NOT_APPLICABLE',
      confidence: 0,
      expected,
      observed: ['planning desligado'],
      divergence: [],
      blockers: ['PLANNING_DISABLED'],
      diagnostics: ['SHADOW_ONLY'],
    });
  }

  const status = planning.status ?? 'UNKNOWN';
  const risk = planning.risk ?? 'NONE';
  const confidence = typeof planning.confidence === 'number' ? planning.confidence : 0;
  const missing = Array.isArray(planning.missingDependencies)
    ? planning.missingDependencies
    : Array.isArray(planning.missing) ? planning.missing : [];
  const steps = Array.isArray(planning.steps) ? planning.steps : [];

  observed.push(`status: ${status}`);
  observed.push(`risco: ${risk}`);
  observed.push(`${missing.length} dependência(s) ausente(s)`);
  observed.push(`${steps.length} etapa(s)`);

  if (missing.length > 0) {
    divergence.push('PLAN_WITHOUT_REQUIRED_DATA');
    diagnostics.push('MISSING_INFORMATION');
  }
  if (status === 'BLOCKED') {
    divergence.push('PLAN_BLOCKED');
    blockers.push('PLAN_BLOCKED');
  }
  if (risk === 'CRITICAL' || risk === 'HIGH') {
    divergence.push('PLAN_HIGH_RISK');
    diagnostics.push('PLANNING_MISMATCH');
  }
  if (steps.length === 0) {
    divergence.push('PLAN_WITHOUT_STEPS');
    diagnostics.push('PLANNING_MISMATCH');
  }

  const reviewStatus = blockers.length > 0
    ? 'BLOCKED'
    : divergence.length > 0
      ? 'DIVERGENT'
      : 'ALIGNED';

  return createReflectionReview({
    targetLayer: 'planning',
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
