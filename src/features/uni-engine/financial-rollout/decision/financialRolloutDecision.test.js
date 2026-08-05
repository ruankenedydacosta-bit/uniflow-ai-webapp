// Uni Engine — Fase 19: Rollout Control — testes para financialRolloutDecision.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideFinancialRuntimeRollout } from './financialRolloutDecision.js';

const createConfig = (overrides = {}) => ({
  enabled: true,
  visibleEnabled: false,
  productionEnabled: false,
  emergencyRollback: false,
  minimumConfidence: 0.9,
  ...overrides,
});

const createIdentity = (overrides = {}) => ({
  userId: 'test-user',
  workspaceId: 'test-workspace',
  conversationId: 'test-conversation',
  turnId: 'test-turn',
  messageId: 'test-message',
  pendingAction: null,
  confirmationState: null,
  canaryEligible: true,
  ...overrides,
});

const createRuntimeResult = (overrides = {}) => ({
  version: '1.0',
  turnId: 'test-turn',
  messageId: 'test-message',
  mode: 'shadow',
  status: 'completed',
  shadowMode: true,
  influenceApplied: false,
  executionAllowed: false,
  legacyPreserved: true,
  executed: false,
  persisted: false,
  discarded: true,
  stages: { intent_resolution: { present: true, executed: false, status: 'pending', errorCode: null } },
  intent: { type: 'balance_query', confidence: 0.95 },
  temporal: { entity: 'this_month' },
  queryPlan: { queries: [] },
  executionResult: { status: 'executed', results: [] },
  periodComparison: null,
  narrative: { text: 'financial text', confidence: 0.95 },
  telemetry: null,
  safety: {},
  latencyMs: 0,
  timestamp: new Date().toISOString(),
  serializable: true,
  ...overrides,
});

const createEligibility = (overrides = {}) => ({
  eligible: true,
  influenceAllowed: true,
  fallbackRequired: false,
  confidence: 0.95,
  reasonCodes: [],
  ...overrides,
});

const createCanaryAssignment = (overrides = {}) => ({
  eligible: true,
  bucket: 25,
  cohort: 'canary',
  deterministic: true,
  reasonCodes: [],
  ...overrides,
});

test('decideFinancialRuntimeRollout - deve selecionar runtime quando eligibility e configuration permitirem', () => {
  const config = createConfig({
    visibleEnabled: true,
    productionEnabled: true,
    emergencyRollback: false,
  });
  const identity = createIdentity();
  const legacyText = 'legacy text';
  const runtimeResult = createRuntimeResult({
    confidence: 0.95,
    narrative: { text: 'financial text', confidence: 0.95 },
  });
  const financialSelection = { selectedSource: 'financial_runtime', selectedText: 'financial text' };
  const eligible = createEligibility();
  const canaryAssignment = createCanaryAssignment();

  const result = decideFinancialRuntimeRollout(identity, legacyText, runtimeResult, financialSelection, eligible, canaryAssignment, config);
  assert.equal(result.selectedSource, 'financial_runtime');
  assert.equal(result.selectedText, 'financial text');
  assert.equal(result.influenceApplied, true);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.rolloutEligible, true);
});

test('decideFinancialRuntimeRollout - deve selecionar legacy quando visibleEnabled false', () => {
  const config = createConfig({
    visibleEnabled: false,
    productionEnabled: true,
  });
  const identity = createIdentity();
  const legacyText = 'legacy text';
  const runtimeResult = createRuntimeResult({
    confidence: 0.95,
    narrative: { text: 'financial text', confidence: 0.95 },
  });
  const financialSelection = { selectedSource: 'financial_runtime', selectedText: 'financial text' };
  const eligible = createEligibility();
  const canaryAssignment = createCanaryAssignment();

  const result = decideFinancialRuntimeRollout(identity, legacyText, runtimeResult, financialSelection, eligible, canaryAssignment, config);
  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.selectedText, 'legacy text');
  assert.equal(result.influenceApplied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.rolloutEligible, false);
});

test('decideFinancialRuntimeRollout - deve selecionar legacy quando productionEnabled false', () => {
  const config = createConfig({
    visibleEnabled: true,
    productionEnabled: false,
  });
  const identity = createIdentity();
  const legacyText = 'legacy text';
  const runtimeResult = createRuntimeResult({
    confidence: 0.95,
    narrative: { text: 'financial text', confidence: 0.95 },
  });
  const financialSelection = { selectedSource: 'financial_runtime', selectedText: 'financial text' };
  const eligible = createEligibility();
  const canaryAssignment = createCanaryAssignment();

  const result = decideFinancialRuntimeRollout(identity, legacyText, runtimeResult, financialSelection, eligible, canaryAssignment, config);
  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.selectedText, 'legacy text');
  assert.equal(result.influenceApplied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.rolloutEligible, false);
});

test('decideFinancialRuntimeRollout - deve selecionar legacy quando emergencyRollback true', () => {
  const config = createConfig({
    visibleEnabled: true,
    productionEnabled: true,
    emergencyRollback: true,
  });
  const identity = createIdentity();
  const legacyText = 'legacy text';
  const runtimeResult = createRuntimeResult({
    confidence: 0.95,
    narrative: { text: 'financial text', confidence: 0.95 },
  });
  const financialSelection = { selectedSource: 'financial_runtime', selectedText: 'financial text' };
  const eligible = createEligibility();
  const canaryAssignment = createCanaryAssignment();

  const result = decideFinancialRuntimeRollout(identity, legacyText, runtimeResult, financialSelection, eligible, canaryAssignment, config);
  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.selectedText, 'legacy text');
  assert.equal(result.influenceApplied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.rolloutEligible, false);
  assert.ok(result.reasonCodes.includes('emergency_rollback'));
});

test('decideFinancialRuntimeRollout - deve selecionar legacy quando canaryAssignment not eligible', () => {
  const config = createConfig({
    visibleEnabled: true,
    productionEnabled: true,
  });
  const identity = createIdentity();
  const legacyText = 'legacy text';
  const runtimeResult = createRuntimeResult({
    confidence: 0.95,
    narrative: { text: 'financial text', confidence: 0.95 },
  });
  const financialSelection = { selectedSource: 'financial_runtime', selectedText: 'financial text' };
  const eligible = createEligibility();
  const canaryAssignment = createCanaryAssignment({ eligible: false });

  const result = decideFinancialRuntimeRollout(identity, legacyText, runtimeResult, financialSelection, eligible, canaryAssignment, config);
  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.selectedText, 'legacy text');
  assert.equal(result.influenceApplied, false);
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.rolloutEligible, false);
  assert.ok(result.reasonCodes.includes('canary_ineligible'));
});