// Testes contratuais do Uni Engine (Fase 1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  UNI_ENGINE_COMPARISON_STATUSES,
  UNI_ENGINE_EPISTEMIC_STATUSES,
  UNI_ENGINE_MESSAGE_TYPES,
  UNI_ENGINE_PLAN_DECISIONS,
  UNI_ENGINE_VERSION,
  createCorrelationId,
  findFunctionsInValue,
  isSerializableValue,
  projectFinancialSnapshot,
  validateUniEngineInput,
} from './uniEngineContracts.js';
import { buildBaseInput } from './testFixtures.js';
import { runUniEngineShadow } from './runUniEngineShadow.js';
import { TEST_CONFIG_ENABLED } from './testFixtures.js';

test('contrato 1: entrada válida passa na validação', () => {
  const result = validateUniEngineInput(buildBaseInput());
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test('contrato 2: entrada incompleta é rejeitada sem lançar erro', () => {
  const invalid = [
    null,
    {},
    { message: { text: '' } },
    { message: {} },
    { message: { text: '   ' } },
    { message: { text: 'oi' }, session: null },
  ];
  for (const input of invalid) {
    const result = validateUniEngineInput(input);
    assert.equal(result.valid, false, `entrada ${JSON.stringify(input)} deve ser inválida`);
    assert.ok(result.errors.length > 0);
  }
});

test('contrato 3: saída do motor é 100% serializável (JSON-safe)', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: TEST_CONFIG_ENABLED });
  assert.ok(isSerializableValue(result), 'saída deve ser serializável');
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('contrato 3b: saída com pendência ativa também é serializável', () => {
  const input = buildBaseInput({
    message: { text: 'sim' },
    pendingAction: {
      status: 'ready',
      intent: 'register_expense',
      amount: 50,
      account: { id: 'acc-nubank', name: 'Nubank' },
    },
    currentPipeline: { detectedIntent: 'question', pendingIntent: 'register_expense', pendingActive: true },
  });
  const result = runUniEngineShadow(input, { config: TEST_CONFIG_ENABLED });
  assert.ok(isSerializableValue(result));
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('contrato 4: enums válidos — todos os valores existem e são congelados', () => {
  assert.ok(UNI_ENGINE_MESSAGE_TYPES.includes('action'));
  assert.ok(UNI_ENGINE_MESSAGE_TYPES.includes('query'));
  assert.ok(UNI_ENGINE_MESSAGE_TYPES.includes('continuation'));
  assert.ok(UNI_ENGINE_MESSAGE_TYPES.includes('confirmation'));
  assert.ok(UNI_ENGINE_MESSAGE_TYPES.includes('correction'));
  assert.ok(UNI_ENGINE_MESSAGE_TYPES.includes('cancellation'));
  assert.ok(UNI_ENGINE_MESSAGE_TYPES.includes('clarification'));
  assert.ok(UNI_ENGINE_MESSAGE_TYPES.includes('small_talk'));
  assert.ok(UNI_ENGINE_MESSAGE_TYPES.includes('unsupported'));
  assert.ok(UNI_ENGINE_PLAN_DECISIONS.includes('respond'));
  assert.ok(UNI_ENGINE_PLAN_DECISIONS.includes('ask'));
  assert.ok(UNI_ENGINE_PLAN_DECISIONS.includes('confirm'));
  assert.ok(UNI_ENGINE_PLAN_DECISIONS.includes('execute'));
  assert.ok(UNI_ENGINE_PLAN_DECISIONS.includes('cancel'));
  assert.ok(UNI_ENGINE_PLAN_DECISIONS.includes('defer'));
  assert.ok(UNI_ENGINE_PLAN_DECISIONS.includes('reject'));
  assert.ok(UNI_ENGINE_EPISTEMIC_STATUSES.includes('confirmed_database'));
  assert.ok(UNI_ENGINE_EPISTEMIC_STATUSES.includes('confirmed_user'));
  assert.ok(UNI_ENGINE_EPISTEMIC_STATUSES.includes('inferred_high'));
  assert.ok(UNI_ENGINE_EPISTEMIC_STATUSES.includes('inferred_low'));
  assert.ok(UNI_ENGINE_EPISTEMIC_STATUSES.includes('ambiguous'));
  assert.ok(UNI_ENGINE_EPISTEMIC_STATUSES.includes('missing'));
  assert.ok(UNI_ENGINE_EPISTEMIC_STATUSES.includes('stale'));
  assert.ok(UNI_ENGINE_EPISTEMIC_STATUSES.includes('conflicting'));
  assert.ok(UNI_ENGINE_COMPARISON_STATUSES.includes('agreement'));
  assert.ok(UNI_ENGINE_COMPARISON_STATUSES.includes('intent_divergence'));
  assert.ok(UNI_ENGINE_COMPARISON_STATUSES.includes('pending_context_divergence'));
  assert.ok(UNI_ENGINE_COMPARISON_STATUSES.includes('missing_field_divergence'));
  assert.ok(UNI_ENGINE_COMPARISON_STATUSES.includes('action_query_divergence'));
  assert.ok(UNI_ENGINE_COMPARISON_STATUSES.includes('confidence_gap'));
  assert.ok(UNI_ENGINE_COMPARISON_STATUSES.includes('pipeline_unknown'));
  assert.ok(UNI_ENGINE_COMPARISON_STATUSES.includes('engine_unknown'));
  assert.equal(UNI_ENGINE_VERSION, '2.0');
});

test('contrato 5: nenhuma função na saída do motor', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: TEST_CONFIG_ENABLED });
  const functions = findFunctionsInValue(result);
  assert.deepEqual(functions, [], `funções encontradas na saída: ${JSON.stringify(functions)}`);
});

test('contrato 5b: saída descartada não é usada pelo pipeline (nenhum campo de saída referencia executor)', () => {
  const result = runUniEngineShadow(buildBaseInput(), { config: TEST_CONFIG_ENABLED });
  assert.ok(!('executor' in result));
  assert.ok(!('message' in result));
  assert.ok(!('response' in result));
  assert.ok(!('audio' in result));
});

test('contrato: correlationId é único e está presente em qualquer resultado', () => {
  const first = runUniEngineShadow(buildBaseInput(), { config: TEST_CONFIG_ENABLED });
  const second = runUniEngineShadow(buildBaseInput(), { config: TEST_CONFIG_ENABLED });
  assert.ok(first.correlationId);
  assert.ok(second.correlationId);
  assert.notEqual(first.correlationId, second.correlationId);
});

test('contrato: projectFinancialSnapshot aplaina o snapshot com Maps em dados planos', () => {
  const withMaps = {
    hasData: true,
    totalBalance: 100,
    accountsById: new Map([['a1', { id: 'a1', name: 'Nubank' }]]),
    accounts: [{ id: 'a1', name: 'Nubank', current_balance: 100 }],
    categories: [],
    recentTransactions: [],
  };
  const projection = projectFinancialSnapshot(withMaps);
  assert.equal(projection.hasData, true);
  assert.equal(projection.totalBalance, 100);
  assert.equal(projection.accounts[0].name, 'Nubank');
  assert.ok(isSerializableValue(projection));
  assert.doesNotThrow(() => JSON.stringify(projection));
});

test('contrato: projectFinancialSnapshot trata snapshot ausente com segurança', () => {
  const projection = projectFinancialSnapshot(null);
  assert.equal(projection.hasData, false);
  assert.deepEqual(projection.accounts, []);
});

test('contrato: createCorrelationId produz identificador estável e rastreável', () => {
  const id = createCorrelationId('ue');
  assert.match(id, /^ue_/);
  assert.equal(id.length > 4, true);
});
