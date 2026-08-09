import assert from 'node:assert/strict';
import test from 'node:test';
import { createVoiceTtsRequestOwnership } from './voiceTtsRequestOwnership.js';

test('uma nova solicitação invalida callbacks da solicitação de voz anterior', () => {
  const ownership = createVoiceTtsRequestOwnership();
  const first = ownership.begin();
  assert.equal(ownership.isCurrent(first), true);
  const second = ownership.begin();
  assert.equal(ownership.isCurrent(first), false);
  assert.equal(ownership.isCurrent(second), true);
});

test('stop/cancel invalida callbacks pendentes sem tornar requisições futuras inválidas', () => {
  const ownership = createVoiceTtsRequestOwnership();
  const pending = ownership.begin();
  ownership.invalidate();
  assert.equal(ownership.isCurrent(pending), false);
  const retry = ownership.begin();
  assert.equal(ownership.isCurrent(retry), true);
});
