// Testes dos contratos da Camada de Decisão (Fase 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DECISION_LAYER_VERSION,
  createDecisionDependencies,
  validateDecisionDependencies,
  createDecisionShadow,
  createDecisionResult,
  validateDecisionResult,
  createEmptyDecisionResult,
  createDecisionContext,
} from './decisionContracts.js';
import { isSerializableValue, findFunctionsInValue } from '../uniEngineContracts.js';

function validSeed() {
  return {
    decisionType: 'ASK',
    confidence: 0.6,
    risk: 'MEDIUM',
    reason: ['Decisão = ASK'],
    recommendedExecutor: 'execute_confirmed_financial_action',
    recommendedQuestion: 'ask:account',
    requiredInformation: ['account'],
    dependencies: { requiresUser: true },
    diagnostics: ['PENDING_ACTION_ACTIVE'],
    recommendations: ['ASK_ACCOUNT'],
    shadow: { shadowMode: true },
    latency: { totalMs: 1.2 },
  };
}

test('contrato 1: DecisionResult é 100% serializável (sem funções, sem Date)', () => {
  const result = createDecisionResult(validSeed());
  assert.equal(isSerializableValue(result), true);
  assert.deepEqual(findFunctionsInValue(result), []);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('contrato 2: enums fechados no contrato — valores inválidos são normalizados', () => {
  const result = createDecisionResult({ ...validSeed(), decisionType: 'EXECUTE' });
  assert.equal(result.decisionType, 'UNKNOWN');
  const diagnostics = createDecisionResult({ ...validSeed(), diagnostics: ['texto livre'] });
  assert.deepEqual(diagnostics.diagnostics, []);
});

test('contrato 3: campos obrigatórios existem e têm tipo correto', () => {
  const result = createDecisionResult(validSeed());
  for (const field of ['decisionType', 'confidence', 'risk', 'reason', 'recommendedExecutor', 'recommendedQuestion', 'requiredInformation', 'dependencies', 'diagnostics', 'recommendations', 'shadow', 'latency']) {
    assert.ok(Object.hasOwn(result, field), `campo obrigatório ausente: ${field}`);
  }
  assert.equal(typeof result.confidence, 'number');
  assert.ok(Array.isArray(result.reason));
  assert.ok(Array.isArray(result.requiredInformation));
  assert.ok(Array.isArray(result.diagnostics));
  assert.ok(Array.isArray(result.recommendations));
});

test('contrato 4: decisão válida passa na validação completa', () => {
  const result = createDecisionResult(validSeed());
  const validation = validateDecisionResult(result);
  assert.equal(validation.valid, true, JSON.stringify(validation.errors));
});

test('contrato 5: confidence fora de [0,1] é rejeitada', () => {
  const invalid = createDecisionResult({ ...validSeed(), confidence: 1.5 });
  assert.equal(validateDecisionResult(invalid).valid, false);
  const negative = createDecisionResult({ ...validSeed(), confidence: -0.1 });
  assert.equal(validateDecisionResult(negative).valid, false);
});

test('contrato 6: risk fora do enum é rejeitado', () => {
  const invalid = { ...createDecisionResult(validSeed()), risk: 'FATAL' };
  assert.equal(validateDecisionResult(invalid).valid, false);
});

test('contrato 7: diagnostics inválidos são rejeitados pela validação', () => {
  const invalid = { ...createDecisionResult(validSeed()), diagnostics: ['qualquer texto'] };
  assert.equal(validateDecisionResult(invalid).valid, false);
});

test('contrato 8: recommendations inválidas são rejeitadas pela validação', () => {
  const invalid = { ...createDecisionResult(validSeed()), recommendations: ['fazer tudo'] };
  assert.equal(validateDecisionResult(invalid).valid, false);
});

test('contrato 9: dependencies são validadas (booleanas)', () => {
  assert.equal(validateDecisionDependencies(createDecisionDependencies()).valid, true);
  const invalid = { ...createDecisionDependencies(), requiresUser: 'sim' };
  assert.equal(validateDecisionDependencies(invalid).valid, false);
});

test('contrato 10: latency obrigatória no formato { totalMs: number }', () => {
  const ok = createDecisionResult({ ...validSeed(), latency: { totalMs: 3 } });
  assert.equal(validateDecisionResult(ok).valid, true);
  const missing = createDecisionResult({ ...validSeed(), latency: {} });
  assert.equal(validateDecisionResult(missing).valid, false);
});

test('contrato 11: shadow.appliedToDecision é SEMPRE false e bloqueado se true', () => {
  const result = createDecisionResult(validSeed());
  assert.equal(result.shadow.appliedToDecision, false);
  const tampered = {
    ...createDecisionResult(validSeed()),
    shadow: { ...createDecisionShadow(), appliedToDecision: true },
  };
  assert.equal(validateDecisionResult(tampered).valid, false);
});

test('contrato 12: shadow bloqueia executor chamado', () => {
  const tampered = {
    ...createDecisionResult(validSeed()),
    shadow: { ...createDecisionShadow(), executorCalled: true },
  };
  assert.equal(validateDecisionResult(tampered).valid, false);
});

test('contrato 12b: createEmptyDecisionResult é válido e seguro', () => {
  const empty = createEmptyDecisionResult({ shadowMode: true });
  assert.equal(empty.decisionType, 'UNKNOWN');
  assert.equal(empty.shadow.appliedToDecision, false);
  assert.equal(validateDecisionResult(empty).valid, true);
});

test('contrato 12c: createDecisionContext normaliza entradas', () => {
  const context = createDecisionContext({
    sufficiency: 'PARTIAL',
    missingFields: ['account'],
    dependencies: { requiresUser: true },
    pending: { status: 'ready' },
  });
  assert.equal(context.sufficiency, 'PARTIAL');
  assert.deepEqual(context.missingFields, ['account']);
  assert.equal(context.dependencies.requiresUser, true);
  assert.equal(context.pending.status, 'ready');
  assert.equal(context.needUser, false);
});

test('contrato 12d: versão da camada é estável', () => {
  assert.equal(DECISION_LAYER_VERSION, '1.0');
});
