import assert from 'node:assert/strict';
import test from 'node:test';
import { createReadOnlyContext } from './index.js';

test('context agrupa snapshots sem alterar a entrada', () => {
  const input = { user: { id: 'u1', preferences: { tone: 'calm' } }, workspace: { id: 'w1' }, shortHistory: ['a'] };
  const result = createReadOnlyContext(input);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.user.preferences), true);
  assert.deepEqual(result.shortHistory, ['a']);
  assert.notEqual(result.user, input.user);
  assert.deepEqual(input, {
    user: { id: 'u1', preferences: { tone: 'calm' } },
    workspace: { id: 'w1' },
    shortHistory: ['a'],
  });
});
