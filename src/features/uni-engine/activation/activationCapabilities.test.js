// Testes de capacidades do Activation Engine (Fase 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runActivationEngine } from './runActivationEngine.js';
import { evaluateCapabilityEligibility } from './capabilityEligibility.js';
import { isCapabilityEligible, isCapabilityForbidden, CAPABILITY_REGISTRY } from './capabilityRegistry.js';
import { ACTIVATION_CAPABILITIES } from './activationTypes.js';

const ELEGIBLE = [
  'METADATA_ONLY',
  'DIAGNOSTICS_ONLY',
  'QUESTION_GUIDANCE',
  'CLARIFICATION_GUIDANCE',
  'RESPONSE_STYLE_GUIDANCE',
  'RESPONSE_LENGTH_GUIDANCE',
  'CATEGORY_SUGGESTION',
  'ACCOUNT_SUGGESTION',
  'GOAL_SUGGESTION',
  'PLANNING_SUGGESTION',
  'RISK_WARNING',
  'CONFIDENCE_DISCLOSURE',
  'MEMORY_READ_GUIDANCE',
  'EPISTEMIC_CAUTION',
  'DECISION_RECOMMENDATION',
];

const FORBIDDEN = [
  'RESPONSE_CONTENT_INFLUENCE',
  'MEMORY_WRITE',
  'FINANCIAL_EXECUTION',
  'LEARNING_APPLICATION',
];

function activeInput(capability, overrides = {}) {
  return {
    capability,
    engineEnabled: true,
    activationEnabled: true,
    capabilityEnabled: true,
    environment: 'development',
    shadowMode: false,
    confidence: 0.9,
    risk: 'NONE',
    workspaceType: 'personal',
    dataSufficient: true,
    userId: 'tester-1',
    testUserIds: ['tester-1'],
    rolloutPercent: 0,
    requested: true,
    suggested: { questionKey: 'category', fieldsStillMissing: ['category'], hasData: true },
    legacy: { effect: 'none' },
    telemetryEnabled: false,
    ...overrides,
  };
}

for (const capability of ELEGIBLE) {
  test(`capacidade 43-56: ${capability} elegível`, () => {
    assert.equal(isCapabilityEligible(capability), true);
    const eligibility = evaluateCapabilityEligibility({ capability, capabilityEnabled: true });
    assert.equal(eligibility.status, 'ELIGIBLE');
  });
}

for (const capability of FORBIDDEN) {
  test(`capacidade 57-60: ${capability} bloqueada por política`, () => {
    assert.equal(isCapabilityForbidden(capability), true);
    const decision = runActivationEngine(activeInput(capability));
    assert.equal(decision.activationStatus, 'BLOCKED_BY_POLICY');
    assert.equal(decision.applied, false);
    assert.equal(decision.fallbackUsed, true);
  });
}

test('capacidade: todas as 20 existem no enum fechado', () => {
  assert.equal(ACTIVATION_CAPABILITIES.length, 20);
  assert.ok(ACTIVATION_CAPABILITIES.includes('UNKNOWN'));
});

test('capacidade: registro completo e congelado', () => {
  assert.equal(CAPABILITY_REGISTRY.length, ACTIVATION_CAPABILITIES.length);
  for (const entry of CAPABILITY_REGISTRY) {
    assert.ok(['capability', 'eligible', 'forbidden', 'confidenceThreshold', 'firstWave'].every((k) => k in entry));
  }
});

const FIRST_WAVE_SUGGESTED = {
  METADATA_ONLY: { hasData: true, intentBand: 'register_expense', confidenceBand: 'high', engineVersion: '2.0' },
  QUESTION_GUIDANCE: { questionKey: 'category', fieldsStillMissing: ['category'] },
  CLARIFICATION_GUIDANCE: { clarificationKey: 'ambiguous_intent', ambiguityType: 'merchant_name', optionsCount: 2 },
  RESPONSE_STYLE_GUIDANCE: { styleKey: 'concise', toneBand: 'neutral' },
  RESPONSE_LENGTH_GUIDANCE: { lengthBand: 'short' },
};

test('capacidade: primeira onda é suportada em DEV/test user', () => {
  for (const capability of Object.keys(FIRST_WAVE_SUGGESTED)) {
    const decision = runActivationEngine(activeInput(capability, {
      suggested: FIRST_WAVE_SUGGESTED[capability],
    }));
    assert.equal(decision.activationStatus, 'ACTIVE_TEST', `${capability} deveria ativar em DEV/test user`);
    assert.equal(decision.applied, true);
    assert.equal(decision.shadow.executed, false);
    assert.equal(decision.shadow.memoryModified, false);
  }
});

test('capacidade: com shadow mode ativo fica SHADOW_ONLY', () => {
  const decision = runActivationEngine(activeInput('QUESTION_GUIDANCE', { shadowMode: true }));
  assert.equal(decision.activationStatus, 'SHADOW_ONLY');
  assert.equal(decision.applied, false);
});

test('capacidade: sem cohort e sem percentual fica ELIGIBLE', () => {
  const decision = runActivationEngine(activeInput('QUESTION_GUIDANCE', {
    userId: 'other-user',
    testUserIds: ['tester-1'],
    shadowMode: false,
  }));
  assert.equal(decision.activationStatus, 'ELIGIBLE');
  assert.equal(decision.applied, false);
  assert.equal(decision.fallbackReason, 'NOT_IN_ROLLOUT');
});

test('capacidade: METADATA_ONLY aplica somente efeito metadata', () => {
  const decision = runActivationEngine(activeInput('METADATA_ONLY', {
    suggested: { hasData: true, intentBand: 'register_expense', confidenceBand: 'high', engineVersion: '2.0' },
  }));
  assert.equal(decision.applied, true);
  assert.equal(decision.appliedEffect.effect, 'metadata');
  assert.equal(decision.shadow.appliedToDecision, true);
  assert.equal(decision.shadow.appliedToResponse, false);
});

test('capacidade: QUESTION_GUIDANCE aplica somente campos do contrato', () => {
  const decision = runActivationEngine(activeInput('QUESTION_GUIDANCE', {
    suggested: { questionKey: 'category', fieldsStillMissing: ['category'], textoProibido: 'conteúdo sensível' },
  }));
  assert.equal(decision.applied, true);
  assert.equal(decision.appliedEffect.effect, 'guidance');
  assert.deepEqual(decision.appliedEffect.fields, ['questionKey', 'fieldsStillMissing']);
  assert.equal(decision.shadow.appliedToResponse, true);
});

test('capacidade: capacidade desconhecida é bloqueada', () => {
  const decision = runActivationEngine(activeInput('NAO_EXISTE'));
  assert.equal(decision.activationStatus, 'BLOCKED_BY_POLICY');
  assert.equal(decision.fallbackReason, 'CAPABILITY_NOT_ELIGIBLE');
});

test('capacidade: risco alto bloqueia mesmo com flag ligada', () => {
  const decision = runActivationEngine(activeInput('QUESTION_GUIDANCE', { risk: 'CRITICAL' }));
  assert.equal(decision.activationStatus, 'BLOCKED_BY_RISK');
  assert.equal(decision.applied, false);
});

test('capacidade: ambiente produção bloqueia', () => {
  const decision = runActivationEngine(activeInput('QUESTION_GUIDANCE', {
    environment: 'production',
    allowedEnvironments: ['development'],
  }));
  assert.equal(decision.activationStatus, 'BLOCKED_BY_ENVIRONMENT');
});

test('capacidade: sem dados bloqueia', () => {
  const decision = runActivationEngine(activeInput('QUESTION_GUIDANCE', { dataSufficient: false }));
  assert.equal(decision.activationStatus, 'BLOCKED_BY_DATA');
});

test('capacidade: confiança baixa bloqueia', () => {
  const decision = runActivationEngine(activeInput('QUESTION_GUIDANCE', { confidence: 0.3 }));
  assert.equal(decision.activationStatus, 'BLOCKED_BY_CONFIDENCE');
});

test('capacidade: circuito aberto bloqueia', async () => {
  const { recordCircuitFailure, resetCircuitBreaker } = await import('./circuitBreaker.js');
  resetCircuitBreaker();
  for (let i = 0; i < 5; i += 1) {
    recordCircuitFailure('QUESTION_GUIDANCE');
  }
  const decision = runActivationEngine(activeInput('QUESTION_GUIDANCE'));
  assert.equal(decision.activationStatus, 'BLOCKED_BY_CIRCUIT_BREAKER');
  resetCircuitBreaker();
});
