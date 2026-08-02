// Testes das revisões das Fases 1–7 (Fase 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reviewEpistemicState } from './reviewEpistemicState.js';
import { reviewDecisionLayer } from './reviewDecisionLayer.js';
import { reviewPlanningResult } from './reviewPlanningResult.js';
import { reviewGoalResult } from './reviewGoalResult.js';
import { reviewMemoryUsage } from './reviewMemoryUsage.js';

test('revisão epistêmica: alinhada com evidência suficiente', () => {
  const review = reviewEpistemicState({
    epistemicModel: {
      items: [],
      conflicts: [],
      staleItems: [],
      sufficiency: { overall: true },
    },
    epistemicState: { confidence: 0.9 },
  });
  assert.equal(review.status, 'ALIGNED');
  assert.equal(review.targetLayer, 'epistemic');
});

test('revisão epistêmica: hipótese tratada como fato bloqueia', () => {
  const review = reviewEpistemicState({
    epistemicModel: {
      items: [{ status: 'inferred_low' }],
      conflicts: [],
      staleItems: [],
      sufficiency: { overall: true },
    },
    epistemicState: { confidence: 0.9 },
  });
  assert.equal(review.status, 'BLOCKED');
  assert.ok(review.divergence.includes('HYPOTHESIS_AS_FACT'));
});

test('revisão epistêmica: dado stale diverge', () => {
  const review = reviewEpistemicState({
    epistemicModel: {
      items: [],
      conflicts: [],
      staleItems: [{ item: 'x' }],
      sufficiency: { overall: true },
    },
    epistemicState: { confidence: 0.9 },
  });
  assert.equal(review.status, 'DIVERGENT');
  assert.ok(review.divergence.includes('STALE_INFORMATION_USED'));
});

test('revisão epistêmica: modelo desligado é NOT_APPLICABLE', () => {
  const review = reviewEpistemicState({});
  assert.equal(review.status, 'NOT_APPLICABLE');
  assert.deepEqual(review.blockers, ['EPISTEMIC_DISABLED']);
});

test('revisão de decisão: correta e alinhada', () => {
  const review = reviewDecisionLayer({
    decisionLayer: {
      decisionType: 'ASK',
      risk: 'NONE',
      confidence: 0.9,
      contextEvaluation: { sufficiency: 'INSUFFICIENT' },
      dependencies: [],
    },
    comparison: { status: 'agreement' },
  });
  assert.equal(review.status, 'ALIGNED');
});

test('revisão de decisão: pergunta excessiva diverge', () => {
  const review = reviewDecisionLayer({
    decisionLayer: {
      decisionType: 'ASK',
      risk: 'NONE',
      confidence: 0.9,
      contextEvaluation: { sufficiency: 'SUFFICIENT' },
      dependencies: [],
    },
    comparison: { status: 'agreement' },
  });
  assert.equal(review.status, 'DIVERGENT');
  assert.ok(review.divergence.includes('EXCESSIVE_QUESTION'));
});

test('revisão de decisão: resposta sem dependências bloqueia', () => {
  const review = reviewDecisionLayer({
    decisionLayer: {
      decisionType: 'RESPOND',
      risk: 'NONE',
      confidence: 0.9,
      contextEvaluation: { sufficiency: 'SUFFICIENT' },
      dependencies: ['account'],
    },
    comparison: { status: 'agreement' },
  });
  assert.equal(review.status, 'BLOCKED');
  assert.ok(review.divergence.includes('MISSING_QUESTION'));
});

test('revisão de decisão: execução com risco crítico bloqueia', () => {
  const review = reviewDecisionLayer({
    decisionLayer: {
      decisionType: 'EXECUTE',
      risk: 'CRITICAL',
      confidence: 0.9,
      contextEvaluation: { sufficiency: 'SUFFICIENT' },
      dependencies: [],
    },
    comparison: { status: 'agreement' },
  });
  assert.equal(review.status, 'BLOCKED');
  assert.ok(review.divergence.includes('CONFIRMATION_REQUIRED_BUT_EXECUTING'));
});

test('revisão de decisão: divergência com o pipeline', () => {
  const review = reviewDecisionLayer({
    decisionLayer: {
      decisionType: 'EXECUTE',
      risk: 'NONE',
      confidence: 0.9,
      contextEvaluation: { sufficiency: 'SUFFICIENT' },
      dependencies: [],
    },
    comparison: { status: 'intent_divergence' },
  });
  assert.equal(review.status, 'DIVERGENT');
});

test('revisão de decisão: desligada é NOT_APPLICABLE', () => {
  const review = reviewDecisionLayer({});
  assert.equal(review.status, 'NOT_APPLICABLE');
});

test('revisão do plano: insuficiente diverge', () => {
  const review = reviewPlanningResult({
    planning: {
      status: 'PARTIAL',
      risk: 'NONE',
      confidence: 0.8,
      missingDependencies: ['account'],
      steps: [{ id: 1 }],
    },
  });
  assert.equal(review.status, 'DIVERGENT');
  assert.ok(review.divergence.includes('PLAN_WITHOUT_REQUIRED_DATA'));
});

test('revisão do plano: bloqueado', () => {
  const review = reviewPlanningResult({
    planning: { status: 'BLOCKED', risk: 'CRITICAL', missingDependencies: [], steps: [{}] },
  });
  assert.equal(review.status, 'BLOCKED');
});

test('revisão do plano: alinhado', () => {
  const review = reviewPlanningResult({
    planning: { status: 'READY', risk: 'NONE', confidence: 0.9, missingDependencies: [], steps: [{ id: 1 }, { id: 2 }] },
  });
  assert.equal(review.status, 'ALIGNED');
});

test('revisão do plano: desligado é NOT_APPLICABLE', () => {
  const review = reviewPlanningResult({});
  assert.equal(review.status, 'NOT_APPLICABLE');
});

test('revisão do objetivo: correto e alinhado', () => {
  const review = reviewGoalResult({
    goals: {
      goalDetected: true,
      type: 'SAVINGS',
      status: 'ACTIVE_SHADOW',
      horizon: 'MEDIUM_TERM',
      priority: 'MEDIUM',
      feasibility: 'FEASIBLE',
      confidence: 0.8,
      conflicts: [],
    },
  });
  assert.equal(review.status, 'ALIGNED');
});

test('revisão do objetivo: incorreto (não detectado) diverge', () => {
  const review = reviewGoalResult({
    goals: {
      goalDetected: false,
      type: 'UNKNOWN',
      status: 'UNKNOWN',
      horizon: 'UNKNOWN',
      priority: 'UNDETERMINED',
      feasibility: 'UNKNOWN',
      confidence: 0,
      conflicts: [],
    },
  });
  assert.equal(review.status, 'DIVERGENT');
  assert.ok(review.divergence.includes('GOAL_NOT_DETECTED'));
});

test('revisão do objetivo: bloqueado por conflito', () => {
  const review = reviewGoalResult({
    goals: {
      goalDetected: true,
      type: 'SAVINGS',
      status: 'BLOCKED',
      horizon: 'MEDIUM_TERM',
      priority: 'HIGH',
      feasibility: 'FEASIBLE',
      confidence: 0.8,
      conflicts: [{ type: 'PRIORITY_CONFLICT' }],
    },
  });
  assert.equal(review.status, 'BLOCKED');
});

test('revisão do objetivo: desligado é NOT_APPLICABLE', () => {
  const review = reviewGoalResult({});
  assert.equal(review.status, 'NOT_APPLICABLE');
});

test('revisão de memória: adequada e alinhada', () => {
  const review = reviewMemoryUsage({
    persistentMemory: { enabled: true, retrieved: [{ id: 'm1' }], conflicts: [], candidates: [] },
  });
  assert.equal(review.status, 'ALIGNED');
});

test('revisão de memória: contestada bloqueia', () => {
  const review = reviewMemoryUsage({
    persistentMemory: {
      enabled: true,
      retrieved: [{ id: 'm1' }],
      conflicts: [{ subjectKey: 'account::nubank', outcome: 'supersede' }],
      candidates: [],
    },
  });
  assert.equal(review.status, 'BLOCKED');
  assert.ok(review.divergence.includes('MEMORY_CONFLICT_DETECTED'));
});

test('revisão de memória: correção deveria gerar candidato', () => {
  const review = reviewMemoryUsage({
    persistentMemory: { enabled: true, retrieved: [{ id: 'm1' }], conflicts: [], candidates: [] },
    userCorrection: { isCorrection: true },
  });
  assert.equal(review.status, 'DIVERGENT');
  assert.ok(review.divergence.includes('CORRECTION_SHOULD_GENERATE_CANDIDATE'));
});

test('revisão de memória: desligada é NOT_APPLICABLE', () => {
  const review = reviewMemoryUsage({});
  assert.equal(review.status, 'NOT_APPLICABLE');
});

test('revisões: todas serializáveis e com forma estável', () => {
  const reviews = [
    reviewEpistemicState({}),
    reviewDecisionLayer({}),
    reviewPlanningResult({}),
    reviewGoalResult({}),
    reviewMemoryUsage({}),
  ];
  for (const review of reviews) {
    assert.ok(['ALIGNED', 'DIVERGENT', 'BLOCKED', 'NOT_APPLICABLE'].includes(review.status));
    assert.ok(review.confidence >= 0 && review.confidence <= 1);
    assert.doesNotThrow(() => JSON.stringify(review));
  }
});
