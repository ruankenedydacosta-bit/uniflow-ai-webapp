// Testes das sugestões estruturadas para o pipeline (Fase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEngineSuggestions } from './buildEngineSuggestions.js';

function planFor(overrides = {}) {
  return {
    decision: 'ask',
    missingFields: ['account'],
    nextQuestion: { field: 'account_id', text: 'Em qual conta?' },
    theoreticalExecutor: 'execute_confirmed_financial_action',
    executorExpected: 'execute_confirmed_financial_action',
    risk: { level: 'medium', reasons: [] },
    alternatives: [],
    ...overrides,
  };
}

test('sugestões 110: shape contratual completo da sugestão', () => {
  const suggestion = buildEngineSuggestions({
    classification: { messageType: 'action', primaryIntent: 'register_expense', confidence: 0.9 },
    plan: planFor(),
  });
  assert.equal(suggestion.recommendedIntent, 'register_expense');
  assert.equal(suggestion.recommendedExecutor, 'execute_confirmed_financial_action');
  assert.equal(suggestion.recommendedQuestion, 'Em qual conta?');
  assert.deepEqual(suggestion.missingFields, ['account']);
  assert.equal(suggestion.confidence, 0.9);
  assert.equal(suggestion.risk, 'medium');
  assert.match(suggestion.reason, /Faltam dados \(account\)/);
  assert.ok(Array.isArray(suggestion.alternatives));
});

test('sugestões 111: consulta recomenda responder via FinancialQueryEngine', () => {
  const suggestion = buildEngineSuggestions({
    classification: { messageType: 'query', primaryIntent: 'check_balance', confidence: 0.85 },
    plan: planFor({
      decision: 'respond',
      missingFields: [],
      nextQuestion: null,
      risk: { level: 'low', reasons: [] },
      executorExpected: 'FinancialQueryEngine',
      theoreticalExecutor: 'FinancialQueryEngine',
    }),
  });
  assert.equal(suggestion.recommendedExecutor, 'FinancialQueryEngine');
  assert.equal(suggestion.recommendedQuestion, null);
  assert.match(suggestion.reason, /FinancialQueryEngine/);
  assert.equal(suggestion.risk, 'low');
});

test('sugestões 112: ação completa recomenda confirmação antes da execução', () => {
  const suggestion = buildEngineSuggestions({
    classification: { messageType: 'action', primaryIntent: 'register_expense', confidence: 0.95 },
    plan: planFor({ decision: 'confirm', missingFields: [], risk: { level: 'low', reasons: [] } }),
  });
  assert.match(suggestion.reason, /confirmar com o usuário/);
});

test('sugestões 113: referência resolvida aparece no contexto implícito', () => {
  const suggestion = buildEngineSuggestions({
    classification: { messageType: 'action', primaryIntent: 'register_expense', confidence: 0.9 },
    plan: planFor(),
    referenceResolution: {
      hasReference: true,
      resolved: true,
      referenceType: 'account',
      resolution: { type: 'account', value: 'Nubank', description: 'Nubank', source: 'operational_memory', confidence: 0.9 },
    },
  });
  assert.deepEqual(suggestion.implicitContext, {
    resolved: true,
    type: 'account',
    value: 'Nubank',
    source: 'operational_memory',
  });
});

test('sugestões 114: referência não resolvida é registrada sem inventar', () => {
  const suggestion = buildEngineSuggestions({
    classification: { messageType: 'action', primaryIntent: 'register_expense', confidence: 0.9 },
    plan: planFor(),
    referenceResolution: { hasReference: true, resolved: false },
  });
  assert.deepEqual(suggestion.implicitContext, {
    resolved: false,
    type: 'none',
    value: null,
    source: 'unresolved',
  });
});

test('sugestões: bloqueio de segurança recomenda não executar', () => {
  const suggestion = buildEngineSuggestions({
    classification: { messageType: 'unsupported', primaryIntent: 'safety_blocked', confidence: 0.99 },
    plan: planFor({ decision: 'reject', missingFields: [], risk: { level: 'high', reasons: [] } }),
  });
  assert.match(suggestion.reason, /bloqueada por segurança/);
  assert.equal(suggestion.risk, 'high');
});

test('sugestões: saída sempre serializável', () => {
  const suggestion = buildEngineSuggestions({});
  assert.doesNotThrow(() => JSON.stringify(suggestion));
});
