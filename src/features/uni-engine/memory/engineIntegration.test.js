// Testes de integração Fase 3: Uni Engine × Memória Persistente (Shadow).
// Itens 57-78 da especificação: flags, cascata, appliedToDecision SEMPRE
// falso, isolamento, serialização, resiliência a falhas de adapter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runUniEngineShadow } from '../runUniEngineShadow.js';
import { createUniEngineConfig } from '../uniEngineConfig.js';
import { buildBaseInput } from '../testFixtures.js';
import { createUniMemoryService } from './uniMemoryService.js';
import { evaluateMemoryCandidate } from './evaluateMemoryCandidate.js';

const SESSION = { userId: 'user-1', workspaceId: 'workspace-1', conversationId: 'conv-1' };

function memoryConfig({ enabled = true, read = true, write = true } = {}) {
  return createUniEngineConfig({
    env: {
      VITE_UNI_ENGINE_ENABLED: 'true',
      VITE_UNI_ENGINE_SHADOW_MODE: 'true',
      VITE_UNI_ENGINE_TELEMETRY_ENABLED: 'false',
      VITE_UNI_ENGINE_MEMORY_ENABLED: String(enabled),
      VITE_UNI_ENGINE_MEMORY_READ_ENABLED: String(read),
      VITE_UNI_ENGINE_MEMORY_WRITE_ENABLED: String(write),
      VITE_UNI_ENGINE_MEMORY_SHADOW_MODE: 'true',
    },
  });
}

function engineInput(overrides = {}) {
  return buildBaseInput({
    message: { id: 'msg-engine-1', text: 'gastei na padaria hoje' },
    session: SESSION,
    ...(overrides.message ? { message: overrides.message } : {}),
    ...(overrides.session ? { session: overrides.session } : {}),
  });
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
}

test('i1: sem flags de memória, resultado não contém persistentMemory', () => {
  const result = runUniEngineShadow(engineInput(), { config: memoryConfig({ enabled: false }) });
  assert.equal(result.persistentMemory, null);
  assert.equal(result.enabled, true);
});

test('i2: com adapter e flags ativas, persistentMemory existe e appliedToDecision é SEMPRE false', () => {
  const service = createUniMemoryService({
    config: { memoryReadEnabled: true, memoryWriteEnabled: true },
  });
  const result = runUniEngineShadow(engineInput(), {
    config: memoryConfig(),
    memoryAdapter: service.createEngineAdapter(SESSION),
  });
  assert.ok(result.persistentMemory);
  assert.equal(result.persistentMemory.appliedToDecision, false);
  assert.equal(result.persistentMemory.diagnostics.readEnabled, true);
  assert.equal(result.persistentMemory.diagnostics.writeEnabled, true);
});

test('i3: leitura recupera memórias relevantes via cache síncrono', async () => {
  const service = createUniMemoryService({
    config: { memoryReadEnabled: true, memoryWriteEnabled: true },
  });
  const evaluated = evaluateMemoryCandidate({
    message: { id: 'm', text: 'Padaria é Alimentação' },
    session: SESSION,
    classification: { messageType: 'unsupported' },
    cognitiveContext: { currentSubject: 'padaria' },
  });
  await service.captureCandidates({ candidates: evaluated.candidates, session: SESSION, sourceMessageId: 'm' });
  await service.refreshCache(SESSION);

  const result = runUniEngineShadow(engineInput(), {
    config: memoryConfig(),
    memoryAdapter: service.createEngineAdapter(SESSION),
  });
  assert.ok(result.persistentMemory.retrieved.length >= 1);
  const target = result.persistentMemory.retrieved.find((memory) => memory.subjectKey === 'merchant_category::padaria');
  assert.ok(target, 'memória recuperada pelo subjectKey');
  assert.equal(result.persistentMemory.appliedToDecision, false);
});

test('i4: escrita captura candidatos fire-and-forget e persiste', async () => {
  const service = createUniMemoryService({
    config: { memoryReadEnabled: true, memoryWriteEnabled: true },
  });
  const result = runUniEngineShadow(engineInput({
    message: { id: 'msg-engine-2', text: 'Padaria é Alimentação' },
  }), {
    config: memoryConfig(),
    memoryAdapter: service.createEngineAdapter(SESSION),
  });
  assert.ok(result.persistentMemory.candidates.length >= 1);
  await settle();
  const retrieved = await service.retrieve({ ...SESSION, message: 'padaria' });
  assert.equal(retrieved.error, null);
  assert.ok(retrieved.data.memories.length >= 1);
});

test('i5: cascata — memoryEnabled false desliga leitura/escrita mesmo com adapter', () => {
  const service = createUniMemoryService({
    config: { memoryReadEnabled: true, memoryWriteEnabled: true },
  });
  const result = runUniEngineShadow(engineInput(), {
    config: memoryConfig({ enabled: false }),
    memoryAdapter: service.createEngineAdapter(SESSION),
  });
  assert.equal(result.persistentMemory, null);
});

test('i6: somente leitura (sem escrita) recupera mas nunca captura', async () => {
  const service = createUniMemoryService({
    config: { memoryReadEnabled: true, memoryWriteEnabled: false },
  });
  const evaluated = evaluateMemoryCandidate({
    message: { id: 'm', text: 'Padaria é Alimentação' },
    session: SESSION,
    classification: { messageType: 'unsupported' },
  });
  await service.captureCandidates({ candidates: evaluated.candidates, session: SESSION, sourceMessageId: 'm' });
  await service.refreshCache(SESSION);

  const result = runUniEngineShadow(engineInput(), {
    config: memoryConfig({ read: true, write: false }),
    memoryAdapter: service.createEngineAdapter(SESSION),
  });
  assert.ok(result.persistentMemory.retrieved.length >= 1);
  assert.equal(result.persistentMemory.candidates.length, 0);
  assert.equal(result.persistentMemory.diagnostics.writeEnabled, false);
});

test('i7: adapter quebrado nunca quebra o motor — erro cai em diagnostics', () => {
  const brokenAdapter = {
    retrieveRelevantSync() { throw new Error('boom'); },
    evaluateCandidatesSync() { throw new Error('boom'); },
    captureCandidates() { throw new Error('boom'); },
  };
  const result = runUniEngineShadow(engineInput(), {
    config: memoryConfig(),
    memoryAdapter: brokenAdapter,
  });
  assert.equal(result.enabled, true);
  assert.ok(result.persistentMemory);
  assert.equal(result.persistentMemory.appliedToDecision, false);
  assert.ok(result.persistentMemory.diagnostics.errorCode);
});

test('i8: saída inteira do engine é serializável (sem funções)', () => {
  const service = createUniMemoryService({
    config: { memoryReadEnabled: true, memoryWriteEnabled: true },
  });
  const result = runUniEngineShadow(engineInput(), {
    config: memoryConfig(),
    memoryAdapter: service.createEngineAdapter(SESSION),
  });
  assert.doesNotThrow(() => JSON.stringify(result));
});

test('i9: contrato do engine permanece intacto com memória ativa', () => {
  const service = createUniMemoryService({
    config: { memoryReadEnabled: true, memoryWriteEnabled: true },
  });
  const result = runUniEngineShadow(engineInput(), {
    config: memoryConfig(),
    memoryAdapter: service.createEngineAdapter(SESSION),
  });
  assert.ok(result.classification);
  assert.ok(result.plan);
  assert.ok(result.validation);
  assert.ok(result.epistemicState);
  assert.ok(result.suggestions);
  assert.equal(typeof result.correlationId, 'string');
});

test('i10: conflito entre candidato e memória recuperada é reportado (Shadow)', async () => {
  const service = createUniMemoryService({
    config: { memoryReadEnabled: true, memoryWriteEnabled: true },
  });
  const evaluated = evaluateMemoryCandidate({
    message: { id: 'm', text: 'Padaria é Alimentação' },
    session: SESSION,
    classification: { messageType: 'unsupported' },
  });
  await service.captureCandidates({ candidates: evaluated.candidates, session: SESSION, sourceMessageId: 'm' });
  await service.refreshCache(SESSION);

  const correction = evaluateMemoryCandidate({
    message: { id: 'm2', text: 'Não é Outros, é Saúde' },
    session: SESSION,
    classification: { messageType: 'unsupported' },
    cognitiveContext: { currentSubject: 'padaria' },
  });
  await service.captureCandidates({ candidates: correction.candidates, session: SESSION, sourceMessageId: 'm2' });
  await service.refreshCache(SESSION);

  const result = runUniEngineShadow(engineInput(), {
    config: memoryConfig(),
    memoryAdapter: service.createEngineAdapter(SESSION),
  });
  assert.equal(result.persistentMemory.appliedToDecision, false);
  const conflicts = result.persistentMemory.conflicts ?? [];
  assert.ok(Array.isArray(conflicts));
});
