import assert from 'node:assert/strict';
import test from 'node:test';
import { consumeMemoryProviders } from './index.js';

test('memory consome providers somente por leitura', async () => {
  let reads = 0;
  const provider = { providerName: 'existing', read: async () => { reads += 1; return ['preference']; } };
  const result = await consumeMemoryProviders([provider], { userId: 'u1' });
  assert.equal(reads, 1);
  assert.deepEqual(result.entries[0].data, ['preference']);
  assert.equal(result.createdMemory, false);
  assert.equal(result.inferredMemory, false);
});

test('memory sem provider retorna contexto vazio seguro', async () => {
  assert.deepEqual(await consumeMemoryProviders(), {
    mode: 'read_only', entries: [], createdMemory: false, inferredMemory: false,
  });
});
