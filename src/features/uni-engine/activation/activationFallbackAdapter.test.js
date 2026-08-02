// Testes do fallback legado e do adapter seguro (Fase 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLegacyFallback,
  createFallbackShadow,
  isLegacyFallbackDecision,
  preserveLegacyBehavior,
} from './legacyFallback.js';
import { buildAppliedEffect, consumeGuidance } from './safeAdapter.js';
import {
  getGuidanceContract,
  isAllowedGuidanceField,
  buildQuestionGuidance,
  buildRecommendationGuidance,
} from './guidanceContracts.js';

test('fallback 61: decisão legada preserva contrato', () => {
  const fallback = buildLegacyFallback({
    enabled: true,
    shadowMode: true,
    environment: 'development',
    capability: 'QUESTION_GUIDANCE',
    requested: true,
  });
  assert.equal(fallback.fallbackUsed, true);
  assert.equal(fallback.applied, false);
  assert.equal(fallback.capability, 'QUESTION_GUIDANCE');
  assert.equal(isLegacyFallbackDecision({ ...fallback, activationStatus: 'FALLBACK_LEGACY' }), true);
});

test('fallback 62: isLegacyFallbackDecision rejeita não-legado', () => {
  assert.equal(isLegacyFallbackDecision(null), false);
  assert.equal(isLegacyFallbackDecision({}), false);
  assert.equal(isLegacyFallbackDecision({ fallbackUsed: true, activationStatus: 'ACTIVE_TEST' }), false);
});

test('fallback 63: preserveLegacyBehavior é no-op', () => {
  const result = preserveLegacyBehavior();
  assert.equal(result.preserved, true);
  assert.equal(result.duplicated, false);
  assert.equal(result.ttsCalled, false);
  assert.equal(result.actionExecuted, false);
});

test('fallback 64: createFallbackShadow é totalmente inerte', () => {
  const shadow = createFallbackShadow({ shadowMode: true });
  assert.equal(shadow.shadowMode, true);
  assert.equal(shadow.executed, false);
  assert.equal(shadow.persisted, false);
  assert.equal(shadow.changedBehavior, false);
  assert.equal(shadow.memoryModified, false);
  assert.equal(shadow.databaseCalled, false);
  assert.equal(shadow.voiceTouched, false);
  assert.equal(shadow.appliedToDecision, false);
  assert.equal(shadow.appliedToResponse, false);
});

test('fallback 65: buildLegacyFallback normaliza capacidade desconhecida', () => {
  const fallback = buildLegacyFallback({ capability: 'NAO_EXISTE' });
  assert.equal(fallback.capability, 'UNKNOWN');
});

test('adapter 66: aplica apenas campos do contrato', () => {
  const effect = buildAppliedEffect({
    capability: 'QUESTION_GUIDANCE',
    suggested: { questionKey: 'category', fieldsStillMissing: ['category'], textoProibido: 'segredo' },
  });
  assert.equal(effect.applied, true);
  assert.equal(effect.effect, 'guidance');
  assert.deepEqual(effect.fields, ['questionKey', 'fieldsStillMissing']);
});

test('adapter 67: campo fora do contrato nunca aplica', () => {
  const effect = buildAppliedEffect({
    capability: 'QUESTION_GUIDANCE',
    suggested: { textoProibido: 'segredo', userId: 'u-1' },
  });
  assert.equal(effect.applied, false);
  assert.deepEqual(effect.fields, []);
});

test('adapter 68: arrays vazios não aplicam', () => {
  const effect = buildAppliedEffect({
    capability: 'QUESTION_GUIDANCE',
    suggested: { questionKey: 'category', fieldsStillMissing: [] },
  });
  assert.equal(effect.applied, true);
  assert.deepEqual(effect.fields, ['questionKey']);
});

test('adapter 69: capacidade proibida nunca aplica efeito', () => {
  const effect = buildAppliedEffect({
    capability: 'FINANCIAL_EXECUTION',
    suggested: { recommendedDecisionKey: 'pay' },
  });
  assert.equal(effect.applied, false);
  assert.equal(effect.blockedBy, 'CAPABILITY_FORBIDDEN_BY_POLICY');
});

test('adapter 70: consumeGuidance só consome com active', () => {
  const inactive = consumeGuidance({
    capability: 'QUESTION_GUIDANCE',
    active: false,
    suggested: { questionKey: 'category' },
  });
  assert.equal(inactive.applied, false);
  assert.equal(inactive.consumed, false);
  assert.equal(inactive.legacyPreserved, true);

  const active = consumeGuidance({
    capability: 'QUESTION_GUIDANCE',
    active: true,
    suggested: { questionKey: 'category' },
  });
  assert.equal(active.applied, true);
  assert.equal(active.consumed, true);
  assert.equal(active.legacyPreserved, false);
});

test('guidance 71: contrato existe para todas as 15 elegíveis', () => {
  const caps = ['METADATA_ONLY', 'DIAGNOSTICS_ONLY', 'QUESTION_GUIDANCE', 'CLARIFICATION_GUIDANCE', 'RESPONSE_STYLE_GUIDANCE', 'RESPONSE_LENGTH_GUIDANCE', 'CATEGORY_SUGGESTION', 'ACCOUNT_SUGGESTION', 'GOAL_SUGGESTION', 'PLANNING_SUGGESTION', 'RISK_WARNING', 'CONFIDENCE_DISCLOSURE', 'MEMORY_READ_GUIDANCE', 'EPISTEMIC_CAUTION', 'DECISION_RECOMMENDATION'];
  for (const cap of caps) {
    assert.ok(getGuidanceContract(cap), `${cap} deveria ter contrato`);
  }
});

test('guidance 72: contratos são congelados e sem funções', () => {
  const contract = getGuidanceContract('QUESTION_GUIDANCE');
  assert.equal(Object.isFrozen(contract), true);
  assert.doesNotThrow(() => JSON.stringify(contract));
  assert.equal(contract.allowedFields.includes('fieldsStillMissing'), true);
});

test('guidance 73: isAllowedGuidanceField respeita o contrato', () => {
  assert.equal(isAllowedGuidanceField('QUESTION_GUIDANCE', 'questionKey'), true);
  assert.equal(isAllowedGuidanceField('QUESTION_GUIDANCE', 'textoProibido'), false);
  assert.equal(isAllowedGuidanceField('NAO_EXISTE', 'questionKey'), false);
});

test('guidance 74: builders produzem formas estáveis', () => {
  const question = buildQuestionGuidance({ questionKey: 'category', fieldsStillMissing: ['category', 'value'] });
  assert.equal(question.questionKey, 'category');
  assert.deepEqual(question.fieldsStillMissing, ['category', 'value']);
  const recommendation = buildRecommendationGuidance({ recommendedDecisionKey: 'confirm' });
  assert.equal(recommendation.recommendedDecisionKey, 'confirm');
  assert.equal(buildQuestionGuidance({}).questionKey, null);
});
