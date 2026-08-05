// Uni Engine — Fase 19: Rollout Control — testes para financialRolloutIntegration.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runFinancialRolloutIntegration, validateFinancialRolloutIntegration } from './financialRolloutIntegration.js';

const createConfig = (overrides = {}) => ({
  enabled: true,
  shadowMode: true,
  visibleEnabled: false,
  productionEnabled: false,
  canaryEnabled: false,
  canaryPercentage: 0,
  minimumConfidence: 0.9,
  telemetryEnabled: false,
  emergencyRollback: false,
  requireEligibility: true,
  requireFactualValidation: true,
  requireIdentityMatch: true,
  requireConversationMatch: true,
  requireWorkspaceMatch: true,
  requireTurnMatch: true,
  requireMessageMatch: true,
  allowedIntents: [],
  deniedIntents: [],
  ...overrides,
});

const createIdentity = (overrides = {}) => ({
  userId: 'test-user',
  workspaceId: 'test-workspace',
  conversationId: 'test-conversation',
  turnId: 'test-turn',
  messageId: 'test-message',
  legacyText: 'legacy response',
  pendingAction: null,
  confirmationState: null,
  ...overrides,
});

// FASE 19.1: workspaceId/conversationId são campos PRÓPRIOS do runtimeResult
// (irmãos de turnId/messageId), nunca aninhados dentro de turnId -- turnId
// continua sendo a mesma string simples de sempre.
const createRuntimeResult = (overrides = {}) => ({
  version: '1.0',
  turnId: 'test-turn',
  messageId: 'test-message',
  workspaceId: 'test-workspace',
  conversationId: 'test-conversation',
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
  narrative: { text: 'Some financial narrative', confidence: 0.95 },
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
  intentSupported: true,
  temporalResolved: true,
  queryValid: true,
  executionSuccessful: true,
  dataAvailable: true,
  factsValidated: true,
  narrativeValid: true,
  safetyApproved: true,
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

test('runFinancialRolloutIntegration - deve retornar fallback legacy quando rollout desativado', () => {
  const config = createConfig({ enabled: false });
  const identity = createIdentity();
  const legacyText = 'legacy text';
  const runtimeResult = createRuntimeResult();
  const financialSelection = { selectedSource: 'financial_runtime', selectedText: 'financial text' };
  const eligible = createEligibility();
  const canaryAssignment = createCanaryAssignment();

  const result = runFinancialRolloutIntegration({
    legacyText,
    runtimeResult,
    financialSelection,
    config,
    identity,
    eligible,
    canaryAssignment,
  });

  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.selectedText, 'legacy text');
  assert.equal(result.influenceApplied, false);
  assert.equal(result.rollbackUsed, true);
  assert.ok(result.reasonCodes.includes('ROLLOUT_DISABLED'));
});

test('runFinancialRolloutIntegration - deve selecionar runtime quando rollout habilitado', () => {
  const config = createConfig({
    enabled: true,
    visibleEnabled: true,
    productionEnabled: true,
    canaryEnabled: true,
    canaryPercentage: 100,
    minimumConfidence: 0.9,
  });
  const identity = createIdentity();
  const legacyText = 'legacy text';
  const runtimeResult = createRuntimeResult({
    confidence: 0.95,
    narrative: { text: 'financial narrative', confidence: 0.95 },
  });
  const financialSelection = { selectedSource: 'financial_runtime', selectedText: 'financial text' };
  const eligible = createEligibility();
  const canaryAssignment = createCanaryAssignment();

  const result = runFinancialRolloutIntegration({
    legacyText,
    runtimeResult,
    financialSelection,
    config,
    identity,
    eligible,
    canaryAssignment,
  });

  assert.equal(result.selectedSource, 'financial_runtime');
  assert.equal(result.selectedText, 'financial narrative');
  assert.equal(result.influenceApplied, true);
  assert.equal(result.rollbackUsed, false);
});

test('runFinancialRolloutIntegration - deve aplicar rollback de emergência quando emergencyRollback true', () => {
  const config = createConfig({
    enabled: true,
    emergencyRollback: true,
  });
  const identity = createIdentity();
  const legacyText = 'legacy text';
  const runtimeResult = createRuntimeResult({
    confidence: 0.95,
    narrative: { text: 'financial narrative', confidence: 0.95 },
  });
  const financialSelection = { selectedSource: 'financial_runtime', selectedText: 'financial text' };
  const eligible = createEligibility();
  const canaryAssignment = createCanaryAssignment();

  const result = runFinancialRolloutIntegration({
    legacyText,
    runtimeResult,
    financialSelection,
    config,
    identity,
    eligible,
    canaryAssignment,
  });

  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.selectedText, 'legacy text');
  assert.equal(result.influenceApplied, false);
  assert.equal(result.rollbackUsed, true);
  assert.ok(result.reasonCodes.includes('EMERGENCY_ROLLBACK_TRIGGERED'));
});

test('validateFinancialRolloutIntegration - deve validar integração válida', () => {
  const options = {
    legacyText: 'legacy text',
    runtimeResult: { mode: 'shadow' },
    financialSelection: { selectedSource: 'financial_runtime' },
    config: createConfig(),
    identity: createIdentity(),
    canaryAssignment: createCanaryAssignment(),
  };
  const result = validateFinancialRolloutIntegration(options);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test('validateFinancialRolloutIntegration - deve rejeitar integração ausente de legacyText', () => {
  const options = {
    runtimeResult: { mode: 'shadow' },
    financialSelection: { selectedSource: 'financial_runtime' },
    config: createConfig(),
    identity: createIdentity(),
  };
  const result = validateFinancialRolloutIntegration(options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('legacyText is required and must be a string'));
});

test('validateFinancialRolloutIntegration - deve rejeitar integração ausente de runtimeResult', () => {
  const options = {
    legacyText: 'legacy text',
    financialSelection: { selectedSource: 'financial_runtime' },
    config: createConfig(),
    identity: createIdentity(),
  };
  const result = validateFinancialRolloutIntegration(options);
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('runtimeResult is required and must be an object'));
});

// ============================================================================
// ETAPA 5 (consolidação Fase 19): testes de integração real cobrindo os
// gates de segurança que faltavam -- todos chamam a função real, nenhum
// mock do próprio decisor.
// ============================================================================

test('runFinancialRolloutIntegration - production desligada retorna legado', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: false, canaryEnabled: true, canaryPercentage: 100 });
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult(),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config,
    identity: createIdentity(),
    eligible: true,
    canaryAssignment: createCanaryAssignment(),
  });
  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.influenceApplied, false);
});

test('runFinancialRolloutIntegration - canary desligado retorna legado (control)', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: false, canaryPercentage: 50 });
  const canaryAssignment = { eligible: false, bucket: 0, cohort: 'control', deterministic: true, reasonCodes: ['CANARY_DISABLED_OR_EMPTY'] };
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult(),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config,
    identity: createIdentity(),
    eligible: true,
    canaryAssignment,
  });
  assert.equal(result.selectedSource, 'legacy');
  assert.equal(result.canaryAssigned, false);
});

test('runFinancialRolloutIntegration - canaryPercentage 0 retorna legado (control)', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 0 });
  const canaryAssignment = { eligible: false, bucket: 0, cohort: 'control', deterministic: true, reasonCodes: ['CANARY_DISABLED_OR_EMPTY'] };
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult(),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config,
    identity: createIdentity(),
    eligible: true,
    canaryAssignment,
  });
  assert.equal(result.selectedSource, 'legacy');
});

test('runFinancialRolloutIntegration - usuário fora do bucket de canary retorna legado (control)', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 10 });
  const canaryAssignment = { eligible: false, bucket: 87, cohort: 'control', deterministic: true, reasonCodes: [] };
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult(),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config,
    identity: createIdentity(),
    eligible: true,
    canaryAssignment,
  });
  assert.equal(result.selectedSource, 'legacy');
});

test('runFinancialRolloutIntegration - usuário dentro do bucket só usa runtime quando TODOS os gates aprovam', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 100, minimumConfidence: 0.9 });
  const canaryAssignment = createCanaryAssignment({ eligible: true, bucket: 5 });
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult({ confidence: 0.95, narrative: { text: 'narrativa', confidence: 0.95 } }),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config,
    identity: createIdentity(),
    eligible: true,
    canaryAssignment,
  });
  assert.equal(result.selectedSource, 'financial_runtime');
});

test('runFinancialRolloutIntegration - confidence insuficiente retorna legado', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 100, minimumConfidence: 0.9 });
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult({ confidence: 0.5, narrative: { text: 'narrativa', confidence: 0.5 } }),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config,
    identity: createIdentity(),
    eligible: true,
    canaryAssignment: createCanaryAssignment(),
  });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('confidence_insufficient'));
});

test('runFinancialRolloutIntegration - eligible=false (Fase 18 reprovou -- intent fora da allowlist, factual inválida etc.) retorna legado', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 100 });
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult(),
    financialSelection: { selectedSource: 'legacy', selectedText: 'legacy text' },
    config,
    identity: createIdentity(),
    eligible: false,
    canaryAssignment: createCanaryAssignment(),
  });
  assert.equal(result.selectedSource, 'legacy');
});

test('runFinancialRolloutIntegration - Pending Action ativa retorna legado', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 100 });
  const identity = createIdentity({ pendingAction: { status: 'active' } });
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult(),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config,
    identity,
    eligible: true,
    canaryAssignment: createCanaryAssignment(),
  });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('pending_action'));
});

test('runFinancialRolloutIntegration - confirmação pendente retorna legado', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 100 });
  const identity = createIdentity({ confirmationState: { pending: true } });
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult(),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config,
    identity,
    eligible: true,
    canaryAssignment: createCanaryAssignment(),
  });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('confirmation_pending'));
});

test('runFinancialRolloutIntegration - identidade sem workspaceId retorna legado', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 100 });
  const identity = createIdentity({ workspaceId: undefined });
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult(),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config,
    identity,
    eligible: true,
    canaryAssignment: createCanaryAssignment(),
  });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('identity_missing'));
});

test('runFinancialRolloutIntegration - narrativa vazia retorna legado', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 100 });
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult({ narrative: { text: '', confidence: 0.95 } }),
    financialSelection: { selectedSource: 'legacy', selectedText: 'legacy text' },
    config,
    identity: createIdentity(),
    eligible: true,
    canaryAssignment: createCanaryAssignment(),
  });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('narrative_invalid'));
});

test('runFinancialRolloutIntegration - erro interno / input malformado nunca lança e sempre cai para legado', () => {
  assert.doesNotThrow(() => runFinancialRolloutIntegration({}));
  const result = runFinancialRolloutIntegration({ config: {} });
  assert.equal(result.selectedSource, 'legacy');
});

test('runFinancialRolloutIntegration - resultado é sempre serializável (telemetria nunca carrega dados brutos não sanitizados)', () => {
  const config = createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 100 });
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult(),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config,
    identity: createIdentity(),
    eligible: true,
    canaryAssignment: createCanaryAssignment(),
  });
  assert.doesNotThrow(() => JSON.stringify(result));
});

// ============================================================================
// FASE 19.1: identidade, escopo e isolamento -- workspaceId/conversationId/
// turnId/messageId são SEMPRE comparados como campos próprios e reais (nunca
// extraídos de dentro de turnId, que segue sendo uma string simples).
// ============================================================================

function runWithIdentity(identityOverrides = {}, runtimeOverrides = {}, configOverrides = {}) {
  return runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult(runtimeOverrides),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config: createConfig({
      enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 100,
      ...configOverrides,
    }),
    identity: createIdentity(identityOverrides),
    eligible: true,
    canaryAssignment: createCanaryAssignment(),
  });
}

test('FASE 19.1: identidade completa e compatível usa o runtime', () => {
  const result = runWithIdentity();
  assert.equal(result.selectedSource, 'financial_runtime');
});

test('FASE 19.1: workspace ausente na identidade retorna legado', () => {
  const result = runWithIdentity({ workspaceId: undefined });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('identity_missing'));
});

test('FASE 19.1: workspace divergente entre identidade e runtimeResult retorna legado', () => {
  const result = runWithIdentity({}, { workspaceId: 'other-workspace' });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('workspace_mismatch'));
});

test('FASE 19.1: conversation divergente entre identidade e runtimeResult retorna legado', () => {
  const result = runWithIdentity({}, { conversationId: 'other-conversation' });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('conversation_mismatch'));
});

test('FASE 19.1: turn divergente (resultado de turno anterior) retorna legado', () => {
  const result = runWithIdentity({ turnId: 'turn-atual' }, { turnId: 'turn-anterior' });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('turn_mismatch'));
});

test('FASE 19.1: message divergente retorna legado', () => {
  const result = runWithIdentity({ messageId: 'msg-atual' }, { messageId: 'msg-anterior' });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('message_mismatch'));
});

test('FASE 19.1: resultado de outro workspace (troca de workspaceId no meio do turno) retorna legado', () => {
  // identidade atual mudou de workspace; o runtimeResult foi produzido para o workspace antigo
  const result = runWithIdentity({ workspaceId: 'workspace-novo' }, { workspaceId: 'workspace-antigo' });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('workspace_mismatch'));
});

test('FASE 19.1: troca de conversationId (usuário abriu outra conversa) retorna legado', () => {
  const result = runWithIdentity({ conversationId: 'conversa-nova' }, { conversationId: 'conversa-antiga' });
  assert.equal(result.selectedSource, 'legacy');
  assert.ok(result.reasonCodes.includes('conversation_mismatch'));
});

test('FASE 19.1: repetição do mesmo turno (mesma identidade, mesmo runtimeResult) usa o runtime normalmente', () => {
  const result = runWithIdentity({ turnId: 'turn-1', messageId: 'msg-1' }, { turnId: 'turn-1', messageId: 'msg-1' });
  assert.equal(result.selectedSource, 'financial_runtime');
});

test('FASE 19.1: gates de identidade desligados (requireXMatch=false) nunca bloqueiam por mismatch', () => {
  const result = runWithIdentity(
    { workspaceId: 'ws-a', conversationId: 'conv-a', turnId: 'turn-a', messageId: 'msg-a' },
    { workspaceId: 'ws-b', conversationId: 'conv-b', turnId: 'turn-b', messageId: 'msg-b' },
    { requireWorkspaceMatch: false, requireConversationMatch: false, requireTurnMatch: false, requireMessageMatch: false },
  );
  assert.equal(result.selectedSource, 'financial_runtime');
});

test('FASE 19.1: identidade malformada (não-objeto) nunca lança e cai para legado', () => {
  assert.doesNotThrow(() => runWithIdentity(null));
  const result = runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: createRuntimeResult(),
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config: createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 100 }),
    identity: 'not-an-object',
    eligible: true,
    canaryAssignment: createCanaryAssignment(),
  });
  assert.equal(result.selectedSource, 'legacy');
});

test('FASE 19.1: erro interno de gate (runtimeResult malformado) nunca lança e cai para legado', () => {
  const call = () => runFinancialRolloutIntegration({
    legacyText: 'legacy text',
    runtimeResult: 'not-an-object',
    financialSelection: { selectedSource: 'financial_runtime', selectedText: 'financial text' },
    config: createConfig({ enabled: true, visibleEnabled: true, productionEnabled: true, canaryEnabled: true, canaryPercentage: 100 }),
    identity: createIdentity(),
    eligible: true,
    canaryAssignment: createCanaryAssignment(),
  });
  assert.doesNotThrow(call);
  assert.equal(call().selectedSource, 'legacy');
});

test('FASE 19.1: StrictMode -- duas invocações idênticas em sequência produzem o mesmo resultado, sem efeito colateral cumulativo', () => {
  const first = runWithIdentity();
  const second = runWithIdentity();
  assert.deepEqual(first, second);
});

test('FASE 19.1: resultado sempre serializável, mesmo bloqueado por identidade -- nenhum ID cru vaza para fora dos reasonCodes sanitizados', () => {
  const result = runWithIdentity({}, { workspaceId: 'other-workspace' });
  assert.doesNotThrow(() => JSON.stringify(result));
  assert.ok(result.reasonCodes.every(code => /^[a-z_]+$/.test(code)), 'reasonCodes devem ser códigos sanitizados, nunca IDs crus');
});

test('FASE 19.1: nenhuma escrita financeira, nenhuma execução extra -- resultado permanece somente leitura mesmo com identidade compatível', () => {
  const result = runWithIdentity();
  assert.equal(result.influenceApplied, true);
  assert.equal(result.rollbackUsed, false);
  // runFinancialRolloutIntegration nunca expõe um método de escrita/execução;
  // o contrato de retorno é puramente descritivo (seleção de texto).
  assert.ok(!('write' in result));
  assert.ok(!('execute' in result));
});