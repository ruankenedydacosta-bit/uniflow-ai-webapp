// Uni Engine — Fase 19: Rollout Control — testes para financialRolloutEligibility.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFinancialRolloutEligibility } from './financialRolloutEligibility.js';

const createConfig = (overrides = {}) => ({
  enabled: true,
  shadowMode: true,
  visibleEnabled: false,
  productionEnabled: false,
  canaryEnabled: false,
  canaryPercentage: 0,
  minimumConfidence: 0.9,
  requireEligibility: true,
  requireFactualValidation: true,
  requireIdentityMatch: true,
  requireConversationMatch: true,
  requireWorkspaceMatch: true,
  ...overrides,
});

const createRuntimeResult = (overrides = {}) => ({
  mode: 'shadow',
  discarded: false,
  status: 'completed',
  intent: { type: 'balance_query', confidence: 0.95 },
  narrative: { text: 'financial text', confidence: 0.95 },
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
  ...overrides,
});

test('evaluateFinancialRolloutEligibility - deve retornar elegível para configuração e dados válidos', () => {
  const config = createConfig({
    visibleEnabled: true,
    productionEnabled: true,
    requireIdentityMatch: true,
  });
  const identity = {
    workspaceId: 'ws-1',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    allowedIntents: ['balance_query'],
    deniedIntents: [],
    intent: { type: 'balance_query', confidence: 0.95 },
    pendingAction: null,
    confirmationState: null,
    legacyText: 'legacy text',
  };
  const runtimeResult = createRuntimeResult({
    confidence: 0.95,
    narrative: { text: 'financial text', confidence: 0.95 },
  });
  const eligibility = createEligibility();
  const factualValidation = { valid: true, reasonCodes: [] };
  const canaryAssignment = createCanaryAssignment();

  const result = evaluateFinancialRolloutEligibility(identity, runtimeResult, eligibility, factualValidation, config, canaryAssignment);
  assert.equal(result.eligible, true);
  assert.equal(result.reasonCodes.length, 0);
});

test('evaluateFinancialRolloutEligibility - deve ser inelegível quando productionEnabled false', () => {
  const config = createConfig({
    productionEnabled: false,
    visibleEnabled: true,
  });
  const identity = {
    workspaceId: 'ws-1',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    intent: { type: 'balance_query', confidence: 0.95 },
    pendingAction: null,
    confirmationState: null,
    legacyText: 'legacy text',
  };
  const runtimeResult = createRuntimeResult({
    confidence: 0.95,
    narrative: { text: 'financial text', confidence: 0.95 },
  });
  const eligibility = createEligibility();
  const factualValidation = { valid: true, reasonCodes: [] };
  const canaryAssignment = createCanaryAssignment();

  const result = evaluateFinancialRolloutEligibility(identity, runtimeResult, eligibility, factualValidation, config, canaryAssignment);
  assert.equal(result.eligible, false);
  assert.ok(result.reasonCodes.includes('PRODUCTION_DISABLED'));
});

test('evaluateFinancialRolloutEligibility - deve ser inelegível quando workspace diverge (FASE 19.1: workspaceId é campo próprio, nunca dentro de turnId)', () => {
  const config = createConfig({
    requireWorkspaceMatch: true,
    visibleEnabled: true,
    productionEnabled: true,
  });
  const identity = {
    workspaceId: 'ws-2',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    intent: { type: 'balance_query', confidence: 0.95 },
    pendingAction: null,
    confirmationState: null,
    legacyText: 'legacy text',
  };
  const runtimeResult = createRuntimeResult({
    turnId: 'turn-1',
    messageId: 'msg-1',
    workspaceId: 'ws-1',
    conversationId: 'conv-1',
    confidence: 0.95,
    narrative: { text: 'financial text', confidence: 0.95 },
  });
  const eligibility = createEligibility();
  const factualValidation = { valid: true, reasonCodes: [] };
  const canaryAssignment = createCanaryAssignment();

  const result = evaluateFinancialRolloutEligibility(identity, runtimeResult, eligibility, factualValidation, config, canaryAssignment);
  assert.equal(result.eligible, false);
  assert.ok(result.reasonCodes.includes('WORKSPACE_MISMATCH'));
});

test('evaluateFinancialRolloutEligibility - deve ser inelegível quando turn diverge (resultado de turno anterior)', () => {
  const config = createConfig({ requireTurnMatch: true, visibleEnabled: true, productionEnabled: true });
  const identity = {
    workspaceId: 'ws-1', conversationId: 'conv-1', turnId: 'turn-atual', messageId: 'msg-1',
    intent: { type: 'balance_query', confidence: 0.95 }, pendingAction: null, confirmationState: null, legacyText: 'legacy text',
  };
  const runtimeResult = createRuntimeResult({
    turnId: 'turn-anterior', messageId: 'msg-1', workspaceId: 'ws-1', conversationId: 'conv-1',
    confidence: 0.95, narrative: { text: 'financial text', confidence: 0.95 },
  });
  const result = evaluateFinancialRolloutEligibility(identity, runtimeResult, createEligibility(), { valid: true, reasonCodes: [] }, config, createCanaryAssignment());
  assert.equal(result.eligible, false);
  assert.ok(result.reasonCodes.includes('TURN_MISMATCH'));
});

test('evaluateFinancialRolloutEligibility - deve ser inelegível quando intent denied', () => {
  const config = createConfig({
    visibleEnabled: true,
    productionEnabled: true,
    deniedIntents: ['balance_query'],
  });
  const identity = {
    workspaceId: 'ws-1',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    intent: { type: 'balance_query', confidence: 0.95 },
    deniedIntents: ['balance_query'],
    pendingAction: null,
    confirmationState: null,
    legacyText: 'legacy text',
  };
  const runtimeResult = createRuntimeResult({
    confidence: 0.95,
    narrative: { text: 'financial text', confidence: 0.95 },
  });
  const eligibility = createEligibility();
  const factualValidation = { valid: true, reasonCodes: [] };
  const canaryAssignment = createCanaryAssignment();

  const result = evaluateFinancialRolloutEligibility(identity, runtimeResult, eligibility, factualValidation, config, canaryAssignment);
  assert.equal(result.eligible, false);
  assert.ok(result.reasonCodes.includes('INTENT_DENIED'));
});

test('evaluateFinancialRolloutEligibility - deve ser inelegível quando baixa confiança', () => {
  const config = createConfig({
    visibleEnabled: true,
    productionEnabled: true,
    minimumConfidence: 0.95,
  });
  const identity = {
    workspaceId: 'ws-1',
    conversationId: 'conv-1',
    turnId: 'turn-1',
    messageId: 'msg-1',
    intent: { type: 'balance_query', confidence: 0.95 },
    pendingAction: null,
    confirmationState: null,
    legacyText: 'legacy text',
  };
  const runtimeResult = createRuntimeResult({
    confidence: 0.8,
    narrative: { text: 'financial text', confidence: 0.8 },
  });
  const eligibility = createEligibility();
  const factualValidation = { valid: true, reasonCodes: [] };
  const canaryAssignment = createCanaryAssignment();

  const result = evaluateFinancialRolloutEligibility(identity, runtimeResult, eligibility, factualValidation, config, canaryAssignment);
  assert.equal(result.eligible, false);
  assert.ok(result.reasonCodes.includes('CONFIDENCE_INSUFFICIENT'));
});