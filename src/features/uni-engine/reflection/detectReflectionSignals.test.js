// Testes de detecção de sinais de reflexão (Fase 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectReflectionSignals } from './detectReflectionSignals.js';

test('sinais: intent mismatch via comparação', () => {
  const signals = detectReflectionSignals({
    comparison: { status: 'intent_divergence' },
  });
  assert.ok(signals.some((s) => s.type === 'INTENT_MISMATCH'));
});

test('sinais: entity/action-query mismatch', () => {
  const signals = detectReflectionSignals({
    comparison: { status: 'action_query_divergence' },
  });
  assert.ok(signals.some((s) => s.type === 'INTENT_MISMATCH'));
});

test('sinais: conta incorreta via correção de conta', () => {
  const signals = detectReflectionSignals({
    userCorrection: { isCorrection: true, correctionPair: null },
    comparison: { status: 'agreement' },
  });
  assert.ok(signals.some((s) => s.type === 'USER_CORRECTION'));
});

test('sinais: categoria incorreta via par de correção', () => {
  const signals = detectReflectionSignals({
    userCorrection: { isCorrection: true, correctionPair: { from: 'alimentação', to: 'saúde' } },
  });
  assert.ok(signals.some((s) => s.type === 'CATEGORY_MISMATCH'));
});

test('sinais: divergência de valor e data via divergências de pipeline', () => {
  const signals = detectReflectionSignals({
    divergenceDiagnostics: [{ type: 'missing_field_divergence', severity: 'medium' }],
  });
  assert.ok(signals.some((s) => s.type === 'MISSING_INFORMATION'));
});

test('sinais: contexto perdido via divergência de contexto', () => {
  const signals = detectReflectionSignals({
    divergenceDiagnostics: [{ type: 'context_switch_new_pending', severity: 'medium' }],
  });
  assert.ok(signals.some((s) => s.type === 'CONTEXT_LOST'));
});

test('sinais: memória conflitante', () => {
  const signals = detectReflectionSignals({
    persistentMemory: { conflicts: [{ subjectKey: 'x', outcome: 'supersede' }] },
  });
  assert.ok(signals.some((s) => s.type === 'MEMORY_CONFLICT'));
});

test('sinais: conflito epistêmico', () => {
  const signals = detectReflectionSignals({
    epistemicModel: { conflicts: [{ type: 'x' }] },
  });
  assert.ok(signals.some((s) => s.type === 'EPISTEMIC_CONFLICT'));
});

test('sinais: informação stale', () => {
  const signals = detectReflectionSignals({
    epistemicModel: { staleItems: [{ item: 'x' }] },
  });
  assert.ok(signals.some((s) => s.type === 'STALE_INFORMATION'));
});

test('sinais: decisão divergente por risco alto', () => {
  const signals = detectReflectionSignals({
    decisionLayer: { risk: 'CRITICAL', decisionType: 'EXECUTE' },
  });
  assert.ok(signals.some((s) => s.type === 'DECISION_MISMATCH'));
});

test('sinais: plano divergente', () => {
  const signals = detectReflectionSignals({
    planning: { status: 'BLOCKED', risk: 'HIGH' },
  });
  assert.ok(signals.some((s) => s.type === 'PLANNING_MISMATCH'));
});

test('sinais: objetivo divergente', () => {
  const signals = detectReflectionSignals({
    goals: { conflicts: [{ type: 'x' }], status: 'BLOCKED' },
  });
  assert.ok(signals.some((s) => s.type === 'GOAL_MISMATCH'));
});

test('sinais: pergunta desnecessária (pipeline pediu campo conhecido)', () => {
  const signals = detectReflectionSignals({
    divergenceDiagnostics: [{ type: 'pipeline_asked_known_field', severity: 'low' }],
  });
  assert.ok(signals.some((s) => s.type === 'UNNECESSARY_QUESTION'));
});

test('sinais: pergunta ausente (decisão responde com dependências)', () => {
  const signals = detectReflectionSignals({
    decisionLayer: { decisionType: 'RESPOND', dependencies: ['account'], risk: 'NONE' },
  });
  assert.ok(signals.some((s) => s.type === 'MISSING_QUESTION'));
});

test('sinais: repetição do usuário', () => {
  const signals = detectReflectionSignals({
    repetitionCount: 2,
    comparison: { status: 'agreement' },
  });
  assert.ok(signals.some((s) => s.type === 'USER_REPETITION'));
});

test('sinais: repetição abaixo do threshold não gera sinal', () => {
  const signals = detectReflectionSignals({ repetitionCount: 1 });
  assert.equal(signals.some((s) => s.type === 'USER_REPETITION'), false);
});

test('sinais: baixa confiança da classificação', () => {
  const signals = detectReflectionSignals({ classification: { confidence: 0.4 } });
  assert.ok(signals.some((s) => s.type === 'LOW_CONFIDENCE'));
});

test('sinais: falha de provider', () => {
  const signals = detectReflectionSignals({ providerFailed: true });
  assert.ok(signals.some((s) => s.type === 'PROVIDER_FAILURE'));
});

test('sinais: falha de voz', () => {
  const signals = detectReflectionSignals({ voiceFailed: true });
  assert.ok(signals.some((s) => s.type === 'VOICE_FAILURE'));
});

test('sinais: sucesso confirmado gera padrão de sucesso', () => {
  const signals = detectReflectionSignals({ outcome: 'SUCCESS_CONFIRMED' });
  assert.ok(signals.some((s) => s.type === 'SUCCESSFUL_PATTERN'));
});

test('sinais: sucesso sem evidência não gera padrão', () => {
  const signals = detectReflectionSignals({ outcome: 'UNKNOWN' });
  assert.equal(signals.some((s) => s.type === 'SUCCESSFUL_PATTERN'), false);
});

test('sinais: saída respeita o limite máximo', () => {
  const signals = detectReflectionSignals({
    comparison: { status: 'intent_divergence' },
    divergenceDiagnostics: Array.from({ length: 50 }, (_, i) => ({
      type: i % 2 === 0 ? 'missing_field_divergence' : 'intent_divergence',
      severity: 'medium',
    })),
    epistemicModel: { conflicts: Array.from({ length: 10 }, () => ({})), staleItems: [{}, {}] },
    persistentMemory: { conflicts: [{}, {}] },
    decisionLayer: { risk: 'CRITICAL', decisionType: 'EXECUTE', dependencies: ['a'] },
    planning: { status: 'BLOCKED', risk: 'CRITICAL', missingDependencies: ['a'] },
    goals: { conflicts: [{}], status: 'BLOCKED' },
    userCorrection: { isCorrection: true, correctionPair: { from: 'x', to: 'y' } },
    repetitionCount: 5,
    providerFailed: true,
    voiceFailed: true,
    outcome: 'SUCCESS_CONFIRMED',
  });
  assert.ok(signals.length <= 24);
  assert.ok(signals.length > 0);
});

test('sinais: entrada vazia não lança e mantém limites', () => {
  const signals = detectReflectionSignals();
  assert.ok(Array.isArray(signals));
  assert.ok(signals.length <= 24);
});

test('sinais: sem divergências e sem sinais específicos fica vazio', () => {
  const signals = detectReflectionSignals({
    comparison: { status: 'agreement' },
    classification: { confidence: 0.95 },
    persistentMemory: {
      enabled: true,
      retrieved: [{ id: 'm1' }],
      conflicts: [],
      candidates: [],
    },
  });
  assert.deepEqual(signals, []);
});
