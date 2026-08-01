// Testes do diagnóstico de divergências (Fase 2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDivergenceDiagnostics } from './buildDivergenceDiagnostics.js';
import { createOperationalMemory } from './operationalMemory.js';
import { buildBaseInput, buildExpenseActionPending } from './testFixtures.js';
import { UNI_ENGINE_DIVERGENCE_TYPES } from './uniEngineContracts.js';

function baseOptions(overrides = {}) {
  return {
    comparison: { status: 'agreement', engineIntent: 'register_expense', pipelineIntent: 'register_expense' },
    classification: { messageType: 'action', primaryIntent: 'register_expense', confidence: 0.95 },
    plan: { decision: 'confirm', missingFields: [] },
    referenceResolution: null,
    cognitiveContext: { subjectChanged: false },
    analyzed: { pending: { exists: false }, history: {}, compatibility: {} },
    input: buildBaseInput(),
    ...overrides,
  };
}

test('diagnóstico 120: pipeline pediu conta e engine resolveu implicitamente', () => {
  const diagnostics = buildDivergenceDiagnostics(baseOptions({
    input: buildBaseInput({ pendingAction: buildExpenseActionPending() }),
    analyzed: {
      pending: { exists: true, intent: 'register_expense', awaitedField: 'account' },
      history: {},
      compatibility: {},
    },
    referenceResolution: {
      resolved: true,
      referenceType: 'account',
      confidence: 0.9,
      resolution: { type: 'account', value: 'Nubank', source: 'operational_memory', confidence: 0.9 },
    },
  }));
  const entry = diagnostics.find((item) => item.type === 'pipeline_asked_known_field');
  assert.ok(entry, 'deve registrar o diagnóstico');
  assert.equal(entry.pipelineObservation, 'Pipeline pediu conta.');
  assert.match(entry.engineDetection, /já estava implícita/);
  assert.equal(entry.description, 'Pipeline pediu conta. Engine detectou que conta já estava implícita (operational_memory).');
  assert.equal(entry.impact, 'none');
});

test('diagnóstico 121: mudança de assunto com nova pendência', () => {
  const diagnostics = buildDivergenceDiagnostics(baseOptions({
    cognitiveContext: { subjectChanged: true, currentSubject: 'register_expense:Mercado' },
    memory: createOperationalMemory({ lastSubject: 'register_income:Salário' }),
  }));
  const entry = diagnostics.find((item) => item.type === 'context_switch_new_pending');
  assert.ok(entry, 'deve registrar o diagnóstico');
  assert.equal(entry.pipelineObservation, 'Pipeline iniciou nova pendência.');
  assert.equal(entry.engineDetection, 'Engine detectou mudança de assunto.');
  assert.equal(entry.evidence.fromSubject, 'register_income:Salário');
  assert.equal(entry.severity, 'medium');
});

test('diagnóstico 122: pipeline respondeu consulta, engine viu ação', () => {
  const diagnostics = buildDivergenceDiagnostics(baseOptions({
    comparison: {
      status: 'action_query_divergence',
      engineIntent: 'register_expense',
      pipelineIntent: 'check_balance',
    },
    classification: { messageType: 'action', primaryIntent: 'register_expense', confidence: 0.9 },
  }));
  const entry = diagnostics.find((item) => item.type === 'action_query_divergence');
  assert.ok(entry, 'deve registrar o diagnóstico');
  assert.equal(entry.description, 'Pipeline respondeu consulta. Engine detectou intenção de ação.');
  assert.equal(entry.severity, 'high');
});

test('diagnóstico 123: divergência de intenção entre ações', () => {
  const diagnostics = buildDivergenceDiagnostics(baseOptions({
    comparison: {
      status: 'intent_divergence',
      engineIntent: 'register_income',
      pipelineIntent: 'register_expense',
    },
    classification: { messageType: 'action', primaryIntent: 'register_income', confidence: 0.9 },
  }));
  const entry = diagnostics.find((item) => item.type === 'intent_divergence');
  assert.ok(entry);
  assert.equal(entry.severity, 'high');
  assert.match(entry.description, /Pipeline tratou como register_expense/);
});

test('diagnóstico 124: campo ausente no engine enquanto pipeline pronto', () => {
  const diagnostics = buildDivergenceDiagnostics(baseOptions({
    comparison: { status: 'missing_field_divergence', engineIntent: 'register_expense', pipelineIntent: 'register_expense' },
    plan: { decision: 'ask', missingFields: ['account'] },
  }));
  const entry = diagnostics.find((item) => item.type === 'missing_field_divergence');
  assert.ok(entry);
  assert.equal(entry.impact, 'none');
  assert.deepEqual(entry.evidence.missingFields, ['account']);
});

test('diagnóstico 125: confirmação sem pendência ativa é registrada', () => {
  const diagnostics = buildDivergenceDiagnostics(baseOptions({
    classification: { messageType: 'confirmation', primaryIntent: 'confirm_pending', confidence: 0.92 },
  }));
  const entry = diagnostics.find((item) => item.type === 'confirmation_without_pending');
  assert.ok(entry);
  assert.equal(entry.severity, 'low');
});

test('diagnóstico 126: correção sem pendência é registrada', () => {
  const diagnostics = buildDivergenceDiagnostics(baseOptions({
    classification: { messageType: 'correction', primaryIntent: 'register_expense', confidence: 0.8 },
  }));
  const entry = diagnostics.find((item) => item.type === 'correction_without_pending');
  assert.ok(entry);
});

test('diagnóstico 127: concordância pura não gera entradas', () => {
  const diagnostics = buildDivergenceDiagnostics(baseOptions());
  assert.deepEqual(diagnostics, []);
});

test('diagnóstico: todos os tipos estão no contrato', () => {
  const diagnostics = buildDivergenceDiagnostics(baseOptions({
    input: buildBaseInput({ pendingAction: buildExpenseActionPending() }),
    analyzed: { pending: { exists: true, awaitedField: 'account' }, history: {}, compatibility: {} },
    referenceResolution: { resolved: true, referenceType: 'account', confidence: 0.9, resolution: { source: 'operational_memory' } },
    comparison: { status: 'pending_context_divergence', engineIntent: 'register_income', pipelineIntent: 'register_expense' },
  }));
  diagnostics.forEach((entry) => {
    assert.ok(UNI_ENGINE_DIVERGENCE_TYPES.includes(entry.type), `tipo desconhecido: ${entry.type}`);
    assert.ok(['low', 'medium', 'high'].includes(entry.severity));
    assert.equal(entry.impact, 'none');
    assert.doesNotThrow(() => JSON.stringify(entry));
  });
});
