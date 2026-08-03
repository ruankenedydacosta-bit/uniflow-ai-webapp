import assert from 'node:assert/strict';
import test from 'node:test';
import { requestCognitiveProcessing } from './index.js';

test('cognitive gateway retorna NOT_IMPLEMENTED sem chamada externa', async () => {
  assert.deepEqual(await requestCognitiveProcessing({ prompt: 'ignored' }), {
    status: 'NOT_IMPLEMENTED', data: null, provider: null, externalCallMade: false,
  });
});
