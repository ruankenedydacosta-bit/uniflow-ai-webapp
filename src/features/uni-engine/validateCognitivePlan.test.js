// Testes do validador do plano cognitivo (Fase 1 — Shadow Mode).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateCognitivePlan } from './validateCognitivePlan.js';
import { buildBaseInput } from './testFixtures.js';

function epistemicWith(overrides = {}) {
  return {
    amount: { value: 50, status: 'confirmed_user', confidence: 1 },
    account: { value: 'Nubank', status: 'confirmed_database', confidence: 0.9 },
    category: { value: 'Alimentação', status: 'inferred_high', confidence: 0.8 },
    ...overrides,
  };
}

function validateWith({
  text = 'Gastei 50 reais no mercado',
  plan,
  epistemic = epistemicWith(),
  pendingIntent = null,
  messageType = 'action',
  primaryIntent = plan?.planType ?? 'register_expense',
  overrides = {},
}) {
  const input = buildBaseInput({
    message: { text },
    ...overrides,
  });
  return validateCognitivePlan(input, {
    analyzed: { compatibility: { pendingIntent } },
    classification: { messageType, primaryIntent },
    epistemic,
    plan,
  });
}

test('validação 44: plano ask com campo ausente requer clarificação sem bloquear', () => {
  const result = validateWith({
    plan: {
      planType: 'register_expense',
      decision: 'ask',
      missingFields: ['account'],
      theoreticalExecutor: 'execute_confirmed_financial_action',
      requiresConfirmation: false,
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.requiresClarification, true);
  assert.ok(result.warnings.includes('ACCOUNT_MISSING'));
  assert.deepEqual(result.blockedReasons, []);
});

test('validação 45: plano completo com confirmação é válido', () => {
  const result = validateWith({
    plan: {
      planType: 'register_expense',
      decision: 'confirm',
      missingFields: [],
      theoreticalExecutor: 'execute_confirmed_financial_action',
      requiresConfirmation: true,
    },
  });
  assert.equal(result.valid, true);
  assert.equal(result.requiresClarification, false);
  assert.ok(result.warnings.includes('CONFIRMATION_REQUIRED'));
});

test('validação 46: usuário sem workspace é bloqueado', () => {
  const result = validateWith({
    plan: {
      planType: 'register_expense',
      decision: 'confirm',
      missingFields: [],
      theoreticalExecutor: 'execute_confirmed_financial_action',
      requiresConfirmation: true,
    },
    overrides: { session: { userId: 'user-1', workspaceId: null, conversationId: 'conv-1' } },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('WORKSPACE_MISSING'));
  assert.ok(result.blockedReasons.includes('WORKSPACE_MISSING'));
});

test('validação 47: executor teórico permitido para consulta financeira', () => {
  const result = validateWith({
    plan: {
      planType: 'financial_query',
      decision: 'respond',
      missingFields: [],
      theoreticalExecutor: 'FinancialQueryEngine',
      requiresConfirmation: false,
    },
    messageType: 'query',
    primaryIntent: 'question',
  });
  assert.equal(result.valid, true);
});

test('validação 48: executor fora da allowlist é bloqueado', () => {
  const result = validateWith({
    plan: {
      planType: 'register_expense',
      decision: 'confirm',
      missingFields: [],
      theoreticalExecutor: 'algo_perigoso_inexistente',
      requiresConfirmation: true,
    },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('EXECUTOR_NOT_ALLOWED'));
  assert.ok(result.blockedReasons.includes('EXECUTOR_NOT_ALLOWED'));
});

test('validação: plano ausente é inválido com PLAN_MISSING', () => {
  const result = validateWith({ plan: null });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('PLAN_MISSING'));
});

test('validação: conflito de conta bloqueia execução e exige clarificação', () => {
  const result = validateWith({
    plan: {
      planType: 'register_expense',
      decision: 'ask',
      missingFields: [],
      theoreticalExecutor: 'execute_confirmed_financial_action',
      requiresConfirmation: false,
    },
    epistemic: epistemicWith({ account: { value: 'Itaú', status: 'conflicting', confidence: 0.5 } }),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('ACCOUNT_CONFLICT'));
  assert.equal(result.requiresClarification, true);
});

test('validação: valor inválido em ação financeira exige clarificação', () => {
  const result = validateWith({
    plan: {
      planType: 'register_expense',
      decision: 'confirm',
      missingFields: [],
      theoreticalExecutor: 'execute_confirmed_financial_action',
      requiresConfirmation: true,
    },
    epistemic: epistemicWith({ amount: { value: 0, status: 'missing', confidence: 0 } }),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('AMOUNT_INVALID'));
  assert.equal(result.requiresClarification, true);
});

test('validação: execução sem confirmação jamais passa', () => {
  const result = validateWith({
    plan: {
      planType: 'register_expense',
      decision: 'execute',
      missingFields: [],
      theoreticalExecutor: 'execute_confirmed_financial_action',
      requiresConfirmation: false,
    },
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.includes('EXECUTION_WITHOUT_CONFIRMATION'));
  assert.ok(result.blockedReasons.includes('EXECUTION_WITHOUT_CONFIRMATION'));
});
