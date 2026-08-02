// Testes dos gates do Activation Engine (Fase 9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  gateEngineEnabled,
  gateActivationEnabled,
  gateCapabilityEnabled,
  gateEnvironmentAllowed,
  gateTestUserAllowed,
  gatePercentageRollout,
  gateConfidenceThreshold,
  gateRiskThreshold,
  gateWorkspaceCompatible,
  gateDataSufficiency,
  gateCapabilityPolicy,
  gateCircuitBreaker,
  gateFallbackAvailability,
  ACTIVATION_GATES,
} from './gates.js';

test('gate 29: environment passa', () => {
  const gate = gateEnvironmentAllowed({ environment: 'development', allowedEnvironments: ['development'] });
  assert.equal(gate.passed, true);
  assert.equal(gate.name, 'ENVIRONMENT_ALLOWED');
});

test('gate 30: environment bloqueia', () => {
  const gate = gateEnvironmentAllowed({ environment: 'production', allowedEnvironments: ['development'] });
  assert.equal(gate.passed, false);
  assert.equal(gate.reasonCode, 'ENVIRONMENT_BLOCKED');
});

test('gate 31: test user passa', () => {
  const gate = gateTestUserAllowed({ userId: 'tester-1', testUserIds: ['tester-1'] });
  assert.equal(gate.passed, true);
});

test('gate 32: test user bloqueia', () => {
  const gate = gateTestUserAllowed({ userId: 'other', testUserIds: ['tester-1'] });
  assert.equal(gate.passed, false);
  assert.equal(gate.metadata.hasIdentity, true);
  assert.equal(gate.metadata.inCohort, false);
});

test('gate 33: confidence passa', () => {
  const gate = gateConfidenceThreshold({ confidence: 0.85, threshold: 0.7 });
  assert.equal(gate.passed, true);
});

test('gate 34: confidence bloqueia', () => {
  const gate = gateConfidenceThreshold({ confidence: 0.4, threshold: 0.7 });
  assert.equal(gate.passed, false);
  assert.equal(gate.reasonCode, 'CONFIDENCE_BELOW_THRESHOLD');
});

test('gate 34b: confidence ausente bloqueia', () => {
  const gate = gateConfidenceThreshold({ confidence: null });
  assert.equal(gate.passed, false);
  assert.equal(gate.reasonCode, 'CONFIDENCE_MISSING');
});

test('gate 35: risk passa', () => {
  const gate = gateRiskThreshold({ risk: 'NONE' });
  assert.equal(gate.passed, true);
  const low = gateRiskThreshold({ risk: 'LOW' });
  assert.equal(low.passed, true);
});

test('gate 36: risk bloqueia', () => {
  assert.equal(gateRiskThreshold({ risk: 'HIGH' }).passed, false);
  assert.equal(gateRiskThreshold({ risk: 'CRITICAL' }).passed, false);
  assert.equal(gateRiskThreshold({ risk: 'MEDIUM' }).passed, false);
});

test('gate 36b: risk ausente bloqueia', () => {
  const gate = gateRiskThreshold({ risk: null });
  assert.equal(gate.passed, false);
  assert.equal(gate.reasonCode, 'RISK_MISSING');
});

test('gate 37: workspace passa', () => {
  const gate = gateWorkspaceCompatible({ workspaceType: 'personal' });
  assert.equal(gate.passed, true);
});

test('gate 38: workspace bloqueia', () => {
  const gate = gateWorkspaceCompatible({ workspaceType: 'unknown_type' });
  assert.equal(gate.passed, false);
  assert.equal(gate.reasonCode, 'WORKSPACE_NOT_ALLOWED');
});

test('gate 39: data passa', () => {
  const gate = gateDataSufficiency({ dataSufficient: true });
  assert.equal(gate.passed, true);
});

test('gate 40: data bloqueia', () => {
  const gate = gateDataSufficiency({ dataSufficient: false });
  assert.equal(gate.passed, false);
  assert.equal(gate.reasonCode, 'DATA_INSUFFICIENT');
});

test('gate 41: policy bloqueia proibidas', () => {
  assert.equal(gateCapabilityPolicy({ capability: 'FINANCIAL_EXECUTION' }).passed, false);
  assert.equal(gateCapabilityPolicy({ capability: 'MEMORY_WRITE' }).passed, false);
  assert.equal(gateCapabilityPolicy({ capability: 'LEARNING_APPLICATION' }).passed, false);
  assert.equal(gateCapabilityPolicy({ capability: 'RESPONSE_CONTENT_INFLUENCE' }).passed, false);
});

test('gate 41b: policy passa para elegível', () => {
  const gate = gateCapabilityPolicy({ capability: 'QUESTION_GUIDANCE' });
  assert.equal(gate.passed, true);
});

test('gate 41c: policy bloqueia desconhecida', () => {
  const gate = gateCapabilityPolicy({ capability: 'NAO_EXISTE' });
  assert.equal(gate.passed, false);
  assert.equal(gate.reasonCode, 'CAPABILITY_NOT_ELIGIBLE');
});

test('gate 42: circuit breaker bloqueia', () => {
  assert.equal(gateCircuitBreaker({ capability: 'QUESTION_GUIDANCE', circuitOpen: true }).passed, false);
  assert.equal(gateCircuitBreaker({ capability: 'QUESTION_GUIDANCE', circuitOpen: false }).passed, true);
});

test('gate: engine/activation/capability/fallback', () => {
  assert.equal(gateEngineEnabled({ engineEnabled: true }).passed, true);
  assert.equal(gateEngineEnabled({ engineEnabled: false }).passed, false);
  assert.equal(gateActivationEnabled({ activationEnabled: true }).passed, true);
  assert.equal(gateActivationEnabled({ activationEnabled: false }).passed, false);
  assert.equal(gateCapabilityEnabled({ capabilityEnabled: true }).passed, true);
  assert.equal(gateCapabilityEnabled({ capabilityEnabled: false }).passed, false);
  assert.equal(gateFallbackAvailability({ legacyAvailable: true }).passed, true);
  assert.equal(gateFallbackAvailability({ legacyAvailable: false }).passed, false);
});

test('gate: percentage zero bloqueia inclusão', () => {
  const gate = gatePercentageRollout({ percent: 0, identity: 'u1' });
  assert.equal(gate.passed, false);
  assert.equal(gate.reasonCode, 'ROLLOUT_PERCENT_ZERO');
});

test('gate: percentage 100 bloqueado por política', () => {
  const gate = gatePercentageRollout({ percent: 100, identity: 'u1' });
  assert.equal(gate.passed, false);
  assert.equal(gate.reasonCode, 'FULL_ROLLOUT_BLOCKED_BY_POLICY');
});

test('gate: percentage sem identidade bloqueia', () => {
  const gate = gatePercentageRollout({ percent: 50, identity: null });
  assert.equal(gate.passed, false);
  assert.equal(gate.reasonCode, 'ROLLOUT_NO_IDENTITY');
});

test('gate: todos os 13 gates existem na lista', () => {
  assert.equal(ACTIVATION_GATES.length, 13);
  const names = ACTIVATION_GATES.map((gate) => gate({}).name);
  assert.ok(names.includes('ENGINE_ENABLED'));
  assert.ok(names.includes('ACTIVATION_ENABLED'));
  assert.ok(names.includes('CAPABILITY_ENABLED'));
  assert.ok(names.includes('ENVIRONMENT_ALLOWED'));
  assert.ok(names.includes('TEST_USER_ALLOWED'));
  assert.ok(names.includes('PERCENTAGE_ROLLOUT'));
  assert.ok(names.includes('CONFIDENCE_THRESHOLD'));
  assert.ok(names.includes('RISK_THRESHOLD'));
  assert.ok(names.includes('WORKSPACE_COMPATIBLE'));
  assert.ok(names.includes('DATA_SUFFICIENCY'));
  assert.ok(names.includes('CAPABILITY_POLICY'));
  assert.ok(names.includes('CIRCUIT_BREAKER'));
  assert.ok(names.includes('FALLBACK_AVAILABILITY'));
});

test('gate: todos produzem forma estável', () => {
  for (const gate of ACTIVATION_GATES) {
    const result = gate({});
    assert.ok(['name', 'passed', 'reasonCode', 'severity', 'metadata'].every((k) => k in result));
    assert.doesNotThrow(() => JSON.stringify(result));
  }
});
