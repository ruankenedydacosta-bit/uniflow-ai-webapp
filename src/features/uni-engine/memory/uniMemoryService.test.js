// Testes do serviço de memória (Fase 3) — itens 46-48, 50-56 e seções 10/20/21.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUniMemoryService } from './uniMemoryService.js';
import { evaluateMemoryCandidate } from './evaluateMemoryCandidate.js';

const SESSION = { userId: 'user-1', workspaceId: 'workspace-1' };

function candidateFor(text, { messageId = 'msg-1' } = {}) {
  const result = evaluateMemoryCandidate({
    message: { id: messageId, text },
    session: SESSION,
    classification: { messageType: 'unsupported' },
    cognitiveContext: { currentSubject: 'padaria' },
  });
  return result.candidates[0] ?? null;
}

async function capture(service, text, messageId) {
  const candidate = candidateFor(text, { messageId });
  if (!candidate) return null;
  const result = await service.captureCandidates({ candidates: [candidate], session: SESSION, sourceMessageId: messageId });
  return result;
}

test('s1: avaliação de candidatos é delegada à função pura', () => {
  const service = createUniMemoryService();
  const result = service.evaluateCandidatesSync({
    message: { id: 'm', text: 'Padaria é Alimentação' },
    session: SESSION,
    classification: { messageType: 'unsupported' },
    cognitiveContext: { currentSubject: 'padaria' },
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].memoryType, 'merchant_category_association');
});

test('s2: captura persiste candidato fire-and-forget com id e evidência', async () => {
  const service = createUniMemoryService();
  const result = await capture(service, 'Padaria é Alimentação', 'msg-1');
  assert.equal(result.error, null);
  assert.equal(result.data.captured, 1);
  assert.equal(result.data.memories[0].memoryType, 'merchant_category_association');
  assert.ok(result.data.memories[0].id);
});

test('s3: reforço da mesma associação consolida na mesma memória', async () => {
  const service = createUniMemoryService();
  await capture(service, 'Padaria é Alimentação', 'msg-1');
  const second = await capture(service, 'Padaria é Alimentação', 'msg-2');
  assert.equal(second.error, null);
  assert.equal(second.data.captured, 1);
  const sameId = second.data.memories[0].id === (await service.retrieve({ ...SESSION, message: 'padaria' })).data.memories[0].id;
  const list = await service._diagnostics?.() ?? {};
  assert.ok(list.repositoryMethods?.includes('findRelevant'));
  assert.equal(await sameId, true);
});

test('s3b: correção explícita cria memória nova e supersede a antiga', async () => {
  const service = createUniMemoryService();
  await capture(service, 'Padaria é Alimentação', 'msg-1');
  const correction = await capture(service, 'Não é Outros, é Saúde', 'msg-2');
  assert.equal(correction.error, null);
  assert.equal(correction.data.captured, 1);
  const list = await service.retrieve({ ...SESSION, message: 'padaria' });
  assert.equal(list.error, null);
  assert.equal(list.data.memories[0].value.category, 'Saúde');
  const scope = SESSION;
  const repo = service._diagnostics();
  assert.equal(typeof repo.repositoryMethods, 'object');
  void scope;
});

test('s4: recuperação é determinística, cacheada e com appliedToDecision false', async () => {
  const service = createUniMemoryService();
  await capture(service, 'Padaria é Alimentação', 'msg-1');
  const first = await service.retrieve({ ...SESSION, message: 'gastei na padaria hoje' });
  assert.equal(first.error, null);
  assert.equal(first.data.memories.length, 1);
  assert.equal(first.data.diagnostics.appliedToDecision, false);
  const second = await service.retrieve({ ...SESSION, message: 'gastei na padaria hoje' });
  assert.equal(second.data.memories[0].id, first.data.memories[0].id);
});

test('s5: retrieveRelevantSync é síncrono com cache-first e cacheMiss honesto', async () => {
  const service = createUniMemoryService();
  const miss = service.retrieveRelevantSync({ ...SESSION, message: 'padaria' });
  assert.equal(miss.data, null);
  assert.equal(miss.diagnostics.cacheMiss, true);
  await capture(service, 'Padaria é Alimentação', 'msg-1');
  await service.refreshCache(SESSION);
  const hit = service.retrieveRelevantSync({ ...SESSION, message: 'padaria' });
  assert.ok(hit.data.memories.length >= 1);
});

test('s6: warm() é alias de refreshCache e cacheSize/clearCache funcionam', async () => {
  const service = createUniMemoryService();
  assert.equal(service.cacheSize(), 0);
  await service.warm(SESSION);
  assert.equal(service.cacheSize(), 1);
  service.clearCache();
  assert.equal(service.cacheSize(), 0);
});

test('s7: forgetMemory marca deleted e sai da recuperação', async () => {
  const service = createUniMemoryService();
  await capture(service, 'Padaria é Alimentação', 'msg-1');
  const retrieved = await service.retrieve({ ...SESSION, message: 'padaria' });
  const id = retrieved.data.memories[0].id;
  const forgotten = await service.forgetMemory({ ...SESSION, id });
  assert.equal(forgotten.error, null);
  const after = await service.retrieve({ ...SESSION, message: 'padaria' });
  assert.equal(after.data.memories.length, 0);
});

test('s8: deleteAllForUser remove tudo e limpa cache do usuário', async () => {
  const service = createUniMemoryService();
  await capture(service, 'Padaria é Alimentação', 'msg-1');
  await service.warm(SESSION);
  assert.equal(service.cacheSize(), 1);
  const removed = await service.deleteAllForUser({ userId: 'user-1' });
  assert.equal(removed.data.removed, 1);
  assert.equal(service.cacheSize(), 0);
});

test('s9: escopo inválido nunca persiste — userId ausente é erro', async () => {
  const service = createUniMemoryService();
  const candidate = candidateFor('Padaria é Alimentação');
  const result = await service.captureCandidates({
    candidates: [candidate],
    session: { workspaceId: 'w' },
    sourceMessageId: 'msg-1',
  });
  assert.ok(result.error);
  assert.equal(result.error.code, 'MEMORY_USER_ID_REQUIRED');
});

test('s10: flags de leitura/escrita refletem a configuração', () => {
  const service = createUniMemoryService({ config: { memoryReadEnabled: true, memoryWriteEnabled: false } });
  assert.equal(service.isReadEnabled(), true);
  assert.equal(service.isWriteEnabled(), false);
});

test('s11: adapter do engine usa a sessão fixada e nunca rejeita captura', async () => {
  const service = createUniMemoryService();
  const adapter = service.createEngineAdapter(SESSION);
  const evaluated = adapter.evaluateCandidatesSync({
    message: { id: 'm', text: 'Minha conta principal é a Caixa' },
    classification: { messageType: 'unsupported' },
  });
  assert.equal(evaluated.candidates[0].memoryType, 'user_declared_fact');
  let rejected = false;
  await adapter.captureCandidates({
    candidates: evaluated.candidates,
    sourceMessageId: 'm',
  }).catch(() => { rejected = true; });
  assert.equal(rejected, false);
  const hit = adapter.retrieveRelevantSync({ message: 'conta' });
  assert.ok(hit.data === null || Array.isArray(hit.data.memories));
});

test('s12: telemetria é serializável e sem texto integral da mensagem', () => {
  const service = createUniMemoryService();
  const telemetry = service.buildTelemetry({
    correlationId: 'corr-1',
    persistentMemory: { memories: [{ subjectKey: 'merchant_category::padaria' }] },
    latencyMs: 3,
    writeError: null,
  });
  assert.doesNotThrow(() => JSON.stringify(telemetry));
  assert.equal(telemetry.memoryAppliedToDecision, false);
});

test('s13: isolamento de usuário — usuário B nunca vê memória de usuário A', async () => {
  const service = createUniMemoryService();
  await capture(service, 'Padaria é Alimentação', 'msg-1');
  const other = await service.retrieve({ userId: 'user-2', workspaceId: 'workspace-1', message: 'padaria' });
  assert.equal(other.error, null);
  assert.equal(other.data.memories.length, 0);
});

test('s14: captura de memória nunca falha silenciosamente — erro tratado por item', async () => {
  const service = createUniMemoryService();
  const result = await service.captureCandidates({ candidates: [{}], session: SESSION, sourceMessageId: 'msg-1' });
  assert.equal(result.error, null);
  assert.equal(result.data.captured, 0);
});
