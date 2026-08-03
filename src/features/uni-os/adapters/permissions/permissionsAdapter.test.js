import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanningPlan } from '../planning/index.js';
import { createReflectionSnapshot } from '../reflection/index.js';
import { createSecurityDecision } from '../security/index.js';
import { UNI_OS_ENABLED } from '../featureFlags.js';
import {
  adaptPermissionsInput,
  createPermissionsSnapshot,
  runPermissionsAdapterShadow,
  UNI_OS_PERMISSIONS_SCHEMA_VERSION,
} from './index.js';

const NOW = '2026-07-13T00:00:00.000Z';
const OPTIONS = Object.freeze({ now: () => NOW, idFactory: () => 'permissions-001' });

function plan(overrides = {}) {
  return createPlanningPlan({
    intent: 'check_balance',
    confidence: 0.95,
    requiresConfirmation: false,
    steps: [{ type: 'respond_question', description: 'Consultar.', status: 'planned' }],
    ...overrides,
  });
}

function reflection(overrides = {}) {
  return createReflectionSnapshot({
    overallRisk: 'LOW',
    confidence: 0.95,
    confirmationRequired: false,
    inconsistencies: [],
    recommendations: [],
    ...overrides,
  });
}

function security(overrides = {}) {
  return createSecurityDecision({
    status: 'ALLOW',
    confidence: 0.95,
    risk: 'LOW',
    reasons: [],
    warnings: [],
    ...overrides,
  });
}

function permissionInput(overrides = {}) {
  return {
    parsedIntent: { intent: 'check_balance' },
    contextSnapshot: {
      user: { id: 'user-1' },
      metadata: { version: '1.0' },
    },
    memorySnapshot: { metadata: { version: '1.0' } },
    planningSnapshot: plan(),
    reflectionSnapshot: reflection(),
    securitySnapshot: security(),
    ...overrides,
  };
}

test('AUTHORIZED concede somente scopes cognitivos disponíveis', () => {
  const result = adaptPermissionsInput(permissionInput(), OPTIONS);
  assert.equal(result.status, 'AUTHORIZED');
  assert.deepEqual(result.scopes, [
    'READ_CONVERSATION', 'READ_CONTEXT', 'READ_PROFILE', 'READ_MEMORY',
  ]);
  assert.deepEqual(result.grants, result.scopes);
  assert.equal(result.executionAllowed, false);
});

test('AUTHORIZED_WITH_CONFIRMATION representa consentimento pendente', () => {
  const result = adaptPermissionsInput(permissionInput({
    planningSnapshot: plan({ requiresConfirmation: true }),
    securitySnapshot: security({
      status: 'ALLOW_WITH_CONFIRMATION',
      confirmationRequired: true,
      warnings: ['CONFIRMATION_REQUIRED'],
    }),
  }), OPTIONS);
  assert.equal(result.status, 'AUTHORIZED_WITH_CONFIRMATION');
  assert.ok(result.scopes.includes('REQUEST_CONFIRMATION'));
  assert.ok(result.grants.includes('REQUEST_CONFIRMATION'));
  assert.deepEqual(result.restrictions, ['CONFIRMATION_REQUIRED']);
});

test('NOT_AUTHORIZED não concede grants', () => {
  const result = adaptPermissionsInput(permissionInput({
    securitySnapshot: security({ status: 'BLOCK', risk: 'HIGH', reasons: ['HIGH_RISK'] }),
  }), OPTIONS);
  assert.equal(result.status, 'NOT_AUTHORIZED');
  assert.deepEqual(result.grants, []);
  assert.deepEqual(result.restrictions, ['HIGH_RISK']);
  assert.deepEqual(result.reasons, ['SECURITY_BLOCKED']);
});

test('UNKNOWN é usado quando decisão de segurança não existe', () => {
  const result = adaptPermissionsInput(permissionInput({ securitySnapshot: {} }), OPTIONS);
  assert.equal(result.status, 'UNKNOWN');
  assert.deepEqual(result.grants, []);
  assert.deepEqual(result.restrictions, ['UNKNOWN_PERMISSION']);
  assert.deepEqual(result.reasons, ['SECURITY_DECISION_MISSING']);
});

test('PERMISSION_UNKNOWN isolada permanece UNKNOWN', () => {
  const result = adaptPermissionsInput(permissionInput({
    securitySnapshot: security({ status: 'BLOCK', reasons: ['PERMISSION_UNKNOWN'] }),
  }), OPTIONS);
  assert.equal(result.status, 'UNKNOWN');
  assert.deepEqual(result.restrictions, ['UNKNOWN_PERMISSION']);
  assert.deepEqual(result.reasons, ['SECURITY_PERMISSION_UNKNOWN']);
});

test('ação futura cria scope de proposta, nunca grant desconhecido', () => {
  const result = adaptPermissionsInput(permissionInput({
    planningSnapshot: plan({
      intent: 'register_expense',
      steps: [{ type: 'persist_transaction', description: 'Representar.', status: 'planned' }],
    }),
    securitySnapshot: security({ status: 'BLOCK', reasons: ['PERMISSION_UNKNOWN'] }),
  }), OPTIONS);
  assert.ok(result.scopes.includes('PROPOSE_FINANCIAL_ACTION'));
  assert.equal(result.grants.includes('PROPOSE_FINANCIAL_ACTION'), false);
  assert.equal(result.executionAllowed, false);
});

test('restrições agregam confiança, ambiguidade e dados ausentes', () => {
  const result = adaptPermissionsInput(permissionInput({
    securitySnapshot: security({
      status: 'BLOCK',
      reasons: ['LOW_CONFIDENCE', 'AMBIGUOUS_ACCOUNT', 'MISSING_AMOUNT'],
    }),
  }), OPTIONS);
  assert.deepEqual(result.restrictions, [
    'LOW_CONFIDENCE', 'AMBIGUITY_PRESENT', 'REQUIRED_DATA_MISSING',
  ]);
});

test('risco, contexto e estrutura usam restrições próprias', () => {
  const result = adaptPermissionsInput(permissionInput({
    securitySnapshot: security({
      status: 'BLOCK',
      reasons: ['HIGH_RISK', 'CONTEXT_CONFLICT', 'STRUCTURAL_CONFLICT'],
    }),
  }), OPTIONS);
  assert.deepEqual(result.restrictions, [
    'HIGH_RISK', 'CONTEXT_CONFLICT', 'STRUCTURAL_CONFLICT',
  ]);
});

test('schema filtra scopes, grants e status desconhecidos', () => {
  const result = createPermissionsSnapshot({
    status: 'INVALID',
    scopes: ['READ_CONTEXT', 'TECHNICAL_ADMIN'],
    grants: ['READ_CONTEXT', 'READ_MEMORY'],
  });
  assert.equal(result.status, 'UNKNOWN');
  assert.deepEqual(result.scopes, ['READ_CONTEXT']);
  assert.deepEqual(result.grants, ['READ_CONTEXT']);
  assert.equal(result.executionAllowed, false);
});

test('schema preenche identidade, timestamp e versão', () => {
  const result = adaptPermissionsInput(permissionInput(), OPTIONS);
  assert.equal(result.permissionsId, 'permissions-001');
  assert.equal(result.timestamp, NOW);
  assert.equal(result.metadata.version, UNI_OS_PERMISSIONS_SCHEMA_VERSION);
});

test('schema aplica deep freeze sem congelar entradas', () => {
  const scopes = ['READ_CONTEXT'];
  const result = createPermissionsSnapshot({ scopes, grants: scopes });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.scopes), true);
  assert.equal(Object.isFrozen(scopes), false);
});

test('adapter não modifica nenhum snapshot recebido', () => {
  const input = permissionInput();
  const before = structuredClone(input);
  adaptPermissionsInput(input, OPTIONS);
  assert.deepEqual(input, before);
});

test('feature flag compartilhada permanece desligada', async () => {
  let observed = false;
  const result = await runPermissionsAdapterShadow({}, { observer: () => { observed = true; } });
  assert.equal(UNI_OS_ENABLED, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(observed, false);
});

test('modo sombra observa permissões e descarta resultado', async () => {
  let observed = null;
  const result = await runPermissionsAdapterShadow(permissionInput(), {
    enabled: true,
    adapterOptions: OPTIONS,
    observer: async (permissions) => { observed = permissions; },
  });
  assert.equal(observed.permissionsId, 'permissions-001');
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.permissions, null);
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runPermissionsAdapterShadow({}, {
    enabled: true,
    observer: async () => { throw new Error('internal'); },
  });
  assert.equal(result.status, 'FAILED_SAFE');
  assert.equal(result.permissions, null);
});

test('logs DEV incluem somente status, scopes, restrições e reasons', async () => {
  const logs = [];
  await runPermissionsAdapterShadow(permissionInput({
    parsedIntent: { intent: 'question', originalText: 'dado privado 80' },
  }), {
    enabled: true,
    isDevelopment: true,
    adapterOptions: OPTIONS,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /\[UNI OS\] Permissions/);
  assert.doesNotMatch(serialized, /privado|originalText|80/i);
});
