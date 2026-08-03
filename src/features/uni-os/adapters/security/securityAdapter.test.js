import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlanningPlan } from '../planning/index.js';
import { createReflectionSnapshot } from '../reflection/index.js';
import { UNI_OS_ENABLED } from '../featureFlags.js';
import {
  adaptSecurityInput,
  createSecurityDecision,
  runSecurityAdapterShadow,
  UNI_OS_SECURITY_SCHEMA_VERSION,
} from './index.js';

const NOW = '2026-07-12T23:00:00.000Z';
const OPTIONS = Object.freeze({ now: () => NOW, idFactory: () => 'security-001' });

function plan(overrides = {}) {
  return createPlanningPlan({
    planId: 'plan-001',
    timestamp: NOW,
    intent: 'check_balance',
    confidence: 0.95,
    requiresConfirmation: false,
    steps: [{ type: 'respond_question', description: 'Consultar.', status: 'planned' }],
    ...overrides,
  });
}

function reflection(overrides = {}) {
  return createReflectionSnapshot({
    reflectionId: 'reflection-001',
    timestamp: NOW,
    overallRisk: 'LOW',
    confidence: 0.95,
    confirmationRequired: false,
    ambiguityDetected: false,
    inconsistencies: [],
    recommendations: [],
    ...overrides,
  });
}

function secure(overrides = {}) {
  return adaptSecurityInput({
    parsedIntent: { intent: 'check_balance', confidence: 0.95 },
    contextSnapshot: { workspace: { id: 'workspace-1' } },
    memorySnapshot: { financial: { accounts: [] } },
    planningSnapshot: plan(),
    reflectionSnapshot: reflection(),
    ...overrides,
  }, OPTIONS);
}

test('ALLOW é usado para plano consultivo válido', () => {
  const result = secure();
  assert.equal(result.status, 'ALLOW');
  assert.equal(result.blocked, false);
  assert.deepEqual(result.reasons, []);
  assert.equal(result.executionAllowed, false);
});

test('ALLOW_WITH_CONFIRMATION preserva confirmação sem permitir execução', () => {
  const result = secure({
    planningSnapshot: plan({
      intent: 'configuration',
      requiresConfirmation: true,
      steps: [{ type: 'ask_confirmation', description: 'Confirmar.', status: 'planned' }],
    }),
    reflectionSnapshot: reflection({ confirmationRequired: true }),
  });
  assert.equal(result.status, 'ALLOW_WITH_CONFIRMATION');
  assert.equal(result.confirmationRequired, true);
  assert.deepEqual(result.warnings, ['CONFIRMATION_REQUIRED']);
  assert.equal(result.executionAllowed, false);
});

test('BLOCK protege ação futura com permissões desconhecidas', () => {
  const result = secure({
    planningSnapshot: plan({
      intent: 'register_expense',
      requiresConfirmation: true,
      steps: [{ type: 'persist_transaction', description: 'Representar.', status: 'planned' }],
    }),
    reflectionSnapshot: reflection({ confirmationRequired: true }),
  });
  assert.equal(result.status, 'BLOCK');
  assert.equal(result.blocked, true);
  assert.ok(result.reasons.includes('PERMISSION_UNKNOWN'));
});

test('alta confiança é preservada em decisão segura', () => {
  assert.equal(secure().confidence, 0.95);
});

test('baixa confiança bloqueia e usa código estruturado', () => {
  const result = secure({
    reflectionSnapshot: reflection({
      overallRisk: 'MEDIUM',
      confidence: 0.35,
      inconsistencies: [{ code: 'LOW_CONFIDENCE' }],
    }),
  });
  assert.equal(result.status, 'BLOCK');
  assert.ok(result.reasons.includes('LOW_CONFIDENCE'));
  assert.ok(result.warnings.includes('REVIEW_RECOMMENDED'));
});

test('ambiguidade de conta e categoria é bloqueada', () => {
  const result = secure({
    reflectionSnapshot: reflection({
      overallRisk: 'HIGH',
      ambiguityDetected: true,
      inconsistencies: [{ code: 'MULTIPLE_ACCOUNTS' }, { code: 'MULTIPLE_CATEGORIES' }],
    }),
  });
  assert.ok(result.reasons.includes('AMBIGUOUS_ACCOUNT'));
  assert.ok(result.reasons.includes('AMBIGUOUS_CATEGORY'));
  assert.equal(result.status, 'BLOCK');
});

test('múltipla interpretação sem campo específico continua bloqueada', () => {
  const result = secure({
    reflectionSnapshot: reflection({ ambiguityDetected: true }),
  });
  assert.deepEqual(result.reasons, ['AMBIGUOUS_INTERPRETATION']);
  assert.equal(result.status, 'BLOCK');
});

test('risco alto sempre produz bloqueio explícito', () => {
  const result = secure({ reflectionSnapshot: reflection({ overallRisk: 'HIGH' }) });
  assert.ok(result.reasons.includes('HIGH_RISK'));
  assert.equal(result.status, 'BLOCK');
});

test('dados obrigatórios ausentes são mapeados sem preenchimento automático', () => {
  const result = secure({
    reflectionSnapshot: reflection({
      overallRisk: 'MEDIUM',
      inconsistencies: [
        { code: 'MISSING_ACCOUNT' },
        { code: 'MISSING_CATEGORY' },
        { code: 'MISSING_AMOUNT' },
        { code: 'MISSING_DATE' },
      ],
    }),
  });
  assert.deepEqual(result.reasons, [
    'MISSING_ACCOUNT', 'MISSING_CATEGORY', 'MISSING_AMOUNT', 'MISSING_DATE',
  ]);
  assert.equal(result.status, 'BLOCK');
});

test('conflito de contexto é convertido em reason seguro', () => {
  const result = secure({
    reflectionSnapshot: reflection({
      inconsistencies: [{ code: 'CONTEXT_WORKSPACE_CONFLICT' }],
    }),
  });
  assert.deepEqual(result.reasons, ['CONTEXT_CONFLICT']);
});

test('inconsistência desconhecida permanece bloqueada como conflito estrutural', () => {
  const result = secure({
    reflectionSnapshot: reflection({ inconsistencies: [{ code: 'UNEXPECTED' }] }),
  });
  assert.deepEqual(result.reasons, ['STRUCTURAL_CONFLICT']);
  assert.equal(result.status, 'BLOCK');
});

test('schema normaliza identidade, status e versão', () => {
  const result = secure();
  assert.equal(result.securityId, 'security-001');
  assert.equal(result.timestamp, NOW);
  assert.equal(result.metadata.version, UNI_OS_SECURITY_SCHEMA_VERSION);
  assert.equal(createSecurityDecision({ status: 'INVALID' }).status, 'BLOCK');
});

test('schema aplica deep freeze sem congelar coleções de entrada', () => {
  const reasons = ['LOW_CONFIDENCE'];
  const result = createSecurityDecision({ status: 'BLOCK', reasons });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.reasons), true);
  assert.equal(Object.isFrozen(reasons), false);
});

test('validação não modifica nenhum snapshot recebido', () => {
  const input = {
    parsedIntent: { intent: 'check_balance' },
    contextSnapshot: { workspace: { id: 'workspace-1' } },
    memorySnapshot: { financial: { accounts: [] } },
    planningSnapshot: plan(),
    reflectionSnapshot: reflection(),
  };
  const before = structuredClone(input);
  adaptSecurityInput(input, OPTIONS);
  assert.deepEqual(input, before);
});

test('feature flag compartilhada permanece desligada', async () => {
  let observed = false;
  const result = await runSecurityAdapterShadow({}, { observer: () => { observed = true; } });
  assert.equal(UNI_OS_ENABLED, false);
  assert.equal(result.status, 'DISABLED');
  assert.equal(observed, false);
});

test('modo sombra observa a decisão e descarta o resultado', async () => {
  let observed = null;
  const result = await runSecurityAdapterShadow({
    planningSnapshot: plan(), reflectionSnapshot: reflection(),
  }, {
    enabled: true,
    adapterOptions: OPTIONS,
    observer: async (security) => { observed = security; },
  });
  assert.equal(observed.securityId, 'security-001');
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.security, null);
});

test('falhas do modo sombra são controladas', async () => {
  const result = await runSecurityAdapterShadow({}, {
    enabled: true,
    observer: async () => { throw new Error('internal'); },
  });
  assert.equal(result.status, 'FAILED_SAFE');
  assert.equal(result.security, null);
});

test('logs DEV incluem somente decisão agregada e flags', async () => {
  const logs = [];
  await runSecurityAdapterShadow({
    parsedIntent: { intent: 'question', originalText: 'dado privado 80' },
    planningSnapshot: plan(),
    reflectionSnapshot: reflection(),
  }, {
    enabled: true,
    isDevelopment: true,
    adapterOptions: OPTIONS,
    logger: { info: (...args) => logs.push(args), warn: (...args) => logs.push(args) },
  });
  const serialized = JSON.stringify(logs);
  assert.match(serialized, /\[UNI OS\] Security/);
  assert.doesNotMatch(serialized, /privado|originalText|80/i);
});
