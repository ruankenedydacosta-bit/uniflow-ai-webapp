import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createVoiceTtsRequestContext,
  recordVoiceTtsTelemetry,
  resetVoiceTtsRequestSequenceForTests,
} from './voiceTtsTelemetry.js';

test('telemetria DEV registra somente metadados seguros e requestId único', () => {
  resetVoiceTtsRequestSequenceForTests();
  const first = createVoiceTtsRequestContext({ messageId: 'msg-1', source: 'home_response' });
  const second = createVoiceTtsRequestContext({ messageId: 'msg-1', source: 'manual_replay' });
  const logs = [];
  const event = recordVoiceTtsTelemetry({
    ...first,
    provider: 'cache',
    status: 'success',
    deduplicated: false,
    fallbackUsed: false,
    text: 'dado que não pode aparecer',
    account: 'conta que não pode aparecer',
  }, {
    env: { DEV: true },
    logger: (...args) => logs.push(args),
  });
  assert.notEqual(first.requestId, second.requestId);
  assert.deepEqual(Object.keys(event), [
    'messageId', 'requestId', 'source', 'provider', 'status', 'deduplicated', 'fallbackUsed',
  ]);
  assert.equal(JSON.stringify(logs).includes('dado que não pode aparecer'), false);
  assert.equal(JSON.stringify(logs).includes('conta que não pode aparecer'), false);
});

test('telemetria fica silenciosa fora de DEV', () => {
  const logs = [];
  const result = recordVoiceTtsTelemetry({ provider: 'elevenlabs', status: 'success' }, {
    env: { PROD: true },
    logger: (...args) => logs.push(args),
  });
  assert.equal(result, null);
  assert.equal(logs.length, 0);
});
