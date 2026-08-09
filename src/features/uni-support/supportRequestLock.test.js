import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireSupportRequestLock, releaseSupportRequestLock } from './supportRequestLock.js';

test('duas submissões no mesmo tick adquirem um único lock lógico', () => {
  const lock = { current: false };
  assert.equal(acquireSupportRequestLock(lock), true);
  assert.equal(acquireSupportRequestLock(lock), false);
});

test('erro/cancelamento libera o lock para uma nova submissão', () => {
  const lock = { current: false };
  assert.equal(acquireSupportRequestLock(lock), true);
  releaseSupportRequestLock(lock);
  assert.equal(acquireSupportRequestLock(lock), true);
});
