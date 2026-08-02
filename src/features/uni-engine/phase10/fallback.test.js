// Testes da Fase 10 — Caminhos de fallback seguro do motor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { UNI_ENGINE_VERSION, UNI_ENGINE_REVISION } from '../uniEngineContracts.js';
import { phase10CoreConfig, phase10FullConfig, phase10Input } from './shared.js';

test('entrada nula → caminho seguro com fallback sinalizado', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(null, { config });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.fallbackReason, 'INPUT_NOT_OBJECT');
  assert.equal(result.diagnostics.errorCode, 'INPUT_NOT_OBJECT');
  assert.equal(result.enabled, true);
  assert.equal(result.skipped, false);
  assert.equal(result.classification, null);
  assert.equal(result.decisionLayer, null);
  assert.equal(result.planning, null);
  assert.equal(result.epistemicModel, null);
});

test('entradas primitivas → INPUT_NOT_OBJECT', () => {
  const config = phase10CoreConfig();
  for (const input of ['hello', 42, true, [1, 2]]) {
    const result = runUniEngineShadow(input, { config });
    assert.equal(result.fallbackUsed, true, String(input));
    assert.equal(result.diagnostics.errorCode, 'INPUT_NOT_OBJECT', String(input));
  }
});

test('objeto vazio → MESSAGE_REQUIRED', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow({}, { config });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.diagnostics.errorCode, 'MESSAGE_REQUIRED');
});

test('mensagem sem texto → MESSAGE_TEXT_REQUIRED', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(phase10Input({ message: { text: '   ' } }), { config });
  assert.equal(result.diagnostics.errorCode, 'MESSAGE_TEXT_REQUIRED');
});

test('id de mensagem inválido → MESSAGE_ID_INVALID', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(phase10Input({ message: { id: {} } }), { config });
  assert.equal(result.diagnostics.errorCode, 'MESSAGE_ID_INVALID');
});

test('fonte de mensagem inválida → MESSAGE_SOURCE_INVALID', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(phase10Input({ message: { source: 'telepathy' } }), { config });
  assert.equal(result.diagnostics.errorCode, 'MESSAGE_SOURCE_INVALID');
});

test('fallback preserva correlationId fornecido', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(null, { config, correlationId: 'ue_fb_1' });
  assert.equal(result.correlationId, 'ue_fb_1');
});

test('fallback mantém versão, revisão e diagnóstico', () => {
  const config = phase10CoreConfig();
  const result = runUniEngineShadow(null, { config });
  assert.equal(result.engineVersion, UNI_ENGINE_VERSION);
  assert.equal(result.revision, UNI_ENGINE_REVISION);
  assert.equal(result.diagnostics.fallbackUsed, true);
  assert.equal(result.diagnostics.latencyMs > 0, true);
  assert.equal(result.diagnostics.divergenceCount, 0);
});

test('motor desligado NÃO usa fallback — usa skip oficial', () => {
  const config = phase10CoreConfig({ VITE_UNI_ENGINE_ENABLED: 'false' });
  const result = runUniEngineShadow(null, { config });
  assert.equal(result.enabled, false);
  assert.equal(result.skipped, true);
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.diagnostics.errorCode, 'ENGINE_DISABLED');
});

test('erro interno do motor → ENGINE_INTERNAL_ERROR seguro', () => {
  const config = phase10CoreConfig();
  const evilInput = new Proxy(phase10Input(), {
    get(target, key) {
      if (key === 'context') throw new Error('boom');
      return target[key];
    },
  });
  const result = runUniEngineShadow(evilInput, { config });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.diagnostics.errorCode, 'ENGINE_INTERNAL_ERROR');
  assert.equal(result.enabled, true);
});

test('fallback nunca executa nem altera nada no pipeline', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(null, { config });
  assert.equal(result.activation, null);
  assert.equal(result.reflection, null);
  assert.equal(result.persistentMemory, null);
  assert.equal(result.operationalMemory, null);
  assert.deepEqual(result.divergenceDiagnostics, []);
});

test('caminho feliz NÃO sinaliza fallback', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(phase10Input(), { config });
  assert.equal(result.fallbackUsed, false);
  assert.equal(result.diagnostics.fallbackUsed, false);
  assert.equal(result.diagnostics.errorCode, null);
});

test('fallback é determinístico (exceto latência e ids)', () => {
  const config = phase10CoreConfig();
  const first = runUniEngineShadow(null, { config, correlationId: 'ue_fb_x' });
  const second = runUniEngineShadow(null, { config, correlationId: 'ue_fb_x' });
  first.diagnostics.latencyMs = null;
  second.diagnostics.latencyMs = null;
  assert.deepEqual(first, second);
});

test('input inválido do motor completo mantém health coerente', () => {
  const config = phase10FullConfig({ VITE_UNI_ENGINE_MEMORY_ENABLED: 'false' });
  const result = runUniEngineShadow(null, { config });
  assert.equal(result.fallbackUsed, true);
  assert.equal(result.diagnostics.fallbackUsed, true);
  assert.equal(typeof result.diagnostics.errorCode, 'string');
  assert.equal(result.diagnostics.rulesUsed.length, 0);
  assert.equal(result.diagnostics.ambiguities.length, 0);
});
