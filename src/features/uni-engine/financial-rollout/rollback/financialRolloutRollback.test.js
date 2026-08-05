// Uni Engine — Fase 19: Rollout Control — testes para financialRolloutRollback.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollbackFinancialRuntimeRollout } from './financialRolloutRollback.js';

const createConfig = (overrides = {}) => ({
  enabled: true,
  emergencyRollback: false,
  visibleEnabled: false,
  productionEnabled: false,
  canaryEnabled: false,
  ...overrides,
});

const createDecision = (overrides = {}) => ({
  selectedSource: 'financial_runtime',
  selectedText: 'financial text',
  influenceApplied: true,
  fallbackUsed: false,
  rolloutEligible: true,
  canaryAssigned: true,
  confidence: 0.95,
  reasonCodes: [],
  safety: { blockedBy: [], confidenceApproved: true },
  diagnostics: { runtimeEvaluated: true, eligibleEvaluated: true, confidenceEvaluated: true },
  ...overrides,
});

test('rollbackFinancialRuntimeRollout - deve aplicar rollback quando emergencyRollback true', () => {
  const config = createConfig({ emergencyRollback: true });
  const identity = { legacyText: 'legacy text' };
  const runtimeResult = { mode: 'shadow' };
  const decision = createDecision();

  const result = rollbackFinancialRuntimeRollout(identity, runtimeResult, config, decision);
  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.selectedText, 'legacy text');
  assert.equal(result.influenceApplied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.rolloutEligible, false);
  assert.equal(result.canaryAssigned, false);
  assert.equal(result.confidence, 0);
  assert.ok(result.reasonCodes.includes('EMERGENCY_ROLLBACK_TRIGGERED'));
});

test('rollbackFinancialRuntimeRollout - deve aplicar rollback quando rollout desativado', () => {
  const config = createConfig({ enabled: false });
  const identity = { legacyText: 'legacy text' };
  const runtimeResult = { mode: 'shadow' };
  const decision = createDecision();

  const result = rollbackFinancialRuntimeRollout(identity, runtimeResult, config, decision);
  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.selectedText, 'legacy text');
  assert.equal(result.influenceApplied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.rolloutEligible, false);
  assert.equal(result.canaryAssigned, false);
  assert.equal(result.confidence, 0);
  assert.ok(result.reasonCodes.includes('ROLLOUT_DISABLED'));
});

test('rollbackFinancialRuntimeRollout - deve retornar decisão quando nenhum rollback necessário', () => {
  const config = createConfig({
    enabled: true,
    emergencyRollback: false,
    visibleEnabled: true,
    productionEnabled: true,
  });
  const identity = { legacyText: 'legacy text' };
  const runtimeResult = { mode: 'shadow' };
  const decision = createDecision();

  const result = rollbackFinancialRuntimeRollout(identity, runtimeResult, config, decision);
  assert.equal(result.selectedSource, 'financial_runtime');
  assert.equal(result.selectedText, 'financial text');
  assert.equal(result.influenceApplied, true);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.rolloutEligible, true);
  assert.equal(result.canaryAssigned, true);
  assert.equal(result.confidence, 0.95);
  assert.equal(result.reasonCodes.length, 0);
});