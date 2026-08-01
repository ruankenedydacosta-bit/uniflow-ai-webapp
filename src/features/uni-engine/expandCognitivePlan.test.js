// Testes da expansão do plano cognitivo (Fase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandCognitivePlan } from './expandCognitivePlan.js';

function basePlan(overrides = {}) {
  return {
    decision: 'ask',
    planType: 'register_expense',
    collectedData: { amount: 50 },
    missingFields: ['account'],
    requiresConfirmation: false,
    nextQuestion: { field: 'account_id', text: 'Em qual conta?' },
    theoreticalExecutor: 'execute_confirmed_financial_action',
    risks: [],
    blockers: [],
    ...overrides,
  };
}

test('plano 100: expande sem perder nenhum campo da Fase 1', () => {
  const plan = basePlan();
  const expanded = expandCognitivePlan(plan, {});
  assert.equal(expanded.decision, 'ask');
  assert.equal(expanded.planType, 'register_expense');
  assert.deepEqual(expanded.missingFields, ['account']);
  assert.equal(expanded.theoreticalExecutor, 'execute_confirmed_financial_action');
  assert.equal(expanded.executorExpected, 'execute_confirmed_financial_action');
});

test('plano 101: availableData reflete o estado epistêmico e referência resolvida', () => {
  const expanded = expandCognitivePlan(basePlan(), {
    epistemic: {
      amount: { value: 50, status: 'confirmed_user', source: 'user_message' },
      account: { value: 'Nubank', status: 'confirmed_database', source: 'financial_snapshot' },
      category: { value: null, status: 'missing', source: null },
    },
    referenceResolution: {
      resolved: true,
      referenceType: 'account',
      resolution: { type: 'account', value: 'Nubank', source: 'operational_memory', confidence: 0.9 },
    },
  });
  const fields = expanded.availableData.map((entry) => entry.field);
  assert.ok(fields.includes('amount'));
  assert.ok(fields.includes('account'));
  const implicit = expanded.availableData.find((entry) => entry.viaImplicitReference);
  assert.ok(implicit, 'referência implícita deve aparecer em availableData');
  assert.equal(implicit.source, 'operational_memory');
});

test('plano 102: missingData detalha razão de cada campo ausente', () => {
  const expanded = expandCognitivePlan(basePlan(), {
    epistemic: {
      account: { value: null, status: 'missing', confidence: 0, source: null },
    },
  });
  assert.deepEqual(expanded.missingData, [
    { field: 'account', required: true, reason: 'missing' },
  ]);
});

test('plano 103: risco alto para bloqueio de segurança', () => {
  const expanded = expandCognitivePlan(basePlan({
    decision: 'reject',
    blockers: ['SAFETY_BLOCKED'],
  }), {
    classification: { safetyBlocked: true },
  });
  assert.equal(expanded.risk.level, 'high');
  assert.ok(expanded.risk.reasons.includes('safety_blocked_action'));
});

test('plano 104: risco médio para ambiguidade e campos ausentes', () => {
  const ambiguous = expandCognitivePlan(basePlan(), {
    classification: { ambiguity: true, ambiguities: ['balance_or_income'] },
  });
  assert.equal(ambiguous.risk.level, 'medium');
  assert.ok(ambiguous.risk.reasons.some((reason) => reason.startsWith('ambiguity:')));

  const missing = expandCognitivePlan(basePlan(), {});
  assert.equal(missing.risk.level, 'medium');
  assert.ok(missing.risk.reasons.includes('missing:account'));
});

test('plano 105: risco médio para referência implícita não resolvida', () => {
  const expanded = expandCognitivePlan(basePlan({ decision: 'confirm', missingFields: [] }), {
    referenceResolution: { hasReference: true, resolved: false },
  });
  assert.equal(expanded.risk.level, 'medium');
  assert.ok(expanded.risk.reasons.includes('unresolved_implicit_reference'));
});

test('plano 106: ambiguities compõem classificador e estado epistêmico', () => {
  const expanded = expandCognitivePlan(basePlan(), {
    classification: { ambiguities: ['balance_or_income'] },
    epistemic: { account: { value: null, status: 'ambiguous', confidence: 0.4 } },
  });
  const types = expanded.ambiguities.map((entry) => entry.type);
  assert.ok(types.includes('balance_or_income'));
  assert.ok(types.includes('account'));
  const intentEntry = expanded.ambiguities.find((entry) => entry.type === 'balance_or_income');
  assert.equal(intentEntry.detail, 'intent_ambiguity:balance_or_income');
});

test('plano 107: alternatives refletem as alternativas do classificador', () => {
  const expanded = expandCognitivePlan(basePlan(), {
    classification: {
      alternatives: [{ intent: 'register_income', confidence: 0.08 }],
    },
  });
  assert.equal(expanded.alternatives.length, 1);
  assert.equal(expanded.alternatives[0].intent, 'register_income');
  assert.equal(expanded.alternatives[0].decision, 'ask');
});

test('plano: plano nulo retorna null sem quebrar', () => {
  assert.equal(expandCognitivePlan(null, {}), null);
});
