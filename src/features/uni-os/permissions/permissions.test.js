import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluatePermissions } from './index.js';

test('permissions permanece não integrado sem requisitos', () => {
  assert.equal(evaluatePermissions().status, 'not_evaluated');
  assert.equal(evaluatePermissions().integrated, false);
});

test('permissions identifica somente grants ausentes fornecidos', () => {
  const result = evaluatePermissions({ requirements: ['read', 'write'], grants: ['read'] });
  assert.equal(result.status, 'denied');
  assert.deepEqual(result.missing, ['write']);
});
