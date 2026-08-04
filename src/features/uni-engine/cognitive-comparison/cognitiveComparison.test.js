// Uni Engine — Cognitive Comparison (Fase 14, Bloco 3): testes.
//
// Cobre o comparador observacional legado × Engine: status de concordância,
// tipos/severidades de divergência, códigos de razão fechados, mapeamento de
// rotas (planner → rota Engine; resposta legada → rota legada), contratos
// (deepFreeze, serialização, determinismo, confidence clamp) e a garantia
// absoluta de NENHUMA influência (influenceApplied sempre false).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareLegacyWithEngine,
  buildEmptyCognitiveComparison,
  engineRouteFromPlan,
  legacyRouteFromResponse,
  validateCognitiveComparison,
  isCognitiveComparisonSerializable,
  createCognitiveComparison,
  COGNITIVE_COMPARISON_VERSION,
  COGNITIVE_AGREEMENT_STATUSES,
  COGNITIVE_DIVERGENCE_TYPES,
} from './index.js';

function baseEngine(overrides = {}) {
  return {
    enabled: true,
    skipped: false,
    intent: 'INCOME',
    confidence: 0.9,
    ...overrides,
  };
}

function baseLegacy(overrides = {}) {
  return {
    intent: 'INCOME',
    responseType: 'generic',
    ...overrides,
  };
}

test('COMP-1: engine desligada → status skipped com ENGINE_DISABLED e influenceApplied false', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy(),
    engine: { enabled: false, skipped: false },
  });
  assert.equal(result.agreementStatus, 'skipped');
  assert.equal(result.agreement, false);
  assert.ok(result.reasonCodes.includes('ENGINE_DISABLED'));
  assert.ok(result.reasonCodes.at(-1) === 'NO_INFLUENCE');
  assert.equal(result.influenceApplied, false);
  assert.equal(result.legacyPreserved, true);
});

test('COMP-2: engine com erro interno → engine_error, divergência engine_fallback severidade high', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy(),
    engine: baseEngine({ fallbackUsed: true, errorCode: 'ENGINE_CRASHED' }),
  });
  assert.equal(result.agreementStatus, 'engine_error');
  assert.equal(result.engineErrorCode, 'ENGINE_CRASHED');
  assert.equal(result.divergenceType, 'engine_fallback');
  assert.equal(result.divergenceSeverity, 'high');
  assert.ok(result.reasonCodes.includes('ENGINE_ERROR'));
  assert.equal(result.influenceApplied, false);
});

test('COMP-3: dados insuficientes → insufficient_data com missing_context', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: { intent: null },
    engine: baseEngine({ intent: null, confidence: null }),
    plan: null,
  });
  assert.equal(result.agreementStatus, 'insufficient_data');
  assert.equal(result.divergenceType, 'missing_context');
  assert.equal(result.divergenceSeverity, 'medium');
  assert.ok(result.reasonCodes.includes('LEGACY_UNAVAILABLE'));
});

test('COMP-4: intenção e rota iguais → agreement com INTENT_MATCH e ROUTE_MATCH', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ intent: 'INCOME' }),
    engine: baseEngine({ intent: 'INCOME' }),
    plan: { nextStep: 'NEXT_STEP_ANSWER' },
  });
  assert.equal(result.agreementStatus, 'agreement');
  assert.equal(result.agreement, true);
  assert.equal(result.legacyRoute, 'ROUTE_ANSWER');
  assert.equal(result.engineRoute, 'ROUTE_ANSWER');
  assert.ok(result.reasonCodes.includes('INTENT_MATCH'));
  assert.ok(result.reasonCodes.includes('ROUTE_MATCH'));
});

test('COMP-5: intenção diferente → divergence com intent_mismatch severidade high', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ intent: 'INCOME' }),
    engine: baseEngine({ intent: 'EXPENSE' }),
    plan: { nextStep: 'NEXT_STEP_ANSWER' },
  });
  assert.equal(result.agreementStatus, 'divergence');
  assert.equal(result.divergenceType, 'intent_mismatch');
  assert.equal(result.divergenceSeverity, 'high');
  assert.ok(result.reasonCodes.includes('INTENT_MISMATCH'));
});

test('COMP-6: rota diferente sem mismatch de intenção → partial_agreement com route_mismatch', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ intent: 'INCOME', responseType: 'confirmation' }),
    engine: baseEngine({ intent: 'INCOME' }),
    plan: { nextStep: 'NEXT_STEP_ANSWER' },
  });
  assert.equal(result.agreementStatus, 'partial_agreement');
  assert.equal(result.divergenceType, 'route_mismatch');
  assert.equal(result.divergenceSeverity, 'medium');
});

test('COMP-7: gap de confiança ≥ 0.25 → confidence_mismatch severidade low', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ confidence: 0.95 }),
    engine: baseEngine({ intent: 'INCOME', confidence: 0.4 }),
    plan: { nextStep: 'NEXT_STEP_ANSWER' },
  });
  assert.equal(result.agreementStatus, 'partial_agreement');
  assert.equal(result.divergenceType, 'confidence_mismatch');
  assert.equal(result.divergenceSeverity, 'low');
});

test('COMP-8: conflitos epistêmicos → epistemic_conflict severidade medium', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ intent: 'INCOME' }),
    engine: baseEngine({ intent: 'INCOME', epistemicConflicts: 2 }),
    plan: { nextStep: 'NEXT_STEP_ANSWER' },
  });
  assert.equal(result.divergenceType, 'epistemic_conflict');
  assert.equal(result.divergenceSeverity, 'medium');
  assert.ok(result.reasonCodes.includes('EPISTEMIC_CONFLICT'));
});

test('COMP-9: fallback legado ativo → legacy_fallback registrado como divergência', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ intent: 'INCOME', fallbackUsed: true }),
    engine: baseEngine({ intent: 'INCOME' }),
    plan: { nextStep: 'NEXT_STEP_ANSWER' },
  });
  assert.equal(result.divergenceType, 'legacy_fallback');
  assert.ok(result.reasonCodes.includes('LEGACY_FALLBACK'));
});

test('COMP-10: fallback da Engine sem erro → partial_agreement com ENGINE_FALLBACK', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ intent: 'INCOME' }),
    engine: baseEngine({ intent: 'INCOME', fallbackUsed: true, errorCode: null }),
    plan: { nextStep: 'NEXT_STEP_ANSWER' },
  });
  assert.equal(result.agreementStatus, 'partial_agreement');
  assert.equal(result.divergenceType, 'engine_fallback');
  assert.ok(result.reasonCodes.includes('ENGINE_FALLBACK'));
});

test('COMP-11: confiança baixa da Engine em agreement anexa LOW_CONFIDENCE', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ intent: 'INCOME' }),
    engine: baseEngine({ intent: 'INCOME', confidence: 0.3 }),
    plan: { nextStep: 'NEXT_STEP_ANSWER' },
  });
  assert.equal(result.agreementStatus, 'agreement');
  assert.ok(result.reasonCodes.includes('LOW_CONFIDENCE'));
});

test('COMP-12: influenceApplied SEMPRE false e legacyPreserved SEMPRE true (qualquer status)', () => {
  for (const engine of [
    { enabled: false },
    baseEngine({ fallbackUsed: true, errorCode: 'ENGINE_CRASHED' }),
    baseEngine(),
  ]) {
    const result = compareLegacyWithEngine({
      turnId: 't1',
      messageId: 't1',
      legacy: baseLegacy(),
      engine,
    });
    assert.equal(result.influenceApplied, false);
    assert.equal(result.legacyPreserved, true);
    assert.ok(COGNITIVE_AGREEMENT_STATUSES.includes(result.agreementStatus));
  }
});

test('COMP-13: campos ausentes são tolerados — intenção só de um lado não gera mismatch', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ intent: null }),
    engine: baseEngine({ intent: 'INCOME' }),
    plan: { nextStep: 'NEXT_STEP_ANSWER' },
  });
  assert.notEqual(result.agreementStatus, 'divergence');
});

test('COMP-14: resultado é totalmente serializável (round-trip JSON) e congelado', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ intent: 'EXPENSE' }),
    engine: baseEngine({ intent: 'INCOME' }),
  });
  assert.equal(isCognitiveComparisonSerializable(result), true);
  const clone = JSON.parse(JSON.stringify(result));
  assert.deepEqual(clone, result);
  assert.ok(Object.isFrozen(result));
});

test('COMP-15: comparador é determinístico — mesma entrada, mesma saída', () => {
  const options = {
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ intent: 'EXPENSE' }),
    engine: baseEngine({ intent: 'INCOME', epistemicConflicts: 1 }),
    plan: { nextStep: 'NEXT_STEP_CLARIFICATION' },
  };
  const first = compareLegacyWithEngine(options);
  const second = compareLegacyWithEngine(options);
  const stripTime = (entry) => {
    const copy = { ...entry };
    delete copy.timestamp;
    delete copy.durationMs;
    return copy;
  };
  assert.deepEqual(stripTime(first), stripTime(second));
});

test('COMP-16: engineRouteFromPlan mapeia NEXT_STEP_* → ROUTE_*; inválido → ROUTE_LEGACY_FALLBACK', () => {
  assert.equal(engineRouteFromPlan({ nextStep: 'NEXT_STEP_ANSWER' }), 'ROUTE_ANSWER');
  assert.equal(engineRouteFromPlan({ nextStep: 'NEXT_STEP_QUESTION' }), 'ROUTE_QUESTION');
  assert.equal(engineRouteFromPlan({ nextStep: 'NEXT_STEP_CLARIFICATION' }), 'ROUTE_CLARIFICATION');
  assert.equal(engineRouteFromPlan({ nextStep: 'NEXT_STEP_CONFIRMATION' }), 'ROUTE_CONFIRMATION');
  assert.equal(engineRouteFromPlan({ nextStep: 'NEXT_STEP_WAIT' }), 'ROUTE_WAIT');
  assert.equal(engineRouteFromPlan({ nextStep: 'NEXT_STEP_NONE' }), 'ROUTE_NONE');
  assert.equal(engineRouteFromPlan({ nextStep: 'NEXT_STEP_DESCONHECIDO' }), 'ROUTE_LEGACY_FALLBACK');
  assert.equal(engineRouteFromPlan(null), 'ROUTE_LEGACY_FALLBACK');
  assert.equal(engineRouteFromPlan({}), 'ROUTE_LEGACY_FALLBACK');
});

test('COMP-17: legacyRouteFromResponse mapeia responseType e pendência ativa', () => {
  assert.equal(legacyRouteFromResponse({ responseType: 'confirmation' }), 'ROUTE_CONFIRMATION');
  assert.equal(legacyRouteFromResponse({ responseType: 'clarification' }), 'ROUTE_CLARIFICATION');
  assert.equal(legacyRouteFromResponse({ responseType: 'question' }), 'ROUTE_QUESTION');
  assert.equal(legacyRouteFromResponse({ responseType: 'generic' }), 'ROUTE_ANSWER');
  assert.equal(legacyRouteFromResponse({ pendingActive: true }), 'ROUTE_CONFIRMATION');
  assert.equal(legacyRouteFromResponse({}), 'ROUTE_LEGACY_FALLBACK');
  assert.equal(legacyRouteFromResponse(null), 'ROUTE_LEGACY_FALLBACK');
});

test('COMP-18: validateCognitiveComparison — influência aplicada é inválida', () => {
  const valid = compareLegacyWithEngine({ legacy: baseLegacy(), engine: baseEngine() });
  assert.equal(validateCognitiveComparison(valid).valid, true);
  const tampered = { ...valid, influenceApplied: true };
  const result = validateCognitiveComparison(tampered);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('INFLUENCE_MUST_BE_FALSE'));
});

test('COMP-19: contrato sanitiza status inválido → insufficient_data e clamp de confiança', () => {
  const result = createCognitiveComparison({
    agreementStatus: 'status_inventado',
    confidence: 1.7,
    engine: { intent: 'X', route: 'Y' },
    legacy: { intent: 'X', route: 'Y' },
  });
  assert.equal(result.agreementStatus, 'insufficient_data');
  assert.equal(result.confidence, 1);
});

test('COMP-20: versão estável 1.0 e buildEmptyCognitiveComparison falho-safe', () => {
  assert.equal(COGNITIVE_COMPARISON_VERSION, '1.0');
  const empty = buildEmptyCognitiveComparison({ turnId: 't1', messageId: 't1' });
  assert.equal(empty.agreementStatus, 'skipped');
  assert.equal(empty.engineSkipped, true);
  assert.equal(empty.influenceApplied, false);
  assert.equal(empty.turnId, 't1');
  assert.deepEqual(
    COGNITIVE_DIVERGENCE_TYPES,
    [
      'intent_mismatch',
      'route_mismatch',
      'action_mismatch',
      'confidence_mismatch',
      'epistemic_conflict',
      'missing_context',
      'legacy_fallback',
      'engine_fallback',
    ],
  );
});

test('COMP-21: ação só diverge quando explicitamente declarada (vocabulários distintos)', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy({ intent: 'INCOME', actionMismatch: true }),
    engine: baseEngine({ intent: 'INCOME' }),
    plan: { nextStep: 'NEXT_STEP_ANSWER' },
  });
  assert.equal(result.divergenceType, 'action_mismatch');
  assert.ok(result.reasonCodes.includes('ACTION_MISMATCH'));
});

test('COMP-22: reasonCodes sempre terminam em NO_INFLUENCE e são fechados', () => {
  const result = compareLegacyWithEngine({
    turnId: 't1',
    messageId: 't1',
    legacy: baseLegacy(),
    engine: baseEngine(),
    plan: { nextStep: 'NEXT_STEP_ANSWER' },
  });
  assert.equal(result.reasonCodes.at(-1), 'NO_INFLUENCE');
  assert.ok(result.reasonCodes.every((code) => typeof code === 'string'));
});
